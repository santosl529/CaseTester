// PRD §9/§13: instrument $/completed case from the first session. Every
// LLM-calling module reports token usage through an optional onUsage callback
// (the caller decides where it goes — lib/analytics.ts's logEvent in prod,
// nothing in tests). Raw tokens + model id are logged, not dollars: pricing
// changes out-of-band, so cost is computed at analysis time from the tokens.
export type LlmUsage = {
  component: 'interviewer' | 'judge' | 'verifier' | 'coverage' | 'data_request' | 'reconcile' | 'distress' | 'hint_check';
  model: string;
  inputTokens: number;
  outputTokens: number;
  // Prompt caching (interviewer): input tokens read from / written to cache.
  // inputTokens counts only the uncached remainder.
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type OnUsage = (usage: LlmUsage) => void;
