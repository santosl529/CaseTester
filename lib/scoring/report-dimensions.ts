import type { scores } from '@/db/schema';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS, type RubricDimensionKey } from './rubric';
import { RubricScoresSchema, type DimensionFeedback } from './judge';

type ScoreRow = typeof scores.$inferSelect;

export type ReportDimension = {
  key: RubricDimensionKey;
  label: string;
  rating: string | null;
  feedback: DimensionFeedback | null; // rich format (rubric_jsonb); null on legacy rows
  legacyEvidence: unknown;            // pre-July-2026 flat evidence quotes
};

const LEGACY_EVIDENCE: Record<RubricDimensionKey, (s: ScoreRow) => unknown> = {
  structure: s => s.structureEvidence,
  quantitative: s => s.quantitativeEvidence,
  dataExhibit: s => s.dataExhibitEvidence,
  judgment: s => s.judgmentEvidence,
  creativity: s => s.creativityEvidence,
  synthesis: s => s.synthesisEvidence,
  communication: s => s.communicationEvidence,
  pushback: s => s.pushbackEvidence,
};

const RATING_COLUMN: Record<RubricDimensionKey, (s: ScoreRow) => string | null> = {
  structure: s => s.structureRating,
  quantitative: s => s.quantitativeRating,
  dataExhibit: s => s.dataExhibitRating,
  judgment: s => s.judgmentRating,
  creativity: s => s.creativityRating,
  synthesis: s => s.synthesisRating,
  communication: s => s.communicationRating,
  pushback: s => s.pushbackRating,
};

// Single source for the report's dimension list — used by the report page and the PDF export.
export function reportDimensions(score: ScoreRow): ReportDimension[] {
  const parsed = RubricScoresSchema.safeParse(score.rubricJsonb);
  const rubric = parsed.success ? parsed.data : null;

  return RUBRIC_DIMENSION_KEYS.map(key => ({
    key,
    label: RUBRIC_DIMENSION_LABELS[key],
    rating: rubric?.[key].rating ?? RATING_COLUMN[key](score),
    feedback: rubric?.[key] ?? null,
    legacyEvidence: LEGACY_EVIDENCE[key](score),
  }));
}
