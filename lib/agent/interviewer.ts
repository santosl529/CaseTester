import type { Action } from '@/lib/orchestrator/actions';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { LEGAL_ACTIONS } from '@/lib/orchestrator/state-machine';
import { buildPromptParts, type PromptContext } from './prompts/system';
import type { InterviewerModel, ModelMessage, ToolIdValidator, TurnContext } from './models/interface';
import type { OnUsage } from '@/lib/llm-usage';
import { resolveExhibit } from '@/lib/orchestrator/exhibits';

export type InterviewerTurnInput = {
  model: InterviewerModel;
  candidateText: string;
  history: ModelMessage[];
  promptCtx: PromptContext;
  phase: Phase;
  onUsage?: OnUsage;
  onValidation?: TurnContext['onValidation'];
};

export async function runInterviewerTurn(input: InterviewerTurnInput): Promise<Action[]> {
  const { promptCtx } = input;
  const { stable: systemPrompt, turn: turnSystem } = buildPromptParts(promptCtx);

  const messages: ModelMessage[] = [
    ...input.history,
    { role: 'user', content: input.candidateText },
  ];

  // Deterministic id validators for the model's retry loop. reveal_data is
  // validated against the items still available to reveal; show_exhibit against
  // the case's exhibits. resolveExhibit does tolerant id/name matching, so
  // close-enough ids pass and only genuinely-unresolvable ones trigger a retry.
  const ledgerItems = promptCtx.unrevealedItems.map(i => ({ id: i.id, title: i.label }));
  const idValidators: Record<string, ToolIdValidator> = {
    show_exhibit: {
      idKey: 'exhibit_id',
      resolve: raw => resolveExhibit(promptCtx.exhibits, raw)?.id ?? null,
      validOptions: promptCtx.exhibits.map(e => e.id),
    },
    reveal_data: {
      idKey: 'item_id',
      resolve: raw => resolveExhibit(ledgerItems, raw)?.id ?? null,
      validOptions: promptCtx.unrevealedItems.map(i => i.id),
    },
  };

  const actions = await input.model.runTurn({
    systemPrompt,
    turnSystem,
    history: messages,
    tools: [], // tools are defined inside the model impl
    idValidators,
    onUsage: input.onUsage,
    onValidation: input.onValidation,
  });

  // Filter illegal actions for the current phase
  const legal = LEGAL_ACTIONS[input.phase];
  const filtered = actions.filter(a => legal.includes(a.type));
  console.log('[interviewer] phase:', input.phase, 'raw:', actions.map(a => a.type), '→ filtered:', filtered.map(a => a.type));

  // Always return at least a speak action
  if (filtered.length === 0) {
    return [{ type: 'speak', text: "Let's continue — what are your thoughts?" }];
  }

  return filtered;
}
