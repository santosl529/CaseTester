# Batch 39 (Phase 1 wave) — hand grading: **PARTIAL / NOT STARTED**

> **Status: this is a cold-start resumption document, not a grade.**
> Grading was stopped by Lorenzo before any metric was gathered and before any
> paid call. **No verdict is given here, on any success-bar line.** Nothing in
> this file should be read as a finding about batch 39's quality.
>
> **Auditor spend: $0.00.** The auditor was never invoked, not even a dry run.
> `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/` holds
> `auditor-cal1` and `auditor-cal2` only — no `auditor-wave39*` directory
> exists. Total money spent by this grading session: **$0.00**.

## 1. The four grading steps — status

| Step | Status | Detail |
|---|---|---|
| 1. Automated metrics (free) | **NOT STARTED** | No script was run. No stale-probe, re-ask, must-reach, want-cue, fact-check, latency or cost number has been produced. |
| 2. Offline auditor (triage, cap $7) | **NOT STARTED** | No cost probe, no `--dry`, no audit call. $0.00 spent. |
| 3. Hand-read refusals / data lines / probes / corrections | **NOT STARTED** | **Zero transcript turns and zero turn records were read**, in any of the 31 runs. |
| 4. Comparison vs batches 36–38 and batch 31 | **NOT STARTED** | Batch 38's hand grading was read as method input only (see §3); no batch-39 figure exists to compare against it. |

**Faults identified so far: none.** No run, no turn, no severity. There is no
provisional fault list because no run content was read.

## 2. What was actually done (all free, all read-only)

Orientation only:

- Confirmed the worktree is on `phase1` at **db506bee** ("Merge phase1-prewave…"), clean apart from the untracked run folders.
- Confirmed all five batch-39 wave folders and all 31 run folders are present, with the expected persona subfolders:
  - `batch-39-brewbean-oct-26-runs-1-5` — 5 (07 Raj, 24 Marcus, 40 Jasmine, 57 Marisol, 64 Tyler)
  - `batch-39-aldermoor-oct-26-runs-1-5` — 5 (same five)
  - `batch-39-hollisbay-oct-26-runs-1-5` — 5 (same five)
  - `batch-39-larkspur-oct-26-runs-1-8` — 8 (the five + 65 Dana, 66 Remy, 67 Victor)
  - `batch-39-quillpath-oct-26-runs-1-8` — 8 (the five + 65 Dana, 66 Remy, 67 Victor)
  - Each run folder holds `live-run-2026-10-26-<id>.{json,log,md,turns.jsonl.gz}`. Example read: Raj's prof-002 run id is `52904ce7`. No other run id was looked up.
  - Each batch folder holds `manifest.json`, `budget-ledger.jsonl` and the launcher's `check-cost-batch-39-*.md`. **None of the budget ledgers or launcher cost reports was read**, so the $30.73 wave spend is Lorenzo's figure, unverified by me.
- Read **only** `batch-39-larkspur/manifest.json`'s head (the first run entry): `commit db506bee71f964eee965f46704eb03c4d489c753`, `interviewer claude-sonnet-5-5` / `interviewerConfig sonnet55-baseline`, `scoring claude-opus-5-5`, `case prof-002`, model check `ok: true`, and the 24 `engineSwitches` listed below. **The other four manifests were not read**, so neither the model check nor the switch list is verified for aldermoor, brewbean, hollisbay or quillpath.
  - The 24 switches on that entry: `itemCovers`, `tagMatching`, `stepLineage`, `mustReachPhase1`, `misquoteAnchors`, `askPhrasesInPrompt`, `worksheet`, `staleProbeDrop`, `rootLineage`, `misquoteFlat`, `probeGuardMethod`, `spokenMathParser`, `checkerDefinitions`, `correctionRules`, `restateRules`, `coarseKeepNamed`, `coarseNoRefusal`, `haikuTagGate`, `coverNormalization`, `wantCueBroad`, `modelDeferrals`, `closeWaitMitigation`, `recommendationReceived`, `ackRotation`. (Consistent with `*=phase1` and with `refusalNounCheck` / `recommendationOpensGate` being off, as briefed.)

Method input read in full:

