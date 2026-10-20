# Shared-engine bundle, round 5b (Lorenzo's round-5 review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lorenzo's five round-5b items (R7 reversed, the 13:0 redo credit, E5 partial answers with a tighter check prompt, the held-question rule by question form, a reliable suite) plus his row-fix wording, prove them on the free replay and the 68-ask Haiku rerun, and stop.

**Architecture:** Small, independent changes to the live math checker (`math-checker-live.ts`), the scored report (`lib/scoring/checker-record.ts`), the data-request check (`data-requests.ts`, `turn-data.ts`), the ask matcher (`request-signal.ts`) and the row fix (`own-quantity.ts`). Each is proven by mutation tests in the transcripts' own words; the whole round by one replay and one paid check.

**Tech Stack:** TypeScript (Next.js), vitest 4, the replay runner (`tests/replay/runner-corpus.replay.test.ts`), the Haiku check script.

**Spec:** Lorenzo's message of 20 Oct, verbatim in `.superpowers/sdd/handoff-2026-10-20-round5b.md` (on `engine-asks`), quoted per task below. Round-5 context: plan `docs/superpowers/plans/2026-10-20-engine-asks-round5.md`, ledger `.superpowers/sdd/2026-10-20-engine-asks-round5/progress.md`, proof `Case Interview Runs/replays/2026-10-20/engine-asks/r5-final.md` and `r5-haiku-check.md` (main checkout).

## Global Constraints

