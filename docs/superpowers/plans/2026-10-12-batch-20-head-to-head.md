# Batch 20 — Sonnet 5.5 vs Haiku 5.5, head to head (plan, 12 Oct 2026)

Status: **plan only — nothing launched, $0 spent.** Each wave needs its own
explicit go-ahead (one wave at a time, no chaining).

## Why

Batch 19 (Haiku 5.5) was compared with batch 18 v3 (Sonnet 5.5) across
different code: batch 18 predates the round-3 fixes, and both predate the
batch-19 review fixes (steps 2–4: pending-data rewrite, grading veto,
stated-need offers, misquote correction, code-written lines). The question
the pilot needs answered: on the same code and the same personas, does Haiku
5.5 deliver an interview as good as Sonnet 5.5, now that code withholds or
rewrites the faults Haiku was making? And what does it still get wrong that
code doesn't catch (rigor: misquotes outside the grammar, unsupported
premises, pushing to the recommendation)?

## Arms

| Arm | `--interviewer=` | Model | Settings |
|---|---|---|---|
| H | `haiku55-thinking-off` | claude-haiku-5-5 | thinking disabled, effort medium, no fallback |
| S | `sonnet55-baseline` | claude-sonnet-5-5 | thinking off (between_tools), fallbacks on |

Same commit for both (the head of `round-3-fixes` after this plan's tooling
is committed), human pace, **unscored** (`--no-score`; a run can be scored
later with `live-run --finish=<sessionId>`).

## The set

| Persona | id | Why it's in |
|---|---|---|
| Default candidate | — (live-run, no persona) | the ordinary interview |
| Tyler — the Misquoter | 15 | misquotes; the misquote correction |
| Jasmine — the Early Finisher | 40 | pushes to the recommendation; unsupported premise |
| Owen — the Quiet Dropper | 54 | correct math; over-blocked probes; phase-blind fallback |
| Anika — the Unorthodox Structurer | 51 | pending-data wording; grading |
| Sofia — the Unit Confuser | 10 | unit errors probed (must still be caught) |
| Destiny — the Blank Slate | 6 | stall ladder; pending-data wording; offers |
| Raj — the Slow Burner | 7 | close not true; correct math unchallenged |

8 × 2 arms × 2 runs = **32 runs**.

## Batch layout (decision needed)

The manifest freezes one interviewer per batch version, and batch names must
match `batch-N`. Two ways to keep the arms apart:

- **A (recommended, small code change):** allow a suffix — `batch-20-haiku`
  and `batch-20-sonnet` (`assertBatchOpen`'s pattern becomes
  `^batch-\d+(?:-[a-z0-9]+)?$`, with a test). Each arm has its own manifest
  and ledger; the comparison is "batch 20" by name.
- **B (no code):** `batch-20` = Haiku, `batch-21` = Sonnet.

Either way: also freeze `batch-19` (`FROZEN_BATCHES`) so its records can't take
a new wave by accident.

## Tooling to build before wave 1 (free; must be committed first — `scripts/` and `lib/` are in the code freeze, so a change after wave 1 splits the batch)

1. **Blind review sheets** — `scripts/blind-review.ts`: reads the 32 runs (both
   arms), assigns each a random code (`R01`…`R32`, shuffled with a seed
   kept in the key file), and writes one sheet per run
   (`batch-20-blind/R07.md`): per turn the candidate's message and what was
   heard, the check decisions that acted, nothing that names or betrays the
   model — no model ids, no run-record header, no latency or token figures,
   no cost, no folder names (they carry the batch arm). The key
   (`batch-20-blind/KEY.json`, code → arm / persona / run dir) is written
   apart and not opened until grading is done. Plus a grading sheet
   (`batch-20-blind/grading.csv`, one row per run) to fill in.
2. Persona names stay visible (the grader needs to know what each persona
   tests); only the arm is hidden.

## What to grade (blind, by hand — classifier counts are not enough)

**Delivered faults, counted per interviewer turn** (each instance; the rate is
faults ÷ interviewer turns):

| Code | Fault |
|---|---|
| D1 | treats data as still to come after it was read out |
| D2 | grades the candidate's work mid-case |
| D3 | offers or releases data the candidate didn't ask for |
| D4 | lets a misquote of revealed data stand, or adopts an unsupported premise as fact |
| D5 | doubts correct work (no flag), or a premise challenge on correct work |
| D6 | misses a real error (unit, arithmetic, misquote) it should have probed |
| D7 | asks for the recommendation with analysis / exhibit / brainstorm still owed |
| D8 | a code-written line that doesn't fit (phase-wrong fallback, catalog text, deferral beside its exhibit) |
| D9 | an unanswered or wrongly answered data request |
| D10 | style: compound question, too long, narration (counted, not a lockdown target) |

