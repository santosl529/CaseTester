// Model choices for every Claude call in the product, in one place (switched
// 2 Oct 2026, Lorenzo's call). The cheap classifiers (coverage, data requests,
// distress, hint check) stay on Haiku 4.5 and are configured in their modules.

// Live interviewer: Sonnet 5.5 without thinking — faster and cheaper than the
// Opus 4.8 it replaces, for the M2 latency budget. Haiku 4.5 was dropped in July
// for missing live math errors; the deterministic math backstops (recompute,
// verified figures, unit check) now carry most of that load.
export const INTERVIEWER_MODEL_ID = 'claude-sonnet-5-5';

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
