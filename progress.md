# Drills branch progress

## Where things stand (updated 2026-10-11) — PS-3 live — start here

Live: PS-1, HY-1, EX-1, SY-1, CL-1 (225 authored items approved; shared CaseTester database, in sync with /drill-items). D2 drills are built but off until Matt's content arrives.

Open items, in order:
1. **Matt to check every graded answer** (PS-3, HY-2, SY-2, CL-3; all Claude's, see "Who graded the D2 answers"), then approve HY-2, SY-2, CL-3, QN-5 questions, and ps3-0003 v2 / ps3-0007 v2 (model-framework fixes).
2. **Grader instability in batches (decision for Matt):** the same perfect answer can lose 15–40 points depending on which answers share its grading call (HY-2 worst: 7–11 of 41 model answers below 100% in batches of 4, different ones each run; 2 of 41 graded alone). Grading alone fixes that but shifts calibration: HY-2 update_reason falls to 74% and CL-3 specific_requests to 77% on the golden sets. Production stays at one call per set (PRD) until decided. Next step proposed: look at why those two checks change when graded alone, then re-run both modes.
3. **Next build phase:** D3 (the loop).

How Matt likes to work: plain, short explanations; he reviews items on `drill-review.html` (`npm run drills:review`, "Waiting for your review" box) and sends decisions by item ID; commit and push to `drills` when asked (GitHub push works).

## Database notes

**2026-10-07 — migrations on the shared CaseTester Supabase project (Matt's decision)**

- Drills runs on the shared CaseTester Supabase project. This replaces the earlier plan of a temporary separate project.
- The teammate is not running migrations from `main`.
- Migrations from the `drills` branch are allowed on the shared project **only if they are additive**: new tables, new enum types, new columns on drills tables. Never drop, rename or change the shape of anything `main`'s code uses.
- Before any `db:migrate`, read the new migration's SQL and confirm it is additive.
- At merge time, keep the drills migration files (0009, 0010, …) as they are; they are already applied on the shared project. Don't delete and regenerate them, or drizzle will try to create tables that already exist. If `main` has added its own migrations by then, coordinate the numbering with the teammate first.

## D2 (AI-graded drills)

**2026-10-10 — built and walked through; waiting on content**

- PS-3, HY-2, SY-2, CL-3 and QN-5 are built and pass a full browser walkthrough on the draft placeholder items (`DRILLS_PREVIEW_DRAFTS=1`), plus `npm run drills:smoke:d2` against the real database and grader.
- Not live: each drill needs reviewed questions and graded sample answers (CSV templates in `docs/drills-content-templates`), then `npm run drills:import`, `npm run drills:golden` (agreement gate) and `npm run db:seed-drill-items`.
- Grader prompt is `drills-grader-v3`. v3 fixed the grader joining quotes from different parts of an answer with commas, which failed the exact-quote check and marked good answers wrong; the one re-ask now says which quotes weren't found (the same request at temperature 0 gave the same quotes back).
- Known weak spot: a quote can be very short (SY-2 "cites numbers" passed on the quote "5"). Worth watching in the golden runs.
- A draft item can't be updated in the database once any attempt has used it. Delete the test attempts first, or bump the item's version.

## D1 content: review round 1 (Matt, Oct 9)

**2026-10-10 — all five pools revised; ready for the second review**

- New wording checks in `lib/drills/content-checks.ts`: length (right answer longest or shortest in at most 30% of a pool, down from 50%), phrase (a phrase, opening or ending that is almost only in right or only in wrong options), and a rule player (a leave-one-out solver that learns wording patterns and never reads the case; max 40%, chance is 25%). The seed script refuses a pool that fails any of them, the tests check them, and `npm run drills:review` shows each pool's results at the top of its section.
- Rule-player scores before → after: PS-1 88% → 31%, HY-1 100% → 23%, EX-1 75% → 33%, SY-1 100% → 35%, CL-1 100% → 35%.
- Every item rewritten per the six shared rules, plus the item-level fixes in the review. PS-1 now has 45 items (5 new Tier 3: ps1-0041 to 0045); 0036 and 0038 replaced with realistic generic mistakes. EX-1 0036 replaced. HY-1 `extras.distractor_flaws` dropped (unused and would go stale).
- Worked examples marked: ps1-0011, hy1-0015, ex1-0012, sy1-0026, cl1-0029. A draft may now be marked as the example; the "must be reviewed" rule applies once it goes live.
- Tag choices to confirm in review: SY-1 wrong options that are confident and numerical but ignore the deciding fact use `M.unsupported_recommendation` (no closer tag exists); EX-1 subtle misreads use `M.misread_trend` (EX-1 may only use its three takeaway tags).
- The rule player can be tuned in `content-checks.ts` (`RULE_PLAYER_MAX`, phrase thresholds). Getting SY-1 and CL-1 under 40% took several wording passes, so expect new items to need the same.

## D1 content: review round 2 (Matt, Oct 10)

**2026-10-10 — PS-1, HY-1, EX-1, SY-1 and CL-1 are live**

- All 205 Level 1 items approved and live (`status: live`, reviewed by Matthew Santos on 2026-10-10), including the 14 edited items. Worked examples unchanged: ps1-0011, hy1-0015, ex1-0012, sy1-0026, cl1-0029. The five drills are `live: true` in `drills.v1.json`.
- Similarity check built (`npm run drills:similarity`, Opus 5.5): all 210 authored items passed, none flagged (about $1.29). Validation now keeps an authored item off `live` until it is reviewed and `passed`; generated items are `not_applicable`. Flagged items go back to `in_review` for Matt.
- New mistake tags in taxonomy v1: `M.ignores_deciding_fact` (SY.evidence; 33 SY-1 options retagged), `M.low_priority_next_step` (CL.next_step; 28 CL-1 options retagged), and `M.irrelevant_driver` (QN.sizing_structure) for QN-5 cards that don't belong.
- QN-5 driver cards now need `role` = `driver`, `double_count` or `not_a_driver`; a wrong structure is tagged by the card the student picked. Every range, including the total, needs a source or a written derivation.
- Explanations: HY-1 states what the data shows, the likely cause and the test that would confirm or overturn it; SY-1 models the full answer (recommendation, numbers, risk, next step) and what would change it.
- SY-2's example case is now a pharmacy-counter case, not SY-1's Canada case. Rule in the templates README: don't reuse a case across drills.
- `scripts/drills-smoke.ts` now handles authored items. Its submit-race check was wrong: either key may win the race, and it had assumed one always does.
- Tier 3 batch drafted (drafts, awaiting Matt's review): ps1-0046–0050, hy1-0041–0045, ex1-0041–0045. All passed the similarity check; wording checks still pass. Tier 3 counts now PS-1 11, HY-1 12, EX-1 11.

## Database decision reconfirmed (2026-10-10)

- Matt asked whether drills had been on a temporary drills project; it has been on the shared CaseTester project since the Oct 7 decision. Matt chose to keep it there.
- Re-synced: all 225 authored items (205 live, 20 drafts) match the files. `db:seed-drill-items` now updates the authorship record (reviewer, similarity check) in place, since it's review metadata, not content.

## SY-1 punctuation fix (2026-10-10)

- Matt found the right answer was the only option with a colon in 29 of 30 SY-1 recommendation items (the rule player ignored punctuation). All 120 recommendation options are now two plain sentences, no colons or semicolons; 30 SY-1 items and 3 PS-1 items are version 2, re-checked for similarity, seeded, and older versions retired.
- Wording checks now count punctuation and shape (colon, semicolon, dash, brackets, sentence count, final period) and include an odd-one-out check (right answer is the only option with or without a feature). The old SY-1 text scores 50% on the rule player and 29/29 on odd-one-out.
- Tier 3 batch approved and live (ps1-0049 retiered to 2; hy1-0042 question now says "after a 10% fare increase").
- Rule-player maximum: Matt asked for 33%. At 33%, PS-1 (36%), EX-1 (39%) and SY-1 (35%) fail; the code stays at 40% until those pools are fixed, since a failing pool blocks seeding.

## Originality fixes (2026-10-10)

- SY-2 example replaced (trampoline parks hosting school field trips); the pharmacy-counter case matched Oliver Wyman's Supermarket Pharmacy practice case.
- 23 CL-1 items and sy1-0011 reused another drill's scenario; each keeps its reasoning in a new industry with new numbers. Also changed for the same reason: cl1-0007 ($12M synergies), ex1-0018 (plan figures), ps1-0019 (76%→84%), ps1-0040 (self-storage). 27 new versions, seeded, older versions retired.
- New cross-drill scenario check (`scenarioOverlaps` in content-checks); 19 checked pairs recorded in `drill-items/scenario-reviewed.json` with reasons.
- Similarity check now searches the web by default and records `similarity_method`. It flagged the pharmacy case once search was on. **The full rerun stopped: the Anthropic API credit ran out.** All items still show "passed" from the knowledge-only check; none has `similarity_method: web`. After topping up credit, run `npm run drills:similarity` (about $30); it picks up every item not yet web-checked. `drills:smoke:d2` and `drills:golden` also need credit.

## Targeted web similarity check (2026-10-11)

- API credit works again (a test call succeeded; the key's organization wasn't checked, since that check was blocked).
- Matt decided against the full $30 web run: the manual review already compared all 225 items from memory and web-searched the 22 most distinctive scenarios. Only the 28 items rewritten after that review (the 27 originality-fix versions plus the trampoline-park SY-2 example) were web-checked: all passed, none flagged (about $3.40). The other ~197 items stay `similarity_method: knowledge` by choice. Rerun the full check only if Matt wants every item web-checked before a wider launch.
- Database synced (28 authorship records updated).

## Rule-player maximum lowered to 33% (2026-10-11)

- `RULE_PLAYER_MAX` is 0.33 (Matt's request); the HY-1 test now uses the constant.
- Scores before → after: PS-1 34% → 28%, EX-1 39% → 28%, SY-1 35% → 25% (CL-1 28%, HY-1 22% unchanged).
- 11 items reworded, one option each (two in none), as new draft versions; current live versions stay live until Matt approves. Main real tell removed: EX-1 right answers were the only ones with a semicolon (4 of 4); now none have one. Other edits are small word changes the rule player was keying on (e.g. "comes after the decision" in PS-1, "hold 70%" in SY-1).
- All 11 passed the web similarity check (~$0.92); seeded as drafts (11 inserted).
- Remaining patterns the rule player doesn't fully catch but a student might: PS-1 "Bucket 3 doesn't belong" and "both fixed and variable" overlaps are almost always wrong; EX-1 wrong options often state "the most/largest" or a cause the chart can't show. Worth watching when writing new items.
- Scratch diagnostic approach (not committed): score rewordings in memory with `rulePlayer` before editing files.
- Matt kept both SY-2 scenario pairs (`example-sy2-01` with `sy1-0028` and `cl1-0021`) as recorded. PRD "Wording checks" updated to 33% with Matt's go-ahead.
- Matt approved all 11 reworded items: live, older versions retired (11 retired in the database).
- `drills:smoke:d2` passed again with credit restored (PS-3, HY-2, SY-2, CL-3, QN-5 all 100%; outage retry path OK).

## Tag severity decided (2026-10-11)

- Matt approved the first pass with `M.premature_solution` and `M.implication_off_objective` moved to major: 35 major, 30 minor, now in `taxonomy.v1.json`; the schema no longer allows `null`. Reasons in `docs/drills-tag-severity.md` (renamed from the draft).
- Taxonomy values are defaults. The case grader may downgrade a finding to minor (self-corrected, or didn't change the conclusion) and upgrade `M.waited_for_interviewer` to major in candidate-led cases; the finding carries the final severity. Grader changes are still deferred, so nothing enforces this yet.
- PRD "Prescription rules" updated: tags counted once per case; max 2 prescriptions per skill area. The third-slot fallback (next-highest skill in another area, else only 2) was my suggestion, approved by Matt.

## D2 content: PS-3 pilot (2026-10-11)

- Matt asked Claude to create the D2 content; chose "Claude drafts, Matt checks every grade" (the golden set is the gate's ground truth, so Claude-only grades would mostly test Claude agreeing with Claude) and a one-drill pilot first.
- `docs/drills-content/` holds the filled CSVs (templates in `docs/drills-content-templates` stay clean). Imported to `drill-items/PS-3/ps3-0001…0010.json` (drafts, `drafting_model: claude-opus-5-5`) and `drill-golden/PS-3/ps3-00xx-a.json`.
- 10 cases, tiers 1–3 (3/4/3), 10 case types, none reusing a Level 1 case: tire shops (profitability), Spanish olive oil in US supermarkets, law-firm non-salary costs, digital textbook pricing, hardware-store growth, dairy co-op buying a cheese maker, blood-donation visit time, city traffic deaths, Gulf Coast marinas, online data-science master's. One scenario pair recorded as reviewed (ex1-0037 call center / ps3-0007 blood center: shared words only).
- Graded answers: 5 normal, 2 borderline, 1 short, 1 off_topic, 1 injection; judgment calls explained in `notes`.
- Golden preview (`drills:golden -- --drill PS-3`, $0.03; gate needs 30 answers): cover 96%, concrete 91%, no_overlap 91%, case_specific 64%, red flag 70%. Disagreements listed in open item 2, plus judgment calls on 0002-a cover_4 / no_overlap and 0005-a cover_5.

## PS-3 pilot feedback applied (2026-10-11)

- Matt's rules: one critical must-cover area per question (missing it caps at 60%, code reads it off the cover check via `extras.critical_check`); off-topic red flag (AI, cap 20%, tag `M.irrelevant_bucket`); "no overlap" passes only with 3+ buckets that have sub-points (code gate in `codeChecks`); `generic_profit_tree` → `generic_framework` (any memorized framework not adapted to the case, every case type; on profitability, revenue/cost buckets flag only with generic sub-points); generic words alone don't cover an area; case-specificity judged on heading + sub-points (ps3-0009-a passes); ps3-0005 accepts traffic × basket × margin by customer type.
- `docs/drills-grading-guide.md`: 13 PS-3 rules with examples. Rules 1–9 are sent to the grader (`PS3_GRADING_RULES`, `<grading_rules>` block); a test keeps the guide and code word for word. Grader prompt `drills-grader-v4`.
- Templates: `critical` column in ps3-must-cover; `red_flag_generic_framework` and `red_flag_off_topic` in ps3-graded-answers; README points to the guide.
- Golden preview after: all checks 91–100% (11 answers). Remaining disagreements: 0004-a cover_5 and 0010-a cover_3 (grader ignores rules 3/4 there), 0006-a case_specific (grader passes the injection bucket).
- Found and fixed: grader skipped three checks on the injection answer in a batch of 4 (every run), which would fail a whole set; rule 9 reworded to "still answer every check". Importer now keeps a draft's review record when its case and model answer are unchanged (re-import had been resetting similarity results).
- PRD PS-3 section updated with Matt's go-ahead (caps, no-overlap rule, generic framework flag, critical area, grading rules; JSON example now `generic_framework`).

## PS-3 full batch (2026-10-11)

- Matt approved the pilot, the critical-area picks, and applying the rules to HY-2, SY-2 and CL-3.
- ps3-0011–0040 written: tiers overall 12/16/12, all 14 case types; 20 more graded answers (totals: 16 normal, 5 borderline, 3 short, 3 off_topic, 3 injection). Generator script kept in the session scratchpad only; the CSVs in `docs/drills-content/` are the source.
- Originality: ps3-0026 first drafted as an orchestra growing ticket and donation revenue; web similarity flagged a McKinsey-attributed "Metropolitan Symphony" case, so it was replaced with a hot-sauce maker tripling revenue. The orchestra had also tripped the scenario check against ps1-0049 (museum, 20%). All 40 pass now.
- First full gate run failed (case_specific and concrete 87%). Fixes: code backstop for rule 9 (grader-flagged injection fails case_specific and concrete_subpoints, `PS3_INJECTION_FAILS`); rule 6 now says a case heading with generic sub-points passes; the generic-framework definition says standard headings with case sub-points are adapted. `drills:golden` now measures final verdicts via `applyGrade` (AI plus code rules). Grader `drills-grader-v5`. After: case_specific 94%, concrete 97%, cover 95%, no_overlap 94%, generic flag 94%, off-topic 100%.
- Still disagreeing (for Matt to judge): the grader flags adapted SWOT / entry lists as generic (0019-a, 0029-a) and gives area credit for generic words (0012-a, 0013-a, 0022-a); 0013-a concrete_subpoints ("salaries; benefits") is a rule 7 edge case.

## PS-3 live (2026-10-11)

- Matt approved all 40 questions and the 30 graded answers. Items live (author and reviewer Matthew Santos, 2026-10-11), `PS-3` `live: true`, seeded (40 updated). Config test now expects PS-3 live; `hasLiveLevel2Drill('PS.mece')` is true.
- `drills:smoke:d2` answers every item in a set (PS-3 sets now have 4 items) and answers PS-3 questions with their own model framework; passes.

## HY-2 content (2026-10-11)

- 40 questions (hy2-0001–0040, tiers 12/16/12, all 14 case types), each new fact supporting one family and ruling out another; 30 graded answers (17 normal, 4 borderline, 3 short, 3 off_topic, 3 injection). All 40 passed web similarity. Drafts, awaiting Matt's review.
- PS-3 rules carried over: off-topic red flag (stage 1 capped at 20%, `M.no_hypothesis`); HY-2 grading rules 1–8 sent to the grader and in the guide (generic causes and ratio re-statements aren't directional; "analyze the data" isn't testable; a fix isn't an update reason). Critical element = the update decision (already 25%, code-scored), so no extra cap.
- Scenario check: hy2-0023 rewritten (was a minor-league hockey team, too close to ps3-0014) as a ballet company; hy2-0040 lost its "private equity" detail; 3 word-only pairs recorded.
- Grader fixes found by the gate: family names echoed with their description are mapped back (`familyName`) — this was mis-scoring the live update decision; the evidence-based check asks for the student's words, not the question's; a batch that keeps coming back incomplete is regraded one answer at a time. Grader `drills-grader-v6`.
- Gate: all HY-2 checks ≥90% (evidence_based exactly 90%, 28/31). PS-3 re-run unchanged.
- Importer: unchanged live items are skipped quietly.

## SY-2 content (2026-10-11)

- 30 questions (sy2-0001–0030, tiers 9/12/9, all 14 case types) and 30 graded answers (16 normal, 5 borderline, 3 short, 3 off_topic, 3 injection). All 30 passed web similarity; 17 word-only scenario pairs recorded. Drafts, awaiting Matt.
- Carry-over: each question marks one deciding fact (`deciding` column in sy2-facts, exactly one, relevant); `misses_deciding_fact` red flag caps at 60% (`M.ignores_deciding_fact`); off-topic caps at 20%; SY-2 grading rules 1–9 sent to the grader and in the guide.
- Rule change to flag to Matt: "2–3 reasons" is now counted as distinct relevant fact-sheet facts used as support, 2 or more passing (the fuzzy "reason" count failed the gate; PRD says 2–3).
- Open question for Matt: no SY-2 check tests whether the recommendation is one of the acceptable ones (sy2-0007-a picks the weaker option and passes every check).
- Grader fixes: red flags can judge the whole answer (`evidence: 'whole'`, optional so live PS-3 items are unchanged), since a flag about something missing has no quote to verify; recommendation-first must quote the first sentence (code); quote helpers moved to pure `grading/quotes.ts`. Grader `drills-grader-v7`.
- Gates: SY-2 all ≥90% (reasons 90%), HY-2 all ≥94%, PS-3 all ≥94%.

## CL-3 and QN-5 content (2026-10-11)

- CL-3: 40 questions (tiers 12/16/12), each with one critical driver (`critical` column; missing it caps at 60%, code via `extras.critical_check`); off-topic flag (20%); CL-3 rules 1–9 to the grader and in the guide; 30 graded answers. All 40 passed similarity; gate passed first run.
- QN-5: 30 sizing questions (tiers 9/12/9), 6–8 cards each, one with two accepted sets (qn5-0012). Totals and walkthroughs generated from driver central values (range = central ÷2 to ×2). Named sources are from memory: flag for checking.
- Smoke test answers every D2 question from its own key (model answers; QN-5 accepted cards, mid-range values and their product); passes on all five drills.
- Final gates (grader v7): PS-3, HY-2, SY-2, CL-3 all checks ≥90%.

## Matt's decisions on D2 (2026-10-11)

- SY-2 reasons approved: two or more distinct relevant fact-sheet facts pass.
- SY-2 correctness: new `wrong_recommendation` red flag (cap 50%, `M.unsupported_recommendation`); the key may list two acceptable recommendations separated by `|` (added to sy2-0008, 0011, 0021, 0025, 0028). Off-topic answers aren't also flagged for position (code, `SY2_OFF_TOPIC_SUPPRESSES`). With only 2 wrong examples the check was untested, so 3 wrong-recommendation answers were added (sy2-0002-b, 0016-b, 0030-b); the grader missed 2 of 5 until the flag was reworded as "Present when the answer recommends a different action…". SY-2 gate: all ≥91% on 34 answers. Grader `drills-grader-v8`.
- QN-5: no named source unless looked up (with link). All 33 named-source figures reworded as reasoning; template example and README updated.
- PRD HY-2, SY-2 and CL-3 sections updated with Matt's go-ahead.

## Who graded the D2 answers (asked by Matt, 2026-10-11)

- Claude wrote and graded all 123 golden answers (PS-3 30, HY-2 30, SY-2 33, CL-3 30); Matt chose "Claude drafts, Matt checks every grade" but has not yet checked them grade by grade (PS-3 was approved as a whole).
- Labels Claude changed after seeing grader disagreements (each to match a written rule, but after the fact): PS-3 none after the rules were set; HY-2 update_reason on 0008-a, 0023-a, 0036-a (Y→N, rule 5 then extended); SY-2 two_to_three_reasons on 0013-a and 0029-a (N→Y, after the reasons rule changed); CL-3 specific_requests on 0029-a (N→Y, note had contradicted the grade).

## Model answers must score 100% (2026-10-11)

- Matt asked which PS-3 question's model framework scored 88%, and for a test that every model framework scores 100% against its key.
- `lib/drills/model-answers.ts` turns an item's key into an answer (shared by the smoke test). `tests/drills/model-answers.test.ts`: all 185 D2 items score 100% on everything code settles (QN-5 fully), plus a check that the test catches a bad model. `npm run drills:models` (paid, ~$0.45) grades every AI-graded model answer with the real grader.
- Found: ps3-0003 (law firm; fifth bucket "How spending is approved" not in the key, overlaps outside services) and ps3-0007 (blood center; "peaks" in two buckets). Fixed as v2 drafts (v1 stays live). Importer now keeps a draft's version number. 17 HY-2/SY-2/CL-3 draft model answers fixed (missing CL-3 drivers, stage 1 not using a given fact, two causes with no lead, hy2-0035 decision contradicting its own family, hy2-0032 reason not saying what the fact means); all re-passed similarity.
- QN-5 ranges per Matt: bananas 25–100, electricity 13–22¢. qn5-0022 means the world (card and prompt both say so); looked up Cirium Oct 2024 (26,100 aircraft of 30+ seats in service incl. some freighters) and set 22,000–27,000 with the link.
- `--batch N` option on drills:models and drills:golden for the batching experiment.
