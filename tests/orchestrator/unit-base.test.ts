// Lorenzo, 15 Oct (his batch-27 grade: no go): the unit check uses the base the
// candidate states, and every code-written unit correction names the quantity
// and the period. Batch 27 Sofia cdaa9c6c t17 said "COGS is 58, and if beans are
// 25% of COGS that's 25 points of revenue"; the check took two years ago's 42
// whatever she said, and the hint had the model say "It's closer to 10.5, not
// 25." — a false correction (on her base it is 14.5). The same check flagged
// Marisol eb601063's 14.5 (25% × 58, right on her base) as wrong. Now a figure
// right on the candidate's own base is no flag: at most a question which year
// the share is from.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));

import { getCaseById } from '@/lib/cases/loader';
import { checkNestedConversions, unitCorrectionLine } from '@/lib/orchestrator/unit-check';
import { checkCandidateMath, formatRecomputeHint, recMathLine, attemptKey } from '@/lib/orchestrator/recompute';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { INITIAL_STAGES } from '@/lib/orchestrator/stage-evidence';
import { readsFixture } from './fixtures/turn-reads';
import { checkerClaim, codeFlagsOf } from './helpers/checker-claim';

const prof = getCaseById('prof-001');
const ALL = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change', 'menu_price_change'];
const run = (text: string, revealed = ALL) => checkNestedConversions(text, { bases: prof.shareBases, items: prof.dataLedger, revealedIds: revealed });

// Batch 27, verbatim.
const SOFIA_T17 = "At flat volume: take revenue as 100 today, costs 94, profit 6. Raise price 10% — revenue 110, costs unchanged at 94 since volume's flat, so profit is 16 on 110, about 14.5%. So roughly a 9-point margin gain. Good.\n\nBreakeven is where I was wrong. If volume falls, only variable costs fall with it. COGS is variable; labor and overhead at 36 are largely fixed. So profit = 110(1−x) − 58(1−x) − 36 = 52(1−x) − 36. Setting that equal to today's 6: (1−x) = 42/52 = 0.81, so we can lose about 19% of transactions, not 10%. Much more headroom than I said.\n\nOne more thing on the ticket: COGS is 58, and if beans are 25% of COGS that's 25 points of revenue — so the item-mix shift toward food may be diluting us too. Worth checking.";
const SOFIA_T7 = "Sure. COGS went from 42 to 58, so sixteen points, and against a starting base of 42 that's a 16% increase in input costs. That was my read.\n\nNow layering in the splits. Beans were 25% of COGS two years ago, so call that 25 points of revenue, and they're up 40% — that's 10 points of added cost. Everything else is up 37.5%, which on the remaining 17 points gives roughly 6.4 points. Together that's about 16 points, which lines up with what we see.";
const MARISOL_T7 = "Let me work it. Beans are 25% of COGS, so applying that to the current COGS of 58, beans are 0.25 × 58 = 14.5 points of revenue. Other inputs are the remaining 75%, so 0.75 × 58 = 43.5 points.\n\nNow the inflation. Beans up 40%: that's 14.5 × 0.40 = 5.8 points of increase. Other inputs up 37.5%: 43.5 × 0.375 = 16.3 points. Total would be about 22 points, which overshoots the 16-point COGS move, so some of that is probably offset by volume mix — but the direction is clear.";

const SOFIA_LINE = 'Today, 25% of the 58-point COGS line is about 14.5 points of revenue, not 25.';

