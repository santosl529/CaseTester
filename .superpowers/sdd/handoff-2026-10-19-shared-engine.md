# Handoff — 19 Oct 2026: the shared-engine bundle (plan first, don't build)

Next session: read this, then progress.md "## Now" and PRD §15 "New cases — known gaps" (a)–(e) and "New cases — wave 1" (f)–(t). Produce the plan Lorenzo asks for below; build nothing and spend nothing until he approves it.

## Lorenzo's brief (verbatim, 19 Oct)

> Good work. Before pricing/launch, the shared engine. Plan first, don't build yet.
>
> Bundle these from PRD §15 into one change on a new branch off cases-eval:
> 1. Answering what was asked: (q) Guard B with colons ("One thing I'd want: how…"), Guard B after the brainstorm, item-less deferrals not dropped, wrongly mapped asks; (r) the live false-refusal guard and fact-check's F3 read covers, not just names.
> 2. (h) a stage deadline yields to a checker line once, then the stage goes first (my 15 Oct rule); (o) the correction cap follows the wrong input, not each figure built from it.
> 3. Reports: fact-check the "Better" answers; the caveat floor applies to any rating with no evidence.
> 4. Decode literal \uXXXX in the interviewer's text; (p) quotes written with "million" and figures inside arithmetic.
> Leave (s), (t), the stale-check redo and the misquote-in-recommendation gate for later unless one falls out of the above.
>
> For each item: the change, the files, the test, and how you'll show prof-001 is unaffected (replays of batches 28–31 must stay identical except where the fix is meant to apply, with every difference listed). Also give the cost estimate for a verification run: a prof-001 wave plus the four new cases, as two waves. Don't spend anything yet.

Deliverable: a written plan (per item: change, files, test, prof-001 proof) + the cost estimate. **Standing rule (Lorenzo, 19 Oct):** after every wave, fix or ruling, update `docs/case-onboarding.md` — its tracker and lessons log — in the same commit; when the engine-bundle plan lands, fold its outcome into that file's "Shared-engine gaps" list. Branch name suggestion: `engine-asks` off `cases-eval` (fe0bb87 or later), worktree under `.claude/worktrees/`. Per CLAUDE.md, the plan is reported and he rules before any code.

## State

- **Branch `cases-eval`** (worktree `.claude/worktrees/cases-eval`, off main b466270; not merged, not pushed): fe0bb87 is the tip as of this handoff. Commits: f60d00b/6fd1157/ba134a5 (audit, rulings, wave-1 grading docs), 20c84c0 (25-min clocks, 3-min close, data fixes), 3306f38 (entry-001 brainstorm after Exhibit 3), 5264558 (entry-001 quote anchors), be3be0a (`scripts/anchor-audit.ts`, `evals/anchor-*`), 00d117f (reviewed names/covers on all four cases), fe0bb87 (docs). Tests 3817 pass; tsc and eslint clean.
- **Wave 1 graded and re-graded by Lorenzo** — `Case Interview Runs/test runs/batch-32-larkspur/hand-grading.md` and `batch-32-aldermoor/hand-grading.md` (worktree and main checkout copies identical). Both waves fail the bar.
- **Not started:** pricing-001, launch-001 waves (his instruction: engine first).
- **Worktree `.env.local`** is a gitignored symlink to the main checkout's file (the batch launcher's children load `--env-file=.env.local` from cwd). A new worktree needs the same symlink before any paid run; never read or copy the file.

## Facts gathered per item (where the code is, what was seen)

