# Plan owns decisions, the model phrases, Settle only vetoes — design

Date: 2026-10-06 · Status: approved in conversation ("do all 3"), written for the record · Builds on: `2026-10-05-streaming-turn-design.md` (branch `streaming-turn`)

## 1. Why

Batch 9 (5 Oct, streaming runner) read by hand: every user-visible defect
except one came from the same structure — **two authors for one decision**.
The model decides release / refuse / defer, the exhibit, the phase, the end;
then ~6 code repairs re-decide after the fact and splice scripted lines into
text they did not write. Quotes (all batch 9):

- Collisions: Derek t12 "That's not in the information I have. I do have
  revenue figures for the chain, if you want them. … Total revenue is $480M a
  year. That's not in the information I have."; Nikhil t2/t4 "I'll come to
  that data shortly. That isn't something I have data on."; Destiny t18 "…a
  share of COGS. You asked about that — Raw coffee bean costs are up 40%…
  How many points of revenue does it represent?"; Jasmine t6 a deferral after
  the question.
- Unrequested releases: Lena t8 (store count + 3 more), Hugo t4, Tobias t12.
- Release narration: Devon t14 "Average revenue per store is available, so
  I'll give you that."
- The cap bug (Lena t7) — four extra reveals.
- No question left: Tobias t12 (a probe stripped as narration because it said
  "ledger" — a word the prompt plants by forbidding it).
- Check-in duplicated (Maya t16) — two templates both saying "the question on
  the table".

Each batch so far added a repair; the runner grew to 1,200 lines.

## 2. Principle

**Plan decides, the model phrases, Settle only vetoes.**
- Plan (code, before the model writes) owns every decision computable from
  state: data release / defer / refuse / offer, exhibits, ending, the
  recommendation ask, time lines, phase, stall rung 1, the history the model
  sees.
- The model owns the interviewing: probes, pushback, judgment of the
  candidate's reasoning, phrasing — and two declarations code acts on: what
  the candidate asked for (with now-or-later per item) and what its own
  question does (`move`).
- Settle checks the model's words and may withhold a sentence; it never
  inserts or replaces text, except the fixed fallback when the question is
  withheld.

## 3. Decisions

- **D1 Requests are declared by the interviewer model, not a pre-call
  classifier.** Measured 5 Oct (`scripts/eval-data-requests.ts`, 73
  hand-labelled turns): Haiku 4.5 65/73, median 818ms, p90 1975ms; Sonnet 5.5
  61/61 where parsed. A serial classifier would add ~0.8s median / 2s p90 per
  turn — more than streaming saved. The interviewer (Sonnet) already reads the
  message; its declaration is the first field of its JSON, so code decides
  before the spoken text streams. Haiku keeps running in parallel as a
  log-only audit (check `request_audit`).
- **D2 Now-or-later stays the model's call; availability is code's.** The
  model marks each requested item `release` or `defer`. Code releases only
  items that are in the case, not yet released, and explicitly requested this
  turn or open from an earlier turn (or the one rung-3 rescue item). A
  stage-only rule was rejected: `releaseWhen` is a pacing hint the model never
  obeyed (the COGS split is tagged EXHIBIT and asked for in ANALYSIS).
- **D3 Code writes every data line**: the approved value, "I'll come back to
  {what} shortly.", "I don't have {what}.", "I can share {what} if you'd
  like." — `what` is the model's description of the request, so refusals name
  the thing.
- **D4 `move` replaces `advance_phase` and the stage regexes.** The model
  declares what its question does; code derives phase and stage
  administration from the declared moves plus its own decisions. Phase stays
  forward-only. Legacy sessions (no recorded moves) fall back to the regexes.
- **D5 Close, grace ask, time warning and the coverage-complete
  recommendation ask are Plan turn kinds.** Close / grace / time warning need
  no model call (scripted, with data requests in that message answered first
  via the existing synchronous Haiku classification, as today on ask turns);
  the coverage-complete ask lets the model write its lead-in and code supplies
  the question.
- **D6 Stall rung 1 is scripted** from the stored last question; the
  silence check-in reads the same stored question.
- **D7 The model no longer sees silence check-ins / pause lines** in its
  history (they are scripted; the model copied them).
- **D8 Prompt vocabulary purge**: no "ledger", "flags", "system" in
  model-visible text; the rule is described without naming the words.

## 4. The model's output

One JSON object, fields in this order (the order the stream decides in):

