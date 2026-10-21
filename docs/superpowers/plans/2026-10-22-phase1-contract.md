# Phase 1 contract (22 Oct 2026)

Lorenzo's Phase 1 go-ahead: fix the remaining faults inside today's engine, prove the fixes on free replays, then run one paid wave that includes Brew & Bean. Phase 1 does not rewrite the turn pipeline.

The four streams code against this file, not against each other. The code half of the contract is committed with it, and every stream imports it rather than redefining it:
- `lib/cases/engine-switches.ts`
- `lib/cases/phase1-overlay.ts`
- the new fields in `lib/cases/schema.ts`
- `lib/orchestrator/worksheet-types.ts`
- `lib/eval/fault-bank.ts`
- `tests/cases/phase1-contract.test.ts`

## 0. Base, branches, worktrees

- **Base:** `engine-asks` at 022d5d8c (round 6 plus the batch-38 docs). Batches 33–38 and round 6 live there, not on `main`.
- **Integration branch:** `phase1`, in worktree `.claude/worktrees/phase1`. The contract commit goes here first.
- **Stream branches**, each off the contract commit, each in its own worktree under `.claude/worktrees/`:

  | Stream | Branch |
  |---|---|
  | 1 | `phase1-s1-eval` |
  | 2 | `phase1-s2-cases` |
  | 3 | `phase1-s3-math` |
  | 4 | `phase1-s4-fixes` |

- **Merge order into `phase1`:** S2 and S1, then S3, then S4. A free fault-bank replay runs after each merge (§6).
- **The corpus:** the main checkout's `Case Interview Runs/`. It holds batches 22 and 28–38 and the replay verdict files (`replays/2026-10-20/engine-asks`, `replays/2026-10-21/round6`).
  - The replay root is `REPLAY_ROOT=/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs`.
  - Replay output goes outside the corpus, to `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/<label>/`.
  - Never `git add` anything under `Case Interview Runs/`.
- **The 21 standard slices** are the slices of `replays/2026-10-21/round6/proof.sh`:
  - b28, b29, b30, b31, b32 and b33, each on and off (12);
  - b22l off (1);
  - b34a, b34l, b35h and b35q, each on and off (8).

  The phase-1 proof script adds b36a, b36l, b37h, b37q and b38l, on and off.
- **Turn numbering:** a grading turn `tN` is the interviewer reply to the candidate message with `TurnRecord.turnIndex = N − 1`. The candidate's messages are the odd turns.
- **Case names:**

  | Name | Case |
  |---|---|
  | Brew & Bean | prof-001 |
  | Larkspur | prof-002 |
  | Aldermoor | entry-001 |
  | Hollis Bay | launch-001 |
  | Quillpath | pricing-001 |

## 1. Case-file fields

### Where Phase 1 data lives

All Phase 1 case data goes in an overlay file, `cases/phase1/<caseId>.json` (`Phase1OverlaySchema`). It never goes in `cases/<id>.json`. The overlay follows the `cases/variants/` precedent.

- **Why:** several requested fields already exist on `engine-asks`, and today's code reads them:
  - `mathSteps[].dependsOn` turns on round-6 step roots;
  - `factAnchors.tags` turns on the answer gate;
  - `factAnchors.covers`, `quoteAnchors` and `mustReach` drive matching and release.

  Editing them in place would change prof-001 and the four new cases with every switch off.
- **Who writes it:** Stream 2 owns `cases/phase1/*.json` and is the only stream that writes case data.
- **Load:** `lib/cases/loader.ts` validates the overlay at boot, then calls `applyPhase1Overlay`. A malformed overlay, an unknown id, or a merged case that fails `CaseSchema` stops the boot.
- **Always attached:** the descriptive fields. Nothing reads them except Phase 1 code behind its switch.
- **Merged into today's fields only under their switch (§3):**
  - `itemCovers`: covers are appended to `factAnchors.covers[item]`, and `coverExcludes` is attached to the item.
  - `tagMatching`: `factTags` becomes `factAnchors.tags`. Only prof-001 has none today.
  - `stepLineage`: `steps[id].dependsOn` replaces `mathSteps[].dependsOn`.
  - `mustReachPhase1`: `mustReach` is appended, to at most 3 entries in all.
  - `misquoteAnchors`: `items[id].misquote` is appended to `quoteAnchors`.
