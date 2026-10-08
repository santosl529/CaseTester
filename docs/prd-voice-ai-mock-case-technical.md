# Technical PRD — Voice AI Mock Case Interview (Feature 1, Build Spec)

**Companion to:** `prd-voice-ai-mock-case.md` (product PRD — source of *what* and *why*)
**This document:** the engineering build spec for an AI coding agent (Claude Code). It pins down stack, data model, API surface, orchestration logic, repo structure, and build order.
**Status:** Draft v1, updated through interviewer-behavior v4.3 (2026-09-29) · **Target:** MVP validation build · **Scale:** tens of pilot users (consulting clubs), bursty seasonal concurrency.

> Read this alongside the product PRD. Where the product PRD states a requirement (FR-N), this doc says how to build it. The product PRD wins on intent; this doc wins on implementation detail. If they conflict, flag it — don't silently pick one.

> **Companion normative docs** (added as the build matured; this PRD points to them rather than duplicating):
> - `docs/interviewer-behavior.md` — the authored interviewer conduct spec (Rules 1–19, incl. the conduct/wellbeing track; currently v4.3, with an implementation-status register in Part V). Governs §5.4.
> - `docs/scoring-qa.md` — judge, report-verification pipeline, and scoring-attribution requirements (implemented/pending marked). Governs §6.
> - `docs/case-authoring.md` — case-content authoring + the ledger-consistency QA gate. Governs §10.

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
| Live interviewer LLM | **Claude Sonnet 5.5** (`claude-sonnet-5-5`), thinking off (`between_tools`), structured JSON turn, streamed | Alternatives evaluated 7 Oct and rejected (records in `Case Interview Runs/replays/2026-10-07/`): Cerebras gpt-oss-120b (`INTERVIEWER_PROVIDER=cerebras`, adapter kept) — first sentence 0.23s at low reasoning but ignored the candidate's message on ~half of hand-read turns; medium/high fixed surface issues, not the core ones, and lost the speed; GPT-6.1 Sol (researched) — reasoning-only, ~3.2s first token at its lowest setting. Screening 7 Oct (20 saved turns, today's prompt, schema and guards; first useful content, Sonnet 2.07s median): GPT-6 Luna at reasoning none 0.92s (faster on 20/20) with more rigor and request-judgment faults than Sonnet on hand review (~11/40 vs ~4/20) ; Luna at reasoning low 2.76s (slower than Sonnet) and did not fix the skipped units probe — not pursued; six-persona live evaluation of Luna-none (batch 17, 7 Oct): delivered faults 27/82 turns vs Sonnet 19/57 on the same personas (9/53 vs 15/46 excluding Nikhil), first useful content 1.11s vs 2.32s, but a 14-turn pressure-test loop with every request ignored on Nikhil — led to the pressure-test state and request guards (§5.4); a paired re-test with the guards is pending. **Claude Haiku 5.5** (screened 8 Oct, thinking disabled, effort medium, no fallbacks — it has none; `INTERVIEWER_PROVIDER=anthropic-haiku55-none-medium`): same 20 turns + 6 request-heavy, first useful content 1.25s vs Sonnet 2.09s (faster 26/26); outputs with a clear fault 25% after the pressure-test gate (31% raw) vs Sonnet 23% — more grading in `say` and unasked/premature releases, better on the known rigor probes than Luna; six prefix-seeded live checks: no gated release, no loop, first useful ~1.5s (records in `Case Interview Runs/replays/2026-10-08/model-screen-haiku55/`). Not adopted; no persona evaluation yet. Production stays on Sonnet; GPT-6 Sol at none 1.49s with similar faults; Gemini 3.8 Flash at low 2.23s, not faster — dropped. Adapters behind `InterviewerModel` for the screening only (`OpenAIInterviewerModel`, `GeminiInterviewerModel`). Oct 2026: switched from Opus 4.8 for speed and cost (M2 latency budget). Since 6 Oct the model returns one JSON turn — `{say, move, requests, exhibit, rescue_item, question}` — and makes no data, phase or ending decisions (§5.3). History: Haiku 4.5 → Opus 4.8 in July 2026 after Haiku missed live math errors; the deterministic math backstops (recompute, verified figures, unit check) now carry most of that load — watch batch results for regressions. Swappable behind `InterviewerModel` interface; ids in `lib/models.ts`. Server-side refusal fallback on (`fallbacks: "default"`). |
| Scoring/judge LLM | **Claude Opus 5.5** (`claude-opus-5-5`), adaptive thinking, effort `high` | Runs once at case end; latency-insensitive; this is the product. Three Opus passes: judge, claim verifier, dimension reconciliation (§6). Oct 2026: moved from Opus 4.8. Server-side refusal fallback on. |
| Background LLM passes | **Claude Haiku 4.5** (`claude-haiku-4-5`), per role in `lib/models.ts` (`BACKGROUND_MODEL_ID`) | **Migration to Claude Haiku 5.5 prepared, not switched (8 Oct; spec `docs/superpowers/specs/2026-10-08-haiku-5-5-background-migration.md`):** ~10× cheaper ($0.10 / $0.50 per MTok); thinking disabled explicitly, effort medium, `max_tokens` ×1.3; each role (pressure-test judges, distress, hint check, data-request classifier, coverage) switches on its own after a targeted regression check on fixed saved inputs. Live coverage agent and Rule 11 data-request classifier run after the response (`after()`). In parallel with every interviewer call: the C5 distress check (v4.6) — it adds latency only when it outlasts the model's first sentence (batch 11: verdict at 0.7–0.95s, never waited on). Same-turn data-request detection was removed from model turns on 6 Oct (the model declares the requests; it fed only a log-only audit). Synchronous: recommendation-ask turns classify the current message (~1s), and turns where a hint's delivery rests on a question run the hint check — count both against the M2 latency budget. |
| STT | **Deepgram Flux** (`flux-general-en`, streaming, model end-of-turn) | M0 Phase A (6–7 Oct): Flux over Nova-3 — Nova-3's default 300ms endpointing ended the turn mid-answer on 7/10 long answers, Flux on 3/41 (all at thinking pauses). Behind `STTProvider` (`lib/voice/deepgram.ts`, both adapters). STT mishears case names ("Brew & Bean" → "brewing bean") — keyterms per case are open. Settings: end-of-turn 0.7 / eager 0.5; a 7 Oct synthetic sweep found no setting both faster and safer — human recordings decide any change (§8.5). |
| TTS | **Cartesia** (Sonic 3.5, one WebSocket context per interviewer turn) | M0 Phase A: first audio ~125–155ms after a segment. Behind `TTSProvider` (`lib/voice/cartesia.ts`). Free tier exhausted during the spike; the pilot needs Pro (commercial use). Deepgram Aura used for the listening demo (`scripts/voice-demo.ts`) — per-segment REST calls reset the voice between sentences; Cartesia's per-turn context avoids that. |
| Voice transport / orchestration | **LiveKit Agents** | WebRTC, VAD/endpointing, barge-in. **Caveat:** data-gating lives in OUR orchestrator, not LiveKit's loop — see §8. Not yet tested: M0 Phase B (transport, mic, barge-in) not started. |

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
                                                    per-turn    │  declarations
                                                    prompt      │  + words
                                                                ▼
                                                       ┌──────────────────┐
                                                       │ Interviewer LLM  │
                                                       │  (Sonnet 5.5,    │
                                                       │   JSON turn)     │
                                                       └──────────────────┘

   case end ──► Scoring service (Opus 5.5 judge/verifier/reconciliation + deterministic checks) ──► Report
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
    channel.ts            CandidateChannel abstract interface
    session-runner.ts     one candidate turn end to end (runTurn): reads → plan → stream → settle → commit
    plan-turn.ts          Plan stage: every pre-model decision, the turn kind (§5.2), no writes
    stream-turn.ts        Stream stage: delivers say sentences + code's data line as the model writes (vetoReason)
    speculation.ts, speculative-turn.ts   speculative turn on Flux's eager signal — DraftGate, plan fingerprint, startDraft. IMPLEMENTED, DISABLED: no live caller (§8.2)
    prompt-context.ts     the interviewer's per-turn prompt context from a plan (shared by the runner and the speculation fingerprint)
    pressure-test.ts      Rule 7 pressure-test state (not_asked/awaiting/satisfied), probe detection, the Haiku answer judge, gate scope, bounded fallback questions (8 Oct)
    request-signal.ts     guard B's explicit-ask detector (phrasing; precision-tuned) and the sentences it keeps for request_signal events
    settle-turn.ts        Settle stage: composes the turn, books reveals, derives phase, one commit
    data-decisions.ts     Rule 11 decided in code from the model's declared requests; renders every data line
    turn-data.ts          one turn's data decisions (shared by Stream and Settle)
    progress.ts           phase and stage administration from declared moves (Rule 8, §5.2)
    data-requests.ts      Rule 11 data-request classifier (Haiku) + open-request / force-release helpers
    post-turn.ts          background passes after each turn (coverage agent, data-request audit)
    start-session.ts      session creation + deterministic opening turn
    numeric-provenance.ts provenance audit + enforcement (blocked sentences withheld, Rule 6)
    recompute.ts          live math check → probe/correct hint + Rule 14 attempt counter
    conduct.ts            C1–C5 conduct classifier (Rule 17) — regex floor
    distress.ts           C5 model layer (Haiku, parallel with the interviewer call)
    probe-guard.ts        withholds doubt/explain probes on verified figures (Rule 2 v4.5)
    assumption-guard.ts   withholds challenges to assumptions about requested data (Rule 11 v4.5)
    timeframe-check.ts    cross-period arithmetic check, log-only (Rule 6 v4.6)
    hint-check.ts         model check that a question-based rung was really a hint (Rule 13)
    check-log.ts          per-turn decision log for every check (Part V v4.6)
    silence.ts, spoken-close.ts, stall.ts, pacing.ts   silence/pause, one-goodbye close, stall ladder, time budgets + grace ask
  /agent
    interviewer.ts        per-turn prompt assembly, catalog id resolver, the streamed turn
    prompts/              system prompt, anti-hallucination, anti-jailbreak; system-compact.ts — compact-prompt A/B arm, not on the live path (7 Oct)
    models/               InterviewerModel interface + Anthropic impl (Sonnet 5.5; ids in lib/models.ts); turn-schema.ts, turn-stream.ts; factory.ts picks the provider (INTERVIEWER_PROVIDER), cerebras.ts kept behind it, unused (7 Oct)
    opener.ts             Haiku-written opener — experiment, replay arm only, not on the live path (7 Oct)
  /scoring
    judge.ts              Opus rubric evaluation over full transcript
    deterministic.ts      math-tolerance checks, data-leak audit (NOT the LLM)
    report.ts             assembles the 8-dimension report + model answer
    score-session.ts      the full scoring pipeline (§6), shared by the score route and scripts
    transcript-artifacts.ts, evidence-audit.ts, verifier.ts, reconcile.ts   report verification (§6)
    data-coverage.ts      requested-vs-never-requested data split for the judge (Rule 11)
    math-spans.ts         source spans for math checks, shared by live recompute and scoring (Rules 2/3)
    interviewer-errors.ts interviewer-error + wellbeing marks from the event log (Rule 3, 17-C5)
    caveat-floor.ts       caveated dimensions floored at meets_bar (Rule 9)
    answer-key-pass.ts    no missing-answer-key-idea weaknesses; stage faults under not-run caveats (Rule 3 v4.5)
    strong-gate.ts        "strong" only on an evidenced strong-anchor checklist; overall capped
  models.ts               every model id + the server-side fallback setting; background classifier ids by role + Haiku 5.5 request settings (backgroundRequest)
  llm-pricing.ts          one price table by exact model id (cache, Haiku 5.5 long-prompt tier); unknown ids throw — never $0 (8 Oct)
  anthropic-client.ts, llm-meter.ts, llm-budget.ts   the one Anthropic client; its fetch meter checks a run budget before each call and records usage from the response (JSON and SSE, aborted streams estimated); LLM_BUDGET_USD / LLM_BUDGET_FILE (8 Oct)
  number-words.ts         spoken numbers → digits for the stall signal and math spans
  /voice                  STTProvider/TTSProvider (types.ts), Deepgram Flux/Nova-3 (deepgram.ts), Cartesia (cartesia.ts), segment → speech (speak.ts), instant acknowledgment (acknowledge.ts; the thinking filler was removed 7 Oct), playback scheduler (playback.ts), end-of-turn clip variants + signal scoring (endpoint.ts), PCM helpers (pcm.ts) — M0 Phase A; LiveKit glue is Phase B
  /cases                  case JSON loader + schema validation (zod)
