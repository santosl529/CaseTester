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

---

# Review fixes (one round, 26 Oct)

Branch `phase1-s4b-fixes`, continuing off 11f43917. The nine required items from the review (handoff.md, "Required
before merging Stream 4b"). Every commit passes `npx vitest run` (245 files, 5,213 tests), `npx tsc --noEmit` and
`npx eslint lib app components tests scripts db`. No API spend, no database access of any kind.

| Commit | Items |
|---|---|
| 30772457 | 1 (clearRecommendation's false positives) and 2 (`recommendationOpensGate`) |
| 456ce09e | 3 (the want cue's share denominators) |
| ec0c9898 | 4 (close_wait's action test; the probe strip as a pool pattern) |
| 0effe273 | 5 (the retry layers) and 6 (the route's budget) |
| 0629a477 | 7 (the transaction's fallback) |
| 2bb8464f | 8 (no rotated ack in front of a correction) |

Item 9 (merge care for `score-session.ts`) is the lead's at merge; nothing to do here.

## The replay

`proof.sh` from this worktree, plus the b38 Larkspur slice (a scratchpad script with
`REPLAY_FILTER=batch-38-larkspur-oct-21`): 30 slices. Output in
`/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-s4b-fix-*`, against the same base
(`phase1-s4b-base`, the contract commit 0f932c89).

| Label | `ENGINE_SWITCHES` |
|---|---|
| `phase1-s4b-fix-off` | none |
| `phase1-s4b-fix-t410-on` | `*=ackRotation` |
| `phase1-s4b-fix-on-narrow` | `*=wantCueBroad,closeWaitMitigation,recommendationReceived,ackRotation` |
| `phase1-s4b-fix-on-gate` | the same **+ `recommendationOpensGate`** |

**Switches off: byte-identical.** 0 changed interviewer lines and 0 changed checker decisions on all 30 slices —
and, stronger than last round's claim, **all 225 `live-run-*.json` files (turns, session flags, revealed data,
events, analytics) compare byte-for-byte equal to the base**, and all 14 `checker-replay.jsonl` files are equal
once the timing fields are stripped. (The `.turns.jsonl.gz` mirrors differ only in the gzip header's timestamp.)

**All four on (narrow 4.9): 1,176 changed lines, 0 changed decisions.** Every changed line classifies:

| Class | Lines |
|---|---|
| Opening acknowledgment rotated (4.10) | 1,120 |
| close_wait follow-up changed (4.8) | 53 |
| Time warning's recommendation re-ask skipped (4.9 narrow) | 3 |

The fact-check counts (F1 / F2-next / F2-rec / F3 / F4) are identical to the base on **every** slice, in both on
arms. No new false refusal, wrong release or false correction.

## 1 — `clearRecommendation`'s false positives (HIGH)

**What changed** (`stall.ts`). The bare imperative read a noun or a subject as its verb. Three guards, as the review
set out: the matched word is no imperative when a hyphen follows it, or a copula/auxiliary
(`is|are|was|were|would|will|has|have|had|could|should|might|cost|costs`); the lookahead exclusions gain
`the question|looking|digging|checking|exploring|open`; and a decision frame
(`^(?:so,?\s*)?(?:my recommendation is|I'?d recommend|I recommend|we should)`) counts as an alternative to the bare
imperative.

**Tests** (`tests/orchestrator/recommendation-clear.test.ts`). All six sentences the review named are negatives, and
all six returned `true` before the fix (verified by running the tests against the old code). The imperatives that had
to keep working — "Keep Starter, and raise the price to $60." and "Partner for launch, with a path to build later." —
are positives beside the five verbatim Quillpath replies, and four decision-frame sentences are new positives.
24 tests in the file, all passing.

**Residual risk I did not fix, because the review asked for the frame:** "We should probably get more data before I
commit." matches the decision frame and is not a recommendation. With item 2's narrow default the only consequence is
a time warning that doesn't re-ask for a recommendation, so I left it. Worth his eye.

## 2 — narrow by default, wide behind a switch

`recommendationReceived` now does only what the contract's 4.9 asks: it feeds `recJustGiven` to the time warning and
**does not** touch `recommendationDelivered`. The wider reading is `recommendationOpensGate`, new in
`PHASE1_SWITCHES`, off by itself and riding on `recommendationReceived`.

**NOTE for the gate and the wave:** `ENGINE_SWITCHES='*=phase1'` means *every* switch, so it turns
`recommendationOpensGate` **on**. Until Lorenzo rules for the wider reading, the gate and the wave want
`'*=phase1,-recommendationOpensGate'`. (I added it to `PHASE1_SWITCHES` because the fix round asked for it there;
flagging the consequence rather than quietly keeping it out of the list.)

### The two arms, side by side

| | narrow (`recommendationReceived`) | wide (+ `recommendationOpensGate`) |
|---|---|---|
| Changed interviewer lines | 1,176 | 1,161 |
| Changed checker decisions | **0** | 2 (one claim) |
| Time-warning rec re-asks skipped | 2 runs (b32 Larkspur Marcus t32, b37 Quillpath Marcus t32) | the same 2 |
| Runs that close earlier | **none** | 5 |

The wide arm's five earlier closes, by turn count (the replay carries no elapsed clock; the minutes are last round's,
and the closes land on the same turn indices):

| Run | Base | Wide | Exchanges lost | Last round's minutes |
|---|---|---|---|---|
| b34 Aldermoor Jasmine | 37 turns | 21 | 8 | 15.5 → 9.9 min |
| b36 Aldermoor Jasmine | 39 turns | 25 | 7 | 15.0 → 10.9 min |
| b35 Quillpath Raj | 39 turns | 29 | 5 | 25.5 → 17.8 min |
| b37 Quillpath Raj | 41 turns | 35 | 3 | 25.9 → 21.3 min |
| b37 Quillpath Tyler | 35 turns | 31 | 2 | 26.5 → 23.4 min |

What is lost in those 25 exchanges is the model's post-recommendation pushback — the turns the compare report shows
being replaced by a goodbye are all probes ("Your own numbers show build worth about twice what the partner royalty
is. What would have to be true…", "On your claim that upgraders are worth $4,000 each: how did you get to that
figure…"). Pushback is one of the eight rubric dimensions.

The wide arm's 2 changed decisions are one claim, as last round: b37 Quillpath Raj 35:0 ("$5,200"),
`unresolved_at_close` → a close-hold probe at t37. Neutral, and it follows the 16 Oct rule.

**Open for Lorenzo.** Narrow is the default now. Wide is one switch away and costs the pushback evidence above.

## 3 — the want cue's share (MEDIUM)

Recomputed from the corpus, not taken from the review: 111 runs, batches 28–38, counting a turn where the message
asks only through a want cue, on a **model** turn (`startMessageAsks` returns `null` on any other kind), in
`WANT_ASK_PHASES`.

| Denominator | Turns | Share of the 25 calls |
|---|---|---|
| Candidate turns | 1,455 | 1.72% |
| **Model turns** (where the call can fire) | 1,100 | **2.27%** |
| **Want-phase model turns** (where this cue can fire) | 791 | **3.16%** |

**Plainly: the ~2% cap is met on candidate turns and is not met on either denominator where the call can fire** —
2.27% on model turns, a shade over, and 3.16% inside the phases. All three are now in the code comments
(`request-signal.ts`, `turn-data.ts`) and this is Lorenzo's to rule.

## 4 — close_wait's action test (MEDIUM)

**What changed** (`close-hold.ts`). `CLOSE_WAIT_ACTION` is five parts now, and the answer must do something:
an -ing/-ed form of an action verb; the verb under a decision frame within ~3 words; a thing put in place
(`put|set|build|add|run|hold|lock` + `tripwire|checkpoint|gate|trigger|control|go/no-go`); one of the headers
(`next steps`, `first step`, `what I'd do`, `Mitigation:` / `Protection:`); **or** — past the review's rule — the verb
in clause-initial imperative position with an object.

**Two deviations from the review's literal rule, both reported rather than slipped in:**
- the **clause-initial imperative** ("; stage the 60 reps", "Then phase it", "Gate full rollout"). Without it two of
  the six verbatim re-asks 4.8 exists to fix — b36 Aldermoor Raj t33 and b38 Larkspur Tyler t29 — come back. It
  cannot re-admit the review's false positives: neither "board **test** is on net sales" nor "a net-price-times-share
  **test**" is clause-initial.
- `Mitigation` / `Protection` as a header takes a comma as well as a colon, because b38 Larkspur Tyler t29 writes
  "Mitigation, in order:".

`CLOSE_WAIT_SAID_FIRST`'s bare `first` is tightened exactly as the review set out (sentence-initial, `first[,:]`,
"the first step/thing/move", "start(ing) with"); I also narrowed `begin\w*` to "begin with / by" for the same reason,
which the review didn't name.

**The probe strip** (`phrasing.ts withoutCloseWaitLines`) is a pattern over the `after_risk` / `first_step` /
`measure` pools instead of a literal case-sensitive split, so re-wrapping or recasing a close_wait question can no
longer silently break it. Both number-word spellings are kept.

**Replay.** The close_wait changed-turn count goes **62 → 53**. Nine turns go back to the base line entirely:

| Turn | It had been |
|---|---|
| b32 Aldermoor Marisol t30 | after_risk → first_step — **the "$300 million board test" the review named** |
| b32 Aldermoor Marcus t24 | after_risk → first_step — the other fair mitigation ask the last round lost |
| b28 Marcus t20 | after_risk → first_step |
| b29 Raj t20 | first_step → measure |
| b29 Fiona t16 | after_risk → measure |
| b33 Sofia t20 | after_risk → first_step |
| b33 Marcus t18 | after_risk → measure |
| b33 Fiona t18 | after_risk → measure |
| b34 Aldermoor Marcus t22 | first_step → measure |

Three more are half-tightened — the mitigation ask is still skipped, the first-step line no longer is, so they stop at
`first_step` instead of `measure`: b28 Raj t20, b30 Fiona t16, b30 Omar t16.

**Of the 15 shifted re-asks the last round flagged, 11 remain** (b34a Raj t26, b34l Marcus t28, b35h Raj t28, b35q
Jasmine t22, b36a Raj t34, b36l Marcus t24, b37h Raj t32, b37q Marisol t32, b32 Larkspur Raj t26, b32 Aldermoor
Jasmine t26, b30 Owen t16) and **4 are gone** (b29 Fiona t16, b29 Raj t20, b33 Fiona t18, b33 Marcus t18). The open
question for Lorenzo — what close_wait should ask when the answer has already covered the mitigation, the first step
and a checkpoint — still stands, on 11 turns rather than 15.

New transition table (53): after_risk → measure 25, first_step → measure 24, after_risk → first_step 4.
0 changed checker decisions, so the probe-count fix still holds (b31 Sofia t25's claim stays `unresolved_at_close`).

## 5 — the retry layers (MEDIUM)

**Chosen: drop the 429 / 5xx branch from `isStreamDeath`**, not `maxRetries: 0` on the three calls. Reason: the SDK's
own retry is the better one for those — `shouldRetry` honours `x-should-retry` and Retry-After and covers 408, 409,
429 and every 5xx, twice by default — and `maxRetries: 0` would have thrown that away, plus its pre-stream connection
retries, to buy nothing. What the SDK cannot retry is the request that already succeeded: the socket dropping
mid-stream, and the `error` SSE event, which `core/streaming.js` throws as an `APIError` with **no HTTP status**.

A trap the review didn't name and the first draft would have fallen into: an HTTP 500's body also carries
`error.type: "api_error"`, so the old mid-stream branch would have re-admitted every 5xx through the back door. The
branch is now guarded on a missing status.

Worst case for one 429 goes from 9 HTTP attempts plus 10 s of our own sleeps to the SDK's 3.

## 6 — the route's budget (MEDIUM)

`withStreamRetry` takes a deadline (`deps.deadlineAt`, or the pass's own) and skips a retry whose backoff plus
another call as long as the one that just died would run past it. `scoreAndStore` sets it with `withScoringDeadline`
around `compute`: `SCORING_BUDGET_MS` is 240 s, inside the route's `maxDuration = 300`. It is an
`AsyncLocalStorage`, as `lib/analytics.ts`'s draft scope, because one process can score two sessions at once and a
module-level deadline would be the wrong one. Tests cover the late death (2 attempts, not 3), the quick death inside
the budget (3), and the deadline arriving from the pass rather than the caller.

## 7 — the transaction's runtime risk (MEDIUM)

`storeIfClaimed` keeps the transaction and falls back, on an unexpected failure, to the same token-checked
conditional write without it. The fallback loses the row lock — a concurrent claimer could slip between the check and
the insert instead of blocking on the commit — and keeps the money: the alternative is a 500 after all three Opus
passes are paid, and a client retry that pays for them again. **Once `write` has run the error always stands**, so
nothing is ever written twice; that also covers the review's "never on `ClaimLostError`", since a lost claim returns
`false` rather than throwing (and importing that error here would be a cycle).

`tests/scoring/store-if-claimed.test.ts`, 5 cases with a mocked db: the transaction path, a lost claim, the fallback,
the fallback's own claim check, and a failure after the write. **No database was touched.** The SQL itself is still
unverified against Postgres — his open question stands, but it is no longer a question that can cost $0.60 a session.

## 8 — a rotated ack before a correction (LOW)

A turn that carries a correction code writes keeps the model's own opening word. The predicate is `turnCorrects` in
`stream-turn.ts` (a misquote, a correcting or restating checker line, a stage checker line, or a correcting recMath
probe); both the Stream and the Settle path pass it to `rotateOpeningAck`. It sits in `stream-turn.ts` rather than
`plan-turn.ts` so that plan-turn — and so `db/client` — stays out of the module graph of the eight test files that
read stream-turn's say-level helpers.

`rotateOpeningAck` now replaces only the opening sentence and keeps everything after it exactly as it came, so the two
paths cannot drift on whitespace either. A test runs the same says through both paths and compares.

**Replay** (`*=ackRotation` alone, against the base): **1,136 → 1,120 changed lines**. The 18 turns that stop rotating
are all on checker-on slices and all on the misquoter / confuser personas — b28 Jordan t20, b28/b29/b30/b31 Tyler
(t14, t8, t10, t16, t8, t16), b32 Marisol t14 and t20, b32 Tyler t12, b33 Jordan t10, b35q Marisol t12, b35q Tyler t8,
b37q Raj t20 and t28, b37q Jasmine t12 and t16. Two turns newly rotate (b37q Raj t26, b37q Jasmine t24): the pool's
use history shifted, and a turn that used to land back on "Understood." now lands on "Mm-hm.".

The rotation still does its job with the four switches on: **"Understood." openers 511 → 254** of 1,571 interviewer
turns, **consecutive same-acknowledgment pairs 140 → 0**.
