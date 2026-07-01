export type MathStepInput = {
  id: string;
  description: string;
  answer: number;
  tolerance: number;
};

export type MathStepResult = {
  id: string;
  description: string;
  expected: number;
  tolerance: number;
  mentioned: boolean;
  candidateValue: number | null;
  withinTolerance: boolean;
};

type TranscriptTurn = { role: string; text: string };

function extractNumbers(text: string): number[] {
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
    const lo = step.answer - step.tolerance;
    const hi = step.answer + step.tolerance;

    // Find the closest number to the expected answer in candidate transcript
    const closest = numbersInTranscript.length > 0
      ? numbersInTranscript.reduce((best, n) =>
          Math.abs(n - step.answer) < Math.abs(best - step.answer) ? n : best
        )
      : null;

    const inRange = closest !== null && closest >= lo && closest <= hi;

    return {
      id: step.id,
      description: step.description,
      expected: step.answer,
      tolerance: step.tolerance,
      // mentioned = candidate said any number at all (proxy for having attempted this step)
      mentioned: closest !== null,
      candidateValue: closest,
      withinTolerance: inRange,
    };
  });
}
