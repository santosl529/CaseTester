# Model screening — hand review (7 Oct 2026)

Screening, not a benchmark: 20 stage-stratified saved turns (batches 7–8), Sonnet 5.5 once per turn, each challenger twice, interleaved; today's full prompt, turn schema and guards. Timings are from turn start (no STT/TTS). Quality judged by hand against the candidate's message and the logged (historical) Sonnet reply. Counts are clear faults; borderline calls noted.

## Speed (first useful content: data line on data turns, else whole turn)
| Arm | First useful, median (p90) | vs fresh Sonnet, median paired diff | Faster on |
|---|---|---|---|
| Sonnet 5.5 (fresh, 1 run) | 2.07s (3.63s) | — | — |
| Luna-none (`gpt-6-luna`, mean of 2) | **0.92s (1.24s)** | **−1.08s** | 20/20 |
| Sol-none (`gpt-6-sol`, mean of 2) | 1.49s (2.24s) | −0.44s | 17/20 |
| Gemini-low (`gemini-3.8-flash`, mean of 2) | 2.23s (4.27s) | +0.26s | 7/20 |

## Quality faults (hand-judged)
**Sonnet (20 outputs): ~4** — grading in say (Hugo t12 "Your reconciliation holds."; Maya t27 "You're right … That's the key."); re-asked for the structure instead of answering an earned revenue question (Maya t7); only half held Derek's units error (t10: "set them aside" rather than the revenue base).

**Luna-none (40 outputs): ~11**
- Rigor skipped: Derek t10 both runs moved on from the COGS-vs-revenue base error; Jasmine t6 both runs jumped to brainstorm/risk instead of the sizing check ("Is that the margin problem…?") that Sonnet asked.
- Requests: Devon t4 run 2 declared no request where the candidate asked for the cost breakdown (missed request); Maya t5 both runs released scoping data before the pressure test was answered (premature-request rule; borderline — scoping answers are common in real interviews); Hugo t6 both runs deferred an earned cost breakdown and re-challenged an earlier labor guess (over-deferral).
- Context: Hugo t8 run 1 a bare "Points of what?" with nothing this turn to refer to (Gemini did the same); Hugo t12 run 2 asked about "the exhibit" that isn't on screen; Maya t3 run 2 asked for a structure the candidate had just given.
- Clean on demeanor: no grading, no narration, no unsourced figures.

**Sol-none (40 outputs): ~10**
- Released the cost breakdown unasked before the pressure test (Destiny t14, both runs).
- Rigor skipped: Derek t10 both runs; Jasmine t6 both runs (went to risk).
- Say problems: "The store count is unchanged." (a data fact in say, Maya t7); "No need to apologize." with nothing to apologize for (Maya t27, both runs); leading questions on Maya t27 that walk her to the answer.
- Good: Hugo t8 asked for the unit and the derivation of the 38% — the best probe of any arm on that turn.

**Gemini-low (40 outputs): ~11 and slower** — exhibit handed over unasked (Devon t4, Destiny t14, Hugo t6 ×2), released cost data before the pressure test (Destiny t14 ×2), Derek t10 both runs moved on, bare "Points of what?" (Hugo t8 ×2), stated the answer for the candidate (Maya t27 run 1: "that is an increase of 16 percentage points of revenue").

## Read
- Luna-none is the only arm fast enough to change the voice experience (useful content ~1.1s sooner on every turn) at ~1/20 of Sonnet's price. Its faults are judgment and rigor (skipped probes, request edge cases), not data leaks or demeanor — the kind reasoning might fix. Next per the screening rule: Luna-low on the same turns.
- Sol-none is faster on most turns but has the same rigor gaps plus say problems; less promising than Luna.
- Gemini-low is not faster with today's schema and has the most data-handling faults; drop.
- Limits: 20 single turns, one reviewer, no multi-turn effects (repetition, loops), no live audio.
