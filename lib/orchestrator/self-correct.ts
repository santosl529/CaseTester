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
import { coverageOf, findFalseRefusals, refusedItemIds } from './fact-check';
import { keyNouns } from './data-decisions';
import { poolPattern } from './phrasing';

export type Correction =
  | { kind: 'have'; id: string; ask: string; askItems: string[] }
  | { kind: 'have_gated'; id: string; ask: string; askItems: string[] }
  | { kind: 'none'; ask: string; shown: string; words: string }
  | { kind: 'precise'; ask: string; shown: string; holds: string; words: string };

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
  // `asyncAskJudgePartial` (Lorenzo, 27 Oct; measurement): act on "partial" after a pointer or restatement, quoting the
  // candidate's own words for the missing part; needs the previous message.
  partial?: { previousMessage: string; givenNow: ReadonlySet<string>; exhibitNow: string | null };
};

const POINTS = poolPattern('restate_pointer', 'restate', 'restate_exhibit', 'restate_recent');
const REFUSES = /\b(?:I don't have|not something I have|I'm afraid I don't have)\b/i;
const ASSUMES = poolPattern('assume', 'assume_finer');

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
  if (!POINTS.test(x.lastInterviewerText) && !x.partial) return null;
  if (POINTS.test(x.lastInterviewerText)) for (const a of x.asks) {
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
  // (c) "partial" after a pointer or restatement (never after a refusal or an assumption line about the ask).
  if (x.partial) {
    const { previousMessage, givenNow, exhibitNow } = x.partial;
    const sentences = x.lastInterviewerText.split(/(?<=[.!?])\s+/);
    const clauses = previousMessage.replace(/\s+/g, ' ').split(/[.?!;:]\s+|,\s+|\s+[—–]\s+|\s+(?:and|or|plus)\s+(?=(?:the|a|an|whether|how|what|which|if|do|does|is|are)\b)/i).map(t => t.trim()).filter(t => t.length > 8);
    for (const a of x.asks) {
      if (a.items.some(i => i.answers === 'full') || !a.missing) continue;
      const parts = a.items.filter(i => i.answers === 'partial' && !i.id.startsWith('prompt:')).map(i => itemOf(i.id)).filter((i): i is Item => i !== undefined);
      // The item the last turn pointed at or restated for this ask.
      const shownEx = x.exhibits.find(e => x.shownExhibits.has(e.id) && e.summary && x.lastInterviewerText.includes(e.summary.trim().replace(/\.$/, '')) && parts.some(p => e.covers.includes(p.id)));
      const restated = parts.find(p => x.revealed.has(p.id) && x.lastInterviewerText.includes(p.value));
      const item = shownEx ? parts.find(p => shownEx.covers.includes(p.id)) : restated;
      if (!item) continue;
      // Never after a refusal or an assumption line about this ask.
      if (sentences.some(t => (REFUSES.test(t) || ASSUMES.test(t)) && shares(t, a.ask))) continue;
      // (a) the missing part as the candidate said it: the clause of their message sharing the most key nouns with the
      // judge's ask and missing part (at least two, or the only one) — spoken verbatim, never the judge's text.
      const want = [...new Set([...nouns(a.missing), ...nouns(a.ask)])];
      if (want.length === 0) continue;
      let best = '', hit = 0;
      for (const cl of clauses) { const n = nouns(cl); const h = want.filter(w => n.has(w)).length; if (h > hit) { hit = h; best = cl; } }
      if (hit < Math.min(2, want.length)) continue;
      const words = best.replace(/^(?:(?:so|and|but|also|plus)\s+)?(?:(?:do|does|did|can|could)\s+(?:we|i|you)\s+(?:have|know|get|see)\s+(?:any(?:thing)?\s+(?:on\s+)?)?|(?:i'?d|i would)\s+(?:also\s+)?(?:want|need|like)(?:\s+to\s+(?:know|see))?\s+|is there\s+(?:any|a)\s+|one thing i'?d want:?\s+)/i, '').replace(/[?.!,]+$/, '').trim();
      if (words.length < 6 || /\d/.test(words)) continue;
      // (b) the finer part — the clause with every held item's names and cover phrases taken out — matches no held
      // item: no cover or name maps it, the false-refusal veto passes, and the pointed item's line doesn't state it.
      const heldPhrases = [...x.fb.quantities.flatMap(q => q.names), ...x.fb.covers.flatMap(c => c.phrases)].filter(p => p.length > 2).sort((p, q) => q.length - p.length);
      let residual = ` ${words.toLowerCase()} `;
      for (const ph of heldPhrases) residual = residual.split(` ${ph} `).join(' ');
      residual = residual.trim();
      if (nouns(residual).size === 0) continue;
      if (coverageOf(residual, x.fb).items.length > 0 || refusedItemIds(`I don't have ${residual}.`, x.fb).length > 0) continue;
      if (findFalseRefusals(`I don't have ${residual}.`, x.fb, new Set(x.revealed), { covers: true }).length > 0) continue;
      const itemWords = nouns(`${item.label} ${item.value} ${item.spoken ?? ''} ${(x.fb.quantities.find(q => q.id === item.id)?.names ?? []).join(' ')}`);
      if ([...nouns(residual)].every(w => itemWords.has(w))) continue;
      // (c) the turn doesn't already answer it, and the exhibit isn't going out this turn.
      if (a.items.some(i => givenNow.has(i.id)) || (exhibitNow !== null && x.exhibits.find(e => e.id === exhibitNow)?.covers.includes(item.id))) continue;
      const shown = shownEx ? `the ${shownEx.title.split(' — ').pop()!.replace(/\s*\(.*\)$/, '')} exhibit` : 'what I gave you';
      return { kind: 'precise', ask: a.ask, shown, holds: item.spoken ?? item.label.charAt(0).toLowerCase() + item.label.slice(1), words };
    }
  }
  return null;
}

// The correction's words, said first in the turn's data line.
export function correctionLine(c: Correction, item?: { value: string; spoken: string }): string {
  if (c.kind === 'have') return `Actually, I do have that: ${item!.value}`;
  if (c.kind === 'have_gated') return `Actually, I do have that — I'll share ${item!.spoken} once we've settled your structure.`;
  if (c.kind === 'precise') return `To be precise: ${c.shown} shows ${c.holds}, but not ${c.words}, and I don't have that.`;
  return `To correct myself: ${c.shown} doesn't show ${c.words}, and I don't have it.`;
}
