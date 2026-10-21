# Stream 3 (math) — Phase 1, 22 Oct 2026: state and resumption

**Branch** `phase1-s3-math`, worktree `.claude/worktrees/phase1-s3-math`, off the contract commit `0f932c89`.
**Stopped early** (banking work; Lorenzo at 89% of his weekly limit). Tasks 1–3 of 7 are built and committed; 4–7 are
not started. Nothing was spent on API calls; every piece of evidence below is a free replay.

| Commit | Task | Switch |
|---|---|---|
| `bb2fbda5` | 1 — the worksheet | `worksheet` |
| `65404519` | 2 — the stale drop | `staleProbeDrop` |
| `3ed763eb` | 3 — roots by lineage, and the scale slip in code's corrections | `rootLineage` (the scale fix: none) |

Working tree is clean apart from **untracked `cases/phase1/`** — Stream 2's five overlay files, copied in from
`.claude/worktrees/phase1-s2-cases` so the lineage arms could be replayed. They are Stream 2's to commit; delete them
locally if they get in the way (`cases/phase1/`). Three of them are also committed as test fixtures under
`tests/orchestrator/fixtures/phase1-overlays/` (prof-001, prof-002, pricing-001).

---

## 1. What is built

### Task 1 — the worksheet (`worksheet`), commit `bb2fbda5`

- **`lib/orchestrator/worksheet.ts`** (new): pure functions against the contract's types
  (`lib/orchestrator/worksheet-types.ts`) — `update`, `latest`, `hasNewerValue`, `isWithdrawn`, `lineageOf`,
  `statusOf`, `findWithdrawals`, `staleReason` (added by task 2), `claimQuantity`, `foldTurn`.
- **Wiring**: `plan-turn.ts` calls `foldTurn` under `switchOn(caseData, 'worksheet')` and keeps the result in
  `flags.worksheet`. Fold order: this message's own step bindings and pricing results, then every landed verdict's
  tagged claims at their own message (idempotent — all of them, every turn). A late claim updates or confirms the
  value said at its turn and never overwrites a later one.
