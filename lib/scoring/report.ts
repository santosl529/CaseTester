import type { Case } from '@/lib/cases/schema';
import type { RubricScores } from './judge';
import type { MathStepResult } from './deterministic';

export type Report = {
  sessionId: string;
  caseId: string;
  rubric: RubricScores;
  mathResults: MathStepResult[];
  modelAnswer: {
    structure: string;
    recommendation: string;
  };
  scoringRuntimeMs: number;
  judgeModel: string;
};

export function assembleReport(params: {
  sessionId: string;
  caseData: Case;
  rubric: RubricScores;
  mathResults: MathStepResult[];
  scoringRuntimeMs: number;
}): Report {
  return {
    sessionId: params.sessionId,
    caseId: params.caseData.id,
    rubric: params.rubric,
    mathResults: params.mathResults,
    modelAnswer: {
      structure: params.caseData.structureKey,
      recommendation: params.caseData.recommendationKey,
    },
    scoringRuntimeMs: params.scoringRuntimeMs,
    judgeModel: 'claude-opus-4-8',
  };
}
