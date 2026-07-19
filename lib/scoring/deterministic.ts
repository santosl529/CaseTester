export type MathStepInput = {
  id: string;
  description: string;
  answer: number;
  tolerance: number;
  altAnswers?: number[];
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
};

type TranscriptTurn = { role: string; text: string };

export function extractNumbers(text: string): number[] {
  return [...text.matchAll(/\b\d[\d,]*\.?\d*\b/g)]
    .map(m => parseFloat(m[0].replace(/,/g, '')))
    .filter(n => !isNaN(n));
}

export function checkMathSteps(
  transcript: TranscriptTurn[],
  mathSteps: MathStepInput[],
): MathStepResult[] {
  const candidateTurns = transcript.filter(t => t.role === 'candidate').map(t => t.text).join(' ');
  const numbersInTranscript = extractNumbers(candidateTurns);

  return mathSteps.map(step => {
    const acceptable = [step.answer, ...(step.altAnswers ?? [])];

    // A step can have several defensible results (e.g. margin impact vs actual
    // spend increase). If ANY stated number lands within tolerance of ANY
    // acceptable answer, the candidate computed a valid figure — credit it even
    // if a closer-to-primary number exists elsewhere in the turn.
    const correctMatch = numbersInTranscript.find(n =>
      acceptable.some(a => n >= a - step.tolerance && n <= a + step.tolerance));

    if (correctMatch !== undefined) {
      return {
        id: step.id,
        description: step.description,
        expected: step.answer,
        tolerance: step.tolerance,
        mentioned: true,
        candidateValue: correctMatch,
        withinTolerance: true,
        errorClass: 'non_issue' as ErrorClass,
      };
    }

    // No valid answer stated — classify the closest-to-primary number as the attempt.
    const closest = numbersInTranscript.length > 0
      ? numbersInTranscript.reduce((best, n) =>
          Math.abs(n - step.answer) < Math.abs(best - step.answer) ? n : best
        )
      : null;

    return {
      id: step.id,
      description: step.description,
      expected: step.answer,
      tolerance: step.tolerance,
      mentioned: closest !== null,
      candidateValue: closest,
      withinTolerance: false,
      errorClass: classifyError(step.answer, step.tolerance, closest),
    };
  });
}