- **`proposed`:** entries awaiting Lorenzo's ruling, such as the Aldermoor and Brew & Bean must-reach proposals. They are never merged.

Folding the overlays into the case files after Phase 1 is accepted is a mechanical step. It is not part of Phase 1.

### Overlay fields

| Field | Shape | Rules |
|---|---|---|
| `items[id].tags` | `{ entity, period[], quantityKind[] }` | `entity` is `client` or an entity id from `factAnchors.tags`, or from the overlay's `factTags` for prof-001. `period` is one or more of forecast, current, historical. `quantityKind` is one or more of total, split, level, trend, one-off, recurring. Arrays, because an item that states "from 42% to 58%" is both historical and current, and a trend. Must agree with the case-level tags: an item in a rival entity's `items` has that entity, and an item in `forecast` has the forecast period. Stream 2's lint checks both. |
| `items[id].askPhrases` | 3–5 strings | Short "answers questions about…" phrases. **No figures, digits or number words (FR-4: shown before reveal), and nothing that gives the finding away** ("the entrant's cost per seat", not "the cheaper entrant"). |
| `items[id].covers` | ≤ 20 strings, two words or more each | 10–20 per item. Multi-word and specific; no bare "cost" or "flights". |
| `items[id].coverExcludes` | strings | Words that stop a cover matching this item (chip vs chickpea, entrant vs Larkspur, Kelvexa vs Nimbrel). |
| `items[id].misquote` | `{ names[], kind, of? }` | A misquote anchor, same shape as `quoteAnchors`. Only for items with `timeframes`: the schema rejects an anchor on an item with none. |
| `steps[id].dependsOn` | step ids | The steps this one is computed from. No cycles; checked on the merged case. |
| `exhibits[id].summary` | one line, no figures | What is generally in the table: "Exhibit 2 has revenue and contribution by route for both years." |
| `definitions[]` | `{ term, text, steps?, items? }`, no figures | Quantity → one-line definition. Used in a root correction's wording (3.3) and given to the live checker (3.7). Server-only. |
| `mustReach[]` | `{ item, before, why }` | `before` is an exhibit id or `"recommendation"`. At most 3 per case, counting the case's own. `why` names the runs that missed the item. |
| `factTags` | as `factAnchors.tags` | prof-001 only. |

### Must-reach entries to author

- **Larkspur:** `competitor_entry` and `new_route_rampup` are already in the case. Add `competitor_costs` before `exhibit-3`.
- **Hollis Bay:** `retailer_support` and `cannibalization`, both before the recommendation.
- **Quillpath:** `why_pro_fell`, before the recommendation.
- **Aldermoor and Brew & Bean:** go in `proposed` only, with the evidence.

Use the real ledger ids. Where a name above isn't an id, Stream 2 maps it and says so.

### Server-only

All overlay content is server-only, like the case file. Only askPhrases and exhibit summaries ever reach the model or the candidate: askPhrases through the prompt (2.5), summaries through code's restatement line (4.1).

## 2. The worksheet

The types are in `lib/orchestrator/worksheet-types.ts`. Stream 3 builds `lib/orchestrator/worksheet.ts`, made of pure functions, and wires it in.

### What it holds

