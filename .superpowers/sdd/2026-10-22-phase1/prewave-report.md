# Phase 1 — the pre-wave fixes (26 Oct 2026)

Branch `phase1-prewave`, worktree `.claude/worktrees/phase1-prewave`, off `phase1` **b2496fb0** (the gate verdict).
Seven commits. **5,680 tests pass**, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db` clean on
every one. **No API call, no spend, nothing pushed, merged, deployed or written to the database. No wave has run.**

---

## The three pre-wave gate conditions

| Condition | Verdict |
|---|---|
| Correct records ≥ 95/96 | **MET. 0 correct records fail, in either arm** (was 1). Of 99, the replay judges 95 and all 95 pass; the other four are replay artifacts labelled non-replayable (three were already, `b34a-tyler-t30-close` is new under ruling 2) |
| Phase-1-owned fault records do not drop | **NOT MET by exactly one record, by your own instruction.** `b38l-tyler-21m-3-6m` passed before and fails now: the correction it wants is the ~70-word read-out at the goodbye that **ruling 4 forbids**. Nothing else moved from pass to fail in either arm. The on-arm total rose 73 → 79 on a denominator four smaller |
| 0 new false refusals, wrong releases or false corrections | **MET.** With the switches off: **0 changed interviewer lines, 0 changed checker decisions, fact-check identical on all 31 slices.** With `*=phase1`: 12 changed lines, 0 changed decisions, every one read below. Two refusals **removed**, none added; one release added (the one your grading asks for); one correction added (ruling 11's, from the ledger line); two corrections removed (rulings 3 and 4). F1 = F2-rec = F3 = F4 = **0** on every slice in both arms |

One number moved in fact-check and it is ruling 4's own consequence: **b38l `cee7d399` F2-next 7 → 8**, the new flag
being his own `$3.6M` at message 31, now left uncorrected because ruling 4 sends it to the written report. F1 (the
interviewer's own false facts) stays 0.

---

## Ruling 1 — the eight still-failing `false_refusal` records, with their owners

All eight were Phase-1-owned. **Six now pass, one is relabelled a replay artifact, one is explained.**

| # | Record | Sev | Stream | Outcome | What moved it |
|---|---|---|---|---|---|
| 1 | `b34a-jasmine-t4-drug-class` | serious | 2 | **passes** | `coarseNoRefusal` (new switch): the drug-class split is no longer refused in the same breath as the `current_treatment` line it just gave |
| 2 | `b34l-tyler-t22-ramp-refusal` | false | 4 | **non-replayable** | Both arms *and the base with every switch off* write t22 as a code `stage_brainstorm` turn; the model's saved refusal and its data request are never used, and `new_route_rampup` is released at t24. A turn whose kind changed can neither reproduce nor disprove a refusal standing in the same turn as the release (contract §4.3). It fails identically off and on, so it is no regression |
| 3 | `b36l-marcus-t6-casm` | false | 2 | **passes** | Bank instrument: `answered` now counts a deferral **of the item**. t6 defers "wages and other costs per flight" (`unit_costs`), t8 releases it. Classified `fixed_on_base` — the base already did this; only the instrument was blind |
| 4 | `b36l-jasmine-t2-departures` | false | 2 | **passes** | Same. t2 defers "the network totals and average fare" (`network_totals`). Also `fixed_on_base` |
| 5 | `b37h-raj-t16-category-growth` | borderline | 2 | **passes** | One overlay cover on `why_now`: "growth for better-for-you snacks". t16 now gives the chip/better-for-you line and defers the rest instead of refusing the whole ask |
| 6 | `b37h-tyler-t14-repeat-rates` | borderline | 2 | **still fails — explained below** | — |
| 7 | `b38l-tyler-t2-split-refusal` | false | 2 | **passes** | The false refusal was already gone; the positive leg's item becomes `routes_schedule`, the item the record's own note names. t2 defers "the routes and schedule", t4 releases it |
| 8 | `b38l-jasmine-t4-ticket-extras` | false | 4 | **passes** | The false refusal was already gone (it defers `extras_revenue`, open through t10, released at **t12**). The positive leg becomes `answered` accepting a deferral that resolves — the treatment its four sibling records were given on 25 Oct |

`false_refusal` as a class: **7/15 → 13/14** with `*=phase1` (and 7/15 → 9/14 with the switches off, from the
instrument fix alone). `fault-bank check` still reports **0 wrong** against the recordings, so every record still
fails on the run that recorded its fault.

### #6, precisely why it cannot pass, and what would be needed

`b37h-tyler-t14-repeat-rates` (borderline). He asked for "repeat rates from past launches"; t14 says "Repeat rates
from past launches — that's not something I have." What the case holds is `planning_assumptions`: *"Planning
assumptions from Hollis Bay's past launches are: 30 million households … and each buying household averages 3 bags
in year one"* — covered by **exhibit-2, on screen since t8**, which is why you graded it borderline rather than firm.

Nothing in the item's covers matches the ask as worded: the base has "bags each buyer buys", "purchase frequency";
the overlay adds "bags per household", "what share actually buy". **What would be needed:** a cover on
`planning_assumptions` for "repeat rate" / "repeat purchase rate" / "from past launches", plus the already-out path
(the item is revealed through exhibit-2, so the right outcome is 4.1's exhibit pointer, not a release).

**I did not make it, and this is a judgement call with a cost.** "Repeat rate" is a standing industry term for a
quantity the case does **not** hold — true repeat purchase inside year one. A cover mapping it to
`planning_assumptions` would answer a question the case cannot answer with a bags-per-buyer figure: the loose-release
shape §7.6 of the combined replay flagged, and a **new wrong release** is one of the three things your gate forbids.
*Cost if I am wrong:* one borderline record stays red and one cover goes unwritten until you rule.

### Two records that moved for a reason worth naming

`b36l-marcus-t6-casm` and `b36l-jasmine-t2-departures` are classified **`fixed_on_base`** by the harness — they pass
in **both** arms. Their faults were already fixed by round 6 and the ungated base fixes; the bank could not see it,
because the `about` regex was written from the candidate's words and code words a deferral from the **item's** label.
They are not Phase 1 wins, and I am not counting them as such.

---

## Ruling 2 — the bare "Go on." artifacts

The replay fills a turn whose kind changed, and for which it holds no saved model output, with a neutral `"Go on."`
No record anchored on such a turn can be judged from a replay. **Three of the four turns you named carry records;
b32 Marcus `eb170e49` t32 carries none.** Four records in all, each with a wave note; `wave-judged.md` regenerated
(54 → 59 records).

| Turn | Records relabelled | What the replay showed |
|---|---|---|
| b33 Tyler `0150f744` t18 | `b33-tyler-t18-stale-reprobe`, `b33-tyler-t18-want-dropped` | the stale 19% probe is provably gone; the turn's own words are the placeholder |
| b34a Tyler t30 | `b34a-tyler-t30-close` | the base writes another kind here — it failed in **both** arms. This is the one correct record that was failing |
| b37q Marcus `eb8d7576` t32 | `b37q-marcus-t32-rec-reask` | 4.9 skips the fresh recommendation ask and nothing else remains in the saved turn |

---

## Rulings 3, 4 and 11 — the misquote corrections

### 11. Name the misquoted input, never a result that's within tolerance

Inside `misquoteFlat`, the only path that reads it. **What I found first, free, from the saved verdicts of the
definitions re-check** (`CaseTester-proof-out/defs-recheck-on/sonnet55-medium.jsonl`):

- **b37h `442e37ff` t6** raises three error claims: `"ingredients you said $0.75"` → right 0.70; `"so 1.55 per bag
  total variable"` → right 1.5; `"contribution margin is 3.00 − 1.55 = $1.45 a bag"` → right 1.5. All three sit
  inside the checker's own 5% band, so **every flag is dropped** and the checker says nothing about $1.45. The flat
  path picks the `$0.75` claim (its right figure, 0.70, is one the data line states) and speaks the
  `variable_costs` ledger line — *"variable costs per bag are $0.70 for ingredients, $0.30 for packaging…"*. **Your
  rule already held here**; nothing was needed.
