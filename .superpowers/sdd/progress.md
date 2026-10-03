# SDD Progress Ledger — Voice AI Mock Case Interview Text Product

Plan: docs/superpowers/plans/2026-06-29-text-product.md

## Tasks
- [x] Task 1: Project Bootstrap + Tooling
- [x] Task 2: Drizzle Schema + Supabase Clients
- [x] Task 3: Case Zod Schema + Loader + Seed Case
- [x] Task 4: Orchestrator Core
- [x] Task 5: Interviewer Agent
- [x] Task 6: Hallucination Harness (Step 3 Gate)
- [x] Task 7: Scoring Engine
- [x] Task 8: Text Channel + Session Runner
- [x] Task 9: Auth + Text Case UI + Report UI
- [ ] Task 10: Case Content (8-12 Cases)

## Checkpoints
- STOP 1: After Task 3 (Foundation complete)
- STOP 2: After Task 6 (Orchestrator + Agent + Hallucination gate)
- STOP 3: After Task 8 (Backend complete)
- STOP 4: After Task 9 (Site hostable — main review)
- STOP 5: After Task 10 (All cases + final gate)

## Completed
- Task 1: complete (commits 6f935eb..f0b9174, review clean). Notes: Next.js 16/React 19/Tailwind 4; ESLint 9 flat config (eslint.config.mjs); lint script is 'eslint' not 'next lint'
- Task 2: complete (commits f0b9174..370ebe9, review clean). Minor: db/migrate.ts missing DATABASE_URL guard — low risk dev script only
- Task 3: complete (commits 370ebe9..4365ba5, review clean). Note: Zod v4 requires z.record(z.string(), z.unknown()) — updated plan accordingly
- Task 4: complete (commits 4365ba5..7a566b8, review clean). Note: audit regex uses \d[\d,]*\.?\d* (no ) — correct fix for currency-adjacent numbers like $480M
- Task 5: complete (commits 7a566b8..9358ea2, review clean). Minor: tools[] passthrough unused by Haiku impl; double empty-action fallback harmless; blank line in prompt when pushbackDone=true
- Task 6: complete (commits 9358ea2..025e40d, review clean). GATE PENDING: harness skipped (ANTHROPIC_API_KEY not in npm test env). Must be run manually before Step 3 is truly gated.
- Task 6 gate: PASSED (1/1 test, zero hallucinations on prof-001 across 9 scripted turns). Fixes: regex ordinal false-positives, allow case prompt/exhibit/candidate numbers in audit, tightened ANTI_HALLUCINATION_ADDENDUM
- Task 7: complete (commit 77c0380, 3/3 tests pass, 0 typecheck errors, 0 boundary violations). Note: tolerance is absolute (not relative multiplier) — brief code had a bug, test was authoritative. Pre-existing lint error in hallucination-harness.test.ts (no-explicit-any) not introduced by this task.
- Task 7: complete (commits 766ae2c..c44316f, review clean + fixes). Absolute tolerance semantics confirmed; judge JSON parse guarded. Minor: mentioned semantics and missing judge mock test logged.
- Task 8: complete (commits bd8ec37..4972d94, review Approved). IDOR fix applied (ownership check → 404). Defect 2 fixed: getCaseById now returns 400 on invalid caseId. Minor/non-blocking: TextCandidateChannel is dead code in M1 runtime path (session-runner calls runInterviewerTurn directly); two `as any` casts on dataLedger. All spec constraints passed.
- **CHECKPOINT 3 REACHED: Backend complete.** Tasks 1–8 done. Pending user approval before Task 9.
- Task 9: complete (commits 752312a..eca5127, re-review Approved). shadcn/ui; landing+auth+club-code page; chat-window; case page; report page; ReportCard component. IDOR fixed on both pages (ownership check). Club code moved server-side (CLUB_CODES, no NEXT_PUBLIC_). startCase + sendTurn error handling added. Minors logged: (1) club code UX round-trip (wrong code only surfaced after case pick); (2) CLUB_CODES='' produces [''] — safe fail but confusing; (3) window.location.href used instead of router.push in chat-window (cosmetic).
- **CHECKPOINT 4 REACHED: Site hostable.** Tasks 1–9 done.

