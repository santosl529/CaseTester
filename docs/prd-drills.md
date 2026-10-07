# AI Casing — Drills PRD

Oct 5, 2026 · @Matt

> Revision log
> - 2026-10-05: Saved to the repo. Applied the review fixes (test-out tier, skills with no Level 2 drill, review set size, `case_type` and next-case fallback, desktop-first, QN-3 trap precedence, scope wording, `org_id`, grading model, chart renderer). Drill specs moved into catalog order; their content is unchanged.

## Overview

Drills are short, targeted exercises that fix the specific weaknesses the AI case grader finds, so students improve between full AI case interviews. They are the practice layer of the product loop: Assess → Diagnose → Prescribe → Practice → Master → Increase difficulty → Reassess.

This PRD covers everything engineering needs to build the drills system: the skill taxonomy, 25 drills across two levels, scoring, mastery, prescriptions, content, data model, APIs, logging and cost controls. The full AI case interview and its grader are out of scope, except for the interface the grader must provide.

Drills are a parallel workstream to the case interview build (technical PRD §11). They live in the same Next.js app and Supabase project.

### Product principles

- **Recognize → Generate → Perform.** Level 1 drills train recognition using constrained options. Level 2 drills remove the options so students produce answers themselves. Full cases are the performance layer.
- **Diagnose, don't just score.** Every result names the specific mistake (for example, "unit error" or "generic framework"), not only a percentage.
- **Deterministic where possible.** Code scores anything with one right answer. The AI only answers narrow yes/no checklist questions, and code adds up the score.
- **Text only.** No drill requires voice.
- **Low running cost.** Most drills cost nothing to run. AI-graded drills use one cheap, batched call per drill set.
- **Minimal decisions.** The default action is a single "Continue Training" button.
- **Data is the advantage.** Every attempt is logged at item level so difficulty, common mistakes and drill effectiveness can be measured.

### Success metrics (proposed MVP targets)

| Metric | Target | How measured |
| --- | --- | --- |
| Prescribed drill sets completed | ≥ 70% of started sets | drill\_set\_completed / drill\_set\_started |
| Students who drill, then take another case | ≥ 50% within 14 days | Case start after a drill set completion |
| Improvement on the drilled dimension | ≥ 60% of students who reach mastery score higher on that dimension in their next comparable case | Rubric dimension score, same difficulty tier |
| Share of attempts with zero AI cost | ≥ 75% | Auto-checked attempts / all attempts |
| AI checklist agreement with human reviewers | ≥ 90% per check | Monthly sample of 100 graded answers |
| Auto-checked feedback latency | < 300 ms p95 | Server timing |
| AI-graded set results latency | < 10 s p95 | Server timing |

## Scope

The MVP ships 15 priority-0 drills covering the six skill areas undergrads most often fail, plus the full infrastructure (taxonomy, scoring, mastery, prescriptions, skill profile) that every later drill plugs into.

### Priority definitions

- **P0 — MVP launch.** Required for the first release to pilot students.
- **P1 — Fast follow.** Built in the first release after MVP, using the same infrastructure.
- **P2 — Later.** Specified here so the data model supports them; not scheduled.

### In scope

- Skill taxonomy v1, shared with the case grader (section: Skill taxonomy).
- The P0 and P1 drills in the Drill catalog, built in priority order. P2 drills are specified only, so the data model supports them; they are not built.
- Drill sessions, results screens, skill profile, Continue Training, "practice something specific" and an optional interview date.
- Auto-checked scoring, checklist grading via a cheap model, wrong-answer tags and mastery tracking.
- Rule-based prescription engine that reads case grader output.
- Content pipeline: item schema, answer keys, templated item generators, AI-assisted authoring with human QA.
- Item-level event logging for analytics.

### Out of scope

- The full AI case interview and its grader internals. This PRD only defines the output the grader must send to drills.
- Voice. No drill uses speech input or output.
- Firm-style toggles. The item schema reserves a field for them.
- Behavioral and fit interview practice.
- Career center or club admin dashboards (planned later; event logging must support them).
- Leaderboards, social features and streak mechanics.
- Statistical adaptive models (for example, item response theory). MVP uses fixed rules; the logged data will support a model later.
- Native mobile apps. Drills ship in the web app.

### Assumptions

- Students already have accounts and can complete full AI cases in the existing product.
- The transcript-grading agent can be updated to emit skill tags in the format defined in this PRD.
- Drill content follows the same clean-room, AI-authored workflow as cases, with a human author of record.
- The drills UI must meet WCAG 2.1 AA, which is a university procurement requirement.

## Core concepts and glossary

Every part of the system uses these terms with exactly these meanings; the API, database and UI copy should match them.

| Term | Definition | Example |
| --- | --- | --- |
| Rubric dimension | One of the 8 dimensions the case grader scores. Drills roll up to these. | Synthesis & Recommendation |
| Skill area | A group of related skills. Nine areas: the 8 rubric dimensions plus Hypothesis, which rolls up to Problem Structuring. | Quantitative Rigor |
| Skill | A specific ability that drills train and mastery tracks. About 30 in v1. Format `AREA.skill_name`. | `QN.percent_change` |
| Mistake tag | A specific error. Each maps to exactly one skill. Used by wrong answers, failed checks, red flags and the case grader. Format `M.mistake_name`. | `M.unit_error` |
| Level | Level 1 = Recognize (choose from options). Level 2 = Generate (produce the answer). | — |
| Difficulty tier | Tier 1–3 within a level. Higher tiers use harder items and tighter time limits. Tier 3 of Level 2 is the "under time pressure" stage. | Mental math, tier 3: 12 s per item |
| Drill | A type of exercise with fixed mechanics and scoring. 25 in the catalog. | Framework builder |
| Item | One question or prompt within a drill, with its own answer key. | "Gym chain launching at-home subscription" |
| Answer key | The authored solution for an item: correct answer and tolerance, or checklist, wrong-option tags and model answer. | — |
| Check | One yes/no question in a checklist. Answered by the AI with a quote as evidence. | "Does the first sentence state a recommendation?" |
| Red flag | A condition that caps an item's score regardless of other checks. | Generic profit tree on a market-entry prompt |
| Drill set | 3–10 items of one drill, served together. The unit of practice, scoring and AI grading. | 8 Setup-only items on breakeven |
| Attempt | One student's response to one item. | — |
| Skill state | Where a student stands on a skill: Not started, Learning, Recognizes, Mastered, Validated. | `QN.breakeven`: Recognizes |
| Prescription | A recommended drill set, generated from mistake tags, with a reason shown to the student. | "You set up the margin calculation incorrectly twice in your last case." |
| Generator | Code that creates items from a template with randomized inputs, so supply is unlimited and free. | Breakeven problem with random costs |

## User experience and flows

Students should rarely have to choose what to do: the training home leads with one Continue Training button, and every other path is optional.

### Training home

- **Continue Training** is the primary button. It shows the drill name, a one-line reason ("Your last case used a generic framework") and estimated time (for example, "about 6 min").
- Below it, up to 3 queued prescriptions are listed with their reasons.
- A secondary link, **Practice something specific**, opens the skill picker.
- A **Ready for your next case** card appears when every open prescription is at Mastered, or after 3 completed drill sets since the last case. It is a suggestion, not a lock.
- An optional **Interview date** setting sits in the header.

### What Continue Training serves (in order)

1. An unfinished drill set from the last 24 hours (resume).
2. The highest-priority open prescription (see Prescription engine).
3. A spaced review: a short set on a Mastered skill not practiced in 14+ days (see Spaced review).
4. The next difficulty tier of the student's weakest skill.
5. No case taken yet: a prompt to take a first case. In P1, a 10-minute diagnostic sampler (mixed Level 1 and 2 items across all areas) is offered as a free alternative.

### Drill intro screen

- Shows drill name, skill trained, why it was prescribed, number of items, time per item and pass bar.
- On a student's first time with a drill, shows one worked example. A "Skip example" button hides it for future sets.

### Item screen

- Prompt, any exhibit (chart or table), the input and a visible countdown timer.
- Input types: single choice, multi-select, ordering (drag or keyboard), numeric entry and free text with a live word counter that blocks typing past the cap.
- Numeric entry accepts common formats and parses them: `2.5M`, `2,500,000`, `2.5 million`, `$2.5m`, `25%`, `0.25` (where the item expects a percent, both `25` and `0.25` are accepted if the item allows it).
- When time runs out, the item auto-submits whatever is entered. Empty answers score 0 and log `M.timeout`.
- **Skip** is allowed; it scores 0 and logs `M.skipped`. Skips are excluded from mistake analysis.
- Leaving mid-set saves progress. An unfinished set expires after 24 hours; completed attempts are kept.

### Feedback timing

- **Auto-checked items:** feedback right after each item: correct or not, the right answer, a one-line explanation of the specific mistake (from the wrong-option tag) and a worked solution.
- **AI-graded items:** no per-item feedback. All answers in the set are graded in one call after the last item, and results appear on the results screen.

### Set results screen

