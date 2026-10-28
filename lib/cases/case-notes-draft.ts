// Item-choice experiment, arm A (Lorenzo, 27 Oct; measurement only, `caseNotesDraft`): Opus-drafted notes per ledger
// item — asks it answers, and nearby asks it doesn't — read from evals/case-notes-draft/<caseId>.json. Server-only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
export type CaseNote = { id: string; answers: string[]; notAnswers: { phrase: string; missing: string }[] };
const cache = new Map<string, CaseNote[] | null>();
export function caseNotesDraft(caseId: string): CaseNote[] | null {
  if (!cache.has(caseId)) {
    const p = path.join(process.cwd(), 'evals', 'case-notes-draft', `${caseId}.json`);
    cache.set(caseId, existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { items: CaseNote[] }).items : null);
  }
  return cache.get(caseId)!;
}
// Whether an ask's words say a note phrase (lower-cased, punctuation off, a plural "s" ignored).
const toks = (t: string) => t.toLowerCase().replace(/[^a-z0-9$%\s-]/g, ' ').split(/\s+/).filter(Boolean).map(w => w.replace(/(?<=[a-z]{3})s$/, ''));
export function saysPhrase(text: string, phrase: string): boolean {
  const a = toks(text), p = toks(phrase);
  if (p.length === 0) return false;
  for (let i = 0; i + p.length <= a.length; i++) if (p.every((w, j) => a[i + j] === w)) return true;
  return false;
}
