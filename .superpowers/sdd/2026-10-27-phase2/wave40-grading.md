# Batch 40 (phase 2 confirmation wave) — hand grading

**Code:** `phase2-design` 39762887. `ENGINE_SWITCHES='*=phase1,phase2,checkerEquationsAsync'`, which expands to 40 switches on every case: phase1's 28, the asynchronous answer sheet, and phase2's 11. `equationClears`, `checkerEquations` and `speechNormalization` are off. Interviewer `sonnet55-baseline`, human pacing, judge `claude-sonnet-5-5` with the harness's in-memory claim (`memoryAskJudgeClaim`).

**Runs:** 20, in two rounds of 10.
- Round 1: Brew & Bean (prof-001) and Larkspur (prof-002), personas 7, 24, 40, 57, 64.
- Round 2: Quillpath (pricing-001) with the same five, plus Quillpath 65, 66, 67 and Larkspur 65, 67.
- Scored: all Brew & Bean runs, and Marcus (24) on Larkspur and Quillpath.
- **2 partial runs:** Tyler (64) on Brew & Bean after 2 turns and on Larkspur after 8. In both, the candidate simulator (`claude-opus-5`, hard-coded in `live-run.ts`) returned `stop_reason: refusal`. It's a harness failure, not an interviewer one: the interviewer model check passed and the turns before the refusal are ordinary. Batch 39's Tyler runs completed on the same simulator, so I read these as sporadic (low confidence). Quillpath Tyler completed.

**Spend:** $23.66 of the $30 shared cap: wave $20.71, offline auditor $2.95. The auditor's own $5 ledger and the shared ledger both bound; every auditor call was recorded in both.

