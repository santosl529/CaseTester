# M0 Phase B — one interruptible voice interview on localhost

Status: **§5 revised 8 Oct 2026 after review** (estimated playback vs confirmed display, partial figures, delivery-dependent state, scripted speech under cancellation); Task 1 implements §5.3–5.6 on the orchestrator side.
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
| Transport | LiveKit Cloud project (yours: `wss://` URL + key/secret already in `.env.local`); the app and agent run on localhost. A local `livekit-server --dev` remains a fallback, not needed. |
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

## 5. Delivery semantics (revised 8 Oct after review — read before implementation)

Two kinds of delivery evidence, kept apart:

| Evidence | Source | Confirmed by the browser? | Decides |
|---|---|---|---|
| **Estimated audio playback** | the agent's playout clock (below) minus a heard margin | No: an estimate. The client cross-check (§7) measures how far off it is, and an `audio_blocked` report from the browser cuts it short (§5.1) | the saved interviewer line, captions, reveal bookkeeping, and every state change that depends on speech (§5.4) |
| **Confirmed exhibit display** | `exhibit_shown` from the browser after the exhibit has rendered | Yes | exhibit booking (the `exhibits_shown` row and the ledger items the exhibit displays) — nothing else |

**Terms**
- **Segment:** what `runTurn` hands to `onSegment` (`say` | `data` | `tail` | `scripted`).
- **Accepted:** the sink took the segment for playback. The sink resolves on acceptance, so the stream stays pipelined, and rejects once the turn is interrupted (the D3 path: not delivered, not booked). Scripted segments are the exception (§5.6).
- **Playout clock:** a 20ms frame handed to the LiveKit `AudioSource` at wall time `t`, with the queue ending at `cursor`, plays from `max(t, cursor)`. Every segment gets an estimated `startAt` and `endAt`.
- **Heard cursor:** audio counts as heard `HEARD_MARGIN_MS` (150ms, network + jitter buffer) after it plays on the agent clock. When the turn is cut at `T`, the heard cursor is `T − 150ms`.
- **`heardChars`:** how many characters of the segment's text had been heard, always at a word boundary. Cartesia word timestamps, aligned one-to-one with the text's whitespace tokens, give each word's position. If the counts don't match (normalization) or there are no timestamps, the cursor's share of the segment's audio is applied to the text and snapped back to the previous word boundary.
- **Heard text:** `text.slice(0, heardChars)`. **Playback:** `played` = all characters heard; `partial` = started but not all heard; `unplayed` = never started.

**5.1 Audio unlocked, audio blocked.** The agent says nothing — not even the opening — until the browser sends `ready` (after `room.startAudio()` succeeds and `room.canPlaybackAudio` is true). If playback becomes blocked mid-interview (livekit-client `AudioPlaybackStatusChanged` → false), the browser sends `audio_blocked`. The agent treats that as a cut at its arrival time: the current turn is classified as in §5.5, without a carry, and the agent says nothing more until `ready` comes again. A turn cancelled this way (nothing heard) is re-run with its candidate text once `ready` returns.

**5.2 The heard report.** `runTurn` gets `heard: () => Promise<HeardReport>`. The runner calls it after the last segment is handed over and before anything is committed — for scripted turns too (§5.6). It resolves when the turn's audio has finished playing, or at once on a cut, but not before any exhibit sent in the turn has been confirmed or has timed out (`EXHIBIT_CONFIRM_MS`, 1500ms). It lists every accepted segment with its `playback`, `heardChars` and `exhibitShown` (browser-confirmed), plus `interrupted`. Text mode passes no `heard`, so nothing changes there.

