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
//   entity — the ask names an entity other than the item's, and not the item's own
//     (its entity's words, or the client words for a client item): "Nimbrel's patent
//     expiry" is not the Kelvexa patents line (row 19);
//   forecast — the ask carries a current marker and the item states a forecast:
//     "currently on an advanced therapy" is not the forecast peak share (row 18).
export function tagsAgree(askText: string, itemId: string, fb: FactBase): { agree: boolean; why?: 'entity' | 'forecast' } {
  const t = fb.tags;
  if (!t) return { agree: true };
  const named = entitiesNamed(askText, fb);
  const own = t.entities.filter(e => e.items.includes(itemId)).map(e => e.id);
  const owners = own.length > 0 ? own : ['client'];
  if (named.some(n => !owners.includes(n)) && !named.some(n => owners.includes(n))) return { agree: false, why: 'entity' };
  if (t.forecast.includes(itemId) && asksCurrent(askText)) return { agree: false, why: 'forecast' };
  return { agree: true };
}