- Set score, pass or fail against the bar, and time against target.
- A mistake summary in plain words ("2 of your 3 misses were unit errors").
- Per-item breakdown. For AI-graded items: each check passed or failed, the quoted evidence from the student's answer, any red flag, and the model answer.
- Skill state change, if any ("Breakeven: now Mastered").
- One primary next action (Continue Training) and two secondary ones (Retry this set, Take a case).

### Skill profile

- All 9 skill areas, each listing its skills with current state and a progress bar toward the next state.
- The top 3 mistakes holding the student back, from the last 30 days.
- A full-case trend line per rubric dimension. It only appears after 2 or more cases in the same difficulty tier, so progress shown is trustworthy.
- History of completed drill sets and cases.

### Practice something specific

- Pick a skill area, then a skill. The system picks the drill, level and tier from the student's skill state, and the student can override the level.

### Interview date

- Optional. When the date is 7 or fewer days away, Continue Training skips Level 1, favors Level 2 tier 3 (timed) sets and suggests a full case every 2 sets.
- When 2 or fewer days away, it serves only short review sets of Mastered skills.

### Accessibility (WCAG 2.1 AA)

- Full keyboard operation, including ordering inputs.
- Every chart has an accessible data-table alternative.
- A time-accommodation setting multiplies all time limits by 1.5× or 2×. Mastery uses the adjusted limits.
- Timers announce remaining time to screen readers at 50%, 25% and 10 seconds.

### Failure states

- If AI grading fails, retry automatically twice. If it still fails, show the auto-checked results, mark AI-graded items "Grading delayed" and complete grading in the background within 10 minutes. Never block the student.

## Skill taxonomy

Taxonomy v1 has 9 skill areas, 29 skills and about 60 mistake tags; it is the one vocabulary shared by the case grader, every drill and the prescription engine.

### Rules

- The taxonomy lives in one versioned config file (`taxonomy.v1.json`) that both the case grader and the drills service load. No tags are hard-coded anywhere else.
- Every mistake tag maps to exactly one skill. Every skill maps to exactly one skill area, and every area to one rubric dimension.
- Tags are never renamed or deleted, only marked deprecated, so historical data stays readable.
- The case grader may only emit tags in the file. The API rejects unknown tags.
- Two system tags are not mapped to skills: `M.timeout` and `M.skipped`.

### Skill areas

| Code | Skill area | Rolls up to rubric dimension |
| --- | --- | --- |
| PS | Problem Structuring | Problem Structuring |
| HY | Hypothesis | Problem Structuring |
| QN | Quantitative Rigor | Quantitative & Analytical Rigor |
| EX | Exhibit Interpretation | Data & Exhibit Interpretation |
| BJ | Business Judgment | Business Judgment & Insight |
| CR | Creativity | Creativity & Brainstorming |
| SY | Synthesis | Synthesis & Recommendation |
| CM | Communication | Communication & Delivery |
| CL | Case Leadership | Handling Pushback / Composure / Case Leadership |

### Skills and mistake tags

| Skill | What it means | Mistake tags | Trained by |
| --- | --- | --- | --- |
| `PS.mece` | Buckets don't overlap and nothing major is missing | `M.overlapping_buckets`, `M.missing_bucket` | PS-1, PS-3 |
| `PS.case_specific` | Structure fits this case, not a canned framework | `M.generic_framework`, `M.irrelevant_bucket` | PS-1, PS-3 |
| `PS.depth` | Each bucket has concrete sub-points | `M.shallow_structure` | PS-3 |
| `PS.clarifying_questions` | Asks the few questions that matter | `M.low_value_question`, `M.missed_key_question`, `M.too_many_questions` | PS-2 |
| `HY.form` | States a directional, evidence-based, testable, tentative hypothesis | `M.no_hypothesis`, `M.restates_facts`, `M.shotgun_hypotheses`, `M.overconfident_hypothesis`, `M.untestable_hypothesis`, `M.ignores_facts` | HY-1, HY-2 |
| `HY.update` | Changes the hypothesis when data contradicts it, keeps it when data supports it | `M.sticky_hypothesis`, `M.dropped_supported_hypothesis` | HY-2 |
| `QN.arithmetic` | Basic operations done correctly | `M.arithmetic_error` | QN-3, QN-4, QN-5 |
| `QN.magnitude` | Zeros and units handled correctly | `M.zeros_error`, `M.unit_error` | QN-3, QN-4, QN-5 |
| `QN.percentages` | Percent change, percent of, percentage points | `M.wrong_base`, `M.percent_vs_points` | QN-3, QN-4 |
| `QN.growth` | Growth rates and compounding | `M.growth_error` | QN-3, QN-4 |
| `QN.setup` | Chooses the right formula before calculating | `M.wrong_formula`, `M.missing_term` | QN-1, QN-4 |
| `QN.sizing_structure` | Builds a complete driver chain for an estimate | `M.missing_driver`, `M.double_counting` | QN-5 |
| `QN.assumptions` | Makes reasonable estimation assumptions | `M.unreasonable_assumption` | QN-5 |
| `QN.sanity_check` | Notices when a result is implausible | `M.implausible_accepted`, `M.plausible_rejected` | QN-2, QN-5 |
| `EX.takeaway` | Finds the insight that matters | `M.trivial_takeaway`, `M.misread_trend`, `M.unsupported_claim` | EX-1, EX-4 |
| `EX.traps` | Catches units, axes and footnotes | `M.missed_units`, `M.axis_misread`, `M.dual_axis_misread`, `M.missed_footnote` | EX-2 |
| `EX.extraction` | Pulls the right number from dense data | `M.wrong_data_point` | EX-3 |
| `BJ.so_what` | States what a finding means for the client | `M.no_implication`, `M.implication_off_objective` | BJ-1, BJ-3 |
| `BJ.risks` | Names specific, relevant risks and next steps | `M.generic_risk`, `M.missed_key_risk` | BJ-2 |
| `CR.volume` | Generates enough distinct ideas | `M.too_few_ideas` | CR-1 |
| `CR.structure` | Groups ideas into clear, non-overlapping categories | `M.unstructured_ideas`, `M.overlapping_idea_groups` | CR-1 |
| `SY.answer_first` | Leads with a clear recommendation | `M.buried_recommendation`, `M.hedged_recommendation` | SY-1, SY-2 |
| `SY.evidence` | Supports it with the right facts and numbers | `M.unsupported_recommendation`, `M.irrelevant_facts` | SY-1, SY-2 |
| `SY.complete` | Includes a risk and a next step | `M.missing_risk_or_next_step` | SY-2 |
| `SY.summary` | Summarizes progress accurately mid-case | `M.inaccurate_summary` | SY-1 |
| `CM.concise` | Says it briefly, conclusion first | `M.rambling`, `M.over_word_limit` | CM-1, CM-2 |
| `CL.next_step` | Proposes a logical next step without being prompted | `M.waited_for_interviewer`, `M.illogical_next_step` | CL-1 |
| `CL.data_requests` | Asks for specific, prioritized data | `M.vague_data_request`, `M.laundry_list`, `M.premature_solution` | CL-3 |
| `CL.pushback` | Holds when right, updates when wrong, uses evidence | `M.caved_to_invalid_pushback`, `M.ignored_valid_pushback`, `M.no_evidence_in_defense` | CL-2 |

## Drill catalog

The catalog has 25 drills: 13 at Level 1 and 12 at Level 2. 17 are scored entirely by code, and only 5 of the P0/P1 drills need an AI grading call.

| ID | Drill | Level | Skills trained | Input | Scoring | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| PS-1 | Spot the gap | 1 | `PS.mece`, `PS.case_specific` | Single choice | Auto | P0 |
| PS-2 | Clarifying questions | 1 | `PS.clarifying_questions` | Multi-select (up to 3) | Auto | P1 |
| PS-3 | Framework builder | 2 | `PS.mece`, `PS.case_specific`, `PS.depth` | Structured text editor | Checklist | P0 |
| HY-1 | Pick the best hypothesis | 1 | `HY.form` | Single choice | Auto | P0 |
| HY-2 | Initial hypothesis | 2 | `HY.form`, `HY.update` | Free text, then Keep/Revise/Drop + free text | Checklist + auto | P0 |
| QN-1 | Setup only | 1 | `QN.setup` | Single choice | Auto | P0 |
| QN-2 | Sanity check | 1 | `QN.sanity_check` | Single choice | Auto | P1 |
| QN-3 | Mental math | 2 | `QN.arithmetic`, `QN.magnitude`, `QN.percentages`, `QN.growth` | Numeric | Auto | P0 |
| QN-4 | Consulting math | 2 | `QN.setup`, `QN.arithmetic`, `QN.magnitude` | Single choice, then numeric | Auto | P0 |
| QN-5 | Market sizing | 2 | `QN.sizing_structure`, `QN.assumptions`, `QN.arithmetic`, `QN.sanity_check` | Pick drivers, numeric, single choice | Auto | P0 |
| EX-1 | Chart read | 1 | `EX.takeaway` | Single choice | Auto | P0 |
| EX-2 | Exhibit traps | 1 | `EX.traps` | Single choice or numeric | Auto | P0 |
| EX-3 | Needle in the table | 2 | `EX.extraction`, `QN.arithmetic` | Numeric | Auto | P0 |
| EX-4 | Written chart takeaway | 2 | `EX.takeaway` | Free text | Checklist | P2 |
| BJ-1 | "So what?" | 1 | `BJ.so_what` | Single choice | Auto | P1 |
| BJ-2 | Risks and next steps | 1 | `BJ.risks` | Multi-select | Auto | P1 |
| BJ-3 | Written "So what?" | 2 | `BJ.so_what` | Free text | Checklist | P2 |
| CR-1 | Bucketed brainstorm | 2 | `CR.volume`, `CR.structure` | Grouped text editor | Checklist | P1 |
| SY-1 | Pick the best summary | 1 | `SY.answer_first`, `SY.evidence`, `SY.summary` | Single choice | Auto | P0 |
| SY-2 | 60-second recommendation | 2 | `SY.answer_first`, `SY.evidence`, `SY.complete` | Free text | Checklist | P0 |
| CM-1 | Pick the answer-first version | 1 | `CM.concise` | Single choice | Auto | P2 |
| CM-2 | Answer-first rewrite | 2 | `CM.concise` | Free text | Checklist + auto | P2 |
| CL-1 | What's next? | 1 | `CL.next_step` | Single choice | Auto | P0 |
| CL-2 | Hold or fold | 1 | `CL.pushback` | Two single choices | Auto | P1 |
| CL-3 | What do you need to know? | 2 | `CL.data_requests` | Free text | Checklist | P0 |

