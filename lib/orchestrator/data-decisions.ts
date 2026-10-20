// Rule 11 decided in code (spec 2026-10-06-plan-owns-decisions D1–D3). The
// interviewer model declares what the candidate asked for and, per item,
// now or later; this module decides what actually happens and writes every
// data line. Nothing here mutates the ledger: values are read from the case,
// and Settle books what was delivered.
//
// Bounds (the model's declaration can be wrong, the decision can't exceed
// them): only items the case holds and that aren't released yet; passing
// mentions are offered, never released; at most CAP releases a turn; the
// rescue item only on a stall rung-3 turn.
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import type { RequestedUnanswered } from '@/lib/scoring/data-coverage';
import type { RequestResponse } from './data-requests';
import { canReveal, type DataLedger } from './data-ledger';
import { phrase, line, versionIndex, type PhraseUses } from './phrasing';
import { BASIS, countFinerThan } from './fact-check';
import { dataLineVersions } from '@/lib/cases/loader';
import { dataLineVariantsOn } from '@/lib/cases/data-line-variants';
import { isOrderStage } from '@/lib/cases/schema';

export const RELEASE_CAP = 3;

// The lead-in for data said again on an explicit re-ask.

// Resolves a declared id to a canonical one. Exact only — an id or a
// label / title, ignoring case and punctuation: a partial match could release
// an item nobody asked for ("cogs" is inside two ids).
export function exactResolver(entries: { id: string; names: string[] }[]): (raw: string) => string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byName = new Map<string, string>();
  for (const e of entries) for (const n of [e.id, ...e.names]) if (norm(n)) byName.set(norm(n), e.id);
  return raw => byName.get(norm(raw)) ?? null;
}

// A narrow alias for an explicit ask the model left unmapped (item_ids []):
// it names exactly one catalog item when every word of that item's label is
// in the ask and every other word is an article / auxiliary or a period word
// — and the period words fit the periods the item covers (batch 18 v2, Maya
// t6: "the number of stores over the two years" → stores_count, refused as
// missing). Anything else blocks the match, so a qualified ask keeps its
// scope and stays unmapped: "by year", "per store", "for drinks", "excluding
// new stores", "in California", "two years ago" for a current-only item.
const LABEL_IGNORED = new Set(['the', 'a', 'an', 'of', 'as', 'and', 'is', 'was', 'were', 'did', 'do', 'does', 'has', 'have', 'had', 'how', 'what', 'many', 'much', 'its', 'their', 'our', 'we', 'they', 'it']);
const LABEL_NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3' };
const PRIOR_WORDS = new Set(['ago', 'prior', 'previou', 'then', 'past', 'last', 'both', 'over', 'since', 'from', 'change', 'changed', 'before', 'earlier', 'versu', 'vs', 'compared', '2']);
const CURRENT_WORDS = new Set(['now', 'today', 'current', 'currently', 'latest', 'versu', 'vs', 'compared']);
const NEUTRAL_PERIOD_WORDS = new Set(['year', 'period', 'time', 'in', 'during']);
const labelWords = (s: string): string[] => s.toLowerCase().replace(/%/g, ' percent ').replace(/percentage/g, 'percent')
  .split(/[^a-z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, '')).filter(Boolean)
  .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
  .map(w => LABEL_NUMBERS[w] ?? w)
  .filter(w => !LABEL_IGNORED.has(w));

