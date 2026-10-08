# Background classifiers: Haiku 4.5 → Haiku 5.5 — spec (8 Oct 2026)

**Why.** Haiku 5.5 is ~10× cheaper ($0.10 / $0.50 per MTok vs $1 / $5) and on the pressure-test judge it was a little faster (686 vs 748ms median) with no false unlocks where 4.5 had two (one pass each, `Case Interview Runs/replays/2026-10-08/model-screen-haiku55/hand-review.md`). The coverage classifier alone cost ~$0.16 per 30-turn run on 4.5. Each background role migrates on its own, after a targeted regression check passes and Lorenzo approves the switch. The interviewer is not part of this (Sonnet 5.5; Haiku 5.5 as interviewer was screened separately).

## 1. Scope — the remaining Haiku 4.5 calls
| Role | Where | When it runs | On the speech path? |
|---|---|---|---|
| `probe_judge` (answer judge + structure check) | `lib/orchestrator/pressure-test.ts` | while the pressure test is awaiting / before a code-asked probe | yes — read before the data line (3s timeout, fails closed) |
| `distress` (C5 model layer) | `lib/orchestrator/distress.ts` | every candidate message, beside the interviewer call | yes — a distress verdict discards the draft |
| `hint_check` | `lib/orchestrator/hint-check.ts` | rung 2–3 turns whose delivery rests on a question (rare) | yes — awaited in Settle |
| `data_request` | `lib/orchestrator/data-requests.ts` | after every exchange (post-turn), plus rec-ask turns | no (background; rec-ask turns synchronous) |
| `coverage` | `lib/scoring/coverage.ts` | after every turn (post-turn) | no (background) |

The opener (`lib/agent/opener.ts`) is an unused experiment — out of scope, left on 4.5.

## 2. Settings (verified 8 Oct against the Haiku 5.5 migration guide and the effort and pricing docs)
`claude-haiku-5-5`; `thinking: {type: "disabled"}` sent explicitly (thinking is on by default and would spend the small `max_tokens`; disabled is accepted at effort high or below); `output_config.effort: "medium"` (its default; `low` is a later latency experiment, not part of this migration); `max_tokens` ×1.3 (same text ≈ 30–40% more tokens — measured 53k vs 38k on the judge sets); no `temperature`/`top_p`/`top_k`, no prefill (none used today), no server-side fallback (Haiku 5.5 has none; these calls never used one); text read by block type. One helper: `backgroundRequest()` in `lib/models.ts`. Role ids live in `BACKGROUND_MODEL_ID` (all still Haiku 4.5); migrating a role = changing its line.

