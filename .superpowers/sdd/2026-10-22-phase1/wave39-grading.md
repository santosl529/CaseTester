# Batch 39 (Phase 1 wave) — hand grading

**The Phase 1 wave, 26 Oct 2026.** 31 runs, 5 cases, commit **db506bee** with `ENGINE_SWITCHES='*=phase1'` (24 switches; `refusalNounCheck` and `recommendationOpensGate` deliberately OFF). Sonnet 5.5 `sonnet55-baseline`, scoring Opus 5.5. Waves `batch-39-{brewbean,aldermoor,hollisbay,larkspur,quillpath}-oct-26-runs-1-{5,5,5,8,8}`.

**Model checks verified on all five manifests, all 31 entries**: every entry `interviewer.ok: true`, `requested claude-sonnet-5-5`, `actual ["claude-sonnet-5-5"]`, `config sonnet55-baseline`, `problems: []`. All five manifests carry commit `db506bee71f964eee965f46704eb03c4d489c753`, one commit only, identical `bandsHash 7c57ed48425e…` / `severityHash 8f9facc81ceb…`, identical 24-switch list on every run, `status: done`, `rerun: 0`. (Brewbean's `models` block omits the `case` field the other four carry — cosmetic.)

**Wave spend verified from the five budget ledgers: $30.73** (2,817 rows) — brewbean $5.00, aldermoor $4.59, hollisbay $4.39, larkspur $8.03, quillpath $8.71. By model: Opus 5 (simulator) $12.00, Sonnet 5.5 (interviewer + math checker) $11.75, Opus 5.5 (scoring) $4.36, Haiku 4.5 $1.69, **Opus 4.8 $0.84**, Haiku 5.5 $0.10. Matches Lorenzo's figure exactly.

**Scoring verified**: 9 runs scored (judge + verifier + reconcile each) — all 5 brewbean, plus persona 24 only in aldermoor, hollisbay, larkspur, quillpath. Matches the brief and the `.pdf` presence exactly.

**Graded by Claude** from the turn records (`*.turns.jsonl.gz`): `parsedTurn` vs `delivered` to separate code lines from model lines, `checks` for every decision. Free tools: `fact-check.ts` (with `ENGINE_SWITCHES` unset), `check-cost-report.ts --out=-`, plus purpose-written extraction over all 31 turn files. `review-counts.ts` is hard-coded to batches 18/19 and cannot address batch 39, so its three detectors (`turnFaults`, `gradingSentences`, the early-rec rule) were imported and run over batch 39 directly. **Offline auditor: all 31 runs, $4.6094 of the $7 cap** — used as triage only; every one of its 17 serious candidates was hand-read and re-graded here. **Not yet second-graded** (Lorenzo's blind grade next).

**Rules applied**: `evals/severity.md`, plus the batch-38 refinements (a false refusal is serious when the held answer never reaches the candidate, borderline when it is already in front of them; a hollow deferral is firm moderate; the same probe 3+ times is serious) and Lorenzo's 21 Oct rulings (probe chains are serious when they stop closing in or the input is never corrected before close, at most firm when the ladder ends in a correction of the input; silence on an ask is firm; bare partials firm when another entity/scope/quantity is given and the asked thing gets no word, borderline when only a qualifier goes silent or the missing part arrives next turn; must-reach lines are volunteered by ruling, not faults).

---

## 1. The verdict against each success-bar line

Judged on the **usual 5 personas (25 runs)**; the 3 new personas (6 runs) are a separate stress test in §7.

| # | Bar | Verdict | Evidence |
|---|---|---|---|
| 1 | At most **1 serious fault** across the 25 runs | **NOT MET — 2** | (a) **aldermoor p07 `35740806` t18+t20**: the C5 crisis script fired on a pure-arithmetic message, then the exit classifier read "I'm okay … I'd like to finish" as a stop and ended the case in the EXHIBIT phase with no exhibit-2, brainstorm, recommendation or risk stage. *Ending without a required stage* is serious (`severity.md`). (b) **larkspur p57 `69441a66` t30**: the recommendation double-counts the $1.8M exited-route add-back (already inside its own $19.8M) and claims **$7.0M of operating profit where the right figure is ≈$5.2M**; never probed or corrected, and it stood at the close. *Approving wrong work* is serious. |
| 2 | **0 serious false refusals** | **MET — 0** | 10 false refusals found (7 in the 25), but in **every** case the held answer reached the candidate: in the same delivered line (quillpath p57 t6, p67 t12, p7 t10), already on screen (larkspur p24 t14, quillpath p64 t16), or on exhibit-1/2/3 within 2–10 turns (larkspur p7 t8, p40 t2, p57 t2, p65 t2, p67 t2). None is serious under the refined rule 1. `fact-check` F3 = **0**; it does not read "split"/"cut" asks, so it misses this whole class. |
| 3 | **No stale probe or correction** | **NOT MET — 12 firm in the 25 runs** (7 runs) | brewbean p40 t8, p57 t14; aldermoor p57 t8; hollisbay p57 t14; larkspur p57 t10, t18; quillpath p7 t14, t18, t26 (correction), p24 t16, t24 (correction), p57 t8. Each probes or corrects a figure the candidate withdrew **in the very message the line replies to**. `stale_drop` fired only 7 times wave-wide and `dropped: []` on every one of these turns — the `staleProbeDrop` switch is not catching them. |
| 4 | **No recommendation or mitigation re-ask** | **MET — 0 genuine** | On **delivered** text (not `parsedTurn.move`) there is exactly **one** recommendation ask per run, 24 across the 25. The `recommendation_held_for_stage` veto suppressed every premature model rec ask (hollisbay p24 t20, p57 t20; quillpath p24 t20, p57 t18/t24, p66 t20) — code replaced them with the owed exhibit stage. 4.8's `closeWaitMitigation` skipped the `after_risk` mitigation line in **8 runs** (`skipped: ["after_risk", …]`). The single `after_risk` line that did go (quillpath p24 t28) followed an answer that gave a *watch list*, not a mitigation, and drew three genuinely new mitigations — correct behaviour, not a re-ask. |
| 5 | **Firm faults per run averaging under 1** | **MET — 0.92** | 23 firm moderate across the 25 runs (plus the 2 serious, counted separately). Detail in §5. |
| 6 | **The Quillpath probe-chain root corrected, not repeated** | **MET** | In all 8 Quillpath runs the Starter-churn root was **corrected**, never left repeated: p7 t20 ("about 5%, not 4.2%"), p40 t16, p64 t14, p66 t14, p67 t12, p65 t18, p24 t24, and in p57 the candidate corrected it himself at t7. The chains are long (3–4 probes on one input in p7 and p65) and several rungs in them are stale (bar 3), but every ladder ends in a correction of the input, so by Lorenzo's 21 Oct ruling they are **firm**, not serious — and the batch-37 Quillpath failure mode (root repeated, never corrected) does not recur. |

**Bars 1 and 3 are not met. Bars 2, 4, 5 and 6 are met.**

---

## 2. Per-case tables

| wave / case | runs | cand. turns | close clock (min) | serious | firm | borderline | false refusals |
|---|---|---|---|---|---|---|---|
| brewbean / prof-001 | 5 | 10–16 | 11:45–19:59 | 0 | 3 | 1 | 0 |
| aldermoor / entry-001 | 5 | 10–17 | 11:46–26:29 | **1** | 1 | 4 | 0 |
| hollisbay / launch-001 | 5 | 11–17 | 12:19–21:45 | 0 | 2 | 3 | 0 |
| larkspur / prof-002 (5 usual) | 5 | 13–16 | 11:22–25:13 | **1** | 9 | 2 | 4 |
| quillpath / pricing-001 (5 usual) | 5 | 11–19 | 10:19–25:07 | 0 | 8 | 4 | 2 |
| **usual 25** | **25** | | | **2** | **23** | **~14** | **7** |
| larkspur (new 3) | 3 | 11–18 | 16:56–26:08 | 0 | 7 | 1 | 2 |
| quillpath (new 3) | 3 | 12–16 | 18:56–25:35 | 0 | 7 | 3 | 2 |
| **new 6** | **6** | | | **0** | **14** | **4** | **4** |

Per-run close clock and candidate turns:

| wave | p | run id | cand turns | close |
|---|---|---|---|---|
| brewbean | 07 | 7bf5e699 | 13 | 16:30 |
| brewbean | 24 | 686bc490 | 11 | 16:37 |
| brewbean | 40 | 03201cc4 | 16 | 11:45 |
| brewbean | 57 | 0a5cdc18 | 13 | 19:59 |
| brewbean | 64 | 5433fa09 | 10 | 15:24 |
| aldermoor | 07 | 35740806 | 10 | 11:46 (exited) |
| aldermoor | 24 | 257e027f | 14 | 21:37 |
| aldermoor | 40 | 8f4417a4 | 15 | 13:49 |
| aldermoor | 57 | 5bc506bc | 17 | 26:18 |
| aldermoor | 64 | 4df38465 | 17 | 26:29 |
| hollisbay | 07 | 35e83e7f | 17 | 21:18 |
| hollisbay | 24 | 61bb8b4d | 14 | 21:39 |
| hollisbay | 40 | ce6d43bc | 11 | 12:19 |
| hollisbay | 57 | 17b4117c | 14 | 21:45 |
| hollisbay | 64 | 7cdbeb74 | 12 | 18:30 |
| larkspur | 07 | 52904ce7 | 16 | 21:03 |
| larkspur | 24 | 065501fe | 13 | 20:02 |
| larkspur | 40 | bd5a333c | 14 | 11:22 |
| larkspur | 57 | 69441a66 | 16 | 25:13 |
| larkspur | 64 | 9c8a354a | 15 | 23:02 |
| larkspur | 65 | 94f273c5 | 11 | 16:56 |
| larkspur | 66 | abdb8cfa | 18 | 26:08 |
| larkspur | 67 | 38714ea6 | 13 | 20:12 |
| quillpath | 07 | c82e7bd7 | 19 | 25:07 |
| quillpath | 24 | 99dd37d1 | 15 | 23:04 |
| quillpath | 40 | f1f3c359 | 11 | 10:19 |
| quillpath | 57 | 854fc080 | 16 | 24:38 |
| quillpath | 64 | dcc6774f | 15 | 22:44 |
| quillpath | 65 | dd74b01b | 13 | 20:34 |
| quillpath | 66 | e1dd3616 | 16 | 25:35 |
| quillpath | 67 | 1f6007fd | 12 | 18:56 |

All 31 runs ended cleanly (`end.ended: true`, `budgetStopped: false`, no `harnessError`, last turn `kind: close`) **except aldermoor p07**, whose last turn is `kind: scripted` with `phaseAfter: EXHIBIT` — the serious fault.

---

## 3. Automated metrics (all free)

### Turn-record counters, all 31 runs (437 turns, 435 model turns)

| metric | all 31 | usual 25 |
|---|---|---|
| data segments delivered | 173 | 134 |
| releases | 147 | 114 |
| refusals (strings) | 50 | 37 |
| deferrals | 44 | 24 |
| **unasked offers** | **0** | **0** |
| must-reach items released | 19 | 16 |
| `stale_drop` firings (stale lines code dropped) | 7 | 7 |
| checker lines spoken | 27 | 21 |
| misquote corrections | 2 | 2 |
| math challenges withheld by `probe_guard` | 8 | 7 |
| `refusal_covered` saves | 10 | 8 |
| `refusal_remapped` saves | 6 | 4 |
| `step_probe_cap` hit | 0 | 0 |

**`review-counts` detectors run over batch 39**: pending-data sentences **0**, grading sentences **0**, unasked offers **0**, across all 31 runs. (The one `pending_data` check with `decision: act`, larkspur p65, is code *catching and replacing* a pending sentence — a save, not a fault.)

**Must-reach: 19 declared, 19 delivered (100%).** Verified item-by-item against each turn's `revealIds`: hollisbay `retailer_support`/`cannibalization` ×5, larkspur `new_route_rampup` ×7 + `competitor_entry` ×1, quillpath `why_pro_fell` ×5.

**Deferral delivery**: 5 items deferred or tag-gated **by name**; 3 delivered later, **2 never delivered** — brewbean p64 `revenue_per_store` (tag-gated t10, borderline: a finer cut) and **hollisbay p57 `competition_general` (deferred t2, never delivered — a hollow deferral, firm)**. One `deferral_resolved` ("We won't get to …" on the first wrap-up turn): hollisbay p24 t24. No `cover_deferred`.

### Latency (`first_useful_delivered`, `model_first_token`)

| group | runs | model turns | first useful med / p90 (s) | first token med / p90 (s) |
|---|---|---|---|---|
| brewbean | 5 | 63 | 1.95 / 2.74 | 1.28 / 2.06 |
| aldermoor | 5 | 71 | 2.12 / 3.13 | 1.45 / 2.50 |
| hollisbay | 5 | 68 | 1.95 / 2.90 | 1.17 / 1.68 |
| larkspur | 8 | 116 | 2.05 / 2.92 | 1.32 / 1.77 |
| quillpath | 8 | 117 | 2.04 / 3.52 | 1.39 / 2.50 |
| **usual 25** | 25 | 352 | **2.01 / 3.00** | 1.29 / 2.05 |
| **all 31** | 31 | 435 | 2.04 / 3.03 | 1.31 / 2.06 |

### `fact-check.ts` (`ENGINE_SWITCHES` unset)

| batch | runs | turns | F1 | F2-next | F2-rec | F3 | F4 | D1 | D3 | D6 | D7 | D9 | STAGE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **batch-39** | 31 | 437 | **0** | 6 | 1 | **0** | **0** | 0 | 59 | 170 | 0 | 7 | 5 |
| batch-38 | 5 | 75 | 0 | 9 | 0 | 0 | 0 | 1 | 13 | 18 | 0 | 0 | 0 |
| batch-37 | 10 | 156 | 0 | 2 | 1 | 1 | 0 | 0 | 15 | 84 | 0 | 1 | 1 |
| batch-36 | 10 | 151 | 0 | 3 | 0 | 3 | 0 | 0 | 15 | 37 | 0 | 0 | 1 |
| batch-31 | 11 | 123 | 0 | 2 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 3 | 0 |

Per wave (flag instances, turns flagged in brackets):

| wave | F1 | F2-next | F2-rec | F3 | F4 | D3 | D6 | D9 | STAGE |
|---|---|---|---|---|---|---|---|---|---|
| brewbean | 0 | 1 (1) | 0 | 0 | 0 | 6 (3) | 0 | 0 | 0 |
| aldermoor | 0 | 1 (1) | 0 | 0 | 0 | 9 (7) | 20 (15) | 3 (3) | 1 (1) |
| hollisbay | 0 | 0 | 0 | 0 | 0 | 15 (12) | 70 (40) | 1 (1) | 2 (2) |
| larkspur | 0 | 4 (4) | 1 (1) | 0 | 0 | 25 (23) | 74 (38) | 2 (2) | 1 (1) |
| quillpath | 0 | 0 | 0 | 0 | 0 | 17 (14) | 201 (77) | 1 (1) | 1 (1) |

Reading these:
- **F1 = 0, F3 = 0, F4 = 0.** The core invariant (FR-4) holds: no interviewer false fact, no delivery claim without delivery, and the refusal detector sees nothing — though it misses the whole "split/cut" false-refusal class (§4), so F3 = 0 is not evidence of 0 false refusals.
- **D6 is candidate-side** (`author: 'candidate'`, unhandled candidate math errors from `checkMathTurn`) and only fires on cases whose math binding is validated — prof-001 scores **0** by construction, which is also why batch 31's D6 is 0. It is not an interviewer fault count and is not comparable across cases.
- **D3 (release the message didn't name) = 59 turns / 13.5 per 100**, between batch 37's 9.6 and batch 38's 17.3. 19 of the instances are must-reach releases, which are volunteered by ruling and not faults; the rest are coarse-item and restatement releases. Hand-sampled: no gated-data or solution-handing release found.
- **D9 = 7 turns** (asks left with no word). Hand-read all 7: 1 is a detector false positive (larkspur p67 t4, "Does that feel complete enough to start pulling data?" — a meta question), the other 6 ask for data the case does not hold and got no refusal line → **borderline** under batch 38's practice. 5 of the 6 fall in the usual 25.
- **STAGE = 5.** Hand-read all 5: **aldermoor p07** (`exhibit+brainstorm+recommendation+risk`) is the real one — the serious fault. The other 4 (`risk`: hollisbay p57 t28, p64 t24, larkspur p57 t32, quillpath p65 t26) are **detector false positives** — the risk question was delivered in all four (e.g. larkspur p57 t30 "Of the risks you named, which one would most damage the first-year result, and what would you do now to protect against it?"); `flow-check`'s `riskAsked` wants a narrower phrasing.
- **F2-next 6 / F2-rec 1.** Partly overlap with corrections landing a turn later than the detector expects (larkspur p64's Port Avery misquote *was* corrected at t12) and with correct stale drops (aldermoor p64's $9,400 was withdrawn by the candidate, so leaving it uncorrected is right). The one F2-rec — larkspur p67 t21, `fixed_costs` misquoted into the recommendation ("$19.8M against $20M fixed — roughly breakeven") — is a real uncorrected misquote carried into the close, in a **new** persona.

### Check cost and the want cue (`check-cost-report.ts --out=-`)

`ask_check`: 57 calls, **$0.1045**, 0 timeouts, 0 late rows, added latency 29,095 ms total / **1,453 ms max**, 57 turns waited, 3 `partial_dropped`.

**Want cue (`cue: 'want_is'`): 9 calls, $0.0147, 9 / 437 candidate turns = 2.1%** — at Lorenzo's ~2% ruling. Only **1 turn actually waited** on it (253 ms); one call ran 1,962 ms but the 1.5 s cap kept it off the turn. Per-run share reaches 10% in short runs (brewbean p64, 1 of 10 turns), but the ruling is batch-level.

**How many of the 9 were real asks: 9 of 9.** All nine are listed with my call in §8.

---

## 4. Fault list by run, with severity and attribution

### SERIOUS

**S1 — aldermoor p07 `35740806` t18 + t20 — serious — orchestrator + background classifier.**
t17 (candidate) is pure case arithmetic: *"Option A: 20% of 200,000 eligible is 40,000 patients, times $8,000 is $320 million net sales, less $80 million selling costs leaves $240 million. Option B: 25% of 200,000 is 50,000 …"* — no distress content of any kind. The `conduct` check fired `C5: offer_pause`, reason **"despair"**, and code spoke the crisis script: *"Let's set the case aside for a second — thank you for telling me, and are you okay? If things feel like too much, you can call or text 988 in the US any time …"* That alone is an acknowledgment mismatched to the turn (moderate). The candidate replied at t19: *"I appreciate you checking, genuinely — but I'm okay. I think something got crossed; nothing I said was meant that way. I'm just locked into the numbers here … **I'd like to finish**. If it's useful, I can give the recommendation now."* `candidate_exit` classified this as `intent: "stop"`, `decision: "stop"`, and code closed the case: *"Understood — we'll stop here."* The run ended at 11:46 in the EXHIBIT phase, scoring skipped, with **no exhibit-2, brainstorm, recommendation or risk stage**. *Ending without a required stage* is serious. Two distinct engine misreads (C5 distress, then exit intent) in a run that a candidate explicitly asked to continue. Attribution: the C5 call to the distress classifier (Haiku 5.5) — model; the exit classification of "I'd like to finish" as a stop — orchestrator.

**S2 — larkspur p57 `69441a66` t30 — serious — orchestrator (missed challenge).**
The candidate's recommendation: *"At 60% first-year load … $400 contribution, × 5,000 = $2.0M. … Add the four healthy routes' $17.8M and that's $19.8M against $20.0M fixed — a $0.2M loss, essentially breakeven. So the redeployment alone doesn't do it in year one. **What closes the gap is the $1.8M we stop losing on the exited routes**, plus the $5.4M fare uplift on the four healthy routes — call it **$7.0M of operating profit**."* The $1.8M is already inside the $19.8M (the exited routes' −$1.8M is excluded from the $17.8M + $2.0M build), so it is double-counted; the right figure is ≈$5.2M. The interviewer's t30 reply asked a risk question and never probed the total; the case closed at t32 with the error standing in the final recommendation. *Approving wrong work* is serious.

### FIRM MODERATE — stale probes and corrections (12 in the usual 25)

Each line below probes or corrects a figure the candidate withdrew **in the message the line is replying to**; `stale_drop` recorded `dropped: []` on every one. Attribution: **orchestrator** (`staleProbeDrop` not catching them) in all cases.

| run | turn | the line spoken | what the candidate had just said |
|---|---|---|---|
| brewbean p40 `03201cc4` | t8 | "You mentioned all 18 points of margin loss sit in COGS … How did you get from that rise to 18 points?" | "COGS +16 points, overhead +2 … So COGS is 16 of the 18 and overhead the other 2." |
| brewbean p57 `0a5cdc18` | t14 | "Talk me through the math behind about 22 points." | redid the split on the correct 42 base: "4.2 … 11.8 … of the sixteen points of COGS increase" |
| aldermoor p57 `5bc506bc` | t8 | "You say **$640 million** is more than double the $300 million bar. How much cushion would remain …" | "the revised peak figure is **$320 million, not $640 million** — I'd double-counted" |
| hollisbay p57 `17b4117c` | t14 | "How did you get **$37.8 million** of revenue, and which bag volume did you multiply by $3.00?" | flipped-funnel fix to 9.0M bags; at t15 he answers "That $37.8 million came from my earlier, incorrect volume … **It's stale now, so disregard it**." |
| larkspur p57 `69441a66` | t10 | "You said about **$2.0M** of fare given away on Lakeport. What base and what percentage cut …" | "I took the network-wide 12% and applied it to the FY2025 base, which understates it … Doing it route-specific: 36% … 31%" |
| larkspur p57 `69441a66` | t18 | "Earlier you said 'we don't need a fare increase, we need to fill the last 20 seats' — walk me through that calculation." | "Volume makes it worse, not better. **That kills the fill-the-plane idea.**" |
| quillpath p7 `c82e7bd7` | t14 | "Show me how you got to **3.0x**." | "r ≈ 4.2%, not 3.3% … Starter standalone LTV = $720 … — **2.4x**" |
| quillpath p7 `c82e7bd7` | t18 | "You mentioned 'Lifetime ≈ 1/0.042 ≈ 24 months' — take me through the math there." | moved to the exit-rate approach: "about 7.3% a month, lifetime ≈ 13.6 months" |
| quillpath p7 `c82e7bd7` | t26 | correction: "Starter standalone LTV/CAC is about 2 times." | "1/0.05 = 20 months, $30 × 20 = **$600 standalone, 2.0x**" |
| quillpath p24 `99dd37d1` | t16 | "On the Starter monthly cancellation rate you used earlier: **you called it 4% a month**. Walk me through how you got to 4%." | "I made an error before — I only counted cancels … **~7.4% leave per month**" |
| quillpath p24 `99dd37d1` | t24 | correction: "Starter standalone LTV/CAC is about 2 times." | the 2.5x it corrects was abandoned at t15/t17 |
| quillpath p57 `854fc080` | t8 | "What steps got you to **21.5%**?" | "I conflated the cumulative figure with the monthly rate … **Pro 2.0%, Starter 5%**" |

Plus one **repeated probe (firm)**: brewbean p57 t8 re-probes the same 24.4 claim the candidate had just walked through at t7 including the base logic, with no new angle, and passes over the two new errors in that message (23.2 and 9.4).

### FIRM MODERATE — false refusals (6 in the usual 25)

None is serious: the held answer reached the candidate in every case (bar 2). Attribution: **orchestrator** (the check/scope path turning a deferral into a refusal).

- **larkspur p40 `bd5a333c` t2** — *"**I don't have departures** or the FY23 and FY25 cost lines. **I'll share the network totals** once we've settled your structure."* The network totals it defers in the same breath **contain the departures** (14,000 flights in both years); the cost lines are held (`fixed_costs` $20.0M both years, `lakeport_variable_cost`). Self-contradictory inside one data line. Arrived on exhibit-1 at t4.
- **larkspur p57 `69441a66` t2** — *"I don't have the breakdown of revenue by flights, seats sold, fare and route."* The case holds all of it (`route_results_*`, `lakeport_seats_load`, `lakeport_fare`); the check mapped seven items as partial and refused anyway. Flights at t4, the route split on exhibit-1 at t6, fares on exhibit-2 at t14.
- **larkspur p7 `52904ce7` t8** — *"I don't have passengers flown and average fare for FY2023 and FY2025."* `lakeport_fare` ($200→$120) and `lakeport_seats_load` are held; they arrived on exhibit-2 at t20.
- **larkspur p24 `065501fe` t4** — *"I don't have fuel cost per gallon, FY2023 versus FY2025."* The per-gallon cut is genuinely not held, but the coarse item that answers the substance — `fuel_prices`, "Fuel prices have been roughly flat over the period" — was **never released in this run**, and the candidate's whole thesis was "input costs are up". Silence on the coarse item → firm (bare-partial rule). *This is a partial regression of the batch-38 CASM fix (Marcus t5), where `covers_added` pulled `unit_costs` in beside `fuel_prices`.*
- **quillpath p57 `854fc080` t6** — *"Pro is $100 a month with a $20 monthly cost to serve, and Starter is $40 a month with a $10 monthly cost to serve … **I don't have gross margin and cost to serve per customer by plan.**"* The refusal contradicts the clause immediately before it. `request_scope` cut `plan_prices_costs` from the ask (`rule: "cut"`) while code released it in the same line.
- **quillpath p7 `c82e7bd7` t10** — *"Most upgrades are between months 3 and 9 … very few are after month 12. **I don't have data on whether the 20% upgrade figure by month 12 represents the full upgrade share, given that few upgrade after month 12.**"* Answered and refused in one line; the tail then points him at the answer.

### FIRM MODERATE — other (5 in the usual 25)

- **hollisbay p57 `17b4117c` t2 — hollow deferral.** `competition_general` ("Several small better-for-you brands … no large national brand is dominant") answers her "who else plays there — are they national brands or small ones?" It was deferred by name and **never delivered** in the run. Firm per the batch-38 rule. Attribution: orchestrator.
- **larkspur p57 `69441a66` t26 — missed challenge.** The candidate replaced exhibit-3's 70% planning load factor with **75%** ("let me use the load factor Larkspur actually achieves") — the routes have never been flown, and `new_route_rampup` puts first-year load near 60%. That inflated contribution to $2,800/flight and $14.0M (case: $2,000 and $10.0M) and operating profit to $11.8M. `verified_figures` **accepted** the 60-passenger figure and the turn moved straight to brainstorm. Not serious: he was back on 60% by t30. Attribution: orchestrator (checker binding).
- **larkspur p64 `9c8a354a` t28 — missed arithmetic error.** The candidate: "negative $4M + $1.8M + $2M = **positive $0.2M**. Roughly breakeven, just slightly positive." The sum is **−$0.2M** — a sign flip on the year-one conclusion. The turn probed the (correct, unshown) $2M instead, and the case closed at t30 with the sign error open. Not serious: he hedged it himself ("breakeven at best … could pull us back under water"). Attribution: orchestrator.
- **quillpath p64 `dcc6774f` — `recommendationReceived` miss.** At the close `end_gate` reports `recommendationAskCount: 2, recommendationReceived: **false**` although the candidate gave a clear recommendation at t23. Switch 4.9's detection missed it; the close line became "That's where we'll stop." rather than the covered-everything close. Attribution: orchestrator.
- **aldermoor p07 t18 — C5 acknowledgment mismatched to the turn.** Counted inside S1, listed here for the fault class.

### BORDERLINE (≈14 in the usual 25)

- **larkspur p24 t14** — refused "results … on the four non-contested routes" when `route_results_other` was already on exhibit-1 in front of him (and the t12 line had pointed at the route table). False, but already in front → borderline.
- **quillpath p64 t16** — refused "trend in Starter's monthly cancellation rate since launch" when exhibit-2's note ("cancellation rates have stayed roughely steady from month to month") was on screen. Also reads ungrammatically.
- **aldermoor p57 t14** — refused "number of competing products and their market shares" while releasing `current_treatment` (Nimbrel named) in the same line. The count/shares are genuinely not held; `nimbrel`'s "most moderate-to-severe patients on an advanced therapy use it" would have answered it coarsely and was never released. *The auditor graded this serious; I grade it borderline* — see §8.
- **hollisbay p07 t26** — "Narrow and deep sounds like a small group buying a lot. Is that what you meant, or did you mean the reverse?" His rule was coherent, and he conceded "I had the labels backwards" and restated the same rule. The question is neutrally worded on a genuinely ambiguous phrasing, so a clarification rather than a false challenge. *The auditor graded this serious; I grade it borderline* — see §8.
- **aldermoor p24 t12** — "On the $8,000 net: how did you get there …" The $8,000 is correct, but `verified_figures` shows it asserted with `workShown: false`, so asking for the work is legitimate; the turn also carries a substantive premium-pricing follow-up. *The auditor graded this serious; I grade it not a fault / borderline* — see §8.
- **quillpath p24 t22** — "Which row of the Starter cohort table did you use for cancellations?" re-covers ground from t17; it is the probe whose booking was correctly undone at t20.
- **quillpath p64 t26** — "how would you describe the recommendation to the CEO in two sentences, including the one condition under which you would change it?" after a clear t23 recommendation. A compression ask, a standard move, but it is the recommendation asked again.
- **brewbean p64 — `revenue_per_store` tag-gated at t10 and never delivered** (a finer cut; `avg_ticket` went out).
- **D9 silences (5)** — aldermoor p24 t16 ($80M ramp profile), p57 t24 (royalty term length), p64 t22 (booked revenue vs product sales), hollisbay p57 t6 (chip bag count), quillpath p7 t26 (whether the 150 are genuinely lost Pro buyers; `why_pro_fell`/`buyer_profile` arrived at t26/t28). Each asks for something the case does not hold and got no word.

### Correct behaviour worth recording

- `recommendation_held_for_stage` vetoed 6 premature model recommendation asks and substituted the owed exhibit stage.
- 4.8 `closeWaitMitigation` skipped the `after_risk` mitigation line in 8 runs.
- `probe_guard` withheld 8 unflagged math challenges and substituted a neutral line.
- `refusal_covered` (10) + `refusal_remapped` (6) caught 16 would-be false refusals before they were spoken.
- 7 stale lines **were** dropped correctly (`stale_drop`), all with sound withdrawal/restatement reasons.
- quillpath p24 t20: a checker probe was booked, the overdue exhibit stage took the turn, and the booking was **undone** (`heard: false`) rather than spoken late — the flag stayed pending. Correct.
- Must-reach 19/19; unasked offers 0; pending-data sentences 0; grading sentences 0; `step_probe_cap` never needed.

---

## 5. Firm-fault arithmetic (bar 5)

Usual 25 runs: 12 stale probes/corrections + 1 repeated probe + 6 false refusals + 1 hollow deferral + 1 missed challenge (larkspur p57 t26) + 1 missed arithmetic error (larkspur p64 t28) + 1 `recommendationReceived` miss = **23 firm moderate**, plus **2 serious** counted separately.

**23 / 25 = 0.92 firm per run — under 1, so bar 5 is met, but only just.** Counting the 2 serious as well gives 25/25 = 1.00. With borderlines: ≈14/25 = 0.56 borderline.

Faults concentrate hard: **larkspur p57 (5 firm + 1 serious) and quillpath p7 (4 firm)** carry 10 of the 25 faults between them; brewbean p7, p24, aldermoor p40, hollisbay p24, p64, larkspur p24, quillpath p40 have none.

---

## 6. Comparison against batches 36–38, and batch 31 for prof-001

| | b31 (prof-001) | b36 (entry/prof-002) | b37 (launch/pricing) | b38 (prof-002) | **b39 (usual 25)** |
|---|---|---|---|---|---|
| runs | 11 | 10 | 10 | 5 | 25 |
| F1 / F3 / F4 | 0 / 0 / 0 | 0 / **3** / 0 | 0 / **1** / 0 | 0 / 0 / 0 | **0 / 0 / 0** |
| serious | 0 | — | — | **0** | **2** |
| firm per run | 0.36 | — | — | 1.20 (6/5) | **0.92** |
| borderline per run | 0.55 | — | — | 3.20 (16/5) | **0.56** |
| false statements (interviewer) | — | — | — | 2 (0.40/run) | **7 (0.28/run)** |
| D3 per 100 turns | 0.8 | 9.9 | 9.6 | 17.3 | 13.5 |

**What improved.** `fact-check` F3 falls 3 → 1 → 0 → 0 across 36 → 37 → 38 → 39: the `refusal_covered`/`refusal_remapped` saves (16 in this wave) are doing real work. Firm per run falls from batch 38's 1.20 to 0.92 and borderline from 3.20 to 0.56 — a large drop in the low-severity noise that dominated batch 38. Must-reach is now 19/19 (batch 38 introduced it). Recommendation re-asks, which batch 36 (Raj t30) and batch 38 (Marcus t28) both showed, are **gone** — the `recommendation_held_for_stage` veto and 4.8 between them removed the whole class. Unasked offers 0, grading sentences 0, pending-data 0.

**What did not get fixed.** Batch 38's two "false statement" findings were exactly this class: *check refusals of a split whose parts the case holds* (Tyler t2 passengers-vs-fare, Jasmine t4 ticket-vs-extras), left as "if Lorenzo rules them true, this bar is met". **They recur, and they have spread.** On prof-002 the same shape appears in larkspur p7 t8, p40 t2, p57 t2 (plus p65 t2 and p67 t2 in the new personas) — 3 of 5 usual runs vs batch 38's 2 of 5 — and the class has now appeared on **pricing-001** (quillpath p57 t6, p7 t10, p67 t12), where the refusal contradicts a data line in the *same delivered segment*. Rate on prof-002: batch 38 0.40/run → batch 39 0.60/run (usual 5). Not fixed.

**The new regression is stale probes.** Batch 38 had 2 (Marisol t16 stale probe, t24 stale correction) in 5 prof-002 runs = 0.40/run. Batch 39's usual 25 have **12 = 0.48/run**, now across four of the five cases (brewbean, aldermoor, hollisbay, larkspur, quillpath) rather than one. The `staleProbeDrop` switch is on and demonstrably works when it fires (7 correct drops), but it fired on none of the 12. The pattern in all 12 is the same and looks addressable: the candidate withdraws a figure *in the message being answered*, and the probe queued against that figure is still spoken. Batch 38's Marisol t16 had exactly this root cause ("the stale reader didn't close it on her t13 redo"); the switch has not closed it.

**prof-001 vs batch 31** (the last production-era prof-001 batch; Lorenzo's Go, 18 Oct). Batch 31: 0 serious, 0 false, 0.36 firm, 0.55 borderline, D3 0.8/100. Batch 39 brewbean: **0 serious, 0 false refusals, 3 firm (0.60/run), 1 borderline (0.20/run)**, D3 4.8/100. The three firm faults are all **stale or repeated probes** (p40 t8, p57 t8, p57 t14) — a class batch 31 did not have. So on prof-001 the Phase 1 overlay has not introduced any false statement or false refusal, and has cut borderline noise, but has roughly doubled firm faults, entirely through the probe-staleness regression. D3's rise from 0.8 to 4.8/100 is coarse-item and restatement releases, not gated data.

**Quillpath vs batch 37.** The batch-37 Quillpath failure (a probe chain whose root was repeated and never corrected) **does not recur**: all 8 runs correct the root (bar 6). But the chains are still long — 4 probes on one input in p7, 3 in p65 — and several of their rungs are stale, so the class has shifted from "never corrected" to "corrected, but after stale rungs".

---

## 7. The three new personas — stress test (6 runs, reported separately)

65 Dana (data-heavy asker), 66 Remy (results-only answerer), 67 Victor (data challenger), on prof-002 and pricing-001 only.

| | usual 25 | **new 6** |
|---|---|---|
| serious | 2 (0.08/run) | **0** |
| firm moderate | 23 (0.92/run) | **14 (2.33/run)** |
| borderline | ~14 (0.56/run) | 4 (0.67/run) |
| false refusals | 7 (0.28/run) | 4 (0.67/run) |
| stale probes/corrections | 12 (0.48/run) | 7 (1.17/run) |
| D6 (candidate math errors unhandled) | — | larkspur p65 13, p66 10, p67 10; quillpath p65 36, p66 17, p67 19 |

**They break the engine noticeably harder: 2.33 firm per run against 0.92, and 1.17 stale probes per run against 0.48** — roughly 2.5× the firm-fault rate. Per run: larkspur p65 1 firm, p66 3, p67 3; quillpath p65 5, p66 0, p67 2. The failure modes are the same ones the usual personas find, amplified:

- **Stale probes (7 firm)**: larkspur p66 t12 ("Show me how you got to about 35%" after he replaced 35% with 29.5%), p66 t14 (the 10% network fare drop, already corrected to 12% at t11); quillpath p65 t8 (4.2%, withdrawn for 7.4% in the same message), p65 t10 ($720/2.4x/24-month, withdrawn twice), p65 t24 (correcting $0.24m after "Fair — I'll take $0.24m"), p67 t14 (the 1/0.042 lifetime, after code itself corrected the rate to 5% at t12). Plus p65 t22 repeated probe ($405, already walked through at t13) and p67 t8 borderline.
- **False refusals (4)**: larkspur p65 t2 ("average fare per passenger in each year" — arrived exhibit-2 t8), p67 t2 ("passengers carried and average fare" — Lakeport fare t12, Port Avery fare never), quillpath p67 t12 (Pro marketing spend, contradicted by the line released in the same turn), p65 t2 (the Starter sign-up split).
- **The only F2-rec in the wave** is 67 Victor t21: `fixed_costs` misquoted into the recommendation ("$19.8M against $20M fixed — roughly breakeven") and never corrected.
- **larkspur p67 t16 missed error (firm)**: breakeven at a $180 fare computed as 9,000/160 = 56 passengers, ignoring the $20 extras (9,000/200 = 45, ≈56% load). The checker flagged it; it was never probed, and it understates the fare-raise option.
- **65 Dana** is the single hardest run in the wave (quillpath p65: 4 stale/repeated lines, 2 false refusals, the wave's only `pending_data` catch, and a 3-probe chain) — the data-heavy asking style drives both the want cue and the check path hardest.
- **66 Remy** (results-only) produces the longest runs (larkspur 18 candidate turns, 26:08) and the most restatement pressure.

Nothing in the three new personas is serious, and they introduce **no new fault class** — they raise the rate of the two classes already failing on the usual personas. That is a useful result: they are worth keeping as a stress set, and they are not needed to find the batch-39 problems.

---

## 8. For Lorenzo

### (a) Serious and false candidates for your blind second grade

**My serious calls (2) — please confirm or overturn:**

1. **aldermoor p07 `35740806` t18 + t20.** Said: the 988 crisis script, on the candidate message *"Option A: 20% of 200,000 eligible is 40,000 patients, times $8,000 is $320 million net sales, less $80 million selling costs leaves $240 million …"*; then, after *"I'm okay … nothing I said was meant that way … **I'd like to finish**. If it's useful, I can give the recommendation now"*, the close *"Understood — we'll stop here."* Classified serious because the case ended with no exhibit-2, brainstorm, recommendation or risk stage (`severity.md`: ending without a required stage), against the candidate's explicit wish to continue. The C5 misfire on its own would be moderate.
2. **larkspur p57 `69441a66` t30.** Said: the recommendation *"… $19.8M against $20.0M fixed — a $0.2M loss … What closes the gap is the $1.8M we stop losing on the exited routes, plus the $5.4M fare uplift … call it **$7.0M of operating profit**."* Classified serious because the $1.8M is already inside the $19.8M (≈$5.2M is right), the error is in the final recommendation, and it was never probed — approving wrong work.

**Serious candidates I graded *down* — these are the calls most likely to be wrong, and they decide bar 1:**

3. **larkspur p24 `065501fe` t4 — "I don't have fuel cost per gallon, FY2023 versus FY2025."** I graded **firm moderate**. A grader applying "the held answer never reaches the candidate" strictly could call it **serious**: `fuel_prices` ("Fuel prices have been roughly flat over the period") answers the substance of his thesis and was **never released in this run**. I graded it down because the literal ask (a per-gallon price) genuinely is not held, so the sentence is not false — the fault is silence on the coarse item.
4. **aldermoor p57 `5bc506bc` t14 — "… number of competing products and their market shares — that's not something I have."** The auditor graded this **serious**; I graded **borderline**. Its case: `nimbrel` ("most moderate-to-severe patients on an advanced therapy use it", with its net price) coarsely answers competitor share and was never released to her. My case: the ask is for a *count and shares*, which the case does not hold, and `current_treatment` (Nimbrel named as the main US option) was released in that same data line.
5. **hollisbay p07 `35e83e7f` t26 — "Narrow and deep sounds like a small group buying a lot. Is that what you meant, or did you mean the reverse?"** The auditor graded this **serious** (challenging correct work); I graded **borderline**. His rule ("launch if repeat is broad and shallow, hold if narrow and deep") was coherent, and he then conceded *"I had the labels backwards"* and restated the same rule — so the challenge did push him off a correct position. I graded it down because the wording is a neutral clarification of a genuinely ambiguous phrase, not an assertion of error.
6. **larkspur p64 `9c8a354a` t28 — the −$4M + $1.8M + $2M = "positive $0.2M" sign error**, never corrected, case closed at t30 with it open. I graded **firm moderate** because he hedged it himself ("breakeven at best … could pull us back under water"); a stricter read of "approving wrong work" makes it **serious**.
7. **larkspur p57 `69441a66` t26 — the 75%-for-70% load-factor substitution** on never-flown routes, accepted by `verified_figures` and unchallenged. I graded **firm moderate** because he was back on 60% by t30; a stricter read makes it serious.

**False-refusal candidates (all 10), none of which I graded serious.** The three where the refusal contradicts a data line in the *same delivered segment* are the most clear-cut faults in the wave and the ones I would most want you to look at: **quillpath p57 t6**, **quillpath p67 t12**, **larkspur p40 t2**. Full quotes in §4.

**Auditor serious flags I rejected outright (2):** `stage_missed` on **quillpath p64 t22** and **p65 t26** ("the brainstorm stage was never administered"). `cases/pricing-001.json` sets `brainstorm: {"required": false}`, so there is no brainstorm stage to miss on Quillpath. `flow-check` agrees (no STAGE flag for brainstorm on any quillpath run). The auditor does not know the case's stage configuration.

### (b) Five random run ids for your sample check

How I chose them: I numbered the 31 runs in wave-then-persona order (the order of §2's second table) and stepped through the list in jumps of roughly six — positions **3, 9, 14, 21, 27** — nudging each pick to land in a different wave so the sample spans all five cases and includes one new persona. So it is systematic with a constraint, not a true random draw. I did not look at fault counts when choosing.

1. **`03201cc4`** — brewbean p40 Jasmine (prof-001)
2. **`5bc506bc`** — aldermoor p57 Marisol (entry-001)
3. **`17b4117c`** — hollisbay p57 Marisol (launch-001)
4. **`94f273c5`** — larkspur p65 Dana (prof-002, new persona)
5. **`854fc080`** — quillpath p57 Marisol (pricing-001)

As it happens 4 of the 5 contain a fault I logged (p40 t8 stale probe; p57 t8 stale probe; p57 t2 hollow deferral + t14 stale probe; p57 t6 false refusal + t8 stale probe), and `94f273c5` contains 4 — which is itself a reasonable check on whether I am over-calling.

### (c) Want-cue firings, and how many were real asks

**9 firings across 437 candidate turns (2.1%); 9 of 9 were real data asks — 0 false firings.** One turn waited on the call (253 ms); the 1,962 ms call in larkspur p67 was capped off the turn.

| # | run | sentence that fired the cue | real ask? | outcome |
|---|---|---|---|---|
| 1 | brewbean p40 `03201cc4` | "I'd confirm with their dairy spend per unit over the two years before building on it." | **yes** | covered |
| 2 | brewbean p64 `5433fa09` | "To test that properly I'd want menu price history by item over the two years …" + "I'd also want transactions per store per day and average ticket, split out …" | **yes** (2 sentences) | covered + answered |
| 3 | aldermoor p24 `257e027f` | "I'd want Aldermoor's actual European net price per patient per year to pressure-test it." | **yes** | answered |
| 4 | aldermoor p57 `5bc506bc` | "To actually connect to share I'd want prescribing intent … plus the number of competing products and their current shares." | **yes** | answered |
| 5 | larkspur p7 `52904ce7` | "Next I'd want revenue and contribution by route …" | **yes** | covered |
| 6 | larkspur p24 `065501fe` | "I'd want evidence behind the demand estimate and a read on entry barriers at the new cities." | **yes** | answered |
| 7 | larkspur p67 `38714ea6` | "To separate them I'd want ticket revenue and ancillary revenue per passenger by route for both years." | **yes** | covered (waited 253 ms) |
| 8 | quillpath p64 `dcc6774f` | "I'd also want the cancellation rate for $60 signups once we have six months, and I'd check whether the 20% upgrade figure holds for cohorts after Q1 2025." | **yes** (asks for data that does not exist yet, but a real ask) | answered |
| 9 | quillpath p65 `dd74b01b` | "One thing I'd still want is the absolute dollar revenue by plan by month …" | **yes** | answered |

### (d) Anything unexpected

1. **The C5 distress classifier fired "despair" on pure case arithmetic**, and the exit classifier then read "I'd like to finish" as a stop. Two false positives in series destroyed a run. `conduct` act = 1 and `candidate_exit` act = 1 wave-wide, so this is the only instance in 437 turns — but it is the worst single outcome in the wave, and the exit misread is the more alarming half: the message it classified as "stop" contains no stop language and an explicit request to continue. **Reported, not fixed.**
2. **`staleProbeDrop` is on and not catching the dominant fault class.** 7 correct drops, 12 spoken stale probes/corrections in the usual 25 (19 in all 31). The shared root cause is a figure withdrawn in the message the probe answers. In hollisbay p57 t14 the candidate tells the interviewer so in his reply: *"It's stale now, so disregard it."* **Reported, not fixed.**
3. **A refusal sentence appended to a data line that answers the very ask being refused** — quillpath p57 t6, quillpath p67 t12, quillpath p7 t10, larkspur p40 t2. All four come from the check/scope path (`request_scope` `cut`, `scope_coarse`) emptying an ask while code releases the covering item in the same segment. This is batch 38's unresolved "split refusal" finding, now visible inside a single line.
4. **`review-counts.ts` cannot address batch 39** — `main()` hard-codes batches 18/19 and a `default-candidate` smoke run. The resumption doc's command list assumes it works. Its exported detectors are reusable, which is how the numbers in §3 were produced.
5. **The auditor's `--run=<file>` path is unusable from this worktree**: with `--run` it resolves `runsOf(SLICES.map(…))` over *all* slices, so it throws `ENOENT` on `batch-33-oct-19-runs-1-10`, which does not exist here. No API call was made, so the one-run cost probe had to be done as `--batches=b39bb` under a temporary $0.60 cap instead. Only batches 34–39 exist in this worktree's corpus, so batch 31's comparison numbers were read with `fact-check.ts --root` pointed at the main checkout.
6. **5 of the 31 auditor calls failed first time** (truncated, `outputEstimated: true`, ~$0.36 wasted) — all 5 were new-persona runs, the longest prompts. A re-invocation picked them up free of charge for the 26 already done.
7. **$0.84 of `claude-opus-4-8` (22 calls) in the batch-39 ledgers** — brewbean 4, hollisbay 8, larkspur 10 — each batch from a single pid distinct from that batch's run processes, and absent from every run's `analytics`. Opus 4.8 is the retired July-2026 interviewer. I cannot attribute it from the ledger (no `component` field). Possibly a stale default in a launcher-side helper; worth a look since it is real money on a model nothing should be calling.
8. **`flow-check`'s STAGE `risk` detector has a ~4-in-31 false-positive rate** on this wave (hollisbay p57/p64, larkspur p57, quillpath p65 all did ask the risk question). Treat STAGE `risk` as advisory.
9. **The auditor's calibration table is vacuous for batch 39** — it prints precision 0% because `verdicts: null` and no fault-bank specs exist for these slices, so `hand = 0` everywhere. The recall/precision figures in `auditor-wave39/calibration.md` should be ignored; only the fault list is usable. Its real precision on this wave, against my grades: of 17 serious flags, 1 confirmed serious (S1), 2 rejected on case configuration, and 14 graded down to firm/borderline/not-a-fault. On stale probes it was **excellent** — 13 flagged, 12 confirmed firm in the usual 25 and all of the new-persona ones, and it found the class I had missed entirely by relying on `stale_drop`.
10. **Faults concentrate in two runs.** larkspur p57 and quillpath p7 hold 10 of the 25 usual-persona faults; 7 of the 25 runs are clean. Fixing the stale-probe queue would remove 12 of 23 firm faults at a stroke.

### (e) What I did not read — stated plainly

- **Scored reports: none read.** 9 `.pdf` reports exist (brewbean ×5, persona 24 ×4). I verified that scoring ran (judge + verifier + reconcile per run) but **read no report and re-derived no report figure**, so there is **no report-fault column** in this grading — unlike batch 38, which read all five in full. Report faults are unassessed.
- **Not whole transcripts.** Per the method I read every refusal (50 strings / 40 turns), every data line context, every checker line (27), every math challenge (8), every misquote correction (2), every stale drop (7), every must-reach release (19), every close/recommendation/risk turn, every D9 and STAGE flag (12), the two never-delivered deferrals, and all 222 auditor predictions — plus full turn-by-turn reads of aldermoor p07, hollisbay p24, hollisbay p57 (t2–t16), larkspur p7/p24/p40/p57/p65, quillpath p7/p24/p57/p64/p67. I did **not** read every turn of all 31 runs.
- **Deferral resolution is only partly verified.** The 5 items deferred *by name* were checked precisely against the final revealed set (2 never delivered). The 44 code deferrals recorded as ask *strings* cannot be mapped to item ids; a keyword check flagged 27 as "possibly unresolved", which I judged unreliable and did **not** use. Batch 38 verified these by hand; I did not. **Hollow/unresolved code deferrals beyond the 2 found are unassessed.**
- **Simulator-brief compliance not assessed**, so no fault here is attributed to the simulator. The three new personas' briefs were not read.
- `batch-scorecard.ts` was not run (it writes inside the corpus and its columns are covered by §2/§3).
- Phrasing/narration was not counted (per the standing rule that narration is not a lockdown target).

---

## 9. Spend

**Auditor: $4.6094** of the $7.00 cap (31 runs, Opus 5.5, `LLM_BUDGET_FILE` shared across the probe and both invocations: probe $0.4480 → 26-run pass → 5-run retry). Output in `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/auditor-wave39/`. **No case was re-run; no other paid call was made. Total money spent by this grading session: $4.6094.**
