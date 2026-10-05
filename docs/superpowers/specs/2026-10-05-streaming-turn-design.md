# Streaming interviewer turn (Plan → Stream → Settle) — design

Date: 2026-10-05 · Status: draft for review · Scope: text core only (no voice code)

## 1. Why

The voice budget (PRD §8.2: ≤1.5s end-of-speech → first AI audio) needs the
interviewer's first sentence handed to TTS while the model is still writing.
Today a turn is whole-turn-then-release: `runInterviewerTurn` returns a
finished `Action[]`, then ~20 steps in `lib/orchestrator/session-runner.ts`
rewrite one `spokenText` string. Nothing can be spoken before the model
finishes and every rewrite has run.

Measured 2026-10-05 (`scripts/replay-output-format.ts`, arms S/SL/H/GS, 50
batch 7–8 turns, commit f077c45): Sonnet 5.5 first token 1.35s median, first
complete `say` sentence 1.64s, full turn 2.18s (p95 2.66s vs 3.42s). Sonnet
stays the interviewer (Haiku 4.5 was faster, 1.05s first sentence, but showed
data-gating and demeanor failures on hand-read turns).

This restructure makes the first sentence available at roughly the model's
first-sentence time without weakening any guard. It is the prerequisite for
M2; it does not by itself meet the voice budget (speculative start and the
acknowledgment clip are M2 work).

## 2. Goals and non-goals

Goals
- Each turn runs in three stages: **Plan** (decisions, no side effects),
  **Stream** (model output checked sentence by sentence and delivered as
  segments), **Settle** (end-of-turn repairs, bookkeeping, one commit).
- FR-4 holds: no figure reaches delivery without passing the provenance gate.
- Every guarantee pinned by guard unit tests and `tests/replay/corpus.test.ts`
  holds.
- The text product behaves the same from the user's side: the route collects
  segments into today's `TurnResult`; `components/chat-window.tsx` unchanged.

Non-goals (M2 or later)
- Voice code, LiveKit wiring, TTS, pre-rendered audio, acknowledgment clip.
- Speculative start on an early end-of-turn signal (enabled by Plan purity,
  not built here).
- Per-case id enum in the response schema; model or prompt changes.
- Streaming to the browser.

## 3. Decisions (agreed 2026-10-05)

- **D1 Distress gate:** nothing is delivered until the C5 model-layer verdict
  (Haiku) is in. A distress verdict discards the draft and returns the scripted
  offer, as today.
- **D2 Late-case turns are buffered:** turns where a whole-turn replacement can
  fire run today's full-turn logic unchanged (see §4.3).
- **D3 Reveals are booked on delivery:** a ledger item counts as revealed when
  the segment carrying it is delivered. Text mode delivers immediately; voice
  will acknowledge on playback.
- **D4 Trailing questions are held** until the stream ends, so every
  insert-before-the-question repair keeps working. In the JSON stream the end
  of the last question is ~10 tokens before the end of the stream.

## 4. Design

### 4.1 Modules

| Module | Role |
|---|---|
| `lib/agent/models/json-action-stream.ts` (new) | Pure incremental parser: raw JSON text chunks → `sentence` / `action` events |
| `lib/agent/models/anthropic.ts` | `streamTurn` via `client.beta.messages.stream`; `runTurn` collects it |
| `lib/agent/models/interface.ts` | `streamTurn(ctx): AsyncIterable<TurnEvent>` on `InterviewerModel` |
| `lib/agent/interviewer.ts` | `streamInterviewerTurn` (phase filter per action); `runInterviewerTurn` collects it |
| `lib/orchestrator/plan-turn.ts` (new) | Plan stage → `TurnPlan` |
| `lib/orchestrator/stream-turn.ts` (new) | Stream stage: distress gate, sentence gates, question hold, buffer switch, segment delivery |
| `lib/orchestrator/settle-turn.ts` (new) | Settle stage: end-of-turn repairs, bookkeeping, commit |
| `lib/orchestrator/session-runner.ts` | Short coordinator: reads → plan → stream → settle; `runSilence` unchanged |
| `app/api/channel/[sessionId]/turn/route.ts` | Collects segments into `TurnResult` (unchanged response shape) |

Guard functions (`audit.ts`, `numeric-provenance.ts`, `probe-guard.ts`,
`assumption-guard.ts`, `synthesis-guard.ts`, `spoken-close.ts`,
`data-requests.ts`, …) are reused, not rewritten. Where a guard needs to run on
one sentence, it is called on that sentence's text with the same arguments.

