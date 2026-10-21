# Phase 1 handoff (21 Oct 2026, paused at the token cap)

Lorenzo's Phase 1 brief: fix the remaining faults inside today's engine, prove them on free replays, then one paid wave including Brew & Bean. No rewrite of the turn pipeline. Paused at his +2M agent-token cap, to resume after his usage reset. **No wave has run. Nothing is merged to `main`, pushed or deployed.**

## Where to start

1. This file.
2. `docs/superpowers/plans/2026-10-22-phase1-contract.md` — the contract, with Lorenzo's Step 0 rulings at the end.
3. The stream reports in this folder: `stream-1-report.md`, `stream-2-report.md`, `stream-3-report.md`, `stream-4a-report.md`, `stream-4b-report.md`. Streams 3 and 4a wrote theirs as resumption documents.

## Branches and worktrees

Base: `engine-asks` 022d5d8c (round 6 plus the batch-38 docs). Integration branch `phase1`, worktree `.claude/worktrees/phase1`.

| Branch | Worktree | State |
|---|---|---|
| `phase1` | `.claude/worktrees/phase1` | The contract (0f932c89), the production guard and rulings (121702c2), Stream 2 merged (e49799d9) |
| `phase1-s2-cases` | `.claude/worktrees/phase1-s2-cases` | Done, reviewed, fixed, **merged** |
| `phase1-s1-eval` | `.claude/worktrees/phase1-s1-eval` | Done; review verdict in; **not merged** |
| `phase1-s3-math` | `.claude/worktrees/phase1-s3-math` | Tasks 1–2 done, task 3 part-built; **not reviewed, not merged** |
| `phase1-s4-fixes` | `.claude/worktrees/phase1-s4-fixes` | All six tasks committed, replay owed; **not reviewed, not merged** |
| `phase1-s4b-fixes` | `.claude/worktrees/phase1-s4b-fixes` | Done, replayed; review verdict in; **not merged** |

Every stream worktree has `node_modules` and `.env.local` symlinked to the main checkout.

## What is built

### Step 0 — the contract (merged)

- `lib/cases/engine-switches.ts` — 23 per-case switches, one per Phase 1 behaviour change. Off is today's behaviour. Resolution: `ENGINE_SWITCHES` (evaluation only), then a case-file `engine` pin, then off. `assertNoEngineSwitchesInProduction` refuses to boot in production mode with the variable set (Lorenzo's D2 guard).
- `lib/cases/phase1-overlay.ts` — Phase 1 case data lives in `cases/phase1/<id>.json` and is merged per switch at load, so a case with every switch off loads byte-identically.
- New optional fields in `lib/cases/schema.ts`: item `tags`, `askPhrases`, `coverExcludes`; exhibit `summary`; case `definitions`, `mustReach[].why`, `engine`. `noFigure` enforces FR-4 on anything speakable.
- `lib/orchestrator/worksheet-types.ts` — the worksheet API. Code-side only; a test forbids prompt code from importing it.
- `lib/eval/fault-bank.ts` — the fault-bank record and assertion schema.

### Stream 2 — case data (merged, reviewed, fixed)

722 overlay covers across the five cases, 74 exclusion words on 33 items, item tags on all 106 items, 334 askPhrases, 55 definitions, 45 dependsOn entries, 14 exhibit summaries, 3 misquote anchors. prof-001 gets `factTags`. Must-reach: prof-002 3 (added `competitor_costs` before exhibit-3), launch-001 2, pricing-001 1; entry-001 and prof-001 proposals only, per Lorenzo's Q3 ruling. askPhrases reach the model in the cached prompt behind `askPhrasesInPrompt`.

Cover lint (`scripts/phase1-cover-lint.ts`) on the merged view: **0 wrong gains, 0 unsure, 0 new collisions, 0 containments** in all five cases (and prof-001 twice, with tagMatching off and on). Narrowing cost three previously-right gains (b32 Larkspur Marisol t1, b38 Larkspur Marisol t1, b37 Quillpath Jasmine t1 — all `network_totals`/`starter_cohort`).

Review-driven fixes: four risky cover families dropped or qualified, the `why_pro_fell` askPhrase and the prof-001 definition's "menu prices are flat" leak removed, forecast tags corrected, **pricing-001's `steps` removed from the overlay so round 6's lineage stays as authored**, entry-001 `net_price` inputs added.

### Stream 1 — evaluation (done, not merged)

