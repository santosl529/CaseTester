import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS } from './rubric';

// Deterministic "report vs transcript" check (docs/interviewer-behavior.md §3,
// scoring side): every evidence quote the judge attributes to the candidate
// must actually appear in a candidate turn. Fabricated or misattributed quotes
// are stripped before the report renders.

export type EvidenceViolation = {
  dimension: string;
  section: 'wentWell' | 'needsWork';
  quote: string;
};

// Loose normalization: judges lightly reformat punctuation when quoting, so
// compare on lowercased alphanumerics (plus % and $) with collapsed spacing —
// applied identically to both sides.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokens(s: string): string[] {
  return normalize(s).split(' ').filter(t => t.length > 0);
}

// A quote fragment "appears in" the corpus if it is an exact normalized
// substring, OR (tolerating the judge lightly reformatting connective words)
// it has high token overlap with the corpus AND every numeric token matches
// exactly. The numeric-exactness guard is what keeps this from accepting a
// fabricated figure ("$600M") assembled from otherwise-real words.
function fragmentAppears(fragment: string, normCorpus: string, corpusTokens: Set<string>): boolean {
  const norm = normalize(fragment);
  if (norm.length === 0) return true;
  if (normCorpus.includes(norm)) return true;

  const fragTokens = toTokens(fragment);
  if (fragTokens.length === 0) return true;

  // Every number the quote claims must actually appear in the candidate corpus.
  const numericTokens = fragTokens.filter(t => /\d/.test(t));
  if (!numericTokens.every(t => corpusTokens.has(t))) return false;

  const present = fragTokens.filter(t => corpusTokens.has(t)).length;
  return present / fragTokens.length >= 0.8;
}

// Judge quotes splice transcript fragments with "..." / "…" and lightly reword
// connective tissue across sentences; a strict whole-quote substring match
// therefore strips genuine near-verbatim quotes (observed in a live run). Split
// on ellipsis AND sentence boundaries and check each fragment tolerantly.
export function quoteAppearsIn(quote: string, corpus: string): boolean {
  const normCorpus = normalize(corpus);
  const corpusTokens = new Set(toTokens(corpus));
  const fragments = quote
    .split(/\.{3}|…|(?<=[.?!])\s+/)
    .map(f => f.trim())
    .filter(f => f.length > 0);
  if (fragments.length === 0) return false;
  return fragments.every(f => fragmentAppears(f, normCorpus, corpusTokens));
}

export function auditEvidence(
  rubric: RubricScores,
  candidateTurns: string[],
): { rubric: RubricScores; violations: EvidenceViolation[] } {
  const corpus = candidateTurns.join('\n');
  const violations: EvidenceViolation[] = [];
  const cleaned = structuredClone(rubric);

  for (const key of RUBRIC_DIMENSION_KEYS) {
    for (const section of ['wentWell', 'needsWork'] as const) {
      for (const item of cleaned[key][section]) {
        item.quotes = item.quotes.filter(quote => {
          const ok = quoteAppearsIn(quote, corpus);
          if (!ok) violations.push({ dimension: key, section, quote });
          return ok;
        });
      }
    }
  }

  return { rubric: cleaned, violations };
}
