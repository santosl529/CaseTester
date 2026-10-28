# Handoff — 20 Oct 2026: round 5b of the engine-asks bundle, then B1′ + B2′ on Lorenzo's go

Next session: read this, then progress.md "## Now", then the round-5 ledger (`.superpowers/sdd/2026-10-20-engine-asks-round5/progress.md`, its `Ruling:` lines and "for Lorenzo" items). Write a short round-5b plan (`docs/superpowers/plans/2026-10-20-engine-asks-round5b.md`, round-5 format: his words quoted per task), build it with subagents as in rounds 1–5, prove it, and **stop after the proof**. No wave, push or deploy.

## Lorenzo's message (verbatim, 20 Oct)

> Round 5 reviewed. Short round 5b before any wave:
> 1. R7 reversed: when a root goes to the report without a code line, the derived claim gets its own vetted correction once, through own-quantity framing (b33 Marisol 11:0 "about 4.2 points of revenue, not 5.8"). The root probe at t12 stays.
> 2. 13:0: the report credits a later redo of a claim already left for the report.
> 3. E5 partial answers: the check reports per mapped item whether it fully answers or is only the nearest held data. Partial → E1's form ("I don't have <the asked part>." + the item's line). Tighten the check prompt to the item that holds the answer, with the r5-haiku negatives (#48 → Option B is closer; #64 and #67 → cohort_notes). #12 is fine (Exhibit A shows margin by year).
> 4. Voice check (free): in the existing voice exports, how often do the candidate's questions carry "?". If often not, the held-question rule detects question form, not "?".
> 5. Make the suite reliable at full parallelism (cap workers or raise those tests' timeouts).
> Accepted as built: E6 binder rules (log b35q Marisol 7:2), the E7 row fix (wording "At month 12, 21.5% of Pro customers and 40% of Starter customers had cancelled."), the E7 co-occurrence rule, the count rule, and controller rulings 2 and 4–17. b29 Owen's avg_ticket stays (my 16 Oct rule).
> Proof: free replay on all 21 slices, plus a rerun of the 68-ask Haiku check (≈ $0.08, authorized): 0 wrong releases, 0 bare partial answers, hollow ≤ 2, 0 refusals of an ask a ledger item fully answers. In the next wave, log the classifier's cost and added latency per session.
> Stop after the proof. Then B1′ + B2′ (cap $40 total) on my go, then the prof-001 pre-merge wave.

"Controller rulings 2 and 4–17" are the numbered list in the round-5 final report (1 = R7, now reversed; 3 = the E6 binder rules, accepted by name above; 18 = process/tooling). They map to the ledger's `Ruling:` lines; mark each "approved by Lorenzo (20 Oct)" in the PRD body and record the approval in a new §16 entry (§16 is append-only — leave the round-5 entry as written).

## State at handoff

- **Branch `engine-asks`** (worktree `.claude/worktrees/engine-asks`), HEAD **7bf0ccc**, local only. Round 5 built, reviewed (16 task reviews + an Opus whole-branch review and fix wave) and free-proved; suite 4,485 pass with `--maxWorkers=4` (see job 5), tsc and eslint clean.
- **Proof tooling:** `Case Interview Runs/replays/2026-10-20/engine-asks/` (main checkout): `proof.sh <label>` (zsh, cwd = the worktree; ~25 s for 21 slices), `compare.sh <base> <label>` → `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/compare-<base>-vs-<label>.md`. Latest labels: `r5-base` (f595e6a), `r5-final2` (0f0fd5d = code at 7bf0ccc). Write-ups: `r5-final.md`, `r5-g1.md`, `r5-task-44..47.md`, `r5-haiku-check.md`.
- **Replay limits** (read before judging a diff): the replay reuses the model's recorded `say` (an old code line can sit beside a new one); candidate turns are recorded, so a changed code turn cascades; a new check call with no recorded verdict gets null (→ named deferral); no ask detections are served on saved model turns (A1/A4/A5 show only in tests or live). Recorded check verdicts and dropped asks are served (`lib/eval/recorded-checks.ts`); `REPLAY_CHECKS=<json>` overrides verdicts (used for the Haiku check's replay half).
- **Haiku check tooling:** script `.superpowers/sdd/2026-10-20-engine-asks-round5/haiku-check.ts` (gitignored; plain command `npx tsx --env-file=.env.local .superpowers/sdd/2026-10-20-engine-asks-round5/haiku-check.ts` ran without a permission block; it sets its own `LLM_BUDGET_USD` cap), ask list `/private/tmp/…/scratchpad/haiku5/asks.json` may be gone — rebuild from `haiku5-verdicts.json` in the same folder (68 asks: 41 prof-001 from round 3 + 27 B1/B2), replay input `haiku5-replay-checks.json`. Round 5 run: $0.0749, 39 refused / 10 released / 6 restated / 2 hollow / 0 wrong / 9 non-answering.
- **Spend so far today:** B2 $14.58, Haiku check $0.0749.

## The five jobs (round 5b)