- `evals/severity.md` (the frozen severity rules).
- `.superpowers/sdd/progress.md` — the "Now" block, the rules in force, and the batches table (batch 20 → batch 37 Quillpath). **Batch 31's row was read** ("Go (Lorenzo, 18 Oct…)", 0.36 firm + 0.55 borderline, 0 false, 0 serious, $6.29, 11 runs, 2 waves) — this is the prof-001 production-era comparison baseline for brewbean.
- `Case Interview Runs/test runs/batch-38-larkspur/hand-grading.md` in full — the severity refinements, the table shapes, the comparison-table shape, and the 8 open questions. This is the template the batch-39 grading should follow.
- Script headers / usage for `review-counts.ts`, `batch-scorecard.ts`, `fact-check.ts`, `check-cost-report.ts`, and `offline-auditor.ts` in full.

## 3. Blockers and gotchas found during orientation (worth keeping)

These are real, were found by reading code, and will cost the next session time if rediscovered:

1. **`SLICES` has no batch-39 entries.** `lib/eval/fault-bank-build.ts:15–27` ends at `b38l`. `offline-auditor.ts` resolves both `--batches=<tag>` and `--run=<turnfile>` through `runsOf(SLICES…)`, so **the auditor cannot address any batch-39 run until five slice entries are added** (tags for brewbean/prof-001, aldermoor/entry-001, larkspur/prof-002, quillpath/pricing-001, hollisbay/launch-001, each with its wave folder and `verdicts: null` as `b38l` does). This is an engine-code file — adding slices is arguably a grading-harness edit rather than an engine change, so **it needs Lorenzo's ruling** before the next session touches it. Without it, step 2 cannot run at all.
2. **The auditor's corpus root is hard-coded to the main checkout**, not the worktree: `ROOT = process.env.REPLAY_ROOT ?? '/Users/lorenzo/.../CaseTester/Case Interview Runs'` (`offline-auditor.ts`). Since the batch-39 runs live inside the worktree (per the "worktree wave runs" memory), **`REPLAY_ROOT` must be set** to `/Users/lorenzo/coding/personal-projects/CaseTester/.claude/worktrees/phase1/Case Interview Runs` or the auditor will not find the runs.
3. **The auditor's output must sit outside the corpus root** (it throws otherwise). `FAULT_BANK_OUT` defaults to `…/CaseTester-proof-out`, which is fine.
4. **Re-audits are free**: a run already audited under a `--label` is never re-audited, so a restart after the budget stops does not pay twice. Pick one label and keep it.
5. **`fact-check.ts` takes `--root`**, so the batch-38 trick of a scratch root holding only this wave works; `--group=batch-39` would also filter by label prefix. Per the brief it must run with `ENGINE_SWITCHES` **unset**.
6. **`check-cost-report.ts` writes `check-cost.md` into the first folder by default** — that would write under `Case Interview Runs/`. Pass `--out=-` (print only) or `--out=` into the scratchpad, so nothing new appears under the corpus.
7. **`batch-scorecard.ts` writes `scorecard.json`/`.csv`/`.md` into `Case Interview Runs/test runs/<batch>/`.** That is inside the corpus. It is untracked-and-never-added territory; fine to generate, but **never `git add`**.

## 4. What remains — everything

### Step 1, automated metrics (free) — all of it
Nothing gathered. Still owed: stale probes, stale corrections, recommendation
re-asks, mitigation re-asks, must-reach delivered, want-cue firings **and how
many were real asks**, fact-check F1/F2/F3/F4 + D-class counts, latency, check
cost and the per-run/per-wave cost split.

### Step 2, the auditor — all of it
Not started; blocked on §3.1. $7 cap unspent.

### Step 3, hand-reading — all 31 runs, every target turn class
**Nothing has been read.** Owed in full, for every one of the 31 runs: every
refusal, every data line, every probe, every correction, plus everything the
auditor flags. Specifically unread:

| Wave | Runs unread |
|---|---|
| brewbean (prof-001) | 5 of 5 — 07, 24, 40, 57, 64 |
| aldermoor (entry-001) | 5 of 5 — 07, 24, 40, 57, 64 |
| hollisbay (launch-001) | 5 of 5 — 07, 24, 40, 57, 64 |
| larkspur (prof-002) | 8 of 8 — 07, 24, 40, 57, 64, 65, 66, 67 |
| quillpath (pricing-001) | 8 of 8 — 07, 24, 40, 57, 64, 65, 66, 67 |

No scored report was read either (the brief says brewbean is all-scored and the
other four are scored on persona 24 only — **unverified by me**).

