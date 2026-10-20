// One turn's data decisions from the model's declarations (or code's own,
// on code-written turns) — the same function in Stream (to deliver the data
// line while the model is still writing) and Settle (to book and compose), so
// both reach the same result from the same inputs.
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { resolveRequests } from '@/lib/agent/models/turn-schema';
import type { ModelPlan } from './plan-turn';
import { decideData, exactResolver, labelMatch, outsideAskScope, changeForSplit, splitOfItem, heldForOrder, RELEASE_CAP, type DataDecisions, type ExhibitInfo } from './data-decisions';
import { findFalseRefusals, groupItemsAsked, coverageOf, BASIS } from './fact-check';
import { isGatedItem, exhibitIsGated, PT_REPLY_LIMIT, PT_NOT_ASKED_LIMIT, saysNothingMissing } from './pressure-test';
import { planForcedReleases, classifyDataRequests } from './data-requests';
import { askingSentences } from './request-signal';
import { revealedValues, canReveal } from './data-ledger';
import type { OnUsage } from '@/lib/llm-usage';

export function caseResolver(plan: ModelPlan): (raw: string) => string | null {
  const { ledger, caseData } = plan.state;
  return exactResolver([
    ...ledger.items.map(i => ({ id: i.id, names: [i.label] })),
    ...caseData.exhibits.map(e => ({ id: e.id, names: [e.title] })),
  ]);
}

// Turn kinds that ask for the recommendation (or close) release the open
// requests first (Rule 11: never ask on an assumption the candidate asked to
// check). Two at most, this turn's asks first. An existing exception to the
// pressure-test gate.
const FORCES_OPEN = new Set(['rec_ask', 'grace_ask', 'time_warning']);

// Whether the pressure test counts as satisfied for this turn: persisted, or
// the judge says this turn's replies answered it — and, if not, whether this
// reply reaches the v3 bound and waives it (PT_REPLY_LIMIT replies while
// awaiting; PT_NOT_ASKED_LIMIT held turns when no structure was ever given,
// after code asked for one). Only model turns count. Resolved once (Stream
// and Settle both await it before deciding data) and cached on the plan.
// nothingMissing (19 Oct): a what's-missing probe answered "nothing is missing"
// counts as answered when the judge didn't count it (a bare claim to the judge);
// an answer the judge counted goes on as before.
export async function pressureTestOutcomeNow(plan: ModelPlan): Promise<{ satisfied: boolean; waiving: boolean; nothingMissing: boolean }> {
  const { state } = plan;
  const pt = state.pressureTest;
  const said = pt.state === 'awaiting' && (pt.intents ?? []).includes('mece') && saysNothingMissing(plan.ctx.candidateText);
  const judged = pt.state === 'awaiting' && Boolean((await state.probeVerdict)?.answered);
  const nothingMissing = said && !judged;
  if (state.ptSatisfiedNow !== undefined && state.ptWaivingNow !== undefined) return { satisfied: state.ptSatisfiedNow, waiving: state.ptWaivingNow, nothingMissing };
  const satisfied = pt.state === 'satisfied' || judged || nothingMissing;
  const waiving = !satisfied && state.kind === 'model' && (
    (pt.state === 'awaiting' && (pt.awaitingReplies ?? 0) + 1 >= PT_REPLY_LIMIT)
    || (pt.state === 'not_asked' && pt.structureAsked && pt.gatedTurns + 1 >= PT_NOT_ASKED_LIMIT));
  state.ptSatisfiedNow = satisfied;
  state.ptWaivingNow = waiving;
  return { satisfied, waiving, nothingMissing };
}

// basisCut: per ask the BASIS rule emptied, the items it cut (fix-wave 1, below);
// logged only; the check reads the ask's scope itself (decideCheckedAsk, round 5 E5 b).
export type TurnData = DataDecisions & { gatedIds: string[]; basisCut?: Record<string, string[]> };

// Wrap-up and close turns (Lorenzo, 19 Oct, round-2 ruling 3): the code-written
// close, close wait, grace ask and time warning, and any turn of the
// recommendation or wrap phase once the recommendation is in. A named deferral
// there is "We won't get to <ask> today." — the case won't come back to it; so is
// every other deferral there (round-3 ruling 4: decideData's `wrapUp`).
// Code's recommendation ask too (controller, 19 Oct; batch 32 Larkspur Marcus t28).
const WRAP_UP_KINDS: ReadonlySet<string> = new Set(['close', 'close_wait', 'grace_ask', 'time_warning', 'rec_ask']);
export function wrapUpTurn(plan: ModelPlan): boolean {
  const { state, ctx } = plan;
  return WRAP_UP_KINDS.has(state.kind) || ((ctx.currentPhase === 'RECOMMENDATION' || ctx.currentPhase === 'WRAP') && state.recommendationReceived);
}

