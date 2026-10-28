# Shared-engine bundle, round 6 (after the data-path audit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lorenzo's round 6 (21 Oct): cover matching and cover data, the guard on every path that gives a data line (with company and forecast/current tags), the audit's 12 code-only fixes, must-reach items for prof-002, and step-check probe capping. Prove it all on free replays. Only if every pre-authorized condition holds, run one Larkspur wave ($9 hard cap) and grade it.

**Architecture:**
- **Cover matching:** covers stay the one source for "the case holds this". `coverageOf` gets plural, synonym and exclusion-aware matching, reads the candidate's asking sentence as well as the model's `what`, and its matches are checked against item tags before anything is released.
- **The release gate:** the qualifier guard becomes a gate on every path that releases or restates an item. Its unmet topic, entity or forecast/current verdict refuses that part and never releases a coarse item.
- **Must-reach and step capping:** case-declared data that drives two code hooks (exhibit handover / recommendation ask; the checker's root linking).

**Tech Stack:** TypeScript (Next.js), zod case schema, vitest, the corpus replay runner (`tests/replay/runner-corpus.replay.test.ts`), `scripts/persona-batch.ts`.

**Spec:**
- Lorenzo's message of 21 Oct ("Go-ahead for round 6 and one paid batch"), quoted per task below.
- The audit `docs/superpowers/plans/2026-10-21-data-path-audit.md` (be1217b): fault rows 1–22 and M1–M3, Part 2's check list.

## Global Constraints

- **Branch and safety:**
  - Branch `engine-asks`, worktree `.claude/worktrees/engine-asks`, BASE be1217b. No push, merge or deploy.
  - Never `git add` under `Case Interview Runs/`. Never read `.env*`. No migrations, no DB writes.
- **Per task:** one commit, with the full suite, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db` passing. Mutation-test every code task. Test sentences are verbatim from the transcripts (rows cite the run and turn).
- **prof-001 must replay identically** on its 13 standard slices: b28–b33 on/off, plus b22l is Larkspur. The answer gate, sentence matching and normalized matching switch on per case with the new `factAnchors.tags` block, which prof-001 doesn't get. Global grammar fixes ship only if prof-001's replay is unchanged; a fix that changes prof-001 is scoped to tagged cases.
- **No added model calls at runtime:**
  - every new refusal is unchecked;
  - no new ask may reach the Haiku check (`itemless_defer`) that didn't reach it before;
  - nothing new calls the classifier.
- **Paid calls:**
  - live Haiku check or classifier calls in the proof: hard cap **$0.15** total (`LLM_BUDGET_USD=0.15`, one budget file);
  - the wave: hard cap **$9** (`--cap=9`), stop at the cap;
  - one wave only.
- **Lorenzo's rulings (21 Oct)** are recorded verbatim in the ledger `.superpowers/sdd/2026-10-21-engine-asks-round6/progress.md` and in PRD §16.

## Covers: every read site (scope item 1, traced before any change)

Lorenzo: "Trace covers first. Before changing any cover, document every place covers are read (refusal veto, release decision, coarse path, anything else) and write it in the plan."

`factAnchors.covers` (case JSON) is loaded once into `FactBase.covers` (`fact-check.ts:169`, `buildFactBase`). Every read goes through `coverageOf` (`fact-check.ts:656`) or reads the phrases directly:

| # | Site | Code | Reads covers to… | Decides |
|---|---|---|---|---|
| R1 | Coverage step | `turn-data.ts:738–765` (`coverageOf`) | map an item-less explicit ask to the covered items; keep the uncovered rest as a refusal; restate a prompt fact (`say`, `:748`, `:973`); count-finer entries → coarse (`coarse`, `:743–745`) | **release decision** (`refusal_covered`) |
| R2 | Names remap | `turn-data.ts:735` (`findFalseRefusals` without covers) | names only, not covers (listed for completeness) | release decision (`refusal_remapped`) |
| R3 | Per-store mapped asks | `turn-data.ts:664–684` (`coverageOf`) | add the covered item to a mapped per-store ask; exempt covered items from the scope rules (`coveredHere`, `:665`, `:685`) | release decision + **scope exemption** |
| R4 | Check verdict scope | `turn-data.ts:113` (`answersAsk`) | a covered item is in the ask's scope, whatever the scope rules say | **coarse path** (`outOfScope`) |
| R5 | M6 veto on check refusal parts | `turn-data.ts:214` (`findFalseRefusals(…, { covers: true })`) | a refusal part a cover names is not said | **refusal veto** (`partial_dropped` false_refusal) |
| R6 | Model-words vetoes | `stream-turn.ts:171` (`refusedItemIds` → `refuses_released`), `:173` (`false_refusal`), `:321`, `:350` (hold a refusal-shaped say sentence until the data line is known) | withhold the model's own refusal of a covered item | **refusal veto** (model words) |
| R7 | `release_checked` | `turn-data.ts:512` (`namesItem(…, covers)`) | a cover phrase in the message counts as naming the item, so the release isn't checked | **release check** |
| R8 | Offline | `scripts/fact-check.ts:118`, `:180` (F3); `scripts/anchor-audit.ts:73–175` (authoring, lint) | false-refusal counts, authoring | audits only |

Inside `coverageOf` (`fc:656–697`):
- phrase match is literal (`(?<![a-z])phrase(?![a-z])` on the lower-cased ask);
- `FURTHER_CUT` (`fc:654`) and `GLOBAL_FINER` (`fc:733`) veto a hit with a finer cut beside it;
- `COUNT_ASK` (`fc:642`) makes a count asked of a figure-less item a coarse entry.

Round 6 changes `coverageOf` itself (Task 68), so R1, R3, R4, R5, R6 and R7 all see the new matching. R6 and R7 read the model's own sentence or the message, not an ask, so the candidate-sentence input applies only to R1, R3 and R4.

## Review Focus

1. **A cover now matches what it didn't, and releases a line that doesn't answer.** Normalization (plurals, synonyms) and the candidate's sentence widen every match. The lint (Task 69) lists each new match over b28–b37's candidate asks. The tag gate stops a mismatched company or forecast item. Pinned by Task 68's "stays unmatched" tests and Task 73's replay review of every newly made release.
2. **A guard refusal denies data the case holds.** The gate now runs on 98-odd model-mapped asks a wave, not 34 check verdicts. Every guard part still passes the M6 covers veto. A qualifier the line states is met (the round-5c "true full answers stay full" tests, run on the new paths). Pinned in Task 70.
3. **A new path quietly adds a Haiku call.** A guard-made refusal off the check path must not enter `toCheck`. Pinned in Task 70 by a test counting `checkAsk` calls, and in Task 73 by `itemless_defer` counts per slice.
4. **Must-reach releases a line twice, or on the wrong turn.** An item already out or asked this turn isn't volunteered again; it isn't volunteered on a close turn; and the report says it was volunteered. Pinned in Task 72.
5. **Step capping silences a true probe on prof-001.** It runs only on cases whose math steps declare `dependsOn` / `inputQuestion` (pricing-001 now), and never voices a correction. Pinned in Task 73 by prof-001's replay and in Task 72's tests.

---

### Task 68: Cover matching engine and item tags

Lorenzo: "Normalize matching before adding phrases: plurals, a small synonym table ("how many" = "number of", "flights" = "departures", and similar). Match the candidate's own sentence as well as the model's rewording. … Add exclusion words where a confusion is known: "chip" excluded from chickpea items, "entrant/competitor" from Larkspur's own items. A cover match vetoes a refusal. It may release the matched item only if the item's tags (company; forecast vs current; quantity) also agree with the ask. Otherwise defer, through the existing E5 stop sequence."

**Files:**
- `lib/cases/schema.ts` (the `tags` block);
- `lib/orchestrator/fact-check.ts` (`coverageOf`, `buildFactBase`);
- new `lib/orchestrator/item-tags.ts`;
- `lib/orchestrator/turn-data.ts` (R1, R3, R4 inputs; the tag gate on cover releases);
- tests `tests/orchestrator/cover-matching.test.ts`, `tests/orchestrator/item-tags.test.ts`.

**Interfaces (produced):**
- **Schema:** `factAnchors.tags` (optional), validated (unknown ids rejected):
  ```ts
  tags?: {
    clientWords: string[];   // words that name the client's own product or business in an ask ("chickpea", "the new line")
    entities: { id: string; words: string[]; items: string[] }[];  // another company or product: the words that name it, the items about it
    forecast: string[];      // items stating a forecast, plan or estimate
  }
  ```
  - Items not in any entity belong to the client.
  - `tags` present = the case opts into round 6's matching and gate. `FactBase.tags` carries it; `FactBase.answerGate = tags !== undefined`.
- **`item-tags.ts`:**
  - `entitiesNamed(text: string, fb: FactBase): string[]`: the ids of the entities the text names; `'client'` when a client word appears.
  - `tagsAgree(askText: string, itemId: string, fb: FactBase): { agree: boolean; why?: 'entity' | 'forecast' }`:
    - **entity:** the ask names an entity other than the item's, and doesn't name the item's own (its entity's words, or the client words for a client item);
    - **forecast:** the ask carries a current marker (today / current(ly) / now / at present / this year) and the item is in `forecast`.
  - Quantity agreement is not a tag field. It is `outsideAskScope` (count, one-off, recurrence, basis, cut) run on a cover-matched item, which R1 doesn't do today. Controller ruling; see the ledger.
- **`coverageOf(what: string, fb: FactBase, opts?: { sentence?: string }): Coverage`**, unchanged shape. When `fb.answerGate`:
  - **(a) Normalization.** Both the ask and the phrases are folded before matching:
    - plurals: a word's trailing `s` / `es`, as `labelWords` does;
    - the synonym table `COVER_SYNONYMS` in `fact-check.ts`: `number of`, `count of` → `how many`; `departures` → `flights`; `stores` ← `doors`, `locations` stays (it is a `GLOBAL_FINER` word); `price` ← `pricing` when a noun.
    - A hit keeps its span in the original text, so `FURTHER_CUT` / `GLOBAL_FINER` still read the words beside it.
  - **(b) Exclusion.** A hit on item I is dropped when `tagsAgree(text, I, fb).why === 'entity'`.
  - **(c) Geography (audit row 20).** A hit is dropped when the entry names a region (`Europe|European|EU|UK|Canada|Asia|international`) that the item's label and line don't name.
  - **(d) Sentence.** `opts.sentence`, the candidate's asking sentence for this ask, is matched too. Its items join `items`; `rest` and `coarse` come from `what` alone, so a refusal is still worded from the model's ask.
- Without `tags`, `coverageOf` behaves exactly as at BASE, with or without `sentence`.
- **`askSentenceFor(what: string, sentences: string[]): string | undefined`** in `turn-data.ts`: the asking sentence (from `askingSentences` on the candidate text) sharing the most content words (stemmed, case names aside) with `what`; ties go to the first, none to `undefined`.
- **The tag gate on R1 (`turn-data.ts:738–765`).** For each covered item:
  - `tagsAgree` and `outsideAskScope` both pass → released / restated as today;
  - `outsideAskScope` fails on a count only → the coarse form, as `coverageOf.coarse` today;
  - otherwise **the cover vetoes the refusal and the ask is deferred through E5**: it stays item-less and goes to the check (`toCheck`, as today, because it was never refused). If the check refuses it, the refusal becomes the named deferral (`itemlessDefers`, no item held) instead of "I don't have <ask>", logged `cover_deferred`.
  - Controller reading of "defer, through the existing E5 stop sequence": the E5 decision path whose Haiku call ends at the `]}` stop. That costs no call the BASE code didn't make.
- R3's per-store `request_covers` becomes `covers_added` on tagged cases: for any explicit mapped ask, items the covers name for it (tags agreeing) are added. This is audit row 6, "fare by route" → both routes. Untagged cases keep the per-store rule only.

- [ ] **Step 1: Write the failing tests** (`cover-matching.test.ts`, fixtures from the four case files):
  - Larkspur Tyler t11: `coverageOf('avoidable fixed cost by route', fb)` → items `['aircraft_leases']` (plural fold, existing cover "avoidable fixed costs").
  - Hollis Bay Marisol t7: `coverageOf('a distribution estimate by number of stores', fb)` → `['retailer_support']` (synonym fold to "how many stores").
  - Hollis Bay Tyler t5: `coverageOf('annual chip bag volume', fb, { sentence: 'Do we have a sense of how many bags of chips Hollis Bay moves a year?' })` → `why_now` in `items` or `coarse`. The count ask on a figure-less line gives `coarse` with `why_now`, the designed A4 form.
  - Aldermoor Marcus t5: `coverageOf('European net price per patient per year', fb)` → no `kelvexa_pricing` (geography).
  - Exclusion: `coverageOf('chip volume for the chickpea line', fb)` keeps `why_now` (both named). An ask naming only "the entrant" with a Larkspur-item cover phrase drops the hit.
  - Untagged (prof-001 fixture): every existing `coverageOf` test result unchanged, and the plural form of a prof-001 cover is **not** matched.
- [ ] **Step 2:** `item-tags.test.ts`:
  - `tagsAgree` true / false for: Nimbrel's patent expiry × `patents` (entity); "currently on an advanced therapy" × `peak_share_forecast` (forecast); "the entrant's flights a day" × `new_routes_cost_flights` (entity); "chip cost of goods" × `variable_costs` (entity);
  - and the agreeing pairs: "Kelvexa's patents" × `patents`; "the competitor's cost per seat" × `competitor_costs`.
- [ ] **Step 3:** R1 tag-gate tests in `tests/orchestrator/turn-data-covers.test.ts`:
  - a tagged cover hit with a forecast mismatch → no release, the ask reaches the check, a check "none" → named deferral, not a refusal (`cover_deferred`);
  - `covers_added` on Larkspur Tyler t5: model `lakeport_fare` for "average fare by route" + the new covers → `port_avery_per_flight` added.
- [ ] **Step 4:** Run; fail. Implement. Pass. Mutation recorded in the ledger.
- [ ] **Step 5:** Commit.

### Task 69: Cover data, tags data and the cover lint

Lorenzo: "Add the missing covers from the audit. Each must be multi-word and specific, with no bare "cost" or "flights". … Lint: flag any phrase that appears in two items' covers; run every new or changed cover against every candidate ask in batches 28–37; list what each newly matches."

**Files:**
- `cases/prof-002.json`, `cases/launch-001.json`, `cases/entry-001.json`, `cases/pricing-001.json` (tags; covers);
- new `scripts/cover-lint.ts`;
- test `tests/scripts/cover-lint.test.ts`.

**Data (decided here):**
- **prof-002:**
  - tags:
    - `clientWords` ["Larkspur", "our", "we"];
    - entity `competitor` (words: entrant, competitor(s), low-cost airline, low-cost carrier, rival, the other airline, new carrier; items: `competitor_entry`, `competitor_costs`);
    - `forecast` [`new_routes_plan`, `new_routes_cost_flights`, `new_route_rampup`].
  - covers:
    - `unit_costs` + "cost per seat mile", "cost per available seat mile", "casm trend";
    - `network_totals` + "total departures";
    - `port_avery_per_flight` and `lakeport_fare` + "average fare by route", "fare by route" (deliberately on both: a by-route ask is both routes; the lint lists it as an intended pair).
  - "avoidable fixed cost" needs no new phrase (the plural fold).
- **launch-001:**
  - tags:
    - `clientWords` ["chickpea", "the line", "the new line", "roasted", "the snack"];
    - entity `chips` (words: chip, chips, chip business, potato chips; items: `why_now`, `cannibalization`);
    - `forecast` [`planning_assumptions`, `sampling_program`].
  - covers: `why_now` + "chip bag volume", "annual chip volume". "number of stores" needs no phrase (the synonym fold onto "how many stores").
- **entry-001:**
  - tags:
    - `clientWords` ["Kelvexa", "Aldermoor"];
    - entity `nimbrel` (words: Nimbrel; items: `nimbrel`, `current_treatment`);
    - `forecast` [`peak_share_forecast`, `peak_timing`].
  - covers: none new (row 20 is code).
- **pricing-001:** tags `clientWords` ["Quillpath"], `entities` [], `forecast` [] (opts the case in; no entity confusion was seen). Covers: none new.

**`scripts/cover-lint.ts`** (free, deterministic). It writes `Case Interview Runs/replays/2026-10-21/round6/cover-lint.md` (not committed):
- (1) every normalized phrase appearing in two items' covers, per case, marked "intended" when listed in the script's `INTENDED_PAIRS`;
- (2) for every phrase new or changed vs BASE (`git show be1217b:cases/<id>.json`), plus every phrase the normalization newly matches, each candidate turn in b28–b37 (that case's runs) it matches, with run, turn and sentence;
- (3) the count per phrase.
- [ ] Write the lint's test (a fixture case with one duplicate phrase → flagged; one new phrase → listed with its matching sentence). Fail, implement, pass.
- [ ] Edit the case data. `npm test` loads every case through the zod schema, so it must stay green.
- [ ] Run the lint. Read every listed match; put each in the ledger as "answers" / "doesn't". A phrase with a match that doesn't answer is narrowed or removed before commit.
- [ ] Commit (case data + script + test).

### Task 70: The answer gate on every path (the guard everywhere, with tags)

Lorenzo: "The guard on every path that gives a data line, not just the check's labels, with the company and forecast/current tags inside it. When it finds a topic unmet, refuse that part ("I don't have <part>") rather than releasing the item as a coarse answer."

**Files:**
- `lib/orchestrator/turn-data.ts`;
- `lib/orchestrator/ask-qualifiers.ts` (audit rows 15 and 22's grammar);
- tests `tests/orchestrator/answer-gate.test.ts`; existing guard tests extended.

**Interfaces (produced):**
- **`answerGate(plan: ModelPlan, what: string, ids: string[], sentence?: string): AnswerGate | null`** with `type AnswerGate = { refuse: { part: string; ids: string[] }[]; drop: string[]; partial: string[] }`.
  - It runs the round-5c qualifier logic (`unmetQualifiers`, `guardedItems`, `guardParts`) plus `tagsAgree` on `what` and the `sentence`. Entity and forecast are read from the sentence too; period, scope and topic from `what` only (controller ruling).
  - **Topic unmet, entity mismatch, forecast mismatch:** the item(s) answering that part go in `drop` (not given, not restated, not coarse) and the part in `refuse`.
  - **Period / scope unmet:** the item in `partial` (E1: its line + the refusal when not out; the refusal alone when out or gated), as the guard today.
  - Returns null on an untagged case (`!fb.answerGate`) or when nothing is unmet.
- **Where it runs (tagged cases):**
  - each explicit mapped ask (the model's, after `request_scope` and `request_group`; the alias; `covers_added`);
  - each coverage-mapped ask (R1, R2);
  - each message detection with ids (`withAsks`);
  - a code-written turn's kept detections;
  - and on the check's verdicts in place of `qualifierGuard`, whose output it subsumes (the `guard` record keeps its shape and adds `drop`).
  - Not on forced/fulfilment releases (judged when first asked) or exhibits.
- **No new check calls:** every `refuse` part is said unchecked. It joins `scopeRefused` (`td:933`) so `toCheck` never sees it, and it passes the M6 covers veto first (a part a cover names is dropped, logged `partial_dropped` `false_refusal`). A dropped item's ask with nothing left is refused by its parts, never re-checked.
- **The check's coarse path (audit row 10):** `decideCheckedAsk` gives a coarse item only for period/scope partials. An item the gate puts in `drop` is never given.
- **Grammar** (`ask-qualifiers.ts`):
  - TREND += `growth|grew|grown|over (the )?(last|past|recent) (few )?years|in recent years` (row 22);
  - a trend tied to one year ("through / during / within / in <year>") is met only by two or more dated points inside that year, never by `YEARS(t).size >= 2` (row 15).
- **Logging:** `answer_gate` (act) per decided ask: `{ what, path, refuse, drop, partial }`.

- [ ] **Step 1: Write the failing tests**, verbatim from the runs:
  - b36l Marisol t11, check verdict, 8 items → all dropped (entity "the entrant"), refusal "…flights a day the entrant runs on each route", **no** `new_routes_cost_flights` release;
  - b37h Marcus t5 → no Exhibit 1, refusal of both parts;
  - b36a Raj t13 → `patents` dropped (entity), refusal "Nimbrel's patent expiry or late-stage oral competitors";
  - b36a Raj t11 (sentence "…currently on an advanced therapy…") → `peak_share_forecast` dropped, refusal of the ask;
  - b36a Marisol t5 → "growth … over recent years" unmet, `funnel_rates` (out) → refusal alone, no restatement;
  - b37q Tyler t17 → trend within 2024 unmet → refusal alone;
  - a model-mapped ask with a met period stays a plain release ("the average one-way fare on Hub–Lakeport in FY2025" → `lakeport_fare`);
  - untagged prof-001 → null, decisions identical.
- [ ] **Step 2:** The no-new-call test: a turn with a gate refusal on a model-mapped ask → `checkAsk` not called (spy).
- [ ] **Step 3:** Run; fail. Implement. Pass. Mutation recorded.
- [ ] **Step 4:** Commit.

### Task 71: The audit's code-only fixes

Lorenzo: "4. The audit's 12 code-only rule fixes." (Row 10 is in Task 70; rows 15, 20 and 22 are in Tasks 68 / 70. Here: rows 8, 11, 13, 14, 16, 17, 21, row 6's offer half, M3.)

**Files:**
- `data-decisions.ts` (ONE_OFF_ASK, CUT, offers, split of a stated figure);
- `fact-check.ts` (BASIS);
- `request-signal.ts` (WANT cue; code-written question with a ledger noun);
- `session-runner.ts` (`codeWrittenAsks` reads the ledger nouns);
- `recompute.ts` (`figureAsWritten`);
- tests in the existing test files of each.

**The fixes (each its own test, verbatim):**
1. **Row 8:** `ONE_OFF_ASK` gains `launch` before `costs?|fees?|spend|expenses?`. b36l Marcus t19 "launch costs for the new routes" × `new_routes_cost_flights` → out of scope. Hollis Bay `launch_costs` still in scope (ONE_OFF_VALUE).
2. **Row 11:** WANT cue accepts "I'd want is" / "what I'd want is". b37h Marcus t9 → an asking sentence.
3. **Row 13:** BASIS gains `\bhow\b.{0,40}?\b(?:was|were)\s+(?:estimated|derived|calculated)\b`. b37h Tyler t17's `what` "how the 500,000 household estimate was derived" → BASIS.
4. **Row 14:** CUT's dimensions gain `source|sources`. b37q Tyler t5 "the split of Starter sign-ups by source" × `signup_channels` → out of scope → E1.
5. **Row 16:** `mentionStatesNeed` needs two distinctive label words in the need clause, or the item's spoken name. b37q Marcus t9 → no offer of `plan_prices_costs`. A prof-001 need from the 12 Oct rule's examples stays an offer: the existing tests.
6. **Row 6, the offer half:** an `explicit:false` mention whose item an addressed asking sentence names (`namesItem` over `addressedAskSentences`) is a release, not an offer. b36l Tyler t5 "I'd want to know fares and passenger counts specifically on Lakeport and Port Avery." × `lakeport_seats_load` → released.
7. **Row 17:** on code-written turns, a question-form sentence counts as an asking sentence when it names a content word of an unreleased ledger item's label. b37q Marisol t15 "are those upgraders people who'd have bought Pro directly anyway?" → kept.
8. **Row 21:** a split / breakdown / "versus" ask of a figure the item states as one amount ("split of the $80 million") is out of scope for that item when its line states that figure once and no parts of it. b36a Marcus t23 × `option_a`.
9. **M3:** `figureAsWritten` allows `(?:\.0+)?` before the scale. "$9.0M" with figure 9 → "$9.0M".

Each fix that changes prof-001's replay (Task 73's interim replay) is scoped to tagged cases (`fb.answerGate`) instead. The ledger records which.
- [ ] Tests (fail) → implement → pass → mutation, per fix. One commit for the task.

### Task 72: Must-reach items (prof-002) and step-check probe capping

Lorenzo (5): "Must-reach mechanism. Code releases a case-declared item at a declared point if the candidate hasn't asked by then. prof-002 only for now: competitor_entry before Exhibit 3 (the network fix); new_route_rampup before the recommendation ask. The report should note when an item was volunteered."

Lorenzo (step check): "The deterministic step check may, without the checker agreeing: link derived claims to the flagged root and stop probing them; ask one neutral input question at the root (for example, "Which row did you use for cancellations?"). It may NOT voice a correction without the checker's agreement."

**Files:**
- **Must-reach:**
  - schema (`mustReach?: { item: string; before: string }[]`, `before` an exhibit id or `'recommendation'`);
  - `cases/prof-002.json` (`[{ item: 'competitor_entry', before: 'exhibit-3' }, { item: 'new_route_rampup', before: 'recommendation' }]`);
  - `turn-data.ts` (after `decideData`);
  - `settle-turn.ts` (the volunteered event);
  - `lib/scoring/data-coverage.ts` and the judge input (the note);
  - tests `tests/orchestrator/must-reach.test.ts`.
- **Step capping:**
  - schema `MathStepSchema` (`dependsOn?: string[]`, `inputQuestion?: string`);
  - `cases/pricing-001.json`:
    - `starter_ltv.inputQuestion` "Which row of the Starter cohort table did you use for cancellations?";
    - `dependsOn` [`starter_ltv`] on `starter_ratio`, `starter_value_with_upgrades`, `starter_ratio_with_upgrades`, `starter_net_value`, `value_with_starter`, `starter_value_added`, `cannibalization_breakeven`, `starter_value_at_60`, `value_at_60`, `uplift_at_60`, `churn_breakeven_at_60`, `upgrade_breakeven_at_60`;
    - `pro_ltv.inputQuestion` "Which row of the Pro cohort table did you use for cancellations?";
  - `math-checker-live.ts` / `plan-turn.ts`;
  - tests `tests/orchestrator/step-root-cap.test.ts`.

**Must-reach behaviour:**
- On a turn whose data decisions hand over exhibit X (any path), every `mustReach` item with `before: X` not yet revealed is released first, in the same data line (ahead of the exhibit; past the release cap).
- On a turn that asks for the recommendation (kinds `rec_ask`, `time_warning`, `grace_ask`, the recommendation stage deadline; or a model question `stage-evidence` reads as the recommendation ask), every `before: 'recommendation'` item not yet revealed is released before the question.
- Never on a `close` turn.
- An item already revealed, or released this turn, is skipped.
- Logged `must_reach` (act) `{ item, before }`; a `volunteered` intervention event.
- The report's data section says "<item label> was volunteered by the interviewer (not asked for)". The judge doesn't credit the candidate for asking it.

**Step capping behaviour (cases whose steps declare `dependsOn` or `inputQuestion`; pricing-001 only):**
- A deterministic step flag (`recompute_report_only` or `recompute`) on step R with the candidate's value v registers the root key `step:R@v` (its figures: v and the figures in the flag's span, e.g. 13.5).
- From then:
  - a checker or code flag whose key's step is in R's dependents (`dependsOn`, transitively), or whose span `rootOf` links to the root's figures, is **linked**: not probed, left for the report with the reason "built on <R>'s <v>, flagged by the step check";
  - the root gets **one** neutral question, its `inputQuestion`, said by code as a probe (the checker probe's slot and rules: two-step, never leads, no arithmetic), once per root per interview;
  - **never a correction**: a correction of R or a dependent still needs the checker's flag (today's gate).
- prof-001's steps declare neither field, so it is unchanged.

- [ ] Tests:
  - **must-reach:** b36l Jasmine (Exhibit 3 at t10 without competitor) → `competitor_entry` released at t10 before the exhibit; b36l Tyler (rec ask t20) → `new_route_rampup` released at t20; already-revealed → nothing; close turn → nothing; the report note.
  - **step:** b37q Raj t11 flag `starter_ltv@405` → the t12 input question once; t17 `$2,800`, t19 `$1,205`, t21 `$790k`, t27 `$620,000`, t29 `$675`, t31 `$905,000` linked (or each listed as not linked, with why); never a correction from the step flag alone; b37q Marcus t17 `starter_ltv@420` → `starter_net_value@920` (t23) linked.
- [ ] Fail → implement → pass → mutation. Commit.

### Task 73: Proof (free; live calls ≤ $0.15)

Lorenzo: "Every data fault in the audit table, before and after, marked caught or not caught. Also the Quillpath Raj and Marcus chains for the probe cap. Every interviewer turn in batches 28–37 containing a data line, refusal, deferral, restatement or offer. Report: refusals newly blocked; releases newly made, each checked by you as answering the ask or not; new deferrals; any new false refusal or new wrong release. prof-001: identical output on the 21 standard slices. Added latency (max and mean), and confirmation that no model calls were added."

- [ ] **Slices.** Convert b36/b37 checker verdicts to `Case Interview Runs/replays/2026-10-21/round6/b36a-, b36l-, b37h-, b37q-verdicts.jsonl`:
  - one row per `math_checker`/`verdict` event;
  - `id` = `test runs/<wave>/<persona>/<file stem>#t<turnIndex+1>`;
  - payload fields minus `candidateTurnIndex`;
  - a script in that folder, not committed.

  Copy `proof.sh` / `compare.py` there with the four new slices on/off (29 slices).
