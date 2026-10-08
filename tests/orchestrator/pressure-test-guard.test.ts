// turnData under the pressure-test state (spec 2026-10-07-pressure-test-and-
// request-guards) — unit level, including the existing exceptions the runner
// tests don't reach (stall rescue item, forced releases on rec-ask turns).
// Replaces Guard A's move-label unlock (batch 17): a pressure_test move alone
// no longer unlocks anything.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnData } from '@/lib/orchestrator/turn-data';
import { promptContextFor } from '@/lib/orchestrator/prompt-context';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { readsFixture } from './fixtures/turn-reads';

const PT = (state: 'not_asked' | 'awaiting' | 'satisfied') => ({ pressureTest: { state, askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0 } });
function plan(phase: Phase, flags: Record<string, unknown> = {}): ModelPlan {
  const p = planTurn(readsFixture({ phase, flags }), 'Could I get the cost breakdown for both years?',
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
}
const COSTS = (respond: 'release' | 'defer') => ({ what: 'the cost breakdown', itemIds: ['cogs_pct', 'labor_pct', 'overhead_pct'], explicit: true, respond });
const T = (requests: ReturnType<typeof COSTS>[] = [], rescueItem: string | null = null) => ({ requests, exhibit: null, rescueItem });

describe('turnData and the pressure test', () => {
  it('a pressure_test move label alone unlocks nothing', () => {
    const d = turnData(plan('STRUCTURE', { moves: { 2: 'pressure_test' } }), T([COSTS('release')]));
    expect(d.releases).toEqual([]);
    expect(d.gatedIds.sort()).toEqual(['cogs_pct', 'labor_pct', 'overhead_pct']);
  });

  it('once satisfied, a declared deferral is released', () => {
    const d = turnData(plan('STRUCTURE', PT('satisfied')), T([COSTS('defer')]));
    expect(d.releases.map(r => r.id).sort()).toEqual(['cogs_pct', 'labor_pct', 'overhead_pct']);
  });

  it('keeps the stall rescue item exception before the pressure test', () => {
    const p = plan('STRUCTURE');
    p.state.stallDecision = { ...p.state.stallDecision, intervene: true, rung: 3 } as typeof p.state.stallDecision;
    expect(turnData(p, T([], 'cogs_pct')).releases.map(r => r.id)).toEqual(['cogs_pct']);
  });

  it('keeps the forced-release exception on a recommendation-ask turn', () => {
    const p = plan('STRUCTURE');
    p.state.kind = 'rec_ask';
    p.state.openDataRequests = [{ ledgerItemId: 'cogs_pct', what: 'COGS', label: 'COGS', turnIndex: 1 } as never];
    expect(turnData(p, T()).releases.map(r => r.id)).toEqual(['cogs_pct']);
  });

  it('tells the model what state the test is in, in the early stages only', () => {
    expect(promptContextFor(plan('STRUCTURE', PT('awaiting'))).turnNote).toMatch(/waiting for an answer/);
    expect(promptContextFor(plan('STRUCTURE', PT('satisfied'))).turnNote).toMatch(/asked and answered/);
    expect(promptContextFor(plan('ANALYSIS', PT('satisfied'))).turnNote ?? '').not.toMatch(/pressure test/i);
  });
});