- **Withdrawals**: `"not X"`, `"earlier I said X"` / `"I said X earlier"`, `"ignore my X"`, `"scratch that"` /
  `"throw that out"` (the last figure before it in the sentence), and `"instead of X"` **only** as the candidate's own
  redo — in batches 30–38 "instead of" is almost always a sensitivity or a comparison ("fails if it's 18% instead of
  20%"; "acquired for $300 instead of $1,200"). A withdrawn figure is never taken as the current value, and each
  withdrawal records the quantity it was withdrawn from (when code can tell) and its replacement figure.
- **Code-side only**: nothing in `lib/agent/prompts/**` or `prompt-context.ts` imports it
  (`tests/cases/phase1-contract.test.ts` enforces it; still passing).
- **Judgement call (important)**: code's own *step bindings* fill the worksheet only on a case whose binding is
  validated (`stepFlagsLive` — prof-001 today). Elsewhere the checker's tags and code's pricing results fill it. The
  replay forced this: with the binder trusted everywhere, b37q Marcus's "$900 / $30 = 30 months" bound as Starter LTV
  $900 dropped the probe of his 14-month lifetime (M2's real root), and b32 Marisol's "2 million diagnosed" bound as
  peak patients dropped a true probe of her 200,000.
- Tests: `tests/orchestrator/worksheet.test.ts` (24), `tests/orchestrator/worksheet-plan.test.ts` (4).
  Mutation-checked: the switch, the latest-wins rule, the withdrawal skip, the "own redo" gate, the status rule.

### Task 2 — the stale drop (`staleProbeDrop`), commit `65404519`

Before any probe or correction is spoken, it is dropped when the worksheet says the candidate has overtaken it
(`staleReason`): a newer value for its quantity since its message, its own figure withdrawn, or — for a misread of the
data the candidate has fixed — a withdrawn figure its words carry. Covered paths: the checker's queue
(`planCheckerFlags`' new `staleDrop` predicate, which decides the claim `stale` with reason `stale_drop: …` and gives
the turn to the next claim), code's released deterministic flags, code's misquote correction, and the step root's input
question. Every drop is logged in the `stale_drop` check with its kind, id and reason.

Narrowings the replay forced (each left a counter-case test):
- a value already stated in the probed message is no news (b32 Marisol's "$220 million short" beside her "$80 million");
- a figure a hundred times off the step's answer is another quantity's (`checkCandidateMath`'s rule);
- "built on a withdrawn figure" counts only for a **misread of the data they fixed** (the figure and its replacement
  both figures of the case: "it's $11,000 per flight, not $9,000"). A figure of their own they redo still leaves the
  claims built on it probable (b38 Tyler t24, which the hand grade called legitimate), and a case figure withdrawn in
  another setting ("at $60 the Starter margin is $50, not $30") leaves its other uses alone.

Tests: `tests/orchestrator/stale-probe-drop.test.ts` (7, on b38 Marisol's two graded faults, verbatim) plus the
`staleReason` block in `worksheet.test.ts`. Fixtures: `tests/orchestrator/fixtures/phase1-s3-b38.json` and
`fixtures/phase1-s3-runs.ts` (b38 Larkspur Marisol f80d981c and Tyler cee7d399 — transcript, landed verdicts, per-message
phase/clock/ledger/exhibits, and `readsAt()` to plan any message of either run).

### Task 3 — roots by lineage (`rootLineage`), commit `3ed763eb`

- **Lineage probe budget**: `lineageOf` (worksheet.ts) walks `dependsOn` up to the root and back down over every
  dependent; `plan-turn`'s `probesOn(step)` sums `flags.stepProbes` across the lineage, and both the step cap and the
  root's input question read it. So at most two probes per lineage, not per step.
- **One correction at the root**: `rootCorrection` in `math-checker-live.ts` — the case's definition of the root step
  (Stream 2's overlay `definitions`), then code's own correction of R at v (`codeCorrection`), said on the linked
  claim's turn, booked as that root's one correction (`derivedOnce`, key `step:<R>`), with the lineage's other waiting
  claims riding on it and closing with it (one error, one count). Guards, in order: **Q1** (Lorenzo, approved 22 Oct —
  the checker must have rated the root or a claim in its lineage an error, flagged or not); the checker's latest claim
  on R still at v, hypotheticals ignored (b37q Marcus t19's "LTV around $600" while he kept 14 months); the root's value
  not withdrawn in a message since (`rootStale`, read from the candidate's own words so it works without the
  worksheet); the line not said already. Before the root has been probed once, the linked claim **waits**
  (`'wait'` → `heldLinked`) — "probe only the root" first.
- **The Stream 2 review's two requirements** (22 Oct):
  (a) round 6's roots now run only when the case's own file declares the lineage (an `inputQuestion`, which no overlay
  can add — pricing-001) **or** `rootLineage` is on. So merged `dependsOn` under `stepLineage` cannot turn round-6 root
  behaviour on for prof-001/prof-002/entry-001/launch-001 by itself. Proven two ways: a unit test per case, and the
  `*=stepLineage` replay arm (0 changed lines, 0 changed checker decisions).
  (b) **intermediate dependents**: a dependent claim keeps round 6's dependency link to the root (so a chain built on
  the root waits for it), *unless* the candidate shows the error is their own — a step between the root and the claim
  stated at its right value since the root, or the root itself stated right in that message (`lineageInherits`). Then it
  is an independent slip, probed as any claim, and an intermediate step flagged on such a slip registers as a root of
  its own. A propagation test (the claim's figure being what the step gives on the root's wrong value) was written,
  replayed and **dropped**: pricing-001's steps carry the lifetime error through the margin, not the LTV, so real
  derived claims read as independent.
- **The scale slip** (Stream 1's fault-bank baseline): `codeCorrection` wrote code's figure inside the candidate's own
  unit, so b35q Tyler t28 became "about $0.24k, not $210k" where the truth is $0.24M. Now a scale word that is not the
  step's own makes code write its figure at the step's scale and quote theirs as said: "about $0.24 million, not $210k".
  **Not behind a switch** — it removes a false figure with every switch off; it is the only line that changes in the
  switches-off replay. (Tests in `tests/orchestrator/own-quantity.test.ts`.)
- Tests: `tests/orchestrator/root-lineage.test.ts` (13) — the gating per case on Stream 2's real overlays, the lineage
  and its budget, the independent-slip veto on prof-001, and the root correction with its four guards on b37q Raj.

---

## 2. Replay evidence so far

Tooling (outside the corpus, reusable): `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-s3-tools/`
— `proof-s3.sh` (round 6's `proof.sh` plus the b38 Larkspur slice, on and off), `b38l-verdicts.jsonl` (built from the
b38 run files), `compare-s3.py` (round 6's `compare.py` plus the b38 slices), `summ.py` (prints only the slices that
changed), `stale.sh` (lists every `stale_drop`), `sec.py` (prints one slice's section of a compare file).
Run from the worktree: `zsh …/phase1-s3-tools/proof-s3.sh <label>`; compare with
`python3 -I …/phase1-s3-tools/compare-s3.py <base-label> <label>`. 26 slices, ~50 s a run, free.

| Label | Switches | Result |
|---|---|---|
| `phase1-s3-base` / `-base2` | base code, off | the baseline, and a determinism check (0 differences between the two) |
| `phase1-s3-t1-off` / `-t1-on` | task 1, off / `*=worksheet` | 0 changed lines, 0 changed checker decisions, both arms |
| `phase1-s3-t2-off` | task 2, off | 0 / 0 |
| `phase1-s3-t2-on` | `*=worksheet,staleProbeDrop` | 30 changed decisions, 6 changed lines; **11 drops, all read** (below) |
| `phase1-s3-t3-off` | task 3, off | **1 changed line** in 26 slices: the scale fix (b35q Tyler t28). prof-001 identical |
| `phase1-s3-ovl-step` | `*=stepLineage` (Stream 2's overlays present) | 0 / 0 — requirement (a) |
| `phase1-s3-t3-root` | `*=rootLineage` | 88 changed decisions, 13 changed lines (b35q, b37q) — **classification unfinished** |
| `phase1-s3-ovl-root` | `*=stepLineage,rootLineage` | ran against an earlier revision of task 3; **must be re-run** |

### The 11 stale drops (task 2), each read against the run
1. b28 Marisol 3172597b m19 `pricing:needed@17` — she said "about 24%, not 17%" at m23 → a report row removed. *Fixed.*
2. b29 Marcus 51056656 m3 "high teens" hint — he revised to "13–14.5%, not high teens" at m7. *Fixed.*
3. b31 Jordan 1c8ef4cb m15 `pricing:gain@5` — "8.5 points of recovery, not five" at m19 → report row. *Fixed.*
4. b31 Marisol 07e9f231 m13 — "only a seven-point improvement, not 18" at m15; the next claim (her true "well under
   half the gap") is probed instead. *Fixed.*
5. b31 Tyler 9443bf5f m7 misquote 61% — he answered the original run's own t8 correction ("58%, not 61%") at m9.
   *Replay artifact* (in the live run the correction and his fix crossed); neutral.
6. b33 Tyler 0150f744 m15 pointer on "19%" — "15%, not 19%" at m17. *Fixed.*
7. b35h Marisol a14ca044 m23 — "Net $750,000, not a 3x return" at m27 → report row. *Neutral.*
8. b35q Marisol 087451cb m23 "$30 Starter margin" probe — "at $60 the Starter margin is $50, not $30" at m25; the next
   claim (her 2.7x) is probed instead. *Neutral.*
9. b37q Marisol 084e7508 m9 hint on 22.5 months — "30 months, not 22.5" at m11; her "700" probed instead. *Neutral.*
10. b38 Marisol f80d981c m11 — the graded **firm** stale probe (t16) gone: she fixed the $9,000 to $11,000 at m13. *Fixed.*
11. b38 Marisol f80d981c m15 — the graded **firm** stale correction (t24) gone: she stated $11.8M at m21. *Fixed.*

**0 new false corrections** in that arm. The two b38 faults the wave graded firm are the ones this removes.

### The `*=rootLineage` arm — what is read and what is left
Read (the 13 changed lines): every lineage's chain of derived corrections collapses into **one correction at the root**,
prefixed by the case's definition — b37q Raj t20 ("$600, not $405" instead of the derived "$1,400, not $1,205" and the
root's own line only at t36), b37q Marcus t26 ("$600, not $420" — PRD §15's **M2, never corrected before**), b37q
Jasmine t12, b35q Tyler t28, b35q Marisol t14 (her Pro LTV $2,400 → $4,000). Derived figures that used to carry the
line are probed or go to the report instead. No line states a figure code did not compute, and no correction fires
without the checker's error rating.
**Left to do:** walk the 88 changed checker decisions one by one and classify each (fixed / new false correction /
neutral), as tasks 1–2 were. Nothing read so far looks false, but the classification is not finished and the gate's
"zero new false corrections" is not yet proven for this arm. Also re-run `ovl-root` (the overlay arm) against the
committed revision and read the four new-lineage cases (prof-002, entry-001, launch-001 get roots for the first time
there — the earlier run of that arm showed b32 Aldermoor reordering several lines and one new true correction, "Peak
annual US net sales … about $320 million, not $80 million").

---

## 3. Decisions already made (carry these forward)

1. **Q1 (Lorenzo, approved 22 Oct)**: no root correction unless the checker rated the root, or a claim in its lineage,
   an error — flagged or not. Built; in practice the linked claim's own error rating satisfies it, so the guard binds
   mainly on the lineage-cap path.
2. **Q5 (Lorenzo, approved 22 Oct)**: the live definitions re-check is the **lead's** to run at the gate under a $3 cap.
   Stream 3 spends nothing; task 7 must leave a documented command (below).
3. **Root activation** (the Stream 2 review): round 6's roots need the case's own `inputQuestion` or `rootLineage`.
4. **The worksheet trusts the binder only where the case's binding is validated** (`stepFlagsLive`).
5. **"instead of X" is a withdrawal only in the candidate's own redo.**
6. **"Built on a withdrawn figure" is stale only for a misread of the data they fixed.**
7. **The scale fix is ungated**, because gating it would keep a false figure in production and would make Stream 1's
   fault record unfixable with the switches off.
8. **Probe the root once before correcting it** (not the whole two-probe budget): requiring the full budget starved
   b37q Raj's lineage (one input question, then no step probe ever, so eight derived claims went to the report with no
   line at all).

## 4. What remains

### Task 3 — finishing touches
- Classify the `*=rootLineage` arm turn by turn; re-run and read `*=stepLineage,rootLineage`.
- Decide (and test) whether the **lineage-cap** path should also prefer the root's correction when the root's own value
  is stale — today it falls back to the claim's own correction with the definition prefix (`withDefinition`).
- Consider a test for the known false binding b37q Tyler `pro_ltv@288` (PRD §15): the `latestOnR` guard already stops a
  correction there on the replay, but there is no unit test pinning it.

### Task 4 — misquotes (`misquoteFlat`), not started
Plan: in `plan-turn.ts`, where `gateCodeFindings`' outcome is read, release a misquote's flat correction when code finds
the mismatch with a revealed item **and** the checker rated that span an error — flagged or not — instead of requiring
the flag plus the right-figure agreement (`gateCodeFindings`' `checker_disagrees`/`not_rated` paths, and
`codeFigures`' 3%/0.5 test). The cases to pin: b38 Larkspur Tyler `misquote:fixed_costs` ($21M) and
`misquote:route_results_other` ($3.6M), both dropped by `code_gate` with "the checker's verdict on it is error/high —
no flag" (hand-grading.md, borderline). Second half: the probe guard must never replace a model question that catches a
misquote — b38 Tyler t14's true "$125" challenge was vetoed as `unsupported_challenge`; the fix is in
`settle-turn.ts`'s `mathWithheld` path / `probe-guard.ts`'s `challengeVerdict`, allowing a doubt whose figure matches a
*misquote finding on that message* (not a candidate-derived figure). Keep the switch on both halves.

### Task 5 — the probe guard's replacement (`probeGuardMethod`), not started
Plan: in `settle-turn.ts`, the replacement for a withheld challenge currently uses the `got_to` pool, which names the
candidate's figure (`figureAsWritten`). Behind the switch, ask about method only — a new phrase pool in
`lib/orchestrator/phrasing.ts` (e.g. `probe_method`: "Walk me through how you got there." and four more, no `{x}`
slot) — and never name a figure code verified as correct. Note `PHRASE_POOLS` additions need `SEEDED_FIRST`
consideration and the `poolPattern`/`asOriginalProbe` readers.

### Task 6 — the spoken-math parser (`spokenMathParser`), not started
Plan: `arithmetic-check.ts` already tokenizes digits and number words (`normalizeNumberWords`), but chained speech
fails: "three minus seventy cents plus thirty plus thirty plus twenty equals one fifty" normalizes to
"3 minus 70 cents plus 30 plus 30 plus 20 equals 1 50" and the result "1 50" is read as 1 (verified). Approach: a
reading-set parser — enumerate plausible readings of a spoken chain (scale from the first money token: dollars vs cents;
"one fifty" as 1.50 or 150; a bare tail after a unit word) and treat the sentence as **consistent if any reading matches
the stated result**, so the deterministic flag is withheld rather than raised. Build the set in
`evals/spoken-math/sentences.json` (50–100 real sentences): the harvest script is in the report's scratch —
`grep` candidate sentences in `Case Interview Runs/test runs/**/live-run-*.json` for an operator word plus ≥3 number
words (100 hits found in batches 1–38, listed in the session log), plus the 9 real voice-session sentences in
`Case Interview Runs/voice-live/**/*.md` (e.g. "So fifty eight divided by four, um, gives us around, um, sorry, uh,
fourteen point five"). Label each sentence consistent/inconsistent by hand; the test asserts no false "incorrect".

### Task 7 — definitions to the checker (`checkerDefinitions`), not started
Plan: add the case's `definitions` (server-only, already on the merged case) to `buildCheckerSystem` in
`math-checker.ts`, behind the switch, as a DEFINITIONS block after MATH STEPS, naming the steps each covers. A
recorded-verdict replay cannot prove it (Q5), so leave:
`LLM_BUDGET_USD=3 LLM_BUDGET_FILE=<ledger> ENGINE_SWITCHES='*=checkerDefinitions' MATH_CHECKER_CONFIG=sonnet55-medium
npx tsx scripts/eval-math-checker.ts --runs=<the b37q/b38 math runs> --out=<verdicts.jsonl>` — check
`scripts/eval-math-checker.ts`'s real flags before documenting; the lead runs it at the gate and compares the verdicts
with the recorded ones.

### Final gate work for this stream
- Re-run the proof with `ENGINE_SWITCHES='*=worksheet,staleProbeDrop,rootLineage,misquoteFlat,probeGuardMethod,spokenMathParser'`
  (and the off arm) and classify every changed checker/probe/correction turn.
- Report code-path latency from the replay's `timing` (not yet collected; no new model call was added — the worksheet,
  the stale drop and the lineage rules are all pure code, and task 7 adds prompt text to an existing call).

## 5. For the lead / other streams

- **`tests/cases/phase1-contract.test.ts` will fail once `cases/phase1/*.json` exist**: "today's cases load unchanged
  with no overlay and no switches" compares `getCaseById(id)` with the raw file, but the overlay always attaches the
  descriptive fields (an exhibit `summary` on entry-001 is what fails). Stream 2's or the integration's to fix. With
  the overlays removed the suite is 5195 passed, 9 skipped; with them present, that one test fails.
- The b38 Larkspur slice is new to the proof script (`b38l`, on and off) — its verdict file is built by
  `phase1-s3-tools/convert-b38.py`, outside the corpus.
