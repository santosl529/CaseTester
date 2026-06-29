# Technical PRD — Voice AI Mock Case Interview (Feature 1, Build Spec)

**Companion to:** `prd-voice-ai-mock-case.md` (product PRD — source of *what* and *why*)
**This document:** the engineering build spec for an AI coding agent (Claude Code). It pins down stack, data model, API surface, orchestration logic, repo structure, and build order.
**Status:** Draft v1 · **Target:** MVP validation build · **Scale:** tens of pilot users (consulting clubs), bursty seasonal concurrency.

> Read this alongside the product PRD. Where the product PRD states a requirement (FR-N), this doc says how to build it. The product PRD wins on intent; this doc wins on implementation detail. If they conflict, flag it — don't silently pick one.

---

## 0. The one decision that shapes the whole build

**Build the text case end-to-end before any voice infrastructure exists.** The entire case state machine, data-gating, interviewer agent, scoring engine, and feedback report MUST run and be testable over **typed input** with zero STT/TTS/WebRTC in the stack. Voice (M2) is a transport layer that wraps the proven text core — not a prerequisite.

Concretely: the orchestrator's interface to the candidate is an abstract `CandidateChannel` (sends interviewer text, receives candidate text + control signals). The text build implements it with an HTTP/WebSocket text channel. The voice build implements the *same interface* with the LiveKit voice pipeline. **Nothing in the orchestrator, agent, or scoring code may import a voice library.**

This is the single most important constraint in the document. It de-risks the expensive work (the feedback engine — "the rubric is the product") before the realism work (voice).

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router)** | Server actions for mutations; route handlers for streaming/voice endpoints. |
| Hosting | **Vercel** | Note: long-lived voice sessions don't belong on Vercel serverless — see §8.4. |
| DB + Auth | **Supabase** (Postgres + Supabase Auth) | Email + **club code** gating. RLS on all candidate-owned tables. |
| ORM / DB access | Supabase client; **`drizzle`** for typed schema + migrations (agent's choice if it prefers Supabase migrations directly — flag the decision). |
| Styling | Tailwind + a component lib of the agent's choice (shadcn/ui acceptable). Keep mid-case UI minimal (§10 product PRD). |
| Live interviewer LLM | **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) | Latency-critical; behavior constrained by orchestrator. Swappable behind `InterviewerModel` interface. |
| Scoring/judge LLM | **Claude Opus 4.8** (`claude-opus-4-8`) | Runs once at case end; latency-insensitive; this is the product. |
| STT | **Deepgram** (streaming) | Spike-pending (M0). Behind `STTProvider` interface. |
| TTS | **Cartesia** (Sonic, sentence-chunked) | Spike-pending (M0). Behind `TTSProvider` interface. |
| Voice transport / orchestration | **LiveKit Agents** | WebRTC, VAD/endpointing, barge-in. **Caveat:** data-gating lives in OUR orchestrator, not LiveKit's loop — see §8. Spike-pending. |

**Supabase keys (non-negotiable):**
- Client-side: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key).
- Server-only: `SUPABASE_SECRET_KEY` — never behind `NEXT_PUBLIC_` or any client-exposed var.
- Use the new publishable/secret keys, **not** legacy anon/service_role JWTs.

**All vendor choices marked spike-pending are swappable behind interfaces.** The M0 spike validates latency on the cascade before committing. If the spike fails the ≤1.5s gate, the interface boundary is where you swap providers — no orchestrator rewrite.

---

## 2. System architecture

```
┌─────────────┐     CandidateChannel (abstract)      ┌──────────────────┐
│  Candidate  │◄────────────────────────────────────►│   Orchestrator   │
│  (browser)  │   text channel  OR  voice pipeline    │  (session state, │
└─────────────┘                                        │  data ledger,    │
                                                       │  phase logic,    │
   TEXT BUILD (M1):  WebSocket text channel            │  action exec)    │
   VOICE BUILD (M2): LiveKit ⟷ Deepgram/Cartesia       └────────┬─────────┘
                                                                │
                                                    per-turn    │  structured
                                                    prompt      │  actions
                                                                ▼
                                                       ┌──────────────────┐
                                                       │ Interviewer LLM  │
                                                       │  (Haiku 4.5,     │
                                                       │   tool-calling)  │
                                                       └──────────────────┘

   case end ──► Scoring service (Opus 4.8 judge + deterministic checks) ──► Report
```

