# Stream 1 (evaluation) — report (22 Oct 2026)

Branch `phase1-s1-eval` off the contract commit 0f932c89, worktree `.claude/worktrees/phase1-s1-eval`. All four tasks done, plus the switch record. Spend: **$3.62 of the $25 auditor cap** (task 3 only; one run first, $0.20). Suite 5,174 passed, 9 skipped; `tsc` and `eslint lib app components tests scripts db` clean at every commit. Nothing under `Case Interview Runs/` was added or written; replay and auditor output went to `CaseTester-proof-out/`.

Commits: e372ae21 (personas), 856fc370 (switch record), a324f9d7 (fault bank), e374af80 (Haiku labels), 922f28f7 (auditor), and this report.

## Task 1 — the fault bank and its harness

**Built.**
- `lib/eval/fault-bank-assert.ts` — the detectors and the assertion checks (release / exhibit / refusal / restatement / probe / correction / deferral / ask / close / says / check; scope windows; must-not on every turn of a window, must on any). Detectors read the delivered segments: the phrase pools plus the model's own forms (probes, refusals, "I'll check what we have"), an item's ledger line said again while out, an exhibit's items counted as released.
- `lib/eval/fault-bank-build.ts` — the 10 slices (b33…b38l) with their recorded-verdict files, the spec schema, spec → `FaultRecord` (state, candidate message and delivered line copied from the turn file; `stateBefore` of turnIndex tN−1).
- `evals/fault-bank/specs/<tag>.json` — the hand-authored specs; `evals/fault-bank/<batch>.jsonl` — the built records (10 files).
- `scripts/fault-bank.ts` — `build`; `check` (every assertion against the **recording**: each fault record must fail there, each correct record pass — 0 wrong of 310); `wave-list` (writes `evals/fault-bank/wave-judged.md`); `run --label= [--switches=] [--jobs=] [--only=]` (one vitest replay per run, 8 in parallel, with CK31 + the slice's verdicts as `proof.sh` builds them; b38l has no verdict file in the corpus, so the harness converts the run's own recorded verdicts the way `convert-verdicts.py` does, into the output dir).
- Tests: `tests/eval/fault-bank-assert.test.ts` (12), `tests/eval/fault-bank-records.test.ts` (5, the last runs every record against its recording when the corpus is present).

**The bank: 310 records — 211 fault, 99 correct.**

| batch | serious | false | firm | borderline | faults | correct |
|---|---:|---:|---:|---:|---:|---:|
| batch-33 | 1 | 1 | 2 | 12 | 16 | 13 |
| batch-34-aldermoor | 2 | 1 | 7 | 11 | 21 | 9 |
| batch-34-larkspur | 0 | 3 | 4 | 15 | 22 | 8 |
| batch-35-hollisbay | 2 | 1 | 5 | 10 | 18 | 9 |
| batch-35-quillpath | 1 | 2 | 5 | 5 | 13 | 8 |
| batch-36-aldermoor | 0 | 0 | 7 | 14 | 21 | 10 |
| batch-36-larkspur | 2 | 3 | 4 | 14 | 23 | 10 |
| batch-37-hollisbay | 1 | 1 | 6 | 15 | 23 | 10 |
| batch-37-quillpath | 2 | 1 | 8 | 17 | 28 | 8 |
| batch-38-larkspur | 0 | 2 | 6 | 18 | 26 | 14 |
| **all** | **11** | **15** | **54** | **131** | **211** | **99** |

- Fault classes: bare_partial 30, other 28, restatement 18, false_refusal 17, report_false 17, ignored_ask 16, hollow_deferral 12, close_wait_reask 12, stale_probe 10, misquote_uncorrected 7, rec_reask 7, unasked_offer 6, wrong_figure 6, missed_error 5, probe_chain 5, false_correction 3, stage_missed 3, stale_correction 3, wrong_release 3, unasked_release 2, repeated_probe 1.
- Correct classes: correct_release 29, correct_probe 21, true_refusal 19, correct_close 12, correct_correction 10, correct_deferral 8. By case: prof-002 32, entry-001 19, launch-001 19, pricing-001 16, prof-001 13.
- Owning stream (fault records, replayable / not): stream 2 18 / 0; stream 3 39 / 4; stream 4 106 / 7; phase2 3 / 32; none 1 / 1. **Replayable 167, not replayable 44** (17 of them report faults).

**Baseline (contract §4.5): contract base, switches off — `run --label=baseline`, 54 runs replayed in ~25 s wall (≈15–25 s across runs; the whole command under 30 s).** Output `CaseTester-proof-out/fault-bank-baseline/results.md`, copied to `evals/fault-bank/baseline-contract-base.md`.

