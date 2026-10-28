# Shared-engine bundle, round 3 (Lorenzo's rulings on round 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lorenzo's seven rulings on round 2. Run the live Haiku check on the 34 prof-001 asks, then the free proof against `r2-final`. If the proof shows 0 regressions and the Haiku check shows no wrong release, run wave A, grade it, and stop before B1.

**Architecture:** Same branch, the same proof tooling and the same review loop as rounds 1 and 2.

**Spec:** Lorenzo's rulings on round 2 (19 Oct), quoted per task. Earlier plans: `2026-10-19-engine-asks.md` and `2026-10-19-engine-asks-round2.md`. The round-2 proof is `r2-final.md`.

## Global Constraints

- Branch `engine-asks`, HEAD dac2640. Nothing merged, pushed or deployed.
- Paid: only Task 23's live check (a few cents, authorized) and, if both conditions hold, wave A (authorized, cap $10).
- One commit per task, with the full suite, tsc and eslint passing.
- Each task's proof: `proof.sh <label>` and `compare.sh <previous> <label>`. Chain: r2-final → r3-18 → r3-19 → r3-20 → r3-21 → r3-22 → r3-final. List every prof-001 change, intended or regression, in `r3-task-N.md`.
- Each task's commit updates case-onboarding. The PRD and progress.md are written in Task 24.

## Review Focus

1. A restatement is the original delivered correction line, word for word, never rebuilt. Pinned in Task 18.
2. No correction is said more than twice in total, counting the 13 Oct recommendation re-correction. Pinned in Task 19, on b29 Jordan.
3. Code refuses an unmatched ask only when the check says the case doesn't hold it. Pinned in Task 22.

---

### Task 18: The restatement repeats the original correction line verbatim (ruling 1)

Lorenzo: "The restatement must repeat the original correction line verbatim, never a new "X, not Y" template. In b28/b29 Jordan the original was the conversion line ("COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base."), and "16 points of revenue, not 38" is a "not X" on a figure that is true as growth on its own base, which the units fix forbids. Reusing the line also fixes the scale-word bug."

**Files:** `lib/orchestrator/math-checker-live.ts` (`restatementLine` and the STATEMENT builder), `lib/orchestrator/plan-turn.ts` (where `corrected[key]` is recorded; a conversion must record its delivered line too).

- `corrected[key].line` is the line actually delivered: a correction, or a conversion line. The restatement says exactly that line. The built "<root> is <right>, not <wrong>" form and its scale-word code are removed.
- Tests:
  - b28 and b29 Jordan fixtures → the restatement equals the conversion line verbatim;
  - a root whose delivered line was a plain correction → that line verbatim;
  - no root restated without a recorded delivered line.
- Proof: label r3-18 vs r2-final. b28 t20 and b29 t10 now say the conversion line.

### Task 19: A correction is said at most twice in total; the two held fixes (ruling 2)

Lorenzo: "Build the held fix now: the 13 Oct recommendation re-correction counts as the restatement, so a correction is said at most twice in total. (b29 already says the conversion line three times in the base run.) Build the other two held fixes now as well."

**Files:** `lib/orchestrator/plan-turn.ts` (the 13 Oct path, ~853 and ~1078), `lib/orchestrator/math-checker-live.ts`, `lib/scoring/checker-record.ts`.

- When the 13 Oct closed-error-in-recommendation re-correction is heard, its root key (and any key whose identical line it says) is added to `restated`.
- A key already restated gets no 13 Oct re-correction either. Total sayings per correction ≤ 2 (the original plus one).
- b29 Jordan base says the conversion line three times. After this task it is at most twice. List where the third saying goes.
- Held fix (round-2 final Minor 2): a restate entry that ends shed, expired or unresolved_at_close carries `root`. Its report text uses `builtText` ("…which the interview corrected: '<line>'") when the root had a live correction.
- Held fix (Minor 4, the scale word): already fixed by Task 18's verbatim line. Confirm it with a test (a "$1.2 billion" candidate claim → the verbatim original line, with no rebuilt scale).
- Tests for each.
- Proof: label r3-19 vs r3-18.

### Task 20: Only item-backed deferrals hold the model's figure question (ruling 3)

Lorenzo: "Point 3: only item-backed deferrals hold the model's figure question."

**Files:** `lib/orchestrator/settle-turn.ts` (`heldThisTurn` ~317 and the undelivered-figures withhold it feeds).

- `heldThisTurn` counts deferrals that hold a ledger item: gated ids, item-backed defers, gate defers. It does not count the check's item-less named deferrals or "We won't get to" lines.
- Tests:
  - a turn with only an item-less named deferral → the model's figure question stays;
  - a turn with an item-backed deferral → withheld, as today.
- Proof: label r3-20 vs r3-19. b31 Sofia t10's math probe returns.

### Task 21: Every deferral at a close is "We won't get to <ask> today." (ruling 4)

Lorenzo: "Close turns: all deferrals, item-backed included, become "We won't get to <ask> today."; if the ask label is long or a list, "We won't get to that today.""

