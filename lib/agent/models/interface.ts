import type { Action } from '@/lib/orchestrator/actions';

export type ModelMessage = { role: 'user' | 'assistant'; content: string };

export type TurnContext = {
  systemPrompt: string;
  history: ModelMessage[];
  tools: ToolDefinition[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface InterviewerModel {
  runTurn(ctx: TurnContext): Promise<Action[]>;
}
