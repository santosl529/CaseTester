# M0 Phase B — one interruptible voice interview on localhost

Status: **draft for review (8 Oct 2026)** — §5 (delivery semantics) must be reviewed before any code.
Builds on: technical PRD §8 (voice), M0 Phase A (`lib/voice`, `scripts/voice-latency.ts`), specs
`2026-10-05-streaming-turn` (D1–D4) and `2026-10-06-plan-owns-decisions`.

## 1. Goal

One complete, interruptible prof-001 interview in a browser on localhost — mic in, interviewer
audio out, captions, exhibits, an end button — through the real orchestrator, with per-turn
timing from end of candidate speech to the first sound and the first useful audio. The point is
to hear the latency and measure it on a live mic, not to launch voice.

**Success =** (a) a full interview runs from opening to close (or End) with no manual repair;
(b) barge-in stops the interviewer within ~0.5s of detection and the transcript, reveals and
exhibits afterwards match what was actually heard (§5); (c) every turn has a timing record
(§7) and the session ends with a median/p90 summary.

**Non-goals (this phase):** production hosting, LiveKit Cloud, concurrency beyond one interview,
mobile, text-fallback on voice failure, silence check-ins (`runSilence`), speculation (built,
stays off), LiveKit's turn-detector model, end-of-turn tuning, keyterms, the voice report UI, a
TTS vendor change, any subscription purchase.

## 2. Fixed choices (from the brief)

| Item | Choice |
|---|---|
| Transport | LiveKit, local `livekit-server --dev` (free, no cloud account) |
| STT / TTS | Existing adapters: Deepgram Flux (`DeepgramFluxSTT`, eot 0.7 / eager 0.5) and Cartesia (`CartesiaTTS`, Sonic 3.5) |
| Interviewer | Claude Haiku 5.5 via `INTERVIEWER_PROVIDER=anthropic-haiku55-none-medium`, set **only in the voice agent process**. Text routes and production default stay Sonnet 5.5. Known Haiku faults from the 8 Oct screen (grading in `say`, unasked releases) are expected, not this phase's problem. |
| Background checks | Unchanged mixed set (`BACKGROUND_MODEL_ID`): distress + pressure-test judges on Haiku 5.5; coverage, data-request, hint check on Haiku 4.5 |
| Speculation | Disabled. Eager signals are logged only. |
| Auth / session / scoring | Reused: Supabase auth, `POST /api/session` (club code), the `sessions` row, `POST /api/channel/[id]/score`, the report page |

## 3. Approach

**Chosen: LiveKit Agents worker for dispatch + raw `@livekit/rtc-node` media + our own turn
controller.** The worker (`defineAgent`, explicit dispatch by agent name) gives job lifecycle
and room join; the job subscribes to the candidate's mic track (`AudioStream`), publishes one
interviewer track (`AudioSource`), and runs a `VoiceTurnController` that owns turn-taking:
Flux end-of-turn → acknowledgment → `runTurn({ onSegment, heard })` → Cartesia → playout.

Rejected: **`AgentSession` with an `llmNode` override** (PRD §8.3's sketch). It owns STT,
endpointing, interruption and playout internally; we would have to fight it for Flux's
end-of-turn and could not get per-segment playout facts back into `runTurn`, which reveal
bookkeeping needs (§5). Revisit for hosting, not for this test.
Rejected: **plain WebSocket, no LiveKit** — simpler on localhost but thrown away; the brief says
LiveKit.

Fallback if the worker's job subprocess cannot load our TypeScript under `tsx` (Task 4's first
step checks this): same controller, entry joins the room directly with `Room.connect` from a
single process. Only the entry file changes.

## 4. Processes and data flow

```
 browser (Next page)                LiveKit dev server             voice agent (Node, tsx)
 ─────────────────                  ──────────────────             ───────────────────────
 mic track  ───────────────────────────────►  ─────────────────►  AudioStream → VAD (speech end)
                                                                              → Flux STT ─► controller
 <audio> ◄──────────────────────────────────  ◄──────────────────  AudioSource ◄─ Playout ◄─ Cartesia
 captions/exhibit/state ◄── data "case" ◄────  ◄──────────────────  controller (word-synced)
 End ──► POST /api/voice/[id]/end (marks abandoned) → disconnect → agent stops
 Start ─► POST /api/voice/[id]/token (auth, owner, active) → token with agent dispatch {sessionId}
                                                                   controller ─► runTurn (orchestrator, DB)
```

