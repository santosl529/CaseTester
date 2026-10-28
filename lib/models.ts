// Model choices for every Claude call in the product, in one place (switched
// 2 Oct 2026, Lorenzo's call). The cheap classifiers (coverage, data requests,
// distress, hint check) stay on Haiku 4.5 and are configured in their modules.

// Live interviewer: Sonnet 5.5 without thinking again since 12 Oct 2026
// (Lorenzo's call, after batch 20: Sonnet 20.7 D1–D9 faults per 100 turns vs
// Haiku 5.5's 32.7, same serious failures) — the `sonnet55-baseline` config
// below. History: Haiku 5.5 11–12 Oct (latency), Sonnet 5.5 (early Oct),
// Opus 4.8 (July), Haiku 4.5 (dropped in July for missing live math errors;
// the deterministic math backstops — recompute, verified figures, unit check —
// now carry most of that load). Haiku 5.5 stays selectable:
// INTERVIEWER_PROVIDER=anthropic-haiku55-none-medium, or the eval configs.
export const INTERVIEWER_MODEL_ID = 'claude-sonnet-5-5';

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
  // Haiku 5.5, thinking disabled, effort medium, no server-side fallback
  // (Haiku 5.5 has none). The pilot interviewer 11–12 Oct.
  'haiku55-thinking-off': { model: 'claude-haiku-5-5', thinking: 'disabled', effort: 'medium', fallbacks: false },
  // Sonnet 5.5 with thinking off (between_tools), fallbacks on — the batch-18
  // baseline and, since 12 Oct, the production default (INTERVIEWER_MODEL_ID).
  'sonnet55-baseline': { model: 'claude-sonnet-5-5', thinking: 'between_tools', fallbacks: true },
  // Batch 20's third arm (12 Oct, Lorenzo): the pilot interviewer at effort
  // low — the replay showed no first-token gain on 8 turns; the head to head
  // measures it on whole interviews. Production stays at medium.
  'haiku55-effort-low': { model: 'claude-haiku-5-5', thinking: 'disabled', effort: 'low', fallbacks: false },
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
  // New role (11 Oct, round-3 fix 4): the conduct backstop and tiebreaker
  // (lib/orchestrator/conduct-model.ts), on the distress screen's model. Not
  // yet evaluated on real messages — its labelled check is in the proposed
  // validation set.
  conduct: 'claude-haiku-5-5',
  // New role (27 Oct, item E's asynchronous variant, switch `checkerEquationsAsync`):
  // the equations and answer sheet transcribed from the candidate's message alone
  // (lib/orchestrator/equation-extractor.ts). A transcription job with no case in the
  // prompt, so it is the smallest call in the system; it runs in parallel with the math
  // checker, whose prompt it leaves byte-identical. Not yet evaluated on real messages
  // beyond the 16-message latency pair of 27 Oct.
  equations: 'claude-haiku-5-5',
  // New role (27 Oct, Lorenzo's step 3): the background item judge for asyncAskJudge (lib/orchestrator/ask-judge.ts),
  // the model measured in design §19 and §26 (Sonnet 5.5, thinking off via between_tools, effort low, fallbacks on).
  ask_judge: 'claude-sonnet-5-5',
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

// The background math checker (math checker step 2, 13 Oct): a model reads
// each candidate message that states a quantitative claim against the full
// case and returns a verdict per claim (lib/orchestrator/math-checker.ts).
// Two arms under evaluation, same claims; neither is live until Lorenzo picks
// one from the paid evaluation (scripts/eval-math-checker.ts). Settings
// checked against the API docs (13 Oct): adaptive thinking on both (Opus 5.5
// can't disable it; Sonnet 5.5's thinking-off switch would cost the
// arithmetic); effort medium on both — Opus 5.5's default, set explicitly
// (scoring runs Opus at high); server-side fallbacks on.
export type MathCheckerConfig = { model: string; effort: 'low' | 'medium' | 'high' };
export const MATH_CHECKER_CONFIGS: Record<string, MathCheckerConfig> = {
  'sonnet55-medium': { model: 'claude-sonnet-5-5', effort: 'medium' },
  'opus55-medium': { model: 'claude-opus-5-5', effort: 'medium' },
};
export function mathCheckerConfig(name: string): MathCheckerConfig {
  const c = MATH_CHECKER_CONFIGS[name];
  if (!c) throw new Error(`unknown math checker config "${name}" (have: ${Object.keys(MATH_CHECKER_CONFIGS).join(', ')})`);
  return c;
}

