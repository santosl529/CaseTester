// Round 6 Task 76 (c) (Lorenzo, 21 Oct, round 6 rulings, 2: "Row 11's classifier call: allowed, as long as all three
// hold: it fires only on that cue; it fires on no more than ~2% of turns in the replay corpus; it adds no more than
// 1.5 s on the turns where it fires. Report its cost and latency in the check-cost log."). Through Settle: b37 Hollis Bay
// Marcus ddbb070b t9 (audit row 11), his message verbatim — the classifier's usage row tagged `cue: 'want_is'`, the
// `uncovered_asks` record with the cue, the call's latency and the turn's wait; and the check-cost report reads both.
import { describe, it, expect, vi } from 'vitest';

type Row = Record<string, unknown>;
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async (v: Row | Row[]) => { void v; } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  },
}));
const { logged } = vi.hoisted(() => ({ logged: [] as { type: string; payload: Row }[] }));
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async (type: string, payload: Row) => { logged.push({ type, payload }); } }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({
  ...(await orig<object>()),
  classifyDataRequests: async (p: { onUsage?: (u: unknown) => void }) => {
    await new Promise(r => setTimeout(r, 20));
    p.onUsage?.({ component: 'data_request', model: 'claude-haiku-4-5', inputTokens: 1200, outputTokens: 90 });
    return [];
  },
}));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { checkCostOf, checkCostMarkdown } from '@/lib/eval/check-cost';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

const MARCUS_T9 = "Noted, I'll assume we don't have it. What I'd want is distribution math: how many stores Hollis Bay can get the line into, and velocity — bags per store per week.";
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });

function plan(caseId: string, text: string): ModelPlan {
  const p = planTurn(readsFixture({ phase: 'EXHIBIT', caseId, revealed: [] }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  p.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 1 };
  p.state.checkerLine = null;
  p.state.stageCheckerLine = null;
  p.state.stageCodeLines = [];
  p.state.analysisOwed = false;
  return p;
}

describe('row 11\'s classifier call, through Settle and into the check-cost report', () => {
  it('b37h Marcus t9: the usage row tagged, the record with the cue, the latency and the wait (≤ 1.5 s); the report shows the call', async () => {
    logged.length = 0;
    const p = plan('launch-001', MARCUS_T9);
    await settleTurn(p, outcome({ say: 'Fair.', move: 'acknowledge', requests: [], exhibit: null, rescueItem: null, question: 'What would you estimate?' } as unknown as ModelTurn));
    const rows = logged.filter(l => l.type === 'llm_usage' && l.payload.component === 'data_request');
    expect(rows).toEqual([{ type: 'llm_usage', payload: expect.objectContaining({ cue: 'want_is', latencyMs: expect.any(Number) }) }]);
    const rec = p.ctx.checks.entries.find(e => e.check === 'uncovered_asks')!.detail as Row;
    expect(rec).toMatchObject({ cue: 'want_is', latencyMs: expect.any(Number), waitMs: expect.any(Number) });
    expect(rec.waitMs as number).toBeLessThanOrEqual(1600);
    // The run file's shape: the check events and the analytics rows.
    const run = {
      events: [{ category: 'check', subtype: 'uncovered_asks', turnIndex: 3, payloadJsonb: { decision: 'act', detail: rec } }],
      analytics: rows.map(r => ({ eventType: 'llm_usage', payloadJsonb: r.payload })),
      turns: [{ role: 'candidate' }, { role: 'interviewer' }],
    };
    const s = checkCostOf(run);
    expect(s.wantIs).toMatchObject({ calls: 1, candidateTurns: 1, waited: { turns: 1 } });
    expect(s.wantIs.costUsd).toBeGreaterThan(0);
    expect(checkCostMarkdown([{ id: 'hollisbay/04-marcus', summary: s }])).toMatch(/\| hollisbay\/04-marcus \| 1 \| \$\d+\.\d{4} \| \d+ \| \d+ \| 1 \| \d+ \| \d+ \| 1 \| 100\.0% \|/);
  });
  it('an addressed ask: the call untagged, the record without the cue', async () => {
    logged.length = 0;
    const p = plan('launch-001', 'Do we know how many stores Hollis Bay can get the line into?');
    await settleTurn(p, outcome({ say: 'Fair.', move: 'acknowledge', requests: [], exhibit: null, rescueItem: null, question: 'What would you estimate?' } as unknown as ModelTurn));
    const rows = logged.filter(l => l.type === 'llm_usage' && l.payload.component === 'data_request');
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).not.toHaveProperty('cue');
    expect(p.ctx.checks.entries.find(e => e.check === 'uncovered_asks')!.detail).not.toHaveProperty('cue');
  });
});
