# Haiku 5.5 background migration — switch, data-request re-check, smoke (8 Oct 2026)

Cap $0.30 (shared ledger `budget-ledger.jsonl`); **metered $0.1255** (data-request re-check $0.040, two smoke runs $0.085).

## Switched (commit a7baeba)
Pressure-test judges (answer judge + structure check) and the distress check → `claude-haiku-5-5`, thinking disabled, effort medium. Hint check, coverage and the data-request classifier stay on Haiku 4.5.

## Data-request classifier with enforced JSON (structured output, Haiku 5.5 only) — NOT switched
Pre-set bars: parsing 0 failures; p90 ≤ 2.0s, max ≤ 5s; on hand-read disagreements 5.5 wrong no more often than 4.5 and no invented explicit asks.
- Parsing: **pass** — 0/160 failures (was 26/160 without the schema).
- Latency: **pass, narrowly** — median 1.37s, p90 1.96s, max 3.54s.
- Accuracy: **fail.** 45/80 items disagree with 4.5 on "any explicit ask" or ledger ids; read by hand: 4.5 better on 21, 5.5 better on 9, mixed/tied 15.
  - 5.5's errors: plans or asides recorded as explicit asks for real ledger items (5 items — Derek t13 ×2 runs, Sofia t13, Eliza t11, Jordan t13); genuine asks widened to extra items ("cost breakdown" → also the bean items; a stores question → store data); asks for data the case doesn't have mapped onto items it does ("margin by region" → store count, "waste audit / spend by vendor" → menu price and ticket, "competitor pricing" → menu price). Pending requests come from this classifier and are fulfilled by code once the pressure test is satisfied — these errors would release data nobody asked for.
  - 5.5's wins: it caught explicit asks 4.5 missed — Nikhil's enumerated lists (t13, t21, t31; the asks 4.5 logged as zero in the batch-17 loop), Hugo's "is that the order of magnitude the team modeled?", the default candidate's "has transaction volume held up?"; and it did not credit an earlier turn's ask to the current one (4.5 did, 3 items).
  - 24/80 items differ between its own two runs.

## Smoke (Sonnet interviewer, judges + distress on 5.5, `--no-score`; `test runs/smoke-oct-08-haiku55-bg/`)
- Nikhil early script (4 turns): distress `none` on all 4 (correct); the answer judge held both data-list replies (correct; t5 re-ask, t7 duplicate replaced); no no-verdicts; distress verdict 0.69–1.34s, always before Sonnet's first sentence (1.9–3.2s) — never waited on. First useful content 3.4–6.0s: Sonnet writing 8 request declarations (requests closed 3.3–5.8s), not the background calls. The structure check did not run (the model asked the pressure test itself).
- Leah seeded at t4 (2 turns): her t5 disclosure → `distress` (5.5), C5 offer delivered; t7 (declined pause, continued) skipped by design.

## Remaining judge errors (Haiku 5.5)
- **False unlock** — synthetic held-out "Probably missing a few data points. One, gross margin by product. Two, the delivery mix…" judged answered in 2 of 3 passes (a data list phrased as a gap; the family of 4.5's live loop-t5 unlock).
- **False rejection** — held-out Nikhil batch-17 t13 ("I'd say the cost side over the revenue side, since revenue grew 15% and margin still fell…", then eight asks) judged not answered in 3 of 3 passes; effect: data stays gated a turn longer and code re-asks.
- Structure check: 0 errors (22/22 in each of 3 passes). Borderline items: all as labelled. No-verdicts: 0 offline, 0 in the smoke.
- Live coverage of the judge on 5.5 is two verdicts (both correct); loop-t15 (4.5's live unlock) is correct offline 3/3 on 5.5 but not yet seen live.
