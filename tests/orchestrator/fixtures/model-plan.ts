// A ModelPlan for prof-001, built by the real planTurn with the distress
// verdict and the data-request detection under the test's control. Callers
// mock '@/db/client' and the two classifiers before importing this.
import { planTurn, type ModelPlan, type TurnKind } from '@/lib/orchestrator/plan-turn';
import type { DistressVerdict } from '@/lib/orchestrator/distress';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { readsFixture } from './turn-reads';

export function modelPlanFixture(opts: {
  distress: DistressVerdict | null;
  distressDelayMs?: number;
  buffered?: boolean;
  phase?: Phase;
  candidateText?: string;
  revealed?: string[];
  kind?: TurnKind;
}): ModelPlan {
  const plan = planTurn(
    readsFixture({ phase: opts.phase ?? 'ANALYSIS', revealed: opts.revealed }),
    opts.candidateText ?? 'Can I see the data?',
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} },
  );
  if (plan.kind !== 'model') throw new Error('fixture expected a model plan');
  plan.state.distress = new Promise(resolve => setTimeout(() => resolve(opts.distress), opts.distressDelayMs ?? 0));
  plan.state.detectedRequests = Promise.resolve([]);
  if (opts.buffered !== undefined) plan.state.buffered = opts.buffered;
  if (opts.kind) plan.state.kind = opts.kind;
  return plan;
}
