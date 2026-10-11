// Model choices for every Claude call in the product, in one place (switched
// 2 Oct 2026, Lorenzo's call). The cheap classifiers (coverage, data requests,
// distress, hint check) stay on Haiku 4.5 and are configured in their modules.

// Live interviewer: Haiku 5.5 since 11 Oct 2026 (Lorenzo's call) — the model
// the voice pilot runs, first useful content ~1.25s vs Sonnet's ~2.1s on the
// 8 Oct screen. Before: Sonnet 5.5 without thinking (Oct), Opus 4.8 (July),
// Haiku 4.5 (dropped in July for missing live math errors; the deterministic
// math backstops — recompute, verified figures, unit check — now carry most of
// that load). Sonnet stays selectable: INTERVIEWER_PROVIDER=anthropic-sonnet55.
export const INTERVIEWER_MODEL_ID = 'claude-haiku-5-5';

// The interviewer request settings each model needs. Haiku 5.5: thinking
// 'disabled' (it rejects 'between_tools'), effort 'medium', no server-side
// fallback (it has none). Sonnet 5.5 (and any other id): 'between_tools' is its
// thinking-off switch, fallbacks on.
export function interviewerRequestOptions(modelId: string): { thinking: 'between_tools' | 'disabled'; effort?: 'low' | 'medium' | 'high'; fallbacks: boolean } {
  if (modelId === 'claude-haiku-5-5') return { thinking: 'disabled', effort: 'medium', fallbacks: false };
  return { thinking: 'between_tools', fallbacks: true };
}

// Named interviewer configurations for evaluations (11 Oct 2026): batch 18
// was meant to measure the pilot interviewer and ran on Sonnet 5.5, because
// the batch took whatever the default was that day. An evaluation names one of
// these (INTERVIEWER_EVAL_CONFIG / persona-batch --interviewer=); the model id
// and every request setting are explicit, and the run fails if the API answers
// from another model (lib/eval/model-guard.ts). Choosing one changes nothing in
// production or in any classifier or scoring role.
export type InterviewerEvalConfig = {
  model: string;
  thinking: 'between_tools' | 'disabled';
  effort?: 'low' | 'medium' | 'high';
  fallbacks: boolean;
};

export const INTERVIEWER_EVAL_CONFIGS: Record<string, InterviewerEvalConfig> = {
  // The pilot interviewer: Haiku 5.5, thinking disabled, effort medium, no
  // server-side fallback (Haiku 5.5 has none).
  'haiku55-thinking-off': { model: 'claude-haiku-5-5', thinking: 'disabled', effort: 'medium', fallbacks: false },
  // The batch-18 baseline: Sonnet 5.5 with thinking off (between_tools), fallbacks on.
  'sonnet55-baseline': { model: 'claude-sonnet-5-5', thinking: 'between_tools', fallbacks: true },
};

export function interviewerEvalConfig(name: string): InterviewerEvalConfig {
  const c = INTERVIEWER_EVAL_CONFIGS[name];
  if (!c) throw new Error(`unknown interviewer evaluation config "${name}" (have: ${Object.keys(INTERVIEWER_EVAL_CONFIGS).join(', ')})`);
  return c;
}

// Scoring: judge, claim verifier, and dimension reconciliation on Opus 5.5.
// Thinking is always on for this model (adaptive); its effort default is
// medium, so callers set it explicitly.
export const SCORING_MODEL_ID = 'claude-opus-5-5';

// Server-side refusal fallback: if the model's safety classifier declines a
// request, the API re-runs it on Anthropic's recommended model for that
// refusal category inside the same call (Sonnet 5.5: cyber and frontier-LLM
// declines retry on Sonnet 5; Opus 5.5: e.g. cyber → Opus 4.8). Claude API only
// — not Bedrock/Vertex/Foundry. Requires the beta messages endpoint.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01' as const;
export const FALLBACKS = 'default' as const;

// Interviewer on Cerebras (experiment, 7 Oct 2026): OpenAI's open-weight
// gpt-oss-120b on wafer-scale hardware — first token ~0.15–0.25s and
// ~1,500+ tokens/s reported, against Sonnet's ~1.3s first token on our prompt.
// Chosen over Qwen/GLM (Chinese-developed). Selected with
// INTERVIEWER_PROVIDER=cerebras; Sonnet stays the default until a hand-read
// replay shows it holds the interviewer rules.
export const CEREBRAS_INTERVIEWER_MODEL_ID = 'gpt-oss-120b';

// Background classifiers, by role (8 Oct). A role moves from Haiku 4.5 to 5.5
// only after its regression check against Haiku 5.5 passes (spec
// 2026-10-08-haiku-5-5-background-migration.md); migrating a role is changing
// its line here. Each classifier also takes an explicit `model` so the
// regression harnesses can call it on fixed inputs without switching anything.
// The opener (lib/agent/opener.ts) is an unused experiment and is not listed.
export const BACKGROUND_MODEL_ID = {
  coverage: 'claude-haiku-4-5-20251001',
  data_request: 'claude-haiku-4-5',
  // Switched 8 Oct after its regression check (corpus 26/26; 271 real messages:
  // no new or missed distress fires; p90 0.93s).
  distress: 'claude-haiku-5-5',
  hint_check: 'claude-haiku-4-5',    // stays: missed 2 narrowing hints in its check (8 Oct)
  // The pressure-test answer judge and the structure check. Switched 8 Oct:
  // false unlocks 0.7 per pass vs 4.5's 2.0; one consistent false rejection.
  probe_judge: 'claude-haiku-5-5',
} as const;

// Request settings for a background call on `model`. Haiku 5.5 (verified
// against its migration guide and the effort docs, 8 Oct): thinking is on by
// default, so it is disabled explicitly (accepted at effort high or below; it
// would otherwise spend the small max_tokens); effort medium, its default;
// max_tokens scaled for its tokenizer (~30% more tokens for the same text);
// no sampling params, no prefill, and no server-side fallback (it has none).
// Sonnet 5.5 rejects disabled thinking; between_tools is its off switch.
// jsonSchema (Haiku 5.5 only): enforce the reply's JSON with structured
// output — with thinking disabled Haiku 5.5 sometimes writes its analysis
// before the JSON (data-request check, 8 Oct: 26/160 unparseable).
export function backgroundRequest(model: string, maxTokens: number, opts: { jsonSchema?: Record<string, unknown> } = {}):
  { max_tokens: number; thinking?: { type: 'disabled' } | { type: 'between_tools' }; output_config?: { effort: 'medium'; format?: { type: 'json_schema'; schema: Record<string, unknown> } } } {
  if (model === 'claude-haiku-5-5') {
    return {
      max_tokens: Math.ceil(maxTokens * 1.3), thinking: { type: 'disabled' },
      output_config: { effort: 'medium', ...(opts.jsonSchema ? { format: { type: 'json_schema' as const, schema: opts.jsonSchema } } : {}) },
    };
  }
  if (model === 'claude-sonnet-5-5') return { max_tokens: maxTokens, thinking: { type: 'between_tools' } };
  return { max_tokens: maxTokens };
}
