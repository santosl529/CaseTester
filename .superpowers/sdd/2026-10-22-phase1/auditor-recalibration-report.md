# The offline auditor: dropped-check evidence fixed, and re-calibrated (26 Oct 2026)

Branch `phase1-auditor`, worktree `.claude/worktrees/phase1-auditor`, off `phase1` 33c8c3e5. Lorenzo's 26 Oct ruling:
fix the dead `DROPS` key sets first (gate report §9 item 8), then re-calibrate, **hard cap $5**.

**Spend: $3.5818 of the $5 cap** — a $0.217 single-run probe plus 24 runs. Nothing pushed, merged or deployed; no DB
writes; nothing staged under `Case Interview Runs/`. Commits: `809dcc65` (task 1), the raw outputs and this report.

**Headline: task 1 did what it claimed — the withheld evidence now reaches the model. It did not buy recall.**
Detection recall is unchanged (85%, the same 96 of 113 hand faults, matched record for record), precision is up
3 points (51% → 54%, ten fewer predictions), severity agreement is unchanged (65%). **`bare_partial` got worse
(56% → 48%) and `missed_error` did not move (33%).** Both are within one sample's noise; neither target improved.

---

## Task 1 — the dead `DROPS` keys (free)

Three of the eight declared key sets named fields no check records, so they printed nothing and nobody noticed.
Every corrected key was read off the real recorded `detail` of all ten bank slices (b33–b38, 802 turns):

| check | declared before | what the code records | now |
|---|---|---|---|
| `pending_data` | `dropped`, `open` | `changes` only (settle-turn.ts:626) | `changes` |
| `uncovered_asks`, `probe_turn_requests` | `fresh`, `dropped` | `sentences`, `open`, `classified`, `answered`, `covered`, `dropped` (settle-turn.ts:204) | `open`, `answered`, `covered`, `dropped` |
| `data_decisions` | + `wontGetToNamed` | `wontGetTo` fires (once in b33–b38); `wontGetToNamed` is real but conditional and never fired | both, under a `satisfies keyof DataDecisions` guard |
| `code_gate` | `decisions` | also `held` and `unchecked` — the natural withheld fields, unread | `held`, `unchecked`, `decisions` |

`fresh` was the live field's *name in the code* (`asked.fresh`) but it is recorded as `answered`; that one rename is
the whole reason the ask evidence was dark.

### Before / after firing rate

Per turn, the share on which the `withheld:` line prints anything:

| sample | turns | before | after |
|---|---:|---:|---:|
| the reviewer's sample (b35h + b35q) | 156 | 36 (23%) | 44 (28%) |
| the 25 calibration runs (b36a, b36l, b37h, b37q, b38l) | 382 | 88 (23%) | 127 (33%) |
| all ten bank slices (b33–b38) | 802 | 189 (24%) | 242 (30%) |

The gate report's "36 of 156" is exactly b35h + b35q, where `uncovered_asks` never recorded a non-empty field at all —
the ask classifier's records concentrate in b36–b38, which is where the calibration set lives.

Per check, on the 382 turns of the calibration set (turns on which that check contributed a line):

| check | before | after |
|---|---:|---:|
| `uncovered_asks` | 2 | **38** |
| `code_gate` | 17 | **34** |
| `probe_turn_requests` | 0 | 3 |
| `data_decisions` | 52 | 52 |
| `code_written_requests` | 18 | 18 |
| `partial_dropped` | 7 | 7 |
| `request_scope` | 5 | 5 |
| `pending_data` | 0 | 0 |

`pending_data.changes` is the right key and still prints nothing: in all 747 of its records across b33–b38 the field is
present and empty. Fixed rather than deleted — it is the field the check writes, and the test now pins it.

### On the records the fix was for

The bank's `bare_partial` and `ignored_ask` records, asking whether the turn carries any withheld evidence at all, and
whether an **ask check** (the stated evidence source) carries it:

