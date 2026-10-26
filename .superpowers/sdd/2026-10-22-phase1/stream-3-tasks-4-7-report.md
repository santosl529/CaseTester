# Stream 3 (math) — tasks 4–7: what is built, and how to resume

**Branch** `phase1-rest3`, worktree `.claude/worktrees/phase1-rest3`, off `phase1` **33c8c3e5** (all five streams merged).
**Stopped** 26 Oct on the coordinator's instruction (Lorenzo paused Phase 1), at a clean point: working tree clean, every
commit passes `npx vitest run` (5540 passed, 9 skipped), `npx tsc --noEmit`, `npx eslint lib app components tests scripts db`.
**Nothing was spent.** Every piece of evidence below is a free replay or a local read.

| Task | Switch | State | Commit |
|---|---|---|---|
| 7 — definitions to the live checker | `checkerDefinitions` | **built** | `1399bb69` |
| 4 — flat misquote correction + the guard keeps a model question that catches one | `misquoteFlat` | **built** | `feee4465` |
| 5 — the probe guard's replacement asks about method | `probeGuardMethod` | **built** | `27f3f2e0` |
| 6 — the spoken-math parser | `spokenMathParser` | **not started** | — |
| §9 item 10 — pricing-001 `churn_breakeven_at_60` overlay | `stepLineage` | **not built** (analysis below, and it changes the instruction) | — |
| §9 item 11 — b35q 5c3d2c21 t13's "$600, not $400" | — | **not verified** (method below) | — |

---

## 1. Task 7 — the case's definitions in the live checker's prompt (`checkerDefinitions`), `1399bb69`

**Built.** `buildCheckerSystem` (`lib/orchestrator/math-checker.ts`) adds, after MATH STEPS and before PRICING MODEL /
SHARE BASES, behind `switchOn(c, 'checkerDefinitions')`:

```
DEFINITIONS (the case's own terms — judge each claim's quantity by the definition below, not by another reading of the words):
- lifetime value: Lifetime value is monthly gross margin times expected lifetime in months, and expected lifetime is about one divided by the monthly cancellation rate. (steps: pro_ltv, starter_ltv; data: ltv_definition)
```

`CheckerCase` gained `definitions?`. The overlay already attaches `definitions` to every case unconditionally (they are
descriptive, `lib/cases/phase1-overlay.ts`), so the data is there on all five cases — 7 to 13 definitions each — and is
figure-free by the case schema's `noFigure`.

**Does it achieve its purpose (Lorenzo's 26 Oct ruling — "it is what lets M2's roots be corrected with the checker's
agreement")?** It is the only lever that can, and it is now in place, but *nothing in a free replay can show it*, and one
thing in the way is worth knowing before the live re-check is read:

- The mechanism is right. M2 (PRD §15) is b37q Marcus's 14-month Starter lifetime. A root correction needs Q1's
  evidence — the checker rating the root, or a claim in its lineage, an error. pricing-001's definition says expected
  lifetime is about one divided by the monthly cancellation rate (5% → 20 months), so with the definition in front of
  it the checker has the case's own ground for rating "14 months on plan" an error. Without it the term is read
  however the model reads it.
- **A recorded-verdict replay cannot prove it** (contract Q5, Lorenzo approved 22 Oct): the replay harness mocks
  `checkMathClaims`, so the system prompt never reaches a model. The `*=checkerDefinitions` arm is byte-identical to the
  base by construction — do not report it as evidence of anything.
- **What I found that changes the re-check's scope:** `evals/math-checker-labels.json` (350 labelled messages, which is
  what `scripts/eval-math-checker.ts` runs on) holds **no pricing-001, prof-002, entry-001 or launch-001 messages at
  all** — every label is from the older prof-001 batches (`default-candidate` 80, `oct` 64, `haikulow` 77, `haiku` 69,
  `sonnet` 60). So the $3 re-check as the tooling stands tests prof-001's seven definitions and **cannot show M2**. To
  judge M2 the labels have to be extended first (`scripts/build-math-labels.ts`, free, reads the corpus and the grading
  files) with the new-case runs — the natural source is the math faults already in `evals/fault-bank/batch-3*.jsonl`.
  I did not change the label builder; that is a decision for Lorenzo or the lead, because the label set is also the
  checker's own evaluation baseline.

