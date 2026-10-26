# Fault bank — after

Switches: `(off)` · 310 records (211 fault, 99 correct) · 54 runs replayed in 14 s

## Summary

Every record is first partitioned on `skipped`: `not_replayable` (contract §4.3 / Q2, judged in the wave),
`diverged` (the replay wrote another kind of turn there, so its assertions have no subject), `vacuous` (a
must-not whose window holds no replayed turn) and `run_missing`. Pass and fail are counted only over the rest.

| kind | records | skipped | counted | pass | fail |
|---|---:|---:|---:|---:|---:|
| fault | 211 | 62 | 149 | 47 | 102 |
| correct | 99 | 4 | 95 | 95 | 0 |

| skipped | fault | correct |
|---|---:|---:|
| not_replayable | 52 | 0 |
| diverged | 10 | 4 |

How a diverged record is judged: not by this harness. The replay drives one turn at a time with the saved
model output, so when code now writes a turn the model wrote (or the other way round) the saved declarations for
that turn are gone and the turn the replay writes answers a different question. Those records are read by hand
against the before/after lines in `## Failed assertions` below, and otherwise go to the wave with the
`not_replayable` ones (contract §4.3).

Not replayable (judged in the wave, contract §4.3 / Q2): 52 (report records 17).

## Gate condition 1 (contract §6)

Counted: replayable fault records owned by streams 2, 3 and 4, not skipped — **47 pass / 149**.
Excluded: 0 replayable fault records owned by `phase2` or `none` (none) — no Phase 1 stream touches them.
Correct records, not skipped: **95 pass / 95** (all must pass, switches off and on).

## Baseline classes (contract §4.5)

| class | records |
|---|---:|
| diverged | 14 |
| fails_as_expected | 102 |
| fixed_on_base | 47 |
| passes_as_expected | 95 |

## By batch

| batch | fault pass / n | correct pass / n |
|---|---:|---:|
| batch-33 | 1 / 6 | 13 / 13 |
| batch-34-aldermoor | 7 / 15 | 8 / 9 |
| batch-34-larkspur | 4 / 16 | 7 / 8 |
| batch-35-hollisbay | 6 / 13 | 9 / 9 |
| batch-35-quillpath | 4 / 13 | 7 / 8 |
| batch-36-aldermoor | 9 / 17 | 10 / 10 |
| batch-36-larkspur | 7 / 17 | 10 / 10 |
| batch-37-hollisbay | 7 / 20 | 10 / 10 |
| batch-37-quillpath | 6 / 24 | 8 / 8 |
| batch-38-larkspur | 0 / 18 | 14 / 14 |

## By stream

| stream | fault pass / n | correct pass / n |
|---|---:|---:|
| 2 | 12 / 18 | 0 / 0 |
| 3 | 8 / 39 | 0 / 0 |
| 4 | 31 / 102 | 0 / 0 |
| none | 0 / 0 | 96 / 99 |

## By class

| class | fault pass / n | correct pass / n |
|---|---:|---:|
| bare_partial | 6 / 27 | 0 / 0 |
| close_wait_reask | 0 / 12 | 0 / 0 |
| correct_close | 0 / 0 | 11 / 12 |
| correct_correction | 0 / 0 | 9 / 10 |
| correct_deferral | 0 / 0 | 8 / 8 |
| correct_probe | 0 / 0 | 20 / 21 |
| correct_release | 0 / 0 | 29 / 29 |
| false_correction | 0 / 2 | 0 / 0 |
| false_refusal | 9 / 15 | 0 / 0 |
| hollow_deferral | 5 / 11 | 0 / 0 |
| ignored_ask | 2 / 7 | 0 / 0 |
| misquote_uncorrected | 0 / 6 | 0 / 0 |
| missed_error | 1 / 5 | 0 / 0 |
| other | 3 / 14 | 0 / 0 |
| probe_chain | 2 / 5 | 0 / 0 |
| rec_reask | 0 / 6 | 0 / 0 |
| repeated_probe | 0 / 1 | 0 / 0 |
| restatement | 8 / 18 | 0 / 0 |
| stage_missed | 2 / 2 | 0 / 0 |
| stale_correction | 2 / 3 | 0 / 0 |
| stale_probe | 0 / 10 | 0 / 0 |
| true_refusal | 0 / 0 | 19 / 19 |
| unasked_offer | 5 / 6 | 0 / 0 |
| unasked_release | 2 / 2 | 0 / 0 |
| wrong_figure | 2 / 4 | 0 / 0 |
| wrong_release | 2 / 3 | 0 / 0 |

## Records