## Post-plan hardening (July–September 2026)
Work after Checkpoint 4 is not tracked as plan tasks; git history and the normative docs (docs/interviewer-behavior.md, docs/scoring-qa.md, docs/case-authoring.md, docs/prd-voice-ai-mock-case-technical.md) are the record. Summary of the 2026-09-14/15 session (commits 2737008..HEAD; full write-up in report.txt at the repo root):
- Interviewer behavior spec v4.1 integrated (Rule 11 release/refuse/defer, data-coverage caveat, dimension reconciliation); run-4 account corrected against the transcript.
- Rule 11 machinery: Haiku data-request classifier with classified markers and scoring-time backfill; one request can cover several ledger items; open-request prompt hints; force-release before any recommendation ask (current-turn requests first); exhibits release the ledger items they display.
- Scoring: requested-vs-never-requested data split for the judge; dimension reconciliation pass (parser fixed); evidence audit drops points left without evidence; no gendered pronouns for the candidate.
- Orchestrator: evidence-based phase repair (Rule 8); fabricated-candidate-turn guard; recommendation-ask turn composition; guaranteed close on ending turns; provenance audit accepts all candidate turns, the case prompt, and within-value change figures.
- prof-001: root cause reconciled with the ledger (beans 4.2 + other inputs 11.8 = 16 of the 18 points; overhead 2; menu prices flat); consistency tests extended. Needs human review per FR-20.
- Route pipelines extracted to lib (start-session, post-turn, score-session, PDF render); scripts/live-run.ts runs a fast simulated candidate end to end (pipeline check only).
- Verification 2026-09-15: 415 tests pass (1 skipped: API-key harness in the default env); typecheck, lint (incl. voice boundary), and production build clean.
- Task 6 gate re-run 2026-09-15 after the prof-001 ledger and provenance-audit changes: PASSED (1/1, zero invented numbers across 9 scripted turns).
- Task 10 (8–12 cases) still open — prof-001 is the only case.

## Persona-run cycles (27 Sep – 2 Oct 2026)
Four batches of simulated-candidate runs (`scripts/live-run.ts --persona`, records in `Case Interview Runs/test runs/`), each followed by spec and code fixes. Normative record: `docs/interviewer-behavior.md` (now v4.6, with per-batch results in Part V), `docs/scoring-qa.md`, the technical PRD.
- **Batches 1–2 (27–30 Sep) → v4.3–v4.5:** recompute source spans (all three false corrections were the check itself), provenance block actually withholds, C5 hardship lexicon + clock pause, time-warning window + grace ask, promise recovery, C4 redirect-and-continue, C2 reported-speech exclusion, interviewer-error marking, error-claim verifier, caveat floor, attempt counter; v4.4 same-turn data-request resolution.
- **2 Oct, round-2 fixes + v4.6 (this session):** per-check decision log; stall classification by content + number-word normalization (Yuki's phantom rung was digit-only detection); rungs count only when delivered; C5 model layer (Haiku, parallel); answer-key and caveat-text pass; verified figures + probe withholding (verify-only bean steps); assumption-challenge guard; one-goodbye close with stage-based gate; timeframe check (log-only); persona harness updates (Derek later, 61 Leah, 62 Ben).
- **Batch 3 (2 Oct):** round-2 fixes held live (goodbyes 4→1, ignored held-data requests 23→4, doubt probes on correct math 5→0). Fixed after: cue-only rung delivery froze Maya's ladder; unbounded recommendation asks (17 for Maya).
- **Round-3 fixes:** every announced fact delivered (multi-item handoff recovery); earlier requests released by code once at stage; final-message requests answered; system vocabulary rewritten; model hint check; strong-rating checklist gate; scoreSession split into computeScore + save, `scripts/regrade.ts`.
- **Model switch:** interviewer Sonnet 5.5 (thinking off via `between_tools`), scoring Opus 5.5 (adaptive thinking, effort high), server-side refusal fallbacks everywhere; ids in `lib/models.ts`; SDK 0.107 → 0.131.
- **Batch 4 (2 Oct):** one goodbye per session; requested-never-provided data 4→0; grades spread (strong skill ratings 62→32 of 80); app cost $0.70/run; median turn 1.9s (no gain). Fixed after: scoring failed in every run (non-streaming 32k request — scoring now streams, score route maxDuration 300); Sonnet spoke plain-text reasoning and copied check-ins; three false impact flags ("margin" cue); refusals read as handoffs.
- **Replay suite:** `tests/replay/corpus.test.ts` pins the batch 1–4 guarantees (free; skips without the run records).
- **Verification 2026-10-02:** 638 tests pass (1 skipped), typecheck, lint, production build clean.
- **Open:** batch-4 post-batch fixes untested live; grading consistency never measured (`regrade.ts --repeat=3`); data-request classifier accuracy unmeasured (needs a hand-labeled set); latency long pole unknown (interviewer vs C5 check) before M2; Task 10 (8–12 cases) — prof-001 is still the only case.
- **Batch 5 (2–3 Oct):** targeted personas (Claire, Nikhil, Lena, Destiny, Marisol, Devon added). Five runs crashed on a blank turn from the batch-4 narration fix — fixed and rerun. Zero false flags / double refusals; one goodbye per session; distress check adds 0s latency (interviewer median 1.8s). Fixed after: probe guard vs unit check (Derek), imperative hints, verify-only other-input steps (judge's false error on Tobias). Cost ≈ $9.75 for the ten scored runs plus ≈ $1.5–2 of crashed partial runs. Lesson: run the $1 smoke test before every batch.