- **Entries:** one per quantity. The key is `step:<id>`, or `pricing:<kind>@<input>` for the pricing results code computes. Each entry holds:
  - the candidate's latest value, with its unit and scale;
  - the turn it was said (the candidate's `turnIndex`) and the words it was said in;
  - its source: `checker`, from the checker's `codeQuantity` tag, or `step_binding`, from code's own binding as the message arrives;
  - its status against code's own calculation;
  - the earlier values.
- **Status:**
  - `right`: within the step's tolerance of its answer or an `altAnswer`.
  - `wrong`: outside that tolerance.
  - `unchecked`: code can't compare. That covers a step input not yet revealed, the candidate's own stated base or assumption, and a unit or scale code can't read.
- **Withdrawn:** a list of withdrawn figures: value, unit, quantity if known, turn and phrase. A withdrawal phrase marks X withdrawn: "not X", "instead of X", "earlier I said X", "throw that out", "scratch that", "ignore my X". A withdrawn X is never the current value.

### Update rules

- The latest value per quantity wins.
- The checker's claims land a turn or more late. They update or confirm the value said at their turn. They never overwrite a value said later.
- Code owns every update. The model never writes the worksheet.

### Where it lives

- **Storage:** `flags.worksheet` in the session flags, only with `worksheet` on.
- **Code-side only:** never in any prompt. `lib/agent/prompts/**` and `prompt-context.ts` may not import it; the test is in `tests/cases/phase1-contract.test.ts`.
- **What reads it:** the stale drop (3.2), the root rules (3.3), the misquote rule (3.4) and the probe guard (3.5).

## 3. Engine switches

`lib/cases/engine-switches.ts` holds one switch per behaviour change. Off is today's behaviour.

### Resolution

A switch's value comes from the first of these that sets it:
1. **`ENGINE_SWITCHES`**, for evaluation only. Production never sets it. Format: `'*=phase1; prof-001=phase1,-ackRotation'`:
   - entries are separated by `;`, and each is `<caseId|*>=<names>`;
   - `phase1` means every switch, and `-name` turns one off;
   - a case's own entry is read after `*`;
   - an unknown name throws.
2. **The case file's `engine` pin.**
3. **Otherwise it is off.**

### Rules for the streams

- **Production:** prof-001 stays on today's behaviour. Nothing is pinned in any case file during Phase 1.
- **Tests and the wave:**
  - Replays and the wave set `ENGINE_SWITCHES`.
  - The persona-batch / live-run header records `engineSwitchesOf(case)`. Stream 1 adds this to the run header and the batch manifest.
  - The wave runs with `ENGINE_SWITCHES='*=phase1'`.
- **Switch checks:** each stream reads its switch with `switchOn(caseData, '<name>')` at the decision point. Don't cache the result at module load, because tests change the env.
- **New switches:** a behaviour a stream adds that isn't listed gets a new switch in this file, in the stream's own commit. Say so in the report.
- **No switch:** scoring's retry with backoff (4.11) has none. It changes nothing when the stream succeeds.

### The switches

| Switch | Stream | What it changes |
|---|---|---|
| `itemCovers`, `tagMatching`, `stepLineage`, `mustReachPhase1`, `misquoteAnchors` | 2 (data) | Overlay merges (§1) |
| `askPhrasesInPrompt` | 2 | 2.5 |
| `worksheet`, `staleProbeDrop`, `rootLineage`, `misquoteFlat`, `probeGuardMethod`, `spokenMathParser`, `checkerDefinitions` | 3 | 3.1–3.7 |
| `restateRules`, `coarseKeepNamed`, `haikuTagGate`, `refusalNounCheck`, `coverNormalization`, `wantCueBroad`, `modelDeferrals`, `closeWaitMitigation`, `recommendationReceived`, `ackRotation` | 4 | 4.1–4.10 |

## 4. The fault bank

The record schema is `FaultRecordSchema` in `lib/eval/fault-bank.ts`. Records are stored one JSON object per line in `evals/fault-bank/<batch>.jsonl`, and are committed.

### 4.1 Records

- **Fault records:** one per graded fault in batches 33–38: firm, serious, false and borderline. Sources:
  - each batch's `hand-grading.md` in the main corpus;
  - Lorenzo's rulings recorded there and in PRD §15 and §16.

  When his ruling and Claude's grade differ, his ruling sets the severity. A fault counted once in the grading is one record. A fault spanning turns is one record, with a scope window.
- **Correct-behaviour records:** about 100, from the same batches, marked `kind: "correct"`. They cover true refusals, correct releases, correct probes, correct corrections, correct deferrals and correct closes. Sample them across all five cases.
- **Fields on every record:**
  - run, turn, and the recorded state copied from the turn file (`stateBefore` of `turnIndex = turn − 1`);
  - the line said: the delivered segments joined;
  - one or more assertions;
  - `replayable`, and the owning stream.

### 4.2 Assertions

| Kind | Checks |
|---|---|
| `release` / `exhibit` | An item or exhibit went out, or didn't |
| `refusal` | "I don't have…" (optionally its words) |
| `restatement` | An item already out, said again |
| `probe` / `correction` | A probe or correction, optionally naming a figure |
| `deferral` | A deferral |
| `ask` | A stage question: recommendation, risk, mitigation or brainstorm |
| `close` | The case closed |
| `says` | A regex over the delivered words |
| `check` | A decision in `TurnRecord.checks` |

- **Polarity:** each assertion has `must: true | false`.
- **Scope:** the record's turn by default, or a window such as "no probe on Z after tN": `{ fromTurn: N }`.
- **Assert outcomes, not wording.** Write "no restatement", not the exact sentence. Use `says` only when the fault is the wording itself.

### 4.3 Replayability

The replay drives the real `runTurn` with the saved model output, recorded classifier and checker verdicts, and the saved candidate messages. Mark a record `replayable: false`, with a `replayNote`, when its fix needs one of these:
- words only the model writes, such as the model's own "I'll check what we have", unless the fix is code acting on those words;
- a live call the replay doesn't serve: a new classifier detection, a re-run checker verdict, or a new Haiku verdict;
- a turn whose kind changes, so its saved declarations are lost.

Records that aren't replayable are reported separately, and judged in the wave by the auditor and the hand grade (§7, Q2).

### 4.4 The harness

`scripts/fault-bank.ts`, built by Stream 1.
- **What it runs:** every record's run through `tests/replay/runner-corpus.replay.test.ts`, with the run's slice verdicts (`REPLAY_CHECKER`, as in `proof.sh`). It checks each assertion against the replayed turn file.
- **Output:**
  - a pass/fail table per record, by stream and class;
  - each failed assertion, with what the replay delivered.
- **Arguments:** `--switches=<ENGINE_SWITCHES value>`, so the same bank runs with switches off and with `*=phase1`.
- **Runtime:** minutes. Runs replay in parallel, one vitest process per slice, as `proof.sh` does.

### 4.5 Baseline

On the contract base, with switches off:
- every fault record is expected to **fail**, because it records the fault;
- every correct record is expected to **pass**.

The harness checks this baseline first. A fault record that already passes on the base has a wrong assertion. A correct record that fails has a wrong assertion or a replay artifact.

## 5. Streams: what each owns

Each stream:
- works TDD;
- makes one commit per task, with tests passing;
- runs `npx vitest run`, `npx tsc --noEmit` and `npx eslint lib app components tests scripts db` before each commit;
- writes a report at `.superpowers/sdd/2026-10-22-phase1/stream-N-report.md` with each task's tests, files, free-replay evidence and decisions;
- spends nothing on API calls except where this contract says.

Stream 1's auditor calibration has a $25 hard cap, enforced through `LLM_BUDGET_USD` and `LLM_BUDGET_FILE`. Ask the lead before anything else that costs money.

### Stream 1: evaluation (new files only)

- **Files:**
  - `evals/fault-bank/**`, `lib/eval/fault-bank-*.ts`, `scripts/fault-bank.ts`;
  - `evals/ask-check-labels/**` and `scripts/ask-check-labels.ts`;
  - `scripts/offline-auditor.ts` and `lib/eval/auditor/**`;
  - an append-only edit to `scripts/personas.ts`: the three new personas, ids 65, 66 and 67;
  - the run-header and manifest switch record.
- **Tasks:**
  1. The fault bank and its harness, with the baseline check from §4.5.
  2. Exact Haiku labels for every Haiku ask-check call in b33–b38. Labels: correct item, wrong item, correct none, false none, partly right. Output: a table per batch, precision on positives, and the false-none rate. Free: read the recorded calls and label by hand.
  3. The offline auditor: Opus 5.5 over one run's transcript, ledger and events, returning faults in the hand-grading classes (`FAULT_CLASSES`) with severities. Calibrate it on the 25 runs of b36–b38 against the hand grades, with recall and precision per class. $25 hard cap; stop at the cap. Give the estimate before the first call.
  4. Three new personas, in the existing format:
     - a data-heavy asker;
     - a candidate who states only results;
     - a candidate who challenges the interviewer's data.

### Stream 2: case data (the only stream that writes case data)

- **Files:**
  - `cases/phase1/*.json`;
  - `scripts/phase1-cover-lint.ts`;
  - the prompt builder, for 2.5 only: `lib/agent/prompts/system*.ts` and `lib/orchestrator/prompt-context.ts`.
- **Tasks:**
  1. Covers for all five cases, 10–20 per item, with exclusion words for the known confusions.
  2. The cover lint, a script:
     - flag any phrase on two items;
     - run every new or changed cover against every candidate ask in b28–b38 through `coverageDetail`, with `itemCovers` on and off;
     - list what each newly matches;
     - put anything uncertain in a separate list.
  3. Tags, askPhrases, definitions, dependsOn, exhibit summaries and misquote anchors for every item, step and exhibit.
  4. The must-reach entries (§1).
  5. askPhrases in the prompt, behind `askPhrasesInPrompt`. They go beside the unrevealed item's label in the static, cached part of the prompt, so the cache prefix stays stable across turns. With the switch off, the prompt is byte-identical.

### Stream 3: math (high effort)

- **Files:** `lib/orchestrator/worksheet.ts` and the math paths:
  - `math-checker*.ts`, `recompute.ts`, `math-talk.ts`, `arithmetic-check.ts`;
  - `misquote.ts`, `probe-guard.ts`, `own-quantity.ts`;
  - their call sites in `plan-turn.ts` and `settle-turn.ts`.
- **Tasks:**
  1. **The worksheet (§2).**
  2. **Stale drop:** before any probe or correction is spoken, drop it if the worksheet holds a newer value for that quantity. Log it as `stale_drop`.
  3. **Roots, via dependsOn:**
     - probe only the root;
     - at most 2 probes per lineage, then one correction at the root, worded from the case's definition or ledger line;
     - derived figures wait for their root.

     This extends round-6 step roots: `stepRootOf`, `STEP_PROBE_CAP`, `inputQuestion`. Don't fork them. See Q1 on what the root correction needs.
  4. **Misquotes:** a flat correction from the ledger value, only when code finds a mismatch with a revealed item **and** the checker rated the span an error, flagged or not. The probe guard never replaces a model question that catches a misquote (b38 Tyler t14).
  5. **Probe-guard replacement:** ask about method ("Walk me through how you got there."). Never name a figure code verified as correct. The replacement line comes from a phrase pool, like the other code lines.
  6. **Spoken-math parser:**
     - parse chained speech ("three minus seventy cents plus thirty plus thirty plus twenty equals one fifty");
     - if any reading matches the stated result, treat the sentence as consistent;
     - build a test set of 50–100 real candidate sentences from the batch logs, in `evals/spoken-math/sentences.json`.
  7. **Definitions to the checker:** pass the case's definitions to the live checker's prompt. A recorded-verdict replay can't prove this (Q5).

### Stream 4: small fixes inside today's paths

- **Effort:** high for 4.2, 4.3, 4.4 and 4.7; medium for the rest.
- **Files:**
  - `turn-data.ts`, `data-decisions.ts` and `fact-check.ts` (coverage);
  - `item-tags.ts`, `request-signal.ts`, `ask-intent.ts`, `pending-data.ts`;
  - `close-hold.ts`, `stage-evidence.ts`, `phrasing.ts`;
  - `lib/scoring/**` (4.11 only).
- **Tasks:**
  1. **Restatements:**
     - point to an exhibit that is out, with its one-line summary;
     - read a number only when that figure was asked;
     - restate only the matched item's line, and never the same item twice within 4 turns.
  2. **The coarse rule:** never drop a model-named item that matches the ask (b38 Jasmine t4). Log which scope rule fired.
  3. **Haiku positives pass the tag gate:** the item's tags (entity, period, quantityKind, §1) against the ask's tags, read by code from the ask. A mismatch **defers**. It never releases and never refuses.
  4. **Refusals:** when code and Haiku both find no match, refuse only if no ledger item shares a key noun with the ask; otherwise defer. Haiku's "none" adds nothing on its own. "Key noun" means a content noun after the stop list and plural fold, using the one stemmer in `data-decisions.ts`.
  5. **Cover normalization:** plurals, a synonym table, and matching the candidate's own sentence as well as the model's rewording. On prof-001 this needs `tagMatching` and `itemCovers` too.
  6. **The want cue:** "I'd want / need / confirm" plus any noun phrase. Keep the classifier's share at or below about 2% of turns, and report the share.
  7. **Model-said deferrals** ("I'll check what we have", "let me come back to that"): register them so E5's stop sequence resolves them.
  8. **close_wait:** no mitigation ask when the last answer already gave one, or when the last question already asked what they'd do.
  9. **recommendationReceived:** set on a clear recommendation. The time warning skips its rec ask when a recommendation came in the last two turns.
  10. **Acknowledgments:** run the model's opening acknowledgment through the phrase-pool rotation.
  11. **Scoring:** retry with backoff when the scoring stream dies, inside the existing claim (`scoring-claim.ts`), so it never runs twice.

## 6. Merges and the gate

### After each merge into `phase1`

Run:
- the full fault bank, with switches off and with `*=phase1`;
- the proof slices.

Report what changed since the last merge.

### The gate before the wave

All of these must hold:
1. **The fault bank:** every replayable fault record passes with `*=phase1`, and every correct record passes with the switches both off and on.
2. **No new false refusals, wrong releases or false corrections** across b28–b38 with `*=phase1`. Every changed data or checker turn against the contract base is read by hand.
3. **prof-001 identical with switches off** on the 21 standard slices: 0 changed interviewer lines and 0 changed checker decisions against the contract base.
4. **Latency:**
   - Code-path time per turn, max and mean, from the replay's `timing`.
   - Model calls counted per turn, both ways. Phase 1 adds no live model call. The want-cue classifier stays at or below about 2% of turns. The auditor is offline.
5. **Token spend** per stream, for the merges and for the reviews.

If any condition fails or needs a judgement call, stop and ask before spending.

### The wave (only on Lorenzo's go, even if the gate holds)

- **Runs:**
  - entry-001, launch-001, pricing-001, prof-002 and prof-001, each × the usual 5 personas;
  - the 3 new personas on prof-002 and pricing-001;
  - 31 runs in all, with `ENGINE_SWITCHES='*=phase1'`.
- **Cap:** $50 hard.
- **Grading:** the auditor first, then the hand grade, then Lorenzo's blind second grade.

## 7. Decisions and open questions

### Decisions made in the contract

Each is the controller's, with its cost if wrong:
- **D1 — Overlay files.** Phase 1 data goes in overlay files, not in edits to `cases/*.json`. Cost if wrong: one mechanical fold later.
- **D2 — Env switches plus pins.** `ENGINE_SWITCHES` plus case pins, with no pins set in Phase 1. Cost if wrong: a production session could pick up Phase 1 only if someone sets the env var in production.
- **D3 — Mixed-period tags.** `tags.period` and `tags.quantityKind` are arrays. Cost if wrong: the tag gate is looser on mixed items.
- **D4 — No switch on the scoring retry.**
- **D5 — The base is `engine-asks`, not `main`.** Production prof-001 runs `main` 9be93ca; "prof-001 identical" is measured against the contract base. Round 6 already proved prof-001 identical to its own base.

### Open questions for Lorenzo

Each is built as proposed until he rules:
- **Q1 — The root correction (3.3) needs the checker.** Your 21 Oct ruling says the step check "may NOT voice a correction without the checker's agreement." Proposed: the root correction goes out only when the checker rated the root, or a claim in its lineage, an error, flagged or not, as in 3.4. Otherwise the lineage goes to the report after its 2 probes.
- **Q2 — Records the replay can't prove** (§4.3). Proposed: the gate counts replayable records only. The rest are listed, then judged in the wave.
- **Q3 — Brew & Bean and Aldermoor must-reach.** Proposed entries only, until your ruling.
- **Q4 — prof-001's Phase 1 includes round-6 matching.** Under `*=phase1`, prof-001 gets `tagMatching`, which turns round 6's matching and gate on for it for the first time (§15 "prof-001 is untagged"). Proposed: yes, since the wave tests it.
- **Q5 — Definitions to the checker (3.7) aren't free-provable.** Recorded verdicts don't change. Proposed: judge 3.7 in the wave only. A live re-check of the math records (about 100 Sonnet calls, about $2) needs your go.