### Step 4, comparisons — all of it
Owed: batch 39 larkspur vs **batch 36 Larkspur / batch 38 Larkspur**, aldermoor
vs **batch 36 Aldermoor**, hollisbay vs **batch 37 Hollis Bay**, quillpath vs
**batch 37 Quillpath** (including whether the Quillpath probe-chain root is
corrected rather than repeated — the bar line that needs a direct read of the
chain, not a count), and brewbean vs **batch 31**. Only the batch-38 Larkspur
side of this has been read; batch 31's and batches 36–37's hand-gradings have
**not** been read.

### The report sections not written
The verdict-by-bar-line table, the per-case tables, the automated-metrics
tables, the per-run fault list with attribution, the comparison tables, the new-
persona (65/66/67) stress-test section, the serious/false candidate list for
Lorenzo's blind second grade, the 5 random sample run ids, the want-cue count,
and the "anything unexpected" list. **None of it exists.**

## 5. Exact commands to resume

From `/Users/lorenzo/coding/personal-projects/CaseTester/.claude/worktrees/phase1`.

Step 1 (free, safe to run in any order):

```bash
# fact-check — ENGINE_SWITCHES MUST BE UNSET (the overlay's misquote anchors
# otherwise make the detector itself see more misquotes).
env -u ENGINE_SWITCHES npx tsx scripts/fact-check.ts --group=batch-39 --flags

# check cost + latency, printed only, so nothing is written under the corpus
npx tsx scripts/check-cost-report.ts \
  "Case Interview Runs/test runs/batch-39-brewbean-oct-26-runs-1-5" \
  "Case Interview Runs/test runs/batch-39-aldermoor-oct-26-runs-1-5" \
  "Case Interview Runs/test runs/batch-39-hollisbay-oct-26-runs-1-5" \
  "Case Interview Runs/test runs/batch-39-larkspur-oct-26-runs-1-8" \
  "Case Interview Runs/test runs/batch-39-quillpath-oct-26-runs-1-8" --out=-

# the three per-turn fault counters + latency, per run
npx tsx scripts/review-counts.ts --runs
npx tsx scripts/review-counts.ts --hits=pending
npx tsx scripts/review-counts.ts --hits=grading
npx tsx scripts/review-counts.ts --hits=offer

# scorecards (one per batch folder; writes inside the corpus — never git add)
for b in batch-39-brewbean batch-39-aldermoor batch-39-hollisbay \
         batch-39-larkspur batch-39-quillpath; do
  npx tsx scripts/batch-scorecard.ts --batch=$b
done
```

Step 2 (paid; **only after Lorenzo rules on adding the five `SLICES` entries**,
§3.1). Cost probe first, then stop at the cap:

```bash
export REPLAY_ROOT="/Users/lorenzo/coding/personal-projects/CaseTester/.claude/worktrees/phase1/Case Interview Runs"
export LLM_BUDGET_USD=7
export LLM_BUDGET_FILE=/private/tmp/claude-501/.../scratchpad/wave39-auditor-budget.json

# free: prompt sizes and an input-cost estimate for all 31
npx tsx scripts/offline-auditor.ts --label=wave39 --dry --batches=b39p,b39a,b39h,b39l,b39q

# PAID one-run probe, then read the actual $ before going further
npx tsx --env-file=.env.local scripts/offline-auditor.ts --label=wave39 \
  --run="test runs/batch-39-larkspur-oct-26-runs-1-8/07-raj-the-slow-burner/live-run-2026-10-26-52904ce7.turns.jsonl.gz"

# then the rest, budget-stopped
npx tsx --env-file=.env.local scripts/offline-auditor.ts --label=wave39 \
  --batches=b39p,b39a,b39h,b39l,b39q --jobs=3
```

Step 3: read the turn records with `lib/eval/turn-file.ts`'s `readTurnFile`
(`parsedTurn` vs `delivered` to tell code lines from model lines; `checks` for
every decision), filtered to refusals, data lines, probes and corrections —
**not** whole transcripts.

## 6. Anything unexpected before stopping

- Only one: the `SLICES` gap (§3.1), which means the auditor step has a
  prerequisite the brief did not anticipate, and that prerequisite is an edit to
  a `lib/` file. Flagging rather than doing it, per "report a bug, don't fix it"
  and per the no-engine-code-changes rule. The conservative reading is that the
  next session should ask Lorenzo before adding the slices.
- Nothing else. **No observation about batch 39's interviewer behaviour has been
  made, because no run content was read.**