- Branch `engine-asks`, worktree `.claude/worktrees/engine-asks`, BASE b79ffae (code = 7bf0ccc). Nothing merged, pushed or deployed. The only paid call is the Haiku rerun in Task 59 (≈ $0.08, authorized; script cap $0.10).
- One commit per task, with the full suite, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db` passing.
- Every code task has **mutation tests**: the new test fails when the fix is reverted or broken (record it in the task report).
- Test sentences are the transcripts' own words, verbatim.
- Never `git add` anything under `Case Interview Runs/`. Never read `.env*`. No migrations.
- Lorenzo's rules in force: "Code corrects a computed figure only with the checker's agreement"; "not X" only on code's own quantity (own-quantity framing); rule 1 refined ("a refusal is serious when the held answer never reaches the candidate, borderline when it's already in front of them"); his 13 Oct 4b ("As I mentioned" only for a re-ask of the same item; a narrower ask the case doesn't hold gets "I don't have …").
- Ledger: `.superpowers/sdd/2026-10-20-engine-asks-round5b/progress.md`.

## Review Focus

1. **R7's correction must be true on her own reading.** The derived claim's correction goes only through own-quantity framing (`framedCorrection`) with the checker's flag; no true line → the report. Pinned in Task 54: b33 Marisol t14 says the 4.2 line; a derived claim with no framed correction still goes to the report.
2. **The redo credit is figure-bound.** A later message stating the right figure for another quantity must not credit the claim. Pinned in Task 55 with a constructed negative.
3. **A partial answer's spoken refusal never carries a figure or words the candidate didn't ask.** The check's `missing` phrase is validated (no digits; its content words come from the ask); else the ask's own words. Pinned in Task 56.
4. **A partial item already out, or held by a gate, never restates or leaks.** Out → "I don't have <part>." alone (4b, E1's ruling); held (release order, `requiresItems`, exhibit gating) → as E1 treats a held coarse item. And #12 prof-001 Fiona t4 stays a release with no refusal. Pinned in Task 56.
5. **The question-form rule must not make statements questions.** The voice exports' statements that open like questions ("So what we need to look at is the revenue and costs.", "could be things like COGS, things like labor costs, as well as...", "and do it very slowly…") stay statements. Pinned in Task 57.

---

### Task 53: The suite passes at full parallelism (job 5)

Lorenzo: "5. Make the suite reliable at full parallelism (cap workers or raise those tests' timeouts)."

Background: default `npx vitest run` timed out 2–13 tests at load average 27 (15 cores), e.g. `tests/orchestrator/code-line-variants.test.ts` "rec_ask: never one of the last 3 uses…" and `tests/orchestrator/phrasing.test.ts` "never one of the pool's last 3 uses…"; both pass alone in < 5 s.

**Files:** `vitest.config.ts`; the slow tests' files if their timeouts are raised.

- [ ] Run `npx vitest run` twice (default config) and list every timed-out test with its duration (the report).
- [ ] Set a worker cap in `vitest.config.ts` (`maxWorkers`, vitest 4 option; a fraction such as `'50%'` or a fixed number, chosen from the measured runs) and give the pool-history tests that loop over many seeds an explicit timeout (e.g. 30 s) — both, unless one alone makes both runs pass.
- [ ] Prove: two default `npx vitest run` passing back to back, with the wall-clock time of each (record the load average from `uptime` before each). No test logic changes.
- [ ] Commit.

### Task 54: R7 reversed — a derived claim gets its own correction once when its root goes to the report (job 1)

Lorenzo: "1. R7 reversed: when a root goes to the report without a code line, the derived claim gets its own vetted correction once, through own-quantity framing (b33 Marisol 11:0 "about 4.2 points of revenue, not 5.8"). The root probe at t12 stays."

Background (`r5-task-46.md` R7, `r5-final.md`): b33 Marisol `test runs/batch-33-oct-19-runs-1-10/57-marisol…` run 31e33506. Root 9:0 (beans "0.25 × 58 = 14.5 points", right 10.5) is probed at t12 ("You took beans as 25% of the 58 points of COGS. Which year does that 25% refer to, and what was COGS then?") and left for the report at t13 with no code line. 11:0 ("Beans are 5.8 points of the 16-point COGS increase", right 4.2) is built on it and goes `unresolved`, "built on a closed input (…)", so t14 never says "Bean inflation's contribution …, in points of revenue, is about 4.2 points, not 5.8."

**Files:** `lib/orchestrator/math-checker-live.ts` (`onClosedRoot`, the riders loop's `closedNow` branch, the E7 waiting loop's `closedNow` branch — every "built on a closed input" path where the root has **no** delivered correction), its tests (`tests/orchestrator/math-checker-live*.test.ts`).

- [ ] Write the failing tests:
  - b33 Marisol's 11:0 claim, its root closed for the report with no line said (`p.corrected` has no entry for the root): the selection is a `correct` on 11:0's own key with `framedCorrection`'s line, which contains "about 4.2 points" and "not 5.8"; the decision reason names the closed root;
  - the next turn with the same state plus that line said: 11:0 is not selected again; its decision is `unresolved` with a reason containing "left for the report" (once);
  - a derived claim on a root left for the report whose `framedCorrection` gives no line (no true line on the candidate's reading): `unresolved`, "built on a closed input" — unchanged;
  - a derived claim on a root **corrected** live (`p.corrected[root].line` set): unchanged (the root's correction once more, ruling 1, then the report);
  - the root's own probe (t12's line) is unchanged.
- [ ] Run them; they fail.
- [ ] Implement: in each path above where the root closed with no correction line, the derived claim becomes eligible on its own key for one attempt that can only be a correction — `correctionOf(id, n, c, key, attempt)` (own-quantity framing, `framedCorrection`, the checker's flag required as today); no probe, pointer or hint; none → the report as now. Record the one attempt so it is never said twice (the existing `saidTwice`/attempt bookkeeping, or a `derivedOnce` set in the checker's flags — no migration). Under time pressure a minor one is shed as a flag is.
- [ ] Run the tests; they pass. Mutation: revert the path → the first test fails.
- [ ] Free replay (proof.sh, label `r5b-54`) and compare against `r5-final2`: b33-on Marisol t14 says the 4.2 line; list every other changed prof-001 decision and line (intended / regression) in `replays/2026-10-20/engine-asks/r5b-task-54.md`. 0 regressions.
- [ ] Commit.

### Task 55: The report credits a later redo of a claim left for the report (job 2)

Lorenzo: "2. 13:0: the report credits a later redo of a claim already left for the report."

Background: b33 Marisol 13:0 (14.5 restated) is `unresolved` "restated after the flag closed" at t15; her t19 "beans were 0.25 × 42 = 10.5 points of revenue" redoes it to the right figure, but the scored report's MATH CHECKER section (`formatCheckerSection`, read by the judge as the WRONG list) says "Restated after it had been probed or corrected."

**Files:** `lib/scoring/checker-record.ts` (`formatCheckerSection`, `outcomeText`), `lib/scoring/score-session.ts:207` (pass the candidate turns), `tests/scoring/checker-record.test.ts`.

**Interfaces:**
- Consumes: `isStale(c, later, caseData, revealedIds)` from `lib/orchestrator/math-checker-live.ts:291` (the E6-bound redo reader, unchanged).
- Produces: `formatCheckerSection(rows, redo?: { candidateTurns: { turnIndex: number; text: string }[]; caseData: CheckerCase; revealedIds: string[] })` — the second argument optional so other callers stay unchanged.

- [ ] Write the failing tests (rows built from b33 Marisol's recorded `math_checker` events for 13:0):
  - with her t19 text after 13:0's last decision: the line for 13:0 ends "The candidate redid it correctly later (turn 19): "<her sentence>"" and not "Restated after it had been probed or corrected.";
  - the same with no later redo: unchanged text;
  - a later message stating 10.5 for another quantity (constructed: "the other inputs added 10.5 points") does not credit 13:0 (figure-bound);
  - a claim with outcome `correct` or `stale` is unchanged.
- [ ] Implement: for a flagged claim whose last outcome is `unresolved` (any reason) or `expired`/`shed` after a probe, read the candidate turns after that decision's turn with `isStale` (only a redo to the right figure counts, not a withdrawal); the first hit gives the credit line, quoting the sentence that carries the figure. The closing instruction ("Treat a WRONG claim as the candidate's error unless they revised it") already makes it a self-correction.
- [ ] Run the tests; they pass. Mutation recorded.
- [ ] Commit.

### Task 56: E5 partial answers and the tighter check prompt (job 3)

Lorenzo: "3. E5 partial answers: the check reports per mapped item whether it fully answers or is only the nearest held data. Partial → E1's form ("I don't have <the asked part>." + the item's line). Tighten the check prompt to the item that holds the answer, with the r5-haiku negatives (#48 → Option B is closer; #64 and #67 → cohort_notes). #12 is fine (Exhibit A shows margin by year)."

Background: `checkAsk` (`lib/orchestrator/turn-data.ts`) calls the generic detection classifier (`classifyDataRequests`, `lib/orchestrator/data-requests.ts`) with `Could I get ${what}?` and the catalog (id: label). `decideCheckedAsk` maps its verdict to `named | refuse | items | coarse`; `coarse` is E1's form. The Haiku check's non-answering rows (`r5-haiku-check.md`): #12, #30, #42, #48, #60, #63, #64, #66, #67.

**Files:**
- `lib/orchestrator/data-requests.ts` — a check-only prompt and parser (new exports below); the generic detection prompt and `classifyDataRequests` are unchanged (the message classifier, post-turn and scoring keep using them);
- `lib/orchestrator/turn-data.ts` — `checkAsk` calls the new check; `CheckVerdict` and `decideCheckedAsk` read `partial`;
- `lib/orchestrator/data-decisions.ts` / the E1 refusal path — the refusal says the partial's `missing` part;
- `tests/replay/runner-corpus.replay.test.ts` and `lib/eval/recorded-checks.ts` — recorded or `REPLAY_CHECKS` verdicts without the new fields read as all `full`;
- tests: `tests/orchestrator/data-requests.test.ts`, `tests/orchestrator/turn-data*.test.ts`.

**Interfaces (produced):**
- `buildAskCheckPrompt(what: string, catalog: AskCheckItem[]): string` and `parseAskCheckResponse(raw: string, what: string, catalog: AskCheckItem[]): AskCheckResult | null`, with `type AskCheckItem = { id: string; label: string; line: string }` (`line` = the item's value with every figure replaced by `#`, built in code; never a raw figure — FR-4) and `type AskCheckResult = { items: { id: string; answers: 'full' | 'partial'; missing?: string }[] }`.
- `classifyAsk(params: { what: string; catalog: AskCheckItem[]; onUsage?: OnUsage }): Promise<AskCheckResult | null>` (same model, `DATA_REQUEST_MODEL_ID`; usage logged as `data_request`).
- `CheckVerdict` gains `partial: string[]` and `missing: Record<string, string>`; `CheckedAsk`'s `coarse` gains `missing?: string`.

