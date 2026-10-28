# Shared-engine bundle, round 5c (Lorenzo's round-5b review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lorenzo's round-5b rulings (the qualifier guard for bare partials, one derived correction per root, the "?"-dependent checks), prove them on the free replay and a capped 68-ask Haiku rerun, and — only if every pre-authorized condition holds — run and grade waves B1′ and B2′.

**Architecture:** An engine guard after the check's verdict (`checkAsk` / `decideCheckedAsk`) that overrides Haiku's "full" when the ask names a qualifier the item's line lacks; a narrowing of Task 54's per-claim correction to per root in `math-checker-live.ts`; question-form detection wherever a "?" test on candidate text gates an ask or a stage.

**Tech Stack:** TypeScript (Next.js), vitest, the replay runner, the Haiku check script, `scripts/persona-batch.ts`.

**Spec:** Lorenzo's message of 20 Oct (round 5b reviewed), quoted per task below; the round-5b plan `docs/superpowers/plans/2026-10-20-engine-asks-round5b.md` and its ledger `.superpowers/sdd/2026-10-20-engine-asks-round5b/progress.md`; the proof `Case Interview Runs/replays/2026-10-20/engine-asks/r5b-haiku-check.md` (main checkout).

## Global Constraints

- Branch `engine-asks`, worktree `.claude/worktrees/engine-asks`, BASE 3377fdc (code = d900622). No push, merge or deploy.
- One commit per task, with the full suite, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db` passing; mutation tests for every code task; test sentences verbatim from the transcripts.
- Never `git add` under `Case Interview Runs/`; never read `.env*`; no migrations.
- Lorenzo: "Paid calls: state a hard cap and stop at it." Haiku rerun: hard cap **$0.12** (`LLM_BUDGET_USD=0.12`). Waves: hard cap **$40 total** across B1′ + B2′.
- Lorenzo's accepted round-5b rulings 1–19 stand, except ruling 11 (changed, Task 62).
- Ledger: `.superpowers/sdd/2026-10-20-engine-asks-round5c/progress.md`.

## Review Focus

1. **The guard's refusal is true and asked.** It names only the qualifier and the ask's own head noun, never a figure or word the candidate didn't say; and a qualifier the line does state (the asked period is on the line) never triggers it. Pinned in Task 61 by the "true full answers stay full" tests.
2. **A guard-made partial obeys E1.** Item not yet out and releasable → its line + the refusal; out or gated → the refusal alone; never a restate without the refusal. Pinned in Task 61.
3. **One derived correction per root never silences the root's own line or ruling 1's restatement.** Pinned in Task 62.
4. **A "?" check switched to question form must not turn statements into asks or close a stage early.** Pinned in Task 63 with the voice exports' statements.
5. **The waves never exceed $40.** One shared budget file across both waves' processes; dry runs first.

---

### Task 61: The qualifier guard (ruling 1)

Lorenzo: "1. Bare partials: build an engine guard. If an ask names a qualifier the item's line doesn't contain (a period: FY2024, "since <date>", "today/current", "beyond month N", "later/earlier cohorts", "trend"; a scope: industry, competitor(s), market; or a second topic with no item), that item counts as partial whatever Haiku labels it, and the refusal names the qualifier ("I don't have FY2024 fares.", "I don't have industry benchmarks."). Mutation tests from #18, 36, 49, 63 and 66 verbatim, plus true full answers that must stay full. No model switch now."

**Files:** a new `lib/orchestrator/ask-qualifiers.ts` (the qualifier reader and the refusal phrase), `lib/orchestrator/turn-data.ts` (`checkAsk` / `decideCheckedAsk`: apply the guard to each mapped item before deciding), tests `tests/orchestrator/ask-qualifiers.test.ts` and `tests/orchestrator/checked-ask.test.ts`.

**Interfaces (produced):**
- `askQualifiers(what: string): Qualifier[]` with `type Qualifier = { kind: 'period' | 'scope' | 'topic'; text: string }` — periods: a fiscal/calendar year or quarter ("FY2024", "2024", "Q3"), "since <date>", "today"/"current"/"now", "beyond/after month N", "later/earlier/newer/older cohorts", "trend"/"over time"/"has moved"; scopes: "industry", "competitor(s)"/"competitive", "market"/"benchmark(s)"; topics: each conjunct of the ask (split at "and", "or", "including", commas) with its own content noun.
- `unmetQualifiers(what: string, itemLines: { id: string; label: string; value: string }[]): Qualifier[]` — a qualifier is met when the item's line (server-side value, unmasked) or label states it: the same period token; a "trend" when the line states two or more periods or a change ("up from", "fell from … to"); a scope word or its synonym; a topic conjunct whose content words are in some mapped item's label or line.
- `guardRefusal(what: string, unmet: Qualifier[]): string` — "<qualifier> <the ask's head noun>" from the ask's own words ("FY2024 fares", "industry benchmarks", "later cohorts' upgrade rates", "Pro's CAC since January 2025", "current waste rates"); the result passes the round-5b `missing` validation (no word the ask lacks; figures only those the candidate said).

- [ ] Write the failing tests:
  - from the second run (`r5b-haiku-check.md`), verbatim asks with Haiku's "full" verdicts: #18 "current waste rates and bean contracting terms", #36 "industry input cost inflation benchmarks", #49 "the fare trend across FY2024 and FY2025", #63 "upgrade rates for later cohorts", #66 "how Pro's CAC has moved since January 2025" → each item partial, refusal naming the qualifier;
  - true full answers that stay full (from the same runs; at least: #12 "operating margin over the period" with the cost shares; #30-shaped asks where the period is on the line; an ask whose qualifier the line states, e.g. a fare ask for FY2025 against the FY2025 fare; #67 "churn for upgraded customers measured from their upgrade date" with cohort_notes, if its qualifier is met — else document why);
  - E1 outcomes for a guard-made partial: not out → line + refusal; out → refusal alone; gated → refusal alone;
  - the post-turn number audit accepts a refusal carrying the candidate's own figure ("FY2024") — or the refusal drops the figure (test which);
  - the guard never applies to the model's own mapped requests or the message classifier's path (scope: the check's verdicts only) — unless the implementer shows a bare partial there in the corpus (report it).
- [ ] Run them; they fail. Implement. They pass. Mutation recorded.
- [ ] Free replays: `proof.sh r5c-61` vs `r5b-fix` (expect 0 changes with recorded verdicts) and with the second run's verdicts (`REPLAY_CHECKS=…/haiku5b2-replay-checks.json`) vs `r5b-fix-haiku` — list every changed line, verdict each against the bar.
- [ ] Commit.

### Task 62: One derived correction per root (ruling 3)

Lorenzo: "3. Ruling 11 changed: one derived correction per root, not per derived claim; the root's other derived claims go to the report."

**Files:** `lib/orchestrator/math-checker-live.ts` (Task 54's once path: `toReport`, the `once` entries, `derivedOnce` bookkeeping), its tests (`tests/orchestrator/math-checker-live-derived-once.test.ts`, `input-probe-cap.test.ts`, `math-checker-live.test.ts`).

- [ ] Write the failing tests: two derived claims on one root left for the report with no line (the b35q no-exhibit variant: 7:3 corrected, 9:2 next turn under ruling 11) → only the first (by the queue's existing order) gets its correction; the other goes to the report with a reason naming the root and "one correction per root"; b33 Marisol t14's 4.2 line unchanged; the report text (checker-record) for the second claim reads the root's outcome.
- [ ] Implement: key the "once" record by root, not by claim. Run tests; mutation recorded.
- [ ] Free replay `r5c-62` vs `r5c-61`: list changes (expected: none in prof-001 beyond b33 if any; list every one).
- [ ] Commit.

### Task 63: The "?"-dependent checks (ruling 4)

Lorenzo: "4. Ruling 6: list every remaining "?"-dependent check and what it gates (free). Fix any that gates asks or stages in this round; log the rest."

**Files:** inventory in `.superpowers/sdd/2026-10-20-engine-asks-round5c/question-checks.md`; fixes where they gate asks or stages (e.g. `lib/orchestrator/stall.ts` data-ask detection, `lib/orchestrator/request-signal.ts:87/:105`, `brainstorm.ts:72`, `fact-check.ts:659` — whatever the inventory finds), tests.

- [ ] Inventory: every `endsWith('?')`, `/\?/`, `isQuestionSentence` or equivalent applied to **candidate** text (interviewer text is code- or model-written and keeps its "?"), with: file:line, what it reads, what it gates (an ask's detection or release, a stage's credit or close, a stall/no-progress count, a clarify count, a report mark …), and the verdict (fix now: gates asks or stages; log: anything else).
- [ ] For each "fix now": switch to `isQuestionForm` (or "?" OR question form), with a test from the voice exports' unpunctuated questions ("Do we have information about total sales or pricing.", "So what was the suite", "What am I doing", "Would you be able to summarize the the information I have so far that you revealed") and the statement negatives (Review Focus 4). Mutation per switch.
- [ ] Free replay `r5c-63` vs `r5c-62`: list changes (text personas write "?", so expect few).
- [ ] Commit (code + tests; the inventory file is gitignored — copy its table into the docs in Task 66).

### Task 64: Proof (Lorenzo's conditions)

Lorenzo: "Here: rerun all 68 asks after the guard, hard cap $0.12, which also measures the stop fix. Free replay on all 21 slices as before."

- [ ] Free replay `zsh proof.sh r5c-final`; `zsh compare.sh r5-final2 r5c-final` and `compare.sh r5b-fix r5c-final`; write `replays/2026-10-20/engine-asks/r5c-final.md`: every changed prof-001 decision and line vs r5-final2, intended / regression; **0 prof-001 regressions** to pass; F1/F3/F4.
- [ ] Haiku rerun, hard cap $0.12: script `.superpowers/sdd/2026-10-20-engine-asks-round5c/haiku-check.ts` (copy of 5b's, `LLM_BUDGET_USD ??= '0.12'`, output `haiku5c-verdicts.json`, the stop on a null with no usage kept), plain command `npx tsx --env-file=.env.local .superpowers/sdd/2026-10-20-engine-asks-round5c/haiku-check.ts`. Replay its verdicts (`REPLAY_CHECKS`) through the guard and judge each ask by hand → `replays/2026-10-20/engine-asks/r5c-haiku-check.md` (r5b format).
- [ ] The conditions, each with its rows: **0 wrong releases, 0 refusals of an ask a ledger item fully answers, hollow deferrals ≤ 2, bare partials ≤ 2, timeouts (over 1.5 s) ≤ 2**, and the replay's 0 prof-001 regressions. All met → Task 65. Any failed → stop and report.

### Task 65: Waves B1′ and B2′ (pre-authorized on Task 64's conditions)

Lorenzo: "run B1′ (prof-002 + entry-001) and B2′ (pricing-001 + launch-001), 5 runs each with the onboarding personas, all scored, hard cap $40 total, dry runs first. Log the check's cost and added latency per session. If any condition fails, stop and report. Grade the waves; I'll do the blind second grade."

- [ ] Before the wave: the per-session log of the check — from each session's `itemless_defer` records and `ask_check` usage rows (Task 4d245e0): calls, cost, timeouts, late rows, added latency (sum and max of `latencyMs` on turns that waited) — added to the batch summary / budget ledger the launcher writes (free code in `scripts/` or `lib/eval/`, with a test; commit).
- [ ] Batch names: next free numbers (batch 36 for B1′, 37 for B2′; per case `batch-36-larkspur`, `batch-36-aldermoor`, `batch-37-hollisbay`, `batch-37-quillpath`), personas 7, 64, 57, 24, 40, all scored, the round-5 launcher flags (as batch 34/35: human pace, 25-minute clock, `--interviewer=sonnet55-baseline`, checker on).
- [ ] Dry runs (`--dry`, free) for all four; then one shared hard cap: `LLM_BUDGET_USD=40` with one `LLM_BUDGET_FILE` for all four processes. Launch with the plain command form, `run_in_background`, `caffeinate -i -t 4200`; B1′'s two cases in parallel, then B2′'s two (or all four if the dry-run estimate is well under $40 — state it).
- [ ] Copy the wave folders to the main checkout's `Case Interview Runs/test runs/` (`cp -R`; never git add).
- [ ] Grade every run (transcripts and reports read) under his rules (rule 1 refined; unit slips false not serious; hollow deferral = firm moderate; the same probe 3+ times serious) → `hand-grading.md` per batch folder, with the check's per-session cost and latency and the `partial_dropped` count (ruling 2).

### Task 66: Docs

- [ ] PRD body + §15 + a new §16 entry (round 5c: his rulings verbatim, built, evidence, the "?" inventory table, proposed-by-controller rulings, waves and grades); `docs/case-onboarding.md` tracker; progress.md "## Now"; batch table rows for 36/37. Commit; stop and report. No push, merge or deploy.
