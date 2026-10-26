# Stream 3 (math) — Phase 1: state, the review's fix round, and what remains

**Branch** `phase1-s3-math`, worktree `.claude/worktrees/phase1-s3-math`, off the contract commit `0f932c89`.
**Status:** tasks 1–3 of 7 built, reviewed and fixed; tasks 4–7 not started (the coordinator's instruction — Streams 1–3
are being merged first). The review of 22 Oct rejected task 3 for a false correction; §1's fix round closes it. Nothing was spent on API calls; every piece of evidence below is a free replay.

| Commit | Task / review finding | Switch |
|---|---|---|
| `bb2fbda5` | 1 — the worksheet | `worksheet` |
| `65404519` | 2 — the stale drop | `staleProbeDrop` |
| `3ed763eb` | 3 — roots by lineage, and the USD scale slip | `rootLineage` (the scale fix: none) |
| `c7b6037c` | this report (resumption document) | — |
| `d5b5f64d` | review **C1, I1, I2, I6** — the root correction's provenance, probe gates and validated lineage | `rootLineage` |
| `66105aa2` | review **I3, I4, I5** and the worksheet minors | `worksheet`, `staleProbeDrop` |
| `4b9825a7` | review **C3** — the scale slip beyond USD | none |

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

### The review's fix round (22 Oct), commits `d5b5f64d`, `66105aa2`, `4b9825a7`

| Finding | What changed |
|---|---|
| **C1** (the false correction) | `rootCorrection` now needs the candidate's own figure in the checker's words: a non-hypothetical claim on step R at v, from the root's message on, and the latest such claim still at v. The step binder alone licenses nothing — the rule task 1 already applies to the worksheet. Hypotheticals are out of the Q1 evidence search too. b35q Marcus 7e69eda5's "$600, not $400" is gone from every arm; the other four root corrections in that arm keep their line; b37q Tyler's known false `pro_ltv@288` binding is pinned by the same gate. |
| **I1** | The "probed first" gate reads the attempts booked on **R at v** (`p.attempts[key]`), not the lineage sum. The lineage sum stays for the cap and for the input question's budget. |
| **I2** | Back to the contract: two probes per lineage, then one correction at the root. Decision 8 (one probe) is now **proposed** below with its evidence. |
| **I6** | The lineage rules run only on a case whose own file authored its lineage (an `inputQuestion`, which no overlay can add). `lineageInherits` also requires real propagation through the steps' declared ledger `inputs`: a step not computed from what the root is computed from inherits nothing, so a sibling grouping silences nothing. The `*=stepLineage,rootLineage` arm is now **identical** to `*=rootLineage` — the overlay's dependsOn changes nothing. |
| **I3** | `coveringWithdrawal` (shared with `hasNewerValue`) gates every withdrawal by unit, by the quantity it was withdrawn from, and — for a figure of the data — by decision 6 extended: only a misread they fixed, not one said under a condition of its own. Drops #7 and #8 are gone; the nine right ones stand. |
| **I4** | A withdrawal standing at or after a value's own turn blocks it as it is folded, and a value they take back is removed from its entry (the quantity falls back to its newest standing value, or has none). Contract §2 holds; `update` is idempotent. |
| **I5** | "not X" no longer withdraws a figure another subject owns, or one named as the data's own ("not the 70% on this exhibit"). "instead of X" counts on a prescription as well as an "I" redo, with "if" vetoing only over the figure's own clause. |
| **C3** | The scale mismatch is read for every unit, not just money: entry-001's "250k patients" against 200,000 now reads "about 200,000, not 250k". |
| Minors | `statusOf` → `unchecked` for a step whose unit code can't read; the checker's `rating` fills in where code has no calculation; at the same turn the checker takes the binder's place; `pricing:needed_for_margin@t` / `pricing:needed_for_gain@t` keyed apart; `rootsOn`'s narrowing noted below. |

**Two parts of the review I did not implement as written, with the reasoning:**
1. **The readability nit on the scale fix** ("$240,000, not $210k" instead of "$0.24 million, not $210k"). Implemented, replayed, reverted: `$240,000` is a figure the case never states, so the vetting's provenance guard (FR-4, `speakable`) dropped the whole correction and b35q Tyler's true line disappeared from the off arm. Money keeps the step's own scale word; counts and percents are written in full, where the guard accepts them.
2. **A numeric propagation test** inside `lineageInherits`. I built one, replayed it and dropped it before the review (it rejected genuine chains: pricing-001 carries a lifetime error through the margin, not the LTV, so Raj's $1,205 and Jasmine's 4x read as independent). With no formulas in the case data the gain ∂D/∂R is unknown, so any numeric test is either unsound or vacuous. Instead: the **structural** necessary condition the review asked for (declared `inputs`) plus the **authority gate** (only a lineage the case file itself authored). Together they give the outcome the review wanted — a sibling grouping silences nothing, and prof-001 is out of the lineage rules entirely under `*=phase1` — without an inference code cannot justify. If Lorenzo would rather have the numeric test as well, the dropped version is in the history of `3ed763eb`.