describe('Sofia t17: the base she states, 58, is the base of the check and of the correction', () => {
  it('the flag is on her base: 25% of 58 is 14.5', () => {
    const { flags } = run(SOFIA_T17);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ stated: 25, baseValue: 58, timeframe: 'current', baseStated: true, expected: 14.5, base: 'COGS at 58% of revenue (today)' });
  });
  it('the correction names the quantity and the period — never "It\'s closer to 10.5, not 25"', () => {
    const f = checkCandidateMath(SOFIA_T17, prof, ALL).flags.find(x => x.kind === 'unit')!;
    expect(unitCorrectionLine(f.unit!)).toBe(SOFIA_LINE);
    const hint = formatRecomputeHint([f], { attempts: { [attemptKey(f)]: 2 } });
    expect(hint.hint).toContain(`"${SOFIA_LINE}"`);
    expect(hint.hint).not.toMatch(/closer to/);
    expect(hint.hint).not.toMatch(/10\.5/);
    expect(hint.derivedValues).toEqual(expect.arrayContaining(['14.5']));
    expect(recMathLine(f, 'correct')).toBe(SOFIA_LINE);
  });
  // With the gate (16 Oct) the line waits for the checker's flag on her claim. In
  // batch 27 the checker flagged it while binding it to two years ago's base
  // (right figure 10.5): that flag releases code's line, and the line is on her
  // base, named — "Today, … 14.5" — never "closer to 10.5".
  it('through Plan, on her real turn (the third time she said it): held; released by the checker\'s flag, the hint carries the line on her base', () => {
    const reads = readsFixture({ phase: 'ANALYSIS', elapsedMs: 13.9 * 60_000, revealed: ALL,
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, recomputeAttempts: { 'unit:COGS@25': 1 }, stageEvidence: { ...INITIAL_STAGES, exhibit: { delivered: true, deliveredAt: 4, outcome: 'answered' }, brainstorm: { delivered: true, deliveredAt: 10, outcome: 'answered' } } },
      extraTurns: [{ role: 'candidate', text: SOFIA_T17 }, { role: 'interviewer', text: 'What else would you check on the ticket?' }] });
    (reads as { exhibitRows: unknown[] }).exhibitRows = [{ id: 'x1', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: 0 }];
    const deps = { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} };
    const held = planTurn(reads, SOFIA_T17, deps);
    if (held.kind !== 'model') throw new Error('expected a model plan');
    expect(held.state.recomputeHint).not.toMatch(/UNIT|14\.5/);
    // b27's verdict on it: an error, bound to the two-years-ago step (10.5).
    const b27 = { ...checkerClaim('25 points of revenue', { correctValue: 10.5, errorType: 'unit' }), flag: true, probeLine: null, correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [] };
    const row = { category: 'math_checker', subtype: 'verdict', turnIndex: 3, payloadJsonb: { candidateTurnIndex: 3, latencyMs: 9000, model: 'm', claims: [b27], codeFlags: codeFlagsOf(SOFIA_T17, ALL), stamps: [] } };
    const p = planTurn({ ...reads, checkerEventRows: [row] } as never, 'I would look at the food mix next.', deps);
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.state.recomputeHint).toContain(SOFIA_LINE);
    expect(p.state.recomputeHint).not.toMatch(/closer to|10\.5/);
  });
});

describe('Sofia t7: no base stated — the case share\'s own year, named', () => {
  it('25% of COGS two years ago, said as 25 points: two years ago\'s 42-point line, 10.5', () => {
    const [f] = run(SOFIA_T7).flags;
    expect(f).toMatchObject({ stated: 25, baseValue: 42, timeframe: 'prior', baseStated: false, expected: 10.5 });
    expect(unitCorrectionLine(f)).toBe('Two years ago, 25% of the 42-point COGS line was about 10.5 points of revenue, not 25.');
  });
});

