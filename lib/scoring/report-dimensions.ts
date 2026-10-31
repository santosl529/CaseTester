import type { scores } from '@/db/schema';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS, NOT_ASSESSED, type RubricDimensionKey } from './rubric';
import { RubricScoresSchema, type DimensionFeedback, type FeedbackItem, type PlainPoint } from './judge';
import { normalize } from './evidence-audit';

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
    rating: rubric?.[key].notAssessed ? NOT_ASSESSED : rubric?.[key].rating ?? RATING_COLUMN[key](score),
    feedback: rubric?.[key] ?? null,
    legacyEvidence: LEGACY_EVIDENCE[key](score),
  }));
}

// The top improvement in plain words, where the rewrite passed its audit; else null and the report shows topFix.
export function topFixPlain(score: ScoreRow): PlainPoint | null {
  const parsed = RubricScoresSchema.safeParse(score.rubricJsonb);
  return parsed.success ? parsed.data.topFixPlain ?? null : null;
}

// Report tone (31 Oct): an item in plain words quotes the candidate inline; its
// evidence quotes are shown below it only where the text does not already hold them.
export function evidenceQuotes(item: FeedbackItem): string[] {
  if (!item.plain) return item.quotes;
  const text = normalize(Object.values(item.plain).join(' '));
  return item.quotes.filter(q => !text.includes(normalize(q)));
}