/cases                    human-authored case content (JSON, version-controlled)
/db                       drizzle schema + migrations
/tests                    QA harness (incl. 50-case hallucination run); tests/replay/ re-runs the deterministic checks over saved persona runs (free; skips without them)
/scripts                  live-run.ts — end-to-end run with a simulated candidate against real models + DB (dev only; --finish re-scores a saved session);
                          regrade.ts — dry-run re-grade of stored sessions; eval-distress.ts — C5 model-layer eval (all cost money);
                          voice and latency experiments: voice-latency.ts, voice-demo.ts, endpoint-sweep.ts, replay-output-format.ts (cost money);
                          useful-latency.ts, playback-sim.ts (free — read saved runs);
                          evaluation: live-run --script / --seed / --seed-through / --max-turns (scripted and saved-prefix replays, no Opus),
                          guard-check.ts, review-dump.ts, request-signal-check.ts, plan-inspect.ts (free — read saved runs);
                          eval-probe-judge.ts, eval-background.ts (per-role Haiku 5.5 regression checks on fixed saved inputs; --dry estimates cost free);
                          every paid script requires LLM_BUDGET_USD (lib/llm-budget.ts)
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
  status (active|completed|abandoned|terminated), abandon_phase,
  started_at, completed_at,
  coverage_jsonb         -- per-dimension live coverage (0-100 evidence, NOT
                         --   quality) from the background coverage agent;
                         --   steers the interviewer + gates an early close
  flags_jsonb            -- orchestrator run-state. Booleans: stalled, ran_long,
                         --   asked_repeat, off_topic_count, advanced_last_turn
                         --   (gates the no-back-to-back behavior shift),
                         --   time_warning_fired, load_shed_logged,
                         --   grace_ask_fired (Rule 12 time-up ask, v4.3).
                         -- Sub-objects: stall{} (stall-ladder state, Rule 13),
                         --   conduct{ warnings, distress_offered,
                         --   distress_offered_at_ms (C5 clock pause), category }
                         --   (Rule 17), silence{} (check-in / technical-pause
                         --   state, Rules 13/16/19), recompute_attempts{ step_id:
                         --   n } (Rule 14 attempt counter, v4.3).
                         -- (pushback_done is vestigial — the "push back once"
                         --   nag was removed; general rigor rules cover it.)

session_turns
  id, session_id (fk), turn_index, role (interviewer|candidate),
  text, timestamp_ms, latency_ms (nullable, voice),
  transcript_confidence (nullable, STT)

revealed_data
  id, session_id (fk), ledger_item_id, revealed_at_ms
  -- the data-disclosure trail; supports scoring + prevents re-ask confusion

exhibits_shown
  id, session_id (fk), exhibit_id, shown_at_ms