```json
{
  "move": "clarify | structure | pressure_test | analysis | exhibit | brainstorm | risk | recommendation | other",
  "requests": [{ "what": "…", "item_ids": ["…"], "explicit": true, "respond": "release | defer" }],
  "exhibit": "exhibit-a | null",
  "rescue_item": "<item id> | null",
  "say": "spoken before any data",
  "question": "the one question that ends the turn"
}
```

- `requests`: the candidate's data requests in their latest message, plus any
  OPEN request (earlier turn) the model is releasing now. `item_ids` from the
  catalog (data items and exhibits); `[]` when the case doesn't have it.
- `exhibit`: an exhibit the model is handing over this turn (code shows it and
  speaks a scripted handover).
- `rescue_item`: honoured only on a stall rung-3 turn.
- `say` must not announce, describe or decline data — code does that between
  `say` and `question`.

## 5. Turn assembly

`say` (gated per sentence, streamed) → data lines (code) → exhibit handover
(code) → `question` (gated, held to the end). Data lines, in order: releases
(earlier-turn releases first, "Earlier you asked about {what} — " lead-in),
refusals, deferrals, offers. At most 3 releases a turn; the rest are deferred
out loud.

## 6. Turn kinds (Plan)

| Kind | When | Model call | Text |
|---|---|---|---|
| scripted (existing) | conduct, distress, inactive | no | as today |
| close | `timeUp` and no grace ask due; or end allowed and either the recommendation is in and the risk probe has been asked, or the recommendation is unresolved after 2 asks | no | open requests released + final-message requests answered, then a close script |
| grace_ask | `shouldGraceAsk` | no | requests answered, open requests released, grace ask |
| time_warning | warning due, no recommendation yet | no | requests answered, open requests released, warning ask |
| rung1 | stall rung 1 and a stored question | no | "Take your time. The question on the table is {q}" |
| rec_ask | coverage complete, recommendation never asked | yes | model `say` + its declared requests; question = recommendation-ask script |
| model | otherwise | yes | §5 |

No-model kinds use the synchronous Haiku classification for the message's
requests (today's ask-turn behaviour). The Stream stage is used only for model
kinds; no-model kinds deliver one segment.

## 7. Phase and stages

- Phase at turn start = max(stored phase, CLARIFY after the first candidate
  turn). After the turn: raised by this turn's `move` (clarify→CLARIFY,
  structure / pressure_test→STRUCTURE, analysis→ANALYSIS, exhibit→EXHIBIT,
  brainstorm→BRAINSTORM, recommendation / risk→RECOMMENDATION), by releases
  (`releaseWhen`), by an exhibit shown (EXHIBIT), by a recommendation ask
  (RECOMMENDATION); close → SCORING. Never backwards, never past
  RECOMMENDATION except by close.
- Stages (`brainstormAsked`, `riskAsked`, `recommendationAsked`, count) come
  from recorded moves and code asks (`flags.moves`); regex fallback only for
  interviewer turns with no recorded move.

## 8. What Settle keeps (vetoes)

On `say` and `question` sentences: fabricated turn, meta-leak / narration,
system language, copied check-in, number provenance, probe on a verified
figure, assumption challenge on requested data, synthesis supply
(RECOMMENDATION / WRAP), close cue (ending is Plan's), a data handoff
("here's the …") — each withholds the sentence. A withheld question becomes
"Go on." Then: blank-turn guard, style audit (log), timeframe check (log),
rung 2/3 delivery + hint check, phase / stage bookkeeping, one commit.

Deleted: same-turn resolution, stale release, accepted offer, data and
exhibit promise recovery, wordless exhibit / reveal lines, forced-release
composition inside model turns, spoken-close replacement, the grace-ask /
time-warning / close rewrites of model text, INTRO auto-advance and post-turn
phase repair (folded into §7), `normalizeActions` and the action cap.

## 9. Logging and scoring

Plan writes the turn's `data_request` rows itself (subtype = the decision:
release / refuse / defer; offers as defer with `explicit:false`) plus the
`classified` marker, so the background re-classification pass is skipped
(`dataRequestsClassified: true`). Scoring reads the same row shapes.

## 10. Verification

Unit tests for the decision table, the turn assembler, the field-stream
parser, phase/stage derivation, each turn kind; all existing guard tests that
still apply; replay corpus; hallucination harness (Task 6 gate); then **one**
persona run (user's call on more).

## 11. PRD / behaviour-doc updates to flag (not edited)

Rule 11 (release / refuse / defer now decided in code from the model's
declaration), Rule 8 (phase derived from declared moves), Rule 12 (ending is
code's), Rule 13 rung 1 scripted, the action set (`reveal_data`,
`show_exhibit`, `advance_phase`, `end_case` removed), FR-4 unchanged (the
model still never sees unrevealed values; code renders releases).
