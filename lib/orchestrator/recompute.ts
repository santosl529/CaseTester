import { classifyError, type MathStepInput, type ErrorClass } from '@/lib/scoring/deterministic';
import { assignSpans, findStepSpans, inputsRevealed } from '@/lib/scoring/math-spans';
import { normalizeNumberWords, articleFor } from '@/lib/number-words';
import { checkStatedArithmetic, type ArithmeticClaim } from './arithmetic-check';
import { checkNestedConversions, formatUnitFlagLine, type ShareBase, type UnitFlag, type UnitVerified } from './unit-check';
import { checkPricingClaims, pricingValues, type PricingClaim } from './pricing-check';

// Rule 2/14 deterministic backstop (docs/interviewer-behavior.md): "Live
// detection by the model alone is a probabilistic capability, not an
// instructable behavior." After each candidate turn, recompute any figure
// derivable from the case's math steps and hand the interviewer a hint it can
// act on. No LLM call — pure regex/arithmetic — so it never threatens turn
// latency.
//
// Deviation from a literal "next turn" reading of Rule 2: this is computed
// from the candidate's message BEFORE the interviewer responds to it, so the
// flag is available in the SAME turn (the interviewer can correct the mistake
// right after it's made, matching Rule 14's fast-path example), not one turn
// late.

// What a flag says the candidate claimed (round-3 fixes): the quantity, its
// units, and — where the figure depends on one — the base and timeframe, from
// the case facts the candidate has. Logged with the flag; never in a hint
// beyond what the candidate already has.
export type FlagClaim = { quantity: string; units?: string; base?: string; timeframe?: string; expression?: string; stated?: string /* a stated range, as said ("7–8") */ };

export type RecomputeFlag = {
  // step: a case math step's answer; unit: a nested-percentage conversion
  // (unit-check.ts); arithmetic: a stated operation that doesn't hold
  // (arithmetic-check.ts); pricing: a price change's stated result that the
  // cost structure doesn't give (pricing-check.ts, 12 Oct). Absent on flags
  // logged before 11 Oct (= step).
  kind?: 'step' | 'unit' | 'arithmetic' | 'pricing';
  stepId: string;
  description: string;
  expected: number;
  candidateValue: number;
  errorClass: Extract<ErrorClass, 'minor' | 'case_breaking'>;
  span: string; // the candidate clause the figure came from (Rule 2 v4.3)
  claim?: FlagClaim;
  unit?: UnitFlag;  // kind 'unit': the full unit finding, for the interviewer line
};

type StepMeta = MathStepInput & { quantity?: string; timeframe?: string };

// v4.3: matched through source spans (lib/scoring/math-spans.ts) and gated on
// revealed inputs. The previous any-number-to-any-step pairing produced all
// three false corrections in the 27–28 Sep persona runs. revealedIds is the
// set of ledger items the candidate has actually received; a step whose
// inputs aren't all in it is never flagged.
export function checkRecomputeForTurn(
  candidateText: string,
  mathSteps: MathStepInput[],
  revealedIds?: Iterable<string>,
): RecomputeFlag[] {
  const revealed = revealedIds === undefined ? undefined : [...revealedIds];
  const checkable = mathSteps.filter(step => step.live !== false && !step.verifyOnly && inputsRevealed(step, revealed));
  if (checkable.length === 0) return [];
  const assigned = assignSpans(candidateText, checkable);

  const flags: RecomputeFlag[] = [];
  for (const step of checkable) {
    const attempt = assigned.get(step.id);
    if (!attempt) continue; // step not stated this turn — no flag
    // A defensible alternative is not an error, and neither is a turn that
    // states a valid answer in another span of the same step.
    const acceptable = [step.answer, ...(step.altAnswers ?? [])];
    const statedValid = findStepSpans(candidateText, step)
      .some(m => acceptable.some(a => Math.abs(m.value - a) <= step.tolerance));
    if (statedValid) continue;
    const errorClass = classifyError(step.answer, step.tolerance, attempt.value);
    if (errorClass === 'minor' || errorClass === 'case_breaking') {
      const meta = step as StepMeta;
      const units = Array.isArray(step.unit) ? step.unit.join(' or ') : step.unit;
      flags.push({
        kind: 'step', stepId: step.id, description: step.description, expected: step.answer, candidateValue: attempt.value, errorClass, span: attempt.span,
        claim: { quantity: meta.quantity ?? step.id.replace(/_/g, ' '), ...(units ? { units } : {}), ...(meta.timeframe ? { timeframe: meta.timeframe } : {}) },
      });
    }
  }
  return flags;
}