### 4.2 Plan (`plan-turn.ts`)

Input: the five session reads (unchanged, parallel) and the candidate message.
Output: a `TurnPlan`, no database writes.

```ts
type TurnPlan =
  | { kind: 'scripted'; text: string; ended: boolean; scoringSuppressed?: boolean;
      sessionUpdate: SessionUpdate; events: PendingEvent[]; checks: CheckLog }
  | { kind: 'model'; promptCtx: PromptContext; history: ModelMessage[];
      buffered: boolean; bufferReason?: string;
      state: TurnState;            // ledger, flags, stall decision, verified figures, recompute flags/attempts, stages, mayEnd, …
      distress: Promise<DistressVerdict | null>;
      detectedRequests: Promise<DataRequest[] | null>;
      events: PendingEvent[]; checks: CheckLog };
```

- `scripted`: distress-offer reply (accept → close), conduct terminate / warn,
  regex C5 offer. Today's early-return paths, with their writes moved into
  `sessionUpdate` / `events` and executed by Settle's commit.
- `model`: everything computed before the model call today (lines 144–405):
  silence resume, ledger rebuild, open requests, clock, coverage and end gate,
  recompute, verified figures, unit check, stall ladder, C4 redirect hint.
  The `session_resumed` and `recompute_flag` events become `PendingEvent`s.
- The distress and data-request classifiers start here, as today.
- `buffered` is true when any of: `timeUp`, time warning due
  (`shouldFireTimeWarning && !recommendationReceived`), `mayEnd`,
  `awaitingRecAsk`, current phase is RECOMMENDATION or WRAP.

### 4.3 Stream (`stream-turn.ts`)

Consumes `streamInterviewerTurn` events and delivers `Segment`s:

```ts
type Segment = { text: string; revealIds: string[]; exhibitId?: string };
type SegmentSink = (s: Segment) => Promise<void>;   // resolves when delivered (D3)
```

