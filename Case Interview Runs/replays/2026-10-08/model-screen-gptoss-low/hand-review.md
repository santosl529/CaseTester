# gpt-oss-120b (Cerebras) at reasoning low — interviewer screen, and failure modes vs Qwen 3.8 27B (8 Oct 2026)

Screening, not a benchmark. One reviewer, every output read in its delivered form (`delivery-review-model-ab.md`).

## Run
`gpt-oss-120b`, `reasoning_effort: "low"` (its lowest — no "none"), same prompt, schema, guards and 26 turns as the Qwen screens; adapter layout unchanged from the 7 Oct gpt-oss experiment (state as a trailing system message). Twice per turn; Sonnet reused from the Qwen-none screen (`REPLAY_BASE_FROM`). Price $0.35 in / $0.75 out per MTok (inference-docs.cerebras.ai/models/openai-oss, 8 Oct; added to `lib/llm-pricing.ts`).
- First attempt stopped after 2 turns: a 429 with a ~50s retry-after, which the timings didn't exclude (`run-aborted-429.log`). Fixed (`f0527f3`: a 429 wait is now marked as a rate wait) and rerun at `CEREBRAS_RPM=20`; still 11 server 429s (~59s each), all excluded from timings — gpt-oss on this account is limited per minute well below Qwen's 450 RPM.
- Spend: $0.104 of $0.25 (61 calls: 5 aborted run, 52 screen, 4 guard-B regenerations).

`LLM_BUDGET_USD=0.25 LLM_BUDGET_FILE=<out>/budget.jsonl CEREBRAS_RPM=20 REPLAY_ARM=model-ab REPLAY_MODELS=gptoss-low REPLAY_BASE_FROM=<qwen38 screen>/replay-results-model-ab.json REPLAY_EXTRA_BATCHES=batch-11-oct-06,batch-17-oct-07-luna REPLAY_OUT=<out> npx tsx --env-file=../../../.env.local scripts/replay-output-format.ts --limit 20`

## Results
**Latency:** first useful content 0.27s median, 0.43s p90 (per call 0.26s / 0.39s, max 1.5s), faster than Sonnet on 26/26; first relevant spoken text 0.26s (never from `say` — it is always a bare acknowledgment). Reasoning median 69 tokens (p90 160, max 585); 0 output-cap hits.
**Accuracy:** 0 parse failures, 0 unknown ids; guard B regenerated 4/52 (Qwen none 2, low 0). Substantive data outcomes differ between its two runs on 14/26 (by hand 12 substantive, 1 minor, 1 equivalent — Maya t9 cost lines vs the exhibit that shows them).
**Faults (hand-read):** raw 38/52 (73%); reaching the candidate ~34/52 (65%) — the pressure-test gate holds Destiny t14 run 2's premature release, and the probe-replacement and request-fulfilment code probably correct Devon t4 run 1 and Derek t6 ×2 (judge-dependent).

## Comparison on the 24 turns all arms completed
| | first useful median / p90 | faults reaching the candidate | data outcome differs run to run (substantive) | invented figures reaching candidate |
|---|---|---|---|---|
| Sonnet 5.5 (historical) | 1.90s / 2.77s | 5/24 (21%) | — | 0 |
| Haiku 5.5 (8 Oct, 26 turns) | 1.25s / 2.25s | 25% | 10/26 raw | 0 |
| Qwen 3.8 27B, none | 0.58s / 1.28s | 27/48 (56%) | 12/24 | 0 (1 withheld) |
| Qwen 3.8 27B, low | 1.14s / 3.09s | 17/48 (35%) | 4/24 | 1 |
| **gpt-oss-120b, low** | **0.27s / 0.38s** | **31/48 (65%)** | 10/24 | 0 |

