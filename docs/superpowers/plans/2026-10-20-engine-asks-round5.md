# Shared-engine bundle, round 5 (Lorenzo's rulings on the B1 + B2 list) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the case-data and shared-engine fixes Lorenzo ruled on from waves B1 and B2 — D1–D7, E1–E7 (E5 as a/b/d, E6 at figure level), A1–A5 and A7 — each proven on the free replay. Stop after the proof: no waves, no push, no deploy.

**Architecture:** Case data first (covers, exhibits), then the low-risk engine lines (withhold, units, verifier, scope, stage credit), then the riskier data-decision and checker changes, each with a full replay and a list of every changed prof-001 line.

**Tech Stack:** TypeScript (Next.js), vitest, zod case schema, the replay runner (`tests/replay/runner-corpus.replay.test.ts`).

**Spec:** Lorenzo's rulings on the B1 + B2 list (20 Oct), quoted per task. The list is https://claude.ai/artifact/YEhWX5kwLvgmigCR9a2sux (copy: `.superpowers/sdd/2026-10-19-engine-asks-round4/b1-b2-findings.html`). Gradings: `Case Interview Runs/test runs/batch-34-{larkspur,aldermoor}/hand-grading.md`, `…/batch-35-{hollisbay,quillpath}/hand-grading.md`. Earlier plans: `2026-10-19-engine-asks*.md`.

## Global Constraints

