import type { Action } from '@/lib/orchestrator/actions';
import type { OnUsage } from '@/lib/llm-usage';

export type ModelMessage = { role: 'user' | 'assistant'; content: string };

export type TurnContext = {
  // Fixed instructions — identical turn to turn, so cacheable.
  systemPrompt: string;
  // Per-turn case state (phase, data lists, clock, hints), appended to the
  // system prompt after the cached fixed part.
  turnSystem?: string;
  history: ModelMessage[];
  tools: ToolDefinition[];
  // Per-tool id validators. When the model calls a tool whose id doesn't
  // resolve to a real target, the model impl feeds the error back (with the
  // valid options) and lets the model correct itself — up to maxToolCorrections
  // rounds — instead of silently delivering nothing or guessing wrong.
  idValidators?: Record<string, ToolIdValidator>;
  maxToolCorrections?: number; // default 2
  // Token-usage reporting (lib/llm-usage.ts). Called once per underlying API
  // call — a correction loop reports each round, so the caller sums.
  onUsage?: OnUsage;
};

// For a tool call carrying an id (reveal_data.item_id, show_exhibit.exhibit_id):
// resolve the raw id to a canonical one (tolerant), or null if it's not real.
export type ToolIdValidator = {
  idKey: string;                                   // where the id lives in the tool input
  resolve: (rawId: string | undefined) => string | null;
  validOptions: string[];                          // listed back to the model on a miss
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface InterviewerModel {
  runTurn(ctx: TurnContext): Promise<Action[]>;
}
