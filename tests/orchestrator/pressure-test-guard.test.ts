// Guard A (7 Oct, batch 17 — Luna's Nikhil run looped the pressure test for
// 14 turns while the deferred cost breakdown never came): once a pressure
// test has been asked and the candidate has replied, the prompt says so, a
// declared deferral becomes a release (a refusal when the case lacks it), and
// a repeated pressure test is logged.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnData } from '@/lib/orchestrator/turn-data';
import { promptContextFor } from '@/lib/orchestrator/prompt-context';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { readsFixture } from './fixtures/turn-reads';

// The fixture's interviewer turns are 0 and 2; a move on turn 2 is the last question asked.
function plan(phase: Phase, moves: Record<number, string> = {}): ModelPlan {
  const p = planTurn(readsFixture({ phase, flags: { moves } }), 'Could I get the cost breakdown for both years?',
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
}
const COSTS = { what: 'the cost breakdown', itemIds: ['cogs_pct', 'labor_pct', 'overhead_pct'], explicit: true, respond: 'defer' as const };
const NOT_IN_CASE = { what: 'NPS trend', itemIds: [], explicit: true, respond: 'defer' as const };

describe('pressure test done', () => {
  it('is known once an earlier turn declared a pressure test', () => {
    expect(plan('STRUCTURE').state.pressureTestDone).toBe(false);
    expect(plan('STRUCTURE', { 2: 'pressure_test' }).state.pressureTestDone).toBe(true);
  });

  it('tells the model while the case is still in the early stages, and only then', () => {
    expect(promptContextFor(plan('STRUCTURE', { 2: 'pressure_test' })).turnNote).toMatch(/pressure test.*asked and answered/i);
    expect(promptContextFor(plan('STRUCTURE')).turnNote ?? '').not.toMatch(/pressure test/i);
    expect(promptContextFor(plan('ANALYSIS', { 2: 'pressure_test' })).turnNote ?? '').not.toMatch(/pressure test/i);
  });

  it('turns a declared deferral into a release once the pressure test is done', () => {
    const before = turnData(plan('STRUCTURE'), { requests: [COSTS], exhibit: null, rescueItem: null });
    expect(before.releases.map(r => r.id)).toEqual([]);
    const after = turnData(plan('STRUCTURE', { 2: 'pressure_test' }), { requests: [COSTS], exhibit: null, rescueItem: null });
    expect(after.releases.map(r => r.id).sort()).toEqual(['cogs_pct', 'labor_pct', 'overhead_pct']);
  });

  it('refuses rather than defers data the case does not have, once the pressure test is done', () => {
    const after = turnData(plan('STRUCTURE', { 2: 'pressure_test' }), { requests: [NOT_IN_CASE], exhibit: null, rescueItem: null });
    expect(after.refusals).toEqual(['NPS trend']);
    expect(after.defers).toEqual([]);
  });

  it('logs a repeated pressure test', async () => {
    const p = plan('STRUCTURE', { 2: 'pressure_test' });
    const turn: ModelTurn = { move: 'pressure_test', requests: [], exhibit: null, rescueItem: null, say: '', question: 'Is that MECE?' };
    const usage = { model: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
    const out: ModelOutcome = { turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] };
    await settleTurn(p, out);
    const logged = p.ctx.checks.entries.find(e => e.check === 'pressure_test_repeat');
    expect(logged?.decision).toBe('act');
  });
});