### The $3 definitions re-check — the exact commands (against the script's real flags)

The script's flags are `--dry --arms= --set=all|recall|precision --limit= --ids=<file> --revet=<a.jsonl[,b]> --out=<dir>
--concurrency=`. There is no `--runs=`. `LLM_BUDGET_USD` is required for any paid run; `LLM_BUDGET_FILE` is optional and
shares one cap across processes. Run from the **main checkout** — the script's `ROOT` is `Case Interview Runs` relative
to cwd, and the worktree's copy is partial (a `--dry` run there dies with "run not in corpus").

```bash
cd /Users/lorenzo/coding/personal-projects/CaseTester

# 0. free — the estimate. Measured 26 Oct: 78 messages, $2.39. (--set=all is 350 messages ≈ $10.7: over the cap.)
ENGINE_SWITCHES='*=checkerDefinitions' npx tsx scripts/eval-math-checker.ts --dry --arms=sonnet55-medium --set=recall

# 1. free — the switch-off baseline, from recorded verdicts re-vetted under today's rules
npx tsx scripts/eval-math-checker.ts \
  --revet="Case Interview Runs/replays/2026-10-13/math-checker-sonnet-rerun/sonnet55-medium.jsonl"

# 2. paid — the switch-on arm, capped
LLM_BUDGET_USD=3 LLM_BUDGET_FILE=/tmp/defs-recheck.budget ENGINE_SWITCHES='*=checkerDefinitions' \
  npx tsx --env-file=.env.local scripts/eval-math-checker.ts \
    --arms=sonnet55-medium --set=recall --concurrency=6 \
    --out=/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/defs-recheck-on