session_events         -- typed log; three categories share one table
  id, session_id (fk), category (intervention|conduct|data_request), subtype,
  turn_index, phase, payload_jsonb, created_at
  -- 'intervention': stall-ladder assists (restate_anchor|narrow_frame|
  --    directive_rescue), synthesis_unresolved, load_shed — SCORING inputs
  --    ("assisted ≠ covered" and time-pressure coverage caveats); also
  --    silence_check_in, technical_pause(_expired), session_resumed,
  --    recompute_flag (payload: step, candidate value, span, attempt — v4.3),
  --    grace_ask (v4.3). Only ladder rungs count as assists.
  -- 'conduct': C1–C5 conduct events (Rule 17), plus C2_excluded (quoted /
  --    reported / generic-you speech, logged not warned — v4.3). Internal
  --    only, NEVER surfaced to client/report (Rule 18, FERPA). Scoring reads
  --    'conduct' for ONE purpose (v4.3, interviewer-error marking): to EXCLUDE
  --    C2-warning and C5 exchanges from candidate evidence. It never feeds a
  --    penalty, and the judge is told not to mention either in the report.
  -- 'data_request': Rule 11 audit — one row per candidate data request
  --    (subtype release|refuse|defer|clarify|none; payload what, ledgerItemIds,
  --    revealedByNow) plus a 'classified' marker per checked exchange, so
  --    scoring can backfill exchanges the background pass missed.

scores
  id, session_id (fk),
  -- 8 rubric dimensions, each: <dim>_rating (enum; NULL when the dimension
  --   is "not assessed", Rule 9 v4.3) + <dim>_evidence_jsonb (legacy):
  --   structure, quantitative, data_exhibit, judgment, creativity,
  --   synthesis, communication, pushback
  overall_rating (enum), top_fix (text),
  rubric_jsonb           -- full structured judge output (per-dimension
                         --   wentWell/needsWork/missedOpportunities + coverageCaveat
                         --   + notAssessed);
                         --   the *_evidence columns are legacy (pre-8-dim rows)
  deterministic_jsonb    -- math step results (per-step errorClass + source span)
                         --   + data-leak audit
  model_answer_jsonb     -- structure / key math / recommendation exemplars
  scoring_runtime_ms, judge_model, created_at

session_audio          -- OPTIONAL, consent-gated; off by default
  session_id (fk), storage_path, consent_at

analytics_events       -- append-only; feeds §13 metrics
  id, session_id (nullable), user_id (nullable),
  event_type, payload_jsonb, created_at
