// The brainstorm stage per case (new cases, 13 Oct). Each AI Casing guide has
// its own brainstorm question ("What could Hollis Bay do to get shoppers to try
// its chickpea snacks — and to keep buying them?"); the generic wording code
// recognised ("what else could …", "beyond …, what …") missed most of them, so
// code would ask a generic one on top. The case's `brainstorm.ask` is code's
// stage line and counts as the brainstorm when the interviewer asks it; a case
// without a brainstorm module (Quillpath) sets `required: false` and owes none.
// The generic pool is case-neutral — prof-001 keeps its profitability line in
// its own `ask`.

import { GENERIC_BRAINSTORM_ASKS, asksBrainstorm } from './spoken-close';

export { GENERIC_BRAINSTORM_ASKS };

export type CaseBrainstorm = { brainstorm?: { ask?: string | string[]; required?: boolean } };

// Code's stage line: the case's own ask (rotated when several), else the generic pool.
export function brainstormAsks(c: CaseBrainstorm): string[] {
  const ask = c.brainstorm?.ask;
  return ask === undefined ? [...GENERIC_BRAINSTORM_ASKS] : typeof ask === 'string' ? [ask] : [...ask];
}

export function brainstormRequired(c: CaseBrainstorm): boolean {
  return c.brainstorm?.required !== false;
}

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'or', 'if', 'it', 'its', 'is', 'are', 'be', 'do', 'does', 'did', 'what', 'how',
  'could', 'would', 'should', 'can', 'in', 'on', 'for', 'with', 'them', 'they', 'their', 'that', 'this', 'you', 'your', 'we', 'our', 'say', 'so', 'now']);
const contentWords = (s: string) => new Set((s.toLowerCase().replace(/[’']s\b/g, '').match(/[a-z][a-z-]*/g) ?? [])
  .filter(w => !STOP.has(w))
  .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)));

// The case's ask, in the interviewer's words: one question sentence that holds
// most of the ask's content words (light rewording and a lead-in pass; an
// analysis question on the same nouns — "How many shoppers would try the
// chickpea snacks?" — doesn't). Only for asks the generic grammar doesn't
// already know ("what else could Larkspur do", prof-001's lines): there the
// grammar decides, and word overlap would count "How does pricing protect
// margin?" as prof-001's brainstorm.
export const CASE_ASK_OVERLAP = 0.6;
export function asksCaseBrainstorm(text: string, asks: string[]): boolean {
  const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().endsWith('?'));
  return asks.filter(a => !asksBrainstorm(a)).some(a => {
    const want = contentWords(a);
    if (want.size === 0) return false;
    return sentences.some(s => {
      const got = contentWords(s);
      return [...want].filter(w => got.has(w)).length / want.size >= CASE_ASK_OVERLAP;
    });
  });
}
