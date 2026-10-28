# Data-path audit: B1′ / B2′ (batches 36–37)

21 Oct 2026. Code at `engine-asks` 29469ee, the code the waves ran (77ecea3 adds docs only). Sources:
- The 20 runs' turn records (`*.turns.jsonl.gz`: parsed model turn, every check row, delivered lines). Extracted by a scratch script, not committed.
- The four `hand-grading.md` files.
- `cases/*.json`.
- The code cited below.

No paid calls, no code change, no replay.

**How "would have caught" was judged:** by reading the code path against the recorded inputs, not by running it. Every proposed fix still needs a free replay against the recorded verdicts (b28–b37) to count the false refusals it adds. Unverified points are marked as such.

File abbreviations: `td` = `lib/orchestrator/turn-data.ts`, `dd` = `data-decisions.ts`, `fc` = `fact-check.ts`, `st` = `stream-turn.ts`, `se` = `settle-turn.ts`, `sr` = `session-runner.ts`, `aq` = `ask-qualifiers.ts`, `dr` = `data-requests.ts`, `rs` = `request-signal.ts`, `iv` = `lib/agent/interviewer.ts`.

Turn numbering:
- "t12" is the interviewer's reply, as in the grading files.
- The ask is the candidate's t11.
- In the turn records, the reply is stored under `turnIndex` 11.

## Headline

1. **Running `refusal_covered` on every path with today's covers catches 0 of the 22 data-path faults.**
   - It already runs on every item-less ask before the Haiku check (`td:732–766`, pass 1 of `turnDataChecked`). That includes all five false refusals.
   - On each of those five, no cover phrase matched.
   - The other 17 faults aren't refusals of held data, so a refusal veto can't see them. They are wrong items, wrong restatements, unasked releases, or asks nobody read.
2. **The five false refusals are all cover misses, caused by literal phrase matching:**
   - "avoidable fixed cost" vs the cover "avoidable fixed costs";
   - "number of stores" vs the covers "how many stores" / "store count";
   - "departures" vs the name "total flights";
   - "cost per seat mile" has no cover at all.

   Covers (plus plural-insensitive matching) fix all five deterministically.
3. **Correction to the B2′ grading:** Hollis Bay Marisol t8 is *not* explained by "the coarse path skips the covers veto".
   - The code does skip the M6 veto on a whole-ask coarse refusal (`td:256`).
   - But the coverage step had already read the same ask with the same covers on pass 1 and found nothing.
   - The veto reads those same covers (`fc:837–839` → `coverageOf`), so it would have missed too.
   - The cause is the missing cover.
4. **Twelve faults are wrong answers:** a release, restatement or coarse release of an item that doesn't answer the ask.
   - Seven came from the Haiku check's labels.
   - Three came from the model's own item choice or `explicit` flag.
   - One came from a cover that matched across a geography.
   - One came from code giving the guard's own unmet topics as coarse items.

   The only release-side check that exists (`release_checked`, `td:494–514`) runs only on the model's own explicit releases. Its one withdrawal in the wave (Quillpath Marisol t8, `why_pro_fell`) removed the closest true answer.
5. **The qualifier guard was right 3 of 3 times it fired.** Its misses are grammar (trend words, entity, breakdown, method, geography) and placement:
   - it reads only the check's verdicts;
   - it reads only the model's `what`, never the candidate's sentence;
   - its topic-unmet verdict doesn't stop E1's coarse release.
6. **Five asks were never read at all:** the request-reader grammar missed them, or the model declared an offer instead. No data check can act on an ask nobody read.
7. **Math side:** both Quillpath probe chains had a deterministic check that caught the root.
   - `recompute_report_only` flagged `starter_ltv` 405 → 600 (Raj t11) and 420 → 600 (Marcus t17).
   - It is report-only on pricing-001.
   - Even live, the 16 Oct gate needs the Sonnet checker's agreement, and the checker rated both roots correct.
   - The chains ran on because the case's math steps carry no step-to-step dependency, so E7 can't link $1,205 / $920 / $2,800 back to `starter_ltv`.

## Part 1: path inventory

"Fired" counts every occurrence in the 20 runs, deduplicated per turn. Stream and Settle each log some rows, and those were counted once. A path is something that can put a data line, refusal, deferral, restatement or offer into an interviewer turn.

