import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { settleTurn } from '@/lib/orchestrator/settle-turn';
import { vetoReason, streamTurnSegments, type GateContext } from '@/lib/orchestrator/stream-turn';
import { getCaseById } from '@/lib/cases/loader';
import { factBaseFor } from '@/lib/orchestrator/fact-check';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { readsFixture } from './fixtures/turn-reads';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { Segment } from '@/lib/orchestrator/turn-types';

// Engine-asks round 5, Task 39. Batch 34 Larkspur, Tyler (64) t21: the model said
// "Understood. I have no ramp assumption to give you yet." and code's
// new_route_rampup line followed (.turns.jsonl.gz, turn 21).
const TYLER = 'I have no ramp assumption to give you yet.';
const fb = factBaseFor(getCaseById('prof-002') as never);
const gate = (releasedNow?: string[]): GateContext => ({
  allowedTexts: [], verified: [], alreadyProbed: new Set(), flaggedThisTurn: false, openItems: [], phase: 'BRAINSTORM',
  facts: { fb, revealed: new Set(), echoes: [], ...(releasedNow ? { releasedNow: new Set(releasedNow) } : {}) },
});

describe('vetoReason refuses_released', () => {
  it('withholds a refusal of an item code releases this turn (Tyler t21 verbatim)', () => {
    expect(vetoReason(TYLER, gate(['new_route_rampup']))).toBe('refuses_released');
  });
  it('withholds the plain wording too, and a restated or exhibit-covered item the same way', () => {
    expect(vetoReason("I don't have the ramp assumption.", gate(['new_route_rampup']))).toBe('refuses_released');
  });
  it('with no release this turn the existing false-refusal path applies', () => {
    expect(vetoReason(TYLER, gate())).toBe('false_refusal');
    expect(vetoReason(TYLER, gate([]))).toBe('false_refusal');
  });
  it('keeps a refusal of a different item than the one released', () => {
    expect(vetoReason("I don't have the fuel hedging contracts.", gate(['new_route_rampup']), { inQuestion: true })).toBeNull();
    // the ramp refusal is not attributed to another item's release
    expect(vetoReason(TYLER, gate(['aircraft_leases']))).toBe('false_refusal');
  });
  it('does not read "I have no concerns" as a refusal', () => {
    expect(vetoReason('I have no concerns with that.', gate(['new_route_rampup']))).toBeNull();
  });
});

const streamed = async (candidateText: string, requests: ModelTurn['requests']) => {
  const plan = planTurn(
    readsFixture({ phase: 'BRAINSTORM', caseId: 'prof-002' }), candidateText,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} },
  );
  if (plan.kind !== 'model') throw new Error('model plan expected');
  plan.state.distress = Promise.resolve(null);
  const turn: ModelTurn = {
    move: 'recommendation', say: `Understood. ${TYLER}`, requests, exhibit: null, rescueItem: null,
    question: 'Taking everything you\'ve worked through, what is your recommendation to the CEO?',
  };
  const got: Segment[] = [];
  const out = await streamTurnSegments(eventsFromTurn(Promise.resolve(turn)), plan, async s => { got.push(s); }, { isDelivered: { value: false } });
  return { got, out, said: got.filter(s => s.kind === 'say').map(s => s.text).join(' ') };
};
const RAMP = [{ what: 'a ramp-up assumption for the new routes', itemIds: ['new_route_rampup'], explicit: true, respond: 'release' as const }];

describe('Stream: the refusal waits for the requests, then is withheld', () => {
  it('Tyler t21, an explicit ask (held for the requests): the refusal is not spoken and the ramp line is', async () => {
    const { got, said } = await streamed('Do we have a ramp assumption?', RAMP);
    expect(said).not.toContain('no ramp assumption');
    expect(said).toContain('Understood.');
    expect(got.some(s => s.kind === 'data' && s.revealIds.includes('new_route_rampup'))).toBe(true);
  });
  it('the same with no ask cue: the refusal is still held for the requests, then withheld', async () => {
    const { got, said } = await streamed('Here is my recommendation.', RAMP);
    expect(said).not.toContain('no ramp assumption');
    expect(got.some(s => s.kind === 'data' && s.revealIds.includes('new_route_rampup'))).toBe(true);
  });
  it('no release this turn: the refusal is not spoken either (the false-refusal path stops delivery)', async () => {
    const { got, out, said } = await streamed('Here is my recommendation.', []);
    expect(said).not.toContain('no ramp assumption');
    expect(got.some(s => s.kind === 'data')).toBe(false);
    expect(out.kind === 'done' && out.bufferSwitch).toBe('false_refusal');
  });
});

describe('Settle: the composed turn drops the refusal and says the ramp line', () => {
  const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  const settle = async (requests: ModelTurn['requests']) => {
    const plan = planTurn(
      readsFixture({ phase: 'BRAINSTORM', caseId: 'prof-002' }), 'Do we have a ramp assumption?',
      { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} },
    );
    if (plan.kind !== 'model') throw new Error('model plan expected');
    plan.state.distress = Promise.resolve(null);
    const turn: ModelTurn = { move: 'recommendation', say: `Understood. ${TYLER}`, requests, exhibit: null, rescueItem: null, question: 'What is your recommendation to the CEO?' };
    return settleTurn(plan, { turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [] });
  };
  it('Tyler t21 verbatim: refusal withheld, ramp line said', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await settle(RAMP);
    expect(warn.mock.calls.map(c => String(c[1])).join(' ')).toContain('"reason":"refuses_released"');
    warn.mockRestore();
    expect(s.spokenText).not.toContain('no ramp assumption');
    expect(s.spokenText).toContain('6–12 months');
    expect(s.newReveals).toContain('new_route_rampup');
  });
  it('the same sentence with no release is withheld by the false-refusal path, not refuses_released', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await settle([]);
    expect(warn.mock.calls.map(c => String(c[1])).join(' ')).toContain('"reason":"false_refusal"');
    warn.mockRestore();
    expect(s.spokenText).not.toContain('no ramp assumption');
    expect(s.spokenText).not.toContain('6–12 months');
  });
});
