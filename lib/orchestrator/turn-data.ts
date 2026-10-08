// One turn's data decisions from the model's declarations (or code's own,
// on code-written turns) — the same function in Stream (to deliver the data
// line while the model is still writing) and Settle (to book and compose), so
// both reach the same result from the same inputs.
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { resolveRequests } from '@/lib/agent/models/turn-schema';
import type { ModelPlan } from './plan-turn';
import { decideData, exactResolver, RELEASE_CAP, type DataDecisions } from './data-decisions';
import { isGatedItem, exhibitIsGated } from './pressure-test';
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
// the judge says this turn's replies answered it. Resolved once (Stream and
// Settle both await it before deciding data) and cached on the plan.
export async function pressureTestSatisfiedNow(plan: ModelPlan): Promise<boolean> {
  const { state } = plan;
  if (state.ptSatisfiedNow !== undefined) return state.ptSatisfiedNow;
  const v = state.pressureTest.state === 'satisfied'
    || (state.pressureTest.state === 'awaiting' && Boolean((await state.probeVerdict)?.answered));
  state.ptSatisfiedNow = v;
  return v;
}

export type TurnData = DataDecisions & { gatedIds: string[] };

export function turnData(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>): TurnData {
  const { ctx, state } = plan;
  const { ledger } = state;
  const resolve = caseResolver(plan);
  const satisfied = state.ptSatisfiedNow ?? state.pressureTest.state === 'satisfied';
  const forcesOpen = FORCES_OPEN.has(state.kind);
  const gateOn = !satisfied && !forcesOpen;
  const exhibitCovers = new Map(state.caseData.exhibits.map(e => [e.id, (e as { coversLedgerItems?: string[] }).coversLedgerItems ?? []]));
  const gated = (id: string) => (exhibitCovers.has(id) ? exhibitIsGated(ledger, exhibitCovers.get(id)!) : isGatedItem(ledger, id));
  const alreadyAsked = new Set(state.openDataRequests.map(o => o.ledgerItemId));
  const gatedIds: string[] = [];

  let requests: DeclaredRequest[] = resolveRequests(turn.requests, resolve);
  // After the pressure test, nothing is premature: a declared deferral is
  // released (or refused, when the case doesn't hold the data).
  if (satisfied) requests = requests.map(r => (r.respond === 'defer' ? { ...r, respond: 'release' as const } : r));
  // Before it, the part of a release that needs it is deferred; the rest
  // (scoping facts) goes out. A deferral already promised once is held
  // silently (no second "I'll come back to …").
  if (gateOn) {
    requests = requests.flatMap(r => {
      if (r.respond !== 'release') return [r];
      const held = r.itemIds.filter(gated);
      if (held.length === 0) return [r];
      gatedIds.push(...held);
      const free = r.itemIds.filter(id => !gated(id));
      const repeat = held.every(id => alreadyAsked.has(id) || exhibitCovers.has(id));
      return [
        ...(free.length ? [{ ...r, itemIds: free }] : []),
        { ...r, itemIds: held, respond: 'defer' as const, explicit: r.explicit && !repeat },
      ];
    });
  }

  const revealed = new Set(Object.keys(revealedValues(ledger)));
  if (forcesOpen) {
    const declared = new Set(requests.flatMap(r => r.itemIds));
    for (const id of planForcedReleases(state.openDataRequests, revealed, { currentTurnIndex: ctx.nextTurnIndex })) {
      if (declared.has(id)) continue;
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
      for (const id of planForcedReleases(state.openDataRequests, revealed, { currentTurnIndex: ctx.nextTurnIndex, cap: room })) {
        if (declared.has(id) || (gateOn && gated(id))) continue;
        const open = state.openDataRequests.find(o => o.ledgerItemId === id)!;
        requests.push({ what: open.what, itemIds: [id], explicit: true, respond: 'release' });
      }
    }
  }

  const modelExhibit = turn.exhibit ? resolve(turn.exhibit) : null;
  const decisions = decideData({
    requests,
    exhibit: modelExhibit && !(gateOn && gated(modelExhibit)) ? modelExhibit : null,
    rescueItem: turn.rescueItem ? resolve(turn.rescueItem) : null,
    rung3: Boolean(state.stallDecision.intervene && state.stallDecision.rung === 3),
    ledger,
    exhibits: state.caseData.exhibits.map(e => ({ id: e.id, title: e.title, coversLedgerItems: (e as { coversLedgerItems?: string[] }).coversLedgerItems })),
    shownExhibitIds: state.shownExhibitIds,
    open: state.openDataRequests,
  });
  return { ...decisions, gatedIds };
}
