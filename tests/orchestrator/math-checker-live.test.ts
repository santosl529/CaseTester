import { describe, it, expect } from 'vitest';
import {
  checkerKey, isStale, modelProbed, planCheckerFlags, startMathCheck, formatCheckerHint, liveCheckerConfig, closedErrorRestated, lineKey, gateCodeFindings, gateOutcomesOf, codeFlagRefs, rootOf, caseNumbersOf,
  MATH_CHECKER_CATEGORY, type CheckerRow, type CheckerPlanInput, type VerdictPayload,
} from '@/lib/orchestrator/math-checker-live';
import type { CheckerClaim, VettedClaim } from '@/lib/orchestrator/math-checker';
import { candidateFiguresOf } from '@/lib/orchestrator/math-talk';
import { getCaseById } from '@/lib/cases/loader';
import EVIDENCE from './fixtures/restate-closed-root.json';

const prof = getCaseById('prof-001');
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];

const vetted = (over: Partial<VettedClaim> = {}): VettedClaim => ({
  span: 'a 10% price increase recovers about 5 points', quantity: 'margin gain from a 10% price rise', candidateValue: 'about 5 points', assumptions: '',
  verdict: 'error', correctValue: 8.5, correctLow: null, correctHigh: null, unit: 'points', derivation: '', errorType: 'conceptual',
  changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null }, actualShare: null,
  flag: true, probeLine: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?',
  correctionLine: 'From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.', correctionFigure: '8.5', pointerLine: null, vetNotes: [],
  ...over,
});

const verdictRow = (candidateTurnIndex: number, claims: VettedClaim[], extra: Partial<VerdictPayload> = {}): CheckerRow => ({
  category: MATH_CHECKER_CATEGORY, subtype: 'verdict', turnIndex: candidateTurnIndex,
  payloadJsonb: { candidateTurnIndex, latencyMs: 6000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [], ...extra } satisfies VerdictPayload,
});

// Message 3 states the claim; the interviewer answered at 4; message 5 is now.
const input = (over: Partial<CheckerPlanInput> = {}): CheckerPlanInput => ({
  rows: [verdictRow(3, [vetted()])], handled: [],
  turnRows: [
    { turnIndex: 0, role: 'interviewer', text: 'Your client is Brew & Bean.' },
    { turnIndex: 3, role: 'candidate', text: 'A 10% price increase recovers about 5 points of margin.' },
    { turnIndex: 4, role: 'interviewer', text: 'What would you look at next?' },
  ],
  candidateText: 'Next I would look at the competitive response.', candidateTurnIndex: 5,
  currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: [5, 10],
  caseData: prof, revealedIds: COSTS,
  ...over,
});

describe('the Rule 14 key — shared with the deterministic checks: the step or kind plus the claimed value (Lorenzo, 13 Oct)', () => {
  const c = (kind: CheckerClaim['codeQuantity']['kind'], stepId: string | null = null) => vetted({ codeQuantity: { kind, stepId, price: 10, target: 24 } });
  it.each([
    ['gain', 'pricing:gain@5'], ['new_margin', 'pricing:new_margin@5'], ['needed_for_margin', 'pricing:needed@5'], ['needed_for_gain', 'pricing:needed@5'], ['breakeven', 'pricing:breakeven@5'],
  ] as const)('%s → %s', (kind, key) => expect(checkerKey(c(kind))).toBe(key));
  it('a math step → its id; nothing code computes → the claim in the candidate\'s words', () => {
    expect(checkerKey(c('step', 'bean_points_added'))).toBe('bean_points_added@5');
    expect(checkerKey(vetted({ codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, candidateValue: 'The whole 18 points' }))).toBe('checker:the whole 18 points');
  });
});

describe('a verdict lands on the next turn as a Rule 14 flag', () => {
  it('first attempt: the vetted probe, its key counted, the claim handled', () => {
    const p = planCheckerFlags(input());
    expect(p.selected?.action).toBe('probe');
    expect(p.selected?.line).toBe(vetted().probeLine);
    expect(p.selected?.attempt).toBe(1);
    expect(p.selected?.key).toBe('pricing:gain@5');
    expect(p.selected?.id).toBe('3:0');
    expect(p.flaggedFigures).toEqual(expect.arrayContaining([5]));
  });

  it('a claim already handled is not raised again', () => {
    expect(planCheckerFlags(input({ handled: ['3:0'] })).selected).toBeNull();
  });

  it('only verdicts on earlier messages; errors and unflagged claims are ignored', () => {
    const rows: CheckerRow[] = [
      verdictRow(5, [vetted()]),
      { category: MATH_CHECKER_CATEGORY, subtype: 'error', turnIndex: 3, payloadJsonb: { candidateTurnIndex: 3, error: 'timeout', timedOut: true, latencyMs: 30000 } },
      verdictRow(3, [vetted({ flag: false })]),
    ];
    expect(planCheckerFlags(input({ rows })).selected).toBeNull();
  });

  it('second attempt — the shared counter: a deterministic flag on the same key earlier → the code-written correction', () => {
    const p = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 } }));
    expect(p.selected?.action).toBe('correct');
    expect(p.selected?.line).toBe('From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.');
    expect(p.selected?.derived).toEqual(['8.5']);
    expect(p.selected?.attempt).toBe(2);
  });

  it('a model probe on the claim since the message counts as the probe', () => {
    const turnRows = [...input().turnRows.slice(0, 2), { turnIndex: 4, role: 'interviewer' as const, text: 'Walk me through how you got to 5 points.' }];
    const p = planCheckerFlags(input({ turnRows }));
    expect(p.selected?.action).toBe('correct');
    expect(p.selected?.attempt).toBe(2);
  });

  it('second attempt with no correction: the pointer probe; with neither: unresolved, for the report', () => {
    const noCorrection = { correctionLine: null, correctionFigure: null };
    const withPointer = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted({ ...noCorrection, pointerLine: 'How does that fit with labor at 22% of revenue?' })])] }));
    expect(withPointer.selected?.action).toBe('pointer');
    // Said two turns after the claim, it quotes it (round-4 ruling 4).
    expect(withPointer.selected?.line).toBe('You said “5 points” — how does that fit with labor at 22% of revenue?');
    const neither = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted(noCorrection)])] }));
    expect(neither.selected).toBeNull();
    expect(neither.decisions).toEqual([expect.objectContaining({ id: '3:0', outcome: 'unresolved' })]);
    expect(neither.handledNow).toContain('3:0');
  });

  // Lorenzo, 13 Oct (Step-4 rulings): a hint naming a component the candidate
  // raised earlier is a second probe only — after the first, never instead of it.
  describe('the hint probe', () => {
    const hint = 'You said 5 points. How does that sit with the overhead you mentioned?';
    const noCorrection = { correctionLine: null, correctionFigure: null, hintLine: hint };
    it('second attempt, no correction and no pointer: the hint', () => {
      const p = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted(noCorrection)])] }));
      expect(p.selected).toMatchObject({ action: 'hint', line: hint, attempt: 2 });
    });
    it('the pointer comes before the hint; the correction before both', () => {
      const pointer = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted({ ...noCorrection, pointerLine: 'How does that fit with labor at 22% of revenue?' })])] }));
      expect(pointer.selected?.action).toBe('pointer');
      const corrected = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted({ hintLine: hint })])] }));
      expect(corrected.selected?.action).toBe('correct');
    });
    it('never the first probe — not even under time pressure, when the probe is skipped', () => {
      expect(planCheckerFlags(input({ rows: [verdictRow(3, [vetted(noCorrection)])] })).selected?.action).toBe('probe');
      const rushed = planCheckerFlags(input({ underTimePressure: true, rows: [verdictRow(3, [vetted(noCorrection)])] }));
      expect(rushed.selected).toBeNull();
      expect(rushed.decisions[0].outcome).toBe('unresolved');
    });
    it('past the second probe: unresolved, for the report', () => {
      const p = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 2 }, rows: [verdictRow(3, [vetted(noCorrection)])] }));
      expect(p.selected).toBeNull();
      expect(p.decisions[0].outcome).toBe('unresolved');
    });
    it('the model is told to ask it once, as written', () => {
      const s = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted(noCorrection)])] })).selected!;
      expect(formatCheckerHint(s)).toContain(`"${hint}"`);
      expect(formatCheckerHint(s)).toMatch(/still unresolved after a probe/);
    });
  });

  it('past the pointer, with no correction: unresolved', () => {
    const p = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 2 }, rows: [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null, pointerLine: 'How does that fit with labor at 22% of revenue?' })])] }));
    expect(p.selected).toBeNull();
    expect(p.decisions[0].outcome).toBe('unresolved');
  });

  it('under time pressure: a conclusion-changing error is corrected at once, a minor one shed', () => {
    expect(planCheckerFlags(input({ underTimePressure: true })).selected?.action).toBe('correct');
    const minor = planCheckerFlags(input({ underTimePressure: true, rows: [verdictRow(3, [vetted({ changesConclusion: false })])] }));
    expect(minor.selected).toBeNull();
    expect(minor.decisions[0].outcome).toBe('shed');
  });
});

describe('one checker probe per turn', () => {
  const minor = vetted({ changesConclusion: false, span: 'COGS falls to about 53%', candidateValue: '53%', codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, correctionLine: null, correctionFigure: null });
  it('conclusion-changing first; the rest wait', () => {
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [minor, vetted()])] }));
    expect(p.selected?.id).toBe('3:1');
    expect(p.handledNow).not.toContain('3:0');
  });
  it('none while code corrects a misquote this turn — one math line a turn (replay: Tyler b19 t17)', () => {
    const p = planCheckerFlags(input({ codeLineThisTurn: true }));
    expect(p.selected).toBeNull();
    expect(p.waiting).toHaveLength(1);
  });
  it('none while a deterministic flag fired on this message — it is the turn\'s probe', () => {
    const p = planCheckerFlags(input({ currentFlags: [{ kind: 'arithmetic', stepId: 'arith:16 / 18', description: '', expected: 0.89, candidateValue: 1.6, errorClass: 'case_breaking', span: '16 / 18 = 1.6%' }] }));
    expect(p.selected).toBeNull();
    expect(p.handledNow).toEqual([]);
  });
});

// Lorenzo, 13 Oct (Larkspur review, item 1): code's flag probes, never
// corrects — a claim it flagged comes back only as the checker's agreed
// correction (code's probe was the first attempt); without one it is a duplicate.
describe('dedupe with the deterministic checks — one probe per claim', () => {
  it('a code flag on the same message and key: dropped, logged — unless an agreed correction comes with it', () => {
    const noCorrection = planCheckerFlags(input({ rows: [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null })], { codeFlags: [{ key: 'pricing:gain@5', value: 5, span: 'recovers about 5 points' }] })] }));
    expect(noCorrection.selected).toBeNull();
    expect(noCorrection.decisions[0]).toEqual(expect.objectContaining({ outcome: 'dedupe' }));
    expect(noCorrection.handledNow).toContain('3:0');
    const agreed = planCheckerFlags(input({ rows: [verdictRow(3, [vetted()], { codeFlags: [{ key: 'pricing:gain@5', value: 5, span: 'recovers about 5 points' }] })] }));
    expect(agreed.selected).toMatchObject({ action: 'correct', attempt: 2, line: 'From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.' });
  });
  it("a figure code corrected as a misquote in the message: dropped (replay: Tyler b19 \"revenue grew about 19%\")", () => {
    const tyler = vetted({ span: 'Revenue grew about 19% over the period', candidateValue: '19%', correctValue: 15, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [tyler], { codeFlags: [{ key: 'misquote:revenue_growth', value: 19, span: 'Revenue grew about 19% over the period' }] })] }));
    expect(p.decisions[0].outcome).toBe('dedupe');
  });
  // Task 9 review (b28 Tyler 934653af t9): the gate holds code's "30%" flag when the checker's right
  // figure is the derived quantity's (10.5 points, not 25%) — so the checker's claim isn't deduped for it.
  it('a misquote flag the gate will hold (checker_disagrees) dedupes nothing: the checker\'s probe stands', () => {
    const beans = vetted({ span: 'Beans were 30% of COGS 2 years ago, so 0.30 × 42 = 12.6 points of revenue', candidateValue: '12.6 points (from 30% of COGS)', correctValue: 10.5, correctionLine: null, correctionFigure: null, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
    const ref = { key: 'misquote:bean_share_of_cogs', value: 30, span: 'were 30%', finding: { kind: 'misquote' as const, item: 'bean_share_of_cogs', cited: 'were 30%', sentence: 'Beans were 30% of COGS 2 years ago, so 0.30 × 42 = 12.6 points of revenue.' } };
    const rows = [verdictRow(3, [beans], { codeFlags: [ref] })];
    const held = planCheckerFlags(input({ rows, codeFigures: () => [25, 2] }));
    expect(held.decisions.find(d => d.id === '3:0')?.outcome).not.toBe('dedupe');
    expect(held.selected).toMatchObject({ id: '3:0', action: 'probe' });
    // …and where the gate releases code's line (the checker's right figure is code's), it still dedupes.
    expect(planCheckerFlags(input({ rows, codeFigures: () => [10.5, 25] })).decisions[0].outcome).toBe('dedupe');
    expect(planCheckerFlags(input({ rows })).decisions[0].outcome).toBe('dedupe');
  });
  // Engine-asks final review (19 Oct): with the gate's decisions given, only a
  // code flag the gate released — code's line said — dedupes the checker's claim;
  // one it ruled derived, not_rated, stale, expired or disagreeing leaves it standing.
  it.each(['derived', 'not_rated', 'stale', 'expired', 'checker_disagrees'] as const)('a code flag the gate ruled %s dedupes nothing: the checker\'s probe stands, no code probe counted', outcome => {
    const rows = [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null })], { codeFlags: [{ key: 'pricing:gain@5', value: 5, span: 'recovers about 5 points' }] })];
    const p = planCheckerFlags(input({ rows, gateOutcomes: { '3:code:0': outcome } }));
    expect(p.decisions.find(d => d.id === '3:0')?.outcome).not.toBe('dedupe');
    expect(p.selected).toMatchObject({ id: '3:0', action: 'probe', attempt: 1 });
  });
  it('a code flag the gate released still dedupes; one with no gate decision (never said) does not', () => {
    const rows = [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null })], { codeFlags: [{ key: 'pricing:gain@5', value: 5, span: 'recovers about 5 points' }] })];
    expect(planCheckerFlags(input({ rows, gateOutcomes: { '3:code:0': 'released' } })).decisions[0].outcome).toBe('dedupe');
    expect(planCheckerFlags(input({ rows, gateOutcomes: {} })).selected).toMatchObject({ id: '3:0', action: 'probe' });
  });
  it('matched by key when their figure is also a case figure ("about 40 points" — beans rose 40%)', () => {
    const forty = vetted({ span: 'about 40 points of margin erosion', candidateValue: 'about 40 points', correctValue: 16, correctionLine: null, correctionFigure: null, codeQuantity: { kind: 'step', stepId: 'cogs_dollar_impact', price: null, target: null } });
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [forty], { codeFlags: [{ key: 'cogs_dollar_impact@40', value: 40, span: 'x' }] })] }));
    expect(p.decisions[0].outcome).toBe('dedupe');
  });
  it('a code flag on the same figure (another key): never a second probe — the correction or nothing', () => {
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null })], { codeFlags: [{ key: 'arith:58 / 110', value: 5, span: 'about 5 points' }] })] }));
    expect(p.decisions[0].outcome).toBe('dedupe');
    const agreed = planCheckerFlags(input({ rows: [verdictRow(3, [vetted()], { codeFlags: [{ key: 'arith:58 / 110', value: 5, span: 'about 5 points' }] })] }));
    expect(agreed.selected?.action).toBe('correct');
  });
});