## 2. Replay evidence so far

Tooling (outside the corpus, reusable): `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-s3-tools/`
— `proof-s3.sh` (round 6's `proof.sh` plus the b38 Larkspur slice, on and off), `b38l-verdicts.jsonl` (built from the
b38 run files), `compare-s3.py` (round 6's `compare.py` plus the b38 slices), `summ.py` (prints only the slices that
changed), `stale.sh` (lists every `stale_drop`), `sec.py` (prints one slice's section of a compare file).
Run from the worktree: `zsh …/phase1-s3-tools/proof-s3.sh <label>`; compare with
`python3 -I …/phase1-s3-tools/compare-s3.py <base-label> <label>`. 26 slices, ~50 s a run, free.

| Label | Switches | Result |
|---|---|---|
| `phase1-s3-base` / `-base2` | the contract base, off | the baseline, and a determinism check (0 differences between the two) |
| `phase1-s3-r3-off` | **after the fix round**, off | **1 changed line** in 26 slices: the scale fix (b35q Tyler t28). prof-001 identical, 0 changed checker decisions elsewhere |
| `phase1-s3-r3-ws` | `*=worksheet,staleProbeDrop` | 28 changed decisions, 6 changed lines — the 9 stale drops that survive I3, all read |
| `phase1-s3-r3-root` | `*=rootLineage` | 52 changed decisions, 5 changed lines (b35q only; b37q has **no** changed line) — all read, below |
| `phase1-s3-r3-ovl` | `*=stepLineage,rootLineage` | **identical to `-r3-root`** (52 / 5): the overlay's dependsOn changes nothing — review I6 and I7 |
| `phase1-s3-r3-all` | `*=worksheet,staleProbeDrop,rootLineage,stepLineage` | 76 changed decisions, 10 changed lines = the union of the two arms, all read, below |

Earlier labels (`t1-*`, `t2-*`, `t3-*`, `ovl-*`, `r2-*`) are the pre-fix-round arms and are superseded.

### Every changed line in the combined arm (`r3-all`, 10), classified

| Run | Turn | Change | Class |
|---|---|---|---|
| b38l Marisol f80d981c | t16 | the graded **firm** stale probe ("$1,800 … using $9,000") gone; the guard's question stands in | fixed |
| b31 Tyler 9443bf5f | t10 | the misquote correction of "61%" dropped — he answered the original run's own t8 correction at m9 | replay artifact, neutral |
| b31 Marisol 07e9f231 | t18 | a stale probe ("roughly 14% … most of the 18 points") replaced by a probe of a claim that still stands | fixed |
| b33 Tyler 0150f744 | t18 | the stale pointer on "19%" gone (he said "15%, not 19%" at m17) → the turn's own words | fixed |
| b35q Marisol 087451cb | t24 | the model's own question in place of a code fallback — a knock-on of the dropped probe, no figure | neutral |
| b35q Marisol 087451cb | t28 | the probe of the data's "$30 Starter margin" replaced by a probe of her own 2.7x | neutral (better: it probes their figure, not the data's) |
| b35q Marisol 087451cb | t32 | the derived ratio's correction replaced by a probe at the root ("Starter $900") | neutral — "probe only the root" |
| b35q Tyler ee99bd82 | t28 | the derived uplift line replaced by the root's correction "$600, not $405" — true, checker-provenanced | fixed |
| b35q Tyler ee99bd82 | t30 | the root correction (said at t28) replaced by a probe of his "$210k" | neutral |
| b37q Marisol 084e7508 | t14 | a stale hint ("22.5 months", withdrawn at m11) replaced by a probe of her "700" | fixed |

**New false corrections: none.** The only new correction line in any arm is b35q Tyler's root correction above. Every
other `correct` / `restate` decision in `r3-all` is byte-identical to the off arm, checked run by run — including the
two "$600, not $400" lines (b37q Jasmine 3376e5fe t15, b35q 5c3d2c21 t13), which are round 6's own and appear
unchanged with the switches off.

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

### The `*=rootLineage` arm, after the fix round

Five changed lines, all in b35q (above). The 52 changed decisions are those five plus report rows and bookkeeping:
derived claims that used to carry a correction now read "built on starter_ltv's …, flagged by the step check" and go to
the report, and the root's own correction moves to the turn the lineage's budget is spent. b37q changes 24 decisions
and **no** spoken line: with the provenance and two-probe gates, Raj's and Marcus's chains go to the report rather than
to a line — which is Q1's "otherwise the lineage goes to the report after its two probes". The cost is that **M2
(PRD §15) is improved but still not corrected**: Marcus's 14-month lifetime is probed and reported, not corrected,
because his lineage never spends a second probe. That is the trade-off behind the proposed decision 8 below.