### How to read each drill spec

Each spec below lists: how it works, set size and time limit per item by difficulty tier (T1 / T2 / T3), scoring, what the answer key contains, and where items come from. Unless a spec says otherwise, the pass bar is a set score of 80% (see Mastery and adaptive progression), items are scored from 0 to 1, and the set score is the average item score.

### PS-1 Spot the gap

- **How it works:** The student sees a case prompt and a 3–4 bucket framework with exactly one planted flaw. They pick the flaw from 4 options (for example, "Buckets 2 and 3 overlap," "Missing: competitor response," "Bucket 4 doesn't matter for this question").
- **Set and time:** 8 items. 60 / 45 / 30 s.
- **Scoring:** Auto. 1 for the correct option. Each wrong option carries a mistake tag (`M.overlapping_buckets`, `M.missing_bucket`, `M.irrelevant_bucket`, `M.generic_framework`).
- **Answer key:** Correct option, flaw type, one-line explanation, corrected framework.
- **Item source:** Derived from PS-3 model frameworks by planting one flaw. AI-drafted, human QA.

### PS-2 Clarifying questions (P1)

- **How it works:** The student sees a case prompt and 8 candidate questions and picks up to 3.
- **Set and time:** 6 items. 60 / 45 / 30 s.
- **Scoring:** Auto. The key labels each question high-value (+1), neutral (0) or low-value (−1). Item score = max(0, sum of picks) ÷ number of high-value questions. A missed high-value question logs `M.missed_key_question`; a low-value pick logs `M.low_value_question`.
- **Answer key:** Label and one-line reason per question.
- **Item source:** Authored, AI-drafted, human QA.

### PS-3 Framework builder

- **How it works:** The student sees a 1–3 sentence case prompt (client, objective, one key metric) and builds a framework in a structured editor: 2–5 buckets, each with a title and 1–4 sub-points of up to 15 words. Total cap: 120 words.
- **Set and time:** 4 items. 180 / 120 / 90 s.
- **Scoring:** Checklist, AI-graded once per set.

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Covers each must-cover area in the key (one check per area, 4–6 areas) | 50% split evenly | `M.missing_bucket` |
| No two buckets substantially overlap | 15% | `M.overlapping_buckets` |
| Every bucket is specific to this case and objective | 20% | `M.generic_framework` or `M.irrelevant_bucket` |
| Every bucket has at least one concrete sub-point | 15% | `M.shallow_structure` |

- **Red flags:** Top level is a generic revenue/cost profit tree on a non-profitability prompt (cap at 0.4, `M.generic_framework`). Fewer than 2 buckets (cap at 0.3, checked by code).
- **Deterministic pre-checks:** Code checks bucket count, empty buckets and word caps before the AI call.
- **Results show:** Each check with quoted evidence, and the key's model framework.
- **Answer key:** Must-cover areas (each with a short description and acceptable synonyms), common overlap pairs, model framework.
- **Item source:** Authored, aligned to the 14 case types. AI-drafted, human QA.

### HY-1 Pick the best hypothesis

- **How it works:** The student sees 2–3 sentences of opening facts with numbers and picks the strongest initial hypothesis from 4.
- **Set and time:** 8 items. 60 / 45 / 30 s.
- **Scoring:** Auto. Distractors are each one type of weak hypothesis: restates the facts (`M.restates_facts`), lists several causes without choosing (`M.shotgun_hypotheses`), stated as certain (`M.overconfident_hypothesis`) or too vague to test (`M.untestable_hypothesis`).
- **Answer key:** Correct option, the flaw in each distractor.
- **Item source:** Derived from HY-2 items. AI-drafted, human QA.

### HY-2 Initial hypothesis

- **How it works:** Two stages on the same item.
  1. *Form:* The student reads the opening facts ("Revenue declined 12%, but customer count increased 8%") and writes a hypothesis and why, up to 50 words.
  2. *Update:* A new fact is revealed ("Price per unit is flat; units bought per customer fell 20%"). The student taps Keep, Revise or Drop, then writes up to 30 words explaining why (including the revised hypothesis if Revise).
- **Set and time:** 4 items. Stage 1: 90 / 75 / 60 s. Stage 2: 60 / 45 / 35 s.
- **Scoring:** Stage 1 is 60% of the item, stage 2 is 40%.

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Directional: names a specific likely cause matching one of the key's hypothesis families, or another specific cause consistent with the facts | 15% | `M.restates_facts` |
| Evidence-based: uses the given facts | 15% | `M.ignores_facts` |
| Testable: clear what data would confirm or reject it | 15% | `M.untestable_hypothesis` |
| Appropriately tentative: framed as something to verify, while committing to one direction | 15% | `M.overconfident_hypothesis` |
| Update decision correct (auto) | 25% | `M.sticky_hypothesis` or `M.dropped_supported_hypothesis` |
| Update reason uses the new fact | 15% | `M.sticky_hypothesis` |

- **How the update decision is auto-checked:** During grading, the AI also classifies the stage 1 hypothesis into one of the key's 3–4 hypothesis families, or "other." The key states the correct action for each family given the new fact. Code compares the student's tap to it. For "other," Revise and Drop are both accepted.
- **Red flags:** Restates the facts with no cause (stage 1 capped at 0.3). Lists 3 or more causes without picking one (stage 1 capped at 0.5, `M.shotgun_hypotheses`).
- **Answer key:** Hypothesis families with descriptions, the new fact, correct action per family with reason, a model answer for each stage.
- **Item source:** Authored. Each item's new fact must support at least one family and contradict at least one. AI-drafted, human QA.

### QN-1 Setup only

- **How it works:** The student sees a business scenario with numbers and picks the correct calculation from 4 expressions, without solving it. Example: "Fixed costs are $2M; price is $50; variable cost is $10 per unit. Which gives breakeven units?"
- **Set and time:** 10 items. 40 / 30 / 20 s.
- **Scoring:** Auto. Distractors are common wrong setups, each tagged `M.wrong_formula` (for example, dividing by price instead of contribution per unit) or `M.missing_term` (for example, ignoring fixed costs).
- **Answer key:** Generated: correct expression, distractor expressions, one-line explanation per distractor.
- **Item source:** Generators (see Content system). Templates: profit, gross and operating margin, contribution margin, breakeven units and revenue, payback period, simple NPV with given discount factors, market share, CAGR, price and volume effect on revenue, capacity utilization, simple customer lifetime value.

### QN-2 Sanity check (P1)

- **How it works:** The student sees a claim ("A coffee chain with 50 stores has $2B in annual revenue") and picks Plausible, Too high or Too low.
- **Set and time:** 10 items. 30 / 20 / 15 s.
- **Scoring:** Auto. Wrong answers log `M.implausible_accepted` or `M.plausible_rejected`.
- **Answer key:** Correct choice and a one-line benchmark calculation ("50 stores × about $1M each ≈ $50M").
- **Item source:** Generator using a reviewed table of benchmark ranges (revenue per store, per employee, per customer and so on), plus authored items.

### QN-3 Mental math

- **How it works:** Rapid-fire numeric problems with no calculator: multiplication and division with large zeros, percent of, percent change, percentage points, growth over 1–3 periods, fractions to percents.
- **Set and time:** 10 items. 30 / 20 / 12 s. Tiers also raise number complexity (T1 round numbers, T3 two significant figures with uneven zeros).
- **Set composition:** 70% of items target the prescribed skill (for example, `QN.percentages`), 30% mixed review.
- **Scoring:** Auto. Each item sets its tolerance: exact for integer results, ±1% where rounding is expected.
- **Deterministic error diagnosis:** Each generated item precomputes "trap values" so code can name the mistake. Checks run in this order, and the first match wins:
  1. Answer equals the result of a named wrong method → that method's tag: percent change using the new value as the base (`M.wrong_base`), percent vs percentage points (`M.percent_vs_points`), simple instead of compound growth (`M.growth_error`).
  2. Answer equals correct × 10^k (k ≠ 0) → `M.zeros_error`.
  3. Anything else outside tolerance, however far off → `M.arithmetic_error`.
