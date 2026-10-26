# Phase 1 gate report (26 Oct 2026) — the gate is NOT yet met

Written for Lorenzo. Branch `phase1` at bbf4c6b9. **No wave has run. Nothing is pushed, merged to `main` or deployed. $0 spent this session.**

The gate cannot be called met today, for one structural reason: **Streams 4a and 4b are not merged**, and they own 106 of the 150 counted fault records. The bank also needs three fixes before its verdict can be trusted (below). What follows is the evidence that does exist.

## 1. Merged so far

| Merge | Commit | Tests |
|---|---|---|
| Stream 2 — case data | e49799d9 | 5,193 |
| Base regressions (ungated) | 211b978b | 5,196 |
| Stream 1 — the fault bank, auditor, personas | a03a2ac1 | — |
| Stream 3 — worksheet, stale drop, roots (tasks 1–3 of 7) | bbf4c6b9 | **5,313** |

`npx tsc --noEmit` and `npx eslint lib app components tests scripts db` clean at bbf4c6b9.

Not merged: `phase1-s4-fixes` (Stream 4a, review round applied), `phase1-s4b-fixes` (Stream 4b, fix round still running at the token cap).

## 2. Fault bank after these merges (free, 54 runs in 14 s)

| Arm | Fault pass / counted | Correct pass / 95 |
|---|---|---|
| Switches off | **48 / 150** | **95** |
| `*=phase1` | **50 / 150** | **94** |
| `*=phase1,-mustReachPhase1` | 49 / 150 | **95** |

- **48 off, was 47 at the contract base.** The one that flipped is `b37q-raj-t24-correction-dropped`, exactly as predicted when the base fix merged. The base fix works.
- **+2 with every switch on.** Small because Streams 4a and 4b own 106 of the 150, and neither is merged.
- **The single failing correct record is benign and identified:** `b35h-raj-t26-cannibalization`. Must-reach releases `cannibalization` before the recommendation — your 21 Oct ruling's intent — so the correct release the record pins at t26 happens earlier instead. Proven by the third arm: with `-mustReachPhase1` all 95 pass. **Fix the record's window, not the code.**
- 62 fault records and 4 correct are skipped (52 + 2 not replayable, 10 + 2 diverged).

## 3. What each stream proved on its own free replays

| Stream | Switches off | Switches on |
|---|---|---|
| 2 — case data | cover lint on the merged view: 0 wrong gains, 0 unsure, 0 collisions, 0 containments | 5 asks change what a candidate hears, 9 gains, all correct |
| 3 — math | 1 changed line across 26 slices (the scale fix); prof-001 identical | 10 lines: 5 fixed, 4 neutral, 1 artifact. **0 new false corrections.** `*=stepLineage,rootLineage` identical to `*=rootLineage` |
| 4a — data path | **0 changed lines on 31 slices** | 29 lines (was 67 pre-review), 0 new refusals, 2 new releases both answering their ask, deferrals 8 (was 30), all closed, 0 hollow |
| 4b — small fixes | **0 changed lines on 30 slices; all 225 run files byte-equal** | 1,176 lines, **0 changed decisions**: 1,120 ack rotations, 53 close_wait follow-ups, 3 skipped rec re-asks. Fact-check counts identical on every slice |
| Base fixes (ungated) | n/a | 11 lines in 3 of 30 runs, fact-check counts identical on all 30 |

## 4. Gate conditions, honestly

| Condition | State |
|---|---|
| Every replayable fault record passes with `*=phase1` | **Not met** — 50 / 150. Streams 4a and 4b unmerged; the bank needs §5's fixes |
| Every correct record passes both ways | **Met bar one benign record** (§2), whose window needs widening |
| 0 new false refusals / wrong releases / false corrections across b28–b38 | **Met per stream, not yet proven combined.** Stream 3: 0 new false corrections after the C1 fix. Stream 4a: 0 new refusals, both new releases answer their ask. The cross-stream arm is owed |
| prof-001 identical with switches off | **Met for Phase 1 switches; one deliberate exception.** The ungated base fix moves b33 Jasmine's "19.2% volume loss, not 5–6%" correction from t18 to t16, onto a coverage-made recommendation ask — she now hears it before recommending. Said once either way; fact-check unchanged on every prof-001 slice. **Your call** |
| Latency and model calls reported | **Partly.** No new live model call. Haiku ask-check calls 258 → 254 with Stream 4a on. Want-cue classifier share: 1.72% of candidate turns, 2.27% of model turns, 3.16% of want-phase model turns — the cap applies to the last of these. Code-path timing not yet extracted |
| Tokens per stream, merge and review | §7 |