describe("the claim's own figures", () => {
  it('a word quantity carries none: its error is the words (replay: 0bfe5f38 t19 "fully explained", 4.2 and 11.8 correct)', () => {
    const fully = vetted({ span: 'The 18-point decline is fully explained by input inflation — 4.2 points from beans, 11.8 from other inputs', candidateValue: 'fully (4.2 + 11.8 = 16 points of the 18)', correctValue: 0.89, actualShare: 0.89, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [fully], { stamps: [{ stepId: 'bean_points_added', value: 4.2, span: 'x' }, { stepId: 'non_bean_points_added', value: 11.8, span: 'x' }] })] }));
    expect(p.droppedStamps).toEqual([]);
    expect(p.flaggedFigures).toEqual([]);
    expect(p.selected?.id).toBe('3:0');
  });
  it("a case figure in their value is a quote, not their figure (\"about 11% (6 + 5)\" — 6 is today's margin)", () => {
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [vetted({ candidateValue: 'about 11% (6 + 5)', codeQuantity: { kind: 'none', stepId: null, price: null, target: null } })])] }));
    expect([...p.flaggedFigures].sort()).toEqual([11, 5].sort());
  });
});

describe('a flag that waited too long expires (proposed: two later messages)', () => {
  it('raised on the first or second message after the claim; after that, expired — for the report', () => {
    const turnRows = [...input().turnRows, { turnIndex: 5, role: 'candidate' as const, text: 'Next, competitors.' }, { turnIndex: 6, role: 'interviewer' as const, text: 'Go on.' }];
    expect(planCheckerFlags(input({ turnRows, candidateTurnIndex: 7, candidateText: 'And the stores.' })).selected?.id).toBe('3:0');
    const longer = [...turnRows, { turnIndex: 7, role: 'candidate' as const, text: 'And the stores.' }, { turnIndex: 8, role: 'interviewer' as const, text: 'Go on.' }];
    const p = planCheckerFlags(input({ turnRows: longer, candidateTurnIndex: 9, candidateText: 'And the menu.' }));
    expect(p.selected).toBeNull();
    expect(p.decisions[0]).toEqual(expect.objectContaining({ id: '3:0', outcome: 'expired' }));
    expect(p.handledNow).toContain('3:0');
  });
});

describe('deterministic checks first', () => {
  it('a checker error on a stamped figure drops the stamp', () => {
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [vetted()], { stamps: [{ stepId: 'arith:58 / 110', value: 5, span: 'recovers about 5 points of margin' }] })] }));
    expect(p.droppedStamps).toEqual([expect.objectContaining({ value: 5, candidateTurnIndex: 3 })]);
  });
  it('a checker "correct" on a figure code flagged: logged, the code flag kept', () => {
    const right = vetted({ verdict: 'correct', flag: false, candidateValue: '1.6%', span: '16 / 18 = 1.6%' });
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [right], { codeFlags: [{ key: 'arith:16 / 18', value: 1.6, span: '16 / 18 = 1.6%' }] })] }));
    expect(p.decisions).toEqual([expect.objectContaining({ outcome: 'disagrees_with_code' })]);
    expect(p.selected).toBeNull();
  });
});

describe('the stale check — a late verdict on a claim since revised or withdrawn is dropped', () => {
  const claim = vetted();
  const stale = (text: string) => isStale(claim, [text], prof, COSTS);
  // A concession withdraws the claim the interviewer just questioned (Lorenzo, 14 Oct).
  const staleAfterProbe = (text: string) => isStale(claim, [{ text, questioned: true }], prof, COSTS);
  it.each([
    'Scratch that, I mis-sized the gain.',
    'Actually, a 10% rise is closer to 8.5 points once labor and overhead shrink too.',
    'Let me redo the price math.',
    "You're right, that's my error — I'll redo it.",
  ])('withdrawn or revised, answering a probe on it: %s', text => expect(staleAfterProbe(text)).not.toBeNull());
  it('the right figure stated since', () => expect(stale('So the gain is 8.5 points.')).not.toBeNull());
  it('the same pricing claim restated (same kind, same price)', () => expect(stale('A 10% price rise recovers 8 points of margin.')).not.toBeNull());
  it.each([
    'Next I would look at the competitive response.',
    'Actually, I would also look at competitors.',
    'A 15% price rise recovers more.',
    'A 15% price rise recovers about 12 points of margin.',  // another price: another claim
    // Replay, Sofia b20 140fb90d t13 and 3f57efeb t11: "actually" mid-sentence, a figure about something else.
    'That more than covers the 16-point move, which suggests beans may actually be a smaller part of the story than I assumed.',
    'Volume growth actually masked the problem on the top line, which is probably why it took 2 years to surface.',
  ])('not stale: %s', text => expect(stale(text)).toBeNull());
  it("the right figure doesn't count when it is also a case figure (16 is COGS's rise)", () => {
    const whole = vetted({ span: 'the whole 18 points sits in COGS', candidateValue: 'the whole 18 points', correctValue: 16, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
    expect(isStale(whole, ['COGS went up 16 points, from 42 to 58.'], prof, COSTS)).toBeNull();
  });
  // Lorenzo, 14 Oct (batch 24): a concession withdraws only the claim it answers —
  // the one the interviewer just questioned, or one whose figure it names.
  it.each([
    // Tyler b19 t15, after code corrected his "revenue grew 19%" — not the pricing claim.
    "You're right, that's my error — the prompt said 15% and I don't have a source for 19%.",
    // Owen e64de272 t15, about the competitor assumption.
    "You're right, I stated that as fact and it isn't — I don't have competitor pricing.",
    // Marisol 4bf008fd t19, redoing the bean share.
    'Fair point — the 25% was measured two years ago, so it belongs on the 42 base, not the 58. Let me redo it.',
    'Scratch that, I mis-sized the gain.',
  ])('a concession about something else withdraws nothing: %s', text => expect(stale(text)).toBeNull());
  it('a redo that states the claim\'s right figure answers it, even a case figure (Marisol 4bf008fd t19: "…16.0 points" answers her 22.1)', () => {
    const total = vetted({ span: 'Total input-driven increase: 5.8 plus 16.3 is 22.1 points', quantity: 'total input-driven COGS increase', candidateValue: '22.1 points', correctValue: 16, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
    expect(isStale(total, ['Let me redo it. Total input-driven increase: 4.2 plus 11.8 is 16.0 points.'], prof, COSTS)).not.toBeNull();
    expect(isStale(total, ['Total input-driven increase is 16 points.'], prof, COSTS)).toBeNull();   // 16 is a case figure: no concession, no drop
  });
  // Lorenzo, 15 Oct (batch-26 ruling 4): a redo withdraws a flag only if it restates the same quantity.
  it('Marisol 2456aa9d t7: "Let me redo it in dollars" about COGS does not withdraw her labor-dollars claim, though it says 15%', () => {
    const labor = vetted({ span: 'labor is flat, which means labor dollars held steady while revenue grew 15%', quantity: 'Labor dollars', candidateValue: 'held steady', correctValue: 15, unit: '% growth in labor dollars', codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
    const t7 = "Fair push — these are percentages of revenue, so the 42 and 58 move with revenue, not dollars. Let me redo it in dollars. Call revenue 100 two years ago, so COGS is 42. Revenue grows 15%, so current revenue is 115, and 58% of that is 66.7. So COGS dollars went 42 to 66.7, up 58.8%.";
    expect(isStale(labor, [t7], prof, COSTS)).toBeNull();
    // The quantity is read in the sentence that holds the figure, and "dollars" names no quantity.
    expect(isStale(labor, ['Labor is fine. Let me redo it in dollars: revenue grew 15%.'], prof, COSTS)).toBeNull();
    // A redo of the labor claim itself, to its right figure, still withdraws it.
    expect(isStale(labor, ['Let me redo it: labor dollars grew 15% too, in line with revenue.'], prof, COSTS)).not.toBeNull();
  });
  it('a right figure that is no case figure still answers a redo anywhere in the message', () => {
    expect(isStale(claim, ['Let me redo it. It comes to 8.5.'], prof, COSTS)).not.toBeNull();
  });
  it("the model's question on a claim whose figures are case figures questions it (1c9184cf t18 on \"a 16% lift\")", () => {
    const lift = vetted({ span: 'restoring the full 16 points would need roughly a 16% lift', candidateValue: '16%', correctValue: 20.5, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } });
    const p = planCheckerFlags(input({
      rows: [verdictRow(17, [lift])], handled: [],
      turnRows: [{ turnIndex: 17, role: 'candidate', text: 'Restoring the full 16 points would need roughly a 16% lift.' },
        { turnIndex: 18, role: 'interviewer', text: 'You said restoring the full 16 points would need roughly a 16% lift. Walk me through how you got from 16 points of margin to a 16% price increase.' }],
      candidateTurnIndex: 19, candidateText: 'Let me redo that — I think I was sloppy.', candidateFigures: [16],
    }));
    expect(p.decisions[0]).toMatchObject({ outcome: 'stale' });
  });
  it('a concession that names the claim\'s figure withdraws it, unasked', () => {
    expect(stale("Scratch that 5 points — I'll redo it.")).not.toBeNull();
  });
  it('drops the flag with the reason, handled', () => {
    const p = planCheckerFlags(input({ candidateText: 'Scratch that — the 5 points is too low.' }));
    expect(p.selected).toBeNull();
    expect(p.decisions[0].outcome).toBe('stale');
  });
  // Lorenzo, 15 Oct (batch-25 ruling 2): a fixed claim isn't probed or corrected again.
  describe('equivalent forms of the right figure, redos and more concessions (batch 25)', () => {
    const NONE = { kind: 'none' as const, stepId: null, price: null, target: null };
    const marcus = vetted({ span: 'they need something like a 15-20% effective price increase to get back toward 24%', candidateValue: '15-20%', correctValue: 24, correctionLine: 'From today\'s 6% margin, getting back to a 24% margin takes about a 23.7% price rise, not 15-20%.', correctionFigure: '23.7', codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } });
    const MARCUS_T9 = "Let me actually do it rather than hand-wave, because I think I was sloppy.\n\nSet revenue today at 100. Costs are 58 COGS, 22 labor, 14 overhead, total 94, profit 6. If I raise prices by x and volume holds, revenue becomes 100(1+x) and the dollar costs stay at 94. For a 24% margin I need 94/(1+x) = 76, so 1+x = 1.237 — about a 24% price increase, not 15-20%. I conflated the percentage-point gap with a price change, which isn't the same thing. So my earlier number was understated.";
    const owen = vetted({ span: "to recover the 16 points of COGS they'd need high-single-digit to low-double-digit price increases, phased", candidateValue: '~8-12%', correctValue: 20.5, correctionLine: null, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } });
    const OWEN_T15 = "Let me actually run it, because I think I was loose.\n\nTake revenue of 100 today: COGS 58, labor 22, overhead 14, profit 6. If I raise prices 10% and volume holds, revenue goes to 110 and costs stay at 94 in dollars, so profit is 16 — a 14.5% margin. Better, but not 24%.\n\nTo get back to 24%: (R − 94)/R = 0.24, so R = 94/0.76 = 123.7. That's roughly a 24% price increase. So my earlier range was wrong — I was anchoring on the 16 point gap without accounting for the fact that price flows straight to the bottom line. Call it high-teens to mid-twenties to fully restore, which is a much harder ask.";
    // Quantities as the checker wrote them in 0f7551c2 t13 (the rebased branch reads them since round-4 ruling 3).
    const marisol = vetted({ span: '22.1 points of input inflation against a 9.7-point gap means inflation over-explains by more than double.', quantity: 'over-explanation of COGS gap by inflation', candidateValue: '22.1 vs 9.7, more than double', correctValue: 16, correctionLine: null, codeQuantity: NONE });
    const MARISOL_T15 = "Ah — no, they're not. 48.3 is dollars on today's revenue of 115, but 58 is a percentage. I have to convert it: 58% of 115 is 66.7.\n\nSo the gap is 66.7 minus 48.3, which is 18.4 points of extra COGS dollars on an index where two years ago revenue was 100.\n\nNow against inflation: my 16.0 points of inflation came off the two-years-ago base of 42, so that's also in old dollars. Scaling it up by the 15% revenue growth gives 16.0 times 1.15, about 18.4. That matches the 18.4 gap almost exactly.";
    it('Marcus f8ed869d t9: "1+x = 1.237 — about a 24% price increase" answers his "15-20%" (no correction at t10)', () => {
      expect(isStale(marcus, [MARCUS_T9], prof, COSTS)).not.toBeNull();
    });
    it.each([
      'For a 24% margin I need 94/(1+x) = 76, so 1+x = 1.237.',       // the factor form read as 23.7%
      'That works out to about a 24% price increase.',                  // a case figure stated as the answer
      'So the menu needs to go up about 23.7%.',
    ])('the right figure, in another form: %s', text => expect(isStale(marcus, [text], prof, COSTS)).not.toBeNull());
    it('Owen d3db78c0 t15: the price redone for the 24% margin is a new claim; his "8-12%" is not re-asked at t16', () => {
      expect(isStale(owen, [OWEN_T15], prof, COSTS)).not.toBeNull();
      expect(isStale(owen, ["That's roughly a 24% price increase."], prof, COSTS)).toMatch(/another target|right figure/);
    });
    it('Marisol 0f7551c2 t15: "18.4" is her right 16 points on today\'s revenue — a redo on another base', () => {
      expect(isStale(marisol, [MARISOL_T15], prof, COSTS)).toMatch(/another base/);
    });
    it('Marisol 0f7551c2: her t15 redo answers the t13 gap (9.7) and what she built on it (6.3 = 16.0 − 9.7) — no probe of either at t16', () => {
      const T13 = 'So inflation accounts for 16 points of added cost, and the COGS gap I measured on a consistent base was 9.7. Inflation still over-explains, now by about 6.3 points rather than double. So the direction holds: input prices fully explain the COGS rise, and the client has clawed back roughly 6 points somewhere — probably procurement or mix.';
      const gap = vetted({ span: 'the COGS gap I measured on a consistent base was 9.7', quantity: 'COGS margin gap', candidateValue: '9.7 points', correctValue: 16, correctionLine: null, codeQuantity: NONE, probeLine: 'Walk me through how you got to 9.7 points.' });
      const over = vetted({ span: 'Inflation still over-explains, now by about 6.3 points ... the client has clawed back roughly 6 points somewhere', quantity: 'over-explanation of COGS gap by inflation', candidateValue: '6.3 points', correctValue: 0, correctionLine: null, codeQuantity: NONE, probeLine: 'Walk me through how you got to 6.3 points.' });
      const p = planCheckerFlags(input({
        rows: [verdictRow(13, [gap, over])],
        turnRows: [{ turnIndex: 13, role: 'candidate', text: T13 }, { turnIndex: 14, role: 'interviewer', text: 'Which revenue base is that 58 on, and is the 48.3 on the same base?' }],
        candidateTurnIndex: 15, candidateText: MARISOL_T15, candidateFigures: [9.7, 6.3],
      }));
      expect(p.selected).toBeNull();
      expect(p.decisions.map(d => [d.id, d.outcome])).toEqual([['13:0', 'stale'], ['13:1', 'stale']]);
      // A figure of the message that isn't built on the redone one stays open.
      const other = vetted({ span: 'beans added 5.8 points', candidateValue: '5.8 points', correctValue: 4.2, correctionLine: null, codeQuantity: NONE });
      const q = planCheckerFlags(input({
        rows: [verdictRow(13, [gap, other])],
        turnRows: [{ turnIndex: 13, role: 'candidate', text: `${T13} Beans added 5.8 points.` }, { turnIndex: 14, role: 'interviewer', text: 'Go on.' }],
        candidateTurnIndex: 15, candidateText: MARISOL_T15, candidateFigures: [9.7, 5.8],
      }));
      expect(q.selected?.id).toBe('13:1');
    });
    it('a price answer to the nearest point is the right figure ("about a 20%" for 20.5)', () => {
      const c = vetted({ span: 'a 22% margin needs about a 12% price rise', candidateValue: '12%', correctValue: 20.5, correctionLine: null, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 22 } });
      expect(isStale(c, ['So it takes about a 20% price increase.'], prof, COSTS)).toMatch(/right figure \(20\)/);
      expect(isStale(owen, ['A 24% price rise recovers the 18 points.'], prof, COSTS)).toBeNull();   // a scenario, not the answer
    });
    it('a rebased figure needs its base said (a bare "18.4" is no redo) — and, since round-4 ruling 3, its quantity named', () => {
      expect(isStale(marisol, ['Inflation is 18.4 points, and that is the story.'], prof, COSTS)).toBeNull();
      expect(isStale(marisol, ['Scaled to today\'s revenue, the COGS gap is 18.4 points.'], prof, COSTS)).not.toBeNull();
      expect(isStale(marisol, ['Scaled to today\'s revenue, that is 18.4 points.'], prof, COSTS)).toBeNull();   // names no quantity
    });
    it('built on: only on a figure answered, not restated; and a total of flagged figures is no operand', () => {
      const root = vetted({ span: 'Beans add 5.8 points of revenue to COGS', candidateValue: '5.8 points', correctValue: 4.2, correctionLine: null, codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null } });
      const rest = vetted({ span: 'so the rest is 10.2 points', candidateValue: '10.2 points', correctValue: 11.8, correctionLine: null, codeQuantity: NONE });
      const run = (claims: VettedClaim[], said: string, now: string) => planCheckerFlags(input({
        rows: [verdictRow(3, claims)], turnRows: [{ turnIndex: 3, role: 'candidate', text: said }, { turnIndex: 4, role: 'interviewer', text: 'Go on.' }],
        candidateTurnIndex: 5, candidateText: now, candidateFigures: [5.8, 10.2],
      }));
      // Restated (the step again, same error): the 10.2 built on it stays open — and, since R2 (19 Oct), so does the 5.8: the error stands.
      const restated = run([root, rest], 'Beans add 5.8 points of revenue to COGS. With COGS up 16, so the rest is 10.2 points.', 'Beans add 5.8 points of revenue to COGS, I am sure.');
      expect(restated.decisions.filter(d => d.outcome === 'stale')).toEqual([]);
      expect(restated.selected?.id).toBe('3:0');
      expect(restated.waiting.map(w => w.id)).toEqual(['3:1']);
      const other = vetted({ span: 'other inputs 16.3', candidateValue: '16.3 points', correctValue: 11.8, correctionLine: null, codeQuantity: NONE });
      const total = vetted({ span: 'together 22.1', candidateValue: '22.1 points', correctValue: 16, correctionLine: null, codeQuantity: NONE });
      // The 5.8 answered; 16.3 = 22.1 − 5.8, but 22.1 is the flagged total that adds them.
      const p = run([root, other, total], 'Beans 5.8 points, other inputs 16.3, together 22.1.', "You're right — let me redo it: beans add 4.2 points.");
      expect(p.decisions.find(d => d.id === '3:1')?.reason ?? 'none').not.toMatch(/built on/);
      // The answered figure must be beside the claim: 27.8 = 22 + 5.8 here is a coincidence.
      const far = vetted({ span: 'Everything else comes to 27.8 points', candidateValue: '27.8 points', correctValue: 12, correctionLine: null, codeQuantity: NONE });
      const q = run([root, far], 'Beans add 5.8 points of revenue to COGS. Labor is flat at 22. Everything else comes to 27.8 points.', "You're right — let me redo it: beans add 4.2 points.");
      expect(q.decisions.find(d => d.id === '3:1')?.reason ?? 'none').not.toMatch(/built on/);
    });
    it.each([
      'Let me actually run it, because I think I was loose.',
      'I was loose there.',
      'So my earlier range was wrong.',
      'My earlier estimate was off by a lot.',
      'I made the same mistake again — mixing percentage points of revenue with percent of a cost base.',
      'You\'re right to push — I was sloppy.',
    ])('a concession, answering a probe on it: %s', text => expect(isStale(owen, [{ text, questioned: true }], prof, COSTS)).not.toBeNull());
    it.each([
      ['a scenario price, not the answer', owen, 'A 15% price increase recovers most of it.'],
      ['a scenario price, not the answer', marcus, 'A 10% price rise gets us to about 14.5%.'],
      ['the margin itself, not a price answer', marcus, 'The margin was 24% two years ago.'],
      ['a concession, unasked and naming nothing', owen, 'I think I was loose on the competitor point.'],
      ['the wrong figure itself on another base', marisol, 'Inflation is 22.1 points against a 9.7-point gap.'],
    ] as [string, VettedClaim, string][])('not stale — %s: %s', (_, c, text) => expect(isStale(c, [text], prof, COSTS)).toBeNull());
  });
  // Lorenzo, 19 Oct (round-4 ruling 3): a figure closes a flag as stale only
  // when it is stated for the claim's own quantity — the 15 Oct redo rule
  // applied to the stale check.
  describe("a figure closes a flag only when stated for the claim's own quantity (b33 Blake cb23e17b t17)", () => {
    const blake = vetted({
      span: 'A 10–12% price increase on a flat cost base recovers roughly 6 to 7 points of margin', quantity: 'Margin points recovered by a 10–12% price rise at flat costs',
      candidateValue: '6 to 7 points', correctValue: null, correctLow: 8.5, correctHigh: 10.1, unit: 'percentage points', changesConclusion: false,
      codeQuantity: { kind: 'gain', stepId: null, price: 12, target: null }, correctionLine: null, correctionFigure: null,
    });
    const BLAKE_T19 = "The single biggest risk is that the price increase doesn't stick — that volume falls more than I've assumed. My whole recommendation rests on a 2–3% volume loss against a 10–12% price increase, and that number is a benchmark, not something we've tested on this customer base. If elasticity is actually closer to one, I lose the entire margin recovery and I've also lost traffic, which is much harder to win back than price is to roll back.\n\nMitigation is the pilot. Three to five markets, representative mix of urban and suburban, run it for eight to twelve weeks, measure transaction counts and ticket size against matched control stores. If volume holds, roll national. If it doesn't, I shift weight onto procurement and the non-dairy surcharge, which don't carry the same traffic risk.\n\nThe second-order risk is that input costs keep climbing eight points a year, in which case pricing is a treadmill and the real fix is contract hedging.";
    it('t19: the "10" of "a 10–12% price increase" is the price, not the gain — the flag stays open', () => {
      expect(isStale(blake, [BLAKE_T19], prof, COSTS)).toBeNull();
    });
    it('the price said again in a sentence naming the gain is still its input, not the gain', () => {
      expect(isStale(blake, ['A 10–12% price increase gets most of the margin back.'], prof, COSTS)).toBeNull();
    });
    it('an unasked concession beside the price withdraws nothing: the price is no redo of the gain', () => {
      expect(isStale(blake, ['I was loose on elasticity. My plan still rests on a 10–12% price increase.'], prof, COSTS)).toBeNull();
    });
    it('a true redo, the right figure in a sentence naming the quantity: stale', () => {
      expect(isStale(blake, ['On a flat cost base the margin gain is really 8.5 to 10 points.'], prof, COSTS)).toMatch(/right figure \(8\.5\)/);
      // b33 Sofia f86f6530 t17, verbatim: her 10% price rise redone to 8.5 points of margin.
      const sofia = vetted({ span: 'A 10% price increase recovers about 25 percentage points of revenue against that bean exposure alone', quantity: 'margin points recovered by a 10% price rise (versus bean exposure)', candidateValue: 'about 25 percentage points of revenue', correctValue: 8.5, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } });
      expect(isStale(sofia, ['So a 10% increase recovers about 8.5 points of margin, taking us from 6% to roughly 14.5%. Not all the way back to 24% — that would need closer to a 22% price rise.'], prof, COSTS)).toMatch(/right figure \(8\.5\)/);
    });
    it('b33 Marisol 31e33506 t11/t17: "11.8%" as a margin is no redo of her other-inputs claim (right 11.8 points)', () => {
      const other = vetted({ span: 'Everything else up 37.5%... call it roughly 2 points each', quantity: "Other inputs' contribution to the COGS increase", candidateValue: 'about 2 points each, ~6 total', correctValue: 11.8, codeQuantity: { kind: 'step', stepId: 'non_bean_points_added', price: null, target: null } });
      expect(isStale(other, ['Beans are 5.8 points of the 16-point COGS increase. If we could hold bean costs at the old level, margin goes from 6% to roughly 11.8% — so call it 12%.'], prof, COSTS)).toBeNull();
      expect(isStale(other, ['I took the 5.8 points and added it straight onto the current 6% margin, which got me to 11.8%, call it 12%.'], prof, COSTS)).toBeNull();
      // Said for the other inputs, it is the redo.
      expect(isStale(other, ['The other inputs add 11.8 points.'], prof, COSTS)).toMatch(/right figure \(11\.8\)/);
    });
    it('a needed claim: its right figure said bare, for another quantity, closes nothing; as the price answer it does', () => {
      const needed = vetted({ span: 'they need something like a 15-20% effective price increase to get back toward 24%', quantity: 'price increase needed to restore a 24% margin', candidateValue: '15-20%', correctValue: 23.7, correctionLine: null, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } });
      expect(isStale(needed, ['Their COGS dollars grew 23.7% over the period.'], prof, COSTS)).toBeNull();
      expect(isStale(needed, ['So the menu needs to go up about 23.7%.'], prof, COSTS)).not.toBeNull();
    });
  });
  it('a math step restated since at another figure (R2, 19 Oct: at the same figure the error stands)', () => {
    const step = vetted({ span: '10 percentage points of revenue', candidateValue: '10 percentage points', correctValue: 4.2, codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null } });
    expect(isStale(step, ['Beans add 7.5 points of revenue to COGS.'], prof, COSTS)).toMatch(/^restated at 7.5/);
    expect(isStale(step, ['Beans add 6 points of revenue to COGS.'], prof, COSTS)).toBeNull();   // 6 is today's margin: a case figure (review M2)
    expect(isStale(step, ['Beans add 10 points of revenue to COGS.'], prof, COSTS)).toBeNull();
  });
});

