# Voice AI Mock Case Interview

## What this is
A voice-based AI mock case interview for undergraduates recruiting for management consulting (MBB/tier-1/boutique). An AI interviewer talks, listens, gates case data, pushes back, and produces a rubric-scored feedback report at the end. MVP ships one mode (interviewer-led / McKinsey-style), 8–12 human-authored cases, real-time voice with ≤1.5s turn latency. Current stage: MVP validation build for tens of pilot users (consulting clubs). The differentiator is feedback quality that visibly beats free ChatGPT — "the rubric is the product."

## Stack
- Next.js (App Router) on Vercel; server actions for mutations, route handlers for streaming/voice.
- Supabase (Postgres + Auth, email + club-code gate); RLS on all candidate-owned tables.
- drizzle for typed schema + migrations (or Supabase migrations — flag if you switch).
- Tailwind; minimal mid-case UI (voice is primary, exhibit panel is the only mid-case visual).
- Live interviewer LLM: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), behind an `InterviewerModel` interface.
- Scoring/judge LLM: Claude Opus 4.8 (`claude-opus-4-8`), runs once at case end.
- Voice (M2, spike-pending, all behind interfaces): LiveKit Agents (transport/VAD/barge-in) + Deepgram STT + Cartesia TTS.

## The non-negotiable architectural rule
Build the **text case end-to-end before any voice code exists.** The orchestrator talks to the candidate through an abstract `CandidateChannel`; M1 implements it as a text channel, M2 as the voice pipeline. **No voice library may appear in the dependency graph of the orchestrator, agent, or scoring code.** Enforce with a lint boundary rule. Voice is a wrapper, not a prerequisite.

## The core invariant
Zero hallucinated case data (FR-4). The interviewer LLM never receives un-revealed numeric values in its prompt — it can only surface a number via a `reveal_data(item_id)` tool call that the orchestrator validates and gates. A deterministic post-turn audit scans interviewer output for any number not in the revealed set. This is a hard acceptance criterion (0 across a 50-case QA run), not a later hardening pass.

## Commands
[Placeholder — fill in once package.json scripts are decided: dev, build, typecheck, test, lint, db:migrate]

## Project structure
See the PRD §3 for the proposed layout (`/lib/orchestrator`, `/lib/agent`, `/lib/scoring`, `/lib/voice`, `/cases`, `/db`). Refine if needed but flag structural changes.

## Spec
- The approved technical PRD is at `prd-voice-ai-mock-case-technical.md`, with the product PRD (`prd-voice-ai-mock-case.md`) as the source of intent. Treat the technical PRD as the build source of truth.
- Build against it. Flag gaps or ambiguities to me rather than filling them in unilaterally.
- After changes that affect scope or behavior, flag what in the PRD needs updating — don't edit it without my go-ahead.
- Follow the build order in PRD §12. Each step must ship and pass its gate before the next.

## Conventions
- Match existing code style.
- Ask before adding dependencies — especially anything that could pull a voice library into the text core.
- All mutations through server actions or route handlers.
- Case answer keys, data-ledger values, `*_key` fields, `math_steps.answer`, and `rubric_anchors` are SERVER-ONLY. They must never reach the client bundle.
- Case content is human-authored JSON in `/cases`, validated against a zod schema on load — reject malformed cases at boot.
- Deterministic checks (math tolerance, data-leak audit) are computed in code, never delegated to the LLM where ground truth exists.

## Supabase
- Client-side: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key).
- Server-only: `SUPABASE_SECRET_KEY` — never behind `NEXT_PUBLIC_` or any client-exposed var.
- Use the new publishable/secret keys, not legacy anon/service_role JWTs.
- This is a new project — set up new keys from the start.

## Secrets
- Never read `.env.local` or any `.env.*` file with real values.
- Refer to `.env.example` for required environment variables.
- If you need an env var's value, ask me.

## Definition of done
- The project's typecheck, tests, and lint all pass (see Commands).
- Plus the feature-level acceptance criteria in PRD §14 — including the structural one: the entire text product (build steps 1–6) passes its gates with no voice library in the orchestrator/agent/scoring dependency graph.