**Serious whole-interview failures** (yes / no per run, with the turn):

- any number the candidate heard that isn't in the revealed set (FR-4 — hard
  fail)
- a misquote or false premise carried into the recommendation uncorrected
- an owed stage (exhibit, brainstorm, recommendation, risk) never happened
  in a run that wasn't ended by the candidate
- a loop: the same question or ask three times or more without progress
- a close that isn't true (case continues, or ends mid-analysis)
- the interviewer contradicts the case data

Also from the records, after grading (not blind — computed): `review-counts.ts`
on both arms (delivered pending / grading / offers / early rec asks), the
withheld counts per veto (`grading`, `pending_data`, `recommendation_held_for_stage`,
`unsupported_challenge`) — how much each arm leans on code — and first-useful /
first-token latency over model turns.

## Cost

From the saved ledgers (unscored part of each run, simulator included):
Sonnet arm median $0.29 / run (p90 $0.44; batch 18, 73 runs), Haiku arm
median $0.31 / run (p90 $0.39; batch 19, 26 runs). The simulator (Opus 5)
is ~$0.22 of each; the Sonnet interviewer adds ~$0.08; Haiku's interviewer
is negligible.

| Size | Runs | Estimate | Cap |
|---|---|---|---|
| Two runs each (planned) | 32 | **≈ $10** (≈ $14 at p90) | **$15** — $7.50 per arm ledger |
| One run each | 16 | ≈ $5 | $8 — $4 per arm |

Matches your rough guess ($10 / $5).

## Waves (each its own go-ahead; laptop awake — `caffeinate -i`)

Interleaved so time-of-day or API drift doesn't fall on one arm:

1. **Wave 1 — Haiku run 1:** 7 personas + the default candidate (8 concurrent).
2. **Wave 2 — Sonnet run 1:** same.
3. **Wave 3 — Haiku run 2** (`--rerun`).
4. **Wave 4 — Sonnet run 2** (`--rerun`).

With layout A (`batch-20-haiku` / `batch-20-sonnet`):

```
# wave 1 — Haiku, run 1
caffeinate -i npx tsx --env-file=.env.local scripts/persona-batch.ts --batch=batch-20-haiku --interviewer=haiku55-thinking-off --personas=15,40,54,51,10,6,7 --cap=7.5 --no-score
mkdir -p "Case Interview Runs/test runs/batch-20-haiku"
INTERVIEWER_EVAL_CONFIG=haiku55-thinking-off LLM_BUDGET_USD=7.5 LLM_BUDGET_FILE="$PWD/Case Interview Runs/test runs/batch-20-haiku/budget-ledger.jsonl" \
  caffeinate -i npx tsx --env-file=.env.local scripts/live-run.ts --pace=human --no-score

# wave 2 — Sonnet, run 1
caffeinate -i npx tsx --env-file=.env.local scripts/persona-batch.ts --batch=batch-20-sonnet --interviewer=sonnet55-baseline --personas=15,40,54,51,10,6,7 --cap=7.5 --no-score
mkdir -p "Case Interview Runs/test runs/batch-20-sonnet"
INTERVIEWER_EVAL_CONFIG=sonnet55-baseline LLM_BUDGET_USD=7.5 LLM_BUDGET_FILE="$PWD/Case Interview Runs/test runs/batch-20-sonnet/budget-ledger.jsonl" \
  caffeinate -i npx tsx --env-file=.env.local scripts/live-run.ts --pace=human --no-score

# waves 3 and 4 — the same commands with --rerun on persona-batch, and the default-candidate live-run again
```

(The default-candidate live-run writes to `Case Interview Runs/default-candidate/`;
the blind-review script picks those four runs up by session id from the
wave's start time. Run it in a second terminal alongside the wave — 8
concurrent, under the 10 that works.)

Before wave 1: `--dry` on both persona-batch commands (no spend) to check
the plan, the model config and the cap.

## After the waves

1. Run `scripts/blind-review.ts`; grade the 32 sheets blind into `grading.csv`.
2. Unblind with `KEY.json`; compute per-arm fault rates per turn, serious
   failures per run, and the computed counts and latency above.
3. Decision input: keep Haiku 5.5, return to Sonnet 5.5, or keep Haiku with
   further code backstops for what it still misses.

## Optional, after this — Haiku first token (~1.1s live)

`replay-output-format.ts`'s `model-ab` arm with an effort override (Haiku
effort low vs medium) on 50 saved turns, warm + measured per arm: ~200 Haiku
calls ≈ **$0.15–0.30**. Needs a small script change (an effort field on the
A/B arm) — build it before batch-20 wave 1 (code freeze) or after the batch
is complete.