- **Item source:** 100% generators. No authored items.

### QN-4 Consulting math

- **How it works:** A business word problem in two steps.
  1. Pick the correct formula from 4 options (same mechanics as QN-1).
  2. Enter the numeric answer. After step 1, the correct formula is shown regardless of the student's pick, so step 2 measures calculation only.
- **Set and time:** 6 items. 90 / 60 / 45 s per item, both steps combined.
- **Scoring:** Auto. Step 1 is 40% of the item, step 2 is 60%. Step 1 errors log `M.wrong_formula` or `M.missing_term`; step 2 errors use the QN-3 trap-value diagnosis.
- **Answer key:** Generated: formula options, correct answer, tolerance, trap values, worked solution.
- **Item source:** Generators, same templates as QN-1 with business context sentences.

### QN-5 Market sizing

- **How it works:** A sizing prompt ("Estimate annual US spending on dog grooming") in four steps.
  1. *Structure:* From 6–8 driver cards, pick the ones that form the estimate (for example, US households → % with a dog → grooming visits per year → price per visit). Distractor cards include drivers that double count ("number of dogs" alongside "dog-owning households") or don't belong.
  2. *Assumptions:* Enter a number for each driver. An optional one-line reason field is stored but not scored in MVP.
  3. *Calculation:* Enter the final estimate.
  4. *Sanity check:* Pick Seems reasonable, Seems too high or Seems too low.
- **Avoiding double penalties:** If step 1 is wrong, the key's driver set is shown and used for steps 2–4. Step 3 is checked against the student's own assumptions, not the key's.
- **Set and time:** 3 items. 300 / 240 / 180 s per item.
- **Scoring:** Auto.

| Step | Weight | How it's checked | Failed step logs |
| --- | --- | --- | --- |
| Structure | 35% | Selected set matches one of the key's 1–2 accepted driver sets | `M.missing_driver`, `M.double_counting` |
| Assumptions | 30% split evenly per driver | Each value inside the key's accepted range | `M.unreasonable_assumption` |
| Calculation | 25% | Within ±2% of the product of the student's own assumptions | QN-3 trap-value diagnosis |
| Sanity check | 10% | Correct relative to the key's benchmark range: "too high" or "too low" is correct if the estimate is more than 3× outside it | `M.implausible_accepted`, `M.plausible_rejected` |

- **Answer key:** Driver cards with valid or distractor labels, accepted driver sets, accepted range per driver (wide enough to accept reasonable estimates, typically ±50% around a central value) with its source or reasoning, benchmark range for the total, model walkthrough.
- **Item source:** Authored. Every range needs a recorded source or a written derivation in the key. AI-drafted, human QA.

### EX-1 Chart read

- **How it works:** The student sees one sentence of case context ("The client wants to know why profit fell"), a chart and 4 takeaways, and picks the one that matters most for the client's question. The chart stays visible while the timer runs.
- **Set and time:** 8 items. 45 / 35 / 25 s.
- **Scoring:** Auto. Distractors are each tagged: true but unimportant (`M.trivial_takeaway`), a misreading of the chart (`M.misread_trend`) or not supported by the data (`M.unsupported_claim`).
- **Answer key:** Correct takeaway, the flaw in each distractor, the specific data point that proves the correct answer.
- **Item source:** Charts rendered from a JSON data spec (bar, line, stacked bar, waterfall, dual axis, simple table). Data and takeaways are AI-drafted with human QA; P1 adds generator templates.

### EX-2 Exhibit traps

- **How it works:** The chart contains one planted trap, and the question can only be answered correctly by catching it. Trap types: units (thousands vs millions), truncated axis, dual axis, footnote excluding a segment, indexed vs absolute values, percent vs percentage points, mismatched time periods.
- **Set and time:** 8 items. 60 / 45 / 30 s.
- **Scoring:** Auto (single choice or numeric). Each wrong option or trap value is tagged with the trap missed (`M.missed_units`, `M.axis_misread`, `M.dual_axis_misread`, `M.missed_footnote`).
- **Answer key:** Trap type, correct answer, wrong-answer tags, explanation pointing to the exact chart element.
- **Item source:** Generator templates per trap type, rendered with the shared chart renderer.

### EX-3 Needle in the table

- **How it works:** A dense table (5–8 columns, 6–12 rows) and a question that needs 1–2 values from it plus a simple calculation. Numeric answer.
- **Set and time:** 6 items. 90 / 60 / 45 s.
- **Scoring:** Auto. The generator precomputes answers that use a neighboring cell (wrong row, column or year); matching one logs `M.wrong_data_point`. Other misses use the QN-3 trap-value diagnosis.
- **Answer key:** Generated: correct answer, tolerance, cells used, neighbor-cell trap values, worked solution.
- **Item source:** 100% generators.

### EX-4 Written chart takeaway (P2)

- **How it works:** Same charts and context as EX-1, but the student writes the takeaway (up to 40 words).
- **Set and time:** 6 items. 60 / 45 / 35 s.
- **Scoring:** Checklist. Names the key insight in the key (50%, `M.trivial_takeaway`); cites a specific number from the chart (25%, `M.unsupported_claim`); connects it to the client's question (25%, `M.trivial_takeaway`). Red flag: a claim the chart contradicts (cap 0.3, `M.misread_trend`).

### BJ-1 "So what?" (P1)

- **How it works:** The student sees a finding and the client's objective ("Option A pays back in 4 years; the client requires 3") and picks the best implication from 4.
- **Set and time:** 8 items. 45 / 35 / 25 s.
- **Scoring:** Auto. Distractors that restate the finding log `M.no_implication`; ones that ignore the client's objective log `M.implication_off_objective`.
- **Item source:** Authored. AI-drafted, human QA.

### BJ-2 Risks and next steps (P1)

- **How it works:** The student sees a recommendation and 8 possible risks or next steps, and selects every one that is specific and relevant. 3–4 are correct.
- **Set and time:** 6 items. 60 / 45 / 35 s.
- **Scoring:** Auto. Item score = max(0, correct picks − wrong picks) ÷ number correct. Picking a generic option ("execution risk") logs `M.generic_risk`; missing a correct one logs `M.missed_key_risk`.
- **Item source:** Authored. AI-drafted, human QA.

### BJ-3 Written "So what?" (P2)

- **How it works:** Same items as BJ-1, but the student writes the implication (up to 40 words).
- **Scoring:** Checklist. States what it means for the decision (40%, `M.no_implication`); ties it to the client's objective (35%, `M.implication_off_objective`); suggests what to look at next (25%, `M.no_implication`).

### CR-1 Bucketed brainstorm (P1)

- **How it works:** A prompt ("How could an airline increase revenue beyond ticket sales?"). In a grouped editor, the student creates 2–5 category headers and lists ideas under each (up to 12 words per idea).
- **Set and time:** 3 items. 90 / 75 / 60 s.
- **Scoring:** Checklist plus code. The AI returns a structured list of distinct valid ideas (duplicates and invalid ideas removed) and answers the checks; code computes the score.

| Component | Weight | How it's scored | Failed component logs |
| --- | --- | --- | --- |
| Volume | 40% | min(valid distinct ideas ÷ target, 1). Target set in the key, typically 8 | `M.too_few_ideas` |
| Coverage | 30% | One check per key category (typically 4–5): does at least one idea fall in it? | `M.too_few_ideas` |
| Categories | 30% | Categories don't overlap (15%); ideas sit in the right category (15%) | `M.overlapping_idea_groups` |

- **Red flag:** Only one category, or no categories (cap 0.5, `M.unstructured_ideas`, checked by code).
- **Answer key:** Key categories with example ideas, target count, model answer.
- **Item source:** Authored. AI-drafted, human QA.

### SY-1 Pick the best summary

- **How it works:** The student sees a short case fact sheet (or a partial case for mid-case items) and picks the best recommendation or summary from 4.
- **Set and time:** 8 items. 60 / 45 / 35 s.
- **Scoring:** Auto. Distractors are each tagged: recommendation buried at the end (`M.buried_recommendation`), hedged with no clear answer (`M.hedged_recommendation`), padded with irrelevant facts (`M.irrelevant_facts`), no numbers in support (`M.unsupported_recommendation`) or misstating progress (`M.inaccurate_summary`).
- **Item source:** Derived from SY-2 fact sheets. AI-drafted, human QA.

### SY-2 60-second recommendation

- **How it works:** The student sees the client's question and a fact sheet of 5–6 facts, 1–2 of them irrelevant, and writes a recommendation of up to 120 words, roughly what a candidate says in 60 seconds. Time limits allow for typing speed.
- **Set and time:** 3 items. 180 / 120 / 90 s.
- **Scoring:** Checklist, AI-graded once per set.

