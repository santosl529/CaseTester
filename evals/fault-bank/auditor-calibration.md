# Offline auditor — calibration (auditor-cal1)

> **Superseded 26 Oct 2026 by cal2** (`evals/fault-bank/auditor-cal2/calibration.md`, $3.58): the exhibit clip, the
> withheld-key fix (809dcc65) and one added bank record changed this measurement. cal2: detection recall 85%
> (96/113), precision 54%; `bare_partial` 48%, `missed_error` 33%. The side-by-side and the reasons are in
> `.superpowers/sdd/2026-10-22-phase1/auditor-recalibration-report.md`. The hand read of the unmatched predictions
> below was not redone and is still the best account of their character.

Opus 5.5 (`claude-opus-5-5`, adaptive thinking, effort high) over 25 of 25 runs; spent $3.62. Hand grade = the fault bank's fault records for each run (report faults aside: the auditor reads the interview only). A prediction matches a hand fault within 2 turns (or inside its scope window): by class first, then by class family. Recall = matched hand faults ÷ hand faults; precision = matched predictions ÷ predictions. A prediction with no hand match may still be a real fault the hand grade didn't count.

**Detection (any class):** recall 86% (96/112), precision 51% (96/187). **Severity agreement on matches:** 65% (62/96).

## By family

| family | hand | predicted | recall | precision |
|---|---:|---:|---:|---:|
| asks | 63 | 85 | 90% (57/63) | 67% (57/85) |
| flow | 12 | 32 | 100% (12/12) | 38% (12/32) |
| math | 23 | 46 | 91% (21/23) | 46% (21/46) |
| other | 14 | 24 | 43% (6/14) | 25% (6/24) |

## By class (class-level matches only)

| class | family | hand | predicted | recall | precision |
|---|---|---:|---:|---:|---:|
| ack_repetition | flow | 0 | 2 | — | 0% (0/2) |
| bare_partial | asks | 25 | 17 | 56% (14/25) | 82% (14/17) |
| close_wait_reask | flow | 8 | 17 | 100% (8/8) | 47% (8/17) |
| false_correction | math | 1 | 8 | 100% (1/1) | 13% (1/8) |
| false_refusal | asks | 10 | 9 | 80% (8/10) | 89% (8/9) |
| hollow_deferral | asks | 1 | 2 | 100% (1/1) | 50% (1/2) |
| ignored_ask | asks | 7 | 18 | 86% (6/7) | 33% (6/18) |
| misquote_uncorrected | math | 6 | 9 | 83% (5/6) | 56% (5/9) |
| missed_error | math | 2 | 8 | 50% (1/2) | 13% (1/8) |
| other | other | 14 | 24 | 43% (6/14) | 25% (6/24) |
| probe_chain | math | 4 | 6 | 100% (4/4) | 67% (4/6) |
| rec_reask | flow | 4 | 9 | 100% (4/4) | 44% (4/9) |
| repeated_probe | math | 1 | 2 | 0% (0/1) | 0% (0/2) |
| restatement | asks | 12 | 16 | 100% (12/12) | 75% (12/16) |
| stage_missed | flow | 0 | 4 | — | 0% (0/4) |
| stale_correction | math | 2 | 2 | 100% (2/2) | 100% (2/2) |
| stale_probe | math | 5 | 8 | 100% (5/5) | 63% (5/8) |
| unasked_offer | asks | 4 | 4 | 100% (4/4) | 100% (4/4) |
| unasked_release | asks | 2 | 7 | 100% (2/2) | 29% (2/7) |
| wrong_figure | math | 2 | 3 | 100% (2/2) | 67% (2/3) |
| wrong_release | asks | 2 | 12 | 100% (2/2) | 17% (2/12) |

## Per run

| run | hand | predicted | in tokens | out tokens | $ |
|---|---:|---:|---:|---:|---:|
| b36a-07-3fdb20e8 | 5 | 7 | 16904 | 2622 | 0.120 |
| b36a-24-c518221e | 6 | 10 | 15482 | 4428 | 0.150 |
| b36a-40-6bbc2163 | 3 | 4 | 13697 | 2967 | 0.114 |
| b36a-57-6f57da6e | 3 | 2 | 16653 | 2341 | 0.113 |
| b36a-64-34eb553a | 3 | 2 | 14696 | 2529 | 0.109 |
| b36l-07-ef7bed14 | 3 | 6 | 16801 | 3094 | 0.129 |
| b36l-24-a7d9f44e | 4 | 5 | 17320 | 3270 | 0.135 |
| b36l-40-bbf78ab8 | 3 | 7 | 14467 | 3755 | 0.133 |
| b36l-57-5907649a | 4 | 10 | 18694 | 5979 | 0.194 |
| b36l-64-4e91d638 | 7 | 7 | 16856 | 3621 | 0.140 |
| b37h-07-11414946 | 3 | 9 | 15630 | 2963 | 0.122 |
| b37h-24-ddbb070b | 5 | 6 | 14863 | 2151 | 0.102 |
| b37h-40-527217df | 2 | 2 | 11322 | 1514 | 0.076 |
| b37h-57-7f6c40ea | 6 | 8 | 18399 | 5102 | 0.176 |
| b37h-64-442e37ff | 6 | 7 | 14870 | 2615 | 0.112 |
| b37q-07-e08c362a | 6 | 10 | 18689 | 6724 | 0.209 |
| b37q-24-eb8d7576 | 6 | 11 | 18084 | 6340 | 0.199 |
| b37q-40-3376e5fe | 4 | 9 | 14029 | 5263 | 0.161 |
| b37q-57-084e7508 | 5 | 8 | 18541 | 3764 | 0.149 |
| b37q-64-a2a5921b | 5 | 9 | 18210 | 5810 | 0.189 |
| b38l-07-701443f7 | 2 | 11 | 15720 | 4017 | 0.143 |
| b38l-24-316baba1 | 3 | 3 | 17566 | 2685 | 0.124 |
| b38l-40-3f928012 | 2 | 4 | 14526 | 2511 | 0.108 |
| b38l-57-f80d981c | 5 | 13 | 18810 | 6919 | 0.214 |
| b38l-64-cee7d399 | 11 | 17 | 19759 | 6098 | 0.201 |

## Hand read of the 91 unmatched predictions (Claude, 22 Oct; one pass against the hand-grading notes, not re-verified turn by turn)

| what the unmatched prediction is | count | share of all 187 predictions |
|---|---:|---:|
| the same fault the hand grade counted, under another class or turn (e.g. Quillpath Raj's chain split into a repeated probe and a missed error; b36a Marcus t22 called a wrong release) | 22 | 12% |
| a plausible fault the hand grade didn't count — mostly what it noted as advisory or "not counted" (stacked questions, dangling "that", unprobed figures at time-up, close follow-ups after next steps) | 36 | 19% |
| wrong by the hand grade's own reading (e.g. a brainstorm "owed" on pricing-001, which has none; probes on live errors called stale; stage exhibits called unasked releases; true refusals called false) | 33 | 18% |

So 118 of 187 predictions (63%) land on a hand-graded fault, and about 82% are faults by some reading. Misses: 16 of 112 hand faults, 15 of them borderline; the one serious miss is b37h Marisol t8 (the distribution refusal, scored by the auditor as nothing). The raw outputs are in `evals/fault-bank/auditor-cal1/` (re-calibrate free: `FAULT_BANK_OUT=evals/fault-bank npx tsx scripts/offline-auditor.ts --label=cal1 --report`).
