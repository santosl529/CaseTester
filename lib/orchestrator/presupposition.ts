// `unrevealedPresupposition` (Lorenzo, 29 Oct; tester session aae091ff t26): a model sentence that presents an
// unrevealed item's content as known — "Given what you now know about prices, what does that tell you about how the
// client responded…", said two turns before the menu prices went out — is withheld, unless code releases that item
// in the same turn. The number audit reads figures only and the delivery check (fact-check.ts F4) had no "what you
// now know about" form; and there "prices" passed because a revealed item (the bean prices) shares the word.
//
// His narrow version: a presupposition cue AND a match against an UNREVEALED item's label or ask phrases. A cue with
// no item named ("With that in hand, what's next?") is counted (`cueOnly`) for the corpus report, never withheld.
// The match is by content words: the cue's object ("prices", "the menu price history") is that item's when most of
// its words are among the item's label and ask-phrase words. A revealed item sharing the words does not clear it —
// t26's "prices" is the menu prices' as much as the bean prices' — and the report counts those apart (`shared`).
import { contentWords } from './stuck-point';

export type PresuppositionItem = { id: string; label: string; askPhrases?: string[]; spoken?: string };
export type Presupposition = { cue: string; object: string; items: string[]; shared: string[] };

// The cue and its object: what the sentence says the candidate already knows, has seen or has in hand.
const OBJECT = "([\\w'’&%\\s-]{2,60}?)";
const END = '(?=\\s*(?:[,;:.?!—–]|\\s(?:and|what|how|which|why|where|is|are|does|do|would|could|tell|says?|shows?)\\b|$))';
const CUES: RegExp[] = [
  new RegExp(`\\b(?:given|with|from|based on|in light of|knowing|taking into account)\\s+what\\s+you(?:'ve|\\s+have)?\\s+(?:now\\s+)?(?:know|seen|learned|heard|found|got)\\s+(?:now\\s+)?(?:about|on|of|regarding)\\s+${OBJECT}${END}`, 'i'),
  new RegExp(`\\bwhat\\s+you\\s+(?:now\\s+)?know\\s+(?:about|on)\\s+${OBJECT}${END}`, 'i'),
  new RegExp(`\\bnow\\s+that\\s+you\\s+(?:have|know|can see|'ve seen|have seen|'ve got|'ve heard)\\s+(?:about\\s+)?${OBJECT}${END}`, 'i'),
  new RegExp(`\\bas\\s+you(?:'ve|\\s+have)\\s+(?:seen|heard|learned|found)\\s+(?:on|in|from|with|about)\\s+${OBJECT}${END}`, 'i'),
  // "Knowing that the competitor is a low-cost airline, …": the whole clause is what they are said to know.
  new RegExp(`\\bknowing\\s+(?:that\\s+|how\\s+|what\\s+)?${OBJECT}(?=\\s*(?:[,;:.?!—–]|$))`, 'i'),
  new RegExp(`\\b(?:with|given)\\s+${OBJECT}\\s+(?:in hand|in mind|on the table|you now have|you've now got|you now know)\\b`, 'i'),
];
// A cue with nothing named: "With that in hand", "As you've seen", "Given what you now know".
const CUE_ONLY = /\b(?:with (?:that|this|those|these) in (?:hand|mind)|as you'?ve (?:seen|heard)|given what you (?:now )?know|now that you (?:have|know|'ve seen) (?:that|this|those|these|it)\b|knowing that\b)/i;
// Anaphora names nothing (the cue-only case); a bare pronoun or demonstrative object is no item.
const ANAPHORA = /^(?:all\s+)?(?:that|this|it|those|these|them|both|everything|all of (?:that|this|it))$/i;
// The candidate's own words are known to them ("now that you have your structure", "knowing your numbers").
const THEIR_OWN = /^(?:your|you|yourself|their)\b/i;

const MATCH_SHARE = 0.6;

function itemWords(i: PresuppositionItem): Set<string> {
  return new Set(contentWords([i.label, i.spoken ?? '', ...(i.askPhrases ?? [])].join(' ')));
}

// `releasedNow`: what this turn's data line hands over. "With those input costs in hand", said after the input
// changes went out, means them (b18 Maya t49; the corpus scan's five false hits): an item handed over now that reads
// the object at least half clears it, and so does a demonstrative object ("those …") on a turn that handed anything
// over. An item revealed on an EARLIER turn clears nothing — t26's "prices" are the menu prices' too.
export function findPresuppositions(sentence: string, items: PresuppositionItem[], revealed: ReadonlySet<string>, releasedNow: ReadonlySet<string> = new Set()): { hits: Presupposition[]; cueOnly: boolean } {
  const hits: Presupposition[] = [];
  for (const re of CUES) {
    const m = re.exec(sentence);
    if (!m) continue;
    const demonstrative = /^(?:those|these|that|this)\b/i.test(m[1].trim());
    const object = m[1].trim().replace(/^(?:the|those|these|all the|all)\s+/i, '');
    if (!object || ANAPHORA.test(object) || THEIR_OWN.test(object)) continue;
    // "Knowing that menu prices haven't moved" — the object is a clause: its words as written.
    const words = contentWords(object);
    if (words.length === 0) continue;
    if (demonstrative && releasedNow.size > 0) continue;
    // The items that read the object best: "the menu price change" is the menu prices', not the bean prices' (two of
    // its three words) — a tie keeps both ("prices": menu and bean alike).
    const share = (i: PresuppositionItem) => { const iw = itemWords(i); return words.filter(w => iw.has(w)).length / words.length; };
    if (items.some(i => releasedNow.has(i.id) && share(i) >= 0.5)) continue;
    const best = Math.max(0, ...items.map(share));
    const matching = best >= MATCH_SHARE ? items.filter(i => share(i) === best) : [];
    const unrevealed = matching.filter(i => !revealed.has(i.id)).map(i => i.id);
    if (unrevealed.length === 0) continue;
    hits.push({ cue: m[0].slice(0, 120), object, items: unrevealed, shared: matching.filter(i => revealed.has(i.id)).map(i => i.id) });
    break;
  }
  return { hits, cueOnly: hits.length === 0 && CUE_ONLY.test(sentence) };
}