- **b37q `a2a5921b` t12** was the gap. Its error claims are `"$12 cost, $28 margin"` (right 30), `"$700"` (right
  600) and `"$78 margin, $3,900 LTV"` (right 4000). None of those right figures is a figure of `plan_prices_costs`
  (100 / 20 / 40 / 10), so `rightAgrees` dropped the finding and **the misquoted input went unnamed**.

**The fix** is narrow: a misquote-typed error claim whose own stated figure sits inside the checker's own tolerance
band of its right figure may license the flat path even when the right figure is not code's. `statedWithinBand` is
extracted from `withinTolerance`, so there is one tolerance formula. The b38 Marisol guard still holds — her 15.8
against a right 11.8 is far outside the band — and the existing test that pins the agreement (right figure 18
against her 21) stays green. The line said is always code's ledger line for the misquoted item, so it names the
input and never the result.

**It fires on the real run, with recorded verdicts:** b37q `a2a5921b` **t14** now opens *"To correct one figure: pro
is $100 a month with a $20 monthly cost to serve, and Starter is $40 a month with a $10 monthly cost to serve"* —
the misquoted inputs ($12 and $22), not the $3,900 that is within tolerance.

### 4. No correction on the closing turn

Behind the new switch `correctionRules`. The close no longer lifts the per-item cap; what it held is logged as
`misquote.closeHeld`. **b38l Tyler `cee7d399` t32** goes from the ~70-word four-route read-out prepended to the
goodbye to the plain close: *"That covers what I wanted to get to. Thanks for working through the case — your
written report will follow."*

