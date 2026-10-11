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
import { pickScript, STALE_RELEASE_LEADINS } from '@/lib/agent/prompts/scripts';

export const RELEASE_CAP = 3;

// The lead-in for data said again on an explicit re-ask.
export const RESTATE_LEADIN = 'As I mentioned:';

// Spec 2026-10-07 §4's line for asks code can't map while the structure is
// open. v4.10 (KF-4): it promises nothing — the ask may name data the case
// doesn't have; it is put to the interviewer again once the structure is
// settled (plan-turn.ts unmappedToResolve), to map or decline then.
export const UNMAPPED_DEFER_LINE = "Let's settle your structure before we get into the data.";

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
const CUT = /\b(?:per|by|for each)\s+(pound|lb|gallon|sku|product|store|location|region|market|month|quarter|week|day|daypart|channel|customer|segment|supplier|year)s?\b|\b(variable|fixed)\b/i;
const PART_LABEL = /\b(?:share|split|composition|breakdown|mix|component)\b/i;
const CHANGE_LABEL = /\b(?:change|changes|growth|increase|inflation|trend)\b/i;
const MOVEMENT_ASK = /\b(?:chang\w*|mov\w*|grow\w*|grew|increas\w*|inflat\w*|trend\w*|rose|risen|went up|over (?:time|the (?:two )?years)|year[- ]over[- ]year|both years|each year|price (?:trend|history|movement)|then (?:versus|vs\.?|and) now|(?:versus|vs\.?) (?:now|today)|before and after)\b/i;

export function outsideAskScope(what: string, item: { label: string; timeframes?: Record<string, string> }): boolean {
  const ask = what.toLowerCase();
  const head = HEAD_NOUN(item.label);
  if (!head) return false;
  const label = item.label.toLowerCase();
  // A split of the item itself: "<split> of/within/inside <head>", "within <head>", "<head> <split>".
  const splitOfHead = new RegExp(String.raw`\b${SPLIT_WORDS}\s+(?:of|within|inside|in|for)\s+(?:the\s+)?(?:[\w&-]+\s+){0,3}?${head}\b|\b(?:within|inside)\s+(?:the\s+)?${head}\b|\b${head}\s+${SPLIT_WORDS}\b`, 'i');
  if (splitOfHead.test(ask) && !PART_LABEL.test(label)) return true;
  // A split / composition ask is about the parts, not how they moved: a
  // change item ("price change of the other inputs") is in scope only when the
  // ask also asks about movement ("…and how each moved", "the price trend").
  // Batch 18: "the split of COGS by input" released the 37.5% price change in 7 runs.
  if (new RegExp(String.raw`\b${SPLIT_WORDS}\b`, 'i').test(ask) && CHANGE_LABEL.test(label) && !MOVEMENT_ASK.test(ask)) return true;
  const cut = CUT.exec(ask);
  // "total or per store" asks for either: the uncut figure is in scope.
  if (cut && !/\b(?:total|overall|in total)\s+(?:or|and)\b|\b(?:or|and)\s+(?:in\s+)?total\b/.test(ask)) {
    const dim = (cut[1] ?? cut[2] ?? '').toLowerCase();
    if (dim === 'year') return Object.values(item.timeframes ?? {}).length === 0 && !/\byear/.test(label);
    if (!label.includes(dim)) return true;
  }
  return false;
}

export type ExhibitInfo = { id: string; title: string; coversLedgerItems?: string[] };

export type DataDecisions = {
  releases: { id: string; value: string; earlier: boolean }[];
  restates: { id: string; value: string }[];  // explicit re-asks of data already revealed: said again, never re-booked
  exhibit: { id: string; title: string; covers: string[] } | null;
  refusals: string[];     // what, for explicit asks the case doesn't hold
  defers: string[];       // what, for asks held for later (by the model, or over the cap)
  gateDefers: string[];   // what, for asks the pressure-test gate holds: deferred with the reason (v3)
  unmappedDefer: boolean; // an explicit deferral the model couldn't map: a generic line, nothing promised
  offers: string[];       // what, for passing mentions of data the case holds
  requests: { request: DeclaredRequest; response: RequestResponse; ledgerItemIds: string[] }[];
};

