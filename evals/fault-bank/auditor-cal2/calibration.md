# Offline auditor — calibration (auditor-cal2)

Opus 5.5 (`claude-opus-5-5`, adaptive thinking, effort high) over 25 of 25 runs; spent $3.58. Hand grade = the fault bank's fault records for each run (report faults aside: the auditor reads the interview only). A prediction matches a hand fault within 2 turns (or inside its scope window): by class first, then by class family. Recall = matched hand faults ÷ hand faults; precision = matched predictions ÷ predictions. A prediction with no hand match may still be a real fault the hand grade didn't count.

**Detection (any class):** recall 85% (96/113), precision 54% (96/177). **Severity agreement on matches:** 65% (62/96).

## By family

| family | hand | predicted | recall | precision |
|---|---:|---:|---:|---:|
| asks | 63 | 80 | 87% (55/63) | 69% (55/80) |
| flow | 12 | 30 | 100% (12/12) | 40% (12/30) |
| math | 24 | 45 | 92% (22/24) | 49% (22/45) |
| other | 14 | 22 | 50% (7/14) | 32% (7/22) |

## By class (class-level matches only)

| class | family | hand | predicted | recall | precision |
|---|---|---:|---:|---:|---:|
| ack_repetition | flow | 0 | 2 | — | 0% (0/2) |
| bare_partial | asks | 25 | 17 | 48% (12/25) | 71% (12/17) |
| close_wait_reask | flow | 8 | 18 | 100% (8/8) | 44% (8/18) |
| false_correction | math | 1 | 8 | 100% (1/1) | 13% (1/8) |
| false_refusal | asks | 10 | 7 | 70% (7/10) | 100% (7/7) |
| hollow_deferral | asks | 1 | 1 | 100% (1/1) | 100% (1/1) |
| ignored_ask | asks | 7 | 18 | 71% (5/7) | 28% (5/18) |
| misquote_uncorrected | math | 6 | 9 | 67% (4/6) | 44% (4/9) |
| missed_error | math | 3 | 9 | 33% (1/3) | 11% (1/9) |
| other | other | 14 | 22 | 50% (7/14) | 32% (7/22) |
| probe_chain | math | 4 | 6 | 75% (3/4) | 50% (3/6) |
| rec_reask | flow | 4 | 8 | 100% (4/4) | 50% (4/8) |
| repeated_probe | math | 1 | 0 | 0% (0/1) | — |
| restatement | asks | 12 | 16 | 100% (12/12) | 75% (12/16) |
| stage_missed | flow | 0 | 2 | — | 0% (0/2) |
| stale_correction | math | 2 | 2 | 100% (2/2) | 100% (2/2) |
| stale_probe | math | 5 | 9 | 100% (5/5) | 56% (5/9) |
| unasked_offer | asks | 4 | 4 | 100% (4/4) | 100% (4/4) |
| unasked_release | asks | 2 | 6 | 50% (1/2) | 17% (1/6) |
| wrong_figure | math | 2 | 2 | 100% (2/2) | 100% (2/2) |
| wrong_release | asks | 2 | 11 | 100% (2/2) | 18% (2/11) |

## Per run

| run | hand | predicted | in tokens | out tokens | $ |
|---|---:|---:|---:|---:|---:|
| b36a-07-3fdb20e8 | 5 | 8 | 17540 | 2680 | 0.124 |
| b36a-24-c518221e | 6 | 8 | 16171 | 4115 | 0.147 |
| b36a-40-6bbc2163 | 3 | 4 | 14271 | 2820 | 0.113 |
| b36a-57-6f57da6e | 3 | 4 | 17114 | 3136 | 0.131 |
| b36a-64-34eb553a | 3 | 2 | 15292 | 1977 | 0.101 |
| b36l-07-ef7bed14 | 3 | 5 | 17606 | 3110 | 0.133 |
| b36l-24-a7d9f44e | 4 | 7 | 17911 | 2776 | 0.127 |
| b36l-40-bbf78ab8 | 3 | 5 | 15045 | 3002 | 0.120 |
| b36l-57-5907649a | 4 | 10 | 19364 | 6408 | 0.206 |
| b36l-64-4e91d638 | 7 | 9 | 17550 | 3764 | 0.145 |
| b37h-07-11414946 | 3 | 10 | 16480 | 4157 | 0.149 |
| b37h-24-ddbb070b | 5 | 4 | 15803 | 1424 | 0.092 |
| b37h-40-527217df | 2 | 3 | 12075 | 1543 | 0.079 |
| b37h-57-7f6c40ea | 6 | 7 | 19095 | 3779 | 0.152 |
| b37h-64-442e37ff | 6 | 10 | 15485 | 2896 | 0.120 |
| b37q-07-e08c362a | 7 | 8 | 19244 | 5186 | 0.181 |
| b37q-24-eb8d7576 | 6 | 10 | 18604 | 6380 | 0.202 |
| b37q-40-3376e5fe | 4 | 9 | 14735 | 3860 | 0.136 |
| b37q-57-084e7508 | 5 | 7 | 19163 | 4743 | 0.172 |
| b37q-64-a2a5921b | 5 | 6 | 18734 | 4401 | 0.163 |
| b38l-07-701443f7 | 2 | 8 | 16381 | 3265 | 0.131 |
| b38l-24-316baba1 | 3 | 4 | 18303 | 3480 | 0.143 |
| b38l-40-3f928012 | 2 | 4 | 14992 | 2584 | 0.112 |
| b38l-57-f80d981c | 5 | 9 | 19371 | 5475 | 0.187 |
| b38l-64-cee7d399 | 11 | 16 | 21055 | 6652 | 0.217 |