**Core principle:** the orchestrator is the source of truth and the only thing that touches the data ledger. The LLM never sees a number it isn't allowed to reveal yet (see §5). The candidate channel is swappable; the orchestrator is not.

---

## 3. Repository structure (proposed — agent may refine, flag changes)

```
/app                      Next.js App Router
  /(marketing)            landing, club-code entry
  /case/[sessionId]       live case UI (text channel for M1, voice for M2)
  /case/[sessionId]/report  feedback report
  /api
    /session              create/advance/end session (route handlers)
    /channel              text/voice channel endpoints
/lib
  /orchestrator           session state machine, phase logic, action executor
    state-machine.ts      INTRO→…→SCORING transitions
    data-ledger.ts        reveal gating; the ONLY module that discloses numbers
    actions.ts            speak/reveal_data/show_exhibit/advance_phase/end_case
    channel.ts            CandidateChannel abstract interface
  /agent
    interviewer.ts        per-turn prompt assembly + tool-call handling
    prompts/              system prompt, anti-hallucination, anti-jailbreak
    models/               InterviewerModel interface + Haiku impl
  /scoring
    judge.ts              Opus rubric evaluation over full transcript
    deterministic.ts      math-tolerance checks, data-leak audit (NOT the LLM)
    report.ts             assembles the 5-dimension report + model answer
  /voice                  (M2 only) STTProvider, TTSProvider, LiveKit glue
  /cases                  case JSON loader + schema validation (zod)
/cases                    human-authored case content (JSON, version-controlled)
/db                       drizzle schema + migrations
/tests                    QA harness (incl. 50-case hallucination run)
```

The `/voice` directory must not be imported by `/lib/orchestrator`, `/lib/agent`, or `/lib/scoring`. Enforce with a lint rule (e.g. `eslint-plugin-boundaries`) so M1 stays voice-free by construction.

---

## 4. Data model (Supabase / Postgres)

RLS on every candidate-owned row: a candidate reads/writes only their own sessions. Cases and exhibits are readable by authenticated users; never expose `data_ledger` answer values or `*_key` fields to the client (see §7 — these stay server-side).

```
users                  (Supabase Auth)
  id, email, club_code, created_at

cases                  -- human-authored, version-controlled in /cases, synced to DB
  id (text, e.g. "prof-001"), title, firm_style, difficulty,
  prompt, content_jsonb (full case schema), version, active

sessions
  id (uuid), user_id (fk), case_id (fk),
  phase (enum), elapsed_ms, phase_started_at,
  status (active|completed|abandoned), abandon_phase,
  started_at, completed_at,
  flags_jsonb            -- stalled, ran_long, asked_repeat, off_topic_count

session_turns
  id, session_id (fk), turn_index, role (interviewer|candidate),
  text, timestamp_ms, latency_ms (nullable, voice),
  transcript_confidence (nullable, STT)

revealed_data
  id, session_id (fk), ledger_item_id, revealed_at_ms
  -- the data-disclosure trail; supports scoring + prevents re-ask confusion

exhibits_shown
  id, session_id (fk), exhibit_id, shown_at_ms

scores
  id, session_id (fk),
  structure (enum: needs_work|meets_bar|strong), structure_evidence_jsonb,
  quantitative ..., judgment ..., communication ..., synthesis ...,
  overall_rating, top_fix (text),
  deterministic_jsonb    -- math pass/fail, data-leak audit result
  model_answer_jsonb     -- structure / key math / recommendation exemplars
  scoring_runtime_ms, judge_model, created_at

session_audio          -- OPTIONAL, consent-gated; off by default
  session_id (fk), storage_path, consent_at

analytics_events       -- append-only; feeds §13 metrics
  id, session_id (nullable), user_id (nullable),
  event_type, payload_jsonb, created_at
```

**Enums:** `phase` = `INTRO|CLARIFY|STRUCTURE|ANALYSIS|EXHIBIT|BRAINSTORM|RECOMMENDATION|WRAP|SCORING`. `rating` = `needs_work|meets_bar|strong`.

`content_jsonb` holds the full case schema (§11 of product PRD). It is **loaded server-side only**; the client receives the read-aloud prompt and exhibits-as-shown, never the ledger answers or keys.