## 4a. A switch trap to fix before any wave

**`ENGINE_SWITCHES='*=phase1'` currently turns `recommendationOpensGate` ON**, because it sits in `PHASE1_SWITCHES`. That is the wider 4.9 reading you have not ruled on. Until then the gate and the wave must run `'*=phase1,-recommendationOpensGate'`, or — better, and my recommendation — the switch should be removed from the `phase1` preset so it can only be named explicitly. One-line change, owed at the 4b merge.

The two 4.9 arms, measured:
- **Narrow (the default):** 0 changed decisions, no run closes earlier.
- **Wide (`recommendationOpensGate`):** 2 changed decisions (one neutral claim) and 5 runs close earlier — b34a Jasmine 37→21 turns (8 exchanges lost), b36a Jasmine 39→25 (7), b35q Raj 39→29 (5), b37q Raj 41→35 (3), b37q Tyler 35→31 (2). Every replaced turn is a post-recommendation pushback probe.

## 5. Three bank fixes before the gate verdict can be trusted

From the independent re-review (it verified the baseline reproduces exactly, the summary partitions correctly, the switch proof is real, and 190 of 195 fault records reject silence and blanket refusal — then found three holes):

1. **CRITICAL — all 12 close_wait records green on a pool swap.** `closeWaitLine` is a three-way fall-through, so the natural way to build 4.8 re-routes `after_risk` to `first_step` or `measure`. Simulated: 10 of 12 pass on the first-step line, **12 of 12** on the measure line, while the fault persists. Fix: assert the `close_hold` decision, not one pool's wording.
2. **CRITICAL — three records green on a blanket refusal.** `b34l-marisol-t12/t26-ask-swallowed`, `b34l-marisol-t30-wont-get-to` carry `refusal must:true` with no `about`, so "I don't have that." greens all three.
3. **CRITICAL — a failing record can leave the denominator.** A fix that flips a turn's kind reclassifies the record as `diverged` rather than failing it, and the gate line *improves*. The probe classes are exactly the ones whose fixes flip kinds. Fix: never let a skip mask a recorded failure, and add a `compare --against=<baseline>` mode so the gate requires that no record moves from `fails_as_expected` into a skip class.
4. **IMPORTANT — `answered` isn't anchored at the record's turn**, so a turn that ignores the ask passes if the item is released anywhere later in the window. That is why two records green on silence.
5. **IMPORTANT — `run` exits 0 when a replay slice fails**, silently shrinking the counted set.
6. **Relabel `b37q-raj-t24-correction-dropped`** from `stream: 3` to `none`: the fix is an ungated base fix no Phase 1 stream owns. Its `firm` severity is Claude's reading and is **proposed**, pending your ruling.

Also confirmed: **nothing in the bank now fails while its fix is correct.** That half of the earlier review is closed.

## 6. Judged in the wave

