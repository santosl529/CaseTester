# Qwen 3.8 27B (Cerebras) at reasoning low — interviewer screen (8 Oct 2026)

## Decision rule (written before any low result was read)
Comparison points from the same 26 turns: Haiku 5.5 first useful 1.25s median / 2.25s p90, delivered faults 25% (screen of 8 Oct morning); Qwen reasoning-none delivered faults (this file, §Delivery) and Sonnet's 23%.
- **Substantially faster than Haiku 5.5:** first useful median ≤ 0.95s (≥ 0.3s below Haiku) and p90 ≤ 2.25s.
- **Closes most of the quality gap:** delivered fault rate at or below the midpoint between Qwen-none and Sonnet (delivered), and no fault class that reaches the candidate and is worse than Sonnet's (false refusals of held data, invented figures, doubted correct math on both runs of a turn).
- Both → recommend a small multi-turn test. Either fails → stop this model path.
- The "+0.2s for reasoning" figure from the first screen is a hypothesis; it is checked against the measured reasoning tokens and first-reasoning → first-answer time.

(Results below.)

## Run
`qwen-3.8-27b`, `reasoning_effort: "low"` (accepted — the model page lists only none/high), same prompt, schema, guards and 26 turns as the reasoning-none screen; Qwen twice per turn; Sonnet **not re-run** — its outputs are the 8 Oct reasoning-none screen's fresh Sonnet calls (`REPLAY_BASE_FROM`, historical context, timed ~2h earlier).
**The run budget stopped it at 24 of 26 turns** ($0.353 metered of $0.35; Nikhil t24 and Connor t2 refused, 4 calls). Comparisons below use the 24 completed turns for every arm. Command:
`LLM_BUDGET_USD=0.35 LLM_BUDGET_FILE=<out>/budget.jsonl CEREBRAS_RPM=400 REPLAY_ARM=model-ab REPLAY_MODELS=qwen38-low REPLAY_BASE_FROM=<none screen>/replay-results-model-ab.json REPLAY_EXTRA_BATCHES=batch-11-oct-06,batch-17-oct-07-luna REPLAY_OUT=<out> npx tsx --env-file=../../../.env.local scripts/replay-output-format.ts --limit 20`

## Latency (24 turns, mean of 2 per turn; reasoning-none from the 8 Oct screen on the same 24 turns)
| | first useful median | p90 | first token median | per-call first useful p90 / max | calls > 2.5s |
|---|---|---|---|---|---|
| Qwen low | **1.14s** | **3.09s** | 1.08s | 4.07s / 6.29s | 11/48 |
| Qwen none | 0.58s | 1.28s | 0.51s | 1.49s | 1/48 |
| Sonnet (historical) | 1.90s | 2.77s | 1.08s | — | — |
| Haiku 5.5 (8 Oct, 26 turns) | 1.25s | 2.25s | — | — | — |

- **Low − none, paired: +0.70s median (p10 −0.49s, p90 +2.61s), slower on 19/24.** The "+0.2s" hypothesis is refuted.
- **First relevant spoken text** (pre-registered definition in the harness): median 1.18s, p90 4.04s per call; a substantive `say` sentence came before the data line or question on only 14/48 calls — `say` is mostly an acknowledgment, so first relevant ≈ first useful. (Not measured for reasoning-none: that run predates the metric.)
- **Reasoning tokens** per turn: median 600, p90 3,800, max 3,924 (all 48 calls reasoned; output median 716 tokens). First reasoning chunk → first answer token: median 0.50s, p90 1.05s on the 41 single-attempt calls.
- **Reasoning ran past the output cap on 7/48 calls (15%)**: the first attempt spent the adapter's whole `max_completion_tokens` (2,048, `CEREBRAS_MAX_TOKENS` default — unchanged from the gpt-oss experiment) on reasoning without finishing the JSON, and the adapter regenerated ("not a complete JSON object"). These are the 3.4–6.3s outliers (Claire t8 ×2, Nikhil t6 ×2, Hugo t8, Jasmine t6, Nikhil t14); their reasoning-token figures are the two attempts summed. Nikhil t6 run 1 hit the cap on both attempts and fell back to code's neutral turn. A higher cap would remove the retry but not the length: ~2,000+ reasoning tokens alone is ≥1.1s at the stated ~1,850 tok/s, before the answer — "low" does not bound reasoning.
- Speed criterion: **fails** (1.14s > 0.95s; p90 3.09s > 2.25s). Not faster than Haiku 5.5 in the tail.

## Accuracy (automated)
**8 incomplete attempts on 7/48 calls** (output cap reached while reasoning; 7 regenerations, 1 turn lost to the neutral fallback — Nikhil t6 run 1); 0 unknown ids; 0 guard-B regenerations (none: 2). Raw request decisions differ run to run on 11/24; **substantive data outcomes** (decideData: released / exhibit / promised / offered / refused) differ on 8/24, of which by hand: substantive 4 (Destiny t14 unasked release vs none; Jasmine t8 release vs none; Nikhil t6 ignores every ask vs answers them; Hugo t12 exhibit vs none — both acceptable), minor 3 (Hugo t8 offer vs release of other inputs; Nikhil t14 revenue per store promised or not; Devon t4 a correct refusal of below-the-line items in one run), mapping only 1 (Nikhil t2 "revenue by location versus total" → revenue_total or not). Reasoning-none on the same review: 14/24 substantive (see its hand review). Vetoes: provenance 2, data_talk 1, meta_leak 1.

