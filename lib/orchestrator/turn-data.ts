// One turn's data decisions from the model's declarations (or code's own,
// on code-written turns) — the same function in Stream (to deliver the data
// line while the model is still writing) and Settle (to book and compose), so
// both reach the same result from the same inputs.
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { resolveRequests } from '@/lib/agent/models/turn-schema';
import type { ModelPlan } from './plan-turn';
import { decideData, exactResolver, type DataDecisions } from './data-decisions';
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
// check). Two at most, this turn's asks first.
const FORCES_OPEN = new Set(['rec_ask', 'grace_ask', 'time_warning']);

export function turnData(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>): DataDecisions {
  const { ctx, state } = plan;
  const resolve = caseResolver(plan);
  const requests: DeclaredRequest[] = resolveRequests(turn.requests, resolve);
  if (FORCES_OPEN.has(state.kind)) {
    const declared = new Set(requests.flatMap(r => r.itemIds));
    const revealed = new Set(Object.keys(revealedValues(state.ledger)));
    for (const id of planForcedReleases(state.openDataRequests, revealed, { currentTurnIndex: ctx.nextTurnIndex })) {
      if (declared.has(id)) continue;
      const open = state.openDataRequests.find(o => o.ledgerItemId === id)!;
      requests.push({ what: open.what, itemIds: [id], explicit: true, respond: 'release' });
    }
  }
  return decideData({
    requests,
    exhibit: turn.exhibit ? resolve(turn.exhibit) : null,
    rescueItem: turn.rescueItem ? resolve(turn.rescueItem) : null,
    rung3: Boolean(state.stallDecision.intervene && state.stallDecision.rung === 3),
    ledger: state.ledger,
    exhibits: state.caseData.exhibits.map(e => ({ id: e.id, title: e.title, coversLedgerItems: (e as { coversLedgerItems?: string[] }).coversLedgerItems })),
    shownExhibitIds: state.shownExhibitIds,
    open: state.openDataRequests,
  });
}