**Its cost, stated plainly:** the `$3.6M` misquote now stands. It is the one fault-bank record that drops
(`b38l-tyler-21m-3-6m`) and the one fact-check number that moves (b38l F2-next 7 → 8, the same figure at message
31). Both are the ruling working, not a defect — but `b38l-tyler-21m-3-6m` now encodes a behaviour you have
overruled and wants re-grading, and the `$3.6M` has to reach him in the written report.

### 3. Each item is corrected once, on every path

Behind the same switch. `correctsItemAgain` replaces two rules at once: the reply to a recommendation ask bypassed
the cap entirely, and the cap itself (`MISQUOTE_CORRECTIONS_PER_ITEM = 2`) allowed a second. **b32 Tyler
`51b8cc22`** loses the identical Port Avery correction at t28 — and, because t28 is no longer spent on it, the run
reaches its closing line at **t30** ("That's everything I wanted to cover…") where before the close was pushed out
of the recorded turns. Both halves of your §7.2 residual, in one change.

---

## Ruling 5 — `WRAP_UP_PROBES` stays 2, and the cap is logged

Unchanged at 2. The rec-math probe and the closed-rec correction are now computed **without** the cap and the cap
applied after, so a new `wrap_up_cap` check can say what was kept back: `{ cap, left, spentOn, dropped }`, with
`dropped` naming `rec_math_probe`, `closed_rec_correction` / `closed_rec_probe` or `close_hold_wait`. Log only — no
switch, no change to any spoken line, and the replay confirms it (0 changed lines attributable to it).

---

## Ruling 6 — pricing-001's `churn_breakeven_at_60`

**Built, because the condition held.** `cases/phase1/pricing-001.json` gains
`"steps": { "churn_breakeven_at_60": { "dependsOn": ["starter_ltv", "pro_ltv"] } }`, merged under the existing
`stepLineage` switch.