The orchestrator stays voice-free: new types (`HeardReport`) live in `lib/orchestrator`; only
`lib/voice` implements them. The lint boundary rule is unchanged.

## 5. Delivery semantics (review before implementation)

Terms, per interviewer turn:

- **Segment** — what `runTurn` hands to `onSegment` (`say` | `data` | `tail` | `scripted`).
- **Accepted** — the sink took the segment for playback. The sink resolves on acceptance (so the
  stream stays pipelined: the next segment is synthesized while this one plays) and **rejects**
  when the turn is already interrupted. Rejection keeps today's D3 path: not delivered, not booked.
- **Playout clock** — the agent pushes 20ms PCM frames into the LiveKit `AudioSource`. A frame
  captured at wall time `t` with `q` ms already queued plays during `[t+q, t+q+20]`. So each
  segment gets a computed `startAt` and `endAt` on the agent clock. The browser hears it
  ~50–150ms later (network + jitter buffer). That lag is covered by a margin, not measured per
  frame.
- **Played** — `endAt ≤ interruptAt − HEARD_MARGIN_MS` (150ms), or the turn finished playing
  without interruption. **Partial** — `startAt < interruptAt` but not played. **Unplayed** — never
  started (including accepted segments still in TTS or queue when interrupted).
- **Heard text** — for played segments, the full text. For a partial segment, the words whose
  Cartesia word-timestamp end falls before `interruptAt − HEARD_MARGIN_MS − startAt`. Without
  timestamps, the whole sentences that fit by character share. For unplayed segments, nothing.

**Audio unlocked first.** The agent's playout clock is only meaningful if the browser is
actually playing. The agent says nothing — not even the opening — until the browser sends
`ready`, which it does after `room.startAudio()` succeeds and `room.canPlaybackAudio` is true
(Start-button gesture). Blocked autoplay → UI asks for a click; the agent keeps waiting.

**Playback confirmation.** `runTurn` gets `heard: () => Promise<HeardReport>`. The runner calls it
after the tail is delivered and before `persist`. It resolves when the turn's last accepted
segment has finished playing, or at once on interruption. The report lists every accepted
segment with `playback` (played | partial | unplayed), `heardText`, `revealIds`, `exhibitId`,
`startedAt`, and an `interrupted` flag. Text mode passes no `heard`, so behavior there is unchanged.
In voice, `runTurn` therefore returns after the interviewer stops talking; the next turn's
processing waits for it (§5.6).

**5.1 Reveal bookkeeping (FR-4 direction: never over-book; under-booking is allowed).**
- A ledger item is booked only if its segment was **played**. Partial or unplayed → not booked,
  even if the figure's word was spoken. Consequence: a figure cut mid-segment can be re-released
  later. The provenance gate still blocks the interviewer from using it unreleased. That is the
  safe direction.
- An **exhibit** is booked (row + the ledger items it displays) if its segment **started**. The
  browser shows the exhibit at that segment's `startAt`, and something seen on screen was
  delivered. An exhibit whose segment never started is neither shown nor booked.
- Captions show **heard words only**: interviewer captions are sent word by word on the playout
  clock, so the screen never shows a figure the ledger doesn't hold.

**5.2 Partial delivery — what Settle keeps.** With a report present, `persist` applies it:
- Saved interviewer line = acknowledgment + the joined `heardText` of all segments (not the
  composed `spokenText`). `TurnResult.interviewerText` is the same.
- `lastQuestion` is updated only if the question's full text is inside the heard text; otherwise
  the previous one stands.
- The pressure test: if the question was not heard, the state reverts to the previous one,
  except for what the candidate's reply decided this turn (`structureGiven`, and `satisfied`).
  A code-asked probe or structure ask that was not heard is not spent.
- A stall rung counts as delivered only if its delivery span is inside the heard text; otherwise
  `revertUndeliveredRung` and the `rung_not_delivered` event (existing path).
- Stays as decided, logged: phase advance, `ended`, moves, time-warning or grace flags, the audits
  (run on the composed text, a superset).
- New check `voice_heard` records interrupted, unplayed or partial segments, dropped reveal ids,
  and whether the question was heard.

**5.3 Interrupted vs cancelled turns.**
- **Interrupted** — barge-in after at least one of the turn's segments started. Persisted per
  §5.2.