| Check | Weight | Failed check logs |
| --- | --- | --- |
| First sentence states a clear recommendation | 20% | `M.buried_recommendation` |
| Gives 2–3 supporting reasons | 15% | `M.unsupported_recommendation` |
| Reasons cite numbers from the fact sheet (code pre-check: at least one fact-sheet number appears) | 15% | `M.unsupported_recommendation` |
| Leaves out the irrelevant facts | 15% | `M.irrelevant_facts` |
| Supporting points are consistent with the facts | 15% | `M.unsupported_recommendation` |
| Includes a risk | 10% | `M.missing_risk_or_next_step` |
| Includes a next step | 10% | `M.missing_risk_or_next_step` |

- **Red flags:** No clear position, for example "it depends" (cap 0.4, `M.hedged_recommendation`). A claim that contradicts the fact sheet (cap 0.5).
- **Answer key:** The correct recommendation (or 2 acceptable ones), which facts are relevant, key risks and next steps, model answer.
- **Item source:** Authored, one per case type. AI-drafted, human QA.

### CM-1 Pick the answer-first version (P2)

- **How it works:** The student sees a rambling answer and picks the best rewrite from 4.
- **Set and time:** 8 items. 45 / 35 / 25 s.
- **Scoring:** Auto. Distractors that still bury the conclusion log `M.rambling`; ones that drop key facts log `M.rambling`.

### CM-2 Answer-first rewrite (P2)

- **How it works:** The student rewrites a 100–150 word rambling answer in 50 words or fewer.
- **Scoring:** Word cap enforced by code (`M.over_word_limit` if exceeded on paste). Checklist: leads with the conclusion (40%); keeps each key fact in the key (40% split evenly); adds no new claims (20%). Failed checks log `M.rambling`.

### CL-1 What's next?

- **How it works:** The student sees where a case stands (the objective, what has been learned, the latest finding) and picks the best next step from 4.
- **Set and time:** 8 items. 45 / 35 / 25 s.
- **Scoring:** Auto. Wrong options log `M.illogical_next_step`, and each has its own feedback line (already answered, off the objective, or jumps to a solution too early).
- **Item source:** Authored, drawn from case-type interviewer guides. AI-drafted, human QA.

### CL-2 Hold or fold (P1)

- **How it works:** The student sees a conclusion with its supporting work, followed by a scripted challenge from the interviewer.
  1. Tap **Hold** or **Update**.
  2. Pick the best reason from 4: one cites the evidence; distractors defer to authority ("You're the expert"), repeat the conclusion without evidence, or cite something irrelevant.
- **Set and time:** 8 items. 60 / 45 / 35 s.
- **Set composition:** Half the challenges are valid and half are not, in random order, so students can't learn to always hold.
- **Scoring:** Auto. Decision 60%, reason 40%. Holding against a valid challenge logs `M.ignored_valid_pushback`; updating on an invalid one logs `M.caved_to_invalid_pushback`; a weak reason logs `M.no_evidence_in_defense`.
- **Answer key:** Whether the challenge is valid and why, correct reason, the flaw in each distractor.
- **Item source:** Authored. AI-drafted, human QA.

### CL-3 What do you need to know?

- **How it works:** The student sees a mid-case situation ("The client's margins declined from 20% to 11% over 3 years") and writes what information they'd request and where they'd start, up to 60 words.
- **Set and time:** 4 items. 90 / 75 / 60 s.
- **Scoring:** Checklist, AI-graded once per set.

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Breaks the metric into its drivers | 25% | `M.laundry_list` |
| Covers each main driver in the key (one check per driver, typically 3–4) | 25% split evenly | `M.vague_data_request` |
| States where to start | 15% | `M.laundry_list` |
| Gives a reason for starting there | 10% | `M.laundry_list` |
| Data requests are specific (name a metric plus a cut or time period) | 25% | `M.vague_data_request` |

- **Red flags:** Proposes solutions before diagnosing (cap 0.5, `M.premature_solution`). Six or more unstructured requests (cap 0.5, `M.laundry_list`).
- **Answer key:** Driver breakdown, best starting point with reason, examples of specific vs vague requests, model answer.
- **Item source:** Authored. AI-drafted, human QA.

## Scoring system

Code computes every score; the AI's only job is to answer narrow yes/no checks about free-text answers and quote the evidence, and code verifies those quotes before using them.

### Item scoring rules

| Input type | Item score | Mistake tags come from |
| --- | --- | --- |
| Single choice | 1 if correct, else 0 | The tag on the chosen wrong option |
| Multi-select | max(0, correct picks − wrong picks) ÷ number of correct options | Tags on wrong picks and on missed correct options |
| Numeric | 1 if within the item's tolerance, else 0 | Trap-value match (QN-3 precedence), else `M.arithmetic_error` |
| Multi-step (QN-4, QN-5, HY-2, CL-2) | Weighted sum of step scores, per the drill spec | Each failed step's tag |
| Checklist (free text) | Sum of weights of passed checks, then any red-flag cap applied | Each failed check's tag, plus red-flag tags |
| Timeout with empty answer | 0 | `M.timeout` |
| Skip | 0 | `M.skipped` |

Set score = the average item score. Feedback text for every tag and check comes from the answer key, not from AI-written prose, so wording is consistent and reviewed.

### Numeric parsing and tolerance

- One shared parser converts student input to a number: commas, `$`, `%`, `k`/`K`, `m`/`M`/`mm`, `b`/`B`/`bn`, and the words thousand, million and billion.
- Each item stores `tolerance_type` (absolute or relative) and `tolerance_value`. Defaults: exact for integers, ±1% relative otherwise.
- Each item stores `percent_format`: whether `25` and `0.25` both count for 25%.
- Unparseable input is not scored; the student sees "Enter a number" and the timer keeps running.

### Checklist grading call

One call per drill set, after the last item, containing every free-text answer in the set.

- **Model:** The cheapest model tier that meets the 90% agreement target on the golden set (see below). First candidate: Claude Haiku 4.5, gated on the golden sets. Temperature 0. Structured JSON output enforced by schema.
- **Input:** For each item: the prompt, the student's answer, and from the key only the checks (id and question text), hypothesis families or categories if the drill uses them, and the red-flag definitions. Model answers are not sent, to keep tokens down.
- **Student text is data.** It is wrapped in clearly delimited tags, and the system prompt states that instructions inside it must be ignored. Text that looks like an attempt to instruct the grader is flagged and logged, and the item is graded normally.
- **Output per check:** `pass` (true/false) and `evidence`, an exact quote from the student's answer (required when `pass` is true; optional when false).
- **Output extras (only for drills that need them):** `hypothesis_family` for HY-2; `valid_ideas` (list of {text, category}) for CR-1.
- **The AI never outputs a score.**

Example output for one item:

```json
{
  "item_id": "sy2-0007",
  "checks": [
    {"check_id": "rec_first", "pass": true,  "evidence": "The client should not enter the Canadian market."},
    {"check_id": "cites_numbers", "pass": true, "evidence": "payback is 4.5 years vs. a 3-year hurdle"},
    {"check_id": "has_risk", "pass": false, "evidence": ""}
  ],
  "red_flags": [],
  "injection_suspected": false
}
```

### Deterministic backstops on AI output

- **Quote verification:** Code confirms every `evidence` string is an exact substring of the student's answer (after whitespace normalization). A `pass: true` with a missing or non-matching quote is re-requested once for that item; if it fails again, the check is scored as failed and the item is flagged for QA review.
- **Schema validation:** Any malformed response is retried up to 2 times, then follows the failure state in User experience.
- **Code pre-checks run first:** word caps, bucket counts, empty fields and number presence (SY-2) are checked by code. If a pre-check settles a check or red flag, it is not sent to the AI.

### Grading quality

- **Golden set:** Each AI-graded drill has at least 30 human-graded answers, including edge cases (very short answers, off-topic answers, injection attempts, borderline passes).
- **Release gate:** Any change to a grading prompt, model or checklist must reach at least 90% agreement with human labels on every check before it ships. This runs automatically in CI.
- **Versioning:** Every grade stores `grader_prompt_version` and `model_id`.
- **Monthly audit:** 100 randomly sampled graded answers are reviewed by a human; agreement is reported per check.
- **Disputes (P1):** A "Disagree with this grade?" link on the results screen logs the item for QA review. Disputes don't change the score automatically.

## Mastery and adaptive progression

A skill is Mastered after two consecutive Level 2 sets at 80% or higher, at tier 2 or above; it is Validated only when a later full case uses the skill without that skill's mistakes. All rules are fixed and stored in a config file so they can be tuned without changing code.

### Skill score from a set

- Every item and every checklist check maps to one or more skills (checks map through their failure tag).
- A set's score for a skill = the weighted average of the items and checks tied to that skill.
- A set counts toward a skill only if it contains at least 3 items or checks for that skill.

### Skill states and transitions