// Drills checklist grader (docs/prd-drills.md "Checklist grading call"): the
// cheapest model that meets the 90% agreement gate on the golden sets.
export const DRILL_GRADER_MODEL_ID = 'claude-haiku-4-5';
// Per million tokens, for the grading spend ledger.
export const DRILL_GRADER_PRICE = { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 };

// Candidate graders for the model comparison (2026-10-16; scripts pick one
// with DRILL_GRADER_MODEL outside production). Prices per million tokens,
// cache writes at the 5-minute rate. Thinking is off on all three, as on Haiku
// 4.5 today: Sonnet 5.5 rejects {type: "disabled"} and takes "between_tools";
// neither newer model accepts a non-default temperature, so only Haiku 4.5
// keeps 0. No server-side refusal fallback on any of them: it re-runs some
// declined requests on a model that isn't approved for grading (cost
// safeguards, Matt 2026-10-18).
export type GraderModel = 'claude-haiku-4-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
// rulesInSystem: the drill's grading rules go into the cached system prompt.
// Only for models that can cache a prompt this short (512 tokens); on Haiku
// 4.5 (4,096) moving them gained nothing and cost four checks in the gate.
export const DRILL_GRADER_MODELS: Record<GraderModel, { price: typeof DRILL_GRADER_PRICE; temperature?: number; thinking?: { type: 'disabled' | 'between_tools' }; rulesInSystem?: boolean }> = {
  'claude-haiku-4-5': { price: DRILL_GRADER_PRICE, temperature: 0 },
  'claude-sonnet-5-5': { price: { input: 2, output: 10, cache_write: 2.5, cache_read: 0.2 }, thinking: { type: 'between_tools' }, rulesInSystem: true },
  'claude-haiku-5-5': { price: { input: 0.1, output: 0.5, cache_write: 0.125, cache_read: 0.01 }, thinking: { type: 'disabled' }, rulesInSystem: true },
};

// The approved model for each grading call, hard-coded (Matt, 2026-10-16,
// after the comparison; made the allowlist 2026-10-18): Haiku 4.5 everywhere
// except the HY-2 follow-up's two calls (data request; drop result and
// consistency), which Sonnet 5.5 grades. In production no other model may
// grade, and DRILL_GRADER_MODEL is ignored; elsewhere it forces one model for
// every call, for testing a candidate with one gate run.
export type GraderCall = 'default' | 'hy2_followup';
export const DRILL_GRADER_APPROVED: Record<GraderCall, GraderModel> = { default: DRILL_GRADER_MODEL_ID, hy2_followup: 'claude-sonnet-5-5' };
export const DRILL_GRADER_HY2_FOLLOWUP_MODEL: GraderModel = DRILL_GRADER_APPROVED.hy2_followup;

// The production deployment: Vercel's production environment (previews and
// local builds aren't), or NODE_ENV=production off Vercel.
export function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : process.env.NODE_ENV === 'production';
}

export function drillGraderModel(call: GraderCall = 'default'): GraderModel {
  const m = process.env.DRILL_GRADER_MODEL;
  if (!m) return DRILL_GRADER_APPROVED[call];
  if (isProductionDeploy()) {
    console.warn(`drills: DRILL_GRADER_MODEL=${m} is ignored in production`);
    return DRILL_GRADER_APPROVED[call];
  }
  if (!(m in DRILL_GRADER_MODELS)) throw new Error(`DRILL_GRADER_MODEL ${m} isn't one of ${Object.keys(DRILL_GRADER_MODELS).join(', ')}`);
  return m as GraderModel;
}

// Checked before every grading request: in production only the approved
// models, elsewhere any listed candidate. Anything else throws, unsent.
export function assertDrillGraderModel(model: string): asserts model is GraderModel {
  const allowed: string[] = isProductionDeploy() ? Object.values(DRILL_GRADER_APPROVED) : Object.keys(DRILL_GRADER_MODELS);
  if (!allowed.includes(model)) throw new Error(`drills: ${model} isn't an approved grading model (${allowed.join(', ')})`);
}