- **Cancelled (stale result)** — barge-in before any segment of the turn started (only the
  acknowledgment or silence was heard). The runner throws `TurnCancelled` before `persist`:
  nothing is written, deferred analytics are dropped, and nothing was booked. Plan has no side
  effects, so this is clean. The controller **carries** the candidate's text and prepends it to
  the next final transcript, so one candidate turn = everything said before the interviewer was
  heard. This is the recovery for a premature end-of-turn (PRD §8.5).
- The cancelled turn's model stream runs to completion in the background (Haiku: <2s, ~$0.001)
  and is not aborted in v1. The time the next turn waits for it is measured (`queueWaitMs`).

**5.4 Scripted turns are not interruptible.** A `scripted` segment (distress offer, conduct
warning) is always accepted and played to the end, even after the same turn was interrupted
(e.g. the model-layer distress verdict lands after a barge-in). While a scripted segment plays,
barge-in is ignored. Scripted paths never call `heard`, so they are never cancelled. Reason: an
unheard distress offer must not be recorded as offered.

**5.5 Barge-in trigger and action.**
- Trigger while `thinking` (ack playing or waiting, no segment started): any Flux
  `StartOfTurn`/`Update` with ≥ 1 word — nothing of the turn has been heard yet, so the
  continuation always wins (→ cancelled, §5.3).
- Trigger while `speaking` a non-scripted segment: ≥ `VOICE_BARGE_MIN_WORDS` words (default 2,
  so "mm-hm" doesn't cut the data line).
- Action, in order: set `interruptAt`, clear the `AudioSource` queue, cancel Cartesia contexts,
  cancel pending caption/exhibit timers, reject further segments of the turn, resolve `heard`,
  set state `listening`.
- A Flux final that arrives while the interviewer is speaking with no barge-in (below the word
  minimum) is a **backchannel**: dropped and logged, never a turn.
- The opening line (already persisted by `startSession`) is spoken on join and is interruptible
  with no bookkeeping. On re-join the last interviewer line is replayed the same way.

**5.6 Stale results and ordering.**
- Every controller turn has a sequence number. Every async callback (TTS audio, timers, Flux
  messages, runner results) checks it, and anything for an older turn is dropped. Data-channel
  messages carry `turnSeq`; the browser ignores older ones.
- One `runTurn` at a time per session: a final that arrives while the previous turn is still
  settling or persisting waits (measured as `queueWaitMs`). Cancelled turns release the lock when
  their stream ends.
- End: `POST /api/voice/[id]/end` marks the session `abandoned` (only if `active`); the browser
  then disconnects; the agent interrupts and lets any in-flight turn settle. Settle's session
  update must not revive it. With `heard` present, `persist` re-reads the status and skips the
  session update if it is no longer `active` (turn rows of heard speech are still written).
- Abandoned sessions are never scored (existing rule). A naturally ended session offers an
  optional "Score this interview" button.

**5.7 Failures.** A TTS error on a segment marks it unplayed (not booked). The UI shows "audio
failed" and the controller keeps listening. A Flux socket close: reopen once, else show an error
state. Neither tries to fall back to text this phase.

## 6. Browser interface (minimal)

`/case/[sessionId]/voice`: the same auth and ownership checks as the case page. A Start button
(the user gesture audio needs) gets a token and connects; the mic is published with echo
cancellation, noise suppression and auto-gain on, and **headphones are required for the test**.
On screen: a state pill (Listening · Thinking · Speaking · Ended), a rolling caption list
(interviewer heard words, candidate interim then final), the exhibit panel (the existing table,
pulled out of `chat-window.tsx`), the case prompt, End, and a one-line debug strip with the last
turn's first sound / first useful audio. A natural end shows "Score this interview" (existing
score route, then the report page). A link to the voice page appears on the case page only
when the server sets `VOICE_DEV=1`.

## 7. Instrumentation

Per turn, agent clock, written as JSONL to `Case Interview Runs/voice-live/<date>/<sessionId>.jsonl`
and one console line:

| Field | Definition |
|---|---|
| `speechEndAt` | last mic frame above the VAD threshold (RMS 0.02, `pcm.ts`) before Flux's final |
| `endpointMs` | Flux `EndOfTurn` − `speechEndAt` |
| `queueWaitMs` | final → `runTurn` start (previous turn still settling) |
| `firstSoundMs` | `speechEndAt` → playout start of the first audio (ack, else first segment) |
| `firstUsefulMs` | `speechEndAt` → playout start of the first useful segment (`isUsefulSegment`: data, tail, scripted) |
| `firstSegmentAcceptedMs`, `ttsFirstAudioMs` | runner delivery and Cartesia's first chunk for that segment |
| `waits` | ms the delivery path was blocked on each classifier: `distress` (only if `held_for_distress`: verdict − model first sentence), `ptJudge`, `structureJudge`, `hintCheck`, `codeWrittenChecks` — from new/existing `TurnTimer` marks, passed out via `onTiming` |
| `marks` | the runner's full `TurnTimer` marks (any wait not listed above still shows) |
| `interrupted`, `cancelled`, `carried`, `backchannelsDropped`, `droppedRevealIds` | §5 outcomes |
| `ack`, `kind`, `phase`, `interviewer` (model id) | context |

