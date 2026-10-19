// Lorenzo, 13 Oct (Larkspur review, item 7): a case where 2+ runs close owing
// a required stage gets a 25-minute clock (the earlier ruling). Larkspur was
// flagged (6 of 8 runs owed the risk stage), so prof-002 runs 25 minutes, its
// phase budgets scaled with it; the other cases stay at 20.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));

import { caseTotalMs, TOTAL_CASE_MS } from '@/lib/orchestrator/state-machine';
import { getCaseById } from '@/lib/cases/loader';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { promptContextFor } from '@/lib/orchestrator/prompt-context';
import { readsFixture } from './fixtures/turn-reads';

describe('the case clock', () => {
  it('the four new cases run 25 minutes; prof-001 20', () => {
    for (const id of ['prof-002', 'entry-001', 'pricing-001', 'launch-001']) expect(caseTotalMs(getCaseById(id))).toBe(25 * 60_000);
    expect(caseTotalMs(getCaseById('prof-001'))).toBe(TOTAL_CASE_MS);
  });
  it("the new cases' phase budgets add up to their clock, with at least 3 minutes for recommendation + risk + close", () => {
    for (const id of ['prof-002', 'entry-001', 'pricing-001', 'launch-001']) {
      const b = getCaseById(id).pacing!.phaseBudgetsMs!;
      expect(Object.values(b).reduce((a, x) => a + (x ?? 0), 0)).toBe(25 * 60_000);
      expect((b.RECOMMENDATION ?? 0) + (b.WRAP ?? 0)).toBeGreaterThanOrEqual(3 * 60_000);
    }
  });
  it('at 21 minutes prof-001 is out of time; prof-002 is not, and the model is told 25', () => {
    const at21 = (caseId: string) => planTurn(readsFixture({ caseId, phase: 'ANALYSIS', elapsedMs: 21 * 60_000 }), 'I think the routes are the story.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    const kind = (p: ReturnType<typeof planTurn>) => (p.ctx.checks.entries.find(c => c.check === 'turn_kind')?.detail as { timeUp: boolean }).timeUp;
    expect(kind(at21('prof-001'))).toBe(true);
    const p2 = at21('prof-002');
    expect(kind(p2)).toBe(false);
    if (p2.kind === 'model') expect(promptContextFor(p2).totalMs).toBe(25 * 60_000);
  });
});