describe('a model probe on the claim', () => {
  it('a request for the working or a doubt naming their figure counts; a question about something else does not', () => {
    expect(modelProbed(vetted(), ['Walk me through how you got to 5 points.'], [5, 10])).toBe(true);
    expect(modelProbed(vetted(), ['Are you sure about that 5?'], [5, 10])).toBe(true);
    expect(modelProbed(vetted(), ['What would you look at next?'], [5, 10])).toBe(false);
    // The price change is the claim's input, not its figure.
    const withPrice = vetted({ candidateValue: 'a 10% rise gives 5 points' });
    expect(modelProbed(withPrice, ['How did you get to 10%?'], [5, 10])).toBe(false);
    expect(modelProbed(withPrice, ['How did you get to 5 points?'], [5, 10])).toBe(true);
  });
});

describe('the hint the interviewer model gets', () => {
  it('probe, correction and pointer lines — said as written, no figure of its own', () => {
    const p = planCheckerFlags(input())!.selected!;
    expect(formatCheckerHint(p)).toMatch(/^MATH CHECK FLAG/);
    expect(formatCheckerHint(p)).toContain(`"${vetted().probeLine}"`);
    expect(formatCheckerHint(p)).toMatch(/Do not correct it or say the right figure/);
    const c = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 } })).selected!;
    expect(formatCheckerHint(c)).toMatch(/overrides the no-correction rule/);
    expect(formatCheckerHint(c)).toContain('"From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5."');
  });
});

describe('the background check', () => {
  const base = {
    caseData: prof, candidateTurnIndex: 3, config: { model: 'claude-sonnet-5-5', effort: 'medium' as const },
    input: { revealedIds: COSTS, shownExhibitIds: [], transcript: [], message: 'A 10% price increase recovers about 5 points.' },
    vet: { caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: ['A 10% price increase recovers about 5 points.'] },
    codeMath: { flags: [], reportOnly: [], verified: [], arithmetic: [], units: { flags: [], verified: [] }, pricing: [] },
  };
  const raw = (): CheckerClaim => { const { flag: _f, probeLine: _p, correctionLine: _c, correctionFigure: _g, pointerLine: _q, vetNotes: _v, ...c } = vetted(); void _f; void _p; void _c; void _g; void _q; void _v; return { ...c, probe: 'How did you get 5 points?' }; };

  it('a verdict: the claims vetted at the message, the code flags (misquotes too) and stamps of the message', async () => {
    const job = startMathCheck({ ...base, misquotes: [{ item: 'revenue_growth', cited: 'grew about 19%', sentence: 'Revenue grew about 19%.' }], check: async () => ({ claims: [raw()], model: 'claude-sonnet-5-5', latencyMs: 5000, stopReason: 'end_turn' }) });
    const r = await job.result;
    expect((r.payload as VerdictPayload).codeFlags).toEqual([{ key: 'misquote:revenue_growth', value: 19, span: 'Revenue grew about 19%.', finding: { kind: 'misquote', item: 'revenue_growth', cited: 'grew about 19%', sentence: 'Revenue grew about 19%.' } }]);
    expect(r.subtype).toBe('verdict');
    const v = r.payload as VerdictPayload;
    expect(v.candidateTurnIndex).toBe(3);
    expect(v.claims[0].flag).toBe(true);
    expect(v.claims[0].correctionLine).toBe('From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.');
  });

  it("code's flags are keyed by step and claimed value, as the checker keys its claims", async () => {
    const codeMath = { ...base.codeMath, flags: [{ kind: 'step' as const, stepId: 'cogs_dollar_impact', description: '', expected: 76.8, candidateValue: 40, errorClass: 'case_breaking' as const, span: 'about 40 points' }] };
    const r = await startMathCheck({ ...base, codeMath, check: async () => ({ claims: [raw()], model: 'm', latencyMs: 1, stopReason: 'end_turn' }) }).result;
    expect((r.payload as VerdictPayload).codeFlags).toEqual([{ key: 'cogs_dollar_impact@40', value: 40, span: 'about 40 points', finding: { kind: 'flag', flag: codeMath.flags[0] } }]);
  });

  it('an error or a timeout resolves to an error row — never a rejection', async () => {
    const failed = await startMathCheck({ ...base, check: async () => { throw new Error('overloaded'); } }).result;
    expect(failed).toEqual(expect.objectContaining({ subtype: 'error', payload: expect.objectContaining({ error: 'overloaded', timedOut: false }) }));
    const slow = await startMathCheck({ ...base, timeoutMs: 20, check: ({ signal }) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))) }).result;
    expect(slow).toEqual(expect.objectContaining({ subtype: 'error', payload: expect.objectContaining({ timedOut: true }) }));
  });

  it('abort stops the call (a cancelled turn)', async () => {
    let aborted = false;
    const job = startMathCheck({ ...base, check: ({ signal }) => new Promise((_, reject) => signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); })) });
    job.abort();
    await job.result;
    expect(aborted).toBe(true);
  });
});