// A unit flag (unit-check.ts) as a recompute flag: Rule 14's attempt count
// and the correction on a repeat apply to it like to any step.
export function flagsFromUnitCheck(unitFlags: UnitFlag[]): RecomputeFlag[] {
  return unitFlags.map(f => ({
    kind: 'unit' as const, stepId: `unit:${f.base.split(' ')[0]}`, description: `${f.quantity} in ${f.units}`,
    expected: f.expected, candidateValue: f.stated,
    errorClass: classifyError(f.expected, Math.max(0.3, f.expected * 0.05), f.stated) === 'case_breaking' ? 'case_breaking' as const : 'minor' as const,
    span: f.span, claim: { quantity: f.quantity, units: f.units, base: f.base, timeframe: f.timeframe }, unit: f,
  }));
}

// A stated operation that doesn't hold (arithmetic-check.ts) — the candidate's
// own slip, never one they corrected in the same message.
export function flagsFromArithmetic(claims: ArithmeticClaim[]): RecomputeFlag[] {
  return claims.filter(c => c.verdict === 'incorrect' && !c.selfCorrected).map(c => ({
    kind: 'arithmetic' as const, stepId: `arith:${c.expression}`, description: `${c.expression} = ${c.stated}`,
    expected: Math.round(c.computed * 1000) / 1000, candidateValue: c.stated,
    errorClass: 'case_breaking' as const, span: c.span,
    claim: { quantity: `${c.expression}`, expression: c.expression },
  }));
}

// A pricing claim the cost structure doesn't give (pricing-check.ts): one
// attempt counter per kind of claim, so a second wrong gain after the probe is
// corrected (Rule 14). The correction is the accepted answer nearest theirs —
// derivable, since the check runs only once every cost line is revealed.
export function flagsFromPricing(claims: PricingClaim[]): RecomputeFlag[] {
  return claims.filter(c => c.verdict === 'incorrect').map(c => {
    const expected = c.expected.reduce((a, b) => Math.abs(b - c.stated) < Math.abs(a - c.stated) ? b : a);
    const errorClass = classifyError(expected, 0, c.stated) === 'case_breaking' ? 'case_breaking' as const : 'minor' as const;
    return {
      kind: 'pricing' as const, stepId: `pricing:${c.kind}`, description: pricingClaimText(c),
      expected, candidateValue: c.stated, errorClass, span: c.span,
      claim: { quantity: pricingClaimText(c), ...(c.statedHi !== undefined ? { stated: statedOf(c) } : {}) },
    };
  });
}

// The stated figure as the candidate gave it: a range keeps both ends ("7–8").
const statedOf = (c: PricingClaim) => c.statedHi !== undefined ? `${c.stated}–${c.statedHi}` : String(c.stated);

function pricingClaimText(c: PricingClaim): string {
  const x = statedOf(c);
  switch (c.kind) {
    case 'gain': return `${articleFor(c.price)} ${c.price}% price rise recovers ${x} points of margin`;
    case 'new_margin': return `${articleFor(c.price)} ${c.price}% price rise takes margin to ${x}%`;
    case 'needed': return `${articleFor(x)} ${x}% price rise reaches their target margin`;
    case 'dollars': return `${articleFor(c.price)} ${c.price}% price rise is worth $${x}M`;
    case 'breakeven': return `${articleFor(c.price)} ${c.price}% price rise breaks even at ${articleFor(x)} ${x}% volume loss`;
  }
}