54 records cannot be proven offline: 52 fault (17 report faults, ~20 needing the model's own words, ~6 needing a re-run checker or new classifier verdict, ~8 where the model never declared the ask) plus 2 correct. Each one's `replayNote` names the outcome the wave should show, the likely persona or case, and whether the auditor or the hand grade would see it. Full list: `evals/fault-bank/wave-judged.md`.

**The notable coverage gap: contract 4.6 (the want cue) is unprovable offline** — the replay mocks the classifier to each run's saved detections, so 5 records moved to the wave and 4.6 reaches the wave untested.

## 7. Tokens

**This session (your +2M): ~2.87M — over, which is why work stopped here.**

| Step | Tokens |
|---|---|
| Stream 4a review | 210,907 |
| Stream 3 review | 202,827 |
| Base regressions | 302,091 |
| Fault-bank fix round | 330,353 |
| Stream 4a fix round | ~519,700 |
| Stream 3 fix round | 673,040 |
| Stream 4b fix round | ~390,000 |
| Independent bank re-review | 204,711 |
| Merges, fault-bank runs, this report (lead) | ~35,000 |

Previous session: 3,154,658 (Stream 2 318,846 + review 219,831; Stream 1 651,219 + review 163,141; Stream 4a 590,136; Stream 4b 438,457 + review 215,491; Stream 3 557,537).

**Money: $0 this session.** $3.62 total across Phase 1, all the auditor's first calibration.

## 8. Must-reach proposals, with their justifying runs

Built (your ruling): prof-002 + `competitor_costs` before exhibit-3 (3 in all); launch-001 `retailer_support` and `cannibalization` before the recommendation; pricing-001 `why_pro_fell` before the recommendation.

**Aldermoor (entry-001) — proposed only: `nimbrel` before `exhibit-2`.** Four runs never released Nimbrel at all: b32 Jasmine, b34 Jasmine, b34 Marisol, b36 Jasmine — two of them graded serious faults. Nimbrel is the comparator the case turns on, so a candidate who never hears it recommends against a rival they don't know exists.

**Brew & Bean (prof-001) — proposed only, and weak on your own test: `non_bean_input_change` before the recommendation.** Your test was a graded run whose recommendation is contradicted by a fact the candidate never heard. One run qualifies: **b31 Sofia t21** (graded firm) recommended a bean-procurement fix having never heard that the other inputs rose too — beans are 4.2 of the 16 COGS points, the other inputs 11.8. b28 Blake t21 has the same shape but should not count: he is the data-ignorer persona and declined the data offered. So: one run, and the "contradicted" reading is an inference. **My recommendation: leave it out**, per your "none unless".

## 9. Open for your ruling

1. **prof-001's one changed line** from the ungated base fix (§4) — accept, or gate it?
2. **The M2 trade.** I made Stream 3 follow the contract's two probes before a root correction rather than its preferred one. Cost: b37q Raj's chain and Marcus's 14-month lifetime (PRD §15's M2) are probed and reported but **never corrected**. Its proposal 8 (one probe, then correct) would correct them.
3. **4.9's scope.** Built both ways: the narrow reading (the time warning stops re-asking) is the default, the wider one (a received recommendation opens the end gate) is behind `recommendationOpensGate`, off. The wider reading closed five runs 3–8 minutes earlier and cost b34a Jasmine eight pushback turns — pushback being one of the eight rubric dimensions.
4. **4.3 has three outcomes**, not two: release, defer, or silently drop the gated item when what remains still answers. At b34l Marisol t30 the drop was better than a deferral. The contract's "a mismatch defers" should move; the gated ids are now recorded so must-reach can still deliver them.
5. **The auditor's calibration is stale.** Fixing the exhibit clip and adding withheld detail changed its input, so 86% recall / 51% precision no longer describe this version. Re-calibration is ~$3.62 of the $25 cap. Needed before the wave if the auditor grades first.
6. **The want cue exceeds the cap on the denominator that matters** (§4) — accept 2.27% / 3.16%, or tighten the cue?
7. **close_wait's open question:** if the first-step line also counts as a re-ask when the answer already gave the sequence, the ten `after_risk` records need the first-step pattern as a second must-not.
8. **Three of eight auditor `DROPS` key sets are dead** (`pending_data`, `uncovered_asks`/`probe_turn_requests`, `data_decisions`), so `uncovered_asks.dropped` — the stated evidence for `bare_partial` — fired on 0 of 156 turns. Worth fixing before re-calibrating.
9. **Two base issues documented, not fixed:** the once-per-stage yield is defeated when a second reason forces the same kind; a stage turn still inside its budget drops the probe (the wider fix cost a new dangling question, so it was reverted).
10. **Stream 2's proposed case edit:** pricing-001 `churn_breakeven_at_60` should list `pro_ltv` among its inputs.
11. **`b35q` run 5c3d2c21 t13** speaks "Starter standalone lifetime value … $600, not $400" under a *churn* key. Identical with every switch off — it predates Phase 1.

## 10. What remains, in order

1. Merge 4a and 4b (both fix rounds are now applied), and drop `recommendationOpensGate` from the `phase1` preset (§4a). Expect conflicts in `turn-data.ts`, `data-decisions.ts`, `fact-check.ts`, `item-tags.ts`, `phrasing.ts`, `math-checker-live.ts` and `settle-turn.ts`.
2. The three bank fixes in §5, then re-run both arms.
3. The combined cross-stream replay with every switch on: read and classify every changed data, probe and correction turn across b28–b38. **This is the gate's real test and it has not been run.**
4. Widen `b35h-raj-t26-cannibalization`'s window.
5. Extract code-path latency (max and mean) from the replay timings.
6. The $3 definitions re-check (your Q5) and, if the auditor grades, its re-calibration.
7. Stream 3's tasks 4–7 (misquote flat corrections, the probe-guard replacement, the spoken-math parser, definitions to the checker) — deferred, not abandoned.
8. Then the gate verdict, and **ask before the wave**.
