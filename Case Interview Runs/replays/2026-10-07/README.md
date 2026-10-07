# Interviewer replays — 6–7 Oct 2026

Single recorded turns regenerated through the production model path
(`scripts/replay-output-format.ts`). Each folder holds `out.txt` (log with every
raw model response and the timing summary) and `replay-results-prod.json`
(per-turn timing, tokens, and the parsed turn); `replay-samples.json`, where
present, holds each turn's input (candidate message, released data) and the
interviewer reply logged in the original run.

| Folder | Model | Prompt / code | Turns |
|---|---|---|---|
| `baseline`, `baseline-nikhil` | Sonnet 5.5 | v4.7, declarations before `say` | 50 (batches 7–8) / 11 (Nikhil, batch 10) |
| `after`, `after-nikhil` | Sonnet 5.5 | prompt pass + `say` first | 50 / 11 |
| `after2`, `after2-nikhil` | Sonnet 5.5 | + `say` as a short acknowledgment | 50 / 11 |
| `cerebras`, `cerebras-nikhil` | Cerebras gpt-oss-120b, reasoning low | current | 50 / 11 (one 429 each) |
| `cerebras-medium`, `cerebras-high` | gpt-oss-120b, reasoning medium / high | current | first 20 of the 50 |

Hand reviews: `cerebras-low-hand-review.txt` (all low-reasoning turns with the
candidate message and Sonnet's logged reply) and
`cerebras-low-medium-high-side-by-side.txt` (the same 20 turns at each
setting). Findings: `.superpowers/sdd/progress.md` (7 Oct entries).

| `haiku-opener`, `haiku-opener-nikhil` | Haiku 4.5 writes the opening sentence (no case data in its prompt) in parallel with Sonnet 5.5, which is told to leave `say` empty | current + `REPLAY_ARM=haiku-opener` | 50 / 11 |

Hand review of every opener with the candidate message and Sonnet's turn: `haiku-opener-hand-review.txt`.
| `haiku-opener2`, `haiku-opener2-nikhil` | Opener v2: names only the kind of move, no figures (code gate), Sonnet's say dropped by code, Sonnet told not to restate | current + `REPLAY_ARM=haiku-opener` | 50 / 11 |

Hand review of v2: `haiku-opener2-hand-review.txt`.
