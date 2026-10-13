import { describe, it, expect } from 'vitest';
import {
  checkerKey, isStale, modelProbed, planCheckerFlags, startMathCheck, formatCheckerHint, liveCheckerConfig,
  MATH_CHECKER_CATEGORY, type CheckerRow, type CheckerPlanInput, type VerdictPayload,
} from '@/lib/orchestrator/math-checker-live';
import type { CheckerClaim, VettedClaim } from '@/lib/orchestrator/math-checker';
import { getCaseById } from '@/lib/cases/loader';

const prof = getCaseById('prof-001');
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];

const vetted = (over: Partial<VettedClaim> = {}): VettedClaim => ({
  span: 'a 10% price increase recovers about 5 points', quantity: 'margin gain from a 10% price rise', candidateValue: 'about 5 points', assumptions: '',
  verdict: 'error', correctValue: 8.5, correctLow: null, correctHigh: null, unit: 'points', derivation: '', errorType: 'conceptual',
  changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null }, actualShare: null,
  flag: true, probeLine: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?',
  correctionLine: 'A 10% price rise lifts margin about 8.5 points, not 5.', correctionFigure: '8.5', pointerLine: null, vetNotes: [],
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

describe('the Rule 14 key — shared with the deterministic checks', () => {
  const c = (kind: CheckerClaim['codeQuantity']['kind'], stepId: string | null = null) => vetted({ codeQuantity: { kind, stepId, price: 10, target: 24 } });
  it.each([
    ['gain', 'pricing:gain'], ['new_margin', 'pricing:new_margin'], ['needed_for_margin', 'pricing:needed'], ['needed_for_gain', 'pricing:needed'], ['breakeven', 'pricing:breakeven'],
  ] as const)('%s → %s', (kind, key) => expect(checkerKey(c(kind))).toBe(key));
  it('a math step → its id; nothing code computes → the claim in the candidate\'s words', () => {
    expect(checkerKey(c('step', 'bean_points_added'))).toBe('bean_points_added');
    expect(checkerKey(vetted({ codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, candidateValue: 'The whole 18 points' }))).toBe('checker:the whole 18 points');
  });
});

describe('a verdict lands on the next turn as a Rule 14 flag', () => {
  it('first attempt: the vetted probe, its key counted, the claim handled', () => {
    const p = planCheckerFlags(input());
    expect(p.selected?.action).toBe('probe');
    expect(p.selected?.line).toBe(vetted().probeLine);
    expect(p.selected?.attempt).toBe(1);
    expect(p.selected?.key).toBe('pricing:gain');
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
    const p = planCheckerFlags(input({ attempts: { 'pricing:gain': 1 } }));
    expect(p.selected?.action).toBe('correct');
    expect(p.selected?.line).toBe('A 10% price rise lifts margin about 8.5 points, not 5.');
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
    const withPointer = planCheckerFlags(input({ attempts: { 'pricing:gain': 1 }, rows: [verdictRow(3, [vetted({ ...noCorrection, pointerLine: 'How does that fit with labor at 22% of revenue?' })])] }));
    expect(withPointer.selected?.action).toBe('pointer');
    expect(withPointer.selected?.line).toBe('How does that fit with labor at 22% of revenue?');
    const neither = planCheckerFlags(input({ attempts: { 'pricing:gain': 1 }, rows: [verdictRow(3, [vetted(noCorrection)])] }));
    expect(neither.selected).toBeNull();
    expect(neither.decisions).toEqual([expect.objectContaining({ id: '3:0', outcome: 'unresolved' })]);
    expect(neither.handledNow).toContain('3:0');
  });

  it('past the pointer, with no correction: unresolved', () => {
    const p = planCheckerFlags(input({ attempts: { 'pricing:gain': 2 }, rows: [verdictRow(3, [vetted({ correctionLine: null, correctionFigure: null, pointerLine: 'How does that fit with labor at 22% of revenue?' })])] }));
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

describe('dedupe with the deterministic checks — one probe per claim', () => {
  it('a code flag on the same message and key: dropped, logged', () => {
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [vetted()], { codeFlags: [{ key: 'pricing:gain', value: 5, span: 'recovers about 5 points' }] })] }));
    expect(p.selected).toBeNull();
    expect(p.decisions[0]).toEqual(expect.objectContaining({ outcome: 'dedupe' }));
    expect(p.handledNow).toContain('3:0');
  });
  it("a figure code corrected as a misquote in the message: dropped (replay: Tyler b19 \"revenue grew about 19%\")", () => {
    const tyler = vetted({ span: 'Revenue grew about 19% over the period', candidateValue: '19%', correctValue: 15, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [tyler], { codeFlags: [{ key: 'misquote:revenue_growth', value: 19, span: 'Revenue grew about 19% over the period' }] })] }));
    expect(p.decisions[0].outcome).toBe('dedupe');
  });
  it('a code flag on the same figure (another key): dropped', () => {
    const p = planCheckerFlags(input({ rows: [verdictRow(3, [vetted()], { codeFlags: [{ key: 'arith:58 / 110', value: 5, span: 'about 5 points' }] })] }));
    expect(p.decisions[0].outcome).toBe('dedupe');
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
  it.each([
    'Scratch that, I mis-sized the gain.',
    'Actually, a 10% rise is closer to 8.5 points once labor and overhead shrink too.',
    'Let me redo the price math.',
    // Tyler b19 t15, after code corrected his "revenue grew 19%".
    "You're right, that's my error — the prompt said 15% and I don't have a source for 19%.",
  ])('withdrawn or revised: %s', text => expect(stale(text)).not.toBeNull());
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
  it('drops the flag with the reason, handled', () => {
    const p = planCheckerFlags(input({ candidateText: 'Scratch that — the gain is bigger than I said.' }));
    expect(p.selected).toBeNull();
    expect(p.decisions[0].outcome).toBe('stale');
  });
  it('a math step restated since, whatever the figure', () => {
    const step = vetted({ span: '10 percentage points of revenue', candidateValue: '10 percentage points', correctValue: 4.2, codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null } });
    expect(isStale(step, ['Beans add 6 points of revenue to COGS.'], prof, COSTS)).toMatch(/^restated/);
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
    const c = planCheckerFlags(input({ attempts: { 'pricing:gain': 1 } })).selected!;
    expect(formatCheckerHint(c)).toMatch(/overrides the no-correction rule/);
    expect(formatCheckerHint(c)).toContain('"A 10% price rise lifts margin about 8.5 points, not 5."');
  });
});