Session end: medians and p90s of `endpointMs`, `firstSoundMs`, `firstUsefulMs`, the model's
first sentence, and `ttsFirstAudioMs`; counts of interruptions, cancellations and backchannels;
LLM spend from the meter; TTS characters; Flux minutes.

**Client cross-check:** the browser measures mic level falling silent → interviewer audio level
rising, on its own clock (Web Audio `AnalyserNode`), and sends `{turnSeq, clientFirstSoundMs}`
back (the same back-channel carries `ready`, §5). Recorded beside the agent number, so network and jitter-buffer lag are visible. This needs
headphones; on speakers the interviewer's echo pollutes the mic level.

## 8. New and changed code

| Path | Change |
|---|---|
| `lib/orchestrator/turn-types.ts` | `HeardReport`, `SegmentPlayback`, `TurnCancelled` |
| `lib/orchestrator/session-runner.ts` | `heard` + `onTiming` options; cancel path drops deferred work |
| `lib/orchestrator/settle-turn.ts` | `persist(latency, heard?)` applies §5.1–5.2; status re-check |
| `lib/orchestrator/stream-turn.ts`, `settle-turn.ts` | `pt_judge` / `structure_judge` timer marks |
| `lib/voice/types.ts`, `cartesia.ts` | word timestamps (`add_timestamps`), `onWords` |
| `lib/voice/deepgram.ts` | Flux `StartOfTurn` / `Update` signals (word counts) |
| `lib/voice/playout.ts` (new) | playout clock, per-segment start/end, interrupt, heard text |
| `lib/voice/turn-controller.ts` (new) | state machine, barge-in, carry, serialization, sink, `heard`, records |
| `lib/voice/protocol.ts` (new) | data-channel message types (shared with the browser; types only) |
| `lib/voice/fake-tts.ts` (new) | tone-per-character TTS for free development runs (`VOICE_TTS=fake`) |
| `lib/voice/records.ts`, `tts-budget.ts`, `pcm.ts` (new / extended) | timing records + summary, monthly TTS character ledger, VAD speech-end tracker |
| `lib/voice/livekit-agent.ts` (new), `scripts/voice-agent.ts` (new) | the job: room media ↔ controller, budgets; the worker launcher |
| `lib/orchestrator/heard.ts` (new) | pure application of a `HeardReport` (§5.1–5.2) |
| `app/api/voice/[sessionId]/token`, `/end` (new) | token + dispatch; end → abandoned |
| `app/case/[sessionId]/voice/page.tsx`, `components/voice-room.tsx`, `components/exhibit-table.tsx` | UI |
| `package.json` | `@livekit/rtc-node@^1.1.0` as a direct dependency (already installed as a peer of `@livekit/agents` — **needs your OK**); script `voice:agent` |
| `.env.example` | `LIVEKIT_*` (dev defaults), `VOICE_DEV`, `VOICE_TTS`, `VOICE_TTS_CHAR_CAP`, `VOICE_BARGE_MIN_WORDS`, `VOICE_MAX_SESSION_MIN` |

## 9. Cost and funding

**TTS — the only purchase needed, not made yet.** Cartesia (checked 8 Oct, cartesia.ai/pricing):
Free gives 20K credits/month, non-commercial, 2 concurrent — and it is exhausted (402 since 6–7 Oct).
**Pro: $5/month**, 100K credits (1 credit = 1 character, ~750–800 per minute of audio ≈ 133
minutes), commercial use, 3 concurrent. Overages (Pro $65 per 1M characters) stay **off**.
Interviewer speech per full interview, from 43 saved runs (batches 11–17 + 8 Oct prefix runs):
median 2.6K characters, mean 3.5K, max 11.9K, plus ~0.5–1K for the opening. Acknowledgments are
synthesized once and cached on disk. Development uses the fake TTS ($0), so Cartesia is needed
only for the listening runs (Task 6): 3 interviews + a barge-in drill ≈ 15–40K characters.
**Minimum funding: Cartesia Pro, $5 for one month.** The free tier would not cover the runs even
if it renews, and it does not allow commercial use.

