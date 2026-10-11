# Mistake tag severity

Status: approved by Matt on 2026-10-11 with two changes (`M.premature_solution` and `M.implication_off_objective` moved to major), and applied to `lib/drills/config/taxonomy.v1.json`. These are defaults: the case grader may downgrade a finding to minor if the candidate corrected it themselves or it didn't change the conclusion, and may upgrade `M.waited_for_interviewer` to major in candidate-led cases. The finding carries the final severity. The prescription engine (D3) is the first thing that uses them.

**Why it matters:** when the app picks drills after a case, a major mistake adds 2 to its skill's priority and a minor one adds 1 (`docs/prd-drills.md`, "Prescription rules").

**Rule used:**
- **Major:** it changes the answer, sends the case down the wrong path, or would sink an MBB interview on its own.
- **Minor:** the answer survives. It costs points on polish, efficiency or depth.

**Totals:** 35 major, 32 minor (the two Defend tags from PRD v2, `M.dodged_question` and `M.inconsistent_defense`, default to minor). Math, exhibit and fact-handling mistakes are mostly major, so prescriptions will lean toward QN and EX drills. That's a deliberate choice, and it's worth a look.

## Structure (PS)

| Tag | Severity | Why |
|---|---|---|
| `M.overlapping_buckets` | minor | Analysis gets duplicated, but nothing is missed. |
| `M.missing_bucket` | **major** | The missing bucket can hold the answer. |
| `M.generic_framework` | **major** | A canned framework is one of the most common reasons interviewers reject a candidate. |
| `M.irrelevant_bucket` | minor | Wastes time but still covers what matters. |
| `M.shallow_structure` | minor | Right buckets, not broken down far enough. Can be fixed as the case goes on. |
| `M.low_value_question` | minor | Costs a little time. |
| `M.missed_key_question` | **major** | Risks solving the wrong problem, for example never confirming the objective. |
| `M.too_many_questions` | minor | Slow, but not wrong. |

## Hypothesis (HY)

| Tag | Severity | Why |
|---|---|---|
| `M.no_hypothesis` | **major** | Interviewer-led cases expect the candidate to drive by hypothesis. Without one, the analysis drifts. |
| `M.restates_facts` | minor | A weak hypothesis, but not a wrong one. |
| `M.shotgun_hypotheses` | minor | Unfocused, but the right idea is usually in the list. |
| `M.overconfident_hypothesis` | minor | A tone problem, as long as the candidate still tests it. |
| `M.untestable_hypothesis` | minor | Has to be reworded before it's useful, but it doesn't mislead. |
| `M.ignores_facts` | **major** | A hypothesis that contradicts known data sends the case the wrong way. |
| `M.sticky_hypothesis` | **major** | Holding on after the data disproves it leads to a wrong answer. |
| `M.dropped_supported_hypothesis` | **major** | Abandons the likely answer. |

## Quantitative (QN)

| Tag | Severity | Why |
|---|---|---|
| `M.arithmetic_error` | **major** | An uncorrected math error is a classic reason to reject a candidate, and it changes the number. |
| `M.zeros_error` | **major** | Off by 10× or more. |
| `M.unit_error` | **major** | The number means something else. |
| `M.wrong_base` | **major** | Wrong percentage, wrong conclusion. |
| `M.percent_vs_points` | minor | Usually a precision slip. Interviewers correct it, and it rarely flips the answer. |
| `M.growth_error` | **major** | Wrong projection. |
| `M.wrong_formula` | **major** | The whole calculation is wrong. |
| `M.missing_term` | **major** | The result is wrong, for example profit without fixed costs. |
| `M.missing_driver` | **major** | The estimate leaves out a whole component. |
| `M.double_counting` | **major** | The estimate is inflated. |
| `M.irrelevant_driver` | minor | Clutter. It usually moves the estimate little. |
| `M.unreasonable_assumption` | **major** | An implausible input makes the estimate unusable. |
| `M.implausible_accepted` | **major** | Not sanity-checking a wild result is a big red flag. |
| `M.plausible_rejected` | minor | Overly cautious, and costs time, but the number was right. |

## Exhibits (EX)

| Tag | Severity | Why |
|---|---|---|
| `M.trivial_takeaway` | minor | Correct but shallow: it reads a number instead of giving the insight. |
| `M.misread_trend` | **major** | The takeaway is wrong. |
| `M.unsupported_claim` | minor | Goes beyond the chart. A judgment slip, not a misreading. |
| `M.missed_units` | **major** | Leads to wrong numbers. |
| `M.axis_misread` | **major** | Wrong reading. |
| `M.dual_axis_misread` | **major** | Wrong reading. |
| `M.missed_footnote` | **major** | Footnotes usually hold the exhibit's trap. |
| `M.indexed_misread` | **major** | Gets which segment is bigger wrong. |
| `M.period_mismatch` | **major** | Compares things that aren't comparable. |
| `M.wrong_data_point` | **major** | Wrong number in. |

## Business judgment (BJ)

| Tag | Severity | Why |
|---|---|---|
| `M.no_implication` | minor | The analysis is right but stops short of "so what". |
| `M.implication_off_objective` | **major** | A real implication, but aimed at the wrong goal, so it doesn't answer the client's question. |
| `M.generic_risk` | minor | Weak but not wrong. |
| `M.missed_key_risk` | minor | The recommendation can stand. It's thinner without the risk. |

## Creativity (CR)

| Tag | Severity | Why |
|---|---|---|
| `M.too_few_ideas` | minor | Depth, not correctness. |
| `M.unstructured_ideas` | minor | Presentation. |
| `M.overlapping_idea_groups` | minor | Presentation. |

## Synthesis (SY)

| Tag | Severity | Why |
|---|---|---|
| `M.buried_recommendation` | minor | The right answer is there, just in the wrong place. |
| `M.hedged_recommendation` | **major** | Not committing to an answer is a common reason to reject a candidate. |
| `M.unsupported_recommendation` | **major** | An answer with no basis. |
| `M.irrelevant_facts` | minor | Clutter around a sound answer. |
| `M.ignores_deciding_fact` | **major** | Usually the wrong answer. |
| `M.missing_risk_or_next_step` | minor | The answer stands. The ending is incomplete. |
| `M.inaccurate_summary` | **major** | Gets the case's facts wrong. |

## Communication (CM)

| Tag | Severity | Why |
|---|---|---|
| `M.rambling` | minor | Delivery. |
| `M.over_word_limit` | minor | Delivery. |

## Driving the case (CL)

| Tag | Severity | Why |
|---|---|---|
| `M.waited_for_interviewer` | minor | Matters less in interviewer-led cases, which is the MVP mode. |
| `M.illogical_next_step` | **major** | Takes the case off course. |
| `M.low_priority_next_step` | minor | Reasonable, just not the best next move. |
| `M.vague_data_request` | minor | The interviewer asks for clarification. It costs time. |
| `M.laundry_list` | minor | Unfocused, but the right data is usually in the list. |
| `M.premature_solution` | **major** | Jumps to an answer before the data that should decide it. |
| `M.caved_to_invalid_pushback` | **major** | Drops a correct answer under pressure. Interviewers test for this on purpose. |
| `M.ignored_valid_pushback` | **major** | Keeps a wrong answer after being told why it's wrong. |
| `M.no_evidence_in_defense` | minor | The position may be right, just poorly defended. |

System tags (`M.timeout`, `M.skipped`) aren't mistakes from the case grader and get no severity.