// Figures verified correct outside the case's steps: stated arithmetic that
// holds (the work is on the page) and conversions at a given base.
export function verifiedFromChecks(claims: ArithmeticClaim[], unitVerified: UnitVerified[], pricing: PricingClaim[] = []): VerifiedFigure[] {
  return [
    // A ratio is also verified as the percent change it states ("58/42 = 1.38"
    // verifies "up 38%"), and a share as its percent reading.
    ...claims.filter(c => c.verdict === 'correct').flatMap(c => {
      const readings = [c.stated];
      if (c.stated > 0.5 && c.stated < 3 && !Number.isInteger(c.stated)) readings.push(Math.round((c.stated - 1) * 1000) / 10, Math.round(c.stated * 1000) / 10);
      return readings.map(value => ({ stepId: `arith:${c.expression}`, scope: 'arithmetic' as const, value, span: c.span, workShown: true, operands: [] }));
    }),
    ...unitVerified.map(u => ({ stepId: `unit:${u.stated}`, scope: 'claim' as const, value: u.stated, span: u.span, workShown: false, operands: [] })),
    // A pricing claim states the price change with its result, and the check
    // verified the link: work shown — not even a process question (batch 20
    // replay: "How did you get to 5%?" on Tyler's correct 5 points).
    ...pricing.filter(p => p.verdict === 'correct').map(p => ({ stepId: `pricing:${p.kind}`, scope: 'claim' as const, value: p.stated, span: p.span, workShown: true, operands: [] })),
  ];
}

// The figure as the candidate wrote it ("1.6%", "43.3 points", "$20 million"),
// for a neutral request for the working. Read from the flag's own span where
// there is one, so another figure of the same value isn't picked up.
export function figureAsWritten(text: string, figure: number): string {
  const n = String(figure).replace('.', '\\.');
  const m = new RegExp(`(?:\\$\\s?)?(?<![\\d.])${n}(?:\\s?%|\\s+(?:percentage\\s+)?points?|\\s+percent|\\s?(?:million|billion|m|bn)\\b)?`, 'i').exec(text);
  return m ? m[0] : String(figure);
}

// The period fact that corrects a period mismatch (13 Oct): the share's own
// year and that year's base — both figures the candidate was given. No
// replacement figure: the right one may need data the flag doesn't carry.
export function periodCorrection(u: UnitFlag): string {
  const p = u.period!;
  const line = u.base.split(' ')[0];
  return `That ${p.share}% share of ${line} is from ${p.sharePeriod === 'prior' ? 'two years ago' : 'today'}, when ${line} was ${p.samePeriodBase}% of revenue.`;
}

// A flagged figure in the reply to a recommendation ask, said by code (fact
// guards Phase 4): Rule 14's probe — the working, never the right figure — or,
// past it, the correction in the candidate's units. A unit slip is corrected
// by its units alone ("That's 25% of COGS, not 25 points of revenue"): its
// revenue figure depends on which year's base the candidate meant.
export function recMathLine(f: RecomputeFlag, action: 'probe' | 'correct'): string {
  if (f.unit?.period) {
    const line = f.unit.base.split(' ')[0];
    return action === 'probe'
      ? `Before we wrap up — which year's ${line} does that ${f.unit.period.share}% share belong to?`
      : periodCorrection(f.unit);
  }
  if (action === 'probe') {
    if (f.kind === 'pricing') return `Before we wrap up — you said ${f.claim?.quantity}. Walk me through how you sized that.`;
    const fig = f.kind === 'unit' ? `${f.candidateValue} ${f.claim?.units}` : figureAsWritten(f.span, f.candidateValue);
    return `Before we wrap up — walk me through how you got to ${fig}.`;
  }
  if (f.kind === 'unit' && f.unit) return `That's ${f.unit.unconverted}% of ${f.unit.base.split(' ')[0]}, not ${f.candidateValue} ${f.unit.units}.`;
  if (f.kind === 'arithmetic') return `${f.claim?.expression} is about ${Math.round(f.expected * 100) / 100}, not ${f.candidateValue}.`;
  if (f.kind === 'pricing') {
    const unit = (x: number) => ({ gain: `${x} points of margin`, new_margin: `${x}%`, needed: `${x}%`, dollars: `$${x}M`, breakeven: `${x}% of volume` } as Record<string, string>)[f.stepId.slice('pricing:'.length)] ?? String(x);
    return `It's closer to ${unit(f.expected)}, not ${f.claim?.stated ?? f.candidateValue}.`;
  }
  const theirs = figureAsWritten(f.span, f.candidateValue);
  return `It's closer to ${theirs.replace(String(f.candidateValue), String(f.expected))}, not ${theirs}.`;
}

// Rule 14 attempt state, per math step: how many times the candidate has
// stated a wrong figure for it. Orchestrator state, persisted in session
// flags — the model never counts attempts itself (Maya c230fe12 got four
// Socratic rounds on one calculation).
export type RecomputeAttempts = Record<string, number>;