## 3. Cost accounting and run budget (prerequisite, done 8 Oct)
- `lib/llm-pricing.ts`: one price table by exact model id (dated ids included, cache read/write, Haiku 5.5's >100k-prompt tier). An unknown id throws — never $0, never another model's rate.
- `lib/anthropic-client.ts` + `lib/llm-meter.ts`: every Anthropic call (app, background, scoring, candidate simulator, eval scripts) goes through one metered client; with a budget installed each call is checked before sending and recorded from the API's own usage (JSON and SSE; aborted streams from their input counts plus an estimated output, flagged).
- `lib/llm-budget.ts`: every paid script requires `LLM_BUDGET_USD`; `LLM_BUDGET_FILE` shares one cap across a batch's parallel processes. At the cap further calls are refused (`BudgetExceededError`); live-run stops and still writes its records. Overshoot is bounded by the calls already in flight. Non-Anthropic adapters (Luna, Sol, Gemini, Cerebras) are refused under a budget until a verified price and metering are added.

## 4. Regression checks — fixed inputs, the interviewer never called
All through the production function with an explicit model (`scripts/eval-background.ts`, `scripts/eval-probe-judge.ts`, `scripts/eval-distress.ts`). Latency is measured per call (lightly loaded, 6–8 concurrent).

| Role | Inputs | Arms | Pass if (Haiku 5.5 vs 4.5) |
|---|---|---|---|
| probe_judge | dev (33) + frozen held-out (47) labelled sets | 5.5 ×2, 4.5 ×1 (plus today's pass each) | false unlocks ≤ 4.5's on both sets; no-verdicts 0; false rejections reported (they cost one extra turn, not a leak); p90 latency < 1.5s |
| distress | 26-item acceptance corpus (16 distress, 10 controls); 271 real candidate messages (every message 4.5 labelled other than `none` + a fixed sample of `none`, batches 5–17), against 4.5's logged labels | corpus: both ×1; real: 5.5 ×2 | corpus 0 failures (the existing acceptance bar); no missed 4.5 distress/risk fire; every new fire hand-read — passes only if each is defensible (posture: overreacting beats underreacting); p90 ≤ 1.0s (it must beat the interviewer's first content) |
| hint_check | hand-labelled set, 17 real rung 2–3 turns + 4 synthetic (`tests/fixtures/hint-check-labels.json`) | both ×2 | accuracy ≥ 4.5's; false "hint" (ladder advances wrongly) ≤ 4.5's; p90 ≤ 1.0s |
| data_request | 80 real exchanges (half with requests), production post-turn path, against 4.5's logged classification (count, explicit, ledger ids, response) | 5.5 ×2 | every disagreement on "any explicit ask" or ledger ids hand-read; fail if 5.5 is wrong more often than 4.5 on those, or invents an explicit ask 4.5 correctly didn't (it would record a pending request) |
| coverage | 8 sessions (batches 12–14) at 25 / 60 / 100% of the transcript (24 points) | both ×2 | 5.5-vs-4.5 agreement on the end-gate decision (all ≥ 60) and on the below-threshold set (the steer) no worse than 4.5's agreement with itself; per-dimension |Δ| comparable to 4.5's own repeat |Δ| |

Baselines: distress and data_request use 4.5's logged outputs from runs whose prompts are unchanged since (no prompt edits to those files after 6 Oct); coverage and hint_check have no logged outputs, so 4.5 runs fresh.

## 5. Cost and order
Estimates (chars/4 tokens, ×1.35 for Haiku 5.5; measured where marked): probe_judge $0.070 (measured per pass today), distress $0.055 + corpus $0.014, data_request $0.036, coverage $0.164, hint_check $0.017 — **≈$0.36; cap $0.50** via one shared ledger file. Order: cheapest and most decisive first — probe_judge, hint_check, distress, data_request, coverage — each run reports its metered spend; the batch stops at the cap.

## 6. After the checks
Per role, a short result table and the hand-read disagreements go to `Case Interview Runs/replays/2026-10-08/background-haiku55/`. Roles that pass are proposed for migration (one line each in `lib/models.ts`); Lorenzo decides. Then one guarded live smoke run (budgeted) with the migrated roles before any batch. A role that fails stays on 4.5 with the reason recorded.

## 7. Status (8 Oct)
Built: §2 settings helper and per-role overrides (production requests unchanged, tested per role), §3 accounting and budget (tested, mutation-checked), §4 harnesses and the hint-check labelled set. Run 8 Oct (approved).

## 8. Results (8 Oct; `Case Interview Runs/replays/2026-10-08/background-haiku55/results.md`; metered $0.344 of the $0.50 cap)
- **Pressure-test judges — pass.** False unlocks 0.7 per pass (5.5) vs 2.0 (4.5); one consistent false rejection (5.5); no-verdicts 0; p90 < 1s.
- **Distress — pass.** Corpus 26/26 both; 271 real messages: no new fires, none missed; only `case_frustration` → `none` on 15 messages (label not used downstream); p90 0.93s.
- **Hint check — fail.** Two narrowing hints judged "no hint" in both runs (38/42 vs 42/42); stays on 4.5.
- **Data-request classifier — fail as configured.** With thinking disabled Haiku 5.5 sometimes writes its analysis before the JSON (26/160 unparseable); candidate fix: a JSON-schema structured output for this role on 5.5, then re-run.
- **Coverage — not a drop-in.** End-gate decision identical; the mid-case steer differs (5.5 scores early evidence much lower, so it lists communication, judgment and creativity as undertested earlier). Decide whether that is wanted; then an interviewer-in-the-loop check.
- Harness lessons: the classifiers fail open/closed, so a refused call reads as a null — the harnesses now fail fast on an unpriced id and stop at the cap; a budget refusal inside fetch is retried twice by the SDK (≈1.3s, no spend).

**Proposed:** migrate the pressure-test judges and distress (two lines in `lib/models.ts`) after a budgeted live smoke run; keep the hint check on 4.5; fix and re-check the data-request classifier; decide on coverage.

## 9. Switch and follow-up (8 Oct, later; `Case Interview Runs/replays/2026-10-08/background-haiku55-2/results.md`; metered $0.126 of a $0.30 cap)
- **Switched:** pressure-test judges and distress → Haiku 5.5 (`lib/models.ts`, commit a7baeba). Hint check and coverage stay on 4.5 (Lorenzo, 8 Oct).
- **Data-request classifier with enforced JSON (structured output on 5.5): not switched.** Parsing 0/160 failures and latency p90 1.96s pass; accuracy fails — on 45 hand-read disagreements 4.5 is better on 21, 5.5 on 9: 5.5 records plans as explicit asks, widens asks to extra ledger items and maps asks for data the case lacks onto items it has, which would let code fulfil requests nobody made. 5.5 does catch enumerated request lists 4.5 misses (Nikhil) — relevant to the request-persistence work.
- **Smoke (Sonnet interviewer):** distress fired on Leah's disclosure and nowhere else; the answer judge held two data-list replies; no no-verdicts; the distress verdict never delayed a turn.
- **Remaining judge errors (5.5):** one false unlock on a synthetic data list phrased as a gap (2 of 3 passes); one false rejection of a branch-pick-with-reason followed by data asks (3 of 3). Structure check error-free offline; not exercised in the smoke.
