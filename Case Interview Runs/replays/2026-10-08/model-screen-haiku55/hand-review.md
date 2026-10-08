# Haiku 5.5 screening — interviewer and judge (8 Oct 2026)

Screening, not a benchmark. Production stays Sonnet 5.5; background classifiers stay Haiku 4.5. One reviewer.

## Settings (verified against the Haiku 5.5 migration guide, effort and pricing docs, 8 Oct)
`claude-haiku-5-5`, `thinking: {type: "disabled"}` (accepted at effort ≤ high; `between_tools` not used), `output_config.effort: "medium"` (its default), no `fallbacks` (Haiku 5.5 has no server-side fallback), no sampling params, structured output (turn schema) accepted. $0.10 / $0.50 per MTok (≤100k prompts), cache read $0.01. Same text ≈ 30–40% more tokens than Haiku 4.5 (measured 53k vs 38k on the judge sets).

## 1. Judge: Haiku 5.5 vs 4.5 (probe-answer judge + structure check), one pass each
Dev = `probe-judge-labelled.json` (prompts written against it; 27 probe / 6 structure). Held-out = `probe-judge-heldout.json` (frozen before any call; 31 probe / 16 structure; 11 synthetic hard negatives). One held-out label was corrected after the first run (truncated read by the labeller, noted in the fixture); both models are scored on the corrected label.

| | Haiku 5.5 | Haiku 4.5 |
|---|---|---|
| Dev probe, clear | 26/26 · false unlocks 0/9 | 25/26 · **false unlock 1/9** (loop-t15) |
| Dev structure | 6/6 | 6/6 |
| Held-out probe, clear | 28/29 · false unlocks 0/15 · false rejection 1/14 (Nikhil t13: picks the cost side with a reason, then a data list) | 28/29 · **false unlock 1/15** (synthetic: "Probably missing a few data points. One…") · false rejections 0/14 |
| Held-out structure | 16/16 | 16/16 |
| Borderline items | 3/3 | 3/3 |
| No verdict | 0 | 0 |
| Latency median / p90 / max | 686 / 944 / 1150ms | 748 / 1082 / 1395ms |
| Cost (80 calls) | $0.008 | $0.055 |

Read: Haiku 5.5 errs toward holding data (one false rejection); 4.5's errors are false unlocks on data-request lists — the failure the stricter prompt targets. n is small (one pass, ~1 error each); not enough to switch the background judge, but it is cheaper, a little faster, and never unlocked.

Live (prefix checks below, production judge = Haiku 4.5): it false-unlocked on the loop-t5 data list in 1/3 runs (passed it offline), and unlocked on loop-t15 (labelled not answered against the MECE probe) in the other 2/3 after five correct holds.

## 2. Interviewer screen: 20 standard turns + 6 request-heavy (`replay-model-ab.md`, `replay-results-model-ab.json`)
Same 20 stratified turns as the 7 Oct Luna/Sol/Gemini screens, plus 6 request-heavy (Nikhil b11 t2; b17 t6, t14, t24 — loop states; Derek b17 t6; Connor b17 t2). Same prompt, schema, guard B now applied in the replay (active on 8 Sonnet / 16 Haiku calls, regenerated 0). Sonnet once per turn, Haiku twice, interleaved. Pressure-test gate not reconstructed in the replay (old records); delivered effects of the gate noted by hand.

**Speed (first useful content):** Sonnet 2.09s median (p90 3.29s); **Haiku 5.5 1.25s (p90 2.25s), −0.80s paired, faster 26/26**; first token −0.44s (faster 22/26); completion −0.86s. (Luna-none on the 20: 0.92s.)

**Faults, by hand (outputs with ≥1 clear fault):** Sonnet 6/26 (23%) · Haiku 16/52 (31%), 13/52 (25%) once the production gate's deferral of premature releases is applied.
- Haiku: grading in say/question 4 (Connor t2 ×2 "Clear structure…", Destiny t20 "Your 16 points is the right place…", Hugo t12 "Your reconciliation holds"); unasked releases (Destiny t20, Jasmine t8 ×2 — Sonnet did the same on Jasmine t8, Nikhil t14 run 2 released 15 items + exhibit); premature releases before the pressure test (Nikhil t2, t6 ×2, Connor t2 ×2 — the gate defers these in production); missed the candidate's non-ledger ask (Devon t10 ×2); question contradicts data just released (Hugo t12 run 2); says the candidate didn't commit to a branch when he did (Nikhil t24 run 1); doubts correct math (Hugo t6 run 1); skips to the recommendation mid-brainstorm (Maya t23 run 1); over-deferral after the test was answered (Devon t4 run 1).
- Haiku, desirable-not-required: skipped Jasmine t6's $77M sizing check (both runs — Luna, Sol did too); states the units answer for Maya t27 (both — the logged Sonnet reply did too).
- Haiku, good: Derek t10 units probe both runs (Luna missed it), Maya t23 run 2 units probe, Hugo t8 assumption probes.
- Sonnet: grading in say (Hugo t12, Maya t23), unasked releases (Jasmine t8, Nikhil t14), a recommendation attributed that wasn't given (Hugo t16), **"The pressure test is answered." spoken in say** (Nikhil t24 — system language not caught by the vetoes).
- No narration, unsourced figures or leaks in any arm. Haiku's request decisions differ between its own two runs on 10/26 turns.

## 3. Prefix-seeded live checks, Haiku 5.5 interviewer (6 runs, `test runs/prefix-oct-08-haiku55-*`)
Same commands as the 7–8 Oct Luna checks (loop ×3 seeded through t4 from batch-17 Nikhil; early ×3 from the smoke opening), `--no-score`.
- **No gated data released before the pressure test was satisfied: 6/6.** No loop: during the awaiting stretch (loop-2/3 t6–t14) Haiku moved to substantive probes (price vs volume, which branch the data tests), the code re-ask fired once, duplicate probes were replaced.
- Early runs: probe asked once (early-1 re-asked once), never satisfied within the 4-line script (correct — the candidate never answered), so gated data stayed deferred.
- Guard B fired 0 times (Haiku declared requests on every explicit-ask turn).
- First useful content (whole turn, live, incl. code lines): normal turns median 1.47–1.53s on loop runs, 1.8–2.5s on the request-heavy early runs; fallback turns 1.1–2.5s. (Luna 7–8 Oct: 1.2–1.6s / 1.6–2.8s; Sonnet live baseline 2.13s.)
- Seen: long code-written refusal lists (7–8 items a turn — Nikhil's asks; system behaviour, same with Luna); one refusal repeated on consecutive turns (loop-2 t50, t52).

## Spend (actual)
Judge $0.062 · interviewer smoke ≈$0.01 · screen $0.187 · prefix checks **$0.658** (coverage classifier $0.48 of it) → **≈$0.92, over the $0.50 cap.** Cause: my estimate priced the coverage model id `claude-haiku-4-5-20251001` at $0 (rate table bug), and Haiku played the whole 30-turn loop script (Luna's runs were ~14 turns); coverage resends the transcript each call.

## Read
- Speed: Haiku 5.5 is a meaningful gain (−0.8s to useful content on every turn; live ~1.5s), slightly slower than Luna-none.
- Quality on this screen: fault rate near Sonnet's after the gate (25% vs 23%), better rigor than Luna on the known probes (Derek units), but more grading-in-say and request-judgment slips (unasked / premature releases); the gate held every premature release live. Not a clear regression; not clearly equal either — n is small, one reviewer.
- If pursued: the paired persona evaluation (paused, ~$9) would need re-estimating with coverage priced correctly; and grading-in-say needs a check (Settle veto) before any switch.