- [ ] Write the prompt (exact rules to state, in the prompt's words):
  - map the ask to the item(s) that **hold the answer** to what was asked; an item on the same topic that doesn't hold it is no mapping;
  - per mapped item, `"answers": "full"` when its line answers the ask, `"partial"` when it holds only the nearest data and not the asked part; with partial, `"missing"`: the asked part it lacks, in the ask's own words, no numbers;
  - examples (from the Haiku check, by meaning, with their case names): "whether any US player has an existing Corlan's franchise" → the partner option (`option_b`, an established US company) is closer than Aldermoor's own size; "Starter cohort beyond month 12" → the cohort notes (`cohort_notes`), not the month-1-to-12 cohort table; "churn for upgraded customers measured from their upgrade date" → `cohort_notes` ("upgraded customers then behave like Pro customers"), not `upgrade_timing`; "operating margin over the period" → the cost shares by year (`cogs_pct`, `labor_pct`, `overhead_pct`) answer it in full (Exhibit A shows margin by year).
- [ ] Write the failing tests:
  - prompt: contains every catalog id with its label and masked line; no digit from any item's value appears in the prompt;
  - parser: ids outside the catalog dropped; `answers` missing → `full`; `missing` with a digit, or with a content word not in the ask → replaced by the ask's `what`;
  - decision: a verdict with one `partial` item not yet out and releasable → E1's form: the refusal "I don't have <missing>." plus the item's line (b31 Sofia t8 #30 "coffee beans as a share of COGS today" → "I don't have coffee beans as a share of COGS today." beside the bean-share line, or the refusal alone when that item is already out, per 4b);
  - a `partial` item already out → the refusal alone, no restate (E1's ruling; #64 if mapped to the out `starter_cohort`);
  - a `partial` item held by the release order or `requiresItems` → treated as E1 treats a held coarse item (the gated-item test, Review Focus 4);
  - mixed `full` + `partial`: the full items decide as `items` today; the partial ones are dropped;
  - #12 prof-001 Fiona t4 verdict all `full` → released with no refusal;
  - an old recorded verdict (no `answers`) → identical decision to today (replay compatibility).
- [ ] Run them; they fail.
- [ ] Implement as the interfaces say. `checkAsk` builds the catalog's masked lines once per case (cache on the plan state like `catalog`), keeps the 1.5 s cap and the `itemless_defer` record (add `partial`, `missing`, `latencyMs` as today, and the call's input/output tokens and cost so the next wave can log the check's cost per session).
- [ ] Run the tests; they pass. Mutation recorded. Free replay `r5b-56` vs the previous label: expected 0 changes (recorded verdicts read as full); list any.
- [ ] Copy `.superpowers/sdd/2026-10-20-engine-asks-round5/haiku-check.ts` to `.superpowers/sdd/2026-10-20-engine-asks-round5b/haiku-check.ts` (gitignored) calling `classifyAsk` with the same catalog `checkAsk` builds, writing `haiku5b-verdicts.json` (ids, answers, missing, tokens, cost, latency), budget cap `LLM_BUDGET_USD=0.10`; ask list `/private/tmp/claude-501/-Users-lorenzo-coding-personal-projects-CaseTester/3b909bed-928b-4864-a212-7c396cd967d0/scratchpad/haiku5/asks.json` (copy it into the round5b folder first). Do **not** run it (Task 59 runs it). Print the estimated cost from prompt lengths (chars / 4 × $1/M input + 60 output tokens × $5/M per call) into the report.
- [ ] Commit (code and tests only).

### Task 57: The held-question rule detects question form (job 4)

Lorenzo: "4. Voice check (free): in the existing voice exports, how often do the candidate's questions carry "?". If often not, the held-question rule detects question form, not "?"."

Count (controller, 20 Oct; 14 voice sessions with transcripts, `Case Interview Runs/voice-live/2026-10-17 … 2026-10-19`, 63 candidate turns): 18 direct questions, 4 without "?" (22%) — "So what was the suite" (0f1b28ea t1), "Do we have information about total sales or pricing." (44174f51 t17, a data ask), "What am I doing" (f3b07c57 t5), "Would you be able to summarize the the information I have so far that you revealed" (314295e0). 1 of the 3 question-form data asks lacks "?". Stated needs ("I would like to see how COGS has been changing in the past two years.") never carry one. Ruling: build it (one data ask in three is "often" for a rule that loses the ask).

**Files:** `lib/orchestrator/request-signal.ts` (`matchAskDetections`, the `held` branch: `askSentencesOf(held.text).filter(isQuestionSentence)`), `lib/orchestrator/stall.ts` (add `isQuestionForm`; `isQuestionSentence` unchanged — its other callers keep "?"), `tests/orchestrator/request-signal*.test.ts`.

**Interfaces (produced):** `isQuestionForm(sentence: string): boolean` in `lib/orchestrator/stall.ts` — true when the sentence ends in "?" and opens like a question (today's `isQuestionSentence`), or, with no "?", opens (after fillers "so", "and", "uh", "um", "okay", "yeah", "sorry", "also") with a wh-word followed by an auxiliary or a noun-phrase verb of inversion ("what was", "what am I", "how many", "which") or an auxiliary followed by a subject ("do we", "does it", "can I", "could you", "would you", "is there", "are there", "have you").

- [ ] Write the failing tests (verbatim):
  - question form, no "?": "Do we have information about total sales or pricing.", "So what was the suite", "What am I doing", "Would you be able to summarize the the information I have so far that you revealed";
  - not a question: "So what we need to look at is the revenue and costs.", "and where I would start is COGS, um, because, yeah, I think that would...", "could be things like COGS, things like labor costs, as well as...", "and do it very slowly and gradually rather than hiking up the prices immediately, um, as that could really anger the customers and and lose us some loyalty.", "And in addition to that, I would like to see how COGS has been changing in the past two years.";
  - `matchAskDetections` with `held`: Task 49's existing tests pass unchanged; a held item named in "Do we have information about total sales or pricing." (no "?") is kept; the same words as a statement are dropped.
- [ ] Run them; they fail. Implement. Run them; they pass. Mutation recorded.
- [ ] Commit.

### Task 58: The row fix in Lorenzo's wording

Lorenzo: "Accepted as built: … the E7 row fix (wording "At month 12, 21.5% of Pro customers and 40% of Starter customers had cancelled.")".

**Files:** `lib/orchestrator/own-quantity.ts` (`rowFix`), its tests, and any test pinning "The cancelled figure at month 12 is …".

- [ ] Change the test expectations to "At month 12, 21.5% of Pro customers and 40% of Starter customers had cancelled." (b35q Marisol t12), and the restated t16 line likewise.
- [ ] Build the sentence from the case data (the exhibit row/column labels and cells the row fix already reads), not hard-coded: "At <column>, <cell A> of <row A> customers and <cell B> of <row B> customers had <the row's state>." — derive the state word from the row label ("Cancelled" → "had cancelled"); a row label it can't turn into a verb phrase falls back to today's form (test it).
- [ ] Run the tests; they pass. Mutation recorded. Commit.

### Task 59: Proof (Lorenzo's bar)

Lorenzo: "Proof: free replay on all 21 slices, plus a rerun of the 68-ask Haiku check (≈ $0.08, authorized): 0 wrong releases, 0 bare partial answers, hollow ≤ 2, 0 refusals of an ask a ledger item fully answers."

- [ ] Free replay: `zsh proof.sh r5b-final` (cwd = worktree) and `zsh compare.sh r5-final2 r5b-final`. Write `replays/2026-10-20/engine-asks/r5b-final.md`: every changed prof-001 decision and line, intended / regression (0 regressions to pass); b33 Marisol t14 says the 4.2 correction; F1/F3/F4 per slice; new-case changes by task.
- [ ] Haiku rerun (paid, cap $0.10): `npx tsx --env-file=.env.local .superpowers/sdd/2026-10-20-engine-asks-round5b/haiku-check.ts` (plain command, no `cd`, no redirect). Convert to `haiku5b-replay-checks.json` (`{run, turn, what, ids, answers, missing}`), `REPLAY_CHECKS=… zsh proof.sh r5b-haiku`, compare against `r5b-final`, and read each ask's outcome from the `-on` slices by hand.
- [ ] Write `replays/2026-10-20/engine-asks/r5b-haiku-check.md` in `r5-haiku-check.md`'s format: per ask the full/partial verdicts, `missing`, outcome and interviewer line; totals; the four bar counts (wrong releases, bare partial answers, hollow deferrals, refusals of an ask a ledger item fully answers), each with its rows; cost, p50/p95 latency, timeouts.

### Task 60: Docs

- [ ] PRD body: mark approved by Lorenzo (20 Oct) — the E6 binder rules (head-noun binding, condition stripping except at vs/versus, kind words only with their quantity, it/that back-reference, operand labels) and F1; the E7 row fix (his wording) and co-occurrence rule; the count rule; the controller's round-5 rulings 2 and 4–17 (list in the ledger's header). R7 reversed and the 13:0 credit, E5 partial and the check prompt, the question-form rule, as his decisions. Log b35q Marisol 7:2 (a false close; cross-sentence subject binding, not built) and b29 Owen's `avg_ticket` (stays, his 16 Oct rule).
- [ ] PRD §16: a new entry for round 5b (the round-5 entry stays as written); §15 status; `docs/case-onboarding.md` Next; progress.md "## Now"; the voice "?" counts.
- [ ] Commit; stop and report to Lorenzo. No wave, push or deploy.
