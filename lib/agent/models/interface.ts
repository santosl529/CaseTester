import type { ModelTurn } from './turn-schema';
import type { OnUsage } from '@/lib/llm-usage';

export type ModelMessage = { role: 'user' | 'assistant'; content: string };

export type TurnValidation = {
  unknownIds: string[];   // ids the model declared that the case doesn't have
  emptyTurn: boolean;     // nothing to say and no question
  retried: boolean;
  unparsed: boolean;
  refused: boolean;
};

export type TurnContext = {
  // Fixed instructions — identical turn to turn, so cacheable.
  systemPrompt: string;
  // Per-turn case state (phase, data lists, clock, hints), appended to the
  // system prompt after the cached fixed part.
  turnSystem?: string;
  history: ModelMessage[];
  // Resolves a declared item / exhibit id to a canonical one (tolerant), or
  // null when the case doesn't have it. An unknown id triggers one
  // regeneration (a typo would otherwise become a false refusal).
  resolveId?: (rawId: string) => string | null;
  validIds?: string[];  // listed back to the model on a miss
  // What the model layer did to the reply; the runner records it as a check.
  onValidation?: (v: TurnValidation) => void;
  // Token-usage reporting (lib/llm-usage.ts). Called once per underlying API
  // call — a regeneration reports each round, so the caller sums.
  onUsage?: OnUsage;
  // Streaming: false once the caller has delivered part of this turn — a
  // regeneration after speech would repeat or contradict it.
  canRegenerate?: () => boolean;
  // Timing marks from inside the model call (request sent, first token, a
  // regeneration) — lib/orchestrator/turn-timer.ts.
  onMark?: (name: string) => void;
};

// The streamed turn: each field as it closes (say, then move, requests,
// exhibit, rescue_item and question), the say text by sentence as it is
// written, a restart when the draft is regenerated (anything held from it is
// discarded), then the final turn.
export type TurnEvent =
  | { type: 'field'; key: 'move' | 'requests' | 'exhibit' | 'rescue_item' | 'say' | 'question'; value: unknown }
  | { type: 'sentence'; text: string }
  | { type: 'restart'; reason: string }
  | { type: 'done'; turn: ModelTurn; validation: TurnValidation };

export interface InterviewerModel {
  runTurn(ctx: TurnContext): Promise<ModelTurn>;
  // Optional: models without it (test mocks, experiments) are streamed as one
  // burst of their finished turn (turn-events.ts).
  streamTurn?(ctx: TurnContext): AsyncIterable<TurnEvent>;
}
