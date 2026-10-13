# Drills branch progress

## Start here (updated 2026-10-11)

**Status.** All 15 MVP drills are live: ten at Level 1 (PS-1, HY-1, EX-1, SY-1, CL-1, plus generated QN-1, QN-3, QN-4, EX-2, EX-3) and the five D2 drills (PS-3, HY-2, SY-2, CL-3, QN-5). Phases D0–D2 are done. Database (shared CaseTester Supabase project) is in sync with `/drill-items`.

**PRD v2 is merged** into `docs/prd-drills.md` (2026-10-11, committed). The repo copy is the source of truth. v2 adds the training program, skill tree, Repair drills, Defend step, Practiced state and transfer checks, and renumbers the phases (D3 loop, D4 training program, D5 chains and Defend, D6 pilot).

**D3 started 2026-10-11** (Matt's go-ahead). The pilot launches after D3 and D4; D5 ships during the pilot.

**D3 is done and committed (2026-10-11).** Gate: `tests/drills/progress.test.ts` (scripted scenarios) and `npm run drills:smoke:d3`. Screenshots of "Your skills" and the results screen (desktop and phone) sent to Matt.

**D4 is built** (committed and pushed). The D4 gate's scripted students pass (`drills:smoke:d4` Standard, `drills:smoke:tracks` Foundations and Sprint, `drills:smoke:diagnostic`). Matt: hold off on the next phase (D6) for now. Waiting on his lesson review (`/drills/review/lessons`, then `npm run db:seed-lessons`), which is the gate's last item. Screenshots in `~/Desktop/drills-d4-screenshots/`.

**D5 pilot: Matt's sixth review applied and committed (2026-10-12).** Matt said he'll approve the 30 SY-2 and 8 SY-1 drafts to go live once fixes 1 (sy1-0003 sheet) and 2 (exact key figures) are done: both done, plus the rule 2 clarification he hasn't seen. Watch: the SY-2 reasons check sits at 91% (3 misses in 34); flag it if it drops below 90% when human-written answers arrive. Earlier: **D5 pilot: Matt's fifth review applied and committed.** Waiting on Matt's review of the revised SY-1 drafts (`docs/drills-content/sy1-drafts-review.csv`), SY-3 (`sy3-*.csv`), the four SY-2 fact swaps and sy2-0024. Before that: **D5 pilot: Matt's second review applied and committed (2026-10-12).** Waiting on Matt to review the pilot content as one batch: the D5 CSVs in `docs/drills-content/`, the 40 Construct items with follow-ups, cl3-0030/0033's added facts, and 8 SY-1 new versions (sy1-0001, 0003, 0010, 0011, 0013, 0016, 0028, 0029). Then the full content batch. Earlier: **D5 is built and its content pilot is waiting on Matt (2026-10-11).** Engineering is complete and switched off: PS-4, HY-3, SY-3 are `live: false`, and each Construct drill's `defend.live` is false. Pilot content (Matt chose "pilot first"): 30 Repair items (10 per drill), follow-ups on 40 Construct items (10 per drill, as new draft versions), 91 graded answers. Next: Matt reviews the pilot CSVs in `docs/drills-content/` (`ps4-*`, `hy3-*`, `sy3-*`, `defend*`), the labels and the open calls in the D5 history entry; then the full batch (PS-4 +30, HY-3 +30, SY-3 +20, follow-ups for the other 110 items, golden sets to 30+ per gate), then switch live. Screenshots in `~/Desktop/drills-d5-screenshots/`.

**What's left to build** (docs/prd-drills.md, "Build phases"):
- D4 Training program: built. Only the lesson review is left: Matt approves or requests changes on `/drills/review/lessons` (local dev server), then `npm run db:seed-lessons`. Checked 2026-10-11: all 22 lessons still `status: draft` with no review notes; typecheck, tests (1258 passed) and lint pass.
- D6 Pilot launch (after D3 and D4): analytics, WCAG audit, club pilot.
- D5 Chains and Defend: built; pilot content awaiting Matt (see the D5 history entry). Left: Matt's pilot review, the full content batch, golden sets to 30+ per gate at ≥90%, then `live: true` on PS-4/HY-3/SY-3 and `defend.live: true` on PS-3/HY-2/SY-2/CL-3.
- All schema changes must stay additive (new tables, enum values, columns).
- Code vs PRD gap: the daily cap is 20 AI-graded sets (`AI_SETS_PER_DAY` in `lib/drills/sets/service.ts`); v2 says 150 AI-graded answers a day. Change when building that part.
- Merging `drills` into `main`: coordinate migration numbering with the teammate (see Database notes). Drills migrations now run 0009–0012.

**How the AI-graded drills work** (details in the history below):
- Content source: CSVs in `docs/drills-content/` (templates and README in `docs/drills-content-templates/`). `npm run drills:import -- docs/drills-content` writes `/drill-items` (questions) and `/drill-golden` (graded sample answers). Edit the CSVs, not the JSON, for drafts; a live item needs a new version (edit the JSON, bump `version`, status draft; Matt approves).
- Grading: `lib/drills/grading/grader.ts`, Haiku 4.5, temperature 0, prompt version `drills-grader-v19`. One call per answer, all under the neutral label "answer", so a score never depends on other answers or position. HY-2 also makes a stage-1-only call to classify the hypothesis family. Code settles what it can (`lib/drills/grading/apply.ts`): caps, the PS-3 no-overlap gate, injection backstop, critical area/driver caps, SY-2 first-sentence and fact-sheet-number checks.
- Grading rules: `docs/drills-grading-guide.md`. The rules marked (grader) are sent to the grader word for word from `PS3/HY2/SY2/CL3_GRADING_RULES` in `lib/drills/checklists.ts`; a test keeps them identical. When a grade needs a call no rule covers, add a rule first.
- All 123 graded sample answers were written by Claude and reviewed by Matt (his label changes are applied).

**Checks to run after any content or grader change** (all paid, need API credit):
- `npm run drills:similarity -- <ids>` for new or changed questions (~$0.12 each; changed prompts/model answers reset the result).
- `npm run drills:golden -- --drill <ID>`: agreement gate, every check ≥90% (~$0.12–0.20 per drill).
- `npm run drills:models -- --runs 3`: every model answer must score 100% with no change between runs (~$1.80).
- `npm run drills:smoke:d2`: end to end against the real database (cents).
- `npm run drills:smoke:d3`: the loop end to end against the real database (free; no AI calls).
- `npm run drills:smoke:d5`: Repair sets, the 14-day rule and Defend sets end to end (preview drafts, about $0.05).
- `npm run drills:golden -- --part defend` runs only the follow-up gates; `npm run drills:models -- --d5` only the Repair and follow-up model answers.
- Free: `npm run typecheck`, `npm test` (includes the model-answer unit test and the cross-drill scenario check), `npm run lint`, then `npm run db:seed-drill-items`.

**Gotchas:**
- Changing the stored shape of an answer key breaks grading for items already in the database until re-seeded (live items need new versions).
- Each grader-wording change shifts a few borderline answers; re-run the gates and `drills:models`.
- Never name a source for a QN-5 figure unless it has been looked up (add the link); otherwise write it as reasoning.
- One case, one drill: the scenario check (`scenarioOverlaps`) flags shared scenarios across all drills; record genuine non-overlaps in `drill-items/scenario-reviewed.json` with a reason.
- API credit must be in the Anthropic organization that owns the key in `.env.local`. Never read or print the key.

**Golden labels follow the written rules, never grader output** (Matt, 2026-10-12). After a golden run, report disagreements and propose rule changes; when a rule changes, recheck every label and list each change. Edit the graded-answer CSVs directly (the 2026-10-11 scratch generator scripts once overwrote CSV relabels; they are deleted).

**How Matt likes to work:** plain, short explanations; reviews content as CSVs in Numbers (`docs/drills-content/`) and sends decisions by item ID; wants judgment calls flagged, not made silently; commit and push to `drills` only when asked.

## Database notes

**2026-10-07 — migrations on the shared CaseTester Supabase project (Matt's decision)**

- Drills runs on the shared CaseTester Supabase project. This replaces the earlier plan of a temporary separate project.
- The teammate is not running migrations from `main`.
- Migrations from the `drills` branch are allowed on the shared project **only if they are additive**: new tables, new enum types, new columns on drills tables. Never drop, rename or change the shape of anything `main`'s code uses.
- Before any `db:migrate`, read the new migration's SQL and confirm it is additive.
- At merge time, keep the drills migration files (0009, 0010, …) as they are; they are already applied on the shared project. Don't delete and regenerate them, or drizzle will try to create tables that already exist. If `main` has added its own migrations by then, coordinate the numbering with the teammate first.

# History (oldest first)

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

## One grading call per answer (2026-10-11)

- Matt: a score must never depend on other answers; switch to one call per answer; PRD updated (grading call, cost controls, drill scoring lines, overview). `gradeSet` grades each answer in its own call, in parallel; the batch-incomplete fallback is gone. Grader runs at temperature 0 (confirmed). Prompt versions v9 (mode) → v11 (wording below).
- ps3-0003 v2 and ps3-0007 v2 approved and live (v1 retired). QN-5 ranges approved.
- Checks that fell when graded alone: HY-2 update_reason (grader wanted an explicit conclusion) and CL-3 specific_requests (grader counted the driver breakdown as vague requests). Check questions and rules now say a short conclusion counts / the breakdown isn't a request, with examples. CL-3 specific_requests 77% → 90%; HY-2 update_reason 74% → 87% (see open item 1). HY-2 rule 6 now says: classify stage 1 only; several causes with no lead is "other"; first of "or" causes is the lead; family back to 94%.
- Gates in the new mode: PS-3, SY-2, CL-3 pass (all ≥90%); HY-2 passes except update_reason 87%.
- `drills:models --runs N` reports model answers whose score changes between runs.

## Consistency and neutral labels (2026-10-11)

- Grader runs at temperature 0 (confirmed in `anthropicCaller`). Every model answer graded 3 times on v11 and on v12: no score changed between runs on either (on v10, 2 of 154 had: hy2-0016, hy2-0030, both fixed).
- Every grading call now labels the answer "answer" (was the item id in scripts and a1–a4 by position in production): the label alone shifted hy2-0015's grade, so position and ids no longer reach the grader. Grader `drills-grader-v12`.
- 18 more draft model answers rewritten (HY-2 stage 2 conclusions, CL-3 breakdown phrasing, etc.), all re-passed similarity.
- Gates on v12: PS-3 passes (all ≥90%); HY-2, SY-2, CL-3 not yet run (credit).

## Credit restored; all gates pass on grader v13 (2026-10-11)

- HY-2 update_reason fell to 81% on v12; its check and rule 5 now list three shapes of conclusion that count (names the cause, says what the fact does to the mechanism, says whether it supports the hypothesis). → 90% on v13; the only misses are the three flagged labels.
- Gates on v13: PS-3, HY-2, SY-2, CL-3 all checks ≥90%. Smoke passes (every drill 100% on its model answers).
- 5 more draft model answers fixed (hy2-0005, hy2-0027, cl3-0005, cl3-0019, cl3-0040), re-passed similarity.
- Final `drills:models --runs 3` on v13: all 154 model answers score 100%, no score changed between runs ($1.73).

## Matt's review of HY-2, SY-2, CL-3 applied (2026-10-11)

- CL-3: up to two critical (starting) drivers; cap only when an answer covers neither (`extras.critical_checks`). cl3-0011, 0017, 0034 accept a second start; cl3-0026 (marketing spend doubled) and cl3-0027 (volume and staffing unchanged) got a pointing fact. Rule 4: a reason can come before the starting point.
- SY-2: sy2-0024 cost is $3M a year; sy2-0016 has 600,000 yearly online orders (75,000 unfilled ≈ $1.1M lost > $800k saved); 17 joke irrelevant facts replaced with plausible non-deciding ones. Rule 3 and the check: mentioning an irrelevant fact only to dismiss it is fine.
- HY-2: families accept several actions (`drop|revise` in the CSV, `actions` in the item): hy2-0007 Poor service and hy2-0028 Unhappy with the buyer drop or revise; hy2-0015 price family keep or revise. Grader reports `backup_family`; revise is right when the student's own backup is in a family the fact supports. Family never null for HY-2; a bare label still names a mechanism.
- Grades changed per Matt: hy2-0017-a evidence N, cl3-0021-a reason Y, sy2-0004-a leaves-out Y. hy2-0015-a and hy2-0027-a decisions now pass (verified).
- Cross-drill duplicate check, Level 1 + Level 2: 400 questions, 26 flagged pairs (13 across levels), all reviewed and recorded, none open; no identical question text.
- Gates on drills-grader-v16: PS-3, HY-2, SY-2, CL-3 all ≥90%. All model answers score 100% with no change across three runs. Smoke passes.
- Lesson: changing the stored shape of a key (`action` → `actions`) breaks grading for items already in the database until they are re-seeded (the smoke caught a job failing on stale HY-2 drafts). For live items, a key-format change needs a re-seed or new versions.
- PRD HY-2, SY-2, CL-3 sections updated to match.

## Last fixes (2026-10-11)

- Matt: hy2-0017-a evidence Y; hy2-0006-a and hy2-0017-a update_reason N; hy2-0020-a left to Claude: passes (rule 5 now says a misread conclusion counts, since the decision check catches the wrong update, so the mistake counts once).
- sy2-0017 and sy2-0030 "irrelevant" facts were relevant; replaced (app rating 4.7 stars; lockers open 24 hours).
- CL-3 two-driver cap confirmed by a test on cl3-0011: covering either driver avoids the cap, neither caps at 60%.
- Found: the grader let stage 2 leak into the stage 1 family (hy2-0015, hy2-0036), which would mark students who revise correctly as wrong. HY-2's family is now classified in a separate call that sees only the opening facts, the families, the grading rules and stage 1 (`buildFamilyBlock`). HY-2 grading now takes two calls per answer (~$0.006 per answer). PRD HY-2 section says so. Grader `drills-grader-v19`.
- Final: all four gates pass (HY-2 family 97%, update_reason 97%); all model answers 100% with no change across three runs; smoke passes.

## D2 drills live (2026-10-11)

- Matt approved HY-2 (40), SY-2 (30), CL-3 (40) and QN-5 (30): live, reviewed by Matthew Santos; drills switched on in `drills.v1.json`; config test expects all 15 live drills. Seeded (140 updated). Smoke passes on the live drills.
- Matt: don't start D3 until he says so.

## PRD v2 merged (2026-10-11)

- Matt sent a v2 PRD (training program, tracks, diagnostic, lessons, workouts, skill tree, Repair drills, Defend step, Practiced state, transfer checks). It was based on an older PRD copy, so the merge keeps the current PS-3, HY-2, SY-2 and CL-3 sections (Defend added), the three content-review tags, and the build details from earlier revisions (QN-5 card roles, EX-2 tags, QN-3 trap order, percent modes, wording/similarity/scenario checks, real table names and `/api` paths, 3-level rubric payload, prescription fallback, desktop-first, no-Level-1 skills rule, full-size reviews for small sets).
- Matt's decisions: test-out at tier 2 (with Defend once it ships); grading stays at set completion, one call per answer (switch to per-submission only if results p95 > 10 s); the "half human-written golden answers" rule doesn't apply (removed); pilot with the current 40–50 item Level 1 pools, grow to 80 before wider launch using item-health data; store the browser time zone at signup (workouts and Monday summary use it); Browse cases belongs to the case product, drills only exposes the suggested case; set size by tier in `drills.v1.json`; taxonomy stays `v1`; skill tree approved; mastery bar stays 80% on two sets in a row for the pilot.
- Rubric: the case grader uses 3 levels (needs_work / meets_bar / strong), not 1–5, so Matt's "no dimension below 3, average 3.5+" needs restating. Left open in the PRD.
- New endpoint paths chosen to match existing ones (`/api/drills/onboarding`, `/program`, `/workouts/today`, `/catalog`, `/suggested-next`, `/progress/summary`, `/lessons/...`). Browse drills sets reuse the `specific` source.
- Follow-ups (Matt): keep all the kept build details; rubric bar = no needs_work and at least half strong; 14 case types confirmed; D5 moves into the pilot (until it ships, no Defend and no Repair stage). Golden answers question skipped for now.

## D3 the loop (2026-10-11)

- Matt's go-ahead; PRD v2 committed first (`8cb205b`). Pilot launches after D3 and D4; D5 ships during the pilot (until then: no Defend, no Repair stage).
- Config: skill tree as `prerequisites` on each skill (cycle check at boot), `M.dodged_question` and `M.inconsistent_defense` (CL.pushback, minor; 67 tags), `skill_drills` gains a `repair` slot (all null until D5), new `stages` / `transfer` / `stuck` rule blocks. The 14 case types live in `lib/case-types.ts`, enforced on drill items, the case payload, the importer and (optional) `caseType` on case files.
- Migration 0012 (additive, applied): enum values `practiced`, `paused`, `diagnostic`/`plan` sources; `skill_states` stage, practiced_at, transfer_due_at, low_streak, repair_sets, paused_for_prereq, prereq_sets, next_focus_tag; `drill_sets` stage, is_transfer_check; `prescriptions` stage.
- Pure engine `lib/drills/progress/engine.ts` (states, stage moves, test-out, transfer checks, reviews, stuck rule, credit down, in-drill prescriptions, `nextSetFor`) and `case.ts` (prescription rules 1–6, case state updates). `store.ts` runs them inside `finalizeSet`'s transaction and in case ingestion (`ingest.ts`, idempotent). `startSet` takes `prescription_id`. New: `/drills/profile` page, `GET /api/skills/profile`, `PATCH /api/prescriptions/{id}`, results show skill changes.
- Judgment calls to flag to Matt:
  - Case types: `main` has no list; the shared list is drill content's 14.
  - A new case supersedes case and diagnostic prescriptions, plus any prescription for a skill it re-prescribes; in-drill and plan prescriptions stay open.
  - Test-out tier is max(student's tier on that drill, 2).
  - Transfer checks avoid case types from the last 3 sets on that drill (items have no `industry` yet).
  - Tie-break "lower state" uses the state after the case.
  - Prescription reasons are generic ("…quote". That's a {tag}; this set practices {skill}.); per-tag lines come with lessons.
  - Tier 1 sets neither extend nor break a streak.
  - Multi-skill drills move every skill they score: the QN-4 smoke run took QN.arithmetic and QN.magnitude to Practiced alongside QN.setup.
  - A single miss from another skill creates an in-drill prescription (per PRD; may be noisy).
- PRD needs (not edited, needs Matt's go-ahead): `skill_states` extra columns (low_streak, repair_sets, prereq_sets, next_focus_tag) in the data model; the case-type list location; the supersede rule above.
- Fixed the D1 smoke (it had broken when the D2 drills went live: it tried to answer PS-3 like a choice drill) and made the D1/D2 smokes clean up progress rows. Deleted progress rows left by tonight's smoke runs (4 throwaway students, no profiles or sets).

## D3 review applied (2026-10-11)

- Matt: only a drill's primary skills change state. `drills.v1.json` skills are now `{ id, primary }`; the loader exposes `skills` and `primary_skills`. Secondary: QN-4 (QN.arithmetic, QN.magnitude), QN-5 and EX-3 (QN.arithmetic). Boot fails if a drill has no primary skill, a skill is primary nowhere, or `skill_drills` points at a drill where the skill is only secondary.
- Matt: cross-skill prescriptions use the case weighting (major +2, minor +1 by default severity); prescribe at 2+ in a set.
- Matt approved the shared 14 case types (he'll tell the case-product owner); the only case file, `prof-001`, validates on both branches (it has no caseType yet). #2, #5, #6 agreed as built. `industry` on items is part of D4 content work.
- PRD updated with Matt's go-ahead: primary skills, cross-skill weighting, supersede rule, extra `skill_states` columns, case-type list location.
- Browser check: headless Chrome driven over the DevTools protocol (no new dependency; script kept in the session scratchpad only), with a throwaway Supabase user signed in by password, then deleted. Screenshots in `~/Desktop/drills-d3-screenshots/`. No console errors; no horizontal scroll at 390 px. The tab title is still the Next.js default "Create Next App" (app-wide, not drills).

## D4 started (2026-10-11)

- Migration 0013 (additive, applied): `program_track` / `program_status` / `workout_status` enums; `student_programs` (one active per student), `workouts` (one per student per local date), `lessons`, `lesson_views`; `student_profiles.timezone`; `drill_sets` workout_id, slot; `drill_items` stage, industry.
- `programs.v1.json` (4th config file, cross-checked at boot): assignment thresholds, availability (3/4/6 workouts), workout target minutes and mix, per-track start rules and case targets, the seven weeks with focus areas/skills and milestones, the Sprint days, plan priorities.
- Plan engine: weeks run from the day after Week 0, 7 days each (not Monday-aligned). Compression keeps Weeks 5 and 6 and splits weeks 1–4 evenly into the weeks between; merged weeks join themes, focus and milestones and take the higher case target. Beyond 6 weeks, Readiness repeats. Sprint: day 1, days 2–5 (repeated or cut short), days 6, 7.
- Workout builder fills slots by priority (weak spots, a due transfer check, review, other unfamiliar material) and shows them review → weak → unfamiliar. Transfer-due skills skip the weak slot. Week 5's tier 3 applies to weak-spot skills already Practiced. Foundations: new skills start at Recognize tier 1; Construct waits for prerequisites at Recognizes. Sprint: tier 2+, no Recognize; review-only on days 6–7 and within 2 days of the interview.
- Questions sent to Matt: diagnostic structure (one short set per drill?), lesson review format, industry list and how to tag 400 items, the case-type → skill-area map, where the time zone is captured, and the judgment calls above.

## D4 continued (2026-10-11)

- Matt approved the four D4 calls (7-day blocks, tier 3 only for Practiced skills, weak spots chosen before review, higher case target when weeks merge) and answered: diagnostic = 9 short sets as one flow ("Part 3 of 9"), no per-item feedback, no state changes, placement from finished parts, resumable; lessons = one markdown file each plus a review page that renders them as students see them, with approve / request-changes buttons; industries = his 12 + "Other"; case-type map = draft for his review; time zone = captured silently in drills onboarding. He gives the "Create Next App" title to the case-product owner.
- `prof-001` now has `caseType: "profitability"`.
- Single case: `pickNextCase` relaxes area, then tier, then offers a retake of the case taken longest ago; no cases → no card. Week targets count completed `sessions` (case results only arrive once the grader sends them), so retakes count. Starting a case from drills isn't possible yet: `POST /api/session` needs the club code each time, so the card links to the case page. Flag for the case-product owner.
- Draft `docs/drills-case-type-map.md` (QN 5, PS 3, SY 2, HY 2, EX 2), not in config until approved.
- Program store (`lib/drills/program/store.ts`): onboarding (stores time zone, assigns track), `changeProgram` (rebuilds from today; interview within 14 days switches plan tracks to Sprint; self-directed only offered), today's workout built once per local date (Week 0 and Sprint day 1 have none), plan prescriptions (`createPlanPrescription`, moves Not started → Learning), workout progress on set completion, weekly targets and milestones, week-rollover event (`student_programs.current_week`, migration 0014), next case.
- Sets: `workout_id` + `block` starts a planned block (tier and size from the block; unfamiliar and transfer sets avoid recent case types and industries); `quick_start` lets the engine pick for a skill. Results show "Continue workout" for workout sets.
- Pages: `/drills/start` (onboarding), `/drills` (plan home or self-directed home with suggested next, weaknesses, progress, due now, Sprint offer, Monday recap), `/drills/settings`, `/drills/browse` (the old picker, to be redesigned).
- Industry tagging (`npm run drills:industry`, Opus 5.5, low effort): `docs/drills-content/industry-tags.csv`. Second run after fixing my inputs (exhibits and explanations weren't sent) and adding placement rules: 405 items, 126 unsure, 50 sampled, 54 name no industry (no tag; they don't constrain transfer). Total cost $4.69 for both runs. Placement rules to confirm with Matt (restaurants → Hospitality, consumer-product makers → CPG, services that fit nothing → Other). Items unchanged until he reviews.

## D4: Matt's decisions, diagnostic, Learn library (2026-10-11)

- Matt: a retake can't move a skill to Validated (it can still log findings, drop a skill, and count toward weekly targets). Built: `applyCase(..., retake)`; ingestion marks a retake when the student finished the same case before (an earlier case result, or a completed session more than 10 minutes earlier).
- Industries: no new category; Matt's 11 corrections applied from his reviewed CSV (now `docs/drills-content/industry-tags.csv`). `industry` is on every authored item JSON (null for 54 that name no client), in the item schema, and in `drill_items.industry`; it's review metadata (seed updates it in place; the importer ignores it and keeps it). `npm run drills:industry` now tags only untagged items, with Matt's placement rules in its prompt.
- Case-type map approved (M&A and new product launch → BJ, cost reduction → QN, operations → PS) and in config; boot fails if a type is missing. `docs/drills-case-type-map.md` updated.
- Matt: check with him before any paid script run over $5 (saved to memory).
- Diagnostic: it's 10 parts, not 9 (PS-1, HY-1, EX-1, SY-1, CL-1, QN-1, QN-3, EX-2, PS-3, SY-2; 22 auto-checked items + 2 written). `diagnostics` table (migration 0015); `programs.v1.json` `diagnostic` block; rules in `lib/drills/program/diagnostic.ts`, database in `diagnostic-store.ts`. One flow ("Part n of 10"), no per-item feedback (the runner skips the feedback screen and returns to /drills/diagnostic), no tier or state changes from its sets. Placement is redone as each part finishes (skills with 2+ items or checks, Not started or Learning with no practice yet): <50% Recognize T1, 50–79% Recognize T2 (no Repair drills yet), 80%+ the Construct test-out. "Stop for now" / "I'll take a case first" skip it; starting again resumes the same diagnostic. On completion: up to 3 diagnostic prescriptions (+1 per distinct tag, 2 per area), `diagnostic_completed`, and a Standard student assigned at onboarding (never switched) who scores <50% moves to Foundations. `npm run drills:smoke:diagnostic` (about $0.01).
- Lessons: one markdown file per skill in `/lessons` (front matter + five sections), parsed and checked by `lib/drills/lessons.ts` (≤400 words, one line per mistake tag of the skill, reviewer for live). `npm run db:seed-lessons` (live content needs a new version). Student pages `/drills/learn` and `/drills/learn/[skill]` (Try it starts the skill's next set, or the workout block that opened it; views logged with time open). Entry points: home Learn link, drill intro "Read the 3-min lesson", results offer after a set below 50%, Foundations auto-open before a skill's first set. Review page `/drills/review/lessons` (local development only) renders lessons as students see them, with Approve / Request changes, which write into the lesson file. 22 drafts written (165–287 words), seeded as drafts; students see them only once approved (local preview with DRILLS_PREVIEW_DRAFTS=1).
- Self-directed "moved up" now counts only moves to Recognizes or higher (diagnostic placement listed every skill as "→ Learning").
- PRD updated with Matt's go-ahead: retake rule; industries list and rules; case-type map; diagnostic as 10 resumable parts with placement, prescriptions and the Foundations switch (with the results-screen message); lessons as files with a review page; weekly case targets count completed case sessions; `diagnostics` table and `student_programs.current_week`.
- Matt: when the diagnostic moves a student to Foundations, the diagnostic results say so ("Based on your diagnostic, we've started you on Foundations. You can switch to Standard anytime in settings."), while they are still on Foundations. `diagnostics.moved_to_track` (migration 0016, applied).
- `docs/drills-content/lessons-review.md`: all 22 lessons in one file for Matt's first read (`npm run drills:lessons-doc` regenerates it). He approves on the review page.

## D4: Browse drills and the track gate (2026-10-11)

- Browse drills redesigned (`/drills/browse`, `GET /api/drills/catalog`, `lib/drills/program/catalog.ts`): areas → skills with state, Suggested badge (open prescription), lesson link, Quick start (`quick_start`), and "Pick a drill and tier" listing live drills by stage with allowed tiers (`lib/drills/program/tiers.ts`: up to one above the current tier, tier 1 or 2 the first time; the server refuses others with `tier_not_allowed`). The old skill picker component is gone. `drill_catalog_viewed` and `drill_set_started` with `browse` / `suggested` are logged.
- `suggestion_started` (Suggested next card) and `next_case_card_clicked` (the card now goes through `GET /api/drills/next-case`, which logs and redirects to the case page) are logged.
- Found and fixed: a plan student with no weak spots yet (e.g. Sprint day 2 after skipping the diagnostic and the baseline case, or Standard weeks 4–6 with no prescriptions) got an empty workout that the home showed as "Workout done". It now explains that workouts come from weak spots and links to the diagnostic and Browse drills. Added to the PRD with Matt's go-ahead.
- `npm run drills:smoke:tracks` (free): Foundations (0 cases → Foundations, 3 workouts a week, no case in week 1, day 2 plan prescription MECE structure at PS-1 Recognize tier 1) and Sprint (10 days → Sprint, day order 1,2,3,4,5,2,3,4,6,7, no workout on day 1, empty day-2 workout without weak spots, 15-minute tier 2+ case-day workout after a case result).

## D5 Chains and Defend (2026-10-11)

- Matt: build D5, content as a pilot first; Repair items get the web similarity check.
- Config: Repair drills PS-4, HY-3, SY-3 (P0) and EX-5 (P1) with `stage: "repair"` (stored as level 2, since they take written answers); drills get `stage` (defaults from level), `defend` {type, live, set_size per tier}; rules get `repair.derived_exclusion_days` (14) and `defend` (tiers 2+, 25%, 40 words, 60/45 s); `skill_drills.repair` filled. Catalog is 29 drills (CL-4 was never configured).
- Defend runs as extra steps on the item (`lib/drills/defend.ts` withDefend), reusing HY-2's stage clocks and pending steps. Whether a set runs it is fixed at start (`ItemRef.defend`): tier 2+, not the diagnostic, drill's `defend.live` (or preview). Main answer scales to 75%; a Challenge splits its 25% into decision 40% (code, from `valid`) and reason 60%. The follow-up text reaches the client only after the main answer (StepFeedback.followup); the main answer stays visible read-only. "Skip follow-up" skips only the follow-up (M.skipped). The reply is graded in its own call (`buildDefendBlock`); Defend checks count toward the item's skills and CL.pushback. Migration 0017 (additive, applied): `drill_attempts` defend_response, defend_time_ms, defend_score, defend_check_results.
- Repair: prefilled editor, tier hint (T1 names the flaw, T2 "one flaw", T3 "one or two"), intro says how much is told. Checks: fix each flaw 50%, no new flaw 30% (the grader names the new flaw's kind via a separate output schema, so Construct calls are unchanged), keeps right parts 20%. Unchanged answers score 0 by code with the planted tags and no AI call. The no-new-flaw and keeps-right checks count toward all the drill's skills (otherwise PS.depth could never leave Repair). 14-day rule in `planAuthoredSet`.
- Grader `drills-grader-v23`; the system prompt and output schema for PS-3/HY-2/SY-2/CL-3 main answers are byte-identical to v19, so their gates stand.
- Content importer: `ps4/hy3/sy3-questions`, `-flaws`, `-graded-answers`, `defend.csv`, `defend-graded-answers.csv` (templates and README updated). A reviewed item that only gains a follow-up becomes a new draft version keeping its similarity result; key order is kept so review diffs are small.
- Pilot: PS-4 ps4-0001–0010 (from PS-1; ps4-0008 has two flaws), HY-3 hy3-0001–0010 (from HY-1; hy3-0010 two flaws), SY-3 sy3-0001–0010 (from SY-1; sy3-0010 two flaws). Follow-ups: ps3-0001–0010, hy2-0013/14/16/17/18/29/30/31/33/34, cl3-0013/14/15/16/18/29–33, sy2-0010–0014 and 0022–0026 (challenges: 0010, 0012, 0014, 0023, 0026 valid; the rest not). All seeded as drafts. Similarity (web): 30 Repair items passed ($3.29).
- Pilot gates (v23, 15–20 answers per Repair drill, 8–10 per follow-up type): SY-3 100/100/95%; PS-4 fix 83%, no new flaw 87%, keeps right 87%; HY-3 86/80/85%; follow-ups 10 of 11 checks ≥90% (CL-3 evidence 88%). All 70 D5 model answers score 100% with no change across two runs. Smokes D1–D5 pass. Paid runs this session: about $6 in total, no single run over $5.
- Rules added after the previews (to confirm with Matt): fix descriptions are examples; planted or reworded flaws aren't new; a dropped right part counts only against keeps-right; "judge each check on its own"; HY-3 vague cause is fixed by a specific cause data could check (no test needed); Defend "answers" means picking one thing; Defend reason "tied to the case" (fact, number, or the case's metric or decision); vague replies fail consistency; after Update the reply must say specifically what changes.
- Code backstops (judgment calls; PRD says injections are "graded normally"): Repair injection fails no-new-flaw and keeps-right; a Defend injection fails every follow-up check.
- Labels changed after seeing grader output: injection answers ps4-0002-b, hy3-0006-b, sy3-0004-b, ps3-0006-d2, cl3-0029-d2, hy2-0030-d2, sy2-0026-d2 (to the backstops); hy3-0004-b fix N→Y; hy2-0014-d2, hy2-0030-d1, sy2-0023-d2 consistent Y→N; cl3-0016-d2 evidence Y→N→Y; hy3-0009-b now borderline.
- Other judgment calls to flag: 14-day rule falls back to items whose source was seen longest ago if fewer than 3 remain (`repair_pool_exhausted`); `defend_submitted` is logged at grading (to carry the score); a timed-out main answer skips the follow-up (as HY-2 stage 2); a student's first Repair set still moves a skill Not started → Learning ("first set completed"), though the PRD says Repair sets never change states; SY-1 has no "unsupported" distractor, so sy3-0003 uses an irrelevant-fact distractor tagged unsupported; follow-up text isn't similarity-checked separately (the case is unchanged).
- Fixed on the way (found in the browser check): results page crashed for a skipped item with a fixed-choice step (HY-2 too, since D2); skipped AI-graded items now show the model answer instead of an empty "Correct answer"; lesson link said "mece structure"; item time on results ignored the main answer when a follow-up ran.
- PRD needs (not edited, needs Matt's go-ahead): Repair drills' level/`stage` in config; `defend` and `repair` config blocks; Repair key as `extras.flaws` [{tag, hint, fix}] + `right_parts` (PRD says `flaw_tags`); Defend checks stored on every item; the rule changes, backstops and judgment calls above; `repair_pool_exhausted` event.

## D5 pilot review applied (2026-10-12)

- Matt reviewed the pilot (content strong). Asked for the five post-preview labels with before/after (sent; awaiting his confirmation): cl3-0016-d2 evidence Y→N→Y→N (now N under his rule); hy2-0014-d2 and hy2-0030-d1 consistent Y→N (vague replies); sy2-0023-d2 consistent Y→N (vague update); hy3-0004-b fix N→Y (vague cause fixed by a specific one).
- Rules (grader `drills-grader-v24`): Defend evidence must use a case fact that supports the choice (Justify rule 3; Challenge rule 12 "supports the decision, right or not", also counting facts the challenge brings); one slip counts once, under keeps-right (Repair rule 3); a right part is kept if its substance is still used (rule 4; keeps-right question now "keep the substance of each part").
- Injection (point 10): what was built failed checks whenever the grader flagged an injection (PS-3 two checks, Repair two, Defend all). Now `lib/drills/grading/injection.ts` matches text that clearly addresses the grader; only a match fails those checks by code. A grader-only suspicion is graded normally and flagged `injection_review`. All 20 golden injection answers match; no other golden answer or model answer does ("Health system:" in ps3-0032 forced anchoring `SYSTEM:` to a line or sentence start). PRD says "graded normally": needs updating.
- Relabels from rechecking every D5 label against the changed rules: ps4-0008-c, hy3-0003-b, hy3-0007-b, sy3-0008-b no_new N→Y (rule 3); sy3-0009-b keeps N→Y (rule 4); ps3-0001-d2, ps3-0003-d2, cl3-0016-d2 evidence Y→N (rule 3).
- Content: Challenges rewritten so valid/invalid isn't predictable (insiders 3 valid/2 not, outsiders 2/3; new number 2/2, none 3/3); valid insider ones point out a flaw in the reasoning (one-time payout counted as recurring, an average hiding the mix, a promotion credited to price matching), invalid ones include true but non-decisive facts. New content check `challengeCueProblems` (speaker from the opening "X says"; "Our …" = insider; new number = not in the prompt; pool ≥8). sy2-0010 payout $600,000 → $900,000 normal profit, 7.5 years, ~$11.2M. Every challenge number checked: on the sheet or question, brought by the challenge, or worked out. SY-3: all ten irrelevant facts replaced with tempting ones (flawed answers and golden answers updated); SY-1 sources still have logos and office moves. T1 hints lowercase. Model Defend replies ≤30 words (PRD open question on 45 s at T3 stays open).
- Similarity: 10 SY-3 items and hy3-0009 re-checked, passed ($1.16).
- Previews on v24 (report only): SY-3 95/95/90%; follow-ups 9 of 11 ≥90%; PS-4 fix 94%, keeps-right 87%, no-new-flaw 67%; HY-3 86/90/75%. The grader doesn't apply "one slip counts once" (it fails no-new-flaw on all four answers relabeled under rule 3) and still counts some planted flaws as new. Options sent to Matt. Model answers: 70 of 72 at 100%; cl3-0030 and cl3-0033 replies fail the case-fact check because those cases state no facts beyond the question (question to Matt).
- Smokes D2 and D5 pass; typecheck, 1363 tests, lint pass. Paid runs today about $3.

## D5 pilot: Matt's second review (2026-10-12)

- Matt confirmed cl3-0016-d2, sy2-0023-d2, hy3-0004-b. hy2-0014-d2 and hy2-0030-d1 consistent back to Y: a vague follow-up fails only the content checks (HY-2 data and drop-result; Justify answer and reason), not consistency. Rule wording updated (HY-2 rule 9, Justify rule 4); every Defend label rechecked, no others affected.
- One slip counts once is enforced in code (`applyGrade`): when keeps-right fails, no-new-flaw passes, except for unchanged answers and high-confidence injections. Relabeled ps4-0004-b and sy3-0002-b no-new-flaw N→Y (leniency accepted by Matt). Scripted check: no Repair answer outside the three injections fails both.
- cl3-0030 and cl3-0033 got one case fact each (draft v2; "60% sales growth, never profitable"; "most home chargers are installed within a month of buying an EV"); their model replies cite it. The follow-up's premise doesn't count as a case fact.
- SY-1: the 8 items with logos or office moves are new draft versions with tempting irrelevant facts (the same ones SY-3 now uses where they share a source), their irrelevant-fact options and `extras.irrelevant_facts` updated. Batched with the D5 content for Matt's review; live versions keep serving.
- Similarity (web) on those 10 items: passed ($1.16). Grader `drills-grader-v25`. All 72 D5 model answers score 100%. Previews (report only): SY-3 95/95/95%; HY-3 keeps 100%, no-new 90%, fix 82%; PS-4 80–87%; follow-ups 8 of 11 checks ≥90%.
- PRD updated with Matt's go-ahead: injection handling, evidence that supports the choice, one slip counts once, substance counts as kept, planted flaws aren't new, vague replies count once, Challenge authoring and the Challenge cue check, and the standing rule that labels follow written rules, never grader output.
- CSV vs imported golden files: 91 D5 answers compared on labels, answer type and notes, 0 differences.

## D5 pilot: Matt's third review (2026-10-12)

- sy2-0024: founder's claim now 500 new studios (20,500 × 20% = 4,100 × $720 ≈ $2.95M, below the $3M cost); reason and model reply updated.
- Padding replaced where it failed Matt's partner test ("interesting, but doesn't change the answer"), in the SY-1 item and its SY-3 item: sy1-0003/sy3-0004 $1.2M of ovens in 2022; sy1-0013/sy3-0010 bought in 2015 for $150M (its SY-1 wrong option is now the sunk-cost trap); sy1-0016/sy3-0007 about 12,000 monthly customers; sy1-0011/sy3-0005 land under the main garage bought for $1.7M in 1998 ("paid $2M … largest" tripped the scenario check against cl1-0027, sy2-0006, sy2-0021); sy1-0029 $1M call-center renovation; sy3-0006 the plant manager has run the factory for 20 years. Awards varied out: sy1-0001 Canada's 40 million people; sy1-0028/sy3-0003 about 2 million burgers a month.
- Item fixes: sy1-0011 right answer's feedback (no "cause of the decline"); sy1-0013 right answer adds "for break-even at best"; sy1-0029 "about 7 points or fewer", "satisfaction cost" in both feedbacks.
- New content check `paddingTypeProblems`: each SY item's irrelevant fact is typed in `drill-items/padding-types.json` (review metadata; 9 types); a drill pool of 10+ fails if one type is over 30%, or if a tag doesn't match the item. To pass, four SY-2 neutral numbers were swapped (sy2-0001 founder trained as a dental surgeon, new draft v2; sy2-0011 head chef trained in Paris; sy2-0012 building bought for $1.2M in 2016; sy2-0014 $2M of signage in 2022; no golden answer referred to them). Pools now: SY-1 max 20% (history), SY-2 29% (neutral numbers), SY-3 30% (neutral numbers, sunk costs).
- Partner test and padding types added to the templates README and the PRD (Authored items).
- Similarity (web): 17 changed items passed ($1.99). Model answers: all D5 and all SY-2 at 100%. SY-2 main gate still ≥90% on every check; SY-3 95/95/95%.
- Review sheet for the 8 SY-1 drafts: `docs/drills-content/sy1-drafts-review.csv` (generated from the JSON; not imported).

## D5 pilot: Matt's fourth review (2026-10-12)

- sy3-0010: the flawed answer now uses the sunk cost as a reason ("$50M at least recovers a third of the $150M we paid in 2015"); hint reworded; sy3-0010-b updated; sy3-0010-a's stale "Paris gone" note fixed.
- SY-2 padding replaced on 12 items under the partner test (offices 0025, 0027; ratings 0005, 0017, 0020; trivia 0001, 0011, 0013, 0015, 0018, 0023; 0030 lockers): 7 sunk costs (3 with a year), 4 outside-market facts, 1 founder. Live items 0005, 0015, 0017, 0018, 0020, 0027, 0030 are new draft versions. SY-2 types now max 29% (neutral numbers and sunk costs, 9 each).
- Dates: years added to relevant facts (SY-1 drafts 0001, 0003, 0013, 0016, 0028; SY-2 0011, 0013, 0020, 0023, 0025), sy1-0011 and sy1-0029 sunk costs written without a year. New check `datedFactProblems`: in each SY pool, at least 30% of facts with a year are relevant (now SY-1 5/14, SY-2 6/11, SY-3 4/6) and at most half the sunk costs carry a year (SY-1 2/4, SY-2 4/9). README and PRD updated.
- sy2-0027-a (off-topic golden answer) rewritten around the new padding; my first rewrite dropped its beyond-the-sheet claim, so its N on consistent_with_facts no longer fit. Restored the claim ("our auditors will flag") instead of changing the label.
- Similarity (web): 24 changed items passed ($2.91). All D5 and SY-2 model answers 100%. SY-3 gate 95/95/95%. SY-2 main gate: all checks ≥90% except consistent_with_facts 88% (30/34): sy2-0016-b and sy2-0018-a human Y, grader N; sy2-0020-a and sy2-0027-a human N, grader Y. Labels follow the rules; not changed.

## D5 pilot: Matt's fifth review (2026-10-12)

- sy2-0018-a: replayed the grading call 3 times (fails each time; the grader returns no reason for a whole-answer check), then asked the same model to explain: it claims the 15-month payback is wrong ($1.5M ÷ $1.2M a year is 15 months). Sent to Matt; label and answer untouched.
- SY-2 consistency fixed at the cause: every SY-2 item has `key_figures` (new `sy2-questions.csv` column, `extras.key_figures`), sent to the grader in a `<key_figures>` block marked "only to check the numbers the answer states; not reasons" (without that note, the reasons check fell to 88%). Check and rule 4 reworded: stated numbers match the sheet or key figures within 10%, no claim beyond the sheet, and the recommendation's correctness isn't judged. Grader `drills-grader-v26` (first change to SY-2's main call since v19). All 30 SY-2 items are new draft versions (12 more bumped from live).
- Rechecked all 34 SY-2 labels against the new wording: one change, sy2-0030-b consistent N→Y (its numbers match the sheet; the store-locker plan is the wrong-recommendation flag's job). Guide examples added (sy2-0016-b, sy2-0030-b, sy2-0018-a).
- SY-2 gate on v26: every check ≥91% (consistent_with_facts 94%, two_to_three_reasons 91%). All SY-2 and D5 model answers 100%.
- Padding swaps: sy2-0025 founder → "Diabetes affects about 1 in 10 US adults" (outside context); sy2-0030 parcel growth → "first 50 lockers in train stations in 2016" (history).
- Stale durations: sy1-0003 and sy3-0004 now say "since 2023" where they said "in three years". New check `staleDurationProblems`: a relevant dated fact restated as elapsed time ("in/for/over the past N years", "N years ago", sharing a word with the fact, N within a year of the time since) fails; spans ("a 5-year payback") and forecasts ("the next five years") don't. Checked against the current year, so re-run each January. README and PRD updated.
- Similarity: 4 changed items passed ($0.48). Smokes D2 (one unexplained run with 3 failures, then three clean runs) and D5 pass; 1371 tests.

## D5 pilot: Matt's sixth review (2026-10-12)

- sy1-0003: the item JSON had the "since 2023" fix; the review sheet was a stale hand-made copy from round 4. The sheet is now generated (`npm run drills:review-sheet`, `lib/drills/review-sheet.ts`), and a test in `authored.test.ts` fails when it no longer matches the drafts. The date check had caught sy1-0003 (it flagged the item before the fix).
- SY-2 key figures are exact values with their working (no "≈"; sy2-0024 shortfall $120,000; sy2-0012 premium 7.53%, Matt's "7.5%" was rounded). Tolerance: 10% of the exact value, or 1 percentage point for a percentage (rule 4, the check, the key-figures note, README, PRD). Rechecked all 34 SY-2 labels: no change. Grader `drills-grader-v27`, then `v28` (below).
- The reasons check fell to 88% again on that prompt change (it moves with unrelated edits: 91, 88, 91, 88). Its misses were answers with another fault (wrong recommendation: sy2-0007-a, sy2-0016-b; injection: sy2-0016-a; misstated fact: sy2-0023-a), the same bleed Matt fixed for consistency. Added to SY-2 rule 2: count reasons even if the recommendation is wrong, another fact is misstated, or the answer addresses the grader. No labels changed. Gate on v28: every SY-2 check ≥91%; all SY-2 model answers 100%. Needs Matt's sign-off.
- Flaky D2 e2e, cause found: the outage-path test reuses the student, whose first SY-2 set (100%) moves them to tier 2, where Defend runs (preview drafts). The smoke answered only main steps, so an item with a follow-up was left unfinished and its attempt never saved. When that item came first, the set had no attempts, the simulated broken grading run had nothing to grade and returned "succeeded" without calling the grader, and three checks failed. Verified directly (8 of 10 tier 2 SY-2 sets plan a follow-up; a broken run with no saved attempts returns "succeeded"). Fixed the smoke: it answers follow-ups and asserts every item was finished. Reproduced on the first of six D5→D2 pairs before the fix; 9 D2 runs passed after. Not a product bug (real sets reach grading only when every item is answered). D3, D4 and tracks smokes only run QN-4, so unaffected.
- Every smoke script imports `scripts/smoke-log.ts`: on a failed run it saves all output, time and commit to `logs/drills-smoke/` (git-ignored). The D2 smoke's "still grading" failure now includes the grading jobs' status and error.

