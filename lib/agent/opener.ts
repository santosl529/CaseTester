// Haiku opener (experiment, 7 Oct 2026): the interviewer's first sentence,
// written by Haiku 4.5 in parallel with Sonnet's turn, to fill the silence
// after the instant acknowledgment (~1.8s measured). Haiku sees no case data —
// only the candidate's message and the interviewer's last question — so it
// cannot leak a figure; its sentence still goes through the say vetoes.
// Sonnet is told the opening is handled and writes say as "".
import Anthropic from '@anthropic-ai/sdk';
import type { OnUsage } from '@/lib/llm-usage';
import { normalizeNumberWords } from '@/lib/number-words';

export const OPENER_MODEL_ID = 'claude-haiku-4-5';

// v2 (7 Oct, after the v1 replay): v1 restated content and so silently
// corrected candidates ("16%" → "sixteen points"), stated their conclusions as
// fact, and invented reasons ("stuck without seeing the exhibit"). v2 names
// only the kind of move; openerGate enforces the no-figures rule in code.
export const OPENER_SYSTEM = `You write the one short phrase a case interviewer says the moment the candidate finishes speaking, before the interviewer's real reply (someone else writes that).

Name only the KIND of move the candidate just made — never its content.
- At most six words. Plain spoken English.
- Examples: "A cost-first structure." "Your sizing of the COGS gap." "A pricing recommendation." "A clarifying question on growth." "A list of levers." "A request for the cost data."
- If they are stuck, apologizing, or unsure: "Take your time."
- If nothing fits: "Understood."

Never:
- any number, percentage, or figure — not even one they said;
- their conclusion, claim, or reasoning ("input inflation explains it");
- "you said", "you think", "you want", or anything about how they feel;
- a judgment of their work ("good", "right", "clear", "solid", "fair", "makes sense");
- a question; data, exhibits, or what will be provided.
Output only the phrase.`;

// The opener's user message: what the interviewer last asked, then the
// candidate's reply.
export function openerPrompt(lastQuestion: string, candidateText: string): string {
  return `Interviewer's last question: ${lastQuestion || '(the case prompt)'}\n\nCandidate just said: ${candidateText}`;
}

export const OPENER_TURN_NOTE =
  'THIS TURN: the system speaks a brief opening phrase for you, naming the kind of move the candidate just made. Set "say" to "". Don\'t restate or summarize their answer in your question — go straight to it.';

// The opener is dropped (nothing spoken) when it carries a figure — digits or
// number words — or runs long: v1 restated numbers and corrected candidates.
export function openerGate(text: string): string | null {
  const t = text.trim();
  if (!t) return 'empty';
  if (/\d/.test(normalizeNumberWords(t))) return 'number';
  if (t.split(/\s+/).length > 8) return 'too_long';
  if (/\?\s*$/.test(t)) return 'question';
  return null;
}

export async function writeOpener(params: {
  client: Anthropic;
  lastQuestion: string;
  candidateText: string;
  onFirstToken?: () => void;
  onUsage?: OnUsage;
}): Promise<string> {
  const stream = params.client.messages.stream({
    model: OPENER_MODEL_ID,
    max_tokens: 40,
    system: OPENER_SYSTEM,
    messages: [{ role: 'user', content: openerPrompt(params.lastQuestion, params.candidateText) }],
  });
  let text = '';
  for await (const ev of stream as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>) {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      if (!text) params.onFirstToken?.();
      text += ev.delta.text ?? '';
    }
  }
  const final = await stream.finalMessage();
  params.onUsage?.({ component: 'opener', model: OPENER_MODEL_ID, inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens });
  return text.trim();
}
