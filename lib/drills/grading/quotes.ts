// Matching the grader's evidence quotes against the student's answer. Pure,
// so scoring code can use it without the grader's API client.

// Whitespace, case and curly quotes don't count as a mismatch.
export const normalizeQuote = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

// Evidence may stitch together several fragments ("…", "...", ";" or a line
// break between them, e.g. sub-points from different buckets). Every fragment
// must appear in the answer.
export function quoteFound(evidence: string, answer: string): boolean {
  const haystack = normalizeQuote(answer);
  const fragments = evidence.split(/…|\.\.\.|;|\n/).map(f => normalizeQuote(f).replace(/^["']+|["']+$/g, '').trim()).filter(f => f.length >= 2);
  return fragments.length > 0 && fragments.every(f => haystack.includes(f));
}