**Per interview (estimates; verify against the meter):**
- Deepgram Flux: $0.0065/min promo, $0.0077 list. The mic streams all session, so ~20–25 min ≈
  $0.13–0.19. Phase A ran on the account's credit. One stream at a time is fine here.
- Anthropic: Haiku 5.5 interviewer + mixed checks. The 8 Oct Haiku 5.5 prefix runs (~30 turns)
  cost ≈ $0.11 each, mostly the coverage classifier on Haiku 4.5. The 8-turn voice demo cost
  $0.021. So ≈ $0.05–0.15 per interview.
- Scoring (optional): ≈ $0.45 per scored interview (Opus 5.5, batch 4).
- LiveKit: $0 (local dev server).

**Test spend estimate (asked for before each paid step):**
- Development smoke on fake TTS (Tasks 4–5): ~10 short sessions × (Flux ~$0.015 + LLM ~$0.02)
  ≈ **$0.35**.
- Listening gate (Task 6): 3 full interviews + 1 barge-in drill ≈ LLM $0.45, Flux $0.80, Cartesia
  within Pro.
- **Total ≈ $5 Cartesia + ~$1.60 usage**, plus $0.45 per interview you choose to score.

**Guards:** `LLM_BUDGET_USD` is required by the agent (existing `requireRunBudget`, installed
per voice session; the `voice:agent` script sets $1.00). `VOICE_TTS_CHAR_CAP` is a **cumulative
monthly** character count kept in `.voice-cache/tts-chars-<yyyy-mm>.json` (default 90,000, under
Pro's 100K). Once fewer than 2,000 characters remain, the agent starts no new turn: it ends the
session with an on-screen notice rather than begin a turn it might not finish. `VOICE_MAX_SESSION_MIN` (default 25) ends the session and
stops streaming to Flux. One candidate per room: the agent subscribes only to the session
owner's first audio track and ignores any other participant (e.g. a second tab).

## 10. Testing

- Unit (free, vitest), test-first: Settle with a heard report — reveals of played segments only,
  exhibit on start, saved text = heard, question/pressure-test/rung reverts, status re-check;
  `TurnCancelled` drops writes and deferred work; scripted turns never cancelled; playout clock
  (fake clock) — start/end, interrupt, margin, heard words with and without timestamps;
  controller with a fake STT/TTS/runner — barge-in in each state, backchannel drop, carry and
  merge, serialization, stale callbacks dropped, scripted non-interruptible, record fields;
  Flux message parsing for StartOfTurn/Update.
- Existing suite, typecheck, lint (including the voice boundary) and production build stay green.
  Text-mode behavior is unchanged when `heard` is absent (existing runner tests cover it).
- Live, paid, with your go-ahead: Task 6's listening gate.

## 11. Acceptance (Phase B for this test)

1. One complete prof-001 interview by voice on localhost, opening to close, on Haiku 5.5.
2. Barge-in drill: interrupt (a) during the ack, (b) mid-`say`, (c) mid-data-line, (d) mid-question,
   (e) during a scripted line. Each outcome matches §5 in the DB: reveals, exhibit row, saved
   line, `lastQuestion`, pressure-test state.
3. FR-4 holds: the post-turn audit finds no unrevealed number in any saved interviewer line, and
   no caption showed a figure that wasn't booked.
4. Timing record for every turn, plus a session summary; the client cross-check is within ~200ms
   of the agent's first sound.
5. Typecheck, tests, lint, build green; no voice import in orchestrator, agent or scoring.

## 12. Risks / open

- The agents worker forking under `tsx` with `@/` aliases (Task 4 checks first; fallback in §3).
- Flux `StartOfTurn`/`Update` payload shape: parse from recorded messages; adjust the word count.
- Cartesia word timestamps on the installed SDK (`add_timestamps` exists in its types); without
  them the fallback sentence split applies.
- Echo without headphones triggers false barge-ins (AEC helps but isn't relied on).
- Waiting on playout before `persist` means a crash mid-playout loses that turn's write.
  Acceptable for a local test.
- PRD to update after review (not edited): §8.3 (worker + controller instead of an `llmNode`
  override), §8.5 (barge-in rules, carry), §12 step 7 status, §1 TTS row (funding), §3 repo map.
