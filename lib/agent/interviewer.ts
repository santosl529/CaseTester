import type { Action } from '@/lib/orchestrator/actions';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { LEGAL_ACTIONS } from '@/lib/orchestrator/state-machine';
import { buildSystemPrompt, type PromptContext } from './prompts/system';
import type { InterviewerModel, ModelMessage } from './models/interface';

export type InterviewerTurnInput = {
  model: InterviewerModel;
  candidateText: string;
  history: ModelMessage[];
  promptCtx: PromptContext;
  phase: Phase;
};

export async function runInterviewerTurn(input: InterviewerTurnInput): Promise<Action[]> {
  const systemPrompt = buildSystemPrompt(input.promptCtx);

  const messages: ModelMessage[] = [
    ...input.history,
    { role: 'user', content: input.candidateText },
  ];

  const actions = await input.model.runTurn({
    systemPrompt,
    history: messages,
    tools: [], // tools are defined inside the model impl
  });

  // Filter illegal actions for the current phase
  const legal = LEGAL_ACTIONS[input.phase];
  const filtered = actions.filter(a => legal.includes(a.type));

  // Always return at least a speak action
  if (filtered.length === 0) {
    return [{ type: 'speak', text: "Let's continue — what are your thoughts?" }];
  }

  return filtered;
}