## Failure modes, side by side (counts are outputs, roughly; one output can carry several)
| Mode | gpt-oss low | Qwen none | Qwen low |
|---|---|---|---|
| **Not engaging with what the candidate said** — generic template question ("Please outline the framework…", "Is that framework MECE — what's missing?") right after the candidate answered exactly that | **~15** (Maya t3 ×2, Devon t4 ×2, Derek t6 ×2, Nikhil t6/t14/t24 ×5, Maya t27 ×2, Maya t33 ×2) | ~5 (loop re-asks on Nikhil; off-target scoping question) | ~1 |
| Unasked releases / promises | ~12 (Destiny t20 ×2, Maya t7, Jasmine t8, Jasmine t6, Maya t27 ×2, Claire t8 ×2 exhibit, Nikhil ×3, Connor t2) | ~10 | 2 |
| Ignored explicit asks | 6 (Devon t10 ×2 — no refusal; Nikhil ×4) | 6 | 1 (a fallback turn) |
| False refusal of held data | **2** (Nikhil t2 run 1: "I don't have full cost breakdown, … number of locations…, average ticket size"; Maya t7 run 1: "I don't have framework for analysis") | 1 (Connor t2) | 0 |
| Rigor: doubts correct work / misses the real error | 4 (Hugo t8 ×2 "points of what" on his correct conversion while the unsupported 30% / 25% assumptions go unprobed; Derek t10 ×2 misses the COGS-vs-revenue base) | 5 (incl. Hugo t8 ×2 doubted, Derek t10 ×2 missed) | 0 — units probes landed on Derek, Claire, Hugo |
| Grading in say | **0** | 4 | 10 |
| Attributing things not said | 2 (Hugo t16) | 1 | 3 |
| Invented case data | 0 | 1 (withheld) | 1 (reached) |
| Reliability | 4 guard-B regenerations; 429s (account) | 2 regenerations | 7/48 output-cap hits, 1 fallback |

**Character of each model:**
- **gpt-oss low** is fast, terse and stance-clean (no grading, no invented numbers, `say` is always a bare acknowledgment), but it **doesn't read the turn**: it asks its stock questions regardless of what was just answered, releases or refuses data loosely (two false refusals of data the case holds), and its probes miss the real error. This reproduces the 7 Oct hand read (59 turns at low: "ignores the candidate's message on ~20 turns"), and at medium and high reasoning on 7 Oct it still "asks Tobias for the framework he just gave" and repeated one question 5× to a stuck candidate — more compute did not fix the comprehension.
- **Qwen none** engages with the content but has poor data judgment and shaky math checking; **Qwen low** shows that the same weights *can* do the rigor (units probes, no doubted math, request handling close to Sonnet) — its remaining faults are mostly stance (grading, attribution), which are policy/style.

## Which is better suited to fine-tuning?
**Qwen 3.8 27B, trained to run without reasoning**, with one condition on serving (below). Confidence: moderate — two screens of 24–26 turns, one reviewer, no training run.

Why Qwen:
1. **Its faults are the trainable kind.** Fine-tuning reliably changes policy and style (stop grading, follow the data-declaration rules, don't promise unasked items); it is much less reliable at adding comprehension a model lacks. Qwen-low demonstrates the capability is in the weights; the job is to get it without the reasoning tokens — a standard distillation setup (prompt → final JSON turn, no reasoning in the target). gpt-oss's dominant failure (not engaging with the candidate's message) persisted at medium/high reasoning on 7 Oct, which points to a capability limit at 5.1B active parameters rather than a policy gap.
2. **The training data fits Qwen's no-reasoning mode directly.** Our supervision would be the logged Sonnet turns (thinking off — final JSON only) filtered by hand review, plus code-derived labels for the data fields (`decideData` outcomes, guard B, the gate). gpt-oss only runs with a reasoning channel (harmony format), so training it on traces-free targets means inventing or stripping the analysis channel — workable but less clean.
3. **Tooling:** a 27B dense model is a routine LoRA/QLoRA job on one or two 80GB GPUs; gpt-oss-120b (MoE, MXFP4) wants a full H100 node and its LoRA support is less mature (e.g. NeMo Customizer: no sequence packing with LoRA for gpt-oss). Both are Apache 2.0.

Why not decided yet — the serving condition:
- **A fine-tune only keeps Cerebras speed on a Cerebras dedicated endpoint** ("custom weights must use the same architecture"; enterprise, contact sales, pricing unpublished). Multi-LoRA is a private preview for dedicated-endpoint customers. Off Cerebras, a 27B dense model on GPUs would very likely lose the speed advantage that motivates this (I have not measured it), while gpt-oss's 5.1B active parameters would stay fast — **if Cerebras dedicated is not available at pilot scale, the speed case for fine-tuning either model weakens, and gpt-oss becomes the more practical self-hosted option despite the worse ceiling.**
- The bar is Haiku 5.5 off the shelf: 1.25s and ~25% faults with no training. A fine-tune has to beat that on served latency and on a hand-read screen to be worth its cost.

Suggested next step (not started, needs your decision): ask Cerebras whether a dedicated endpoint (or Multi-LoRA) for `qwen-3.8-27b` is available at pilot scale and at what cost — before any data preparation or training spend.