// An explicit deferral with no item is checked by a small model before code
// refuses it (Lorenzo, 19 Oct; engine-asks R1, "yes, with a guard"; batch 32
// Aldermoor Marcus t5: the generic "settle your structure" line answered
// nothing). The check is the data-request classifier in detection mode with the
// ledger as the catalog: an ask it maps to none is refused; no verdict (failure,
// timeout) is a named deferral in the candidate's words, so no code-spoken
// refusal goes out unchecked. Stream and Settle share the verdict through the
// plan (one call per ask per turn). What code does with a mapping is
// `decideCheckedAsk` (round 5, E5, below).
// Round-2 ruling 2 (Lorenzo, 19 Oct): "R1 covers every code refusal of an
// unmatched ask, item-less releases included … Cap the Haiku check at ~1.5s; on
// a timeout or error, use the named deferral, never a refusal." Item-less
// releases (a code-written turn's detections among them) go through it too.
// An ask a finer-cut scope rule emptied (it matched an item that can't answer
// it) keeps that coarse item — one that holds the asked quantity at a coarser
// cut (Lorenzo, 20 Oct, round 5 E1; batch 34 Aldermoor Marisol t14, Jasmine t4):
// released under every gate with "I don't have <the ask>." for the finer cut
// (turnData, `scope_coarse`). Coarse items all out already (said, or on a shown
// exhibit): the refusal alone, unchecked (4b stands). Coarse items held (release
// order, pressure-test gate, cap): checked like any other refusal. An ask emptied
// only of topic siblings (a change item asked for a split, `changeForSplit`) or a
// finer ask backed only by an exhibit: refused unchecked, as before E1 (the
// controller's rulings, 20 Oct). This reverses the round-2 exception elsewhere.
// Round-3 ruling 5 (Lorenzo, 19 Oct; batch 28 Marisol t8, batch 30 Anika t6):
// "Code refuses only when the check says the case doesn't hold it." An ask the
// check maps to a ledger item is never refused on the check's say alone — out of
// the ask's scope included (E5 b below gives such an item E1's form).
const DEFER_CHECK_TIMEOUT_MS = 1500;
// Whether the scope rules keep this item for the ask (the case's covers first).
function answersAsk(plan: ModelPlan, what: string, id: string): boolean {
  const { ledger, factBase } = plan.state;
  const item = ledger.items.find(i => i.id === id);
  if (!item) return true;
  if (coverageOf(what, factBase).items.includes(id)) return true;
  return !outsideAskScope(what, item, factBase.quantities.find(q => q.id === id)?.names ?? []);
}

// The check's verdict on one unmatched ask: mapped (null: no verdict), the
// ledger items it found, and those of them the ask's scope rules rule out.
export type CheckVerdict = { mapped: boolean | null; ids: string[]; outOfScope: string[] };

// What code does with a verdict (Lorenzo, 20 Oct, round 5 E5: "build (a) and
// (b). Not (c). Add (d): a deferral names the item it will deliver, not the
// candidate's words, and a mapped item that's releasable now goes now."; B1+B2:
// 10 of 13 mappings were "I'll come back to <ask>" and never released). The one
// decision for a verdict — turnData applies it under its gates (Tasks 50 and 51
// send their asks through it too):
//   - no verdict: the named deferral in the candidate's words, holding no item (as before);
//   - mapped to none: refused;
//   - mapped to items in the ask's scope (`items`), each asked in its own label:
//     (a) one already out (said, or on a shown exhibit) is restated through the
//     restate path (cap 3), never deferred — the check mapped the ask to that very
//     item, the re-ask 4b allows; (d) one releasable now under every gate turnData
//     applies (pressure test, release order, cap, the exhibit handed over) goes
//     now; one that isn't is deferred by its spoken name and booked with its
//     ledger id, so it is followed up (forced release, open request). On a
//     wrap-up or close turn the "We won't get to" rules apply;
//   - (b) mapped only to items out of the ask's scope (`coarse`): E1's form —
//     "I don't have <the ask>." with the coarse item's line when one can be
//     released (not yet out, under the gates); none: the refusal stands. A change
//     item asked for a split is a sibling, never a coarse item (E1's ruling), so
//     an ask mapped only to siblings is refused.
// In-scope items win over out-of-scope ones in a mixed mapping, as for the
// model's own mapping (the scope rule drops the rest silently).
export type CheckedAsk =
  | { kind: 'named' }
  | { kind: 'refuse' }
  | { kind: 'items'; ids: string[] }
  | { kind: 'coarse'; ids: string[] };
export function decideCheckedAsk(plan: ModelPlan, what: string, v: CheckVerdict): CheckedAsk {
  if (v.mapped === null) return { kind: 'named' };
  const { ledger } = plan.state;
  const ids = v.ids.filter(id => ledger.items.some(i => i.id === id));
  if (!v.mapped || ids.length === 0) return { kind: 'refuse' };
  const inScope = ids.filter(id => !v.outOfScope.includes(id));
  if (inScope.length > 0) return { kind: 'items', ids: inScope };
  const coarse = ids.filter(id => !changeForSplit(what, ledger.items.find(i => i.id === id)!));
  return coarse.length > 0 ? { kind: 'coarse', ids: coarse } : { kind: 'refuse' };
}

const DECIDED: Record<CheckedAsk['kind'], string> = {
  named: 'no verdict: a named deferral',
  refuse: 'maps to no item: refused',
  items: 'mapped to a ledger item: restated if out, released if it can go now, else deferred by its name',
  coarse: 'mapped only to items outside the ask: the coarse item\'s line if one can go, and the refusal',
};

