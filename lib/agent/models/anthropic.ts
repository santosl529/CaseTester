import Anthropic from '@anthropic-ai/sdk';
import type { InterviewerModel, TurnContext } from './interface';
import { INTERVIEWER_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import type { Action } from '@/lib/orchestrator/actions';
import { extractToolId, validateToolUses } from './tool-input';

const TOOLS: Anthropic.Beta.BetaTool[] = [
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
    description: 'End the case interview. Use when the case is complete or time is up.',
    input_schema: { type: 'object', properties: {} },
  },
];

export { INTERVIEWER_MODEL_ID } from '@/lib/models';

// Live run 58cb8061 (2026-09-14): after asking the brainstorm question the
// model kept generating — "\n\nuser Several levers…" — and wrote the
// candidate's answer itself, which was then spoken and scored. Stop generation
// at a line that opens as another speaker. First line of defense only; the
// runner's stripFabricatedTurn (lib/orchestrator/audit.ts) is the
// deterministic backstop, since stop sequences are case-sensitive and can't
// enumerate every label.
export const INTERVIEWER_STOP_SEQUENCES = ['\nuser', '\nUser', '\nHuman:', '\nCandidate:', '\nCANDIDATE:'];

export class AnthropicInterviewerModel implements InterviewerModel {
  private client: Anthropic;
  private modelId: string;

  constructor(modelId: string = INTERVIEWER_MODEL_ID) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.modelId = modelId;
  }

  async runTurn(ctx: TurnContext): Promise<Action[]> {
    const messages: Anthropic.Beta.BetaMessageParam[] = ctx.history.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const logBlocks = (r: Anthropic.Beta.BetaMessage) => console.log('[interviewer-model] raw blocks:', JSON.stringify(
      describeBlocks(r.content as ContentBlock[]), null, 2,
    ));
    const call = async () => {
      // Adaptive thinking at low effort (3 Oct). With "between_tools" (no
      // thinking) Sonnet 5.5 reasoned about each release in plain text, which
      // was spoken (batch 5: ~16 narration lines in 8/10 runs). At low effort
      // it skips thinking on simple turns; latency is being measured. Thinking
      // counts toward max_tokens, hence the headroom over the old 1024.
      const r = await this.client.beta.messages.create({
        model: this.modelId,
        max_tokens: 4096,
        system: ctx.systemPrompt,
        messages,
        tools: TOOLS,
        stop_sequences: INTERVIEWER_STOP_SEQUENCES,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        betas: [FALLBACK_BETA],
        fallbacks: FALLBACKS,
      });
      // Branch on stop_reason before content: a refusal the fallback chain
      // could not rescue leaves no usable turn (the caller's neutral
      // continuation applies).
      if (r.stop_reason === 'refusal') {
        console.warn('[interviewer-model] refusal:', JSON.stringify(r.stop_details));
      }
      ctx.onUsage?.({
        component: 'interviewer',
        model: this.modelId,
        inputTokens: r.usage.input_tokens,
        outputTokens: r.usage.output_tokens,
      });
      return r;
    };

    let response = await call();
    logBlocks(response);

    // Tool-id validation loop: if the model called reveal_data/show_exhibit with
    // an id that doesn't resolve to a real target, hand the error back (with the
    // valid ids) and let it correct itself — bounded — instead of silently
    // delivering nothing or the wrong exhibit.
    const idValidators = ctx.idValidators ?? {};
    const maxCorrections = ctx.maxToolCorrections ?? 2;
    if (Object.keys(idValidators).length > 0) {
      for (let attempt = 0; attempt < maxCorrections; attempt++) {
        const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        if (toolUses.length === 0) break;
        const { toolResults, anyInvalid } = validateToolUses(
          toolUses.map(b => ({ id: b.id, name: b.name, input: b.input })), idValidators,
        );
        if (!anyInvalid) break;
        console.warn('[interviewer-model] invalid tool id — asking model to correct',
          JSON.stringify(toolResults.filter(r => r.is_error)));
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults as Anthropic.Beta.BetaToolResultBlockParam[] });
        response = await call();
        logBlocks(response);
      }
    }

    const actions = actionsFromContent(response.content);

    // Always ensure at least a speak action
    if (actions.length === 0) {
      actions.push({ type: 'speak', text: "I see. What would you like to explore next?" });
    }

    return actions;
  }
}

type ContentBlock = { type: string; text?: string; name?: string; input?: unknown };

// Log shape for a model response. Text blocks carry their text: narration is
// counted from the raw model output, before the runner's meta-leak strip
// hides it (batch-5 logs had only the block types).
export function describeBlocks(content: ContentBlock[]): Record<string, unknown>[] {
  return content.map(b => {
    if (b.type === 'tool_use') return { type: 'tool_use', name: b.name, input: b.input };
    if (b.type === 'text') return { type: 'text', text: b.text };
    return { type: b.type };
  });
}

// Model output → orchestrator actions. Batch 4 (Sonnet 5.5 interviewer): the
// model sometimes writes its reasoning as plain text beside its tool calls.
// When the turn ALSO calls `speak`, the spoken words are the speak text and
// plain text is narration — dropped. Without a speak call the plain text IS the
// reply (batch 5: Ines and Destiny got blank turns when it was dropped beside
// an advance_phase call); the runner's meta-leak strip catches narration there
// ("The candidate is asking…").
export function actionsFromContent(content: ContentBlock[]): Action[] {
  const usesTools = content.some(b => b.type === 'tool_use' && b.name === 'speak');
  const actions: Action[] = [];
  for (const block of content) {
    if (block.type === 'text' && block.text?.trim()) {
      if (usesTools) {
        console.warn('[interviewer-model] dropped narration outside speak:', JSON.stringify(block.text.trim().slice(0, 200)));
        continue;
      }
      actions.push({ type: 'speak', text: block.text.trim() });
    } else if (block.type === 'tool_use') {
      switch (block.name) {
        case 'speak': {
          const text = (block.input as { text?: unknown }).text;
          if (typeof text === 'string' && text.trim()) actions.push({ type: 'speak', text });
          break;
        }
        case 'reveal_data': {
          const itemId = extractToolId(block.input, 'item_id');
          if (itemId) actions.push({ type: 'reveal_data', itemId });
          else console.warn('[interviewer-model] reveal_data with no resolvable id:', JSON.stringify(block.input));
          break;
        }
        case 'show_exhibit': {
          const exhibitId = extractToolId(block.input, 'exhibit_id');
          if (exhibitId) actions.push({ type: 'show_exhibit', exhibitId });
          else console.warn('[interviewer-model] show_exhibit with no resolvable id:', JSON.stringify(block.input));
          break;
        }
        case 'advance_phase':
          actions.push({ type: 'advance_phase' });
          break;
        case 'end_case':
          actions.push({ type: 'end_case' });
          break;
      }
    }
  }
  return actions;
}
