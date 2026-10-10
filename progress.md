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
