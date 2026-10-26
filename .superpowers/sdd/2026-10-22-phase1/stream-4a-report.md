# Stream 4a — data-path fixes (4.1, 4.2, 4.3, 4.4, 4.5, 4.7)

> **State (26 Oct, after the review round):** all six tasks are built and the review's findings F1–F8 are applied
> (§"Review fixes (26 Oct)" below — one commit per finding, with the replay re-run). Switches off is byte-identical to
> the contract base on all 31 slices. With the six switches on, 29 changed interviewer lines, all read: 0 new false
> refusals, 0 new wrong releases, 0 hollow deferrals. Stream 2's overlay data was tested against without merging
> `phase1`. **Owed: nothing on this stream except Lorenzo's rulings** (J1–J9 below, and the two points the review
> raised with him: 4.3's third outcome and F2's measured trade). `phase1` was not merged in, nothing was pushed, $0.
>
> **Next step:** the lead's merge of `phase1-s4-fixes` into `phase1` (order S2+S1, S3, then S4), then the post-merge
> fault-bank run and proof slices (contract §6). Tooling: `CaseTester-proof-out/phase1-s4a-tools/`
> (`prove.sh <label> <switches>` runs both arms and diffs them against `phase1-s4a-base`).

Branch `phase1-s4-fixes`, worktree `.claude/worktrees/phase1-s4-fixes`, off the contract commit 0f932c89
(`docs/superpowers/plans/2026-10-22-phase1-contract.md`). Seven commits, one per task plus the overlay follow-up:

| Commit | Task | Switch |
|---|---|---|
| 2d3d95d9 | 4.2 the coarse rule | `coarseKeepNamed` |
| 498f351e | 4.4 refusals | `refusalNounCheck` |
| 95f50e98 | 4.3 Haiku positives | `haikuTagGate` |
| 6078e111 | 4.5 cover normalization | `coverNormalization` |
| 2bb2eccd | 4.1 restatements | `restateRules` |
| e4a2f726 | 4.7 model-said deferrals | `modelDeferrals` |
| 84537234 | 4.5 the overlay's `coverExcludes` read by cover matching; tests made overlay-independent | `itemCovers` data (no new switch) |
| 91abd1d7 | review F2 + F3 — the noun test's head noun and single carrier | `refusalNounCheck` |
| 26022fc4 | review F1 + F6 — the named-route yield, the duplication guard, the cover gate's scope rule | `coverNormalization` |
| f75e71f8, 231abb84 | review F5 — a direct re-ask reads the figures; dropped restatements leave the rows | `restateRules` |
| 95ae9406 | review F7 — a wrap-up promise is closed in the same breath | `modelDeferrals` |
| 647a0e3d | review F4 (a) — a silently gated item is recorded, ids only | `haikuTagGate` |
| cb9fdde7 | review F3 follow-up — a finer period cut is unmeetable | `refusalNounCheck` |

No new switch was added: every behaviour sits on the switch the contract named for it (§3). `coverExcludes` is read
wherever the data is attached, which only happens under Stream 2's `itemCovers` (contract §1 and the switch table:
"coverExcludes read by cover matching"); nothing read them before.

**Spend: $0.** No live model call was made at any point (every replay serves recorded Haiku and checker verdicts).

## Verification

- `npx vitest run`: 244 files, 5,231 tests pass (3 files / 9 tests skipped as before).
- `npx tsc --noEmit`: clean. `npx eslint lib app components tests scripts db`: clean.
- Every guard mutation-checked (each listed under its task); the mutations that survive are named there.

## The free replay

Tools (outside the corpus, `CaseTester-proof-out/phase1-s4a-tools/`): `proof-s4a.sh` (the round-6 `proof.sh` slices
plus `b38l` on and off, from `b38l-verdicts.jsonl`, converted from the batch-38 wave by `convert-b38.py` the way
round 6's `convert-verdicts.py` did), `compare.py` / `datadiff.py` (round 6's, with the b38l slices added),
`linediff.py` (every changed interviewer line, deduped across a batch's off/on slices — `datadiff.py` misses a data
line that code merges into the question segment, e.g. b38l Tyler t22), `dedupe.py`, `turns.py`, `prove.sh`.
31 slices: the 21 standard ones plus b36a, b36l, b37h, b37q, b38l on and off. Output in
`CaseTester-proof-out/phase1-s4a-{base,base2,head-off,head-on,ov-noswitch,ov-s2,ov-s2-s4a,…}`.

**Determinism:** two runs of the contract base (`phase1-s4a-base`, `…-base2`) differ in 0 turns on all 31 slices.

