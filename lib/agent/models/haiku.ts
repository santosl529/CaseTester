import Anthropic from '@anthropic-ai/sdk';
import type { InterviewerModel, TurnContext } from './interface';
import type { Action } from '@/lib/orchestrator/actions';

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'speak',
    description: 'Say something to the candidate.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'What to say.' } },
      required: ['text'],
    },
  },
  {
    name: 'reveal_data',
    description: 'Disclose a data ledger item to the candidate. Only call this when the candidate has asked for the data.',
    input_schema: {
      type: 'object',
      properties: { item_id: { type: 'string', description: 'The ledger item id.' } },
      required: ['item_id'],
    },
  },
  {
    name: 'show_exhibit',
    description: 'Display an exhibit (chart/table) to the candidate.',
    input_schema: {
      type: 'object',
      properties: { exhibit_id: { type: 'string', description: 'The exhibit id.' } },
      required: ['exhibit_id'],
    },
  },
  {
    name: 'advance_phase',
    description: 'Move to the next interview phase when the candidate has completed the current one.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'end_case',
    description: 'End the case interview. Use only in RECOMMENDATION or WRAP phase.',
    input_schema: { type: 'object', properties: {} },
  },
];

export class HaikuInterviewerModel implements InterviewerModel {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async runTurn(ctx: TurnContext): Promise<Action[]> {
    const messages: Anthropic.MessageParam[] = ctx.history.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: ctx.systemPrompt,
      messages,
      tools: TOOLS,
    });

    const actions: Action[] = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        // LLM produced raw text — treat as speak (shouldn't happen ideally)
        actions.push({ type: 'speak', text: block.text.trim() });
      } else if (block.type === 'tool_use') {
        switch (block.name) {
          case 'speak':
            actions.push({ type: 'speak', text: (block.input as { text: string }).text });
            break;
          case 'reveal_data':
            actions.push({ type: 'reveal_data', itemId: (block.input as { item_id: string }).item_id });
            break;
          case 'show_exhibit':
            actions.push({ type: 'show_exhibit', exhibitId: (block.input as { exhibit_id: string }).exhibit_id });
            break;
          case 'advance_phase':
            actions.push({ type: 'advance_phase' });
            break;
          case 'end_case':
            actions.push({ type: 'end_case' });
            break;
        }
      }
    }

    // Always ensure at least a speak action
    if (actions.length === 0) {
      actions.push({ type: 'speak', text: "I see. What would you like to explore next?" });
    }

    return actions;
  }
}