**Graded by Claude** from the turn records: the delivered lines by kind, every acting check, the judge's verdict rows, the checker's verdicts with their answer sheets and vet notes, and stale drops. The auditor was used for triage only, and every serious flag it raised was hand-read (§7). **Not yet second-graded** (Lorenzo's blind grade is next).

`t` is the interviewer turn (candidate index + 1), as in batch 39.

## 1. The bar (fixed before the wave)

Usual 15 = Brew & Bean, Larkspur and Quillpath × personas 7, 24, 40, 57, 64. 13 runs completed, plus the 2 Tyler partials.

| Bar | Verdict | Evidence |
|---|---|---|
| 0 conduct misfires | **MET — 0** | No `conduct`, `conduct_model`, `conduct_backstop` or `candidate_exit` check acted in any of the 20 runs. |
| At most 1 serious fault | **MET — 1** | Quillpath Raj `790be3d5` t20: code's correction "Value Starter adds per month of sign-ups is about **$680 million**, not $560k." The right figure is about $680k (§2). |
| 0 serious false refusals | **MET — 0** | 2 false refusals, both phrased as assumptions, both on Larkspur's opening turn (Jasmine `931850ad` t2, Tyler `6cdbd1b5` t2). In both the held data reached the candidate within two turns. |
| No stale corrections, no repeated stale probes | **NOT MET — 4 repeated stale probes; 0 stale corrections** | Brew & Bean Marisol `ce000d1b` t20; Larkspur Tyler `6cdbd1b5` t8 and t16; Quillpath Tyler `5665cf4a` t8. Each probe re-asks a figure the candidate had just explicitly withdrawn, after the same point had already been raised. The common cause is in §3. |
| Firm faults ≤ 0.6 per run | **NOT MET — 1.67** | 25 firm across the 15 (1.92 over the 13 completed runs). 7 of the 25 are misleading pointers, which batch 39's grade did not count (§6). |
| False statements ≤ 0.2 per interview | **NOT MET — 0.73** | 11 in the 15: 7 misleading pointers, 2 false refusals, 1 false correction and 1 false comparison (§5). |
| No recommendation or mitigation re-asks | **NOT MET — 1** | Brew & Bean Jasmine `3240a046` t30. The close-wait `measure` line ("Six months from now, what would show you it was working?") came after t26 had asked "how would you track whether it's working after launch" and she'd answered at t28. Recommendation asks: exactly one delivered per run. |
| Must-reach delivered | **MET** | Every completed run delivered its must-reach (Larkspur `competitor_entry` and `new_route_rampup`; Quillpath `why_pro_fell`). Larkspur Tyler stopped at t16, before the recommendation stage. |
| Quillpath root corrected, not repeated | **NOT MET — 4 of 5** | Corrected in Raj (by himself at t22, confirmed by code), Marcus (code t26: "about 5%, not 4.2%"), Marisol (herself after the t14 probe) and Tyler (code t14). **Jasmine `359e8f59`:** probed at t8 and again at t14 ("once more"), then left at 4.2%. At t26 she still said "near 4% a month". The close corrections fixed downstream values ($1,400; $0.24M), not the rate. |
| asyncAskJudge: 0 false corrections | **MET — 3 corrections, 0 false** | Listed in §4 with the candidate's response. |
| Answer sheet: 0 drops of a real error | **NOT MET — 10 real-error drops (9 in the usual 15)** | §3. 2 of them left the error in place at the close: Brew & Bean Marcus t16 and Quillpath Raj t40. 2 legitimate cross-message drops and 1 legitimate same-message drop. |
| Scored runs: an error left at close in the recommendation is named in the report | **MET — 1 of 1** | Brew & Bean Marcus `720e7a5e`: "6% to around 10%". The report says "≈ 13%, not 10%". The other scored runs closed with no open error in the recommendation. |

## 2. Serious

**S1. Quillpath Raj `790be3d5` t20: false correction (code), off by 1,000×.**
- He had netted "roughly $560k a month". The checker's claim `17:3` had `correctValue: 680` in unit `$k/month`, which is right (the answer key's +$0.68M).
- Code's correction line put that figure into the case step `starter_value_added`, which is in millions. It said "Value Starter adds per month of sign-ups is about **$680 million**, not $560k."
- The candidate caught it at t22: "I think that's an order-of-magnitude issue … thousands not millions."
- The same rendering bug was produced twice more and withheld by the provenance guard, so never said: Quillpath Marisol t20 and Victor t18, both "$680,000,000,000, not …".
- **Cause:** code's `correctionLine` takes the checker's `correctValue` in the claim's unit and states it in the step's unit. I think this is phase1's code-written correction path (the decision reads "code's quantity stated (money)"); not verified in code. Not fixed; flagged.

Serious candidates I graded firm: §8(a).

## 3. The answer sheet (`checkerEquationsAsync`)

**Every drop.** "Same message" means the vetting step, a claim dropped by the same message's own sheet. "Cross" means the plan-turn step, a sheet from a later message.

