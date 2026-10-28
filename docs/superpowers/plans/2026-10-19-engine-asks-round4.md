# Shared-engine bundle, round 4 (Lorenzo's rulings on wave A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the own-quantity false correction (Marisol b33 t14) and the wave-A stale, late-probe and leads faults. Run a free sweep of own-quantity over b20–b33 and a free proof over prof-001 b29–b33 plus b32. Put the own-quantity fix alone on a hotfix branch off main. Stop: no paid run, no push, no deploy.

**Spec:** Lorenzo's rulings on wave A (19 Oct), quoted per task. The grading is `Case Interview Runs/test runs/batch-33/hand-grading.md`. Earlier plans: `2026-10-19-engine-asks*.md`.

## Global Constraints

- Branch `engine-asks`, HEAD 0efed9b. Nothing merged, pushed or deployed, and nothing paid.
- One commit per task, with the full suite, tsc and eslint passing.
- Each code task has **mutation tests**: the new test must fail when the fix is reverted or broken (record it), not only before it is written.
- Proof chain: `r4-base` (HEAD 0efed9b, with b33 slices) → r4-26 → … → r4-final. Slices: prof-001 b29, b30, b31, b33 (checker off and on; b28 is kept as extra coverage), plus b32 and b22l. List every changed prof-001 decision and line, marked intended or regression, in `r4-task-N.md`. **0 new false corrections.**
- Each task's commit updates case-onboarding. The PRD and progress.md are written in Task 34.

## Review Focus

1. A "not X" line whose X is in a different unit or base from the line's own figure must never be spoken. Pinned in Tasks 27 and 28.
2. 9ccf0836 T24's conversion line still fires. Pinned in Task 27.
3. A flag closes as stale only on a figure stated for the claim's own quantity. Pinned in Task 29.

---

### Task 26: Proof tooling for b33

- Extract b33's checker verdicts (`to-verdicts.py batch-33-oct-19-runs-1-10` → `replays/2026-10-19/engine-asks/b33-verdicts.jsonl`).
- Add slices b33-off and b33-on to `proof.sh`, with the CK list plus the b33 verdicts. `compare.sh` picks them up.
- Run `proof.sh r4-base` at 0efed9b. Check determinism: run `proof.sh r4-base2` and compare it with r4-base; it must be 0/0.
- No repo code change; the tooling stays untracked.

### Task 27: own-quantity — read the base the candidate named (ruling 1)

Lorenzo: "own-quantity (Marisol t14): fix it now on engine-asks. Your reading fix is right: "points of the N-point COGS increase" means revenue points, and "points of revenue" in any mention of her figure wins. Add one guard: the "In COGS terms … not X" line fires only when every mention of their figure that has a unit names the COGS base. Otherwise use the checker's own revenue-terms line. Write mutation tests for the b33 Marisol t11/t13 wording. 9ccf0836 T24 must still get its conversion line."

**Files:** `lib/orchestrator/own-quantity.ts` and its callers' tests.

- "points of the N-point COGS increase" (and close variants) is revenue points.
- "points of revenue" in any mention of the candidate's figure in the message (or the messages the claim spans) wins over a COGS reading.
- The guard: the "In COGS terms … not X" line fires only when every mention of their figure that carries a unit names the COGS base. Otherwise the checker's own revenue-terms line is used.
- Mutation tests:
  - b33 Marisol t11 and t13, verbatim → no "In COGS terms … not 5.8" line; the revenue-terms line instead;
  - 9ccf0836 T24 (`Case Interview Runs/voice-live/2026-10-18/`, `replays/2026-10-18/tools/replay-9ccf.ts`) → its conversion line still fires;
  - the b29 and b30 false-correction wordings (find them in their hand-grading.md) → no false line.
  - Each test fails when the guard or the reading fix is removed.
- Proof: label r4-27 vs r4-base.

### Task 28: The free own-quantity sweep, b20–b33 (ruling 1)

Lorenzo: "also run a free sweep: take every candidate figure in the prof-001 transcripts from b20 to b33 that has a base word (COGS, revenue, margin, increase) within 40 characters, and list what own-quantity would say for each before and after the fix. Flag any "not X" whose X is in a different unit or base from the line's own figure."

- A scratch script (no repo change). For every prof-001 run in batches 20–33, every candidate message, every figure with a base word (COGS, revenue, margin, increase) within 40 characters: own-quantity's reading and the line it would produce, at r4-base (before) and at Task 27's commit (after).
- Write `replays/2026-10-19/engine-asks/r4-own-quantity-sweep.md`:
  - counts;
  - every case where before and after differ;
  - **every "not X" line whose X is in a different unit or base from the line's own figure**, before and after, each read by hand.
- After the fix, the flagged list must be empty, or each remaining entry explained and ruled. Any remaining wrong line goes back to Task 27 as a finding.

### Task 29: A flag goes stale only on a figure for its own quantity (ruling 3)

Lorenzo: "Stale check (Blake t17): a figure closes a flag as stale only when it's stated for the claim's own quantity. That's my 15 Oct redo rule applied to the stale check. Blake counts against the bar: t17 was the recommendation reply, where every flag holds the close."

**Files:** `lib/orchestrator/math-checker-live.ts` (`isStale`: the "right figure stated since" branch, `rightToCheck`, the redo and concession paths).

