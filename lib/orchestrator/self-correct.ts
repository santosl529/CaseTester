// Background self-correction (`asyncAskJudge`; Lorenzo, 27 Oct; step 3, measurement). After each interviewer turn a
// judge reads the candidate's previous raw message with every ledger item and the prompt's facts, in the background
// during the candidate's turn; a verdict not back when the next message arrives is skipped (never awaited). The next
// turn acts on two verdicts only — never on "partial", at most one correction a turn, none at the close:
//   (a) "full" for a held item the last turn refused, said to assume, or left unsaid (not given, not deferred) →
//       "Actually, I do have that: <its own line>" — or, where the stage gate holds it, a deferral instead;
//   (b) "none" where the last turn pointed at an exhibit or restated an item for that ask →
//       "To correct myself: <the exhibit / the item> doesn't show <the candidate's words>, and I don't have it."
// Every correction passes code's own tests first: (a) the item's words share a key noun with the ask, or a cover maps
// it; (b) the false-refusal veto passes, no cover maps the ask to an item, and the words carry no figure.
import type { JudgeAsk } from '@/lib/cases/item-judge-draft';
import type { FactBase } from './fact-check';
import { coverageOf, findFalseRefusals } from './fact-check';
import { keyNouns } from './data-decisions';
import { poolPattern } from './phrasing';

export type Correction =
  | { kind: 'have'; id: string; ask: string; askItems: string[] }
  | { kind: 'have_gated'; id: string; ask: string; askItems: string[] }
  | { kind: 'none'; ask: string; shown: string; words: string };

type Item = { id: string; label: string; value: string; spoken?: string };
export type CorrectionInput = {
  asks: JudgeAsk[];
  items: Item[];
  revealed: ReadonlySet<string>;
  deferred: ReadonlySet<string>;               // items held for later (open data requests)
  lastInterviewerText: string;
  exhibits: { id: string; title: string; summary?: string; covers: string[] }[];
  shownExhibits: ReadonlySet<string>;
  fb: FactBase;
  caseNames: string[];
  gated: (id: string) => boolean;
  closing: boolean;
};

const POINTS = poolPattern('restate_pointer', 'restate', 'restate_exhibit', 'restate_recent');
const REFUSES = /\b(?:I don't have|not something I have|I'm afraid I don't have)\b/i;

export function selfCorrection(x: CorrectionInput): Correction | null {
  if (x.closing) return null;
  const nouns = (t: string) => keyNouns(t, x.caseNames);
  const shares = (a: string, b: string) => { const n = nouns(b); return [...nouns(a)].some(w => n.has(w)); };
  const itemOf = (id: string) => x.items.find(i => i.id === id);
  // (a) a held item the judge rates full, which the last turn didn't give and didn't hold for later.
  for (const a of x.asks) {
    for (const it of a.items) {
      if (it.answers !== 'full' || it.id.startsWith('prompt:')) continue;
      const item = itemOf(it.id);
      if (!item || x.revealed.has(it.id) || x.deferred.has(it.id)) continue;
      const lineTest = shares(a.ask, `${item.label} ${item.value} ${item.spoken ?? ''}`) || coverageOf(a.ask, x.fb).items.includes(it.id);
      if (!lineTest) continue;
      return { kind: x.gated(it.id) ? 'have_gated' : 'have', id: it.id, ask: a.ask, askItems: a.items.map(i => i.id) };
    }
  }
  // (b) "none", where the last turn pointed or restated for this ask.
  if (!POINTS.test(x.lastInterviewerText)) return null;
  for (const a of x.asks) {
    if (a.items.length > 0 || /\d/.test(a.ask)) continue;
    const shown = x.exhibits.find(e => x.shownExhibits.has(e.id) && e.summary && x.lastInterviewerText.includes(e.summary.trim().replace(/\.$/, '')) && shares(a.ask, `${e.title} ${e.summary}`));
    const restated = !shown ? x.items.find(i => x.revealed.has(i.id) && x.lastInterviewerText.includes(i.value) && shares(a.ask, `${i.label} ${i.value}`)) : undefined;
    if (!shown && !restated) continue;
    if (REFUSES.test(x.lastInterviewerText) && shares(x.lastInterviewerText.split(/(?<=[.!?])\s+/).filter(s => REFUSES.test(s)).join(' '), a.ask)) continue;   // already refused
    if (findFalseRefusals(`I don't have ${a.ask}.`, x.fb, new Set(x.revealed), { covers: true }).length > 0) continue;
    if (coverageOf(a.ask, x.fb).items.length > 0) continue;
    const what = shown ? `the ${shown.title.split(' — ').pop()!.replace(/\s*\(.*\)$/, '')} exhibit` : (restated!.spoken ?? restated!.label.toLowerCase());
    return { kind: 'none', ask: a.ask, shown: what, words: a.ask.replace(/[?.!]+$/, '').replace(/^(?:do we have|do we know|whether)\s+/i, '') };
  }
  return null;
}

// The correction's words, said first in the turn's data line.
export function correctionLine(c: Correction, item?: { value: string; spoken: string }): string {
  if (c.kind === 'have') return `Actually, I do have that: ${item!.value}`;
  if (c.kind === 'have_gated') return `Actually, I do have that — I'll share ${item!.spoken} once we've settled your structure.`;
  return `To correct myself: ${c.shown} doesn't show ${c.words}, and I don't have it.`;
}
