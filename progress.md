# Drills branch progress

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