describe('the live config', () => {
  it('Sonnet 5.5 at medium by default; off by switch', () => {
    expect(liveCheckerConfig({})).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' });
    expect(liveCheckerConfig({ MATH_CHECKER_CONFIG: 'off' })).toBeNull();
    expect(() => liveCheckerConfig({ MATH_CHECKER_CONFIG: 'nope' })).toThrow();
  });
});

// Lorenzo, 13 Oct (Step 4, Jordan 099f33e9 t8–t22: "about 40 points", "~40
// points", "38–40% growth" — probed seven times, never corrected): a restated
// error is the same flag, matched by the candidate's own figures; the model's
// own probes of those figures count; after two probes code's correction once,
// else the report — and the case moves on.
describe('one flag per error, across messages', () => {
  const none = { kind: 'none' as const, stepId: null, price: null, target: null };
  const forty = (n: number, value: string, over: Partial<VettedClaim> = {}) => verdictRow(n, [vetted({
    span: `${value} of margin erosion from COGS`, candidateValue: value, quantity: 'margin erosion from COGS', codeQuantity: none,
    probeLine: `You said ${value}. How did you get there?`, correctionLine: null, correctionFigure: null, pointerLine: null, ...over,
  })]);
  const rows = (...xs: { turnIndex: number; role: string; text: string }[]) => [{ turnIndex: 0, role: 'interviewer', text: 'Your client is Brew & Bean.' }, ...xs];
  const KEY = 'checker:about 40 points';
  const seen = { [KEY]: { figures: [40], since: 3 } };

  it('a restated figure joins the flag it restates, and its count carries', () => {
    const p = planCheckerFlags(input({
      rows: [forty(3, 'about 40 points'), forty(5, '~40 points', { pointerLine: 'How does 40 fit with COGS going from 42 to 58?' })], handled: ['3:0'],
      attempts: { [KEY]: 1 }, keys: seen,
      turnRows: rows({ turnIndex: 3, role: 'candidate', text: 'About 40 points of erosion from COGS.' }, { turnIndex: 4, role: 'interviewer', text: 'You said about 40 points. How did you get there?' },
        { turnIndex: 5, role: 'candidate', text: 'The ~40 points is the gross pressure.' }, { turnIndex: 6, role: 'interviewer', text: 'Go on.' }),
      candidateTurnIndex: 7, candidateText: 'Next, the bean split.', candidateFigures: [40],
    }));
    expect(p.selected).toMatchObject({ id: '5:0', key: KEY, attempt: 2, action: 'pointer' });
  });

  it("the model's own probes of the figure count: after two, with no correction, it goes to the report and the flag closes", () => {
    const p = planCheckerFlags(input({
      rows: [forty(3, 'about 40 points'), forty(5, '~40 points')], handled: ['3:0'], attempts: { [KEY]: 1 }, keys: seen,
      turnRows: rows({ turnIndex: 3, role: 'candidate', text: 'About 40 points of erosion from COGS.' }, { turnIndex: 4, role: 'interviewer', text: 'You said about 40 points. How did you get there?' },
        { turnIndex: 5, role: 'candidate', text: 'The ~40 points is the gross pressure.' }, { turnIndex: 6, role: 'interviewer', text: 'Why would the exposure be 40 points rather than 16?' }),
      candidateTurnIndex: 7, candidateText: 'Next, the bean split.', candidateFigures: [40],
    }));
    expect(p.selected).toBeNull();
    expect(p.decisions).toEqual([expect.objectContaining({ id: '5:0', outcome: 'unresolved', key: KEY, reason: expect.stringMatching(/attempt 3\b.*report/) })]);
    expect(p.closedNow).toEqual([KEY]);
  });

  it('after two probes, a correction code can write is said — once', () => {
    const line = 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.';
    const p = planCheckerFlags(input({
      rows: [forty(3, 'about 40 points'), forty(5, '~40 points', { correctionLine: line, correctionFigure: '16' })], handled: ['3:0'], attempts: { [KEY]: 2 }, keys: seen,
      turnRows: rows({ turnIndex: 3, role: 'candidate', text: 'About 40 points.' }, { turnIndex: 5, role: 'candidate', text: 'The ~40 points.' }),
      candidateTurnIndex: 7, candidateText: 'Next.', candidateFigures: [40],
    }));
    expect(p.selected).toMatchObject({ key: KEY, attempt: 3, action: 'correct', line });
  });

  it('a closed flag stays closed: the restated claim goes to the report with no probe', () => {
    const p = planCheckerFlags(input({
      rows: [forty(9, 'roughly 40 (points of margin pressure)')], keys: seen, closed: [KEY],
      turnRows: rows({ turnIndex: 9, role: 'candidate', text: 'Roughly 40 points of pressure.' }), candidateTurnIndex: 11, candidateText: 'So, pricing.', candidateFigures: [40],
    }));
    expect(p.selected).toBeNull();
    expect(p.decisions).toEqual([expect.objectContaining({ outcome: 'unresolved', key: KEY, reason: expect.stringMatching(/closed/) })]);
  });

  it('an imperative ask about the figure counts as a probe ("Walk me through how those two figures relate." — Jordan t6)', () => {
    const p = planCheckerFlags(input({
      rows: [forty(3, 'about 40 points')], keys: {},
      turnRows: rows({ turnIndex: 3, role: 'candidate', text: 'About 40 points of erosion from COGS.' }, { turnIndex: 4, role: 'interviewer', text: 'You said about 40 points of erosion. Walk me through how those two figures relate.' }),
      candidateTurnIndex: 5, candidateText: 'It is the gross pressure.', candidateFigures: [40],
    }));
    expect(p.decisions[0]).toMatchObject({ outcome: 'unresolved', reason: expect.stringMatching(/attempt 2/) });
  });

  it('a different figure is a different flag', () => {
    const p = planCheckerFlags(input({ rows: [forty(5, 'about 22 points')], keys: seen, turnRows: rows({ turnIndex: 5, role: 'candidate', text: 'About 22 points.' }), candidateTurnIndex: 7, candidateText: 'Next.', candidateFigures: [22] }));
    expect(p.selected).toMatchObject({ key: 'checker:about 22 points', attempt: 1, action: 'probe' });
    expect(p.keys['checker:about 22 points']).toEqual({ figures: [22], since: 5 });
  });
});

// Larkspur (13 Oct, replay): Jordan 9ab76a39's recommendation heard "Before
// we wrap up — walk me through how you got to 2." — a closed flag on "two
// separate effects" matched his correct "$2M in year one".
describe('a closed error in the recommendation: the same unit, never a bare number', () => {
  const row = (key: string, candidateValue: string): CheckerRow => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 5, payloadJsonb: { id: '3:0', candidateTurnIndex: 3, outcome: 'unresolved', reason: 'left for the report', span: '', candidateValue, key, changesConclusion: true } });
  it('a claim with no unit matches nothing ("two separate effects" vs "$2M")', () => {
    const k = 'checker:two separate effects';
    expect(closedErrorRestated('Worth $2M in year one at a 60% ramp.', [k], { [k]: { figures: [2], since: 3 } }, [row(k, 'revenue loss and contribution loss are two separate effects')])).toBeNull();
    expect(closedErrorRestated('Exit the two contested routes.', [k], { [k]: { figures: [2], since: 3 } }, [row(k, 'revenue loss and contribution loss are two separate effects')])).toBeNull();
  });
  it('money matches money: "$48M" again is the closed $48M', () => {
    const k = 'checker:$48m';
    expect(closedErrorRestated('Damage I size at $48M of lost margin.', [k], { [k]: { figures: [48], since: 3 } }, [row(k, '$48M')])).toMatchObject({ key: k, said: '$48M' });
    expect(closedErrorRestated('Fares fell 48% on Lakeport.', [k], { [k]: { figures: [48], since: 3 } }, [row(k, '$48M')])).toBeNull();
  });
  it('a hyphenated figure is said whole (Jordan 78c89dba t16: "walk me through how you got to 38-point.")', () => {
    const k = 'checker:38 points';
    expect(closedErrorRestated('Menu prices have not moved, so the client absorbed a 38-point cost shock in full.', [k], { [k]: { figures: [38], since: 5 } }, [row(k, '38 points')])).toMatchObject({ said: '38 points' });
  });
  it('a figure said in words matches it in digits ("forty points" closed, "40 points" again)', () => {
    const k = 'checker:forty points';
    expect(closedErrorRestated('It carries about 40 points of pressure.', [k], { [k]: { figures: [40], since: 3 } }, [row(k, 'forty points')])).toMatchObject({ said: '40 points' });
  });
  // Lorenzo, 19 Oct (round-3 ruling 2; b29 Jordan ea27d1f6 t20, the conversion line a third time): a correction is
  // said at most twice — a key restated already, or one whose correction is a restated key's line word for word, gets
  // no re-correction in the recommendation; another closed key still does.
  describe('a correction said twice already is not said again', () => {
    const L = 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.';
    const fixed = (key: string, candidateValue: string, line: string): CheckerRow => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 5, payloadJsonb: { id: `${key}:0`, candidateTurnIndex: 3, outcome: 'correct', reason: 'attempt 2', span: '', candidateValue, key, changesConclusion: true, line } });
    const k40 = 'checker:~40 points', k48 = 'checker:$48m';
    const keys = { [k40]: { figures: [40], since: 3 }, [k48]: { figures: [48], since: 3 } };
    const rows = [fixed(k40, '~40 points', L), fixed(k48, '$48M', 'Lost margin is about $30M, not $48M.')];
    const TEXT = 'COGS carries about 40 points, and I size the damage at $48M.';
    it('not spent: the first closed key said again', () => expect(closedErrorRestated(TEXT, [k40, k48], keys, rows)).toMatchObject({ key: k40, correction: L }));
    it('its key restated already: skipped, the next closed key found', () => {
      expect(closedErrorRestated(TEXT, [k40, k48], keys, rows, { restated: [k40] })).toMatchObject({ key: k48 });
      expect(closedErrorRestated(TEXT, [k40], keys, rows, { restated: [k40] })).toBeNull();
    });
    it('its line said twice already (per line): skipped', () => {
      expect(closedErrorRestated(TEXT, [k40, k48], keys, rows, { said: { [lineKey(L)]: 2 } })).toMatchObject({ key: k48 });
      expect(closedErrorRestated(TEXT, [k40, k48], keys, rows, { said: { [lineKey(L)]: 1 } })).toMatchObject({ key: k40 });
    });
    it("another key restated with the same line (b29: the root's restatement covered \"~40 points\"): skipped", () => {
      const spent = { restated: ['cogs_dollar_impact@38'], corrected: { 'cogs_dollar_impact@38': { line: L, figure: '16' } } };
      expect(closedErrorRestated(TEXT, [k40, k48], keys, rows, spent)).toMatchObject({ key: k48 });
      expect(closedErrorRestated(TEXT, [k40, k48], keys, rows, { ...spent, corrected: { 'cogs_dollar_impact@38': { line: 'Another line.' } } })).toMatchObject({ key: k40 });
    });
  });
});

// Lorenzo, 15 Oct (batch-25 ruling 8; Jasmine f4fcab5b): a later "correct"
// verdict closes an open flag only when code's own figure for the flag's
// quantity agrees with it — the agreement rule of corrections (3% or 0.5).
describe('a later "correct" verdict closes an open flag only if code agrees', () => {
  const gain12 = { kind: 'gain' as const, stepId: null, price: 12, target: null };
  const third = vetted({ span: 'roll a 10-12% increase across core drinks after a short pilot, which closes maybe a third of the 18-point gap', candidateValue: 'about one third (about 6 points)', correctValue: 10.1, codeQuantity: gain12,
    probeLine: 'You said a 10-12% price increase closes maybe a third of the 18-point gap. How did you get that, and what base did you measure it against?',
    correctionLine: 'From today\'s 6% margin, a 12% price rise lifts margin about 10.1 points, not 6.', correctionFigure: '10.1' });
  const restated = (correctValue: number) => vetted({ flag: false, verdict: 'correct', span: '~6 points recovered out of 18 — a third', candidateValue: '6 points, one third', correctValue, codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, probeLine: null, correctionLine: null, correctionFigure: null });
  const run = (later: VettedClaim, closed: string[] = []) => planCheckerFlags(input({
    rows: [verdictRow(17, [third]), { category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 19, payloadJsonb: { id: '17:0', candidateTurnIndex: 17, outcome: 'probe', reason: 'attempt 1', span: third.span, candidateValue: third.candidateValue, key: 'pricing:gain', changesConclusion: true, line: third.probeLine } }, verdictRow(21, [later])],
    handled: ['17:0'], keys: { 'pricing:gain': { figures: [6, 1 / 3], since: 17 } }, attempts: { 'pricing:gain': 1 }, closed,
    turnRows: [
      { turnIndex: 17, role: 'candidate', text: 'Price first — roll a 10-12% increase across core drinks after a short pilot, which closes maybe a third of the 18-point gap.' },
      { turnIndex: 20, role: 'interviewer', text: third.probeLine! },
      { turnIndex: 21, role: 'candidate', text: 'Rough: at 12% higher revenue with COGS dollars fixed, COGS as a percent of revenue falls from 58 to about 58/1.12 ≈ 52, so ~6 points recovered out of 18 — a third.' },
      { turnIndex: 22, role: 'interviewer', text: 'What would you need to see from the pilot?' },
    ],
    candidateTurnIndex: 23, candidateText: 'Transaction counts in the pilot stores.', candidateFigures: [6],
  }));
  it('Jasmine t21: "~6 points out of 18 — a third" judged correct (6.2) while code computes 10.1 — the flag stays open: its correction', () => {
    const p = run(restated(6.2));
    expect(p.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ id: '21:0', outcome: 'disagrees_with_code' })]));
    expect(p.selected).toMatchObject({ id: '17:0', action: 'correct', line: 'From today\'s 6% margin, a 12% price rise lifts margin about 10.1 points, not 6.' });
  });
  it('when code agrees with the later verdict, it closes the flag as before', () => {
    expect(run(restated(10)).selected).toBeNull();
  });
  it('a flag already closed (corrected, or left for the report) stays closed', () => {
    expect(run(restated(6.2), ['pricing:gain']).selected).toBeNull();
  });
  it('a correct claim of another named quantity, with the same figure, is no restatement', () => {
    const other = vetted({ flag: false, verdict: 'correct', span: 'six points is what the overhead line would need', candidateValue: '6 points', correctValue: 6, codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null }, probeLine: null, correctionLine: null });
    expect(run(other).selected).toBeNull();
  });
  it("a correct claim sharing only an input figure isn't a restatement (Fiona 52743bea t11: \"10.5\" against her flagged \"3.7 points (10.5 to 14.2)\")", () => {
    const flagged = vetted({ span: 'The remaining gap, 58 minus 54.3, is 3.7 points on beans, taking them from 10.5 to 14.2', candidateValue: '3.7 points (10.5 to 14.2)', correctValue: 4.2, codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null } });
    const share = vetted({ flag: false, verdict: 'correct', span: 'Beans at 25% of 42 points, so 10.5 points of revenue', candidateValue: '10.5', correctValue: 10.5, codeQuantity: { kind: 'step', stepId: 'bean_share_of_revenue', price: null, target: null }, probeLine: null, correctionLine: null });
    const p = planCheckerFlags(input({
      rows: [verdictRow(7, [flagged]), verdictRow(11, [share])], handled: ['7:0'], keys: { 'bean_points_added@3.7': { figures: [3.7, 10.5, 14.2], since: 7 } },
      turnRows: [{ turnIndex: 7, role: 'candidate', text: flagged.span }, { turnIndex: 8, role: 'interviewer', text: 'Go on.' }, { turnIndex: 11, role: 'candidate', text: share.span }, { turnIndex: 12, role: 'interviewer', text: 'Go on.' }],
      candidateTurnIndex: 13, candidateText: 'Do we have the bean price?', candidateFigures: [3.7, 10.5],
    }));
    expect(p.decisions.find(d => d.id === '11:0')).toBeUndefined();
    // …the same with the quantity unnamed: only the shared input figure links them.
    const q = planCheckerFlags(input({
      rows: [verdictRow(7, [flagged]), verdictRow(11, [{ ...share, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } }])], handled: ['7:0'], keys: { 'bean_points_added@3.7': { figures: [3.7, 10.5, 14.2], since: 7 } },
      turnRows: [{ turnIndex: 7, role: 'candidate', text: flagged.span }, { turnIndex: 8, role: 'interviewer', text: 'Go on.' }, { turnIndex: 11, role: 'candidate', text: share.span }, { turnIndex: 12, role: 'interviewer', text: 'Go on.' }],
      candidateTurnIndex: 13, candidateText: 'Do we have the bean price?', candidateFigures: [3.7, 10.5],
    }));
    expect(q.decisions.find(d => d.id === '11:0')).toBeUndefined();
  });
});