export function recordAttempts(prior: RecomputeAttempts, flags: RecomputeFlag[]): RecomputeAttempts {
  const next = { ...prior };
  for (const f of flags) next[f.stepId] = (next[f.stepId] ?? 0) + 1;
  return next;
}

export type RecomputeAction = 'probe' | 'correct' | 'shed';

// Rule 14: first wrong statement → one probe; still wrong → supply the figure
// and advance (two-attempt cap); under time pressure a case-breaking error is
// corrected at once (fast path) and a minor one is shed (Rule 15).
export function recomputeAction(flag: RecomputeFlag, attempt: number, underTimePressure: boolean): RecomputeAction {
  if (underTimePressure) return flag.errorClass === 'case_breaking' ? 'correct' : 'shed';
  return attempt >= 2 ? 'correct' : 'probe';
}

// Lorenzo, 13 Oct (Larkspur: 19 false "It's closer to X, not Y" from step
// flags bound to the wrong step): no code-written correction of a computed
// figure from a deterministic flag alone. A step, arithmetic or pricing flag
// probes; past the probe it says nothing — the correction comes only through
// the math checker (code's own figure, once the checker agrees and the input
// is bound; math-checker.ts). A unit or period line restates units or a case
// figure, so it stays code's.
export function codeMayCorrect(flag: RecomputeFlag): boolean {
  return flag.kind === 'unit';
}

// Whether the flag puts a line in the interviewer's mouth this turn.
export function flagSpeaks(flag: RecomputeFlag, attempt: number, underTimePressure: boolean): boolean {
  const action = recomputeAction(flag, attempt, underTimePressure);
  return action === 'probe' || (action === 'correct' && codeMayCorrect(flag));
}

// The hint never carries the step description — it can hold unrevealed
// ledger values (persona run 6caca9a1 read "$480M / 200 stores" out of it).
// A derived figure appears only on a correction, and only because the flag's
// inputs are all revealed (checkRecomputeForTurn's gate), so it is derivable
// from what the candidate already has. Returns the derived figures it
// licenses, which the provenance audit accepts this turn (Rule 6).
export function formatRecomputeHint(
  flags: RecomputeFlag[],
  opts: { attempts?: RecomputeAttempts; underTimePressure?: boolean } = {},
): { hint: string; derivedValues: string[] } {
  const lines: string[] = [];
  const derivedValues: string[] = [];
  for (const f of flags) {
    const attempt = opts.attempts?.[f.stepId] ?? 1;
    const action = recomputeAction(f, attempt, Boolean(opts.underTimePressure));
    if (action === 'shed' || !flagSpeaks(f, attempt, Boolean(opts.underTimePressure))) continue;
    if (f.kind === 'unit' && f.unit && action === 'probe') { lines.push(formatUnitFlagLine(f.unit)); continue; }
    if (f.kind === 'unit' && f.unit?.period) {
      lines.push(`- The candidate said ${f.candidateValue} in "${f.span}", applying a share from one year to the other year's base. This overrides the no-correction rule: say this in "say", once, as written — "${periodCorrection(f.unit)}" — then continue. No probe, no consolation, no figure of your own.`);
      continue;
    }
    if (f.kind === 'arithmetic' && action === 'probe') {
      lines.push(`- The candidate wrote ${f.claim?.expression} = ${f.candidateValue} in "${f.span}"; that operation doesn't give ${f.candidateValue}. Probe once — "Walk me through that calculation." Do not correct it or say the right figure.`);
      continue;
    }
    if (f.kind === 'pricing' && action === 'probe') {
      lines.push(`- The candidate said ${f.claim?.quantity} in "${f.span}"; that doesn't follow from the cost structure they have. Probe once — "Walk me through how you sized that price move." Do not correct it or say the right figure.`);
      continue;
    }
    if (action === 'probe') {
      lines.push(`- The candidate said ${f.candidateValue} in "${f.span}" and it does not match the value derivable from the data they have. Probe once — "Walk me through that." Do not correct it or say what the right figure is.`);
    } else {
      derivedValues.push(String(f.expected));
      const theirs = f.claim?.stated ?? f.candidateValue;
      lines.push(`- The candidate said ${theirs} in "${f.span}"; the figure derivable from the data they have is ${f.expected}. This overrides the no-correction rule: correct it in "say", one flat sentence quoting their figure — e.g. "It's closer to ${f.expected}, not ${theirs}. Let's take that and keep going." — then continue. No probe, no consolation.`);
    }
  }
  if (lines.length === 0) return { hint: '', derivedValues };
  return {
    hint: `RECOMPUTE FLAG (deterministic, matched to what the candidate said this turn):\n${lines.join('\n')}`,
    derivedValues,
  };
}