## Interviewing quality (hand-read, 48 outputs)
| | raw faults | reach the candidate |
|---|---|---|
| **Qwen low** | 18/48 (38%) | **17/48 (35%)** |
| Qwen none (same 24 turns) | 29/48 (60%) | 27/48 (56%) |
| Sonnet (historical, same 24 turns) | 5/24 (21%) | 5/24 (21%) |
| Haiku 5.5 (8 Oct, 26 turns) | 31% | 25% |

Reaching the candidate = Settle's vetoes and decideData applied (simulated per output in `delivery-review-model-ab.md`); the pressure-test gate is judged by hand. Withheld before delivery: Devon t10 run 2's false data promise in `say` (data_talk). Hugo t16 run 2's "You flagged elasticity" was withheld (meta_leak), but the misattributed 10% price rise in the question still reaches the candidate.

Qwen low, faults that reach the candidate:
- **Grading in say (10):** "Right, that's a reasonable split." (Maya t3), "That's a solid refinement." / "Right, that's cleaner." (Devon t4), "Right, that's a clean decomposition." (Destiny t20), "That math is clean." (Jasmine t8), "You're close." (Maya t27), "The sizing is clean." (Devon t10 — on a $44M figure that doesn't follow), "The framework covers the main bases." / "That covers the gaps." (Derek t6), "Menu prices held flat, so the pass-through finding is confirmed." (Hugo t12, states the finding). The dominant fault — 2.5× reasoning-none's 4.
- **Invented case data reaching the candidate (1, serious):** Derek t10 run 1 writes "coffee beans are 42% of COGS, up from 34%… other inputs have gone up 3 points of revenue" (ledger: 25% of COGS; +37.5%). Provenance withholds the first sentence (34 is unsourced), but **"other inputs… up 3 points of revenue" and "beans at 42% of COGS" pass** — 3 and 42 appear elsewhere in the conversation — and are spoken next to the true released values.
- **Attribution of things the candidate didn't say (3):** Hugo t16 both runs (elasticity, phasing, a 10% price rise — none in Hugo's answer; Sonnet attributes a price recommendation here too), Maya t31 run 1 (asks for the risk of raising prices as if chosen).
- **Request handling (3):** unasked release Destiny t14 run 1 (the gate would hold it silently, leaving a question about "your three cost lines" she hasn't seen); Jasmine t8 run 1 (Sonnet did the same); Nikhil t6 run 1 — not the model's words: both attempts hit the output cap and code's neutral fallback ("What would you like to explore next?") ignored all nine asks (6.3s).
- None: doubted correct math (none had Hugo t8 ×2), invented figures in the question, false refusals.

Qwen low, good: units probes on Derek t10 run 2 ("size the bean component as a percentage of revenue"), Claire t8 both runs ("points of what?" — where Sonnet doubted correct math), Hugo t8 both (the 25% base; the flat-ticket assumption behind his correct 38%), Jasmine t6 run 1 (recommendation before the driver is confirmed), Maya t27 run 1 (cents-per-dollar scaffold). Request handling is close to Sonnet's: 0 regenerations, Nikhil t2/t14 handled like Sonnet.

## Verdict against the decision rule
- Speed: **fails** — 1.14s median / 3.09s p90 vs the bar of 0.95s / 2.25s; low is slower than reasoning-none on 19/24 turns and has a long tail (11/48 calls > 2.5s, max 6.3s). Robustness: even dropping the 7 cap-hit calls entirely (a best case — a higher cap would make them single long attempts, not remove them), the per-call figures are 0.99s median / 2.23s p90 with 4/41 over 2.5s — still not below 0.95s and no better than Haiku 5.5's tail. The verdict is closer than the headline but holds.
- Quality: the delivered fault rate (35%) sits just under the midpoint of none (56%) and Sonnet (21%), i.e. 38.5% — but n is small, and a worse-than-Sonnet class reaches the candidate (invented case data on Derek t10), so **fails** the second clause.
- **Stop this model path.** No multi-turn test.

## Spend (metered, `budget.jsonl`)
$0.353 of $0.35 (overshoot $0.003, one call in flight): Qwen 56 calls $0.338 (48 screen calls + 7 cap-hit regenerations + 1 smoke), Sonnet smoke 1 call $0.015 (unintended — `--smoke` runs every arm; a cache write, not the $0.005 I quoted). Estimate was ~$0.27; low's output (median 716 tokens, up to 2,048 per attempt, plus the 7 regenerations) was well above what I assumed.

## Side finding (affects every model)
The provenance check verifies that each number appears somewhere allowed, not that it is attached to the right quantity — "beans at 42% of COGS" passes because 42% (COGS share of revenue) is allowed. Reported as an open item in the PRD §15; no fix made.