Authored as `dependsOn`, not `inputs`: `mathSteps[].inputs` are ledger ids (the schema rejects a step id, and a
loaded one would silence the step's own check for the whole interview), and the step's inputs already contain
`pro_ltv`'s. The overlay needed no extension.

**The condition — "only if the lineage replay stays clean":** the `*=stepLineage,rootLineage` arm over all 31
slices (230 runs), against the same arm without the entry — **0 changed interviewer lines, 0 changed checker
decisions, fact-check identical on every slice.** (Stream 3 expected changed turns in b35q and b37q; there are
none.)

---

## Ruling 7 — what the worksheet binds b35q `5c3d2c21`'s "$600, not $400" to

**Free, read-only, no behaviour changed** (the script is kept at
`…/scratchpad/ws-b35q.test.ts`; it builds `TurnReads` from the saved run and calls `planTurn` at message 13 with
`ENGINE_SWITCHES='pricing-001=worksheet,staleProbeDrop,rootLineage,stepLineage'`).

**The finding: the worksheet binds it correctly, and does not inherit the flag's churn key.**

| Where | Key | Value |
|---|---|---|
| the saved flag row `11:0` | **`starter_churn@7.5`** | line *"Starter standalone lifetime value at $40 is about $600, not $400."*, span *"$400 of Starter margin"* |
| the worksheet | **`step:starter_ltv`** | 400, usd, turn 11, span *"$400 of Starter margin"*, source `checker`, status **wrong** |
| the worksheet, separately | `step:starter_churn` | 7.5, percent, turn 9, status wrong |

So the churn key is a checker-side artifact — the flag's identity and attempt chain, raised on the churn claim at
message 9 and carried to message 11's LTV figure as attempt 2. The worksheet binds by the claim's own
`codeQuantity`, giving the LTV its own entry, which is the right root for the stale drop and the root rules.
**Nothing to fix.**

---

## Ruling 8 — the ~300 unread detector flags

Left out of the bank, as ruled. **The confirmation is negative and worth your eye:** the builder still sweeps them
in on a rebuild. Measured 26 Oct against the main checkout's corpus, a bare
`npx tsx scripts/build-math-labels.ts` writes **680** labels (399 recall, **304 of them with no hand-read claim
key**) against the **372** committed — its D6-detector scan has no batch restriction. The committed set is protected
only by nobody running the builder. (The file was restored from the index immediately; no label changed.)

So the ruling's "still does not sweep them in" is now a **test** rather than a hope: every committed label from
batch 22 on must name a hand source, and the count is pinned at 372. A rebuild that swept the unread flags in fails
loudly instead of moving the checker's own baseline silently. **Not built, because you said no action:** the
one-line guard in the builder itself (restrict the scan to batches ≤ 21, or require a `--sweep-unread` flag).

---

## Ruling 9 — b38 Tyler's "$125" Lakeport fare

A quote anchor gains **`scope`**: a bare quantity name counted only where one of the scope words is named earlier in
the same sentence. `cases/phase1/prof-002.json` gives `lakeport_fare`
`{"names": ["fare", "fares"], "scope": ["lakeport"]}`, merged under the existing `misquoteAnchors` switch.

Two rules come with it, both needed:
- **a scoped name never names the item on its own.** `buildFactBase` skips scoped anchors when it builds a
  quantity's `names`, so "fare" does not make every fare ask or claim `lakeport_fare`'s — refusals, covers and
  claim reading are untouched.
- **a modifier right before the bare name makes another quantity** (break-even, target, required, implied,
  budgeted, planned, hold). This came out of the measurement, not from theory.

**The verification you asked for.** A free sweep of **every candidate message in every prof-002 run in the corpus —
28 runs, 412 messages** — comparing the overlay *without* the new anchor against the overlay *with* it:

> **1 added, 0 removed.** The one addition is the target: b38l Tyler `cee7d399` t13's *"On Lakeport, the exhibit
> shows fare down to $125…"* → `lakeport_fare`.

Before the modifier rule the sweep found one false flag — b22l Raj `07` t24, *"Lakeport's breakeven fare is $130"*,
his own derived figure. It is pinned as a test, with the other modifiers.

**And the misquote is now caught on the replay.** b38l Tyler **t14** goes from the probe guard's generic *"Walk me
through how you worked that out."* to the model's own catch: *"Before you size the fix, look at the fare line: what
does it show for FY2025, and does your $125 match it?"* — the record `b38l-tyler-t14-125-vetoed` passes. (Task 4's
half 2 had the machinery; it had nothing to act on until the anchor found the misquote.) `scripts/misquote-eval.ts`
is prof-001-only, so the corpus sweep above is the lint that applies; `phase1-cover-lint` is for covers.

