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
import { exhibitOut, type ExhibitInfo } from './data-decisions';
import type { DataLedger } from './data-ledger';
import { line, type PhraseUses } from './phrasing';
import { pickScript } from '@/lib/agent/prompts/scripts';

export { GENERIC_BRAINSTORM_ASKS };

export type CaseBrainstorm = { brainstorm?: { ask?: string | string[]; required?: boolean; after?: string[] } };

// Code's stage line: the case's own ask (rotated when several), else the generic pool.
export function brainstormAsks(c: CaseBrainstorm): string[] {
  const ask = c.brainstorm?.ask;
  return ask === undefined ? [...GENERIC_BRAINSTORM_ASKS] : typeof ask === 'string' ? [ask] : [...ask];
}

// The line code says: the case's own ask (by seed when several — case text, not
// ours to vary), else the generic pool with the session's memory (phrasing.ts).
export function brainstormAskLine(c: CaseBrainstorm, uses: PhraseUses | undefined, seed: string): string {
  if (c.brainstorm?.ask === undefined) return line('brainstorm_generic', uses, seed);
  return pickScript(brainstormAsks(c), seed);
}

export function brainstormRequired(c: CaseBrainstorm): boolean {
  return c.brainstorm?.required !== false;
}

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'or', 'if', 'it', 'its', 'is', 'are', 'be', 'do', 'does', 'did', 'what', 'how',
  'could', 'would', 'should', 'can', 'in', 'on', 'for', 'with', 'them', 'they', 'their', 'that', 'this', 'you', 'your', 'we', 'our', 'say', 'so', 'now']);
const contentWordList = (s: string) => (s.toLowerCase().replace(/[’']s\b/g, '').match(/[a-z][a-z-]*/g) ?? [])
  .filter(w => !STOP.has(w))
  .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
const contentWords = (s: string) => new Set(contentWordList(s));

// The case's ask, in the interviewer's words: one question sentence that holds
// most of the ask's content words (light rewording and a lead-in pass; an
// analysis question on the same nouns — "How many shoppers would try the
// chickpea snacks?" — doesn't). Only for asks the generic grammar doesn't
// already know ("what else could Larkspur do", prof-001's lines): there the
// grammar decides, and word overlap would count "How does pricing protect
// margin?" as prof-001's brainstorm.
export const CASE_ASK_OVERLAP = 0.6;
export function asksCaseBrainstorm(text: string, asks: string[]): boolean {
  return asksOwnBrainstorm(text, asks.filter(a => !asksBrainstorm(a)));
}
// The case's own ask in the interviewer's words, whatever the generic grammar
// says of it — what the brainstorm hold reads (Larkspur's ask is a "what else
// could Larkspur do" the grammar knows; a generic "what else could it do?" in
// an analysis question is not it).
export function asksOwnBrainstorm(text: string, asks: string[]): boolean {
  const sentences = text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);
  return asks.some(a => {
    const want = contentWords(a);
    if (want.size === 0) return false;
    const cover = (got: Set<string>) => [...want].filter(w => got.has(w)).length / want.size;
    // The ask's question clause ("how could it reduce the risk of a slow start"
    // in "If Aldermoor builds its own team, how could …"): its first content
    // word is the verb the interviewer must still ask for.
    const clause = contentWordList(a.split(/[,—–:]/).pop() ?? a);
    const verb = clause.length > 1 ? clause[0] : undefined;
    return sentences.some((s, i) => {
      if (!s.endsWith('?')) return false;
      const got = contentWords(s);
      if (cover(got) >= CASE_ASK_OVERLAP) return true;
      // A lead-in sentence before the question carries the case's setting
      // ("Suppose Aldermoor builds its own US team. How could it reduce the
      // risk of a slow start, …?"; B1 Raj t18, Marcus t14: the lead-in held
      // the subject, so the question alone fell short). The question itself
      // must still ask for the clause's verb and half of its words — a topic
      // question ("What are the risks of a slow start?") has no "reduce".
      if (i === 0 || verb === undefined || !got.has(verb)) return false;
      if (clause.filter(w => got.has(w)).length / clause.length < 0.5) return false;
      return cover(new Set([...got, ...contentWords(sentences[i - 1])])) >= CASE_ASK_OVERLAP;
    });
  });
}

// Lorenzo, 13 Oct (Larkspur rulings e): a brainstorm that waits on exhibits
// (`brainstorm.after`) is due once each is out — shown, or its data released
// as lines — and always under time pressure or at time-up (no hold then).
export function brainstormDue(c: CaseBrainstorm & { exhibits: ExhibitInfo[] }, shown: ReadonlySet<string>, ledger: DataLedger, hurried: boolean): boolean {
  if (hurried) return true;
  return (c.brainstorm?.after ?? []).every(id => { const x = c.exhibits.find(e => e.id === id); return x === undefined || exhibitOut(x, shown, ledger); });
}
