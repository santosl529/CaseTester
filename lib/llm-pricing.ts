// List prices for every model the product or its scripts call, by exact model
// id (dated ids listed separately). One table for every cost figure — live-run
// reports, replays, evals and the run budget (lib/llm-budget.ts). An id that
// is not here throws: a missing price must fail loudly, never cost $0 or fall
// back to another model's rate (8 Oct: an estimate priced the dated coverage
// id at $0 and a run went over its cap).
//
// $/MTok, Claude API list prices checked 8 Oct 2026
// (platform.claude.com/docs/en/about-claude/pricing). 5-minute cache writes;
// the app sets no 1-hour cache. Non-Anthropic providers (Luna, Sol, Gemini,
// gpt-oss) are deliberately absent: add a verified price before a budgeted
// run uses them. Cerebras ids are keyed as the adapter reports usage
// ("cerebras/<model>").
import type { LlmUsage } from './llm-usage';

type Rate = { in: number; cacheRead: number; cacheWrite: number; out: number };
type Price = Rate & { longPrompt?: { overTokens: number } & Rate };

const OPUS_5_5: Price = { in: 4, cacheRead: 0.2, cacheWrite: 5, out: 20 };
const OPUS_5: Price = { in: 5, cacheRead: 0.5, cacheWrite: 6.25, out: 25 };
const SONNET_5_5: Price = { in: 2, cacheRead: 0.1, cacheWrite: 2.5, out: 10 };
const SONNET_5: Price = { in: 2, cacheRead: 0.2, cacheWrite: 2.5, out: 10 };
const HAIKU_4_5: Price = { in: 1, cacheRead: 0.1, cacheWrite: 1.25, out: 5 };
// Haiku 5.5 is priced by prompt length: prompts over 100,000 tokens pay more.
const HAIKU_5_5: Price = {
  in: 0.1, cacheRead: 0.01, cacheWrite: 0.125, out: 0.5,
  longPrompt: { overTokens: 100_000, in: 0.5, cacheRead: 0.05, cacheWrite: 0.625, out: 2.5 },
};

// Qwen 3.8 27B on Cerebras (interviewer screening only), checked 8 Oct 2026
// (inference-docs.cerebras.ai/models/qwen-3.8-27b). No cached-input price is
// published, so cached tokens are priced at the full input rate.
const QWEN_3_8_27B_CEREBRAS: Price = { in: 0.99, cacheRead: 0.99, cacheWrite: 0.99, out: 1.49 };

export const MODEL_PRICES: Record<string, Price> = {
  'claude-opus-5-5': OPUS_5_5,
  'claude-opus-5': OPUS_5,
  'claude-opus-4-8': OPUS_5,
  'claude-sonnet-5-5': SONNET_5_5,
  'claude-sonnet-5': SONNET_5,
  'claude-haiku-4-5': HAIKU_4_5,
  'claude-haiku-4-5-20251001': HAIKU_4_5,
  'claude-haiku-5-5': HAIKU_5_5,
  'cerebras/qwen-3.8-27b': QWEN_3_8_27B_CEREBRAS,
};

export class UnpricedModelError extends Error {
  constructor(public readonly model: string) {
    super(`no price for model "${model}" — add it to lib/llm-pricing.ts (never priced as $0)`);
    this.name = 'UnpricedModelError';
  }
}

export function isPriced(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICES, model);
}

export function assertPriced(model: string): void {
  if (!isPriced(model)) throw new UnpricedModelError(model);
}

type Tokens = Pick<LlmUsage, 'model' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>;

// USD for one call. inputTokens is the uncached remainder (as the API reports it).
export function costOf(u: Tokens): number {
  const p = MODEL_PRICES[u.model];
  if (!p) throw new UnpricedModelError(u.model);
  const read = u.cacheReadTokens ?? 0, write = u.cacheWriteTokens ?? 0;
  const prompt = u.inputTokens + read + write;
  const r: Rate = p.longPrompt && prompt > p.longPrompt.overTokens ? p.longPrompt : p;
  return (u.inputTokens * r.in + read * r.cacheRead + write * r.cacheWrite + u.outputTokens * r.out) / 1e6;
}
