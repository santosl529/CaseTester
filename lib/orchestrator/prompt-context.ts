// The interviewer's per-turn prompt context, from a model plan. One function
// for the runner (the model's input) and for the speculative-turn fingerprint
// (speculation.ts), so both see exactly the same thing.
import type { PromptContext } from '@/lib/agent/prompts/system';
import type { ModelPlan } from './plan-turn';
import { revealedValues, unrevealedItems, labelWithPeriod } from './data-ledger';
import { switchOn } from '@/lib/cases/engine-switches';
import { caseTotalMs } from './state-machine';
import { turnNoteFor } from './turn-note';
import { exhibitReady } from './data-decisions';
import { brainstormAsks, brainstormRequired } from './brainstorm';

export function promptContextFor(plan: ModelPlan): PromptContext {
  const { ctx, state } = plan;
  const { caseData, ledger, stallDecision } = state;
  return {
    casePrompt: caseData.prompt,
    currentPhase: ctx.currentPhase,
    revealedValues: revealedValues(ledger),
    unrevealedItems: unrevealedItems(ledger),
    exhibits: caseData.exhibits.map(e => ({ id: e.id, title: e.title, shown: state.shownExhibitIds.has(e.id),
      ...(!state.shownExhibitIds.has(e.id) && !exhibitReady(e, caseData.exhibits, state.shownExhibitIds, ledger, state.stagesOut) ? { notYet: true } : {}) })),
    advancedLastTurn: Boolean(ctx.flags.advancedLastTurn),
    elapsedMs: state.elapsedMs,
    totalMs: caseTotalMs(caseData),
    phaseBudgetsMs: state.phaseBudgetsMs,
    recomputeHint: [state.recomputeHint, state.verifiedHint, state.kind === 'model' ? state.misquoteHint : ''].filter(Boolean).join('\n\n') || undefined,
    stallGuidance: stallDecision.guidance,
    coverageSteer: state.coverageSteer,
    openDataRequestsHint: state.openDataRequestsHint,
    conductRedirectHint: state.conductRedirectHint,
    turnNote: turnNoteFor(state.kind, ctx.acknowledged, { pressureTest: state.pressureTest.state, phase: ctx.currentPhase }),
    brainstorm: { ask: brainstormAsks(caseData)[0], required: brainstormRequired(caseData),
      after: (caseData.brainstorm?.after ?? []).map(id => caseData.exhibits.find(e => e.id === id)?.title).filter((t): t is string => Boolean(t)) },
    // Phase 1 contract 2.5: the items' askPhrases, static for the case (the stable, cached prompt part).
    ...(switchOn(caseData, 'askPhrasesInPrompt')
      ? { askPhrases: caseData.dataLedger.filter(d => d.askPhrases?.length).map(d => ({ id: d.id, label: labelWithPeriod(d), phrases: d.askPhrases! })) }
      : {}),
  };
}