**5.3 Reveal bookkeeping — one invariant.** *Every case figure in the saved interviewer line — beyond what the provenance rules already allow (case prompt, the candidate's own numbers, derived values) — belongs to a booked ledger item, and captions show only saved-line words.* So the ledger, the transcript and the screen agree, and the FR-4 audit of saved lines stays at zero.
- Code renders the data line in parts (`renderDataLineParts`), one release per sentence, so each release's text has a known position in the segment that carries it.
- **A release is booked if any figure in its sentence (a digit token) was heard.** A sentence with no figure is booked if the whole sentence was heard. Once booked, the item is booked whole: the candidate heard part of it, so it is in the conversation, and anything unheard can be repeated on request. A release whose figures were all unheard is not booked; its request stays open (open requests come from the revealed set).
- Refusal, deferral and offer sentences count as given only if heard in full. Otherwise their `data_request` row is written with `response: 'none'` and the original in the payload (`unheardResponse`). Scoring code is unchanged.
- **Captions:** interviewer words are sent when the heard cursor passes them, the same cursor used for the saved line. No caption shows a word, or a figure, that the saved line doesn't hold.
- **Exhibits:** sent to the browser at the estimated start of their segment. They are booked only on `exhibit_shown`. With no confirmation within `EXHIBIT_CONFIRM_MS`, or a late one, the agent sends `exhibit_withdraw` and the browser removes the exhibit, so screen and ledger agree. An exhibit whose segment never started is never sent.

**5.4 Delivery-dependent state — what each change waits for.** Every write is in Settle's single persist or `commitScripted`, after `heard` resolves; Plan and Stream write nothing. With a report present:

| State change | Committed only if |
|---|---|
| ledger reveals, `data_revealed` analytics | §5.3: a figure of the release was heard |
| `exhibits_shown`, the exhibit's ledger items, `exhibit_shown` analytics | browser-confirmed (§5.3) |
| saved interviewer line, `TurnResult.interviewerText` | always: the heard text (ack + heard words); no row if nothing at all was heard (→ §5.5 cancelled) |
| `lastQuestion` | the question was heard in full |
| pressure test asked / re-ask / code-asked probe / structure ask | the question was heard in full; otherwise `unheardQuestionPressureTest` (keeps what the reply decided: `structureGiven`, `satisfied`, the gate counter) |
| stall rung delivered + its assist event | the rung's delivery span is in the heard text (else `revertUndeliveredRung`, `rung_not_delivered`) |
| explain probes recorded (`explainProbed`) | computed on the heard text, not the composed text |
| `moves[turn]`, the move's effect on the phase | the question was heard in full |
| phase advance | re-derived from the booked releases, the confirmed exhibit, and the move / rec-ask only if heard |
| `ended` / `status: completed` / `case_complete` (close turn) | the close line was heard in full; otherwise the session stays active and the next turn plans again |
| `timeWarningFired`, `graceAskFired`, rec-ask effects | that line was heard in full |
| refusal / deferral / offer responses | §5.3 |
| candidate-derived state (recompute attempts, verified figures, stall classification of the reply, pressure-test satisfaction, structure given, load-shed, request-signal and check events) | unconditional: it comes from the candidate's words, not delivery |
| session update at all | the session is still `active` on a re-read (End clicked meanwhile → skipped; §5.8) |

A new check `voice_heard` logs the playback per segment, dropped reveals, withdrawn exhibits, and each row above that was held back.

**5.5 Interrupted vs cancelled turns.**
- **Interrupted:** a cut (barge-in, End, disconnect, `audio_blocked`, time limit) after something of the turn was heard. Committed per §5.4.
- **Cancelled:** a cut before any of the turn's segments was heard (`heardChars` 0 everywhere; only the acknowledgment or silence was heard). The runner throws `TurnCancelled`, nothing is written, and deferred analytics are dropped. On a barge-in, the controller carries the candidate's text into the next final (the premature end-of-turn recovery). On `audio_blocked`, the turn re-runs after `ready` (§5.1). On End or disconnect, the turn is dropped.
- Voice-side state follows the same rule. A cancelled turn leaves no interviewer caption and no exhibit (nothing was heard), doesn't count as the last acknowledgment for the no-repeat rule, and the browser replaces the cancelled candidate caption with the merged one.
- The cancelled turn's model stream finishes in the background and is not aborted in v1 (Haiku: <2s, ~$0.001). `queueWaitMs` measures the wait.

**5.6 Scripted speech — uninterruptible by barge-in, but aware of cancellation.**
- Scripted lines (distress offer, risk-to-self offer, conduct warning, termination, distress close) ignore barge-in while they play. A final that arrives during one is queued as the next turn, not dropped as a backchannel.
- They can still be cut by End, disconnect, `audio_blocked`, the time limit, a TTS failure, or the TTS character cap. So scripted turns go through `heard` too, and `ScriptedPlan.delivery` decides what a cut does:
  - **`required`** (distress / risk-to-self offer, conduct warning): its state change (`distressOffered`, `warnings + 1`) is committed only if the line was heard in full. Partly heard → the candidate row and the heard words are saved, the state change is not, and the check `scripted_not_delivered` is logged. Not heard at all → cancelled (§5.5). The next turn plans afresh, so the regex/model checks fire again on the candidate's next message.
  - **`decided`** (conduct termination, distress close after an accepted pause): the session-ending update is committed whether or not the line was heard, because it rests on the candidate's words, not on delivery. The heard words are saved, and a `scripted_not_delivered` check is logged if the line was cut.
- A late model-layer distress offer, arriving after the same turn was interrupted, is still accepted and played. It is `required`, so it counts only if heard in full.
- Every scripted line is also put on screen in full when it starts. The voice layer can't tell a risk-to-self offer from the other scripted lines, and none of them carries case figures, so this stays within §5.3. The resources stay visible if the audio fails. (Task 3 ruling; this broadens the original risk-to-self-only rule.)

**5.7 Barge-in trigger.**
- While `thinking` (ack playing or waiting, nothing of the turn heard): any Flux `StartOfTurn`/`Update` with ≥ 1 word → cancel (§5.5).
- While `speaking` a non-scripted segment: ≥ `VOICE_BARGE_MIN_WORDS` words (default 2).
- A final that arrives while a non-scripted segment is playing, with no barge-in, is a backchannel: dropped and logged. Once the turn's audio is over, the controller is `listening` again, even if the runner is still saving the turn, so an answer given in that window is never dropped.
- On a barge-in, in order: record `cutAt`; clear the `AudioSource` queue; cancel Cartesia contexts and caption/exhibit timers; reject further non-scripted segments; resolve `heard` (after exhibit confirmations, §5.2); set state `listening`.
- The opening (already persisted by `startSession`) is replayed on join, interruptible and unbooked.

**5.8 Stale results and ordering.**
- Each controller turn has a sequence number. Every async callback (TTS audio, timers, Flux messages, runner results, browser confirmations) checks it, and anything for an older turn is dropped. Data-channel messages carry `turnSeq`; the browser ignores interviewer messages older than the newest it has seen.
- One `runTurn` at a time per session: a final that arrives while the previous turn is still settling waits for it.
- End: `POST /api/voice/[id]/end` marks the session `abandoned` (only if `active`); the browser then disconnects; the agent cuts any turn in flight (§5.5) and lets it settle. With a report present, persist re-reads the status and skips the session update unless it is still `active`. Turn rows of heard speech are still written; for `decided` scripted lines, see §5.6. Abandoned sessions are never scored; a naturally ended one offers optional scoring.

**5.9 Failures.** A TTS error on a segment marks its unheard part unplayed (§5.4 applies). The UI shows "audio failed" and the agent keeps listening. A Flux socket close: reopen once, else show an error state. There is no text fallback in this phase.

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

Browser → agent messages on the data channel (topic `case`, accepted only from the session
owner): `ready`, `audio_blocked` (§5.1); `exhibit_shown {turnSeq, exhibitId}`, sent from the effect
that runs after the exhibit has rendered (§5.3); `timing` (§7). Agent → browser additionally sends
`exhibit_withdraw {turnSeq, exhibitId}`, after which the exhibit is removed from the screen.

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
| `lib/orchestrator/turn-types.ts` | `HeardReport` (`playback`, `heardChars`, `exhibitShown`), `TurnCancelled`, `ScriptedPlan.delivery` |
| `lib/orchestrator/data-decisions.ts` | `renderDataLineParts` (each line with its kind and ledger ids); `renderDataLines` = its texts |
| `lib/orchestrator/session-runner.ts` | `heard` + `onTiming` options; `heard` on scripted paths too; cancel path drops deferred work |
| `lib/orchestrator/settle-turn.ts` | `persist(latency, heard?)` applies §5.3–5.4; status re-check; `commitScripted(plan, heard?)` applies §5.6 |
| `lib/orchestrator/plan-turn.ts` | `delivery: 'required' \| 'decided'` on each scripted plan |
| `lib/orchestrator/stream-turn.ts`, `settle-turn.ts` | `pt_judge` / `structure_judge` timer marks |
| `lib/voice/types.ts`, `cartesia.ts` | word timestamps (`add_timestamps`), `onWords` |
| `lib/voice/deepgram.ts` | Flux `StartOfTurn` / `Update` signals (word counts) |
| `lib/voice/playout.ts` (new) | playout clock, per-segment start/end, heard cursor, `heardChars` (timestamps aligned to text tokens, else proportional), interrupt |
| `lib/voice/turn-controller.ts` (new) | state machine, barge-in, carry, serialization, sink, `heard`, records |
| `lib/voice/protocol.ts` (new) | data-channel message types (shared with the browser; types only) |
| `lib/voice/fake-tts.ts` (new) | tone-per-character TTS for free development runs (`VOICE_TTS=fake`) |
| `lib/voice/records.ts`, `tts-budget.ts`, `pcm.ts` (new / extended) | timing records + summary, monthly TTS character ledger, VAD speech-end tracker |
| `lib/voice/livekit-agent.ts` (new), `scripts/voice-agent.ts` (new) | the job: room media ↔ controller, budgets; the worker launcher |
| `lib/orchestrator/heard.ts` (new) | pure application of a `HeardReport`: release, line and question heard; the §5.4 table |
| `app/api/voice/[sessionId]/token`, `/end` (new) | token + dispatch; end → abandoned |
| `app/case/[sessionId]/voice/page.tsx`, `components/voice-room.tsx`, `components/exhibit-table.tsx` | UI |
| `package.json` | `@livekit/rtc-node@^1.1.0` as a direct dependency (already installed as a peer of `@livekit/agents` — **needs your OK**); script `voice:agent` |
| `.env.example` | `LIVEKIT_*` (dev defaults), `VOICE_DEV`, `VOICE_TTS`, `VOICE_TTS_CHAR_CAP`, `VOICE_BARGE_MIN_WORDS`, `VOICE_MAX_SESSION_MIN` |

## 9. Cost and funding

**TTS — no purchase needed.** Cartesia is already upgraded on your account (8 Oct), so no subscription is part of this plan. Reference (cartesia.ai/pricing, 8 Oct): Pro is $5/month for 100K characters (~133 minutes of audio, ~750–800 characters per minute), commercial use, 3 concurrent. Overages ($65 per 1M on Pro) stay **off**. Set `VOICE_TTS_CHAR_CAP` to your tier's monthly allowance minus headroom; the default 90,000 assumes Pro.
Interviewer speech per full interview, from 43 saved runs (batches 11–17 + 8 Oct prefix runs): median 2.6K characters, mean 3.5K, max 11.9K, plus ~0.5–1K for the opening. Acknowledgments are synthesized once and cached on disk. Development uses the fake TTS ($0); Cartesia is used only in the listening runs (Task 6): 3 interviews + a barge-in drill ≈ 15–40K characters.
**The upgrade is not a test budget.** Every paid run is approved separately with its own caps (below).

**Per interview (estimates; verify against the meter):**
- Deepgram Flux: $0.0065/min promo, $0.0077 list. The mic streams all session, so ~20–25 min ≈
  $0.13–0.19. Phase A ran on the account's credit. One stream at a time is fine here.
- Anthropic: Haiku 5.5 interviewer + mixed checks. The 8 Oct Haiku 5.5 prefix runs (~30 turns)
  cost ≈ $0.11 each, mostly the coverage classifier on Haiku 4.5. The 8-turn voice demo cost
  $0.021. So ≈ $0.05–0.15 per interview.
- Scoring (optional): ≈ $0.45 per scored interview (Opus 5.5, batch 4).
- LiveKit Cloud, Build plan (checked 8 Oct, livekit.com/pricing): 5,000 WebRTC participant minutes/month free, then $0.0005/min; 1,000 agent-session minutes (for LiveKit-hosted agents; ours is self-hosted and joins as a participant — I haven't verified how Cloud meters it). One interview ≈ 2 participants × ~25 min ≈ 50 min, so the whole test is <10% of the free minutes.

**Test spend estimate (asked for before each paid step):**
- Development smoke on fake TTS (Tasks 4–5): ~10 short sessions × (Flux ~$0.015 + LLM ~$0.02)
  ≈ **$0.35**.
- Listening gate (Task 6): 3 full interviews + 1 barge-in drill ≈ LLM $0.45, Flux $0.80, Cartesia
  within Pro.
- **Total ≈ $1.60 usage + 15–40K Cartesia characters**, plus $0.45 per interview you choose to score. No subscription cost.

**Guards, set per approved paid step (none of them defaults to unlimited):**
- `LLM_BUDGET_USD` is required by the agent (existing `requireRunBudget`, one cap per voice session; the `voice:agent` script sets $1.00 unless overridden). `LLM_BUDGET_FILE` can share one cap across all sessions of a step.
- **`VOICE_TTS_RUN_CAP`** (characters, per agent process) is **required whenever `VOICE_TTS` is not `fake`**. Like `requireRunBudget`, the agent refuses to start Cartesia without it, and refuses synthesis past it.
- Flux minutes are bounded by `VOICE_MAX_SESSION_MIN` × the number of sessions you approve.

The monthly ledger is a second, cumulative guard: `VOICE_TTS_CHAR_CAP` is a **cumulative
monthly** character count kept in `.voice-cache/tts-chars-<yyyy-mm>.json` (default 90,000, under
Pro's 100K). Once fewer than 2,000 characters remain, the agent starts no new turn: it ends the
session with an on-screen notice rather than begin a turn it might not finish. `VOICE_MAX_SESSION_MIN` (default 25) ends the session and
stops streaming to Flux. One candidate per room: the agent subscribes only to the session
owner's first audio track and ignores any other participant (e.g. a second tab).

## 10. Testing

- Unit (free, vitest), test-first: Settle with a heard report — a release booked iff a figure of
  it was heard; unheard refusals/deferrals logged as `none`; exhibit booked only when confirmed;
  saved text = heard; every row of the §5.4 table (question, pressure test, rung, probes, move,
  phase, close, time warning / grace ask), status re-check; `TurnCancelled` drops writes and
  deferred work; scripted `required` vs `decided` under a cut; playout clock
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
3. FR-4 and §5.3 hold: the post-turn audit finds no unrevealed number in any saved interviewer
   line; no caption showed a figure that wasn't booked; no exhibit stayed on screen that wasn't
   booked (withdraw tested by blocking the confirmation once).
4. Timing record for every turn, plus a session summary; the client cross-check is within ~200ms
   of the agent's first sound.
5. Typecheck, tests, lint, build green; no voice import in orchestrator, agent or scoring.

## 12. Local environment (exact commands)

LiveKit Cloud is already set up in `.env.local` as `LIVEKIT_URL` (the project's `wss://…livekit.cloud` URL), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Both the browser and the agent use the `wss://` URL. The token route derives the `https://` API URL from it for agent dispatch. All three stay server-only: the browser gets only the URL and a short-lived token. No local LiveKit server is needed.

Run once, with your OK (Task 4):
```
npm install --save @livekit/rtc-node@^1.1.0   # already in node_modules at 1.1.0 as a peer of @livekit/agents 1.9.1; this only records it in package.json
```
Add to `.env.local` (you):
```
VOICE_DEV=1
```
Each test, two terminals:
```
VOICE_TTS=fake npm run voice:agent             # registers the worker with your Cloud project; paid runs set VOICE_TTS_RUN_CAP and LLM_BUDGET_USD instead of VOICE_TTS=fake
npm run dev
```
Latency note: media now goes browser → LiveKit Cloud edge → agent on your machine and back, which is the real network path, not a loopback. That's closer to production; the client cross-check (§7) shows the added lag.

## 13. Risks / open

- The agents worker forking under `tsx` with `@/` aliases (Task 4 checks first; fallback in §3).
- Flux `StartOfTurn`/`Update` payload shape: parse from recorded messages; adjust the word count.
- Cartesia word timestamps on the installed SDK (`add_timestamps` exists in its types). If Cartesia
  normalizes words ("22%" → "twenty-two percent"), token counts won't align and the proportional
  fallback applies (word boundary, less exact). The first paid run records both so this can be
  checked.
- Echo without headphones triggers false barge-ins (AEC helps but isn't relied on).
- Waiting on playout before `persist` means a crash mid-playout loses that turn's write.
  Acceptable for a local test.
- PRD to update after review (not edited): §8.3 (worker + controller instead of an `llmNode`
  override), §8.5 (barge-in rules, carry), §12 step 7 status, §1 TTS row (funding), §3 repo map.