export function decideData(p: {
  requests: DeclaredRequest[];      // ids already resolved to canonical ledger / exhibit ids
  exhibit: string | null;           // the model's own handover
  rescueItem: string | null;
  rung3: boolean;
  ledger: DataLedger;
  exhibits: ExhibitInfo[];
  shownExhibitIds: Set<string>;
  open: RequestedUnanswered[];      // explicit asks from earlier turns still unreleased
  gateHeld?: Set<string>;           // whats of requests the pressure-test gate turned into deferrals
  cap?: number;
}): DataDecisions {
  const cap = p.cap ?? RELEASE_CAP;
  const itemById = new Map(p.ledger.items.map(i => [i.id, i]));
  const exhibitById = new Map(p.exhibits.map(e => [e.id, e]));
  const openIds = new Set(p.open.map(o => o.ledgerItemId));

  // Exhibit: one per turn — a requested one first; then one whose data the ask
  // covers (v4.10, Rule 10: data an exhibit shows is released by showing it —
  // batch 18 read the cost lines aloud and never showed the chart in 8 runs;
  // two or more of its items, still unreleased, in one explicit ask); else the
  // model's handover.
  const explicitIds = p.requests.filter(r => r.explicit && r.respond === 'release').flatMap(r => r.itemIds);
  const requestedExhibit = explicitIds.find(id => exhibitById.has(id) && !p.shownExhibitIds.has(id));
  const coveringExhibit = p.exhibits.find(e => !p.shownExhibitIds.has(e.id)
    && (e.coversLedgerItems ?? []).filter(id => explicitIds.includes(id) && canReveal(p.ledger, id)).length >= 2)?.id;
  const exhibitId = requestedExhibit ?? coveringExhibit ?? (p.exhibit && exhibitById.has(p.exhibit) && !p.shownExhibitIds.has(p.exhibit) ? p.exhibit : null);
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
  let unmappedDefer = false;
  const decided: DataDecisions['requests'] = [];

  const available = (id: string) => itemById.has(id) && canReveal(p.ledger, id) && !releasing.has(id);

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
      // something): no refusal, and no named item promised — it may not exist.
      if (r.explicit && r.respond === 'defer') { unmappedDefer = true; decidedAt.push({ at, d: { request: r, response: 'defer', ledgerItemIds: [] } }); }
      else if (r.explicit) { refusals.push(r.what); decidedAt.push({ at, d: { request: r, response: 'refuse', ledgerItemIds: [] } }); }
      return;
    }
    if (!r.explicit || r.respond === 'defer') { later.push({ at, r, ledgerIds }); return; }
    let heldOver = false;
    for (const id of ledgerIds) {
      if (covered.has(id)) continue;
      if (restatable(id)) {
        if (restates.length < cap) { restates.push({ id, value: itemById.get(id)!.value }); restating.add(id); }
        continue;
      }
      if (!available(id)) continue;
      if (releases.length >= cap) { heldOver = true; continue; }
      releases.push({ id, value: itemById.get(id)!.value, earlier: openIds.has(id) });
      releasing.add(id);
    }
    if (heldOver) defers.push(r.what);
    decidedAt.push({ at, d: { request: r, response: heldOver ? 'defer' : 'release', ledgerItemIds: ledgerIds } });
  });

  for (const { at, r, ledgerIds } of later) {
    // Items still held after this turn's releases; a request partly answered
    // by them gets no deferral line, but what it still holds stays tracked.
    const held = ledgerIds.filter(id => !releasing.has(id));
    const partlyReleased = held.length < ledgerIds.length;
    if (!r.explicit) {
      const offerable = held.filter(id => available(id) && !covered.has(id));
      if (offerable.length > 0 && r.respond === 'release' && !partlyReleased) offers.push(r.what);
    } else if (held.some(available) && !partlyReleased) {
      (p.gateHeld?.has(r.what) ? gateDefers : defers).push(r.what);
    }
    decidedAt.push({ at, d: held.length === 0 && ledgerIds.length > 0
      ? { request: r, response: 'release', ledgerItemIds: ledgerIds }
      : { request: r, response: 'defer', ledgerItemIds: held } });
  }
  decided.push(...decidedAt.sort((x, y) => x.at - y.at).map(x => x.d));

  if (p.rung3 && p.rescueItem && available(p.rescueItem) && !covered.has(p.rescueItem) && releases.length < cap) {
    releases.push({ id: p.rescueItem, value: itemById.get(p.rescueItem)!.value, earlier: false });
  }

  // Earlier asks first, so the lead-in introduces them together.
  releases.sort((a, b) => Number(b.earlier) - Number(a.earlier));
  return { releases, restates, exhibit, refusals, defers, gateDefers, unmappedDefer, offers, requests: decided };
}

