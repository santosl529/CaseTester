// The case → drills step inside a scoring pass (Matt, 15 Nov; proposal §2.1).
// Runs after every other pass, on the report as stored, inside the scoring
// claim (scoring-claim.ts), so its one tagging call is paid at most once per
// case. It reads the report and writes nothing: scoreAndStore records the
// result once the score is stored (lib/drills/progress/case-runs.ts), and a
// failure here never fails the report.
import { CASE_TAGGER_CONFIG } from '@/lib/models';
import { costOf } from '@/lib/llm-pricing';
import type { OnUsage } from '@/lib/llm-usage';
import { HOME_DEMO_CASE_IDS } from '@/lib/cases/listed';
import type { Case } from '@/lib/cases/schema';
import { caseToDrillsMode, drillGroups } from '@/lib/drills/case-to-drills';
import { CaseResultPayloadSchema, type CaseResultPayload } from '@/lib/drills/case-result';
import type { StageRecord } from '@/lib/orchestrator/stage-evidence';
import type { RubricScores } from './judge';
import type { MathStepResult } from './deterministic';
import type { CheckerFinding } from './checker-record';
import { buildCaseResult, casePoints, type RunCheckerFinding, type RunPoint } from './case-result-builder';
import { tagPoints, type TagResult } from './skill-tags';
import { scoringTimeLeftMs } from './stream-retry';

// The tagging call needs well under this; with less left, the report is stored without it.
const MIN_TIME_MS = 45_000;

export type CaseResultStep = {
  mode: 'shadow' | 'on';
  status: 'built' | 'failed';
  taggerConfig: string;
  studentId: string;
  caseId: string;
  points: RunPoint[];
  checker: RunCheckerFinding[];
  payload: CaseResultPayload | null;
  error: string | null;
  costUsd: number;
};

type DataRequestRow = { subtype: string; payloadJsonb: unknown };
// An explicit ask for data (data-coverage.ts's test): the marker row and passing mentions don't count.
export const askedForData = (rows: DataRequestRow[]) => rows.some(r => {
  if (r.subtype === 'classified') return false;
  const p = r.payloadJsonb as { what?: unknown; explicit?: unknown } | null;
  return typeof p?.what === 'string' && p.what.trim() !== '' && p.explicit !== false;
});

export async function runCaseResultStep(input: {
  sessionId: string;
  studentId: string;
  completedAt: Date | null;
  caseData: Pick<Case, 'id' | 'caseType' | 'difficulty' | 'mathSteps'>;
  partial: boolean;
  rubric: RubricScores;
  checker: CheckerFinding[];
  stageRecord: StageRecord;
  mathResults: MathStepResult[];
  dataRequests: DataRequestRow[];
  transcript: { role: string; text: string; turnIndex: number }[];
}, onUsage?: OnUsage): Promise<CaseResultStep | null> {
  const mode = caseToDrillsMode();
  // Off, or the 7-minute demo (proposal D10): no case result.
  if (mode === 'off' || HOME_DEMO_CASE_IDS.includes(input.caseData.id)) return null;
  const base = { mode, taggerConfig: CASE_TAGGER_CONFIG, studentId: input.studentId, caseId: input.caseData.id };
  const points = casePoints(input.rubric);
  const left = scoringTimeLeftMs();
  if (left !== null && left < MIN_TIME_MS) {
    return { ...base, status: 'failed', points: [], checker: [], payload: null, error: `${Math.round(left / 1000)} s left before the scoring deadline`, costUsd: 0 };
  }
  let costUsd = 0;
  let tags: TagResult[];
  try {
    tags = await tagPoints(points, CASE_TAGGER_CONFIG, u => { costUsd += costOf(u); onUsage?.(u); });
  } catch (err) {
    return { ...base, status: 'failed', points: [], checker: [], payload: null, error: `tagging: ${(err as Error).message}`, costUsd };
  }
  const units = new Map(input.caseData.mathSteps.map(s => [s.id, s.unit]));
  const built = buildCaseResult({
    sessionId: input.sessionId, studentId: input.studentId, caseId: input.caseData.id,
    caseType: input.caseData.caseType ?? null, difficulty: input.caseData.difficulty,
    completedAt: input.completedAt ?? new Date(), partial: input.partial,
    rubric: input.rubric, points, tags, checker: input.checker, stageRecord: input.stageRecord,
    mathSteps: input.mathResults.map(r => ({ mentioned: r.mentioned, unit: units.get(r.id) })),
    dataRequested: askedForData(input.dataRequests),
    candidateTurns: input.transcript.filter(t => t.role === 'candidate').map(t => ({ turnIndex: t.turnIndex, text: t.text })),
    drillGroups: drillGroups(),
  });
  // Never send drills a payload it would reject.
  const valid = CaseResultPayloadSchema.safeParse(built.payload);
  if (!valid.success) {
    return { ...base, status: 'failed', points: built.points, checker: built.checker, payload: null, error: `payload: ${valid.error.message}`, costUsd };
  }
  return { ...base, status: 'built', points: built.points, checker: built.checker, payload: valid.data, error: null, costUsd };
}
