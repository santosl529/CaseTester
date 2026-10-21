# Stream 2 (case data): report

Branch `phase1-s2-cases`, off the contract commit 0f932c89. No API spend, no DB writes, and nothing staged under `Case Interview Runs/`. Every commit passed `npx vitest run`, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db`.

Lint outputs, hand verdicts and per-case notes are in `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-s2/`:
- `cover-lint.md` / `.json`: all cases;
- `cover-lint-<id>.*`;
- `judgements-<id>.json`: 474 hand verdicts;
- `notes-<id>.md`: per-item tables and every judgement call.

## Commits

| Commit | Task |
|---|---|
| 6fc3fef7 | 2: the cover lint (tool and tests) |
| 3e2667ae | 1: covers and exclusion words |
| ea8797df | 3: tags, askPhrases, definitions, dependsOn, summaries, misquote anchors |
| 46b9d691 | 4: must-reach entries and proposals |
| 1f7f4a4b | 5: askPhrases in the prompt |
| this one | the report |

## Counts per case

| case | items | overlay covers | merged covers / item | coverExcludes | tags | askPhrases | definitions | dependsOn (steps) | summaries | misquote | mustReach | proposed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| prof-001 | 11 | 107 | 10–20 | 2 items / 2 words | 11 | 35 | 7 | 3/8 | 1/1 | 0 | 0 | 1 |
| prof-002 | 27 | 169 | 8–21 (1 under 10) | 11 items / 44 words | 27 | 83 | 11 | 9/15 | 3/3 | 1 | 1 (+2 already in the case = 3) | 0 |
| entry-001 | 24 | 146 | 7–13 (2 under 10) | 12 items / 12 words | 24 | 76 | 12 | 9/12 | 3/3 | 0 | 0 | 1 |
| launch-001 | 22 | 162 | 10–15 | 8 items / 16 words | 22 | 69 | 12 | 9/13 | 3/3 | 1 | 2 | 0 |
| pricing-001 | 22 | 155 | 10–14 | 0 | 22 | 71 | 13 | 15/23 | 4/4 | 1 | 1 | 0 |
| **all** | 106 | **739** | | 33 items / 74 words | 106 | 334 | 55 | 45 | 14 | 3 | 4 | 2 |

prof-001 also gets `factTags`: `{ clientWords: ["Brew & Bean", "Brew and Bean"], entities: [], forecast: [] }`.

## Task 1: covers and exclusion words

Every ledger item in the five cases has covers, in `cases/phase1/<id>.json`. They are merged into `factAnchors.covers` only with `itemCovers` on.

**How they were made.** Mined from the b28–b38 asks (candidate messages, and the model's declared `requests[].what`):
- multi-word and specific, no bare generic head;
- no plural or synonym variants (the fold handles them);
- no repeat of a base phrase, tested.

**Exclusion words, for the known confusions:**
- chip vs chickpea: "chip", "potato chip" on 8 chickpea-line items;
- entrant vs Larkspur: "entrant", "low-cost carrier", "low-cost airline", "lcc" on 11 Larkspur items;
- Kelvexa vs Nimbrel: "nimbrel" on 12 Kelvexa/Aldermoor items;
- bean vs non-bean: "non-bean" on prof-001's two bean items.

None of these words appears in its item's own covers; the lint checks this.

**Important: nothing reads `coverExcludes` today.** `applyPhase1Overlay` attaches them, but fact-check.ts (Stream 4) never consults them. So:
- the precision rule I applied is that no cover may need an exclusion word to stay correct;
- every cover that newly gave a wrong item was removed or narrowed, never excused by an exclusion word;
- the exclusion words are defense in depth for when matching reads them.

The lint's reading is "an exclusion word anywhere in the ask, or its asking sentence, blocks that item". Stream 4 should decide the real one.

## Task 2: the cover lint

**What it is.** `scripts/phase1-cover-lint.ts`, with `tests/scripts/phase1-cover-lint.test.ts` (TDD, 14 tests). Per Lorenzo's ruling (1) it runs on the merged view: each case plus its overlay through `applyPhase1Overlay`, with `itemCovers` off against on.
- prof-001 is read twice: with `itemCovers` alone (literal matching), and with `tagMatching` on in both views (what `*=phase1` runs).
- Asks read: each model-declared request, with the asking sentence the engine picks (`askSentenceFor`), and each candidate asking or question sentence, across b28–b38.
- For each ask whose `coverageDetail` changes, it lists:
  - the items it gains;
  - the overlay phrase behind each gain;
  - the model's own mapping;
  - `tagsAgree`;
  - any exclusion word present.
- It also reports:
  - collisions in the merged view (base and overlay covers);
  - the count per overlay cover;
  - the hand verdicts and the unsure list;
  - item tags against the case-level tags;
  - completeness: items without tags or askPhrases, items under 10 covers, exhibits without a summary, exclusion conflicts;
  - whether the overlay loads with every switch on.

**Small fix to `scripts/cover-lint.ts`.** Its run-when-executed guard (`argv[1].endsWith('cover-lint.ts')`) also fired when the new script imported it. It now compares the basename.

**Results** (run `npx tsx scripts/phase1-cover-lint.ts`):

| view | new collisions | changed asks | gains | answers | wrong | unsure | lost | tag problems |
|---|---|---|---|---|---|---|---|---|
| prof-001 (itemCovers alone) | 0 | 180 | 182 | 181 | 0 | 1 | 0 | 0 |
| prof-001 (tagMatching on) | 0 | 195 | 197 | 196 | 0 | 1 | 0 | 0 |
| prof-002 | 0 (25 shared at base) | 120 | 125 | 124 | 0 | 1 | 0 | 0 |
| entry-001 | 0 (1 shared at base) | 99 | 99 | 99 | 0 | 0 | 0 | 0 |
| launch-001 | 0 | 12 | 12 | 12 | 0 | 0 | 0 | 0 |
| pricing-001 | 0 | 36 | 41 | 40 | 0 | 1 | 0 | 0 |

**Few gains change what candidates hear.** Today's coverage path only runs on a model ask with no `item_ids`, and almost every gain is on an ask the model had already mapped. The unmapped model asks that gain an item are 6 asks with 9 gains, all judged correct:
- b34 Aldermoor Jasmine t1 and b36 Aldermoor Jasmine t1 (prevalence): `funnel_rates`;
- b37 Quillpath Jasmine t1, "Starter and Pro churn, gross margin and CAC": `plan_cac`, `pro_cohort`, `starter_cohort`;
- b32 Larkspur Marisol t1 and b38 Larkspur Marisol t1: `network_totals`, plus `extras_revenue` on b38;
- b34 Larkspur Marcus t21, "how long new routes take to mature": `new_route_rampup`.

**Covers removed after a wrong gain:**
- prof-002:
  - "connecting passengers", "connecting volumes", "onward connections", "passengers who connect": b38 Marcus t13, Tyler t19/t21 asked for onward-leg revenue;
  - "revenue on the four": b38 Tyler t23;
  - "fare on lakeport", "fare on port avery": b36 Raj t13 asked for the competitor's fare;
  - "entrant cost per seat": b36 Marisol t11, through the sentence. This is the ask behind the b36 serious wrong release.
- entry-001:
  - "share forecast": b32 Tyler t7;
  - "partner's royalty": b34 Marcus t13;
  - "net price per patient": b36 Raj t7, through the sentence.
- prof-001:
  - "menu price history", "menu pricing", "pricing history": b29 Owen t7, b28 Owen t9, competitor-pricing asks;
  - "beans as a share of cogs" and its "coffee beans" form: b31 Sofia t7 asked for today's share;
  - "corporate overhead" (b31 Noor t3) and "revenue per store" (b31 Blake t3): non-asks.
- pricing-001:
  - "would have bought pro": b37 Marcus t21;
  - "test sample size": the line states no sample size.

**Removed in my review, as plausible wrong matches with no corpus hit:**
- entry-001 "manufacturing cost", "us population", "population base";
- launch-001 "trial program".

Also: prof-002 "jet fuel" narrowed to "jet fuel prices", and prof-002 "total flights" dropped (it duplicated the base's "total departures" once folded).

**The unsure list: gains**
1. pricing-001, b35 Raj t7, model ask "Starter and Pro monthly price and cost to serve": gains `starter_cohort` through the candidate's sentence, which does ask Starter's monthly churn. No live effect: the ask was model-mapped, and the model deferred the churn ask separately.
2. prof-001, b28 Jordan t19, candidate sentence about waste quoting "COGS as a percent of revenue": `cogs_pct`. It is already out by then, so at worst it is a restatement. Unsure in both views.
3. prof-002, b36 Marcus t11, "the competitor's costs and fares": gains `port_avery_per_flight` through the sentence. The tag gate defers it (entity) and the ask was mapped, so it has no live effect. The item doesn't answer that ask.

**The unsure list: authoring** (no corpus hit either way):
- entry-001:
  - "forecast peak share" could meet "benchmarks for the forecast peak share";
  - "kelvexa's peak share" could meet Option B's share;
  - "annual selling costs" could meet "who pays the selling costs under B";
  - "competitive set" gives the coarse `current_treatment` to a "how many drugs" ask.
- prof-002: "connecting traffic", "hub feed", "planned frequency", "who entered", "competitor entry".
- launch-001: "growth platform", "competitive pricing", "what shoppers pay", "production capacity".
- pricing-001: "the decision criterion", "how many paying customers", "one-person businesses".
- prof-001:
  - every remaining menu-price cover holds "price", so an unmapped competitor or elasticity ask whose sentence names menu prices could pick up the menu line;
  - "rent costs", "lease costs", "staffing costs", "payroll costs", "packaging costs", "dairy costs" (a per-unit or per-store ask is finer);
  - b30 Tyler t3, industry-wide "coffee commodity prices" → `bean_price_change`, judged answers, roughly.
- Candidate hypothesis sentences give `competitor_entry` early: b34 Jasmine t5, b36 Jasmine t1. Right on content, early on timing.

## Task 3: tags, askPhrases, definitions, dependsOn, summaries, misquote anchors

**Item tags.** Every item has `{ entity, period[], quantityKind[] }`. They agree with the case-level tags, checked both ways by the lint and by `tests/cases/phase1-overlays.test.ts`: an item in an entity's items has that entity, an item in `forecast` has the forecast period, and no other item has it. Prior plus current timeframes give `['historical', 'current']`.

**askPhrases.** 3–5 per item, phrased as the questions candidates ask. The schema rejects digits and number words. I read every phrase for findings and rewrote three:
- prof-001: "price increases taken on the menu" became "menu price changes over the period";
- prof-002: "why fares moved on those routes" became "what is behind the results on those routes";
- pricing-001: "what lost Pro buyers say" became "what explains the change in Pro sign-ups".

**Exhibit summaries.** One line each, with no figures, so never "Exhibit 2", and no findings.

**Definitions.** 55, worded for a root correction.

**dependsOn.** Only real derivations, read from each step's formula; roots get no entry. pricing-001's twelve case-level `dependsOn: ["starter_ltv"]` are restated to the direct inputs. Under `stepLineage` the overlay replaces them, so this changes the lineage:
- every Starter step still reaches `starter_ltv`;
- `pro_ratio`, `pro_net_value` and `value_pro_only` now hang off `pro_ltv`;
- `upgrade_rate` becomes a root;
- `pro_ltv` and `starter_ltv` stay roots, keeping their `inputQuestion`s.

**Misquote anchors (3).** Only on items with timeframes and a misquote seen in the corpus:
- prof-002 `route_results_port_avery` ("port avery revenue");
- launch-001 `variable_costs` ("ingredients": b37 Tyler's $0.75, missed by code);
- pricing-001 `plan_prices_costs` ("cost to serve": b37 Tyler's $12 and $22).

The other timeframed items are already anchored, or a level anchor on them would make false corrections: candidates derive prof-001's prior revenue themselves, and Aldermoor's royalty and Option B share are often stated as hypotheticals.

**The load test changed.** In `tests/cases/phase1-contract.test.ts`, the test was "today's cases load unchanged with no overlay and no switches". The overlay's descriptive fields are always attached (contract §1), so the test now compares each loaded case, without those fields, against its case file. The merge-switch fields stay byte-equal.

## Task 4: must-reach

All names are real ledger ids; none needed mapping. A run counts as missing an item when, in the turn records, the item is not in `stateBefore.revealedIds` by the exhibit's hand-over, or by the first recommendation move or code's recommendation ask. Hand grades are cited where they discuss it.

**prof-002: `competitor_costs` before `exhibit-3`** (3 in all, with the case's two). Missed in:
- b32 Raj b17c59e1 (Exhibit 3 at t18);
- b32 Jasmine 5fa81cec (t12);
- b36 Jasmine bbf78ab8 (t10; graded firm, "competitor never told");
- b38 Marisol f80d981c (t14; graded firm at t9→t10, and the grader proposed this must-reach).

The other 16 Larkspur runs had it.

**launch-001: `retailer_support` before the recommendation.** Never heard in 6 of 10 runs:
- b35 Marcus 70a06d70 (t22);
- b35 Jasmine 984d9066 (t20);
- b35 Tyler 52951de8 (t20);
- b37 Marcus ddbb070b (t22; the grade says distribution became his biggest risk);
- b37 Marisol 7f6c40ea (t28);
- b37 Tyler 442e37ff (t18).

**launch-001: `cannibalization` before the recommendation.** Never heard in 6 of 10 runs:
- b35 Raj 01b805d6 (recommendation asked at t18; the line only came out at t28);
- b35 Marcus, b35 Jasmine, b35 Tyler;
- b35 Marisol a14ca044 (t24);
- b37 Marisol (t28; the grade says she made cannibalization her biggest risk without ever hearing the line).

**pricing-001: `why_pro_fell` before the recommendation.** Never released in 8 of 10 runs:
- b35 Raj 5c3d2c21 (t23), b35 Marcus 7e69eda5 (t27), b35 Jasmine fcd7dce7 (t9), b35 Marisol 087451cb (t27);
- b37 Raj e08c362a (t25), b37 Marcus eb8d7576 (t29), b37 Jasmine 3376e5fe (t7), b37 Tyler a2a5921b (t19).

Each of them sized cannibalization as the whole Pro drop. Only b35 Tyler and b37 Marisol got it, and both asked for it.

**entry-001, `proposed` only (ruling 3): `nimbrel` before `exhibit-2`.** `nimbrel` was never released through the end of the run in 4 of 15 runs:
- b32 Jasmine 6544aa01 (Exhibit 2 at t8);
- b34 Jasmine 4e89a7cc (t6; graded a serious false refusal at t4, the candidate never heard of Nimbrel);
- b34 Marisol a1133734 (t14; "Nimbrel is covered by most plans" at t16, to a candidate never told what Nimbrel is);
- b36 Jasmine 6bbc2163 (t8).

It came late in a fifth: b36 Marisol 6f57da6e (Exhibit 2 at t12, Nimbrel named at t14, the line only at t16).

The alternative, before the recommendation, is in `proposed.note`. Not proposed: `current_treatment` (the nimbrel line already covers it), and `insurance_coverage` and `pipeline` (no grade shows a recommendation hurt by their absence).

**prof-001, `proposed` only (ruling 2): `non_bean_input_change` before the recommendation.** Two graded runs show a recommendation contradicted by a fact the candidate never heard:
- b31 Sofia e0f7d46c t21: recommended a bean procurement reset, beans "the largest COGS line", never offered the other inputs' price rise (b31 grade, firm);
- b28 Blake 32f0a72b t21: recommended hedging the bean supply on his own guess (b28 grade, borderline).

Caveat, for Lorenzo: Blake is the data-ignorer persona and declined the offered data at t13, so a must-reach hands him what the persona is meant to skip. Sofia's miss was the engine's. `mustReach` stays empty.

## Task 5: askPhrases in the prompt

**What changed.**
- `lib/agent/prompts/system.ts`: an optional `PromptContext.askPhrases`, rendered as a section in the stable, cached part after DATA AND EXHIBITS.
- `lib/orchestrator/prompt-context.ts`: sets the field only when `switchOn(caseData, 'askPhrasesInPrompt')` is on.

**Why it lists every item.** An "unrevealed only" list would change every turn and break the cache prefix. The section therefore lists every item, which keeps it static. The per-turn DATA YOU CAN RELEASE list is unchanged and still decides what is releasable. Released items' phrases are harmless: they carry no figures and no findings.

**Example** (prof-002, switch on; off, the section is absent):

```
… If your question refers to an exhibit not yet on screen, set "exhibit" to its id.

