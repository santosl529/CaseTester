# Technical PRD — Voice AI Mock Case Interview (Feature 1, Build Spec)

**Companion to:** `prd-voice-ai-mock-case.md` (product PRD — source of *what* and *why*)
**This document:** the engineering build spec for an AI coding agent (Claude Code). It pins down stack, data model, API surface, orchestration logic, repo structure, and build order.
**Status:** Draft v1 · **Target:** MVP validation build · **Scale:** tens of pilot users (consulting clubs), bursty seasonal concurrency.

> Read this alongside the product PRD. Where the product PRD states a requirement (FR-N), this doc says how to build it. The product PRD wins on intent; this doc wins on implementation detail. If they conflict, flag it — don't silently pick one.

> **Companion normative docs** (added as the build matured; this PRD points to them rather than duplicating):
> - `docs/interviewer-behavior.md` — the authored interviewer conduct spec (Rules 1–19, incl. the conduct/wellbeing track). Governs §5.4.
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
| Live interviewer LLM | **Claude Opus 4.8** (`claude-opus-4-8`) | Switched from Haiku 4.5 (July 2026): pilot runs showed Haiku missing candidate math errors live (nested-percentage confusion). Swappable behind `InterviewerModel` interface. Revisit for M2 voice latency — Opus turns are slower/pricier. |
| Scoring/judge LLM | **Claude Opus 4.8** (`claude-opus-4-8`) | Runs once at case end; latency-insensitive; this is the product. Three Opus passes: judge, claim verifier, dimension reconciliation (§6). |
| Background LLM passes | **Claude Haiku 4.5** (`claude-haiku-4-5`) | Live coverage agent and Rule 11 data-request classifier — one call each per turn, run after the response (`after()`), so no added turn latency. Exception: recommendation-ask turns classify the current candidate message synchronously (one Haiku call, ~1s) — count it against the M2 latency budget. |
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
                                                       │  (Opus 4.8,      │
                                                       │   tool-calling)  │
                                                       └──────────────────┘

   case end ──► Scoring service (Opus 4.8 judge/verifier/reconciliation + deterministic checks) ──► Report
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
    session-runner.ts     one candidate turn end to end (runTurn)
    phase-repair.ts       evidence-based phase repair (Rule 8, §5.2)
    data-requests.ts      Rule 11 data-request classifier (Haiku) + open-request / force-release helpers
    post-turn.ts          background passes after each turn (coverage agent, data-request audit)
    start-session.ts      session creation + deterministic opening turn
  /agent
    interviewer.ts        per-turn prompt assembly + tool-call handling
    prompts/              system prompt, anti-hallucination, anti-jailbreak
    models/               InterviewerModel interface + Anthropic impl (Opus 4.8)
  /scoring
    judge.ts              Opus rubric evaluation over full transcript
    deterministic.ts      math-tolerance checks, data-leak audit (NOT the LLM)
    report.ts             assembles the 8-dimension report + model answer
    score-session.ts      the full scoring pipeline (§6), shared by the score route and scripts
    transcript-artifacts.ts, evidence-audit.ts, verifier.ts, reconcile.ts   report verification (§6)
    data-coverage.ts      requested-vs-never-requested data split for the judge (Rule 11)
  /voice                  (M2 only) STTProvider, TTSProvider, LiveKit glue
  /cases                  case JSON loader + schema validation (zod)
/cases                    human-authored case content (JSON, version-controlled)
/db                       drizzle schema + migrations
/tests                    QA harness (incl. 50-case hallucination run)
/scripts                  live-run.ts — end-to-end run with a simulated candidate against real models + DB (dev only)
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
                         --   steers the interviewer + gates early end_case
  flags_jsonb            -- orchestrator run-state. Booleans: stalled, ran_long,
                         --   asked_repeat, off_topic_count, advanced_last_turn
                         --   (gates the no-back-to-back behavior shift),
                         --   time_warning_fired, load_shed_logged.
                         -- Sub-objects: stall{} (stall-ladder state, Rule 13),
                         --   conduct{ warnings, distress_offered, category } (Rule 17).
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
  --    ("assisted ≠ covered" and time-pressure coverage caveats).
  -- 'conduct': C1–C5 conduct events (Rule 17) — internal only, NEVER
  --    surfaced to client/report (Rule 18, FERPA). Filter by category;
  --    the report/score paths never query 'conduct'.
  -- 'data_request': Rule 11 audit — one row per candidate data request
  --    (subtype release|refuse|defer|clarify|none; payload what, ledgerItemIds,
  --    revealedByNow) plus a 'classified' marker per checked exchange, so
  --    scoring can backfill exchanges the background pass missed.

