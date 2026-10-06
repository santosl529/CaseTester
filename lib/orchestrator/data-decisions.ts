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

// Resolves a declared id to a canonical one. Exact only — an id or a
// label / title, ignoring case and punctuation: a partial match could release
// an item nobody asked for ("cogs" is inside two ids).
export function exactResolver(entries: { id: string; names: string[] }[]): (raw: string) => string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byName = new Map<string, string>();
  for (const e of entries) for (const n of [e.id, ...e.names]) if (norm(n)) byName.set(norm(n), e.id);
  return raw => byName.get(norm(raw)) ?? null;
}

export type ExhibitInfo = { id: string; title: string; coversLedgerItems?: string[] };

export type DataDecisions = {
  releases: { id: string; value: string; earlier: boolean }[];
  exhibit: { id: string; title: string; covers: string[] } | null;
  refusals: string[];     // what, for explicit asks the case doesn't hold
  defers: string[];       // what, for asks held for later (by the model, or over the cap)
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
  cap?: number;
}): DataDecisions {
  const cap = p.cap ?? RELEASE_CAP;
  const itemById = new Map(p.ledger.items.map(i => [i.id, i]));
  const exhibitById = new Map(p.exhibits.map(e => [e.id, e]));
  const openIds = new Set(p.open.map(o => o.ledgerItemId));

  // Exhibit: one per turn — a requested one first, else the model's handover.
  const requestedExhibit = p.requests
    .filter(r => r.explicit && r.respond === 'release')
    .flatMap(r => r.itemIds)
    .find(id => exhibitById.has(id) && !p.shownExhibitIds.has(id));
  const exhibitId = requestedExhibit ?? (p.exhibit && exhibitById.has(p.exhibit) && !p.shownExhibitIds.has(p.exhibit) ? p.exhibit : null);
  const exhibit = exhibitId
    ? { id: exhibitId, title: exhibitById.get(exhibitId)!.title, covers: exhibitById.get(exhibitId)!.coversLedgerItems ?? [] }
    : null;
  const covered = new Set(exhibit?.covers ?? []);

  const releases: DataDecisions['releases'] = [];
  const releasing = new Set<string>();
  const refusals: string[] = [];
  const defers: string[] = [];
  const offers: string[] = [];
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
      if (r.explicit) { refusals.push(r.what); decidedAt.push({ at, d: { request: r, response: 'refuse', ledgerItemIds: [] } }); }
      return;
    }
    if (!r.explicit || r.respond === 'defer') { later.push({ at, r, ledgerIds }); return; }
    let heldOver = false;
    for (const id of ledgerIds) {
      if (covered.has(id) || !available(id)) continue;
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
      defers.push(r.what);
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
  return { releases, exhibit, refusals, defers, offers, requests: decided };
}

const joinWhat = (whats: string[], conj: 'and' | 'or') => {
  const u = [...new Set(whats)];
  return u.length <= 1 ? (u[0] ?? '') : `${u.slice(0, -1).join(', ')} ${conj} ${u.at(-1)}`;
};

// The spoken data lines, in order: releases (earlier asks under one lead-in),
// the exhibit handover, refusals, deferrals, offers.
export function renderDataLines(d: DataDecisions, seed: string): string[] {
  const lines: string[] = [];
  const earlier = d.releases.filter(r => r.earlier);
  if (earlier.length > 0) lines.push(pickScript(STALE_RELEASE_LEADINS, seed));
  for (const r of d.releases) lines.push(r.value);
  if (d.exhibit) lines.push(`Take a look at this: ${d.exhibit.title}.`);
  if (d.refusals.length > 0) lines.push(`I don't have ${joinWhat(d.refusals, 'or')}.`);
  if (d.defers.length > 0) lines.push(`I'll come back to ${joinWhat(d.defers, 'and')} shortly.`);
  if (d.offers.length > 0) lines.push(`I can share ${joinWhat(d.offers, 'and')} if you'd like.`);
  return lines;
}

// The turn's data_request rows (scoring reads these shapes; spec §9).
export function decisionRows(d: DataDecisions): { what: string; ledgerItemIds: string[]; response: RequestResponse; explicit: boolean }[] {
  return d.requests.map(x => ({ what: x.request.what, ledgerItemIds: x.ledgerItemIds, response: x.response, explicit: x.request.explicit }));
}