**Rulings 10 and 12: no action, as ruled.**

---

## The launcher's per-run scoring — no new flag needed

`--score=` already expresses "these runs only", with one correction to the question: **it takes persona ids, not run
numbers**, and `planWave` dedupes `personaIds`, so a wave holds at most one run per persona — naming the persona
names the run. A batch runs one case (`--case=`), so the sample is one invocation per case:

```bash
# prof-001 — all five scored: no --score and no --no-score
npx tsx --env-file=.env.local scripts/persona-batch.ts --batch=<b> --case=prof-001 --personas=7,24,40,57,64 --cap=50 …
# every other case — one run scored
… --case=pricing-001 --personas=7,24,40,57,64,65,66,67 --score=24 …
```

Pinned by a test in `tests/eval/wave-commands.test.ts`. **No wave was run and nothing paid was launched.**

---

## The fault bank, both arms, against the pre-fix baseline

Labels under `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/`. Each run ≈ 16 s, free.

| Arm | Fault records passing | Correct records failing | `false_refusal` |
|---|---|---|---|
| `prewave-base-off` (b2496fb0, no switches) | 50 / 160 | 1 | 7 / 15 |
| `prewave-base-on` (b2496fb0, `*=phase1`) | 73 / 160 | 1 | 7 / 15 |
| `prewave-final-off` (HEAD, no switches) | **52 / 156** | **0** | 9 / 14 |
| `prewave-final-on` (HEAD, `*=phase1`) | **79 / 156** | **0** | **13 / 14** |

(Counted on the harness's replayable denominators. Counting only records the replay actually judged this run:
base-on 68/154, final-on 74/150; correct 95/96 → 95/95.)

### `compare --against=prewave-base-on --to=prewave-final-on` — 13 moved

| Record | Was | Now | Reading |
|---|---|---|---|
| `b34a-jasmine-t4-drug-class` | FAIL | **pass** | ruling 1, `coarseNoRefusal` |
| `b36l-jasmine-t2-departures` | FAIL | **pass** | instrument; `fixed_on_base` |
| `b36l-marcus-t6-casm` | FAIL | **pass** | instrument; `fixed_on_base` |
| `b37h-raj-t16-category-growth` | FAIL | **pass** | ruling 1, the `why_now` cover |
| `b38l-jasmine-t4-ticket-extras` | FAIL | **pass** | ruling 1, the deferral that resolves |
| `b38l-tyler-t2-split-refusal` | FAIL | **pass** | ruling 1, the item re-named |
| `b38l-tyler-t14-125-vetoed` | FAIL | **pass** | **ruling 9** |
| `b38l-tyler-21m-3-6m` | pass | **FAIL** | **ruling 4's instructed cost** |
| `b33-tyler-t18-stale-reprobe` | FAIL | not_replayable | ruling 2 — hand read above |
| `b33-tyler-t18-want-dropped` | FAIL | not_replayable | ruling 2 — hand read above |
| `b34l-tyler-t22-ramp-refusal` | FAIL | not_replayable | ruling 1 — hand read above |
| `b37q-marcus-t32-rec-reask` | FAIL | not_replayable | ruling 2 — hand read above |
| `b34a-tyler-t30-close` (correct) | FAIL | not_replayable | ruling 2 — the failing correct record |

The harness marks "4 left the gate's denominator" and demands a hand read of each. All four are read above: three
are bare-`"Go on."` turns you ruled on, the fourth is b34l Tyler t22, a diverged turn in **both** arms and on the
base.

### `compare --against=prewave-base-off --to=prewave-final-off` — 7 moved

The same four relabels, the one correct record, and `b36l-jasmine-t2` / `b36l-marcus-t6` — the two the instrument
now reads correctly in both arms. **No record moved from pass to FAIL with the switches off.**

---

## The replay, both arms, classified

