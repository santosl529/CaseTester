# Shared-engine bundle, round 2 ("engine-asks" rulings on the proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lorenzo's eight rulings on the engine-asks free proof (19 Oct), then rerun the free proof against `final2` and list every prof-001 change.

**Architecture:** Same branch and the same proof tooling as round 1. Every change is deterministic code or case data, apart from R1's existing Haiku check, which only gets a shorter timeout and a wider scope. Each task is proved by the free replay against the previous label.

**Tech Stack:** TypeScript, vitest, the runner replay, `proof.sh` / `compare.sh` (`Case Interview Runs/replays/2026-10-19/engine-asks/`).

**Spec:** Lorenzo's rulings on the proof, 19 Oct (quoted per task below). Round 1's plan is `docs/superpowers/plans/2026-10-19-engine-asks.md`. Its proof files are `final.md`, `final-fixes.md` and `summary.md`.

## Global Constraints

- Branch `engine-asks` (worktree `.claude/worktrees/engine-asks`), HEAD 473979a. Nothing merged, pushed or deployed. Nothing paid.
- One commit per task, with passing `npx vitest run`, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db`.
- The proof per task: `proof.sh <label>` and `compare.sh <previous label> <label>`, outputs outside the corpus root (`PROOF_OUT` default). List every changed checker decision and delivered interviewer line on prof-001 (b28–31, checker on and off), marked intended (with its ruling) or regression, in `replays/2026-10-19/engine-asks/r2-task-N.md`. A regression stops the task.
- Each task's commit updates `docs/case-onboarding.md` for its item (standing rule). The PRD and progress.md are written once, in Task 17.
- Lorenzo's words are quoted verbatim in each task. His "Accept your other provisional rulings" (ruling 8) makes every round-1 controller ruling his; the PRD records them so in Task 17.

## Review Focus

1. A later claim at the old wrong value after the root was corrected live gets the restatement once, never twice, and never when the root closed without a live correction. Pinned in Task 11.
2. R1's check timing out at 1.5 s must give a named deferral, never a refusal, including on item-less releases. Pinned in Task 13.
3. "We won't get to <ask> today." is said only on wrap-up/close turns, and only for an ask the check mapped to an item. Pinned in Task 13.
4. The narrowed prof-002 cover must still map the cost-breakdown asks it was written for. Pinned in Task 15 by the anchor-audit replay.
5. Close hold with an inherited rating must not hold the close twice for one root. Pinned in Task 14.

---

### Task 16: The two parked edge cases (ruling 6) — first, since Tasks 11 and 14 build on the same code

Lorenzo: "Fix the two parked edge cases (the held probe expiring after its claim was dropped; ordered log rows)."

**Files:** `lib/orchestrator/plan-turn.ts` (~654–661 the `gateOutcomes` map, ~910–925 `codeProbesHeld`), `lib/orchestrator/math-checker-live.ts` (`gateCodeFindings` expiry, `CHECKER_MAX_WAIT_MESSAGES`). Tests: `tests/orchestrator/stage-deadlines.test.ts`, `tests/orchestrator/math-checker-live.test.ts`.

- (a) A code probe held on a deadline-made stage turn is treated as not released when the checker plan reads `gateOutcomes` that turn, so the checker's claim isn't dropped against it. When the gate re-gates the held finding, it is exempt from expiry, like the checker's own held line.
- (b) The `code_gate` rows are sorted by `turnIndex` (then insertion order) before the "last decision wins" map is built.
- [ ] Failing tests first:
  - held probe → the checker's claim isn't deduped that turn;
  - the re-gate past `CHECKER_MAX_WAIT_MESSAGES` still releases it;
  - rows given out of order build the same map as rows in order.
- [ ] Implement; focused tests, then the full suite, tsc and eslint; commit.
- [ ] Proof: label `r2-16` vs `final2`. Expected 0 changes (no corpus hit). Write `r2-task-16.md`.

### Task 11: A later claim at the corrected wrong value gets the correction once more (ruling 1)

Lorenzo: "when the root was corrected live (code said the right value) and a later claim still uses the old wrong value, code restates the root's correction once ("<root> is <right>, not <wrong>"), then report-only. b28 Jordan t19 and b29 Jordan t9 should get that line. A root closed without a live correction (attempts ran out) keeps today's behaviour: its claims follow it to the report."

**Files:** `lib/orchestrator/math-checker-live.ts` (the root-linking post-pass that gives "built on a closed input"), `lib/orchestrator/plan-turn.ts` (booking, the turn's one math line), `lib/scoring/checker-record.ts` (report text). Tests: `tests/orchestrator/math-checker-live.test.ts`, `tests/orchestrator/plan-turn.test.ts`.

- A root key closed by a delivered correction records that (e.g. in `flags.mathChecker`: the root key, the right value, the delivered line).
- A later claim derived from that root (it carries the wrong figure) is selected once as action `'restate'`. Its line is the root's correction in the form "<root quantity> is <right>, not <wrong>". Reuse the delivered correction line when it has that form; otherwise build it from the root's vetted correction (no new figure — FR-4).
- The restatement is once per root, then report-only (`'unresolved'`, "built on a corrected input — restated once"). It takes the turn's one math line, like a correction, and rides on overdue stage turns (R7).
- A root closed without a live correction keeps today's "built on a closed input".
- [ ] Failing tests:
  - root corrected live, then a derived claim at the wrong value → `'restate'` with the line;
  - a second such claim → `'unresolved'`, no line;
  - root closed by attempts running out → "built on a closed input", no line;
  - b28 Jordan t19 and b29 Jordan t9, as fixtures from their recorded verdicts → the restatement selected.
- [ ] Implement; tests; commit.
- [ ] Proof: label `r2-11` vs `r2-16`. Expected: b28 Jordan t19 and b29 Jordan t9 gain the line, plus any other prof-001 restatements, each listed.

### Task 14: Close hold uses the inherited rating (ruling 4)

Lorenzo: "Close hold: a root inherits the highest rating among the claims riding on it."

**Files:** `lib/orchestrator/plan-turn.ts` (close hold: `finalSel` ~932, the rank ~946/949, `sel.claim.changesConclusion` ~961), `lib/orchestrator/math-checker-live.ts` (`CheckerSelection` carries the inherited rating: `changesConclusion`, final-answer flag, rank). Tests: `tests/orchestrator/plan-turn.test.ts` (close-hold cases).

- A selection for a root carries the highest `changesConclusion`, final-answer flag and rank among its riders. Close hold reads those, not the root's own claim.
- The once-per-figure limits are unchanged: `probedAlready` and `heldCloseHold` are keyed by the root.
- [ ] Failing tests:
  - a minor root whose rider is in the final answer and changes the conclusion → the close is held for it;
  - the same root again → no second hold.
- [ ] Implement; tests; commit.
- [ ] Proof: label `r2-14` vs `r2-11`. List every change.

### Task 13: R1 on every code refusal; a 1.5 s cap; "We won't get to … today." at the close (rulings 2 and 3)

Lorenzo (2): "R1 covers every code refusal of an unmatched ask, item-less releases included, not only deferrals (overrules your provisional #4). Cap the Haiku check at ~1.5s; on a timeout or error, use the named deferral, never a refusal." (3): "Wrap-up/close turns: an item-less ask the check maps to an item gets "We won't get to <ask> today." instead of "I'll come back to…"."

**Files:** `lib/orchestrator/turn-data.ts` (`itemlessDeferHeld` / `turnDataChecked`, the timeout), `lib/orchestrator/data-decisions.ts` (the item-less release → `refusals` path at ~318), `lib/orchestrator/session-runner.ts` (`codeWrittenTurn`'s detections), `lib/orchestrator/phrasing.ts` (a new line `wont_get_to`, Lorenzo's wording only, one variant). Tests: `tests/orchestrator/itemless-defer.test.ts`, `tests/orchestrator/data-decisions.test.ts`.

- Every explicit ask code would refuse because it maps to no item goes through the check first. That covers item-less releases, item-less deferrals, basis-emptied asks and code-written turns' item-less detections:
  - mapped to an item outside the basis cut → a named deferral;
  - mapped to none → refused;
  - timeout, error or null → a named deferral.
- What doesn't change: asks with an item that the scope rules empty for a finer cut (per store, by month…) stay refused as today. Ruling 2 says "unmatched ask", and these matched an item that can't answer them. Prompt-fact restates are also unchanged.
- The check's timeout drops from 3 s to 1.5 s.
- On wrap-up and close turns, a named deferral is said as "We won't get to <ask> today." instead of "I'll come back to…". Wrap-up/close means kinds `close`, `close_wait` and `grace_ask`, the time warning, and RECOMMENDATION/WRAP-phase turns after the recommendation is received. One flag in the code defines the set.
- [ ] Failing tests:
  - an item-less release, mapped → deferral; none → refused; timeout → deferral;
  - the timeout is 1.5 s;
  - a code-written turn's detection goes through the check;
  - on a close turn, mapped → "We won't get to … today.";
  - a mid-case turn → "I'll come back to…".
- [ ] Implement; tests; commit.
- [ ] Proof: label `r2-13` vs `r2-14`.
  - The replay mocks the check to null, so every item-less release in batches 28–31 that was refused becomes a named deferral, or "We won't get to … today." at the close.
  - List each, with the ask. These are intended by ruling 2, but read each one, because a refusal that was true now becomes a deferral in the replay only. Live, the check would refuse it.

### Task 15: Narrow prof-002's "cost breakdown" cover (ruling 5)

Lorenzo: "Narrow prof-002's "cost breakdown" cover so the true "I don't have the fixed cost breakdown" (b22 Omar t14) isn't withheld."

**Files:** `cases/prof-002.json` (the `covers` on `fuel_prices`, `unit_costs`, `fixed_costs`). Tests: the case tests, plus `scripts/anchor-audit.ts --asks=evals/anchor-asks-batch32.json` and `--asks=evals/anchor-probes.json` (free replay mode).

- Replace the bare "cost breakdown" phrase with phrases that name what each item holds: per-flight cost, fuel, unit costs. Find the asks it was written for in the anchor-audit inputs and keep them mapped. "Fixed cost breakdown" must cover nothing, since the case holds no split of the $20M fixed cost.
- [ ] Add a probe to `evals/anchor-probes.json`: "the fixed cost breakdown" maps to no item.
- [ ] Add a fact-check test: Omar's sentence isn't an F3 flag.
- [ ] Run the anchor-audit replay of the batch-32 asks: no mapping change except the intended one.
- [ ] Validate the case (`CaseSchema.safeParse`); commit.
- [ ] Proof: label `r2-15` vs `r2-13`. prof-001 must be 0/0. List the b22l/b32 changes.

### Task 17: Docs and the free proof against final2

- [ ] `proof.sh r2-final` and `compare.sh final2 r2-final`. Write `replays/2026-10-19/engine-asks/r2-final.md`:
  - every changed checker decision and delivered line on prof-001 (b28–31, on and off), each with the ruling that caused it and intended/regression;
  - the new-case slices;
  - F1–F4 and D counts before and after.
  - The union must equal the per-task lists.
- [ ] Docs, one commit:
  - PRD §5.x (behaviour) and §15 for each ruling;
  - a §16 entry: rulings 1–8 as Lorenzo's (19 Oct); every round-1 controller ruling is now his by ruling 8, so drop "proposed" for them;
  - case-onboarding: the gaps list gets the "$77 million" figure-before-quantity form (ruling 7), the tracker's Next line, and a lessons line;
  - progress.md "## Now".
- [ ] Stop and report to Lorenzo (he approves wave A after reading).