## 3. Decisions and proposals

**Lorenzo's, made:**
1. **Q1 (22 Oct)**: no root correction unless the checker rated the root, or a claim in its lineage, an error — flagged
   or not. Built; after C1 it sits beside the provenance gate.
2. **Q5 (22 Oct)**: the live definitions re-check is the **lead's** to run at the gate under a $3 cap. Stream 3 spends
   nothing; task 7 leaves a documented command (below).

**Stream 3's, proposed — awaiting Lorenzo's ruling** (CLAUDE.md: a decision is made only once he makes or approves it):
3. **Root and lineage activation.** Round 6's roots and task 3's lineage rules run only on a case whose own file
   authored the lineage (an `inputQuestion`). An overlay's merged `dependsOn` is unvalidated data, so it stays
   report-only — the `stepFlagsLive` / `ledgerLookupLive` pattern. *Cost if wrong:* prof-002, entry-001 and launch-001
   get no root behaviour in the wave, so the lineage rules are proved on pricing-001 only.
4. **The worksheet trusts code's step bindings only where the case's binding is validated** (`stepFlagsLive`:
   prof-001). Elsewhere the checker's tags and code's pricing results fill it. *Cost if wrong:* the worksheet is
   thinner on the four new cases, so fewer stale drops there.
5. **"instead of X" withdraws only in the candidate's own redo or a prescription**, and "if" vetoes it only over the
   figure's own clause. *Cost if wrong:* a real withdrawal missed, which leaves a stale probe.
6. **A withdrawn figure of the DATA is stale evidence only as a misread they fixed** (its replacement a case figure
   too, not said under a condition of its own); a figure of their own needs neither test. *Cost if wrong:* a probe
   survives that the candidate had already answered.
7. **The scale fix is ungated**, with every switch off: gating it would keep a false figure in production and would
   make Stream 1's fault record unfixable off. *Cost if wrong:* one line changes against the contract base (read, true).
8. **Probe the root once, not twice, before correcting it** — *not built; the contract's two probes are what ships*
   (review I2). The evidence for one: pricing-001's chains rarely spend a second probe at the root, so with two
   required, b37q Raj's eight derived claims and Marcus's 14-month lifetime (PRD §15's M2) are probed, reported and
   never corrected. With one, both chains end in a single true correction at the root. *Cost if wrong (one probe):* a
   root is corrected after a single question, doubling the exposure C1 came from — which is why the review asked for
   the contract's reading, and why this stays a proposal.

## 4. What remains

### Task 3 — what the fix round left open
- Lorenzo's ruling on proposals 3–8, above — proposal 8 (one probe at the root, not two) is the only one that would
  change behaviour, and it is what would let M2 (PRD §15) finally be corrected.
- The lineage-cap path falls back to the claim's own correction (with its definition prefix) when the root has nothing
  to say; whether it should instead stay silent is a question for the same ruling.
- `rootsOn` was narrowed to require an authored `inputQuestion` (proposal 3). If Lorenzo would rather activate per case,
  the gate is one line in `plan-turn.ts` (`lineageAuthored`).

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

- The gate arm is `ENGINE_SWITCHES='*=worksheet,staleProbeDrop,rootLineage,stepLineage,misquoteFlat,probeGuardMethod,spokenMathParser'`
  (review I7: `stepLineage` belongs in it, because the lineage rules read merged case data), with the off arm beside
  it, and `*=stepLineage,rootLineage` kept as a required arm of its own — it is the highest-risk combination.
- Latency: no new model call in tasks 1–3 (pure code; task 7 adds prompt text to an existing call). Code-path time per
  turn from the replay's `timing` is still to be collected.

## 5. For the lead / other streams

- **`tests/cases/phase1-contract.test.ts` fails once `cases/phase1/*.json` exist**: "today's cases load unchanged with
  no overlay and no switches" compares `getCaseById(id)` with the raw file, but the overlay always attaches the
  descriptive fields (an exhibit `summary` on entry-001 is what fails). Stream 2's or the integration's to fix. With
  the overlays removed the suite is **5212 passed, 9 skipped**; with them present, that one test fails and nothing else.
- **A pre-existing oddity worth a look** (not mine to change in this round): b35q 5c3d2c21 t13 speaks the correction
  "Starter standalone lifetime value at $40 is about $600, not $400" under the key `starter_churn@7.5` — the key and the
  figure in the line are different quantities. It is identical with every switch off, so it predates Phase 1.
- The b38 Larkspur slice is new to the proof script (`b38l`, on and off); its verdict file is built by
  `phase1-s3-tools/convert-b38.py`, outside the corpus.
- Tasks 4–7 are **not started** (the coordinator's instruction, 26 Oct): their plans are in §4 above, unchanged.