scores
  id, session_id (fk),
  -- 8 rubric dimensions, each: <dim>_rating (enum) + <dim>_evidence_jsonb (legacy):
  --   structure, quantitative, data_exhibit, judgment, creativity,
  --   synthesis, communication, pushback
  overall_rating (enum), top_fix (text),
  rubric_jsonb           -- full structured judge output (per-dimension
                         --   wentWell/needsWork/missedOpportunities + coverageCaveat);
                         --   the *_evidence columns are legacy (pre-8-dim rows)
  deterministic_jsonb    -- math step results (per-step errorClass) + data-leak audit
  model_answer_jsonb     -- structure / key math / recommendation exemplars
  scoring_runtime_ms, judge_model, created_at

session_audio          -- OPTIONAL, consent-gated; off by default
  session_id (fk), storage_path, consent_at

analytics_events       -- append-only; feeds §13 metrics
  id, session_id (nullable), user_id (nullable),
  event_type, payload_jsonb, created_at
```

**Enums:** `phase` = `INTRO|CLARIFY|STRUCTURE|ANALYSIS|EXHIBIT|BRAINSTORM|RECOMMENDATION|WRAP|SCORING`. `session_status` = `active|completed|abandoned|terminated`. `rating` = `needs_work|meets_bar|strong` (displayed as needs work / adequate / strong).

**Terminated / abandoned scoring (Rule 18/19):** a `terminated` session (conduct C2-repeat / C3) produces **no score, no report**; a C5-`abandoned` session is excluded from scoring. The score route only proceeds for `status = completed`, so both are safe by construction.

`content_jsonb` holds the full case schema (§11 of product PRD). It is **loaded server-side only**; the client receives the read-aloud prompt and exhibits-as-shown, never the ledger answers or keys.

---

## 5. The orchestrator — anti-hallucination is the core invariant

This is where FR-4 ("zero hallucinated figures") is won or lost. **The acceptance criterion is hard: 0 invented numbers across a 50-case QA run.** Build for that from line one, not as a later hardening pass.

### 5.1 Data-gating mechanism

1. The interviewer LLM **never receives un-revealed numeric values in its prompt.** The per-turn prompt includes: case prompt, current phase, conversation history, the *labels* of ledger items (so it knows what data exists and can decide whether the candidate's request warrants revealing it), and the values of items **already in `revealed_data`** — nothing more.
2. To disclose a number, the LLM must emit a `reveal_data(item_id)` tool call. The orchestrator validates the item exists, marks it revealed, and only *then* feeds the value back so the interviewer can speak it. **Divergence (flagged 2026-09-14, needs a decision):** this spec originally required the orchestrator to enforce each item's `release_when`; the build treats `release_when` as an authoring hint (it now also drives phase repair, §5.2) and does not block early reveals. Either enforce it or amend this line.
3. The system prompt forbids stating any number not provided in context. But the prompt is the soft layer — the hard layer is that **the model literally does not have the un-revealed values**, so it can't leak what it never saw.
4. **Post-turn audit (deterministic, not LLM):** after every interviewer turn, scan the spoken text for numeric tokens and verify each appears in `revealed_data` or is derivable from already-revealed / candidate / orchestrator-derived values. Any unexplained number → flag, log, and in QA mode fail the run. This audit proves the "zero hallucinated data" metric. It is the base of a wider post-turn suite (see §5.4): the tiered numeric-provenance audit (word-number aware), the style/length audit, and the meta-leak strip all run here too.
5. **Orchestrator-initiated disclosure** — the only paths that reveal without a `reveal_data` call, all through the same ledger (so values are revealed-only and audited like any other): (a) a spoken data promise with no tool call resolves to a ledger item named in the text, or injects a refusal (§5.4); (b) an exhibit with `coversLedgerItems` marks those items revealed when shown (it displayed them); (c) Rule 11 force-release — before any recommendation ask, up to two ledger items the candidate asked for and never received are released ahead of the ask (§5.4).

### 5.2 State machine

`INTRO → CLARIFY → STRUCTURE → ANALYSIS → EXHIBIT → BRAINSTORM → RECOMMENDATION → WRAP → SCORING`

- Transitions fire when the LLM emits `advance_phase()` **or when the orchestrator repairs the phase from evidence** (Rule 8, `phase-repair.ts`): after each turn the phase rises to the highest stage the turn visibly reached — a ledger reveal → that item's `release_when`, an exhibit → EXHIBIT, an interviewer brainstorm question → BRAINSTORM, a recommendation ask → RECOMMENDATION; forward only, never past RECOMMENDATION, logged as `phase_repair`. Model advances alone left both 2026-09-14 live runs in STRUCTURE for the whole case. The advance is **always booked** (state accuracy over pacing, Rule 8); a separate `advanced_last_turn` flag gates the interviewer's *visible* behavior shift so there's no back-to-back "let's move on." **INTRO auto-advances** to CLARIFY after the opening exchange if the model doesn't — a live run got stuck in INTRO the whole case.
- **Legality per phase** (`LEGAL_ACTIONS`): `speak`/`reveal_data`/`show_exhibit`/`advance_phase`/`end_case` are legal in every active phase (a real interviewer hands over data/exhibits when asked, and time can run out anywhere). `advance_phase` is not legal in WRAP; nothing is legal in SCORING. Illegal actions are filtered, not re-prompted.
- **Single wall clock, per-phase budgets.** There is one total case budget (5 min); phases carry per-phase budgets from case config (`pacing.phaseBudgetsMs`, uniform fallback). A pacing nudge injects "advance now if the exit criterion is met" when a phase exceeds its budget or the session falls ≥2 phases behind.
- **Load-shedding (Rule 15):** in the final stretch (keyed to *total* remaining time — robust to the phase machine under-advancing), the prompt carries a directive to stop optional probing and protect the recommendation; entry is logged (`load_shed`) so the judge attributes thin late coverage to time, not the candidate.
- **Deterministic close/time-warning (Rule 12):** an orchestrator-emitted recommendation-ask fires at T−30s (suppressed if the model already asked), and a close line is guaranteed if the case ends with nothing spoken. On any recommendation-ask turn — scripted or model-issued — open data requests are released first, in the same turn (Rule 11 force-release, §5.1).
- **Coverage-gated ending:** a background coverage agent (Haiku, run via `after()`) scores each dimension 0–100 on *evidence sufficiency* every turn; `end_case` is suppressed until every dimension is sufficiently tested (or time is up), and the interviewer is steered toward the undertested ones. Keeps the interviewer from wrapping early and leaving weak areas unprobed. Normative detail in `docs/scoring-qa.md`.

### 5.3 Interviewer actions (tool calls)

`speak(text)`, `reveal_data(item_id)`, `show_exhibit(exhibit_id)`, `advance_phase()`, `end_case()`.
Every turn returns one or more actions. The orchestrator executes them in order, enforcing legality and the data-gate.

### 5.4 Behavioral requirements (system prompt + orchestrator)

**Normative source: `docs/interviewer-behavior.md`** (the authored conduct spec, Rules 1–19 across core conduct, data delivery, struggling-candidate handling, and a conduct/wellbeing track). The prompt encodes the rules; **deterministic backstops** in the orchestrator enforce what a prompt can't reliably guarantee. This section summarizes; the doc governs.

Core prompt constraints: neutral affect / never grade mid-case (1); force structure + live math (2); no fabricated candidate claims (3); one candidate task per turn, Socratic not coaching (4); 1–3 sentence spoken turns, no markdown (5); never adopt candidate-derived figures as fact, or state the correct figure on a misquote (6); pressure-test the opening structure (7); reveal data the candidate has earned and asked for; every data request is released, refused, or audibly deferred — never ignored, never substituted (10/11). Withhold-until-asked and jailbreak-resistance (FR-5/FR-8) still hold — and a jailbreak still can't surface un-revealed numbers (§5.1).

Deterministic backstops (all in `/lib/orchestrator`, logged; QA-gated in the harness):
- **Numeric provenance audit** — every quantity in an interviewer turn must trace to revealed ledger values, a candidate-attributed figure, or an orchestrator-derived value; word-numbers and ranges normalized; unit-bearing unmatched quantities block, bare counts log.
- **Recompute + unit-check** — per-turn, deterministically recompute figures the candidate states against the case `math_steps` (respecting `alt_answers`) and detect nested-percentage conversions, injecting a hint so the interviewer probes/corrects.
- **Style + meta-leak** — 1–3 sentence / no-markdown length audit (data read-outs exempt), and a strip of internal planning that leaks into spoken text ("the candidate has…", "let me pressure…").
- **Stall ladder (Rule 13)** — graduated restate → narrow → directive-rescue for struggling candidates; logged as `intervention` events ("assisted ≠ covered").
- **Malformed-tool-call recovery** — tolerant id resolution for `reveal_data`/`show_exhibit` (the model sometimes passes the id as the key or a fuzzy name), plus a validate-and-retry loop that feeds an `is_error` tool result back to the model (bounded by `maxToolCorrections`) when a tool call's id doesn't resolve. A promised-but-undelivered **exhibit** is recovered (`promisesExhibit`, same-sentence exhibit+delivery-verb match, skipped on the closing turn). The equivalent recovery for `reveal_data` is now built (`promisesReveal`/`resolveItemFromText` in `lib/orchestrator/data-ledger.ts`): unlike the exhibit case, there's no safe "only one candidate" fallback (guessing the wrong ledger item would itself be a data leak), so recovery only resolves to a ledger item whose *label* is actually named in the spoken text — a closed-catalog match, same guarantee as tool-call id resolution — and if nothing matches (the candidate asked for a cut that isn't in the case, e.g. the "vintage split" pilot bug), it injects an explicit Rule-11 refusal script (`REVEAL_REFUSAL_SCRIPTS`) rather than leaving the promise dangling or letting the model silently substitute unrelated data.
- **Rule 11 data-request tracking** — a Haiku classifier logs every candidate data request and how the next turn handled it (`data_request` events; one request can cover several ledger items); still-unreleased requests are injected into the next prompt; on recommendation-ask turns the current message is classified synchronously and open requests are force-released ahead of the ask. Request detection is a soft signal; ledger membership and revealed state are deterministic.
- **Fabricated-turn guard** — role-label stop sequences on the interviewer model call, plus a per-`speak` cut at any line that opens as another speaker ("\nuser …"), so the interviewer can never author the candidate's side (live run 58cb8061 had it write the candidate's brainstorm, which was then scored).

**Conduct & wellbeing track (Rule 17–19, Part IV of the behavior doc).** A separate track that intercepts *before* case rules: C1 self-directed frustration (ignore), C2 directed hostility (warn then terminate), C3 harassment/slurs/threats (terminate immediately), C4 prompt injection (redirect + log, never terminate), C5 distress (break persona, offer pause/stop, never terminate). Deterministic classifier today; the doc's model-tiebreaker and full pause/resume are pending. Termination/abandonment → no score (see §4). The lexicons were adversarially hardened (July 2026) against a probe corpus now locked into `tests/orchestrator/conduct.test.ts`: the pre-hardening lexicon scored 14/23 false positives (including a C3 *terminate* on "I'll find you the exact number" and C2 warns on client-directed case speech like "your margins are terrible") and 13/30 misses (including "Ignore all previous instructions"); the rebuilt patterns require both a meddling/probing shape AND a model-operation object, and score 0/0 on the corpus. **Still pending:** the model-judgment tiebreaker, and human review of the lexicons against real pilot-population data — the probe corpus is authored, not observed, so it cannot stand in for what actual candidates say.

---

## 6. Scoring service (runs once at `end_case`)

Heavy work at the end protects live latency (FR-11). Implemented in `lib/scoring/score-session.ts` (shared by the score route and `scripts/live-run.ts`). Pipeline — order is load-bearing:

0. **Pre-scoring:**
   - **Transcript-artifact repair** (`transcript-artifacts.ts`): empty and duplicate turns removed; fabricated-speaker continuations cut from interviewer turns. Runs before everything else so no later pass sees a contaminated transcript.
   - **Data-request backfill + split** (`data-coverage.ts`): classify any candidate→interviewer exchange that has no `data_request` rows, then split ledger data the candidate asked for and never got (a coverage gap) from never-requested and not-in-case requests (Rule 11).
1. **Deterministic checks** (`/lib/scoring/deterministic.ts`, no LLM):
   - For each `math_step`, check the candidate's stated result against `answer` (or any `alt_answers`) within `tolerance` (FR-14), classifying each as `non_issue|minor|case_breaking|unmentioned`. `alt_answers` credits genuinely ambiguous quantities (e.g. margin-impact vs actual-spend COGS increase) so a defensible-but-different computation isn't mislabeled an arithmetic error.
   - Run the data-leak audit over the full transcript (§5.1) → QA metric.
2. **LLM judge** (`judge.ts`, Opus 4.8): evaluates the full transcript against the **8-dimension consolidated rubric** (`docs/Case Interview Feedback Rubric.pdf`, encoded in `lib/scoring/rubric.ts`) + case **answer key**. Returns, per dimension: rating (`needs_work|meets_bar|strong`, displayed as needs work/adequate/strong), **what went well** and **what needs work** (each point with verbatim candidate quotes, FR-12), **missed opportunities**, and a **coverage caveat**. The judge prompt is fed deterministic context so it doesn't re-derive or misjudge: the **math-check results** (trust these over re-derivation; wrong math can't appear in "went well"), the **data actually revealed, with requested-but-never-provided ledger data in its own coverage-gap section** (never charged to the candidate, including in the top fix — Rule 11), and the **intervention log** ("assisted ≠ covered" for stall rescues; time-pressure coverage for load-shed). It is also told to distinguish an arithmetic error from a wrong-*quantity* conceptual error. Normative scoring spec: `docs/scoring-qa.md`.
3. **Report verification** — a report that misstates the transcript is the worst feedback failure:
   - Deterministic evidence audit (`evidence-audit.ts`): every judge quote must appear in candidate turns (normalized, ellipsis-fragment-aware); fabricated quotes are stripped, and points left without evidence are dropped (a strength needs ≥1 real candidate quote; a weakness is dropped only if every quote it cited was fabricated — omission claims carry none).
   - Claim-verifier pass (`verifier.ts`, Opus 4.8): re-checks every `needsWork`/`missedOpportunities`/`topFix` claim against the transcript and drops what it contradicts (catches false omission claims, which contain no quote to check). Fails open — a broken verifier response ships the unverified report rather than blocking scoring.
   - Dimension reconciliation (`reconcile.ts`, Opus 4.8, last): merges a concept stated as both strength and weakness within one dimension, drops faults that rest on requested-but-never-provided data, logs concepts faulted in 3+ dimensions. Skipped when nothing can collide; fails open. (Its first two live runs silently failed to parse — the model reasons in prose before the JSON — fixed 2026-09-14.)
4. **Report assembly** (`report.ts`):
   - Per-dimension rating + structured feedback sections.
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
| `POST /api/session` | New session; opening message is the **verbatim case prompt** (deterministic — the candidate must see the exact scenario/numbers; not a model turn) + a rotating invitation. Auth + club-code gated. |
| `POST /api/channel/[id]/turn` | One candidate turn → orchestrator → interviewer turn. Returns immediately on the final turn (scoring is separate) with `scoring_suppressed` on conduct-terminated/abandoned sessions. |
| `POST /api/channel/[id]/score` | Runs scoring for a completed session (idempotent; guarded to `status = completed`). Split out so the client can show an "evaluating" state and so a failed pass is retryable. |
| `GET /api/report/[id]/pdf` | Streams the report as a PDF (server-rendered; ownership-checked). |
| `scripts/live-run.ts` (dev only) | End-to-end run with a simulated candidate against real models and the real DB (`--pace=human` for realistic timing); writes transcript, report, and QA metrics to `Case Interview Runs/`. Route handlers are thin wrappers over `lib` (`start-session`, `post-turn`, `score-session`, PDF `render`), so the script exercises the same code paths. |
| `case/[id]/report` (page) | Renders the assembled report (no raw keys); persistent case-prompt banner on the live page. |
| `logEvent(...)` | Append analytics events (§13). |

**Security non-negotiables:**
- `data_ledger` values, `*_key` fields, and `math_steps.answer` are **server-only**. The client never receives them, even gzipped in a bundle. (Legacy per-case `rubric_anchors`, where still present, are likewise server-only; the live rubric is the generic 8-dimension one in `lib/scoring/rubric.ts`.)
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

- **Latency:** §8.2 hard gate. Instrument per-turn latency from day one of M2. Note for M2: recommendation-ask turns make one synchronous Haiku classification before responding (Rule 11 force-release, §5.2).
- **Cost:** instrument `$/completed case` (STT + LLM + TTS minutes + scoring) from the first session; per-call token usage is logged as `llm_usage` by component. Internal ceiling + per-user case cap during validation. Turns and scoring run Opus 4.8 (quality choice after pilot misses); scoring is three Opus passes (judge, verifier, reconciliation); every turn also makes two background Haiku calls (coverage agent, data-request classifier), plus one synchronous Haiku call on recommendation-ask turns. Measured on the 2026-09-14 simulated runs (~2-minute cases, 12–13 interviewer turns): interviewer ~105k input / ~1k output tokens, judge ~12k / ~4k, verifier + reconciliation ~9k / ~1.5k, Haiku ~35k / ~2k — roughly $1 of LLM per case before STT/TTS. Interviewer input dominates because the full history is resent each turn, so cost scales with turn count. The cost lever is the per-user case cap; if `$/completed case` breaches the ceiling, dropping the turn model back to a smaller one is the first candidate.
- **Reliability:** graceful degradation — if voice fails mid-case, fall back to the M1 text channel so the session survives (this is nearly free because text is the base layer).
- **Privacy:** explicit consent for audio storage; don't store audio by default (`session_audio` empty unless consented).
- **Browser:** latest Chrome/Edge/Safari desktop; mic-permission flow.
- **Scalability:** designed for tens of pilot users but bursty (recruiting calendar) — connection pooling, pre-warmed voice workers during known spikes. Don't over-engineer beyond pilot scale.

---

## 10. Content & case authoring

Cases are **human-authored JSON** in `/cases`, version-controlled, validated against a **zod schema** on load (reject malformed cases at boot, not mid-session). Schema per product PRD §11. 8–12 cases across profitability, market entry, M&A, market sizing, ops/cost.

**FR-20:** no case ships without an answer key; ex-MBB author + second reviewer. Enforce: the loader fails any case missing `structure_key`, `data_ledger`, `math_steps[].answer`, or `recommendation_key`. Rubric anchors are generic (the 8-dimension rubric in `lib/scoring/rubric.ts`); per-case `rubric_anchors` are deprecated/optional. Additionally, every case needs a ledger-consistency block in `tests/cases/consistency.test.ts` (prompt ↔ ledger ↔ exhibits ↔ math steps reconcile). Authoring rules — including speakable ledger values, per-phase `pacing` budgets, and `alt_answers` for legitimately ambiguous math steps — live in **`docs/case-authoring.md`** — as do two rules added after the 2026-09-14 runs: the stated root cause must be derivable from the ledger (prof-001's key claimed coffee beans explained a COGS jump that was only possible if beans were ~95% of COGS), and exhibits list the ledger items they display in `coversLedgerItems`.

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
3. **Interviewer agent (text, Opus 4.8).** Tool-calling turn loop, system/anti-hallucination/anti-jailbreak prompts, pushback flag. **Gate: run the 50-case-style hallucination harness on the seed case → zero invented numbers.**
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

Also logged (added during the build): `llm_usage` (tokens per call, by component — the `$/case` input), `scoring_qa` (one per scoring run: transcript artifacts, evidence strips and point drops, verifier drops, data-request gaps / not-in-case / backfills, reconciliation merges / gap drops / cross-dimension repeats), `turn_latency`, `phase_repair`, `data_force_released`, `fabricated_turn_stripped`, and `data_revealed` with `via: 'exhibit'` for exhibit-covered ledger items.

---

## 14. Definition of done (acceptance)

1. End-to-end interviewer-led **voice** case, median turn latency ≤1.5s (p95 ≤2.5s).
2. **Zero** numbers stated outside the data ledger across a 50-case QA run (deterministic audit proves it).
3. Interviewer withholds data until asked, challenges unevidenced assertions, holds character against jailbreak, and follows the conduct/wellbeing track (`docs/interviewer-behavior.md` Rules 17–19) on abusive/distressed input.
4. Report shows all 8 rubric dimensions (rating + went-well/needs-work with transcript-sourced quotes + missed opportunities + coverage caveats + model answer); deterministic math checked programmatically; report claims verified against the transcript (quote audit + verifier + dimension reconciliation).
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