Tooling: `…/phase1-combined-tools/proof-combined.sh`, with the one fix the combined replay called for — the
`fact-check.ts` loop runs with **`ENGINE_SWITCHES` unset**, so the overlay's misquote anchors cannot make the
detector itself see more misquotes. Output outside the corpus. 31 slices, 230 runs, ≈ 37 s an arm, free.

### Switches off — `prewave-base-off` vs `prewave-final-rep-off`

**0 changed interviewer lines, 0 changed checker decisions, fact-check identical on all 31 slices.** Every change in
this round is behind a switch or in the bank harness; gate condition 3 picks up no new deviation beyond the one you
already accepted.

### `*=phase1` — `prewave-base-on` vs `prewave-final-rep-on`

**12 changed lines (9 turns; each appears in the checker-off and checker-on slice), 0 changed checker decisions.**
Every one read:

| Run · turn | Change | Class |
|---|---|---|
| b38l Tyler `cee7d399` t14 | the guard's generic method question → the model's own *"…does your $125 match it?"* | **fixed graded fault** (ruling 9) |
| b38l Tyler t32 | the ~70-word four-route read-out before the goodbye → the plain close | **fixed graded fault** (ruling 4) |
| b32 Tyler `51b8cc22` t28 | the identical Port Avery correction, said a second time → the measure question | **fixed graded fault** (ruling 3) |
| b32 Tyler t30 | the close-wait line → the closing line *"That's everything I wanted to cover…"* | **improvement** (ruling 3 frees the turn) |
| b34a Jasmine `4e89a7cc` t4 | *"I don't have current US treatment breakdown by drug class or Kelvexa's European sales trajectory"* → the European half alone | **fixed graded fault** (ruling 1); the true refusal stands |
| b37h Raj `701443f7` t16 | the whole-ask refusal → the `why_now` line plus *"I'll come back to category size and Midwest shortly"* | **fixed graded fault** (ruling 1) |
| b37q Tyler `a2a5921b` t14 | **new** correction *"To correct one figure: pro is $100 a month with a $20 monthly cost to serve, and Starter is $40 a month with a $10 monthly cost to serve"* | **fixed graded fault** (ruling 11): the misquoted input named, never the $3,900 |
| b32 Raj `…` t14 | *"I don't have the ancillary revenue split."* disappears; exhibit-2, which carries the $20 of extras, goes out on the same turn | **neutral / intended** — `coarseNoRefusal` on a `split_of_item` ask whose coarse item is in front of him. The split itself gets no word of its own |