| Run | t | Dropped claim (verdict) | Sheet entry it matched | Real error? |
|---|---|---|---|---|
| Brew & Bean Marcus `720e7a5e` | 16 (same msg) | "takes us from 6% to around 10%" (error/high; ≈13%) | "menu price increase is now 8%, replacing 7-10%" | **Yes, left at close.** A different quantity: "10%" matched the 10 inside "7-10%". Named in his report. |
| Quillpath Raj `790be3d5` | 20 (same) | "The CFO's 2.4x fails only because it ignores upgrades" (error; CFO's standalone is 2.0x) | "Starter LTV to CAC is now 4.7, replacing 2.4x" | **Yes.** 4.7x is the with-upgrades ratio, a different quantity. Probed later at t30 from cand 27; corrected at t32. |
| Quillpath Raj `790be3d5` | 40 (same, close) | "The CFO's 2.4x fails only because it credits Starter with none of the Pro customers" (error) | the same 4.7x entry | **Yes, left at close** (unscored run). |
| Quillpath Marcus `95e5d00b` | 20 (same) | "cancellation-only reading … $1,514, about 5x" (error) | "4.0x … replacing 5x" | **Yes**, though both were his own competing readings. Root probed at t22 and corrected at t24 and t26. |
| Quillpath Jasmine `359e8f59` | 22 (same) | "At $40: … ≈ $2.37M" (error; $2.08M) | "Total ≈ $2.67M, replacing $2.37M" | **Yes.** $2.67M is the $60 arm, a different quantity. The resulting uplift was corrected at t26. |
| Quillpath Marisol `53d85212` | 10 (same) | "roughly doubling the $900 of standalone Starter value" (error; $600) | "Total value per sign-up is now $1,796, replacing $900 standalone" | **Yes**: a total matched as if it were the standalone value. The root was probed in the same turn anyway. |
| Quillpath Marisol | 14 (same) | "the standalone piece becomes $1,500" (error; $600) | "net $2,096, replacing $1,496" | **Yes**: $1,500 matched $1,496 as a near figure. |
| Quillpath Marisol | 16 (same) | "$600 + $896 = $1,496, or about 5.0x" (error; $1,400) | "standalone is now $600, replacing $1,500" | **Yes**: $1,496 matched $1,500. Fixed at t24 through another probe. |
| Quillpath Marisol | 18 (same) | "Starter gets to $1,496, roughly 5x" (error) | the same standalone entry | **Yes**, as above. |
| Quillpath Dana `2ce17a04` (new) | 16 (same) | "total $1,210" (error; $1,400) | "$910 net, replacing $1,220 net" | **Yes**: gross matched against net. Code corrected the downstream figure at t22. |
| Quillpath Dana | 10 (same) | "Cancellation-only would be ≈ 4.2%" | "r ≈ 7.3%, not 4.2%" | No. She abandoned it for her own (also wrong) 7.3%, which stayed live. |
| Quillpath Marisol | 18 (cross) | the 50-month life | "average life is now 20 months, replacing 50" | No. Explicitly replaced. |
| Quillpath Tyler `5665cf4a` | 10 (cross) | the 31.6-month life | "lifetime is now 24 months, replacing 31.6" | No. Explicitly replaced. |

**Cause of every real-error drop:** `supersededBy` (`lib/orchestrator/checker-equations.ts:298`) matches on figures alone. A sheet entry drops a claim when one of the claim's figures is near one of the entry's replaced figures, and nothing checks that the entry's label is the claim's quantity. That's how "10%" matched "7-10%", a with-upgrades ratio replaced a standalone one, and $1,496 was treated as $1,500. The extractor's labels were right in every case, so the information to tell them apart was there.

**A gap the sheet can't close:** the stale probes in §1 (Marisol t20, both Tylers, Remy t18, Victor t12). The candidate withdraws the figure in the message the probe is planned on. The asynchronous extractor's sheet for that message only arrives after the turn is planned, so the cross-message drop sees it one turn too late. In Brew & Bean Marisol t20, the sheet for message 19 did list "gap 16, replacing 6 points", which would have dropped the probe had it been in time.

## 4. Background corrections (`asyncAskJudge`): 3, 0 false

| Run | t | Correction (delivered) | Correct? | Candidate's response |
|---|---|---|---|---|
| Quillpath Raj `790be3d5` | 10 | "Actually, I do have that: New customers per month were 500 Pro in 2024 … 350 Pro plus 1,000 Starter" (his t8 ask, which t8 left unanswered) | Yes (held item, kind `have`) | Used it at once: "Pro signups fell 500 to 350. Do we know whether those 150 went to Starter?" The opening "Actually, I do have that" followed an unrelated "You flagged upgrades as unvalued", so the wording reads oddly. |
| Quillpath Dana `2ce17a04` (new) | 4 | the same new-customers line, after t2 left her ask out | Yes (`have`) | Used it: "Pro signups fell 500 to 350 … Do we know whether those 150 are cannibalized?" |
| Larkspur Dana `f1ac60e8` (new) | 14 | "To correct myself: the Results by route exhibit doesn't show slots and gates available at those airports to add flights, and I don't have it." (t12 had pointed her at the route table) | Yes (`none` after a pointer) | Took it in: at t20 she listed "slots and gates may not be available — I never got that figure" as a risk. |

The judge wrote 32 verdict rows in round 1 and more in round 2. No correction fired on a `partial` verdict, as specified.

## 5. False statements (interviewer)

**Usual 15 (11):**
- **Larkspur Raj `9c0eabe0` t22:** "That's covered on the exhibit — The new-route table…" answering "How confident is planning in the $180 fare?". The table gives the estimate, not any confidence in it.
- **Larkspur Jasmine `931850ad` t2:** "On average fare, FY2023 vs FY2025, I'd make a reasonable assumption." Route fares are held, and reached her on the exhibits.
- **Larkspur Marisol `98ff60d3` t6:** "You'll find that on the exhibit — The route table…" for load factor by route. The route table has none.
- **Larkspur Marisol t22:** "That one is on the exhibit you have: The route table…" for passenger counts on the four protected routes. Not on the table.
- **Larkspur Tyler `6cdbd1b5` t2:** an assumption line for passengers and average fare. Network totals and route fares are held.
- **Larkspur Tyler t10:** "Lakeport and Port Avery each lost the same share of revenue per flight in different amounts." It's 36% vs 31%.
- **Quillpath Raj `790be3d5` t20:** the $680 million correction (S1).
- **Quillpath Marisol `53d85212` t18:** "You'll find that on the exhibit — The cohort table…" for why Starter customers churn. The table doesn't say.
- **Quillpath Marisol t22:** "That's covered on the exhibit — The new-customers table…" for Pro's total active base. The table has sign-ups only.
- **Quillpath Marisol t26:** "The exhibit already shows that — … The cohort table…" for an early retention read on the $60 cohort. That cohort hasn't been measured.
- **Quillpath Tyler `5665cf4a` t12:** "You'll find that on the exhibit — The plan economics table…" for how CAC and upgrades moved month to month. Neither is on it.

**New 5 (7):**
- Larkspur Dana `f1ac60e8` t2: an assumption line for departures, which are held. The line itself is garbled: "On the revenue split, departures, passengers and revenue split, departures…".
- Larkspur Dana t12: a pointer for slots and gates (corrected by the judge at t14).
- Larkspur Victor `6bc6807c` t2: an assumption line for passengers and average fare.
- Larkspur Victor t18: a pointer for the value of the connecting feed.
- Quillpath Remy `edc72915` t16: a pointer for the overlap between upgraders and lost Pro buyers.
- Quillpath Remy t26: a pointer for the $60 cohort's first-month cancellations.
- Quillpath Victor `c7f8408b` t16: a pointer for the upgrade rate split by group.

**Assumption lines (`refusalAssume`):**
- **Count:** 19 in the 20 runs. 12 were in the usual 15 (10 true, 2 false); 7 were in the new 5 (5 true, one of them borderline, and 2 false).
- **All 4 false ones are the same line:** Larkspur's opening ask for passengers, average fare or departures, FY23 vs FY25. Network totals are held but gated behind the structure probe, so the ask gets an assumption. It's batch 39's Larkspur t2/t8 false refusal ("I don't have departures …") in the new wording.
- **The true ones:** competitor pricing, the business/leisure mix, elasticity, price sensitivity, sales capacity, S&M spend by plan, the support-cost trend, cost to serve finer than the plan line, LCC capacity growth, unmet demand and slots, and prior software use. The candidate took the assumption every time.
- **Explicit refusals:** no "I don't have" line was delivered except inside a background correction.

## 6. Firm faults by run (usual 15) and batch-39 comparison

| Run | Firm | Detail |
|---|---|---|
| Brew & Bean Raj `4224252c` | 0 | Checker probe t22 on a real error (20% → 21.7%), corrected. |
| Brew & Bean Marcus `720e7a5e` (scored) | 2 | t16 answer-sheet real-error drop; t20 bare partial (transaction counts by store → average ticket, no refusal). |
| Brew & Bean Jasmine `3240a046` | 1 | t30 tracking re-ask. Borderline: t12 "what's driving the margin drop" after her t6 diagnosis; t20 probe on her correct "18 points". |
| Brew & Bean Marisol `ce000d1b` | 2 | t20 repeated stale probe; t16 bare partial (transaction volume by store → average ticket, then misread as the cup price). |
| Brew & Bean Tyler `129ca71b` (partial) | 0 | — |
| Larkspur Raj `9c0eabe0` | 1 | t22 pointer. Borderline: t20 pointer for exit fixed costs with no gate/slot refusal. |
| Larkspur Marcus `904b0b33` (scored) | 3 | t8 asks about data deferred in the same turn ("What does it tell you…"); t10 repeats the structure probe after he'd answered it, on the third deferral in a row; t26 hollow restatement for ramp linearity. |
| Larkspur Jasmine `931850ad` | 1 | t2 assumption line (false). |
| Larkspur Marisol `98ff60d3` | 2 | t6 and t22 pointers. Borderline: t8 near-repeat probe on a live error. |
| Larkspur Tyler `6cdbd1b5` (partial) | 4 | t2 assumption line (false); t8 repeated stale probe ($18M, which the interviewer had already corrected at t6 and he acknowledged); t10 false comparison plus a silence on "how many jets"; t16 stale probe asked twice in one turn (say and tail). |
| Quillpath Raj `790be3d5` | 1 (+1 serious) | t40 answer-sheet drop at close ("CFO's 2.4x"). |
| Quillpath Marcus `95e5d00b` (scored) | 0 | Borderline: t20 answer-sheet drop (low harm). |
| Quillpath Jasmine `359e8f59` | 1 | Root probed twice, never corrected. Borderline: t22 answer-sheet drop. |
| Quillpath Marisol `53d85212` | 5 | t18, t22, t26 pointers; t20 bare partial (switchers' upgrade rate); t32 missed error: "1/0.215 ≈ 4.7 months" treats Pro's annual 21.5% as monthly. The checker said correct/high, and she reversed her recommendation on it. Borderline: 4 answer-sheet drops. |
| Quillpath Tyler `5665cf4a` | 2 | t8 repeated stale probe (3.17%, abandoned the message before); t12 pointer. |

**Comparison with batch 39, same three cases, usual 5 each (15 runs).** Batch 39 is from `wave39-grading.md` §2 and §4.

| Fault class | Batch 39 | Batch 40 |
|---|---|---|
| Serious | 1 (Larkspur Marisol t30, missed challenge) | 1 (Quillpath Raj t20, false correction) |
| Stale or repeated probes and corrections | 9 (8 stale + 1 repeated) | 4 (all repeated stale probes; 0 stale corrections) |
| False refusals | 6 (4 Larkspur, 2 Quillpath) | 2 (both Larkspur t2, as assumption lines) |
| Misleading pointers | not counted in batch 39's grade (the bank later took 5 from batch-39 Quillpath runs) | 7 |
| Bare partials / hollow restatements / hollow deferrals | 1 hollow deferral | 4 |
| Missed errors | 2 (Larkspur Marisol t26, Tyler t28) | 1 (Quillpath Marisol t32) |
| Root not corrected | 0 | 1 (Quillpath Jasmine) |
| Answer-sheet drops of a real error | — (switch new) | 2 firm (at close) + 7 borderline |
| Re-asks | 0 | 1 (Brew & Bean Jasmine t30) |
| Other (question on undelivered data, repeated structure probe, false comparison) | 1 (`recommendationReceived` miss) | 3 |
| **Firm total** | **20 (1.33 per run)** | **25 (1.67 per run); 18 (1.20) without pointers** |

**Better:** stale probes (9 → 4) and false refusals (6 → 2). No stale correction at all. The background judge's 3 corrections were all right.

**Worse or new:**
- Misleading "it's on the exhibit" pointers are now the largest class (7 + 7 in the new personas). Phase2's restatement path points at a table whenever the item matched is on it, whether or not the table answers the ask.
- The answer sheet adds a new way to miss a real error.
- The false correction comes from a phase1 rendering path.

## 7. New personas (5 runs, reported separately, unscored)

| Run | Firm | Detail |
|---|---|---|
| Larkspur Dana `f1ac60e8` | 2 | t2 assumption line for held departures (garbled); t12 pointer (slots and gates), corrected by the judge at t14. Borderline: t6 and t16 partials with no refusal. |
| Larkspur Victor `6bc6807c` | 4 | t2 assumption line (false); t10 hollow deferral "when fares started falling" (answered in the same line), then t22 "We won't get to it"; t14 hollow restatement ("I gave you what changed … a moment ago") for elasticity and segments; t18 pointer (feed value). Good: "The figure stands as given" / "Those figures stand as released" on his challenges. |
| Quillpath Dana `2ce17a04` | 2 | t8 wrong cover (sign-up channels for "previously used any software"; answered properly when she re-asked at t20); t12 hollow restatement for month-18 status. Background correction t4, correct. |
| Quillpath Remy `edc72915` | 3 | t16 pointer (overlap); t18 repeated stale probe (1.35x after he accepted the $600 correction); t26 pointer ($60 cohort). |
| Quillpath Victor `c7f8408b` | 3 | t12 stale probe (2.5x after he withdrew $750); t16 pointer (upgrade split); t18 hollow restatement (same ask again). Borderline: t14 same question in say and tail; t20 pointer for a derivable revenue effect. Good: "The $300 comes from the case data" / "The 20% upgrade figure is what the cohort data shows". |

**By class (new 5):**
- **Refusals:** 2 false (assumption form, Larkspur t2) and 0 explicit.
- **Assumption lines:** 7, 5 of them true.
- **Background corrections:** 2, both correct and both used by the candidate.
- **Answer-sheet drops:** 2 (1 legitimate, 1 real error with low harm).
- **Pointers:** 5, all false.
- **Hollow restatements and deferrals:** 4.

**Firm total:** 14 in 5 runs (2.8 per run), against batch 39's new 6 at 14 (2.33).

## 8. For Lorenzo

**(a) Serious and false candidates for your blind grade.**
- **Serious:**
  - Quillpath Raj `790be3d5` t20 ($680 million). The auditor agrees.
- **Graded firm, could be serious:**
  - Quillpath Marisol `53d85212` t32: the missed error reversed her recommendation. The auditor graded it serious.
  - Brew & Bean Marcus `720e7a5e` t16: the answer sheet dropped a real error that then stood in the recommendation. The report named it.
  - Quillpath Raj t40: the answer-sheet drop at the close; "CFO's 2.4x" stands in the final recommendation.
  - Quillpath Jasmine `359e8f59`: root never corrected.
- **False:** the 11 + 7 in §5.
- **Auditor serious flags I downgraded:**
  - Brew & Bean Jasmine t20, "false correction": it's a question on a correct figure she hadn't shown, so borderline.
  - Larkspur Marisol t10, "probe chain": five consecutive probes, all on real errors, all corrected, so borderline.
  - Quillpath Dana t12, "false correction": a neutral pressure-test question, though it pushed her off a correct assumption until the exhibit note arrived. Borderline.
- **Auditor flags I rejected:** Quillpath Marisol t28, Tyler t26 and Dana t22 (`stage_missed`). Quillpath requires no brainstorm; batch 39 showed the auditor the same way.

**(b) Five sample run ids** (`random.seed(40)` over the 18 completed runs): `6bc6807c`, `edc72915`, `720e7a5e`, `ce000d1b`, `9c0eabe0`.

**(c) What I did not do.** No fixes. The four causes are in §2 and §3:
- the correction unit scale;
- the figure-only sheet match;
- the sheet arriving one turn late;
- the pointer firing whether or not the table answers.

The Tyler simulator refusals were not investigated beyond the transcript.
