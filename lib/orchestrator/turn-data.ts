// One turn's data decisions from the model's declarations (or code's own,
// on code-written turns) — the same function in Stream (to deliver the data
// line while the model is still writing) and Settle (to book and compose), so
// both reach the same result from the same inputs.
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { resolveRequests } from '@/lib/agent/models/turn-schema';
import type { ModelPlan } from './plan-turn';
import { decideData, exactResolver, labelMatch, outsideAskScope, splitOfItem, heldForOrder, RELEASE_CAP, type DataDecisions, type ExhibitInfo } from './data-decisions';
import { findFalseRefusals, groupItemsAsked, coverageOf } from './fact-check';
import { isGatedItem, exhibitIsGated, PT_REPLY_LIMIT, PT_NOT_ASKED_LIMIT } from './pressure-test';
import { planForcedReleases } from './data-requests';
import { askingSentences } from './request-signal';
import { revealedValues } from './data-ledger';

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
export async function pressureTestOutcomeNow(plan: ModelPlan): Promise<{ satisfied: boolean; waiving: boolean }> {
  const { state } = plan;
  if (state.ptSatisfiedNow !== undefined && state.ptWaivingNow !== undefined) return { satisfied: state.ptSatisfiedNow, waiving: state.ptWaivingNow };
  const pt = state.pressureTest;
  const satisfied = pt.state === 'satisfied'
    || (pt.state === 'awaiting' && Boolean((await state.probeVerdict)?.answered));
  const waiving = !satisfied && state.kind === 'model' && (
    (pt.state === 'awaiting' && (pt.awaitingReplies ?? 0) + 1 >= PT_REPLY_LIMIT)
    || (pt.state === 'not_asked' && pt.structureAsked && pt.gatedTurns + 1 >= PT_NOT_ASKED_LIMIT));
  state.ptSatisfiedNow = satisfied;
  state.ptWaivingNow = waiving;
  return { satisfied, waiving };
}

export type TurnData = DataDecisions & { gatedIds: string[] };

export function turnData(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>): TurnData {
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
    // A finer ask the case doesn't hold is refused (4b), even beside an exhibit the model handed over for it.
    if (r.explicit && finerAsks.has(r.what) && kept.itemIds.length > 0 && !kept.itemIds.some(id => ledger.items.some(i => i.id === id))) {
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
  const decisions = decideData({
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
  });
  // Code's correction of a misquote (plan-turn.ts), on any turn that answers
  // the message — a code-written close or recommendation ask included (batch 20:
  // R21 and R47's corrections were decided at the close and never spoken).
  const correction = state.misquote ? { item: state.misquote.item, items: state.misquote.items, text: state.misquote.text } : null;
  // A prompt fact that covers an ask is said again ("As I mentioned: …"); nothing is booked.
  for (const p of promptRestates) {
    decisions.restates.push({ id: p.id, value: p.value });
    decisions.requests.push({ request: p.request, response: 'clarify', ledgerItemIds: [] });
  }
  return { ...decisions, correction, gatedIds };
}
