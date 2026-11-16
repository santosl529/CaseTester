# Case results → drills: what changes in the case product

For Lorenzo's review (Matt's request, 15 Nov 2026). Branch `drill-update`. Nothing is merged. The AI interviewer is not touched: nothing changes in how a case runs.

## In this branch now (steps 1–2)

1. **Grading gets one more step at the end** (`lib/scoring/case-result-step.ts`, called from `lib/scoring/score-session.ts`).
   - After every other pass, one AI call (Sonnet 5.5 with thinking) labels each "needs work" point with a skill from the drills list.
   - It reads the report and changes nothing in it: the ratings, quotes and report text are the same.
   - It runs inside the existing one-at-a-time scoring claim, so it's paid once per case: about $0.04 a case, logged as `llm_usage` with component `skill_tags`.
   - It adds a few seconds to grading. With under 45 s left of the 300 s budget, it skips itself.
   - Off by default (`CASE_TO_DRILLS` unset). Never on a dry run (regrade, replay), never for the 7-minute demo.
   - If it fails, the report still saves.
2. **After the score is saved**, grading records the result for drills (`lib/drills/progress/case-runs.ts`).
   - In shadow mode it only writes the drills table below.
   - When on, it also sends the result to drills.
   - Wrapped so a drills failure can't fail grading.
3. **Database: migration 0029** (`db/migrations/0029_case_result_runs.sql`), additive only.
   - A new table, `case_result_runs`: one row per graded case, keyed by session id, deleted with the session. RLS on, no client access.
   - Four new columns on the drills table `case_results`: `retake`, `partial`, `backfilled`, `next_steps`.
   - No change to `sessions`, `scores` or any other case table.
4. **Case files**: the existing optional `caseType` field added to Larkspur (profitability), Hollis Bay (new product launch), Quillpath (pricing) and Aldermoor (market entry).
   - Only drills reads it; the interviewer, the scoring passes and the voice code don't.
5. **Two environment variables**, both checked at boot (a bad value refuses to start, like `ENGINE_SWITCHES`):
   - `CASE_TO_DRILLS`: off (default), shadow or on.
   - `CASE_TAG_DRILL_GROUPS`: which report groups may give drill recommendations. Unset means the 7 that passed Matt's gate.
6. **Account deletion** also deletes a student's `case_result_runs` rows.

## What Lorenzo is asked for

- Review of the changes above.
- Apply migration 0029 (after the branch is approved), then set `CASE_TO_DRILLS=shadow` in Vercel to start the shadow period. Matt reads 20 real reports, or two weeks pass, before anyone sets `on`.

## Still to come (later steps; listed when built)

- The report page gets two sections: a comparison with the last case at the same level, after Top improvement, and "Your next steps" before the survey and the transcript. Both read only.
- A one-time backfill script copying the ratings of past completed cases into `case_results`. It reads `sessions` and `scores`, writes only drills tables, and runs only with Lorenzo's go.
