# Stream 4b report: small fixes (4.6, 4.8, 4.9, 4.10, 4.11)

Branch `phase1-s4b-fixes`, off the contract commit 0f932c89. Commits, in order:

| Commit | Task |
|---|---|
| 7eb7cbb4 | 4.6 the broad want cue (`wantCueBroad`) |
| d975cfa6 | 4.8 close_wait follow-ups (`closeWaitMitigation`) |
| e1a510d0 | test fix: 4.6's test mocks the background classifiers (an unhandled teardown rejection) |
| 88b3fd8a | 4.9 recommendation received (`recommendationReceived`) |
| bbfc44cf | 4.10 acknowledgment rotation (`ackRotation`) |
| 97b5f8a9 | 4.11 scoring stream retry, inside the claim (no switch) |

Every commit passed `npx vitest run` (final: 244 files, 5,188 tests), `npx tsc --noEmit` and `npx eslint lib app components tests scripts db`. No API spend. No new switch names: all four are the contract's.

## Replay evidence (free; output in `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-s4b-*`)

- **Base:** `phase1-s4b-base`, the contract commit, run with `proof.sh` from this worktree, plus a b38l off slice (`proof.sh` has no b38 slice and no b38 verdict file). I used a script in my scratchpad that runs the same runner with `REPLAY_FILTER=batch-38-larkspur-oct-21`.
- **All switches off:** `phase1-s4b-final-off` against the base has 0 changed interviewer lines and 0 changed checker decisions, on all 29 slices plus b38l. Each task's own off run was also 0/0 (`phase1-s4b-t46-off`, `-t48-off`, `-t49-off`, `-t410-off`).
- **All four switches on:** `phase1-s4b-final-on` (`ENGINE_SWITCHES='*=wantCueBroad,closeWaitMitigation,recommendationReceived,ackRotation'`) has 1,208 changed lines and 2 changed checker decisions. The 2 decisions are one claim, from 4.9 (below).
  - The fact-check counts (F1, F2-next, F2-rec, F3, F4) are identical to the base on every slice.
  - No new false refusal, wrong release or false correction.
- **Per task:** each task was replayed with only its own switch on (`-t46-on`, `-t48-on`, `-t49-on`, `-t410-on`). The changed turns are classified below.
- **Compare reports:** `compare-phase1-s4b-base-vs-<label>.md` in the proof-out folder.

## 4.6: the want cue (`wantCueBroad`)

**What was built.** "I'd want / need / confirm" followed by any noun phrase is now an asking sentence before the brainstorm, or anywhere as a question.
- The new cue is `WANT_BROAD` in `request-signal.ts`, behind a new `wantBroad` option on `addressedAskSentences`.
- These count as noun phrases: possessives ("their cost per seat", "its components"), bare nouns ("departures by route"), a colon ("What I'd confirm: …"), and "(what) I'd want next / now is …".
- These are excluded:
  - an infinitive ("I'd want to look at the whole business");
  - an object pronoun ("them", "it", "us");
  - a stretch of time ("four to six weeks");
  - arithmetic ("I'd need revenue of 94 divided by 0.76").