// Lorenzo, 14 Oct (batch 24, Owen e64de272 and Marisol 4bf008fd): in a turn, the
// claim the interviewer just questioned is the one a concession answers — the
// checker line delivered on that interviewer turn; another open claim stays open.
describe('a concession withdraws only the claim it answers', () => {
  const none = { kind: 'none' as const, stepId: null, price: null, target: null };
  const bean = vetted({ span: 'Beans are 58 times 0.25, so 14.5 points', candidateValue: '14.5 points', quantity: 'bean points of revenue', correctValue: 10.5, codeQuantity: none, probeLine: 'Which year\'s COGS did you apply the 25% share to?' });
  const price = vetted({ span: '16 on a base of 58 is around 27.6%', candidateValue: 'about 27.6%', quantity: 'price rise to restore COGS ratio', correctValue: 38, codeQuantity: none, probeLine: 'What base did you divide the 16 by?' });
  const probeRow = (n: number, id: string, key: string): CheckerRow => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: n,
    payloadJsonb: { id, candidateTurnIndex: 15, outcome: 'probe', reason: 'attempt 1', span: '', candidateValue: '14.5 points', key, changesConclusion: true, line: bean.probeLine } });
  it("Marisol t19: \"Let me redo it.\" withdraws the probed bean claim, not her 27.6%", () => {
    const p = planCheckerFlags(input({
      rows: [verdictRow(15, [bean]), verdictRow(17, [price]), probeRow(17, '15:0', 'checker:14.5 points')], handled: [],
      turnRows: [{ turnIndex: 15, role: 'candidate', text: 'Beans are 58 times 0.25, so 14.5 points.' }, { turnIndex: 16, role: 'interviewer', text: 'What would you look at next?' },
        { turnIndex: 17, role: 'candidate', text: '16 on a base of 58 is around 27.6%.' }, { turnIndex: 18, role: 'interviewer', text: "Which year's COGS did you apply the 25% share to?" }],
      candidateTurnIndex: 19, candidateText: 'Fair point — the 25% was measured two years ago, so it belongs on the 42 base, not the 58. Let me redo it.', candidateFigures: [14.5, 27.6],
    }));
    expect(p.decisions.find(d => d.id === '15:0')).toMatchObject({ outcome: 'stale' });
    expect(p.decisions.find(d => d.id === '17:0')?.outcome).not.toBe('stale');
  });
});

// The gate on code's own lines (Lorenzo, 16 Oct; batch 29 Marisol t15): a code
// finding on message 3 is said only once message 3's verdict flags that claim.
describe('gateCodeFindings', () => {
  const WRONG = 'A 10% price increase recovers about 5 points of margin.';
  const pricing = { kind: 'pricing' as const, stepId: 'pricing:gain', description: '', expected: 8.5, candidateValue: 5, errorClass: 'case_breaking' as const, span: WRONG };
  const MISQ = { item: 'cogs_pct', cited: 'to 61%', sentence: 'COGS went from 42% to 61%.' };
  const refs = codeFlagRefs({ flags: [pricing] }, [MISQ]);
  const turnRows = [{ turnIndex: 3, role: 'candidate', text: WRONG }, { turnIndex: 4, role: 'interviewer', text: 'What would you look at next?' }];
  const gate = (claims: VettedClaim[], o: { now?: string; at?: number; rows?: { turnIndex: number; role: string; text: string }[]; handled?: string[]; final?: boolean; held?: string[] } = {}) => gateCodeFindings({
    rows: [verdictRow(3, claims, { codeFlags: refs })], handled: o.handled ?? [], held: o.held, turnRows: o.rows ?? turnRows, candidateText: o.now ?? 'Next I would look at competitors.',
    candidateTurnIndex: o.at ?? 5, caseData: prof, revealedIds: COSTS, finalAnswer: o.final ? () => true : undefined,
    codeFigures: (f: { kind: string }) => (f.kind === 'misquote' ? [58, 42, 16] : null),
  });
  const MISQ_FLAG = vetted({ span: '61%', candidateValue: '61%', correctValue: 58, errorType: 'misquote', codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });

  it('both flagged by the checker: released, each once', () => {
    const g = gate([vetted(), MISQ_FLAG]);
    expect(g.released.map(r => r.id)).toEqual(['3:code:0', '3:code:1']);
    expect(g.decisions.map(d => d.outcome)).toEqual(['released', 'released']);
    expect(gate([vetted(), MISQ_FLAG], { handled: ['3:code:0', '3:code:1'] }).decisions).toEqual([]);
  });
  it('not before the verdict lands: the message\'s own turn decides nothing', () => {
    expect(gate([vetted()], { at: 3, rows: [] }).decisions).toEqual([]);
  });
  it('rated correct: dropped as checker_correct', () => {
    const g = gate([vetted({ verdict: 'correct', flag: false })]);
    expect(g.released).toEqual([]);
    expect(g.decisions[0]).toMatchObject({ id: '3:code:0', outcome: 'checker_correct' });
  });
  it('not rated (no claim on the figure, unverifiable, low confidence, a flag the vetting dropped): dropped as not_rated', () => {
    expect(gate([]).decisions.map(d => d.outcome)).toEqual(['not_rated', 'not_rated']);
    expect(gate([vetted({ verdict: 'error', confidence: 'low', flag: false })]).decisions[0]).toMatchObject({ outcome: 'not_rated' });
  });
  it('a misquote line needs the checker\'s right figure among the data line\'s (or its change): else checker_disagrees', () => {
    expect(gate([MISQ_FLAG]).released.map(r => r.finding.kind)).toEqual(['misquote']);
    expect(gate([{ ...MISQ_FLAG, correctValue: 16 }]).released.map(r => r.finding.kind)).toEqual(['misquote']);
    expect(gate([{ ...MISQ_FLAG, correctValue: 30 }]).decisions[1]).toMatchObject({ outcome: 'checker_disagrees' });
  });
  it('answered since: stale; waited past two messages: expired — except in the final answers', () => {
    expect(gate([vetted()], { now: 'Let me redo it: a 10% rise recovers about 8.5 points.' }).decisions[0]).toMatchObject({ outcome: 'stale' });
    const later = [...turnRows, { turnIndex: 5, role: 'candidate', text: 'Competitors.' }, { turnIndex: 6, role: 'interviewer', text: 'Go on.' }, { turnIndex: 7, role: 'candidate', text: 'And suppliers.' }, { turnIndex: 8, role: 'interviewer', text: 'Go on.' }];
    expect(gate([vetted()], { at: 9, rows: later }).decisions[0]).toMatchObject({ outcome: 'expired' });
    expect(gate([vetted()], { at: 9, rows: later, final: true }).decisions[0]).toMatchObject({ outcome: 'released' });
  });
  // Engine-asks round 2 (Lorenzo, 19 Oct, ruling 6): a finding released on a
  // deadline-made stage turn and held back there (plan-turn's codeProbesHeld)
  // is re-gated on the next turn exempt from the wait, like the checker's own
  // held line — the stage turn spent its last waiting message.
  it('held back on a stage turn: re-gated past the wait, still released (a finding not held expires)', () => {
    const later = [...turnRows, { turnIndex: 5, role: 'candidate', text: 'Competitors.' }, { turnIndex: 6, role: 'interviewer', text: 'Go on.' }, { turnIndex: 7, role: 'candidate', text: 'And suppliers.' }, { turnIndex: 8, role: 'interviewer', text: 'Go on.' }];
    const g = gate([vetted()], { at: 9, rows: later, held: ['3:code:0'] });
    expect(g.decisions[0]).toMatchObject({ id: '3:code:0', outcome: 'released' });
    expect(g.released.map(r => r.id)).toEqual(['3:code:0']);
    expect(gate([vetted(), MISQ_FLAG], { at: 9, rows: later, held: ['3:code:0'] }).decisions[1]).toMatchObject({ id: '3:code:1', outcome: 'expired' });
  });
});

// Engine-asks round 2 (Lorenzo, 19 Oct, ruling 6): the code_gate rows come
// unordered from the event read; a held finding writes two (released, then its
// re-gate's outcome), so the last decision by turn wins, this turn's after them.
describe('gateOutcomesOf', () => {
  const row = (turnIndex: number, id: string, outcome: string) => ({ category: 'math_checker', subtype: 'code_gate', turnIndex, payloadJsonb: { id, candidateTurnIndex: 3, outcome } });
  const inOrder = [row(4, '3:code:0', 'released'), row(4, '3:code:1', 'not_rated'), row(6, '3:code:0', 'derived'), { category: 'math_checker', subtype: 'verdict', turnIndex: 5, payloadJsonb: {} }];
  it('rows given out of order build the same map as rows in order: the later turn\'s decision wins', () => {
    const want = { '3:code:0': 'derived', '3:code:1': 'not_rated' };
    expect(gateOutcomesOf(inOrder, [])).toEqual(want);
    expect(gateOutcomesOf([...inOrder].reverse(), [])).toEqual(want);
    expect(gateOutcomesOf([inOrder[2], inOrder[0], inOrder[3], inOrder[1]], [])).toEqual(want);
  });
  it('rows of one turn keep their order; this turn\'s decisions come last', () => {
    expect(gateOutcomesOf([row(4, '3:code:0', 'released'), row(4, '3:code:0', 'expired')], [])).toEqual({ '3:code:0': 'expired' });
    expect(gateOutcomesOf([row(6, '3:code:0', 'derived'), row(4, '3:code:0', 'released')], [{ id: '3:code:0', outcome: 'released' }])).toEqual({ '3:code:0': 'released' });
  });
});

// Lorenzo, 18 Oct (brief B rulings): the checker's neutral probes vary — five
// versions, chosen once when code selects the flag; the decision carries the
// exact line, and the heard check reads that line, not a pattern.
import { neutralProbe, lineHeard } from '@/lib/orchestrator/math-checker-live';
import { PHRASE_POOLS, fill, recordPhraseUses, type PhraseUses } from '@/lib/orchestrator/phrasing';
describe('the neutral probes vary', () => {
  const neutral = vetted({ probeLine: 'Walk me through how you got to about 5 points.' });
  it('a vetted neutral probe is said in one of its versions; the checker\'s own drafted probe as vetted', () => {
    expect(PHRASE_POOLS.probe_got_to.map(v => fill(v, 'about 5 points'))).toContain(neutralProbe('Walk me through how you got to about 5 points.', undefined, 's:5'));   // first use: by seed
    const used: PhraseUses = { probe_got_to: [0] };
    const again = neutralProbe('Walk me through how you got to about 5 points.', used, 's:9');
    expect(PHRASE_POOLS.probe_got_to.map(v => fill(v, 'about 5 points'))).toContain(again);
    expect(again).not.toBe('Walk me through how you got to about 5 points.');
    expect(PHRASE_POOLS.probe_calc).toContain(neutralProbe('Walk me through that calculation.', { probe_calc: [0] }, 's:9'));
    expect(PHRASE_POOLS.probe_there).toContain(neutralProbe('Walk me through how you got there.', { probe_there: [0] }, 's:9'));
    expect(neutralProbe(vetted().probeLine!, used, 's:9')).toBe(vetted().probeLine);
  });
  it('the selection and its decision carry the exact line chosen; the heard check reads only that line', () => {
    const uses: PhraseUses = { probe_got_to: [0, 1] };
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [neutral])], phraseUses: uses, seed: 's1:5' }));
    const line = p.selected!.line;
    expect(PHRASE_POOLS.probe_got_to.slice(2).map(v => fill(v, 'about 5 points'))).toContain(line);
    expect(p.decisions.find(d => d.id === p.selected!.id)?.line).toBe(line);
    expect(lineHeard(`Okay. ${line}`, line)).toBe(true);
    const other = PHRASE_POOLS.probe_got_to.map(v => fill(v, 'about 5 points')).find(v => v !== line)!;
    expect(lineHeard(`Okay. ${other}`, line)).toBe(false);   // another version is not the line chosen
  });
  it('never one of the last 3 versions, over a session of probes', () => {
    let uses: PhraseUses = {};
    const seen: string[] = [];
    for (let t = 5; t < 25; t++) {
      const line = planCheckerFlags(input({ rows: [verdictRow(3, [neutral])], phraseUses: uses, seed: `s:${t}` })).selected!.line;
      expect(seen.slice(-3)).not.toContain(line);
      seen.push(line);
      uses = recordPhraseUses(line, uses);
    }
  });
});

