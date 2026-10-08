import type { Phase } from '@/lib/orchestrator/state-machine';
import { buildPromptParts, type PromptContext } from './prompts/system';
import { buildCompactPromptParts } from './prompts/system-compact';
import type { InterviewerModel, ModelMessage, TurnContext, TurnEvent } from './models/interface';
import type { ModelTurn } from './models/turn-schema';
import type { OnUsage } from '@/lib/llm-usage';
import { collectTurn, eventsFromTurn } from './models/turn-events';
import { exactResolver } from '@/lib/orchestrator/data-decisions';

export type InterviewerTurnInput = {
  model: InterviewerModel;
  candidateText: string;
  history: ModelMessage[];
  promptCtx: PromptContext;
  phase: Phase;
  onUsage?: OnUsage;
  onValidation?: TurnContext['onValidation'];
  // Streaming: false once the caller has delivered part of the turn.
  canRegenerate?: () => boolean;
  onMark?: (name: string) => void;
  // Latency A/B arm (scripts/replay-output-format.ts): the compact prompt
  // (prompts/system-compact.ts). Production passes none — the full prompt.
  promptVariant?: 'full' | 'compact';
  // Guard B (7 Oct): the candidate plainly asked for data (request-signal.ts).
  // If the model's requests close empty, the turn is written once more with
  // REQUEST_GUARD_NOTE — the caller holds "say" so nothing is delivered yet.
  requireRequests?: boolean;
  onRequestGuard?: (r: { regenerated: boolean }) => void;
};

export const REQUEST_GUARD_NOTE = "THIS TURN: the candidate's message may ask for case data. Check it and declare every request in \"requests\"; if there truly is none, leave requests empty.";

export async function runInterviewerTurn(input: InterviewerTurnInput): Promise<ModelTurn> {
  return collectTurn(streamInterviewerTurn(input));
}

// The case's data items (released or not) and exhibits, for resolving the
// ids the model declares. Exact only — an id, or a label / title, ignoring
// case and punctuation: a partial match could release an item nobody asked
// for ("cogs" is inside two ids). Anything else is unknown and regenerates.
export function catalogResolver(promptCtx: PromptContext): { resolve: (raw: string) => string | null; ids: string[] } {
  const items = [
    ...promptCtx.unrevealedItems.map(i => ({ id: i.id, names: [i.label] })),
    ...Object.keys(promptCtx.revealedValues).map(id => ({ id, names: [] })),
    ...promptCtx.exhibits.map(e => ({ id: e.id, names: [e.title] })),
  ];
  return { resolve: exactResolver(items), ids: items.map(i => i.id) };
}

// The turn as a stream (spec 2026-10-06-plan-owns-decisions §4).
export async function* streamInterviewerTurn(input: InterviewerTurnInput): AsyncGenerator<TurnEvent> {
  const { promptCtx } = input;
  const build = input.promptVariant === 'compact' ? buildCompactPromptParts : buildPromptParts;
  const { stable: systemPrompt, turn: turnSystem } = build(promptCtx);
  const messages: ModelMessage[] = [...input.history, { role: 'user', content: input.candidateText }];
  const catalog = catalogResolver(promptCtx);

  const ctx: TurnContext = {
    systemPrompt,
    turnSystem,
    history: messages,
    resolveId: catalog.resolve,
    validIds: catalog.ids,
    onUsage: input.onUsage,
    onValidation: input.onValidation,
    canRegenerate: input.canRegenerate,
    onMark: input.onMark,
  };
  console.log('[interviewer] phase:', input.phase);
  const run = (c: TurnContext) => (input.model.streamTurn ? input.model.streamTurn(c) : eventsFromTurn(input.model.runTurn(c)));
  if (!input.requireRequests) { yield* run(ctx); return; }

  // Guard B: stop at an empty requests field while a regeneration is still
  // possible (breaking out aborts the model's stream), then write it again.
  let regenerate = false;
  for await (const e of run(ctx)) {
    if (e.type === 'field' && e.key === 'requests' && Array.isArray(e.value) && e.value.length === 0 && (input.canRegenerate?.() ?? true)) {
      regenerate = true;
      break;
    }
    yield e;
  }
  input.onRequestGuard?.({ regenerated: regenerate });
  if (!regenerate) return;
  console.warn('[interviewer] request guard: explicit ask, no request declared — regenerating');
  input.onMark?.('request_guard_regenerate');
  yield { type: 'restart', reason: REQUEST_GUARD_NOTE };
  yield* run({ ...ctx, turnSystem: [ctx.turnSystem, REQUEST_GUARD_NOTE].filter(Boolean).join('\n\n') });
}