```

**Enums:** `phase` = `INTRO|CLARIFY|STRUCTURE|ANALYSIS|EXHIBIT|BRAINSTORM|RECOMMENDATION|WRAP|SCORING`. `session_status` = `active|completed|abandoned|terminated`. `rating` = `needs_work|meets_bar|strong` (displayed as needs work / adequate / strong). "Not assessed" is not an enum value: it is a `notAssessed` flag in `rubric_jsonb` with a NULL rating column, shown via `ratingLabel`.

**Terminated / abandoned scoring (Rule 18/19):** a `terminated` session (conduct C2-repeat / C3) produces **no score, no report**; a C5-`abandoned` session is excluded from scoring. The score route only proceeds for `status = completed`, so both are safe by construction.

`content_jsonb` holds the full case schema (§11 of product PRD). It is **loaded server-side only**; the client receives the read-aloud prompt and exhibits-as-shown, never the ledger answers or keys.

---

## 5. The orchestrator — anti-hallucination is the core invariant

This is where FR-4 ("zero hallucinated figures") is won or lost. **The acceptance criterion is hard: 0 invented numbers across a 50-case QA run.** Build for that from line one, not as a later hardening pass.

### 5.1 Data-gating mechanism

1. The interviewer LLM **never receives un-revealed numeric values in its prompt.** The per-turn prompt includes: case prompt, current phase, conversation history, the *labels* of ledger items (so it knows what data exists and can decide whether the candidate's request warrants revealing it), and the values of items **already in `revealed_data`** — nothing more.
2. To disclose a number, the LLM **declares** the request in its turn (`requests`: what was asked, the catalog ids that cover it, explicit ask vs passing mention, release now or later — §5.3). **Code decides and speaks it** (`data-decisions.ts`): only items the case holds and hasn't released, only explicit asks (a passing mention is offered, never released), at most three a turn (the rest deferred out loud), the stall rung-3 rescue item only on a rung-3 turn. The value spoken is the ledger's approved wording, rendered by code between the model's `say` and its question; the model never writes a data line, a refusal or a deferral. An item counts as revealed when the segment carrying it is **delivered** (voice: played) — a reveal whose segment was not delivered is not booked. `release_when` stays an authoring/pacing hint: the model's now-or-later decides timing within those bounds (spec `docs/superpowers/specs/2026-10-06-plan-owns-decisions-design.md` D2).
3. The system prompt forbids stating any number not provided in context. But the prompt is the soft layer — the hard layer is that **the model literally does not have the un-revealed values**, so it can't leak what it never saw.
4. **Post-turn audit (deterministic, not LLM):** after every interviewer turn, scan the spoken text for numeric tokens and verify each appears in `revealed_data` or is derivable from already-revealed / candidate / orchestrator-derived values. Any unexplained number → flag, log, and in QA mode fail the run. This audit proves the "zero hallucinated data" metric. It is the base of a wider post-turn suite (see §5.4): the tiered numeric-provenance audit (word-number aware), the style/length audit, and the meta-leak strip all run here too.
5. **Orchestrator-initiated disclosure** — all through the same ledger, revealed-only and audited: (a) an exhibit with `coversLedgerItems` marks those items revealed when shown (it displayed them); (b) before any recommendation ask (code-written time warning / grace ask, or the coverage-complete ask) up to two open requests are released first (Rule 11); (c) a code-written close answers the final message's explicit asks before the goodbye.

### 5.2 State machine

`INTRO → CLARIFY → STRUCTURE → ANALYSIS → EXHIBIT → BRAINSTORM → RECOMMENDATION → WRAP → SCORING`

- **Phase is derived in code** (Rule 8, `progress.ts`): the model declares what its question does (`move`: clarify, structure, pressure_test, analysis, exhibit, brainstorm, risk, recommendation, other) and the phase rises to the highest stage the turn's move and code's own actions imply — releases → their `release_when`, an exhibit → EXHIBIT, a recommendation ask → RECOMMENDATION, a close → SCORING; forward only, never past RECOMMENDATION except by close. INTRO leaves after the first exchange. Stage administration (brainstorm, risk probe, recommendation asks) is read from the recorded moves (`flags.moves`), with the wording regexes only for turns recorded before moves existed. A separate `advancedLastTurn` flag gates the interviewer's *visible* behavior shift. There is no `advance_phase` and no per-phase action legality any more.
- **Turn kinds (Plan decides, spec 2026-10-06 §6):** each candidate message is answered by one of — `model` (the interviewer model); `rec_ask` (coverage complete, recommendation never asked: the model writes its lead-in, code supplies the ask); and four code-written kinds with no model call: `close`, `grace_ask`, `time_warning`, `rung1` (stall rung 1 restates the stored last question). Code-written kinds answer the message's data requests first (synchronous Haiku classification) and still pass the distress gate.
- **Single wall clock, per-phase budgets.** There is one total case budget (20 min — raised from 5 on 2026-09-15, when a human-paced run showed 5 minutes allows only ~3 typed replies); phases carry per-phase budgets from case config (`pacing.phaseBudgetsMs`, uniform fallback). A pacing nudge injects "advance now if the exit criterion is met" when a phase exceeds its budget or the session falls ≥2 phases behind.
- **Load-shedding (Rule 15):** in the final stretch (keyed to *total* remaining time — robust to the phase machine under-advancing), the prompt carries a directive to stop optional probing and protect the recommendation; entry is logged (`load_shed`) so the judge attributes thin late coverage to time, not the candidate.
- **Ending, time warning, grace ask (Rule 12) — code's, not the model's:** the time-warning turn fires on the first candidate turn inside the warning window (90s in text mode, v4.3; 30s intended for voice) unless the recommendation is already in. If time runs out and no recommendation ask was ever delivered, the time-up turn is a grace ask and the next message ends the case. The case closes when time is up (grace ask done or not due), or when the end is allowed and either the recommendation is in and the risk probe was asked, or the recommendation was refused twice. Every close is one scripted line. Open data requests are released before any recommendation ask (§5.1).
- **Coverage-gated ending:** a background coverage agent (Haiku, run via `after()`) scores each dimension 0–100 on *evidence sufficiency* every turn; the case can't close on coverage until every dimension is sufficiently tested and the recommendation was asked (or time is up), and the interviewer is steered toward the undertested ones. Keeps the interviewer from wrapping early and leaving weak areas unprobed. Normative detail in `docs/scoring-qa.md`.

### 5.3 The interviewer's turn (declarations + words)

One JSON object per turn, constrained by `output_config.format` and streamed (`lib/agent/models/turn-schema.ts`):
`{ say, move, requests: [{what, item_ids, explicit, respond: release|defer}], exhibit, rescue_item, question }`.
The model writes `say` first (one neutral acknowledgment, streamed while the rest is written), then declares what the candidate asked for and what its question does, then writes `question` (exactly one). Code decides releases, refusals, deferrals, offers, exhibits, phase and ending, and writes those lines (§5.1, §5.2); the data line goes out once `say` and the declarations have closed. Releases are decided before deferrals and offers, so a request partly answered this turn is not also deferred out loud. An id the case doesn't have triggers one regeneration while nothing has been delivered; once `say` is spoken, a request whose ids all fail to resolve is dropped (never turned into a refusal of held data). Field order changed 6 Oct 2026 (batch 10: declarations first put Nikhil's first speech at ~3.3s; batch 11 with `say` first: 1.65s median). Replaced 6 Oct 2026: the `speak` / `reveal_data` / `show_exhibit` / `advance_phase` / `end_case` action list — two authors for every decision produced the batch-9 collisions (spec 2026-10-06 §1).

### 5.4 Behavioral requirements (system prompt + orchestrator)

**Normative source: `docs/interviewer-behavior.md`** (the authored conduct spec, Rules 1–19 across core conduct, data delivery, struggling-candidate handling, and a conduct/wellbeing track). The prompt encodes the rules; **deterministic backstops** in the orchestrator enforce what a prompt can't reliably guarantee. This section summarizes; the doc governs.

Core prompt constraints: neutral affect / never grade mid-case (1); force structure + live math (2); no fabricated candidate claims (3); one candidate task per turn, Socratic not coaching (4); 1–3 sentence spoken turns, no markdown (5); never adopt candidate-derived figures as fact (6) — the model never issues a math correction or states a replacement figure on its own; corrections come only from a valid recompute flag (Rules 2/14, v4.3), and a suspected misquote gets "check that against the figures"; pressure-test the opening structure (7) — a request made before the probe is answered is deferred; reveal data the candidate has earned and asked for; every data request is released, refused, or audibly deferred — never ignored, never substituted (10/11). Withhold-until-asked and jailbreak-resistance (FR-5/FR-8) still hold — and a jailbreak still can't surface un-revealed numbers (§5.1). The prompt states each rule once and carries a PRIORITY block (turn note > time pressure > coverage/pacing/open requests > defaults; numbers and attribution never overridden except by a recompute figure) — behavior doc, Precedence hierarchy, v4.8.

Deterministic backstops (all in `/lib/orchestrator`, logged; QA-gated in the harness):
- **Numeric provenance audit** — every quantity in an interviewer turn must trace to revealed ledger values, a candidate-attributed figure, or an orchestrator-derived value; word-numbers and ranges normalized; unit-bearing unmatched quantities block, bare counts log. **Block withholds** (v4.3): sentences carrying a blocked figure are stripped before the turn is spoken (`enforceNumericProvenance`) — the audit previously only logged, and a persona run delivered unrevealed revenue.
- **Recompute + unit-check** — per-turn, deterministically recompute figures the candidate states against the case `math_steps` (respecting `alt_answers`) and detect nested-percentage conversions, injecting a hint so the interviewer probes/corrects. **Source spans** (v4.3, `lib/scoring/math-spans.ts`): a number counts toward a step only near one of the step's `cues`, in the same clause, stating the step's `unit`; a step is checked only once its ledger `inputs` are revealed; prompt-fact steps are `live: false`. The hint never carries the step description (it can hold unrevealed values). A per-step attempt counter drives Rule 14: probe, then supply the figure; case-breaking errors corrected at once under time pressure. Before spans, the check produced all three false corrections in the 27–28 Sep persona runs.
- **Style + meta-leak** — 1–3 sentence / no-markdown length audit (data read-outs exempt), and a strip of internal planning that leaks into spoken text ("the candidate has…", "let me pressure…").
- **Stall ladder (Rule 13)** — graduated restate → narrow → directive-rescue for struggling candidates; logged as `intervention` events ("assisted ≠ covered").
- **Vetoes on the model's words** (`vetoReason`, shared by Stream and Settle) — a sentence of `say` or `question` is withheld, never rewritten, for: a fabricated candidate turn, narration, system vocabulary, a copied check-in, an unsourced figure, a doubt probe on a verified figure, a challenge to an assumption about requested data, a goodbye (ending is code's), the model's own data talk in `say` ("I don't have…", "…is available, so I'll give you that"; dropped without stopping the stream), a supplied recommendation from BRAINSTORM on, a question inside `say`; and in the question, a handover statement ("Here's the cost structure over time.") when another sentence is left — code already announced it ("Here's an exhibit: …"). A withheld question becomes "Go on."
- **Rule 11 data-request tracking** — the turn's data decisions are logged as its `data_request` rows (subtype = the decision) with a `classified` marker, so the background re-classification is skipped; still-unreleased requests are injected into the next prompt as OPEN DATA REQUESTS. Ledger membership and revealed state are deterministic.
- **Verified figures + probe withholding (Rule 2 v4.5/v4.6)** — the live check also reports figures the candidate stated *correctly* (`recompute_ok`, with whether the work was shown); a pre-send pass withholds any doubt probe on a verified figure and any explain probe where the work was shown or already asked. prof-001 has verify-only bean steps (confirm, never flag). The unit-check hint is suppressed when the conversion was verified. Batch 2 had five doubt probes on correct math; batch 4 had none.
- **One goodbye (Rule 12)** — every close is code-written (one scripted line, after answering the final message's asks); a goodbye in the model's words is vetoed.
- **History shaping** — scripted silence check-ins and pause lines are kept out of the model's history (it copied them); the check-in restates the stored last question.
- **Pressure-test state and request guards (Rule 7, 7–8 Oct; spec `docs/superpowers/specs/2026-10-07-pressure-test-and-request-guards.md`)** — code owns the pressure test: `not_asked → awaiting → satisfied` in `flags.pressureTest`; asked = a delivered question containing a Rule 7 probe (text, early stages; the `move` label is neither needed nor enough); satisfied = a Haiku judge (`probe_judge`, beside the distress check, fails closed) says a reply since the question answers it. Until satisfied, releases of data meant after CLARIFY (and exhibits showing it) become deferrals; scoping facts, the rung-3 rescue item and forced releases on rec-ask/grace/time-warning turns are unchanged. After it, pending requests are fulfilled up to the release cap. Bounded fallbacks: a duplicate probe gets one code re-ask, then rotating plain questions; a test the model never asks is asked by code once. **Guard B:** on an explicit data ask (phrasing detector, before the brainstorm) `say` is held and a turn whose requests close empty is written once more. **Defects fixed (8 Oct):** the judge counts only statements about the structure (data-request lists never count); a structure check (`structure_judge`) gates the code-asked probe — with no structure on the table code asks for one (once), a thin structure offered as the approach counts, and a check timeout asks nothing that turn. Judge results (labelled dev + frozen held-out sets): Haiku 4.5 2 false unlocks, Haiku 5.5 0 (one pass each). **Open:** live, the 4.5 judge still unlocked on a data list in 1 of 3 prefix runs.
- **Decision log** — every check records pass/act/skip per turn as a `check` event.
- **Fabricated-turn guard** — any sentence in which a line opens as another speaker ("\nuser …") is vetoed; the stream parser keeps a newline-led continuation inside its sentence so the check sees it (live run 58cb8061 had the interviewer write the candidate's brainstorm, which was then scored).

**Conduct & wellbeing track (Rule 17–19, Part IV of the behavior doc).** A separate track evaluated *before* case rules: C1 self-directed frustration (ignore), C2 directed hostility (warn then terminate), C3 harassment/slurs/threats (terminate immediately), C4 prompt injection (redirect + log, never terminate), C5 distress (break persona, offer pause/stop, never terminate). **Preemption is scoped (v4.3):** C2, C3, and C5 replace the case turn; C4 adds a one-clause redirect to the normal case turn, which still answers every legitimate request in the message. Quoted, reported, and generic-"you" speech never triggers C2 (logged as `C2_excluded`). The C5 offer states the stop option first, ends on the candidate's choice, adds the 988 line for risk-to-self signals, and stops the case clock until the candidate replies. Two detection layers (v4.6): the regex floor, and a Haiku classifier in parallel with the interviewer call whose distress verdict discards the draft turn before anything is delivered or persisted (eval: 16/16 distress, 0/10 controls; the regex alone 0/16). Posture: overreacting beats underreacting (Lorenzo, 2 Oct) — case-scoped "bomb every interview" still fires. Termination/abandonment → no score (see §4). The lexicons were adversarially hardened (July 2026) against a probe corpus now locked into `tests/orchestrator/conduct.test.ts`: the pre-hardening lexicon scored 14/23 false positives (including a C3 *terminate* on "I'll find you the exact number" and C2 warns on client-directed case speech like "your margins are terrible") and 13/30 misses (including "Ignore all previous instructions"); the rebuilt patterns require both a meddling/probing shape AND a model-operation object, and score 0/0 on the corpus. **Still pending:** human review of the lexicons against real pilot-population data — the probe corpus is authored, not observed, so it cannot stand in for what actual candidates say.

---

## 6. Scoring service (runs once at case end)

Heavy work at the end protects live latency (FR-11). Implemented in `lib/scoring/score-session.ts` (shared by the score route and `scripts/live-run.ts`). Pipeline — order is load-bearing:

0. **Pre-scoring:**
   - **Transcript-artifact repair** (`transcript-artifacts.ts`): empty and duplicate turns removed; fabricated-speaker continuations cut from interviewer turns. Runs before everything else so no later pass sees a contaminated transcript.
   - **Data-request backfill + split** (`data-coverage.ts`): classify any candidate→interviewer exchange that has no `data_request` rows, then split ledger data the candidate asked for and never got (a coverage gap) from never-requested and not-in-case requests (Rule 11).
1. **Deterministic checks** (`/lib/scoring/deterministic.ts`, no LLM):
   - For each `math_step`, check the candidate's stated result against `answer` (or any `alt_answers`) within `tolerance` (FR-14), classifying each as `non_issue|minor|case_breaking|unmentioned`. Only numbers with a source span count (same cues/unit rules as the live check), each result carries its span, and a step whose inputs were never revealed is not scored (v4.3 — the closest-number rule reported a false per-store error in most persona reports). `alt_answers` credits genuinely ambiguous quantities (e.g. margin-impact vs actual-spend COGS increase) so a defensible-but-different computation isn't mislabeled an arithmetic error.
   - Run the data-leak audit over the full transcript (§5.1) → QA metric.
2. **LLM judge** (`judge.ts`, Opus 5.5): evaluates the full transcript against the **8-dimension consolidated rubric** (`docs/Case Interview Feedback Rubric.pdf`, encoded in `lib/scoring/rubric.ts`) + case **answer key**. Returns, per dimension: rating (`needs_work|meets_bar|strong`, displayed as needs work/adequate/strong), **what went well** and **what needs work** (each point with verbatim candidate quotes, FR-12), **missed opportunities**, and a **coverage caveat**. The judge prompt is fed deterministic context so it doesn't re-derive or misjudge: the **math-check results** (trust these over re-derivation; wrong math can't appear in "went well"), the **data actually revealed, with requested-but-never-provided ledger data in its own coverage-gap section** (never charged to the candidate, including in the top fix — Rule 11), and the **intervention log** ("assisted ≠ covered" for stall rescues; time-pressure coverage for load-shed). It is also told to distinguish an arithmetic error from a wrong-*quantity* conceptual error. **Calibration (v4.3):** "strong" requires every element of the dimension's strong anchor, evidenced — the persona runs rated 73 of 88 dimensions strong. Normative scoring spec: `docs/scoring-qa.md`.
3. **Report verification** — a report that misstates the transcript is the worst feedback failure:
   - **Interviewer-error marking** (`interviewer-errors.ts`, v4.3, before the judge): deterministic marks from the event log — unbacked corrections, empty releases, unanswered requests, C2 warnings, concessions, and C5 exchanges. The judge receives them; after the evidence audit, a needs-work item whose only evidence is a marked candidate turn is dropped.
   - Deterministic evidence audit (`evidence-audit.ts`): every judge quote must appear in candidate turns (normalized, ellipsis-fragment-aware); fabricated quotes are stripped, and points left without evidence are dropped (a strength needs ≥1 real candidate quote; a weakness is dropped only if every quote it cited was fabricated — omission claims carry none).
   - Claim-verifier pass (`verifier.ts`, Opus 5.5): re-checks every `needsWork`/`missedOpportunities`/`topFix` claim against the transcript and drops what it contradicts (catches false omission claims, which contain no quote to check). Also checks **error claims** against span-checked correct figures and the interviewer-error marks (v4.3). Fails open — a broken verifier response ships the unverified report rather than blocking scoring.
   - **Answer-key and caveat-text pass** (`answer-key-pass.ts`, v4.5, before reconciliation): removes needs-work items naming an answer-key idea the candidate never raised (case `answerKeyIdeas`) and stage faults under a not-run caveat; a dimension it empties is re-rated one level up.
   - Dimension reconciliation (`reconcile.ts`, Opus 5.5, last): merges a concept stated as both strength and weakness within one dimension, drops faults that rest on requested-but-never-provided data, logs concepts faulted in 3+ dimensions. Skipped when nothing can collide; fails open.
   - **Strong gate** (`strong-gate.ts`, round 3, after reconciliation): the judge fills a per-dimension checklist of the strong anchor's elements with quotes; "strong" survives only if every element is met or had no occasion, half are met, and the quotes are real; overall "strong" needs no needs-work and at least half strong. Batch 4 (with the checklist in the judge prompt): strong skill ratings 62 → 32 of 80.
   - **Caveat floor** (`caveat-floor.ts`, v4.3, after reconciliation): a dimension with a coverage caveat is never rated below meets_bar; the judge may mark a thinly-evidenced caveated dimension `notAssessed` (shown as "not assessed", stored as a NULL rating). (Its first two live runs silently failed to parse — the model reasons in prose before the JSON — fixed 2026-09-14.)
4. **Report assembly** (`report.ts`):
   - Per-dimension rating + structured feedback sections.
   - **Model answer** for structure, key math, recommendation (FR-13) — sourced from the case keys so it's verifiable, not invented.
   - Deterministic math results layered in (overrides any LLM claim where ground truth exists).
   - Overall rating + **single highest-leverage next fix** (FR-15).

Persist everything to `scores`. Log `scoring_runtime_ms`. The three Opus 5.5 calls **stream** (a non-streaming 32k-token request trips the SDK's 10-minute guard — every batch-4 scoring run failed before this) and use server-side refusal fallbacks.

**Validation hook:** the report format and judge prompt must support offline benchmarking against ex-MBB coach scoring (product PRD §15 risk). Build a script that runs the judge over a labeled sample and reports correlation. If scores don't correlate with expert scoring, the feature's core value is unproven — surface this early.

---

## 7. API / server surface

All mutations via **server actions** or route handlers; case keys and ledger values **never** cross to the client.

| Endpoint / action | Purpose |
|---|---|
| `POST /api/session` | New session; opening message is the **verbatim case prompt** (deterministic — the candidate must see the exact scenario/numbers; not a model turn) + a rotating invitation. Auth + club-code gated. |
| `POST /api/channel/[id]/turn` | One candidate turn → orchestrator → interviewer turn. Returns immediately on the final turn (scoring is separate) with `scoring_suppressed` on conduct-terminated/abandoned sessions. |
| `POST /api/channel/[id]/silence` | Text-mode silence tick (`{ silentMs }` since the interviewer's last turn) → scripted check-in at 60s, technical pause at 180s (clock stops from that point; ≤5 min per pause and per session, warned in the pause line), session abandoned if the pause runs out, or nothing (Rules 13/16/19; `lib/orchestrator/silence.ts`). Idempotent per silence; `silentMs` bounded server-side. No client idle timer calls it yet — `scripts/live-run.ts` does. |
| `POST /api/channel/[id]/score` | Runs scoring for a completed session (idempotent; guarded to `status = completed`). Split out so the client can show an "evaluating" state and so a failed pass is retryable. `maxDuration = 300`: three thinking passes take minutes, not the old ~30s. |
| `GET /api/report/[id]/pdf` | Streams the report as a PDF (server-rendered; ownership-checked). |
| `scripts/live-run.ts` (dev only) | End-to-end run with a simulated candidate against real models and the real DB (fast by default; `--pace=human` adds think + typing time; `--persona=N` plays a pressure-test persona from `scripts/personas.ts`, whose `[pause Ns]` silences drive the silence endpoint's logic); writes transcript, report, and QA metrics to `Case Interview Runs/`. Route handlers are thin wrappers over `lib` (`start-session`, `post-turn`, `score-session`, PDF `render`), so the script exercises the same code paths. |
| `case/[id]/report` (page) | Renders the assembled report (no raw keys); persistent case-prompt banner on the live page. |
| `logEvent(...)` | Append analytics events (§13). |

**Security non-negotiables:**
- `data_ledger` values, `*_key` fields, and `math_steps.answer` are **server-only**. The client never receives them, even gzipped in a bundle. (Legacy per-case `rubric_anchors`, where still present, are likewise server-only; the live rubric is the generic 8-dimension one in `lib/scoring/rubric.ts`.)
- RLS enforces per-user session access.
- Exhibits are sent to the client only when the orchestrator shows one (a requested or handed-over exhibit, §5.1), and only the displayable chart data (not the `interpretation_key`).

---

## 8. Voice pipeline (M2 — builds on the proven text core)

### 8.1 Cascade
Audio capture (browser, VAD) → streaming STT (Deepgram) → orchestrator → interviewer LLM (streamed JSON turn) → streaming TTS (Cartesia, sentence-chunked) → playback. The orchestrator's turn is streaming-ready since Oct 2026 (Plan → Stream → Settle, specs `2026-10-05-streaming-turn` and `2026-10-06-plan-owns-decisions`): `runTurn(…, { onSegment })` delivers each segment as it passes — `say` sentences, then code's data line, then the question — and books a reveal only when its segment is delivered. LiveKit Agents provides WebRTC transport, endpointing, and barge-in.

### 8.2 Latency budget (≤1.5s perceived, end-of-speech → first AI audio)
Per product PRD §8.2. Techniques: stream STT, stream LLM tokens, **start TTS on the first complete sentence**, keep the per-turn prompt lean, pre-warm connections. `turn_latency` logs `firstSegmentMs` (turn start → first delivered segment), `streamed`, the turn `kind`, the model call, `distressWaitMs` (how long the C5 verdict outlasted the model — nothing is delivered before it), and `steps`: every step of the turn as ms since the turn started (reads, plan, model request / first token / first sentence / each field closing / done, first delivery, data line, distress verdict, hint check, settle, persist; `lib/orchestrator/turn-timer.ts`), also printed as a `[timing]` log line. Segments carry a `kind` (`say` | `data` | `tail` | `scripted`); `first_useful_delivered` marks the first segment past `say`. **The latency target is useful content — the data line or the question — not first sound;** an acknowledgment or `say` doesn't count (`scripts/useful-latency.ts` reports it per batch, split by declared request count).
- **Replay, 5 Oct (50 batch 7–8 turns, streamed):** Sonnet 5.5 first token 1.35s median, first complete sentence 1.64s, whole turn 2.18s; Haiku 4.5 first sentence 1.05s but failed data-gating and demeanor on hand-read turns; Gemini Flash returned the JSON in one chunk; effort `low` no gain.
- **Batch 9 (5 Oct, streaming runner, old action list):** streamed turns' first segment 1.66s median / 2.14s p90 vs 2.35s / 3.42s whole turn; 72% of turns streamed. The distress check outlasted the model by up to 9.0s (smoke run) — a timeout on it is an open decision.
- **Batch 10 (6 Oct, one persona, Plan-owns-decisions):** first segment ~3.3s — the declarations preceded `say`, and the data-hoover persona's 8–11 requests a turn cost 350–580 output tokens before any speech.
- **`say` first (6 Oct, built):** batch 11 (Nikhil) first segment 3.27s → 1.65s; batch 12 (10 runs) 1.45s median / 1.87s p90; batch 13 (10 runs) 1.43s / 1.97s; whole turn ~2.5s. The model's first token (median ~1.37s) is now essentially the whole wait — code adds ~0.1s and the distress verdict (~0.75s) is never waited on. Summarized refusal/deferral lists still not built.
- **M0 Phase A (6–7 Oct, `scripts/voice-latency.ts`, recorded candidates replayed as real-time speech through Flux and the real orchestrator; 41 turns):** Flux end-of-turn 0.2–1.0s median by persona (p90 to 1.4s, occasionally 3.8s); our turn to first segment 1.5–2.0s (Sonnet's first token is almost all of it — DB reads ~30ms, Plan ~2ms, Settle + persist ~40ms); Cartesia first audio ~0.14s. **End of speech → first audio: median 2.49s, p90 3.31s — the gate fails without an acknowledgment.** Transport (LiveKit) not yet measured.
- **Instant acknowledgment (built, `lib/voice/acknowledge.ts`):** a pre-synthesized, code-chosen two-beat backchannel plays at Flux's confirmed end-of-turn, so the first sound is end-of-turn + playback; the model's turn is told (`runTurn({ acknowledged })`) and the saved interviewer line starts with it. After it, Sonnet's `say` plays (a `say` that is only an acknowledgment is dropped as a double ack). Not played on the eager signal (declined 7 Oct).
- **Thinking filler — built, simulated, removed (7 Oct).** In the playback simulation (`lib/voice/playback.ts`, `scripts/playback-sim.ts`, 221 logged turns, durations estimated) the full filler delayed useful content by ~2.1s median; a short filler stopping at its next pause once Sonnet was ready filled the gaps (≤0.4s silence) but sounded scripted in the demo. Without it the silence between the acknowledgment and Sonnet's first word is ~0.3s median, up to ~1s.
- **Where the time goes (7 Oct, measured on 221 live text turns unless marked):** first useful content 2.13s median / 2.69s p90 from turn start (first sound 1.43s). By declared requests: none (41% of turns) 2.26s — the question waits for the whole turn; 1–2 requests 1.89s — the data line ~0.5s after the first token; 3+ 2.40s. Sonnet's first token (~1.35s) is the largest part and has resisted every optimization tested — a near-empty prompt was no faster (12-turn test), and neither concurrency nor an idle connection changed it (not established as an immovable floor); the API's own first token drifts 0.74–1.37s median between runs minutes apart, so latency comparisons must be paired and same-time. Haiku calls are off the speech path (distress verdict 0.72s median, held 0/221). Estimated (not measured end to end) end of speech → Sonnet's first word ≈ 2.7s median at Flux 0.7/0.5 (detection 1.14s on synthetic clips + first segment 1.43s + TTS ~0.14s); → first useful content ≈ 3.4s.
- **Speculative turns — IMPLEMENTED, DISABLED (no live caller).** `startDraft` (`lib/orchestrator/speculative-turn.ts`) runs `runTurn` on Flux's eager transcript behind a `DraftGate` (`speculation.ts`): every delivery, `commitScripted` and `persist` wait on the gate, deferred work is dropped unless the draft is accepted, and a cancelled draft (TurnResumed) can never play or commit, however late its model call finishes. A draft is accepted only if the final transcript is identical and a re-plan now (no classifier call) gives the same fingerprint — the rendered prompt with its m:ss clock blanked, history, turn kind, phase and every clock-derived decision. Draft model usage is tagged `speculativeDraftId`. Covered by mocked tests (real Plan and Settle, faked model). Expected saving at 0.7/0.5: ~125ms per turn (estimate from the synthetic sweep, not measured live) (eager lead 161ms median where eligible; clips with a premature end counted as zero); 23% of drafts cancelled. Open before enabling: abort a cancelled draft's API call; a live measurement of savings and wasted tokens.
- **Rejected or parked:** a Haiku-written opener in parallel with Sonnet (`lib/agent/opener.ts`; v1 silently corrected candidates and stated their conclusions as fact, v2 sounded robotic, real content still at ~2.0s); prompt layout `cached-history` (same latency, −17% interviewer cost, but more questions built on undelivered data in a 4-run A/B — parked pending a fix); a serial pre-call request classifier (Haiku: 818ms median, 1975ms p90); suppressing `say` in the output format (it costs ~75ms to write); acknowledgments on the eager signal. **Compact prompt (7 Oct, `REPLAY_ARM=compact-ab`, 20 stratified turns, paired, same model, settings, schema and checks): flat** — first useful content +19ms median (compact − full), faster on 10/20; input −29%, all of it cached; one request-handling regression (deferring data the case doesn't have). Prompt-latency work stopped; `system-compact.ts` kept, unused. Future experiments, not started: shorter questions; earlier question delivery (measure question completion, model completion and useful delivery separately first).

### 8.3 The LiveKit integration caveat (validate in M0)
LiveKit's default agent loop wants to own the LLM call. **It must not** — our orchestrator owns the turn, because data-gating and phase logic live there. Wire LiveKit so that on endpointed candidate speech, it hands the finalized transcript to *our* orchestrator (e.g. an `llmNode` override that calls `runTurn` with an `onSegment` sink), and the segments our orchestrator delivers are what gets sent to TTS; playback acknowledgements resolve the sink so reveals are booked only when heard. The model layer is ours. Validate this wiring works within the latency budget in the M0 spike before committing to LiveKit.

### 8.4 Hosting note
Long-lived WebRTC voice sessions don't fit Vercel serverless functions. Run the voice agent/orchestrator process on a persistent host (LiveKit Cloud, or a small always-on service — Railway/Fly/Render). The Next.js app on Vercel stays the web frontend + non-voice APIs. **Flag this split clearly; don't try to force voice onto serverless.**

### 8.5 Turn-taking
Barge-in: candidate interrupting stops playback and starts listening (FR-17). Tunable silence threshold so thinking pauses don't cut the candidate off (FR-18).
- **End of turn = Flux EndOfTurn** (end-of-turn 0.7, eager 0.5), not VAD silence. Phase A: 3/41 turns ended mid-answer, all at thinking pauses ("Um, and is…", "Let me do that. Ten percent is…"). Synthetic sweep (7 Oct, `scripts/endpoint-sweep.ts`: 40 clips with thinking pauses, a pause after a complete sentence, hesitation before a figure and self-corrections × 5 settings, no model calls): at 0.7/0.5 detection 1.14s median and 13/40 clips cut off — a 1.5s pause after a complete sentence at every setting, a 1.2s mid-sentence "um" on 5/8; 0.6/0.4 ~0.1s faster with 19/40 cut off; 0.9/0.6 ~0.4s slower with 6/40. No setting is both faster and safer; human recordings decide any change. Recovering from a cut-off (stop the interviewer and keep listening when the candidate resumes) is Phase B work; LiveKit's turn-detector model is the planned guard. Eager EndOfTurn drives only the disabled speculative draft — never speech.
- **The acknowledgment** (above) is skipped when the instant conduct floor flags the message (distress, hostility, injection) — the conduct response comes first. Subtle distress caught only by the model layer can still get an acknowledgment.

---

## 9. Non-functional

- **Latency:** §8.2 hard gate. Instrument per-turn latency from day one of M2. Note for M2: recommendation-ask turns make one synchronous Haiku classification before responding (Rule 11 force-release, §5.2).
- **Cost:** instrument `$/completed case` (STT + LLM + TTS minutes + scoring) from the first session; per-call token usage is logged as `llm_usage` by component. Internal ceiling + per-user case cap during validation. Turns run Sonnet 5.5 without thinking ($2/$10 per MTok, vs Opus 4.8's $5/$25 — the interviewer's resent history dominates input, so this is the largest saving); scoring is three Opus 5.5 passes with thinking (judge, verifier, reconciliation; $4/$20 per MTok, thinking tokens billed as output). **Measured on batch 4 (Sonnet 5.5 + Opus 5.5, 10 persona runs, ~20-minute cases): app LLM cost $0.70 per run, of which scoring ~$0.45 (up from ~$0.19 on Opus 4.8 — thinking tokens).** The older figures below were measured on Opus 4.8; every turn also makes two background Haiku calls (coverage agent, data-request classifier) and two parallel ones (same-turn request detection, C5 distress), plus synchronous Haiku calls on recommendation-ask turns and question-based hint turns. Measured on the 2026-09-14 simulated runs (~2-minute cases, 12–13 interviewer turns): interviewer ~105k input / ~1k output tokens, judge ~12k / ~4k, verifier + reconciliation ~9k / ~1.5k, Haiku ~35k / ~2k — roughly $1 of LLM per case before STT/TTS. Interviewer input dominates because the full history is resent each turn, so cost scales with turn count. The cost lever is the per-user case cap; if `$/completed case` breaches the ceiling, dropping the turn model back to a smaller one is the first candidate. **Accounting (8 Oct):** every figure is priced from `lib/llm-pricing.ts` (an unknown model id throws; cache reads/writes counted), and every Anthropic call — background, scoring, simulator, aborted streams — is metered through one client; experiments run under a required budget that refuses calls at the cap. Coverage cost grows with transcript length (it resends the transcript every turn): ~$0.16 per 30-turn run on Haiku 4.5 (8 Oct prefix runs) — the main reason to move it to Haiku 5.5.
- **Reliability:** graceful degradation — if voice fails mid-case, fall back to the M1 text channel so the session survives (this is nearly free because text is the base layer).
- **Privacy:** explicit consent for audio storage; don't store audio by default (`session_audio` empty unless consented).
- **Browser:** latest Chrome/Edge/Safari desktop; mic-permission flow.
- **Scalability:** designed for tens of pilot users but bursty (recruiting calendar) — connection pooling, pre-warmed voice workers during known spikes. Don't over-engineer beyond pilot scale.

---

## 10. Content & case authoring

Cases are **human-authored JSON** in `/cases`, version-controlled, validated against a **zod schema** on load (reject malformed cases at boot, not mid-session). Schema per product PRD §11. 8–12 cases across profitability, market entry, M&A, market sizing, ops/cost.

**FR-20:** no case ships without an answer key; ex-MBB author + second reviewer. Enforce: the loader fails any case missing `structure_key`, `data_ledger`, `math_steps[].answer`, or `recommendation_key`. Rubric anchors are generic (the 8-dimension rubric in `lib/scoring/rubric.ts`); per-case `rubric_anchors` are deprecated/optional. Additionally, every case needs a ledger-consistency block in `tests/cases/consistency.test.ts` (prompt ↔ ledger ↔ exhibits ↔ math steps reconcile). Authoring rules — including speakable ledger values, per-phase `pacing` budgets, `alt_answers` for legitimately ambiguous math steps, and the **source-span fields every math step must declare** (`cues` required, `unit`, `inputs` — ledger ids validated at load — and `live: false` for prompt-fact steps; v4.3) — live in **`docs/case-authoring.md`** — as do two rules added after the 2026-09-14 runs: the stated root cause must be derivable from the ledger (prof-001's key claimed coffee beans explained a COGS jump that was only possible if beans were ~95% of COGS), and exhibits list the ledger items they display in `coversLedgerItems`.

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
2. **Orchestrator + data ledger (text, no LLM yet).** State machine, phase gating, the reveal mechanism (originally a `reveal_data` tool call; since Oct 2026 code-decided releases, §5.1), the deterministic post-turn data-leak audit. Drive it with scripted candidate input in tests.
3. **Interviewer agent (text; Opus 4.8 at build time, Sonnet 5.5 since Oct 2026).** Turn loop (tool calls at build time; a streamed JSON turn since Oct 2026, §5.3), system/anti-hallucination/anti-jailbreak prompts, pushback flag. **Gate: run the 50-case-style hallucination harness on the seed case → zero invented numbers.**
4. **Scoring engine (Opus + deterministic).** Judge, math checks, report assembly with model answer. **Gate: feedback beats ChatGPT in a blind test on the same answer (product PRD M1 gate).**
5. **Text case UI + report UI.** Full end-to-end text case in the browser. Transcript view. This is a *complete, usable product* minus voice.
6. **Content: author 8–12 cases.** Each with keys + reviewer sign-off. Re-run the hallucination harness across all cases → **0 incidents (DoD #2).**
7. **M0 voice spike (parallelizable from step 1).** Validate LiveKit + Deepgram + Cartesia latency ≤1.5s median AND the orchestrator-owns-the-LLM wiring (§8.3) on the seed case. *Status (7 Oct): Phase A done (Flux + Cartesia + the real orchestrator, no transport). The gate passes on first sound only with the instant acknowledgment; on useful content it fails (≈3.4s estimated end of speech → data line or question, §8.2). Filler removed; speculative turns implemented and disabled; end-of-turn settings kept pending human recordings; compact-prompt A/B flat — prompt-latency work stopped. Phase B (LiveKit, mic, barge-in, playback-confirmed reveals) not started.*
8. **Voice layer (M2).** Implement the voice `CandidateChannel` against the proven orchestrator. Barge-in, VAD threshold, text-fallback on failure. **Gate: realism ≥4.0, latency gate held.**
9. **Analytics + cost instrumentation** wired throughout (do this incrementally, not last — §13).
10. **Validation pilot** with 5–10 clubs.

Steps 1–6 contain zero voice code. That's the point.

---

## 13. Analytics (instrument as you build, not at the end)

Log: `case_start`, `mic_check_result`, per-turn latency, phase transitions, data items revealed, exhibit shown, `case_complete` vs `abandon` (+ abandon phase), `scoring_runtime_ms`, `$ cost per session`, post-case ratings (realism, usefulness), blind-comparison opt-ins. These feed the success metrics and go/no-go gates directly. Append to `analytics_events`.

Also logged (added during the build): `llm_usage` (tokens per call, by component — the `$/case` input), `scoring_qa` (one per scoring run: transcript artifacts, evidence strips and point drops, verifier drops, data-request gaps / not-in-case / backfills, reconciliation merges / gap drops / cross-dimension repeats), `turn_latency`, `phase_repair`, `data_force_released`, `fabricated_turn_stripped`, `data_revealed` with `via: 'exhibit'` for exhibit-covered ledger items, `spoken_close_resolved`, `session_paused` / `session_resumed`, `case_abandoned`, and `provenance_blocked` (v4.3 — a turn had a figure withheld; target rate is near zero, and every event is a model fabrication caught). `scoring_qa` also carries (v4.3) `interviewerErrorMarks`, `markClaimDrops`, and `caveatFloors`.

---

## 14. Definition of done (acceptance)

1. End-to-end interviewer-led **voice** case, median turn latency ≤1.5s (p95 ≤2.5s).
2. **Zero** numbers stated outside the data ledger across a 50-case QA run (deterministic audit proves it).
3. Interviewer withholds data until asked, challenges unevidenced assertions, holds character against jailbreak, and follows the conduct/wellbeing track (`docs/interviewer-behavior.md` Rules 17–19) on abusive/distressed input.
4. Report shows all 8 rubric dimensions (rating + went-well/needs-work with transcript-sourced quotes + missed opportunities + coverage caveats + model answer); deterministic math checked programmatically; report claims verified against the transcript (interviewer-error marking + quote audit + verifier incl. error claims + dimension reconciliation + caveat floor); no report item rests only on the candidate's reaction to an interviewer error.
5. ≥65% blind preference for our feedback vs ChatGPT on the same answer.
6. Text-fallback works on voice failure; state persists across a network drop.
7. All §13 events flowing to analytics.

And the structural one this whole doc is organized around:

8. **Steps 1–6 (the entire text product) ship and pass their gates with no voice library in the dependency graph of the orchestrator, agent, or scoring code.**

---

## 15. Open questions (deferred to build)

- Vendor confirmation: Phase A done (Flux, Cartesia, Sonnet + acknowledgment); Phase B (LiveKit transport, mic, barge-in, playback-confirmed reveals) not started — needs Cartesia Pro or another streaming TTS. Open: human endpoint recordings (they decide the end-of-turn settings); enabling speculation (abort cancelled drafts' API calls, measure live savings and waste); Deepgram keyterms for case names; Deepgram's apparent one-stream concurrency limit on the credit account (a pilot with concurrent cases needs it lifted); Cerebras 5 requests/min if ever revisited.
- **Interviewer model:** whether GPT-6 Luna (reasoning none) or Claude Haiku 5.5 with the pressure-test and request guards can run a rigorous interview consistently — the guard defects are fixed (§5.4); the paired evaluation is paused and must be re-estimated with coverage priced correctly (and, for Luna, a verified price and metering — non-Anthropic adapters are refused under a run budget). Production stays on Sonnet.
- **Background classifiers → Haiku 5.5 (checks run 8 Oct, $0.34):** pressure-test judges and distress pass (fewer false unlocks; distress identical on fires); hint check fails (two narrowing hints missed) and stays on 4.5; data-request classifier fails as configured (Haiku 5.5 sometimes writes analysis before the JSON — try a JSON-schema output, re-check); coverage keeps the end gate but steers differently mid-case (5.5 scores early evidence lower) — needs a decision. No role switched yet.
- **System language spoken by Sonnet:** "The pressure test is answered." reached `say` in the 8 Oct screen (Nikhil t24) — not caught by the system-vocabulary veto; needs a veto entry.
- **System-policy issues found in batch 17 (affect every model):** (1) Rule 14 second attempt — a case-breaking error with no `mathSteps` entry (e.g. Jordan's "40 points") never gets the corrected figure; (2) stall check reads enumerated request lists as progress (nothing broke the Nikhil loop); (3) unit-check false positives ("Points of what?" on correct figures); (4) provenance guard blocks attributed figures written in words; (5) release cap defers explicit asks; (6) stage tracking by `move` label skips the brainstorm or re-asks a recommendation when the label is wrong; (7) close-turn releases and capitalised refusal labels. Priority agreed 7 Oct: request loop / stall first, Rule 14 next, each kept separate from the guard verification.
- Which 2–3 archetypes to author first?
- Audio storage / retention policy specifics (default: don't store).
- Exact per-user case cap during validation.
- drizzle vs. raw Supabase migrations (agent may choose; flag it).
- C5 report discard (behavior doc Rule 17-C5, v4.3): **decided 2026-09-29 — not built for the pilot**; a candidate who continues after a distress disclosure is scored normally with the C5 exchange excluded. Revisit if pilot users ask ("hide from my history" first; true deletion needs a retention decision).
- Live recompute recall: the v4.3 span matcher produced zero false flags across the 13 persona runs, but the corpus held no genuine dollar-impact or per-store errors, so its hit rate on real errors is measured only by unit tests. Confirm in the next persona cycle (Sofia, Jordan, Tyler) before relying on it. **Batches 12–13 (Tyler, Sofia, Jordan run):** recompute never fired — Tyler's misquotes of released data, Jordan's 38-vs-16 point error and Maya's "16% of $480M is $48M" are not case math steps, so none was flagged, and the Rule 14 two-attempt cap never applied (Maya probed six turns, Jordan four). Coverage gap, open.