// Lorenzo, 19 Oct (R2; batch 32 Aldermoor Marisol 6a721cdf): her wrong net
// price, $2,000, was dropped as "restated" five times (t9–t23) while the
// $400M, $80M and 150,000 built on it each took probes of their own. (a) A
// flag goes stale only when the quantity is restated at a different value;
// (b) a claim carrying an open input error's figure yields to it.
describe('the correction follows the wrong input (entry-001, Aldermoor Marisol)', () => {
  const entry = getCaseById('entry-001');
  const ENTRY = ['us_adults', 'funnel_rates', 'peak_share_forecast', 'kelvexa_pricing'];
  const step = (stepId: string) => ({ kind: 'step' as const, stepId, price: null, target: null });
  const net = vetted({
    span: 'list $10,000, discounts and rebates 20% of list, so $2,000 realized', quantity: 'Net price per patient per year', candidateValue: '$2,000', correctValue: 8000, unit: 'usd',
    codeQuantity: step('net_price'), probeLine: 'You said $2,000 realized per patient per year. How did you get from the $10,000 list price and the 20% discounts and rebates to that figure?',
    correctionLine: 'Kelvexa net price per patient per year is about $8,000, not $2,000.', correctionFigure: '8000',
  });
  const sales = (span: string, value: string, over: Partial<VettedClaim> = {}) => vetted({
    span, quantity: 'Peak annual US net sales', candidateValue: value, correctValue: 320, unit: 'usd', codeQuantity: step('peak_net_sales'),
    probeLine: `You got ${value} at peak. Walk me through that calculation.`, correctionLine: `Peak annual US net sales of Kelvexa is about $320 million, not ${value}.`, correctionFigure: '320', ...over,
  });
  const T17 = 'Net price per patient per year: list $10,000, discounts and rebates 20% of list, so $2,000 realized. Peak revenue: 40,000 × $2,000 = $80 million.';
  const run = (claims: VettedClaim[], over: Partial<CheckerPlanInput> = {}) => planCheckerFlags(input({
    rows: [verdictRow(17, claims)], caseData: entry, revealedIds: ENTRY,
    turnRows: [{ turnIndex: 17, role: 'candidate', text: T17 }, { turnIndex: 18, role: 'interviewer', text: 'Do we have the competitor price points?' }],
    candidateTurnIndex: 19, candidateText: 'Nimbrel nets $9,000, so we are priced well under the standard of care.', candidateFigures: [2000, 80],
    ...over,
  }));

  describe('(a) stale only when restated at a different value', () => {
    const stale = (text: string) => isStale(net, [text], entry, ENTRY);
    it('the step said again at the claim\'s own figure — beside a span misread on the list price — is no staleness (t9, t21)', () => {
      expect(stale('Three: net price. List is $10,000 per patient per year. Discounts and rebates are 20% of list, so $2,000 realized per patient per year.')).toBeNull();
    });
    it('the right figure stated is still stale', () => expect(stale('List is $10,000 per patient per year, so net is $8,000.')).not.toBeNull());
    it('the same value again is no staleness', () => expect(stale('So $2,000 net per patient again.')).toBeNull());
    // Review M2: a span at a case figure is a quote of the data, not the quantity restated.
    it('a step span at a case figure ("List is $10,000") restates nothing', () => {
      expect(stale('List is $10,000 per patient per year.')).toBeNull();
      expect(stale('List is $10,000 per patient per year, and net comes to $7,000.')).toMatch(/^restated at 7000/);
    });
    it('restated at a different value is stale, with the value', () => expect(stale('Net comes to $7,000 per patient.')).toMatch(/^restated at 7000/));
    it('a pricing claim said again at its own figure is no staleness; at another figure it is', () => {
      expect(isStale(vetted(), ['A 10% price rise recovers about 5 points of margin.'], prof, COSTS)).toBeNull();
      expect(isStale(vetted(), ['A 10% price rise recovers 8 points of margin.'], prof, COSTS)).toMatch(/^restated at 8/);
    });
  });

  describe('(b) a claim built on an open wrong input yields to it', () => {
    it('net_price@2000 open: "40,000 × $2,000 = $80 million" is derived, and the net price is selected', () => {
      const p = run([net, sales('40,000 × $2,000 = $80 million', '$80 million')]);
      expect(p.decisions.find(d => d.id === '17:1')).toMatchObject({ outcome: 'derived', root: 'net_price@2000', reason: expect.stringMatching(/net_price@2000/) });
      expect(p.selected).toMatchObject({ id: '17:0', key: 'net_price@2000', action: 'probe' });
      // It rides on the root's line: plan-turn books it only when the line is used (and unbooks it with an unheard line).
      expect(p.selected?.riders?.map(r => r.id)).toEqual(['17:1']);
      expect(p.handledNow).not.toContain('17:1');
    });
    // Review I1: yielding to a root that isn't said is no yielding.
    it('the root loses the race (outranked): the claim built on it is not handled — it waits', () => {
      const other = vetted({ span: 'the eligible pool is 300,000', quantity: 'eligible patients', candidateValue: '300,000', correctValue: 200000, codeQuantity: step('eligible_patients'), changesConclusion: true });
      const p = run([{ ...net, changesConclusion: false }, sales('40,000 × $2,000 = $80 million', '$80 million', { changesConclusion: false }), other]);
      expect(p.selected?.id).toBe('17:2');
      expect(p.decisions.find(d => d.id === '17:1')).toBeUndefined();
      expect(p.handledNow).not.toContain('17:1');
      expect(p.waiting.map(w => w.id)).toEqual(expect.arrayContaining(['17:0', '17:1']));
    });
    it('a minor root under time pressure takes the conclusion-changing rating of a claim built on it: not shed', () => {
      const p = run([{ ...net, changesConclusion: false }, sales('40,000 × $2,000 = $80 million', '$80 million', { changesConclusion: true })], { underTimePressure: true });
      expect(p.decisions.some(d => d.outcome === 'shed')).toBe(false);
      expect(p.selected).toMatchObject({ id: '17:0', key: 'net_price@2000', action: 'correct' });
      expect(p.decisions.find(d => d.id === '17:1')).toMatchObject({ outcome: 'derived' });
    });
    // Review I3 (controller ruling; Lorenzo's (o): "the correction should follow the wrong input").
    it('the root probed once and not restated: the next message carries its figure — the root\'s correction goes on that turn', () => {
      const T7 = 'On price: list is $10,000 per patient per year, and discounts and rebates to insurers are 20% of list, so net realized is $2,000 per patient per year.';
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], {
        rows: [verdictRow(7, [{ ...net, span: 'net realized is $2,000 per patient per year' }]), verdictRow(17, [sales('40,000 × $2,000 = $80 million', '$80 million')])],
        handled: ['7:0'], keys: { 'net_price@2000': { figures: [2000], since: 7 } }, attempts: { 'net_price@2000': 1 },
        turnRows: [{ turnIndex: 7, role: 'candidate', text: T7 }, { turnIndex: 8, role: 'interviewer', text: net.probeLine! },
          { turnIndex: 17, role: 'candidate', text: T17 }, { turnIndex: 18, role: 'interviewer', text: 'Go on.' }],
      });
      expect(p.selected).toMatchObject({ id: '7:0', key: 'net_price@2000', action: 'correct', attempt: 2, line: 'Kelvexa net price per patient per year is about $8,000, not $2,000.' });
      expect(p.selected?.riders?.map(r => r.id)).toEqual(['17:0']);
      expect(p.decisions.find(d => d.id === '17:0')).toMatchObject({ outcome: 'derived' });
      expect(p.waiting).toEqual([]);
    });
    it('…and the step cap still counts on the root\'s step', () => {
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], {
        rows: [verdictRow(7, [{ ...net, correctionLine: null, correctionFigure: null, span: 'net realized is $2,000 per patient per year' }]), verdictRow(17, [sales('40,000 × $2,000 = $80 million', '$80 million')])],
        handled: ['7:0'], keys: { 'net_price@2000': { figures: [2000], since: 7 } }, attempts: { 'net_price@2000': 1 }, stepProbes: { net_price: 2 },
      });
      expect(p.selected).toBeNull();
      expect(p.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ id: '7:0', outcome: 'unresolved', reason: expect.stringMatching(/two probes on this step/) }),
        expect.objectContaining({ id: '17:0', outcome: 'unresolved', reason: expect.stringMatching(/built on a closed input/) })]));
    });
    it('the flag is the key: "with peak at $80 million" (t19) restates a key another claim built on $2,000 — derived too', () => {
      const p = run([sales('with peak at $80 million there\'s no headroom at all', '$80M peak')], {
        rows: [verdictRow(17, [net, sales('40,000 × $2,000 = $80 million', '$80 million')]), verdictRow(19, [sales('with peak at $80 million there\'s no headroom at all', '$80M peak')])],
        handled: ['17:0', '17:1'], keys: { 'net_price@2000': { figures: [2000], since: 17 } }, attempts: { 'net_price@2000': 1 },
        turnRows: [{ turnIndex: 17, role: 'candidate', text: T17 }, { turnIndex: 18, role: 'interviewer', text: 'Go on.' }, { turnIndex: 19, role: 'candidate', text: 'With peak at $80 million there\'s no headroom at all.' }, { turnIndex: 20, role: 'interviewer', text: 'Go on.' }],
        candidateTurnIndex: 21,
      });
      expect(p.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ id: '19:0', outcome: 'derived', reason: expect.stringMatching(/net_price@2000/) })]));
      expect(p.selected).toMatchObject({ key: 'net_price@2000', action: 'correct' });
    });
    it('a line a due stage held back keeps its turn', () => {
      const p = run([net, sales('40,000 × $2,000 = $80 million', '$80 million')], { held: '17:1' });
      expect(p.selected?.id).toBe('17:1');
      expect(p.decisions.some(d => d.outcome === 'derived')).toBe(false);
    });
    it('a claim built on a derived one follows it to the input', () => {
      const share = vetted({ span: 'so $80 million is about 27% of the bar', quantity: 'peak sales as a share of the bar', candidateValue: 'about 27% of the bar', correctValue: 107, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
      const p = run([net, sales('40,000 × $2,000 = $80 million', '$80 million'), share]);
      expect(p.decisions.find(d => d.id === '17:2')).toMatchObject({ outcome: 'derived', reason: expect.stringMatching(/^built on net_price@2000/) });
      expect(p.selected?.id).toBe('17:0');
    });
    it('net_price@2000 closed: the same claim is unresolved — built on a closed input', () => {
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { keys: { 'net_price@2000': { figures: [2000], since: 7 } }, closed: ['net_price@2000'] });
      expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'unresolved', reason: expect.stringMatching(/built on a closed input/) })]);
      expect(p.selected).toBeNull();
    });
    it('the right input, a wrong product ("40,000 × $8,000 = $300 million"): selected on its own key', () => {
      const p = run([sales('40,000 × $8,000 = $300 million', '$300 million')], { keys: { 'net_price@2000': { figures: [2000], since: 7 } }, attempts: { 'net_price@2000': 1 } });
      expect(p.selected).toMatchObject({ id: '17:0', key: 'peak_net_sales@300' });
    });
    it('a case figure or the claim\'s own figure in the span links nothing', () => {
      // $300 million is the board's bar; a root at 300 is no input of the claim.
      expect(rootOf('$80 million against a $300 million bar', 'peak_net_sales@220', { 'checker:$300 million': { figures: [300], since: 5 } }, caseNumbersOf(entry, ENTRY))).toBeNull();
      expect(rootOf('40,000 × $2,000 = $80 million', 'peak_net_sales@80', { 'peak_net_sales@80': { figures: [80], since: 17 }, 'option_a_profit@80': { figures: [80], since: 9 } }, [])).toBeNull();
      // Another figure of the same step is a restatement, not an input.
      expect(rootOf('$400 million, now $80 million', 'peak_net_sales@80', { 'peak_net_sales@400': { figures: [400], since: 7 } }, [])).toBeNull();
    });
    // Review I2: the root's head figure (its wrong result), not every figure it was said with.
    it('a root matches on its head figure only', () => {
      expect(rootOf('Beans at 10.5 points, so the rest is 31.5', 'non_bean_points_now@31.5', { 'bean_points_added@3.7': { figures: [3.7, 10.5, 14.2], since: 7 } }, [])).toBeNull();
      const keys = { 'peak_net_sales@400': { figures: [400, 200000, 2000], since: 7 }, 'net_price@2000': { figures: [2000], since: 7 } };
      expect(rootOf('$300 million ÷ $2,000 = 150,000 patients', 'breakeven_patients@150000', keys, [])).toBe('net_price@2000');
    });
    it('several roots: the earliest', () => {
      const keys = { 'net_price@2000': { figures: [2000], since: 9 }, 'peak_patients@200000': { figures: [200000], since: 7 } };
      expect(rootOf('200,000 × $2,000 = $400 million', 'peak_net_sales@400', keys, [])).toBe('peak_patients@200000');
    });
    it('the gate: code\'s own finding on a claim built on an open input is derived', () => {
      const flag = { kind: 'step' as const, stepId: 'peak_net_sales', description: '', expected: 320, candidateValue: 80, errorClass: 'case_breaking' as const, span: '40,000 × $2,000 = $80 million' };
      const g = gateCodeFindings({
        rows: [verdictRow(17, [sales('40,000 × $2,000 = $80 million', '$80 million')], { codeFlags: codeFlagRefs({ flags: [flag] }, []) })], handled: [],
        turnRows: [{ turnIndex: 17, role: 'candidate', text: T17 }], candidateText: 'Nimbrel nets $9,000.', candidateTurnIndex: 19, caseData: entry, revealedIds: ENTRY,
        keys: { 'net_price@2000': { figures: [2000], since: 7 } }, closed: [],
      });
      expect(g.released).toEqual([]);
      expect(g.decisions[0]).toMatchObject({ outcome: 'derived', reason: expect.stringMatching(/net_price@2000/) });
    });
    // Review M1: the gate keys the claim as the plan does (flagKeyFor), so a restatement of a raised key at a new value is that key's step — no root.
    it('the gate keys the claim as the plan does: "down from $400 million to $80 million" is peak_net_sales again, not built on it', () => {
      const flag = { kind: 'step' as const, stepId: 'peak_net_sales', description: '', expected: 320, candidateValue: 80, errorClass: 'case_breaking' as const, span: 'down from $400 million to $80 million' };
      const claim = vetted({ span: 'down from $400 million to $80 million', quantity: 'peak sales', candidateValue: '$80 million', correctValue: 320, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
      const g = gateCodeFindings({
        rows: [verdictRow(17, [claim], { codeFlags: codeFlagRefs({ flags: [flag] }, []) })], handled: [],
        turnRows: [{ turnIndex: 17, role: 'candidate', text: 'Peak is down from $400 million to $80 million.' }], candidateText: 'Nimbrel nets $9,000.', candidateTurnIndex: 19, caseData: entry, revealedIds: ENTRY,
        keys: { 'peak_net_sales@400': { figures: [400], since: 7 }, 'peak_net_sales@80': { figures: [80], since: 9 } }, closed: [],
      });
      expect(g.decisions[0]).toMatchObject({ outcome: 'released' });
    });
  });

  // Lorenzo, 19 Oct (round-2 ruling 1; b28 Jordan t19, b29 Jordan t9): a root
  // corrected live and a later claim still on its wrong value — code restates
  // the root's correction once, then the report. A root closed without a live
  // correction keeps "built on a closed input". Round-3 ruling 1 (Lorenzo, 19 Oct):
  // the restatement is the line delivered, verbatim — never a built "X, not Y".
  describe('(c) a later claim at a corrected wrong value: the correction once more', () => {
    const NET_LINE = 'Kelvexa net price per patient per year is about $8,000, not $2,000.';
    const closedNet = { keys: { 'net_price@2000': { figures: [2000], since: 7 } }, closed: ['net_price@2000'] };
    const corrected = { 'net_price@2000': { line: NET_LINE, figure: '8000' } };
    it('root corrected live, then a claim built on its wrong value: restated, the delivered line reused, its figure licensed', () => {
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected });
      expect(p.selected).toMatchObject({ id: '17:0', key: 'net_price@2000', action: 'restate', line: NET_LINE, derived: ['8000'] });
      expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'restate', line: NET_LINE, root: 'net_price@2000' })]);
      // Booked by plan-turn only when the line is said (like a correction).
      expect(p.handledNow).not.toContain('17:0');
    });
    it('a second such claim, after the restatement: report-only, no line', () => {
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected, restated: ['net_price@2000'] });
      expect(p.selected).toBeNull();
      expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'unresolved', root: 'net_price@2000', reason: expect.stringMatching(/^built on a corrected input \(net_price@2000\) — restated once/) })]);
      expect(p.handledNow).toContain('17:0');
    });
    it('a root closed with no live correction (attempts ran out): built on a closed input, no line (unchanged)', () => {
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected: { 'peak_patients@200000': { line: 'Patients on Kelvexa at peak is about 40,000, not 200,000.', figure: '40000' } } });
      expect(p.selected).toBeNull();
      expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'unresolved', reason: expect.stringMatching(/^built on a closed input/) })]);
    });
    // Task 18 review: an old or malformed record with no line restates nothing.
    it('a record with an empty or missing line: no restatement, built on a closed input', () => {
      for (const fix of [{ line: '', figure: '8000' }, { figure: '8000' }]) {
        const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected: { 'net_price@2000': fix as { line: string } } });
        expect(p.selected).toBeNull();
        expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'unresolved', reason: 'built on a closed input (net_price@2000)' })]);
      }
    });
    it('two claims on the one corrected root in a message: one restatement, the other rides on it', () => {
      const share = vetted({ span: '$2,000 a patient is a fifth of list', quantity: 'net as a share of list', candidateValue: 'a fifth of list', correctValue: 0.8, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million'), share], { ...closedNet, corrected });
      expect(p.selected).toMatchObject({ id: '17:0', action: 'restate' });
      expect(p.selected?.riders?.map(r => r.id)).toEqual(['17:1']);
      expect(p.handledNow).not.toContain('17:1');
    });
    it('the turn\'s one math line: none beside a deterministic flag on this message — it waits', () => {
      const flag = { kind: 'step' as const, stepId: 'x', description: '', expected: 1, candidateValue: 2, errorClass: 'case_breaking' as const, span: '' };
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected, currentFlags: [flag] });
      expect(p.selected).toBeNull();
      expect(p.waiting.map(w => w.id)).toEqual(['17:0']);
      expect(p.decisions).toEqual([]);
      // It carries its root: if the case closes on it, the report says what became of the root (round-2 final, Minor 2).
      expect(p.waiting[0].root).toBe('net_price@2000');
    });
    // Round-2 final review, Minor 2: a restatement that waited and expired keeps its root for the report.
    it('one that waited past CHECKER_MAX_WAIT_MESSAGES: expired, with its root', () => {
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected, candidateTurnIndex: 23,
        turnRows: [{ turnIndex: 17, role: 'candidate', text: T17 }, { turnIndex: 18, role: 'interviewer', text: 'Go on.' }, { turnIndex: 19, role: 'candidate', text: 'Ideas.' }, { turnIndex: 20, role: 'interviewer', text: 'Go on.' }, { turnIndex: 21, role: 'candidate', text: 'More ideas.' }, { turnIndex: 22, role: 'interviewer', text: 'Go on.' }],
        candidateText: 'Still more ideas.' });
      expect(p.selected).toBeNull();
      expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'expired', root: 'net_price@2000' })]);
    });
    it('a waiting flag whose own correction is another line is not covered', () => {
      const other = vetted({ span: 'eligible pool of 300,000', quantity: 'eligible patients', candidateValue: '300,000', correctValue: 200000, codeQuantity: step('eligible_patients'),
        correctionLine: 'Eligible patients is about 200,000, not 300,000.', correctionFigure: '200000' });
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million'), other], { ...closedNet, corrected });
      expect(p.selected).toMatchObject({ id: '17:0', action: 'restate' });
      expect(p.selected?.covers).toBeUndefined();
    });
    // The controller's middle ordering (review fix 2): a restatement goes before other flags of its rating, not before a conclusion-changing one when minor.
    it('ordering: a minor restatement waits behind a conclusion-changing flag; of equal rating it goes first, whatever the age', () => {
      const other = vetted({ span: 'the eligible pool is 300,000', quantity: 'eligible patients', candidateValue: '300,000', correctValue: 200000, codeQuantity: step('eligible_patients'), changesConclusion: true });
      const minor = run([sales('40,000 × $2,000 = $80 million', '$80 million', { changesConclusion: false }), other], { ...closedNet, corrected });
      expect(minor.selected).toMatchObject({ id: '17:1' });
      expect(minor.waiting.map(w => w.id)).toContain('17:0');
      const equal = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected,
        rows: [verdictRow(15, [other]), verdictRow(17, [sales('40,000 × $2,000 = $80 million', '$80 million')])],
        turnRows: [{ turnIndex: 15, role: 'candidate', text: 'The eligible pool is 300,000.' }, { turnIndex: 16, role: 'interviewer', text: 'Go on.' }, { turnIndex: 17, role: 'candidate', text: T17 }, { turnIndex: 18, role: 'interviewer', text: 'Go on.' }] });
      expect(equal.selected).toMatchObject({ id: '17:0', action: 'restate' });
      expect(equal.waiting.map(w => w.id)).toContain('15:0');
    });
    // Round-3 ruling 1 (Lorenzo, 19 Oct): the line delivered, word for word — no "not X" added, no scale word carried.
    it('a delivered line with no "not X" is said again as delivered', () => {
      for (const line of ['Kelvexa net price per patient per year is about $8,000.', 'Kelvexa net price is about $8 thousand per patient per year.']) {
        const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected: { 'net_price@2000': { line, figure: '8000' } } });
        expect(p.selected).toMatchObject({ id: '17:0', action: 'restate', line, derived: ['8000'] });
        expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'restate', line })]);
      }
    });
    // Round-2 final review, Minor 4 (the old builder took the scale word from the right figure: "$1.2 million" for
    // "$1.2 billion"): fixed by the verbatim line (round-3 ruling 1); confirmed here (round-3 ruling 2).
    it('a "$1.2 billion" claim: the delivered line verbatim, no scale word rebuilt', () => {
      const line = 'Peak net sales are about $320 million, not $1.2 billion.';
      const p = run([sales('600,000 × $2,000 = $1.2 billion', '$1.2 billion')], { ...closedNet, corrected: { 'net_price@2000': { line, figure: '320' } } });
      expect(p.selected).toMatchObject({ id: '17:0', action: 'restate', line, derived: ['320'] });
      expect(p.selected?.line).not.toMatch(/\$1\.2 million|\$320 billion/);
    });
    // The controller's ruling on Task 19's concern 1 (19 Oct; Lorenzo's "a correction is said at most twice in total"):
    // counted per line as well as per key — a line said twice already is not said again, whichever selection carries it.
    describe('per line: a line said twice already is not said again', () => {
      const twice = { said: { [lineKey(NET_LINE)]: 2 } };
      it('a new flag whose own correction is that line: not said — report-only, its key closes', () => {
        const p = run([net], { attempts: { 'net_price@2000': 1 }, ...twice });
        expect(p.selected).toBeNull();
        expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'unresolved', key: 'net_price@2000', line: NET_LINE, reason: 'its correction was already said twice — left for the report' })]);
        expect(p.handledNow).toContain('17:0');
        expect(p.closedNow).toContain('net_price@2000');
        // Said once so far: said.
        expect(run([net], { attempts: { 'net_price@2000': 1 }, said: { [lineKey(NET_LINE)]: 1 } }).selected).toMatchObject({ id: '17:0', action: 'correct', line: NET_LINE });
      });
      it('the count is by the line as said (case, quotes and spacing aside)', () => {
        expect(run([net], { attempts: { 'net_price@2000': 1 }, said: { [lineKey(`  ${NET_LINE.toUpperCase()} `)]: 2 } }).selected).toBeNull();
      });
      it('a restatement whose line was said twice (by another key\'s identical correction): not said — report-only', () => {
        const p = run([sales('40,000 × $2,000 = $80 million', '$80 million')], { ...closedNet, corrected, ...twice });
        expect(p.selected).toBeNull();
        expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'unresolved', root: 'net_price@2000', reason: 'built on a corrected input (net_price@2000) — its correction was already said twice; left for the report' })]);
      });
    });
    it('a minor claim under time pressure is shed, as a minor flag is', () => {
      const p = run([sales('40,000 × $2,000 = $80 million', '$80 million', { changesConclusion: false })], { ...closedNet, corrected, underTimePressure: true });
      expect(p.selected).toBeNull();
      expect(p.decisions).toEqual([expect.objectContaining({ id: '17:0', outcome: 'shed' })]);
    });
  });
});