WHAT EACH DATA ITEM ANSWERS — the questions each case item answers, to help you fill "item_ids". An item can be declared for release only while it is listed under DATA YOU CAN RELEASE. These phrases describe the questions, not the data: never say them as facts.
- id: "op_profit_definition" — What operating profit includes: what operating profit includes; which costs sit in operating profit; whether profit is before interest and taxes
- id: "geography" — Where Larkspur flies: where the airline flies; whether any routes are international; the markets the network serves
- id: "fleet" — Larkspur's fleet (covers the current and prior period): the size and type of the fleet; whether the aircraft are owned or leased; seats per aircraft; whether the fleet changed
…

FLOW:
```

**Size.** It adds about 5.7k characters to prof-002's stable part (about 1.4k tokens, cached).

**Tests** (`tests/agent/ask-phrases-prompt.test.ts`, TDD):
- Switch off, all five cases, two states each (CLARIFY with nothing out, ANALYSIS with two items out), through the real `planTurn` → `promptContextFor` → `buildPromptParts`: sha256 of the stable and turn parts equals hashes taken before the change. I also checked those hashes against the case data with the overlays moved aside.
- Switch on:
  - the stable part is identical in both states;
  - the turn part is unchanged;
  - each item's line is present;
  - removing the section gives the off prompt;
  - another case's switch doesn't touch prof-001.

The compact prompt arm (`system-compact.ts`, an experiment) is not changed.

## Judgement calls

1. **Covers "10–20 per item"** I read as the merged total (base plus overlay). Items already at 18–21 got 0–2.
   - Precision won over count for three items under 10: prof-002 `connecting_passengers` (8), entry-001 `us_adults` (7) and `option_shared` (9).
2. **No cover relies on an exclusion word**, because none is read today (above).
3. **Static askPhrases section with every item**, for the cache, rather than unrevealed items only.
4. **prof-001 factTags are minimal:** no "we" or "our", no entities, no forecast items. A "competitors" entity would turn true refusals ("I don't have competitor pricing") into hollow entity deferrals.
5. **Tag calls:**
   - entry-001 `option_a`/`option_b` state expected peak shares but aren't in the case's `forecast` list, so they are tagged current. Possible tag-list gap, for Lorenzo; the case is unchanged.
   - launch-001 `cannibalization` is current, not forecast; `planning_assumptions` is forecast and current.
   - Definitional items are current / level.
6. **pricing-001 lineage restated**, with `upgrade_rate` as a new root (above).
7. **Must-reach "missed"** means not revealed by the exhibit hand-over, or by the first recommendation move or ask, read from the turn records.
8. **The phase1-contract load test** is relaxed to exclude the descriptive fields (Task 3).
9. **progress.md and the PRD are not updated on this stream branch**, to avoid conflicts. The lead folds this report in at merge.

## For the lead

- **Exhibit summaries and prof-001.** Summaries are attached to the exhibit objects with every switch off. If the client receives the whole exhibit object, the summary reaches the browser payload. It is allowed to reach the candidate (contract §1), but it is a difference with switches off: worth stripping if "prof-001 identical" should cover payloads.
- **coverExcludes need a reader** in fact-check.ts (Stream 4's file) for the exclusion words to mean anything.
- **No free replay was run.** The lead's gate covers it.
- **Under `*=phase1`, prof-001 gets `tagMatching`** (contract Q4). The tagMatching view shows 15 more gains than literal matching, all sentence forms of the same COGS and menu asks, all judged correct.

## Review fixes (22 Oct, one round)

These supersede the numbers and calls above where they differ.

| Commit | Task | Change |
|---|---|---|
| 6917701c | 2 | The lint flags a cover inside another item's cover after the fold (section 1b, "new" or "at BASE"), and the overlay test requires no new one. The reverse forecast rule is relaxed: an item tagged `['forecast', 'current']` needn't be in `factAnchors.tags.forecast`; a forecast-only one still must. |
| 8d5004f9 | 1 | Covers narrowed (below). |
| f61f001a | 3 | askPhrases, a definition, tags and lineage (below). |
| 1946fbd7 | 5 | Comment in `lib/agent/prompts/system-compact.ts`. |

**T1, covers**

Dropped or qualified:
- prof-002:
  - `new_routes_context`: dropped "anyone flying nonstop", "incumbent competition".
  - `network_totals`: "flights flown" → "network flight count"; "total contribution" → "total network contribution"; "flight count" dropped.
  - `fleet`: "how many planes" → "how many planes larkspur has"; "seats per aircraft" and "regional jets" dropped.
  - `competitor_costs`: "cost disadvantage" → "our cost disadvantage".
  - `fixed_costs`: "hub costs" → "hub facility costs".
- launch-001 `bag_price`: "what shoppers pay" dropped; "shelf / retail price per bag" and "price point per bag" now start with "our".
- prof-001 `menu_price_change`: dropped "have prices gone up", "did they raise prices".
- pricing-001:
  - `cohort_notes`: dropped "how churn has moved", "does churn change over time".
  - `price_test_results`: "control versus test" → "price test control versus test".
- entry-001 `option_shared`: dropped "shared assumptions".

The covers behind the lint's unsure gains were all dropped, conservatively. There were three, not two:
- pricing-001 "starter monthly churn";
- prof-001 "cogs as a percent of revenue";
- prof-002 "port avery variable cost".

The three containments the new check found were resolved by dropping the overlay phrase:
- pricing-001 "starter installed base", inside base "installed base";
- launch-001 "conversion assumptions", inside base "basis for conversion assumptions";
- prof-001 "bean inflation", inside "non-bean inflation", because the fold splits the hyphen.

Lint after the fixes: 0 wrong, 0 unsure, 0 new collisions, 0 new containments in every view.

| view | changed asks | gains (all judged "answers") |
|---|---|---|
| prof-001 | 152 | 153 |
| prof-001 (tagMatching on) | 166 | 167 |
| prof-002 | 101 | 104 |
| entry-001 | 99 | 99 |
| launch-001 | 11 | 11 |
| pricing-001 | 31 | 33 |

Unmapped model asks that gain an item are now 5 asks, 7 gains:
- lost: b32 Larkspur Marisol t1 (`network_totals`, by the narrowed "network flight count");
- b38 Larkspur Marisol t1 keeps `extras_revenue` only;
- pricing b37 Jasmine t1 keeps `plan_cac` and `pro_cohort`, and loses `starter_cohort`.

**T3, data**
- askPhrases:
  - pricing `why_pro_fell`: "what else could explain the Pro sign-up numbers";
  - pricing `price_test_results`: "how demand responds to the tested Starter price";
  - launch `survey_design`: "how to read questions where shoppers could pick more than one answer".
- prof-001 definition "other inputs as a share of revenue": the "menu prices are flat" clause is removed, along with its `menu_price_change` item ref.
- Tags `['forecast', 'current']`: entry `option_a`, `option_b`; launch `cannibalization`; prof-002 `new_routes_context`.
- dependsOn:
  - pricing-001's `steps` are removed from the overlay, so round 6's authored lineage stands under `stepLineage` (tested). This replaces judgement call 6.
  - entry-001 `option_b_net_sales` and `matching_share` now include `net_price`.
  - **Proposed case edit for Lorenzo** (not made): pricing-001 `churn_breakeven_at_60` would need `pro_ltv` in its `dependsOn`.

**T5.** The compact prompt arm (`system-compact.ts`, an experiment) does not render `ctx.askPhrases`. Only the full prompt shows them; a comment there says so.

**Totals after the fixes**

| case | overlay covers | merged per item | items under 10 |
|---|---|---|---|
| prof-001 | 103 | 10–20 | none |
| prof-002 | 163 | 8–21 | `connecting_passengers` 8 |
| entry-001 | 145 | 7–13 | `us_adults` 7, `option_shared` 8 |
| launch-001 | 160 | 10–15 | none |
| pricing-001 | 151 | 9–14 | `cohort_notes` 9, `existing_starter_customers` 9 |
| **all** | **722** | | 5 items |

dependsOn entries: prof-001 3, prof-002 9, entry-001 9, launch-001 9, pricing-001 0 (round 6's 12 stand).
