// Phase 1 Stream 3 task 1 through plan-turn: the worksheet is kept in flags.worksheet only with the `worksheet` switch
// (ENGINE_SWITCHES), filled from this message's step bindings and every landed verdict's tagged claims. b37q Raj t11
// verbatim ("…so about 13.5 months on plan × $30 = roughly $405 LTV"; step-roots-b37q.json).
import { describe, it, expect, vi, afterEach } from 'vitest';

type Row = Record<string, unknown>;
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async () => {} }),
    update: () => ({ set: (v: Row) => ({ where: async () => { void v; } }) }),
  },
}));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { readsFixture } from './fixtures/turn-reads';
import type { Worksheet } from '@/lib/orchestrator/worksheet-types';
import type { VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import { RAJ } from './fixtures/step-roots-replay';

const T11 = RAJ.turns.find(t => t.turnIndex === 11)!.text;
const rec = RAJ.records['11'];
const PT = { ...INITIAL_PRESSURE_TEST, state: 'satisfied' as const, satisfiedAt: 3 };
const verdict17 = RAJ.rows.find(r => r.subtype === 'verdict' && (r.payloadJsonb as VerdictPayload).candidateTurnIndex === 17)!;
function plan(flags: Record<string, unknown> = {}, rows: unknown[] = []): ModelPlan {
  const reads = readsFixture({ phase: 'EXHIBIT', caseId: 'pricing-001', revealed: rec.revealed, elapsedMs: rec.elapsedMs, flags: { pressureTest: PT, ...flags } });
  return planTurn({ ...reads, checkerEventRows: rows } as never, T11, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('flags.worksheet', () => {
  it('switch off: never written', () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    expect(plan().ctx.flags.worksheet).toBeUndefined();
  });
  it('switch on: the message\'s step binding (report-only starter_ltv 405, wrong against $600 ± $60) at its turn', () => {
    vi.stubEnv('ENGINE_SWITCHES', 'pricing-001=worksheet');
    const ws = plan().ctx.flags.worksheet as Worksheet;
    expect(ws.entries['step:starter_ltv']).toEqual(expect.objectContaining({ value: 405, turn: 3, status: 'wrong', source: 'step_binding', unit: 'usd' }));
    expect(ws.throughTurn).toBe(3);
  });
  it('switch on: a landed verdict\'s tagged claims fold in at their own message, never over a later value', () => {
    vi.stubEnv('ENGINE_SWITCHES', '*=worksheet');
    // Raj's message-17 verdict, landed for a message before this one (renumbered to message 1).
    const row = { ...verdict17, id: 'ev', sessionId: 's1', phase: 'ANALYSIS', turnIndex: 1, payloadJsonb: { ...(verdict17.payloadJsonb as VerdictPayload), candidateTurnIndex: 1 } };
    const ws = plan({}, [row]).ctx.flags.worksheet as Worksheet;
    const tagged = (verdict17.payloadJsonb as VerdictPayload).claims.filter(c => c.codeQuantity.kind === 'step');
    expect(tagged.length).toBeGreaterThan(0);
    for (const c of tagged) {
      const e = ws.entries[`step:${c.codeQuantity.stepId}`];
      expect(e, c.codeQuantity.stepId!).toBeDefined();
      expect([e, ...e.history].some(v => v.turn === 1 && v.source === 'checker')).toBe(true);
    }
    expect(ws.entries['step:starter_ltv'].turn).toBe(3);
  });
});