describe('the background check', () => {
  const base = {
    caseData: prof, candidateTurnIndex: 3, config: { model: 'claude-sonnet-5-5', effort: 'medium' as const },
    input: { revealedIds: COSTS, shownExhibitIds: [], transcript: [], message: 'A 10% price increase recovers about 5 points.' },
    vet: { caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: ['A 10% price increase recovers about 5 points.'] },
    codeMath: { flags: [], verified: [], arithmetic: [], units: { flags: [], verified: [] }, pricing: [] },
  };
  const raw = (): CheckerClaim => { const { flag: _f, probeLine: _p, correctionLine: _c, correctionFigure: _g, pointerLine: _q, vetNotes: _v, ...c } = vetted(); void _f; void _p; void _c; void _g; void _q; void _v; return { ...c, probe: 'How did you get 5 points?' }; };

  it('a verdict: the claims vetted at the message, the code flags (misquotes too) and stamps of the message', async () => {
    const job = startMathCheck({ ...base, misquotes: [{ item: 'revenue_growth', cited: 'grew about 19%', sentence: 'Revenue grew about 19%.' }], check: async () => ({ claims: [raw()], model: 'claude-sonnet-5-5', latencyMs: 5000, stopReason: 'end_turn' }) });
    const r = await job.result;
    expect((r.payload as VerdictPayload).codeFlags).toEqual([{ key: 'misquote:revenue_growth', value: 19, span: 'Revenue grew about 19%.' }]);
    expect(r.subtype).toBe('verdict');
    const v = r.payload as VerdictPayload;
    expect(v.candidateTurnIndex).toBe(3);
    expect(v.claims[0].flag).toBe(true);
    expect(v.claims[0].correctionLine).toBe('A 10% price rise lifts margin about 8.5 points, not 5.');
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
