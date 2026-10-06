# Plan Owns Decisions — Implementation Plan

> **For agentic workers:** executed natively in this session (superpowers:executing-plans), one commit per task.

**Goal:** Move every decision computable from state into Plan, reduce the model to declarations + words, and reduce Settle to vetoes (spec `docs/superpowers/specs/2026-10-06-plan-owns-decisions-design.md`).

**Architecture:** New model output `{move, requests, exhibit, rescue_item, say, question}`; Plan gains turn kinds and a data-decision table; Stream gates `say`/`question` and inserts code-rendered data lines between them; Settle keeps vetoes and bookkeeping only.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk` structured outputs (streamed), vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-plan-owns-decisions-design.md`

## Global Constraints

- Branch `plan-owns-decisions` (on `streaming-turn`), worktree `.claude/worktrees/streaming-turn`.
- FR-4: the model never sees unrevealed values; data lines come only from ledger values rendered by code.
- No voice library; `TurnResult`, the route and the client unchanged.
- One commit per task, tests passing; then the verification gate: unit + replay corpus + hallucination harness + ONE persona run.

## Review Focus

- A model declaring an item as explicitly requested that the candidate never asked for → still released (bounded: only items in the case, max 3; the Haiku audit logs the disagreement) — test that non-catalog ids and already-released ids are never released.
- A turn with requests but an empty `say` → data lines then question, no dangling lead-in — assembler test.
- A withheld question → "Go on." and the stored last question unchanged — test.
- Legacy sessions (no `flags.moves`) mid-case after deploy → stages fall back to regexes — test.
- Close turn when the final message asks for data → answered before the goodbye — test.

## Tasks

1. **Turn schema + field-stream parser.** `lib/agent/models/turn-schema.ts` (schema, `MOVES`, `parseTurn`, `validateTurn` against catalog/exhibits); `json-action-stream.ts` → `TurnStreamParser` emitting `field` events (move, requests, exhibit, rescue_item complete) and `sentence` events for `say`, `question` as a field. Tests: chunking, field order, escapes, cut-off.
2. **Model layer.** `streamTurn` yields `{type:'field'}`, `{type:'sentence'}`, `{type:'done', turn}`; regeneration (unparseable / empty question) only before delivery; `runTurn` returns the parsed turn. `InterviewerModel` returns `ModelTurn`. Tests: stubbed stream.
3. **Prompt rewrite.** `system.ts`: response format for the new fields; DATA AND EXHIBITS rewritten (declare, don't release); FLOW/ENDING without `advance_phase`/`end_case`; moves described; vocabulary purge (D8); turn-kind notes (rec_ask: "write only the lead-in"). Tests: prompt snapshot assertions (no "ledger", no tool names).
4. **Data decisions + rendering (pure).** `lib/orchestrator/data-decisions.ts`: `decideData({requests, rescueItem, rung3, ledger, exhibits, shown, open, cap})` → `{releases, refusals, defers, offers, exhibit}`; `renderDataLines(decisions)`; rows for logging. Tests: the decision table, bounds, naming, ordering.
5. **Phase & stages from moves (pure).** `lib/orchestrator/progress.ts`: `derivePhase(current, {move, releasedReleaseWhen, exhibitShown, recAsk, close})`, `stagesFromMoves(moves, legacyTexts, recReceived)`. Tests.
6. **Plan turn kinds.** `plan-turn.ts`: `kind` close / grace_ask / time_warning / rung1 / rec_ask / model; no-model kinds build their text (sync Haiku for requests, open-request releases first); history excludes check-ins; `flags.lastQuestion`, `flags.moves`. Tests with the reads fixture.
7. **Stream + Settle rewrite.** Stream: fields → decisions at `requests` close; `say` sentences gated (veto set §8); data segment after `say`; question held, gated. Settle: compose (vetoed `say` + data + vetoed question), bookkeeping (§7, §9), commit; delete the repair blocks. Runner wiring. Tests: equivalence-style (delivered + tail = final), vetoes, kinds end to end with the fixture.
8. **Cleanup.** Remove dead code and its tests (`json-actions.ts` action list, `normalizeActions`, `actionsFromContent`, same-turn/stale/offer helpers, promise recovery wiring, spoken-close replacement, phase repair wiring); keep pure helpers the corpus test still pins; replay script trimmed to compile.
9. **Verification gate.** typecheck, lint, tests, build; hallucination harness (needs API, ~$0.20); one persona run (~$1); report, stop for the user.
