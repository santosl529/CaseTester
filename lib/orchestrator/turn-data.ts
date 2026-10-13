// One turn's data decisions from the model's declarations (or code's own,
// on code-written turns) — the same function in Stream (to deliver the data
// line while the model is still writing) and Settle (to book and compose), so
// both reach the same result from the same inputs.
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { resolveRequests } from '@/lib/agent/models/turn-schema';
import type { ModelPlan } from './plan-turn';
import { decideData, exactResolver, labelMatch, outsideAskScope, heldForOrder, RELEASE_CAP, type DataDecisions, type ExhibitInfo } from './data-decisions';
import { findFalseRefusals, groupItemsAsked } from './fact-check';
import { isGatedItem, exhibitIsGated, PT_REPLY_LIMIT, PT_NOT_ASKED_LIMIT } from './pressure-test';
import { planForcedReleases } from './data-requests';
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
  requests = requests.flatMap(r => {
    if (!r.explicit) return [r];
    const groupIds = groupItemsAsked(r.what, fbGroups).filter(id => ledger.items.some(i => i.id === id));
    const add = groupIds.filter(id => !r.itemIds.includes(id));
    if (add.length === 0) return [r];
    // One ask per item, in its own label — said back without the candidate's
    // wording, which may carry a cut the case doesn't hold ("… and unit cost per pound").
    const ids = [...new Set([...r.itemIds, ...add])];
    const asks = ids.map(id => ({ ...r, itemIds: [id], what: ledger.items.find(i => i.id === id)?.label ?? r.what }));
    for (const a of asks) grouped.set(a.what, new Set(ids));
    return asks;
  });
  if (grouped.size > 0) plan.ctx.checks.record('request_group', true, 'asks naming a group of items — every item of it', { groups: [...grouped].map(([what, ids]) => ({ what, ids: [...ids] })) });
  // A qualified ask keeps its scope (v4.10): an item it can't answer — the
  // whole when a split of it was asked for, a cut it doesn't have — is not
  // what was requested, released or restated (data-decisions.ts).
  const scoped: { what: string; ids: string[] }[] = [];
  requests = requests.map(r => {
    const out = r.itemIds.filter(id => { const item = ledger.items.find(i => i.id === id); return item !== undefined && outsideAskScope(r.what, item); });
    if (out.length === 0) return r;
    scoped.push({ what: r.what, ids: out });
    return { ...r, itemIds: r.itemIds.filter(id => !out.includes(id)) };
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
  requests = requests.flatMap(r => {
    // Declared release or defer alike: after the pressure test a deferral becomes a release (below).
    if (!r.explicit || r.itemIds.length > 0) return [r];
    const ids = [...new Set(findFalseRefusals(`I don't have ${r.what}.`, fb, revealedNow).flatMap(f => f.items))]
      .filter(id => ledger.items.some(i => i.id === id));
    if (ids.length === 0) return [r];
    remapped.push({ what: r.what, ids });
    // One ask per item, in its own label — a deferral must not promise the
    // finer cut the case doesn't hold ("bean cost per pound").
    return ids.map(id => ({ ...r, itemIds: [id], what: ledger.items.find(i => i.id === id)!.label }));
  });
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
  });
  // Code's correction of a misquote (plan-turn.ts), on any turn that answers
  // the message — a code-written close or recommendation ask included (batch 20:
  // R21 and R47's corrections were decided at the close and never spoken).
  const correction = state.misquote ? { item: state.misquote.item, items: state.misquote.items, text: state.misquote.text } : null;
  return { ...decisions, correction, gatedIds };
}