| id | kind | sev | class | stream | replayable | gated | result | changed | baseline |
|---|---|---|---|---|---|---|---|---|---|
| b33-marisol-t14-own-quantity | fault | serious | false_correction | 3 | no |  | not_replayable | yes | fails_as_expected |
| b33-marisol-t20-base-question | fault | firm | ignored_ask | phase2 | no |  | not_replayable |  | fails_as_expected |
| b33-tyler-t18-stale-reprobe | fault | firm | stale_probe | 3 | yes |  | diverged | yes | diverged |
| b33-blake-t20-false-stale | fault | borderline | missed_error | 3 | yes |  | diverged | yes | diverged |
| b33-blake-t22-bare-probe | fault | borderline | other | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b33-jordan-t10-store-count | fault | borderline | bare_partial | 2 | yes | yes | FAIL |  | fails_as_expected |
| b33-jasmine-t6-cogs-split | fault | borderline | ignored_ask | 4 | no |  | not_replayable |  | fails_as_expected |
| b33-jasmine-t14-analysis-reask | fault | borderline | stage_missed | phase2 | no |  | not_replayable |  | fails_as_expected |
| b33-marcus-t6-before-any-data | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b33-marisol-t16-volume-per-store | fault | borderline | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b33-sofia-t10-two-openings | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b33-raj-t8-new-stores-want | fault | borderline | ignored_ask | 4 | no |  | not_replayable |  | fails_as_expected |
| b33-tyler-t18-want-dropped | fault | borderline | ignored_ask | 4 | yes |  | diverged | yes | diverged |
| b33-tyler-report-basket | fault | false | report_false | phase2 | no |  | not_replayable |  | report |
| b33-tyler-report-borderline | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b33-marisol-report-code-error | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b33-raj-t14-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b33-tyler-t12-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b33-owen-t10-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b33-raj-t8-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b33-tyler-t8-misquote-correction | correct | correct | correct_correction | none | yes | yes | pass |  | passes_as_expected |
| b33-tyler-t16-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b33-raj-t16-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b33-sofia-t22-wrapup-probe | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b33-owen-t14-probe | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b33-jordan-t2-deferral | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b33-fiona-t20-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b33-fiona-t4-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b33-owen-t4-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b34a-marisol-t14-treatment-mix | fault | serious | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b34a-jasmine-t4-drug-class | fault | serious | false_refusal | 2 | yes | yes | FAIL | yes | fails_as_expected |
| b34a-tyler-t14-stale-probe | fault | firm | stale_probe | 3 | yes | yes | FAIL |  | fails_as_expected |
| b34a-tyler-t22-patents-dropped | fault | firm | ignored_ask | 4 | yes | yes | pass | yes | fixed_on_base |
| b34a-marisol-t22-probe-after-redo | fault | firm | stale_probe | 3 | yes | yes | FAIL |  | fails_as_expected |
| b34a-marisol-t24-one-off-cost | fault | firm | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b34a-raj-t18-hollow | fault | firm | hollow_deferral | 4 | yes | yes | pass | yes | fixed_on_base |
| b34a-marisol-t28-hollow-franchise | fault | firm | hollow_deferral | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b34a-marcus-t6-hollow-europe | fault | firm | hollow_deferral | 4 | no |  | not_replayable |  | fails_as_expected |
| b34a-raj-t20-brainstorm-reask | fault | borderline | stage_missed | 4 | yes | yes | pass | yes | fixed_on_base |
| b34a-marcus-t20-brainstorm-reask | fault | borderline | stage_missed | 4 | yes |  | diverged | yes | diverged |
| b34a-raj-t26-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b34a-tyler-t4-structure-reask | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b34a-tyler-t12-three-questions | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b34a-tyler-misquotes-missed | fault | borderline | misquote_uncorrected | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b34a-marcus-t6-exhibit-deferral | fault | borderline | other | 4 | yes | yes | FAIL |  | fails_as_expected |
| b34a-marcus-t14-offer | fault | borderline | unasked_offer | 4 | yes | yes | FAIL |  | fails_as_expected |
| b34a-jasmine-t34-rec-reask | fault | borderline | rec_reask | 4 | no |  | not_replayable |  | fails_as_expected |
| b34a-marisol-t16-nimbrel-unintroduced | fault | borderline | other | 2 | yes | yes | pass | yes | fixed_on_base |
| b34a-marcus-report-priced-above | fault | false | report_false | phase2 | no |  | not_replayable |  | report |
| b34a-jasmine-report-attributions | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b34a-marcus-t4-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b34a-tyler-t12-trial-release | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b34a-tyler-t20-pipeline-release | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b34a-marcus-t14-patents-release | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b34a-tyler-t28-wrapup-probe | correct | correct | correct_probe | none | yes |  | diverged | yes | diverged |
| b34a-marcus-t10-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b34a-tyler-t4-gate-deferral | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b34a-raj-t28-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b34a-tyler-t30-close | correct | correct | correct_close | none | yes |  | diverged | yes | diverged |
| b34l-tyler-t22-ramp-refusal | fault | false | false_refusal | 4 | yes |  | diverged | yes | diverged |
| b34l-raj-t6-both-moved | fault | false | wrong_figure | phase2 | no |  | not_replayable |  | fails_as_expected |
| b34l-marisol-t12-ask-swallowed | fault | firm | ignored_ask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b34l-marisol-t26-ask-swallowed | fault | firm | ignored_ask | 4 | yes |  | diverged | yes | diverged |
| b34l-marcus-t14-avoidable-half | fault | firm | bare_partial | 2 | yes | yes | pass | yes | fixed_on_base |
| b34l-raj-t14-hollow-fare-trend | fault | firm | hollow_deferral | 4 | yes | yes | pass | yes | fixed_on_base |
| b34l-raj-t16-offer | fault | borderline | unasked_offer | 4 | yes | yes | pass | yes | fixed_on_base |
| b34l-raj-t22-narration | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b34l-raj-t30-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b34l-marcus-t28-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b34l-tyler-t20-doubled-line | fault | borderline | restatement | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b34l-marcus-t22-doubled-line | fault | borderline | restatement | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b34l-marisol-t18-t20-stale-probes | fault | borderline | stale_probe | 3 | yes | yes | FAIL |  | fails_as_expected |
| b34l-marisol-t10-unit-probe-blocked | fault | borderline | missed_error | 3 | yes | yes | FAIL |  | fails_as_expected |
| b34l-marisol-t24-restate-unsaid | fault | borderline | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b34l-marisol-t30-wont-get-to | fault | borderline | hollow_deferral | 4 | yes |  | diverged | yes | diverged |
| b34l-marisol-t6-before-competitor | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b34l-marcus-t22-reassignment | fault | borderline | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b34l-marcus-t10-long-restatement | fault | borderline | restatement | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b34l-jasmine-t2-nothing-declared | fault | borderline | ignored_ask | 4 | no |  | not_replayable |  | fails_as_expected |
| b34l-marisol-report-12-month | fault | false | report_false | phase2 | no |  | not_replayable |  | report |
| b34l-raj-report-extras | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b34l-tyler-t18-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b34l-raj-t14-leases-release | correct | correct | correct_release | none | yes | yes | pass | yes | passes_as_expected |
| b34l-marisol-t6-competitor-release | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b34l-marisol-t12-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b34l-marisol-t26-probe | correct | correct | correct_probe | none | yes |  | diverged | yes | diverged |
| b34l-tyler-t8-probe | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b34l-raj-t20-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b34l-jasmine-t30-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b35h-marcus-t10-store-count | fault | serious | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b35h-jasmine-t10-store-count | fault | serious | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b35h-tyler-t12-scale-slip | fault | false | wrong_figure | 3 | yes | yes | pass | yes | fixed_on_base |
| b35h-tyler-t12-stale-correction | fault | firm | stale_correction | 3 | yes | yes | pass | yes | fixed_on_base |
| b35h-tyler-t14-stale-probe | fault | firm | stale_probe | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b35h-jasmine-t6-chip-volume-offer | fault | firm | ignored_ask | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b35h-marisol-t10-non-answer | fault | firm | wrong_release | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b35h-marisol-t24-hollow | fault | firm | hollow_deferral | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b35h-tyler-t8-chip-trend | fault | borderline | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b35h-marisol-t20-forecast-accuracy | fault | borderline | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b35h-marisol-t8-itemized-sum-probe | fault | borderline | other | 3 | no |  | not_replayable |  | fails_as_expected |
| b35h-marisol-t18-no-question | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b35h-marisol-t32-rec-reask | fault | borderline | rec_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b35h-marcus-t14-calc-probe-misread | fault | borderline | other | 3 | no |  | not_replayable |  | fails_as_expected |
| b35h-marcus-t26-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b35h-raj-t26-chip-margin | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b35h-jasmine-t14-your-idea | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b35h-jasmine-report-shelf-fees | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b35h-marisol-t14-retailer-release | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b35h-raj-t26-cannibalization | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b35h-marcus-t6-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b35h-marisol-t6-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b35h-tyler-t22-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b35h-marisol-t12-correction | correct | correct | correct_correction | none | yes | yes | pass |  | passes_as_expected |
| b35h-tyler-t26-wrapup-probe | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b35h-jasmine-t30-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b35h-jasmine-t14-brainstorm | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b35q-marcus-t22-ratio-dollar | fault | false | wrong_figure | 3 | yes | yes | FAIL |  | fails_as_expected |
| b35q-tyler-t28-dropped-k | fault | false | wrong_figure | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b35q-marisol-t6-probe-chain | fault | serious | probe_chain | 3 | yes | yes | pass | yes | fixed_on_base |
| b35q-raj-t12-hollow | fault | firm | hollow_deferral | 4 | yes | yes | pass | yes | fixed_on_base |
| b35q-marcus-t18-hollow-on-screen | fault | firm | hollow_deferral | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b35q-marcus-t28-hollow-out-of-scope | fault | firm | hollow_deferral | 4 | yes |  | diverged | yes | diverged |
| b35q-marisol-t12-hollow-held | fault | firm | hollow_deferral | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b35q-tyler-t12-hollow-answered | fault | firm | hollow_deferral | 4 | yes | yes | pass | yes | fixed_on_base |
| b35q-raj-t22-doubled-line | fault | borderline | restatement | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b35q-raj-t36-rec-reask | fault | borderline | rec_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b35q-marcus-t4-same-item-stall | fault | borderline | other | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b35q-marisol-t32-close-over-false | fault | borderline | missed_error | 3 | yes |  | diverged | yes | diverged |
| b35q-tyler-t6-probe-correct-figure | fault | borderline | false_correction | 3 | yes | yes | FAIL |  | fails_as_expected |
| b35q-raj-t14-correction | correct | correct | correct_correction | none | yes | yes | pass |  | passes_as_expected |
| b35q-marisol-t26-correction | correct | correct | correct_correction | none | yes |  | diverged | yes | diverged |
| b35q-tyler-t8-misquote-correction | correct | correct | correct_correction | none | yes | yes | pass | yes | passes_as_expected |
| b35q-tyler-t12-row-probe | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b35q-raj-t12-root-probe | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b35q-marcus-t8-deferral-delivered | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b35q-marcus-t6-deferral-delivered | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b35q-tyler-t32-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b36a-raj-t12-wrong-release | fault | firm | wrong_release | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-raj-t14-nimbrel-patent | fault | firm | bare_partial | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-marcus-t6-european-price | fault | firm | bare_partial | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-marcus-t24-split-restated | fault | firm | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-marisol-t6-growth-restated | fault | firm | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-raj-t14-offer | fault | firm | unasked_offer | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-marcus-t8-offer | fault | firm | unasked_offer | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-raj-t14-refusal-wording | fault | borderline | other | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-raj-t34-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b36a-tyler-t24-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b36a-marisol-t30-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b36a-marcus-t6-eu-manufacturing | fault | borderline | false_refusal | phase2 | no |  | not_replayable | yes | fails_as_expected |
| b36a-marcus-t22-non-answer | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b36a-marcus-t26-unprobed-flag | fault | borderline | missed_error | 3 | yes | yes | FAIL |  | fails_as_expected |
| b36a-tyler-t6-diagnosis-trend | fault | borderline | bare_partial | 4 | yes | yes | pass | yes | fixed_on_base |
| b36a-tyler-misquotes-socratic | fault | borderline | misquote_uncorrected | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b36a-marisol-t14-nimbrel-unintroduced | fault | borderline | other | 2 | yes | yes | FAIL | yes | fails_as_expected |
| b36a-jasmine-t14-fragment-quote | fault | borderline | other | 3 | yes | yes | FAIL |  | fails_as_expected |
| b36a-jasmine-t24-second-key | fault | borderline | repeated_probe | 3 | yes | yes | FAIL |  | fails_as_expected |
| b36a-jasmine-t28-reask-work | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b36a-marcus-report-quote-timing | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b36a-jasmine-t4-coarse-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b36a-marcus-t10-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b36a-tyler-t10-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b36a-marisol-t14-coverage | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b36a-raj-t24-option-b | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b36a-tyler-t12-misquote-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b36a-marisol-t2-deferral | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b36a-tyler-t26-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b36a-marisol-t8-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b36a-tyler-t16-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b36l-tyler-t12-avoidable-fixed | fault | serious | false_refusal | 4 | yes | yes | pass | yes | fixed_on_base |
| b36l-marisol-t12-unasked-release | fault | serious | unasked_release | 4 | yes | yes | pass | yes | fixed_on_base |
| b36l-marcus-t6-casm | fault | false | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b36l-jasmine-t2-departures | fault | false | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b36l-tyler-t6-port-avery-half | fault | firm | bare_partial | 2 | yes | yes | pass | yes | fixed_on_base |
| b36l-tyler-t18-stress-test | fault | firm | ignored_ask | none | no |  | not_replayable | yes | fixed_on_base |
| b36l-marcus-t20-launch-cost | fault | firm | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b36l-jasmine-t8-competitor-never | fault | firm | ignored_ask | 4 | yes | yes | pass | yes | fixed_on_base |
| b36l-raj-t14-load-at-140 | fault | borderline | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b36l-raj-t20-fixed-split | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b36l-raj-t30-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b36l-tyler-t6-long-restatement | fault | borderline | restatement | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b36l-tyler-t8-misquote-125 | fault | borderline | misquote_uncorrected | 3 | no |  | not_replayable |  | fails_as_expected |
| b36l-tyler-t20-dangling-quote | fault | borderline | other | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b36l-tyler-t24-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b36l-marisol-t12-dangling-figure | fault | borderline | other | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b36l-marisol-t10-stale-probe | fault | borderline | stale_probe | 3 | yes | yes | FAIL |  | fails_as_expected |
| b36l-marisol-t4-fare-half | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b36l-marcus-t12-seats-sub-ask | fault | borderline | bare_partial | 4 | no |  | not_replayable | yes | fails_as_expected |
| b36l-marcus-t18-question-passed | fault | borderline | ignored_ask | phase2 | no |  | not_replayable |  | fails_as_expected |
| b36l-jasmine-t6-deferral-renames | fault | borderline | other | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b36l-marisol-report-11000 | fault | false | report_false | phase2 | no |  | not_replayable |  | report |
| b36l-report-borderlines | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b36l-raj-t8-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b36l-marcus-t12-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b36l-marcus-t16-leases | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b36l-tyler-t8-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b36l-marisol-t6-unit-probe | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b36l-marisol-t26-wrapup | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b36l-jasmine-t24-wrapup | correct | correct | correct_probe | none | yes | yes | pass | yes | passes_as_expected |
| b36l-raj-t26-probe | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b36l-marcus-t26-wrapup | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b36l-jasmine-t26-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b37h-marisol-t8-distribution | fault | serious | false_refusal | 2 | yes | yes | pass | yes | fixed_on_base |
| b37h-tyler-t6-scale-slip | fault | false | wrong_figure | 3 | yes | yes | pass | yes | fixed_on_base |
| b37h-tyler-t6-unasked-release | fault | firm | wrong_release | 4 | yes | yes | pass | yes | fixed_on_base |
| b37h-tyler-t18-method-restated | fault | firm | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b37h-marcus-t6-exhibit-unasked | fault | firm | unasked_release | 4 | yes | yes | pass | yes | fixed_on_base |
| b37h-marcus-t10-distribution-silence | fault | firm | ignored_ask | 4 | no |  | not_replayable | yes | fails_as_expected |
| b37h-marisol-t20-stale-probe | fault | firm | stale_probe | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-raj-t10-velocity | fault | borderline | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-raj-t16-category-growth | fault | borderline | false_refusal | 2 | yes | yes | FAIL |  | fails_as_expected |
| b37h-raj-t22-chip-buyers | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37h-tyler-t6-challenge-correct | fault | borderline | false_correction | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-tyler-t14-repeat-rates | fault | borderline | false_refusal | 2 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-tyler-misquotes-not-flat | fault | borderline | misquote_uncorrected | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-marisol-ladders | fault | borderline | probe_chain | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-marisol-t14-superseded | fault | borderline | stale_probe | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-marisol-t16-chip-bags | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37h-marisol-t18-forecast-actual | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37h-marcus-t10-offer | fault | firm | unasked_offer | 4 | yes | yes | pass | yes | fixed_on_base |
| b37h-marcus-t14-split-refusal | fault | borderline | false_refusal | phase2 | no |  | not_replayable | yes | diverged |
| b37h-marcus-t26-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37h-jasmine-t4-velocity | fault | borderline | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b37h-jasmine-t6-chip-trend | fault | borderline | bare_partial | 2 | yes | yes | pass | yes | fixed_on_base |
| b37h-tyler-report-9m | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b37h-raj-t10-retailer | correct | correct | correct_release | none | yes | yes | pass | yes | passes_as_expected |
| b37h-raj-t12-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b37h-marisol-t14-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b37h-marisol-t20-true-refusal | correct | correct | true_refusal | none | yes | yes | pass | yes | passes_as_expected |
| b37h-marisol-t12-root-correction | correct | correct | correct_correction | none | yes | yes | pass | yes | passes_as_expected |
| b37h-marisol-t16-correction | correct | correct | correct_correction | none | yes | yes | pass |  | passes_as_expected |
| b37h-jasmine-t6-survey | correct | correct | correct_release | none | yes | yes | pass | yes | passes_as_expected |
| b37h-jasmine-t22-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b37h-raj-t26-stage-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b37h-tyler-t16-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b37q-raj-chain-405 | fault | serious | probe_chain | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37q-marcus-chain-14-months | fault | serious | probe_chain | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37q-jasmine-chain-400 | fault | firm | probe_chain | 3 | yes | yes | pass | yes | fixed_on_base |
| b37q-tyler-t6-paid-organic | fault | firm | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b37q-tyler-t8-misquote-288 | fault | firm | misquote_uncorrected | 3 | yes | yes | FAIL |  | fails_as_expected |
| b37q-tyler-t18-trend-restated | fault | firm | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b37q-marisol-t14-repeated-probe | fault | firm | stale_probe | 3 | yes | yes | FAIL |  | fails_as_expected |
| b37q-marcus-t32-rec-reask | fault | firm | rec_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-marisol-t16-question-dropped | fault | firm | ignored_ask | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b37q-marcus-t10-offer | fault | firm | unasked_offer | 4 | yes | yes | pass | yes | fixed_on_base |
| b37q-tyler-report-gross-net | fault | false | report_false | none | no |  | not_replayable |  | report |
| b37q-raj-t8-churn-half | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-raj-t14-unasked-restated | fault | borderline | restatement | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-raj-t14-test-passed | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b37q-raj-t16-demo-coarse | fault | borderline | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b37q-raj-t38-rec-reask | fault | borderline | rec_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-tyler-t12-false-stale-12 | fault | borderline | missed_error | 3 | yes | yes | FAIL | yes | fails_as_expected |
| b37q-tyler-t32-rec-reask | fault | borderline | rec_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-marisol-t8-share-coarse | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-marisol-t32-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-marisol-t22-30-percent | fault | borderline | wrong_figure | phase2 | no |  | not_replayable |  | fails_as_expected |
| b37q-marcus-t6-month-to-month | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-marcus-t22-overlap | fault | borderline | restatement | 4 | yes | yes | pass | yes | fixed_on_base |
| b37q-marcus-t28-doubled-line | fault | borderline | other | 3 | yes |  | diverged | yes | diverged |
| b37q-jasmine-t4-cac-stall | fault | borderline | other | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-jasmine-t20-stale-correction | fault | borderline | stale_correction | 3 | yes | yes | pass | yes | fixed_on_base |
| b37q-jasmine-t24-contradiction | fault | borderline | rec_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b37q-marisol-report-upgrade-flow | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b37q-tyler-t12-root-correction | correct | correct | correct_correction | none | yes | yes | pass |  | passes_as_expected |
| b37q-tyler-t30-correction | correct | correct | correct_correction | none | yes | yes | pass | yes | passes_as_expected |
| b37q-jasmine-t8-cac | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b37q-marisol-t18-why-pro-fell | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b37q-raj-t10-cohort | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b37q-marcus-t6-volumes | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b37q-jasmine-t28-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b37q-raj-t8-exhibit | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b38l-tyler-t2-split-refusal | fault | false | false_refusal | 2 | yes | yes | FAIL |  | fails_as_expected |
| b38l-jasmine-t4-ticket-extras | fault | false | false_refusal | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-tyler-t20-demand-evidence | fault | firm | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-tyler-t22-onward-restated | fault | firm | restatement | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-tyler-t24-elasticity | fault | firm | hollow_deferral | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-marisol-t10-competitor-wants | fault | firm | ignored_ask | 4 | no |  | not_replayable |  | fails_as_expected |
| b38l-marisol-t16-stale-probe | fault | firm | stale_probe | 3 | yes | yes | FAIL |  | fails_as_expected |
| b38l-marisol-t24-stale-correction | fault | firm | stale_correction | 3 | yes | yes | FAIL |  | fails_as_expected |
| b38l-raj-t8-network-fare | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-raj-t14-passenger-mix | fault | borderline | bare_partial | 4 | yes | yes | FAIL | yes | fails_as_expected |
| b38l-tyler-t6-fare-network | fault | borderline | bare_partial | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-tyler-t6-self-answered-probe | fault | borderline | other | phase2 | no |  | not_replayable |  | fails_as_expected |
| b38l-tyler-t12-entrant-frequency | fault | borderline | bare_partial | 4 | no |  | not_replayable |  | fails_as_expected |
| b38l-tyler-t14-125-vetoed | fault | borderline | misquote_uncorrected | 3 | yes | yes | FAIL |  | fails_as_expected |
| b38l-tyler-21m-3-6m | fault | borderline | misquote_uncorrected | 3 | yes | yes | FAIL |  | fails_as_expected |
| b38l-tyler-t20-dangling-figure | fault | borderline | other | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-tyler-t24-doubled | fault | borderline | restatement | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-marisol-t6-deferral-delivered | fault | borderline | other | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-marisol-t12-fuel-restated | fault | borderline | restatement | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-marcus-t12-frequency-segment | fault | borderline | bare_partial | 4 | no |  | not_replayable |  | fails_as_expected |
| b38l-marcus-t24-extras-type | fault | borderline | restatement | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-marcus-t28-close-reask | fault | borderline | close_wait_reask | 4 | yes | yes | FAIL |  | fails_as_expected |
| b38l-jasmine-t2-before-any-data | fault | borderline | ignored_ask | 4 | no |  | not_replayable |  | fails_as_expected |
| b38l-raj-report-leases | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b38l-marisol-report-ramp-credit | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b38l-jasmine-report-borderlines | fault | borderline | report_false | phase2 | no |  | not_replayable |  | report |
| b38l-raj-t20-must-reach | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b38l-marisol-t24-must-reach | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b38l-marcus-t24-must-reach | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b38l-jasmine-t20-must-reach | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b38l-marcus-t8-casm | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b38l-tyler-t14-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b38l-tyler-t16-answer-gate | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b38l-marcus-t14-true-refusal | correct | correct | true_refusal | none | yes | yes | pass |  | passes_as_expected |
| b38l-jasmine-t8-competitor | correct | correct | correct_release | none | yes | yes | pass |  | passes_as_expected |
| b38l-tyler-t12-misquote-correction | correct | correct | correct_correction | none | yes | yes | pass |  | passes_as_expected |
| b38l-jasmine-t26-wrapup | correct | correct | correct_probe | none | yes | yes | pass |  | passes_as_expected |
| b38l-marcus-t16-deferral-delivered | correct | correct | correct_deferral | none | yes | yes | pass |  | passes_as_expected |
| b38l-raj-t28-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |
| b38l-marcus-t30-close | correct | correct | correct_close | none | yes | yes | pass |  | passes_as_expected |