- **Fault bank:** 310 records (211 fault, 99 correct) in `evals/fault-bank/<batch>.jsonl`, built from specs in `evals/fault-bank/specs/`. 167 fault records replayable, 44 not. Baseline on the contract base: **0 wrong assertions**; 106 fault records fail as expected, 51 already fixed by rounds 4–6, 95 of 99 correct records pass, 14 diverged.
- **Harness:** `scripts/fault-bank.ts` (`build`, `check`, `wave-list`, `run --switches=`), about 25 seconds over 54 runs.
- **Haiku labels:** all 78 ask-check calls in b33–b38 labelled (`evals/ask-check-labels/`). Precision on positives 27% strict, 61% counting partly-right; false-none rate 26%.
- **Offline auditor:** `scripts/offline-auditor.ts`, $3.62 of its $25 cap. Against 112 hand-graded faults on b36–b38: recall 86%, precision 51%, severity agreeing on 65% of matches.
- **Personas** 65 Dana, 66 Remy, 67 Victor appended; their bands change the bands hash, so a new wave on an existing batch needs `--new-version`.
- **Switch record** in the run header and batch manifest.
- `evals/fault-bank/wave-judged.md` lists all 44 non-replayable records with what in the wave would show each fixed (Lorenzo's Q2 ruling).
- **A bug found on the base, still open:** b35 Quillpath Tyler t28 — code says "about $0.24k, not $210k" where the truth is about $240k. A scale slip in a code-written correction. Sent to Stream 3.

### Stream 4b — small fixes (done, not merged)

4.6 want cue (`wantCueBroad`, classifier share 0.14% → 1.72% on b28–b38), 4.8 close_wait mitigation (`closeWaitMitigation`), 4.9 recommendation received (`recommendationReceived`, all five time-warning re-asks gone), 4.10 acknowledgment rotation (`ackRotation`, "Understood." openers 511 → 254 of 1,571, consecutive repeats 140 → 0), 4.11 scoring retry (no switch).

**Switches off: byte-identical** — 0 changed lines and 0 changed checker decisions on all 29 slices plus b38 Larkspur. Switches on: 1,208 changed lines, 1 changed checker decision, fact-check counts identical to the base on every slice.

4.11 brought `scoring-claim.ts` across from `main` 58911e63 and extended it: a running pass renews its claim, and the score row is written in one transaction that first checks the claim token. Four tests in `tests/scoring/scoring-retry.test.ts` prove one report row under a retry, two concurrent callers, a retry after a successful write, and a claim taken over mid-retry. **The SQL itself is unverified** — it is the codebase's first `db.transaction`, and no database was available.

**Its review returned: approve with fixes on 4.6, 4.8, 4.9 and 4.11; approve on 4.10.** It confirmed switch-off identity independently, re-deriving the b38l slice itself, and walked every interleaving of the claim: **two report rows are not possible**. Required fixes before merge are listed below.

### Stream 3 — math (tasks 1–3 done, 4–7 owed, not reviewed)

Committed: bb2fbda5 task 1 (`worksheet`), 65404519 task 2 (`staleProbeDrop`), 3ed763eb task 3 (`rootLineage`) plus the scale slip fix, c7b6037c its resumption report. 5,195 tests pass, tsc and eslint clean.

**Replay evidence over 26 slices (free).** Switches off: 0 changed lines after tasks 1 and 2, and **exactly 1** after task 3 — the scale fix itself (b35q Tyler t28 "about $0.24k, not $210k" → "about $0.24 million, not $210k"). prof-001 identical throughout. `*=worksheet` 0/0, and `*=stepLineage` with the overlays present 0/0, so the root-expansion requirement holds.
- `*=worksheet,staleProbeDrop`: 11 drops, each classified — 7 fixed (including both b38 Marisol firm faults, the t16 stale probe and the t24 stale correction), 3 neutral, 1 replay artifact. **0 new false corrections.**
- `*=rootLineage`: 13 changed lines, each lineage's chain of derived corrections collapsing into one root correction prefixed by the case's definition — **including b37q Marcus, PRD §15's M2 root corrected for the first time.**

**Owed:** tasks 4–7; finishing the turn-by-turn classification of the `rootLineage` arm's 88 changed decisions; re-running the `stepLineage,rootLineage` arm against the committed revision; then its high-effort review. Its report names these as the first resumption steps.

Q1 is built as approved, with extra guards that the root's value is still the candidate's and not withdrawn. Q5 is unspent: the command for the lead is in its report §4, to be checked against `scripts/eval-math-checker.ts`'s real flags when task 7 is built. **The scale slip is fixed and deliberately ungated** (`codeCorrection` in `math-checker.ts`), with tests.

Judgement calls for Lorenzo: the worksheet trusts code's step bindings only on a case whose binding is validated (`stepFlagsLive`); "instead of X" counts as a withdrawal only in the candidate's own redo; "built on a withdrawn figure" is stale only for a misread of the data they fixed; the root is probed once, not twice, before code corrects it.

### Stream 4a — data path (done and replayed, not reviewed)

All six tasks committed: 4.1 `restateRules`, 4.2 `coarseKeepNamed`, 4.3 `haikuTagGate`, 4.4 `refusalNounCheck`, 4.5 `coverNormalization`, 4.7 `modelDeferrals`, plus 84537234 making cover matching read the overlay's `coverExcludes`. 5,231 tests pass; 78 new tests, every guard mutation-checked.

**Its replay finished before the stop. Switches off: byte-identical** across all 31 slices — 0 changed lines, decisions, data turns or check calls. **Switches on: 67 changed lines, every one classified** — **6 graded faults fixed** (b38 Tyler t2 and Jasmine t4, the two false "split" refusals; Tyler t22 the doubled 90-word restatement and t24 the hollow deferral; b38 Marcus t24; b35q Raj t12), **0 new false refusals, 0 new wrong releases** (5 new releases, each answering its ask), 61 neutral. Check calls 258 → 254. Stream 2's overlays were tested against by copying them in untracked, then deleting them.

Two judgement calls change behaviour if Lorenzo rules otherwise: **J5** — one shared key noun defers, turning 24 *true* refusals into deferrals that the wrap-up closes (tightenable to the head noun in one line); **J3** — the tag gate withholds a line that doesn't answer the ask and is never asked for again (b34l Marisol t30 `unit_costs`).

**Still owed:** its high-effort review.

## Required before merging Stream 4b (from its review)

1. **HIGH, a real bug — `clearRecommendation` false positives** (`stall.ts:105-108`). "Raise the question of whether…", "Exit would cost $40 million…", "Keep looking at the cost side first…", "Sell-through is down 12%…" and "Build cost is $40 million…" all return true, so any of them can set `recommendationDelivered` and open the end gate with no recommendation given. Fix: reject a match followed by a hyphen or a copula/auxiliary, extend the lookahead exclusions, or require a decision frame.
2. **HIGH, product — 4.9's early close needs Lorenzo's ruling before the wave.** Jasmine b34a closing at 9.9 minutes is formally legitimate (a real recommendation at t19, risk asked at t15), but it loses the eight post-recommendation pushback turns the base run had. Pushback is one of the eight rubric dimensions, so early finishers lose its evidence. The narrow alternative — feed `recJustGiven` to the time warning only, and don't set `recommendationDelivered` — is what the contract's literal 4.9 asks for.
3. **MEDIUM — 4.6's share denominator.** 1.72% is 25 of 1,455 *candidate* turns, but the call can only fire on a model turn: 2.27% of model turns, 3.16% of want-phase model turns. At or just over Lorenzo's ~2% cap on the denominator that matters. Report both and get his call.
4. **MEDIUM — 4.8's action-word test is too loose.** Bare nouns match: "the $300 million board **test** is on net sales" skips the mitigation ask, and `SAID_FIRST` fires on a bare "first". The review gives a concrete tighter rule (require -ing/-ed forms, a decision frame within ~3 words, or an object construction).
5. **MEDIUM — the retry layers multiply.** The SDK already retries 429/5xx twice, and `isStreamDeath` retries them again, so one such error can cost up to 9 HTTP attempts plus 10s of sleeps. The genuine gap is only the mid-stream death. Fix: drop the 429/5xx branch, or pass `maxRetries: 0` on those three calls.
6. **MEDIUM — a late-dying pass can breach the 300s route budget** with the extra backoff, writing nothing, so the next attempt pays for everything again. Fix: thread a deadline into `withStreamRetry`, or raise `maxDuration`.
7. **MEDIUM — the transaction's runtime risk.** drizzle's postgres-js `transaction()` uses `client.begin`, which suits Supavisor's transaction mode, and `prepare: false` is already set — so it should work. But if it fails it fails *after* all three Opus passes are paid. Cheapest mitigation: a `try/catch` fallback in `storeIfClaimed` to the non-transactional conditional insert, plus one read-only transaction smoke check before the wave.
8. **LOW — a rotated ack can precede a correction:** "Mm-hm. Starter value is about $1,400, not $1,205." Skip the rotation when the turn carries a correction.
9. **Merge care:** `score-session.ts` must be merged hunk by hunk, not "take ours" — main differs in unrelated lines where this branch carries newer engine-asks content. `scoring-claim.ts` and its test are add/add; take this branch's.

## What remains, in order

1. **Stream 3:** tasks 4–7, the unfinished `rootLineage` classification and the re-run arm, then its high-effort review.
2. **Stream 4a:** its high-effort review (its replay is done).
3. **Stream 4b:** the required fixes above, in one round.
3. **Merges into `phase1`:** Stream 1, then Stream 3, then Stream 4a and 4b. Run the fault bank after each merge, with switches off and with `*=phase1`, and report what changed.
4. **A test that resolves itself at merge:** on Stream 3's branch, `tests/cases/phase1-contract.test.ts` "today's cases load unchanged" fails when Stream 2's overlays are copied in, because the overlay always attaches the descriptive fields. Stream 2's review fix already handles this, and the test passes on `phase1` with the overlays merged — so it needs nothing beyond the merge. Expect conflicts between Streams 3, 4a and 4b in `turn-data.ts`, `phrasing.ts` and `math-checker-live.ts` (Stream 4b gated 4 lines in Stream 3's `math-checker-live.ts`).
5. **Known merge conflict:** Stream 4b carries `main`'s scoring claim, so `scoring-claim.ts`, `score-session.ts` and the score route will conflict when `phase1` later meets `main`. Take the `phase1` version; it contains main's.
5. **The gate** (contract §6): every replayable fault record passing with `*=phase1`; every correct record passing both ways; 0 new false refusals, wrong releases or false corrections across b28–b38; prof-001 identical with switches off on the 21 standard slices; latency and model calls reported; tokens per stream, merge and review reported.
6. **The $3 live definitions re-check** (Lorenzo's Q5), run by the lead at the gate, under `LLM_BUDGET_USD`.
7. **Stop and ask.** The wave needs Lorenzo's explicit go even if the gate holds: 31 runs, $50 hard cap, `ENGINE_SWITCHES='*=phase1'`, graded auditor → hand → his blind second grade.

## Open for Lorenzo at the gate

- **stepLineage turns round-6 step roots on for prof-001, prof-002, entry-001 and launch-001**, because `stepRootsDeclared` keys off authored lineage. Stream 3 is required to keep that off unless `rootLineage` is on, and to keep probing an independent slip on an intermediate step. Same family as Q4.
- **4.9's side effect:** a received recommendation opens the end gate, so five runs close 3–8 minutes earlier (two Jasmine runs at about 10–11 of 25 minutes). Should 4.9 only stop the re-ask?
- **4.8:** what should close_wait ask when the answer already covered the mitigation, the first step and a checkpoint? 15 turns hit this.
- **The scoring transaction's** first real use would be in the wave. Enough confirmation?
- **pricing-001 `churn_breakeven_at_60`** should list `pro_ltv` as an input — a proposed case edit, not made.
- **entry-001 `option_a`/`option_b`** forecast tagging may expose a gap in the case's own forecast list.
- **prof-001 must-reach** (`non_bean_input_change`): the ruling's test is met weakly, on one run (b31 Sofia t21, firm). Kept as a proposal.
- **Aldermoor must-reach** proposal: `nimbrel` before exhibit-2, from four runs that never released it (b32 Jasmine, b34 Jasmine, b34 Marisol, b36 Jasmine; two graded serious).
- **T5 deviation:** the prompt lists every item's askPhrases, not only unrevealed ones, to keep the cache prefix stable. Accepted by the lead; worth his nod.

## Spend

- **Money:** $3.62 in all, Stream 1's auditor calibration, of its $25 cap. Nothing else cost anything.
- **Agent tokens, 2,433,980 at the pause** (Lorenzo's +2M cap, passed):

  | Stream | Build | Review |
  |---|---|---|
  | 2 — case data | 318,846 | 219,831 |
  | 1 — evaluation | 651,219 | in flight at the pause |
  | 4a — data path | 590,136 | not started |
  | 4b — small fixes | 438,457 | 215,491 |
  | 3 — math | part-spent | not started |

  Merges and the lead's own work are not in the table; the three fault-bank runs and the 29-slice gate replay are still owed.