**Counted against the three forbidden classes:** 0 new refusals (two removed), 0 new releases that miss their ask
(one added — `why_now` on the ask your grading says it answers, with a deferral for the rest), 0 new false
corrections (one correction added and it is the ledger's own line on a real misquote; two removed).

**fact-check, same instrument throughout (the detector run with no `ENGINE_SWITCHES`):** identical on 30 of 31
slices. The one move is **b38l-on F2-next 7 → 8**, the added flag being `cee7d399` t31's `$3.6M` — his own misquote,
now left standing because ruling 4 sends it to the written report. **F1 0, F2-rec 0, F3 0, F4 0 on every slice in
both arms.**

---

## Judgement calls, each with its cost if wrong

1. **The bank instrument now counts a deferral of the record's `item`, however code worded it.** Contract §4.2 says
   assert outcomes, not wording, and code words a deferral from the item's label. The anchor must still hold a
   deferral and it must still resolve. *Cost if wrong:* two records (b36l Marcus t6, b36l Jasmine t2) are greener
   than they deserve — both are classified `fixed_on_base`, so the claim they support is "the base already did
   this", not "Phase 1 did".
2. **`coarseNoRefusal` is narrowed to split-of-item asks.** The unnarrowed rule cost one **correct** record (b36a
   Jasmine t4's true refusal, exhibit-backed) and three fault records whose refusal is right (b36a Tyler t6, b37h
   Tyler t6, b35q Raj t12, all cover-mapped to another quantity). Measured, then narrowed, then re-measured.
   *Cost if wrong:* a split-of-item ask gets the coarse line and no word on the split. It is in the preset; naming
   `-coarseNoRefusal` turns it off.
3. **Rulings 3 and 4 share one switch, `correctionRules`; ruling 11 sits inside `misquoteFlat`.** Ruling 11 only
   ever applies when `misquoteFlat` is on, so a switch of its own would measure nothing extra. *Cost if wrong:*
   rulings 3 and 4 cannot be measured apart in a wave.
4. **Ruling 11's band test is `statedWithinBand`, extracted from `withinTolerance`.** One formula, two callers.
   *Cost if wrong:* a change to the checker's tolerance moves the flat path too — which is the intent.
5. **Ruling 5's log is ungated.** It changes no spoken line, so a switch would only hide it from the wave report.
   *Cost if wrong:* one extra check row per turn in the turn file.
6. **Ruling 9's scope rule reads the whole sentence before the name, not a clause.** "On Lakeport, the exhibit
   shows fare down to $125" has a comma between route and quantity, so a clause restriction would miss the target.
   The residual risk is a same-sentence mixed-route mention; the existing contrast guard covers the common form,
   and the 412-message sweep found none. *Cost if wrong:* one false misquote named against the wrong route.
7. **Ruling 9's modifier list is in code, not case data.** A scoped anchor is a bare quantity word, so the
   modifier rule belongs to the mechanism, not to one case. *Cost if wrong:* a real misquote worded "the breakeven
   fare is $130" goes uncorrected — a breakeven figure is the candidate's own derived quantity, never a quote.
8. **`b38l-tyler-t2-split-refusal`'s item re-named to `routes_schedule`.** It is the item the record's own note
   names as the one whose covers missed; `route_results_lakeport` is one route's revenue, and the ask is
   network-level. *Cost if wrong:* the record greens on an answer you would have wanted narrower.
9. **`b38l-jasmine-t4-ticket-extras`'s positive leg accepts a resolving deferral**, as its four siblings were given
   on 25 Oct. *Cost if wrong:* a deferral is accepted where you wanted the release in the same turn.
10. **`b37h-tyler-t14-repeat-rates` left failing** rather than fixed with a "repeat rate" cover (above). *Cost if
    wrong:* one borderline record stays red.
11. **Ruling 8's confirmation is a test, not a change to the builder.** You said no action; a test is the weakest
    thing that makes the confirmation durable. *Cost if wrong:* one test to delete.
12. **`b34l-tyler-t22-ramp-refusal` relabelled non-replayable.** It fails identically off and on because the base
    writes another turn kind. *Cost if wrong:* one fault record leaves the gate's denominator and goes to the wave.

---

## What is still open for you

1. **`b38l-tyler-21m-3-6m` needs re-grading.** Ruling 4 overruled the behaviour it asserts. The `$3.6M` misquote
   now reaches the candidate only through the written report — which is what you ruled, but the record should say
   so rather than fail.
2. **`b37h-tyler-t14-repeat-rates`** — the cover is written above and not applied. One word from you either way.
3. **The label builder's unswept D6 scan** (ruling 8): a test now catches a rebuild; the builder itself is
   unchanged, as ruled.
4. **b37h Raj t16's deferral wording** — *"I'll come back to category size and Midwest shortly"* is the leftover
   ask parts, read literally. Honest, slightly odd. Not a fault; worth a wording pass some time.

## Commits

| | |
|---|---|
| `3e3bc67b` | the bare "Go on." replay turns are non-replayable (ruling 2) |
| `fe09db60` | route-scoped quote anchors; b38 Tyler's "$125" Lakeport fare (ruling 9) |
| `becd5958` | the three correction rules and the wrap-up cap's record (rulings 3, 4, 5, 11) |
| `8eefa394` | pricing-001's `churn_breakeven_at_60` depends on both LTVs (ruling 6) |
| `5a0a0d45` | ruling 8's confirmation and the wave's scoring sample |
| `5505dc4b` | ruling 1 — four of the eight `false_refusal` records now pass |
| `b5032525` | ruling 1 — the last two reachable `false_refusal` records |
