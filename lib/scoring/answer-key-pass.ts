import type { RubricScores, Rating } from './judge';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from './rubric';

// Answer-key and caveat-text pass (docs/interviewer-behavior.md Rule 3 v4.5;
// docs/scoring-qa.md). The model answer shows what a strong answer CAN look
// like; it is not a checklist. In batch 2 Camila, Micah and Tobias were each
// dropped to meets_bar in Creativity for not proposing the answer key's
// "lower-cost commodity blend" — three of the five rating changes no
// difference in performance explains.
//
// Deterministic, after the error-claim verifier and before reconciliation:
// - A needs-work item that names an answer-key idea the candidate never
//   raised is a missing-idea weakness → removed. If the candidate raised the
//   idea themselves, a weakness about how they handled it stays.
// - In a dimension carrying a coverageCaveat, a needs-work item citing the
//   un-administered stage is removed (Tobias: "not a candidate failing", then
//   "Solution set stayed narrow").
// - A dimension this pass emptied of needs-work items is re-rated one level
//   up — it was rated down only for what was removed. Never to strong without
//   anything in wentWell.

export type AnswerKeyIdea = { idea: string; phrases: string[] };

const STAGE_TERMS: Partial<Record<RubricDimensionKey, RegExp>> = {
  creativity: /\b(brainstorm\w*|ideas?|solution set|levers?|options|creativ\w*|breadth)\b/i,
  synthesis: /\b(recommendation|synthes\w*|bottom[- ]line|conclusion|final answer)\b/i,
};

// The caveat is about a stage the interviewer did not run — not a data gap
// (data-gap faults are reconciliation's job, reconcile.ts).
const STAGE_NOT_RUN = /\b(never (ran|run|asked|prompted|administered|requested|gave)|(not|wasn'?t|was not|weren'?t) (run|asked|administered|prompted|given)|did(n'?t| not) (ask|run|prompt|administer)|no brainstorm)\b/i;

const UP: Record<Rating, Rating> = { needs_work: 'meets_bar', meets_bar: 'strong', strong: 'strong' };

function norm(s: string): string {
  return s.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
}

export function applyAnswerKeyPass(
  rubric: RubricScores,
  params: { ideas: AnswerKeyIdea[]; candidateTexts: string[] },
): {
  rubric: RubricScores;
  removed: { dimension: RubricDimensionKey; point: string; idea: string }[];
  caveatRemoved: { dimension: RubricDimensionKey; point: string }[];
  reRated: { dimension: RubricDimensionKey; from: Rating; to: Rating }[];
} {
  const out = structuredClone(rubric);
  const said = norm(params.candidateTexts.join('\n'));
  const removed: { dimension: RubricDimensionKey; point: string; idea: string }[] = [];
  const caveatRemoved: { dimension: RubricDimensionKey; point: string }[] = [];
  const reRated: { dimension: RubricDimensionKey; from: Rating; to: Rating }[] = [];

  // An idea the candidate never raised, named in a weakness → that idea.
  const missingIdeaIn = (point: string): AnswerKeyIdea | undefined => {
    const p = norm(point);
    return params.ideas.find(i => {
      const phrases = i.phrases.map(norm);
      return phrases.some(ph => p.includes(ph)) && !phrases.some(ph => said.includes(ph));
    });
  };

  for (const key of RUBRIC_DIMENSION_KEYS) {
    const dim = out[key];
    const before = dim.needsWork.length;
    const stage = dim.coverageCaveat && STAGE_NOT_RUN.test(dim.coverageCaveat) ? STAGE_TERMS[key] : undefined;
    dim.needsWork = dim.needsWork.filter(item => {
      const idea = missingIdeaIn(item.point);
      if (idea) {
        removed.push({ dimension: key, point: item.point, idea: idea.idea });
        return false;
      }
      if (stage?.test(item.point)) {
        caveatRemoved.push({ dimension: key, point: item.point });
        return false;
      }
      return true;
    });
    if (dim.notAssessed || before === 0 || dim.needsWork.length > 0) continue;
    const to = UP[dim.rating];
    if (to === 'strong' && dim.wentWell.length === 0) continue;
    if (to !== dim.rating) {
      reRated.push({ dimension: key, from: dim.rating, to });
      dim.rating = to;
    }
  }
  return { rubric: out, removed, caveatRemoved, reRated };
}
