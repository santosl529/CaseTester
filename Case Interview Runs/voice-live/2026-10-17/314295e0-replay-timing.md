# Timing replay — session 314295e0 under the 17 Oct voice rules

Free replay (`npx tsx scripts/voice-replay-timing.ts "Case Interview Runs/voice-live/2026-10-17/314295e0-0170-4a80-9f44-1bdc3788a666.jsonl"`, branch `voice-feel`). Measured: end of turn, when each segment reached the TTS, the TTS first-audio latency, ack clip lengths. Estimated: model/data segment lengths at 15.5 chars/s + 200ms. The model's words are the recorded ones (written with the "already acknowledged" note); on a turn that loses its ack the live model would be prompted without it. All times from the moment the candidate stopped speaking.

```
Calibration (before arm vs measured):
  t2: first data/question 6.64s (measured 6.52s) · say 3.15s (first model audio measured 3.15s)
  t3: first data/question 5.70s (measured 5.54s) · say 1.95s (first model audio measured 1.95s)
  t4: first data/question 1.91s (measured 1.91s)
  t5: first data/question 1.74s (measured 1.74s)
  t6: first data/question 5.64s (measured 5.31s) · say 2.03s (first model audio measured 2.03s)
  t7: first data/question 2.35s (measured 2.35s)
  t8: first data/question 2.38s (measured 2.38s)
  t9: first data/question 3.30s (measured 3.30s)
  t10: first data/question 2.85s (measured 2.80s) · say 1.68s (first model audio measured 1.68s)
  t11: first data/question 3.05s (measured 3.05s)

```
| turn | words | ack before → after | first sound | silence after ack | model say | first words after the ack (say/data/question) | question starts |
|---|---|---|---|---|---|---|---|
| 2 | 144 | Understood, okay. → — (none) | 0.96s → 3.15s | 0.95s → – | “A cost-first view, with revenue as a second branch.” → “A cost-first view, with revenue as a second branch.” | 3.15s → 3.15s | 6.64s → 6.64s |
| 3 | 5 | Mm-hm, sure. → Okay, so… | 0.52s → 0.52s | 0.38s → 0.40s | “MECE means mutually exclusive, collectively exhaustive.” → “MECE means mutually exclusive, collectively exhaustive.” | 1.95s → 1.95s | 5.70s → 5.70s |
| 4 | 41 | Got it, thanks. → — (none) | 0.55s → 1.91s | 0.39s → – | — → — | 1.91s → 1.91s | 5.66s → 5.66s |
| 5 | 15 | Okay, got it. → Mm, okay… | 0.33s → 0.33s | 0.45s → 0.27s | — → — | 1.74s → 1.74s | 8.32s → 8.32s |
| 6 | 46 | Mm-hm, I see. → — (none) | 0.48s → 2.03s | 0.34s → – | “A sixteen-point rise, and a relative increase on top.” → “A sixteen-point rise, and a relative increase on top.” | 2.03s → 2.03s | 8.68s → 8.68s |
| 7 | 22 | Mm-hm, sure. → Mm, so… | 0.20s → 0.20s | 1.08s → 1.02s | — → — | 2.35s → 2.35s | 5.58s → 5.58s |
| 8 | 27 | Okay, let me check. → Okay, let me check. | 0.22s → 0.22s | 1.12s → 1.12s | — → — | 2.38s → 2.38s | 12.00s → 12.00s |
| 9 | 64 | Got it, thanks. → — (none) | 0.26s → 3.30s | 2.08s → – | — → — | 3.30s → 3.30s | 6.21s → 6.21s |
| 10 | 34 | Mm-hm, sure. → Okay, so… | 0.28s → 0.28s | 0.34s → 0.46s | “A volume check.” → dropped | 1.68s → 1.77s | 17.56s → 16.49s |
| 11 | 16 | Got it, thanks. → Mm, okay… | 0.38s → 0.38s | 1.71s → 1.52s | — → — | 3.05s → 3.05s | 3.05s → 3.05s |

Variant (not built): the say rule on every voice turn, ack or not — only turns that differ from "after":
| turn | first sound | model say | question starts |
|---|---|---|---|
| 2 | 3.15s → 3.68s | “A cost-first view, with revenue as a second branch.” → dropped | 6.64s → 3.68s |

Medians (before → after): first sound 0.33s → 0.38s; silence after the ack 0.45s → 0.46s; question starts 6.21s → 6.21s (variant 5.70s).
Acks: 10 → 6; model say lines spoken after an ack: 4 → 1.
  dropped t10: A volume check. [echo_after_ack]