| From | To | Condition |
| --- | --- | --- |
| Not started | Learning | First prescription, or first set completed for the skill |
| Learning | Recognizes | 2 consecutive Level 1 sets ≥ 80% on the skill, at T2 or above |
| Learning | Recognizes and Mastered | Test-out: 2 consecutive Level 2 sets ≥ 80% at T2 or above, with no Level 1 sets needed |
| Recognizes | Mastered | 2 consecutive Level 2 sets ≥ 80% on the skill, at T2 or above |
| Mastered | Validated | The next full case marks the skill as observed and logs none of its mistake tags |
| Mastered or Validated | Recognizes | A full case logs any of the skill's mistake tags, or a spaced review scores below 60% |

**Skills with no live Level 2 drill.** Some skills are trained only by Level 1 drills: `SY.summary`, `EX.traps` and `CL.next_step` have no Level 2 drill in the catalog, and `BJ.so_what` and `BJ.risks` have none until BJ-3 (P2) ships. These skills start at Level 1, and the Level 1 criteria (2 consecutive Level 1 sets ≥ 80% at T2 or above) grant Recognizes and Mastered together. The skill profile shows them as Mastered with no extra label.

### Where a student starts on a skill

1. The first set for a newly prescribed skill is Level 2, tier 2. This is the test-out attempt, and because it is at T2 it counts toward Mastered. Skills with no live Level 2 drill start at Level 1, tier 2 instead.
2. If that set scores below 50%, the next set drops to Level 1.
3. If it scores 50–79%, the student repeats Level 2.
4. If it scores 80% or higher, it counts toward Mastered.
5. During interview-date mode (7 or fewer days out), Level 1 is never served, except for skills with no live Level 2 drill.

### Difficulty tiers

- Each student has a current tier per drill, starting at T1. The test-out set is the exception: it is served at T2 and sets the drill's tier from its result.
- A set at 80% or higher moves the student up one tier (max T3). A set below 50% moves them down one tier (min T1). Anything in between keeps the tier.
- Only T2 and T3 sets count toward state changes. T3 is the "under time pressure" stage; the profile shows a "Timed" badge when a Mastered skill passes a T3 set.

### Spaced review

- A Mastered or Validated skill not practiced for 14 days becomes eligible for review.
- A review set uses the highest live level for the skill (Level 2 where a Level 2 drill exists, otherwise Level 1), at the student's current tier.
- A review set is half the normal set size, rounded up. Drills with 4 or fewer items per set (PS-3, HY-2, QN-5, SY-2, CL-3, CR-1) use their full set size, so the review still meets the 3-items-or-checks minimum and counts toward the skill.
- At 80% or higher, the review clock resets. Below 60%, the skill drops to Recognizes. In between, another review is scheduled for 7 days later.

### Progress bar toward the next state

The skill profile shows how many qualifying sets the student has (0, 1 or 2 of 2) and their most recent skill score against the 80% bar, in plain words: "1 of 2 passing sets. Last score: 74%. Need 80%."

## Prescription engine and case grader integration

Prescriptions are produced by fixed rules from the case grader's mistake tags: up to 3 per case, each tied to a quoted moment from the transcript. No AI call is involved.

### What the case grader must send

The transcript-grading agent must emit this payload when a case is graded. The drills service rejects payloads with tags not in the current taxonomy file.

```json
{
  "case_attempt_id": "ca_81f2",
  "student_id": "st_1093",
  "case_id": "case_01_hearthline",
  "case_type": "market_entry",
  "difficulty_tier": 2,
  "completed_at": "2026-10-05T18:22:00Z",
  "taxonomy_version": "v1",
  "rubric_scores": {"problem_structuring": 2.5, "quantitative_rigor": 3.0},
  "skills_observed": ["PS.mece", "QN.setup", "SY.answer_first"],
  "findings": [
    {
      "tag": "M.wrong_formula",
      "severity": "major",
      "turn_ids": [14, 15],
      "evidence": "so breakeven is two million divided by fifty dollars"
    }
  ]
}
```

- `skills_observed` lists every skill the case gave the student a chance to show, whether or not they made mistakes. It is needed to set skills to Validated.
- `severity` is `minor` or `major`, defined per tag in the taxonomy file.
- `evidence` must be an exact quote from the transcript. The drills service shows it to the student in the prescription reason.
- The grader changes needed to emit this payload are deferred; the case grader will be updated later. Until then, drills are built and tested against fixture payloads.

### Prescription rules

1. Map each finding's tag to its skill.
2. Give each skill a priority score: +2 per major finding, +1 per minor finding, +2 if the same skill was flagged in the previous case, +1 if the skill was Mastered or Validated (a regression).
3. Remove skills with no live drill. Their findings still appear in case feedback.
4. Take the 3 highest-scoring skills. Ties go to the skill in the lower state, then to the skill whose drill is listed first in the catalog.
5. For each skill, choose the drill from the tag-to-drill map in config (for example, `M.zeros_error` → QN-3 with a magnitude focus; `M.generic_framework` → PS-3), and the level and tier from the Mastery rules.
6. Write the reason from a template using the tag and the evidence quote: "In your last case you said '…two million divided by fifty dollars.' Breakeven uses contribution per unit, not price."

### Prescriptions inside drills

- If one mistake tag accounts for 40% or more of a completed set's misses, the next set for that skill focuses on that tag (for example, 70% of mental math items become zeros problems).
- If a set reveals a mistake belonging to a different skill (for example, a zeros error in the QN-5 calculation step), that skill gets a prescription with priority +1, placed behind the case prescriptions.

### Lifecycle

- A prescription stays open until its skill reaches Mastered, or until a newer case regenerates the list.
- When a newer case arrives, open prescriptions are recalculated. A drill set already in progress is kept and finishes normally.
- Students can dismiss a prescription. Dismissals are logged and the skill is not re-prescribed until another case flags it.

### Picking the next case

When the "Ready for your next case" card appears, it recommends one case:

1. The case type whose main skill falls in the skill area of the most recently Mastered prescribed skill, so the case retests it.
2. The same difficulty tier as the student's last case, or one tier higher if all rubric dimensions in that case met the tier's bar.
3. A case the student hasn't taken.

This needs a `case_type` field on every case (added to the case schema) and a config map from each of the 14 case types' main skill to a skill area.

**Fallback while the case library is small.** Until enough cases exist for rules 1 and 2 to choose meaningfully, the card recommends any case the student hasn't taken.

### Updating skill state from cases

- Any finding on a Mastered or Validated skill drops it to Recognizes.
- A Mastered skill listed in `skills_observed` with no findings becomes Validated.
- Rubric trends on the skill profile compare only cases in the same difficulty tier and appear after 2 or more such cases.

## Content system

Items come from two sources: code generators for anything numeric (unlimited and free), and AI-drafted, human-reviewed items for judgment-heavy drills. Both produce the same item format with a complete answer key.

### Item format

```json
{
  "item_id": "ps3-0012",
  "version": 3,
  "drill_id": "PS-3",
  "status": "live",
  "level": 2,
  "tier": 2,
  "skills": ["PS.mece", "PS.case_specific", "PS.depth"],
  "case_type": "market_entry",
  "prompt": "A regional gym chain is considering launching an at-home fitness subscription...",
  "exhibit": null,
  "input": {"type": "structured_buckets", "max_buckets": 5, "max_words": 120},
  "options": [],
  "numeric": null,
  "checks": [
    {"check_id": "cover_demand", "question": "Does the framework cover customer demand for at-home fitness?",
     "weight": 0.10, "fail_tag": "M.missing_bucket", "feedback": "You didn't test whether members want this."}
  ],
  "red_flags": [
    {"id": "generic_profit_tree", "definition": "Top level is only revenue and costs",
     "cap": 0.4, "tag": "M.generic_framework", "detection": "ai"}
  ],
  "model_answer": "...",
  "explanation": "...",
  "sources": [],
  "authorship": {"author_of_record": "...", "drafting_model": "...", "reviewed_by": "...",
                 "reviewed_at": "...", "similarity_check": "passed"},
  "firm_style": null
}
```

- `options` (choice drills): each option has `id`, `text`, `correct`, `tag` (for wrong options) and `feedback`.
- `numeric` (numeric drills): `answer`, `tolerance_type`, `tolerance_value`, `percent_format`, `trap_values` (each with `value` and `tag`).
- Drill-specific extras live in `extras`: hypothesis families and the update fact (HY-2), driver cards and ranges (QN-5), key categories and target count (CR-1), relevant and irrelevant facts (SY-2).
- `firm_style` is reserved for future firm-style toggles.
- Items are versioned. Any edit creates a new version; attempts store the version they used.

### Generators

- One code module per template (for example, `breakeven_units`, `percent_change`, `table_lookup_yoy`). Each takes a seed and a tier and returns a complete item, answer key and trap values.
- Tiers control number difficulty: T1 uses round numbers, T2 adds one uneven figure, T3 uses two significant figures and uneven zeros.
- Generated items are not stored as rows. Each attempt stores `template_id`, `template_version` and `seed`, so the exact item can be rebuilt for review.
- Each generator ships with unit tests that confirm: the answer recomputes correctly, all options are distinct, trap values differ from the correct answer and from each other, and no answer depends on a calculator-only step at T1.

### Chart renderer

