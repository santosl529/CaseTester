import { extractNumbers, classifyError, type MathStepInput, type ErrorClass } from '@/lib/scoring/deterministic';

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
};

export function checkRecomputeForTurn(
  candidateText: string,
  mathSteps: MathStepInput[],
): RecomputeFlag[] {
  const numbers = extractNumbers(candidateText);
  if (numbers.length === 0 || mathSteps.length === 0) return [];

  // Deliberately NOT checkMathSteps' "closest number in the whole text"
  // heuristic: that assumes a large number pool (the full transcript), so
  // collisions are rare. A single candidate turn is number-scarce — the same
  // heuristic would let one stated number "explain" several unrelated math
  // steps (e.g. one turn with a single "6" would independently satisfy both
  // a margin step expecting 6 AND a $76.8M COGS-impact step, wrongly flagging
  // the latter as a case-breaking miss). Instead: a global greedy one-to-one
  // assignment — each stated number matches at most one step, its best
  // available one, ranked by relative error across ALL (step, number) pairs.
  type Pairing = { stepIdx: number; numIdx: number; relError: number };
  const pairings: Pairing[] = [];
  mathSteps.forEach((step, stepIdx) => {
    numbers.forEach((n, numIdx) => {
      const relError = step.answer === 0 ? Math.abs(n) : Math.abs(n - step.answer) / Math.abs(step.answer);
      pairings.push({ stepIdx, numIdx, relError });
    });
  });
  pairings.sort((a, b) => a.relError - b.relError);

  const claimedSteps = new Set<number>();
  const claimedNumbers = new Set<number>();
  const assignment = new Map<number, number>(); // stepIdx -> numIdx
  for (const p of pairings) {
    if (claimedSteps.has(p.stepIdx) || claimedNumbers.has(p.numIdx)) continue;
    claimedSteps.add(p.stepIdx);
    claimedNumbers.add(p.numIdx);
    assignment.set(p.stepIdx, p.numIdx);
  }

  const flags: RecomputeFlag[] = [];
  mathSteps.forEach((step, stepIdx) => {
    const numIdx = assignment.get(stepIdx);
    if (numIdx === undefined) return; // step not mentioned this turn — no flag
    const candidateValue = numbers[numIdx];
    // A defensible alternative result is not an error (see MathStep.altAnswers).
    // Also check whether the candidate stated a valid answer with ANY number
    // this turn — the greedy assignment can hand this step a wrong number while
    // the right one sits elsewhere in a number-dense turn.
    const acceptable = [step.answer, ...(step.altAnswers ?? [])];
    const statedValid = numbers.some(n => acceptable.some(a => Math.abs(n - a) <= step.tolerance));
    if (statedValid) return;
    const errorClass = classifyError(step.answer, step.tolerance, candidateValue);
    if (errorClass === 'minor' || errorClass === 'case_breaking') {
      flags.push({ stepId: step.id, description: step.description, expected: step.answer, candidateValue, errorClass });
    }
  });
  return flags;
}

export function formatRecomputeHint(flags: RecomputeFlag[]): string {
  if (flags.length === 0) return '';
  const lines = flags.map(f => {
    const action = f.errorClass === 'case_breaking'
      ? 'CASE-BREAKING — always address this now, even under time pressure (Rule 14 fast path: one short correction, e.g. "Quick correction — it\'s closer to X, not Y.")'
      : 'minor — probe once ("Walk me through that.") if you have not already used your probe budget';
    return `- "${f.description}": candidate said ${f.candidateValue}, derived answer is ${f.expected}. ${action}`;
  });
  return `RECOMPUTE FLAG (deterministic, from the candidate's message this turn — you do not need to have caught this yourself):\n${lines.join('\n')}`;
}