// The evidence turns, from their recorded verdicts (replay r2-16, checker on;
// the memory as the replay held it before the turn, plus the correction the
// root's delivered line records now).
describe('ruling 1 on the evidence: b28 Jordan t19, b29 Jordan t9', () => {
  type Fixture = { candidateTurnIndex: number; candidateText: string; revealedIds: string[]; turnRows: CheckerPlanInput['turnRows']; rows: CheckerRow[];
    mathChecker: { handled: string[]; keys: Record<string, { figures: number[]; since: number }>; closed: string[] }; attempts: Record<string, number>; stepProbes: Record<string, number> };
  const COGS_LINE = 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.';
  const replayed = (f: Fixture, root: string) => planCheckerFlags({
    rows: f.rows, handled: f.mathChecker.handled, turnRows: f.turnRows, candidateText: f.candidateText, candidateTurnIndex: f.candidateTurnIndex,
    currentFlags: [], attempts: f.attempts, keys: f.mathChecker.keys, closed: f.mathChecker.closed, stepProbes: f.stepProbes,
    corrected: { [root]: { line: COGS_LINE, figure: '16' } },
    underTimePressure: false, candidateFigures: candidateFiguresOf([...f.turnRows.filter(t => t.role === 'candidate').map(t => t.text), f.candidateText], [prof.prompt]),
    caseData: prof, revealedIds: f.revealedIds,
  });
  it('b28 Jordan 591cff13 t19: "The gap is 38 minus 18, so about 20 points" — the 38-to-40 correction restated', () => {
    const p = replayed(EVIDENCE['b28-jordan-591cff13-t19'] as unknown as Fixture, 'checker:38 to 40 points');
    expect(p.selected).toMatchObject({ id: '17:1', action: 'restate', key: 'checker:38 to 40 points', line: COGS_LINE });
    expect(p.decisions.find(d => d.id === '17:1')).toMatchObject({ outcome: 'restate', root: 'checker:38 to 40 points' });
  });
  it('b29 Jordan ea27d1f6 t9: "a large chunk of the 38" — restated, ahead of the "~40 points" correction (the same line again)', () => {
    const p = replayed(EVIDENCE['b29-jordan-ea27d1f6-t9'] as unknown as Fixture, 'cogs_dollar_impact@38');
    expect(p.selected).toMatchObject({ id: '7:1', action: 'restate', key: 'cogs_dollar_impact@38', line: COGS_LINE });
    expect(p.waiting.map(w => w.id)).toContain('5:6');
    // The controller's ruling on Task 11 (option c): 5:6's own correction is the root's delivered line, word for word —
    // the restatement corrects it (booked with the line, plan-turn): its key closes, restated — so t20's re-correction in the recommendation, the line a third time, is not said (round-3 ruling 2).
    expect(p.selected?.covers).toEqual([expect.objectContaining({ id: '5:6', key: 'checker:~40 points', line: COGS_LINE })]);
    expect(p.decisions.find(d => d.id === '5:6')).toMatchObject({ outcome: 'correct', line: COGS_LINE, key: 'checker:~40 points', by: '7:1' });
    expect(p.handledNow).not.toContain('5:6');
  });
  it('…and without the record of a live correction, both stay "built on a closed input" (an old session\'s flags)', () => {
    for (const [name, root] of [['b28-jordan-591cff13-t19', 'checker:38 to 40 points'], ['b29-jordan-ea27d1f6-t9', 'cogs_dollar_impact@38']] as const) {
      const f = EVIDENCE[name] as unknown as Fixture;
      const p = planCheckerFlags({ ...{
        rows: f.rows, handled: f.mathChecker.handled, turnRows: f.turnRows, candidateText: f.candidateText, candidateTurnIndex: f.candidateTurnIndex,
        currentFlags: [], attempts: f.attempts, keys: f.mathChecker.keys, closed: f.mathChecker.closed, stepProbes: f.stepProbes,
        underTimePressure: false, candidateFigures: [], caseData: prof, revealedIds: f.revealedIds,
      } });
      expect(p.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'unresolved', reason: `built on a closed input (${root})` })]));
    }
  });
});

