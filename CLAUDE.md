# Voice AI Mock Case Interview

## What this is
A voice-based AI mock case interview for undergraduates recruiting for management consulting (MBB/tier-1/boutique). An AI interviewer talks, listens, gates case data, pushes back, and produces a rubric-scored feedback report at the end. MVP ships one mode (interviewer-led / McKinsey-style), 8–12 human-authored cases, real-time voice with ≤1.5s turn latency. Current stage: MVP validation build for tens of pilot users (consulting clubs). The differentiator is feedback quality that visibly beats free ChatGPT — "the rubric is the product."

## Stack
- Next.js (App Router) on Vercel; server actions for mutations, route handlers for streaming/voice.
- Supabase (Postgres + Auth, email + club-code gate); RLS on all candidate-owned tables.
- drizzle for typed schema + migrations (or Supabase migrations — flag if you switch).
- Tailwind; minimal mid-case UI (voice is primary, exhibit panel is the only mid-case visual).
- Live interviewer LLM: Claude Sonnet 5.5 (`claude-sonnet-5-5`) since 12 Oct 2026 (after batch 20: Sonnet 20.7 D1–D9 faults per 100 turns vs Haiku 5.5's 32.7), thinking off via `between_tools`, server-side fallbacks on — the `sonnet55-baseline` settings; request settings follow the model via `interviewerRequestOptions`. Behind an `InterviewerModel` interface. Haiku 5.5 (`claude-haiku-5-5`, thinking `disabled` — it rejects `between_tools` — effort `medium`, no fallback — it has none) stays selectable: `INTERVIEWER_PROVIDER=anthropic-haiku55-none-medium`. `npm run voice:agent` follows the default. Evaluations name an explicit config (`INTERVIEWER_EVAL_CONFIG` / `persona-batch --interviewer=`): `sonnet55-baseline` (the default; batch 18, batch 20 arm S), `haiku55-thinking-off` (the 11–12 Oct pilot; batch 19, batch 20 arm H) or `haiku55-effort-low` (batch 20 arm L); the run fails if the API answers from another model. Since 6 Oct the interviewer returns one streamed JSON turn `{say, move, requests, exhibit, rescue_item, question}`: it declares, code decides data, exhibits, phase and ending, and checks only withhold sentences (PRD §5.3). Cerebras gpt-oss-120b and a Haiku opener were tried 7 Oct and not adopted (kept behind switches). (History: Haiku 4.5 → Opus 4.8 in July 2026 after missed live math errors → Sonnet 5.5 in Oct 2026 for speed/cost → Haiku 5.5 on 11 Oct for latency → Sonnet 5.5 on 12 Oct for quality; the deterministic math backstops now carry most of the math-catching load — watch for regressions. With thinking off the model can speak its release reasoning as plain text, which the runner's meta-leak strip removes.)
- Scoring LLM: Claude Opus 5.5 (`claude-opus-5-5`, adaptive thinking, effort `high`), runs at case end — judge, claim-verifier, and dimension-reconciliation passes; plus deterministic evidence-quote, math, answer-key, and strong-rating audits in code.
- Background classifiers, per role in `BACKGROUND_MODEL_ID` (a role moves to 5.5 only after its regression check): Haiku 5.5 — distress (C5), probe_judge (pressure-test answers + structure check), conduct (backstop/tiebreaker, not yet evaluated on real messages); Haiku 4.5 — coverage, data_request, hint_check.
- Model ids live in `lib/models.ts`. Scoring calls and the Sonnet interviewer use server-side refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`, Claude API only); Haiku 5.5 has none.
- The scoring rubric is the 8-dimension consolidated rubric (`docs/Case Interview Feedback Rubric.pdf`), encoded generically in `lib/scoring/rubric.ts`; interviewer behavior rules live in `docs/interviewer-behavior.md`, case-authoring rules in `docs/case-authoring.md`.
- Voice (all behind interfaces in `lib/voice`): Deepgram Flux STT + Cartesia TTS + a code-spoken instant acknowledgment — M0 Phase A done 7 Oct (first sound ~0.95s median; real content ~2.5s). LiveKit Agents (transport/VAD/barge-in) is Phase B, not started.

## The non-negotiable architectural rule
Build the **text case end-to-end before any voice code exists.** The orchestrator talks to the candidate through an abstract `CandidateChannel`; M1 implements it as a text channel, M2 as the voice pipeline. **No voice library may appear in the dependency graph of the orchestrator, agent, or scoring code.** Enforce with a lint boundary rule. Voice is a wrapper, not a prerequisite.

## The core invariant
Zero hallucinated case data (FR-4). The interviewer LLM never receives un-revealed numeric values in its prompt — a number reaches the candidate only in a data line code writes from the ledger, after the model declares the request and code decides to release it (originally a `reveal_data(item_id)` tool call; replaced 6 Oct 2026). A deterministic post-turn audit scans interviewer output for any number not in the revealed set. This is a hard acceptance criterion (0 across a 50-case QA run), not a later hardening pass.

## Commands
[Placeholder — fill in once package.json scripts are decided: dev, build, typecheck, test, lint, db:migrate]

## Project structure
See the PRD §3 for the proposed layout (`/lib/orchestrator`, `/lib/agent`, `/lib/scoring`, `/lib/voice`, `/cases`, `/db`). Refine if needed but flag structural changes.

## Spec
- The approved technical PRD is at `docs/prd-voice-ai-mock-case-technical.md`, with the product PRD (`prd-voice-ai-mock-case.md`, not in the repo) as the source of intent. Treat the technical PRD as the build source of truth.
- Drills are a parallel workstream with their own spec: `docs/prd-drills.md` (build phases D0–D4 in its last section). The technical PRD's §11 exclusion covers the case-interview build only.
- Build against it. Flag gaps or ambiguities to me rather than filling them in unilaterally.
- The technical PRD is a living document, and the place to get the project's full history.
  - Its body describes the build as it is now. After changes that affect scope or behavior, update the affected sections in the same piece of work (new checks, case-format fields, behavior rules, model choices), and say in your report what you changed.
  - A dated history section at the end of the PRD is append-only. It records what changed or was fixed, why (the evidence: batch, run, numbers), what was tried and dropped, and each decision with who made it. progress.md and the commits hold the detail; the history entry links to them.
  - Record a decision as made only once I've made or approved it. Until then, mark it as proposed, awaiting my ruling.
- Follow the build order in PRD §12. Each step must ship and pass its gate before the next.

## Conventions
- Match existing code style.
- Ask before adding dependencies — especially anything that could pull a voice library into the text core.
- All mutations through server actions or route handlers.
- Case answer keys, data-ledger values, `*_key` fields, `math_steps.answer`, and `rubric_anchors` are SERVER-ONLY. They must never reach the client bundle.
- Case content is human-authored JSON in `/cases`, validated against a zod schema on load — reject malformed cases at boot.
- Deterministic checks (math tolerance, data-leak audit) are computed in code, never delegated to the LLM where ground truth exists.
- Never charge twice for one thing. Any action that spends money (LLM calls such as scoring or grading, TTS, STT) must run at most once per request, even on a double click, two tabs or a client retry:
  - Server: guard it in code. A "done already?" check is not enough, because two calls can both pass it while the first is still running. Claim the work atomically first (one conditional UPDATE, or a unique key), and make a second caller wait for the first result or return it. The model is `lib/scoring/scoring-claim.ts`.
  - Client: disable the button while the action runs, and ignore a second click that lands before the disabled state renders (a `useRef` guard).
- Before working on a new task, start with `.superpowers/sdd/progress.md` "## Now" (then its rules, batches table and the latest round). Read the PRD only at §15 and the latest §16 entries unless a task needs more; read the rest of the PRD body, older §16 entries and `.superpowers/sdd/progress-archive.md` only when the task needs them.
- Keep progress.md "## Now" current (≤ 15 lines) and move finished rounds to `progress-archive.md` verbatim, leaving one line each.
- Always update progress.md, and the PRD sections the work touched, after finishing work

## Supabase
- Client-side: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key).
- Server-only: `SUPABASE_SECRET_KEY` — never behind `NEXT_PUBLIC_` or any client-exposed var.
- Use the new publishable/secret keys, not legacy anon/service_role JWTs.
- This is a new project — set up new keys from the start.

## Secrets
- Never read `.env.local` or any `.env.*` file with real values.
- Refer to `.env.example` for required environment variables.
- If you need an env var's value, ask me.
- Commands may load .env.local via --env-file to make API calls. Never print, read, or copy the values themselves.

## Definition of done
- The project's typecheck, tests, and lint all pass (see Commands).
- Plus the feature-level acceptance criteria in PRD §14 — including the structural one: the entire text product (build steps 1–6) passes its gates with no voice library in the orchestrator/agent/scoring dependency graph.