// The check, cached per ask for the turn. Out of scope is read for every
// mapping, a BASIS-emptied ask's included (a basis ask mapped back to the item
// it asks about is not answered by that item's line: batch 32 Larkspur Marisol t27).
export function checkAsk(plan: ModelPlan, what: string, onUsage?: OnUsage, cut: string[] = []): Promise<CheckVerdict> {
  const cache = plan.state.deferChecks;
  const cached = cache.get(what);
  if (cached) return cached;
  const run = (async (): Promise<CheckVerdict> => {
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>(r => { timer = setTimeout(() => r(null), DEFER_CHECK_TIMEOUT_MS); });
    // Put as an ask, not a bare noun phrase: detection mode is tuned for a
    // candidate's message and may return [] for a fragment, which would make
    // refusal the common outcome. Usage is logged as 'data_request' ($/case, PRD §13).
    const found = await Promise.race([
      classifyDataRequests({
        candidateText: `Could I get ${what}?`, interviewerText: null, catalog: plan.state.catalog,
        onUsage,
      }).catch(() => null),
      timeout,
    ]).finally(() => clearTimeout(timer));
    const ids = found === null ? [] : [...new Set(found.flatMap(f => f.ledgerItemIds))];
    const mapped = found === null ? null : ids.length > 0;
    const outOfScope = ids.filter(id => answersAsk(plan, what, id) === false);
    const verdict: CheckVerdict = { mapped, ids, outOfScope };
    const decision = decideCheckedAsk(plan, what, verdict);
    plan.ctx.checks.record('itemless_defer', mapped !== false, DECIDED[decision.kind],
      { what, mapped, found: found === null ? null : found.map(f => ({ what: f.what, ids: f.ledgerItemIds })), decision: decision.kind, ...(cut.length > 0 ? { basisCut: cut } : {}), ...(outOfScope.length > 0 ? { outOfScope } : {}), latencyMs: Date.now() - t0 });
    return verdict;
  })();
  cache.set(what, run);
  return run;
}

// turnData, with the item-less asks resolved (async: the check above). Every
// unmatched ask is checked; when a verdict maps one to items (`items`, `coarse`),
// the turn is decided again with the verdicts applied (turnData's `checked`), so
// the items go through every gate; the first pass's check log is dropped for the
// second's. An ask a later pass leaves unmatched is checked in turn (bounded).
// What's left unmatched: no verdict → the named deferral; else refused.
const CHECK_PASSES = 3;
export async function turnDataChecked(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>, onUsage?: OnUsage): Promise<TurnData> {
  const log = plan.ctx.checks.entries;
  let at = log.length;
  let d = turnData(plan, turn);
  if (d.unmatchedDefers.length === 0) return d;
  let logged = log.length - at;
  const decided = new Map<string, CheckedAsk>();
  for (let pass = 0; pass < CHECK_PASSES; pass++) {
    const fresh = d.unmatchedDefers.filter(w => !decided.has(w));
    if (fresh.length === 0) break;
    const verdicts = await Promise.all(fresh.map(w => checkAsk(plan, w, onUsage, d.basisCut?.[w])));
    fresh.forEach((w, i) => decided.set(w, decideCheckedAsk(plan, w, verdicts[i])));
    if (!fresh.some(w => ['items', 'coarse'].includes(decided.get(w)!.kind))) break;
    log.splice(at, logged);   // the pass decided again below logs its own checks
    at = log.length;
    d = turnData(plan, turn, decided);
    logged = log.length - at;
  }
  if (d.unmatchedDefers.length === 0) return d;
  const defers: string[] = [], refusals: string[] = [];
  // Unmatched still: no verdict (or none reached) → the named deferral; a verdict → refused.
  for (const w of d.unmatchedDefers) ((decided.get(w)?.kind ?? 'named') === 'named' ? defers : refusals).push(w);
  const refused = new Set(refusals);
  const wrapUp = wrapUpTurn(plan) && defers.length > 0;
  // Said "We won't get to …" at a wrap-up: logged as such, like decideData's (round-3 ruling 4).
  const wont = new Set(wrapUp ? defers : []);
  return {
    ...d,
    unmatchedDefers: [],
    defers: wrapUp ? d.defers : [...d.defers, ...defers],
    ...(!wrapUp && defers.length > 0 ? { itemlessDefers: defers } : {}),
    ...(wrapUp ? { wontGetTo: [...(d.wontGetTo ?? []), ...defers] } : {}),
    refusals: [...d.refusals, ...refusals],
    requests: d.requests.map(r => (r.response !== 'defer' || r.ledgerItemIds.length > 0 ? r
      : refused.has(r.request.what) ? { ...r, response: 'refuse' as const }
        : wont.has(r.request.what) ? { ...r, wontGetTo: true as const } : r)),
  };
}

