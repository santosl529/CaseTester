// Lorenzo, 13 Oct (Larkspur review, item 2): until a case's step binding is
// validated, its step flags are report-only — logged, never a probe or a
// correction. prof-001 keeps its live step flags (stepFlagsLive).
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));

import { checkCandidateMath } from '@/lib/orchestrator/recompute';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { getCaseById } from '@/lib/cases/loader';
import { readsFixture } from './fixtures/turn-reads';

const LAKEPORT = ['lakeport_seats_load', 'lakeport_fare', 'extras_revenue', 'lakeport_variable_cost'];
const WRONG = 'Lakeport made $4,900 of contribution per flight in FY2023.';

describe('step flags on a case whose binding is not validated', () => {
  it('prof-002: the step flag is reported, not raised', () => {
    const m = checkCandidateMath(WRONG, getCaseById('prof-002'), LAKEPORT);
    expect(m.flags.filter(f => (f.kind ?? 'step') === 'step')).toEqual([]);
    expect(m.reportOnly).toEqual(expect.arrayContaining([expect.objectContaining({ stepId: 'lakeport_contribution_fy2023', candidateValue: 4900 })]));
  });
  it('prof-001 keeps them live', () => {
    const m = checkCandidateMath('The COGS increase is costing us about $95M a year.', getCaseById('prof-001'), ['cogs_pct', 'revenue_total']);
    expect(m.flags).toEqual([expect.objectContaining({ kind: 'step', stepId: 'cogs_dollar_impact' })]);
    expect(m.reportOnly).toEqual([]);
  });
  it('every case but prof-001 is report-only today', () => {
    expect(['prof-001', 'prof-002', 'entry-001', 'pricing-001', 'launch-001'].map(id => Boolean(getCaseById(id).stepFlagsLive))).toEqual([true, false, false, false, false]);
  });
  it('in a turn: no RECOMPUTE hint, no attempt counted, the flag logged', () => {
    const p = planTurn(readsFixture({ caseId: 'prof-002', phase: 'ANALYSIS', revealed: LAKEPORT, flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } } }), WRONG,
      { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.state.recomputeHint ?? '').not.toMatch(/RECOMPUTE FLAG/);
    expect(p.state.recomputeAttempts).toEqual({});
    expect(p.ctx.checks.entries.find(c => c.check === 'recompute_report_only')).toMatchObject({ detail: { flags: expect.arrayContaining([expect.objectContaining({ stepId: 'lakeport_contribution_fy2023' })]) } });
  });
});

// Lorenzo, 13 Oct (Larkspur rulings): with a case's step flags report-only, the
// Sonnet checker's probes still go out — a report-only flag is no deterministic
// probe this turn and no code flag the checker's claim is deduped against.
describe("the checker's probe on a case whose step flags are report-only", () => {
  it('prof-002: the checker flag on an earlier message reaches the model while this message raises a report-only step flag (no deterministic probe holds it back)', () => {
    const claim = {
      span: 'the other four routes absorb about half the damage', quantity: 'share of the damage absorbed by the other routes', candidateValue: 'about half', assumptions: '', verdict: 'error' as const,
      correctValue: null, correctLow: null, correctHigh: null, unit: 'share', derivation: '', errorType: 'conceptual' as const, changesConclusion: true, confidence: 'high' as const, probe: '', pointer: '',
      codeQuantity: { kind: 'none' as const, stepId: null, price: null, target: null }, actualShare: null,
      flag: true, probeLine: 'You said the other routes absorb about half the damage. Walk me through how you got there.', correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [],
    };
    const reads = readsFixture({ caseId: 'prof-002', phase: 'ANALYSIS', revealed: LAKEPORT, flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } } });
    reads.checkerEventRows = [{ id: 'v1', sessionId: 's1', phase: 'ANALYSIS', createdAt: new Date(), category: 'math_checker', subtype: 'verdict', turnIndex: 1,
      payloadJsonb: { candidateTurnIndex: 1, latencyMs: 6000, model: 'claude-sonnet-5-5', claims: [claim], codeFlags: [], stamps: [] } }];
    const p = planTurn(reads, WRONG, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.ctx.checks.entries.find(c => c.check === 'recompute_report_only')?.decision).toBe('act');
    expect(p.state.recomputeHint).toMatch(/MATH CHECK FLAG[\s\S]*Walk me through how you got there/);
    expect(p.state.recomputeHint).not.toMatch(/RECOMPUTE FLAG/);
  });
});
