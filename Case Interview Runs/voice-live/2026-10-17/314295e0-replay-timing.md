# Timing replay — session 314295e0 under the 17 Oct voice rules (v2)

Free replay (`npx tsx scripts/voice-replay-timing.ts "Case Interview Runs/voice-live/2026-10-17/314295e0-0170-4a80-9f44-1bdc3788a666.jsonl"`, branch `voice-feel`). v2 = Lorenzo's ruling of 17 Oct: thinking-sound fillers on every turn — two beats after 40+ words, one otherwise; data asks also "Let me see…" (beats joined: 400ms between, 300ms after), a "So," connector before the reply's first segment ~75% of filler turns, the say rule on every voice turn, and (17 Oct, after session 9ccf0836) the filler starting 500ms after end of turn. Measured: end of turn, when each segment reached the TTS, the TTS first-audio latency, ack clip lengths. Estimated: model/data segment lengths at 15.5 chars/s + 200ms. The model's words are the recorded ones. All times from the moment the candidate stopped speaking; "silence after ack" counts, after v2, from the end of the filler's 300ms tail. v1 (trailing fillers, no ack after 40+ words) was replaced by this ruling; its replay is in git history (bba1104).

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
| 2 | 144 | Understood, okay. → Mhm… okay… | 0.96s → 1.45s | 0.95s → 0.67s | “A cost-first view, with revenue as a second branch.” → dropped | 3.15s → 3.68s | 6.64s → 3.68s |
| 3 | 5 | Mm-hm, sure. → Alright… | 0.52s → 1.01s | 0.38s → 0.16s | “MECE means mutually exclusive, collectively exhaustive.” → “So, MECE means mutually exclusive, collectively exhaustive.” | 1.95s → 1.95s | 5.70s → 5.96s |
| 4 | 41 | Got it, thanks. → Hmm… okay… | 0.55s → 1.05s | 0.39s → 0.00s | — → — | 1.91s → 2.61s | 5.66s → 6.36s |
| 5 | 15 | Okay, got it. → Mhm… | 0.33s → 0.83s | 0.45s → 0.23s | — → — | 1.74s → 1.74s | 8.32s → 8.58s |
| 6 | 46 | Mm-hm, I see. → Mhm… okay… | 0.48s → 0.98s | 0.34s → 0.00s | “A sixteen-point rise, and a relative increase on top.” → “So, A sixteen-point rise, and a relative increase on top.” | 2.03s → 2.54s | 8.68s → 9.46s |
| 7 | 22 | Mm-hm, sure. → Alright… | 0.20s → 0.70s | 1.08s → 0.87s | — → — | 2.35s → 2.35s | 5.58s → 5.58s |
| 8 | 27 | Okay, let me check. → Let me see… | 0.22s → 0.72s | 1.12s → 0.66s | — → — | 2.38s → 2.38s | 12.00s → 12.26s |
| 9 | 64 | Got it, thanks. → Hmm… alright… | 0.26s → 0.76s | 2.08s → 0.98s | — → — | 3.30s → 3.30s | 6.21s → 6.46s |
| 10 | 34 | Mm-hm, sure. → Alright… | 0.28s → 0.77s | 0.34s → 0.22s | “A volume check.” → dropped | 1.68s → 1.77s | 17.56s → 16.49s |
| 11 | 16 | Got it, thanks. → Hmm… | 0.38s → 0.88s | 1.71s → 1.49s | — → — | 3.05s → 3.05s | 3.05s → 3.05s |

Medians (before → after): first sound 0.33s → 0.83s; silence after the ack 0.45s → 0.23s; question starts 6.21s → 6.36s. (After: the silence counts from the end of the filler's 300ms tail.)
Connectors: t2 So,, t3 So,, t4 none, t5 So,, t6 So,, t7 none, t8 So,, t9 So,, t10 none, t11 none.
Acks: 10 → 10; model say lines spoken after an ack: 4 → 2.
  dropped t2: A cost-first view, with revenue as a second branch. [echo_after_ack]
  dropped t10: A volume check. [echo_after_ack]