- One shared component turns a JSON chart spec (type, series, axes, units, footnotes) into an accessible SVG with a matching data table for screen readers. It is hand-rolled SVG with no charting dependency.
- Supported types at launch: bar, grouped bar, stacked bar, line, waterfall, dual axis and table.
- The spec supports deliberate traps (truncated axis start, units label, footnote) as explicit fields, so EX-2 generators can set them.
- If possible, the same renderer should be used for case exhibits so students see a consistent style.

### Authored items

- Drafted by AI from a drill-specific authoring prompt and the drill spec in this PRD, following the same clean-room workflow as cases.
- Every item is reviewed by a human before going live. The reviewer confirms: the answer is correct; each distractor is wrong for exactly the reason its tag states; the prompt has one defensible best answer; numbers and facts are plausible; no third-party content is reused; the similarity check passed.
- The reviewer becomes the author of record.

### Launch pool sizes (P0)

| Drill | Authored items at launch | Reason |
| --- | --- | --- |
| PS-1 Spot the gap | 80 | 10 sets before repeats |
| PS-3 Framework builder | 40 | 10 sets before repeats |
| HY-1 Pick the best hypothesis | 80 | 10 sets before repeats |
| HY-2 Initial hypothesis | 40 | 10 sets before repeats |
| QN-5 Market sizing | 30 | 10 sets before repeats |
| EX-1 Chart read | 80 | 10 sets before repeats |
| SY-1 Pick the best summary | 80 | 10 sets before repeats |
| SY-2 60-second recommendation | 30 | 10 sets before repeats |
| CL-1 What's next? | 80 | 10 sets before repeats |
| CL-3 What do you need to know? | 40 | 10 sets before repeats |

QN-1, QN-3, QN-4, EX-2 and EX-3 are fully generated and need no authored pool.

### Serving rules

- A student never sees the same authored item twice within 60 days. When a student exhausts a pool, the items they saw longest ago are reused.
- Sets mix items across case types where possible.

### Item health

- After 50 attempts, each item's correct rate, average time and option distribution are checked daily.
- Items with a correct rate below 15%, or where one distractor is picked more often than the correct answer, are automatically pulled to review.
- Items above 95% correct are flagged as too easy.
- Authored items are re-tiered from observed correct rates: T1 if 70% or higher, T2 if 40–69%, T3 if below 40%.

## Data model

The drills system needs 11 tables (12 with P1 disputes) plus 3 versioned config files; the attempts table is the most important, because it is the item-level record everything else is computed from.

### Config files (versioned, loaded at startup)

- `taxonomy.vN.json`: skill areas, skills, mistake tags (with severity and skill mapping), deprecations.
- `drills.vN.json`: per drill: id, name, level, skills, input type, scoring type, set size, time limits per tier, pass bar, priority, live flag.
- `rules.vN.json`: mastery thresholds, tier step rules, spaced review intervals, prescription weights, tag-to-drill map, case-type-to-skill-area map.

Config files live in the repo and are validated with zod at startup. Changing a value needs a deploy but no code change.

### Tables

| Table | Key fields | Notes |
| --- | --- | --- |
| `student_drill_settings` | student\_id, time\_multiplier (1, 1.5, 2), interview\_date, skipped\_examples\[\] | Extends the existing student record |
| `items` | item\_id, version, drill\_id, status (draft, in\_review, live, retired), tier, skills\[\], payload (JSON, per Content system), authorship (JSON), created\_at | Authored items only; generated items are rebuilt from seeds |
| `item_stats` | item\_id, version, attempts, correct\_rate, avg\_time\_ms, option\_counts (JSON), computed\_at | Refreshed daily |
| `drill_sets` | set\_id, student\_id, drill\_id, level, tier, source (prescription, continue, specific, review, diagnostic), prescription\_id, focus\_tag, status (in\_progress, grading, completed, expired), set\_score, passed, skill\_scores (JSON), started\_at, completed\_at | One row per set |
| `attempts` | attempt\_id, set\_id, student\_id, position, item\_id + item\_version **or** template\_id + template\_version + seed, response (JSON), time\_ms, time\_limit\_ms, timed\_out, skipped, score, step\_scores (JSON), mistake\_tags\[\], check\_results (JSON: check\_id, pass, evidence), red\_flags\[\], grading\_status, grader\_prompt\_version, model\_id, submitted\_at | One row per item answered. Never deleted |
| `grading_jobs` | job\_id, set\_id, status, retries, input\_tokens, output\_tokens, cost\_usd, latency\_ms, error, created\_at | One row per AI grading call |
| `drill_tiers` | student\_id, drill\_id, current\_tier, updated\_at | Current tier per student per drill |
| `skill_states` | student\_id, skill\_id, state, l1\_passing\_streak, l2\_passing\_streak, last\_skill\_score, last\_practiced\_at, next\_review\_at, updated\_at | Current state per student per skill |
| `skill_state_events` | student\_id, skill\_id, from\_state, to\_state, reason, source\_type (set, case, review), source\_id, created\_at | Full history, for the profile and analytics |
| `case_results` | case\_attempt\_id, student\_id, case\_id, case\_type, difficulty\_tier, rubric\_scores (JSON), skills\_observed\[\], findings (JSON), taxonomy\_version, received\_at | Written from the case grader payload |
| `prescriptions` | prescription\_id, student\_id, skill\_id, drill\_id, level, tier, focus\_tag, priority, reason\_text, evidence\_quote, source\_type (case, drill), source\_id, status (open, in\_progress, completed, dismissed, superseded), created\_at, closed\_at | Open prescriptions drive Continue Training |
| `grade_disputes` (P1) | dispute\_id, attempt\_id, student\_comment, status, reviewer\_notes, created\_at | QA queue |

The student's `org_id` (school or club) is a nullable field on the user record, set from the club code at signup. Events read it from there.

### Data rules

- Attempts, skill state events and case results are append-only.
- Student free-text answers are stored as entered and are only sent to the grading model; they are never used to train models without separate consent.
- All tables carry `taxonomy_version` or a reference to a row that does, so data from different taxonomy versions can be compared.

## Services and APIs

The drills system is six logical components behind one student-facing API; AI is used in only one of them (the grading worker), and it runs asynchronously so it never blocks a student.

### Implementation on this stack

The components below are modules in the existing Next.js app (`lib/drills/*`), not separate services:

- Student-facing endpoints are Next.js route handlers and server actions.
- The grading queue is a Postgres table (`grading_jobs`). A job is started right after set completion (`after()`), and a Vercel cron retries failed jobs and finishes delayed grading within the 10-minute window.
- Case results reach the progress engine as an in-process function call from the scoring code, not an HTTP endpoint.

### Components

| Component | Responsibility |
| --- | --- |
| Drills API | Student-facing endpoints: home, sets, items, attempts, results, profile, settings |
| Scoring service | Auto-checking, numeric parsing, trap-value diagnosis, checklist score calculation, red-flag caps. Pure code, no AI |
| Generator library | Builds generated items from template, tier and seed. Shared by the Drills API and content admin preview |
| Grading worker | Consumes grading jobs from the queue, calls the model, validates output and quotes, writes results |
| Progress engine | Updates skill states and tiers, runs the prescription rules, schedules spaced reviews. Triggered by set completion and by case results |
| Content admin (internal) | Authoring, review workflow, preview, publish and retire for authored items; item health dashboard |

The shared chart renderer is a frontend component.

### Student-facing endpoints

| Method and path | Purpose | Returns |
| --- | --- | --- |
| `GET /drills/home` | Training home | Continue Training target (drill, reason, estimated minutes), open prescriptions, next-case card, interview mode |
| `POST /drill-sets` | Start a set. Body: `source` and either `prescription_id`, `skill_id` or nothing (Continue Training) | `set_id`, intro info, total items |
| `GET /drill-sets/{id}` | Resume a set | Status, current position, completed attempts |
| `GET /drill-sets/{id}/items/{position}` | Fetch an item. Records `served_at` server-side | Item content and input spec, **never the answer key** |
| `POST /drill-sets/{id}/attempts` | Submit an answer. Body: position, response, idempotency key | Auto-checked: score, correct answer, feedback. AI-graded: accepted |
| `POST /drill-sets/{id}/complete` | Finish the set; queues AI grading if needed | Status (`completed` or `grading`) |
| `GET /drill-sets/{id}/results` | Results screen data. Clients poll every 2 s while status is `grading` | Set score, pass, mistake summary, per-item results, skill state changes, next action |
| `GET /skills/profile` | Skill profile | States, progress, top mistakes, rubric trends, history |
| `PATCH /prescriptions/{id}` | Dismiss a prescription | Updated prescription |
| `PUT /me/drill-settings` | Time multiplier, interview date, example preferences | Updated settings |
| `POST /attempts/{id}/dispute` (P1) | Dispute a grade | Dispute record |

### Internal interfaces

| Interface | Purpose |
| --- | --- |
| Case results ingestion (in-process function) | Receives the case grader payload. Validates tags against the taxonomy, stores it, updates skill states and regenerates prescriptions. Idempotent on `case_attempt_id` |
| Taxonomy config | The case grader imports the same taxonomy loader as drills |
| Content admin API | Item CRUD, review state changes, generator preview by seed, item stats |