- [ ] **Base:** `zsh proof.sh r6-base` at be1217b (a scratch worktree at be1217b, removed after). **Final:** `zsh proof.sh r6-final` at the round's last commit. Compare.
- [ ] **prof-001 (b28–b33, 12 slices):** 0 changed decisions and 0 changed lines, or the condition fails.
- [ ] **The data-turn table** (`r6-final.md`): every interviewer turn in all slices whose data line, refusal, deferral, restatement or offer changed. For each:
  - refusals newly blocked;
  - releases newly made, each judged by hand as answering the ask or not, with the ask quoted;
  - new deferrals;
  - new false refusals;
  - new wrong releases.
- [ ] **The audit table:** each of rows 1–22 and M1–M3 before / after, caught or not, with the line said. A fault the replay can't show is marked with why:
  - the classifier's detection unrecorded → a live call (budget $0.15);
  - the model turn replays as saved.
- [ ] **Model calls:** `itemless_defer` rows per slice base vs final (no new ask), and no new classifier call path.
- [ ] **Latency:** time `turnData` + `decideCheckedAsk` + the gate over every replayed turn, base vs final (`REPLAY_TIMING=1` or a micro-bench script); max and mean added ms.
- [ ] **Conditions,** each with its rows:
  - 0 new false refusals;
  - 0 new wrong releases;
  - every new release answers;
  - every audit fault marked deterministic caught (or listed with the reason);
  - prof-001 identical;
  - no added model calls.