describe('Marisol t7 (her t8 probe): 0.25 × 58 = 14.5 is right on her own base — no unit flag, at most a period question', () => {
  it('no flag, no stamp; a period question naming the share\'s year and her base', () => {
    const r = run(MARISOL_T7);
    expect(r.flags).toEqual([]);
    expect(r.verified.filter(v => v.stated === 14.5)).toEqual([]);
    expect(r.periodQuestions).toEqual([expect.objectContaining({ stated: 14.5, share: 25, sharePeriod: 'prior', baseValue: 58, baseName: 'COGS' })]);
  });
  it('no recompute flag, so nothing to escalate to a correction; the hint asks which year, as a question, with no figure', () => {
    expect(checkCandidateMath(MARISOL_T7, prof, ALL).flags.filter(f => f.kind === 'unit')).toEqual([]);
    const reads = readsFixture({ phase: 'ANALYSIS', elapsedMs: 6.2 * 60_000, revealed: ALL, flags: { pressureTest: { state: 'satisfied', askedAt: 2 } } });
    const p = planTurn(reads, MARISOL_T7, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.state.recomputeHint).toMatch(/PERIOD \(no error to flag\)/);
    expect(p.state.recomputeHint).toContain('"Which year is that 25% share of COGS from?"');
    expect(p.state.recomputeHint).toMatch(/don't doubt it, correct it or name a figure/);
    expect(p.state.flaggedFigures).not.toContain(14.5);
  });
  it('an assumption that the share still holds today is verified, no question (Tobias b2)', () => {
    const r = run("If beans are still 25% of COGS today, that's 25% of 58%, or 14.5% of revenue.");
    expect(r.periodQuestions).toEqual([]);
    expect(r.verified).toEqual([expect.objectContaining({ stated: 14.5 })]);
  });
});

describe('other bases the candidate states', () => {
  it('last year\'s 50: the slip is corrected on 50, named as their base', () => {
    const [f] = run("Using last year's COGS of 50, beans at 25% of COGS are 25 points of revenue.").flags;
    expect(f).toMatchObject({ baseValue: 50, timeframe: 'stated', baseStated: true, expected: 12.5 });
    expect(unitCorrectionLine(f)).toBe('On the 50-point COGS line you used, 25% is about 12.5 points of revenue, not 25.');
  });
  it('"25% of 50 is 12.5": right on their base, a share of another year — a question, not a flag', () => {
    const r = run('Beans are 25% of COGS. Beans at 25% of 50 is 12.5 points of revenue.');
    expect(r.flags).toEqual([]);
    expect(r.periodQuestions).toEqual([expect.objectContaining({ stated: 12.5, baseValue: 50 })]);
  });
  it('a change on their base: "with COGS at 58%, beans up 40% add 10 points of revenue" → 5.8 on 58, named', () => {
    const [f] = run('With COGS at 58% of revenue and beans at 25% of COGS up 40%, that adds 10 points of revenue.').flags;
    expect(f).toMatchObject({ baseValue: 58, form: 'delta', expected: 5.8 });
    expect(unitCorrectionLine(f)).toBe('Today, 25% of the 58-point COGS line is 14.5 points of revenue; up 40%, that adds about 5.8 points of revenue, not 10.');
  });
  it('their own share and no base stated: the correction names both of the case\'s years', () => {
    const [f] = run('Waste runs about 4% of COGS, so call it 4 points of revenue.', ['cogs_pct']).flags;
    expect(unitCorrectionLine(f)).toBe("4% of COGS is about 1.7 points of revenue on two years ago's 42-point COGS line, or about 2.3 on today's 58 — not 4.");
  });
});

// Point 3 of the ruling: the checker's correction takes its base from the
// candidate's words too. Sofia t17's verdict (batch 27, as recorded) bound the
// claim to the two-years-ago step, and its own derivation used 42 — so code's
// "agreement" was the same base choice, not an independent check.
describe('the checker path: a step of one year corrects no claim stated on another year\'s base', async () => {
  const { vetCheckerClaims } = await import('@/lib/orchestrator/math-checker');
  const SOFIA_17_3 = {
    span: "if beans are 25% of COGS that's 25 points of revenue", quantity: 'beans as points of revenue', candidateValue: '25 points of revenue',
    assumptions: 'beans 25% of COGS two years ago; COGS 42 then, 58 now', verdict: 'error' as const, correctValue: 10.5, correctLow: null, correctHigh: null,
    unit: 'points of revenue', derivation: '25% of COGS is not 25 points of revenue; 25% x 42 = 10.5 points two years ago', errorType: 'unit' as const, changesConclusion: false, confidence: 'high' as const,
    probe: 'You said beans are 25 points of revenue. Points of what base, and which year does that 25% refer to?',
    pointer: 'How does that fit with the COGS share of revenue you worked out earlier, 42 two years ago and 58 now?',
    codeQuantity: { kind: 'step' as const, stepId: 'bean_share_of_revenue', price: null, target: null }, actualShare: null,
  };
  const vet = (message: string, span = SOFIA_17_3.span) => vetCheckerClaims([{ ...SOFIA_17_3, span }], { caseData: prof, revealedIds: ALL, shownExhibitIds: ['exhibit-a'], candidateTexts: [message] })[0];
  it('Sofia t17 ("COGS is 58"): no correction — the probe alone', () => {
    const v = vet(SOFIA_T17);
    expect(v.correctionLine).toBeNull();
    expect(v.vetNotes).toContainEqual(expect.stringMatching(/probe only: the claim states COGS at 58; the step is two years ago's \(42\)/));
  });
  it('with no base stated, the step\'s correction stands — it names the quantity and its year', () => {
    const v = vet("Beans were 25% of COGS two years ago, so that's 25 points of revenue.", "that's 25 points of revenue");
    expect(v.correctionLine).toBe('Coffee beans as a share of revenue two years ago is about 10.5 points, not 25.');
  });
  it('a claim on the step\'s own base (42) is corrected as before', () => {
    const v = vet("COGS was 42 two years ago, and if beans are 25% of COGS that's 25 points of revenue.");
    expect(v.correctionLine).toBe('Coffee beans as a share of revenue two years ago is about 10.5 points, not 25.');
  });
});

// Replay (batch 18 Sofia 3f57efe t9): "0.40 × 25% = 10" — the 40% rise is no base.
describe('a change written as a fraction is not the base', () => {
  it('"0.40 × 25% = 10 … 10 percentage points of revenue": the base stays two years ago\'s 42', () => {
    const [f] = run('Beans were 25% of COGS and prices are up 40%, so that\'s 0.40 × 25% = 10 — call it 10 percentage points of revenue from beans alone.').flags;
    expect(f).toMatchObject({ stated: 10, baseValue: 42, timeframe: 'prior', expected: 4.2 });
  });
});