| records | any withheld | ask-check evidence |
|---|---:|---:|
| `bare_partial`, b36–b38 (25) | 9 → 17 | 0 → 9 |
| `ignored_ask`, b36–b38 (7) | 2 → 4 | 0 → 1 |
| both, b36–b38 (32) | 11 → 21 | 0 → 10 |
| both, all b33–b38 (46) | 15 → 25 | 0 → 10 |

### The test

`tests/eval/auditor.test.ts` → "the withheld keys on the recordings" scans the bank's slices in the corpus and fails
with the dead key named if any declared key is absent from every recorded detail (verified by re-introducing
`pending_data.open`: `expected [ 'pending_data.open' ] to deeply equal []`). The one key the corpus cannot vouch for,
`data_decisions.wontGetToNamed` (spread in only when non-empty), is pinned at compile time instead, and is listed in
`WITHHELD_TYPED_ONLY` so the exception is explicit rather than silent.

---

## Task 2 — the re-calibration ($3.5818 of $5)

### The cost probe, before spending the rest

Free dry run over the 25 runs: ≈ 291,700 input tokens by the char heuristic (≈ $1.17 of input). Then one paid run,
the largest (b38l Tyler, the same run cal1 probed): **21,055 in / 6,652 out, $0.217, 62 s** — against cal1's
19,759 / 6,098 / $0.201 for that same run, i.e. +6.6% input and +9% output from the bigger exhibit clip and the new
withheld lines. Scaling cal1's $3.62 by that gave an **estimate of ≈ $3.9 for 25 runs, inside the $5 cap with ~$1.1
of headroom**; four concurrent calls at ≈ $0.22 could not overshoot it. Actual: **$3.5818** (427,384 in / 93,613 out),
all 25 runs audited, the budget never refused a call. Cap enforced with `LLM_BUDGET_USD=5` and a shared
`LLM_BUDGET_FILE` installed before the first call (the probe's spend counted against the same ledger).

Raw outputs: `evals/fault-bank/auditor-cal2/` (25 JSON + the generated `calibration.md`); `auditor-cal1/` untouched.
The spend ledger is `CaseTester-proof-out/auditor-cal2/budget-ledger.jsonl`.

### Comparability

Same 25 runs, same hand grades, same matching (±2 turns or the hand fault's scope window; class first, then family;
each hand fault and each prediction matched at most once). One wrinkle: **the bank gained a record since cal1** —
`b37q-raj-t24-correction-dropped` (`missed_error`, commit c951aaa4) — so the published cal1 numbers (96/112, 86%) are
on a 112-record denominator. Every number below recomputes cal1's committed predictions against **today's** 113-record
bank, so the two columns are directly comparable. That recomputation is also why cal1 reads 85% here and 86% in
`auditor-calibration.md`, and why its `missed_error` reads 33% (1/3) rather than the published 50% (1/2).

### Detection, severity, families

Detection (any class): **cal1 recall 85% (96/113), precision 51% (96/187) → cal2 recall 85% (96/113), precision 54%
(96/177)**. Severity agreement on matches: **65% (62/96) both**. The 96 matched hand faults are the same count and,
record for record, almost the same set (three lost, three gained; see below).

| family | hand | cal1 pred | cal1 recall | cal1 prec | cal2 pred | cal2 recall | cal2 prec |
|---|---:|---:|---:|---:|---:|---:|---:|
| asks | 63 | 85 | 90% (57/63) | 67% | 80 | 87% (55/63) | 69% |
| flow | 12 | 32 | 100% (12/12) | 38% | 30 | 100% (12/12) | 40% |
| math | 24 | 46 | 88% (21/24) | 46% | 45 | 92% (22/24) | 49% |
| other | 14 | 24 | 43% (6/14) | 25% | 22 | 50% (7/14) | 32% |

### By class (class-level matches only)

| class | family | hand | cal1 pred | cal1 recall | cal1 prec | cal2 pred | cal2 recall | cal2 prec |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| ack_repetition | flow | 0 | 2 | — | 0% | 2 | — | 0% |
| bare_partial | asks | 25 | 17 | **56% (14/25)** | 82% | 17 | **48% (12/25)** | 71% |
| close_wait_reask | flow | 8 | 17 | 100% (8/8) | 47% | 18 | 100% (8/8) | 44% |
| false_correction | math | 1 | 8 | 100% (1/1) | 13% | 8 | 100% (1/1) | 13% |
| false_refusal | asks | 10 | 9 | 80% (8/10) | 89% | 7 | 70% (7/10) | **100%** |
| hollow_deferral | asks | 1 | 2 | 100% (1/1) | 50% | 1 | 100% (1/1) | 100% |
| ignored_ask | asks | 7 | 18 | 86% (6/7) | 33% | 18 | 71% (5/7) | 28% |
| misquote_uncorrected | math | 6 | 9 | 83% (5/6) | 56% | 9 | 67% (4/6) | 44% |
| missed_error | math | 3 | 8 | **33% (1/3)** | 13% | 9 | **33% (1/3)** | 11% |
| other | other | 14 | 24 | 43% (6/14) | 25% | 22 | 50% (7/14) | 32% |
| probe_chain | math | 4 | 6 | 100% (4/4) | 67% | 6 | 75% (3/4) | 50% |
| rec_reask | flow | 4 | 9 | 100% (4/4) | 44% | 8 | 100% (4/4) | 50% |
| repeated_probe | math | 1 | 2 | 0% (0/1) | 0% | 0 | 0% (0/1) | — |
| restatement | asks | 12 | 16 | 100% (12/12) | 75% | 16 | 100% (12/12) | 75% |
| stage_missed | flow | 0 | 4 | — | 0% | 2 | — | 0% |
| stale_correction | math | 2 | 2 | 100% (2/2) | 100% | 2 | 100% (2/2) | 100% |
| stale_probe | math | 5 | 8 | 100% (5/5) | 63% | 9 | 100% (5/5) | 56% |
| unasked_offer | asks | 4 | 4 | 100% (4/4) | 100% | 4 | 100% (4/4) | 100% |
| unasked_release | asks | 2 | 7 | 100% (2/2) | 29% | 6 | 50% (1/2) | 17% |
| wrong_figure | math | 2 | 3 | 100% (2/2) | 67% | 2 | 100% (2/2) | 100% |
| wrong_release | asks | 2 | 12 | 100% (2/2) | 17% | 11 | 100% (2/2) | 18% |

### Did `bare_partial` and `missed_error` improve? No.

**`bare_partial`: 56% → 48% recall (14 → 12 of 25), precision 82% → 71%.** Worse, and the reason is not that the
auditor stopped seeing those turns: at family level it matches **22 of 25 in both runs — the same 22**. What changed is
the label. Two borderline records (`b37h-raj-t22-chip-buyers`, `b37h-marisol-t18-forecast-actual`) are now called
something else in the same family. The ask evidence reached the model on 9 more of these 25 records and moved its
classification, not its detection. The limiter on `bare_partial` is the class boundary against `wrong_release` /
`ignored_ask` / `restatement`, not the evidence.

**`missed_error`: 33% → 33% (1 of 3), precision 13% → 11%.** At family level it now flags all three turns (2 → 3), so
the evidence did reach it, but it labels two of them as another math fault. Two notes on the published 50%: it was
1 of 2 on the older bank, and the attribution in the Stream 1 report ("the one case where missed_error recall was 50%"
being the clipped launch-001 exhibit) is **wrong** — the exhibit clip only ever truncated `launch-001 exhibit-2`
(1,743 chars; the next largest, `prof-002 exhibit-1`, is 1,406 and was never clipped), while all three `missed_error`
hand records are on `entry-001` (b36a) and `pricing-001` (b37q). The clip fix could not raise `missed_error` recall on
this set, and it didn't.

At n = 25 and n = 3, a 14 → 12 shift is about one standard deviation. The honest reading is that neither target moved
and this version's `bare_partial` recall is ~50%, not that the fix hurt.

### What changed, record by record

Lost (class-level) in cal2: `b37h-raj-t22-chip-buyers` and `b37h-marisol-t18-forecast-actual` (bare_partial,
borderline), `b37h-tyler-t14-repeat-rates` (false_refusal, borderline), `b36l-jasmine-t8-competitor-never` and
`b37h-marcus-t10-distribution-silence` (ignored_ask, firm), `b38l-tyler-t14-125-vetoed` (misquote, borderline),
`b37q-raj-chain-405` and `b36l-marisol-t12-unasked-release` (both **serious**, still caught — now matched by family
rather than class). Gained: `b36l-marcus-t18-question-passed` (ignored_ask), `b37q-raj-t14-test-passed` (other),
plus a family-level hit on all three `missed_error` records.

**Serious hand faults: 4 of 5 caught, both runs.** The one miss is the same one: **`b37h-marisol-t8-distribution`**,
the serious false refusal ("A distribution estimate by number of stores — that's not something I have" when
`retailer_support` answers it). It is not an evidence miss — the withheld line prints
`data_decisions: refusals=["a distribution estimate by number of stores"]` on that turn, before and after. The auditor
sees the refusal and does not connect it to the ledger item that answers it. Catching that needs prompt work (point the
model at each refusal and make it name the ledger item it checked against), not more input.

### False positives

Unmatched predictions fell from 91 to 81 (of 187 → 177); 50 of the 81 still land within two turns of a hand fault that
was already counted, so they are mostly re-labels and spans, not inventions. The FP mass sits where cal1 left it:
`other` 15, `ignored_ask` 10, `close_wait_reask` 10, `false_correction` 7, `missed_error` 7. Two small wins:
`false_refusal` is now 100% precise (7/7) and `stage_missed`'s fabrications halved (4 → 2). No hand read of the 81 was
done — cal1's one-pass read stands as the best estimate of their character.

---

## Is the auditor good enough to grade the wave first?

**Yes, as triage for the ask and math families — not as the grade, and not for the serious verdict.** Unchanged from
cal1's advice, now on a current measurement:

- **Use it first** on asks (87% family recall) and math (92%): it finds the turns. Read its output as "this turn is
  worth a look", because its class is right on only 81 of 96 matches and its severity on 62 of 96.
- **Don't trust it alone** on `flow` (precision 40%) or `other` (50% recall, 32% precision), and expect roughly one
  unmatched prediction for every matched one — about 3 per run.
- **Hand-check every serious finding and every turn it is silent on in a stage it should cover.** It missed a serious
  false refusal twice, and the gate's verdict turns on exactly that class of fault.
- Known prompt gap, still unfixed and deliberately not touched here (it would change the calibrated prompt mid-measure):
  `pricing-001` has no brainstorm stage and the auditor keeps charging one.

## Judgement calls

1. **Which ask fields to print.** `open` alone is the withheld-shaped field, but on its own it reads as "this ask got
   no answer" even when code answered it (it does on 8 of 91 records). I print `answered` and `covered` beside it as
   the discriminator and say so in the transcript header. `sentences` (every asking sentence) and `classified` (a
   boolean) stay out as noise. This is a prompt change inside a line the auditor already read, and it is the main
   candidate if a later pass wants to test whether the extra context is what shifted `bare_partial`'s labels.
2. **Kept `wontGetToNamed`** rather than deleting the key the reviewer called wrong: the recording code really writes
   it, it just never fired in b33–b38. It is pinned by type instead of by corpus, and named in `WITHHELD_TYPED_ONLY`.
3. **Kept `pending_data`** with its real key although the field is always empty today — deleting it would hide the
   check from the test that is meant to keep these keys honest.
4. **Did not re-run cal1's prompt.** The comparison recomputes cal1's committed outputs against today's bank instead,
   which costs nothing and is the same comparison; the alternative was another ~$3.6 to re-measure a version we are
   replacing.
5. **Did not touch the prompt's fault definitions** (the `pricing-001` brainstorm line, or a "name the ledger item you
   checked each refusal against" instruction). Both look like the real lever on the two targeted classes, but changing
   them is a new calibration, not this one — flagged for Lorenzo's ruling rather than taken.
6. **`progress.md` and the PRD are untouched**: both are shared files that every phase-1 stream edits, and this branch
   is not merged. The gate report's §9 items 5 and 8 are the entries to close when it is.
