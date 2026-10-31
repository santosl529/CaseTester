// PRD §9/§13: instrument $/completed case from the first session. Every
// LLM-calling module reports token usage through an optional onUsage callback
// (the caller decides where it goes — lib/analytics.ts's logEvent in prod,
// nothing in tests). Raw tokens + model id are logged, not dollars: pricing
// changes out-of-band, so cost is computed at analysis time from the tokens.
export type LlmUsage = {
  // 'ask_check': the item-less ask check (turn-data.ts checkAsk → classifyAsk), apart from
  // 'data_request' (the message classifier, post-turn, scoring) for its cost per session.
  component: 'interviewer' | 'judge' | 'verifier' | 'coverage' | 'data_request' | 'ask_check' | 'reconcile' | 'plain_feedback' | 'distress' | 'hint_check' | 'opener' | 'probe_judge' | 'structure_judge' | 'conduct' | 'math_checker' | 'equation_extractor' | 'ask_judge';
  model: string;        // the model requested
  // The model the API says answered (response.model). Differs from `model`
  // when a server-side fallback re-ran the request on another model. Recorded
  // by the interviewer adapter; evaluations fail on a mismatch
  // (lib/eval/model-guard.ts).
  actualModel?: string;
  inputTokens: number;
  outputTokens: number;
  // Prompt caching (interviewer): input tokens read from / written to cache.
  // inputTokens counts only the uncached remainder.
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  // Reasoning tokens, where the provider reports them — already counted in
  // outputTokens (Cerebras/OpenAI completion_tokens_details).
  reasoningTokens?: number;
  // The ask check only: the ask it checked, and `late` when the call settled after the
  // turn stopped waiting (its 1.5 s cap) — spent all the same, logged on settling.
  ask?: string;
  late?: true;
  // The message classifier ('data_request') started only because row 11's cue made a sentence ask (round 6 Task 76 (c);
  // turn-data.ts classifyMessage): `cue: 'want_is'`, and the call's own latency — reported per session by
  // lib/eval/check-cost.ts (Lorenzo, 21 Oct, round 6 rulings, 2).
  cue?: 'want_is';
  latencyMs?: number;
};

export type OnUsage = (usage: LlmUsage) => void;