| # | Path | File · function (lines) | Trigger | What it writes | Fired (20 runs) |
|---|---|---|---|---|---|
| 1 | The interviewer model's own item mapping and its `respond` field | model turn JSON → `td:turnData` → `dd:decideData` (`dd:370–421`) | `requests[]` with `item_ids`, `explicit`, `respond` | the item's ledger line (release); "As I mentioned / As the exhibit shows: …" (restate, if out); "I'll come back to X" (defer) | explicit + items: **98** release, **12** defer; explicit item-less: **30** release, **6** defer; `explicit:false` mentions: **17** release, **8** defer |
| 2 | Label alias for an unmapped explicit ask | `td:585–589` → `dd:labelMatch` (`dd:80`) | item-less explicit ask whose words are exactly one label plus period words | as path 1 | not logged |
| 3 | `request_group` (group expansion; restates under the restate cap) | `td:612–641`; restate cap `dd:390` | the ask names a case group ("the cost breakdown", route results) | every group item: released, or restated when out (cap 3) | **6** turns |
| 4 | `request_covers` (per-store asks only) | `td:673–684` | mapped per-store ask the covers answer | adds the covered item, drops the per-store cut | 0 |
| 5 | `request_scope` (scope rules drop mapped items) | `td:685–712` → `dd:outsideAskScope` (`dd:180`) | a mapped item is outside the ask's cut, split, basis, one-off or count | the item dropped from the ask; emptied → path 10 or path 7 | **2** asks |
| 6 | `refusal_remapped` (case names) | `td:735`, `td:760–766` → `fc:findFalseRefusals` (no covers) | an item-less explicit ask whose refusal would name a held item | the ask mapped to those items, **no remainder kept** | **2** |
| 7 | `refusal_covered` (case covers, prompt facts) | `td:738–765` → `fc:coverageOf` (`fc:656`) | an item-less explicit ask a cover phrase hits | the covered items; the uncovered rest refused; prompt facts restated (`td:973`) | **3** (Aldermoor Marcus t6; Hollis Bay Raj t12, Marisol t16) |
| 8 | Haiku ask check: full / partial / none / coarse (+ qualifier guard) | `td:checkAsk` (`td:279–346`) → `dr:classifyAsk`; decided by `td:decideCheckedAsk` (`td:198–258`); applied `td:780–801` | an explicit ask still item-less after paths 6–7 (declared defer or release; `td:957–963`) | see 9 (none), items → path 1's forms; coarse/partial → path 10 | **34** calls: none 15, items 13, coarse 6, no verdict 0; partial labels 8; guard 3; `partial_dropped` 6; timeouts 0 |
| 9 | Item-less defer or release turned into "I don't have X" | `td:turnDataChecked` (`td:374–391`) | check verdict: maps to no item | the refuse pool line with the model's `what` | **15** |
| 10 | `scope_coarse` (E1): coarse item plus "I don't have <cut>" | `td:809–822`, `td:921–944` | an ask emptied by a scope rule (path 5), or a check verdict coarse/partial | the coarse item's line + refusal; refusal alone when the item is out (4b) | with the item **3**, refusal alone **3** |
| 11 | `uncovered_asks` / `probe_turn_requests` (coverage of the message's asks) | `td:messageAsks` (`td:533–555`), `td:withAsks` (`td:556–560`); logged `se:199–204` | an asking sentence with a clause no explicit declaration names | classifier detections join as explicit releases (then paths 1, 5–10) | answered **11**; marked covered by a declaration **37**; dropped **3** |
| 12 | `release_checked` (Task 51) | `td:uncheckedReleases` (`td:494–514`); logged `se:207–213` | a model explicit release of an item not yet out whose label, covers or names share no content word with the message | the release withdrawn; the message's asks answered on their own | checked **1**, withdrawn **1** (Quillpath Marisol t8, `why_pro_fell`: the closest true answer) |
| 13 | Offer path (`explicit:false` → "I can share X if you'd like") | `dd:402–413` (`mentionStatesNeed`, `dd:66`) | a mention whose label a need cue names | the offer pool line | **25** mentions → **6** offers |
| 14 | Pressure-test gate deferral | `td:827–848`; `gate_defer` pool | a gated item asked before the structure probe is answered | "I'll share X once we've settled your structure." | **3** |
| 15 | Fulfilment and forced releases of open asks | `td:851–876` (`planForcedReleases`) | the pressure test satisfied, a missed-twice turn, or a rec/close kind | the item's line under "On what you asked about earlier:" | **7** lead-ins |
| 16 | Deferral lines (model's defer, over the cap, release order) | `dd:394`, `dd:414–416`; wrap-up `dd:434` | `respond: defer`, cap, or `heldForOrder` | "I'll come back to X shortly."; "We won't get to X today." on wrap-up | **22** deferrals; **0** won't-get-to |
| 17 | Exhibit handover (requested, covering two or more asked items, the model's `exhibit` field, code's stage turn) | `dd:316–324` (`dd:321`); stage turns in `plan-turn.ts` | an asked exhibit, two or more of its items asked, the model's field, or a stage deadline | "Here's an exhibit: <title>." | **60** exhibits (model field set **13** times) |
| 18 | `code_written_requests` (code-written turns' asks) | `sr:331–367`, `sr:codeWrittenAsks` (`sr:463`) | a code-written turn (stage, close, warning…); the classifier on the message | detections an asking sentence covers go through `turnData`; the rest dropped | **73** turns; answered **6**, dropped **20** |
| 19 | `request_guard` (guard B: regenerate on an empty `requests`) | `iv:79–95`; logged `sr:380` | an explicit request cue, and the model declared `[]` | the turn written again | **4** regenerations |
| 20 | The model's own words in `say` / `question` | `se:229–245` via `st:vetoReason` (`st:154–207`) | always | whatever survives the vetoes | withheld: `data_talk` **3**, `provenance` **4**, `undelivered_claim` **2**, `false_refusal` 0, `refuses_released` 0 |
| 21 | Misquote correction (Rule 6 option 4) | `td:971`; `misquote.ts` | code's misquote check finds a misquoted revealed figure | the ledger's own words | 0 |
| 22 | Rescue item (stall rung 3) | `dd:424` | a rung-3 stall turn | the item's line | 0 |

## Part 2: deterministic checks matrix

### 2a. The checks

| Id | Check | Code | Reads | Effect on a data line |
|---|---|---|---|---|
| A | **Coverage step**, the `refusal_covered` / `refusal_remapped` veto | `td:732–766` → `fc:coverageOf` (`fc:656–697`), `fc:findFalseRefusals` (`fc:750`) | an item-less explicit ask's `what` (the model's words) against case names and cover phrases; its own cut vetoes `FURTHER_CUT` (`fc:654`) and `GLOBAL_FINER` (`fc:733`) | maps the ask to held items (release or restate); keeps the uncovered rest as a refusal (covers only) |
| B | **M6 false-refusal veto** on the check's refusal parts | `td:214–220`; used at `td:238` (mixed items) and `td:256` (coarse, **not** on a whole-ask refusal) | "I don't have <part>." with covers | drops a part a ledger item covers (`partial_dropped`, `false_refusal`) |
| C | **Model-words vetoes** | `st:171` (`refuses_released`), `st:173` (`false_refusal`, with covers), `st:200/203` (`data_talk`), `st:162–167` (`provenance`, `false_fact`) | the model's say/question sentences | withholds the sentence (code speaks data lines) |
| D | **Qualifier guard** | `td:qualifierGuard` (`td:142–156`), called at `td:328`; grammar `aq:23–37` | the check's mapped items' labels and lines vs the ask's periods, scopes and second topics | marks items partial; adds "I don't have <qualifier>"; on the coarse path the items are still given (`td:242–257`, `td:788–791`) |
| E | **`release_checked`** | `td:494–514` (`rs:namesItem`, `rs:221`) | model explicit releases of items not yet out vs the message's words | withdraws the release |
| F | **Scope rules** (`outsideAskScope`: BASIS `fc:621`, ONE_OFF `dd:147`, recurrence, COUNT `fc:642`, split, CUT `dd:120`) | `dd:180–210`; on model asks `td:685`; on check verdicts `td:308` (`answersAsk`) | the ask's words vs the item's label and value | drops the item (→ E1 / refusal) |
| G | **Period / timeframe words**: label-alias period words; `periodOk` in `findFalseRefusals`; guard periods; `timeframe` | `dd:45–47` and `dd:80`; `fc:~775–785`; `aq:23–34` (TREND `aq:33`, `statesTrend` `aq:129`); `se:746` (**log only**) | ask period vs item periods; the spoken line's cross-period arithmetic | alias or no alias; a name hit kept or dropped; guard partial; nothing (log) |
| H | **Pressure-test gate** | `td:827–848`; model exhibit `td:882` | gated items before the structure probe is answered | holds them: a gate deferral |
| I | **Release order and cap** | `dd:heldForOrder` (`dd:246`), `dd:exhibitReady` (`dd:223`), cap `dd:305`, `dd:394`; open asks `td:854`, `td:869` | exhibit `after` / `requiresItems`, stages out, 3 releases a turn | holds or defers |
| J | **E5 stop sequence** | `dr:586` (`stop_sequences: ["]}"]` on the Haiku 4.5 prefill) | the check's raw reply | ends the reply at `]}`; a latency/parse bound, **not a judgement on any line** |
| K | **Restate cap** | `dd:390` | restates in a turn | at most 3 |
| L | **Offer need gate** | `dd:412` (`mentionStatesNeed`, `dd:66–77`) | a need cue followed by one distinctive label word in the same clause | offer or nothing |
| M | **Post-turn numeric audit** (FR-4) | `se:745` (`audit.ts:auditTurn`) | every number in the spoken turn vs the revealed set | numbers only, after the fact; never judges whether a line answers the ask |

### 2b. Path × check

Cells: **runs** / **doesn't run** (on this path) / **verdicts only** (runs, but only on the Haiku check's verdicts).

| Path | A coverage | B M6 | C model-words | D guard | E release_checked | F scope | G period words | H PT gate | I order + cap | J stop seq | K restate cap | L offer gate | M audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Model-mapped (+2 alias, 11 detections with ids) | doesn't run (`td:734`; per-store only `td:674`) | doesn't run | doesn't run | doesn't run (`td:126–141`) | runs (`td:497`, explicit releases not yet out) | runs (`td:685`) | runs: CUT "by year" `dd:203`, alias `dd:80`; guard periods don't | runs (`td:827`) | runs (`dd:394`) | doesn't run | runs (`dd:390`) | doesn't run | runs |
| 3 `request_group` | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run (grouped items skipped `td:510`) | runs (`td:632`, `td:685`) | runs (CUT only) | runs | runs (group completes past cap `dd:304–305`) | doesn't run | runs | doesn't run | runs |
| 6–7 Coverage-mapped (`refusal_remapped`, `refusal_covered`) | runs (it is A) | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run on the covered item (added after the scope step, `td:755`); only `coverageOf`'s own cut words | runs (`periodOk`, names path only) | runs | runs | doesn't run | runs | doesn't run | runs |
| 9 Check → none → refusal | runs (pass 1, on the same `what`) | doesn't run (returns at `td:202`) | doesn't run | doesn't run (no items, `td:144`) | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | verdicts only | doesn't run | doesn't run | runs |
| 8 Check → items (release / restate / named defer) | runs (pass 1) | verdicts only (`td:238`) | doesn't run | verdicts only | doesn't run | verdicts only (`td:308`) | verdicts only (guard periods) | runs | runs | verdicts only | runs | doesn't run | runs |
| 8+10 Check → coarse / partial → `scope_coarse` | runs (pass 1) | verdicts only, and not on a whole-ask refusal (`td:256`) | doesn't run | verdicts only | doesn't run | verdicts only | verdicts only | runs (held coarse item → refusal alone `td:835`) | runs (`td:906–916`) | verdicts only | doesn't run | doesn't run | runs |
| 5+10 Scope-emptied model ask → E1 (unchecked) | runs (on the emptied ask, `td:734`, `td:752`) | doesn't run | doesn't run | doesn't run (excluded from the check, `td:957`) | doesn't run | runs (it is the trigger) | runs (CUT) | runs | runs | doesn't run | doesn't run | doesn't run | runs |
| 11 `uncovered_asks` detections | doesn't run when the detection has ids; else as 6–10 | as 8 if item-less | doesn't run | doesn't run (detections with ids) | doesn't run (computed on the model's declarations, `td:539`) | runs | runs (CUT) | runs | runs | doesn't run | runs | doesn't run | runs |
| 13 Offer | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | runs (`td:685`) | doesn't run | doesn't run | runs (`available`, `orderHeld`, `dd:411`) | doesn't run | doesn't run | runs (`dd:412`) | runs |
| 15 Fulfilment / forced | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | runs (`td:869`) | runs (`td:854`, `td:867`) | doesn't run | doesn't run | doesn't run | runs |
| 17 Exhibit handover | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | runs (model's exhibit, `td:882`) | runs (`dd:223`, `dd:317`) | doesn't run | doesn't run | doesn't run | runs |
| 18 Code-written turn detections | runs for item-less detections | verdicts only | doesn't run | verdicts only | doesn't run (kind ≠ model, `td:496`) | runs | runs (CUT) | runs (rec/close kinds force open, `td:571`) | runs | verdicts only | runs | doesn't run | runs |
| 20 Model's own words | doesn't run | doesn't run | runs (`st:162–203`) | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | runs |
| 21 Misquote correction | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | doesn't run | runs |

What the matrix shows:
- **A (coverage) is the one refusal-side check, and it runs before every check-made refusal already.** It never runs on a model-mapped ask, so it can't add a missed item there (Larkspur Tyler t6).
- **D (guard) is the only check that asks "does this line answer the qualifier asked?"** It is confined to the check's verdicts.
- **No path releasing or restating an item has a check that the item answers the ask's entity, scope or kind**, except E on model releases (word overlap only) and F's narrow scope words.

## Part 3: fault table

"Path" refers to Part 1's numbers.

"Why it didn't catch it" uses four labels:
- **not wired:** a check exists but doesn't run on this path;
- **ran, nothing matched:** the check ran but no cover, tag or pattern matched;
- **ran, passed wrongly:** the check ran and passed the line;
- **no check:** no check of this kind exists.

### 3a. Serious and false (interviewer)

| # | Batch · run · turn | Line said / the candidate's ask | Path | What made the wrong call | Deterministic checks on the path, and whether they ran (record) | Why it didn't catch it | Smallest deterministic fix |
|---|---|---|---|---|---|---|---|
| 1 | b36 Larkspur · Tyler 4e91d638 · t12 | "A set of four levers. **I don't have avoidable fixed cost by route.**" / t11 "Can I get the avoidable portion of fixed cost per route?" (and "how much fixed cost (leases, hub) is truly avoidable versus stranded") | 1 → A → 8 → 10 alone. The model declared `avoidable fixed cost by route`, item-less release; the check said `fixed_costs` partial; `scope_coarse` alreadyOut | Haiku label (`fixed_costs` partial; `aircraft_leases` not mapped), after the model left it item-less | **A ran:** no row, so no cover matched. `aircraft_leases` covers "avoidable fixed costs", "fixed costs avoidable"; the ask says "fixed cost". Check ran (`itemless_defer` coarse, 552 ms). **D ran, no qualifier** (no `guard`). B skipped (whole-ask coarse, `td:256`), but it reads the same covers. `uncovered_asks` ran: the classifier detected "Avoidable fixed cost per route (aircraft leases and hub facilities…)" and marked it covered by the model's item-less declaration; its ids are **not recorded** | ran, nothing matched (plural) | Cover "avoidable fixed cost" on `aircraft_leases`, or plural-insensitive `coverageOf`. The coverage step then maps the ask to `aircraft_leases` and releases it (the per-route cut gets no refusal: borderline at worst) |
| 2 | b36 Larkspur · Marisol 5907649a · t12 | "…Variable cost on the new routes is estimated at $9,200 per flight, across 5,000 flights a year that would use the aircraft time freed by exiting…" (unasked Exhibit 3 data) / t11 "Do we know anything about the entrant's cost per seat, or how many flights a day they're running on each route?" | 1 (`competitor_costs`, right) + 8 → items. The check mapped 8 items full; the only one not out, `new_routes_cost_flights`, went out | Haiku label (8 items "full") | A ran, no cover. Check ran (1,259 ms, items). **D ran, no qualifier read:** "the entrant" isn't a scope word (`aq:37`), and "a day" isn't a period. **E doesn't run on check-made releases** (`td:497`), and its word test would pass anyway ("flights", "route"). H, I ran and passed (PT satisfied; no order hold) | no check (no entity check on a release); E not wired here and wouldn't match | New tags: an entity per item (Larkspur / competitor / new routes) + a release-tag check on every release path. A guard scope word ("entrant", "low-cost airline") alone is **not enough**: one conjunct makes every mapped item partial, and E1 still releases the coarse item (`td:788–791`) |
| 3 | b36 Larkspur · Marcus a7d9f44e · t6 | "**I don't have cost per seat mile trend.**" / t5 "how has cost per available seat mile moved from FY2023 to FY2025" | 1 (item-less defer) → A → 8 → 9 | Haiku (none), after the model left it item-less | A ran, no cover or name (`unit_costs` names: wages, unit costs, labor cost trend). Check ran (none, 459 ms). B doesn't run on refuse (`td:202`) | ran, nothing matched | Covers "cost per seat mile", "cost per available seat mile", "casm" on `unit_costs` (and `fuel_prices`) |
| 4 | b36 Larkspur · Jasmine bbf78ab8 · t2 | "**I don't have total departures and average fare, FY2023 vs FY2025.**" / t1 "Can I get the revenue breakdown — total departures and average fare in FY2023 versus FY2025…" | 1 (item-less defer) → A → 8 → 9 | Haiku (none) | A ran, no cover or name (`network_totals` names "total flights", not departures). Check ran (none, 420 ms) | ran, nothing matched | Cover "total departures" / "departures" on `network_totals`. The covers path keeps the rest as a refusal ("average fare…"; the period splits as its own entry, so the wording is clumsy). A *name* would go through `refusal_remapped`, which drops the remainder (`td:760–763`) |
| 5 | b37 Hollis Bay · Marisol 7f6c40ea · t8 | "The new line is for the same grocery and mass-retail stores that carry Hollis Bay chips. **A distribution estimate by number of stores — that's not something I have.**" / t7 "Do we have a distribution estimate — number of stores Hollis Bay can get into next spring?" | 1 (item-less release) → A → 8 coarse (`channels`, outOfScope by COUNT) → 10 with item | Haiku label (`channels`, not `retailer_support`) | **A ran, no cover:** `retailer_support` covers "how many stores", "store count", "stores the line gets into", "distribution reach", but not "number of stores". Check ran (510 ms). F ran (`countFinerThan` put `channels` out of scope). B skipped (whole-ask coarse, `td:256`), but it reads the same covers, so it **would have missed too** | ran, nothing matched. **Not** "the coarse path skips the covers veto" | Cover "number of stores" (and "distribution estimate") on `retailer_support`. Its line states "two", so it's no count-finer item and goes out whole. Side effect to replay: Marisol t28's true refusal ("the total number of stores carrying Hollis Bay") would become a restatement |

Report false lines (scoring side; which check would apply):

| Run | Report line | Scoring checks that apply | Why none caught it |
|---|---|---|---|
| b36 Larkspur Marisol | "…Port Avery's $11,000 cost was applied to Lakeport's revenue. Each was corrected only when the interviewer probed." The $11,000 was never probed (flag 7:1 closed stale) | `checker-record.ts` tells the judge each flag's fate (stale close), but only as text the model reads. The verifier is a model. `evidence-audit.ts` checks only that candidate quotes exist; `better-audit.ts` checks only betterResponse figures | no check of this kind: nothing compares a report claim about interviewer actions ("probed", "corrected") with the probe and checker-line events. Buildable deterministically from `checker_line` rows; not built |
| b37 Quillpath Tyler (graded borderline) | "a total of $1,400 per sign-up, and $1,500 at $60" (gross beside net) | Both figures are math-step answers (`starter_value_with_upgrades` 1400, `starter_value_at_60` 1500), so any figure audit passes them | needs semantic judgement (gross vs net pairing) |

### 3b. Data-decision firm faults

| # | Batch · run · turn | Line said / the candidate's ask | Path | What made the wrong call | Deterministic checks on the path, and whether they ran | Why it didn't catch it | Smallest deterministic fix |
|---|---|---|---|---|---|---|---|
| 6 | b36 Larkspur · Tyler · t6 | Lakeport fare + 3 Exhibit 1 lines restated + "I can share load factor on Lakeport and Port Avery if you'd like." / t5 "I'd want to know fares and passenger counts specifically on Lakeport and Port Avery. Do we have average fare by route?" | 1 (`lakeport_fare` only) + 3 (`request_group` restates, cap 3) + 13 (`explicit:false` → offer) | Interviewer model's mapping (one route; the passenger-count ask flagged `explicit:false`) | `request_group` ran (restated 3 lines). F ran, no cut ("by route" not in CUT `dd:120`). **A doesn't run on mapped asks** (`td:734`). D doesn't run (model-named). L ran and passed (need stated). `uncovered_asks` ran: only "Do we have average fare by route?" read as an asking sentence; `open` [] so the classifier wasn't waited on | not wired (coverage and guard skip model-mapped asks) | Run the coverage step on mapped asks to *add* items the covers name (generalize `request_covers`, `td:673–684`) + cover "fare by route" on `port_avery_per_flight`; and promote an offer to a release when an addressed asking sentence names its item (code rule, no case data) |
| 7 | b36 Larkspur · Tyler · t18 | "Understood. Setting that plan aside, what else could Larkspur do…" / t17 "Can we stress-test demand on Ashford and Brookhaven?" | none: the model declared `[]`; no path fired | Interviewer model (declared nothing); the request reader | Request reader ran: no cue (`rs:12–19`) and no data noun, so no `request_signal`, no `request_guard`, no `uncovered_asks` row | ran, nothing matched (request-reader grammar) | Needs semantic judgement: is "can we stress-test demand" a data ask? A cue would be low-precision. A cover ("stress-test demand") on `new_route_rampup` helps only once the ask is read |
| 8 | b36 Larkspur · Marcus · t20 | "Mm-hm. As the exhibit shows: Variable cost on the new routes is estimated at $9,200 per flight…" / t19 "What I'd want to know is the launch cost — marketing, station setup, crew basing at the two new cities." | 1 (item-less release, rec_ask turn) → A → 8 items → restate | Haiku label (`new_routes_cost_flights` full) | A ran, no cover. Check ran (614 ms). **F ran (verdicts, `td:308`): ONE_OFF_ASK (`dd:147`) has no "launch".** D ran, no qualifier (one conjunct; no topic test) | ran, nothing matched | Add `launch` to ONE_OFF_ASK. `new_routes_cost_flights`' line is recurring ("5,000 flights a year"), so it goes out of scope; coarse, already out, so the refusal goes alone: "I don't have launch costs for the new routes." (Hollis Bay's `launch_costs` is exempt: ONE_OFF_VALUE has "launch costs") |
| 9 | b36 Larkspur · Jasmine · t8 → t10 | t8 "Understood. Let's stay with this case. Now, an exhibit: Hub–Lakeport…"; Exhibit 3 at t10; the competitor never told / t7 "What I'd confirm: that the entrant is a low-cost carrier with a structurally lower cost base, how many seats a day it added…" | none for the ask (the model declared only a `unit_costs` mention; L passed nothing); 17 (code's stage exhibit) | Interviewer model (no declaration); request reader; case order | Request reader ran: "What I'd confirm:" matches no cue. I ran: Exhibit 3 has `after: [exhibit-2]` and no `requiresItems` (prof-002.json) | no check (the guide's "competitor before the fix" isn't encoded) + cue miss | `requiresItems: [competitor_entry]` on Exhibit 3 **plus** code releasing a required item on the stage turn. That is a new mechanism: with `requiresItems` alone, Exhibit 3 waits for an ask that may never come. Or a cue for "I'd confirm" (precision risk) |
| 10 | b37 Hollis Bay · Marcus ddbb070b · t6 | "Here's an exhibit: Roasted chickpea snacks — Economics of one bag…. I don't have chip cost of goods or gross margin over the last few years." / t5 "do we have Hollis Bay's chip cost of goods broken out over the last three or four years … and how gross margin moved over that period?" | 1 (item-less) → A → 8 coarse → guard → 10 with items → covering exhibit (`dd:319`) | Haiku label (chickpea `variable_costs` full); **code** gave the guard-made partials as E1 coarse items | A ran, no cover. Check ran (681 ms). **D ran and fired:** both topics unmet, the refusal true. H ran: PT satisfied at t3, so open. I ran: Exhibit 1 ready | ran, passed wrongly (the guard's verdict didn't stop the coarse release) | Code-only: a guard *topic* unmet means the mapped items aren't the asked quantity at a coarser cut, so refuse and don't release (`td:242–257` / `td:788–791`). Works on today's verdicts |
| 11 | b37 Hollis Bay · Marcus · t10 | "I can share the survey on shopper purchase intent and planning assumptions if you'd like." (stores: no word) / t9 "What I'd want is distribution math: how many stores Hollis Bay can get the line into, and velocity — bags per store per week." | 13 (offer) only; the ask unread | Interviewer model (offer only); the request reader | Request reader ran: the WANT cue (`rs:16`) needs ":" or "the / a / to know…" after "want"; "**want is**" fails; no "?". So no `uncovered_asks` row, no classifier wait | ran, nothing matched (cue grammar) | WANT cue accepts "(what) I'd want is". The sentence then reaches the classifier; an item-less detection hits the existing cover "how many stores" (A). A detection with a wrong id would still be Haiku's call |
| 12 | b37 Hollis Bay · Tyler 442e37ff · t6 | "Planning assumptions from Hollis Bay's past launches are: 30 million households…" (unasked ANALYSIS item; chip volume no word) / t5 "Do we have a sense of how many bags of chips Hollis Bay moves a year?" | 1 (item-less "annual chip bag volume") → A → 8 mixed (`planning_assumptions` full, `bag_price` partial) → release; `partial_dropped` whole_ask | Haiku label | **A ran, no cover:** `why_now` covers "chip volume", "bags of chips", but the model's `what` says "chip bag volume". Check ran (632 ms). D ran, no qualifier ("annual" isn't a period). B logged `partial_dropped`. E doesn't run on check releases | ran, nothing matched. **Covers read the model's paraphrase, not the candidate:** "how many bags of chips" would have hit "bags of chips", and the count rule (`fc:642`) then gives `why_now` + "I don't have the number of …" (the designed A4 form). Same ask on Marisol t16, via the classifier's wording, hit `why_now` | Run the coverage step on the candidate's asking sentence as well as the model's `what` (today's covers catch this one); or cover "chip bag volume" |
| 13 | b37 Hollis Bay · Tyler · t18 | "As I mentioned: Planning assumptions… As the exhibit shows: The survey is of 1,000 snack shoppers…" / t17 "I'd want to know how that 500,000 was estimated — is it from a comparable past launch?" | 20 (the model's true "I don't have that" withheld by `data_talk`, `st:200`) + 1 (item-less) → A → 8 items → restate ×2 | Haiku label (2 items full); `data_talk` withholds the model's refusal by design | C ran (withheld the true line). A ran, no cover. **F ran (verdicts): BASIS (`fc:627`) needs "how was/were … derived"; the model's `what` is "how the 500,000 household estimate was derived"** (subject first). D ran (no method grammar) | ran, nothing matched (BASIS word order) | BASIS `\bhow\b.{0,40}?\b(?:was\|were)\s+(?:estimated\|derived\|calculated)\b`. Both items' lines lack "based on / comes from", so both are out of scope; coarse, out, so the refusal goes alone |
| 14 | b37 Quillpath · Tyler a2a5921b · t6 | "Most Pro customers have a demo with a salesperson first, while Starter customers sign up online on their own." / t5 "Do we have the split of Starter sign-ups by source — paid versus organic?" | 1 (model-mapped `signup_channels`) | Interviewer model's mapping | F ran: CUT (`dd:120`) has no "source"; the split rule's head noun is "how" (label "How customers sign up"). D, A don't run on mapped asks. E skipped (the message names the item) | ran, nothing matched | Add `source` to CUT's dimensions. `signup_channels` then goes out of scope → E1: its line + "I don't have the split of Starter sign-ups by source." |
| 15 | b37 Quillpath · Tyler · t18 | "As the exhibit shows: New customers per month were 500 Pro in 2024, before Starter launched, and 350 Pro plus 1,000 Starter…" / t17 "Do we know whether Pro sign-ups were already trending down through 2024, before Starter launched?" | 1 (item-less) → A → 8 items → restate | Haiku label (full); guard rule | A ran, no cover. Check ran (510 ms). **D ran and judged met:** "2024" is on the line; "trend" is met by `YEARS(t).size >= 2` (`aq:129`, `aq:152`) | ran, passed wrongly | Guard: a trend tied to one year ("through / during / within / in <year>") is met only by a series inside that year |
| 16 | b37 Quillpath · Marcus eb8d7576 · t10 (graded **borderline**) | "I can share plan economics: monthly price and cost to serve for Pro and Starter if you'd like." / no ask (t9: "I'd need to multiply by expected tenure on each plan") | 13 | Interviewer model (`explicit:false`); offer gate too lenient | L ran and passed: the cue "I'd need" + the label word "plan" in the same clause | ran, passed wrongly | Tighten `mentionStatesNeed`: the cue's object must carry two distinctive label words, or the item's spoken name (replay for lost true offers) |
| 17 | b37 Quillpath · Marisol 084e7508 · t16 (graded **borderline**, answered t18) | "I'm putting up an exhibit: Quillpath — New customers per month…" (her question dropped) / t15 "So I'd want to pressure-test that: are those upgraders people who'd have bought Pro directly anyway?" | 18 (`code_written_requests` dropped the detection) | Code (request reader on a code-written turn) | `codeWrittenAsks` ran (`sr:463`): "I'd want to pressure-test" fails the WANT cue; the question has no `DATA_NOUN` | ran, nothing matched | A question naming a ledger label's content word ("upgrade") counts as an asking sentence on code-written turns |
| 18 | b36 Aldermoor · Raj 3fdb20e8 · t12 | "Aldermoor's forecast is that Kelvexa reaches 20% of eligible patients at peak, about five years after launch." / t11 "Do we have data on what share of the 200,000 are **currently** on an advanced therapy versus untreated for severity?" | 1 (item-less "advanced therapy usage among the eligible patients") → A → 8 items → release | Haiku label (`peak_share_forecast` full) | A ran, no cover. Check ran (570 ms). **D ran, nothing to read:** the model's `what` dropped "currently". E doesn't run on check releases. H, I passed | no check (the guard reads only the model's `what`; even with "currently" read, E1 would give the forecast as a coarse item) | New tag: period kind (forecast / current / historical) on items + a release-tag check: a forecast item never answers a "currently" ask |
| 19 | b36 Aldermoor · Raj · t14 | "**Kelvexa** is protected by patents until 2038. I don't have late-stage oral competitors." / t13 "Do we have **Nimbrel's** patent expiry and any oral competitors in late-stage trials?" | 1 (item-less) → A → 8 items (`patents` full, `nimbrel` partial) → guard | Haiku label (`patents` full) | A ran, no cover. **D ran and fired**: the topic refusal is true, but it has no entity qualifier | ran, nothing matched (no entity grammar) | Guard entity qualifier from the case's proper names (`sttKeyterms`, `rs:203` `properNames`). A line naming another product and not the asked one is unmet, so "I don't have Nimbrel's patent expiry" |
| 20 | b36 Aldermoor · Marcus c518221e · t6 | "Kelvexa's **US** list price is $10,000 per patient per year…" (the European price got no word) / t5 "Do we have Kelvexa's current **European** net price per patient per year?" | 1 (item-less) → **A: `refusal_covered`** (cover "price per patient per year" → `kelvexa_pricing`, rest null) → release | Code: the cover matched across a geography | **A ran and passed wrongly:** `FURTHER_CUT` / `GLOBAL_FINER` have no geography. D, F don't run on covered items (`td:755`) | ran, passed wrongly | A geography veto in `coverageOf` (European / EU / Europe beside a phrase whose item is US), or the guard's scope check on coverage mappings, so the rest is refused: "I don't have Kelvexa's European net price." |
| 21 | b36 Aldermoor · Marcus · t24 | "As the exhibit shows: Option A … its annual US selling costs are $80 million…" / t23 "Do we have the $80 million split by rep cost versus market access?" | 1 (item-less) → A → 8 items (`option_a` full) → restate | Haiku label | A ran, no cover. **F ran (verdicts): the split rule keys on the label's head noun, "entry"** ("Entry Option A…"), so "split of the $80 million" doesn't match. D ran (no breakdown grammar) | ran, nothing matched | A split of a *figure*: an ask for a split of an amount the item states as one figure is out of scope. Refusal alone |
| 22 | b36 Aldermoor · Marisol 6f57da6e · t6 | "There are 250 million US adults. As I mentioned: In the patient funnel, 1.6% of US adults…" / t5 "Do we have data on how the eligible pool has **grown over the last few years**?" | 1 (item-less "growth in the eligible pool over recent years") → A → 8 items → restate | Haiku label (`funnel_rates` full) | A ran, no cover. **D ran, no qualifier:** TREND (`aq:33`) lacks growth / grown / over recent years | ran, nothing matched | TREND += `growth\|grew\|grown\|over (?:the )?(?:last\|past\|recent) (?:few )?years\|in recent years`. The funnel line states no change, so the trend is unmet; out already, so the refusal goes alone |

### 3c. Math side (serious)

| # | Run · turns | What was said | Path | What made the wrong call | Deterministic checks on the path, and whether they ran | Why it didn't catch it | Smallest deterministic fix |
|---|---|---|---|---|---|---|---|
| M1 | b37 Quillpath · Raj e08c362a · t12–t36 | 8 checker/code lines on figures built on a misread Starter lifetime (13.5 months → $405); the one correction (t34) lands on a derived figure | checker probes and code probes (`math-checker-live.ts`, `plan-turn.ts`) | The checker (Sonnet) rated the root correct (t11, t13, t37); the stale reader false-closed `$405` at t25 | **Step flags ran and caught the root:** `recompute_report_only` `starter_ltv` 405 vs 600 (t11, t33). They are report-only on pricing-001 (`stepFlagsLive` off), and the 16 Oct gate requires the checker's agreement. `step_probe_cap` ran (per step key). E7's input cap ran, but the derived keys carry no root. The stale reader ran (false close) | not wired (the step check exists; report-only, and gated on the model it disagrees with) + no step-dependency tags | Tag `dependsOn` on `mathSteps` (`starter_value_with_upgrades`, `starter_net_value`, `pro_net_value`… → `starter_ltv`), so E7 counts probes per root. Using the step flag to *cap* (not to speak) needs a ruling: it bypasses the checker-agreement gate |
| M2 | b37 Quillpath · Marcus · t18–t30 | the 14-month lifetime probed 3× (t18, t22, t24), then $1,880, then a derived correction | as M1 | the checker (rated "7%/month", "14 months" correct) | `recompute_report_only` flagged `starter_ltv` 420 → 600 (t17), `starter_net_value` 920, `starter_value_with_upgrades` 1220 (t21). `step_probe_cap` capped `starter_ltv` at 2 (t25), but t24's probe on `starter_net_value@920` asked about the lifetime under another key | as M1 | as M1 |
| M3 | b37 Hollis Bay · Tyler · t6 | "**How did you get to $9?**" (his "$9.0M": scale dropped), in place of the model's correct misquote catch | 20 → `math_challenge` replacement (`se:277–298`) | Code: `probe_guard` withheld a true catch; `figureAsWritten` (`recompute.ts:158–162`) | `probe_guard` ran (withheld). Code's misquote check ran, `found: []` ("ingredients you said $0.75" vs $0.70; cause **not verified**: launch-001 has no `quoteAnchors`, and the report-only lookup row is empty too). No unit or scale check runs on code's replacement question | ran, nothing matched (misquote); no check (scale on code's own replacement) | `figureAsWritten` allows a decimal before the scale (`9(?:\.0+)?\s?(?:m\|million)`), so "$9.0M"; the misquote miss needs a look at `findMisquotes` on attributed per-input figures |

## Part 4: summary

### Counts by "why it didn't catch it" (22 data-path rows, 3a + 3b)

| Why | Count | Rows |
|---|---|---|
| ran, nothing matched: **cover** | 5 | 1, 3, 4, 5, 12 |
| ran, nothing matched: **grammar** (scope, guard, request reader) | 9 | 7, 8, 11, 13, 14, 17, 19, 21, 22 |
| ran, passed wrongly | 4 | 10 (guard verdict ignored by E1), 15 (two-year trend rule), 16 (offer gate), 20 (cover across geography) |
| not wired on this path | 1 | 6 (coverage and guard skip model-mapped asks) |
| no check of this kind | 3 | 2 (entity on a release), 9 (case order), 18 (forecast vs current) |

Math: M1, M2 not wired (step check report-only + checker gate) and no dependency tags; M3 grammar (misquote) + no check (scale on code's replacement).

### Counts by "what made the wrong call" (22 rows)

| Wrong call | Count | Rows |
|---|---|---|
| Haiku check label, after the model left the ask item-less | 14 | 1, 2, 3, 4, 5, 8, 10, 12, 13, 15, 18, 19, 21, 22 |
| Interviewer model's item mapping or `explicit` / no declaration | 6 | 6, 7, 9, 11, 14, 16 |
| Code (cover match, request reader on a code turn) | 2 | 17, 20 |

In 4 of the 14 Haiku rows code shares the blame:
- row 10: E1 releases the guard's unmet topics;
- row 13: `data_talk` withheld the model's true refusal;
- row 15: the guard's two-year rule;
- row 2: no release check on check-made releases.

### What one change would catch

- **Running `refusal_covered` on every path with today's covers: 0 of 22.**
  - Where it matters (the five false refusals) it already runs, and no cover matched.
  - Everywhere else the fault isn't a refusal of a covered item.
  - Running it on the candidate's asking sentence as well as the model's `what` catches **1** (row 12).
- **Need new covers or tags (case data):** 9.
  - Covers: rows 1, 3, 4, 5 (the four serious/false refusals); row 12 (or the candidate-sentence change); row 6 (a cover plus coverage on mapped asks).
  - Tags: row 2 (entity), row 18 (period kind), M1 and M2 (`dependsOn` on math steps).
- **Need a code rule or grammar change, no case data (deterministic):** 12.
  - 8: ONE_OFF "launch"
  - 10: a topic-unmet guard verdict means refuse, not coarse-release
  - 11: WANT cue "want is"
  - 13: BASIS word order
  - 14: CUT "source"
  - 15: trend within one year
  - 16: offer gate
  - 17: code-turn question with a ledger noun
  - 19: guard entity from proper names
  - 20: geography veto in `coverageOf`
  - 21: split of a stated figure
  - 22: TREND growth words
  - M3: `figureAsWritten` scale
- **Need semantic judgement:** row 7 (is "can we stress-test demand" a data ask?) and the Quillpath Tyler report line (gross vs net).
  - Row 9 is deterministic in principle (an order rule plus a stage-turn release), but it is a new mechanism and a product decision.
  - The Larkspur Marisol report line is deterministic in principle (claims about probes vs `checker_line` events), but no such audit exists.

### My view on the exit layer

**Recommendation:** not "extend `refusal_covered` everywhere + covers + a release-tag check" as stated. Instead: **covers with looser matching at the step that already exists, plus one release-side "answers the ask" check on every path that gives a line.** Reasons:

1. **The refusal side is already placed right; it matches badly.** Every check-made refusal is preceded by the coverage step (`td:732`), so extending `refusal_covered` adds no catches on this wave.
   - What fails is literal matching: plurals; "number of X" vs "how many X"; "departures" vs "flights".
   - It also reads the model's paraphrase in `what` instead of the candidate's words (row 12).
   - So:
     - (a) author the missing covers;
     - (b) make `coverageOf` plural-insensitive, and treat "number of / how many / count" as one;
     - (c) run it on the asking sentence as well as `what`.

   Closing the `td:256` gap (M6 on whole-ask coarse refusals) is cheap and consistent, but caught nothing here. I'd fold it in, not lead with it.
2. **Most faults are wrong answers, which a refusal veto can't see** (12 of 22 rows, plus the unasked releases). The check that sees them is the qualifier guard: 3 of 3 right. I'd turn it into the release-side gate:
   - run it on every path that releases or restates: model-mapped asks, coverage mappings, `request_group`, message detections, as well as check verdicts;
   - feed it the candidate's asking sentence as well as `what`;
   - add the grammar the wave exposed: growth / "over recent years"; trend within one year; entity from the case's proper names; geography; breakdown or "split of <figure>"; method ("how … was estimated"); "launch" as one-off;
   - make a topic or entity mismatch a refusal, not an E1 coarse release (row 10).

   **The "release-tag check" belongs inside this gate as two tags**, not as a third layer: an entity per item, derivable from labels and `sttKeyterms`; and a period kind (forecast / current) for the few forecast items. Rows 2 and 18 need them.
3. **Placement has a cost.** Running the guard on model-mapped asks puts it on 98 declarations here (vs 34 check calls), and every widening risks true answers refused.
   - `release_checked`'s one withdrawal in the wave removed the closest true answer.
   - The proposed "number of stores" cover would turn Hollis Bay Marisol t28's true refusal into a restatement.

   So each change needs the free replay against b28–b37's recorded verdicts first, with a bar on refusals of a fully answering item (0) before any paid wave.
4. **Two classes are outside any data-line check:**
   - asks never read: request-reader cues for rows 11 and 17 (deterministic); rows 7 and 9 need judgement or a case-order mechanism;
   - the math chains: `dependsOn` tags for E7. Whether the deterministic step flag may cap probes without the checker's agreement is yours to rule on.

**Confidence:** high on where each line came from and which checks ran (read from the turn records). Medium on "the smallest fix would have caught it": that is from reading code, not replay. One link is unrecorded: the message classifier's ids for Larkspur Tyler t11's detection (only its `what` is logged).

## Corrections to the B1′ / B2′ gradings (for Lorenzo's second grade)

- **Hollis Bay Marisol t8:**
  - The graded attribution "the coarse path skips the covers veto that the plain refusal path has" is true of `td:256`, but it isn't the cause.
  - The coverage step read the ask on pass 1 with the same covers and matched none.
  - The veto would have missed too.
  - The cause is the missing "number of stores" cover.
  - The same applies to the PRD §5.4 / §15 sentence "and the coarse path, which skips the covers veto". Proposed rewording, awaiting your ruling: "the coarse path's refusal, whose ask no cover matched".
- **Larkspur Tyler t12:**
  - It came through `scope_coarse` *alone*: `fixed_costs` was already out.
  - The coverage step ran.
  - The miss is the plural ("avoidable fixed costs" vs "…cost").
- **Severity labels:** you listed Quillpath Marcus t10 and Marisol t16 among the firm faults, but the B2′ grade has both as borderline. They are included (rows 16, 17) and marked.
