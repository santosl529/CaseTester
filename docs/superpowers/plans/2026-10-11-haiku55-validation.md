# Haiku 5.5 targeted validation of the round-3 fixes (plan, 11 Oct 2026)

Status: **done and closed (12 Oct).** Waves 1, 2, 3+5 and the math reruns ran
(24 runs + smoke, $8.58 of $15); the stages rerun wave was skipped. Batch 19
is now frozen (`FROZEN_BATCHES`). Its outside review led to the batch-19
review fixes (steps 0–4, `.superpowers/sdd/progress.md`) and to batch 20
(`2026-10-12-batch-20-head-to-head.md`).

## Why

Batch 18 (10 Oct, 62 personas) ran on Sonnet 5.5 by mistake. It is the frozen
Sonnet baseline. The round-3 fixes (branch `round-3-fixes`, behaviour spec
v4.10) are untested against a real model. This set checks that the fixes hold
on the pilot interviewer, Haiku 5.5, on the personas that exposed each fault.

## Decision: mostly unscored

Scoring is ~$0.43 of a ~$0.70 scored run and runs on Opus whatever the
interviewer is, so Haiku runs say little new about scoring. Most fixes change
what the interviewer says, which the transcripts show. So:
- every run unscored (`--no-score`), **except 4** where the fix lives in the
  report: Cole (partial report, no overall), Sam (finished case keeps its
  report), Owen (a confirmed interviewer error protects his concession),
  Spencer (a stage that never happened is "not assessed");
- an unscored run that looks interesting can be scored later:
  `live-run --finish=<sessionId>`.

## Prerequisite (code, before wave 1)

`persona-batch.ts` doesn't pass `--no-score` to its runs (`lib/eval/wave-commands.ts`
`liveRunArgs`). Add a passthrough (persona-batch `--no-score` → each run;
optionally `--score=<ids>` for the four scored personas) with a test. A code
change starts a new batch version — fine, batch 19 is new.

## The set (new batch `batch-19`, `--interviewer=haiku55-thinking-off`, human pace)

| Group | Personas (id) | Runs | Scored |
|---|---|---|---|
| Smoke | default candidate (via `live-run`, no persona) | 1 | no |
| Exit / distress / conduct | Cole (5) ×2, Victor (42) ×2, Sam (32) ×2, Theo (63) ×2, Travis (30) ×2 | 10 | Cole ×1, Sam ×1 |
| Math | Raj (7), Owen (54), Sofia (10), Jasmine (40), Camila (45) — ×2 | 10 | Owen ×1 |
| Stages / data / meta | Spencer (41), Anika (51), Tyler (15), Trevor (46), Destiny (6) — ×2 | 10 | Spencer ×1 |
| Conduct-model labelled check | (Haiku calls on fixed inputs) | — | — |

Travis: one run normal (the placeholder — tests the model backstop), one with
the real listed word swapped in by the harness: run directly with
`live-run --slur=listed` (persona-batch doesn't pass `--slur`).

## Cost

Unscored run ≈ $0.27 (simulator $0.23, background $0.03, interviewer $0.005);
scored ≈ $0.70 (from batch-18 measured components). 27 unscored + 4 scored +
smoke + conduct check ≈ **$10. Hard cap $15** (`LLM_BUDGET_USD` on the shared
batch ledger `batch-19/budget-ledger.jsonl`).

Optional, separate approval: re-grade the ~20 batch-18 interviews hit by bad
challenges or skipped stages with the new scoring (`scripts/regrade.ts`,
same transcripts, old vs new) — ≈ $9, cap $12. The cleanest test of the
scoring changes.

## What to check (read transcripts by hand; classifier counts are not enough)

- Every run's manifest entry: `interviewer.requested = actual = claude-haiku-5-5`.
- Cole: ends on his first explicit stop, no case question, partial report, no
  overall, the stop never mentioned. Victor: offer to stop after the third
  refusal, then ended, no report, no "are you okay?" on goodbyes. Sam: no
  second distress offer after he chose to continue, finished case gets its
  report. Theo: no exit, at most one clarifying question, full case. Travis:
  terminated at once both ways, no report.
- Math: no doubt on correct work (Raj, Owen, Jasmine, Camila); Sofia's real
  unit error still probed; no dangling "one thing to check".
- Stages: exhibit and brainstorm before the end (Spencer, Anika); the close
  line matches the reason; Trevor's meta question answered; Tyler's qualified
  ask declined by name; Destiny's probe bounded, no stall-ladder overlap.
- Latency and cost per run vs batch 18 (Sonnet) — comparison, not a gate.

## Launch commands (each needs a go-ahead; laptop awake — `caffeinate`)

```
npx tsx --env-file=.env.local scripts/persona-batch.ts --batch=batch-19 --interviewer=haiku55-thinking-off --personas=5,42,32,63,30 --cap=15 --no-score   # after the passthrough exists
```
Run each persona group as its own wave (≤10 runs); the second run of a persona
uses `--rerun`. Smoke first.
