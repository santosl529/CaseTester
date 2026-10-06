// Nested-percentage conversion detector (docs/interviewer-behavior.md Rule 2/14,
// "unit conversions are always addressed"). A live-run failure recurred: a
// candidate reasoned "beans at 60% of COGS × 40% rise ⇒ ~24 points of COGS %
// of revenue" — mixing a share-OF-COGS with points-OF-revenue (correct: ×
// COGS-as-share-of-revenue ⇒ ~10 points). The interviewer moved on without a
// "points of what?" probe.
//
// This can't be caught by the mathStep recompute backstop: the candidate's
// input assumption (bean share of COGS) isn't a case-authored value and varies,
// so there's no fixed answer to match. Instead we detect the risky PATTERN —
// a share of COGS being converted into points/percent of revenue or margin —
// and tell the interviewer to probe the units this turn. General and
// assumption-independent.

const OF_COGS = /\bof\s+(total\s+|the\s+)?cogs\b/i;
const CONVERTS_TO_REVENUE_OR_MARGIN =
  /\b(points?|percentage points?|%\s*of\s*revenue|of\s+revenue|of\s+(the\s+)?margin|to\s+(overall\s+)?cogs)\b/i;

export function detectNestedPercentConversion(text: string): boolean {
  return OF_COGS.test(text) && CONVERTS_TO_REVENUE_OR_MARGIN.test(text);
}

export function formatUnitCheckHint(): string {
  return `UNIT-CONVERSION FLAG (deterministic): the candidate converted a share OF a cost line into points of revenue or margin, and the result wasn't verified. Probe the units once this turn — "Points of what?" — and let them do the conversion; don't name the method or the right figure.`;
}