1. **R7 reversed** (`lib/orchestrator/math-checker-live.ts` root rule (o): `rootOf`/`rootFrom`/`built`, riders → `unresolved` "built on a closed input"). When the root is left for the report with no code line said, a derived claim still gets its own vetted correction **once**, through own-quantity framing (`framedCorrection`). Target: b33 Marisol (`test runs/batch-33-oct-19-runs-1-10/57-marisol…/31e33506`) 11:0 → "…about 4.2 points of revenue, not 5.8." at t14; her root probe at t12 ("You took beans as 25% of the 58 points of COGS. Which year does that 25% refer to, and what was COGS then?") stays. Analysis: `r5-task-46.md` R7 and `r5-final.md`.
2. **13:0 redo credited in the report.** A claim already left for the report (`unresolved`) whose candidate later redoes it correctly (b33 Marisol t19 "beans were 0.25 × 42 = 10.5 points of revenue") is credited as corrected in the scored report (the WRONG list / interviewer-error marks the judge reads). Find where unresolved flags reach scoring (`lib/scoring/…`, the checker's report feed) and add the later-redo credit, figure-bound as E6 binds.
3. **E5 partial answers.** The small-model check (`classifyDataRequests` via `itemlessDeferHeld`/`decideCheckedAsk`, `lib/orchestrator/turn-data.ts`, `lib/orchestrator/data-requests.ts`) reports per mapped item `full` or `partial` (nearest held data only). Partial → E1's form: "I don't have <the asked part>." + the item's line (release if releasable, restate per 4b only on a pure re-ask — check against Task 44/45 rulings). Tighten the check prompt toward the item that holds the answer, with the r5-haiku negatives as examples:
   - #48 entry-001 Marisol t27 "whether any US player has an existing Corlan's franchise" → was `company_size`; Option B (`option_b`, the established partner) is closer.
   - #64 pricing-001 Marcus t17 "Starter cohort beyond month 12" → was `starter_cohort` restated; `cohort_notes` (very few upgrade after month 12; steady cancellation).
   - #67 pricing-001 Tyler t11 "churn for upgraded customers measured from their upgrade date" → was `upgrade_timing`; `cohort_notes` ("upgraded customers then behave like Pro customers").
   - #12 prof-001 Fiona t4 "operating margin over the period" → `revenue_total` + Exhibit A is fine (Exhibit A shows margin by year) — keep it.
   The prompt change touches every case's check; prove it with the Haiku rerun.
4. **Voice "?" check (free).** In the voice exports (`Case Interview Runs/voice-live/2026-10-08 … 2026-10-19/`, main checkout; each export has the transcript), count candidate question turns (interrogative form: wh-word/aux-inversion/"do we have…") and how many carry "?". If often not (STT punctuation), change the held-question rule (Task 49, `namesItem`/held-question in `lib/orchestrator/session-runner.ts` / `request-signal.ts`) to detect question form, not "?". Report the counts either way.
5. **Suite reliable at full parallelism.** Default `npx vitest run` timed out 2–13 tests at load average 27 (e.g. `code-line-variants.test.ts` "rec_ask: never one of the last 3 uses…", `phrasing.test.ts` "never one of the pool's last 3 uses…" — both pass alone in <5 s). Cap workers in `vitest.config.ts` (e.g. `maxWorkers`) and/or raise those tests' timeouts; prove with two default full runs passing.

## Docs (in the 5b docs commit)

- Mark approved in the PRD body: the E6 binder rules (head-noun binding, condition stripping except vs/versus, kind words only with their quantity, it/that back-reference, operand labels, F1 fallback), the E7 row fix with **his wording** — change the code line to "At month 12, 21.5% of Pro customers and 40% of Starter customers had cancelled." (built from the case data, not hard-coded; update its tests), the E7 co-occurrence rule, the count rule, controller rulings 2 and 4–17.
- Log: b35q Marisol 7:2 (a false close: "$2,400" is Pro's LTV, "Pro's" only in the sentence before — cross-sentence subject binding, not built); b29 Owen's `avg_ticket` stays (his 16 Oct rule).
- R7 reversal and 13:0 as his decisions; E5 partial as his decision; the voice "?" result.
- PRD §16 new entry; §15 status; case-onboarding Next; progress.md "## Now".

## Proof (Lorenzo's bar)

- Free replay, all 21 slices vs `r5-final2`: list every changed prof-001 decision and line (intended / regression); 0 regressions. b33 Marisol t14 should now say the 4.2 correction.
- Haiku rerun, the same 68 asks (≈ $0.08, authorized): **0 wrong releases, 0 bare partial answers, hollow ≤ 2, 0 refusals of an ask a ledger item fully answers.** Report per ask (full/partial verdicts, outcome) in `r5b-haiku-check.md`.
- Then stop and report to Lorenzo.

## After 5b (his go needed)

- **B1′ + B2′:** prof-002 + entry-001 + pricing-001 + launch-001, the onboarding personas (7, 64, 57, 24, 40), all scored, **cap $40 total**, dry run first, from the engine-asks worktree; launch with the plain command form, `run_in_background`, and `caffeinate -i -t 4200` (the harness stops background commands at 2 h). Batch names: next free numbers (batch 36+). **Log the classifier's cost and added latency per session** (Lorenzo's request — add to the run log/budget ledger before the wave). Grade under his rules (rule 1 refined; unit slips false not serious; hollow deferral = firm moderate; the same probe 3+ times serious).
- Then the prof-001 pre-merge wave, on his go.

## Gotchas

- Paid launches: plain command only (`npx tsx --env-file=.env.local scripts/persona-batch.ts …`, no `cd … &&`, no redirect), shell already in the worktree; one wave per go; never chain.
- Never `git add` under `Case Interview Runs/`. Never read `.env*`. No migrations (round 5 avoided one: reveal source lives in `flags.exhibitOnly`).
- Copy wave folders from the worktree's "Case Interview Runs" to the main checkout's after a wave (`cp -R`).
- The round-5 ledger stays until the merge (rulings, mutation records, deferred minors the final review triaged).