// A passing mention is offered only when the candidate stated a need for it
// (Lorenzo's rule, 12 Oct): one sentence of their message names the item — a
// distinctive word of its label, not a generic one like "revenue" or "price" —
// and asks for it in statement form ("I'd want transaction data to confirm",
// "whether prices on the menu moved", "I'd check dairy first", "worth checking
// the actual COGS percentage" — Blake cd75e075 t15, batch 25). Batch 19:
// 17 of 24 Haiku runs heard offers of data nobody asked for; over batches
// 18–19 this keeps 8 of 60 offered items, each a real soft ask.
const GENERIC_LABEL_WORDS = new Set(['price', 'change', 'cost', 'revenue', 'percent', 'total', 'average', 'number', 'other', 'over', 'year', 'period', 'current', 'prior', 'share', 'rate', 'data', 'value', 'input']);
const NEED_CUE = /\b(?:i'?d (?:want|need|check|look|ask|pull|get|like)|i (?:want|need)|we'?d need|do we (?:have|know)|is there|can (?:i|we) (?:get|see)|would (?:want|need)|whether|needs? to (?:know|see|check)|still need|data on|data to confirm|i (?:haven't|have not) (?:been given|seen|got|had)|i don't think i've (?:been given|seen|got|had)|unless i missed|next steps?|to (?:confirm|verify|check)|worth (?:checking|confirming|verifying|knowing|pulling|getting|a look at))\b/i;
const stemWord = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const contentWords = (s: string) => (s.toLowerCase().match(/[a-z][a-z-]+/g) ?? []).map(stemWord);
export function mentionStatesNeed(candidateText: string, label: string): boolean {
  // Four letters as said ("cogs" names the COGS line, though it stems to "cog").
  const named = new Set((label.toLowerCase().match(/[a-z][a-z-]+/g) ?? []).filter(w => w.length >= 4).map(stemWord)
    .filter(w => !GENERIC_LABEL_WORDS.has(w) && !LABEL_IGNORED.has(w)));
  if (named.size === 0) return false;
  // The item is what the need is for: named after the cue, in the same clause
  // — not in a subordinate one ("I'd check dairy and packaging first … even
  // though beans rose faster" is no need for the bean figure; batch 20 R25 t24).
  return candidateText.split(/(?<=[.?!])\s+|\n+/).some(s => s.split(/\b(?:even though|although|though|since|because|while|whereas|but)\b/i).some(clause => {
    const cue = NEED_CUE.exec(clause);
    return cue !== null && contentWords(clause.slice(cue.index)).some(w => named.has(w));
  }));
}

export function labelMatch(what: string, items: { id: string; label: string; timeframes?: Record<string, string> }[]): string | null {
  const asked = new Set(labelWords(what));
  const hits = items.filter(i => {
    const label = new Set(labelWords(i.label));
    if (label.size === 0 || ![...label].every(w => asked.has(w))) return false;
    const extra = [...asked].filter(w => !label.has(w));
    if (!extra.every(w => PRIOR_WORDS.has(w) || CURRENT_WORDS.has(w) || NEUTRAL_PERIOD_WORDS.has(w))) return false;
    // Periods asked for must be ones the item holds (no timeframes recorded: its label names them).
    const tf = Object.values(i.timeframes ?? {});
    if (tf.length === 0) return true;
    const coversPrior = tf.some(t => t === 'prior' || t === 'both' || t === 'change');
    const coversCurrent = tf.some(t => t === 'current' || t === 'both');
    if (extra.some(w => PRIOR_WORDS.has(w)) && !coversPrior) return false;
    if (extra.some(w => CURRENT_WORDS.has(w)) && !coversCurrent) return false;
    return true;
  });
  return hits.length === 1 ? hits[0].id : null;
}

// Qualifiers keep their scope (v4.10; batch 18: Tyler's "variable-versus-fixed
// split within COGS and labor" was mapped to the COGS and labor lines and got
// nothing, logged as answered; Derek's "per-pound and per-gallon costs" got the
// bean share). An item is outside an ask's scope when the ask wants
//   - a split of that very item ("a breakdown of COGS", "the split within
//     COGS") and the item is the whole, not a part of it — "the cost
//     breakdown" still covers the cost lines, and "the COGS split" still
//     covers COGS's composition; or
//   - a cut the item doesn't have ("per pound", "by store", "by month") — a
//     cut its label or periods carry ("revenue per store", "by year") is fine.
// Synonyms and grouped asks are untouched: this only removes items, and only
// on a qualifier the item can't answer. What remains unmapped is refused as
// the case not having it (the qualified data truly isn't there).
const SPLIT_WORDS = String.raw`(?:split|breakdown|break-?down|decomposition|components?|composition|mix|makeup|make-up|detail)`;
const HEAD_NOUN = (label: string) => label.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').split(/\s+/).find(w => w.length >= 3 && !['the', 'average', 'total', 'number'].includes(w)) ?? '';
// A fixed/variable cut is a split of a cost by how it behaves: both words
// ("variable-versus-fixed", "fixed and variable", "fixed/variable"), the
// fixed part of something, or something that "is fixed". "The fixed costs" or
// "the variable cost per flight" alone name a cost line, not a cut (Lorenzo,
// 13 Oct; Larkspur, Marcus 27c2d0fb t22: "what sits inside the fixed costs,
// including aircraft leases" lost the aircraft-leases item and was refused).
const CUT = /\b(?:per|by|for each)\s+(pound|lb|gallon|sku|product|store|location|region|market|month|quarter|week|day|daypart|channel|customer|segment|supplier|year)s?\b|\b(variable|fixed)\b(?=[\s-]*(?:(?:versus|vs\.?|and|or|\/|to)[\s-]*(?:fixed|variable)\b|(?:portion|part|share|component|element|piece)s?\b))|\b(?:is|are|was|were)\s+(?:mostly\s+|largely\s+|partly\s+)?(variable|fixed)\b/i;
const PART_LABEL = /\b(?:share|split|composition|breakdown|mix|component)\b/i;
const CHANGE_LABEL = /\b(?:change|changes|growth|increase|inflation|trend)\b/i;
const MOVEMENT_ASK = /\b(?:chang\w*|mov\w*|grow\w*|grew|increas\w*|inflat\w*|trend\w*|rose|risen|went up|over (?:time|the (?:two )?years)|year[- ]over[- ]year|both years|each year|price (?:trend|history|movement)|then (?:versus|vs\.?|and) now|(?:versus|vs\.?) (?:now|today)|before and after)\b/i;

// A split of the item itself, by one of the case's names for it (Lorenzo, 13
// Oct; Marcus 71a04add t12: "the split within that non-bean bucket" —
// "non-bean" names the other inputs' change): "<split> of/within/inside
// <name>", "within <name>", "<name> <split>", the name right there — not a
// list of parts ("breakdown of beans and other inputs"). An item that is
// itself a part ("…share of COGS") answers a split.
export function splitOfItem(what: string, item: { label: string }, names: string[] = []): boolean {
  if (PART_LABEL.test(item.label)) return false;
  const esc = (x: string) => x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const det = String.raw`(?:the\s+|that\s+|those\s+|this\s+)?`;
  return names.map(esc).some(name => new RegExp(String.raw`(?:\b${SPLIT_WORDS}\s+(?:of|within|inside|in)\s+|\b(?:within|inside)\s+)${det}${name}\b(?!\s*(?:,|and\b|or\b|vs\.?|versus\b))|\b${name}\s+${SPLIT_WORDS}\b`, 'i').test(what));
}

// A basis ask (Lorenzo, 19 Oct; batch 32 Larkspur Marisol t27, "Basis for the 70%
// load factor estimate on the new routes" answered by restating the plan): out
// of scope of an item unless the item's value itself says where the figure comes from.
const SAYS_BASIS = /\b(?:based on|comes? from|derived from|benchmark(?:ed)? (?:on|against))\b/i;

// A one-off cost ask (Lorenzo, 20 Oct; batch 34 Aldermoor Marisol t23, "the
// one-off cost to stand up the US team, separate from the $80M annual" got
// Option A's annual line restated): a finer cut of an item whose value states
// only an annual or monthly figure and no one-off wording of its own.
const ONE_OFF_ASK = /\b(?:one[- ]?offs?|one[- ]?time|up-?front|set-?up|start-?up|stand(?:ing)?[- ]up)\s+(?:costs?|fees?|spend|expenses?|investment|capex)\b|\b(?:costs?|spend|investment)\s+(?:to|of|for)\s+(?:stand(?:ing)?[- ]up|set(?:ting)?[- ]up|start(?:ing)?[- ]up)\b/i;
const RECURRING_VALUE = /\b(?:annual|annually|yearly|a year|per year|each year|a month|per month|monthly)\b/i;
const ONE_OFF_VALUE = /\b(?:one[- ]?offs?|one[- ]?time|up-?front|set-?up|start-?up|stand(?:ing)?[- ]up|launch costs?)\b/i;

// A change item asked for a split (the clause in outsideAskScope below): a topic
// sibling of the ask, not the asked quantity at a coarser cut — E1 doesn't give it
// as a coarse item (controller ruling, 20 Oct, replay r5-44: b31 Sofia t17 "the
// current COGS split by category" mapped to the two input price changes).
export function changeForSplit(what: string, item: { label: string }): boolean {
  return new RegExp(String.raw`\b${SPLIT_WORDS}\b`, 'i').test(what) && CHANGE_LABEL.test(item.label) && !MOVEMENT_ASK.test(what);
}

export function outsideAskScope(what: string, item: { label: string; value?: string; timeframes?: Record<string, string> }, names: string[] = []): boolean {
  const ask = what.toLowerCase();
  if (BASIS.test(ask) && !SAYS_BASIS.test(item.value ?? '')) return true;
  if (ONE_OFF_ASK.test(ask) && RECURRING_VALUE.test(item.value ?? '') && !ONE_OFF_VALUE.test(item.value ?? '')) return true;
  // A count asked of an item that states no figure (round 5 Task 50; fact-check.ts
  // COUNT_ASK): the item is the ask's coarse answer, not the count.
  if (item.value !== undefined && countFinerThan(ask, item.value)) return true;
  const head = HEAD_NOUN(item.label);
  if (!head) return false;
  const label = item.label.toLowerCase();
  // A split of the item itself: "<split> of/within/inside <head>", "within <head>", "<head> <split>".
  const splitOfHead = new RegExp(String.raw`\b${SPLIT_WORDS}\s+(?:of|within|inside|in|for)\s+(?:the\s+)?(?:[\w&-]+\s+){0,3}?${head}\b|\b(?:within|inside)\s+(?:the\s+)?${head}\b|\b${head}\s+${SPLIT_WORDS}\b`, 'i');
  if (splitOfHead.test(ask) && !PART_LABEL.test(label)) return true;
  if (splitOfItem(ask, item, names)) return true;
  // A split / composition ask is about the parts, not how they moved: a
  // change item ("price change of the other inputs") is in scope only when the
  // ask also asks about movement ("…and how each moved", "the price trend").
  // Batch 18: "the split of COGS by input" released the 37.5% price change in 7 runs.
  if (changeForSplit(ask, item)) return true;
  const cut = CUT.exec(ask);
  // "total or per store" asks for either: the uncut figure is in scope.
  if (cut && !/\b(?:total|overall|in total)\s+(?:or|and)\b|\b(?:or|and)\s+(?:in\s+)?total\b/.test(ask)) {
    const dim = (cut[1] ?? cut[2] ?? cut[3] ?? '').toLowerCase();
    if (dim === 'year') return Object.values(item.timeframes ?? {}).length === 0 && !/\byear/.test(label);
    if (!label.includes(dim)) return true;
  }
  return false;
}

export type ExhibitInfo = { id: string; title: string; coversLedgerItems?: string[]; after?: string[]; requiresItems?: string[]; required?: boolean };

// Release order (new cases, 13 Oct; the case's exhibit `after` / `requiresItems`):
// an exhibit is ready once every exhibit it comes after is out — shown, or all
// of its data already released as lines — every stage it comes after is out
// (`stagesOut`, from Plan: Hollis Bay's sampling exhibit after the brainstorm),
// and every item it requires is out. Larkspur's Exhibit 3 before the
// per-flight math gives the answer away.
const NO_STAGES: ReadonlySet<string> = new Set();
// An exhibit is out once shown, or once all of its data went out as lines.
export function exhibitOut(x: ExhibitInfo, shown: ReadonlySet<string>, ledger: DataLedger): boolean {
  return shown.has(x.id) || ((x.coversLedgerItems ?? []).length > 0 && (x.coversLedgerItems ?? []).every(id => ledger.revealed.has(id)));
}
export function exhibitReady(e: ExhibitInfo, exhibits: ExhibitInfo[], shown: Set<string>, ledger: DataLedger, stagesOut: ReadonlySet<string> = NO_STAGES): boolean {
  const out = (x: ExhibitInfo) => exhibitOut(x, shown, ledger);
  return (e.after ?? []).every(id => {
    if (isOrderStage(id)) return stagesOut.has(id);
    const x = exhibits.find(y => y.id === id); return x === undefined || out(x);
  })
    && (e.requiresItems ?? []).every(id => ledger.revealed.has(id));
}

// The exhibit code hands over when it administers the exhibit stage: the
// first not yet shown whose turn has come.
export function nextReadyExhibit<E extends ExhibitInfo>(exhibits: E[], shown: Set<string>, ledger: DataLedger, stagesOut: ReadonlySet<string> = NO_STAGES): E | undefined {
  return exhibits.find(e => !shown.has(e.id) && exhibitReady(e, exhibits, shown, ledger, stagesOut));
}

// The next required exhibit still owed, when its turn has come (a required
// exhibit's predecessors are required, so the first unshown one is next).
export function nextRequiredExhibit<E extends ExhibitInfo>(exhibits: E[], shown: Set<string>, ledger: DataLedger, stagesOut: ReadonlySet<string> = NO_STAGES): E | undefined {
  const next = exhibits.find(e => e.required && !shown.has(e.id));
  return next && exhibitReady(next, exhibits, shown, ledger, stagesOut) ? next : undefined;
}

// An item still unreleased that only exhibits not yet ready show waits with them.
export function heldForOrder(id: string, exhibits: ExhibitInfo[], shown: Set<string>, ledger: DataLedger, stagesOut: ReadonlySet<string> = NO_STAGES): boolean {
  if (ledger.revealed.has(id)) return false;
  const covering = exhibits.filter(e => (e.coversLedgerItems ?? []).includes(id));
  return covering.length > 0 && covering.every(e => !shown.has(e.id) && !exhibitReady(e, exhibits, shown, ledger, stagesOut));
}

export type DataDecisions = {
  releases: { id: string; value: string; earlier: boolean }[];
  restates: { id: string; value: string; exhibit?: boolean }[];  // explicit re-asks of data already revealed: said again, never re-booked
  exhibit: { id: string; title: string; covers: string[] } | null;
  refusals: string[];     // what, for explicit asks the case doesn't hold
  defers: string[];       // what, for asks held for later (by the model, or over the cap)
  gateDefers: string[];   // what, for asks the pressure-test gate holds: deferred with the reason (v3)
  // Explicit deferrals with no item, awaiting the small-model check (turn-data.ts
  // turnDataChecked; Lorenzo, 19 Oct, engine-asks R1). Nothing is said for them
  // until then; its verdict decides each (decideCheckedAsk, round 5 E5).
  unmatchedDefers: string[];
  // Every deferral on a wrap-up or close turn: "We won't get to <ask> today."
  // (Lorenzo, 19 Oct, round-2 ruling 3: the check's named deferrals, set by
  // turnDataChecked; round-3 ruling 4: item-backed, gate and over-cap ones too, set
  // by decideData). Nothing is held for them: `defers` and `gateDefers` stay empty there.
  wontGetTo?: string[];
  // Which of `defers` are the check's item-less named deferrals: they hold no ledger
  // item, so they hold no data (Lorenzo, 19 Oct, round-3 ruling 3; set by turnDataChecked).
  itemlessDefers?: string[];
  offers: string[];       // what, for passing mentions of data the case holds
  // Rule 6 option 4 (v4.11): code's correction of a misquoted revealed figure,
  // spoken first in the data line (set by turn-data.ts on model turns).
  correction?: { item: string; items?: string[]; text: string } | null;
  // wontGetTo: a deferral said as "We won't get to … today." — logged so the queue
  // doesn't promise it again (plan-turn.ts promisedRows); still asked-but-unanswered.
  requests: { request: DeclaredRequest; response: RequestResponse; ledgerItemIds: string[]; wontGetTo?: true }[];
};

// The deferrals that hold a ledger item: the check's item-less named deferrals hold no data.
export function itemBackedDefers(d: Pick<DataDecisions, 'defers' | 'itemlessDefers'>): string[] {
  const itemless = new Set(d.itemlessDefers ?? []);
  return d.defers.filter(w => !itemless.has(w));
}

export function decideData(p: {
  requests: DeclaredRequest[];      // ids already resolved to canonical ledger / exhibit ids
  exhibit: string | null;           // the model's own handover
  rescueItem: string | null;
  rung3: boolean;
  ledger: DataLedger;
  exhibits: ExhibitInfo[];
  shownExhibitIds: Set<string>;
  stagesOut?: ReadonlySet<string>;  // stages an exhibit's `after` may wait on that are out (Plan's stagesOut)
  open: RequestedUnanswered[];      // explicit asks from earlier turns still unreleased
  gateHeld?: Set<string>;           // whats of requests the pressure-test gate turned into deferrals
  candidateText: string;           // the candidate's message: a mention is offered only when it states a need for the item
  cap?: number;
  groups?: string[][];              // items asked as one group: the cap never splits one
  wrapUp?: boolean;                 // a wrap-up or close turn (turn-data.ts wrapUpTurn): every deferral is "We won't get to …"
}): DataDecisions {
  const cap = p.cap ?? RELEASE_CAP;
  // A group already going out completes past the cap; nothing else does.
  const groupStarted = (id: string) => (p.groups ?? []).some(g => g.includes(id) && releases.some(r => g.includes(r.id)));
  const overCap = (id: string) => releases.length >= cap && !groupStarted(id);
  const itemById = new Map(p.ledger.items.map(i => [i.id, i]));
  const exhibitById = new Map(p.exhibits.map(e => [e.id, e]));
  const openIds = new Set(p.open.map(o => o.ledgerItemId));

  // Exhibit: one per turn — a requested one first; then one whose data the ask
  // covers (v4.10, Rule 10: data an exhibit shows is released by showing it —
  // batch 18 read the cost lines aloud and never showed the chart in 8 runs;
  // two or more of its items, still unreleased, in one explicit ask); else the
  // model's handover.
  // Only an exhibit whose turn has come (exhibitReady) goes out, by any path.
  const ready = (id: string) => exhibitById.has(id) && !p.shownExhibitIds.has(id) && exhibitReady(exhibitById.get(id)!, p.exhibits, p.shownExhibitIds, p.ledger, p.stagesOut);
  const explicitIds = p.requests.filter(r => r.explicit && r.respond === 'release').flatMap(r => r.itemIds);
  const requestedExhibit = explicitIds.find(ready);
  const coveringExhibit = p.exhibits.find(e => ready(e.id)
    && (e.coversLedgerItems ?? []).filter(id => explicitIds.includes(id) && canReveal(p.ledger, id)).length >= 2)?.id;
  const exhibitId = requestedExhibit ?? coveringExhibit ?? (p.exhibit && ready(p.exhibit) ? p.exhibit : null);
  const exhibit = exhibitId
    ? { id: exhibitId, title: exhibitById.get(exhibitId)!.title, covers: exhibitById.get(exhibitId)!.coversLedgerItems ?? [] }
    : null;
  const covered = new Set(exhibit?.covers ?? []);

  const releases: DataDecisions['releases'] = [];
  const releasing = new Set<string>();
  // Already revealed is not "don't say it again" (batch 18 v3 recheck: an
  // explicit re-ask got nothing while the model said "Here they are again").
  const restates: DataDecisions['restates'] = [];
  const restating = new Set<string>();
  const restatable = (id: string) => itemById.has(id) && p.ledger.revealed.has(id) && !restating.has(id) && !releasing.has(id);
  const refusals: string[] = [];
  const defers: string[] = [];
  const gateDefers: string[] = [];
  const offers: string[] = [];
  const unmatchedDefers: string[] = [];
  const decided: DataDecisions['requests'] = [];
  // The requests a deferral line is said for.
  const deferSaid = new Set<DeclaredRequest>();

  const available = (id: string) => itemById.has(id) && canReveal(p.ledger, id) && !releasing.has(id);
  // What a promise says: an ask worded as an item's catalog label is said as the
// item — its authored spoken name, else spokenItemName.
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  // A group of held items (Lorenzo, 13 Oct; Tyler af62e2e2 t4: "COGS as a
  // percent of revenue, year one versus year three, labor …, year one versus
  // year three, and …") is said by each item's spoken name, once — not the
  // ask's own wording per item. Recorded here, applied when the line holds 2+.
  const spokenFor = new Map<string, string>();
  const promised = (r: DeclaredRequest, ids: string[]) => {
    const item = ids.map(id => itemById.get(id)).find(i => i !== undefined && norm(i.label) === norm(r.what));
    const what = item ? item.spoken ?? spokenItemName(item.label) : r.what;
    const only = ids.length === 1 ? itemById.get(ids[0]) : undefined;
    if (only) spokenFor.set(what, only.spoken ?? spokenItemName(only.label));
    return what;
  };
  const asGroup = (whats: string[]) => (whats.length > 1 ? [...new Set(whats.map(w => spokenFor.get(w) ?? w))] : whats);
  // Waiting on the release order: an item only an exhibit not yet ready shows, or that exhibit itself.
  const orderHeld = (id: string) => (itemById.has(id) ? heldForOrder(id, p.exhibits, p.shownExhibitIds, p.ledger, p.stagesOut)
    : exhibitById.has(id) && !p.shownExhibitIds.has(id) && id !== exhibit?.id && !ready(id));

  // Two passes: every direct release first, then deferrals and offers, so a
  // request is never deferred or offered for an item released this same turn
  // (batch 11, Nikhil t6: "COGS is 58%… I'll come back to the cost breakdown"
  // — the deferral was declared before the release of one of its items).
  const decidedAt: { at: number; d: DataDecisions['requests'][number] }[] = [];
  const later: { at: number; r: DeclaredRequest; ledgerIds: string[] }[] = [];
  p.requests.forEach((r, at) => {
    const ledgerIds = r.itemIds.filter(id => itemById.has(id));
    const exhibitIds = r.itemIds.filter(id => exhibitById.has(id));
    if (ledgerIds.length === 0 && exhibitIds.length === 0) {
      // An unmapped deferral contradicts itself (the model meant to hold
      // something): neither refused nor promised here — the small-model check
      // decides (turnDataChecked); the generic "settle your structure" line
      // answered nothing (batch 32 Aldermoor Marcus t5).
      // An unmapped release is refused here; turnData sends it through the same
      // check (round-2 ruling 2, 19 Oct) unless it is the finer cut of an ask whose
      // coarse item goes out beside it (round 5 E1, 20 Oct: `scope_coarse`).
      if (r.explicit && r.respond === 'defer') { unmatchedDefers.push(r.what); decidedAt.push({ at, d: { request: r, response: 'defer', ledgerItemIds: [] } }); }
      else if (r.explicit) { refusals.push(r.what); decidedAt.push({ at, d: { request: r, response: 'refuse', ledgerItemIds: [] } }); }
      return;
    }
    if (!r.explicit || r.respond === 'defer') { later.push({ at, r, ledgerIds }); return; }
    let heldOver = exhibitIds.some(orderHeld);
    for (const id of ledgerIds) {
      if (covered.has(id)) continue;
      if (restatable(id)) {
        if (restates.length < cap) { restates.push({ id, value: itemById.get(id)!.value, ...(p.ledger.exhibitOnly?.has(id) ? { exhibit: true } : {}) }); restating.add(id); }
        continue;
      }
      if (!available(id)) continue;
      if (orderHeld(id) || overCap(id)) { heldOver = true; continue; }
      releases.push({ id, value: itemById.get(id)!.value, earlier: openIds.has(id) });
      releasing.add(id);
    }
    if (heldOver) { defers.push(promised(r, ledgerIds)); deferSaid.add(r); }
    decidedAt.push({ at, d: { request: r, response: heldOver ? 'defer' : 'release', ledgerItemIds: ledgerIds } });
  });

  for (const { at, r, ledgerIds } of later) {
    // Items still held after this turn's releases; a request partly answered
    // by them gets no deferral line, but what it still holds stays tracked.
    // The exhibit handed over this turn delivers what it shows (step 4, batch
    // 19: Camila t6 and Sofia t4 heard the exhibit and "I'll come back to the
    // cost breakdown" in the same turn).
    const held = ledgerIds.filter(id => !releasing.has(id) && !covered.has(id));
    const partlyReleased = held.length < ledgerIds.length;
    if (!r.explicit) {
      const offerable = held.filter(id => available(id) && !covered.has(id) && !orderHeld(id))
        .filter(id => mentionStatesNeed(p.candidateText, itemById.get(id)?.label ?? ''));
      if (offerable.length > 0 && r.respond === 'release' && !partlyReleased) offers.push(promised(r, ledgerIds));
    } else if (held.some(available) && !partlyReleased) {
      (p.gateHeld?.has(r.what) ? gateDefers : defers).push(promised(r, ledgerIds));
      deferSaid.add(r);
    }
    decidedAt.push({ at, d: held.length === 0 && ledgerIds.length > 0
      ? { request: r, response: 'release', ledgerItemIds: ledgerIds }
      : { request: r, response: 'defer', ledgerItemIds: held } });
  }
  decided.push(...decidedAt.sort((x, y) => x.at - y.at).map(x => x.d));

  if (p.rung3 && p.rescueItem && available(p.rescueItem) && !covered.has(p.rescueItem) && !orderHeld(p.rescueItem) && releases.length < cap) {
    releases.push({ id: p.rescueItem, value: itemById.get(p.rescueItem)!.value, earlier: false });
  }

  // Earlier asks first, so the lead-in introduces them together.
  releases.sort((a, b) => Number(b.earlier) - Number(a.earlier));
  // A wrap-up or close turn (Lorenzo, 19 Oct, round-3 ruling 4: "Close turns: all
  // deferrals, item-backed included, become "We won't get to <ask> today.""): every
  // deferral line — the model's, over the cap, the release order's, the gate's —
  // is said as one; the case won't come back to them, so nothing is held.
  if (p.wrapUp && defers.length + gateDefers.length > 0) {
    return {
      releases, restates, exhibit, refusals, defers: [], gateDefers: [], unmatchedDefers, offers,
      wontGetTo: [...asGroup(defers), ...asGroup(gateDefers)],
      requests: decided.map(x => (x.response === 'defer' && deferSaid.has(x.request) ? { ...x, wontGetTo: true as const } : x)),
    };
  }
  return { releases, restates, exhibit, refusals, defers: asGroup(defers), gateDefers: asGroup(gateDefers), unmatchedDefers, offers, requests: decided };
}

// An item spoken mid-sentence starts lower-case (smoke run 9 Oct: "I don't
// have Pilot elasticity results … or Competitor pricing actions" — the
// classifier's capital). Kept as written when its first word looks like an
// acronym ("COGS", "NPS"), carries a digit ("Q3"), has an inner capital
// ("McKinsey"), or opens a capitalised name ("Brew & Bean", "Blue Bottle").
// A question word is never a name (round 5 Task 49 fix round 1; b32 Larkspur
// Marisol t18: "Hold that thought on Whether Larkspur has sufficient crew
// capacity…"). The logged `what` is never changed.
const QUESTION_WORD = /^(?:whether|if|how|what|when|where|which|who|why)$/i;
function spokenWhat(what: string): string {
  const words = what.trim().split(/\s+/);
  const first = words[0] ?? '';
  const letters = first.replace(/[^A-Za-z]/g, '');
  const next = words.slice(1).find(w => /[A-Za-z]/.test(w)) ?? '';
  if (QUESTION_WORD.test(first)) return what.charAt(0).toLowerCase() + what.slice(1);
  const keep = !/^[A-Z]/.test(first)
    || /\d/.test(first)
    || (letters.length >= 2 && letters === letters.toUpperCase())
    || /[A-Z]/.test(first.slice(1))
    || /^[A-Z][a-z]+['’]s$/.test(first)   // a possessive name: "Kelvexa's", "Larkspur's"
    || /^[A-Z]/.test(next);
  return keep ? what : what.charAt(0).toLowerCase() + what.slice(1);
}

// Catalog text read aloud is speech (step 4, batch 19: Camila t4 "COGS as %
// of revenue … overhead / rent as % of revenue", Owen t24 "… price changes /
// price elasticity data", Sam t10 "(dairy, packaging, food)"): a slash is
// "or" in a refusal; elsewhere "and", or in a list of several its first term
// ("COGS, labor and overhead as a percent of revenue", not "… and overhead and
// rent …"); "as % of" is said, a parenthesis
// inside becomes an aside and one at the end is dropped (it only clarifies,
// and an unclosed aside runs into the next item). A figure's own "%" stays.
// A catalog heading before a colon is dropped (fact checks, 12 Oct: remapped asks are said back in labels).
function speakable(what: string, conj: 'and' | 'or', inList: boolean): string {
  // A promise names the item; the data line will state its periods (batch 21 D8,
  // Anika t6: "COGS as a percent of revenue, both years, labor …, both years").
  // A refusal keeps them: they may be exactly what the case lacks.
  return (conj === 'and' ? what.replace(PERIOD_TAIL, '') : what)
    // A catalog heading before a colon isn't said: "Composition of COGS: coffee beans' share of COGS".
    .replace(/^[A-Z][^:]{2,40}:\s+(?=\S)/, '')
    .replace(/(\S+)\s*\/\s*(\S+)/g, (_, x: string, y: string) => (conj === 'or' ? `${x} or ${y}` : inList ? x : `${x} and ${y}`))
    .replace(/\bas\s*%\s*of\b/gi, 'as a percent of')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*\(([^)]*)\)\s*/g, (_, inner: string) => ` — ${inner.replace(/,\s*([^,]+)$/, ' and $1')} — `)
    .replace(/\s+/g, ' ').trim();
}

// A catalog label said as the item it names, in a promise (batch 21 D8, Anika
// t10: "I'll come back to coffee bean price change over 2 years shortly"): no
// period qualifier; a heading before a colon is the name when what follows
// lists details ("Hub–Lakeport results: revenue, contribution and flights"),
// else what follows is ("Composition of COGS: coffee beans' share of COGS");
// "the" before a common noun, not before a share of revenue, an acronym, a
// possessive name, a multi-word name or a question word.
const PERIOD_TAIL = /,?\s*(?:(?:for |in )?(?:both|each of the two) years|by year|over (?:the )?(?:(?:past|last) )?(?:2|two) years|(?:today|now) (?:and|versus|vs\.?) (?:2|two) years ago|(?:2|two) years ago (?:and|versus|vs\.?) (?:today|now)|then (?:and|versus|vs\.?) now)\s*$/i;
export function spokenItemName(label: string): string {
  let s = label.replace(PERIOD_TAIL, '').trim();
  const head = /^([^:]{3,60}):\s+(.+)$/.exec(s);
  if (head) s = /,|\s(?:and|—|–)\s/.test(head[2]) ? head[1] : head[2];
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const first = s.split(/\s+/)[0] ?? '';
  const letters = first.replace(/[^A-Za-z]/g, '');
  const bare = /^(?:the|a|an|what|how|when|why|who|where|which|whether|its|their|our|your)$/i.test(first)
    || /['’]s$/.test(first) || /\d/.test(first) || (letters.length >= 2 && letters === letters.toUpperCase())
    || /\bas (?:%|a percent(?:age)?|a share) of\b/i.test(s) || /^[A-Z]/.test(s.split(/\s+/)[1] ?? '');   // a name: "Entry Option A"
  return bare ? s : `the ${spokenWhat(s)}`;
}

const joinWhat = (whats: string[], conj: 'and' | 'or') => {
  const inList = new Set(whats).size > 1;
  const u = [...new Set(whats.map(w => spokenWhat(speakable(w, conj, inList))))];
  if (u.length <= 1) return u[0] ?? '';
  // A suffix every item shares is said once: "COGS and labor as a percent of revenue".
  const tail = / as a (?:percent|share) of revenue$/i.exec(u[0])?.[0];
  const items = tail && u.every(x => x.toLowerCase().endsWith(tail.toLowerCase())) ? u.map(x => x.slice(0, -tail.length)) : u;
  // An item that has its own "and" or "including" gets a comma before the last
  // ("COGS, labor, and overhead including rent" — Lorenzo, 15 Oct).
  const serial = items.length > 2 && items.some(x => / (?:and|including) /.test(x)) ? ',' : '';
  return `${items.slice(0, -1).join(', ')}${serial} ${conj} ${items.at(-1)}${items === u ? '' : tail}`;
};

// "We won't get to <ask> today."; "…that today." for a long label (more than 8
// words as said) or a list — two or more asks (a group among them), or a label
// with a comma or an "and" (Lorenzo, 19 Oct, round-3 ruling 4; the controller's
// definitions; batch 32 Larkspur Marcus / Marisol t28).
const WONT_GET_TO_WORDS = 8;
function wontGetToLine(whats: string[], uses: PhraseUses | undefined, seed: string): string {
  const what = joinWhat(whats, 'and');
  // Two asks or more are joined with "and" (joinWhat), so the joined text tells.
  const list = /,|\sand\s/i.test(what);
  return list || what.split(/\s+/).length > WONT_GET_TO_WORDS ? line('wont_get_to_that', uses, seed) : phrase('wont_get_to', what, uses, seed);
}

// The spoken data lines, in order: releases (earlier asks under one lead-in),
// the exhibit handover, refusals, deferrals, offers — each with what it
// carries, so voice bookkeeping can tell which sentence a release is in
// (spec 2026-10-08-voice-phase-b §5.3).
export type DataLinePart = { kind: 'correction' | 'leadin' | 'release' | 'restate' | 'exhibit' | 'refusals' | 'defers' | 'offers'; ids: string[]; text: string };

// `uses`: the session's recent connecting words (phrasing.ts) — the content is verbatim.
// With DATA_LINE_VARIANTS=1, a ledger line that has pre-written versions
// (cases/variants; prof-001) is said in one of them — checked on load to state
// exactly the ledger's figures, periods and units; otherwise the ledger line.
function dataLine(value: string, uses: PhraseUses | undefined, seed: string): string {
  const d = dataLineVariantsOn() ? dataLineVersions(value) : null;
  return d ? d.versions[versionIndex(`data:${d.itemId}`, d.versions.length, uses, seed)] : value;
}
export function renderDataLineParts(d: DataDecisions, seed: string, uses?: PhraseUses): DataLinePart[] {
  const parts: DataLinePart[] = [];
  if (d.correction) parts.push({ kind: 'correction', ids: [], text: d.correction.text });
  const earlier = d.releases.filter(r => r.earlier);
  if (earlier.length > 0) parts.push({ kind: 'leadin', ids: [], text: phrase('earlier', '', uses, seed) });
  for (const r of d.releases) parts.push({ kind: 'release', ids: [r.id], text: dataLine(r.value, uses, seed) });
  // Restated values carry no ids: nothing is booked as a new reveal.
  // The lead-in names where the item came from: what was said ("As I mentioned"), what only an exhibit showed ("As the exhibit shows").
  const saidFirst = [...d.restates.filter(r => !r.exhibit), ...d.restates.filter(r => r.exhibit)];
  saidFirst.forEach((r, i) => {
    const v = dataLine(r.value, uses, seed);
    const lead = i === 0 || Boolean(r.exhibit) !== Boolean(saidFirst[i - 1].exhibit);
    parts.push({ kind: 'restate', ids: [], text: lead ? phrase(r.exhibit ? 'restate_exhibit' : 'restate', v, uses, seed) : v });
  });
  if (d.exhibit) parts.push({ kind: 'exhibit', ids: [d.exhibit.id], text: phrase('exhibit', d.exhibit.title, uses, seed) });
  if (d.refusals.length > 0) parts.push({ kind: 'refusals', ids: [], text: phrase('refuse', joinWhat(d.refusals, 'or'), uses, seed) });
  if (d.defers.length > 0) parts.push({ kind: 'defers', ids: [], text: phrase('defer', joinWhat(d.defers, 'and'), uses, seed) });
  if (d.wontGetTo?.length) parts.push({ kind: 'defers', ids: [], text: wontGetToLine(d.wontGetTo, uses, seed) });
  if (d.gateDefers.length > 0) parts.push({ kind: 'defers', ids: [], text: phrase('gate_defer', joinWhat(d.gateDefers, 'and'), uses, seed) });
  if (d.offers.length > 0) parts.push({ kind: 'offers', ids: [], text: phrase('offer', joinWhat(d.offers, 'and'), uses, seed) });
  return parts;
}

export function renderDataLines(d: DataDecisions, seed: string, uses?: PhraseUses): string[] {
  return renderDataLineParts(d, seed, uses).map(p => p.text);
}

// The turn's data_request rows (scoring reads these shapes; spec §9).
export function decisionRows(d: DataDecisions): { what: string; ledgerItemIds: string[]; response: RequestResponse; explicit: boolean; wontGetTo?: true }[] {
  return d.requests.map(x => ({ what: x.request.what, ledgerItemIds: x.ledgerItemIds, response: x.response, explicit: x.request.explicit, ...(x.wontGetTo ? { wontGetTo: true as const } : {}) }));
}