**1a. Guard B and undeclared asks (§15 (q)).**
- Guard B = `lib/orchestrator/request-signal.ts` `CUES` / `explicitRequestCues`; called from `plan-turn.ts` ~line 715 only in phases INTRO–EXHIBIT (`requestCues = [...].includes(currentPhase) ? explicitRequestCues(candidateText) : []`). The "I'd want the…" cue is `/\b(i'?d|i\s+would)\s+(want|need|like)\s+(the|a|an|some|any|to\s+see|to\s+know|to\s+get)\b/` — "One thing I'd want: how…" fails on the colon. Cases: Aldermoor Marisol t7, Jasmine t5 (both before the brainstorm, model declared nothing).
- After the brainstorm Guard B is off by design (an "I'd want" there is usually a next step — comment above `WANT_ASK_PHASES`). Case: Aldermoor Marcus t19 ("Do we know whether the 30% is negotiable…? And does the $80 million hold flat…?" — two direct questions, declared nothing). Note `addressedAskSentences` (same file) already separates real questions from "I'd want" next steps — a post-brainstorm guard could use it rather than the bare cue list.
- Item-less deferral dropped: Aldermoor Marcus t5 — model declared `{what: "Aldermoor's European Kelvexa sales trend since 2022", itemIds: [], explicit: true, respond: "defer"}` before the pressure test; data_decisions empty, nothing said. `lib/orchestrator/turn-data.ts` ~line 190: an explicit item-less ask goes to the refusal remap; after the pressure test a defer becomes a release ("nothing is premature"), before it the item-less defer apparently falls out in `data-decisions.ts` — find where; a defer of nothing the case holds should be a refusal.
- Wrong mapping restated: Larkspur Marisol t27 — model declared "Basis for the 70% load factor estimate…" with `itemIds: ["new_routes_plan"]` (already revealed) → code restated the plan line. The scope check (`outsideAskScope`, `splitOfItem` in turn-data.ts, "a qualified ask keeps its scope") doesn't treat "basis / source / how firm" as outside an item's scope.
- Tooling: `asks.py <wave dir> <persona> <turn>` (tools below) prints the candidate's asks, the model's declared requests and code's data decisions per turn.

**1b. F3 and the live false-refusal guard read names only (§15 (r)).**
- `lib/orchestrator/fact-check.ts` `findFalseRefusals` (names via `nameHits`/plain-entry logic) is what F3 (`scripts/fact-check.ts`) and the live guard `lib/orchestrator/stream-turn.ts` ~line 165 (`'false_refusal'`) use. `coverageOf` (same file) reads `covers` and is used only by the remap in `turn-data.ts`.
- Seen: with the new anchors, the original batch-32 refusals (Tyler t22 "As for competition on Ashford and Brookhaven, that's not something I have") are still not F3 — covers-only knowledge. Remap now prevents code from saying them; the gap is the model's own free-text refusals in `say`.
- Risk to check in the plan: the live guard drops sentences; widening it to covers could drop true refusals of finer cuts — `coverageOf` already skips further cuts (`FURTHER_CUT`, `GLOBAL_FINER`).

**2a. Stage deadline yields every turn (§15 (h)).**
- `lib/orchestrator/plan-turn.ts` ~727: `const byTime = (deadlineMs) => !mathLineNow && elapsedMs >= deadlineMs;` used by `recAskByTime` and `stageDeadlinePassed` (~786) → `stageDue` (~788). Any turn carrying a checker/misquote/step line blocks every deadline; Aldermoor Marisol had a checker line on every turn 6:32–22:07 → brainstorm never asked, survey exhibit only with the time warning, time-up.
- Lorenzo's 15 Oct rule (Rules in force): "A due stage question … beats a checker probe: the probe is held to the next turn, once; a correction goes first". There is an existing held-line mechanism (`heldLine`, `checkerMemory.held`, ~633, "A line a due stage held back goes out the next turn") — the yield-once flag probably belongs in session flags beside it.
- Stage deadlines doc: PRD §8 "Stage deadlines" paragraph (line ~308).

