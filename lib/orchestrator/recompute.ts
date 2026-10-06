import { classifyError, type MathStepInput, type ErrorClass } from '@/lib/scoring/deterministic';
import { assignSpans, findStepSpans, inputsRevealed } from '@/lib/scoring/math-spans';
import { normalizeNumberWords } from '@/lib/number-words';

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

export type RecomputeFlag = {
  stepId: string;
  description: string;
  expected: number;
  candidateValue: number;
  errorClass: Extract<ErrorClass, 'minor' | 'case_breaking'>;
  span: string; // the candidate clause the figure came from (Rule 2 v4.3)
};

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
      flags.push({ stepId: step.id, description: step.description, expected: step.answer, candidateValue: attempt.value, errorClass, span: attempt.span });
    }
  }
  return flags;
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
    if (action === 'shed') continue;
    if (action === 'probe') {
      lines.push(`- The candidate said ${f.candidateValue} in "${f.span}" and it does not match the value derivable from the data they have. Probe once — "Walk me through that." Do not correct it or say what the right figure is.`);
    } else {
      derivedValues.push(String(f.expected));
      lines.push(`- The candidate said ${f.candidateValue} in "${f.span}"; the figure derivable from the data they have is ${f.expected}. This overrides the no-correction rule: correct it in "say", one flat sentence quoting their figure — e.g. "It's closer to ${f.expected}, not ${f.candidateValue}. Let's take that and keep going." — then continue. No probe, no consolation.`);
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

export function checkVerifiedForTurn(
  candidateText: string,
  mathSteps: MathStepInput[],
  revealedIds?: Iterable<string>,
): VerifiedFigure[] {
  const revealed = revealedIds === undefined ? undefined : [...revealedIds];
  const out: VerifiedFigure[] = [];
  for (const step of mathSteps.filter(st => inputsRevealed(st, revealed))) {
    const acceptable = [step.answer, ...(step.altAnswers ?? [])];
    const hit = findStepSpans(candidateText, step, 'sentence').find(m => acceptable.some(a => Math.abs(m.value - a) <= step.tolerance));
    if (hit) out.push({ stepId: step.id, value: hit.value, span: hit.span, workShown: isWorkShown(candidateText, hit.span, step.operands), operands: step.operands ?? [] });
  }
  return out;
}

// recompute_ok: the interviewer-facing line per verified figure (Rule 2 v4.5).
export function formatVerifiedHint(verified: VerifiedFigure[], alreadyProbed: Set<string>): string {
  if (verified.length === 0) return '';
  const lines = verified.map(v => {
    const allowed = v.workShown || alreadyProbed.has(v.stepId)
      ? 'Do not probe it at all.'
      : 'At most one process question — "How did you get there?" — if it is decision-relevant. Never doubt phrasing.';
    return `- recompute_ok: ${v.value} verified (in "${v.span}"), work_shown: ${v.workShown ? 'yes' : 'no'}. ${allowed}`;
  });
  return `VERIFIED FIGURES (deterministic — these are correct): never question them with doubt phrasing ("points of what?", "are you sure?", "check that", "is that right?").\n${lines.join('\n')}`;
}
