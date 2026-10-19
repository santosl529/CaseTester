// An explicit deferral with no item (Lorenzo, 19 Oct; engine-asks R1, batch 32
// Aldermoor Marcus t5): checked by a small model before code refuses it —
// mapped to an item or no verdict: a named deferral; mapped to none: refused.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []) }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import { readsFixture } from './fixtures/turn-reads';

const WHAT = "Aldermoor's European Kelvexa sales trend since 2022";
const plan = (): ModelPlan => {
  const p = planTurn(readsFixture({ phase: 'STRUCTURE', flags: {} }), `Could I get ${WHAT}?`,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
};
const T = { requests: [{ what: WHAT, itemIds: [], explicit: true, respond: 'defer' as const }], exhibit: null, rescueItem: null };

describe('an item-less deferral', () => {
  it('is refused when the check maps the ask to no item', async () => {
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(plan(), T);
    expect(d.refusals).toEqual([WHAT]);
    expect(d.defers).toEqual([]);
    expect('unmappedDefer' in d).toBe(false);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('is a named deferral when the check maps it to an item (nothing released)', async () => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(), T);
    expect(d.defers).toEqual([WHAT]);
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's').join(' ')).toContain(WHAT);
  });
  it('is a named deferral when the check fails', async () => {
    classify.mockResolvedValueOnce(null);
    expect((await turnDataChecked(plan(), T)).defers).toEqual([WHAT]);
  });
  it('is checked once for Stream and Settle alike', async () => {
    classify.mockClear();
    classify.mockResolvedValueOnce([]);
    const p = plan();
    await turnDataChecked(p, T);
    await turnDataChecked(p, T);
    expect(classify).toHaveBeenCalledTimes(1);
  });
});
