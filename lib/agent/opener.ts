// Haiku opener (experiment, 7 Oct 2026): the interviewer's first sentence,
// written by Haiku 4.5 in parallel with Sonnet's turn, to fill the silence
// after the instant acknowledgment (~1.8s measured). Haiku sees no case data —
// only the candidate's message and the interviewer's last question — so it
// cannot leak a figure; its sentence still goes through the say vetoes.
// Sonnet is told the opening is handled and writes say as "".
import Anthropic from '@anthropic-ai/sdk';
import type { OnUsage } from '@/lib/llm-usage';

export const OPENER_MODEL_ID = 'claude-haiku-4-5';

export const OPENER_SYSTEM = `You write the one short sentence a case interviewer says the moment the candidate finishes speaking, before the interviewer's real reply (someone else writes that).

Rules:
- One sentence, at most eight words. Plain spoken English, no markdown.
- Neutrally name what the candidate just did or said ("A cost-first split." "Revenue versus cost, then." "Sixteen points from COGS, you said.") or give a plain acknowledgment ("Understood.").
- Never evaluate their work: no "good", "great", "right", "fair", "clear", "solid", "sound", "makes sense", "holds", "nice".
- Never ask a question.
- Never mention data, figures, exhibits, or what will or won't be provided.
- Repeat a number only if the candidate said it; never add one.
- Never attribute anything the candidate did not say; a question they asked is not a claim.
Output only the sentence.`;

// The opener's user message: what the interviewer last asked, then the
// candidate's reply.
export function openerPrompt(lastQuestion: string, candidateText: string): string {
  return `Interviewer's last question: ${lastQuestion || '(the case prompt)'}\n\nCandidate just said: ${candidateText}`;
}

export const OPENER_TURN_NOTE =
  'THIS TURN: the system speaks a brief opening sentence for you — a neutral acknowledgment or restatement of the candidate\'s message. Set "say" to "".';

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
