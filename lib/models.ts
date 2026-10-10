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
// cheapest model that meets the 90% agreement gate on the golden sets. Haiku
// 4.5 is the first candidate; re-test cheaper models when they ship.
export const DRILL_GRADER_MODEL_ID = 'claude-haiku-4-5';
// Per million tokens, for grading_jobs.cost_usd.
export const DRILL_GRADER_PRICE = { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 };