---

## 5. The orchestrator — anti-hallucination is the core invariant

This is where FR-4 ("zero hallucinated figures") is won or lost. **The acceptance criterion is hard: 0 invented numbers across a 50-case QA run.** Build for that from line one, not as a later hardening pass.

### 5.1 Data-gating mechanism

1. The interviewer LLM **never receives un-revealed numeric values in its prompt.** The per-turn prompt includes: case prompt, current phase, conversation history, the *labels* of ledger items (so it knows what data exists and can decide whether the candidate's request warrants revealing it), and the values of items **already in `revealed_data`** — nothing more.
2. To disclose a number, the LLM must emit a `reveal_data(item_id)` tool call. The orchestrator validates the item exists and its `release_when` condition is satisfied, marks it revealed, and only *then* feeds the value back so the interviewer can speak it.
3. The system prompt forbids stating any number not provided in context. But the prompt is the soft layer — the hard layer is that **the model literally does not have the un-revealed values**, so it can't leak what it never saw.
4. **Post-turn audit (deterministic, not LLM):** after every interviewer turn, scan the spoken text for numeric tokens and verify each appears in `revealed_data` or is trivially derivable from already-revealed values (the candidate's own math read back is fine). Any unexplained number → flag, log, and in QA mode fail the run. This audit is also what proves the "zero hallucinated data" metric.

### 5.2 State machine

`INTRO → CLARIFY → STRUCTURE → ANALYSIS → EXHIBIT → BRAINSTORM → RECOMMENDATION → WRAP → SCORING`

- Transitions fire on **candidate completion signals** (LLM judges the candidate has finished a phase via an `advance_phase()` tool call) **or** soft time limits (FR-2/FR-3). Not a fixed timer alone.
- The orchestrator gates which actions are legal per phase (FR-1): e.g. `show_exhibit` is illegal before `ANALYSIS`/`EXHIBIT` unless flow warrants it. Illegal actions are rejected and the turn is re-prompted.
- Phase time soft-management: if `phase_time` exceeds the phase budget, inject a nudge instruction into the next prompt ("move the candidate toward a recommendation").

### 5.3 Interviewer actions (tool calls)

`speak(text)`, `reveal_data(item_id)`, `show_exhibit(exhibit_id)`, `advance_phase()`, `end_case()`.
Every turn returns one or more actions. The orchestrator executes them in order, enforcing legality and the data-gate.

### 5.4 Behavioral requirements (system prompt + orchestrator)

- Withhold data until asked; never volunteer the framework or solve the case (FR-5).
- Stay in character, professional-neutral, **push back at least once** per case (FR-6) — orchestrator tracks a `pushback_done` flag and injects the instruction if it hasn't happened by RECOMMENDATION.
- Handle "repeat that," "give me a moment," clarifiers gracefully (FR-7).
- Resist jailbreak / answer-key extraction (FR-8) — and note: even a successful jailbreak can't surface un-revealed numbers, because they aren't in context (§5.1). Defense in depth.

---

## 6. Scoring service (runs once at `end_case`)

Heavy work at the end protects live latency (FR-11). Pipeline:

1. **Deterministic checks first** (`/lib/scoring/deterministic.ts`, no LLM):
   - For each `math_step` with a ground-truth `answer`, check the candidate's stated result against `answer` within `tolerance` (FR-14). Pass/fail is computed, never judged by the LLM.
   - Run the data-leak audit over the full interviewer transcript (the §5.1 audit, aggregated) → contributes to the QA metric.
2. **LLM judge** (`judge.ts`, Opus 4.8): evaluates the full transcript against the **5-dimension rubric** + case **answer key** + **calibration few-shots**. Returns, per dimension: rating (`needs_work|meets_bar|strong`), 1–2 **evidence quotes pulled from the candidate's own transcript** (FR-12), and improvement guidance.
3. **Report assembly** (`report.ts`):
   - Per-dimension rating + evidence + guidance.
   - **Model answer** for structure, key math, recommendation (FR-13) — sourced from the case keys so it's verifiable, not invented.
   - Deterministic math results layered in (overrides any LLM claim where ground truth exists).
   - Overall rating + **single highest-leverage next fix** (FR-15).

Persist everything to `scores`. Log `scoring_runtime_ms`.

**Validation hook:** the report format and judge prompt must support offline benchmarking against ex-MBB coach scoring (product PRD §15 risk). Build a script that runs the judge over a labeled sample and reports correlation. If scores don't correlate with expert scoring, the feature's core value is unproven — surface this early.

---

## 7. API / server surface

All mutations via **server actions** or route handlers; case keys and ledger values **never** cross to the client.

| Endpoint / action | Purpose |
|---|---|
| `createSession(caseId)` | New session; returns session id + read-aloud prompt. Auth + club-code gated. |
| `channel` (WS/route) | Bidirectional candidate ↔ orchestrator. Text for M1; voice (LiveKit token + room) for M2. |
| `advanceSession` (internal) | Orchestrator-driven; not client-callable directly. |
| `endSession(sessionId)` | Triggers scoring; returns when report is ready (or polls). |
| `getReport(sessionId)` | Returns the assembled report (no raw keys). |
| `getTranscript(sessionId)` | Timestamped transcript + revealed-data trail + exhibits shown. |
| `logEvent(...)` | Append analytics events (§13). |

**Security non-negotiables:**
- `data_ledger` values, `*_key` fields, `math_steps.answer`, and `rubric_anchors` are **server-only**. The client never receives them, even gzipped in a bundle.
- RLS enforces per-user session access.
- Exhibits are sent to the client only when `show_exhibit` fires, and only the displayable chart data (not the `interpretation_key`).

---

## 8. Voice pipeline (M2 — builds on the proven text core)

### 8.1 Cascade
Audio capture (browser, VAD) → streaming STT (Deepgram) → orchestrator (unchanged from M1) → interviewer LLM → streaming TTS (Cartesia, sentence-chunked) → playback. LiveKit Agents provides WebRTC transport, endpointing, and barge-in.

### 8.2 Latency budget (≤1.5s perceived, end-of-speech → first AI audio)
Per product PRD §8.2. Techniques: stream STT, stream LLM tokens, **start TTS on the first complete sentence**, keep the per-turn prompt lean, pre-warm connections.

### 8.3 The LiveKit integration caveat (validate in M0)
LiveKit's default agent loop wants to own the LLM call. **It must not** — our orchestrator owns the turn, because data-gating and phase logic live there. Wire LiveKit so that on endpointed candidate speech, it hands the finalized transcript to *our* orchestrator, and our orchestrator's `speak()` output is what gets sent to TTS. The LLM tool-call layer is ours. Validate this wiring works within the latency budget in the M0 spike before committing to LiveKit.

### 8.4 Hosting note
Long-lived WebRTC voice sessions don't fit Vercel serverless functions. Run the voice agent/orchestrator process on a persistent host (LiveKit Cloud, or a small always-on service — Railway/Fly/Render). The Next.js app on Vercel stays the web frontend + non-voice APIs. **Flag this split clearly; don't try to force voice onto serverless.**

### 8.5 Turn-taking
Barge-in: candidate interrupting stops playback and starts listening (FR-17). Tunable silence threshold so thinking pauses don't cut the candidate off (FR-18).

---

## 9. Non-functional

- **Latency:** §8.2 hard gate. Instrument per-turn latency from day one of M2.
- **Cost:** instrument `$/completed case` (STT + LLM + TTS minutes + scoring) from the first session. Internal ceiling + per-user case cap during validation. Haiku for turns / Opus once at end is the cost-control lever.
- **Reliability:** graceful degradation — if voice fails mid-case, fall back to the M1 text channel so the session survives (this is nearly free because text is the base layer).
- **Privacy:** explicit consent for audio storage; don't store audio by default (`session_audio` empty unless consented).
- **Browser:** latest Chrome/Edge/Safari desktop; mic-permission flow.
- **Scalability:** designed for tens of pilot users but bursty (recruiting calendar) — connection pooling, pre-warmed voice workers during known spikes. Don't over-engineer beyond pilot scale.

---

## 10. Content & case authoring

Cases are **human-authored JSON** in `/cases`, version-controlled, validated against a **zod schema** on load (reject malformed cases at boot, not mid-session). Schema per product PRD §11. 8–12 cases across profitability, market entry, M&A, market sizing, ops/cost.

**FR-20:** no case ships without an answer key + rubric anchors; ex-MBB author + second reviewer. Enforce: the loader fails any case missing `structure_key`, `data_ledger`, `math_steps[].answer`, `recommendation_key`, or `rubric_anchors`.

---

## 11. Out of scope (do NOT build — explicit)

The coding agent must not pull these in. Scope creep is the default failure mode.

- Candidate-led (BCG/Bain) mode — fast-follow, not now.
- Panel / multi-interviewer simulation.
- Behavioral / PEI / fit questions.
- Mobile-native app (desktop web only).
- Monetization / paywall / billing logic (free during validation).
- On-the-fly AI-generated cases (all cases human-authored).
- Drills, peer matching, B2B2C dashboards (separate workstreams).
- Speech-to-speech black-box API (rejected — loses the data-gating control FR-4 requires).
- Per-turn scoring (scoring is end-of-case only, for latency).

---

## 12. Build order (each step shippable + testable before the next)

1. **Schema + auth foundation.** Supabase project (new keys), Auth + club-code gate, drizzle schema, RLS, case loader + zod validation. One seed case.
2. **Orchestrator + data ledger (text, no LLM yet).** State machine, phase gating, `reveal_data` mechanism, the deterministic post-turn data-leak audit. Drive it with scripted candidate input in tests.
3. **Interviewer agent (text, Haiku).** Tool-calling turn loop, system/anti-hallucination/anti-jailbreak prompts, pushback flag. **Gate: run the 50-case-style hallucination harness on the seed case → zero invented numbers.**
4. **Scoring engine (Opus + deterministic).** Judge, math checks, report assembly with model answer. **Gate: feedback beats ChatGPT in a blind test on the same answer (product PRD M1 gate).**
5. **Text case UI + report UI.** Full end-to-end text case in the browser. Transcript view. This is a *complete, usable product* minus voice.
6. **Content: author 8–12 cases.** Each with keys + reviewer sign-off. Re-run the hallucination harness across all cases → **0 incidents (DoD #2).**
7. **M0 voice spike (parallelizable from step 1).** Validate LiveKit + Deepgram + Cartesia latency ≤1.5s median AND the orchestrator-owns-the-LLM wiring (§8.3) on the seed case.
8. **Voice layer (M2).** Implement the voice `CandidateChannel` against the proven orchestrator. Barge-in, VAD threshold, text-fallback on failure. **Gate: realism ≥4.0, latency gate held.**
9. **Analytics + cost instrumentation** wired throughout (do this incrementally, not last — §13).
10. **Validation pilot** with 5–10 clubs.

Steps 1–6 contain zero voice code. That's the point.

---

## 13. Analytics (instrument as you build, not at the end)

Log: `case_start`, `mic_check_result`, per-turn latency, phase transitions, data items revealed, exhibit shown, `case_complete` vs `abandon` (+ abandon phase), `scoring_runtime_ms`, `$ cost per session`, post-case ratings (realism, usefulness), blind-comparison opt-ins. These feed the success metrics and go/no-go gates directly. Append to `analytics_events`.

---

## 14. Definition of done (acceptance)

1. End-to-end interviewer-led **voice** case, median turn latency ≤1.5s (p95 ≤2.5s).
2. **Zero** numbers stated outside the data ledger across a 50-case QA run (deterministic audit proves it).
3. Interviewer withholds data until asked, pushes back ≥once, holds character against jailbreak.
4. Report shows all 5 rubric dimensions (rating + transcript-sourced evidence + model answer); deterministic math checked programmatically.
5. ≥65% blind preference for our feedback vs ChatGPT on the same answer.
6. Text-fallback works on voice failure; state persists across a network drop.
7. All §13 events flowing to analytics.

And the structural one this whole doc is organized around:

8. **Steps 1–6 (the entire text product) ship and pass their gates with no voice library in the dependency graph of the orchestrator, agent, or scoring code.**

---

## 15. Open questions (deferred to build)

- Final STT/TTS/LLM vendor confirmation pending M0 spike results (defaults above are what to build against).
- Which 2–3 archetypes to author first?
- Audio storage / retention policy specifics (default: don't store).
- Exact per-user case cap during validation.
- drizzle vs. raw Supabase migrations (agent may choose; flag it).
