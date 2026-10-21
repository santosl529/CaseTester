// Item tags (round 6 Task 68; Lorenzo, 21 Oct: "Add exclusion words where a
// confusion is known: "chip" excluded from chickpea items, "entrant/competitor"
// from Larkspur's own items. A cover match vetoes a refusal. It may release the
// matched item only if the item's tags (company; forecast vs current; quantity)
// also agree with the ask."). The case's `factAnchors.tags` (schema.ts): the
// client's words, the other companies or products (entities) with their words and
// items — an item in none is the client's — and the items stating a forecast.
// Quantity is no tag: outsideAskScope (data-decisions.ts) on the matched item
// (controller ruling, 21 Oct). Audit rows 2, 10, 18, 19
// (docs/superpowers/plans/2026-10-21-data-path-audit.md). An untagged case
// (prof-001) agrees with every ask.
import type { FactBase } from './fact-check';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A tag word in a text: whole words, case aside, a hyphen or a space alike, with a
// plural or possessive ending ("entrants'", "chips", "Nimbrel's"; "chips" also names "chip").
const wordRes = new Map<string, RegExp>();
function says(text: string, word: string): boolean {
  let re = wordRes.get(word);
  if (!re) {
    const w = word.toLowerCase().trim().replace(/['’]s?$/, '');
    const stem = w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;
    re = new RegExp(`(?<![a-z0-9])${stem.split(/[\s-]+/).map(esc).join('[\\s-]+')}(?:e?s)?(?:['’]s?)?(?![a-z0-9])`, 'i');
    wordRes.set(word, re);
  }
  return re.test(text);
}

// A question's frame names nobody: "Do we know anything about the entrant's cost per
// seat…" (audit row 2, b36 Larkspur Marisol t11) asks about the entrant, though "we" is
// one of Larkspur's client words (Task 69). Client words are read outside it.
const ASK_FRAME = /\b(?:do|does|did|can|could|would|will|should|shall|may|might|have)\s+(?:we|i|you)\b|\b(?:we|i)(?:'d|\s+would)\s+(?:want|need|like)\b|\b(?:we|i)\s+(?:want|need)\s+to\s+(?:know|see|understand|check)\b/gi;

// The entities a text names, by id; 'client' when a client word appears.
export function entitiesNamed(text: string, fb: FactBase): string[] {
  const t = fb.tags;
  if (!t) return [];
  const out = t.entities.filter(e => e.words.some(w => says(text, w))).map(e => e.id);
  const unframed = text.replace(ASK_FRAME, ' ');
  if (t.clientWords.some(w => says(unframed, w))) out.push('client');
  return out;
}

// A current marker: today / current(ly) / now / at present / this year — not a
// leading "Now," or "for now", which mark the talk, not the period.
const CURRENT = /\b(?:today|current(?:ly)?|now|at present|this year)\b/i;
const NOT_A_PERIOD = /\bfor now\b|(?:^|[.?!]\s+)(?:(?:ok(?:ay)?|so|and|right),?\s+)?now,/gi;
const asksCurrent = (text: string) => CURRENT.test(text.replace(NOT_A_PERIOD, ' '));

// Whether an item's tags agree with an ask:
//   entity — one-directional (controller ruling, 21 Oct, Task 70, on Lorenzo's wording:
//     ""entrant/competitor" excluded from Larkspur's own items", ""chip" excluded from
//     chickpea items"): (a) a client item, when the ask names another entity and no client
//     word: "Nimbrel's patent expiry" is not the Kelvexa patents line (row 19); (b) an
//     entity's item, when the ask names a different entity and not its own. Client words
//     never exclude another entity's item: b34 Larkspur Marisol t29 "Do we have a breakdown
//     of where our cost disadvantage sits — labor, aircraft size, or utilization?" is
//     answered by the competitor's cost line, "our" notwithstanding;
//   forecast — the ask carries a current marker and the item states a forecast:
//     "currently on an advanced therapy" is not the forecast peak share (row 18).
export function tagsAgree(askText: string, itemId: string, fb: FactBase): { agree: boolean; why?: 'entity' | 'forecast' } {
  const t = fb.tags;
  if (!t) return { agree: true };
  const named = entitiesNamed(askText, fb);
  const own = t.entities.filter(e => e.items.includes(itemId)).map(e => e.id);
  const owners = own.length > 0 ? own : ['client'];
  const others = named.filter(n => n !== 'client' && !owners.includes(n));
  if (others.length > 0 && !named.some(n => owners.includes(n))) return { agree: false, why: 'entity' };
  if (t.forecast.includes(itemId) && asksCurrent(askText)) return { agree: false, why: 'forecast' };
  return { agree: true };
}

// The ask's entity groups (round 6 Task 70; controller ruling C3, 21 Oct: "on a list ask,
// read the entity PER CONJUNCT: an entity named in one conjunct applies only to the items
// answering that conjunct"). The list entries as the coverage step splits them (a question
// is one; a list splits at commas, "and", "or", "plus"), an entry with no noun phrase of its
// own read with the one before ("volume" in "the revenue split between fares and volume, and
// the competitor's schedule"; "costs" in "the entrant's fares and costs" stays the entrant's).
const FUNCTION_WORDS = new Set('the a an of for on in to and or by per with from at its their our his her your my any some each every all both this that these those how what which whether if is are was were be been has have had do does did can could would will about versus vs'.split(' '));
const ownPhrase = (t: string) => {
  const content = (t.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? []).filter(w => !FUNCTION_WORDS.has(w));
  return content.length >= 2 || (content.length === 1 && /^(?:the|a|an)\s/i.test(t.trim()));
};
export type AskGroup = { text: string; start: number; end: number };
// `list`: a question split as a list too (the candidate's sentence, read beside a list ask).
export function askGroups(what: string, opts: { list?: boolean } = {}): AskGroup[] {
  const text = what.trim();
  if (!opts.list && (/^(?:whether|if|how|why|which|what|when|where|who|is|are|was|were|do|does|did)\b/i.test(text) || text.endsWith('?'))) return [{ text, start: 0, end: text.length }];
  const entries: AskGroup[] = [];
  let at = 0;
  for (const m of text.matchAll(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or|plus)\s+/gi)) {
    entries.push({ text: text.slice(at, m.index), start: at, end: m.index ?? at });
    at = (m.index ?? 0) + m[0].length;
  }
  entries.push({ text: text.slice(at), start: at, end: text.length });
  const out: AskGroup[] = [];
  for (const e of entries.filter(x => x.text.trim())) {
    const prev = out.at(-1);
    if (prev && !ownPhrase(e.text)) { prev.end = e.end; prev.text = text.slice(prev.start, prev.end); }
    else out.push({ ...e });
  }
  return out.length > 0 ? out : [{ text, start: 0, end: text.length }];
}
