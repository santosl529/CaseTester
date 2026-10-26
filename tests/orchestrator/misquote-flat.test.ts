// Phase 1 Stream 3 task 4 — the flat misquote correction (`misquoteFlat`, contract 3.4). Lorenzo: "a flat correction,
// from the ledger value, only when code finds a mismatch with a revealed item AND the checker rated the span an error
// (flag or not). Never let the probe guard replace a model question that catches a misquote."
// b38 Larkspur Tyler cee7d399 verbatim (fixtures/phase1-s3-runs.ts): t5 "fixed costs were $21M" (the ledger says
// $20.0M) and t29 "Westhaven's $3.6M of contribution" (the line says $4.4M) were both dropped by the gate with the
// checker rating them error/high and raising no flag; his $19.8M and $8,800 at t21 and t25 are his own figures, with
// no claim of the checker on them, and must stay dropped.
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
import { challengeVerdict } from '@/lib/orchestrator/probe-guard';
import { gateCodeFindings, type GateDecision, type CheckerRow, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import { getCaseById } from '@/lib/cases/loader';
import { MARISOL, TYLER, readsAt, textOf } from './fixtures/phase1-s3-runs';

const PT = { ...INITIAL_PRESSURE_TEST, state: 'satisfied' as const, satisfiedAt: 3 };
const ON = 'prof-002=misquoteFlat';
const plan = (n: number, flags: Record<string, unknown> = {}) =>
  planTurn(readsAt(TYLER, n, { pressureTest: PT, ...flags }), textOf(TYLER, n), { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
const gateRows = (p: ModelPlan) => p.ctx.events.filter(e => e.category === 'math_checker' && e.subtype === 'code_gate').map(e => e.payload as GateDecision);
const decisionOn = (p: ModelPlan, id: string) => gateRows(p).find(d => d.id === id);

afterEach(() => { vi.unstubAllEnvs(); });

describe('t5 "You said fixed costs were $21M in both years" — the checker rates it error/high, no flag', () => {
  it('switches off: dropped by the gate, nothing said (the run\'s own outcome)', () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const p = plan(7);
    expect(decisionOn(p, '5:code:0')).toMatchObject({ key: 'misquote:fixed_costs', value: 21, outcome: 'not_rated' });
    expect(p.state.misquote).toBeNull();
  });
  it('on: the flat correction from the ledger value, booked as released with the rating in its reason', () => {
    vi.stubEnv('ENGINE_SWITCHES', ON);
    const p = plan(7);
    expect(decisionOn(p, '5:code:0')).toMatchObject({
      outcome: 'released',
      reason: expect.stringMatching(/^code's mismatch with fixed_costs, and the checker rates "\$?21M?" error\/high with no flag \(misquoteFlat\)$/),
    });
    expect(p.state.misquote).toMatchObject({ item: 'fixed_costs', cited: 'were $21M' });
    expect(p.state.misquote!.text).toContain('were $20.0M in both FY2023 and FY2025');
    expect(p.state.misquoteHint).toContain('Do not repeat, correct, question or build on their figure yourself');
  });
});

describe('t29 "Westhaven\'s $3.6M of contribution" in the recommendation — the same rating, no flag', () => {
  it('switches off: dropped', () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const p = plan(31);
    expect(decisionOn(p, '29:code:0')).toMatchObject({ key: 'misquote:route_results_other', value: 3.6, outcome: 'not_rated' });
    expect(p.state.misquote).toBeNull();
  });
  it('on: the correction, in the ledger line\'s own words', () => {
    vi.stubEnv('ENGINE_SWITCHES', ON);
    const p = plan(31);
    expect(decisionOn(p, '29:code:0')).toMatchObject({ outcome: 'released', reason: expect.stringContaining('(misquoteFlat)') });
    expect(p.state.misquote).toMatchObject({ item: 'route_results_other' });
    expect(p.state.misquote!.text).toContain('Hub–Westhaven (2,000 flights) held at $24.8M of revenue');
  });
});

describe('no rating, no correction — the rule is the checker\'s agreement, not code\'s finding alone', () => {
  it('t21 "$19.8M against $20M fixed": no claim of the checker on the figure — dropped with the switch on too', () => {
    for (const switches of ['', ON]) {
      vi.stubEnv('ENGINE_SWITCHES', switches);
      const p = plan(23);
      expect(decisionOn(p, '21:code:0'), switches).toMatchObject({ outcome: 'not_rated', reason: 'no claim of the checker on this figure' });
      expect(p.state.misquote, switches).toBeNull();
    }
  });
  it('t25 "my $8,800 variable cost error": the same — his own withdrawn figure, no claim on it', () => {
    for (const switches of ['', ON]) {
      vi.stubEnv('ENGINE_SWITCHES', switches);
      const p = plan(27);
      expect(decisionOn(p, '25:code:0'), switches).toMatchObject({ outcome: 'not_rated', reason: 'no claim of the checker on this figure' });
      expect(p.state.misquote, switches).toBeNull();
    }
  });
  it('t9 "revenue 46.8 down to 33.6": the checker flags it, so it is released either way (today\'s path, unchanged)', () => {
    for (const switches of ['', ON]) {
      vi.stubEnv('ENGINE_SWITCHES', switches);
      const p = plan(11);
      expect(decisionOn(p, '9:code:0'), switches).toMatchObject({ outcome: 'released', reason: 'the checker flags "33.6; $13.2M"' });
      expect(p.state.misquote, switches).toMatchObject({ item: 'route_results_port_avery' });
    }
  });
});

// The false correction the 26 Oct replay caught, pinned on the run itself: b38 Larkspur Marisol f80d981c t15 "So the
// swap is worth $15.8M of contribution" — her own derived figure, which the misquote grammar read as a misquote of the
// network totals ($16.0M of contribution). The checker flags it with 11.8 right, so the agreement test drops it; with
// the agreement relaxed, the turn said "To correct one figure: across all six routes, revenue fell from $200.0M…",
// correcting a figure she never quoted, and the true correction ("about $11.8M, not $15.8M") was lost.
describe('b38 Marisol t15 — a derived figure the grammar reads as a misquote is never corrected flat', () => {
  const at17 = () => planTurn(readsAt(MARISOL, 17, { pressureTest: PT }), textOf(MARISOL, 17), { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
  it('her figure, the finding and the checker\'s own right figure', () => {
    expect(textOf(MARISOL, 15)).toContain('the swap is worth $15.8M of contribution');
    const v = (MARISOL.rows.find(r => (r.payloadJsonb as VerdictPayload).candidateTurnIndex === 15)!.payloadJsonb as VerdictPayload).claims[2];
    expect(v).toMatchObject({ candidateValue: '$15.8M', verdict: 'error', flag: true, correctValue: 11.8 });
  });
  it('dropped with the switch on, as it is off: the checker rated another quantity', () => {
    for (const switches of ['', 'prof-002=misquoteFlat']) {
      vi.stubEnv('ENGINE_SWITCHES', switches);
      const p = at17();
      expect(gateRows(p).find(d => d.key === 'misquote:network_totals'), switches).toMatchObject({ outcome: 'checker_disagrees' });
      expect(p.state.misquote, switches).toBeNull();
    }
  });
});

describe('the probe guard never replaces a model question that catches a misquote', () => {
  // b38 Larkspur Tyler t14, the model's own question after his t13 "the exhibit shows fare down to $125" (it says $120).
  const SENTENCE = 'Before you size the fix, look at the fare line: what does it show for FY2025, and does your $125 match it?';
  const ctx = { verified: [], alreadyProbed: new Set<string>(), flaggedThisTurn: false, flagged: [], candidateFigures: [125, 145, 8700, 300] };
  it('today: withheld as an unsupported challenge (the run\'s own outcome — the replacement was "Where does that leave your analysis?")', () => {
    expect(challengeVerdict(SENTENCE, ctx)).toMatchObject({ test: 'unsupported_challenge', figure: 125 });
  });
  it('with code\'s misquote finding on the message, the model\'s question stands', () => {
    expect(challengeVerdict(SENTENCE, { ...ctx, misquoteFigures: [125] })).toBeNull();
  });
  it('another figure\'s misquote licenses nothing', () => {
    expect(challengeVerdict(SENTENCE, { ...ctx, misquoteFigures: [120] })).toMatchObject({ test: 'unsupported_challenge' });
  });
  it('a doubt of a figure code verified as correct is still withheld, misquote finding or not', () => {
    const verified = [{ stepId: 'lakeport_contribution_fy2025', value: 125, operands: [], span: 'x', workShown: false }];
    expect(challengeVerdict('Are you sure the $125 is right?', { ...ctx, verified, misquoteFigures: [125] })).toMatchObject({ test: 'doubt_on_verified' });
  });
  it('a figure closed to the report stays closed', () => {
    expect(challengeVerdict(SENTENCE, { ...ctx, closed: [125], misquoteFigures: [125] })).toMatchObject({ test: 'closed_to_report' });
  });
});

describe('plan-turn fills the guard\'s misquote figures only under the switch', () => {
  it('off: none; on: the message\'s own findings', () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    expect(plan(9).state.misquoteFigures).toEqual([]);
    vi.stubEnv('ENGINE_SWITCHES', ON);
    expect(plan(9).state.misquoteFigures).toEqual([33.6]);   // "revenue 46.8 down to 33.6" (the line says $32.4M)
  });
});

// The gate's own decision, on the real t5 verdict with one claim changed: the rating is required and a contradicting
// rating blocks. (gateCodeFindings is what plan-turn calls; the rows are the run's own.)
describe('gateCodeFindings on t5, claim by claim', () => {
  const row = TYLER.rows.find(r => (r.payloadJsonb as VerdictPayload).candidateTurnIndex === 5)!;
  const verdict = row.payloadJsonb as VerdictPayload;
  const caseData = getCaseById('prof-002');
  const gate = (claims: VerdictPayload['claims'], switches: string) => {
    vi.stubEnv('ENGINE_SWITCHES', switches);
    return gateCodeFindings({
      rows: [{ ...row, payloadJsonb: { ...verdict, claims } } as CheckerRow], handled: [],
      turnRows: TYLER.turns.filter(t => t.turnIndex < 7), candidateText: textOf(TYLER, 7), candidateTurnIndex: 7,
      caseData, revealedIds: TYLER.records['7'].revealed,
      codeFigures: f => (f.kind === 'misquote' ? [20] : null),
    }).decisions[0];
  };
  const claim = (over: Partial<VerdictPayload['claims'][number]>) => [{ ...verdict.claims[0], ...over }, verdict.claims[1]];

  it('error, no flag → released with the switch, dropped without it', () => {
    expect(gate(verdict.claims, ON).outcome).toBe('released');
    expect(gate(verdict.claims, '').outcome).toBe('not_rated');
  });
  it('a second claim on the same span rated correct blocks it: the checker contradicts itself', () => {
    expect(gate([...claim({}), { ...verdict.claims[0], verdict: 'correct', errorType: null }], ON).outcome).toBe('checker_correct');
  });
  it('unverifiable is no rating', () => {
    expect(gate(claim({ verdict: 'unverifiable' }), ON).outcome).toBe('not_rated');
  });
  it('error at low confidence is still an error rated by the checker (Lorenzo: flag or not)', () => {
    const d = gate(claim({ confidence: 'low' }), ON);
    expect(d.outcome).toBe('released');
    expect(d.reason).toContain('error/low with no flag');
  });
  it('a deterministic flag finding is untouched: the switch is the misquote rule only', () => {
    const flagRef = { key: 'fixed_costs@21', value: 21, span: verdict.codeFlags[0].span, finding: { kind: 'flag' as const, flag: { stepId: 'op_profit_swing', candidateValue: 21, expected: 20, span: verdict.codeFlags[0].span, quantity: 'fixed costs', kind: 'step' as const } } };
    const gateFlag = (switches: string) => {
      vi.stubEnv('ENGINE_SWITCHES', switches);
      return gateCodeFindings({
        rows: [{ ...row, payloadJsonb: { ...verdict, codeFlags: [flagRef] } } as CheckerRow], handled: [],
        turnRows: TYLER.turns.filter(t => t.turnIndex < 7), candidateText: textOf(TYLER, 7), candidateTurnIndex: 7,
        caseData, revealedIds: TYLER.records['7'].revealed, codeFigures: f => (f.kind === 'misquote' ? [20] : null),
      }).decisions[0];
    };
    expect(gateFlag('').outcome).toBe('not_rated');
    expect(gateFlag(ON).outcome).toBe('not_rated');   // the checker's claim on "$21M" is an error with no flag: still no line
  });
  it('the right-figure agreement is NOT relaxed: a rating whose own right figure is not code\'s stays dropped', () => {
    // The switch relaxes the flag, not the agreement. The checker's right figure must be one the data line states,
    // else it rated another quantity — the false correction the 26 Oct replay caught (b38 Marisol, below).
    expect(gate(claim({ flag: true, correctValue: 18 }), '').outcome).toBe('checker_disagrees');
    expect(gate(claim({ flag: true, correctValue: 18 }), ON).outcome).toBe('checker_disagrees');
    expect(gate(claim({ correctValue: 18 }), ON).outcome).toBe('not_rated');
  });
});