**2b. The correction cap per derived figure (§15 (o), Lorenzo's finding).**
- Two-probe cap: `plan-turn.ts` ~470 (`step_probe_cap`, "At most two probes per step per interview") and `math-checker-live.ts` ~118 / ~591 (`unresolved` after two probes) and ~715. Keys are per step / per checker claim value (`stepOfKey(key)`, `checker:<value>`), so $400M, $80M and 150,000 (all built on Marisol's $2,000 net price) each got two probes and a correction (t16, t26, t28); the wrong input ($2,000) was corrected last.
- The checker's verdicts carry `derivation`/`assumptions`/`errorType` per claim — the input that's wrong is often named there; the deterministic side has `operands` per math step. The plan must say how a derived figure is tied to its wrong input (checker field vs. code).
- Evidence: `ev.py "Case Interview Runs/test runs/batch-32-aldermoor-oct-19-runs-1-5" 57-marisol 5` prints every verdict, flag decision and gate decision.

**3a. "Better" answers not fact-checked.**
- Report text: `scripts/live-run.ts` ~535 renders `missedOpportunities` as "💡 moment / Better: betterResponse"; the app's report renderer does the same from the rubric. The verifier `lib/scoring/verifier.ts` `collectClaims` checks `needsWork[].point`, `missedOpportunities[].moment` and `topFix` — **not `betterResponse`, and not strengths**. Lorenzo's report false statements: Larkspur Tyler's Better ("3 million passengers … $30M"), Marcus's Better ("30–36% fare drop"); Aldermoor Marisol's strength "proactively withdrew a stale figure" (a strength — also unchecked; his brief names only Better answers; flag the strengths gap in the plan and let him rule).
- Deterministic audits in code: `lib/scoring/evidence-audit.ts`, `deterministic.ts` (math), `answer-key-pass.ts`.

**3b. Caveat floor (§15 (l)).** `lib/scoring/caveat-floor.ts` `applyCaveatFloor` (header comment: v4.10 "missing evidence never becomes meets bar") lifts a caveated needs_work only; a judge-written meets_bar with a caveat and no quoted evidence passes (Aldermoor Marisol's Creativity). Lorenzo ruled it a false statement.

**4a. Literal `\uXXXX` in the interviewer's text (§15 (k)).** `lib/agent/models/turn-stream.ts` decodes JSON escapes while streaming `say` (~line 38 `JSON.parse(\`"…"\`)`); a model that writes `\\u2013` (escaped backslash) yields a literal `–`. Seen: Larkspur Marisol t10 ("Hub–Lakeport"), t24 ("×"); batch 22 Marcus, Fiona; batch 28 Owen (`grep -rlF '\u20'` over `test runs/*/live-run-*.json`). Decode where the final say/question text is assembled (all turn kinds), and note the record files store the decoded text.

**4b. Quotes with "million" and figures in arithmetic (§15 (p)).**
- `lib/orchestrator/misquote.ts` `FIG`: negative lookahead `(?!\s*(?:-|\s)?(?:points?|…|m\b|million|b\b|billion|k\b|…))` — any $-million figure is never a quote. `INDEXED_OR_ARITHMETIC` skips a whole sentence with `×`, `=`, `times`, `minus`…; `computedEarlier` and `ARITH` too. `quoteFits` in `fact-check.ts` re-parses `cited` with a figure regex.
- `lib/orchestrator/cell-lookup.ts` `parseCell` accepts `M` but not "million"; Exhibit-1 prose cells ("1.6% of US adults") aren't parsed at all; a figure > `MISREAD` (10%) from every cell is treated as another quantity.
- The thousands-comma bug (§15 (c)) is the same grammar: `FIG` is `\d+(?:\.\d+)?` → "$1,200" read as $1. It's adjacent to (p) and probably falls out of it — the plan should say whether it's in.
- Seen: Aldermoor Tyler t7 "Prevalence you gave is 1.5%, so 250 × 0.015 = …" (arithmetic sentence), t17 "the $77 million annual selling cost" (million; also figure-before-anchor). launch-001 "Recipe development was $1.5 million" never flags; "The shelf price is $4.49." doesn't flag either (cause unknown — check). prof-002 "Fixed costs are $25.0M" doesn't (25% off the cell — MISREAD).
- prof-001's figures are percents and small dollars with no thousands and no "million", which is why none of this showed on prof-001 — the replay should confirm the fix leaves its misquote flags unchanged.
- Harness: `mq.ts` (tools) runs `findCandidateMisquotes` on sample sentences: `npx tsx <copy>/mq.ts - <case> <sentences.txt> "<revealed,ids>" <shown,exhibits>` (copy it into the worktree first — `@/` imports resolve from the worktree's tsconfig; remove it before committing).

## Proving prof-001 is unaffected

- Full-corpus replay: `Case Interview Runs/replays/2026-10-18/tools/replay31.sh <name>` (checker off and on, every recorded verdict through batch 31; run from the worktree whose code you want: `REPLAY_OUT_BASE=<dir> zsh replay31.sh after`). Base: `git worktree add --detach <dir>/base <commit>` + symlink `node_modules` from the main checkout, run as `base`. `cmp.py <out> base-on after-on` = checker decisions changed per run; delivered-text diff = compare `turns[].text`; `npx tsx scripts/fact-check.ts --root=<out>/after-on`.
- Batches 28–31 specifically: `REPLAY_FILTER` is a substring filter on the run path (e.g. `batch-28`, `batch-29`, `batch-30`, `batch-31`) — one replay per filter, or the full corpus and select. Verdict files for them are in replay31.sh's `CK` list (b28, b29 in `replays/2026-10-16/close-hold/`, b30/b31 in `replays/2026-10-18/tools/`). **Verdict ids are keyed from the corpus root** (`test runs/<wave>/<persona>/<run>#t<n>`): always `REPLAY_ROOT=".../Case Interview Runs"` + `REPLAY_FILTER`, never a batch dir as root (every verdict misses).
- New cases: `replays/2026-10-19/tools/replay-new.sh` (batches 32 and 22, checker off) + `diffrep.py <a>/batch-32- <b>/batch-32-` (changed interviewer turns, before/after; globs recursively).
- The replay reuses recorded model text: a fix that changes what the model would have said (prompt-side) won't show; code-written lines, data decisions, stage kinds and guards will. Guard B regeneration in replay: check how the replay handles a second model call (it serves the recorded turn).

## Cost data for the estimate

- prof-001 (20 min): batch 31 $6.29 for 11 runs, 2 scored ($0.87 Opus 5.5 + $0.16 Opus 4.8 scoring; ≈ $0.48 a run unscored, ≈ +$0.52 scored); batch 30 $8.43 for 15 runs (2 scored); batch 29 $5.59 for 10 (2 scored). Launcher estimate `scripts/persona-batch.ts --dry` (prof-001-calibrated; under-estimates the new cases).
- New cases (25 min, all scored): batch-32-larkspur $6.71 / 5 runs ($1.34 a run; scoring $0.46), batch-32-aldermoor $5.99 / 5 ($1.20; scoring $0.46). Assume pricing/launch ≈ $1.2–1.4 a run scored, ≈ $0.75–0.9 unscored.
- "Two waves": wave A prof-001 (batch 31's 10 + Noor, or the batch 30/31 set); wave B the four new cases in parallel (one batch per case — a batch runs one case; ≤ 10 personas a wave per launcher; the 5 personas 7, 64, 57, 24, 40). Give expected and worst case and a proposed cap per batch; ask which runs are scored.
- Standing rules: no paid call without his go and a cap; one wave at a time; batches of one wave may run in parallel (as batch 32 did, his go).

## Tools (durable copies, main checkout, untracked)

`Case Interview Runs/replays/2026-10-19/tools/`: `replay-new.sh`, `diffrep.py`, `asks.py` (asks / declared requests / data decisions per turn), `ev.py` (checker verdicts, flag and gate decisions), `timeline.py` (per-turn plan kind, checker line, stage record), `kinds.py` (code-decided turns per run), `tt.py` (full text of chosen turns), `fb.py` / `fbown.py` (a report's feedback / the report's own words), `mq.ts` (misquote harness), `numaudit.py` (case-JSON numbers vs PDF text), `case02/03/05/07.txt` (the four PDFs as text). Earlier: `replays/2026-10-18/tools/` (`replay31.sh`, `cmp.py`, `grade31.py`, `show.py`, verdict files).

## Gotchas met this session

- Worktree-isolated Bash refuses commands with shell variables, loops, `export`, `cd` chains or heredoc-plus-run combinations it can't verify: write a script file (scratchpad), then run it plainly; use absolute paths. Writes into the main checkout must go through `cp`, not the Write/Edit tools.
- `plan-inspect.ts` imports the DB client: run with `SUPABASE_SECRET_KEY=dummy` (no DB call is made).
- The case loader caches; validate a rewritten case with `CaseSchema.safeParse` directly.
- `JSON.stringify` reorders integer-like keys (a prompt fact's `values: {"200": …, "176": …}`) — rewriting a whole case block from JS changes it; rewrite only the sub-object you mean (anchor-audit's `--apply` does).
- `coverageOf` splits an ask at commas / "and" / "or" / "plus"; names before covers; a cover spanning the joint covers both parts — test any anchor change with `scripts/anchor-audit.ts --asks=evals/anchor-asks-batch32.json` and `--asks=evals/anchor-probes.json` (free).
- fact-check D6 on the new cases is noise (§15 (e)); data-release (D3) flags are leads, not counts (Lorenzo).