// ── Verified figures (Rule 2 v4.5/v4.6) ─────────────────────────────────────
// The other half of the recompute signal: a figure the candidate stated that
// matches a case math step (valid span, revealed inputs, within tolerance).
// In batch 2 five correct figures were probed — four with the work shown
// ("25 × 42 = 10.5% of revenue"), and Ines apologized for correct math. The
// interviewer is told which figures are verified and whether the work was
// shown, and a pre-send pass withholds probes it may not ask (probe-guard.ts).

export type VerifiedFigure = {
  stepId: string;
  // claim: the figure is the quantity the candidate claims, checked against
  // the case (a math step, a conversion at the right base, a pricing claim).
  // arithmetic: only the stated operation holds ("18 / 1.15 = 15.7") — not
  // that it is the right calculation for what it supports. Absent on figures
  // saved before 13 Oct: read from the step id (isClaimVerified).
  scope?: 'claim' | 'arithmetic';
  value: number;
  span: string;
  workShown: boolean;
  operands: number[]; // the step's inputs — a probe quoting them is about this figure
};

// "a quarter" / "half" are how candidates say 25 and 50 out loud.
const SPOKEN_OPERANDS: Record<number, RegExp> = { 25: /\ba quarter\b/i, 50: /\bhalf\b/i };
const OPERATION = /×|\*|\bx\b|\btimes\b|\bof\b|\bdivided by\b|\bover\b|÷|\bmultipl\w*/i;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean);
}

function statesOperand(text: string, operand: number): boolean {
  const nums = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
  // 25 may be written 0.25 ("0.25 × 42", Ines).
  return nums.some(n => Math.abs(n - operand) < 1e-9 || Math.abs(n * 100 - operand) < 1e-6)
    || Boolean(SPOKEN_OPERANDS[operand]?.test(text));
}

// Work counts as shown when the span's sentence, or the two sentences before
// it in the same turn, state every operand AND an operation joining them
// (Rule 2 v4.5). Naming inputs without the operation — or only the result —
// is a bare figure. A step without declared operands can't show work.
export function isWorkShown(candidateText: string, span: string, operands: number[] | undefined): boolean {
  if (!operands || operands.length === 0) return false;
  const sentences = sentencesOf(normalizeNumberWords(candidateText));
  const idx = sentences.findIndex(s => s.includes(span));
  if (idx === -1) return false;
  const window = sentences.slice(Math.max(0, idx - 2), idx + 1).join(' ');
  return operands.every(o => statesOperand(window, o)) && OPERATION.test(window);
}

// A figure is verified only when it is the quantity the sentence claims (math
// checker, 13 Oct; batch 21 stamped four wrong claims correct): not one end of
// a range ("10–12% on menu prices", Fiona t16/t20). checkCandidateMath adds
// the checks that need the case and the message's arithmetic.
export function checkVerifiedForTurn(
  candidateText: string,
  mathSteps: MathStepInput[],
  revealedIds?: Iterable<string>,
): VerifiedFigure[] {
  const revealed = revealedIds === undefined ? undefined : [...revealedIds];
  const out: VerifiedFigure[] = [];
  for (const step of mathSteps.filter(st => inputsRevealed(st, revealed))) {
    const acceptable = [step.answer, ...(step.altAnswers ?? [])];
    const hit = findStepSpans(candidateText, step, 'sentence').find(m => !m.range && acceptable.some(a => Math.abs(m.value - a) <= step.tolerance));
    if (hit) out.push({ stepId: step.id, scope: 'claim', value: hit.value, span: hit.span, workShown: isWorkShown(candidateText, hit.span, step.operands), operands: step.operands ?? [] });
  }
  return out;
}

const numbersIn = (text: string) => [...normalizeNumberWords(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));

type Period = 'current' | 'prior';