- Branch `engine-asks`, worktree `.claude/worktrees/engine-asks`, HEAD 7b41549. Nothing merged, pushed or deployed. The only paid call is the live Haiku check after Task 45 (≈ $0.07, authorized).
- One commit per task, with the full suite, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db` passing.
- Every code task has **mutation tests**: the new test fails when the fix is reverted or broken (record it in the ledger).
- Test sentences are the batch transcripts' own words, verbatim.
- Never `git add` anything under `Case Interview Runs/`. The proof tooling there stays untracked.
- Rule 1, refined (Lorenzo, 20 Oct): "a refusal is serious when the held answer never reaches the candidate, borderline when it's already in front of them (prompt or exhibit on screen)."
- **Proof chain:** `r5-base` (HEAD 7b41549, with the new slices) → `r5-g1` (after Tasks 37–43) → `r5-44` … → `r5-final`. Each proof task writes `replays/2026-10-20/engine-asks/r5-task-N.md`: every changed prof-001 decision and line, each marked intended or regression, plus the new-case changes that prove the fix. **0 prof-001 regressions and 0 new false lines** to pass.
- Ledger: `.superpowers/sdd/2026-10-20-engine-asks-round5/progress.md` (rulings, deferred minors, mutation records).

## Review Focus

1. A fix that releases more data (E1's coarse item, E5(d)'s "goes now", A4, A5) must never release an item the case holds back (release order, `requiresItems`, exhibit gating). Pinned in Tasks 44, 45 and 50 with a gated-item test each.
2. Figure-level binding (E6) must not reopen the closes round 4 got right (b33 Blake t17, the 15 Oct redo rule). Pinned in Task 46: the existing redo tests still pass, plus Blake t17.
3. The unit fix (E3) must not change prof-001's correction lines, which are in points and percent. Pinned in Task 40 with the prof-001 lines as fixtures.
4. A probe turn carrying a data line (A1) must still say its probe, and a stage turn carrying one (A2) must not lose the stage's ask for good. Pinned in Tasks 48 and 49.
5. A deferral that names the item (E5(d)) must say the item's spoken name, never a figure from its value (FR-4). Pinned in Task 45.
6. E7's forced correction must be true on the candidate's own reading (Lorenzo: "For Quillpath Marisol the true line is the row fix (\"Starter's 12-month cancellation is 40%; 21.5% is Pro's\"), never \"about 5%, not 21.5%\" against her annual reading. If code can't write a true line, it goes to the report."). Pinned in Task 47 with a test in her words.

---

### Task 36: Proof tooling for B1 and B2

- Extract checker verdicts with `replays/2026-10-16/close-hold/to-verdicts.py` for `batch-34-aldermoor-oct-20-runs-1-5`, `batch-34-larkspur-oct-20-runs-1-5`, `batch-35-hollisbay-oct-20-runs-1-5` and `batch-35-quillpath-oct-20-runs-1-5`, into `replays/2026-10-20/engine-asks/` (copy `proof.sh`, `compare.sh` and `compare.py` from `replays/2026-10-19/engine-asks/`).
- Add the slices b34a, b34l, b35h and b35q, each off and on (CK31 plus its own verdicts), to `proof.sh` and to `compare.py`'s `SLICES`. That makes 21 slices: the 13 old ones plus 8.
- Run `proof.sh r5-base` at 7b41549, then `r5-base2`, and compare the two. It must be 0/0.
- No repo change.

### Task 37: Case covers (D1–D5, D7)

Lorenzo: "Build all of D1–D7" and "Build D4/D5 anyway." Covers go in `factAnchors.covers[<item>]`. They are matched as literal phrases (`coverageOf`, `lib/orchestrator/fact-check.ts:634`), and a covered item is exempt from `request_scope` (`turn-data.ts:244`).

**Files:** `cases/entry-001.json`, `cases/launch-001.json`, `cases/prof-002.json`, `evals/anchor-probes.json`.

- D1, entry-001: `current_treatment` (and `nimbrel` where the ask names the competitor) — "treatment mix", "current treatment mix", "treatment breakdown", "breakdown by drug class", "competitor mix", "mix across treated patients".
- D2, launch-001 `retailer_support` — "store count", "how many stores", "distribution rate", "distribution reach", "stores we could reach", "stores the line gets into". **No bare "distribution"** (Lorenzo). Add the probe "distribution costs" → `variable_costs` (freight), which must stay there.
- D3, prof-002 `aircraft_leases` — "avoidable fixed costs", "whether the fixed costs are avoidable", "fixed costs avoidable", "return the aircraft".
- D4, launch-001 `why_now` — "chip volume", "chip volume trend", "chip business's volume", "declining base".
- D5, launch-001 `survey_reliability` — "forecast versus actual", "volume versus forecast", "how accurate past forecasts", "how reliable the forecast".
- D7, prof-002 `new_route_rampup`: read B1 Larkspur Marcus t23 and Jasmine t21 and add covers in their words ("first-year load risk", "load in the first year", or as they said it).
- Add each batch ask verbatim to `evals/anchor-probes.json` with its expected items: Aldermoor Marisol t13 and Jasmine t3; Hollis Bay Marcus t9, Jasmine t9, Marisol t13, Tyler t7 and Marisol t19; Larkspur Marcus t13, t23 and Jasmine t21. Also add one true-refusal probe per cover ("bags per store per week" stays refused; "the split of current treatment by class" keeps the coarse item).
- Verify with `npx tsx scripts/anchor-audit.ts --case=<id> --dry --asks=evals/anchor-probes.json` (free) for each case, and with `npx vitest run tests/cases`. Paste the before/after verdicts into the ledger.
- No prof-001 change.

### Task 38: The simulator sees exhibit notes; the restate says how the item came out (D6)

Lorenzo: "D6: (c) only. exhibitAsText sends the notes as the UI shows them. Don't move notes into rows. The restate prefix follows how the item came out: "As I mentioned" if said, "As the exhibit shows" if only on an exhibit. Check the voice room's exhibit panel shows notes too. The consistency test passes when the figures and phrases are in the cells, title or notes. Add the onboarding lesson."

Background: notes are shown in the UI (`components/exhibit-table.tsx:35-38`, used by `chat-window.tsx:133` and `voice-room.tsx:273`) but dropped by `scripts/live-run.ts:280-284` `exhibitAsText`, so the waves' simulated candidate never saw them.

**Files:** `scripts/live-run.ts` (`exhibitAsText`), `lib/orchestrator/data-decisions.ts` (restate rendering, :287-291, 346-348, 511), `lib/orchestrator/phrasing.ts` (`restate` pool, :54-61; a new `restate_exhibit` pool), `lib/orchestrator/data-ledger.ts` (`markExhibitReveals`, :53-61 — record how each item came out), `tests/cases/consistency.test.ts`.

- `exhibitAsText` appends the notes below the rows, as the UI shows them (a line after the table, e.g. `Note: <notes>`).
- The ledger records each revealed item's source: said (a release or restate line) or exhibit-only (`markExhibitReveals`). An item said later becomes "said".
- The restatement lead-in follows the source: the `restate` pool ("As I mentioned: …") for said items, a new `restate_exhibit` pool for exhibit-only items (first version "As the exhibit shows: …", five versions, held to the recognizer tests in `tests/orchestrator/code-line-variants.test.ts`; register it with every recognizer that reads restate lines).
- Persist the source with the revealed rows (old rows read as "said") so replays of saved runs read as before.
- Check that the voice room's exhibit panel renders notes (`voice-room.tsx`, `lib/voice/livekit-agent.ts:150` passes them): a component or unit test, or a recorded read of the code if no test harness exists for it.
- Consistency test: every `coversLedgerItems` id's figures and key phrases appear in the exhibit's cells, title or notes.
- Mutation tests:
  - an exhibit with notes → `exhibitAsText` contains the notes text;
  - Quillpath Raj t22's restate of `price_test_notes` (exhibit-only) → "As the exhibit shows: …"; an item said before → "As I mentioned: …";
  - a saved run's revealed rows without a source → "said".
- Onboarding lesson (Task 52 docs commit, or this task's): exhibit notes are seen by real candidates; the simulator must see them too, and a restate names where the item came from.

### Task 39: Withhold a model refusal for an item code releases in the same turn (E2)

B1 Larkspur Tyler t22: "Understood. I have no ramp assumption to give you yet." then code's `new_route_rampup` line (Lorenzo: false, not serious).

**Files:**
- `lib/orchestrator/settle-turn.ts` (`keep()`, :207-232, gate built at :197-204);
- `lib/orchestrator/stream-turn.ts` (`vetoReason`, :151-203, `holdForRequests`);
- `lib/orchestrator/fact-check.ts` (`findFalseRefusals`, :711).

- A model `say` or question sentence that refuses or defers (`findFalseRefusals(sentence, fb, new Set())` names an item, or `data_talk` refusal wording names it) is withheld when that item is in this turn's `decisions.releases`, `restates` or shown exhibit's covers. Veto reason `refuses_released`.
- In Stream: when the model's `requests` declare a release for that item, hold the sentence until the requests close, then apply the same test.
- Mutation tests:
  - Tyler t22 verbatim → the refusal sentence is withheld and the ramp line is said;
  - the same sentence with no release that turn → kept, and the existing false-refusal path still applies;
  - a refusal of a different item in the same turn → kept.

### Task 40: Units and scale in code lines (E3)

Lorenzo: "Unit/scale slips in code lines: false, not serious. "$210" for $210k counts too."

**Files:**
- `lib/orchestrator/math-checker.ts` (`codeCorrection`, :437-476; `FIGURE_SAID`, :348-351);
- `lib/orchestrator/math-checker-live.ts` (`figureWritten`, :561-565; `claimFigures`/`checkerKey`, :106-113, 156-160);
- `lib/orchestrator/recompute.ts` (`figureAsWritten`, :158-162);
- `lib/cases/schema.ts` (unit enum, :82);
- `cases/pricing-001.json` (ratio steps).

- `codeCorrection` reads the step's `scale`. A `usd` step with `scale: 'million'` and a bare candidate figure says "$9 million", not "$9". **The "not X" side carries the same unit and scale** (Lorenzo: "about $9 million, not $8.8 million").
- Add `'ratio'` to the step unit enum and mark pricing-001's LTV/CAC steps `unit: 'ratio'`. A ratio line says "about 2 times" (no "$"). "Theirs" for a ratio step is the figure written with "x" or "times". The flag key takes the step-unit figure, not the first number (`starter_ratio@2.5`, not `@750`).
- `figureWritten` and `figureAsWritten` keep a k / K / thousand suffix ("$210k"), and M / million / bn / billion suffixes as well.
- The grammar "costs … is" stays logged (L14).
- Mutation tests:
  - Hollis Bay Tyler 9:1 (candidateValue "8.8", step launch_costs_total) → "… about $9 million, not $8.8 million." (or no "not X" if own-quantity strips it);
  - quotes: "$4.5M", "$4.5 million", "$1.2bn" keep their suffix;
  - Quillpath Marcus 13:3 ("$750; 2.5x", starter_ratio) → "… about 2 times." and key `starter_ratio@2.5`;
  - Quillpath Tyler 25:7 ("$210k") → quote "$210k";
  - fixtures: three prof-001 correction lines (points, percent, price rise) are byte-identical before and after.

### Task 41: The verifier checks what the candidate said (E4)

Reports in B1: Larkspur Marisol's "the 12-month turnaround question also surfaced only then"; Aldermoor Marcus's "claiming Kelvexa is 'priced above the incumbent'" (a conditional).

**Files:** `lib/scoring/verifier.ts` (rules list :164-170, `[wentWell]` rule :174), `tests/scoring/verifier.test.ts`.

- Add the rule: "Check every statement that the candidate said, never said, claimed, raised or asked something against the quoted turns. A statement the transcript contradicts is unsupported. Read a conditional ("if we're priced above…") as a conditional, not a claim."
- Prompt tests: the rule text is present, and both B1 claims plus their transcripts are rendered into the prompt.
- Proof: the prompt test only. Its effect shows only in a paid re-score or the next scored wave; say so in the report.

### Task 42: One-off cost against an annual item (A3)

B1 Aldermoor Marisol t23: "Do we know the one-off cost to stand up the US team, separate from the $80M annual?" → Option A's annual line restated.

**Files:** `lib/orchestrator/data-decisions.ts` (`CUT`, :120; `outsideAskScope`, :143-166).

- "one-off", "upfront", "up-front", "setup", "set-up" and "start-up" costs asked against an item whose value states an annual or monthly figure only are a finer cut. Combined with Task 44 (E1), the coarse item goes with "I don't have <the finer cut>."; until then, today's refusal path applies.
- Mutation tests: Marisol t23 verbatim → `option_a` out of scope; "annual selling cost" → kept.

### Task 43: Credit a reworded stage ask (A7, was L2)

Lorenzo: "credit a reworded stage ask so it isn't repeated word for word." B1 Aldermoor Raj t18 → t20 and Marcus t14 → t20: the model's paraphrase wasn't credited, and code's stage turn re-asked the case's brainstorm word for word.

**Files:** `lib/orchestrator/stage-evidence.ts` (`stageQuestions`, :104-121; `updateStages`, :123-187), `lib/orchestrator/brainstorm.ts` (`asksCaseBrainstorm`, :56-75).

- Trace why both turns failed: question not heard, below the 60% overlap, in `say`, or held for the exhibit. Record which in the ledger.
- Credit the brainstorm when a heard model sentence ends in "?" and shares the case ask's key content words (the subject and the verb's object, e.g. "reduce the risk of a slow start"). Use a stem match and a rule that admits both paraphrases. A sentence in `say` counts only if it is the turn's last question.
- Mutation tests:
  - Raj t18 and Marcus t14 verbatim → `brainstormAsked` true;
  - a question that only mentions the topic ("What are the risks of a slow start?") → false;
  - prof-001's brainstorm credit tests unchanged.
- **Proof r5-g1** (after this task): compare.sh r5-base r5-g1, listing every changed prof-001 line.

### Task 44: A scope-emptied ask keeps the coarse item and goes through the check (E1)

B1 Aldermoor Marisol t14 and Jasmine t4 (serious). This reverses the round-2 finer-cut exception.

**Files:** `lib/orchestrator/turn-data.ts` (`refuseNow`, :236-238, 269-277, 315; the skip at :406-412), `lib/orchestrator/data-decisions.ts` (`renderDataLineParts`, :514).

- An explicit ask emptied by `request_scope` keeps its coarse items. They are released (under every existing gate: `canReveal`, order, cap, exhibit), and the finer part is refused in one line: "I don't have <the finer cut>." plus the item's data line. Its log reason is `scope_coarse`.
- With no coarse item releasable, the ask goes through the small-model check like any other refusal (`toCheck` no longer filters `refuseNow`).
- The basis-cut path is unchanged.
- Mutation tests:
  - Marisol t13 and Jasmine t3 verbatim, without D1's covers → the `current_treatment` line plus "I don't have the treatment mix by drug class.";
  - a gated coarse item → not released; check path;
  - a prof-001 finer-cut ask from the corpus → its new line, checked by hand.
- Proof r5-44.

### Task 45: The check's verdicts: already-out items, out of scope, naming the item, releasing now (E5 a, b, d)

Lorenzo: "E5: build (a) and (b). Not (c). Add (d): a deferral names the item it will deliver, not the candidate's words, and a mapped item that's releasable now goes now."

**Files:**
- `lib/orchestrator/turn-data.ts` (`itemlessDeferHeld`, :100-126, returns found ids; `turnDataChecked`, :129-150; cache `plan.state.deferChecks`);
- `lib/orchestrator/data-decisions.ts` (`renderDataLineParts`, `spokenItemName`/`promised`).

- The check's cache keeps `{ mapped, ids, outOfScope }`.
- **(b)** A mapped id `answersAsk` marks out of scope uses E1's form (Lorenzo): "I don't have <X>." plus the coarse item's line when one can be released (Task 44's path and gates). Never a bare refusal on the check's scope call alone; with no coarse item releasable, the refusal stands.
- **(a)** A mapped id already revealed (said, or on a shown exhibit) → restated through the existing restate path (cap 3), never deferred.
- **(d)** A mapped id releasable now, under every gate `turnData` applies (`gated()`, `heldForOrder`, `RELEASE_CAP`, exhibit covers), → released this turn. One not releasable yet → deferred by the item's spoken name (`spokenItemName`), not the candidate's words, and booked as an open request with its ledger id so it is followed up.
- On a wrap-up or close turn the existing "We won't get to" rules apply.
- Mutation tests:
  - Quillpath Marcus t27 ("week-by-week sign-ups", out of scope; `price_test_results` already on Exhibit 4) → "I don't have week-by-week sign-ups." with the restate of the coarse item, or the bare refusal only if no coarse item is releasable;
  - Quillpath Marcus t17, Marisol t11, Tyler t11 (item already out) → restated;
  - Quillpath Raj t11 (`upgrade_timing` not yet out) → released now, or a deferral naming "when customers upgrade";
  - a gated item → named deferral, not released;
  - the deferral line has no figure.
- Proof r5-45.
- **Then the live Haiku check** (≈ $0.07, authorized): rebuild the round-3 scratch script (per `2026-10-19-engine-asks-round3.md` Task 23: `classifyDataRequests`, prompt `Could I get ${what}?`, each case's catalog, `claude-haiku-4-5`, 1.5 s). Run it on prof-001's 34 asks plus every unmatched ask from B1 and B2 (batches 34 and 35), and pass each verdict through the new (a)/(b)/(d) decision. Report refused / restated / released / deferred / hollow / timeouts, **wrong releases, and releases that don't answer the ask**, each read by hand, in `r5-haiku-check.md`. 0 wrong releases to pass.

### Task 46: The stale reader ties each figure to its quantity (E6)

Lorenzo: "E6, both directions: the stale reader also closes flags it shouldn't (Quillpath Marisol t31 "600 customers" closed her $900 LTV flag; Tyler t29 "0.20 × $4,000" closed the 4× ratio, and $676 at $60 closed $405 at $40). Don't widen the synonym match. Tie each figure to its quantity at the figure level (L7's residual) and prove it on both the missed and the false-close cases."

**Files:** `lib/orchestrator/math-checker-live.ts` (`isStale`, :263-342: `names`, :298; `forQuantity`, :301; `redoneToRight`, :302-304; the rebase branch, :320), `lib/orchestrator/own-quantity.ts` (`tailsOf`, :81-92), `lib/scoring/math-spans.ts` (cue window, :80-137).

- Each number in a later message is bound to the quantity phrase it modifies: the noun phrase right after it or right before it ("$9.0 million" in "fixed costs … = $9.0 million"; "LTV $676"), using the cue window or `tailsOf`, not any quantity word in its sentence. A figure closes a flag only when it is bound to the claim's own quantity, and for pricing to the same price.
- Message-level `namesClaim` and `redoneToRight` become figure-level the same way.
- No engine-wide synonyms. Where a miss is vocabulary, add that case's synonym to the step's cues in the case JSON (Lorenzo: "fixed costs" for launch-001's `launch_costs_total`), with a case test.
- Mutation tests, verbatim:
  - false closes → not stale: Quillpath Marisol t31 "600 customers" vs the $900 LTV flag; Tyler t29 "0.20 × $4,000" vs the 4× ratio; "$676" at $60 vs "$405" at $40;
  - misses → stale where the restatement is bound to the quantity: Hollis Bay Tyler t11 "$9.0 million" vs the 8.8 flag; t13 "$4.5 million of first-year profit" vs $3.9M; Aldermoor Tyler t13 "$240 million" vs $225M;
  - the residuals: b33 Marisol 15:2, b30 Blake 23:0, b32 Larkspur Marisol 17:2;
  - kept: b33 Blake t17 not stale; the existing redo tests.
- Proof r5-46.

### Task 47: A third probe on one input is a correction (E7, serious)

Lorenzo: "Quillpath Marisol's probe chain: serious (severity.md, the same probe 3+ times: t6, t12, t18)."

**Files:** `lib/orchestrator/math-checker-live.ts` (`planCheckerFlags`, :904-931; `probesOf`, :352-362; `rootOf`/`rootFrom`, :193-202, 826-860), `lib/orchestrator/plan-turn.ts` (`stepProbes`, :1102-1111), `lib/orchestrator/settle-turn.ts` (undo, :631-636).

- Count probes per input: a misread input figure (the candidate value at the root of a chain, here 21.5% as Starter churn and 40% as Pro's) collects every probe on it or on a claim built on it (`rootFrom`), by code or by the model (`probesOf`).
- At two, the next code line on that input is the correction of the input, **through own-quantity framing** (`framedCorrection`). It must be true on the candidate's own reading: for Quillpath Marisol, the row fix ("Starter's 12-month cancellation is 40%; 21.5% is Pro's."), never "about 5%, not 21.5%" against her annual reading. Where code can't write a true line, the flag goes to the report (`unresolved`) and no third probe is said.
- Persist the counter beside `stepProbes`, with the same undo when a line isn't heard.
- Mutation tests, from Quillpath Marisol's verdicts:
  - the input is corrected by the third probe turn at the latest, and no third probe on 21.5% or 40% is said;
  - Review Focus 6, in her words (t7 "21.5% is the twelve-month cancellation figure from the Starter cohort … I used it as the annual churn for Starter"): the line is the row fix; a line "about 5%, not 21.5%" fails the test; with no true line possible, the flag goes to the report;
  - a single claim with two probes and no chain → today's behavior;
  - the b28–b33 probe-cap tests unchanged.
- Proof r5-47.

### Task 48: A probe turn carries the answer to the candidate's ask (A1)

B1 Larkspur Marisol t11 → t12 and t25 → t26: code's probe took the turn and her ask got nothing.

**Files:** `lib/orchestrator/session-runner.ts` (ask detection, :329-366), `lib/orchestrator/request-signal.ts` (`addressedAskSentences`, `matchAskDetections`), `lib/orchestrator/settle-turn.ts`.

- Trace both turns first: did the model declare nothing, or did code's question replace a declared answer? Record which in the ledger.
- On a turn whose question code replaced with a probe, the candidate's addressed ask sentences that no declared request covers are detected as on code-written turns. They go through `turnDataChecked`, so the data line (release, refusal or check) is said between `say` and the probe.
- Mutation tests:
  - Marisol t11 → a refusal (elasticity isn't held) plus the probe;
  - Marisol t25 → a refusal plus the probe;
  - a probe turn with no ask → unchanged.
- Proof r5-48.

### Task 49: A stage turn answers a held-data ask (A2)

B1 Aldermoor Tyler t21 → t22: the brainstorm stage turn dropped "How long Kelvexa's US exclusivity/patent protection lasts" (`patents`, held).

**Files:** `lib/orchestrator/session-runner.ts` (`codeWrittenTurn`, :455-489; `matchAskDetections`), `lib/orchestrator/request-signal.ts`, `lib/orchestrator/settle-turn.ts` (`stageWaited`, :514-519).

- Trace why the detection was dropped, and fix the match so a detection whose ledger ids are held and whose source sentence is a question is kept.
- When data goes out on `stage_brainstorm`, the stage's ask follows in the same turn. It is not deferred to a later turn, so it can't be lost at a time-up.
- Mutation tests:
  - Tyler t21 verbatim → the patents line plus the brainstorm ask;
  - a dropped "want" (not a question) → still dropped.
- Proof r5-49.

### Task 50: An explicit ask the model replaced gets its own answer (A4)

Hollis Bay Jasmine t5 → t6: "how many bags of chips does Hollis Bay sell a year?" became an offer of the planning assumptions.

**Files:** `lib/orchestrator/turn-data.ts`, `lib/orchestrator/request-signal.ts`, `lib/agent/interviewer.ts` (Guard B, :77-99, for comparison).

- After the model's requests close, any addressed ask sentence that no explicit declaration covers (by item or by words) goes to the item-less check (refuse, restate, release now or name, per Task 45). The model's offer still goes out.
- Mutation tests:
  - Jasmine t5 → matches D4/E1: the chip-sales-flat line (`why_now`) with the bag-count refusal ("I don't have …"), plus the offer;
  - an ask the model declared → no second line;
  - a gated item → not released.
- Proof r5-50.

### Task 51: A model release that doesn't answer the ask is checked (A5)

Hollis Bay Marisol t9 → t10: year-two marketing and a recurring lease answered with `longer_term_goals`.

**Files:** `lib/orchestrator/data-decisions.ts` (`decideData` first pass, :342-357), `lib/orchestrator/turn-data.ts`.

- An explicit model release whose item label, names and covers share no content word with the ask's `what` (after stop words; stem match) goes to the small-model check before release. If the check maps the ask to no item, or to another item, the Task 45 decisions apply.
- Log reason `release_checked`, with latency.
- Mutation tests:
  - Marisol t9 → refused, no `longer_term_goals`;
  - prof-001 releases with paraphrased asks from the corpus → unchanged (list each check call the proof adds);
  - a gated item → not released.
- Proof r5-51, with the count of added check calls per prof-001 run (latency).

### Task 52: Final proof and docs

- `proof.sh r5-final` and compare it against r5-base: every changed prof-001 decision and line, each intended or regression; the new-case changes per fix; F1/F3/F4 counts. Write `r5-final.md`.
- Docs, one commit:
  - PRD body for every behavior change (§5.3, §5.4, §6, §15);
  - PRD §16 entry with his rulings quoted;
  - `docs/case-onboarding.md` tracker, Next, and lessons (D6, and covers for "how many / mix / one-off" forms);
  - `docs/case-authoring.md` if D6 changes the exhibit rule;
  - progress.md.
- Logged, not built (his list): L1–L19, Larkspur Raj t6 (qualitative false line the fact-check can't read), Quillpath Marisol getting Exhibit 4 before the upgrade-adjusted value.
- Stop after r5-final. No wave, push or deploy. Report to Lorenzo for B1′, B2′ and the prof-001 pre-merge wave.
