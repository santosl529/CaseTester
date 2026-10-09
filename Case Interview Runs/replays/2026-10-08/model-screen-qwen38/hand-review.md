# Qwen 3.8 27B (Cerebras) screening — interviewer (8 Oct 2026)

Screening, not a benchmark. Production stays Sonnet 5.5. One reviewer, every output read.

## Settings
`qwen-3.8-27b` on Cerebras chat completions (listed by `/v1/models`), `reasoning_effort: "none"` (the model's default is high), strict `json_schema` turn schema, streamed, no fallbacks. $0.99 in / $1.49 out per MTok (inference-docs.cerebras.ai/models/qwen-3.8-27b, 8 Oct); no cached price is published, so cached tokens are metered at the input rate. Account limits from the response headers: 450 RPM, 150K tokens/min — `CEREBRAS_RPM=400`, 0 client rate-limit waits. Adapter change: Qwen's chat template rejects a system message after the first (400 on the first smoke), so the turn state now joins the leading system message (`leading-system` layout, as Sonnet's prompt has it).

Command (worktree root):
`LLM_BUDGET_USD=0.90 LLM_BUDGET_FILE=<out>/budget.jsonl CEREBRAS_RPM=400 REPLAY_ARM=model-ab REPLAY_MODELS=qwen38-none REPLAY_EXTRA_BATCHES=batch-11-oct-06,batch-17-oct-07-luna REPLAY_OUT=<out> npx tsx --env-file=../../../.env.local scripts/replay-output-format.ts --limit 20`

Same 26 turns as the 7 Oct Luna/Sol/Gemini and 8 Oct Haiku 5.5 screens (20 stratified + 6 request-heavy). Guard B applied. Sonnet once per turn, Qwen twice, interleaved. Pressure-test gate not reconstructed (old records); its effect on premature releases noted by hand.

## Latency (first useful content)
| | median | p90 |
|---|---|---|
| Sonnet 5.5 (fresh, this run) | 1.90s | 2.77s |
| **Qwen 3.8 27B, reasoning none** | **0.61s** | **1.60s** |

Paired: −1.14s (p10 −2.24s, p90 −0.38s), faster on 24/26. First token −0.32s (faster 20/26; Qwen p90 1.56s — the long pole is time to first token, generation itself is near-instant); completion −1.38s, faster 26/26. Spikes: 2.0–3.0s on 5 of 52 calls (two are guard-B regenerations). For reference on the same 26 turns, separate runs: Haiku 5.5 1.25s, Luna-none ~0.92s (20 turns).

## Accuracy (automated)
- 0 errored calls of 52; 0 parse failures, 0 empty turns, 0 unknown ledger ids (no adapter regenerations).
- Guard B (explicit ask, no request declared) regenerated 2/52 (Sonnet 0/26).
- Quality flags: unsourced figure 3, question in say 1 (Sonnet: none).
- Request decisions differ between Qwen's own two runs on **18/26** turns (Haiku 5.5: 10/26); vs Sonnet 32/52.

## Interviewing quality (hand-read)
Outputs with ≥1 clear fault: **Sonnet 6/26 (23%) · Qwen 32/52 (62%)**, ~31/52 (60%) after the gate's deferral of premature releases.

Qwen faults by kind (some outputs have several):
- **Request handling (19):** unasked releases/deferrals 10 (Destiny t20 ×2 — up to 3 items + exhibit; Jasmine t8 ×2, run 2 a 7-entry incoherent list with duplicates; Jasmine t6; Claire t8 exhibit; Maya t23; Derek t6; Nikhil t6 duplicate deferrals; Nikhil t24 bean price); explicit asks ignored 6 (Maya t7 "price or customers?" — no request; Nikhil t6/t14/t14/t24 enumerated asks with no refusals declared; Connor t2 cost breakdown declared as a non-ledger item); over-deferral after the pressure test was answered 2 (Devon t4, Derek t6); premature release 1 (Maya t5, gate-held).
- **Math (5):** doubts correct math on Hugo t8 both runs (38% more cost per unit is right); misses Derek t10's units error both runs (Sonnet probed "expressed against revenue"); **invented a figure** — Maya t7 run 2 "Average ticket is up 2.1%" (ledger: $6.20 → $6.80, ~10%) plus interpreting it for the candidate ("that's not the story"). Production's provenance check would block that line.
- **Grading in say (4):** "That's a sharp read." (Hugo t6), "your math checks out" (Destiny t20), "Your reconciliation is exact." (Hugo t12), "That ties out… so the sizing is in." (Devon t10, validating a $44M figure that doesn't follow).
- **Conversation (7):** scoping question in reply to a structure (Maya t3); confusing double question (Destiny t14); offers a break right after the candidate said she wanted to keep going (Maya t23); attributes a price recommendation Hugo never made (t16 — Sonnet did too); re-asks "which branch / is it MECE" after Nikhil named the cost side (t14 ×2, t24) and once claims he hasn't named one (t24 run 2).

Qwen, good: Claire t8 run 2 units probe ("points of what?") where Sonnet doubted correct math; Maya t27 run 2 clean re-ask; Nikhil t2 both runs (refusals + deferrals + structure ask, like Sonnet); recommendation/wrap turns (Maya t31, t33) fine.

Sonnet (fresh) faults: doubts Claire t8's correct 42% × 1.38 step; attributes a price recommendation Hugo never made (t16); unasked releases (Jasmine t8, Derek t6 menu price, Nikhil t14 bean price, Nikhil t24 ticket/menu). In line with the 8 Oct screen (6/26).

## Spend (metered)
$0.448 of $0.90 (ledger `budget.jsonl`): Sonnet 28 calls $0.185 (2 smoke), Qwen 55 calls $0.263 (1 smoke, 2 guard-B aborts with estimated output); plus one unmetered 17-token header check (~$0.00002). Qwen ≈ $0.005/turn at ~4.6k input tokens — above Haiku 5.5 (~$0.0007) because no cache discount is published.

## Read
- Speed: the fastest interviewer screened so far (0.61s median to first useful content, −1.1s vs Sonnet).
- Quality: not viable as configured. The fault rate is ~2.7× Sonnet's and far above Haiku 5.5's 25%. The failures are in what the product depends on: data-request judgment (unasked releases, ignored asks, unstable decisions run to run), grading in say, and math checking (doubted correct math, missed a units error, one invented figure). The deterministic backstops catch some (provenance blocks invented figures, the gate holds premature releases, guard B forces a declaration) but not unasked releases, grading, or wrong math doubts.
- Untested: `reasoning_effort` low/medium (skipped at the user's call). At ~1850 tok/s, a few hundred reasoning tokens would cost ~0.2s, so a reasoning arm could still land under Haiku 5.5's 1.25s — the one cheap follow-up worth considering.