```

Read report lines 1 (false flags per 100 claims, each listed) and 2 (recall, firm and borderline) against the baseline,
and the per-claim `LINES` / `DROPPED` blocks for wording changes. Caveats to carry into the reading: the 13 Oct recorded
file predates the four new cases, so the comparison is only over the ids both runs hold; and the switch changes the
**cached system prefix**, so the first call per case pays a cache write (the estimate already assumes that).

If both arms are wanted live and inside $3, use `--ids=<file>` with a narrowed id list rather than `--set=recall` twice.

---

## 2. Task 4 — the flat misquote correction (`misquoteFlat`), `feee4465`

**Lorenzo:** "a flat correction, from the ledger value, only when code finds a mismatch with a revealed item AND the
checker rated the span an error (flag or not). Never let the probe guard replace a model question that catches a
misquote."

**Half 1 — the gate** (`gateCodeFindings`, `lib/orchestrator/math-checker-live.ts`). For a misquote finding the switch
relaxes **the flag, not the right-figure agreement**: the pool of candidate claims becomes every matched claim the
checker rated `error` (flagged or not) instead of only the flagged ones, and `rightAgrees(c, codeFigures)` still has to
hold. A matched claim rated `correct` blocks the flat path; `unverifiable` and "no claim" are not ratings.

The agreement test stays because **the first version of this task, without it, produced a false correction** that the
replay caught: b38 Larkspur Marisol f80d981c t15, "So the swap is worth $15.8M of contribution" — her own derived
figure, which the misquote grammar reads as a misquote of the network totals ($16.0M of contribution). The checker flags
it with 11.8 right — another quantity — so with the agreement relaxed the turn said "To correct one figure: across all
six routes, revenue fell from $200.0M to $176.0M…", correcting a figure she never quoted, and it also displaced the true
"about $11.8M, not $15.8M" at t23. It is pinned as a test on the run itself.

**Half 2 — the probe guard.** `ChallengeContext.misquoteFigures` (new), filled by `plan-turn.ts` under the switch from
**this message's own live findings** (`found`, not the report-only ones), plumbed through `stream-turn.ts`'s
`GateContext` and `settle-turn.ts`'s challenge context. In `challengeVerdict` the allowance sits **after** the verified
veto: a figure code verified as correct is never doubted, misquote finding or not; a figure closed to the report stays
closed.

### Replay evidence (free; base `phase1-rest3-base` = 33c8c3e5, arm `phase1-rest3-t4b-on`, `*=misquoteFlat`)

**6 changed lines, 2 changed checker decisions, 0 new false corrections.** Every one read:

| Run | Turn | Change | Class |
|---|---|---|---|
| b38l Tyler cee7d399 | t8 | **new** correction "fixed costs … were $20.0M in both FY2023 and FY2025" (his t5 "$21M"; the checker rated it error/high, flag dropped "within tolerance: theirs 21, correct 20") | **fixed** (target case) |
| b38l Tyler cee7d399 | t32 | **new** correction of `route_results_other` before the goodbye (his t29 "Westhaven's $3.6M"; the line says $3.8M). The goodbye still follows it | **fixed** (target case) |
| b32 Tyler 51b8cc22 | t28 | **new** correction of `route_results_port_avery` in his recommendation ("revenue went from $46.8M to $33.6M"; the line says $32.4M), with the rec-revision ask | **fixed** |
| b34l Tyler 51ad0cb8 | t8 | **new** correction of `network_totals` ("At 14,500 flights × 80 seats"; the line says 14,000), and the checker's own probe 5:1 becomes a dedupe | **fixed** |
| b38l Tyler cee7d399 | t12 | the correction lead-in rotates ("To correct one figure" → "Let me correct one figure") because t8 used version 1 | neutral (wording) |
| b32 Tyler 51b8cc22 | t30 | the rec-revision ask at t28 pushes the close one turn later; the mirror's last turn is a close-wait line instead of the goodbye | neutral (one extra turn; in a live run the close simply follows) |

Decisions: b34l `5:1` probe → dedupe (the pair of the t8 line). No other `correct` / `restate` decision moved.

**A cost worth Lorenzo's eye:** b38l t32 recites the whole four-route ledger sentence at the goodbye to fix $3.6M →
$3.8M. That is the existing design (the close lifts the per-item cap so no misquote stands at the goodbye) and the
wording is the case's own, but it is heavy for a 0.2 difference.

**Half 2 changes nothing in the corpus, and does not fix b38 Tyler t14.** Across all 487 saved runs, **49** turns
withheld a math challenge and **0** of them named a figure code had found misquoted — same turn or any earlier turn.
b38 Tyler t14 ("…does your $125 match it?", the exhibit says $120, vetoed as `unsupported_challenge`) is not fixed
because **code never found that misquote**: `lakeport_fare`'s anchors are "lakeport fare / fare on lakeport /
lakeport's fare / lakeport ticket price", and he wrote "On Lakeport, the exhibit shows fare down to $125" — no anchor
name appears. A bare "fare" anchor would catch it and would also fire on Port Avery's fare, so it needs a route-scoped
anchor or an anchor grammar that lets the route name sit earlier in the sentence. **That is Stream 2's (anchors) or a
grammar change, not mine** — flagged for Lorenzo rather than built.

---

## 3. Task 5 — the probe guard's replacement asks about method (`probeGuardMethod`), `27f3f2e0`

New phrase pool `probe_method` (five versions, no slot, no figure), `OWN_BLOCK` in the variant tests like 4.10's `ack`,
a `WHEN` entry in `scripts/variant-list.ts`, and `docs/code-line-variants.md` regenerated (the regeneration also picked
up Stream 4's `restate_pointer` and `restate_recent`, which were missing from the committed doc).

**One deviation from Lorenzo's words, deliberate:** his illustration "Walk me through how you got there." *is*
`probe_there`'s own first line (the checker's neutral probe). `tests/orchestrator/phrasing.test.ts` holds that no line
sits in two pools — each heard line is recorded once — and sharing the words would make the guard's replacement
indistinguishable from a checker probe line, which `lineHeard` reads by its words (it could book a flag's probe as
delivered when the flag was never probed). So version 1 says the same thing in its own words: **"Walk me through how you
worked that out."** *Cost if wrong: one string, and he can have his exact line by taking it out of `probe_there` or by
accepting the duplicate.*

In `settle-turn.ts` the replacement for a withheld challenge is now the method question instead of `got_to` (whose slot
is the candidate's own figure as written — often the very figure code verified as correct). Two narrowings, each tested:

- not when the withheld doubt was about a figure **closed to the report** or **working they already showed** — a
  question with no referent lands on their last claim, and those two are never asked about again (Lorenzo, 13 and 20 Oct);
- not on a turn that **hands over data or an exhibit**, where the phase fallback already asks about what just went out.
  The figure never comes back either way: `got_to` is out under the switch. This cut the arm from 16 turns to 13.

### Replay evidence (base vs `phase1-rest3-t5b-on`, `*=probeGuardMethod`)

**21 changed lines = 13 turns** (each appears in the checker-off and checker-on slice), **0 changed checker decisions, 0
corrections changed.** Five drop a named figure — b38l Marisol t10 "How did you get to 24?" → "What do you take from
those numbers?", b38l Marisol t16 "Could you walk me through where 60 comes from?" → the method line, b35q Tyler t6 "How
did you get to $80?" (his correct $100 − $20) → "Those figures — what do they tell you?", b37h Jasmine t30 "How do you
get to $120M?", b35h Tyler t6 "How did you get to $9.0M?" — **fixed**. Eight replace a generic fallback with a method
question (b38l Tyler t14's "Where does that leave your analysis?" among them) — **neutral**.

---

## 4. Task 6 — the spoken-math parser (`spokenMathParser`): not started

What I worked out before stopping, so the next session doesn't repeat it:

- **The contract's example decodes as `3 − (0.70 + 0.30 + 0.30 + 0.20) = 1.50`** — "three minus seventy cents plus
  thirty plus thirty plus twenty equals one fifty". The three readings it needs: (a) a bare number after a unit word
  inherits that unit (cents, so ÷100 against a dollar scale); (b) "one fifty" is 1.50 as well as 150; (c) a leading
  "minus" distributes over the "plus" chain that follows it (a − b + c + d read as a − (b + c + d)).
- **Why it fails today** (read from `lib/orchestrator/arithmetic-check.ts`, traced by hand — *run it first and record
  the real output*): `normalizeNumberWords` gives "3 minus 70 cents plus 30 plus 30 plus 20 equals 1 50"; "cents" is an
  unknown word, so the tokenizer emits `break` and resets the expression; what survives is 30 + 30 + 20 = 80 against a
  stated "1" (because "1 50" is two numbers and the second one re-settles). That is a **false flag**, which is the
  thing to remove.
- **Shape of the fix:** a post-pass inside `checkStatedArithmetic` that can only ever **downgrade `incorrect` →
  `unclear`** — never upgrade to `correct`, never raise a new claim — so the switch can only remove flags. Enumerate the
  readings of the left side and of the stated result; if any pair matches within the existing `verdictFor` bands, the
  sentence is consistent and the flag is withheld.
- **Plumbing:** `checkStatedArithmetic(rawText)` has no case, and `MathCaseData` has no `id`, so the switch cannot be
  read inside `checkCandidateMath`. Thread an options argument (`{ spokenReadings?: boolean }`) through
  `checkCandidateMath` (`lib/orchestrator/recompute.ts:423`, the call at :435) and pass
  `switchOn(caseData, 'spokenMathParser')` from `lib/orchestrator/plan-turn.ts:464`; decide whether
  `lib/scoring/challenge-marks.ts:35` passes it too (if it doesn't, scoring keeps marking a claim the live turn
  withheld). Other call sites that must keep today's behaviour: `lib/eval/math-check.ts:25`,
  `scripts/step-binding-check.ts`, `scripts/replay-verified.ts`, `tests/replay/corpus.test.ts`.
- **The test set** (`evals/spoken-math/sentences.json`, 50–100 sentences): the harvest is
  `Case Interview Runs/**/live-run-*.json`, candidate turns, sentences with **≥3 number words and an operator word** —
  that gives **150 unique sentences** across batches 1–38 (script below), from which to label 50–100 by hand, plus the
  real voice sentences in `Case Interview Runs/voice-live/**/*.md` (the Stream 3 report counted 9, e.g. "So fifty eight
  divided by four, um, gives us around, um, sorry, uh, fourteen point five").

```python
WORDS = r'(?:zero|one|two|...|hundred|thousand|million|billion|half|quarter|point)'
OPS   = r'(?:plus|minus|times|divided by|over|equals|gives|multiplied by|less)'
# per candidate turn, per sentence: len(findall(WORDS)) >= 3 and search(OPS)
```

- **Lorenzo's ruling P3 (binding):** the test must report how many **true** flags the reading-set parser suppresses, not
  only that it raises no false ones. Method: label each sentence consistent/inconsistent by hand; run the base and the
  parser over the set and report (a) false `incorrect` removed, (b) **true `incorrect` suppressed** — labelled
  inconsistent and no longer flagged. Add a corpus-wide count beside it: run `checkStatedArithmetic` over every
  candidate message in the corpus with and without the parser, and hand-read every verdict that changes. A parser that
  silences real math errors for free is the failure mode he named.

---

## 5. §9 item 10 — pricing-001 `churn_breakeven_at_60` and the overlay's step `inputs`: **the instruction cannot be carried out literally**

Lorenzo, 26 Oct: "pricing-001 `churn_breakeven_at_60` should list `pro_ltv` among its `inputs`. The overlay schema
currently supports only `steps[].dependsOn`, so extend it to carry step `inputs` too, behind the existing `stepLineage`
switch, and author the entry."

What I found before stopping (read-only, nothing built):

1. **`mathSteps[].inputs` are ledger item ids, not step ids.** `lib/cases/schema.ts`'s `superRefine` rejects any input
   that is not a `dataLedger` id ("Unknown ledger item"), so authoring `inputs: ["pro_ltv"]` makes the case fail to
   load. Worse, if it did load, `inputsRevealed` (`lib/scoring/math-spans.ts`) would never be satisfied — no ledger item
   `pro_ltv` can ever be revealed — so **the step's own check would be silenced for the whole interview**.
2. **The lineage machinery reads `inputs` only as a necessary condition, and it already holds.**
   `lineageInherits`'s `computedFrom(step, root)` requires the root's declared ledger inputs ⊆ the step's.
   `churn_breakeven_at_60`'s inputs are `price_test_results, price_test_notes, plan_prices_costs, plan_cac,
   starter_cohort, pro_cohort`, which already contain `pro_ltv`'s (`plan_prices_costs`, `pro_cohort`). So adding
   anything to `inputs` changes nothing there.
3. **What is actually missing is the dependency edge** — which is how Stream 2 originally wrote the proposal
   ("pricing-001 `churn_breakeven_at_60` would need `pro_ltv` in its **`dependsOn`**", stream-2-report.md §T3); the gate
   report's §9 item 10 paraphrased it as "inputs". `churn_breakeven_at_60.dependsOn` is `["starter_ltv"]` today, and the
   step's own description shows the Pro LTV in it ("$50 × 14 + $800", the $800 being the upgrade share of one Pro LTV).
4. **`cases/phase1/pricing-001.json` has no `steps` key at all** — Stream 2 removed it so round 6's authored lineage
   stands under `stepLineage` (their judgement call 6). An entry would be the first.

**Recommended implementation for the next session** (my judgement, Lorenzo's to accept): do both halves, but author the
entry as `dependsOn`.
- `lib/cases/phase1-overlay.ts`: `steps` record becomes `{ dependsOn?: string[]; inputs?: string[] }` with a refinement
  that at least one is present; `overlayProblems` validates each `inputs` id against the **ledger** (so a step id gives
  a clear load error); `applyPhase1Overlay` merges both under `on('stepLineage')`.
- `cases/phase1/pricing-001.json`: `"steps": { "churn_breakeven_at_60": { "dependsOn": ["starter_ltv", "pro_ltv"] } }`.
- Say in the report that the `inputs` mechanism exists but the entry uses `dependsOn`, with reason 1 above.
- **Replay it in the `*=stepLineage,rootLineage` arm** (the contract's highest-risk combination): the edge puts
  `churn_breakeven_at_60` into `pro_ltv`'s lineage, so they share the two-probe budget — expect changed turns in b35q
  and b37q, and classify each.
- Switches off must stay byte-identical (the overlay merge is already switch-gated; the schema change alone must not
  alter any load — assert it in `tests/cases/phase1-overlays.test.ts`).

*Cost if my reading is wrong:* the overlay carries a `dependsOn` edge where Lorenzo wanted an `inputs` entry — the same
intended effect (the lineage link), reversible in one line.

---

## 6. §9 item 11 — b35q 5c3d2c21 t13 "$600, not $400" under `starter_churn@7.5`: **not verified**

I did not get to it. How to do it cheaply (free, read-only), for the next session:

- The run is `Case Interview Runs/test runs/batch-35-quillpath-oct-20-runs-1-5/**/live-run-2026-10-20-5c3d2c21.json`
  (pricing-001). The spoken line is "Starter standalone lifetime value at $40 is about $600, not $400" and the flag row
  carries `key: starter_churn@7.5` — a churn key on an LTV figure, identical with every switch off, so it predates
  Phase 1 (Stream 3's §5 noted it).
- The question is what the **worksheet** binds that claim to with switches on. There is no b35q fixture
  (`tests/orchestrator/fixtures/phase1-s3-b38.json` is b38 only; `step-roots-b37q.json` is b37q), so either add one in
  the shape of `fixtures/phase1-s3-runs.ts` (`readsAt`), or write a scratch `tsx` script that builds `TurnReads` from
  the run json the same way and calls `planTurn` at message 13 with
  `ENGINE_SWITCHES='pricing-001=worksheet,staleProbeDrop,rootLineage,stepLineage'`, then prints
  `plan.state.flags.worksheet` (the entry keys are `step:<id>` / `pricing:<kind>@<input>`) beside the `flag` row's
  `key`/`root`. Report the finding; **do not change behaviour for it** (Lorenzo: verify then log).

---

## 7. Replay arms: what exists, what is owed

Tooling (unchanged): `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-s3-tools/` —
`proof-s3.sh <label>` (26 slices, ~60 s, free), `compare-s3.py <base> <label>`, `summ.py <compare.md>`,
`sec.py <compare.md> <slice…>`, `stale.sh`, `b38l-verdicts.jsonl` (built by `convert-b38.py`). Run from the worktree;
switches go in the environment of the script:

```bash
cd /Users/lorenzo/coding/personal-projects/CaseTester/.claude/worktrees/phase1-rest3
ENGINE_SWITCHES='*=misquoteFlat' zsh /Users/lorenzo/.../phase1-s3-tools/proof-s3.sh phase1-rest3-t4b-on
python3 -I /Users/lorenzo/.../phase1-s3-tools/compare-s3.py phase1-rest3-base phase1-rest3-t4b-on
```

| Label | Switches | Result |
|---|---|---|
| `phase1-rest3-base` | none (33c8c3e5) | the baseline for every comparison below |
| `phase1-rest3-t4-on` | `*=misquoteFlat` (first version) | superseded — 13 lines, incl. the b38 Marisol false correction |
| `phase1-rest3-t4b-on` | `*=misquoteFlat` | **6 lines, 2 decisions, all read (§2)** |
| `phase1-rest3-t5-on` | `*=probeGuardMethod` (first version) | superseded — 32 lines (16 turns) |
| `phase1-rest3-t5b-on` | `*=probeGuardMethod` | **21 lines = 13 turns, 0 decisions, all read (§3)** |

**Owed, and it is the first thing to run on resuming (free, ~1 minute):**

1. **The switches-off arm after these three commits** — `zsh …/proof-s3.sh phase1-rest3-off` with no `ENGINE_SWITCHES`,
   compared against `phase1-rest3-base`. It **must be 0 changed lines and 0 changed decisions**. I did not run it before
   stopping. By construction it should hold (every change is behind `switchOn`, `misquoteFigures` is `[]` off, and the
   new pool is unused off), with one thing to look at if it does not: `recordPhraseUses` now also scans `probe_method`,
   so `flags.phraseUses` can gain a `probe_method` key when a spoken line matches one of its versions — that changes no
   other pool's choice, but it does change the flags blob.
2. The combined arm `*=misquoteFlat,probeGuardMethod` (expect the union: 27 lines) — the two do not interact in the
   corpus, but say so from evidence.
3. After task 6 and item 10: their own arms, plus the gate arm
   `*=worksheet,staleProbeDrop,rootLineage,stepLineage,misquoteFlat,probeGuardMethod,spokenMathParser` and the
   `*=stepLineage,rootLineage` arm (the contract's highest-risk combination).

---

## 8. Judgement calls, each with its cost if wrong

1. **Task 4 keeps the right-figure agreement** and relaxes only the flag. Lorenzo's sentence relaxes "flag or not" and
   says nothing about the agreement; the replay showed the agreement is what stops a derived figure being "corrected"
   with an unrelated ledger line. *Cost if wrong:* b28 Tyler's "beans were 30% of COGS" (the checker flags the derived
   12.6, right figure 10.5, which is not the item's 25) is not corrected earlier than it already is — the run corrects
   it four turns later anyway.
2. **A matched claim rated `correct` blocks the flat path**, even beside an error-rated one. *Cost if wrong:* a real
   misquote the checker contradicts itself about goes uncorrected.
3. **The guard's allowance uses `found`, not `allFound`** (not the report-only misquotes). On a case whose ledger lookup
   is not validated, code's own finding is not trusted to correct, so it is not trusted to license a doubt.
   *Cost if wrong:* the model's catch of a report-only misquote stays vetoed. Changes nothing today (0 corpus hits).
4. **The method question is not used on a data/exhibit turn** (§3). *Cost if wrong:* where data just went out, the
   withheld doubt is answered by a data question instead of a method one; one line in `settle-turn.ts`.
5. **`probe_method`'s first version is not Lorenzo's exact sentence** (§3). *Cost if wrong:* one string.
6. **Task 7's block sits after MATH STEPS and names the steps and data lines each definition covers**, as the Stream 3
   plan proposed. *Cost if wrong:* prompt wording, one line.
7. **Item 10 authored as `dependsOn`, not `inputs`** (§5). *Cost if wrong:* one line of case data.

## 9. For the lead

- `refusalNounCheck` (4.4) and `recommendationOpensGate` are out of the `phase1` preset as of today — noted; nothing in
  tasks 4, 5 or 7 reads either.
- Nothing here writes to `Case Interview Runs/`; replay output is outside the corpus, in
  `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-rest3-*`.
- No API call was made by this stream. The only paid thing it leaves is the definitions re-check in §1, which is the
  lead's under Lorenzo's Q5 ruling.