// `checked`: the check's decisions on this turn's unmatched asks (turnDataChecked's
// second pass), applied once the coverage step has read every ask.
export function turnData(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>, checked?: ReadonlyMap<string, CheckedAsk>): TurnData {
  const { ctx, state } = plan;
  const { ledger } = state;
  const resolve = caseResolver(plan);
  // Closed: answered, waived (v3), or waiving on this turn — nothing is premature.
  const satisfied = (state.ptSatisfiedNow ?? state.pressureTest.state === 'satisfied')
    || Boolean(state.ptWaivingNow) || state.pressureTest.state === 'waived';
  const forcesOpen = FORCES_OPEN.has(state.kind);
  const gateOn = !satisfied && !forcesOpen;
  const exhibitCovers = new Map(state.caseData.exhibits.map(e => [e.id, (e as { coversLedgerItems?: string[] }).coversLedgerItems ?? []]));
  const gated = (id: string) => (exhibitCovers.has(id) ? exhibitIsGated(ledger, exhibitCovers.get(id)!) : isGatedItem(ledger, id));
  const gatedIds: string[] = [];
  const gateHeld = new Set<string>();
  const exhibits: ExhibitInfo[] = state.caseData.exhibits.map(e => ({ id: e.id, title: e.title, coversLedgerItems: e.coversLedgerItems, after: e.after, requiresItems: e.requiresItems }));
  // An open ask whose data waits on the exhibit order is not forced out (it
  // would be deferred out loud every turn); it goes once its exhibit is ready.
  const waiting = (id: string) => heldForOrder(id, exhibits, state.shownExhibitIds, ledger, state.stagesOut);

  // An unmapped explicit ask (item_ids []) that names exactly one catalog
  // label is that item (v3, batch 18 Maya t6): an empty mapping is the
  // model's claim, not proof the case lacks the data. Mentions stay as declared.
  let requests: DeclaredRequest[] = resolveRequests(turn.requests, resolve).map(r => {
    if (r.itemIds.length > 0 || !r.explicit) return r;
    const id = labelMatch(r.what, ledger.items);
    return id ? { ...r, itemIds: [id] } : r;
  });
  // An ask that names a group of items (the case's factAnchors groups: "what's
  // inside COGS", "COGS breakdown by input", "the cost breakdown") is answered
  // with every item of the group the case holds (Phase 3, Lorenzo: a COGS-by-
  // input ask releases the bean share, the bean price change and the other
  // inputs' change — the scope check had kept only the share). The release
  // cap still applies; the rest is deferred out loud.
  const fbGroups = state.factBase;
  const grouped = new Map<string, Set<string>>();
  // The case's names for an item, for the scope checks.
  const namesOf = (id: string) => fbGroups.quantities.find(q => q.id === id)?.names ?? [];
  // A split within one item of a group is finer than the group (Lorenzo, 13
  // Oct; Marcus 71a04add t12: "the split within the non-bean input costs" is
  // not the input price changes): no expansion; refused when nothing is left.
  const finerAsks = new Set<string>();
  const inLedger = (id: string) => ledger.items.some(i => i.id === id);
  // The candidate's own asking sentence names the group too (Lorenzo, 15 Oct;
  // batch 25: Marcus f8ed869d t7 "a split of that 58 by category, coffee versus
  // dairy versus food", labelled "the breakdown of COGS by category" — one item;
  // Fiona 52743bea t5 "a split of COGS by component", labelled item by item): a
  // declared ask mapped into a group the sentence names is that group's ask —
  // what of it is still to come: a re-ask for "the rest of the COGS breakdown"
  // isn't answered with the share given earlier.
  const sentenceGroups = askingSentences(ctx.candidateText, ctx.currentPhase)
    .map(s => groupItemsAsked(s, fbGroups).filter(inLedger)).filter(g => g.length > 0);
  const toCome = (r: DeclaredRequest, g: string[]) => g.filter(id => r.itemIds.includes(id) || !ledger.revealed.has(id));
  // Asked by another of the turn's requests: kept there, in the model's order.
  const askedThisTurn = new Set(requests.filter(r => r.explicit).flatMap(r => r.itemIds));
  // The groups this turn asks for, whole: the release cap never splits one.
  const askedGroups: string[][] = [];
  requests = requests.flatMap(r => {
    if (!r.explicit) return [r];
    const named = groupItemsAsked(r.what, fbGroups).filter(inLedger);
    const fromSentence = sentenceGroups.filter(g => r.itemIds.some(id => g.includes(id))).flatMap(g => toCome(r, g));
    const groupIds = [...new Set([...named, ...fromSentence])];
    if (groupIds.some(id => splitOfItem(r.what, ledger.items.find(i => i.id === id)!, namesOf(id)))) { finerAsks.add(r.what); return [r]; }
    // Every item of the group: those the model left out, and those it mapped that
    // the ask's wording would put out of scope — each asked in its own label, so
    // the scope rule reads the item, not the wording (Lorenzo, 14 Oct; batch 24:
    // Raj ba2e03be's "COGS split by input (beans versus other inputs)", mapped to
    // all three, lost the two price changes to the split rule).
    if (groupIds.length > 0) askedGroups.push(groupIds);
    const add = groupIds.filter(id => !r.itemIds.includes(id) && !askedThisTurn.has(id));
    const scopedOut = groupIds.filter(id => r.itemIds.includes(id) && outsideAskScope(r.what, ledger.items.find(i => i.id === id)!, namesOf(id)));
    if (groupIds.length === 0 || (add.length === 0 && scopedOut.length === 0)) return [r];
    // One ask per item, in its own label — said back without the candidate's
    // wording, which may carry a cut the case doesn't hold ("… and unit cost per pound").
    const ids = [...new Set([...r.itemIds, ...add])];   // the model's order, then what it left out
    const asks = ids.map(id => ({ ...r, itemIds: [id], what: ledger.items.find(i => i.id === id)?.label ?? r.what }));
    for (const a of asks) grouped.set(a.what, new Set(ids));
    return asks;
  });
  if (grouped.size > 0) plan.ctx.checks.record('request_group', true, 'asks naming a group of items — every item of it', { groups: [...grouped].map(([what, ids]) => ({ what, ids: [...ids] })) });
  // A qualified ask keeps its scope (v4.10): an item it can't answer — the
  // whole when a split of it was asked for, a cut it doesn't have — is not
  // what was requested, released or restated (data-decisions.ts).
  const scoped: { what: string; ids: string[] }[] = [];
  // Asks the BASIS rule emptied: checked like an item-less deferral before any refusal goes out.
  const basisEmptied = new Set<string>();
  // Asks the other scope rules emptied — they matched an item that can't answer
  // the finer cut they ask for (Lorenzo, 20 Oct, round 5 E1; batch 34 Aldermoor
  // Marisol t14 "the current treatment mix across treated patients", Jasmine t4
  // "current US treatment breakdown by drug class", both refused whole): each
  // keeps its coarse items, given back to it once the coverage step below has
  // read the ask (`coarseOf`). A finer ask left holding only the exhibit the
  // model handed over is backed by that exhibit (`exhibitBacked`).
  const coarseOf = new Map<string, string[]>();
  const exhibitBacked = new Map<string, string[]>();
  // Asks emptied of topic siblings only (no coarse item): refused unchecked, as before E1.
  const siblingsOnly = new Set<string>();
  const basisCut: Record<string, string[]> = {};
  requests = requests.flatMap(r => {
    // An item the case's own `covers` names for the ask is in its scope (Marisol
    // 0f7551c2 t9: "transaction volume per store" mapped to the ticket, which the
    // per-store cut had dropped; Lorenzo, 15 Oct, batch-25 ruling 7).
    const cov = coverageOf(r.what, fbGroups);
    const coveredHere = new Set(cov.items);
    // A per-store ask the covers answer whole (Lorenzo, 16 Oct; batch 27, Fiona
    // f4bd1da5 t9 "transaction volume per store" mapped to revenue per store and
    // the store count, Marcus 9cb2554f t15 to the ticket and revenue per store):
    // the item the covers name is added where the model left it out, and a mapped
    // item that is only the cut — its label per store, named by neither the
    // covers nor the ask — is dropped: the ticket, not revenue per store.
    // (An ask the model mapped to nothing goes to the coverage step below.)
    const storeCut = /\b(?:per|by) (?:store|location)\b/i;
    if (r.explicit && r.itemIds.length > 0 && cov.rest === null && storeCut.test(r.what) && cov.items.some(id => ledger.items.some(i => i.id === id))) {
      const lower = r.what.toLowerCase();
      const named = (id: string) => [...namesOf(id), ledger.items.find(i => i.id === id)?.label ?? '']
        .some(n => n && new RegExp(`(?<![a-z])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(lower));
      const added = cov.items.filter(id => !r.itemIds.includes(id) && ledger.items.some(i => i.id === id));
      const cutOnly = r.itemIds.filter(id => !coveredHere.has(id) && !named(id) && storeCut.test(ledger.items.find(i => i.id === id)?.label ?? ''));
      if (added.length > 0 || cutOnly.length > 0) {
        plan.ctx.checks.act('request_covers', 'a per-store ask the case\'s covers answer: the item they name, not the per-store cut', { what: r.what, added, dropped: cutOnly });
        r = { ...r, itemIds: [...r.itemIds.filter(id => !cutOnly.includes(id)), ...added] };
      }
    }
    const out = r.itemIds.filter(id => { const item = ledger.items.find(i => i.id === id); return item !== undefined && !coveredHere.has(id) && outsideAskScope(r.what, item, namesOf(id)); });
    if (out.some(id => splitOfItem(r.what, ledger.items.find(i => i.id === id)!, namesOf(id)))) finerAsks.add(r.what);
    const kept = { ...r, itemIds: r.itemIds.filter(id => !out.includes(id)) };
    if (out.length > 0) scoped.push({ what: r.what, ids: out });
    if (r.explicit && out.length > 0 && kept.itemIds.length === 0) {
      if (BASIS.test(r.what)) { basisEmptied.add(r.what); basisCut[r.what] = [...new Set([...(basisCut[r.what] ?? []), ...out])]; }
      else {
        // Only an item that holds the asked quantity at a coarser cut is a coarse
        // item; a change item asked for a split is a sibling, never given for it.
        // An ask with no coarse item is refused as before, unchecked: the replay
        // has no verdict for a new check, and no verdict is a named deferral
        // (controller ruling, 20 Oct, replay r5-44: b31 Sofia t17).
        const coarse = out.filter(id => !changeForSplit(r.what, ledger.items.find(i => i.id === id)!));
        if (coarse.length > 0) coarseOf.set(r.what, [...new Set([...(coarseOf.get(r.what) ?? []), ...coarse])]);
        else siblingsOnly.add(r.what);
      }
    }
    // A finer ask the case doesn't hold is refused (4b), even beside an exhibit the
    // model handed over for it — unchecked, as before E1 (a group-level split: the
    // controller's ruling, 20 Oct); `scope_coarse` logs it when the exhibit goes out.
    if (r.explicit && finerAsks.has(r.what) && kept.itemIds.length > 0 && !kept.itemIds.some(id => ledger.items.some(i => i.id === id))) {
      exhibitBacked.set(r.what, kept.itemIds);
      siblingsOnly.add(r.what);
      return [kept, { ...r, itemIds: [] }];
    }
    return [out.length === 0 ? r : kept];
  });
  if (scoped.length > 0) plan.ctx.checks.act('request_scope', 'items outside a qualified ask dropped from it', { scoped });
  // No refusal names data the case holds (fact checks F3, 12 Oct; batch 20:
  // "I don't have what's inside COGS", "…COGS breakdown by input — beans, …",
  // "…coffee bean … shares of COGS, today and two years ago"; batch 18: "…the
  // number of stores over the 2 years"). An explicit ask left with no item
  // would be refused out loud: read the refusal it would become, and map the
  // ask to the held items it names — released, restated, or held by the gate
  // like any other ask. What it names finer than the case (per pound, by
  // store, today's share) still gets the refusal.
  const fb = state.factBase;
  const revealedNow = new Set(Object.keys(revealedValues(ledger)));
  const remapped: { what: string; ids: string[] }[] = [];
  // Lorenzo, 13 Oct (Larkspur rulings a): then whether a ledger item or the
  // prompt covers the ask — the case's `covers` phrases (coverageOf): a
  // covering item is given like any other ask (restated when out), a prompt
  // fact restated, and only what nothing covers is refused (Raj 55d12d38 t7
  // same-store → the store count; Omar 9bbf41bc t9 aircraft size → the
  // competitor line, the frequency still refused; Maya b0b28d36 t8 net margin).
  const covered: { what: string; ids: string[]; promptFacts: string[]; rest: string | null }[] = [];
  const promptRestates: { id: string; value: string; request: DeclaredRequest }[] = [];
  requests = requests.flatMap(r => {
    // Declared release or defer alike: after the pressure test a deferral becomes a release (below).
    if (!r.explicit || r.itemIds.length > 0) return [r];
    const ids = [...new Set(findFalseRefusals(`I don't have ${r.what}.`, fb, revealedNow).flatMap(f => f.items))]
      .filter(id => ledger.items.some(i => i.id === id));
    if (ids.length === 0) {
      const cov = coverageOf(r.what, fb);
      const covIds = cov.items.filter(id => ledger.items.some(i => i.id === id));
      if (covIds.length === 0 && cov.promptFacts.length === 0) return [r];
      covered.push({ what: r.what, ids: covIds, promptFacts: cov.promptFacts, rest: cov.rest });
      for (const id of cov.promptFacts) {
        const value = fb.covers.find(c => c.id === id)?.say;
        if (value && !promptRestates.some(p => p.id === id)) promptRestates.push({ id, value, request: r });
      }
      // What nothing covers of an ask a scope rule emptied is still that ask's finer cut.
      if (cov.rest && coarseOf.has(r.what)) coarseOf.set(cov.rest, coarseOf.get(r.what)!);
      if (cov.rest && siblingsOnly.has(r.what)) siblingsOnly.add(cov.rest);
      return [
        ...covIds.map(id => ({ ...r, itemIds: [id], what: ledger.items.find(i => i.id === id)!.label })),
        ...(cov.rest ? [{ ...r, what: cov.rest, itemIds: [] as string[] }] : []),
      ];
    }
    remapped.push({ what: r.what, ids });
    // One ask per item, in its own label — a deferral must not promise the
    // finer cut the case doesn't hold ("bean cost per pound").
    return ids.map(id => ({ ...r, itemIds: [id], what: ledger.items.find(i => i.id === id)!.label }));
  });
  if (covered.length > 0) plan.ctx.checks.act('refusal_covered', 'an ask code would have refused is covered by a ledger item or the prompt', { covered });
  if (remapped.length > 0) plan.ctx.checks.act('refusal_remapped', 'an ask code would have refused names data the case holds — mapped to it', { remapped });
  // After the pressure test, nothing is premature: a declared deferral is
  // released (or refused, when the case doesn't hold the data).
  if (satisfied) requests = requests.map(r => (r.respond === 'defer' ? { ...r, respond: 'release' as const } : r));
  // The check's decisions (decideCheckedAsk; round 5 E5): an item-less ask the
  // check mapped is answered like an ask the model mapped, through every gate
  // below — `items` one ask per item in its own label (so a deferral names the
  // item, and its row books the ledger id), `coarse` through E1's coarse step with
  // the check's out-of-scope items. A checked ask is released, not deferred: the
  // model's deferral held nothing. Either way it is decided here: an ask still
  // item-less after it is refused, never checked again.
  const checkedAsks = new Set<string>();
  if (checked) {
    const applied: { what: string; kind: string; ids: string[] }[] = [];
    requests = requests.flatMap(r => {
      const c = r.explicit && r.itemIds.length === 0 ? checked.get(r.what) : undefined;
      if (!c || c.kind === 'named') return [r];
      checkedAsks.add(r.what);
      applied.push({ what: r.what, kind: c.kind, ids: c.kind === 'refuse' ? [] : c.ids });
      if (c.kind === 'refuse') return [{ ...r, respond: 'release' as const }];
      if (c.kind === 'coarse') { coarseOf.set(r.what, c.ids); return [{ ...r, respond: 'release' as const }]; }
      return c.ids.map(id => ({ ...r, itemIds: [id], what: ledger.items.find(i => i.id === id)!.label, respond: 'release' as const }));
    });
    if (applied.length > 0) plan.ctx.checks.act('checked_ask', 'the check\'s mapping of an unmatched ask, decided by code', { asks: applied });
  }
  // An explicit release a scope rule emptied gets back its coarse items not yet
  // revealed (E1): released under every gate below and in decideData, the finer
  // cut refused beside them. One whose coarse items are all out already (said, or
  // on a shown exhibit) is refused alone, unchecked: the answer is in front of the
  // candidate (controller ruling on E1, 20 Oct: Lorenzo's 13 Oct 4b stands — "As I
  // mentioned" only for a re-ask of the same item; Marcus 71a04add t12, batch 18
  // Tyler t19). A declared deferral stays item-less: the check decides it.
  const coarseAsks = new Set<DeclaredRequest>();
  const alreadyOut: { what: string; ids: string[] }[] = [];
  requests = requests.map(r => {
    const all = r.explicit && r.respond === 'release' && r.itemIds.length === 0 ? coarseOf.get(r.what) : undefined;
    if (!all) return r;
    const ids = all.filter(id => canReveal(ledger, id));
    if (ids.length === 0) {
      if (all.every(id => ledger.revealed.has(id))) alreadyOut.push({ what: r.what, ids: all });
      return r;
    }
    const back = { ...r, itemIds: ids };
    coarseAsks.add(back);
    return back;
  });
  // Before it, the part of a release that needs it is held; the rest
  // (scoping facts) goes out. Every held ask is answered out loud with the
  // reason, repeats too (v3 — v2 held a repeat silently: Destiny asked eight
  // times and heard nothing).
  if (gateOn) {
    requests = requests.flatMap(r => {
      if (r.respond !== 'release') return [r];
      // Data already given is never held again: a re-ask restates it (data-decisions.ts).
      const held = r.itemIds.filter(id => gated(id) && !ledger.revealed.has(id));
      if (held.length === 0) return [r];
      // A coarse item the gate holds is not given: what's left of the ask (all of
      // it, when nothing is) goes the way of any item-less ask — the check (E1).
      if (coarseAsks.has(r)) {
        const back = { ...r, itemIds: r.itemIds.filter(id => !held.includes(id)) };
        coarseAsks.add(back);
        return [back];
      }
      gatedIds.push(...held);
      gateHeld.add(r.what);
      const free = r.itemIds.filter(id => !held.includes(id));
      return [
        ...(free.length ? [{ ...r, itemIds: free }] : []),
        { ...r, itemIds: held, respond: 'defer' as const },
      ];
    });
  }

  const revealed = new Set(Object.keys(revealedValues(ledger)));
  if (forcesOpen) {
    const declared = new Set(requests.flatMap(r => r.itemIds));
    for (const id of planForcedReleases(state.openDataRequests, revealed, { currentTurnIndex: ctx.nextTurnIndex })) {
      if (declared.has(id) || waiting(id)) continue;
      const open = state.openDataRequests.find(o => o.ledgerItemId === id)!;
      requests.push({ what: open.what, itemIds: [id], explicit: true, respond: 'release' });
    }
  } else {
    // Fulfilment: once the pressure test is satisfied — and on a turn whose
    // model missed an explicit ask twice — pending requests go out up to
    // what's left of the cap, through the gate, with no new promises.
    const missedTwice = state.requestGuardRegenerated && turn.requests.length === 0;
    if (satisfied || missedTwice) {
      const declared = new Set(requests.flatMap(r => r.itemIds));
      const releasing = requests.filter(r => r.explicit && r.respond === 'release')
        .flatMap(r => r.itemIds).filter(id => ledger.items.some(i => i.id === id) && !revealed.has(id)).length;
      const room = Math.max(0, RELEASE_CAP - releasing);
      const pending = planForcedReleases(state.openDataRequests, revealed, { currentTurnIndex: ctx.nextTurnIndex, cap: Infinity })
        .filter(id => !declared.has(id) && !(gateOn && gated(id)) && !waiting(id));
      // Over the cap: deferred out loud, released on a later turn (v3).
      pending.forEach((id, i) => {
        const open = state.openDataRequests.find(o => o.ledgerItemId === id)!;
        requests.push({ what: open.what, itemIds: [id], explicit: true, respond: i < room ? 'release' : 'defer' });
      });
    }
  }

  const modelExhibit = turn.exhibit ? resolve(turn.exhibit) : null;
  const decide = (requests: DeclaredRequest[]) => decideData({
    requests,
    candidateText: ctx.candidateText,
    exhibit: modelExhibit && !(gateOn && gated(modelExhibit)) ? modelExhibit : null,
    rescueItem: turn.rescueItem ? resolve(turn.rescueItem) : null,
    rung3: Boolean(state.stallDecision.intervene && state.stallDecision.rung === 3),
    ledger,
    exhibits,
    shownExhibitIds: state.shownExhibitIds,
    stagesOut: state.stagesOut,
    open: state.openDataRequests,
    gateHeld,
    // The release cap never splits a group the candidate asked for (Lorenzo, 15
    // Oct; batch 25 Jasmine f4fcab5b t5, Owen d3db78c0 t5: the menu prices took a
    // slot and the third COGS item was deferred).
    groups: askedGroups,
    wrapUp: wrapUpTurn(plan),
  });
  let decisions = decide(requests);
  // E1 (Lorenzo, 20 Oct): a coarse item goes out when it is released or shown
  // on the exhibit handed over this turn. Those that
  // don't (not in the ledger, waiting on the release order, over the cap) are
  // taken off the ask — no deferral is said for data the ask didn't name — and
  // the turn decided again: an ask left with none goes to the check below.
  // Once is enough: narrowing only removes ids that went nowhere, so it frees no
  // release slot they held, can't change the exhibit chosen (an id it covers went
  // out, so it stays), and restates nothing new — every id left goes out again.
  const wentOut = (id: string) => decisions.releases.some(x => x.id === id)
    || decisions.exhibit?.id === id || Boolean(decisions.exhibit?.covers.includes(id));
  if ([...coarseAsks].some(r => requests.includes(r) && !r.itemIds.every(wentOut))) {
    requests = requests.map(r => {
      if (!coarseAsks.has(r) || r.itemIds.every(wentOut)) return r;
      const back = { ...r, itemIds: r.itemIds.filter(wentOut) };
      coarseAsks.add(back);
      return back;
    });
    decisions = decide(requests);
  }
  // Each coarse ask still holding an item that went out: the item's line, and
  // "I don't have <the ask>." for the finer cut, refused beside it (logged
  // `scope_coarse`; its own refuse row after the release row). So is a finer ask
  // whose exhibit is handed over.
  const scopeCoarse: { what: string; ids: string[] }[] = [];
  for (const r of requests) {
    if (coarseAsks.has(r) && r.itemIds.length > 0 && r.itemIds.some(wentOut)) scopeCoarse.push({ what: r.what, ids: r.itemIds });
  }
  for (const [what, ids] of exhibitBacked) {
    if (!decisions.refusals.includes(what)) continue;
    if (ids.some(wentOut)) scopeCoarse.push({ what, ids });
    // Its exhibit already on screen: the refusal alone, like an ask whose coarse items are all out.
    else if (ids.every(id => state.shownExhibitIds.has(id))) alreadyOut.push({ what, ids });
  }
  const outAlready = alreadyOut.filter(x => decisions.refusals.includes(x.what));
  if (outAlready.length > 0) plan.ctx.checks.act('scope_coarse', 'an ask a scope rule emptied whose coarse items are already out: the finer cut refused alone, unchecked', { alreadyOut: outAlready });
  const scopeRefused = new Set([...scopeCoarse.map(x => x.what), ...outAlready.map(x => x.what), ...siblingsOnly]);
  if (scopeCoarse.length > 0) {
    const firstAt = (w: string) => requests.findIndex(r => r.what === w);
    // Only the coarse asks' own finer cuts join the refusals: an ask emptied of
    // siblings that the coverage step remapped to held items is not refused (it
    // would contradict its own release or deferral).
    const coarseWhats = new Set(scopeCoarse.map(x => x.what));
    decisions.refusals = [...new Set([...decisions.refusals, ...coarseWhats])].sort((a, b) => firstAt(a) - firstAt(b));
    decisions.requests = decisions.requests.flatMap(d => (coarseAsks.has(d.request) && coarseWhats.has(d.request.what) && d.ledgerItemIds.length > 0
      ? [d, { request: { ...d.request, itemIds: [] }, response: 'refuse' as const, ledgerItemIds: [] }] : [d]));
    plan.ctx.checks.act('scope_coarse', 'an ask a scope rule emptied keeps its coarse items: given, and the finer cut refused beside them', { asks: scopeCoarse });
  }
  // Lorenzo, 19 Oct (R1, "don't add code-spoken refusals without the check";
  // round-2 ruling 2, every unmatched ask): an item-less ask code would refuse
  // goes through the same check as an item-less deferral (turnDataChecked)
  // instead of being refused at once: decided by its verdict (decideCheckedAsk).
  // That includes an ask the model mapped to an item and the BASIS rule emptied
  // (Larkspur Marisol t27; a mapping back to the items the rule cut is out of the
  // ask's scope: E1's form since round 5 E5 b). An ask the check already decided
  // (`checkedAsks`) is not checked again: still item-less, it is refused. An
  // ask the finer-cut scope rules emptied is refused unchecked only beside its
  // coarse item, or when its coarse items are all out already (E1, `scope_coarse`,
  // above); one whose coarse items are held is checked like the rest (round 5
  // reverses the round-2 exception).
  const toCheck = decisions.refusals.filter(w => !scopeRefused.has(w) && !checkedAsks.has(w));
  if (toCheck.length > 0) {
    const checking = new Set(toCheck);
    decisions.unmatchedDefers.push(...toCheck);
    decisions.refusals = decisions.refusals.filter(w => !checking.has(w));
    decisions.requests = decisions.requests.map(d => (d.response === 'refuse' && checking.has(d.request.what) ? { ...d, response: 'defer' as const } : d));
  }
  // Code's correction of a misquote (plan-turn.ts), on any turn that answers
  // the message — a code-written close or recommendation ask included (batch 20:
  // R21 and R47's corrections were decided at the close and never spoken).
  const correction = state.misquote ? { item: state.misquote.item, items: state.misquote.items, text: state.misquote.text } : null;
  // A prompt fact that covers an ask is said again ("As I mentioned: …"); nothing is booked.
  for (const p of promptRestates) {
    decisions.restates.push({ id: p.id, value: p.value });
    decisions.requests.push({ request: p.request, response: 'clarify', ledgerItemIds: [] });
  }
  return { ...decisions, correction, gatedIds, ...(basisEmptied.size > 0 ? { basisCut } : {}) };
}