- Guard B's cue list (`explicitRequestCues`), which can trigger a model regeneration, is unchanged.
- With the switch on, row 11's `want_is` cue counts on any case, because the broad cue covers it.
- The usage rows keep `cue: 'want_is'` for both cues, so `check-cost` reports the combined share.
- Callers:
  - `turn-data.ts` `messageAskSentences` and `wantIsOnly` (2 lines; Stream 4a's file);
  - `session-runner.ts` `codeWrittenAsks`.

**Tests.** `tests/orchestrator/want-cue-broad.test.ts` uses verbatim corpus sentences: b38 Marisol t9, b38 Tyler t7, b35 Jasmine t9, b36 Larkspur Jasmine t7, b37 Jasmine t5 and b33 Marisol t7. It also has 6 negatives, and checks the switch for each case through `startMessageAsks` and `codeWrittenAsks`.

**The share** (asked for), over batches 28–38: 111 runs, 1,455 candidate turns. A turn counts when its message asks only through a want cue, on a model turn, before the brainstorm.

| | Want-cue classifier calls | Share of candidate turns |
|---|---|---|
| Switch off (row 11's cue, tagged cases) | 2 | 0.14% |
| Switch on (row 11's cue + the broad cue, all cases) | 25 | **1.72%** |

By case, with the switch on: prof-001 11 of 616, prof-002 7 of 298, launch-001 5 of 146, pricing-001 2 of 166, entry-001 0 of 229. The replay agrees: 23 added classifier starts over the off slices.

Separately, on about 10 turns where the classifier was already running, a broad-cue sentence is now an undeclared ask, so the turn waits on the classifier. That adds no call, and the wait is capped at 1.5 s (`ASK_WAIT_MS`).

**Replay.** With the switch on, 0 lines and 0 decisions changed. The replay serves no classifier detections on model turns, so a new call returns nothing.
- `uncovered_asks` shows the call firing on b38 Marisol t9 → t10 with `cue: 'want_is'`.
- The outcome isn't free-provable (contract §4.3: a new classifier detection) and is judged in the wave.

**False positives in the 25:** about 4 are next steps, not asks:
- b30 Marcus t16 "I'd want elasticity testing in a few markets";
- b31 Blake t14 "the one I'd want hardest";
- b37h Raj t22 "I'd want actual repeat data from a test market";
- b35h Marisol t12 "I'd want chip margins to confirm".

They cost a classifier call each. The classifier then decides, as for any ask.

## 4.8: close_wait (`closeWaitMitigation`)

**What was built.** `close-hold.ts` `closeWaitLine` takes the candidate's answer.
- **No mitigation ask** when either holds:
  - the answer has an action word (`CLOSE_WAIT_ACTION`: phase / stage / pilot / test / trigger / validate / hedge / mitigate / guard / protect / gate / checkpoint / tripwire / stagger / sequence / roll out / next steps / "what I'd do" / "I'd start / lock / launch …");
  - the last question asked what they'd do (`CLOSE_WAIT_ASKED_DO`).
- **The first-step line is skipped the same way** when the answer sequenced it ("first", "start with", "next steps", "before committing", …) or the question asked what they'd do. The measure line is asked instead.
- **The probe-count fix that came with it.** With the switch on, close_wait's three follow-up pools are taken out of the words the checker counts as probes. This is `withoutCloseWaitLines` in `phrasing.ts`, applied at 3 sites in `math-checker-live.ts` (Stream 3's file: 4 added lines, gated).
  - Without it, the measure line's "6 months" was read as a probe of a candidate's 6.
  - In the replay, b31 Sofia e0f7d46c t25's claim went from "unresolved_at_close" to "attempt 2 … left for the report". Its report line would then have said **"Probed twice; not corrected"**, which is false.
  - With the fix: 0 changed decisions.

**Tests.** `tests/orchestrator/close-wait-mitigation.test.ts`:
- 6 verbatim answers that were re-asked: b37h Marcus t25, b37q Marisol t31, b36l Raj t29, b35h Marcus t25, b38l Tyler t29, b36a Raj t33;
- b38 Jasmine t23 (a risk with no mitigation) still gets the mitigation ask;
- the switch wired through `codeWrittenTurn`;
- the probe-count exclusion.

**Replay with the switch on: 62 changed lines, all close_wait follow-ups, 0 changed decisions.** All are on the checker-on slices; close_wait only exists while a verdict is pending.

| Before → after | Turns |
|---|---|
| Mitigation ask → measure | 31 |
| First step → measure | 26 |
| Mitigation ask → first step | 5 |

My reading of each turn:
- **Fixed, about 30:** the old line re-asked what the answer had just given, and the new one doesn't. Examples: b37h Marcus t26, b36l Raj t30, b34l Raj t30, b38-type phase/pilot answers, b37h Tyler t22, b33 Sofia t20, b28 Marcus t20.
- **Shifted re-ask, 15 (new borderline):** the answer had also named a checkpoint or decision point, so "how would you know, six months in, that it was working?" re-asks that instead.
  - b29 Fiona t16 ("tripwire … first six weeks");
  - b33 Fiona t18 and b33 Marcus t18 (threshold, eight weeks);
  - b34a Raj t26 (month-12 checkpoint);
  - b34l Marcus t28 ("decision point at six months");
  - b35h Raj t28 (week 12);
  - b35q Jasmine t22 (90-day read);
  - b36a Raj t34 (tripwire month 18);
  - b36l Marcus t24 (booking curves weekly);
  - b37h Raj t32 (week-8);
  - b37q Marisol t32 (month 3–9 window);
  - b32 Larkspur Raj t26 (month six trigger);
  - b32 Aldermoor Jasmine t26 (go/no-go at 18 months);
  - b29 Raj t20 (leading indicator);
  - b30 Owen t16 (decision rule at four to six weeks).
- **Borderline, 14:** the answer measured a pilot ("measure transaction counts") but gave no read of success at a horizon, so the six-month question deepens it. Examples: b29 Jasmine t16, b30 Tyler t18, b30 Blake t24, b31 Marcus t20, b33 Raj t20.
- **A fair mitigation ask lost, 2:** the action words were nouns.
  - b32 Aldermoor Marisol t30: "the $300 million board **test**" → first step.
  - b32 Aldermoor Marcus t24: no mitigation given → first step.
  - Neither new line is a re-ask.
- **Neutral, 1:** b33 Owen t16, a math answer; the first step and the measure line are both fine.

Each class is in `t48-table.keep` in my scratchpad. The flag is my regex reading, then hand-checked.

## 4.9: recommendation received (`recommendationReceived`)

**What was built.** `stall.ts` `clearRecommendation`: the message's first sentence opens on a decision verb and isn't a question or a refusal.
- The verbs are keep / enter / build / partner / launch / exit / raise / cut / reprice / expand …, after an optional "So," / "Bottom line:" / "My answer:". "Keep in mind…" is excluded.
- In `plan-turn.ts`, with the switch on:
  - such a message is received on an analysis turn, when it replies to a recommendation ask or comes in the RECOMMENDATION or WRAP phase;
  - the time warning doesn't fire when a clear recommendation is in the current or previous candidate message.

**Tests.** `tests/orchestrator/recommendation-clear.test.ts`:
- verbatim Quillpath replies: b37q Marcus t31, b37q Tyler t25, b35q Raj t25, b37q Raj t39, b37q Tyler t33;
- 5 negatives;
- through `planTurn`: Marcus t31 is received only with the switch on, and the time warning is skipped after a clear recommendation in the last two messages but fires when it was three back.

**Replay with the switch on: 63 changed lines in 7 runs, 1 changed decision.**
- **Fixed, the five time-warning recommendation re-asks are gone:**
  - b37q Marcus t32 (firm in the grading);
  - b37q Raj t38 and b37q Tyler t32 (borderline);
  - b35q Raj t36;
  - b32 Larkspur Marcus t32.

  Where code no longer writes the turn, the replay shows "Go on." That is its neutral placeholder for a model turn it has no saved output for, so the real wording isn't free-provable.
- **Behaviour change: the case closes earlier.** The end gate now sees the recommendation, so 5 runs close sooner.

  | Run | Base close | Switch on | Note |
  |---|---|---|---|
  | b34a Jasmine | 15.5 min | 9.9 min | Early finisher who says "I'm done" |
  | b36a Jasmine | 15.0 min | 10.9 min | Early finisher who says "I'm done" |
  | b35q Raj | 25.5 min | 17.8 min | |
  | b37q Raj | 25.9 min | 21.3 min | |
  | b37q Tyler | 26.5 min | 23.4 min | |

  The turns lost were the model's pushback probes after a recommendation code hadn't recorded. In the two Jasmine runs they include a second recommendation ask.
  - This follows his rule "A recommendation the candidate gives counts as received" and "The end gate reads the stage record only".
  - But it means less pushback evidence for the report in those runs. **Lorenzo should rule** (below).
- **The changed decision.** b37q Raj claim 35:0 ("$5,200"): base "unresolved_at_close", now a close-hold probe at t37 ("You had "$5,200" — can you show me that calculation step by step?").
  - The flag is the recorded checker's.
  - The probe follows the 16 Oct rule: every checker flag holds the close once from the recommendation reply on.
  - Neutral.
- **Also from the received recommendation:** b37q Raj t36 now gets code's correction "Starter standalone lifetime value at $40 is about $600, not $405". The answer key's `starter_ltv` is 600 ($30 × 20 months), so the correction is true.

## 4.10: acknowledgments (`ackRotation`)

**What was built.**
- **The new pool.** `phrasing.ts` gains an `ack` pool: Understood. / Mm-hm. / Got it. / I see.
- **The rotation.** `rotateOpeningAck` replaces the model's opening `say` sentence with the pool's variant for the turn, but only when that sentence is acknowledgment words alone ("Understood.", "Okay, got it.", "Right."). The usual rotation applies: never one of the session's last 3, and the first use is "Understood.".
- **Stream and Settle.** Both apply it from the same seed and uses (`stream-turn.ts`, `settle-turn.ts`).
- **Recording.** The pool is recorded in `flags.phraseUses` only with the switch on (`recordPhraseUses(…, { ack })`), so off leaves the session state byte-identical too.
- **Other files.** `scripts/variant-list.ts` has the pool's description. `tests/orchestrator/code-line-variants.test.ts` gives `ack` its own block: it has no line code said before brief B.

**Tests.** `tests/orchestrator/ack-rotation.test.ts` covers rotation over 30 turns, a commenting sentence left alone, and off recording nothing.

**Replay with the switch on.** Every changed line, 594 on the off slices and 542 on the on slices, differs only in its opening acknowledgment. The script checks this, and found 0 exceptions.

| Measure | Base | Switch on |
|---|---|---|
| "Understood." openers (of 1,571 interviewer turns) | 511 | 254 |
| Consecutive same-acknowledgment pairs | 140 | 0 |
| b38 Larkspur "Understood." openers (of 74 turns) | 26 | 11 |
| b38 Larkspur consecutive pairs | 11 | 0 |

## 4.11: scoring retry (no switch)

**What was built.**
- **`lib/scoring/stream-retry.ts` `withStreamRetry`** wraps each Opus stream: judge, claim verifier and reconciliation.
  - It retries only a death: `APIConnectionError`, "terminated", ECONNRESET / socket errors, 5xx, 429, or a mid-stream overloaded or api_error.
  - Two retries, 2 s then 8 s.
  - Never a 4xx, and never an answer the model gave (a cut-off or unparseable output).
  - Only the dead call is repeated, so a pass already done isn't paid for again.
- **The claim is not on this branch.** `lib/scoring/scoring-claim.ts` is on `main` (58911e63) but not on `engine-asks` or `phase1`. I brought it here with the score route's 409 for `in_progress`, and extended it so a retry can never write a second report:
  - **A beat.** A running pass renews `scoringClaimBeat` every 60 s, and staleness is measured from the last beat. A pass that is still retrying keeps its claim, and no second caller takes over.
  - **An owned write.** `storeIfClaimed` inserts the score row in one transaction that first locks the session row on the claim token (a no-op UPDATE … WHERE `scoringClaimAt` = token).
    - A pass whose claim was taken over writes nothing (`ClaimLostError` → `in_progress`).
    - A concurrent claimer blocks on the lock until the row commits, then finds the session scored.
  - **Release by token.** A pass releases only its own claim.

**Tests for Lorenzo's ruling** are in `tests/scoring/scoring-retry.test.ts`, describe block "4.11: a dead scoring stream is retried, and one report is written":
1. `the stream dies after partial output, the retry succeeds: exactly one report row, from the retry`
2. `two concurrent callers during a retry: the second waits on the claim and never runs a pass; one row`
3. `a retry after the first attempt actually wrote: the row stands, nothing is written again`
4. `a pass whose claim was taken over while it retried writes nothing: still one row`

The same file also checks what is retried, the backoff limits, and that the reconciliation pass's real stream call is wrapped (mocked client, fake timers). `tests/scoring/scoring-claim.test.ts` has main's claim tests, plus the beat, a long pass keeping its claim, and release by token.

**Limit of the tests.** They use an in-memory store with the claim's semantics. The SQL itself, the conditional UPDATEs and the locking transaction, has no test against a real Postgres here (no DB access allowed). It is the only `db.transaction` in the codebase. It runs through the Supabase pooler on port 6543 (transaction mode, `prepare: false`), where transactions work, but that is unverified in this repo.

## Judgement calls (all mine, none ruled by Lorenzo)

1. **4.11, the claim.** The contract says "inside the existing claim (`scoring-claim.ts`)", but that file exists only on `main`. I brought main's code over and extended it with the beat, the token release and the owned write. Without them, a retrying pass that ran past the 6-minute stale limit could write a second row, against Lorenzo's "NEVER". It needs no migration (`flags_jsonb` only).
   - Cost: when `phase1` meets `main`, `scoring-claim.ts`, `score-session.ts` and the score route conflict as add/add or both-modified. Take this branch's version, which is a superset of main's.
   - A retry re-runs the whole dead call. Its partial output is discarded, and the tokens it used are spent.
2. **4.6, the share label.** Calls the broad cue starts reuse row 11's `cue: 'want_is'` tag, so `check-cost` reports the combined want-cue share. The ruling's ~2% was for the want cue's calls. Splitting the tag would mean editing `check-cost`.
3. **4.6 on untagged prof-001.** With the switch on, the broad cue and row 11's cue apply to prof-001 too; the switch decides, not the tags. prof-001 has 11 of the 25 calls.
4. **4.8, past the literal task.** The first-step line is skipped as well when the answer sequenced it, and the measure line is the fallback. The batch-36 Aldermoor grading counted first-step re-asks with the mitigation ones. Cost: 15 shifted re-asks onto the measure line (listed above). There is no fourth line: either a new neutral pool or letting close_wait close needs his wording or ruling.
5. **4.8, probe counting.** Close_wait's follow-ups are no longer counted as checker probes (gated, in Stream 3's `math-checker-live.ts`). Without this the switch produced a false "Probed twice" report line.
6. **4.9, scope.** "Clear recommendation" is a decision verb opening the first sentence. It counts in reply to a recommendation ask or in the synthesis phases, as the existing recommendation reader does. "The last two turns" means the current and previous candidate messages.
7. **4.9, the earlier close.** I kept the earlier closes as the consequence of his rule. I didn't add a variant that skips the re-ask without opening the end gate.
8. **4.10, the pool's words.** Understood. / Mm-hm. / Got it. come from the system prompt. "I see." is from code's acknowledgment-word list and is new to the interviewer's lines. "Okay." is left out (the prompt says "at most now and then") and "Right." too (graded as evaluative after a correction in b38). Four variants is the minimum for the last-3 rule, so after the third turn the rotation is a fixed cycle.
9. **Docs.** The PRD body, §16 and progress.md are not updated. Four streams edit them in parallel, so I left them to the lead at merge. This report has the content.

## Open questions for Lorenzo

- **4.9:** should a received recommendation open the end gate, as it does now? Early finishers then close about 5 minutes earlier (b34a and b36a Jasmine close at about 10–11 minutes of 25). The alternative is to skip only the re-ask.
- **4.8:** when the answer has already covered the mitigation, the first step and a checkpoint, what should close_wait ask? 15 turns in the replay.
- **4.11:** the owned write uses a transaction through the Supabase pooler. Is one wave's scoring enough to confirm it, or do you want a check against the database first (no cost, but a DB read)?
