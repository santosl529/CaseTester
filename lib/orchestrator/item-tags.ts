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

// A comparison names its other side, not whose figure is asked (Task 70 fix round 1; b35
// Hollis Bay Marcus t1 "what price point they're targeting versus the chips" asks the chickpea
// price): another entity named after versus / compared with / relative to / against / than, to the
// clause's end, is the comparison's other side, not whose figure is asked. The client stays named
// wherever it is said (fix round 2: "how Nimbrel compares against Kelvexa in trials", "chip sales
// versus the chickpea line" name both sides).
const COMPARED = /\b(?:versus|vs\.?|compared (?:with|to)|relative to|against|than)\s+[^,;:?.!—–()\n]{0,40}?(?=[,;:?.!—–()\n]|\s+(?:and|or|but)\s|$)/gi;

// The entities a text names, by id; 'client' when a client word appears.
export function entitiesNamed(text: string, fb: FactBase): string[] {
  const t = fb.tags;
  if (!t) return [];
  const asked = text.replace(COMPARED, ' ');
  const out = t.entities.filter(e => e.words.some(w => says(asked, w))).map(e => e.id);
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
// `coarse`: it agrees only because its line names the asked entity (68b item 5) — it answers the ask
// coarsely, not as that entity's own figure: E1's form (the answer gate makes it partial).
export function tagsAgree(askText: string, itemId: string, fb: FactBase): { agree: boolean; why?: 'entity' | 'forecast'; coarse?: true } {
  const t = fb.tags;
  if (!t) return { agree: true };
  const named = entitiesNamed(askText, fb);
  const own = t.entities.filter(e => e.items.includes(itemId)).map(e => e.id);
  // An entity the item's own label or line names is the item's too (Task 70 fix round 2, controller
  // ruling, 68b item 5: b34 Aldermoor Marcus t10 "the share of covered lives where Nimbrel has exclusive
  // or preferred status" — "…Nimbrel is covered by most plans…" answers it in part).
  const line = fb.ledger.find(l => l.id === itemId);
  const lineNames = line ? t.entities.filter(e => e.words.some(w => says(`${line.label ?? ''} ${line.value}`, w))).map(e => e.id) : [];
  const base = own.length > 0 ? own : ['client'];
  const excluded = (owners: string[]) => named.some(n => n !== 'client' && !owners.includes(n)) && !named.some(n => owners.includes(n));
  const coarse = excluded(base);
  if (coarse && excluded([...base, ...lineNames])) return { agree: false, why: 'entity' };
  if (t.forecast.includes(itemId) && asksCurrent(askText)) return { agree: false, why: 'forecast' };
  return coarse ? { agree: true, coarse: true } : { agree: true };
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
// The clauses of a candidate's asking sentence (Task 70 fix round 2, 68b item 6: b34 Larkspur Marisol
// t6 "Do we have the route-level split of that $176M, and whether a competitor entered on any of the
// six?" — the competitor is the second clause's): split at ", and" / ", or" / ", but", "; ", "?",
// " and whether" / " or whether" / ", whether".
const CLAUSE_BREAK = /\s*(?:[,;]\s*(?:and|or|but)\s+(?=whether\b|if\b|what\b|how\b|do\b|does\b|is\b|are\b|any\b|the\b|a\b|an\b|\w)|;\s*|\?\s*|\s+(?:and|or)\s+(?=whether\b)|,\s*(?=whether\b))/gi;
export function askClauses(sentence: string): string[] {
  return sentence.split(CLAUSE_BREAK).map(c => c.trim()).filter(c => /[a-z]/i.test(c));
}
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

// ---- The item-tag gate on the check's positives (Phase 1 4.3, `haikuTagGate`) ----
// Lorenzo, 22 Oct: "Haiku positives: must pass the tag gate (entity, period, quantityKind against the ask). A mismatch
// defers; it never releases and never refuses." The item's tags are the overlay's (contract §1, `items[id].tags` on the
// ledger item: `entity` — "client" or an entity id; `period` — forecast / current / historical; `quantityKind` — total,
// split, level, trend, one-off, recurring; arrays, so an item that states "from 42% to 58%" is historical, current and
// a trend). The ask's are read by code, each only from wording that says it plainly — an ask that says none of them
// constrains nothing, and an item without tags agrees with every ask:
//   entity — entitiesNamed (above): the ask names another company and not the item's (one-directional, as tagsAgree:
//     client words never exclude another entity's item);
//   period — forecast ("forecast", "projected", "expected to", "going forward", "next year", "at peak"), current
//     (asksCurrent, above) and historical ("historically", "in the past", "over the last …", "… years ago", "since
//     2022") markers: the item states none of the periods the ask names;
//   quantityKind — split ("split", "breakdown", "mix", "composition", "by type / category / segment / source /
//     channel"), trend ("trend", "trajectory", "over time", "grew", "growth", "year over year", "since"), one-off
//     ("one-off", "one-time", "upfront", "setup", "launch cost"), recurring ("recurring", "recurs", "ongoing", "every
//     year" — not "annual" or "per year", which name a rate: "net price per patient per year", "total annual revenue")
//     and total ("in total", "total number / count", "altogether", "across all"): the item has none of the kinds the
//     ask names. A level is no marker (every figure is one).
// Entity and the period are read from the model's words and the candidate's sentence (as tagsAgree); the quantity kind
// from the model's words only (a sentence carries the candidate's other clauses).
export type ItemTags = { entity: string; period: readonly string[]; quantityKind: readonly string[] };
const FORECAST = /\b(?:forecast(?:s|ed)?|projected|projections?|expected to|will (?:be|reach|have)|going forward|in the future|next (?:year|few years|five years)|at peak|peak (?:share|sales|year|revenue))\b/i;
const HISTORICAL = /\b(?:historical(?:ly)?|history|in the past|over the (?:last|past)\b|(?:last|previous|prior) (?:year|years|quarter)|years? ago|used to|since (?:19|20)\d\d)\b/i;
const KINDS: [string, RegExp][] = [
  ['split', /\b(?:split|splits|breakdown|broken (?:down|out)|break[- ]?down|mix|composition|makeup|make-up|by (?:type|category|categories|segment|source|channel|component))\b/i],
  ['trend', /\b(?:trend(?:s|ed|ing)?|trajector(?:y|ies)|over time|grew|growth|year[- ]over[- ]year|since (?:19|20)\d\d|since (?:launch|entry|then))\b/i],
  ['one-off', /\b(?:one[- ]?offs?|one[- ]?time|up-?front|set-?up costs?|start-?up costs?|launch costs?)\b/i],
  ['recurring', /\b(?:recurr(?:ing|ent|s|ed)?|recurs|ongoing|year after year|every year)\b/i],
  ['total', /\b(?:in total|total (?:number|count)|altogether|across all|network[- ]wide|company[- ]wide)\b/i],
];
export function askTags(words: string, sentence: string, fb: FactBase): { entities: string[]; periods: string[]; kinds: string[] } {
  const both = sentence ? `${words}\n${sentence}` : words;
  const periods = [
    ...(FORECAST.test(both) ? ['forecast'] : []),
    ...(asksCurrent(words) || (sentence !== '' && asksCurrent(sentence)) ? ['current'] : []),
    ...(HISTORICAL.test(both) ? ['historical'] : []),
  ];
  return { entities: entitiesNamed(both, fb), periods, kinds: KINDS.filter(([, re]) => re.test(words)).map(([k]) => k) };
}
export function itemTagsAgree(ask: { entities: string[]; periods: string[]; kinds: string[] }, tags: ItemTags | undefined): { agree: boolean; why?: 'entity' | 'period' | 'kind' } {
  if (!tags) return { agree: true };
  const others = ask.entities.filter(e => e !== 'client');
  if (others.length > 0 && !others.includes(tags.entity) && !ask.entities.includes(tags.entity)) return { agree: false, why: 'entity' };
  if (ask.periods.length > 0 && !ask.periods.some(p => tags.period.includes(p))) return { agree: false, why: 'period' };
  if (ask.kinds.length > 0 && !ask.kinds.some(k => tags.quantityKind.includes(k))) return { agree: false, why: 'kind' };
  return { agree: true };
}