**Files:** `lib/orchestrator/turn-data.ts` (`wrapUpTurn`, `wontGetTo`), `lib/orchestrator/data-decisions.ts` (`renderDataLineParts`), `lib/orchestrator/phrasing.ts` (`wont_get_to`, a second one-variant line `wont_get_to_that`: "We won't get to that today.").

- On a wrap-up/close turn (the same single predicate), every deferral is said as `wont_get_to`. That covers item-less named deferrals, item-backed defers, gate defers and over-cap defers.
- A long or list label gets `wont_get_to_that`:
  - long: more than 8 words after `spokenWhat`;
  - list: two or more asks grouped, or the label contains a comma or " and " joining two items.
- Item-backed deferrals at a close no longer enter the open-requests queue as promised. They stay recorded as asked-but-unanswered for the report (Rule 11 coverage gaps).
- Tests:
  - an item-backed defer at a close → the line;
  - a 12-word label → "We won't get to that today.";
  - a two-item group → "that";
  - mid-case → "I'll come back to…".
- Proof: label r3-21 vs r3-20.

### Task 22: Code refuses only when the check says the case doesn't hold it (ruling 5)

Lorenzo: "Provisional #8 overruled: when the check finds an item but the scope rules cut it, defer, don't refuse. Code refuses only when the check says the case doesn't hold it."

**Files:** `lib/orchestrator/turn-data.ts` (`answersAsk`, the scope filter on the check's ids; `basisCut`).

- The check maps to any ledger item → named deferral, whether or not the scope rules or the basis rule cut that item. Maps to none → refused. Null, timeout or error → named deferral.
- This overrules the round-2 scope filter. Because the basis cut is a scope rule, it also overrules round 1's final-review fix 1 (a basis ask mapped only to the cut item was refused). Remove both refusal paths. Keep the out-of-scope ids in the log.
- The finer-cut carve-out (asks the existing scope rules empty, refused without a check; round-2 ruling, accepted) is unchanged. Those asks never reach the check.
- Tests: mapped to an out-of-scope item → deferral; mapped to the basis-cut item → deferral; mapped to none → refused.
- Proof: label r3-22 vs r3-21. Expected 0 under the null mock.

### Task 23: The live Haiku check on the 34 prof-001 asks (ruling 7; paid, a few cents)

Lorenzo: "Run the live Haiku check on the 34 prof-001 asks (a few cents): report each verdict, whether any would become a hollow deferral or a wrong release, and the timeout rate at 1.5s."

- The asks are the 34 in `r2-task-13.md`. Call `classifyDataRequests` exactly as production does: `Could I get ${what}?`, detection mode, prof-001's catalog, the production model and timeout, logged usage. Run from the worktree with `--env-file=.env.local`, symlinked from the main checkout (never read).
- For each ask record:
  - the verdict: mapped ids, none, or null/timeout;
  - the latency;
  - what Task 22's rule makes of it: deferral or refusal;
  - whether it is a **hollow deferral**: mapped, but nothing later delivers it (the case lacks the asked data);
  - whether it is a **wrong release**. By design the check never releases, so confirm no code path releases on its word.
- Also report the timeout rate at 1.5 s and the cost.
- Write `replays/2026-10-19/engine-asks/r3-haiku-check.md`. The script lives in the scratchpad, not the repo.

### Task 24: The free proof against r2 and the docs

- `proof.sh r3-final` and `compare.sh r2-final r3-final`. Write `r3-final.md`:
  - every changed prof-001 decision and line, each with its ruling and intended/regression;
  - the new-case slices;
  - counts.
  - The union must equal the per-task lists.
- Docs, one commit:
  - PRD §5.x and §15;
  - a §16 entry with Lorenzo's round-2 rulings 1–7 as his. His "accepted" covers the round-2 controller rulings except #8, which he overruled. Round-3 controller rulings are recorded as proposed.
  - case-onboarding: the gaps list gets point 4 (the scope filter's misses: "competitor pricing" → menu prices, period cuts) and point 7 (possessive or quantifier asks unmapped on prof-002), both as Lorenzo ruled. Plus the tracker and a lessons line.
  - progress.md "## Now".

### Task 25 (only if r3-final shows 0 prof-001 regressions AND Task 23 shows no wrong release): wave A, then grade and stop

Lorenzo: "If that proof shows 0 regressions and the Haiku check shows no wrong releases, I authorize wave A: prof-001, 10 runs (batch 31's personas), Tyler, Marisol and Jasmine scored, cap $10. Grade it as usual and stop before B1."

- Launch with `scripts/persona-batch.ts`, the batch-31 personas, human pace, cap $10, scored: Tyler, Marisol, Jasmine. One wave. Check the memory rules on launch, pacing and grading first.
- Grade as usual: `hand-grading.md` in the batch folder, using batch 31's bar plus reports. Verify by reading transcripts.
- Update progress, PRD §16 and case-onboarding (the standing rule).
- Stop before B1 and report.
