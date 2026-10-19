# Shared-engine bundle ("engine-asks") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the shared-engine gaps Lorenzo bundled on 19 Oct: asks answered as asked, a stage deadline that yields once, corrections that follow the wrong input, fact-checked reports, decoded escapes and a quote grammar that reads "million" and arithmetic sentences. prof-001 must stay identical except where a fix applies.

**Architecture:** Every change is in deterministic code (orchestrator guards, the checker's planning, the quote grammar and the scoring passes), except one prompt-side change: the claim verifier also reads "Better" answers. Each task is proved twice. Unit tests use the batch-32 evidence sentences. Free replays of batches 28–31 then list every changed decision and delivered line, and every change must be one the fix means to make.

**Tech Stack:** TypeScript, vitest, the runner replay (`tests/replay/runner-corpus.replay.test.ts`), `scripts/fact-check.ts`, the Python tools in `Case Interview Runs/replays/2026-10-1{8,9}/tools/`.

**Spec:** Lorenzo's brief, quoted word for word in `.superpowers/sdd/handoff-2026-10-19-shared-engine.md`; PRD §15 "New cases — known gaps" (c) and "New cases — wave 1" (h), (k), (l), (m), (o), (p), (q), (r).

## Global Constraints

- Branch `engine-asks` (worktree `.claude/worktrees/engine-asks`), off `cases-eval` e6bae59. Nothing is merged or deployed without Lorenzo's go.
- Out of scope unless it falls out of the bundle (his brief): (s) ledger-line release order, (t) group-vs-cover precedence, the stale-check redo (j), the misquote-in-recommendation gate (i).
- Nothing is spent without his go and a cap. Every check in Tasks 0–10 is free.
- No new dependencies. No voice library goes in the orchestrator, agent or scoring code.
- One commit per task, with passing `npx vitest run`, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db`.
- The replay proof per task: batches 28–31, with the checker on and off, base vs. after. Every changed checker decision (`cmp.py`) and every changed delivered interviewer line (`diffrep.py`) is listed in `replays/2026-10-19/engine-asks/<task>.md`, each marked **intended** (with its reason) or **regression**. A regression stops the task.
- Standing rule (Lorenzo, 19 Oct): each fix updates `docs/case-onboarding.md` (tracker and lessons log) in the same commit, plus PRD §15 status and §16 history, plus progress.md.

## Review Focus

1. **A rhetorical question in a recommendation** ("Is it worth it? Yes, because…") must not trigger the post-brainstorm Guard B. Pinned in Task 1, Step 1.
2. **A true refusal of a finer cut** ("competition on Ashford by month") must not be flagged by the covers-reading F3 or the live guard. Pinned in Task 3, Step 1.
3. **A derived figure that also carries its own arithmetic error** (right input, wrong multiplication) must still be probed on its own. Pinned in Task 5, Step 1.
4. **A Better answer with a labelled hypothetical** ("if we assume a 5% price rise…") must not be stripped. Pinned in Task 6, Step 1.
5. **A thousands figure that is right** ("Pro CAC is $1,200", "The Lakeport cost per flight is $9,000.") must flag nothing. Pinned in Task 9, Step 1.

---

### Task 0: Free baseline (no code)

- [ ] **Step 1:** In `engine-asks`, symlink `node_modules` from the main checkout. Create a base worktree: `git worktree add --detach <scratch>/base e6bae59`, with a `node_modules` symlink of its own.
- [ ] **Step 2:** Extract the batch-32 verdicts for a checker-on replay of the new cases: `python3 replays/2026-10-16/close-hold/to-verdicts.py "test runs/batch-32-aldermoor-oct-19-runs-1-5" > replays/2026-10-19/engine-asks/b32a-verdicts.jsonl`, and the same for Larkspur.
- [ ] **Step 3:** Baseline replays from `base`: `replay31.sh base` (whole corpus, checker off and on; the batch 28–31 runs are selected from it by path), plus `replay-new.sh base`. Run `scripts/fact-check.ts --root=<out>/base-on` and save the F1–F4 counts.
- [ ] **Step 4:** Confirm that `base` replayed against itself is identical (0 changed decisions, 0 changed lines). A replay that isn't deterministic voids every later proof.

### Task 1: Guard B — the colon, and asks after the brainstorm (§15 q, part 1)

**Files:** Modify `lib/orchestrator/request-signal.ts` (`CUES`, new `lateAskCues`) and `lib/orchestrator/plan-turn.ts:712-715` (`requestCues`). Test: `tests/orchestrator/request-signal.test.ts`.

**Interfaces:** Produces `lateAskCues(text: string, phase: Phase): string[]`, which returns `['addressed ask']` when `addressedAskSentences(text, phase, { closing: true })` is non-empty and `[]` otherwise.

**The change:**
- The "I'd want the" cue also accepts a colon: `(want|need|like)\s*:`. This catches "One thing I'd want: how…" (Aldermoor Marisol t7, Jasmine t5, Marcus t5).
- From BRAINSTORM on, Guard B uses `lateAskCues`, not nothing. That means addressed asks with rhetorical self-questions filtered out (the close's filter), so "I'd want…" next steps stay out.
- `doKnowAsk` also takes "whether/if" plus a data noun or a case figure. `asksAddressed` takes a question naming a figure the candidate was given ("does the $80 million hold flat…?"). This catches Aldermoor Marcus t19.

- [ ] **Step 1: Failing tests.**
  - `explicitRequestCues("One thing I'd want: how the eligible pool has been trending")` contains `"I'd want the"`.
  - `lateAskCues("Do we know whether the 30% is negotiable…? And does the $80 million hold flat across all five years?", 'BRAINSTORM')` is non-empty.
  - `lateAskCues("Is it worth it? Yes — the payback is under two years.", 'RECOMMENDATION')` is `[]`.
  - `lateAskCues("Next steps: I'd want the store-level data to confirm.", 'RECOMMENDATION')` is `[]`.
- [ ] **Step 2:** Run `npx vitest run tests/orchestrator/request-signal.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement. In `plan-turn.ts` (with `WANT_ASK_PHASES` exported from `request-signal.ts`): `requestCues = WANT_ASK_PHASES.includes(currentPhase) ? explicitRequestCues(candidateText) : lateAskCues(candidateText, currentPhase)`.
- [ ] **Step 4:** Tests pass. Full suite, tsc and eslint are clean.
- [ ] **Step 5: prof-001 proof.** Replay batches 28–31, checker on and off.
  - **Expected differences:** only turns where `requestCues` is newly non-empty. The replay serves the recorded turn again on the regeneration, so a regenerated turn that declares nothing hits `missedTwice` and fulfils open asks. List every such turn with its data-decision diff.
  - **Not provable free:** what the model declares after the regeneration. That is shown only by the wave.
  - Also list the number of turns that now carry a Guard B hold, since each one waits for its declarations (latency).
- [ ] **Step 6:** Commit `fix(orchestrator): guard B reads "I'd want:" and addressed asks after the brainstorm`.

### Task 2: An ask with no item is answered; a "basis" ask isn't remapped (§15 q, part 2)

**Files:** Modify `lib/orchestrator/data-decisions.ts:308-313` and `:143` (`outsideAskScope`), and `lib/orchestrator/fact-check.ts:613` (`FURTHER_CUT`) and `:676` (`FINER_WORDS`). Test: `tests/orchestrator/data-decisions.test.ts` and `tests/orchestrator/fact-check.test.ts`.

**Correction to the handoff:** Aldermoor Marcus t5 was not silent. Code said its generic `unmapped_defer` line ("Let's settle your structure before we get into the data."). It answers nothing, and the case doesn't hold the trend, so the ask is never answered.

**The change:**
- **Item-less deferrals (needs your ruling R1).** An explicit item-less deferral that survives the remap (`turn-data.ts:194`, names then covers) is refused, the same as an item-less release. The `unmappedDefer` line goes.
- **Basis asks.** A new `BASIS` qualifier (`basis|source|where … comes? from|how (firm|solid|reliable)|methodology|assumptions? behind|validated|evidence (for|behind)`). `outsideAskScope` treats it as out of scope unless the item's value says where the figure comes from (`/\b(?:based on|comes? from|derived from|benchmark(?:ed)? (?:on|against))\b/`). `BASIS` is also added to `FURTHER_CUT` and `FINER_WORDS`, so the remap doesn't map the ask straight back to the item. Larkspur Marisol t27 then gets a true refusal of the basis, not the plan restated.

- [ ] **Step 1: Failing tests.**
  - `decideData` with `{what: "Aldermoor's European Kelvexa sales trend since 2022", itemIds: [], explicit: true, respond: 'defer'}`: `refusals` contains it and `unmappedDefer` is `false`.
  - `outsideAskScope("Basis for the 70% load factor estimate on the new routes", prof002.new_routes_plan, names)` is `true`.
  - `outsideAskScope("the 70% load factor on the new routes", …)` is `false`.
  - `coverageOf("basis for the 70% load factor estimate", fb).items` is `[]`.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests and suite pass. Run `scripts/anchor-audit.ts --asks=evals/anchor-asks-batch32.json` and `--asks=evals/anchor-probes.json`: no ask may change mapping except the basis asks (free).
- [ ] **Step 5: prof-001 proof.** Expected differences: turns with `unmappedDefer` in batches 28–31, and asks carrying a `BASIS` word. List each with its old and new data line.
- [ ] **Step 6:** Commit `fix(orchestrator): item-less deferrals refused, basis asks outside an item's scope`.

### Task 3: F3 and the live false-refusal guard read covers (§15 r)

**Files:** Modify `lib/orchestrator/fact-check.ts:682` (`findFalseRefusals`) and its callers `lib/orchestrator/stream-turn.ts:165`, `scripts/fact-check.ts:118,180`. Test: `tests/orchestrator/fact-check.test.ts` and `tests/orchestrator/stream-turn.test.ts`.

**Interfaces:** `findFalseRefusals(text, fb, revealed, opts?: { covers?: boolean }): RefusalFlag[]`. With `covers`, a refused object with no name hit goes through `coverageOf(x, fb)`. Its ledger cover items and prompt facts become the flag's `items`. `turn-data.ts` and `anchor-audit.ts` keep the default (`false`), since they read covers themselves.

- [ ] **Step 1: Failing tests.**
  - With `covers: true`, "As for competition on Ashford and Brookhaven, that's not something I have." flags `new_routes_context` (prof-002).
  - "As for competition on Ashford broken down by month, that's not something I have." flags nothing.
  - Without `covers`, the first sentence still flags nothing.
  - `vetoReason` on the first sentence in the question field returns `'false_refusal'`.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement. `stream-turn.ts` and `scripts/fact-check.ts` pass `{ covers: true }`.
- [ ] **Step 4:** Tests and suite pass.
- [ ] **Step 5: prof-001 proof.**
  - Run fact-check on the base and after replays and on the original corpus. List every new F3 flag in batches 28–31 and 32, each marked true or false refusal by reading the turn.
  - Replay diffs: only sentences newly withheld as `false_refusal`.
  - Risk to watch: a withheld true refusal leaves an ask unanswered. Any such case is listed as a regression.
- [ ] **Step 6:** Commit `fix(fact-check): F3 and the live refusal guard read covers`.

### Task 4: A stage deadline yields to a checker line once (§15 h; the 15 Oct rule)

**Files:** Modify `lib/orchestrator/plan-turn.ts:724-830` (`byTime`, `recAskByTime`, `stageDeadlinePassed`, `analysisByTime`, `requiredExhibitDue`, the flags write), and `lib/orchestrator/session-runner.ts:455-490` (`codeWrittenTurn`). Test: `tests/orchestrator/stage-deadlines.test.ts` and `tests/orchestrator/due-stage-checker.test.ts`.

**Interfaces:**
- Session flag `flags.stageYielded: Partial<Record<'rec_ask' | 'exhibit' | 'brainstorm' | 'analysis', true>>`, set on the turn a passed deadline yields to `mathLineNow`.
- `byTime(deadlineMs, stage)` becomes `elapsedMs >= deadlineMs && (!mathLineNow || stageYielded[stage])`.
- New plan state `stageCheckerLine: { id: string; key: string; line: string } | null`, the checker correction a forced stage turn says first.

**The change.** On the turn after a yield, the stage goes even with a math line due:
- a checker **correction** is said first, in the code-written turn's `say`, booked like a model-turn checker line (attempt, `closed`, handled);
- a checker **probe** is held with `flags.mathChecker.held = sel.id`, so it goes out first on the next model turn and doesn't expire;
- a misquote correction already rides on the turn's data line (`turn-data.ts`), unchanged.

- [ ] **Step 1: Failing tests (`planTurn` fixtures).**
  - The exhibit deadline passed, with a checker probe selected on two turns in a row. Turn 1 is kind `model` with `stageYielded.brainstorm` set (or `.exhibit`, whichever is owed). Turn 2 is kind `stage_brainstorm`, `flags.mathChecker.held` equals the probe's id, and the probe isn't said.
  - The same with a correction on turn 2: the turn's `say` is the correction line, and the key is in `closed` after the turn.
  - With no math line, the stage fires on the first turn past the deadline (unchanged).
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests and suite pass.
- [ ] **Step 5: prof-001 proof.**
  - Expected differences: only runs where a deadline passed while a math line was due on two or more turns in a row. The stage then moves one turn after the first yield.
  - List each with its old and new stage turn, and confirm the held probe goes out on the following model turn.
  - Then the batch-32 checker-on replay (Task 0, Step 2): Aldermoor Marisol must ask the brainstorm and hand over the survey exhibit before the time warning.
- [ ] **Step 6:** Commit `fix(orchestrator): a stage deadline yields to a checker line once`.

### Task 5: The correction follows the wrong input (§15 o)

**Files:** Modify `lib/orchestrator/math-checker-live.ts` (`isStale` :222-284, `planCheckerFlags` :530-600, the code gate :620+), plus a new helper in the same file. Test: `tests/orchestrator/math-checker-live.test.ts`.

**What the evidence shows** (`ev.py` on Aldermoor Marisol). The wrong input, `net_price@2000`, was raised at t9, t13, t15, t21 and t23. Every time it was dropped as **stale "restated"**: the next message had a span of the net-price step ("List is $10,000 per patient per year", or the $2,000 itself again). Meanwhile $400M, $80M and 150,000, all built on $2,000, each took their own probes and corrections. So two causes:

- **(a) The restated-stale rule needs a ruling (R2).** A later message that still carries the claim's own wrong figure (`namesClaim(text)`) means the error stands, so the claim stays eligible (the key dedupes across messages). Only a step span with another figure counts as a revision ("restated", stale). This is the opposite of the deferred stale-check item (j), which is a missed redo. I include it because (o) can't work without it.
- **(b) Root linking.** A flagged claim D is derived from root R when D's span carries R's wrong figure, and:
  - R is a registered error key of another step (`stepOfKey` differs);
  - the figure isn't a case figure (`caseNumbersOf`).

  While R is open, D is not probed. It is handled with the new outcome `'derived'` ("built on <R key>'s figure — the probe follows the input"). When R is closed (corrected or left for the report), D closes as `'unresolved'` ("built on a closed input"). The code gate gives the same outcome to code's own finding on such a claim (`GateOutcome` gains `'derived'`). A D with several roots yields to the earliest.

**Interfaces:**
- `rootOf(span: string, key: string, keys: Record<string, { figures: number[]; since: number }>, caseFigures: number[]): string | null`. Returns the root key, or `null`.
- The `decision` outcome union gains `'derived'`. `cmp.py` reads outcomes as strings, so it needs no change.

- [ ] **Step 1: Failing tests (fixtures from Aldermoor Marisol's verdicts).**
  - `isStale(claim $2,000 net price, ["List is $10,000 per patient per year. … so $2,000 realized …"])` is `null`.
  - `isStale(same, ["List is $10,000 per patient per year, so net is $8,000."])` is not `null` (the right figure).
  - With `net_price@2000` open, a claim "40,000 × $2,000 = $80 million" gets outcome `'derived'`, and the `net_price@2000` claim is selected.
  - With `net_price@2000` closed, the same claim gets `'unresolved'` with reason "built on a closed input".
  - A claim "40,000 × $8,000 = $300 million" (right input, wrong product) is selected on its own key.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement (a), then (b).
- [ ] **Step 4:** Tests and suite pass.
- [ ] **Step 5: prof-001 proof.** This task will change the most on prof-001, since bean share → points → margin are chained figures.
  - `cmp.py` on batches 28–31 checker-on. List every changed decision and classify it:
    - **(a)-intended:** stale → eligible, with the restating message carrying the figure;
    - **(b)-intended:** a derived claim yields, and its root was probed or corrected;
    - **regression:** anything else, including a root never said.
  - Then the batch-32 checker-on replay: Aldermoor Marisol's $2,000 must be probed by about t9 and corrected within two probes, and $400M, $80M and 150,000 must get no probes of their own.
  - Report the two parts' counts separately, so (a) can be ruled on alone.
- [ ] **Step 6:** Commit `fix(checker): the correction follows the wrong input; a carried figure isn't stale`.

### Task 6: Fact-check the "Better" answers (§15 m)

**Files:** Create `lib/scoring/better-audit.ts`. Modify `lib/scoring/verifier.ts` (`Claim.section`, `collectClaims`, `applyVerdicts`, the prompt), `lib/scoring/score-session.ts:231`, and the renderers `components/report-card.tsx`, `app/api/report/[sessionId]/pdf/report-pdf.tsx` and `scripts/live-run.ts:~535` (no "Better:" when it is empty). Test: `tests/scoring/better-audit.test.ts` (new) and `tests/scoring/verifier.test.ts`.

**Interfaces:** `auditBetterFigures(rubric: RubricScores, caseData: Case): { dimension: RubricDimensionKey; index: number; figure: string }[]`. It lists the figures in each `betterResponse` that are none of:
- a case figure (ledger, exhibit or prompt, at any scale);
- a math-step answer or alternative;
- one binary operation (+ − × ÷) of two of those, within 1%;
- a year, a small count (≤ 10), or a figure inside an "if / assume / say" clause.

**The change:**
- The verifier gets `betterResponse` as claims (section `'betterResponse'`), with the audit's figures as hints ("FIGURES NOT FOUND IN THE CASE DATA"). The instruction: unsupported when it states a figure or fact the case data or the transcript contradicts (recompute); a labelled hypothetical is fine.
- An unsupported Better answer is blanked (`''`), and its "moment" stays.
- **Strengths are also unchecked** (Aldermoor Marisol's "proactively withdrew a stale figure"). Your brief names only Better answers, so strengths are R3: add `wentWell` to the verifier (an unsupported point is dropped) or leave them.

- [ ] **Step 1: Failing tests.**
  - `auditBetterFigures` on "$10 more per passenger on roughly 3 million passengers is about $30M" (prof-002) lists `3 million` and `$30M`.
  - On "$10 more on about 840,000 passengers is about $8.4M" it lists nothing.
  - On "If we assume a 5% price rise, revenue rises about $X…" it doesn't list 5.
  - `applyVerdicts` with an unsupported betterResponse claim blanks only that `betterResponse`.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests and suite pass.
- [ ] **Step 5: Proof.** Scoring isn't replayed, so:
  - run `auditBetterFigures` over every saved scored report: batch 32 (10 reports, about 80 Better answers) and the scored prof-001 reports of batches 28–31, parsed from the `.md` reports' "Better:" lines (free);
  - list each flag as false figure or acceptable;
  - expect Larkspur Tyler's and Marcus's Better answers flagged, and a short list on prof-001, each read by hand.
  - The verifier's LLM part shows only in scored runs of the waves.
- [ ] **Step 6:** Commit `feat(scoring): Better answers fact-checked`.

### Task 7: No rating without evidence (§15 l)

**Files:** Modify `lib/scoring/caveat-floor.ts`. Test: `tests/scoring/caveat-floor.test.ts`.

**The change.** A dimension with a `coverageCaveat` and no quoted evidence (no quote in `wentWell` or `needsWork`) is `notAssessed`, whatever its rating (meets_bar and strong included). Today only needs_work is checked. Aldermoor Marisol's Creativity (caveated, meets_bar, no quote) becomes not assessed.

**R4:** your brief says "the caveat floor applies to any rating with no evidence". Should that also cover a dimension *without* a caveat that has no quotes? Stage 5 of `case-onboarding.md` counts any evidence-free rating as a false statement. My default is caveated dimensions only, as in §15 (l).

- [ ] **Step 1: Failing tests.**
  - A caveated meets_bar with empty quotes gives `notAssessed: true` and is listed in `unassessed`.
  - A caveated strong with empty quotes gives the same.
  - A caveated meets_bar with one wentWell quote is unchanged.
  - Uncaveated, it is unchanged (or, if R4 is "any", not assessed).
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests and suite pass.
- [ ] **Step 5: Proof (free).** Scan every saved scored `.md` report (batches 28–32) for caveated dimensions with a rating and no quotes, and list them. Expect Aldermoor Marisol's Creativity, and on prof-001 any hits read by hand.
- [ ] **Step 6:** Commit `fix(scoring): a caveated dimension with no evidence is not assessed, whatever its rating`.

### Task 8: Decode literal `\uXXXX` (§15 k)

**Files:** Create `lib/decode-escapes.ts` (beside `lib/number-words.ts`) (`decodeLiteralEscapes(s: string): string`, which replaces `\\u([0-9a-fA-F]{4})` with the character). Modify `lib/agent/models/turn-stream.ts` (`flush` and `endValue`, applied to strings recursively) and the model turn's final parse (where `ModelTurn` fields are read: `say`, `question`, `requests[].what`). Test: `tests/agent/turn-stream.test.ts`.

**Sources found** (every interviewer turn in the corpus):
- code's deferral line echoing the model's `requests[].what` (batch 22, 27c2d0fb t6);
- the model's `say` (batch 32, 6e5a1c90 t10 and t24);
- the model's `question` (batch 28, Owen 4e94b924 t12, "—").

Decoding at the parse covers all three before any guard reads the text. That matters: "–" holds the digits 2013, which the provenance check could read as a figure. Record files store the decoded text, since they store what is said.

- [ ] **Step 1: Failing test.** A stream of `{"say":"Hub\\u2013Lakeport is out.","question":"What about cost \\u2014 beyond pricing?","requests":[{"what":"Hub\\u2013Lakeport fare","itemIds":[],"explicit":true,"respond":"release"}]}` gives the sentence "Hub–Lakeport is out." and field values with "—" and "–".
- [ ] **Step 2:** Run the test. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests and suite pass.
- [ ] **Step 5: prof-001 proof.** In batches 28–31, exactly one line changes (Owen 4e94b924 t12, "—" → "—"). Batch 32 (Marisol t10, t24) and batch 22 (Marcus t6) change too. Nothing else may change.
- [ ] **Step 6:** Commit `fix(agent): decode literal \uXXXX in the interviewer's fields`.

### Task 9: The quote grammar — sentence ends, thousands, "million", arithmetic sentences (§15 p, c)

**Files:** Modify `lib/orchestrator/misquote.ts` (`FIG`, `fig()`, `itemTargets`, the `INDEXED_OR_ARITHMETIC` use at :152), `lib/orchestrator/fact-check.ts` (`quoteFits`) and `lib/orchestrator/cell-lookup.ts:58` (`parseCell`). Test: `tests/orchestrator/misquote.test.ts`, `tests/orchestrator/cell-lookup.test.ts`, and the labelled set `tests/orchestrator/fixtures/misquote-labelled.json` through `scripts/misquote-eval.ts`.

**New finding (free harness, this session):** `FIG`'s lookahead `(?![\d.a-wyz])` rejects a figure followed by the sentence's own full stop. "The shelf price is $4.49." flags nothing, while "…is $4.49 per bag." flags. That was the unknown cause in (p). It also hits prof-001: "The ticket is $6.90." is never read as a quote, while "COGS is 61%." is.

**The change:**
1. **Sentence ends.** The lookahead becomes `(?!\d|\.\d|[a-wyz])`, so a full stop ends a figure.
2. **Thousands, (c) (R5).** The number becomes `\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`, with commas dropped when parsed. The same goes in `quoteFits`.
3. **Scale.** `m|mn|million|bn|b|billion|k|thousand` are no longer refused. They are captured as a scale, and `itemTargets` reads each item figure's scale from the word after it in the item's value. Figures compare at full scale ("$77 million" vs "$80 million"; "$1.5 million" vs the item's "$1.2 million").
4. **Arithmetic.** `INDEXED_OR_ARITHMETIC` is tested on the anchor's clause (split at `,` `;` and "so"), not the whole sentence. "Prevalence you gave is 1.5%, so 250 × 0.015 = …" reads its first clause. An anchored figure that is itself an operand is still not a quote: `quotedAfter` keeps its arithmetic pop.
5. **`parseCell`** accepts `million|mn|billion` (scale million, or ×1000 for billion), so entry-001 and launch-001 cells written "$80 million" or "250 million" become facts. The `MISREAD` 10% band is unchanged (prof-002 "$25.0M" stays out of scope, noted).

- [ ] **Step 1: Failing tests** (launch-001, entry-001, prof-002, pricing-001, with the right items revealed).
  - These flag: "The shelf price is $4.49.", "Recipe development was $1.5 million.", "Prevalence you gave is 1.5%, so 250 × 0.015 = 3.75 million." and "the $77 million annual selling cost".
  - These don't flag: "The shelf price is $3.00.", "Recipe development was $1.2 million.", "Pro CAC is $1,200", "The Lakeport cost per flight is $9,000." and "COGS is 58/110, about 53%."
  - If "the $77 million annual selling cost" doesn't flag through the cell lookup once `parseCell` reads "million", stop and report. Catching it needs a figure-before-anchor form in the grammar, which is a widening for your ruling.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement parts 1–5, one at a time. Run the labelled set (`scripts/misquote-eval.ts`) after each; precision and recall may not fall on the tuning set.
- [ ] **Step 4:** Tests and suite pass.
- [ ] **Step 5: prof-001 proof.**
  - Expected differences: new misquote flags on figures that end a sentence (part 1). List every one with its sentence and whether the figure is wrong. The gate releases a correction only on a matching checker flag, so list the delivered-line diffs separately.
  - Parts 2–5 should change nothing on prof-001 (no thousands, no "million"). Any change there is listed as a regression.
- [ ] **Step 6:** Commit `fix(misquote): a figure before a full stop, thousands, "million" and arithmetic clauses`.

### Task 10: Whole-bundle verification and docs (free)

- [ ] **Step 1:** Full replays from `engine-asks` tip vs `base`: `replay31.sh after` (batches 28–31 selected), `replay-new.sh after`, and batch 32 checker-on. Run `cmp.py`, `diffrep.py` and fact-check F1–F4. The union of differences must equal the per-task lists. Anything new is an interaction, listed and explained.
- [ ] **Step 2:** Docs, in one commit:
  - PRD §15 (c), (h), (k), (l), (m), (o), (p), (q), (r): built or ruled, with the rulings as you made them;
  - PRD §16 entry;
  - PRD §8 "Stage deadlines" paragraph (the one yield);
  - `docs/case-onboarding.md`: the "Shared-engine gaps" list, the tracker's Next line and a lessons-log line;
  - progress.md "## Now".
- [ ] **Step 3:** Report to you with the per-task difference lists and the totals. Then wait for your go on the waves.

---

## Rulings needed before code

| # | Question | My recommendation |
|---|---|---|
| R1 | Should an item-less deferral nothing covers be refused instead of getting the generic structure line? | Yes: the line answers nothing, and after the covers remap the case doesn't hold the data. |
| R2 | (o) includes changing the "restated" stale rule: a message that still carries the wrong figure keeps the flag alive. | Yes: without it the input is never probed. It is separate from the deferred stale-redo item (j). |
| R3 | Should strengths (wentWell) be fact-checked too? | Yes, in the same verifier call (about +$0.01 a report, estimated). |
| R4 | Does the no-evidence rule apply only to caveated dimensions, or to any dimension? | Caveated only, as in §15 (l), unless you meant any. |
| R5 | Fold (c), thousands commas, into Task 9? | Yes: it is the same `FIG` edit, and prof-001 has no thousands. |
| R6 | When a Better answer is unsupported, blank only the Better answer or drop the whole missed opportunity? | Blank only the Better answer. |
| R7 | On a forced stage turn, should a checker correction go first in `say` and a probe be held to the next model turn? | Yes, as your 15 Oct rule says. |
| R8 | Which prof-001 runs in wave A are scored? | 3 scored: Tyler, Marisol, Jasmine. |
| R9 | Wave B runs 20 sessions at once, and batch 32 ran 10. Keep that, or split it? | Keep it as one wave, and stop it if rate limits show in the first minutes. |

## Cost estimate — verification run (two waves, after Task 10 and your go)

All figures use 19 Oct prices and the measured batches. Pricing and launch have never run, so their per-run cost is the Larkspur/Aldermoor figure.

**Wave A — prof-001, 10 runs (batch 31's personas), 3 scored, 20 minutes.**
- Measured: about $0.48 a run unscored, plus about $0.52 for scoring (batch 31: $6.29 for 11 runs, 2 scored).
- Expected: 10 × $0.48 + 3 × $0.52 ≈ **$6.40**.
- Worst case, +35% for longer runs, Guard B regenerations and checker retries: about **$8.60**. If all 10 are scored, about $10 expected and $13 worst.
- **Proposed cap: $10** (3 scored).

**Wave B — the four new cases in parallel, 5 personas each (7, 64, 57, 24, 40), all scored, 25 minutes. One batch per case.**

| Batch | Basis | Expected | Worst case | Proposed cap |
|---|---|---|---|---|
| prof-002 Larkspur | batch 32: $6.71 | ≈ $6.7 | ≈ $8.5 | $10 |
| entry-001 Aldermoor | batch 32: $5.99 | ≈ $6.0 | ≈ $7.8 | $10 |
| pricing-001 Quillpath | unmeasured, $1.2–1.4 a run | ≈ $6–7 | ≈ $9 | $10 |
| launch-001 Hollis Bay | unmeasured, $1.2–1.4 a run | ≈ $6–7 | ≈ $9 | $10 |
| **Wave B** | | **≈ $25–27** | **≈ $34** | **$40** |

- **Both waves:** about $31–34 expected, about $43 worst case, caps adding up to $50.
- **The bundle's own cost:** a Guard B regeneration is one more Sonnet turn where it fires (about $0.01–0.02 each); Better answers and strengths in the verifier add about $0.01–0.03 a scored report (estimated, not measured). Both are inside the margins above.
- **Not included:** the free replays, and anything after the waves (a re-run or anchor work) needs its own go.