Order of operations:
1. **Distress gate (D1).** Model events are buffered until `plan.distress`
   resolves. Positive verdict → stop consuming, return `{ discarded: 'distress' }`;
   Settle commits the scripted offer (today's `offerPause`).
2. **Buffered turn** (`plan.buffered`, or switched by step 4): collect every
   event; at `done`, hand the full action list to Settle, which runs today's
   full-turn logic unchanged (D2). Nothing is delivered from Stream.
3. **Streaming turn**, per event:
   - `sentence` → gates in today's order: `stripFabricatedTurn` (a cut ends
     the model's text for the turn), `stripMetaLeak`, `rewriteSystemLanguage`,
     `stripCopiedCheckIn`, `enforceNumericProvenance`,
     `withholdProbesOnVerified`, `withholdAssumptionChallenges` (withheld
     items are recorded for Settle to release or defer). A sentence that ends
     in `?` is held (D4); a held question is released before the next
     non-question sentence. Otherwise deliver.
   - `action: reveal_data` → resolve and `canReveal`; deliver a segment with
     the approved wording and `revealIds`; the ledger books it when the sink
     resolves (D3). Unresolvable id: recorded, no segment.
   - `action: show_exhibit` → deliver a segment with `exhibitId` (exhibit
     coverage via `markExhibitReveals` booked on delivery).
   - `action: advance_phase` / `end_case` → recorded for Settle (end is only
     honoured at `done`; `normalizeActions` already drops anything after it).
4. **Switch to buffered mid-stream** when a sentence matches the close cues
   used by `resolveSpokenClose`, or, in BRAINSTORM, `suppliesRecommendation`.
   The triggering sentence and everything after it are collected, not
   delivered; Settle runs the full-turn logic on the undelivered remainder.
   Behaviour change: sentences already delivered stay delivered (today the
   whole turn would be replaced). Logged as check `stream_buffer_switch`.
5. At `done`: held questions and the event record go to Settle.

Gates that need cross-sentence state (provenance allowed texts, probe-guard
`explainProbed`, `metaStripped`, `fabricatedStripped`) keep it in a
per-turn accumulator, so the check log records the same decisions as today.

### 4.4 Settle (`settle-turn.ts`)

Runs after `done` (or immediately for `scripted` / distress-discarded plans):
- **Streaming turns:** today's post-turn steps that add or insert, applied to
  the held questions and undelivered text only: wordless exhibit / reveal
  lines, exhibit and data promise recovery (`handoffSentences` read over all
  delivered + held text), accepted offer, same-turn resolution, stale
  releases, forced release on a model-asked recommendation,
  assumption-guard releases, empty-turn guard. Inserts go before the held
  question via `insertBeforeTrailingQuestions`; the result is delivered.
- **Buffered turns:** today's lines 470–1031 run unchanged on the full action
  list (minus anything Stream already delivered before a mid-stream switch).
- **Both:** phase repair, provenance re-check on the final undelivered text,
  timeframe check (log only), `auditTurn` / `auditTurnStyle` on the full
  delivered text, rung delivery + hint check, then **one commit**: turns,
  checks, revealed rows (delivered only), exhibit row, session update, pending
  events, assist / load-shed / synthesis-unresolved events. Analytics stay on
  `later()`.
- `turn_latency` gains `firstSegmentMs` (turn start → first delivered segment)
  and `streamed: boolean`.

### 4.5 Model layer

- `TurnEvent = { type: 'sentence'; text; sayIndex } | { type: 'action'; action }
  | { type: 'done'; actions; report; usage; refused }`.
- `json-action-stream.ts`: incremental parse of `{"actions":[...]}` from text
  chunks; sentence split on `. ? !` followed by whitespace, or the string's
  closing quote; escape-aware; an action is emitted when its object closes.
- At `done`, `normalizeActions` runs on the full raw list as today.
- **Regeneration** only while nothing has been delivered (the distress wait and
  question hold make this common): unparseable / empty / unknown id → one
  regeneration with today's note. After delivery: unknown ids are dropped
  (promise recovery covers them); truncated JSON keeps what was delivered and
  falls to the empty-turn and close safety nets.
- Refusal at `done` with nothing delivered → today's neutral continuation;
  mid-stream refusal keeps what was delivered.
- `runTurn` / `runInterviewerTurn` collect the stream, so
  `scripts/replay-output-format.ts`, `scripts/live-run.ts`, and the
  hallucination harness keep working.

### 4.6 Text route

`runTurn(sessionId, text, { defer, onSegment? })`. The turn route passes no
`onSegment`; segments are joined into `interviewerText` and the exhibit field
as today. `TurnResult` is unchanged.

## 5. Testing

New unit tests:
- Parser: chunk boundaries anywhere (including mid-escape), escaped quotes,
  sentence split across chunks, several `say`s, actions between `say`s,
  truncation.
- Stream gates: each of the seven gates acting on one sentence.
- Question hold: trailing question held; mid-turn question released when a
  statement follows; inserts land before the held question.
- Buffer switch: each plan condition; goodbye cue mid-stream; BRAINSTORM
  recommendation supply.
- Plan purity: no `db` call before commit (mocked db).
- Buffered equivalence: the same input gives the same `TurnResult` as the
  current runner on representative turns (close, grace ask, forced release,
  synthesis guard).
- D3: a reveal segment whose sink rejects is not booked.

Unchanged and must stay green: every guard unit test, `tests/agent/*`,
`tests/replay/corpus.test.ts`, the hallucination harness.

## 6. Verification gate

1. Typecheck, lint (voice boundary included), tests, production build.
2. `$1` smoke run (`scripts/live-run.ts`), then one 10-persona batch (cost
   approval first; ~$10 at batch-5 rates).
3. Batch criteria: 0 leaks, 0 broken promises, 0 ignored ledger requests, one
   goodbye per session, no new blank turns; `firstSegmentMs` clearly below
   full-turn time on streamed turns.
4. Transcripts read by hand (counts verified, not just check events).

## 7. Risks

- **Mid-stream buffer switch** keeps already-delivered sentences that today
  would be replaced. Expected rare (goodbye / synthesis supply outside the
  buffered conditions); counted via `stream_buffer_switch`.
- **Per-sentence provenance** sees less context than the whole-turn call;
  allowed texts are the same, so the expected effect is none. Covered by the
  existing numeric-provenance tests run per sentence.
- **Large refactor of a 1,205-line function** with batch-tuned behaviour.
  Mitigation: buffered turns reuse today's code path; one commit per task;
  replay corpus and a persona batch before done.

## 8. PRD updates to flag (not edited)

- §8.1 "orchestrator (unchanged from M1)" → the orchestrator gains a streaming
  turn (this spec).
- §8.2 add `firstSegmentMs`; record the 2026-10-05 streaming measurements.
- §8.3 the LiveKit `llmNode` override consumes `streamTurn` segments.
- Define "revealed" as delivered (D3) in the data-ledger section.