- The right figure closes a flag as stale only when it is stated for the claim's own quantity: in a sentence naming the claim's quantity (`quantityWords`), as the 15 Oct redo rule already requires for case figures. The same goes for NEEDED_KINDS prices and the rebased branch.
- A bare figure elsewhere in the message ("a 10–12% price increase" for a points claim) no longer closes it.
- Mutation tests:
  - b33 Blake t17 ("6 to 7 points" with "a 10–12% price increase" later) → not stale;
  - a true redo in a sentence naming the quantity → stale;
  - the existing redo tests still pass.
- Proof: label r4-29 vs r4-27.

### Task 30: A late bare probe quotes its claim (ruling 4)

Lorenzo: "Blake t22: the cut-down probe "Walk me through how you got there." arrived two turns after its claim (t19), behind the follow-up question, so "there" pointed at his first-step answer. His t19 flag was effectively never probed. A bare probe said later than the turn right after its claim must quote the claim."

**Files:** `lib/orchestrator/math-checker-live.ts` (the selection: `neutralProbe`, the cut-down probe), `lib/orchestrator/phrasing.ts` (the probe pools).

- A probe line is "bare" when it names no figure or quoted words of the claim ("Walk me through how you got there."; neutral pool lines without a slot).
- When the probe is said on any turn other than the one right after its claim's message, it must quote the claim, using the claim's own figure or span words from the verdict's `span`/`candidateValue`. Use an existing quoted-probe form (e.g. "You said <figure> — walk me through how you got there.") or the checker's own probe line when that quotes the claim. Never a new figure (FR-4: the candidate's own words only).
- Mutation tests:
  - b33 Blake t19 → t22: the probe quotes his t19 figure;
  - a probe on the very next turn may stay bare.
- Proof: label r4-30 vs r4-29.

### Task 31: The leads check ignores period words and prompt figures (ruling 5)

Lorenzo: "Leads check: the t9 verdict's first probe was held back because "two years" was counted as naming 2. That probe was the right one, and it would have come before any correction. Period words and figures already in the case prompt don't count as leading."

**Files:** `lib/orchestrator/math-checker.ts` (the leads check that withholds probes: `probe withheld (leads: …)`), and wherever it reads figures named by a probe.

- Period words ("two years", "2 years", "year one", "last year", "FY2025") and figures that appear in the case prompt don't count as leading figures in a probe or pointer.
- Mutation tests:
  - the b33 t9 verdict's first probe (find the run in hand-grading.md) → not withheld;
  - a probe naming an unrevealed or right figure → still withheld.
- Proof: label r4-31 vs r4-30.

### Task 32: Variants for the checker's "You said …" probe opener (ruling 6, wording only)

Lorenzo: "Opener variants for the checker's "You said …" line: build them only if wording-only, with the quoted words unchanged."

**Files:** `lib/orchestrator/phrasing.ts` (a pool for the opener), `math-checker-live.ts` or wherever the checker's probe gets "You said …".

- The opener rotates through about 5 wording-only variants: "You said …", "You mentioned …", "Earlier you said …", "You put it at …", "You had …". The quoted words and figure are unchanged, and only the lead-in varies.
- If the probe line comes from the checker LLM verbatim ("You said X; …"), swap only a leading "You said" for a variant and nothing else. If that can't be done wording-only, don't build it; report and log it.
- Tests: the variants cycle, and the quoted span is byte-identical.
- Proof: label r4-32 vs r4-31 (wording changes only).

### Task 33: Logs, not built (ruling 6)

Add to case-onboarding's gaps list and PRD §15, each as Lorenzo ruled:
- Tyler's "31.5 points" Better answer: false, minor. The report verifier should check Better-answer figures with their period.
- **Proposed rule:** a direct question about the interviewer's own figure is answered before a due stage question, and the stage question can follow in the same turn (Marisol t19).
- The report's interviewer-error marks should cover code's own lines too (Marisol's report). Build later.
- Hollow deferrals are counted in every grade (ruling 7).

This can be folded into Task 34's docs commit.

### Task 34: The free proof and docs

- `proof.sh r4-final`; `compare.sh r4-base r4-final`. Write `r4-final.md`:
  - every changed prof-001 decision and line (b29–b33, plus b28 as extra), each with its ruling and intended/regression;
  - the b32 and b22l slices;
  - counts, and **new false corrections: 0** (any "not X" line in r4-final not in r4-base, read by hand).
  - The union must equal the per-task lists.
- Docs, one commit:
  - PRD §15 and §16: the rulings as Lorenzo's, controller rulings proposed, and his approval of the round-3 decisions 1–5;
  - case-onboarding: tracker, gaps (Task 33), a lessons line;
  - progress.md "## Now".

### Task 35: The hotfix branch off main (ruling 2) — only after r4-final is clean

Lorenzo: "Once the proof is clean, put the own-quantity fix alone on a branch off main (hotfix-own-quantity), with its tests. Don't merge, push or deploy."

- Create a worktree `.claude/worktrees/hotfix-own-quantity` on a new branch `hotfix-own-quantity` off `main`. Apply Task 27's own-quantity change and its tests alone, adapted only where main differs.
- Run the full suite, tsc and eslint on it. Run a free replay of prof-001 b29–b33 from that worktree against main (base) and list every change. Only own-quantity changes are allowed; anything else is a mismatch, to report.
- Commit, with no push, merge or deploy. Report the branch head for Lorenzo's deploy decision.
