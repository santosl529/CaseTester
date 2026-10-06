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
- **Batch 5 manual review (3 Oct)** — every exchange read by hand (`docs/interviewer-behavior.md` Part V has the numbers). Data integrity solid: 0 leaks, 0 broken promises, 0 ignored ledger requests. Conversation quality regressed: Sonnet narration spoken ~16× in 8/10 runs. Opus-vs-Sonnet comparison against batch 3 recorded there.
- **Next session — open fix list (all free; a check batch needs approval):**
  1. Narration: speak tool is the only spoken channel; plain text never spoken; one retry for a speak call, else a neutral line. Then a ~4-persona check batch (≈$3–4); if narration persists, revert the interviewer to Opus 4.8.
  2. `isRecommendationStatement`: negated mentions ("didn't get to a recommendation") are not recommendations.
  3. Goodbye detector: "we'll leave it there", "the case is complete".
  4. End gate: no end without a recommendation ask (Lena ended at 12.8 min without one).
  5. False refusal ("not for two years ago") — prompt/guard.
  6. Same-turn resolution false positives → unrequested releases (Destiny).
  7. Stray "I'll come to that data shortly" after a release.
  8. Non-ledger requests ignored (~5/20) — decide whether to enforce refusals.
  Also pending: grading-consistency test (`scripts/regrade.ts --repeat=3`, ≈$7), hand-labeled request set, $1 smoke test before every batch, committing a trimmed copy of the run records so the replay suite runs anywhere.

## 6 Oct — prompt consistency, say-first, per-step timing (branch plan-owns-decisions)
- **Prompt pass (`e396634`):** PRIORITY block (turn notes > time pressure > coverage/pacing/open requests > defaults); numbers rule allows what the provenance guard allows (case prompt, any candidate turn, RECOMPUTE figures); one list of candidate-figure options; pressure test before data (a request before it is answered is deferred); verified figures exempt from the derivation rule; unit flag no longer speaks the method; no case-specific figures in the generic text; anecdotes and duplicates cut (15.2k → 12.2k chars).
- **Say first (`39f5202`, `1170ca2`):** schema order say → declarations → question; the data line goes out once say and the declarations have closed; say is one neutral acknowledgment; a data-talk sentence in say is dropped (not a stream stop); a request whose ids all fail to resolve is dropped rather than refused.
- **Per-step timing (`1732487`):** `TurnTimer` → `turn_latency.steps` + `[timing]` log line per turn.
- **Replay (≈$0.85 incl. baselines):** first sentence median 1.76s → 1.28s (50 batch 7–8 turns), 2.82s → 1.50s (11 Nikhil turns); whole turn unchanged.
- **Batch 11 — Nikhil live (≈$0.61 app):** first speech median 3.27s → 1.65s (p90 3.49 → 1.88); whole turn 3.50 → 3.29s. Timing: distress verdict 0.7–0.95s and request classifier 2.3–3.4s both finish before they are needed (0ms wait); the long pole is the model writing request declarations (1.1–1.6s for 8 requests) then the question.
- **Found in batch 11 (open):** data decisions release an item and defer the request group containing it in the same turn ("COGS is 58%… I'll come back to the cost breakdown") — t6, t8; over-deferral of the cost breakdown after the pressure test was answered (t5); refusal lists still long; say-first acknowledgments sometimes grade ("the bridge ties out").
- **Guard audit (batches 5–11):** distress model 3 true catches, 0 false; same-turn request classifier is log-only on model turns and disagrees with the declarations on ~half of Nikhil's turns (unverified which is right); several deterministic guards never acted in batches 5–9 (fabricated_turn, system_language, copied_check_in, exhibit_promise, synthesis_guard).
- **After batch 11 (6 Oct):** data decisions release first, then deferrals/offers (`7f8cc80`); same-turn request classifier removed from model turns, with its `request_audit` (`26eab37`); behavior doc → v4.8 and technical PRD §2/§5.3/§5.4/§8.2 updated for the prompt priority, `say` first, releases-first, the classifier removal and per-step timing. All untested live.
- **Batch 12 (6 Oct, 10 runs: default candidate + Maya, Tobias, Ines, Claire, Derek, Tyler, Lena, Devon, Hugo) — read by hand.** $7.47 with simulator ($5.00 app). First speech median 1.45s (p90 1.87s) over 102 model turns; the model's first token (median 1.36s) is now the whole wait; distress verdict never waited on. All ended; Derek terminated (C2) as designed; one goodbye each; Lena's deferral tracked and released after the probe. Defects found (counts by hand): exhibit handover doubled by the question in 8/10 runs; questions built on data that was only offered (6); grading in say (5: "sound way", "that's right", "good scoping", "sensible prioritization", "reasonable test"); compound questions (~10); release cap splitting a request and still saying "I'll come back to …" (Tyler t3); rung-1 restate quoting a statement and lowercasing "I" (Maya t13); "I'll come back to that." inside the question (Maya t9); the report line for "how am I doing" vetoed as a goodbye (Maya t24); exhibit referenced but never handed over (Ines t18); misquotes of released data never reset (Tyler); unit probe repeated three turns (Derek); a six-turn arithmetic loop with no figure supplied (Maya). Not yet fixed.