| replayable records | n | as expected | other |
|---|---:|---:|---|
| fault | 167 | 106 fail (record the fault) | **51 fixed on the base** (the base's line differs and passes), 10 diverged (turn kind changed) |
| correct | 99 | 95 pass | 4 diverged (3 of them fail: the base wrote another kind of turn there) |

- **Wrong assertions: 0.** The harness classes a fault record that passes on the base by whether the replayed line changed: unchanged → wrong assertion; changed → fixed on the base. Every one of the 51 was read before/after by hand. They are real fixes from rounds 4–6, which ran after batches 33–37 (e.g. b34a Marisol t14 now gets the treatment line; b35h's distribution refusals now release `retailer_support`; b36a Raj t12 now refuses truly; b35q Marisol's row fix arrives at t12; hollow deferrals now refuse). Five apparent fixes were assertion gaps, fixed before the final run (b35h Tyler t14's probe reworded by the model, "show me, step by step"; b35q Raj t22 still doubled under the new "As the exhibit shows" lead; b34a Marisol t28 now a `company_size` non-answer; b35q Tyler t28; b36a Marcus t6).
- **A base finding for the lead (not an assertion error): b35q Tyler t28 on the contract base now says code's "Extra value per month of sign-ups at $60 vs. $40 is about $0.24k, not $210k."** — a new scale slip ($0.24M said as "$0.24k"; true ≈ $240k), from the correction line's scale handling. The record keeps failing on it. Replay-only evidence (recorded verdicts), not seen live.
- Diverged (kind changed on the base; the replay can't judge them): b33 Tyler t18 ×2, b33 Blake t20, b34a Marcus t20, b34a Tyler t28/t30, b34l Tyler t22, b34l Marisol t26 ×2 and t30, b35q Marcus t28, b35q Marisol t26 and t32, b37q Marcus t28 (b37h Marcus t14 is also diverged but not replayable). The correct records among them (b34a Tyler t30 close — the base's turn there is a neutral replay turn, "Go on."; b34l Marisol t26 probe; b35q Marisol t26 correction) are replay artifacts of the base writing another turn kind, not wrong assertions.
- **Switches on:** `run --label=phase1-on-base --switches='*=phase1'` gives the identical table on the contract base (no stream has landed). The harness passes `ENGINE_SWITCHES` to each replay and unsets it for the off run.
- Correct records the base changed, and how they were adjusted (all still pass): b35h Marcus t6 (the base gives `why_now`'s coarse line instead of the refusal — either accepted); b35q Tyler t12 (the base's input question about the row — either accepted); b37h Raj t10 (the base no longer releases on his statement-form want — Lorenzo's offer/soft-want tightening — and releases at t12 on the re-ask: window t10–t12); b37q Tyler t30 (the correction now at t28: window t28–t30).

**Records judged in the wave (Lorenzo's Q2 ruling).** Every `replayable: false` record's `replayNote` says what in the wave would show it fixed (outcome, likely persona/case, which grade sees it); a test enforces "Wave:" and "auditor|hand grade" in each. The list (44) is `evals/fault-bank/wave-judged.md`, reproduced here:

| id | sev | class | stream | what in the wave would show it fixed |
|---|---|---|---|---|
| b33-marisol-t14-own-quantity | serious | false_correction | 3 | The wrong sentence is in the saved model output (the model wrote code's hinted line), so the replay repeats it whatever the base's hint now says; the base adds the revenue-terms line beside it. Wave: on prof-001, a Marisol-type candidate's share-of-revenue figure gets no "In COGS terms … not X" line; the auditor (false_correction) and the hand grade see it. |
| b33-marisol-t20-base-question | firm | ignored_ask | phase2 | The answer is words only the model writes (or a new code line not in Phase 1). Wave: on prof-001, a Marisol-type candidate who asks the interviewer which base or figure it used should get an answer before the stage question; the auditor (ignored_ask) and the hand grade see it. |
| b33-marcus-t6-before-any-data | borderline | other | phase2 | The phrase is the model's own question. Wave: no question saying data is still to come on a turn that just gave data (any persona, most likely Marcus at the structure gate); the hand grade sees it (fact-check D1 may flag it). |
| b33-sofia-t10-two-openings | borderline | other | phase2 | Wording the model wrote. Wave: a probe opens on one claim once (Sofia-type unit confusers); the hand grade sees it. |
| b33-tyler-report-basket | false | report_false | phase2 | Report fault: scoring is not replayed. Wave: scored reports on prof-001 state basket figures for the current period (Tyler or Marisol); the hand grade's report read sees it. |
| b33-tyler-report-borderline | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report Better answers state only case facts and don't blame the candidate for a code re-probe; the hand grade's report read sees it. |
| b33-marisol-report-code-error | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: a report never faults the candidate for following a wrong interviewer line; the hand grade sees it. |
| b34a-marcus-t6-hollow-europe | firm | hollow_deferral | 4 | The check timed out live; the replay serves no verdict for a timeout (it reads as none → a named deferral), and the fix would need a new verdict. Wave: on entry-001, a Marcus-type ask for European price trends gets a true refusal, not a deferral that never comes back; the auditor (hollow_deferral) and the hand grade see it. |
| b34a-tyler-t12-three-questions | borderline | other | phase2 | The stacked questions are the model's own. Wave: one question per turn, a probe not split by a data line (any persona; Tyler-type misquoters draw it); the hand grade sees it. |
| b34a-jasmine-t34-rec-reask | borderline | rec_reask | 4 | The second ask is the model's own question. Wave: the recommendation is asked once unless it changed (Jasmine-type early finishers); the hand grade sees it (auditor: rec_reask). |
| b34a-marcus-report-priced-above | false | report_false | phase2 | Report fault: scoring is not replayed. Wave: report claims about what the candidate said match the transcript (conditionals not read as claims); the hand grade's report read sees it. |
| b34a-jasmine-report-attributions | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report attributions of computations match the transcript; the hand grade's report read sees it. |
| b34l-raj-t6-both-moved | false | wrong_figure | phase2 | The false claim is the model's own sentence; no Phase 1 check reads qualitative claims. Wave: no interviewer line says costs moved on prof-002 (Raj-type stuck openers); the auditor (wrong_figure) and the hand grade see it. |
| b34l-raj-t22-narration | borderline | other | phase2 | The narration is the model's own say. Wave: no stage-naming narration in any interviewer line; the hand grade counts narration. |
| b34l-marisol-t6-before-competitor | borderline | other | phase2 | The model's own question. Wave: no question deferring a topic the same turn just answered; the hand grade sees it. |
| b34l-jasmine-t2-nothing-declared | borderline | ignored_ask | 4 | The declaration is the model's: Guard B regenerated and the model still declared nothing, so code had nothing to defer. Wave: a structure-gate turn after a data ask names a deferral (Jasmine-type early askers); the hand grade sees it (auditor: ignored_ask). |
| b34l-marisol-report-12-month | false | report_false | phase2 | Report fault: scoring is not replayed. Wave: report statements about what the candidate said are true to the transcript; the hand grade's report read sees it. |
| b34l-raj-report-extras | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report says who corrected what as the transcript shows; the hand grade's report read sees it. |
| b35h-marisol-t8-itemized-sum-probe | borderline | other | 3 | The calculation probe follows a checker verdict that rated the base error as a math error; telling base from arithmetic needs a re-run checker (contract 3.7). Wave: a correct sum on a wrong base gets a base question, not a calculation probe (Marisol-type context confusers on launch-001); the hand grade sees it. |
| b35h-marcus-t14-calc-probe-misread | borderline | other | 3 | As b35h Marisol t8: the probe's form follows the checker's error type; a re-run checker is needed. Wave: a misread input gets an input question, not a calculation probe (Marcus on launch-001); the hand grade sees it. |
| b35h-jasmine-t14-your-idea | borderline | other | phase2 | The model's own say. Wave: no odd attributions in acknowledgments (Jasmine-type early finishers); the hand grade sees it. |
| b35h-jasmine-report-shelf-fees | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report facts are the case's; the hand grade's report read sees it. |
| b36a-marcus-t6-eu-manufacturing | borderline | false_refusal | phase2 | The coarse answer is gated to Exhibit 3, so a code release would be a gated release; no Phase 1 rule decides between refusing a finer cut and pointing at a gated item. Wave: entry-001 asks for product cost get a true finer-cut refusal that doesn't read as "none" (Marcus); the hand grade sees it. |
| b36a-marcus-t22-non-answer | borderline | other | phase2 | The model's own sentence. Wave: no line that reads as endorsing the candidate's reading of a definition (entry-001 net-sales gate, Marcus or Jasmine); the hand grade sees it. |
| b36a-jasmine-t28-reask-work | borderline | other | phase2 | The model's own question on a correct figure. Wave: no request to redo shown, correct work (Jasmine-type early finishers on entry-001); the hand grade sees it. |
| b36a-marcus-report-quote-timing | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report evidence quotes come after the facts they are said to contradict; the hand grade's report read sees it. |
| b36l-tyler-t8-misquote-125 | borderline | misquote_uncorrected | 3 | The fix (contract 3.4: a flat ledger correction needs the checker to rate the span an error) can't fire on a recorded "correct" verdict, and a re-run checker is a live call. Wave: on prof-002, a Tyler-type misquote of a revealed fare gets one flat correction; the auditor (misquote_uncorrected) and the hand grade see it. |
| b36l-marcus-t12-seats-sub-ask | borderline | bare_partial | 4 | The model never declared the sub-ask, so code had nothing to refuse (round 6's entrant-flights refusal needs a declaration). Wave: on prof-002, each part of a multi-part competitor ask gets a release or a refusal (Marcus, Dana the data-heavy asker); the auditor (bare_partial) and the hand grade see it. |
| b36l-marcus-t18-question-passed | borderline | ignored_ask | phase2 | An answer would be the model's words. Wave: a direct reasoning question to the interviewer gets acknowledged before the stage question; the hand grade sees it. |
| b36l-marisol-report-11000 | false | report_false | phase2 | Report fault: scoring is not replayed. Wave: report claims about who caught an error match the transcript; the hand grade's report read sees it. |
| b36l-report-borderlines | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: a report doesn't fault a repeat the interviewer asked for; the hand grade's report read sees it. |
| b37h-marcus-t14-split-refusal | borderline | false_refusal | phase2 | The coarse answer is gated to Exhibit 3; no Phase 1 rule decides between the finer-cut refusal and the gated item. Wave: on launch-001, a marketing-split ask is not refused flat when the case says sampling is extra (Marcus); the hand grade sees it. |
| b37h-tyler-report-9m | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report statements about when a figure became right match the transcript; the hand grade's report read sees it. |
| b37q-tyler-report-gross-net | false | report_false | none | Report fault: scoring is not replayed. Wave: report figures keep one basis per comparison (pricing-001 Tyler); the hand grade's report read sees it. |
| b37q-raj-t14-test-passed | borderline | other | phase2 | The model's own sentence. Wave: no line that closes an open probe by passing a test (pricing-001 Raj-type); the hand grade sees it. |
| b37q-marisol-t22-30-percent | borderline | wrong_figure | phase2 | The model's own sentence; no check reads it. Wave: shares in interviewer lines name their base (pricing-001); the auditor (wrong_figure) and the hand grade see it. |
| b37q-marisol-report-upgrade-flow | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report criticisms of flows check steady-state arithmetic; the hand grade's report read sees it. |
| b38l-tyler-t6-self-answered-probe | borderline | other | phase2 | The question is the model's, written expecting a deferral; code released the item. Wave: no probe whose answer the same turn's data line gives (prof-002 Tyler); the hand grade sees it. |
| b38l-tyler-t12-entrant-frequency | borderline | bare_partial | 4 | The model never declared the ask (round 6 open question 8). Wave: the entrant's frequency, asked on prof-002, gets "I don't have" (Tyler, Marisol, Marcus, Dana); the auditor (bare_partial) and the hand grade see it. |
| b38l-marcus-t12-frequency-segment | borderline | bare_partial | 4 | Not declared by the model, so no code path refuses. Wave: each part of a multi-part competitor ask gets a word (prof-002 Marcus, Dana); the auditor and the hand grade see it. |
| b38l-jasmine-t2-before-any-data | borderline | ignored_ask | 4 | The model declared nothing, so code had no ask to defer. Wave: a structure-gate turn after data asks names a deferral of them (Jasmine on prof-002); the hand grade sees it. |
| b38l-raj-report-leases | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report facts come from the case (prof-002 fixed costs); the hand grade's report read sees it. |
| b38l-marisol-report-ramp-credit | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: reports don't credit a candidate for a must-reach item the interviewer volunteered; the hand grade's report read sees it. |
| b38l-jasmine-report-borderlines | borderline | report_false | phase2 | Report fault: scoring is not replayed. Wave: report Better answers state case facts and are never empty; the hand grade's report read sees it. |

## Task 2 — exact Haiku labels (free)

**Built.** `lib/eval/ask-check-labels.ts` (extraction of every `itemless_defer` call from the turn files; the verdict kind; the tables), `evals/ask-check-labels/labels.json` (78 hand labels, each with its ask, verdict, items and a note), `scripts/ask-check-labels.ts` (checks the labels against the corpus — any missing, extra or changed call fails — and writes `evals/ask-check-labels/report.md` with every call), `tests/eval/ask-check-labels.test.ts` (4).

Labels judge Haiku's verdict against the ledger (rule 1: a coarser item that answers counts), not what code then did. Precision on positives: strict = correct item ÷ mapped; lenient = (correct item + partly right) ÷ mapped. False-none rate = false none ÷ "maps to no item".

| batch | calls | correct item | wrong item | partly right | correct none | false none | timeout | precision (strict / lenient) | false-none rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| b33 | 7 | 0 | 0 | 0 | 7 | 0 | 0 | — / — | 0% |
| b34a | 8 | 0 | 2 | 1 | 3 | 0 | 2 | 0% / 33% | 0% |
| b34l | 5 | 0 | 1 | 3 | 1 | 0 | 0 | 0% / 75% | 0% |
| b35h | 9 | 0 | 1 | 0 | 4 | 4 | 0 | 0% / 0% | 50% |
| b35q | 5 | 3 | 1 | 1 | 0 | 0 | 0 | 60% / 80% | — |
| b36a | 10 | 3 | 4 | 0 | 2 | 1 | 0 | 43% / 43% | 33% |
| b36l | 8 | 0 | 2 | 2 | 2 | 2 | 0 | 0% / 50% | 50% |
| b37h | 14 | 1 | 4 | 1 | 6 | 2 | 0 | 17% / 33% | 25% |
| b37q | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0% / 100% | — |
| b38l | 10 | 4 | 1 | 4 | 1 | 0 | 0 | 44% / 89% | 0% |
| **all** | **78** | **11** | **16** | **14** | **26** | **9** | **2** | **27% / 61%** | **26%** |
| b33–b35 | 34 | 3 | 5 | 5 | 15 | 4 | 2 | 23% / 62% | 21% |
| b36–b38 (round 5b prompt) | 44 | 8 | 11 | 9 | 11 | 5 | 0 | 29% / 61% | 31% |

Reading: when Haiku maps an ask to an item it is fully right about a quarter of the time; about a third of mapped verdicts name an item that doesn't answer (16 of 41), and another third are the right item with a wrong label (full for a partial, out of scope for an answer). A quarter of its "no item" verdicts deny something the case holds. Of the 9 false nones, 5 are judgement calls the hand grade marked borderline (the coarse answer was in the prompt or on screen: #26, #28, #38, #54, #65); strictly counted (4), the rate is 11%.

## Task 3 — the offline auditor ($3.62 of $25)

**Built.** `lib/eval/auditor/input.ts` (the case: prompt, the whole ledger, exhibits with data and notes, math steps with answers — offline only; the transcript: each tN with the candidate message, the segments with released ids and exhibits, who wrote the turn, code's acting checks, the checker's verdicts), `lib/eval/auditor/prompt.ts` (the fault bank's classes less `report_false`, one-line definitions, the severity rules as the b33–b38 grades apply them, the output schema), `lib/eval/auditor/audit.ts` (Opus 5.5, adaptive thinking, effort high, structured output, the scoring calls' fallback settings), `lib/eval/auditor/calibrate.ts` (match within 2 turns or the hand fault's scope window, by class then by family; recall, precision, severity agreement), `scripts/offline-auditor.ts` (`--dry`, `--run`, `--batches`, `--report`; `requireRunBudget`; a run already audited is never paid again), `tests/eval/auditor.test.ts` (5). Raw outputs: `evals/fault-bank/auditor-cal1/` (25 JSON); calibration `evals/fault-bank/auditor-calibration.md`.

**Cost.** Estimate before the batch, from one run (b38l Tyler, the longest): 19,759 in / 6,098 out tokens, $0.201, 59 s → ≈ $5 for 25. Actual: **$3.62** for 25 runs ($0.08–$0.21 each; ledger `CaseTester-proof-out/auditor-cal1/budget-ledger.jsonl`), cap $25 (`LLM_BUDGET_USD=25`, `LLM_BUDGET_FILE`).

**Calibration on the 25 runs of b36–b38** (hand = the bank's 112 non-report fault records for those runs):
- Detection, any class: **recall 86% (96/112), precision 51% (96/187)**; severity agrees on 65% of matches.
- By family: asks 90% recall / 67% precision (63 hand); math 91% / 46% (23); flow 100% / 38% (12); other 43% / 25% (14).
- By class (class-level matches): restatement 100% / 75% (12); false_refusal 80% / 89% (10); bare_partial 56% / 82% (25); ignored_ask 86% / 33% (7); close_wait_reask 100% / 47% (8); stale_probe 100% / 63% (5); misquote_uncorrected 83% / 56% (6); probe_chain 100% / 67% (4); rec_reask 100% / 44% (4); unasked_offer 100% / 100% (4); wrong_release 100% / 17% (2); unasked_release 100% / 29% (2); stale_correction 100% / 100% (2); wrong_figure 100% / 67% (2); missed_error 50% / 13% (2); false_correction 100% / 13% (1); repeated_probe 0% / 0% (1); hollow_deferral 100% / 50% (1); other 43% / 25% (14). Full table in the calibration file.
- Misses: 16 of 112, 15 borderline. **The one serious miss: b37h Marisol t8** (the distribution refusal).
- Hand read of the 91 unmatched predictions (one pass against the grading notes, not re-verified turn by turn): 22 are a hand-graded fault under another class or turn; 36 are plausible faults the hand grade didn't count (mostly ones it called advisory or "not counted": stacked questions, a dangling "that", figures left open at time-up); 33 are wrong by the hand grade's own reading — including 3 "brainstorm owed" on pricing-001, which has no brainstorm stage, stage exhibits called unasked releases, probes on live errors called stale. So about 63% of predictions land on a graded fault and about 82% are faults by some reading.
- Use in the wave (contract §6): good as a first pass for the ask and math families (≈90% recall); its flow and "other" predictions need the hand grade; pricing-001 needs a "no brainstorm" line in the prompt (not done — it would change the calibrated prompt).

## Task 4 — the three personas

`scripts/personas.ts`, appended: **65 Dana — the Data-Heavy Asker** (3–5 specific figures at once as lists, half direct questions and half "I'd want / need / confirm" wants, finer cuts the case may not hold, comes back to one deferred item by name); **66 Remy — the Results-Only Answerer** (states results only, half resting on an unmentioned wrong input or slip; first "how did you get it" answered with the next result, steps only on a second ask); **67 Victor — the Data Challenger** (disputes two or three of the interviewer's figures, proposes a substitute once, then carries on with whatever the interviewer holds). Each has a `tests` line tied to the contract's fixes (4.6–4.7 / 3.5–3.6 / FR-4). Briefs carry no digits and no prof-001 words (test). `evals/persona-bands.json` gained their three entries (the bands test requires one per persona) — which changes the bands hash, so a wave on an existing batch would need `--new-version`. Tests: `tests/eval/phase1-personas.test.ts` (5).

## The switch record (contract §3)

`engineSwitchNames(case)` (in `lib/eval/batch-manifest.ts`: `engineSwitchesOf` as a list in contract order) goes into the live-run turn-file header (`TurnFileHeader.engineSwitches`) and onto every run `planWave` stamps (`PersonaEntry.engineSwitches`); `persona-batch` prints it. Tests: `tests/eval/engine-switch-record.test.ts` (3). No new switch added.

## Judgement calls (every one)

Fault bank:
1. **Report faults are records** (17, class `report_false`, stream `phase2`, not replayable): the contract says every graded fault; the harness and the recorded-turn check skip them, and the auditor's calibration excludes them.
2. **Severity follows Lorenzo's rulings where they exist** (rules 1–2 and refinements, 20–21 Oct rulings); elsewhere Claude's grade. b38 has no second grade yet: its records carry Claude's severities with a note.
3. **The 21 Oct "an unasked offer is firm" ruling applied to the b36–b37 offers** (b36a Raj t14, Marcus t8; b37h Marcus t10), not only the named Quillpath Marcus t10; the b34 offers stay borderline (graded before the ruling).
4. **One bullet, one record:** where a grading bullet counts one item across several turns of a run, it is one record with several assertions (e.g. b34l Marisol t18/t20, b34a Tyler's two misquotes); where a bullet spans runs, one record per run (close re-asks, doubled lines) — except b33's new-stores want (Raj t7, Jordan t1, Fiona t1), kept as one record on Raj's run, as the grading counts it once.
5. Items graded as bar misses rather than counted faults were included as borderline (b33 Blake t20, b36a Marcus t26, b35q Marisol t32).
6. Ownership: stream 2 when a cover/tag/must-reach fixes it, 3 for checker/stale/misquote/probe lines, 4 for asks, refusals, restatements, close_wait and the rec re-ask; `phase2` for the model's own words and reports; `none` for Lorenzo's accepted residual (b36l Tyler t18, b37q Tyler's report).
7. Assertions state the owed outcome where the grading names it (release X, refuse Y, no probe on Z); where only the wording was the fault, `says`. For borderline faults the owed outcome is sometimes stricter than the grade required (e.g. "refuse the finer cut") — noted in `grade.note` where in doubt (b33 Marisol t16, b37h Marisol's ladders vs the step-check ruling, b35q Marisol t32 at 24:59, b36a Marcus t8).
8. b35q Tyler t6 "How did you get to $80?": the grading says the model asked it; the turn record shows code's probe-guard line. Recorded as code's.
9. b35h's borderline refusals (Tyler t8, Marisol t20) and b37h Raj t16 are asserted as "release the coarse item" (Lorenzo had the covers built), not "don't refuse".
10. Replayability: a fault is not replayable when the fix needs the model's own words, a timed-out or re-run check, or a re-run checker verdict (contract §4.3); b33 Marisol t14 is not replayable because the wrong sentence sits in the saved model output.
11. The harness replays one run per vitest process (54 processes, 8 at a time) rather than one per slice — the same replay, finer-grained, faster.
12. b38l's verdicts are converted from the run records into the output dir, since the corpus has no b38l verdict file; the phase-1 proof script may build its own.

Haiku labels:
13. The 2 timeouts are labelled `timeout`, apart from Lorenzo's five labels and out of precision and the false-none rate.
14. Coarse answers count (rule 1): a "no item" where the coarse answer was in the prompt or on screen is labelled false none (5 calls; strict rate 11% without them).
15. "Partly right" covers a right item with a wrong full/partial/out-of-scope label, or a coarse item that missed the item that answers (e.g. #52 `fixed_costs` without `aircraft_leases`).
16. b35q Marcus t28 (mapped, marked out of scope) is "partly right": the outcome was right, the form a mapping.

Auditor:
17. Matching window ±2 turns (or the record's scope), class first then family; severity agreement only on matches.
18. The FP hand read is one pass against the grading notes — a rough split, not a verified count.
19. The calibration prompt was frozen after the one-run check; no tuning on the 25 runs (so the numbers are not overfit). The pricing-001 brainstorm FPs are a known prompt gap left for the lead to decide.

## Couldn't make clean / open for the lead
- Nothing in the baseline is a wrong assertion. The 14 diverged records can't be judged by replay on the base (turn kind changed); they stay in the bank and are reported separately.
- The b35q Tyler t28 "$0.24k" line is a contract-base finding for Stream 3/4.
- The persona bands edit changes the bands hash (wave versioning).

---

# Fix round (25 Oct 2026)

The Stream 1 review's required fixes, Lorenzo's four rulings of 25 Oct, and the coordinator's correction on the
base-regression records. **No API spend** ($0; the auditor was not re-run). Suite 5,184 passed / 9 skipped,
`tsc` and `eslint lib app components tests scripts db` clean at every commit. Nothing under `Case Interview
Runs/` was added or written; replay output went to `CaseTester-proof-out/`.

Commits: `76e74ac7` (the assertion engine, the switch proof, the summary), `391f7628` (the records),
`a47e426d` + `c951aaa4` (the base-regression records, then the coordinator's correction), `358cbf72` (the
auditor), `457154b3` (`--switches` validation), `5b3604b7` (positives on the non-replayable records), and this
report.

## Lorenzo's four rulings, as built

1. **close_wait records assert the actual fault.** Each of the 12 now asserts the pool line its own fault used,
   not the family: `guard against that` for the ten `after_risk` faults, `do first | first step | first thing`
   for the two `first_step` ones. A test reads all three close-wait pools out of `phrasing.ts` and proves each
   pattern matches every variant of its own pool and none of another, so the records survive the phrase
   rotation and 4.8's switch to a different pool. The old `ask: mitigation` reading matched the first-step pool
   too (so the planned fix could not clear a record) and missed two first-step variants (so the same fault could
   pass) — both gone.
2. **Where 4.3 / 4.4 / 4.7 defer, a deferral that resolves is accepted; an unresolved one fails.** New
   assertion kind `answered`: over a window, the item released, a true refusal, or a deferral that later
   resolves. `accept` narrows which outcomes count and which may resolve a deferral. Applied to the four b33
   `stores_count` records, `b38l-tyler-t20-demand-evidence`, `b34a-raj-t18-hollow`,
   `b35q-marcus-t28-hollow-out-of-scope`, `b36l-raj-t20-fixed-split`, `b38l-tyler-t24-elasticity`,
   `b38l-raj-t8-network-fare`, and the four false-refusal and four hollow-deferral records that lacked a
   positive. The window ends at the close.
3. **A positive on every fault record.** All 212 non-report fault records now carry a must: `answered` where
   the grading names the ask, `spoke` (with `question` where the turn's job is to ask) where the fault is code's
   own wording. `spoke` needs a delivered sentence that is neither a refusal nor a deferral and is longer than
   an acknowledgment — so silence, `"Go on."` and a refuse-everything turn all fail. Outcome-based: it reads
   the turn's segments, not any wording.
4. **The summary separates diverged from failed.** Every record is partitioned on `skipped` first
   (`not_replayable`, `diverged`, `vacuous`, `run_missing`); pass and fail are counted only over the rest, and
   the report states in prose how a diverged record is judged (by hand, against the before/after lines, else in
   the wave).

## Each review finding

| # | Finding | What was done |
|---|---|---|
| 1 (critical) | 12 close_wait records unpassable | Above, ruling 1. Every pool variant covered by a test against `phrasing.ts`. |
| 2 (critical) | 2 b34l doubled-line records unpassable | `restatement.doubled` added: the item's own line said twice within the one turn, apart from a restatement of an item already out. Code's copy alone no longer trips them, so removing it is a pass. |
| 3 (critical) | 4 replayable fault records owned by `phase2` / `none` | All four marked non-replayable with a wave note (`b33-jasmine-t14-analysis-reask`, `b34a-tyler-t4-structure-reask`, `b35h-marisol-t18-no-question`, `b36l-tyler-t18-stress-test`), **and** the gate excludes `phase2` and `none` fault records by name and says so in the report. `b36l-tyler-t18-stress-test` is already fixed on the base (the must-reach volunteers the ramp at t20) — recorded, but out of the counted set as Lorenzo's residual. |
| 4 (critical) | The summary conflated diverged with fail | Above, ruling 4. |
| 5 (critical) | 78 of 167 fault records had no positive | Above, ruling 3 — now 0 of 212. |
| 14 (critical) | `--switches` unproven | The replay stamps `engineSwitchNames(case)` into every mirror header; `run` asserts it, run by run, against what `--switches` resolves to for that case, and rejects a header written before the stamp. `run` also rejects a case id no record uses — `prof-01=phase1` used to resolve to nothing and read as a clean switches-off run. Both proved by hand: `--switches='prof-01=phase1'` and `--switches='*=phase2'` now both abort. |
| "51 fixed on base" overstated | A class swap or a moved chain is not a fix | **51 → 47.** `b35q-marisol-t12-hollow-held` (hollow deferral → flat refusal, where Exhibit 1's note and `why_pro_fell` answer the ask) and `b35q-marcus-t18-hollow-on-screen` (hollow deferral → a restatement of the cohort row) are class swaps; `b37q-marcus-chain-14-months`'s chain merely moved ($1,880 probed at t24 instead of t28). All three fail again. `b37q-jasmine-chain-400` was re-read and **is** a real fix — the base corrects the root at t16 ("Starter standalone lifetime value at $40 is about $600, not $400.") — and is now asserted as "no further probe on the chain **and** a correction". `b36l-tyler-t18-stress-test` leaves the counted set (finding 3). 12 further rows of the 51 were read before/after by hand (the six unasked offers, the restatement prefix, the refusal wording, the two scale slips, the two stale corrections, the brainstorm re-ask) and are genuine. |
| Vacuous windowed passes | A `must:false` over turns the replay never wrote | Now skips as `vacuous` instead of passing. 0 records hit it on the contract base; the mechanism is unit-tested. |
| Loose assertions | `namesFigure` matched a bare number set | It now reads currency, scale and unit: `"$920"` is not named by `"920 passengers"`, nor `"19%"` by `"19 stores"`, while `"$16 million"` is still named by `"$16M"` and `"$16,000,000"`. This caught `b34a-marisol-t22-probe-after-redo` (its figure follows the probe's own words, `40`) and, with the window widening, the two chains. `b37q-tyler-t8-misquote-288` now demands the flat ledger correction ("about $300, not $288"), not merely a line naming $288. |
| Mutually exclusive pair | `b37h-marisol-ladders` vs `b37h-marisol-t12-root-correction` | The correct record's window widens to t6–t12, so both can hold. |
| Misquote records | 3.4 needs an anchor match **and** a checker error verdict | **Verified against the recordings: satisfiable, so both stay replayable.** `b37h-tyler-misquotes-not-flat` — the recorded verdicts rate `"ingredients you said $0.75"` (t6) and `"fund both inside the existing $4.3M marketing line"` (t20) `error` / `misquote`. `b36a-tyler-misquotes-socratic` — the 1.5% prevalence span (t6, flagged) and `"you said Nimbrel's net price is about $8,650"` (t12) likewise. `b37q-tyler-t8-misquote-288` too (`error` / `misquote`, flag false — 3.4 says "flagged or not"). |
| Want-cue records | May be unobservable in replay | **Confirmed unobservable for the four on model turns**, so they move to wave-judged. 4.6's cue (`request-signal.ts` on `phase1-s4b-fixes`) is code-side, but it only makes a sentence an *asking* sentence; the message classifier then has to map it. On a model turn the replay mocks `classifyDataRequests` to the run's saved detections, which hold none for those sentences (`detections = []` for a saved model turn), so no item can reach the candidate. Moved: `b33-raj-t8-new-stores-want`, `b33-jasmine-t6-cogs-split`, `b37h-marcus-t10-distribution-silence`, `b38l-marisol-t10-competitor-wants`. `b33-tyler-t18-want-dropped` stays replayable: its turn is a code-written `rec_math_probe` whose `code_written_requests` row records the dropped ask, which `asksAddressed` decides offline. |
| Auditor (task 3) | 1,500-char exhibit clip; `ACTS` hid drops | The clip is 6,000 (the largest exhibit in the five cases is `launch-001 exhibit-2` at 1,743), with a test that every case's exhibit data goes in whole, so a future case fails rather than being truncated. A `withheld:` line now carries the drop detail of `code_written_requests`, `request_scope`, `partial_dropped`, `uncovered_asks`, `probe_turn_requests`, `data_decisions`, `code_gate` and `pending_data` **whatever the check's decision** — a turn that releases nothing records `pass`, which is exactly how the acted-only filter hid the evidence for `bare_partial` and `ignored_ask`. **The auditor was not re-run** (no spend), so the 86% / 51% calibration no longer describes this input: re-calibration is the lead's call before the wave. |

## The base-regression records (the coordinator's correction)

First written as two correct-behaviour records (`a47e426d`), then replaced (`c951aaa4`) once the base fixes
landed on `phase1-base-fixes` (56c54edd, cb38676f) and neither could pass even after the fix:

- **`b37q-raj-t24-correction-dropped`** (new; fault, firm, `missed_error`, stream 3) carries the mechanism: a
  pending correction must ride on a stage turn code writes, never be dropped. The checker rated his "a Starter
  sign-up is worth $1,205 all-in" an error with the correction "…is about $1,400, not $1,205." (claim 19:0);
  t24 is a code-written `stage_exhibit` that selected 19:0 and used nothing, t26 a `rec_ask` that did the same
  with 21:0, and by t28 19:0 is `expired`. The correction reached him at t34 in the recording and not at all on
  the contract base. It asks for the correction over t24–t26 and **fails on the base as expected**.
- **`b35q-marisol-t26-correction`** → non-replayable: a *cascade*, not a regression. That run diverges from t12
  over an unrelated row fix, so the t26 state never recurs and the turn cannot be judged offline either way.
- **`b34l-marisol-t26-probe`** → non-replayable: a *replay artifact*. The harness has no coverage scores, so
  `canEndCase` falls back to an elapsed threshold that this turn's recorded 1,205,145 ms crosses by about five
  seconds, which the live run never did. The fault underneath is fixed with 0 line change in that run.

Both reasons are in their `replayNote`, so they sit in the skipped column and in `wave-judged.md`, not as gate
items. It is a **fault** record, not a correct one, because the recording holds the fault: the bank's invariant
(`check`) is that a fault record fails against its own recording and a correct record passes. Its `stream` is 3
so the gate counts it — the base fix is ungated, not a Phase 1 switch, and `none` would have excluded it.

## The corrected baseline

`run --label=final2` on the contract base, switches off, 54 runs replayed in 16 s. Copied to
`evals/fault-bank/baseline-contract-base.md`; raw rows in
`CaseTester-proof-out/fault-bank-final2/results.{md,json}`.

**311 records — 212 fault, 99 correct.**

| kind | records | skipped | counted | pass | fail |
|---|---:|---:|---:|---:|---:|
| fault | 212 | 62 | 150 | **47** (fixed on the base) | **103** (fail as expected) |
| correct | 99 | 4 | 95 | **95** | **0** |

| skipped | fault | correct |
|---|---:|---:|
| not_replayable | 52 | 2 |
| diverged | 10 | 2 |
| vacuous | 0 | 0 |

- **Wrong assertions: 0** (of 311, against the recordings and against the replay).
- **Gate condition 1:** 47 pass / 150 counted fault records; 0 replayable `phase2` / `none` fault records left
  to exclude; 95 of 95 correct records pass.
- **Switches on** (`run --label=final2-phase1 --switches='*=phase1'`): **every one of the 311 rows identical**
  — same pass, same skip reason, same baseline class — as expected on a base where no stream has landed. The
  mirror-header switch assertion passed on all 54 runs in both arms.
- Before this round, for comparison: 157 counted fault records, 51 pass, 106 fail; 95 of 95 correct; 44 not
  replayable; 14 diverged — and a summary that printed the diverged rows inside "fail".

**This baseline predates the `phase1-base-fixes` merge.** Once that is in the base it must be re-run: the one
row expected to change is `b37q-raj-t24-correction-dropped` (fail → pass).

## Judgement calls in this round

1. **The positive's shape is per class.** `answered` where the grading names an ask; `spoke` where the fault is
   code's or the model's own wording and there is no owed ask (stale probes, restatements, unasked offers,
   scale slips, stale and false corrections, chains); `spoke question:true` where the turn's job is to ask (the
   12 close_wait, the 2 brainstorm re-asks). `spoke`'s floor is "a non-refusal, non-deferral sentence longer
   than an acknowledgment, or one that asks" — 20 characters. A shorter real line would be a false fail; none
   exists in the corpus.
2. **`answered`'s default window runs to the close**, because 4.7's stop sequence is what resolves a model-said
   deferral. Where a record's own grading names a tighter window (`b38l-raj-t8-network-fare` t8–t12,
   `b38l-tyler-t2-split-refusal` t2–t8) it keeps it.
3. **A deferral may be resolved only by an outcome the record accepts** — so `b35q-marisol-t12-hollow-held`,
   which excludes a refusal on purpose, cannot be greened by a deferral that ends in "I don't have it".
4. **`b33-jordan-t10-store-count` (stream 2) also moved to `answered`**, though Lorenzo named three b33
   records: 4.4's key-noun rule can defer that ask too, and a cover fix that releases still passes.
5. **`b37q-tyler-t8-misquote-288` keeps its `says "$288"` must** beside the new flat-correction must. Every
   recorded `correctionLine` in these runs carries "…, not X", so the two cannot conflict; if 3.4's wording
   drops the misquoted value the record would need loosening.
6. **`b37q-marcus-chain-14-months` bars both probes from t24 to the close** rather than pinning them to t24 and
   t28, so a chain that moves rather than collapses still fails.
7. **`b37q-jasmine-chain-400` demands a correction in t14–t20** as well as no further probe on `1.3x`. The base
   satisfies both; a probe that merely loses the figure from its wording would not.
8. **`b34a-marisol-t22-probe-after-redo`'s figure is `40`**, as the probe says it, not `$40M`: the unit-aware
   matcher reads the probe's own segment, where the scale is absent.
9. **The non-replayable fault records got positives too** (20 of them), so none can be greened by silence if it
   is ever made replayable.
10. **`tests/replay/runner-corpus.replay.test.ts` was edited** — a test file, not engine code — to stamp the
    switch record into the mirror header. Stream 1 is "new files only"; this is the one exception, and it is the
    only way to prove `--switches` offline.
11. **Severity `firm` on `b37q-raj-t24-correction-dropped` is Claude's reading**, not Lorenzo's: a live, flagged
    error the candidate never heard while it mattered. It is not in any hand grading.

## What remains

- **Re-run the baseline after `phase1-base-fixes` merges** (`npx tsx scripts/fault-bank.ts run --label=<l>`,
  about 20 s): `b37q-raj-t24-correction-dropped` should flip to pass and nothing else should move.
- **The auditor needs a decision before the wave.** Its input changed (whole exhibits, the `withheld:` line),
  so the calibration figures are stale. Re-running the 25 calibration runs costs about $3.60 of the $25 cap;
  without it, the auditor's recall and precision on this version are unknown.
- **12 diverged records** (10 fault, 2 correct) still cannot be judged by replay. They are listed in the
  results file with their before/after lines for the hand read.
- **54 records judged in the wave** (`evals/fault-bank/wave-judged.md`), 17 of them report faults.
- **Open for Lorenzo:** if he rules that the close-wait *first-step* line is also a re-ask when the answer
  already gave the sequence, the ten `after_risk` records need the first-step pattern added as a second
  must-not; as built they pass when 4.8 routes them to the first-step line.
