import Anthropic from '@anthropic-ai/sdk';
import type { InterviewerModel, TurnContext, TurnEvent, ToolIdValidator } from './interface';
import { INTERVIEWER_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import type { Action } from '@/lib/orchestrator/actions';
import { extractToolId } from './tool-input';
import { RESPONSE_FORMAT, RESPONSE_SCHEMA, parseResponse, normalizeActions, retryNote, type RawAction } from './json-actions';
import { ActionStreamParser } from './json-action-stream';
import { collectActions } from './turn-events';

export const TOOLS: Anthropic.Beta.BetaTool[] = [
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
    return collectActions(this.streamTurn(ctx));
  }

  // The turn, streamed (spec 2026-10-05-streaming-turn §4.5): complete
  // sentences and actions go out as they close; the whole text is parsed and
  // normalized at the end exactly as before.
  async *streamTurn(ctx: TurnContext): AsyncGenerator<TurnEvent> {
    const messages: Anthropic.Beta.BetaMessageParam[] = ctx.history.map(m => ({
      role: m.role,
      content: m.content,
    }));
    const validators = ctx.idValidators ?? {};
    // The response format rides in the cached fixed block (it never changes).
    const system = buildSystemBlocks(`${ctx.systemPrompt}\n\n${RESPONSE_FORMAT}`, ctx.turnSystem);

    let first = yield* this.attempt(system, messages, ctx);
    let result = normalizeActions(first.raw ?? [], validators);
    let retried = false;
    // One regeneration when the draft can't be parsed (cut off at max_tokens),
    // names ids that don't exist, or leaves nothing to say or do — and only
    // while the caller has delivered none of it: a retry after speech would
    // repeat or contradict what the candidate heard. The note goes after the
    // candidate's message as a system message.
    if (!first.refused && (first.raw === null || result.retry) && (ctx.canRegenerate?.() ?? true)) {
      retried = true;
      const note = first.raw === null
        ? 'Your previous draft of this turn was not a complete JSON object. Write the whole turn again as one JSON object.'
        : retryNote(result.report, validators);
      console.warn('[interviewer-model] regenerating:', note);
      yield { type: 'restart', reason: note };
      first = yield* this.attempt(system, [...messages, { role: 'system', content: note } as unknown as Anthropic.Beta.BetaMessageParam], ctx);
      result = normalizeActions(first.raw ?? [], validators);
    }
    if (result.report.dropped.length > 0) {
      console.warn('[interviewer-model] dropped actions:', JSON.stringify(result.report.dropped));
    }
    ctx.onValidation?.({ report: result.report, retried, unparsed: first.raw === null, refused: first.refused });

    const actions = result.actions;
    // Always ensure at least a speak action
    if (actions.length === 0) {
      actions.push({ type: 'speak', text: "I see. What would you like to explore next?" });
    }
    yield { type: 'done', actions, report: result.report, retried, unparsed: first.raw === null, refused: first.refused };
  }

  // One streamed request.
  private async *attempt(
    system: Anthropic.Beta.BetaTextBlockParam[],
    messages: Anthropic.Beta.BetaMessageParam[],
    ctx: TurnContext,
  ): AsyncGenerator<TurnEvent, { raw: RawAction[] | null; refused: boolean }> {
    const validators = ctx.idValidators ?? {};
    // Thinking off: Sonnet 5.5 rejects {type: "disabled"}; "between_tools"
    // is how it runs without thinking (no other field; effort high or below
    // — the default). Batch 6 tried adaptive thinking at low effort: it
    // removed the spoken narration but thinking turns took 4.1s (median
    // 2.75s vs 1.8s), too slow for voice. The structured response format
    // keeps reasoning out of speech instead (json-actions.ts). With the
    // server-side fallback, a declined request re-runs on another model.
    // No tools and no stop sequences: the reply is one JSON object, and a
    // stop sequence could cut it mid-string.
    const stream = this.client.beta.messages.stream({
      model: this.modelId,
      max_tokens: 1024,
      system,
      messages,
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
      thinking: { type: 'between_tools' },
      betas: [FALLBACK_BETA],
      fallbacks: FALLBACKS,
    });
    const parser = new ActionStreamParser();
    for await (const ev of stream as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>) {
      if (ev.type !== 'content_block_delta' || ev.delta?.type !== 'text_delta') continue;
      for (const p of parser.push(ev.delta.text ?? '')) {
        if (p.type === 'sentence') { yield p; continue; }
        const action = liveAction(p.raw, validators);
        if (action) yield { type: 'action', action };
      }
    }
    const r = await stream.finalMessage();
    ctx.onUsage?.({
      component: 'interviewer',
      model: this.modelId,
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
    });
    console.log('[interviewer-model] raw response:', parser.text);
    // Branch on stop_reason before content: a refusal the fallback chain
    // could not rescue leaves no usable turn (the neutral continuation
    // applies) and is not worth regenerating.
    if (r.stop_reason === 'refusal') {
      console.warn('[interviewer-model] refusal:', JSON.stringify(r.stop_details));
      return { raw: null, refused: true };
    }
    return { raw: parseResponse(parser.text), refused: false };
  }
}

// A streamed action whose id resolves — the same resolution normalizeActions
// applies at the end. Speech is delivered as sentences, never as an action.
function liveAction(raw: RawAction, validators: Record<string, ToolIdValidator>): Exclude<Action, { type: 'speak' }> | null {
  if (raw.type === 'reveal_data' || raw.type === 'show_exhibit') {
    const rawId = String(raw.type === 'reveal_data' ? raw.item_id ?? '' : raw.exhibit_id ?? '');
    const id = validators[raw.type]?.resolve(rawId) ?? null;
    if (!id) return null;
    return raw.type === 'reveal_data' ? { type: 'reveal_data', itemId: id } : { type: 'show_exhibit', exhibitId: id };
  }
  if (raw.type === 'advance_phase' || raw.type === 'end_case') return { type: raw.type };
  return null;
}

// System prompt with prompt caching (latency plan step 3). The breakpoint on
// the fixed instructions caches them and the tools (~5.3k of ~8.3k input
// tokens). The per-turn case state follows in `system`, uncached. Replay
// (batch 8, 44 turns in order): no latency change either way at this size —
// the gain is input cost. Moving the state after the candidate's message, so
// the conversation could be cached too, made Sonnet narrate ~10× more and
// added ~310ms, so it stays in `system`.
export function buildSystemBlocks(stable: string, turn?: string): Anthropic.Beta.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }];
  if (turn) blocks.push({ type: 'text', text: turn });
  return blocks;
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
