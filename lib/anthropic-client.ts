// The one way the product and its scripts construct an Anthropic client, so
// every call passes through the run-budget meter (lib/llm-meter.ts). In
// production no budget is installed and the meter is a pass-through.
import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';
import { meteredFetch } from './llm-meter';

export function anthropicClient(options: ClientOptions = {}): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, ...options, fetch: meteredFetch(options.fetch ?? fetch) });
}