### Task 74: The Larkspur wave (only if every Task 73 condition holds)

Lorenzo: "If all hold: run one wave on prof-002 (Larkspur), the same 5 personas, with a hard cap of $9; stop at the cap. Hand-grade it as before, and compare with batch 36 by fault class. Note that the must-reach items change comparability. Don't start any other wave."

- [ ] **Launch:**
  - `batch-38-larkspur`, personas 7, 64, 57, 24, 40, all scored;
  - batch 36's launcher flags (human pace, 25-minute clock, `--interviewer=sonnet55-baseline`, checker on), `--cap=9`;
  - dry run first; `caffeinate`, `run_in_background`.
- [ ] **Copy** the wave to the main checkout's `Case Interview Runs/test runs/` (never git add).
- [ ] **Grade:**
  - every transcript and report read, under the 20–21 Oct rules (rule 1 refined; the 21 Oct probe-chain and release rulings);
  - `hand-grading.md`, with a fault-class table vs batch 36, and the comparability note (competitor and ramp-up now volunteered).

### Task 75: Docs

- [ ] **PRD:**
  - body (§5.4 data path: cover matching, tags, the answer gate, must-reach, step capping);
  - §15: the corrected attribution for Hollis Bay Marisol t8, per Lorenzo;
  - §16 entry: rulings verbatim, built, proof, wave, the controller's decisions marked as proposed.
- [ ] `docs/case-onboarding.md` tracker + lessons.
- [ ] progress.md "## Now" and the batch table (38).
- [ ] The ledger.
- [ ] Commit. Stop and report. No push, merge or deploy.
