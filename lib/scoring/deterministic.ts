import { assignSpans, findStepSpans, inputsRevealed, type MathUnit } from './math-spans';

export type MathStepInput = {
  id: string;
  description: string;
  answer: number;
  tolerance: number;
  altAnswers?: number[];
  // Source-span metadata (lib/scoring/math-spans.ts, Rule 3 v4.3).
  cues?: string[];
  unit?: MathUnit;
  inputs?: string[];
  // false: never checked by the live recompute hint (prompt facts such as the
  // 24% → 6% margins — candidates quote and reuse them constantly).
  live?: boolean;
};

// Error-severity classification (docs/interviewer-behavior.md Rule 14):
// bands are encoded here, not left to model judgment, so the interviewer/judge
// don't nitpick reasonable rounding while missing unit-conversion-scale errors.
// non_issue: within tolerance — never probed.
// minor: materially wrong but same direction/order of magnitude — sheddable under time pressure.
// case_breaking: wrong direction, or ≥2× off in magnitude — never shed, changes the root cause.
// unmentioned: candidate never stated a number close to this step.
export type ErrorClass = 'non_issue' | 'minor' | 'case_breaking' | 'unmentioned';

// "Configurable per case" per Rule 14; flat default until case config exposes it.
const CASE_BREAKING_RATIO = 2;

export function classifyError(expected: number, tolerance: number, candidateValue: number | null): ErrorClass {
  if (candidateValue === null) return 'unmentioned';
  const lo = expected - tolerance;
  const hi = expected + tolerance;
  if (candidateValue >= lo && candidateValue <= hi) return 'non_issue';

  if (expected === 0) return candidateValue === 0 ? 'non_issue' : 'minor';

  const ratio = candidateValue / expected;
  const wrongDirection = Math.sign(candidateValue) !== Math.sign(expected);
  const magnitudeOff = ratio >= CASE_BREAKING_RATIO || ratio <= 1 / CASE_BREAKING_RATIO;
  return (wrongDirection || magnitudeOff) ? 'case_breaking' : 'minor';
}

export type MathStepResult = {
  id: string;
  description: string;
  expected: number;
  tolerance: number;
  mentioned: boolean;
  candidateValue: number | null;
  withinTolerance: boolean;
  errorClass: ErrorClass;
  span?: string | null; // the candidate clause the value came from (Rule 3 v4.3)
};

type TranscriptTurn = { role: string; text: string };

export function extractNumbers(text: string): number[] {
  return [...text.matchAll(/\b\d[\d,]*\.?\d*\b/g)]
    .map(m => parseFloat(m[0].replace(/,/g, '')))
    .filter(n => !isNaN(n));
}

// Scoring-side check over the whole transcript. A step counts as attempted
// only through a source span (math-spans.ts) — the old "closest number
// anywhere in the transcript" rule reported a false revenue-per-store error in
// most persona-run reports. A step whose ledger inputs were never revealed is
// not scored at all (Omar faa999fd was scored on revenue never released).
export function checkMathSteps(
  transcript: TranscriptTurn[],
  mathSteps: MathStepInput[],
  revealedIds?: Iterable<string>,
): MathStepResult[] {
  const candidateText = transcript.filter(t => t.role === 'candidate').map(t => t.text).join('\n');
  const revealed = revealedIds === undefined ? undefined : [...revealedIds];
  const checkable = mathSteps.filter(step => inputsRevealed(step, revealed));
  const assigned = assignSpans(candidateText, checkable);

  return mathSteps.map(step => {
    const base = { id: step.id, description: step.description, expected: step.answer, tolerance: step.tolerance };
    const unmentioned = { ...base, mentioned: false, candidateValue: null, withinTolerance: false, errorClass: 'unmentioned' as ErrorClass, span: null };
    if (!checkable.includes(step)) return unmentioned;

    // A step can have several defensible results; any span landing within
    // tolerance of any acceptable answer credits the step.
    const acceptable = [step.answer, ...(step.altAnswers ?? [])];
    const correct = findStepSpans(candidateText, step)
      .find(m => acceptable.some(a => Math.abs(m.value - a) <= step.tolerance));
    if (correct) {
      return { ...base, mentioned: true, candidateValue: correct.value, withinTolerance: true, errorClass: 'non_issue' as ErrorClass, span: correct.span };
    }
    const attempt = assigned.get(step.id);
    if (!attempt) return unmentioned;
    return {
      ...base,
      mentioned: true,
      candidateValue: attempt.value,
      withinTolerance: false,
      errorClass: classifyError(step.answer, step.tolerance, attempt.value),
      span: attempt.span,
    };
  });
}