### Integrity rules

- Answer keys stay on the server until an item is submitted.
- Time limits are enforced on the server from `served_at` to submission, with a 2-second grace for network delay. Later submissions are marked `timed_out`.
- Attempt submission is idempotent: a repeated idempotency key returns the original result.
- An item can only be fetched in order, and only once its previous item has been submitted.
- Each student can have one set in progress at a time.

### Event flow after a set completes

1. Auto-checked set: the Scoring service finalizes the set score immediately. AI-graded set: the Grading worker finishes, then the Scoring service computes scores.
2. The Progress engine updates skill scores, tier, skill states and review dates.
3. The Progress engine refreshes prescriptions and the Continue Training target.
4. The results screen shows everything in one response.

## Analytics and event logging

The most important question analytics must answer is whether drilling a skill reduces that skill's mistakes in the next full case; every event below exists to answer it or to keep the loop healthy.

### Events

Every event carries `student_id`, `org_id` (school or club, if any), `timestamp`, `taxonomy_version` and `app_version`.

| Event | Fired when | Key properties |
| --- | --- | --- |
| `drills_home_viewed` | Training home loads | continue\_target\_drill, open\_prescriptions, interview\_mode |
| `drill_set_started` | A set is created | set\_id, drill\_id, level, tier, source, prescription\_id, focus\_tag |
| `drill_example_viewed` / `drill_example_skipped` | Intro example shown or skipped | drill\_id |
| `drill_item_served` | An item is fetched | set\_id, position, item ref (id + version, or template + seed) |
| `drill_attempt_submitted` | An answer is submitted | attempt\_id, score, time\_ms, timed\_out, skipped, mistake\_tags |
| `drill_set_completed` | Results are final | set\_id, set\_score, passed, duration\_ms, skill\_scores |
| `drill_set_expired` | An unfinished set passes 24 hours | set\_id, items\_completed |
| `grading_job_completed` | An AI grading call finishes | job\_id, status, retries, latency\_ms, input\_tokens, output\_tokens, cost\_usd |
| `grading_injection_suspected` | Grader flags an instruction-like answer | attempt\_id |
| `skill_state_changed` | Any state change | skill\_id, from\_state, to\_state, source\_type |
| `prescription_created` / `_dismissed` / `_completed` | Prescription lifecycle | prescription\_id, skill\_id, drill\_id, source\_type, priority |
| `next_case_card_shown` / `_clicked` | Next-case card | recommended\_case\_id |
| `case_result_received` | Case grader payload accepted | case\_attempt\_id, case\_type, difficulty\_tier, finding\_count |
| `grade_dispute_submitted` (P1) | Student disputes a grade | attempt\_id |

### MVP reports

| Report | What it shows |
| --- | --- |
| Loop funnel | Case taken → prescription created → set started → skill Mastered → next case taken, with drop-off at each step |
| Drill effectiveness | For each skill: rate of that skill's mistake tags per case before vs after Mastered. Compared against students who dismissed the same prescription, as a natural comparison group |
| Engagement | Sets per active student per week, share of students returning within 7 days, average session length |
| Item health | Correct rate, average time and distractor pull per item; items auto-pulled to review |
| Grading quality and cost | Agreement with human labels per check, retry and failure rates, cost per AI-graded set, share of attempts with zero AI cost |

All reports must be filterable by `org_id` so that career center and club dashboards can be built on the same data later.

## Cost controls and non-functional requirements

Running cost is held down by design: at least 75% of attempts should cost nothing, and each AI-graded set should cost no more than 5% of one full AI case interview.

### Cost controls

- **No AI at runtime except grading.** All drill content is generated by code or written ahead of time.
- **One call per set.** The 5 AI-graded drills (PS-3, HY-2, CR-1, SY-2, CL-3) send every free-text answer in a set in a single grading call.
- **Small inputs.** The call carries only prompts, answers, check questions and red-flag definitions. Model answers and feedback text stay on the server.
- **Capped answers and outputs.** Word caps on every free-text input; a tight output token limit on the grading call.
- **Cheapest passing model.** Use the lowest-cost model tier that meets the 90% agreement gate. Re-test cheaper tiers when they become available.
- **Prompt caching.** Cache the fixed grading instructions where the model provider supports it.
- **Usage cap.** A per-student limit of 20 AI-graded sets per day. Auto-checked drills are unlimited.
- **Monitoring.** A dashboard of cost per AI-graded set and per active student, with an alert if the 7-day average exceeds budget by 25%.

### Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | Item load < 500 ms p95. Auto-checked feedback < 300 ms p95. AI-graded results < 10 s p95 after the last item |
| Availability | 99.5% during the pilot. Auto-checked drills keep working if the model provider is down; AI grading queues and completes later |
| Devices | Desktop-first for the pilot: latest 2 versions of Chrome, Safari, Edge and Firefox. Full support down to 360 px wide ships in P1 |
| Accessibility | WCAG 2.1 AA, including keyboard operation, chart data tables, screen-reader timer announcements and the time-accommodation setting |
| Security | Answer keys never sent before submission. Content admin restricted by role. All endpoints authenticated |
| Privacy | Text only, so no voice or biometric data is collected. Student answers are deleted when the account is deleted. Data from university partners may count as education records; confirm handling with legal before institutional launch |
| Configurability | Thresholds, weights, time limits, set sizes and maps live in config files and change without code changes (a deploy is still needed) |
| Observability | Structured logs and alerts for grading failures, retry rates, queue depth and quote-verification failures |

## Build phases, acceptance criteria and open questions

The build runs in five phases, D0 to D4. Auto-checked drills ship before AI-graded ones so the riskiest piece, AI grading, is built on proven foundations; each phase has a hard exit gate.

### Phases

| Phase | What gets built | Exit gate |
| --- | --- | --- |
| D0 Foundations | Taxonomy v1 and config files, data model, numeric parser, generator framework, chart renderer, case grader payload contract | Config, schema, parser and generator tests pass. The grader gate (case grader emits valid payloads on 30 sample transcripts, with a human agreeing with at least 85% of its tags) is deferred until the grader is updated |
| D1 Auto-checked drills | QN-1, QN-3, QN-4, EX-2, EX-3 (generated) and PS-1, HY-1, EX-1, SY-1, CL-1 (authored); item, feedback and results screens; Practice something specific | All generator tests pass; zero key errors in 1,000 sampled generated items; authored pools at launch size and reviewed |
| D2 AI-graded drills | PS-3, HY-2, SY-2, CL-3, plus QN-5; grading worker, golden sets, quote verification, failure handling | At least 90% agreement per check on every golden set; results < 10 s p95; cost per set within budget |
| D3 The loop | Progress engine (states, tiers, reviews), prescription engine, case results ingestion, training home with Continue Training, skill profile, next-case card | Scripted scenarios produce the exact state changes and prescriptions defined in this PRD |
| D4 Pilot launch | Analytics events and reports, WCAG 2.1 AA audit, pilot with the university club | Audit passed; all events firing; pilot students complete the full loop |
| P1 Fast follow | PS-2, QN-2, BJ-1, BJ-2, CR-1, CL-2, diagnostic sampler, grade disputes, 360 px support | Same gates as D1 and D2 for the new drills |

### Definition of done for MVP

- [ ] Zero answer-key errors in a 200-item human QA sample of authored items across all P0 drills.
- [ ] Answer keys are never present in any client response before submission (verified by security test).
- [ ] AI grading agreement is at least 90% on every check of every AI-graded drill.
- [ ] A test student can complete the full loop: case → prescriptions → drill sets → Mastered → next case recommended → Validated.
- [ ] At least 75% of pilot attempts cost nothing in AI calls.
- [ ] WCAG 2.1 AA audit passed.
- [ ] All events in Analytics fire with complete properties.

### Open questions

- [ ] **Rubric scale:** The case grader currently rates each dimension on 3 levels (`needs_work`, `meets_bar`, `strong`), not a number. What counts as "meeting the bar" at each difficulty tier, and what form should `rubric_scores` take in the payload? Needed for next-case selection.
- [ ] **Grader changes:** How much work is it for the transcript-grading agent to emit skill tags, severity, `skills_observed` and exact evidence quotes? (Deferred: the grader will be updated later.)
- [ ] **Tag severity:** Which mistake tags are major vs minor? Needs product sign-off before D3.
- [ ] **Mastery bar:** Are 80% and two consecutive sets the right bar? Validate with pilot data and adjust in config.
- [ ] **First-time users:** Should MVP require a full case before drills, or bring the diagnostic sampler forward from P1?
- [ ] **Free vs paid:** Are drills limited for free users, and if so, how?
- [ ] **Content review capacity:** About 580 authored items need human review before launch. @Matt is authoring drill content separately.
- [ ] **University data handling:** Confirm with legal how student data from partner schools must be handled.
- [ ] **Firm-style toggles:** When should items start carrying `firm_style`?
- [ ] **Case types:** The PRD refers to 14 case types but doesn't list them. The list is needed for `case_type` on cases and items.