## Failed assertions (what the replay delivered)

- **b33-marisol-t14-own-quantity** (fault, t14): `{"kind":"says","pattern":"In COGS terms[^.]*not 5\\.8","must":false}` — t14: In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 5.8. Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 5.8. What's your next step…; `{"kind":"correction","figure":"10 points","must":false}` — t14: In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 5.8. Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 5.8. What's your next step…
- **b33-marisol-t20-base-question** (fault, t20): `{"kind":"says","pattern":"\\bbase\\b|points of revenue|revenue terms","must":true}` — t20: Beyond what we've discussed, what else could the client do?
- **b33-tyler-t18-stale-reprobe** (fault, t18): `{"kind":"probe","figure":"19%","must":false}` — t18: Earlier you said “19%” — how does that fit with the revenue growth over the two years that was stated in the case prompt?
- **b33-blake-t22-bare-probe** (fault, t22): `{"kind":"says","pattern":"walk me through how you got there\\.?\\s*$","must":false}` — t22: Quick question before we wrap up — you mentioned “If elasticity is actually closer to one, I lose the entire margin recovery” — walk me through how you got there.
- **b33-jordan-t10-store-count** (fault, t10): `{"kind":"answered","item":"stores_count","about":"same-store|store","accept":["release","deferral"],"must":true}` — t10: Right. Customers are buying more items per visit, so the average transaction is up from $6.20 two years ago to $6.80 — about a 10% increase. COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own b… / t12: Procurement, mix, waste and reformulation. Pulling it together, what do you recommend Brew & Bean do, and in what order, to bring the margin back? / t14: Price first, then procurement, then mix and waste. You'd move on price first and then pilot it. What is the single biggest risk that this recommendation fails to restore the margin, and how would you mitigate it?
- **b33-jasmine-t6-cogs-split** (fault, t6): `{"kind":"release","item":"bean_share_of_cogs","must":true,"scope":{"fromTurn":6,"toTurn":6}}` — t6: Understood. You named volume loss as a risk. Suppose a price increase of that size triggers meaningful customer pushback and traffic drops. What would you do then, and how would you know before rolling it out chainwide?; `{"kind":"release","item":"bean_price_change","must":true,"scope":{"fromTurn":6,"toTurn":16}}` — t6: Understood. You named volume loss as a risk. Suppose a price increase of that size triggers meaningful customer pushback and traffic drops. What would you do then, and how would you know before rolling it out chainwide? / t8: A pilot with a rollback option. In that pilot, what specific result would tell you the price increase is working versus failing? Give me the metric and the threshold you'd use to decide. / t10: Profit per store against control, with a break-even on traffic. Beyond price and procurement, what else could Brew & Bean do to rebuild its margin? Give me as many distinct ideas as you can, including ones that go after …
- **b33-jasmine-t14-analysis-reask** (fault, t14): `{"kind":"says","pattern":"What's driving the margin drop","must":false}` — t14: What's driving the margin drop, and what would you need to know to pin it down?
- **b33-marcus-t6-before-any-data** (fault, t6): `{"kind":"says","pattern":"Before any data comes out","must":false}` — t6: Understood. On what you asked about earlier: Menu prices have held flat over the past two years. Here's an exhibit: Brew & Bean Cost Structure Over Time. You're skipping the other branches because nothing in the setup po…
- **b33-marisol-t16-volume-per-store** (fault, t16): `{"kind":"answered","item":"stores_count","about":"volume per store|store count|stores","accept":["release","deferral"],"must":true}` — t16: I don't have green coffee spend by contract type or volume per store. You mentioned margin goes to roughly 12% if bean costs return to the old level. What bean cost figure and base did you add to the 6%? / t18: Right. You said beans contribute about 10 points of the 16-point increase. How did you get that figure? / t20: Beyond what we've discussed, what else could the client do?
- **b33-sofia-t10-two-openings** (fault, t10): `{"kind":"says","pattern":"Earlier you put the beans[^?]*You said beans","must":false}` — t10: Understood. I don't have competitor pricing. Earlier you put the beans at 25 percentage points of revenue two years ago, and built the bean and other-input figures on that. You said beans were 25% of COGS. Points of what…
- **b33-raj-t8-new-stores-want** (fault, t8): `{"kind":"answered","item":"stores_count","about":"new store|store","accept":["release","deferral"],"must":true}` — t8: A cost-first read. Here's an exhibit: Brew & Bean Cost Structure Over Time. With that breakdown, which line expanded the most, and what would you want to know next within it? / t10: A two-hypothesis split. Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. The other input costs — dairy, packaging, and food — have gone up 37.5% in the past two years… / t12: Understood. On what you asked about earlier: Menu prices have held flat over the past two years. Given that, does it confirm your read that none of the input increase was passed through, and what does it tell you about w…
- **b33-tyler-t18-want-dropped** (fault, t18): `{"kind":"answered","item":"stores_count","about":"new store|same-store|store","accept":["release","deferral"],"must":true}` — t18: Earlier you said “19%” — how does that fit with the revenue growth over the two years that was stated in the case prompt? / t20: Understood. You pointed to elasticity and competitors as risks. If the pricing increase goes ahead and traffic drops more than you expected, what is the biggest risk to the plan, and how would you respond? / t22: What would you put in place to guard against that?
- **b34a-jasmine-t4-drug-class** (fault, t4): `{"kind":"refusal","about":"drug class","must":false}` — t4: Got it. Branch one first, then. On what you asked about earlier: For moderate-to-severe patients, the main option in the US today is Nimbrel, an injectable advanced therapy. Here's an exhibit: Corlan's disease — US patie…
- **b34a-tyler-t14-stale-probe** (fault, t14): `{"kind":"probe","figure":"$225 million","must":false}` — t14: Understood. You mentioned a 40% rebate gives $225 million. Which patient number is that built on, and how did you get it?
- **b34a-marisol-t22-probe-after-redo** (fault, t22): `{"kind":"probe","figure":"40","must":false}` — t22: Understood. Earlier you said Option B beats A by $40M. Talk me through the math behind 40.
- **b34a-marisol-t28-hollow-franchise** (fault, t28): `{"kind":"release","item":"company_size","must":false}` — t28: Understood. Aldermoor has about $1.5 billion in annual revenue, almost all in Europe, and it has no US employees or sales force today. Let's pull this together for the CEO. Should Aldermoor enter the US, and if so, how? …; `{"kind":"answered","item":"option_b","about":"franchise","must":true}` — t28: Understood. Aldermoor has about $1.5 billion in annual revenue, almost all in Europe, and it has no US employees or sales force today. Let's pull this together for the CEO. Should Aldermoor enter the US, and if so, how? … / t30: What would you have the client do first? / t32: Go on.
- **b34a-marcus-t6-hollow-europe** (fault, t6): `{"kind":"deferral","about":"European net price","must":false}` — t6: You've added supply, which is noted. Here's an exhibit: Corlan's disease — US patient funnel and Kelvexa pricing (US adults; peak year, about five years after launch). That's for a little later — we'll come back to how K…; `{"kind":"refusal","about":"European","must":true}` — t6: You've added supply, which is noted. Here's an exhibit: Corlan's disease — US patient funnel and Kelvexa pricing (US adults; peak year, about five years after launch). That's for a little later — we'll come back to how K…
- **b34a-raj-t26-close-reask** (fault, t26): `{"kind":"says","pattern":"guard against that","must":false}` — t26: What would you do to guard against that?
- **b34a-tyler-t4-structure-reask** (fault, t4): `{"kind":"says","pattern":"what might be missing from it","must":false}` — t4: Understood. I'll share US prevalence data for Corlan's disease once we've settled your structure. One more on your structure before I share that data: what might be missing from it?
- **b34a-tyler-t12-three-questions** (fault, t12): `{"kind":"says","pattern":"Separately,[^?]*\\?[^?]*Then,","must":false}` — t12: Right. Earlier you said a 40 percent rebate takes net to $6,000 and sales to $225 million. In clinical trials, Kelvexa's efficacy was similar to Nimbrel's, with fewer injection-site reactions and infections. Walk me thro…
- **b34a-tyler-misquotes-missed** (fault, t20): `{"kind":"correction","figure":"$80","must":true,"scope":{"fromTurn":20,"toTurn":24}}` — t20: Right. Aldermoor has two more drugs in late-stage trials for related autoimmune conditions, treated by the same US specialists. Go on. / t22: Kelvexa is protected by patents until 2038. What do you take from those numbers? / t24: If Aldermoor builds its own team, how could it reduce the risk of a slow start?; `{"kind":"correction","figure":"9,000","must":true,"scope":{"fromTurn":12,"toTurn":14}}` — t12: Right. Earlier you said a 40 percent rebate takes net to $6,000 and sales to $225 million. In clinical trials, Kelvexa's efficacy was similar to Nimbrel's, with fewer injection-site reactions and infections. Walk me thro… / t14: Understood. You mentioned a 40% rebate gives $225 million. Which patient number is that built on, and how did you get it?
- **b34a-marcus-t6-exhibit-deferral** (fault, t6): `{"kind":"says","pattern":"exhibit:[^.]*\\.[^.]*That's for a little later","must":false}` — t6: You've added supply, which is noted. Here's an exhibit: Corlan's disease — US patient funnel and Kelvexa pricing (US adults; peak year, about five years after launch). That's for a little later — we'll come back to how K…
- **b34a-marcus-t14-offer** (fault, t14): `{"kind":"says","pattern":"I can share what net sales means","must":false}` — t14: Both options laid out. Kelvexa is protected by patents until 2038. I can share what net sales means for the board's test if you'd like. Suppose Aldermoor chooses to build its own US team, which keeps the economics but me…
- **b34a-jasmine-t34-rec-reask** (fault, t34): `{"kind":"ask","stage":"recommendation","must":false}` — t34: Mm-hm. So with that evidence not yet in hand today, what is your recommendation to the CEO right now, and what is the one condition that would flip it?
- **b34a-tyler-t30-close** (correct, t30): `{"kind":"close","must":true}` — t30: Go on.
- **b34l-tyler-t22-ramp-refusal** (fault, t22): `{"kind":"release","item":"new_route_rampup","must":true}` — t22: What else could Larkspur do to make sure it's profitable in the first year?
- **b34l-raj-t6-both-moved** (fault, t6): `{"kind":"says","pattern":"both moved between FY2023 and FY2025","must":false}` — t6: That's fine. Let's work from what we know: profit is revenue minus cost, and both moved between FY2023 and FY2025. Let me make it concrete: of the areas you've named, which one would you check first, and why?
- **b34l-marisol-t12-ask-swallowed** (fault, t12): `{"kind":"refusal","must":true}` — t12: Mm-hm. You said “$18,000” — can you show me that calculation step by step?
- **b34l-marisol-t26-ask-swallowed** (fault, t26): `{"kind":"refusal","must":true}` — t26: What else could Larkspur do to make sure it's profitable in the first year?
- **b34l-raj-t22-narration** (fault, t22): `{"kind":"says","pattern":"the brainstorm is next","must":false}` — t22: Understood. The fare option is off the table, and the brainstorm is next. I'm putting up an exhibit: Proposed new routes — Planning estimates (average per flight across Hub–Ashford and Hub–Brookhaven). What do you take f…
- **b34l-raj-t30-close-reask** (fault, t30): `{"kind":"says","pattern":"guard against that","must":false}` — t30: If you had to guard against that, how would you do it?
- **b34l-marcus-t28-close-reask** (fault, t28): `{"kind":"says","pattern":"guard against that","must":false}` — t28: How would you guard against that?
- **b34l-tyler-t20-doubled-line** (fault, t20): `{"kind":"restatement","item":"new_routes_context","doubled":true,"must":false}` — t20: No other airline is flying nonstop on either new route, and aircraft lease and other fixed costs would stay the same. No other airline is flying nonstop on either new route, and aircraft lease and other fixed costs would…
- **b34l-marcus-t22-doubled-line** (fault, t22): `{"kind":"restatement","item":"new_routes_context","doubled":true,"must":false}` — t22: Understood. No other airline is flying nonstop on either new route, and aircraft lease and other fixed costs would stay the same. The exhibit has this — No other airline is flying nonstop on either new route, and aircraf…
- **b34l-marisol-t18-t20-stale-probes** (fault, t18): `{"kind":"probe","figure":"$180","must":false,"scope":{"turn":18}}` — t18: Understood. You mentioned a $180 fare in FY2025 after taking $20 of extras out of $180 per passenger. Can you walk me through that subtraction?; `{"kind":"probe","figure":"$260","must":false,"scope":{"turn":20}}` — t20: Understood. Earlier you said FY2023 comes to $260 after taking $20 of extras out of $260 per passenger. How did you get that figure?
- **b34l-marisol-t10-unit-probe-blocked** (fault, t10): `{"kind":"says","pattern":"per passenger","must":true}` — t10: Understood. The low-cost airline's cost per seat is about 30% lower than Larkspur's — it flies larger planes and has lower labor costs — and its fares are about the same as Larkspur's current fares. Where do those number…
- **b34l-marisol-t30-wont-get-to** (fault, t30): `{"kind":"refusal","must":true}` — t30: Understood. There have been no material changes to wages or other costs per flight. As I mentioned: The low-cost airline's cost per seat is about 30% lower than Larkspur's — it flies larger planes and has lower labor cos…
- **b34l-marisol-t6-before-competitor** (fault, t6): `{"kind":"says","pattern":"Before the competitor question","must":false}` — t6: Understood. Early in FY2024, a low-cost airline started nonstop flights on Hub–Lakeport and Hub–Port Avery, and it hasn't entered Larkspur's other four routes; Larkspur cut its fares to match, and its planes stayed just …
- **b34l-marcus-t22-reassignment** (fault, t22): `{"kind":"refusal","about":"reassign","must":true}` — t22: Understood. No other airline is flying nonstop on either new route, and aircraft lease and other fixed costs would stay the same. The exhibit has this — No other airline is flying nonstop on either new route, and aircraf…
- **b34l-marcus-t10-long-restatement** (fault, t10): `{"kind":"restatement","item":"route_results_port_avery","must":false}` — t10: Understood. As the exhibit shows: On Hub–Lakeport, revenue fell from $26.4M to $16.8M and contribution fell from $8.4M to a $1.2M loss, on 2,000 flights a year. On Hub–Port Avery, revenue fell from $46.8M to $32.4M and c…
- **b34l-jasmine-t2-nothing-declared** (fault, t2): `{"kind":"deferral","must":true}` — t2: A revenue-versus-cost split. Before any data: is that framework MECE — what's missing, and which branch would you prioritize first, and why?
- **b34l-marisol-t26-probe** (correct, t26): `{"kind":"probe","figure":"$2,800","must":true}` — t26: What else could Larkspur do to make sure it's profitable in the first year?
- **b35h-tyler-t14-stale-probe** (fault, t14): `{"kind":"probe","figure":"$3.9 million","must":false}` — t14: Understood. Earlier you said about $3.9 million of first-year profit, and now about $4.5 million. Can you show me, step by step, how you got to $3.9 million?
- **b35h-jasmine-t6-chip-volume-offer** (fault, t6): `{"kind":"refusal","about":"chip|bags","must":true}` — t6: Understood. Let's stay with this case. You said six million bags is an achievable bar. Walk me through how you'd estimate the volume Hollis Bay can actually expect in year one, and what you'd need to know to do that.
- **b35h-marisol-t10-non-answer** (fault, t10): `{"kind":"refusal","about":"year two|year-two|recur","must":true}` — t10: Got it. On revenue: you put break-even revenue at $20.4 million, about 7% of the business. What volume and cost base is that built on?
- **b35h-marisol-t24-hollow** (fault, t24): `{"kind":"refusal","about":"repeat","must":true}` — t24: Understood. As the exhibit shows: The sampling proposal is staffed tasting tables in 500 stores over 10 weekends at launch, costing $1.5 million, and it is expected to bring 500,000 extra buying households in year one, e…
- **b35h-marisol-t8-itemized-sum-probe** (fault, t8): `{"kind":"probe","figure":"$10.2 million","must":false}` — t8: Mm-hm. You said the fixed costs total $10.2 million. How did you do that calculation?
- **b35h-marisol-t18-no-question** (fault, t18): `{"kind":"says","pattern":"\\?","must":true}` — t18: Right. You said the project clears break-even by about 50%. The survey is stated intent, and the board only approves if year one breaks even.
- **b35h-marisol-t32-rec-reask** (fault, t32): `{"kind":"ask","stage":"recommendation","must":false}` — t32: We're close to time. What would you recommend to the CEO, and what's the biggest risk to it?
- **b35h-marcus-t14-calc-probe-misread** (fault, t14): `{"kind":"says","pattern":"What were the steps in that calculation","must":false}` — t14: Mm-hm. Earlier you said the launch "clears at the current $3.00 shelf price — which I'll note is the price the survey was taken at." What were the steps in that calculation?
- **b35h-marcus-t26-close-reask** (fault, t26): `{"kind":"says","pattern":"guard against that","must":false}` — t26: What would you do to guard against that?
- **b35h-raj-t26-chip-margin** (fault, t26): `{"kind":"refusal","about":"margin","must":true}` — t26: Got it. Fewer than 5% of chickpea-snack purchases are expected to replace a bag of Hollis Bay's own chips — small enough to ignore for this decision. With that, does your view on cannibalization change your launch recomm…
- **b35h-jasmine-t14-your-idea** (fault, t14): `{"kind":"says","pattern":"your idea, not mine","must":false}` — t14: Let's stay with this case. Sampling is your idea, not mine. What could Hollis Bay do to get shoppers to try its chickpea snacks, and to keep buying them?
- **b35q-marcus-t22-ratio-dollar** (fault, t22): `{"kind":"says","pattern":"LTV/CAC is about \\$","must":false}` — t22: Starter standalone LTV/CAC is about $2. What's your next step from here?
- **b35q-tyler-t28-dropped-k** (fault, t28): `{"kind":"says","pattern":"\\$0\\.24k","must":false}` — t28: Extra value per month of sign-ups at $60 vs. $40 is about $0.24k, not $210k. Would that change your recommendation at all?
- **b35q-marcus-t18-hollow-on-screen** (fault, t18): `{"kind":"answered","item":"cohort_notes","about":"month 12|months 18|beyond month 12","must":true}` — t18: Understood. As I mentioned: Of the 3,000 Starter customers who signed up in January–March 2025, 94% were still on Starter after month 1, 82% after month 3, 65% after month 6 and 40% after month 12; by those months 1%, 5%… / t20: Right. You said “Cancellations by period are 5, then 8, then 11, then 16 — that's accelerating, not…” — what were the steps in that calculation? / t22: Starter standalone LTV/CAC is about $2. What's your next step from here?
- **b35q-marisol-t12-hollow-held** (fault, t12): `{"kind":"answered","item":"why_pro_fell","about":"CAC|acquisition cost","accept":["release","deferral"],"must":true}` — t12: Got it. I don't have Pro's CAC since January 2025. At month 12, 21.5% of Pro customers and 40% of Starter customers had cancelled. Where does that leave your analysis? / t14: I'm putting up an exhibit: Customers who signed up in January–March 2025 — Status over their first year (% of each plan's starting customers, by months since sign-up). How do you read this exhibit? / t16: At month 12, 21.5% of Pro customers and 40% of Starter customers had cancelled. Go on.
- **b35q-raj-t22-doubled-line** (fault, t22): `{"kind":"says","pattern":"(?:As I mentioned|As the exhibit shows|Again, from the exhibit|That's on the exhibit|The exhibit has this|Reading the exhibit again): Starter's cost to serve","must":false}` — t22: Understood. Cost to acquire is the same at either price, and the test can't yet measure cancellation or upgrade rates for the $60 sign-ups. As the exhibit shows: Starter's cost to serve ($10 a month) and acquisition cost…
- **b35q-raj-t36-rec-reask** (fault, t36): `{"kind":"ask","stage":"recommendation","must":false}` — t36: We're almost out of time — what would you tell the CEO, and what's the biggest risk to it?
- **b35q-marcus-t4-same-item-stall** (fault, t4): `{"kind":"deferral","about":"cancellation","must":false,"scope":{"fromTurn":4,"toTurn":6}}` — t4: Three buckets: price, acquisition cost, retention. That's for a little later — we'll come back to Starter and Pro monthly cancellation rates and the acquisition cost per customer. Your buckets start from the answer you'v… / t6: Got it. The mix and shutdown counterfactual are now on the table. On what you asked about earlier: The cost to acquire one new customer is $1,200 for Pro, through a sales demo, and $300 for Starter, which is self-serve, …
- **b35q-marisol-t32-close-over-false** (fault, t32): `{"kind":"probe","figure":"$900","must":true,"scope":{"fromTurn":32,"toTurn":32}}` — t32: Starter standalone LTV/CAC is about 2 times. Does your recommendation change, given that?
- **b35q-tyler-t6-probe-correct-figure** (fault, t6): `{"kind":"probe","figure":"$80","must":false}` — t6: Understood. I'm putting up an exhibit: Customers who signed up in January–March 2025 — Status over their first year (% of each plan's starting customers, by months since sign-up). How did you get to $80?
- **b35q-marisol-t26-correction** (correct, t26): `{"kind":"correction","figure":"$4,000","must":true}` — t26: Based on what you have, what would you tell the CEO to do?
- **b36a-raj-t34-close-reask** (fault, t34): `{"kind":"says","pattern":"guard against that","must":false}` — t34: What would you do to guard against that?
- **b36a-tyler-t24-close-reask** (fault, t24): `{"kind":"says","pattern":"do first|first step|first thing","must":false}` — t24: What's the first step you'd want the client to take?
- **b36a-marisol-t30-close-reask** (fault, t30): `{"kind":"says","pattern":"do first|first step|first thing","must":false}` — t30: What would you have the client do first?
- **b36a-marcus-t6-eu-manufacturing** (fault, t6): `{"kind":"refusal","about":"EU manufacturing","must":false}` — t6: Understood. You assumed 260 million US adults; the funnel math you ran is yours. I don't have European net price per patient per year or EU manufacturing cost per unit. What do you know about Kelvexa's US net price, what…
- **b36a-marcus-t22-non-answer** (fault, t22): `{"kind":"says","pattern":"treat your own comparison as it stands","must":false}` — t22: Understood. Net sales are revenue after the discounts and rebates Aldermoor pays to insurers and pharmacy benefit managers. Take that definition, and treat your own comparison as it stands. If Aldermoor builds its own te…
- **b36a-marcus-t26-unprobed-flag** (fault, t26): `{"kind":"probe","must":true,"scope":{"fromTurn":26}}` — t26: To guard against that, what would you put in place? / t28: We've covered everything I wanted to. Thanks for working through the case — your written report will follow.
- **b36a-tyler-misquotes-socratic** (fault, t6): `{"kind":"correction","figure":"1.6%","must":true,"scope":{"fromTurn":6,"toTurn":6}}` — t6: Mm-hm. Many patients go undiagnosed for years because early symptoms are mistaken for other joint conditions. I don't have diagnosis rate trend over recent years. On the prevalence input: you said 1.5% of US adults have …; `{"kind":"correction","figure":"$9,000","must":true,"scope":{"fromTurn":12,"toTurn":14}}` — t12: Understood. On Nimbrel's net price, you said about $8,650 per patient per year. Where does that number come from, and how does it compare with what you've been given? / t14: Mm-hm. Now, an exhibit: US specialist survey — Reasons for and against prescribing Kelvexa (% of specialists naming each reason). What does it tell you about whether that 20% share holds?
- **b36a-marisol-t14-nimbrel-unintroduced** (fault, t14): `{"kind":"release","item":"nimbrel","must":true,"scope":{"fromTurn":2,"toTurn":14}}` — t2: Understood. I'll come back to US prevalence data for Corlan's disease shortly. Before we get to data: is that structure MECE, and which of your three buckets do you prioritize, and why? / t4: Understood. On what you asked about earlier: In the patient funnel, 1.6% of US adults have Corlan's disease; 50% of those are diagnosed, 50% of diagnosed patients are treated with prescription medicine, and 20% of treate… / t6: Mm-hm. There are 250 million US adults. I don't have growth in the eligible pool over recent years. On the severity cut: you applied the 20% to all 4.16 million patients with the disease. Walk me through why that's the r…
- **b36a-jasmine-t14-fragment-quote** (fault, t14): `{"kind":"says","pattern":"“…[^”]*…”","must":false}` — t14: Mm-hm. You said “…the only option where reported US net sales clear the board's $300M gate — a…” — how did you do that calculation?
- **b36a-jasmine-t24-second-key** (fault, t24): `{"kind":"says","pattern":"royalties that doesn't count","must":false}` — t24: Mm-hm. You mentioned the partner route yields $120 million in royalties that doesn't count against the gate. What base is the board's $300 million gate measured on?
- **b36a-jasmine-t28-reask-work** (fault, t28): `{"kind":"probe","figure":"$240 million","must":false}` — t28: Understood. How did you get to the $240 million versus $120 million comparison on pure economics?
- **b36l-raj-t14-load-at-140** (fault, t14): `{"kind":"refusal","about":"load","must":true}` — t14: A fare-only decline, with the breakeven worked out. The low-cost airline's cost per seat is about 30% lower than Larkspur's — it flies larger planes and has lower labor costs — and its fares are about the same as Larkspu…
- **b36l-raj-t20-fixed-split** (fault, t20): `{"kind":"answered","about":"split|breakdown","accept":["refusal","deferral"],"must":true}` — t20: All nine aircraft are leased through 2030, so returning them early is not an option. How do you read those numbers? / t22: What else could Larkspur do to make sure it's profitable in the first year? / t24: A set of levers sized against the gap, plus a competitor-entry flag. Based on what you have, what would you tell the CEO to do?
- **b36l-raj-t30-close-reask** (fault, t30): `{"kind":"says","pattern":"guard against that","must":false}` — t30: What would you do to guard against that?
- **b36l-tyler-t6-long-restatement** (fault, t6): `{"kind":"restatement","item":"route_results_lakeport","must":false}` — t6: Mm-hm. Hub–Port Avery shows the same pattern: 80 seats, a 75% load factor and $20 of extras per passenger, with variable cost of $11,000 per flight in both years, while the average fare fell from $240 to $160. As the exh…
- **b36l-tyler-t8-misquote-125** (fault, t8): `{"kind":"correction","figure":"$120","must":true}` — t8: Right. Early in FY2024, a low-cost airline started nonstop flights on Hub–Lakeport and Hub–Port Avery, and it hasn't entered Larkspur's other four routes; Larkspur cut its fares to match, and its planes stayed just as fu…
- **b36l-tyler-t20-dangling-quote** (fault, t20): `{"kind":"says","pattern":"You said roughly 800,000 passengers","must":false}` — t20: Understood. You said roughly 800,000 passengers a year across the network. New routes typically take 6–12 months to reach their expected load factor, and in the first year the load factor is often around 60%. What's your…
- **b36l-tyler-t24-close-reask** (fault, t24): `{"kind":"says","pattern":"guard against that","must":false}` — t24: What would you do to guard against that?
- **b36l-marisol-t12-dangling-figure** (fault, t12): `{"kind":"says","pattern":"^Walk me through how you got that figure|\\. Walk me through how you got that figure","must":false}` — t12: Right, the 40% on the FY2023 base. The low-cost airline's cost per seat is about 30% lower than Larkspur's — it flies larger planes and has lower labor costs — and its fares are about the same as Larkspur's current fares…
- **b36l-marisol-t10-stale-probe** (fault, t10): `{"kind":"probe","figure":"$160","must":false}` — t10: Understood. The numbers match the exhibit. Early in FY2024, a low-cost airline started nonstop flights on Hub–Lakeport and Hub–Port Avery, and it hasn't entered Larkspur's other four routes; Larkspur cut its fares to mat…
- **b36l-marisol-t4-fare-half** (fault, t4): `{"kind":"refusal","about":"fare","must":true}` — t4: Right. The network is the same six routes as in FY2023, with the same number of flights on each. Here's an exhibit: Larkspur Air — Results by route, FY2023 vs. FY2025 ($ millions unless noted). With that in front of you,…
- **b36l-marcus-t12-seats-sub-ask** (fault, t12): `{"kind":"refusal","about":"seats|a day","must":true}` — t12: Understood. Hub–Port Avery shows the same pattern: 80 seats, a 75% load factor and $20 of extras per passenger, with variable cost of $11,000 per flight in both years, while the average fare fell from $240 to $160. The l…
- **b36l-marcus-t18-question-passed** (fault, t18): `{"kind":"says","pattern":"follow|enter","must":true}` — t18: Understood. You've tied the new routes to the freed aircraft time and landed on a profit figure. Beyond exiting those two routes and launching the new ones, what else could Larkspur do to make sure it is profitable in th…
- **b36l-jasmine-t6-deferral-renames** (fault, t6): `{"kind":"deferral","about":"fuel","must":false}` — t6: Both routes cut to a loss on flat flights, understood. Variable cost per Hub–Lakeport flight was $9,000 in both years: fuel $4,000, crew $2,000, maintenance $1,500, and landing and airport fees $1,500. Hub–Port Avery sho…
- **b37h-marcus-t10-distribution-silence** (fault, t10): `{"kind":"release","item":"retailer_support","must":true}` — t10: Understood. You said 6 million bags is about 6% of the revenue base and reachable. You're treating 6 million bags as reachable by comparing it to a revenue percentage. How would you build up volume from the shopper side,…
- **b37h-marisol-t20-stale-probe** (fault, t20): `{"kind":"probe","figure":"$9.9 million","must":false}` — t20: Understood. As for repeat purchase rate beyond year one, that's not something I have. Earlier you said about $9.9 million of first-year profit. Can you walk me through what volume and costs that rests on? And on the 22% …
- **b37h-raj-t10-velocity** (fault, t10): `{"kind":"refusal","about":"turns|velocity","must":true}` — t10: Understood. You've put the break-even at about 5.6 million bags. Before we size volume, how would you judge whether that's a high or low hurdle for this launch?
- **b37h-raj-t16-category-growth** (fault, t16): `{"kind":"release","item":"why_now","must":true}` — t16: Mm-hm. Category size and growth for better-for-you snacks in the Northeast and Midwest — that's not something I have. On the 6 million bags you're holding as the hurdle: which direct evidence of shopper demand for this s…
- **b37h-raj-t22-chip-buyers** (fault, t22): `{"kind":"refusal","about":"chip buyers|respondents","must":true}` — t22: Three doubts: conversion, repeat and cannibalization. Fewer than 5% of chickpea-snack purchases are expected to replace a bag of Hollis Bay's own chips — small enough to ignore for this decision. With that in mind, setti…
- **b37h-tyler-t6-challenge-correct** (fault, t6): `{"kind":"probe","figure":"$9","must":false}` — t6: A fixed-cost-over-contribution setup, with the recipe spend excluded as sunk. Chip sales are flat, better-for-you snacks are growing quickly, and Hollis Bay's largest retailers have asked for healthier options. I don't h…
- **b37h-tyler-t14-repeat-rates** (fault, t14): `{"kind":"refusal","about":"repeat rates from past launches","must":false}` — t14: Got it. On the protein figure, you said 54% — walk me through where that number comes from. Repeat rates from past launches — that's not something I have. Beyond the levers you listed, which one or two would you prioriti…; `{"kind":"answered","item":"planning_assumptions","about":"repeat rate","accept":["release","deferral"],"must":true}` — t14: Got it. On the protein figure, you said 54% — walk me through where that number comes from. Repeat rates from past launches — that's not something I have. Beyond the levers you listed, which one or two would you prioriti… / t16: I have an exhibit for you: Proposal — In-store sampling program (first year of the launch). What's this exhibit telling you? / t18: Mm-hm. I'm afraid I don't have data on how the 500,000 household estimate was derived. Based on what you have, what would you tell the CEO to do?
- **b37h-tyler-misquotes-not-flat** (fault, t6): `{"kind":"correction","figure":"$0.70","must":true,"scope":{"fromTurn":6,"toTurn":8}}` — t6: A fixed-cost-over-contribution setup, with the recipe spend excluded as sunk. Chip sales are flat, better-for-you snacks are growing quickly, and Hollis Bay's largest retailers have asked for healthier options. I don't h… / t8: Understood, a bottom-up demand build. I'm putting up an exhibit: Snack shopper survey — Roasted chickpea snacks at the shelf price (% of snack shoppers in Hollis Bay's region) and planning assumptions from past launches.…; `{"kind":"correction","figure":"$4.5","must":true,"scope":{"fromTurn":20}}` — t20: Understood. You named two risks, the unvalidated sampling households and survey intent overstating. Which single risk could most threaten the launch clearing break-even, and how would you size it against your base case? / t22: What would you put in place to guard against that? / t24: We've gotten through what I wanted to. Thank you for working through the case; your written report will follow.
- **b37h-marisol-ladders** (fault, t6): `{"kind":"correction","figure":"$1.5","must":true,"scope":{"fromTurn":6,"toTurn":10}}` — t6: Mm-hm. I don't have typical new SKU volume per store per week. You used $3.99 as revenue per bag and included the recipe development cost in fixed costs. Walk me through why each of those belongs in Hollis Bay's breakeve… / t8: Understood. Hollis Bay's two largest retail partners have agreed to stock the line in all their stores, provided Hollis Bay pays the shelf fees. You said contribution is $3.99 minus $1.50 — can you show me that calculati… / t10: Right. You mentioned "$10.2 million" — walk me through that calculation. And on revenue, which party actually pays Hollis Bay, and how much does Hollis Bay receive per bag that it sells?
- **b37h-marisol-t14-superseded** (fault, t14): `{"kind":"probe","figure":"$16 million","must":false}` — t14: Understood. I'm afraid I don't have better-for-you segment size in Hollis Bay's regions. Earlier you said the 4.1 million bags were roughly $16 million of retail sales, about 5% of current scale. How did you do that calc…
- **b37h-marisol-t16-chip-bags** (fault, t16): `{"kind":"refusal","about":"bags","must":true}` — t16: First-year launch costs that count for the decision is about $9 million, not $10.2 million. Chip sales are flat, better-for-you snacks are growing quickly, and Hollis Bay's largest retailers have asked for healthier opti…
- **b37h-marisol-t18-forecast-actual** (fault, t18): `{"kind":"refusal","about":"forecast|actual","must":true}` — t18: Mm-hm. The 1,000 shoppers are a match for the mix in Hollis Bay's stores, and the conversion rates are from Hollis Bay's last five launches. On the conversion rates you applied to each bucket, which one came from the exh…
- **b37h-marcus-t26-close-reask** (fault, t26): `{"kind":"says","pattern":"guard against that","must":false}` — t26: How would you guard against that?
- **b37h-jasmine-t4-velocity** (fault, t4): `{"kind":"refusal","about":"turns|velocity","must":true}` — t4: Understood. On what you asked about earlier: Planning assumptions from Hollis Bay's past launches are: 30 million households shop in stores carrying Hollis Bay; 60% of “definitely would buy” and 20% of “probably would bu…
- **b37q-raj-chain-405** (fault, t18): `{"kind":"says","pattern":"\\brow\\b[^?]*\\?|cancell?ations?[^?]*\\?","must":true,"scope":{"fromTurn":18,"toTurn":22}}` — t18: Right. You said a $2,800 loss each time Pro becomes Starter. How did you get that figure? / t20: Got it. Starter value per sign-up including upgrades, at $40, is about $1,400, not $1,205. You mentioned "1,000 × $1,205 ≈ $1.21m" — what were the steps in that calculation? / t22: Mm-hm. What's your next step from here?; `{"kind":"probe","figure":"$405","must":false,"scope":{"turn":36}}` — t36: Understood. Starter standalone lifetime value at $40 is about $600, not $405. Earlier you said a Starter customer's time on plan is worth $405. Take me through the steps behind that figure: where does the 13.5 months com…
- **b37q-marcus-chain-14-months** (fault, t18): `{"kind":"probe","figure":"$1,880","must":false,"scope":{"fromTurn":24}}` — t24: Understood. You put it at “$1,880” — what were the steps in that calculation?
- **b37q-tyler-t6-paid-organic** (fault, t6): `{"kind":"refusal","about":"paid|organic","must":true}` — t6: A Pro benchmark, then Starter standalone, then upgrades. Most Pro customers have a demo with a salesperson first, while Starter customers sign up online on their own. I don't have the split of Starter sign-ups by source.…
- **b37q-tyler-t8-misquote-288** (fault, t8): `{"kind":"says","pattern":"\\$288","must":true}` — t8: What steps got you to 4%?; `{"kind":"correction","figure":"$300","must":true,"scope":{"fromTurn":8,"toTurn":12}}` — t8: What steps got you to 4%? / t10: Got it. On Starter's margin you said "$40 minus $12 equals $28" — walk me through that calculation. / t12: Starter monthly cancellation rate is about 5%, not 4%. With that rate, what does Starter's standalone value per sign-up look like, and how does your total value per sign-up against acquisition cost change?
- **b37q-marisol-t14-repeated-probe** (fault, t14): `{"kind":"probe","figure":"22.5","must":false}` — t14: Got it. You mentioned 22.5 months for Starter. What monthly amount did you divide the $900 by, and does that match how lifetime value is defined?
- **b37q-marcus-t32-rec-reask** (fault, t32): `{"kind":"ask","stage":"recommendation","must":false}` — t32: We're almost out of time — what would you tell the CEO, and what's the biggest risk to it?
- **b37q-marisol-t16-question-dropped** (fault, t16): `{"kind":"release","item":"why_pro_fell","must":true}` — t16: As I mentioned: Starter buyers are mostly one-person businesses, and Pro buyers mostly have three or more staff. As the exhibit shows: Of the 3,000 Starter customers who signed up in January–March 2025, 94% were still on…
- **b37q-raj-t8-churn-half** (fault, t8): `{"kind":"exhibit","exhibit":"exhibit-2","must":true}` — t8: A ratio-driven start. Here's an exhibit: Quillpath — Economics of each plan ($ per customer). With those figures, how would you put them together to test Starter against the board's three-times rule?
- **b37q-raj-t14-unasked-restated** (fault, t14): `{"kind":"restatement","item":"starter_cohort","must":false}` — t14: Mm-hm. As the exhibit shows: Cancellation rates have stayed roughly steady from month to month, very few Starter customers upgrade after month 12, upgraded customers then behave like Pro customers, and finance values a S…
- **b37q-raj-t14-test-passed** (fault, t14): `{"kind":"says","pattern":"the Starter test is passed","must":false}` — t14: Mm-hm. As the exhibit shows: Cancellation rates have stayed roughly steady from month to month, very few Starter customers upgrade after month 12, upgraded customers then behave like Pro customers, and finance values a S…
- **b37q-raj-t16-demo-coarse** (fault, t16): `{"kind":"refusal","about":"demo","must":true}` — t16: Understood. Starter buyers are mostly one-person businesses, and Pro buyers mostly have three or more staff. I have an exhibit for you: Quillpath — New customers per month, by plan (average per month). Given that, what d…
- **b37q-raj-t38-rec-reask** (fault, t38): `{"kind":"ask","stage":"recommendation","must":false}` — t38: Only a little time left — what's your bottom-line recommendation, and what's the biggest risk to it?
- **b37q-tyler-t12-false-stale-12** (fault, t12): `{"kind":"probe","figure":"$28","must":true,"scope":{"fromTurn":14,"toTurn":20}}` — t14: I have an exhibit for you: Customers who signed up in January–March 2025 — Status over their first year (% of each plan's starting customers, by months since sign-up). What's this exhibit telling you? / t16: I'm putting up an exhibit: Quillpath — New customers per month, by plan (average per month). How do you read this exhibit? / t18: Understood. When it comes to the 2024 trend in Pro sign-ups before Starter launched, I don't have that. On the 150 lost Pro sign-ups a month, what would you want to know to decide how many of them are true cannibalizatio…
- **b37q-tyler-t32-rec-reask** (fault, t32): `{"kind":"ask","stage":"recommendation","must":false}` — t32: Only a little time left — what's your bottom-line recommendation, and what's the biggest risk to it?
- **b37q-marisol-t8-share-coarse** (fault, t8): `{"kind":"release","item":"why_pro_fell","must":true}` — t8: Got it. New customers per month were 500 Pro in 2024, before Starter launched, and 350 Pro plus 1,000 Starter — 1,350 in total — from January 2025 to June 2026. Starter buyers are mostly one-person businesses, and Pro bu…
- **b37q-marisol-t32-close-reask** (fault, t32): `{"kind":"says","pattern":"guard against that","must":false}` — t32: How would you guard against that?
- **b37q-marisol-t22-30-percent** (fault, t22): `{"kind":"says","pattern":"30% of Starter sign-ups","must":false}` — t22: Understood. You sized the trade-downs as 300 a month, but Pro fell by 150, and trade-downs were only 30% of Starter sign-ups against the 500 Pro baseline. Which of those two counts should the 300 × $1,700 loss rest on, a…
- **b37q-marcus-t6-month-to-month** (fault, t6): `{"kind":"refusal","about":"month","must":true}` — t6: Right. New customers per month were 500 Pro in 2024, before Starter launched, and 350 Pro plus 1,000 Starter — 1,350 in total — from January 2025 to June 2026. With that in front of you, what does it say about whether St…
- **b37q-jasmine-t4-cac-stall** (fault, t4): `{"kind":"release","item":"plan_cac","must":true,"scope":{"fromTurn":4,"toTurn":6}}` — t4: Got it. New customers per month were 500 Pro in 2024, before Starter launched, and 350 Pro plus 1,000 Starter — 1,350 in total — from January 2025 to June 2026. Here's an exhibit: Customers who signed up in January–March… / t6: Understood. Pro is $100 a month with a $20 monthly cost to serve, and Starter is $40 a month with a $10 monthly cost to serve — hosting, support and payment processing. I can share the acquisition cost per customer if yo…
- **b37q-jasmine-t24-contradiction** (fault, t24): `{"kind":"ask","stage":"recommendation","must":false}` — t24: Understood. Your recommendation to keep Starter and raise it to $60 is noted. Based on what you have, what would you tell the CEO to do?
- **b38l-tyler-t2-split-refusal** (fault, t2): `{"kind":"refusal","about":"split","must":false}` — t2: A revenue-and-cost split, with revenue decomposed into volume and fare. I don't have split of revenue decline between passengers and average fare. Is that structure MECE, and which branch would you prioritize first and w…
- **b38l-jasmine-t4-ticket-extras** (fault, t4): `{"kind":"refusal","about":"extras","must":false}` — t4: Understood. Hub–Port Avery shows the same pattern: 80 seats, a 75% load factor and $20 of extras per passenger, with variable cost of $11,000 per flight in both years, while the average fare fell from $240 to $160. Acros…; `{"kind":"release","item":"extras_revenue","must":true}` — t4: Understood. Hub–Port Avery shows the same pattern: 80 seats, a 75% load factor and $20 of extras per passenger, with variable cost of $11,000 per flight in both years, while the average fare fell from $240 to $160. Acros…
- **b38l-tyler-t20-demand-evidence** (fault, t20): `{"kind":"answered","about":"traffic|demand assumption|evidence","accept":["refusal","deferral"],"must":true}` — t20: Understood. On variable cost, you said $8,800 per flight. About 20% of passengers on the two contested routes are connecting at the hub to another Larkspur flight. New routes typically take 6–12 months to reach their exp… / t22: As I mentioned: About 20% of passengers on the two contested routes are connecting at the hub to another Larkspur flight. As the exhibit shows: On the other four routes revenue and contribution stayed nearly flat: Hub–Ce… / t24: A stacked set of levers. On the price elasticity of those four routes, I'll check what we have. Repeating what I said before: On the other four routes revenue and contribution stayed nearly flat: Hub–Cedar Bluff (2,500 f…
- **b38l-tyler-t22-onward-restated** (fault, t22): `{"kind":"restatement","item":"route_results_other","must":false}` — t22: As I mentioned: About 20% of passengers on the two contested routes are connecting at the hub to another Larkspur flight. As the exhibit shows: On the other four routes revenue and contribution stayed nearly flat: Hub–Ce…; `{"kind":"refusal","about":"onward","must":true}` — t22: As I mentioned: About 20% of passengers on the two contested routes are connecting at the hub to another Larkspur flight. As the exhibit shows: On the other four routes revenue and contribution stayed nearly flat: Hub–Ce…
- **b38l-tyler-t24-elasticity** (fault, t24): `{"kind":"restatement","item":"route_results_other","must":false}` — t24: A stacked set of levers. On the price elasticity of those four routes, I'll check what we have. Repeating what I said before: On the other four routes revenue and contribution stayed nearly flat: Hub–Cedar Bluff (2,500 f…; `{"kind":"answered","about":"elasticity","accept":["refusal","deferral"],"must":true}` — t24: A stacked set of levers. On the price elasticity of those four routes, I'll check what we have. Repeating what I said before: On the other four routes revenue and contribution stayed nearly flat: Hub–Cedar Bluff (2,500 f… / t26: Understood. If you had to advise the CEO now, what would you recommend? / t28: Understood. What do you see as the single biggest risk to that recommendation, and how would you mitigate it?
- **b38l-marisol-t10-competitor-wants** (fault, t10): `{"kind":"release","item":"competitor_costs","must":true}` — t10: Understood. An exhibit for you — Hub–Lakeport — Economics of one one-way flight, FY2023 vs. FY2025 ($). How did you get to 24?
- **b38l-marisol-t16-stale-probe** (fault, t16): `{"kind":"probe","figure":"$1,800","must":false}` — t16: Understood. You computed $1,800 positive per Port Avery flight using $9,000 variable cost. Where did that cost figure come from for Port Avery?
- **b38l-marisol-t24-stale-correction** (fault, t24): `{"kind":"correction","figure":"$15.8M","must":false}` — t24: The annual operating-profit improvement from redeploying the contested flights is about $11.8M, not $15.8M. Larger airlines are present too, offering connecting itineraries through their own hubs. Before your recommendat…
- **b38l-raj-t8-network-fare** (fault, t8): `{"kind":"answered","about":"fare","accept":["refusal","deferral"],"must":true,"scope":{"fromTurn":8,"toTurn":12}}` — t8: A revenue decomposition, then costs. Across all six routes, revenue fell from $200.0M to $176.0M and contribution fell from $40.0M to $16.0M, on 14,000 flights a year — the same number of flights in both years. I'll come… / t10: A fare-driven reading, then a route cut. Here's an exhibit: Larkspur Air — Results by route, FY2023 vs. FY2025 ($ millions unless noted). On Hub-Lakeport average one-way fare in each year: we'll get there in a bit. What … / t12: A competitor hypothesis. Early in FY2024, a low-cost airline started nonstop flights on Hub–Lakeport and Hub–Port Avery, and it hasn't entered Larkspur's other four routes; Larkspur cut its fares to match, and its planes…
- **b38l-raj-t14-passenger-mix** (fault, t14): `{"kind":"refusal","about":"mix|business","must":true}` — t14: Your Lakeport breakeven is worked through. Now, an exhibit: Proposed new routes — Planning estimates (average per flight across Hub–Ashford and Hub–Brookhaven). What do you take from those numbers?
- **b38l-tyler-t6-fare-network** (fault, t6): `{"kind":"refusal","about":"fare","must":true}` — t6: Understood. Across all six routes, revenue fell from $200.0M to $176.0M and contribution fell from $40.0M to $16.0M, on 14,000 flights a year — the same number of flights in both years. I'll come back to ancillary revenu…
- **b38l-tyler-t6-self-answered-probe** (fault, t6): `{"kind":"says","pattern":"Is that something you've been given","must":false}` — t6: Understood. Across all six routes, revenue fell from $200.0M to $176.0M and contribution fell from $40.0M to $16.0M, on 14,000 flights a year — the same number of flights in both years. I'll come back to ancillary revenu…
- **b38l-tyler-t12-entrant-frequency** (fault, t12): `{"kind":"refusal","about":"frequency|once a day","must":true}` — t12: Your Port Avery per-flight math is laid out clearly. To correct one figure: on Hub–Port Avery, revenue fell from $46.8M to $32.4M and contribution fell from $13.8M to a $0.6M loss, on 3,000 flights a year. The low-cost a…
- **b38l-tyler-t14-125-vetoed** (fault, t14): `{"kind":"says","pattern":"\\$125","must":true}` — t14: Fixed costs staying put and exit being hard to reverse, understood. As for the business versus leisure fare mix on these two routes, that's not something I have. Where does that leave your analysis?
- **b38l-tyler-21m-3-6m** (fault, t6): `{"kind":"correction","figure":"$20","must":true,"scope":{"fromTurn":6,"toTurn":8}}` — t6: Understood. Across all six routes, revenue fell from $200.0M to $176.0M and contribution fell from $40.0M to $16.0M, on 14,000 flights a year — the same number of flights in both years. I'll come back to ancillary revenu… / t8: Mm-hm. Hub–Port Avery shows the same pattern: 80 seats, a 75% load factor and $20 of extras per passenger, with variable cost of $11,000 per flight in both years, while the average fare fell from $240 to $160. Here's an …; `{"kind":"correction","figure":"$3.8M","must":true,"scope":{"fromTurn":24}}` — t24: A stacked set of levers. On the price elasticity of those four routes, I'll check what we have. Repeating what I said before: On the other four routes revenue and contribution stayed nearly flat: Hub–Cedar Bluff (2,500 f… / t26: Understood. If you had to advise the CEO now, what would you recommend? / t28: Understood. What do you see as the single biggest risk to that recommendation, and how would you mitigate it?
- **b38l-tyler-t20-dangling-figure** (fault, t20): `{"kind":"says","pattern":"60%[^?]*Where did that figure come from","must":false}` — t20: Understood. On variable cost, you said $8,800 per flight. About 20% of passengers on the two contested routes are connecting at the hub to another Larkspur flight. New routes typically take 6–12 months to reach their exp…
- **b38l-tyler-t24-doubled** (fault, t24): `{"kind":"says","pattern":"Repeating what I said before: On the other four routes","must":false}` — t24: A stacked set of levers. On the price elasticity of those four routes, I'll check what we have. Repeating what I said before: On the other four routes revenue and contribution stayed nearly flat: Hub–Cedar Bluff (2,500 f…
- **b38l-marisol-t6-deferral-delivered** (fault, t6): `{"kind":"deferral","about":"results by route","must":false}` — t6: Mm-hm. Hub–Port Avery shows the same pattern: 80 seats, a 75% load factor and $20 of extras per passenger, with variable cost of $11,000 per flight in both years, while the average fare fell from $240 to $160. Here's an …
- **b38l-marisol-t12-fuel-restated** (fault, t12): `{"kind":"refusal","about":"fuel","must":true}` — t12: Understood. As I mentioned: Hub–Port Avery shows the same pattern: 80 seats, a 75% load factor and $20 of extras per passenger, with variable cost of $11,000 per flight in both years, while the average fare fell from $24…
- **b38l-marcus-t12-frequency-segment** (fault, t12): `{"kind":"refusal","about":"frequency|business","must":true}` — t12: A fair-sized set of questions. The low-cost airline's cost per seat is about 30% lower than Larkspur's — it flies larger planes and has lower labor costs — and its fares are about the same as Larkspur's current fares. Ab…
- **b38l-marcus-t24-extras-type** (fault, t24): `{"kind":"refusal","about":"type","must":true}` — t24: Understood. As the exhibit shows: Extras revenue — bags, seat selection and snacks — was $20 per passenger in both years. Before your recommendation: New routes typically take 6–12 months to reach their expected load fac…
- **b38l-marcus-t28-close-reask** (fault, t28): `{"kind":"says","pattern":"guard against that","must":false}` — t28: To guard against that, what would you put in place?
- **b38l-jasmine-t2-before-any-data** (fault, t2): `{"kind":"deferral","must":true}` — t2: A revenue-and-cost decomposition. Before any data: you've framed revenue and cost as two sides, but your revenue branch already assumes the drop is volume or price. Is that MECE, and what might be missing from your struc…