// An item spoken mid-sentence starts lower-case (smoke run 9 Oct: "I don't
// have Pilot elasticity results … or Competitor pricing actions" — the
// classifier's capital). Kept as written when its first word looks like an
// acronym ("COGS", "NPS"), carries a digit ("Q3"), has an inner capital
// ("McKinsey"), or opens a capitalised name ("Brew & Bean", "Blue Bottle").
// The logged `what` is never changed.
function spokenWhat(what: string): string {
  const words = what.trim().split(/\s+/);
  const first = words[0] ?? '';
  const letters = first.replace(/[^A-Za-z]/g, '');
  const next = words.slice(1).find(w => /[A-Za-z]/.test(w)) ?? '';
  const keep = !/^[A-Z]/.test(first)
    || /\d/.test(first)
    || (letters.length >= 2 && letters === letters.toUpperCase())
    || /[A-Z]/.test(first.slice(1))
    || /^[A-Z]/.test(next);
  return keep ? what : what.charAt(0).toLowerCase() + what.slice(1);
}

const joinWhat = (whats: string[], conj: 'and' | 'or') => {
  const u = [...new Set(whats.map(spokenWhat))];
  return u.length <= 1 ? (u[0] ?? '') : `${u.slice(0, -1).join(', ')} ${conj} ${u.at(-1)}`;
};

// The spoken data lines, in order: releases (earlier asks under one lead-in),
// the exhibit handover, refusals, deferrals, offers — each with what it
// carries, so voice bookkeeping can tell which sentence a release is in
// (spec 2026-10-08-voice-phase-b §5.3).
export type DataLinePart = { kind: 'leadin' | 'release' | 'restate' | 'exhibit' | 'refusals' | 'defers' | 'offers'; ids: string[]; text: string };

export function renderDataLineParts(d: DataDecisions, seed: string): DataLinePart[] {
  const parts: DataLinePart[] = [];
  const earlier = d.releases.filter(r => r.earlier);
  if (earlier.length > 0) parts.push({ kind: 'leadin', ids: [], text: pickScript(STALE_RELEASE_LEADINS, seed) });
  for (const r of d.releases) parts.push({ kind: 'release', ids: [r.id], text: r.value });
  // Restated values carry no ids: nothing is booked as a new reveal.
  d.restates.forEach((r, i) => parts.push({ kind: 'restate', ids: [], text: i === 0 ? `${RESTATE_LEADIN} ${r.value}` : r.value }));
  if (d.exhibit) parts.push({ kind: 'exhibit', ids: [d.exhibit.id], text: `Here's an exhibit: ${d.exhibit.title}.` });
  if (d.refusals.length > 0) parts.push({ kind: 'refusals', ids: [], text: `I don't have ${joinWhat(d.refusals, 'or')}.` });
  if (d.defers.length > 0) parts.push({ kind: 'defers', ids: [], text: `I'll come back to ${joinWhat(d.defers, 'and')} shortly.` });
  if (d.gateDefers.length > 0) parts.push({ kind: 'defers', ids: [], text: `I'll share ${joinWhat(d.gateDefers, 'and')} once we've settled your structure.` });
  if (d.unmappedDefer) parts.push({ kind: 'defers', ids: [], text: UNMAPPED_DEFER_LINE });
  if (d.offers.length > 0) parts.push({ kind: 'offers', ids: [], text: `I can share ${joinWhat(d.offers, 'and')} if you'd like.` });
  return parts;
}

export function renderDataLines(d: DataDecisions, seed: string): string[] {
  return renderDataLineParts(d, seed).map(p => p.text);
}

// The turn's data_request rows (scoring reads these shapes; spec §9).
export function decisionRows(d: DataDecisions): { what: string; ledgerItemIds: string[]; response: RequestResponse; explicit: boolean }[] {
  return d.requests.map(x => ({ what: x.request.what, ledgerItemIds: x.ledgerItemIds, response: x.response, explicit: x.request.explicit }));
}
