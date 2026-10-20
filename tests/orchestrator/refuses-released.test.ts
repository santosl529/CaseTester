import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
// The small-model check's verdict on an item-less ask (classifyAsk, served through this file's detection mock as "Could I get <ask>?" — a test adapter, fixtures/ask-check.ts; production sends the ask to the check's own prompt), set per test; else none.
const { checkFound } = vi.hoisted(() => ({ checkFound: { value: [] as unknown[] } }));
vi.mock('@/lib/orchestrator/data-requests', async orig => { const { askVia } = await import('./fixtures/ask-check'); const detect = async (p: { candidateText: string }) => (p.candidateText.startsWith('Could I get ') ? checkFound.value : []); return { ...(await orig<object>()), classifyDataRequests: detect, classifyAsk: askVia(detect) }; });

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
  // Final review (20 Oct), Task 39 deferred minor: "no issue/problem/objection/…" is no refusal, even when the
  // sentence names a held case item (the ramp assumption, new_route_rampup).
  it.each([
    'I have no issue with your ramp assumption.',
    'I have no problem with the ramp assumption you used.',
    'I have no objection to your ramp-up assumption.',
    'We have no concerns about the ramp assumption.',
    'I have no doubts about your ramp assumption.',
    'I have no questions on the ramp assumption.',
  ])('does not read "%s" as a refusal', sentence => {
    expect(vetoReason(sentence, gate())).toBeNull();
    expect(vetoReason(sentence, gate(['new_route_rampup']))).toBeNull();
  });
  it('still reads "I have no ramp assumption" as a refusal', () => {
    expect(vetoReason('I have no ramp assumption for you.', gate())).toBe('false_refusal');
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
    // The message names the ramp (round 5 Task 51: a release of an item the message never names is checked).
    const { got, said } = await streamed('Here is my recommendation, on the ramp as it stands.', RAMP);
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

// Final review M1 (20 Oct), the reviewer's probe: no Guard B cue, a refusal-shaped sentence
// followed by an ordinary one. The ordinary sentence waits behind the held one (order kept)
// until every declaration has closed, so the gate judges the refusal against the ramp release
// — Stream withholds it and goes on, rather than switching to the buffer as a false refusal.
describe('Stream: the sentences after a held refusal wait behind it (final review M1)', () => {
  const traced = async (say: string, requests: ModelTurn['requests']) => {
    const plan = planTurn(
      readsFixture({ phase: 'BRAINSTORM', caseId: 'prof-002' }), 'Here is my recommendation, on the ramp as it stands.',
      { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} },
    );
    if (plan.kind !== 'model') throw new Error('model plan expected');
    plan.state.distress = Promise.resolve(null);
    const turn: ModelTurn = { move: 'recommendation', say, requests, exhibit: null, rescueItem: null, question: 'What is your recommendation to the CEO?' };
    const log: string[] = [];
    async function* events() { for await (const e of eventsFromTurn(Promise.resolve(turn))) { log.push(e.type === 'field' ? `field:${e.key}` : e.type); yield e; } }
    const got: Segment[] = [];
    const out = await streamTurnSegments(events(), plan, async seg => { got.push(seg); log.push(`${seg.kind}:${seg.text}`); }, { isDelivered: { value: false } });
    return { got, out, log, said: got.filter(x => x.kind === 'say').map(x => x.text) };
  };
  const SAY = `Understood. ${TYLER} First, the fleet is fixed.`;
  it('the refusal is withheld, the next sentence is said after it was judged, the ramp line goes out, no buffer switch', async () => {
    const { got, out, log, said } = await traced(SAY, RAMP);
    expect(said).toEqual(['Understood.', 'First, the fleet is fixed.']);
    expect(out.kind === 'done' && out.bufferSwitch).toBeFalsy();
    expect(got.some(x => x.kind === 'data' && x.revealIds.includes('new_route_rampup'))).toBe(true);
    // "First, …" waited for every declaration (requests, exhibit, rescue_item), then went out before the data line.
    expect(log.indexOf('say:First, the fleet is fixed.')).toBeGreaterThan(log.indexOf('field:rescue_item'));
    expect(log.indexOf('say:First, the fleet is fixed.')).toBeLessThan(log.findIndex(x => x.startsWith('data:')));
  });
  it('a turn with no held sentence: first content before the requests close, as before', async () => {
    const { log, said } = await traced('Understood. First, the fleet is fixed.', RAMP);
    expect(said).toEqual(['Understood.', 'First, the fleet is fixed.']);
    expect(log.indexOf('say:Understood.')).toBeLessThan(log.indexOf('field:requests'));
    expect(log.indexOf('say:First, the fleet is fixed.')).toBeLessThan(log.indexOf('field:requests'));
  });
});

// Round 5 Task 45, fix round 1 (controller): Stream judges the held refusal against
// the checked decisions — the item-less ask the small-model check maps to the ramp
// item releases it this turn, so the refusal is withheld, not a false refusal.
describe('Stream: an item the check releases this turn', () => {
  // Worded so that no code step maps it (the refusal-coverage step would map "a
  // ramp-up assumption" itself): only the check finds the ramp item.
  const WHAT = 'how quickly bookings build on a newly opened route';
  const ITEMLESS = [{ what: WHAT, itemIds: [], explicit: true, respond: 'release' as const }];
  it('the model\'s refusal of it is withheld (refuses_released) and the ramp line goes out', async () => {
    checkFound.value = [{ what: WHAT, ledgerItemIds: ['new_route_rampup'], response: 'none', explicit: true }];
    try {
      const { got, out, said } = await streamed('Do we have a ramp assumption?', ITEMLESS);
      expect(said).not.toContain('no ramp assumption');
      expect(said).toContain('Understood.');
      expect(got.some(s => s.kind === 'data' && s.revealIds.includes('new_route_rampup'))).toBe(true);
      expect(out.kind === 'done' && out.bufferSwitch).toBeFalsy();
    } finally { checkFound.value = []; }
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
