# Case results → drills: what changes in the case product

For Lorenzo's review (Matt's request, 15 Nov 2026). Branch `drill-update`. Nothing is merged. The AI interviewer is not touched: nothing changes in how a case runs.

## In this branch now (steps 1–2)

1. **Grading gets one more step at the end** (`lib/scoring/case-result-step.ts`, called from `lib/scoring/score-session.ts`).
   - One AI call (Sonnet 5.5 with thinking) labels each "needs work" point with a skill from the drills list.
   - It reads the report and changes nothing in it: the ratings, quotes and report text are the same.
   - It runs after the score is stored and the response sent (Next's `after()`, as drill grading does), so the student's report doesn't wait for it. Only the pass that holds the scoring claim reaches it, so it's paid once per case: about $0.04, logged as `llm_usage` with component `skill_tags`.
   - Work after the response still counts against the score route's 300 s, so the step's deadline is 285 s from the start of grading (`CASE_STEP_DEADLINE_MS` in `score-session.ts`). With under 45 s left it records a failure instead of starting (the report then offers Try again), and it stops 5 s before its deadline. Over the last 60 cases grading took 159 s at the median, 190 s at the 90th percentile and 216 s at most. Until 16 Nov the deadline was the 240 s scoring budget, which skipped the step after any grading over 195 s (3 of those 60, and both live gradings in Claude's end-to-end test).
   - Gathering its input is guarded on its own: if that ever threw, the case gets no case result and the report is unaffected.
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

## Visible with the switch off

- Today's "Next case" card can suggest a different case than before: the picker matches a case's type to the skill area being practiced, and four more cases now have a type. Intended (proposal §2.8), but it is a change.
- Drills events and rows carry taxonomy version `v1.1` instead of `v1` (a new case-only tag). Nothing reads the version back.
- A bug fix (Matt, 15 Nov): the Next case card could recommend the 7-minute demo or the unlisted Aldermoor case, because it read every case file. It now picks only listed, full cases (`caseLibrary()`, tested).
- Prescription reasons in plain English (Matt, 15–16 Nov): one line per mistake tag (the taxonomy's `reason_line`), the line first, then the student's quote, e.g. "You made an arithmetic slip. In your last case you said, “…”". This fixes "showed a arithmetic error", live on main in drill-set reasons. Diagnostic reasons are one sentence with the top mistake.
- Right after the deploy (approved by Matt, 16 Nov): `npx tsx --conditions=react-server --env-file=.env.local scripts/drills-rewrite-reasons.ts --apply` rewrites the reasons on open prescriptions. Today's workout keeps the old text for the rest of the day. The dry run on 16 Nov found 3 open, 2 to rewrite (both diagnostic).
- Otherwise nothing: no drills page, report or interview changes.

## Pre-pilot audit fixes in this branch (Matt, 17 Nov)

Matt's fixes from the pre-pilot audit, on this branch so they ship with shadow mode. Each is its own commit, named by its audit number. The interviewer itself is untouched. Changes to the case product:

- **M1, the Next case link** (`app/api/drills/next-case/route.ts`, `lib/cases/listed.ts` `nextCaseHref`, `app/home/page.tsx`, `components/case-list.tsx`). Today's Next case card linked to `/start/<case>`, which only serves the 7-minute demo, so every listed case was a 404 (live on main today). It now opens Cases at `/home?case=<id>#cases`; Cases reads `?case=` and marks that card "Recommended for you" (instead of "Good first case" on that card). Cases still has the voice or text choice and the daily limit.
- **M2, reopening an interview** (`app/case/[sessionId]/page.tsx` and `/voice/page.tsx`, `lib/site/case-history*.ts`, `components/chat-window.tsx`, `components/voice-room.tsx`, `components/views/case.tsx`). The text interview page read only the first interviewer turn, so a refresh or a reopened tab showed just the case prompt and lost the exhibits. Both pages now load every stored turn and every exhibit shown (`session_turns`, `exhibits_shown`; read only) and show them: the chat for text; for voice, an "Earlier in this interview" block above the live captions (an exhibit already shown isn't shown twice). Nothing new reaches the browser that the student hadn't already seen. No change to the turn route, scoring or the voice agent. The interview pages now also have an `<h1>` ("Case interview — text/voice"; same look).
- **S3, the Feedback button** on Cases, the report (all three of its states), Account (floating, as on the drills pages) and in the text and voice interview headers (a link beside Report a problem, so on a phone it never covers the text box). It posts to the drills feedback route as before, with the page.
- **S5, sign-up** (`app/api/sign-up/route.ts`, `components/sign-up-form.tsx`, `components/site/*`). The landing page's "Take the free diagnostic" goes to sign-up (it went to log-in), and the public top bar has Sign up beside Log in. With no email confirmation (no `RESEND_API_KEY`), the sign-up route logs the new student in (`signInWithPassword` on the server client) and the form goes straight on; if that log-in fails, they're sent to log in as before. With confirmation on (production), nothing changes except the message: "Check your email to confirm your account; the link logs you in." (Matt's wording).
- **N2, forgot password** (`app/api/password/forgot/route.ts`). An email with no account now gets the same answer as one with an account ("If an account uses this email, we've sent a link to reset your password."), and nothing is sent. This reverses your 11 Nov ruling (said plainly), at Matt's request; he'll tell you. **Resend confirmation** (`app/api/sign-up/resend/route.ts`) follows suit (Matt, 17 Nov): no account, or one already confirmed, gets the same 200 as a sent link and "If an account uses this email and isn't confirmed yet, we've sent a new confirmation link." Nothing is sent for those, as before. Still telling: sign-up with an email already in use answers "An account with this email already exists" (409 `email_exists`) — Matt to rule.
- **N3**: the Cases header no longer says "about 20 minutes".
- **N4, "Log in" / "Log out" everywhere**: the account menu's "Sign out" → "Log out", the public top bar's "Sign in" → "Log in", the log-in page's title, and the "You've been signed out" messages → "logged out". A test fails if "sign in/out" comes back. The password-reset and confirmation emails Supabase sends use its dashboard templates: please check they say "log in" if they mention it.
- **M4, error reporting (Sentry)**: a new dependency, `@sentry/nextjs` 11.10.0 (Matt's approval). Touches `instrumentation.ts` (loads Sentry; `onRequestError`), `next.config.ts` (`withSentryConfig`: source maps only with `SENTRY_AUTH_TOKEN`; a `/monitoring` route forwards browser reports to Sentry), `lib/http/route-guard.ts` (route wrappers report the errors they turn into 500s), `app/error.tsx`, `app/global-error.tsx`, `app/layout.tsx` (labels browser reports with the account id). Off unless `NEXT_PUBLIC_SENTRY_DSN` is set. Reports carry the account id and page only: no email, name, request body (interview turns, answers), cookie, query string or typed input (`lib/monitoring/scrub.ts`, tested). `GET`/`POST /api/internal/sentry-check` throws a deliberate error, for founders only.
- **M6, the pilot reports in production** (`app/drills/reports/page.tsx`): open only to the accounts in `REPORTS_ALLOWED_EMAILS`, everyone else 404; it now also reads `sessions` (interviews by case and week), the post-case survey's `post_case_rating` events and `auth.users` (sign-up time), read only.
- **S6, Feedback on phones** (`components/drills/feedback.tsx`, `components/app-nav.tsx`). Below `md` the floating Feedback button is hidden, so it never sits on content (it covered Cases' Start case buttons, Today's cards and drill answer options at 390 px). On a page that has it (Cases, the report, Account, the drills pages), the bar's phone Menu shows "Feedback" after Settings, and during timed work (a drill set) a "Feedback" link sits beside Exit; both open the same dialog. The interviews keep theirs in their own header. Desktop unchanged.
- **The Privacy Policy** (`app/(site)/privacy/page.tsx`) lists Sentry and Resend among the providers (Matt, 17 Nov); "Last updated" is now November 17, 2026 — set it to the deploy date if that's later.
- One accessibility fix on the landing page: the sample report in the hero used an `<h3>` out of order; it's a paragraph now (same look).

**Vercel settings these need** (Production): `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (from Matt's Sentry project) and `REPORTS_ALLOWED_EMAILS` (the founders' emails). From the audit's blocker (B1, not code): `RATE_LIMIT_SIGN_UPS_PER_HOUR` (for example 200) and `RATE_LIMIT_CLUB_CODES_PER_HOUR` (for example 100), so a club signing up together on one Wi-Fi isn't locked out.

## Getting shadow mode live, in order (merge only with Matt's and Lorenzo's go)

The branch to merge is `case-drills-shadow` (steps 1–2 only), not `drill-update`, which carries step 3 work in progress.

1. **Review** this list and the diff: `git diff main...case-drills-shadow`.
2. **Migration 0029: done.** Claude applied it to the shared database on 16 Nov (Matt's go), from `case-drills-shadow`, after checking that main still ends at 0028. The table, its index, foreign key and RLS, and the four `case_results` columns are there, and today's production code was checked against them (its `case_results` reads work; the site answers). Main's migrations folder gets 0029 with the merge.
3. **Set `CASE_TO_DRILLS=shadow`** in Vercel's Production environment. Leave `CASE_TAG_DRILL_GROUPS` unset. Today's code ignores the variable, and setting it now lets the deploy below pick it up (a variable change only applies to new deployments).
4. **Merge `case-drills-shadow` into main** and run the boot check (`docs/voice-deploy.md`, site only) with `CASE_TO_DRILLS=shadow`. Expect the `[engine]` line, then `[boot] CASE_TO_DRILLS=shadow; drill groups: structure, quantitative, creativity, synthesis, communication, pushback, topFix`, and `GET /` 200. Expect a bad value (`CASE_TO_DRILLS=yes`) to refuse to start. Claude ran this on 80bd03ff on 15 Nov and it passed.
5. **Deploy** (push main). The LiveKit agent doesn't grade, so it needs no new version.
6. **Check** Vercel's runtime logs for the `[boot]` line.

To turn it off: set `CASE_TO_DRILLS=off` (or remove it) and redeploy. No code change.

## Knowing it works

- After each graded case, Vercel's runtime log shows `[score] case → drills (shadow): shadow`. On a failure it shows `failed — <reason>`, and the report is unaffected.
- `npx tsx --conditions=react-server --env-file=.env.local scripts/case-tagging/shadow-status.ts` is free and read-only. It shows runs by status, the latest, failures with reasons, cost per case, how many reports Matt has labeled, and graded cases with no run.
- The shadow review page shows each case's tags and the prescriptions it would make, with labels per point. It runs on a local `npm run dev` against production's database (it is local-only and returns 404 on the site): `http://localhost:3000/drills/review/case-tags`.
- Students see nothing: the report is unchanged, no `case_results` row is written in shadow mode, and drills doesn't change.

## On `drill-update` only (not in `case-drills-shadow`; for a later merge)

7. **The report page** (`app/case/[sessionId]/report/page.tsx`, `components/views/report.tsx`) gets two sections, only when `CASE_TO_DRILLS=on`: "Since your last [level] case" after Top improvement, and "Your next steps" before the survey and the transcript. They read the case product's `sessions` and `scores` (read-only) and drills tables. A failure there is caught: the report shows as today. The 7-minute demo's report shows one line instead, "Take a full case to get your next steps." with a link to Cases; a report graded before the switch went on shows the comparison (from stored ratings) but no next steps.
8. **A Try again route** (`POST /api/case/[sessionId]/next-steps`, the owner only): when the tagging step failed, it re-runs only that step on what scoring stored (`storedCaseResultInput` in `score-session.ts`, read-only, no grading call), at most once per failure.
9. Today's quick fix, Learn's For you and the prescription reasons change wording (drills only).

10. **Your progress** (drills): the `case_sessions` stopgap (which read `sessions` and `scores` directly for the dashboard) is removed; case data shows only when `CASE_TO_DRILLS=on`. A Case to case card reads `sessions` and `scores` read-only, as the report's comparison does.
11. **A one-time backfill** (`scripts/drills-backfill-case-results.ts`, only with Lorenzo's go, after 0029): copies the ratings of past completed cases into `case_results`, marked `backfilled`, with no findings and no changes to skills or prescriptions. It reads `sessions` and `scores` and writes only `case_results`. The demo and the two test accounts are skipped by default. The dry run on 16 Nov found nothing to copy for real students: every non-test session so far is the 7-minute demo. With the test accounts included it would copy 304 cases (299 retakes).