### Condition 1 — byte-identical with every switch off

`phase1-s4a-head-off` vs `phase1-s4a-base` (the contract base), 31 slices, 4,874 interviewer turns:
**0 changed interviewer lines, 0 changed checker decisions, 0 changed data turns, 0 changed check calls.**
That covers prof-001 (b28–b31, b33) and the four new cases.

### Condition 2 — with the six switches on: no new false refusal, no new wrong release

`ENGINE_SWITCHES='*=restateRules,coarseKeepNamed,haikuTagGate,refusalNounCheck,coverNormalization,modelDeferrals'`
(`phase1-s4a-head-on`): **67 changed interviewer lines** over 31 slices (121 changed data turns counting each
batch's off and on slice). Corpus-wide decision diff, read from every turn's `data_decisions` row:

| | base | with the switches |
|---|---|---|
| refusals said that the base did not say | — | **0** |
| refusals the base said that are now a deferral or "We won't get to … today." | — | 30 |
| releases the base did not make | — | **5 distinct** (9 rows across off/on slices) |
| releases the base made that are now withheld | — | 1 (b38l Jasmine t4, below) |
| checker decisions changed | — | 0 |
| Haiku ask-check calls | 258 | 254 (0 turns make more; b38l makes 2 fewer) |

Every changed turn was read. Classification (fixed fault / new false refusal / new wrong release / neutral):

**Fixed faults — 6 turns, all graded in `Case Interview Runs/test runs/batch-3*/hand-grading.md`:**

| Run · turn | The graded fault | After |
|---|---|---|
| b38l Tyler cee7d399 t2 | **FALSE** (judgement) "I don't have split of revenue decline between passengers and average fare." | the planes-as-full fact restated + "I'll come back to the routes and schedule shortly."; `routes_schedule` released at t4 — Lorenzo's 13 Oct ruling on this very ask (4.5, then 4.4) |
| b38l Jasmine 3f928012 t4 | **FALSE** (judgement) "I don't have the ticket versus extras revenue split." | the network totals + "I'll come back to the ticket versus extras revenue split shortly."; `extras_revenue` delivered at t12 (4.2, then 4.4) |
| b38l Tyler t22 | **firm** — onward-leg revenue answered with a 90-word restatement of Exhibit 1 | "I gave you connecting passengers on those routes a moment ago." (the Exhibit 1 line is not said; 4.1) |
| b38l Tyler t24 | **firm + hollow** — the same 90-word line again, after "I'll check what we have" | the line once, and t26 says "We won't get to price elasticity on the four uncontested routes today." (4.1 + 4.7) |
| b38l Marcus 316baba1 t24 (overlay arm) | **borderline** — "revenue per passenger by extra type" answered by restating the $20 line | "we'll come back to extras revenue by type", closed at t26 (4.3, needs Stream 2's item tags) |
| b35q Raj 5c3d2c21 t12 | graded **hollow deferral** in the wave (a refusal in the replay base) | a deferral that resolves: "We won't get to later cohorts' upgrade rates today." at t24 (4.4) |

**New false refusals: 0.** No refusal anywhere in the corpus is new (table above). Three refusals the gradings
called **borderline** (the held data was reachable) became deferrals that resolve, which is the better of the two:
b36a Marcus c518221e t6 (EU manufacturing cost, `option_shared` held it coarsely), b37h Raj 11414946 t16 (category
growth is in the prompt and `why_now`), b37h Tyler 442e37ff t14 (3 bags a household from past launches, on Exhibit 2).

**New wrong releases: 0.** The five new releases each answer their ask:

- `routes_schedule` for b38l Tyler t4 ("the split of the revenue decline between passengers and average fare" —
  same flights, same planes: the case's own answer), b34l Raj 061ef630 t8 ("the breakdown of revenue into passengers
  flown and average fare"), b34l Marisol e6432db0 t8 ("the fare and passenger split underneath that, by route"),
  b22l Jordan 9ab76a39 t8 ("passengers and average fare on Lakeport and Port Avery specifically").
- `extras_revenue` for b38l Jasmine t12, the ask she made at t3 ("the revenue split between ticket and ancillary"),
  delivered through the open-request path.

**The one withheld release:** b38l Jasmine t4 no longer releases `port_avery_per_flight`. It was the coarse partial
the check gave for the ticket/extras split — data she never asked for, which the batch-38 grading itself left
uncounted ("Not counted: t4's early `port_avery_per_flight` (the coarse partial; per-flight data before Exhibit 1)").
In its place she gets the ask she made, at t12. Classified **fixed fault**, not a loss.

**Neutral — 61 turns**, in four groups:

1. **A true refusal becomes a deferral that the first wrap-up closes (24 turns + their 19 closing turns).** 4.4's
   rule. Each pair: b33 Tyler 0150f744 t12→t14, b33 Fiona 2b538541 t6→t16, b33 Marisol 31e33506 t16→t24, b34a Marcus
   cdb8ca52 t4→t20, b34a Jasmine 4e89a7cc t4→t18, b34l Raj 061ef630 t14/t16→t26, b34l Tyler 51ad0cb8 t18→t24,
   b35h Marisol a14ca044 t6 and t16→t32, b35q Raj 5c3d2c21 t12→t24, b35q Marcus 7e69eda5 t28 (said as "We won't get
   to …" at once: a wrap-up turn), b36a Marcus c518221e t6 and t24→t26, b36a Jasmine 6bbc2163 t4→t20, b36a Marisol
   6f57da6e t6→t30, b36l Raj ef7bed14 t8→t24, b36l Marcus a7d9f44e t12 and t20 (t20 is a wrap-up turn),
   b37h Raj 11414946 t12 and t16→t28, b37h Marcus ddbb070b t8→t22, b37h Marisol 7f6c40ea t6, t14 and t20→t28,
   b37h Tyler 442e37ff t14→t18, b37q Tyler a2a5921b t18→t24, b38l Marcus 316baba1 t14→t26, b38l Tyler t14 and t16→t26.
   **0 of them is left hollow** (the tracked list resolves every one; checked over every on-slice).
2. **A re-ask of a line said within the last four turns is named, not read again (6 turns).** 4.1's rule:
   b22l Owen c2cdbcc3 t6, b30 Caleb 990fc873 t10, b31 Fiona 31e90f50 t10, b31 Tyler 47fa8cfd t18, b32 Marcus
   eb170e49 t8 and t10, b38l Tyler t22.
3. **Phrase rotation only (7 turns):** the same decision in a different pool variant, because an added or removed
   line shifts the session's phrase memory — b33 Marisol t16, b34a Jasmine t4, b36a Marcus t6, b37h Marisol t26,
   b37h Tyler t18, b38l Tyler t6, t8, t24.
4. **A "We won't get to … today." line added on a wrap-up turn (the closing turns counted in group 1).**

### Condition 3 — the same proof against Stream 2's real overlay data

Stream 2's overlays are merged on `phase1`. I did **not** merge `phase1` into this branch (it would pull S1–S3 code
into the stream diff). Instead I copied the five `cases/phase1/*.json` files in **untracked** (`git show
phase1:cases/phase1/<id>.json`; the overlay loader and schema are identical on both branches — `git diff HEAD phase1
-- lib/cases/phase1-overlay.ts lib/cases/schema.ts` is empty), ran the proof, then deleted them. They are not in any
commit of this branch.

- `ov-noswitch` (overlays present, no switches) vs the contract base: **0 changed lines** — the overlay's descriptive
  fields change nothing on their own, as the contract says.
- `ov-s2` (`*=itemCovers,tagMatching`) vs `ov-s2-s4a` (those two plus my six) isolates my switches on the real data:
  **87 changed interviewer lines, 0 new refusals, the same 5 new releases, 1 withheld release** (b34l Marisol t30,
  below). The 20 extra changed turns are 4.1's exhibit pointer, which only fires when an exhibit has a `summary`:
  an item restated while its exhibit is on screen is now pointed to ("You'll find that on the exhibit — The route
  table has flights, revenue and contribution for each route in both years, with network totals, fixed costs and
  operating profit.") instead of having its figures read again. I read all 20: in each the ask was for a finer cut
  or another quantity that the restated item does not hold (b38l Tyler t22 onward-leg revenue, b38l Marisol t12
  Port Avery's fuel line, b22l Omar t14 the $20M split, b34l Marisol t16 Port Avery's own cost per flight, b35q
  Raj t8 / Marcus t18 / Marisol t22 / Jasmine t24 cohort and test data past the window, b31 Tyler t18 the COGS
  breakdown, …) — the figures are on screen in every case, so the pointer replaces a figure dump that did not
  answer the ask. Neutral to better; none is a new refusal or release.
- 4.3's tag gate fires **twice** in the whole corpus with the real tags: b38l Marcus t24 (fixed fault, above) and
  b34l Marisol e6432db0 t30 — "a breakdown of where our cost disadvantage sits — labor, aircraft size, or
  utilization?": the check's `unit_costs` ("no material changes to wages or other costs per flight") and
  `port_avery_per_flight` are gated as `kind` (neither is a split), `lakeport_variable_cost` (which *is* a split:
  fuel, crew, maintenance, fees) is kept and pointed to on Exhibit 2, beside the competitor's cost line. The ask is
  answered better; the cost of it is that `unit_costs` — which she never asked for and which never comes out later
  in that run — is no longer volunteered. **Judgement call J3 below.**
- 4.4 on the real data: 30 distinct refusals deferred, 24 still refused, **0 hollow**.
- The `coverExcludes` reader changes **no line**: on Stream 2's current data every excluded word is also an entity
  tag word, and round 6's entity rule already drops those hits (the "one source" principle). It is kept, tested and
  reported because it is the contract's wording and it will matter for a non-entity confusion.

### Replay limits (PRD §15, unchanged)

Model turns replay as saved, so a fix that would change what the model writes cannot show here (4.7 is judged on the
one saved "I'll check what we have"); no new classifier or Haiku verdict is served (4.3 is judged on recorded
verdicts plus the overlay's tags); a turn whose kind changes loses its saved declarations. `flags.openDeferrals`
**is** carried turn-to-turn inside a replayed run (the replay drives one session through `runTurn`), which is how the
"We won't get to …" closings above appear; what it cannot do is carry them across a run boundary.

## Per task

### 4.1 Restatements — `restateRules` (2bb2eccd)

Lorenzo: "if the asked thing is in an exhibit, point to it and give its one-line summary; read a number only if that
specific figure was asked; restate only the matched item's line, and never the same item twice within 4 turns."

Built in `lib/orchestrator/turn-data.ts` (`restateRules`, `saidRecently`, `FIGURE_ASK`, `RESTATE_WINDOW`), applied to
`decideData`'s restatements and to the prompt-fact restatements, in this order:

1. **matched** — the ask names the item (`namesItem` on its label, spoken name and the case's names, or one of its
   covers), read in the candidate's asking sentence for that ask (else the message sentence sharing most naming words,
   else the model's `what`). Some matched and some not: only the matched are said. None matched: all are said.
2. **never twice within four turns** — an item whose line (or a pre-written variant, or its exhibit's summary) an
   interviewer turn of the last four said is named instead: "I gave you the network totals a moment ago."
   (`restate_recent`). A prompt fact is dropped silently (it is in the prompt).
3. **the exhibit pointer** — an item on a shown exhibit that has a `summary` (Stream 2's overlay) gets
   `restate_pointer` + the summary in place of its line; its line is read when the ask names the item and asks for a
   figure (`FIGURE_ASK`).

Two new phrase pools (`restate_pointer`, `restate_recent`), five variants each, registered in
`tests/orchestrator/fixtures/code-lines-before-b.json` and `scripts/variant-list.ts`; two variants were reworded
because the recognizers read them as a handover or as `data_talk`.

- Files: `lib/orchestrator/turn-data.ts`, `data-decisions.ts` (`restates[].pointer`, `recentRestates`, rendering),
  `phrasing.ts`, `scripts/variant-list.ts`.
- Tests: `tests/orchestrator/phase1-restate-rules.test.ts` (12), from b38 Tyler t20–t24 verbatim.
  Mutations killed: the matched filter and its all-matched fallback, the four-turn window, the figure test, the
  pointer, the unmatched filter.
- Judgement calls: **J1** "read a number only if that specific figure was asked" is applied to the exhibit pointer
  only; an item said earlier but not in the last four turns and not on a shown exhibit still has its line read when
  the ask names it. **J2** a group re-ask whose items were all given a turn or two ago is now named rather than read
  (b31 Tyler t18 "Can we get the COGS breakdown?", b32 Marcus t10 "Can you give me the flight count for both years"),
  which is the rule as written but is the weakest case — if you want the figure re-read when the candidate asks for
  that figure, extend `FIGURE_ASK` to the recent rule (one line).

### 4.2 The coarse rule — `coarseKeepNamed` (2d3d95d9)

Lorenzo: "never drop an item the model named when that item matches the ask (batch 38 Jasmine t4). Log which scope
rule fired."

`outsideAskScope` was split into `scopeRule` (which rule fires, or null) with `outsideAskScope` on top, so every
caller can log it. With the switch: a **split** rule (`split_of_head`, `split_of_item`) does not drop an item the
model itself named this turn when the ask says one of the item's names as a side of the split (`namedAsPart`:
"versus X", "X versus", "between X and/or Y") in the model's words or the candidate's sentence. Every other rule (a
cut, a basis, a one-off, a count, a change-for-split) still drops it. `request_scope` logs `rules` per dropped item
and the check logs `outOfScopeRules`.

- Files: `lib/orchestrator/data-decisions.ts`, `turn-data.ts`.
- Tests: `tests/orchestrator/phase1-coarse-keep-named.test.ts` (9), b38 Jasmine t3 verbatim; a split of the item
  itself (b32 Larkspur Marisol t14 "the ancillary revenue split") is still dropped, and a `cut` rule still drops a
  named side. Mutations killed: the split-rule restriction, the model-named restriction, the switch.
- Judgement call: the `r.explicit` guard is belt-and-braces (a promoted mention is explicit by then) and survives
  mutation; kept because a passing mention is not an ask.

### 4.3 Haiku positives pass the tag gate — `haikuTagGate` (95f50e98)

Lorenzo: "must pass the tag gate (entity, period, quantityKind against the ask). A mismatch defers; it never
releases and never refuses."

`lib/orchestrator/item-tags.ts` gains `askTags` (the ask's entity from `entitiesNamed`, period from forecast /
current / historical markers, quantity kind from split / trend / one-off / recurring / total markers — the kind read
from the model's words only, since the candidate's sentence carries their other clauses) and `itemTagsAgree` (a
mismatch only when the item has none of what the ask names; an item with no tags agrees with everything).
`turn-data.ts` `haikuTagGate` runs on the check's **full, in-scope** items (a partial or out-of-scope item is already
a coarse item) after round 6's answer gate, so its entity and forecast refusals stand. A gated item is taken off the
verdict when what is left decides the same way with nothing newly refused; otherwise the verdict becomes *no verdict*
— the named deferral in the ask's words, holding no item, tracked open with the gated items as its own.

- Files: `lib/orchestrator/item-tags.ts`, `turn-data.ts`.
- Tests: `tests/orchestrator/phase1-haiku-tag-gate.test.ts` (11), b38 Marcus t23 verbatim with fixture tags, plus the
  reader's own table. Mutations killed: the positives filter, the "decides the same way" test, the tracking, the
  entity direction, the kind-from-`what`-only rule.
- "per year" / "annual" deliberately do **not** mark a recurring ask ("net price per patient per year", "total annual
  revenue" name a rate, not a recurrence).
- Judgement call **J3**: on real tags the gate fires twice; at b34l Marisol t30 it withholds a line (`unit_costs`)
  that does not answer the ask and that she never asks for again. Lorenzo's rule says a mismatch "never releases", so
  this is the rule working; if you would rather such an item still go out when nothing else answers, the gate can
  keep it when the kept set is empty.

### 4.4 Refusals — `refusalNounCheck` (498f351e)

Lorenzo: "when both code and Haiku find no match, refuse only if no ledger item shares a key noun with the ask;
otherwise defer. Haiku's 'none' adds nothing on its own."

`keyNouns` in `data-decisions.ts` (the one stemmer, a stop list of function, question, generic-label, split, period,
amount and number words, the case's proper names taken out) and `nounDeferrals` in `turn-data.ts`. A refusal the
**check** made — its "none", or a verdict with no item answering the ask — goes out only when no ledger item *not yet
out* shares a key noun with the refused words (an item's words: label, spoken name, the case's names and its covers).
Otherwise it is the named deferral in those words, holding no item, tracked in `flags.openDeferrals` with `need`: per
key noun, the items that share it. It resolves as delivered once every noun has had one of its items delivered; a noun
no item shares, or a period or scope in the words ("FY2024 fares"), cannot be met that way, so the first wrap-up turn
says "We won't get to … today." On a wrap-up turn it is said that way at once. Untouched: a check mapping that round
6's answer gate dropped whole (Haiku matched; code's tags or topic test vetoed it — audit rows 2, 18, 19), and every
refusal no check made (the scope rules' finer cuts, the gate's own parts, the geography refusals).

Open-deferral tracking was switched from "tagged case" to `tracksDeferrals` (a tagged case, or any case with
`refusalNounCheck` / `haikuTagGate` / `modelDeferrals` on), so prof-001 tracks them too under the switch.

- Files: `lib/orchestrator/data-decisions.ts`, `turn-data.ts`, `settle-turn.ts` (one line).
- Tests: `tests/orchestrator/phase1-refusal-noun.test.ts` (21), b38 Tyler t1 and Jasmine t3 verbatim with their
  recorded verdicts, plus the resolution rules and an untagged prof-001 case. Mutations killed: "not yet out", "not
  given this turn", the gate-parts exemption, the wrap-up branch, the per-noun bookkeeping, the empty-need
  resolution, `needMet` at the wrap-up, the coarse branch, the tracking gate.
- Judgement calls: **J4** "no ledger item shares a key noun" is read against the items **not yet out** — read
  literally against every ledger item, almost nothing could ever be refused, and an item already in front of the
  candidate cannot be what the deferral waits for. **J5** the test is coarse by design: one shared noun defers, which
  turns 24 true refusals into deferrals closed at the wrap-up. Every one resolves, and 2 false and 3 borderline
  refusals are fixed by it; but if you want true refusals to stay immediate, the cheapest tightening is to require the
  shared noun to be the ask's head noun (or two shared nouns). That is a one-line change in `nounReader` and I did not
  make it, because your wording was "no ledger item shares a key noun".

### 4.5 Cover normalization — `coverNormalization` (6078e111) and the `coverExcludes` reader (84537234)

Lorenzo: "finish normalization (plurals, a synonym table, matching the candidate's own sentence as well as the
model's rewording)."

In `fact-check.ts`, on a tagged case with the switch on (`FactBase.coverNorm`, set per call by `factBaseFor` so the
env switch is never cached with the case): the fold also takes "-ies" to "-y", and `PHASE1_SYNONYMS` (average fare →
fare, ticket price → fare, passenger → volume) run before round 6's `COVER_SYNONYMS`. The candidate's sentence was
already read by round 6 (`coverageDetail` (d)) and now folds the same way. A hit that **only** a Phase 1 synonym
makes yields to `FINER_WORDS` anywhere else in the ask; a hit the round-6 fold also makes is not treated as a synonym
hit. `coverExcludes` (84537234): a hit is dropped when the hit's list entry says one of the item's excluded words
outside the hit and names no word of the item's own side — dropped the `FURTHER_CUT` way, so the entry is simply
uncovered and the ask takes its normal path; it can never add a release.

- Files: `lib/orchestrator/fact-check.ts`.
- Tests: `tests/orchestrator/phase1-cover-normalization.test.ts` (15), b38 Tyler t1 verbatim; the two regressions the
  replay caught (b22 Fiona t17 "price sensitivity of Lakeport passengers at a $200 fare" wrongly matching the seats
  and load line; b36 Marcus t11 "quarter-by-quarter fares and passengers since entry" losing a true refusal) are
  pinned, as is b38 Marisol t5's "average fare by route" keeping round 6's match. Mutations killed: the own-side
  direction, the entry scoping, the wiring.
- Judgement calls: **J6** three synonyms only, each needed by a graded fault; a wider table risks the two
  regressions above. **J7** prof-001 is untagged, so the switch alone changes nothing there — it needs `tagMatching`
  (contract §5, 4.5), which is Q4's business. **J8** the M6 false-refusal veto still reads the model's `what` only,
  not the candidate's sentence: reading the sentence there would turn refusals into silence, which is worse.

### 4.7 Model-said deferrals — `modelDeferrals` (e4a2f726)

Lorenzo: "register them, so the E5 stop sequence resolves them."

`modelDeferrals` in `turn-data.ts`, called from Settle with the model's say and question **as composed** (so a
promise the vetoes withheld registers nothing). A sentence matching `MODEL_DEFERRAL` ("I'll check what we have",
"let me come back to that", …) is a deferral of the ask it names: the turn's explicit ask sharing the most naming
words, else the sentence's own lead ("On <X>, I'll check …", unless the lead carries a figure no candidate turn
said), else the turn's one explicit ask. It is not registered when the turn answers that ask — a new item released
for it, a prompt fact said, its refusal, or code's own deferral of it; `askOrigin` maps an ask said back in an item's
label to the words it was asked in so those rows are found. Never on a wrap-up turn. It resolves through 4.4's noun
reading or the first wrap-up's "We won't get to … today."

- Files: `lib/orchestrator/turn-data.ts`, `settle-turn.ts`.
- Tests: `tests/orchestrator/phase1-model-deferrals.test.ts` (10), b38 Tyler t23/t24 verbatim. Mutations killed: the
  answered test, the wrap-up guard, `askOrigin`, the figure guard in the lead, the "new release" test.
- Judgement call **J9**: the phrase list is deliberately narrow (a promise to *check* or *come back*, not "we'll see
  how that plays out"). Over the whole corpus it fires on 2 saved turns (b38 Tyler t24; b32 Fiona t18's "we'll come
  back to it" is inside a code line, correctly ignored) — the replay can only show what the saved model turns said.
  A deferral promised on the turn before the wrap-up reads a little oddly ("for a little later" at t24, "we won't get
  to it" at t26, b38 Marcus): true and resolved, but worth a look in the wave.

## Review fixes (26 Oct)

One round, one commit per finding, every commit with `npx vitest run` (5,253 pass), `npx tsc --noEmit` and
`npx eslint lib app components tests scripts db` clean. The replay was re-run after the round, both arms, and once
more against Stream 2's overlays (copied in untracked again, then deleted — `phase1` is still not merged here).

### The replay after the fixes

| | before the review | after |
|---|---|---|
| switches off vs the contract base | 0 changed lines | **0 changed lines** (31 slices) |
| switches on: changed interviewer lines | 67 | **29** |
| new refusals anywhere in the corpus | 0 | **0** |
| new releases | 5 distinct | **2 distinct** (both answer their ask) |
| releases withheld | 1 (b38l Jasmine t4's coarse partial) | 1 (the same) |
| check-made refusals: deferred / refused | 30 / 12 | **8 / 34** |
| those deferrals' outcomes | 29 wont-get-to, 1 delivered | **8 of 8 "We won't get to … today."** |
| hollow deferrals | 0 | **0** |
| checker decisions changed | 0 | **0** |

With Stream 2's overlays (`ov2-s2` → `ov3-s2-s4a`): 53 changed lines (was 87), 0 new refusals, the same 2 new
releases, 1 withheld (b34l Marisol t30's `unit_costs`, now recorded silently — F4), 10 deferred / 32 refused,
17 exhibit pointers (was 20: three are now direct re-asks that read the figures), 2 tag-gate turns, 0 hollow.

The 29 changed turns, classified: **4 fixed graded faults** — b38l Tyler cee7d399 t2 (false refusal; 4.5 fixes it, the
planes-as-full fact restated and the routes-and-schedule line deferred, then released at t4), b38l Jasmine 3f928012 t4
(false refusal; 4.2, with the extras line delivered at t12), b38l Tyler t22 (firm: the 90-word restatement is now "I
gave you connecting passengers on those routes a moment ago"), b38l Tyler t24 + t26 (firm + hollow: the line once, and
the elasticity promise closed at t26); **1 graded hollow deferral fixed** (b35q Raj 5c3d2c21 t12 → t24); **0 new false
refusals, 0 new wrong releases**; the remaining 24 are the 8 deferral/close pairs, 2 named restatements (b30 Caleb
t10, b32 Marcus t8) and 6 phrase-pool rotations.

### Per finding

- **F2 (4.4, rejected as built) — applied.** `nounReader` now needs the ask's **head noun** (`headNoun`: the last key
  noun of its head phrase) among the shared nouns **and one single item** not yet out carrying every shared noun;
  `KEY_STOP` gained `time`, `past`, `beyond`, `new` (`data` was already there). Ratio: **8 deferred / 34 refused**
  (was 30 / 12). **Flagged difference from the review's walk:** of the three *borderline* refusals the loose rule had
  converted, **one** survives (b36a Marcus c518221e t6, EU manufacturing cost) and **two** are refused again —
  b37h Raj 11414946 t16 ("category size and growth…", head noun `size`, no carrier) and b37h Tyler 442e37ff t14
  ("repeat rates from past launches", nothing shared once `past` is stopped). The review predicted one lost; the
  measured cost is two. I took the trade as instructed; it is the only place where my measurement and the review's
  walk disagree. Both graded **false** refusals are fixed, by 4.2 and 4.5 as the review expected.
- **F3 — applied, and a residual it exposed closed.** `needCarriers` intersects every needed noun's list, so only an
  item carrying the whole ask resolves a deferral, and a noun no item shares (a period or scope) makes it unmeetable.
  The replay then showed the one case the carrier rule still mis-resolved — b36l Marcus a7d9f44e t12's
  "quarter-by-quarter fares and passengers since entry", delivered at t14 by an item carrying "fare" and "passenger" —
  so a finer period cut (`FINER_PERIOD`: quarter-by-quarter, by month, weekly…) now counts as unmeetable too
  (cb9fdde7). All 8 deferrals close with "We won't get to … today."
- **F1 (4.5) — applied, with one part done differently.** A hit only a Phase 1 synonym makes now yields when the ask
  says one of the case's proper names outside the hit that the item's own words don't carry (`FactBase.properNames`,
  the client's own `clientWords` excluded, so "Larkspur's fares and passengers" is still the network ask the 13 Oct
  ruling answers). That fixes **b34l Marisol e6432db0 t8** and **b22l Jordan 9ab76a39 t8**. **b34l Raj 061ef630 t8
  names no route**, so the yield cannot see it; its real fault was the near-verbatim duplication, so a
  synonym-reached cover is no longer added when its line repeats five words of a line the turn already carries
  (`repeatsLine`) — which fixes it. b38l Tyler t4 and Jasmine t12 both stay. `coverSpans` now reads `coverNorm`
  behind the same `answerGate` guard as `coverageIn`. **The new-release list, re-derived:** exactly two releases —
  `routes_schedule` at b38l Tyler t4 (the ask he made at t1, the fare/volume split Lorenzo's 13 Oct ruling answers
  with this line) and `extras_revenue` at b38l Jasmine t12 (her t3 ask, through the open-request path). **Both answer
  their ask**; the three wrong-topic network lines are gone.
- **F5 (4.1) — applied, in two steps.** `FIGURE_ASK` gained "can/could/would you get / have / see / give / share /
  repeat / read", "remind me", "say that again" and a bare "again", and a split or breakdown ask counts as a figure
  ask (`SPLIT_ASK`); the recent rule is gated on that test. The review's two pins needed a second step (231abb84):
  the cue has to be read in **the candidate's own asking sentence**, not only in the model's label — b31 Blake
  47fa8cfd t18 ("Can we get the COGS breakdown?") passed on `SPLIT_ASK` alone, but b32 Marcus eb170e49 t10 ("Can you
  give me the flight count for both years") is declared by the model as "the network totals" and only the message
  carries the cue. Both now read the figures again. **Still named, and I did not change it:** b32 Marcus t8, where the
  model re-declares "the FY2023 versus FY2025 cost breakdown" that the candidate did not ask for on that turn (his
  message asks only for passengers flown) — naming three lines he heard one turn earlier is better than re-reading
  them, and F5's rule is about a candidate's direct re-ask. A dropped restatement now leaves `decisions.requests`
  too (a row is dropped only while another row keeps its ask on the record, so coverage accounting is unchanged).
- **F7 (4.7) — applied.** `modelDeferrals` takes `opts.wrapUp`; Settle reads the model's words again on a wrap-up turn
  and says "We won't get to <ask> today." in the same breath (b38l Marcus t24). Nothing is tracked for it, and nothing
  is said on the close itself.
- **F6 — applied.** The cover gate's scope miss logs which rule fired (`rule`), as `request_scope` does.
- **F4 — no behaviour change, as instructed.** (a) The gated ids are now booked on `flags.openDeferrals` as a
  **silent, ids-only** entry: nothing is said for it, the wrap-up never names it, and it resolves only when one of its
  own ids is delivered — so a later delivery is logged against that ask. (b) **4.3 has a third outcome**, which the
  contract's wording ("A mismatch defers") does not cover: *release* (the tags agree), *deferral* (the mismatch leaves
  the ask with nothing, so the ask is deferred and tracked), or a **silent drop** when the kept items still answer the
  ask. The silent drop is what happens at b34l Marisol t30, and the review agreed it is the right behaviour there.
- **F8 — noted.** `lib/orchestrator/settle-turn.ts` is **Stream 3's file** in the contract's split (§5), and this
  stream touched it: the `tracksDeferrals` gate and the model-deferral hook (4.7, F7). Conflict list for the merge:
  `settle-turn.ts` (Stream 3), `turn-data.ts`, `data-decisions.ts`, `fact-check.ts`, `item-tags.ts`, `phrasing.ts`,
  `scripts/variant-list.ts`, `tests/orchestrator/fixtures/code-lines-before-b.json`,
  `tests/orchestrator/turn-data-covers.test.ts`.

## What is left

- **4.6 and 4.8–4.11 are Stream 4b's** (`request-signal.ts` want cues, `close-hold.ts`, `phrasing.ts` ack pools,
  `lib/scoring/**`): untouched here.
- **`exhibitOnly` bookkeeping:** Settle counts a restated id as "said", so an item whose restatement became a pointer
  is treated as said aloud. Harmless today (it only chooses the next restatement's lead-in) and left alone.
- **J1–J9 above** are the decisions I made conservatively, as of the first round; the review round changed two of
  them: **J5** is settled (the noun test is now the head-noun + single-carrier rule the review specified, with its
  measured cost recorded above) and **J1** is settled for a direct re-ask (F5). J3 stands as the review ruled it, with
  4.3's third outcome written up for Lorenzo (F4 b).
- **Still unresolved and worth his eye:** F2's measured trade (two borderline turns refused again, not one), and
  b32 Marcus t8 (a model re-declaration of an ask the candidate did not make, answered by naming rather than reading).
- The fault-bank records for these turns are Stream 1's; this report's run · turn citations are the evidence they need.
- PRD and progress updates for Stream 4a are the lead's merge commit (the contract has each stream report its own
  changes); nothing in the PRD body is contradicted by this branch while every switch is off.