// Lorenzo, 19 Oct (round-4 ruling 4; b33 Blake cb23e17b t22: "Walk me through how you got there." two turns after
// his t19 claim, behind the follow-up question, so "there" pointed at his first-step answer): a bare probe said later
// than the turn right after its claim quotes the claim — in the candidate's own words.
import { quoteLateProbe, lateProbe, QUOTE_WORDS } from '@/lib/orchestrator/math-checker-live';
import { changeFigures } from '@/lib/orchestrator/numeric-provenance';
describe('a bare probe said later than the turn right after its claim quotes the claim (round-4 ruling 4)', () => {
  const BLAKE_T19 = "The single biggest risk is that the price increase doesn't stick — that volume falls more than I've assumed. My whole recommendation rests on a 2–3% volume loss against a 10–12% price increase, and that number is a benchmark, not something we've tested on this customer base. If elasticity is actually closer to one, I lose the entire margin recovery and I've also lost traffic, which is much harder to win back than price is to roll back.\n\nMitigation is the pilot. Three to five markets, representative mix of urban and suburban, run it for eight to twelve weeks, measure transaction counts and ticket size against matched control stores. If volume holds, roll national. If it doesn't, I shift weight onto procurement and the non-dairy surcharge, which don't carry the same traffic risk.\n\nThe second-order risk is that input costs keep climbing eight points a year, in which case pricing is a treadmill and the real fix is contract hedging.";
  const BLAKE_T21 = 'Start with the elasticity pilot, this quarter. Pick five markets, a representative urban-suburban mix, put through a 10% increase on the core espresso and latte lineup, and hold matched control stores flat.';
  const elasticity = vetted({
    span: 'If elasticity is actually closer to one, I lose the entire margin recovery', quantity: 'margin recovery at unit elasticity',
    candidateValue: 'entire margin recovery lost at elasticity of about 1', correctValue: null, correctLow: null, correctHigh: null, changesConclusion: false,
    codeQuantity: { kind: 'breakeven', stepId: null, price: 12, target: null }, probeLine: 'Walk me through how you got there.', correctionLine: null, correctionFigure: null,
  });
  const blake = (over: Partial<CheckerPlanInput> = {}) => input({
    rows: [verdictRow(19, [elasticity])],
    turnRows: [
      { turnIndex: 19, role: 'candidate', text: BLAKE_T19 },
      { turnIndex: 20, role: 'interviewer', text: 'Before we wrap up — you said a 10–12% price increase recovers roughly 6 to 7 points of margin. How did you get that, and what base did you apply the increase to?' },
    ],
    candidateText: BLAKE_T21, candidateTurnIndex: 21, candidateFigures: [2, 3, 10, 12, 6, 7],
    ...over,
  });
  const CASE_FIGS = [...caseNumbersOf(prof, COSTS), ...changeFigures([prof.prompt]).map(Number)];
  const JORDAN_T11 = "It's based on the exhibit read plus the compounding logic. COGS goes 42, 50, 58 — two 8-point steps, but the second one lands on a base already compressed to 15 points of margin, so I'm weighting it roughly double. That gets me to the high-30s, call it 38 to 40 points of effective pressure, against an 18-point actual decline.  The offset I'm assuming is operating leverage on the fixed base.";
  const QUOTED = 'You said “If elasticity is actually closer to one, I lose the entire margin recovery” — walk me through how you got there.';
  it('b33 Blake t19 → t22: the probe quotes his t19 claim, in his words — the selection, its decision and the model\'s hint', () => {
    const p = planCheckerFlags(blake());
    expect(p.selected).toMatchObject({ id: '19:0', action: 'probe', line: QUOTED });
    expect(p.decisions).toContainEqual(expect.objectContaining({ id: '19:0', outcome: 'probe', line: QUOTED }));
    expect(formatCheckerHint(p.selected!)).toContain(`"${QUOTED}"`);
    expect(p.selected!.quote).toEqual({ bare: 'Walk me through how you got there.', figure: null, words: elasticity.span });
    expect(lineHeard(`Quick question before we wrap up — ${QUOTED.charAt(0).toLowerCase()}${QUOTED.slice(1)}`, p.selected!.line, p.selected!.quote)).toBe(true);
    // The model's "walk me through how you got there" after a sentence of its own that doesn't put the claim to him: not heard.
    expect(lineHeard('Fair. On the pilot, walk me through how you got there.', p.selected!.line, p.selected!.quote)).toBe(false);
  });
  it('a probe said on the turn right after its claim may stay bare', () => {
    expect(quoteLateProbe('Walk me through how you got there.', elasticity, BLAKE_T19, { claim: 19, spoken: 20 })).toBe('Walk me through how you got there.');
    expect(quoteLateProbe('Walk me through how you got there.', elasticity, BLAKE_T19, { claim: 19, spoken: 22 })).toBe(QUOTED);
  });
  it('a probe that already quotes the claim — its figure or its words — is kept as it is', () => {
    const drafted = 'Before we wrap up — you said a 10–12% price increase recovers roughly 6 to 7 points of margin. How did you get that?';
    const gain = vetted({ span: 'A 10–12% price increase on a flat cost base recovers roughly 6 to 7 points of margin', candidateValue: '6 to 7 points' });
    expect(quoteLateProbe(drafted, gain, BLAKE_T19, { claim: 17, spoken: 22 })).toBe(drafted);
    expect(quoteLateProbe('Show me how you got to 5.8 points.', vetted({ span: 'beans up 40%, so 14.5 × 0.40 = 5.8 points of increase', candidateValue: '5.8 points' }), '', { claim: 9, spoken: 12 }))
      .toBe('Show me how you got to 5.8 points.');
    expect(quoteLateProbe('You said the pricing assumption is where the case lives. What net price are you using?',
      vetted({ span: 'So the pricing assumption, not the share assumption, is where the case lives.', candidateValue: 'price assumption is decisive' }), '', { claim: 19, spoken: 22 }))
      .toBe('You said the pricing assumption is where the case lives. What net price are you using?');
  });
  it('a drafted probe that puts the claim to them in its own words ("You said …") already quotes it (b29 Jordan ea27d1f6 t12)', () => {
    const drafted = 'You said about half of the COGS pressure is masked by labor leverage. What change in labor as a share of revenue does that rest on?';
    const half = vetted({ span: 'roughly half of it is being masked by operating leverage on labor', candidateValue: 'about half' });
    expect(quoteLateProbe(drafted, half, 'I think roughly half of it is being masked by operating leverage on labor.', { claim: 7, spoken: 12 })).toBe(drafted);
  });
  it('…but not any "You …" sentence: one that names nothing of the claim, or another verb ("You mentioned"), is bare', () => {
    const half = vetted({ span: 'roughly half of it is being masked by operating leverage on labor', candidateValue: 'about half' });
    const msg = 'I think roughly half of it is being masked by operating leverage on labor.';
    expect(quoteLateProbe('You said that earlier. How did you get there?', half, msg, { claim: 7, spoken: 12 }))
      .toBe('You said “roughly half of it is being masked by operating leverage on labor” — you said that earlier. How did you get there?');
    expect(quoteLateProbe('You mentioned the labor line. How does that fit?', half, msg, { claim: 7, spoken: 12 }))
      .toBe('You said “roughly half of it is being masked by operating leverage on labor” — you mentioned the labor line. How does that fit?');
  });
  it('the claim\'s own figure, as written, when it has one — a range and a thousands separator as they wrote them', () => {
    const at = { claim: 11, spoken: 14 };
    expect(quoteLateProbe('What were the steps in that calculation?', vetted({ span: 'Getting that to $30 on the four stable routes is 8,000 flights × 60 passengers × $10 = $4.8M.', candidateValue: '$4.8M' }),
      'Second, extras. Getting that to $30 on the four stable routes is 8,000 flights × 60 passengers × $10 = $4.8M.', at)).toBe('You said “$4.8M” — what were the steps in that calculation?');
    expect(quoteLateProbe('Walk me through that calculation.', vetted({ span: '8,000 flights is the four stable routes', candidateValue: '8,000' }), 'So 8,000 flights is the four stable routes.', at))
      .toBe('You said “8,000” — walk me through that calculation.');
    const msg = 'Beans I sized at 14.5 points. So non-bean inputs are 42 − 14.5 = 27.5 points. That is the bigger bucket.';
    expect(quoteLateProbe('How did you do that calculation?', vetted({ span: 'Beans I sized at 14.5 points. So non-bean inputs are 42 − 14.5 = 27.5 points.', candidateValue: '27.5 points' }), msg, at, CASE_FIGS))
      .toBe('You said “27.5 points” — how did you do that calculation?');
    // b28 Jordan 591cff13 t11: his "38 to 40 points" (the checker's span is not his words).
    expect(quoteLateProbe('Can you show me that calculation step by step?', vetted({ span: 'COGS is more than fully responsible against an 18-point actual decline', candidateValue: 'more than 100% (38-40 vs 18)' }), JORDAN_T11, at, CASE_FIGS))
      .toBe('You said “38 to 40 points” — can you show me that calculation step by step?');
  });
  it('a case figure the claim cites is not its own: their words instead (b31 Fiona 31e90f50 t13, the 18 points)', () => {
    expect(quoteLateProbe('Can you show me that calculation step by step?', vetted({ span: 'All 18 points of margin loss trace to COGS', candidateValue: '18 of 18 points' }),
      'Labor is flat. All 18 points of margin loss trace to COGS.', { claim: 13, spoken: 16 }, CASE_FIGS))
      .toBe('You said “All 18 points of margin loss trace to COGS” — can you show me that calculation step by step?');
  });
  it('…in the selection too: the prompt\'s 18-point drop is a case figure (b31 Fiona 31e90f50 13:0)', () => {
    const fiona = vetted({ span: 'All 18 points of margin loss trace to COGS', candidateValue: '18 of 18 points', probeLine: 'Can you show me that calculation step by step?', correctionLine: null, correctionFigure: null });
    const turnRows = [{ turnIndex: 3, role: 'candidate', text: 'Labor is flat. All 18 points of margin loss trace to COGS.' }, { turnIndex: 4, role: 'interviewer', text: 'What would you look at next?' }];
    expect(planCheckerFlags(input({ rows: [verdictRow(3, [fiona])], turnRows })).selected?.line)
      .toBe('You said “All 18 points of margin loss trace to COGS” — can you show me that calculation step by step?');
  });
  it('the second probes too: a bare pointer said later quotes the claim', () => {
    const p = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null, pointerLine: 'How does that fit with labor at 22% of revenue?' })])] }));
    expect(p.selected).toMatchObject({ action: 'pointer', line: 'You said “5 points” — how does that fit with labor at 22% of revenue?', quote: { bare: 'How does that fit with labor at 22% of revenue?', figure: 5 } });
  });
  it('a span joined by an ellipsis: each part as they said it, cut to fifteen words (b31 Marisol 07e9f231 t13)', () => {
    const msg = 'My recommendation: Brew & Bean should take a targeted menu price increase of roughly 14%, led by procurement renegotiation on the non-bean inputs. That alone should recover most of the 18 points.  The logic: footprint is flat at 200 stores.';
    const c = vetted({ span: 'a targeted menu price increase of roughly 14% ... That alone should recover most of the 18 points.', candidateValue: 'most of the 18 points (more than 9)' });
    expect(quoteLateProbe('Walk me through that calculation.', c, msg, { claim: 13, spoken: 16 }, CASE_FIGS))
      .toBe('You said “…price increase of roughly 14% … That alone should recover most of the 18 points” — walk me through that calculation.');
  });
  it('a span not in their words, no figure of its own: their sentence holding its longest run, cut to fifteen words', () => {
    const c = vetted({ span: 'COGS is more than fully responsible against an 18-point actual decline', candidateValue: 'more than fully responsible' });
    expect(quoteLateProbe('Can you show me that calculation step by step?', c, JORDAN_T11, { claim: 11, spoken: 14 }, CASE_FIGS))
      .toBe('You said “…high-30s, call it 38 to 40 points of effective pressure, against an 18-point actual decline” — can you show me that calculation step by step?');
  });
  it('a run-on of sixty-odd words: at most fifteen of them, around the claim', () => {
    const run = 'So if you think about it the whole thing comes down to the fact that the price rise we put through on the core espresso lineup and the latte lineup together with the pastry case basically pays for itself many times over because traffic barely moves when you raise prices in a premium coffee chain like this one and that is the key point';
    expect(run.split(/\s+/).length).toBeGreaterThan(60);
    for (const span of [run, 'the price rise basically pays for itself many times over because traffic barely moves']) {
      const line = quoteLateProbe('Walk me through how you got there.', vetted({ span, candidateValue: 'price rise pays for itself' }), run, { claim: 11, spoken: 14 });
      const quote = /“(.+)”/.exec(line)![1];
      expect(quote.replace(/…/g, ' ').trim().split(/\s+/).length).toBeLessThanOrEqual(QUOTE_WORDS);
      expect(quote).toMatch(/pays for itself/);
      expect(run).toContain(quote.replace(/^…|…$/g, ''));   // their words, contiguous
    }
  });
  it('nothing of theirs to quote: the line stays as vetted — never words they didn\'t say (FR-4)', () => {
    const c = vetted({ span: 'the margin fully recovers at a 20% price rise', candidateValue: 'full recovery at 20%' });
    expect(quoteLateProbe('Walk me through that calculation.', c, 'I think pricing is the main lever here.', { claim: 5, spoken: 8 })).toBe('Walk me through that calculation.');
    // …nor a sentence of theirs sharing fewer than three of its words in a row.
    const loose = vetted({ span: 'the margin fully recovers once prices move', candidateValue: 'full recovery' });
    expect(quoteLateProbe('Walk me through how you got there.', loose, 'Prices move slowly in this market. I think pricing is the main lever.', { claim: 5, spoken: 8 })).toBe('Walk me through how you got there.');
  });
  it('a bare hint said later quotes the claim too', () => {
    const p = planCheckerFlags(input({ attempts: { 'pricing:gain@5': 1 }, rows: [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null, hintLine: 'How does that sit with the overhead you mentioned?' })])] }));
    expect(p.selected).toMatchObject({ action: 'hint', line: 'You said “5 points” — how does that sit with the overhead you mentioned?' });
  });
  describe('heard: the probe as written after the model\'s own sentence putting the claim to them', () => {
    const at = { claim: 19, spoken: 24 };
    it('the claim\'s own figure in that sentence (b32 Marisol 6e5a1c90 t24)', () => {
      const p = lateProbe('What were the steps in that calculation?', vetted({ span: 'Getting that to $30 on the four stable routes is 8,000 flights × 60 passengers × $10 = $4.8M.', candidateValue: '$4.8M' }),
        'Getting that to $30 on the four stable routes is 8,000 flights × 60 passengers × $10 = $4.8M.', at);
      expect(lineHeard('Got it. Of the risks you listed, which one could most undermine this recommendation? And earlier you said getting extras to $30 on the four stable routes is 8,000 flights × 60 passengers × $10 = $4.8M. What were the steps in that calculation?', p.line, p.quote)).toBe(true);
      expect(lineHeard(`Got it. ${p.line}`, p.line, p.quote)).toBe(true);
      // Its figure alone, with no "you said" (b33 Owen's "On the margin moving … toward 14%: what were the steps…" form).
      expect(lineHeard('Mm-hm. On the $4.8M from extras: what were the steps in that calculation?', p.line, p.quote)).toBe(true);
      // The bare probe alone, the claim named sentences before it, or another of its figures: not the line.
      expect(lineHeard('Got it. What were the steps in that calculation?', p.line, p.quote)).toBe(false);
      expect(lineHeard('You mentioned $4.8M from extras. Fair enough. Let\'s move on. What were the steps in that calculation?', p.line, p.quote)).toBe(false);
      expect(lineHeard('On the $30 extras. What were the steps in that calculation?', p.line, p.quote)).toBe(false);
    });
    it('a case figure the claim shares names no claim; "you said" with its words does (b31 Fiona 31e90f50 t16)', () => {
      const p = lateProbe('Can you show me that calculation step by step?', vetted({ span: 'All 18 points of margin loss trace to COGS', candidateValue: '18 of 18 points' }),
        'All 18 points of margin loss trace to COGS.', { claim: 13, spoken: 16 }, CASE_FIGS);
      expect(p.quote).toEqual({ bare: 'Can you show me that calculation step by step?', figure: null, words: 'All 18 points of margin loss trace to COGS' });
      expect(lineHeard('Right — the 18-point drop is what we\'re explaining. Can you show me that calculation step by step?', p.line, p.quote)).toBe(false);
      expect(lineHeard('Earlier you said all 18 points of margin loss trace to COGS. Can you show me that calculation step by step?', p.line, p.quote)).toBe(true);
    });
  });
});
