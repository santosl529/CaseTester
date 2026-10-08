# Pressure-test state and request persistence — spec (7 Oct 2026)

**Why.** Batch 17 (Luna, Nikhil): the pressure test repeated for 14 turns while eight requests a turn went undeclared and the deferred data never came; the smoke run did the opposite (data released in INTRO, no pressure test). Guard A (advisory note + defer→release once a `pressure_test` move was seen) and Guard B (one regeneration when an explicit ask got no declaration) don't guarantee the four properties: requests recorded while the test is pending; gated data held until it is answered; once answered, requests fulfilled and no repeat; no stuck candidate when the model misses twice. This spec replaces Guard A's unlock rule and adds code-controlled fallbacks. Model-agnostic; prompt text unchanged except the existing turn notes. Rule 14 and the stall check are separate work.

## 1. Pressure-test state (persisted, `flags.pressureTest`)
`not_asked → awaiting → satisfied`, plus `askedAt`, `intents`, `reasks`.

- **Asked** (`not_asked → awaiting`): a **delivered** interviewer question contains a pressure-test probe, detected by code from the text (Rule 7 intents: MECE / "what's missing" / overlap; prioritization / "which branch first"; robustness / "what would break"). The model's `move` label is neither required nor sufficient.
- **Satisfied** (`awaiting → satisfied`): the candidate's next message **substantively answers at least one of the probe's intents** — names something missing or overlapping (or argues completeness), picks a branch and gives a reason, or names what would break the structure. Judged by a small Haiku check started in Plan beside the distress check and read before the data line (no added wait in the normal case); mocked in tests.
  - **Not satisfied:** a reply that only acknowledges ("Probably something's missing, yeah"), only asks for data, declines to choose, or changes the subject. The state stays `awaiting`.
  - **Partial answer to a compound probe** ("Is it MECE, and which branch first?") that substantively answers one intent: satisfied — Rule 7 requires one probe answered, not every clause.
  - **Judge failure:** stays `awaiting` (fail closed); the fallback in §4 applies.
- Asking the question, or receiving any later message, never unlocks data by itself.

## 2. The gate (only data that needs the pressure test)
Until `satisfied`, code turns a **release** of a ledger item whose `releaseWhen` is later than CLARIFY into a **deferral** ("I'll come back to …"). Not gated:
- scoping items (`releaseWhen` INTRO/CLARIFY — prof-001: revenue_total, stores_count);
- a stall Level 3 rescue item;
- code's forced releases on recommendation-ask, grace-ask and time-warning turns (existing exceptions);
- refusals and offers (no data leaves).
An exhibit handover is gated like the items it covers.

## 3. Requests persisted without inventing them
- **Model declarations** stay the primary record (`data_request` events with ledger ids).
- **Detector hits** (request-signal.ts, INTRO–EXHIBIT) are logged as `request_signal` events: source turn, cues, the sentence(s) containing each cue. Mapped to ledger ids **only** when an exact resolver match on the sentence is unambiguous; otherwise unresolved. Unresolved hits never authorize a release.
- **Pending** = requested, not yet released or refused (existing `requestedUnanswered`, from declarations and the background classifier), plus unresolved hits for audit.
- **Fulfilment:** while `satisfied`, every turn code releases pending resolved items not yet revealed, this turn's asks first, up to `RELEASE_CAP` minus the model's own releases; the remainder stays pending and is offered again next turn.

## 4. When the model fails twice — bounded code fallbacks
Each fires at most once per turn and never marks the test satisfied.
- **Missed requests twice** (Guard B regenerated and the second attempt still declared nothing): code adds this turn's pending resolved requests to the decisions — released if eligible (§2, §3 cap), deferred if gated — and, for unresolved hits while the test is not satisfied, one line: "I'll come back to the data you've asked for once we've settled your structure."
- **Duplicate pressure test** (state `awaiting` or `satisfied` and the model's question contains a probe): the question is withheld and code writes it —
  - `satisfied`: "What do those figures tell you?" when data went out this turn, else "Where would you like to start the analysis?" (rotating pool);
  - `awaiting`: one code re-ask of the same intent, phrased from the pool, with the deferral named ("Before I share that data — …"); `reasks` +1. After one re-ask the state stays `awaiting` and a further probe is replaced by "What would you look at first?" — data stays gated until the answer or a time-based exception.
- **Pressure test never asked** (state `not_asked`, the gate deferred requested data on the previous turn and again now): code writes the turn's question as a pressure test from the pool; state → `awaiting`.

## 5. Tests first (deterministic, real Plan / Stream / Settle, mocked db and judge)
State transitions (asked by text not label; label-only doesn't ask; acknowledgment-only reply, data-only reply, partial compound answer, judge failure); gate scope (scoping items and rescue pass, ANALYSIS item deferred, exhibit gated); detector false positive (no release, no invented request); fulfilment over the cap (remainder pending, released next turn); each fallback, including no satisfied-by-escape.

## 6. Live check
Saved-prefix replays: a fresh session seeded with the original run's turns, moves, revealed data, request events and `pressureTest` state up to the failure point (Nikhil loop at t5; early release at t1), then the original candidate lines, Luna, several runs. Report the properties per run, first useful content for normal / regenerated / fallback turns, and actual spend.