// The case figures with a period the candidate has, and the complement of a
// share the case states of a share base ("Coffee beans were 25% of COGS two
// years ago" → 75 for the other inputs, also two years ago).
function periodFigures(caseData: MathCaseData, ids: string[]): { value: number; period: Period }[] {
  const bases = (caseData.shareBases ?? []).flatMap(b => [b.name, ...b.aliases]).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const out: { value: number; period: Period }[] = [];
  for (const item of caseData.dataLedger.filter(d => ids.includes(d.id))) {
    for (const [fig, tf] of Object.entries(item.timeframes ?? {})) {
      if (tf !== 'current' && tf !== 'prior') continue;
      const value = parseFloat(fig);
      out.push({ value, period: tf });
      const share = bases.length > 0 && new RegExp(`(?<![\\d.])${fig.replace('.', '\\.')}\\s*(?:%|percent)\\s+of\\s+(?:the\\s+|total\\s+)?(?:${bases.join('|')})\\b`, 'i').test(item.value);
      if (share) out.push({ value: 100 - value, period: tf });
    }
  }
  return out;
}

// A stated operation whose operands are case figures of two periods: Marisol
// t8 (batch 21), "the remaining 75%, so 0.75 × 58 = 43.5 points" — the old mix
// on today's COGS. Its result is within tolerance of the other inputs' 43.3
// points today by accident, and the sentence uses it as the base before the
// rise.
function mixesPeriods(expression: string, figures: { value: number; period: Period }[]): boolean {
  const periods = new Set<Period>();
  for (const n of numbersIn(expression)) {
    for (const f of figures) if ([n, n * 100].some(x => Math.abs(x - f.value) < 1e-6)) periods.add(f.period);
  }
  return periods.size > 1;
}

// The case prompt's figures: a step whose answer the prompt already gives
// ("net profit margin declined from 24% to 6%") is quoted, not derived, unless
// the step's inputs for one period are stated with it ("42 + 22 + 12 = 76,
// leaving 24% margin"). Sofia t16 (batch 21): "restore the 24% margin" was
// stamped, and the model told not to question the sentence.
function derivesPromptFigure(text: string, v: VerifiedFigure, step: MathStepInput | undefined, caseData: MathCaseData, ids: string[]): boolean {
  const answers = step ? [step.answer, ...(step.altAnswers ?? [])] : [];
  if (!numbersIn(caseData.prompt ?? '').some(q => answers.some(a => Math.abs(q - a) < 1e-9))) return true;
  const inputs = (step?.inputs ?? []).map(id => caseData.dataLedger.find(d => d.id === id));
  if (inputs.length === 0 || inputs.some(i => !i || !ids.includes(i.id))) return false;
  const sentences = normalizeNumberWords(text).split(/(?<=[.!?])\s+|\n+/);
  const idx = sentences.findIndex(x => x.includes(v.span) || v.span.includes(x.trim()));
  const nums = numbersIn(sentences.slice(Math.max(0, idx - 2), idx + 1).join(' '));
  return (['current', 'prior'] as const).some(period => inputs.every(i => Object.entries(i!.timeframes ?? {})
    .some(([fig, tf]) => (tf === period || tf === 'both') && nums.some(n => Math.abs(n - parseFloat(fig)) < 1e-9))));
}

