# Luna-low screening — hand review (7 Oct 2026)

Same 20 turns, prompt, schema and guards as the Luna-none screening; Sonnet once per turn (fresh), Luna-low (`gpt-6-luna`, reasoning low) twice, interleaved. Luna-none figures are from the earlier run on the same turns (different Sonnet calls).

## Speed — first useful content (median, p90)
| Arm | First useful | vs that run's Sonnet | Faster on | First token |
|---|---|---|---|---|
| Sonnet (this run) | 2.12s (3.95s) | — | — | 1.30s |
| Luna-low | **2.76s (3.78s)** | **+0.76s** | 7/20 | 2.49s |
| Luna-none (earlier run) | 0.92s (1.24s) | −1.08s | 20/20 | 0.61s |
Reasoning adds ~1.9s before the first token (output 249 vs 65 tokens per call, median). Target was ~1.2s: missed.

## The two probes
- **Derek t10 (units, COGS vs revenue base): not fixed.** Neither run probes the base; run 2 accepts it in say ("You're keeping the 25-point figure as your working estimate") and asks him to quantify on it. Sonnet probed it this time ("expressed in points of revenue? Walk me through the conversion").
- **Jasmine t6 (sizing check): not fixed.** Both runs go to the biggest risk; Sonnet asked "Is that the margin problem, or does it include cost that simply grew with revenue?"

## Faults by category (clear faults)
| Category | Sonnet (this run, /20) | Luna-none (/40) | Luna-low (/40) |
|---|---|---|---|
| Rigor probe skipped (Derek units, Jasmine sizing) | 0 | 4 | 4 |
| Request judgment (missed request, premature release, over-deferral) | 1 (Maya t7 re-asks structure, defers earned data) | 5 | 0 |
| Exhibit handed over unasked | 0 | 0 | 4 (Jasmine t8, Claire t8, Hugo t12 ×2) |
| Context (bare "Points of what?", exhibit not on screen, re-ask given structure) | 0 | 3 | 2 (Hugo t8 ×2) |
| Grading in say | 2 (Hugo t12, Maya t27) | 0 | 0 |
| Narration / unsourced figures | 0 | 0 | 0 |
| **Total** | **3** | **12** | **10** |

## Read
Reasoning buys better request judgment (premature release, over-deferral and the missed request are gone) and costs ~1.8s plus a new habit of handing exhibits over unasked. It does not fix the rigor gaps that matter most. Luna-low is slower than Sonnet and not substantially better than Luna-none: no persona evaluation.