// Same sentence of the message (spans are sentences or clauses of it).
function sameSentence(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

// The case data the candidate-math checks read.
export type MathCaseData = {
  prompt?: string;
  mathSteps: MathStepInput[];
  shareBases?: ShareBase[];
  dataLedger: { id: string; value: string; timeframes?: Record<string, string> }[];
  pricingModel?: { costItems: string[]; variableSets: string[][]; revenueItem?: string };
  stepFlagsLive?: boolean;
};

export type CandidateMath = {
  flags: RecomputeFlag[];
  reportOnly: RecomputeFlag[];  // step flags of a case whose binding isn't validated: logged only (Lorenzo, 13 Oct)
  verified: VerifiedFigure[];
  arithmetic: ArithmeticClaim[];
  units: { flags: UnitFlag[]; verified: UnitVerified[] };
  pricing: PricingClaim[];
};

// Rule 2/14: one candidate message checked in code, three ways — the case's
// math steps (only steps whose inputs the candidate has), stated arithmetic,
// nested-percentage conversions at the base the candidate was given, and
// pricing claims once every cost line is out. Each figure ends up flagged
// wrong, verified, or unverified. The live turn (plan-turn.ts) and scoring
// (challenge-marks.ts) both read it.
export function checkCandidateMath(candidateText: string, caseData: MathCaseData, revealedIds: Iterable<string>): CandidateMath {
  const ids = [...revealedIds];
  const allStepFlags = checkRecomputeForTurn(candidateText, caseData.mathSteps, ids);
  // Report-only until the case's step binding is validated (Larkspur: 19 false corrections).
  const stepFlags = caseData.stepFlagsLive ? allStepFlags : [];
  const reportOnly = caseData.stepFlagsLive ? [] : allStepFlags;
  const arithmetic = checkStatedArithmetic(candidateText);
  const units = checkNestedConversions(candidateText, { bases: caseData.shareBases ?? [], items: caseData.dataLedger, revealedIds: ids });
  const pm = pricingValues(caseData, new Set(ids));
  const pricing = pm ? checkPricingClaims(candidateText, pm) : [];
  const flags = [
    ...stepFlags,
    ...flagsFromUnitCheck(units.flags),
    ...flagsFromArithmetic(arithmetic).filter(a => !allStepFlags.some(f => f.candidateValue === a.candidateValue)),
  ];
  flags.push(...flagsFromPricing(pricing).filter(p => !flags.some(f => f.candidateValue === p.candidateValue)));
  const periods = periodFigures(caseData, ids);
  const stepVerified = checkVerifiedForTurn(candidateText, caseData.mathSteps, ids).filter(v =>
    derivesPromptFigure(candidateText, v, caseData.mathSteps.find(st => st.id === v.stepId), caseData, ids)
    && !arithmetic.some(a => Math.abs(a.stated - v.value) < 1e-6 && sameSentence(a.span, v.span) && mixesPeriods(a.expression, periods)));
  // A flag wins in its sentence: no figure there a check found wrong is also
  // stamped, and no arithmetic — it is the working of the flagged claim
  // (Marisol t10: "a price increase of roughly 18 / 1.15 = 15.7%, call it 16%"
  // — the operation holds, the 16% needed doesn't).
  const flagged = (v: VerifiedFigure) => flags.some(f => sameSentence(f.span, v.span)
    && (Math.abs(f.candidateValue - v.value) < 1e-9 || !isClaimVerified(v)));
  const verified = [
    ...stepVerified,
    ...verifiedFromChecks(arithmetic, units.verified, pricing).filter(v => !stepVerified.some(x => Math.abs(x.value - v.value) < 1e-9)),
  ].filter(v => !flagged(v));
  return { flags, reportOnly, verified, arithmetic, units, pricing };
}

// Every figure of one candidate message the checks verify — the live turn's
// VERIFIED FIGURES and scoring's record.
export function verifiedForMessage(candidateText: string, caseData: MathCaseData, revealedIds: Iterable<string>): VerifiedFigure[] {
  return checkCandidateMath(candidateText, caseData, revealedIds).verified;
}

export function isClaimVerified(v: VerifiedFigure): boolean {
  return (v.scope ?? (v.stepId.startsWith('arith:') ? 'arithmetic' : 'claim')) === 'claim';
}

// recompute_ok: the interviewer-facing line per verified figure (Rule 2 v4.5).
// Stated arithmetic gets its own line: the operation holds, the claim it
// supports is unchecked — never "Do not probe it" (Marisol t10, batch 21).
export function formatVerifiedHint(verified: VerifiedFigure[], alreadyProbed: Set<string>): string {
  if (verified.length === 0) return '';
  // One line per operation: a ratio's percent readings ("58 / 42 = 1.38" is
  // also 38 and 138) come after the stated result.
  const shown = verified.filter((v, i) => isClaimVerified(v) || verified.findIndex(x => x.stepId === v.stepId) === i);
  const lines = shown.map(v => {
    if (!isClaimVerified(v)) {
      return `- arithmetic_ok: ${v.stepId.slice('arith:'.length)} = ${v.value} holds (in "${v.span}"). That checks the operation only, not whether it is the right calculation for what they claim: don't question the arithmetic, and don't treat the claim as verified.`;
    }
    const allowed = v.workShown || alreadyProbed.has(v.stepId)
      ? 'Do not probe it at all.'
      : 'At most one process question — "How did you get there?" — if it is decision-relevant. Never doubt phrasing.';
    return `- recompute_ok: ${v.value} verified (in "${v.span}"), work_shown: ${v.workShown ? 'yes' : 'no'}. ${allowed}`;
  });
  return `VERIFIED FIGURES (deterministic — a recompute_ok figure is correct): never question them with doubt phrasing ("points of what?", "are you sure?", "check that", "is that right?").\n${lines.join('\n')}`;
}
