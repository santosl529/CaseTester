# AI Casing — Drills PRD

Oct 11, 2026 · @Matt

> Revision log
> - 2026-10-05: Saved to the repo. Applied the review fixes (test-out tier, skills with no Level 2 drill, review set size, `case_type` and next-case fallback, desktop-first, QN-3 trap precedence, scope wording, `org_id`, grading model, chart renderer). Drill specs moved into catalog order; their content is unchanged.
> - 2026-10-06: Matched to the D0 build: table names and new fields, `student_profiles` for `org_id`, the skill-keyed drill map, three percent modes, 3-level rubric ratings in the case payload. Added the rule for skills with only Level 2 drills and two EX-2 tags (`M.indexed_misread`, `M.period_mismatch`).
> - 2026-10-06: Matched to the D1 build: endpoint paths, `is_example`, `focus_skill` / `item_plan` / `pending_step` on drill sets, multi-step `input.steps`, rounded-form trap matching, resume and late-answer behavior, and the D1 results-screen action.
> - 2026-10-10: After content review rounds 1 and 2: three new mistake tags (`M.ignores_deciding_fact`, `M.low_priority_next_step`, `M.irrelevant_driver`), QN-5 card roles, the wording checks for choice drills, and the similarity check that every authored item must pass before going live.
> - 2026-10-11: D2 decisions: PS-3, HY-2, SY-2 and CL-3 grading rules, caps and red flags; one grading call per answer; tag severity defaults; prescription area limit.
> - 2026-10-11: The home's message when a workout is empty (no weak spots yet).
> - 2026-10-11: D4 decisions: retakes can't validate a skill; industry tags (Matt's list and rules); the approved case-type map; the diagnostic as 10 resumable parts with placement, prescriptions and the move to Foundations; lessons as markdown files with a review page; weekly case targets count completed case sessions; new `diagnostics` table and `student_programs.current_week`.
> - 2026-10-11: D3 decisions: primary skills per drill (only they change state), cross-skill prescriptions weighted as in a case, the supersede rule when a new case arrives, the extra `skill_states` columns, and where the case-type list lives.
> - 2026-10-11: **v2 merged.** Adds the training program (diagnostic, tracks, plans, workouts, Practice on my own, lessons), the skill tree, drill chains with Repair drills, the Defend step, the Practiced state and transfer checks. Kept from v1: the PS-3, HY-2, SY-2 and CL-3 sections as built (Defend added), the content-review tags, and the build details from the revisions above. Matt's decisions applied: test-out at tier 2 (with Defend once it ships); grading stays at set completion; pilot with the current Level 1 pools; student time zone stored at signup; Browse cases belongs to the case product; set size by tier; taxonomy stays `v1`; skill tree approved.

## What's new in v2

v2 turns drills into a structured training program: a diagnostic, three tracks with week-by-week plans, short lessons, daily workouts with a fixed mix, longer drill chains with a written Defend follow-up, and a transfer check before a skill counts as Mastered.

| Change | What it means for students | Where in this PRD | Priority |
| --- | --- | --- | --- |
| Diagnostic at signup | A 15-minute check places each skill and suggests a track | Training program | P0 |
| Tracks and plans | Foundations (6 weeks), Standard (6 weeks) or Sprint (7 days), each with weekly focus areas, targets and milestones | Training program | P0 |
| Practice on my own, browse drills | Students can skip the plan, or step off it any time, and still see their weaknesses, progress and suggestions | Training program, User experience | P0 |
| Lessons | A short lesson per skill (600 words or fewer), opened automatically in Foundations and offered everywhere else, plus a "How a case interview works" intro | Training program, Content system | P0 for the 22 P0 skills, plus `CL.pushback` and the intro |
| Skill tree | Skills have prerequisites; a student stuck on a skill is sent to the missing prerequisite first | Skill taxonomy | P0 |
| Drill chains and Repair drills | Each skill climbs Learn → Recognize → Repair → Construct → Defend → Transfer; 5 new drills | Drill catalog | P0 / P1 |
| Defend follow-up | A scripted interviewer follow-up after Construct answers at tiers 2–3, answered in writing | Drill catalog, Scoring | P0 |
| Workout mix | Each daily workout is 50% weak spots, 25% spaced review, 25% unfamiliar material | Training program | P0 |
| Transfer check | New Practiced state; a skill becomes Mastered only after passing unseen items in a new context | Mastery | P0 |
| Alignment fixes | One AI call per answer; at most 2 of 3 case prescriptions from one skill area; the grader can override default severity | Scoring, Prescription engine, Skill taxonomy | — |

Considered and not in this release: hints inside drills, an "unsure" grading flag, case replay, a separate AI coach, voice and gamification.

## Overview

Drills are short, targeted exercises inside a structured training program that takes a student from a diagnostic to interview readiness. The plan sets the order of skills; mistakes found by the AI case grader and by drills set the details. The loop: Diagnose → Plan → Learn → Practice (Recognize → Repair → Construct and Defend) → Transfer → Perform in a full case → Reassess.

This PRD covers everything engineering needs to build the drills system and training program: tracks and plans, the skill taxonomy and skill tree, 30 drills, lessons, workouts, scoring, mastery, prescriptions, content, data model, APIs, logging and cost controls. The full AI case interview and its grader are out of scope, except for the interface the grader must provide.

Drills are a parallel workstream to the case interview build (technical PRD §11). They live in the same Next.js app and Supabase project.

### Product principles

- **Plan, then adapt.** Every student follows a track with weekly focus areas. Mistakes from cases and drills decide what they practice within it.
- **Learn → Recognize → Repair → Construct → Defend → Transfer → Perform.** Each skill climbs a fixed ladder. Students skip steps they can already pass.
- **Mastery means independent transfer.** A skill is Mastered only when the student passes unseen items in a new context, not after a set number of exercises.
- **Diagnose, don't just score.** Every result names the specific mistake (for example, "unit error" or "generic framework"), not only a percentage.
- **Deterministic where possible.** Code scores anything with one right answer. The AI only answers narrow yes/no checklist questions, and code adds up the score.
- **Text only.** No drill requires voice. Defend follow-ups are answered in writing.
- **Low running cost.** No AI at runtime except grading. Lessons, plans and workouts are content and fixed rules.
- **Minimal decisions.** The default action is a single "Start today's workout" button.
- **Data is the advantage.** Every attempt is logged at item level so difficulty, common mistakes and drill effectiveness can be measured.

### Success metrics (proposed MVP targets)

| Metric | Target | How measured |
| --- | --- | --- |
| Prescribed drill sets completed | ≥ 70% of started sets | `drill_set_completed` / `drill_set_started` |
| Planned workouts completed | ≥ 60% of planned workouts each week | `workout_completed` / workouts planned |
| Students who finish their plan | ≥ 40% reach their track's last week | `program_week_started` (last week) / `program_assigned` |
| Students who drill, then take another case | ≥ 50% within 14 days | Case start after a drill set completion |
| Improvement on the drilled dimension | ≥ 60% of students who reach Mastered score higher on that dimension in their next comparable case | Rubric dimension score, same difficulty tier |
| Transfer check first-attempt pass rate | 60–85% (lower: drills don't transfer; higher: checks are too easy) | `transfer_check_completed` |
| Drill grading cost per active student | ≤ $1.25 per month (pilot budget, to confirm) | `grading_jobs.cost_usd` / monthly active students |
| AI checklist agreement with human reviewers | ≥ 90% per check | Monthly sample of 100 graded answers |
| Auto-checked feedback latency | < 300 ms p95 | Server timing |
| AI-graded set results latency | < 10 s p95 after the last answer | Server timing |

## Scope

The MVP ships 18 priority-0 drills (the original 15, live for the pilot, plus 3 Repair drills added during it) and the training program (diagnostic, tracks, plans, workouts, skill tree, transfer checks and lessons for P0 skills), plus the infrastructure every later drill plugs into.

### Priority definitions

- **P0 — MVP launch.** Required for the first release to pilot students.
- **P1 — Fast follow.** Built in the first release after MVP, using the same infrastructure.
- **P2 — Later.** Specified here so the data model supports them; not scheduled.

### In scope

- Skill taxonomy v1 with prerequisites (the skill tree), shared with the case grader (section: Skill taxonomy).
- The P0 and P1 drills in the Drill catalog, built in priority order, including drill chains and Defend follow-ups. P2 drills are specified only, so the data model supports them; they are not built.
- Training program: onboarding questions, diagnostic, three tracks, week-by-week plans, weekly targets and milestones (section: Training program).
- Lessons: one short static lesson per skill.
- Daily workouts with a 50/25/25 mix, a Practice on my own option, and browsing any drill.
- Drill sessions, results screens, skill profile and program progress.
- Auto-checked scoring, checklist grading via a cheap model, wrong-answer tags, mastery tracking and transfer checks.
- Rule-based prescription engine that reads case grader output, the diagnostic and the plan.
- Content pipeline: item schema, answer keys, templated item generators, lessons, AI-assisted authoring with human QA.
- Item-level event logging for analytics.

### Out of scope

- The full AI case interview and its grader internals. This PRD only defines the output the grader must send to drills.
- The case library browser (Browse cases). It belongs to the case product backlog; drills only exposes the suggested case.
- Voice. No drill uses speech input or output.
- Hints inside drills, an "unsure" grading flag, case replay and a separate AI coach (considered for v2; not in this release).
- Firm-style toggles. The item schema reserves a field for them.
- Behavioral and fit interview practice.
- Career center or club admin dashboards (planned later; event logging must support them).
- Leaderboards, social features, streaks and achievements.
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
| Skill | A specific ability that drills train and mastery tracks. 29 in v1. Format `AREA.skill_name`. | `QN.percentages` |
| Prerequisite | A skill another skill builds on. Stored in the taxonomy file; together they form the skill tree. | `QN.magnitude` is a prerequisite of `QN.sizing_structure` |
| Mistake tag | A specific error. Each maps to exactly one skill. Used by wrong answers, failed checks, red flags and the case grader. Format `M.mistake_name`. | `M.unit_error` |
| Stage | Where a skill is on its ladder: Learn, Recognize, Repair, Construct (with Defend), Transfer. | `PS.mece`: Repair |
| Level | Level 1 = Recognize (choose from options). Level 2 = Construct (produce the answer). Repair drills sit between them. | — |
| Difficulty tier | Tier 1–3 within a drill. Higher tiers use harder items and tighter time limits. Tier 3 of Level 2 is the "under time pressure" stage. | Mental math, tier 3: 12 s per item |
| Drill | A type of exercise with fixed mechanics and scoring. 30 in the catalog. | Framework builder |
| Repair drill | A drill where the student fixes a flawed answer instead of building one from scratch. | Fix the framework |
| Defend step | A scripted interviewer follow-up shown after a Construct answer at tiers 2–3. The student answers in writing. | "Which bucket would you dig into first, and why?" |
| Item | One question or prompt within a drill, with its own answer key. | "Gym chain launching at-home subscription" |
| Answer key | The authored solution for an item: correct answer and tolerance, or checklist, wrong-option tags, model answer and Defend follow-up. | — |
| Check | One yes/no question in a checklist. Answered by the AI with a quote as evidence. | "Does the first sentence state a recommendation?" |
| Red flag | A condition that caps an item's score regardless of other checks. | Generic profit tree on a market-entry prompt |
| Drill set | 3–10 items of one drill, served together. The unit of practice, scoring and AI grading. | 8 Setup-only items on breakeven |
| Workout | A daily session of 2–4 drill sets, about 20 minutes: 50% weak spots, 25% spaced review, 25% unfamiliar material. | "Today: 20 min, 3 sets" |
| Transfer check | A Construct set of unseen items from a new case type and industry. Passing it turns Practiced into Mastered. | 4 unseen Framework builder items on a pricing case |
| Lesson | A short static page per skill: the idea, the pattern, worked examples, tricky cases, the common mistakes and a quick check. | "Building a case-specific framework" |
| Track | The program a student follows: Foundations, Standard or Sprint. | Standard |
| Program plan | A track's schedule: weekly focus skill areas, workout and case targets, and milestones. | Week 2: Hypotheses and exhibits |
| Diagnostic | A 15-minute mixed set at signup that places each skill and suggests a track. | — |
| Attempt | One student's response to one item. | — |
| Skill state | Where a student stands on a skill: Not started, Learning, Recognizes, Practiced, Mastered, Validated. | `QN.setup`: Practiced |
| Prescription | A recommended drill set for a skill, created from mistake tags, the diagnostic or the plan, with a reason shown to the student. | "You set up the margin calculation incorrectly twice in your last case." |
| Generator | Code that creates items from a template with randomized inputs, so supply is unlimited and free. | Breakeven problem with random costs |

## Training program

Every student follows one of three tracks, each with a week-by-week plan; daily workouts fill the plan from the student's own weak spots, so the plan sets the order and mistakes set the details.

### Tracks

| Track | Who it's for | Length | Each skill starts at | Lessons | Planned cases |
| --- | --- | --- | --- | --- | --- |
| Foundations | New to cases: 0 practice cases, or diagnostic below 50% | Week 0 + 6 weeks | Learn, then Recognize tier 1 | Opened automatically before the first set of each skill | 0 in week 1, 1 a week in weeks 2–3, 2 a week in weeks 4–6 |
| Standard | Has done some cases | Week 0 + 6 weeks | Diagnostic placement (default: Construct tier 2 test-out) | Offered | 1 baseline, 1 a week in weeks 1–3, 2 a week in weeks 4–6 |
| Sprint | Interview in 14 days or fewer | 7 days | Construct tier 2; Recognize never served; Repair only after a Construct set below 50% | Offered | 3 |

Assignment at onboarding, first rule that applies:

1. Interview date set and 14 or fewer days away → Sprint.
2. 0 practice cases, or diagnostic overall score below 50% → Foundations.
3. Otherwise → Standard.

A student can switch track, or switch to Practice on my own, at any time in settings. The plan is rebuilt from today; skill states are kept.

### Practice on my own (self-directed)

Students who don't want a plan choose **Practice on my own** at onboarding or in settings; they decide what to practice, and the app still diagnoses their weaknesses, tracks their progress and suggests what to do next.

|  | Plan tracks | Practice on my own |
| --- | --- | --- |
| Diagnostic | Offered at onboarding | Offered at onboarding |
| Weekly targets, milestones, week themes | Yes | No |
| Plan prescriptions | Yes | No |
| Case and drill prescriptions (weaknesses) | Yes | Yes, shown as suggestions |
| Skill states, mastery, transfer checks, spaced review | Yes | Yes |
| Stuck rule (prerequisites) | Yes | Yes, as a suggestion |
| Lessons | Yes | Yes |
| Skill profile and progress | Yes | Yes |
| Foundations gate | Foundations only | No |
| Home leads with | Today's workout | Suggested next card + browse drills |

- **Home for self-directed students:**
  - **Suggested next:** one recommended set with its reason and time, chosen by the same rules as a workout's slots (top weakness first, then a due transfer check or review). One tap starts it; it is never required. At most one suggestion card on the home screen.
  - **Your weaknesses:** the top 3 weak skills with evidence (how often their mistakes appeared and the latest quote from a case or drill).
  - **Your progress:** skills that moved up in the last 7 days, counts of skills at Practiced and Mastered, and the case rubric trend.
  - **Due now:** reviews and transfer checks that are due, each startable in one tap.
  - **Browse drills** as the main entry point, plus a link to the case library (case product).
- **Weekly summary:** every Monday, in the student's time zone, the home shows a short recap: sets and cases done, skills that moved up, and the current weakest skill.
- **Interview date** still works: if it is 14 or fewer days away, the home offers the Sprint plan but doesn't switch automatically.
- **Switching to a plan** keeps all skill states. If the student took the diagnostic in the last 30 days, the plan uses it; otherwise the diagnostic is offered again.

### Onboarding and diagnostic

- **Questions:** follow a plan or practice on my own; interview date (optional); practice cases done (0, 1–5, 6+); and, for plans, time available per week (about 1.5–2, 2–2.5 or 3 hours, which sets 3, 4 or 6 workouts a week; the hours include planned cases).
- **Time zone:** captured from the browser during drills onboarding, with no question to the student. Workout days, the Monday summary and interview-date counts use it.
- **Diagnostic:** about 15 minutes, in 10 short parts, one drill each: 22 auto-checked items at tier 2 timing (3 each from PS-1, HY-1, EX-1, SY-1 and CL-1; 2 from QN-1; 3 from QN-3; 2 from EX-2) and 2 short Construct items (1 PS-3, 1 SY-2, no Defend). AI cost: 2 grading calls.
- **One flow:** the parts run back to back as one flow ("Part 3 of 10") with no per-item feedback and no results screen between parts; placement shows at the end. Diagnostic sets change no tiers, streaks or skill states beyond placement.
- **Stopping partway:** the student can stop at any time ("Stop for now"). They are placed from the parts they finished, and starting again resumes the same diagnostic.
- **Placement**, per skill with at least 2 diagnostic items or checks: below 50% → Recognize tier 1; 50–79% → Repair (Recognize tier 2 if the skill has no Repair drill); 80% or higher → Construct tier 2 test-out. Skills with no evidence use the track default. Placement is redone each time a part finishes.
- Placement only moves skills from Not started to Learning, and only skills the student hasn't practiced yet. The diagnostic never grants Recognizes or higher, because 2–3 items are too few.
- Diagnostic mistake tags create up to 3 prescriptions when the last part finishes (source `diagnostic`, +1 per distinct tag, at most 2 from one skill area, none for a skill that already has one). The first case result replaces them.
- **Overall score:** the average item score across all parts. A student placed on Standard at onboarding who has never switched track and scores below 50% moves to Foundations. The diagnostic results screen then says: "Based on your diagnostic, we've started you on Foundations. You can switch to Standard anytime in settings."
- **Skip:** "I'll take a case first" skips the diagnostic; the track default placement is used.
- **Baseline case:** Standard and Sprint schedule a first full case in Week 0 (Sprint: Day 1). Foundations offers it as optional.

### Six-week plan (Foundations and Standard)

| Week | Theme | Focus skill areas | Milestone: skills at Practiced or above by week end |
| --- | --- | --- | --- |
| 0 (day 1) | Diagnose | All | Plan set |
| 1 | Structure and math | PS; QN setup, percentages, magnitude | `PS.mece`, `PS.case_specific`, `QN.setup` |
| 2 | Hypotheses and exhibits | HY; EX; QN sizing | `HY.form`, `EX.takeaway`, `QN.sizing_structure` |
| 3 | Judgment and synthesis | SY; CL; BJ | `SY.answer_first`, `SY.evidence`, `CL.next_step` |
| 4 | Integration | Weak spots from cases | Every week 1–3 milestone skill at Practiced |
| 5 | Interview performance | Weak spots; tier 3 (timed) sets | Every open prescription at Practiced; 3 skills with a tier 3 pass |
| 6 | Readiness | Transfer checks and review, all areas | Every prescribed skill at Mastered; final case |

- **Weekly targets:** the workouts per week chosen at onboarding, plus the track's planned cases. A case counts toward the target when the student completes a case session that week, retakes included (case results only arrive once the case grader sends them). The default is about 2.5 hours a week in weeks 4–6 (4 workouts × 20 min + 2 cases × 35 min). Targets aren't tied to days; the home shows "3 of 4 workouts, 1 of 2 cases this week".
- **Milestones are targets, not locks.** At week rollover, milestone skills not yet met stay in the weak-spot pool with +1 priority.
- Focus areas with no live drill are skipped (for example, BJ until BJ-1 ships).
- **Compression:** if the interview is 15–41 days away, the plan keeps Week 0 and ends with Week 5 (Interview performance) and Week 6 (Readiness). The focus areas of weeks 1–4 are split evenly, in order, across the weeks left between them. If the interview is more than 6 weeks away, the plan runs as written and then repeats Readiness weeks.

Expected time per week (workouts 20 min, cases 35 min):

| Onboarding choice | Workouts a week | Weeks 1–3 | Weeks 4–6 | Typical practice day |
| --- | --- | --- | --- | --- |
| About 1.5–2 hours | 3 | \~1.6 hrs | \~2.2 hrs | 20–35 min, 4–5 days a week |
| About 2–2.5 hours (default) | 4 | \~1.9 hrs | \~2.5 hrs | 20–35 min, 5–6 days a week |
| About 3 hours | 6 | \~2.6 hrs | \~3.2 hrs | 20–55 min, 6–7 days a week |

Week 0 takes about 50 minutes (diagnostic + baseline case). At the default, the Standard program totals about 14 hours. Foundations is about the same: week 1 has no case, and lessons add about an hour over the program.

### Sprint plan (7 days)

| Day | Activity | Time |
| --- | --- | --- |
| 1 | Diagnostic + baseline case | 15 + 35 min |
| 2 | Workout: weak spots from the case | 30 min |
| 3 | Case + short workout | 35 + 15 min |
| 4 | Workout | 30 min |
| 5 | Case + short workout | 35 + 15 min |
| 6 | Review workout: Practiced and Mastered skills only | 20 min |
| 7 (day before the interview) | Light review, or rest | 15 min |

- About 4.5 hours in total. If more than 7 days remain, days 2–5 repeat before day 6.
- Sprint workouts are 30 minutes, tier 2–3 only. Transfer checks unlock as soon as a skill reaches Practiced. Within 2 days of the interview, only review workouts are served.

### How the plan drives practice

- Skills in the week's focus areas get +2 priority in the workout's weak-spot slot.
- If no open prescription is in the week's focus areas, the plan creates one (source `plan`) for the next focus skill below Practiced, in prerequisite order. Plan prescriptions have priority 1 and never displace case prescriptions.
- Case prescriptions keep their own rules (Prescription engine) and are always eligible, whatever the week.

### Workouts

- A workout is 2–4 drill sets, targeting 20 minutes (30 in Sprint, 15 the day before an interview).
- **Time split (config):** 50% weak spots, 25% spaced review, 25% unfamiliar material. A set's time is estimated as items × the tier's time limit × 0.8, plus Defend time.
- **Weak spots (50%):** 1–2 sets from the highest-priority open prescriptions (case, drill, diagnostic or plan), at each skill's current stage and tier. At most 1 set per skill per workout.
- **Spaced review (25%):** a review set (see Spaced review) on the Mastered or Validated skill most overdue for review. If none is due, the Practiced or Mastered skill practiced longest ago. If the student has none, the time goes to weak spots.
- **Unfamiliar (25%):** a due transfer check if there is one (it may run past 25%). Otherwise a half-size set on a skill at Recognizes or above, using items from a case type and industry the student hasn't seen on that skill. If nothing qualifies, the time goes to weak spots.
- **Order:** review (warm-up) → weak spots → unfamiliar.
- The student can stop after any set. The workout stays open until midnight in the student's time zone; a new one is built the next day.
- **No weak spots yet:** a student with nothing to work on (for example Sprint day 2 after skipping the diagnostic and the baseline case, or Standard weeks 4–6 with no prescriptions) gets an empty workout. The home says that workouts are built from weak spots, and links to the diagnostic (if not taken) and to Browse drills; it never shows an empty workout as done.
- Sets started from Browse drills count toward skill progress but not toward weekly workout targets.

### Lessons

- One short lesson per skill (600 words or fewer), with these parts:
  - the idea in one sentence;
  - why interviewers care;
  - why it works (two or three sentences on the logic);
  - a step-by-step pattern;
  - a worked example, and a second example in a different case type and industry;
  - tricky cases: two or three borderline answers, each with its verdict and the reason, taken from the grading rules (or, for auto-scored drills, the drill's trap logic);
  - the common mistakes, one line per mistake tag;
  - a quick check: one question, with the answer revealed on request. It is not graded and makes no AI call.
- Jargon is defined on first use. A **Try it** button starts the skill's next set.
- **Two levels:** Foundations students see the full lesson. Standard, Sprint and self-directed students see a summary card (the idea and the pattern) with **Read full lesson** to expand the rest.
- Static content with no AI at runtime, authored with the same AI-drafted, human-reviewed workflow as items.
- **When shown:** in Foundations, automatically before the first set of each skill (Skip allowed). In every track: from the drill intro, from the Learn library, and offered after any set below 50%.
- **Defending your answer** (`CL.pushback`): how to answer a Justify or Challenge follow-up. It is shown, as a summary card, at the top of the results of the first set in which the student writes a follow-up reply, until they have seen it; it is also in the Learn library.
- **How a case interview works:** an intro lesson with no skill. It covers who steers (interviewer-led or candidate-led) and the four stages (clarify, structure, analyze, recommend). For each stage it gives what happens, what interviewers look for, and the skills it uses; skills without a lesson are marked as practiced in full cases. It ends with how the six-week plan builds those skills, which is generated from the plan config (`programs.weeks`), so it can't drift from the plan. It is a static page (`/drills/learn/intro`), not a lessons-table row. Foundations students see it first, before week 1: the training home leads with it, and the first workout starts through it, until it has been read. It heads the Learn library for every track.
- **P0:** lessons for the 22 skills trained by P0 drills, plus `CL.pushback` (trained by the Defend follow-ups) and the intro. Lessons for other skills ship with their drills.
- Lessons are not scored and don't change skill states.
- Students see a lesson only once it is approved (live).

## User experience and flows

Students should rarely have to choose what to do: the training home leads with today's workout from their plan, and every other path is optional.

### Training home

- A header shows the track and week ("Standard · Week 2 of 6 · Hypotheses and exhibits") and the interview date, if set.
- **Start today's workout** is the primary button. It shows the estimated time and the 2–4 sets in order, each with its slot (weak spot, review, unfamiliar) and a one-line reason ("Your last case used a generic framework"). After the first set it reads **Continue workout**.
- This week's targets: workouts and cases done against planned ("3 of 4 workouts, 1 of 2 cases") and the week's milestone skills with their current state.
- Weakest skill right now, with the evidence behind it: how often its mistake tags appeared recently and the latest quote.
- A **Next case** card appears when the plan has a case left this week, or when every open prescription is at Practiced or above. It is a suggestion, not a lock.
- Secondary links: **Browse drills** opens the drill library; **Learn** opens the lesson library; a link to the case library (case product).

Students on Practice on my own see the self-directed home instead (see Training program): Suggested next, weaknesses, progress, due items, and Browse drills.

### What the home serves (in order)

1. No onboarding yet: the onboarding questions and diagnostic (see Training program).
2. An unfinished drill set from the last 24 hours (resume).
3. The rest of today's workout, if it was started.
4. A new workout built by the workout rules (see Training program).
5. If today's workout is done: the Next case card if the plan has a case left this week, otherwise an optional extra workout.

For self-directed students, steps 3–5 are replaced by the Suggested next card.

### Drill intro screen

- Shows drill name, skill trained, stage, why it was prescribed, number of items, time per item and pass bar.
- On a student's first time with a drill, shows one worked example. A "Skip example" button hides it for future sets.
- A **Read the short lesson** link for the skill. In Foundations, the lesson opens automatically before the first set of each skill.
- For Repair drills, states how much the student is told about the flaw at this tier.

### Item screen

- Prompt, any exhibit (chart or table), the input and a visible countdown timer.
- Input types: single choice, multi-select, ordering (drag or keyboard), numeric entry and free text with a live word counter that blocks typing past the cap.
- Numeric entry accepts common formats and parses them: `2.5M`, `2,500,000`, `2.5 million`, `$2.5m`, `25%`, `0.25` (where the item expects a percent, both `25` and `0.25` are accepted if the item allows it).
- When time runs out, the item auto-submits whatever is entered. Empty answers score 0 and log `M.timeout`.
- **Skip** is allowed; it scores 0 and logs `M.skipped`. Skips are excluded from mistake analysis.
- Leaving mid-set saves progress. An unfinished set expires after 24 hours; completed attempts are kept.
- Coming back to a set mid-way (reload, new tab) shows the intro with a **Resume** button. The item's timer keeps running on the server in the meantime.
- An answer that reaches the server more than 2 seconds after the time limit counts as a timeout: it scores 0 and logs `M.timeout`, even if it is correct. Without this, the server-side timer could be bypassed. An untimed set (No time limit, see Accessibility) has no timeouts.

### Defend step screen

- After the student submits a Construct answer at tier 2 or 3, the same screen shows **Interviewer follow-up** with the scripted question. The main answer stays visible, read-only.
- Challenge follow-ups show **Hold** and **Update** buttons first, then the text box.
- Up to 40 words, with its own countdown (60 s at tier 2, 45 s at tier 3, times the accommodation multiplier).
- Skip and timeout follow the item rules: a skipped or empty Defend scores 0 and logs `M.skipped` or `M.timeout`.

### Feedback timing

- **Auto-checked items:** feedback right after each item: correct or not, the right answer, a one-line explanation of the specific mistake (from the wrong-option tag) and a worked solution.
- **AI-graded items (Repair, Construct and Defend):** no per-item feedback. All answers in the set are graded after the last item, each in its own call, and results appear on the results screen. Grading moves to "as soon as each answer is submitted" only if results p95 goes over 10 s.

### Set results screen

- Set score, pass or fail against the bar, and time against target.
- A mistake summary in plain words ("2 of your 3 misses were unit errors").
- Per-item breakdown. For AI-graded items: each check passed or failed, the quoted evidence from the student's answer, any red flag, and the model answer. For Defend steps: the follow-up, the student's reply, each check with evidence and the model reply.
- Skill state change, if any ("Breakeven: now Practiced. Transfer check unlocks Thursday.").
- One primary next action (Continue workout) and two secondary ones (Retry this set, Take a case).

### Skill profile

- All 9 skill areas, each listing its skills with current state, stage and a progress bar toward the next state. Under each skill, "Builds on: …" lists its prerequisites and their states. A drawn tree view is P1.
- Program progress: track, current week, and milestones met in each week so far.
- The top 3 mistakes holding the student back, from the last 30 days.
- A full-case trend line per rubric dimension. It only appears after 2 or more cases in the same difficulty tier, so progress shown is trustworthy.
- History of completed workouts, drill sets and cases.

### Browse drills (practice something specific)

- Available to every student, on a plan or not. Drills are grouped by skill area, then skill. Each skill shows its state and stage, its drills by stage (Recognize, Repair, Construct) and a **Suggested** badge if it has an open prescription.
- **Quick start:** pick a skill; the system picks the drill, stage and tier from the student's skill state.
- **Pick exactly:** choose a specific drill and stage. The tier can be any level up to one above the student's current tier on that drill (first time: tier 1 or 2), so nobody starts at the hardest level cold.
- Browsed sets count toward skill states, tiers, mastery and prescriptions exactly like workout sets. For plan students they don't count toward weekly workout targets, and the plan adapts to the new skill states.

### Cases

- Browsing the case library (filters by case type and difficulty) is part of the case product backlog, not drills.
- Drills exposes only the suggested case: the Next case card's pick (see Picking the next case), which the case library marks **Suggested** once it exists. It is never required.
- Any case a student takes feeds the case grader payload as usual, so it updates prescriptions and skill states. For plan students it counts toward the week's case target.

### Interview date

- Optional, set at onboarding or in settings. Setting or changing it can switch the track (14 or fewer days away → Sprint) and rebuilds the plan (see Training program).
- When the interview is 2 or fewer days away, workouts serve only short review sets of Practiced and Mastered skills.

### Accessibility (WCAG 2.1 AA)

- Full keyboard operation, including ordering inputs.
- Every chart has an accessible data-table alternative.
- A time setting in Settings: Standard, 1.5×, 2× or **No time limit** (WCAG 2.2.1 Timing Adjustable). The multipliers scale every time limit, and mastery uses the adjusted limits.
  - With No time limit there is no timer and nothing times out. Untimed sets count fully toward every skill state, including Mastered: students who need extra time aren't blocked from mastery.
  - Results still show the time taken against the timed (1×) target, so students can work on pace.
  - The setting applies to sets started after it changes; each set records it (`drill_sets.untimed`).
- Audit: `npm run drills:a11y` (axe WCAG 2.1 A/AA, keyboard focus and 320 px reflow on every drills page) plus a manual screen-reader checklist; results in `docs/drills-a11y-audit.md`.
- Timers announce remaining time to screen readers at 50%, 25% and 10 seconds.

### Failure states

- If AI grading fails, retry automatically twice. If it still fails, show the auto-checked results, mark AI-graded items "Grading delayed" and complete grading in the background within 10 minutes. Never block the student.

## Skill taxonomy

Taxonomy v1 has 9 skill areas, 29 skills, 67 mistake tags and a prerequisite map (the skill tree); it is the one vocabulary shared by the case grader, every drill and the prescription engine. v2's changes (prerequisites and two Defend tags) are additive, so the file and the case grader payload stay at `v1`.

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
| `PS.mece` | Buckets don't overlap and nothing major is missing | `M.overlapping_buckets`, `M.missing_bucket` | PS-1, PS-4, PS-3 |
| `PS.case_specific` | Structure fits this case, not a canned framework | `M.generic_framework`, `M.irrelevant_bucket` | PS-1, PS-4, PS-3 |
| `PS.depth` | Each bucket has concrete sub-points | `M.shallow_structure` | PS-4, PS-3 |
| `PS.clarifying_questions` | Asks the few questions that matter | `M.low_value_question`, `M.missed_key_question`, `M.too_many_questions` | PS-2 |
| `HY.form` | States a directional, evidence-based, testable, tentative hypothesis | `M.no_hypothesis`, `M.restates_facts`, `M.shotgun_hypotheses`, `M.overconfident_hypothesis`, `M.untestable_hypothesis`, `M.ignores_facts` | HY-1, HY-3, HY-2 |
| `HY.update` | Changes the hypothesis when data contradicts it, keeps it when data supports it | `M.sticky_hypothesis`, `M.dropped_supported_hypothesis` | HY-2 |
| `QN.arithmetic` | Basic operations done correctly | `M.arithmetic_error` | QN-3, QN-4, QN-5 |
| `QN.magnitude` | Zeros and units handled correctly | `M.zeros_error`, `M.unit_error` | QN-3, QN-4, QN-5 |
| `QN.percentages` | Percent change, percent of, percentage points | `M.wrong_base`, `M.percent_vs_points` | QN-3, QN-4 |
| `QN.growth` | Growth rates and compounding | `M.growth_error` | QN-3, QN-4 |
| `QN.setup` | Chooses the right formula before calculating | `M.wrong_formula`, `M.missing_term` | QN-1, QN-4 |
| `QN.sizing_structure` | Builds a complete driver chain for an estimate | `M.missing_driver`, `M.double_counting`, `M.irrelevant_driver` | QN-5 |
| `QN.assumptions` | Makes reasonable estimation assumptions | `M.unreasonable_assumption` | QN-5 |
| `QN.sanity_check` | Notices when a result is implausible | `M.implausible_accepted`, `M.plausible_rejected` | QN-2, QN-5 |
| `EX.takeaway` | Finds the insight that matters | `M.trivial_takeaway`, `M.misread_trend`, `M.unsupported_claim` | EX-1, EX-5, EX-4 |
| `EX.traps` | Catches units, axes, footnotes, indexed values and period mismatches | `M.missed_units`, `M.axis_misread`, `M.dual_axis_misread`, `M.missed_footnote`, `M.indexed_misread`, `M.period_mismatch` | EX-2 |
| `EX.extraction` | Pulls the right number from dense data | `M.wrong_data_point` | EX-3 |
| `BJ.so_what` | States what a finding means for the client | `M.no_implication`, `M.implication_off_objective` | BJ-1, BJ-3 |
| `BJ.risks` | Names specific, relevant risks and next steps | `M.generic_risk`, `M.missed_key_risk` | BJ-2 |
| `CR.volume` | Generates enough distinct ideas | `M.too_few_ideas` | CR-1 |
| `CR.structure` | Groups ideas into clear, non-overlapping categories | `M.unstructured_ideas`, `M.overlapping_idea_groups` | CR-1 |
| `SY.answer_first` | Leads with a clear recommendation | `M.buried_recommendation`, `M.hedged_recommendation` | SY-1, SY-3, SY-2 |
| `SY.evidence` | Supports it with the right facts and numbers | `M.unsupported_recommendation`, `M.irrelevant_facts`, `M.ignores_deciding_fact` | SY-1, SY-3, SY-2 |
| `SY.complete` | Includes a risk and a next step | `M.missing_risk_or_next_step` | SY-2 |
| `SY.summary` | Summarizes progress accurately mid-case | `M.inaccurate_summary` | SY-1 |
| `CM.concise` | Says it briefly, conclusion first | `M.rambling`, `M.over_word_limit` | CM-1, CM-2 |
| `CL.next_step` | Proposes a logical next step without being prompted | `M.waited_for_interviewer`, `M.illogical_next_step`, `M.low_priority_next_step` | CL-1, CL-4 |
| `CL.data_requests` | Asks for specific, prioritized data | `M.vague_data_request`, `M.laundry_list`, `M.premature_solution` | CL-3 |
| `CL.pushback` | Holds when right, updates when wrong, uses evidence | `M.caved_to_invalid_pushback`, `M.ignored_valid_pushback`, `M.no_evidence_in_defense`, `M.dodged_question` (new), `M.inconsistent_defense` (new) | CL-2, Defend steps on all Construct drills |

### Skill tree (prerequisites)

Each skill can list prerequisites: skills it builds on. Together they form the skill tree. The map lives in the taxonomy file and must have no cycles (checked in CI). Approved by Matt on 2026-10-11.

| Skill | Builds on |
| --- | --- |
| `PS.case_specific` | `PS.mece` |
| `PS.depth` | `PS.mece` |
| `HY.form` | `PS.case_specific` |
| `HY.update` | `HY.form` |
| `QN.magnitude` | `QN.arithmetic` |
| `QN.percentages` | `QN.arithmetic` |
| `QN.growth` | `QN.percentages` |
| `QN.setup` | `QN.percentages` |
| `QN.sizing_structure` | `PS.mece`, `QN.magnitude` |
| `QN.assumptions` | `QN.magnitude` |
| `QN.sanity_check` | `QN.magnitude` |
| `EX.takeaway` | `EX.traps` |
| `EX.extraction` | `QN.arithmetic` |
| `BJ.so_what` | `EX.takeaway` |
| `BJ.risks` | `BJ.so_what` |
| `SY.evidence` | `EX.takeaway` |
| `SY.complete` | `SY.answer_first`, `BJ.risks` |
| `SY.summary` | `SY.answer_first` |
| `CL.next_step` | `HY.form` |
| `CL.data_requests` | `PS.mece` |
| `CL.pushback` | `SY.evidence` |
| `CR.structure` | `PS.mece` |

Skills not listed have no prerequisites. A prerequisite with no live drill is ignored.

- **Stuck rule:** when a skill has 2 consecutive sets below 50% and any prerequisite is below Practiced, the engine prescribes that prerequisite (lowest state first, then catalog order) at the stuck skill's priority + 1, and pauses the stuck skill's prescription. The stuck skill resumes when the prerequisite reaches Practiced or after 3 prerequisite sets, whichever comes first.
- **Credit down:** when a skill reaches Mastered, its prerequisites at Not started or Learning move to Recognizes.
- **Plan order:** within a week's focus areas, plan prescriptions follow prerequisite order.
- **Foundations gate:** in Foundations, a skill's Construct stage is served only after its prerequisites reach Recognizes. Other tracks have no gate.

## Drill catalog

The catalog has 30 drills: 13 at Level 1 (Recognize), 4 Repair drills and 13 at Level 2 (Construct). 17 are scored entirely by code; 11 of the P0/P1 drills need AI grading, plus the Defend step on Construct drills at tiers 2–3.

| ID | Drill | Stage | Skills trained | Input | Scoring | Defend | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PS-1 | Spot the gap | Recognize | `PS.mece`, `PS.case_specific` | Single choice | Auto | — | P0 |
| PS-2 | Clarifying questions | Recognize | `PS.clarifying_questions` | Multi-select (up to 3) | Auto | — | P1 |
| PS-4 | Fix the framework | Repair | `PS.mece`, `PS.case_specific`, `PS.depth` | Structured editor, prefilled | Checklist | — | P0 |
| PS-3 | Framework builder | Construct | `PS.mece`, `PS.case_specific`, `PS.depth` | Structured text editor | Checklist | Justify | P0 |
| HY-1 | Pick the best hypothesis | Recognize | `HY.form` | Single choice | Auto | — | P0 |
| HY-3 | Fix the hypothesis | Repair | `HY.form` | Free text, prefilled | Checklist | — | P0 |
| HY-2 | Initial hypothesis | Construct | `HY.form`, `HY.update` | Free text, then Keep/Revise/Drop + free text | Checklist + auto | Justify (test design) | P0 |
| QN-1 | Setup only | Recognize | `QN.setup` | Single choice | Auto | — | P0 |
| QN-2 | Sanity check | Recognize | `QN.sanity_check` | Single choice | Auto | — | P1 |
| QN-3 | Mental math | Construct | `QN.arithmetic`, `QN.magnitude`, `QN.percentages`, `QN.growth` | Numeric | Auto | — | P0 |
| QN-4 | Consulting math | Construct | `QN.setup`, `QN.arithmetic`, `QN.magnitude` | Single choice, then numeric | Auto | — | P0 |
| QN-5 | Market sizing | Construct | `QN.sizing_structure`, `QN.assumptions`, `QN.arithmetic`, `QN.sanity_check` | Pick drivers, numeric, single choice | Auto | Justify (P1) | P0 |
| EX-1 | Chart read | Recognize | `EX.takeaway` | Single choice | Auto | — | P0 |
| EX-2 | Exhibit traps | Recognize | `EX.traps` | Single choice or numeric | Auto | — | P0 |
| EX-5 | Fix the takeaway | Repair | `EX.takeaway` | Free text, prefilled | Checklist | — | P1 |
| EX-3 | Needle in the table | Construct | `EX.extraction`, `QN.arithmetic` | Numeric | Auto | — | P0 |
| EX-4 | Written chart takeaway | Construct | `EX.takeaway` | Free text | Checklist | Justify (implication) | P1 (was P2) |
| BJ-1 | "So what?" | Recognize | `BJ.so_what` | Single choice | Auto | — | P1 |
| BJ-2 | Risks and next steps | Recognize | `BJ.risks` | Multi-select | Auto | — | P1 |
| BJ-3 | Written "So what?" | Construct | `BJ.so_what` | Free text | Checklist | — | P2 |
| CR-1 | Bucketed brainstorm | Construct | `CR.volume`, `CR.structure` | Grouped text editor | Checklist | — | P1 |
| SY-1 | Pick the best summary | Recognize | `SY.answer_first`, `SY.evidence`, `SY.summary` | Single choice | Auto | — | P0 |
| SY-3 | Fix the recommendation | Repair | `SY.answer_first`, `SY.evidence` | Free text, prefilled | Checklist | — | P0 |
| SY-2 | 60-second recommendation | Construct | `SY.answer_first`, `SY.evidence`, `SY.complete` | Free text | Checklist | Challenge | P0 |
| CM-1 | Pick the answer-first version | Recognize | `CM.concise` | Single choice | Auto | — | P2 |
| CM-2 | Answer-first rewrite | Construct | `CM.concise` | Free text | Checklist + auto | — | P2 |
| CL-1 | What's next? | Recognize | `CL.next_step` | Single choice | Auto | — | P0 |
| CL-2 | Hold or fold | Recognize | `CL.pushback` | Two single choices | Auto | — | P1 |
| CL-4 | Your next move | Construct | `CL.next_step` | Free text, then Keep/Change + free text | Checklist + auto | Built in (Adapt stage) | P1 |
| CL-3 | What do you need to know? | Construct | `CL.data_requests` | Free text | Checklist | Justify | P0 |

### Drill chains

Each skill climbs a chain from choosing an answer to defending one; the chain below decides which drill serves each stage.

| Skill area | Recognize | Repair | Construct | Defend follow-up (tiers 2–3) |
| --- | --- | --- | --- | --- |
| PS: frameworks | PS-1 Spot the gap | PS-4 Fix the framework | PS-3 Framework builder | "Which bucket would you dig into first, and why?" |
| HY: hypotheses | HY-1 Pick the best hypothesis | HY-3 Fix the hypothesis | HY-2 Initial hypothesis (its Update stage covers new evidence) | "What data would you ask for first, and what result would make you drop it?" |
| EX: chart takeaways | EX-1 Chart read | EX-5 Fix the takeaway (P1) | EX-4 Written chart takeaway (P1) | "What does this mean for the client's decision?" |
| SY: recommendations | SY-1 Pick the best summary | SY-3 Fix the recommendation | SY-2 60-second recommendation | Scripted interviewer challenge: Hold or Update |
| CL: next step | CL-1 What's next? | — | CL-4 Your next move (P1) | Built in: a new fact, then Keep or Change |
| CL: data requests | — | — | CL-3 What do you need to know? | "If that first analysis comes back flat, what next, and why?" |
| QN: market sizing | QN-1 Setup only | — | QN-5 Market sizing | "Defend your assumption for \[driver\]." (P1) |
| QN math, EX traps and tables | QN-1, EX-2 | — | QN-3, QN-4, EX-3 | None (auto-checked) |

- **Learn** (a lesson) comes before every chain; **Transfer** (unseen items, new context) comes after it. See Training program and Mastery.
- A stage with no drill is skipped. Stage moves are defined in Mastery and adaptive progression.

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
- **Set and time:** 4 items at T1; 3 items at T2 and T3, where each item adds a Defend step. 180 / 120 / 90 s.
- **Scoring:** Checklist, AI-graded after the set, each answer in its own call. At T2–T3 the checks below make up 75% of the item and the Defend step 25% (see Defend step).

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Covers each must-cover area in the key (one check per area, 4–6 areas) | 50% split evenly | `M.missing_bucket` |
| No two buckets substantially overlap. Passes only if at least 3 buckets have sub-points (checked by code); above that, the AI judges overlap | 15% | `M.overlapping_buckets` |
| Every bucket is specific to this case and objective, judged on its heading and sub-points together | 20% | `M.generic_framework` or `M.irrelevant_bucket` |
| Every bucket has at least one concrete sub-point | 15% | `M.shallow_structure` |

- **Red flags:**
  - Generic framework: a memorized general-purpose framework (revenue/cost profit tree, market-entry list, SWOT, 4Ps, 3Cs, five forces) whose headings and sub-points aren't adapted to the case. Applies to every case type; on profitability prompts, revenue and cost buckets are flagged only if their sub-points are generic too (cap at 0.4, `M.generic_framework`).
  - Off-topic: the framework answers a different question (cap at 0.2, `M.irrelevant_bucket`).
  - Missed critical area: each item marks one must-cover area as critical (the one that answers the decision); if its cover check fails, cap at 0.6 (`M.missing_bucket`, checked by code from that check).
  - Fewer than 2 buckets (cap at 0.3, checked by code).
- **Grading rules:** An area counts only when the answer ties it to this case (a generic word such as "costs" alone doesn't count), and the full PS-3 rules in `docs/drills-grading-guide.md` decide the borderline calls. Rules the AI applies are sent with every PS-3 item, word for word as in the guide.
- **Deterministic pre-checks:** Code checks bucket count, empty buckets and word caps before the AI call.
- **Defend (T2–T3):** Justify. "Which bucket would you dig into first, and why?" Graded with the generic Justify checks in its own call.
- **Results show:** Each check with quoted evidence, and the key's model framework.
- **Answer key:** Must-cover areas (each with a short description and acceptable synonyms, one marked critical), common overlap pairs, model framework, and the Defend model reply.
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
- **Set and time:** 4 items at T1; 3 items at T2 and T3, where each item adds a Defend step. Stage 1: 90 / 75 / 60 s. Stage 2: 60 / 45 / 35 s.
- **Scoring:** Stage 1 is 60% of the item, stage 2 is 40%. At T2–T3, with Defend: stage 1 45%, stage 2 30%, Defend 25%.

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Directional: names a specific likely cause matching one of the key's hypothesis families, or another specific cause consistent with the facts | 15% | `M.restates_facts` |
| Evidence-based: uses the given facts | 15% | `M.ignores_facts` |
| Testable: clear what data would confirm or reject it | 15% | `M.untestable_hypothesis` |
| Appropriately tentative: framed as something to verify, while committing to one direction | 15% | `M.overconfident_hypothesis` |
| Update decision correct (auto) | 25% | `M.sticky_hypothesis` or `M.dropped_supported_hypothesis` |
| Update reason uses the new fact | 15% | `M.sticky_hypothesis` |

- **How the update decision is auto-checked:** During grading, the AI also classifies the stage 1 hypothesis into one of the key's 3–4 hypothesis families, or "other," and the family of any backup cause the student names. It does this in a separate call that sees only the opening facts, the families and the stage 1 answer, never stage 2 or the new fact, so a correct revision can't pull stage 1 into the family the student revised to. The key states the accepted action(s) for each family given the new fact; where two are defensible, it accepts both (for example drop or revise). Code compares the student's tap to it. For "other," Revise and Drop are both accepted. Revise is also accepted when the student moves to their own stated backup and the new fact supports the backup's family.
- **Red flags:** Restates the facts with no cause (stage 1 capped at 0.3). Lists 3 or more causes without picking one (stage 1 capped at 0.5, `M.shotgun_hypotheses`). Off-topic: stage 1 offers no cause, for example it proposes a fix or answers a different question (stage 1 capped at 0.2, `M.no_hypothesis`).
- **Grading rules:** The HY-2 rules in `docs/drills-grading-guide.md` decide borderline calls and are sent to the grader with every item, word for word. Among them: a generic cause ("market conditions") or the facts re-stated as a ratio is not directional; "analyze the data" is not testable; a fix with no hypothesis behind it is not an update reason. The update decision is HY-2's critical element (25%, scored by code), so it has no separate critical-element cap.
- **Defend (T2–T3):** Justify, with drill-specific checks. "What data would you ask for first to test your hypothesis, and what result would make you drop it?" (see Defend step).
- **Answer key:** Hypothesis families with descriptions, the new fact, the accepted action(s) per family with reason, a model answer for each stage, and the Defend model reply.
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
  1. *Structure:* From 6–8 driver cards, pick the ones that form the estimate (for example, US households → % with a dog → grooming visits per year → price per visit). Each card has a role: `driver`, `double_count` (counts something a driver already counts, like "number of dogs" alongside "dog-owning households"; tagged `M.double_counting`) or `not_a_driver` (doesn't belong in the estimate, like "number of pet stores"; tagged `M.irrelevant_driver`). A wrong structure logs the tag of the wrong card the student picked, or `M.missing_driver` if they picked only drivers.
  2. *Assumptions:* Enter a number for each driver. An optional one-line reason field is stored but not scored in MVP.
  3. *Calculation:* Enter the final estimate.
  4. *Sanity check:* Pick Seems reasonable, Seems too high or Seems too low.
- **Avoiding double penalties:** If step 1 is wrong, the key's driver set is shown and used for steps 2–4. Step 3 is checked against the student's own assumptions, not the key's.
- **Set and time:** 3 items. 300 / 240 / 180 s per item.
- **Scoring:** Auto.

| Step | Weight | How it's checked | Failed step logs |
| --- | --- | --- | --- |
| Structure | 35% | Selected set matches one of the key's 1–2 accepted driver sets | `M.missing_driver`, `M.double_counting`, `M.irrelevant_driver` |
| Assumptions | 30% split evenly per driver | Each value inside the key's accepted range | `M.unreasonable_assumption` |
| Calculation | 25% | Within ±2% of the product of the student's own assumptions | QN-3 trap-value diagnosis |
| Sanity check | 10% | Correct relative to the key's benchmark range: "too high" or "too low" is correct if the estimate is more than 3× outside it | `M.implausible_accepted`, `M.plausible_rejected` |

- **Defend (P1):** Justify. "Defend your assumption for \[driver named in the key\]." (see Defend step).
- **Answer key:** Driver cards with their roles, accepted driver sets, accepted range per driver (wide enough to accept reasonable estimates, typically ±50% around a central value) with its source or reasoning, benchmark range for the total, model walkthrough. A figure names a source only if the source has been looked up (with a link); otherwise the range is given as reasoning.
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
- **Scoring:** Auto (single choice or numeric). Each wrong option or trap value is tagged with the trap missed: units (`M.missed_units`), truncated axis (`M.axis_misread`), dual axis (`M.dual_axis_misread`), footnote (`M.missed_footnote`), indexed vs absolute values (`M.indexed_misread`), percent vs percentage points (`M.percent_vs_points`) or mismatched time periods (`M.period_mismatch`).
- **Answer key:** Trap type, correct answer, wrong-answer tags, explanation pointing to the exact chart element.
- **Item source:** Generator templates per trap type, rendered with the shared chart renderer.

### EX-3 Needle in the table

- **How it works:** A dense table (5–8 columns, 6–12 rows) and a question that needs 1–2 values from it plus a simple calculation. Numeric answer.
- **Set and time:** 6 items. 90 / 60 / 45 s.
- **Scoring:** Auto. The generator precomputes answers that use a neighboring cell (wrong row, column or year); matching one logs `M.wrong_data_point`. Other misses use the QN-3 trap-value diagnosis.
- **Answer key:** Generated: correct answer, tolerance, cells used, neighbor-cell trap values, worked solution.
- **Item source:** 100% generators.

### EX-4 Written chart takeaway (P1)

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
- **Scoring:** Auto. Distractors are each tagged: recommendation buried at the end (`M.buried_recommendation`), hedged with no clear answer (`M.hedged_recommendation`), resting on irrelevant facts (`M.irrelevant_facts`), no numbers in support (`M.unsupported_recommendation`), confident and numerical but reaching the wrong conclusion by ignoring the fact that decides it (`M.ignores_deciding_fact`), or misstating progress (`M.inaccurate_summary`). Options reach different conclusions, so students decide what to recommend, not just how to phrase it. The explanation models the full answer: recommendation, supporting numbers, main risk, next step, and what would change the answer.
- **Item source:** Derived from SY-2 fact sheets. AI-drafted, human QA.

### SY-2 60-second recommendation

- **How it works:** The student sees the client's question and a fact sheet of 5–6 facts, 1–2 of them irrelevant, and writes a recommendation of up to 120 words, roughly what a candidate says in 60 seconds. Time limits allow for typing speed.
- **Set and time:** 3 items at every tier (with a Defend step at T2 and T3). 180 / 120 / 90 s.
- **Scoring:** Checklist, AI-graded after the set, each answer in its own call. At T2–T3 the checks below make up 75% of the item and the Defend step 25% (see Defend step).

| Check | Weight | Failed check logs |
| --- | --- | --- |
| First sentence states a clear recommendation | 20% | `M.buried_recommendation` |
| Gives 2–3 supporting reasons | 15% | `M.unsupported_recommendation` |
| Reasons cite numbers from the fact sheet (code pre-check: at least one fact-sheet number appears) | 15% | `M.unsupported_recommendation` |
| Doesn't use the irrelevant facts as reasons (mentioning one only to dismiss it is fine) | 15% | `M.irrelevant_facts` |
| Every number the answer states matches the fact sheet or the key figures (within 10% of the exact value, or 1 percentage point for a percentage), and no claim goes beyond the sheet | 15% | `M.unsupported_recommendation` |
| Includes a risk | 10% | `M.missing_risk_or_next_step` |
| Includes a next step | 10% | `M.missing_risk_or_next_step` |

- **Consistency:** judges only stated facts and numbers, not whether the recommendation is right (a wrong recommendation has its own red flag). The key lists the figures worked out from the sheet as exact values ("direct-booking saving = $952,000", "pressing line payback = 15 months"), and the grader sees them, so it checks a student's numbers against them, within 10% or 1 percentage point for a percentage, instead of redoing the math.
- **Reasons:** "2–3 supporting reasons" is counted as distinct relevant facts from the fact sheet (or numbers worked out from them) used as support; two or more pass. Generic reasons and irrelevant facts don't count.
- **Red flags:** No clear position, for example "it depends" (cap 0.4, `M.hedged_recommendation`). A claim that contradicts the fact sheet (cap 0.5); a wrong calculation fails the consistency check instead. Wrong recommendation: the answer recommends a different action from the key's acceptable recommendation(s) (cap 0.5, `M.unsupported_recommendation`). Misses the deciding fact: each item marks one relevant fact as deciding, and an answer that never uses it is capped at 0.6 (`M.ignores_deciding_fact`). Off-topic: the answer addresses a different question (cap 0.2); an off-topic answer is not also flagged for no clear position or a wrong recommendation (code enforces this).
- **Deterministic backstops:** The recommendation-first check passes only on a quote from the first sentence.
- **Grading rules:** The SY-2 rules in `docs/drills-grading-guide.md` are sent to the grader with every item, word for word.
- **Defend (T2–T3):** Challenge. An item-specific interviewer challenge, for example "The CFO says your payback math ignores the ramp-up year." The student taps Hold or Update, then writes why. Half the challenges in the pool are valid. Graded with the generic Challenge checks (see Defend step).
- **Answer key:** The acceptable recommendation, or two where the call is genuinely debatable; which facts are relevant and which one is deciding; the key figures worked out from the sheet; key risks and next steps; model answer; the Defend challenge with whether it is valid and why, and a model reply.
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
- **Scoring:** Auto. Wrong options that are already answered, off the objective or jump to a solution too early log `M.illogical_next_step`; sensible analyses that matter less right now log `M.low_priority_next_step`. Each has its own feedback line.
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
- **Set and time:** 4 items at T1; 3 items at T2 and T3, where each item adds a Defend step. 90 / 75 / 60 s.
- **Scoring:** Checklist, AI-graded after the set, each answer in its own call. At T2–T3 the checks below make up 75% of the item and the Defend step 25% (see Defend step).

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Breaks the metric into its drivers | 25% | `M.laundry_list` |
| Covers each main driver in the key (one check per driver, typically 3–4) | 25% split evenly | `M.vague_data_request` |
| States where to start | 15% | `M.laundry_list` |
| Gives a reason for starting there | 10% | `M.laundry_list` |
| Data requests are specific (each names a specific measure; the first also has a cut, a comparison or a time period) | 25% | `M.vague_data_request` |

- **Red flags:** Proposes solutions before diagnosing (cap 0.5, `M.premature_solution`). Six or more unstructured requests (cap 0.5, `M.laundry_list`). Missed critical driver: each item marks one driver as critical, the one to start with, or two where another is an equally fair place to start, and an answer that covers neither is capped at 0.6 (`M.vague_data_request`, checked by code from that driver's check). Off-topic: the answer addresses a different question, for example it recommends a strategy instead of asking for information (cap 0.2, `M.vague_data_request`).
- **Grading rules:** The CL-3 rules in `docs/drills-grading-guide.md` are sent to the grader with every item, word for word. Among them: a generic word ("costs", "market data") doesn't cover a specific driver; every data request must name a specific measure and the first must also include a cut, a comparison or a time period, and drivers listed to break the metric down are not requests; "because it's important" is not a reason for the starting point, but a reason may come before the starting point.
- **Defend (T2–T3):** Justify. "If that first analysis comes back flat, what would you look at next, and why?" Graded with the generic Justify checks in its own call.
- **Answer key:** Driver breakdown with the critical driver(s) marked, best starting point with reason, examples of specific vs vague requests, model answer, and the Defend model reply.
- **Item source:** Authored. AI-drafted, human QA.

### Repair drills: PS-4, HY-3, EX-5, SY-3

Repair drills sit between Recognize and Construct: the student fixes a flawed answer instead of building one from a blank page.

- **How it works:** the student sees the case prompt and a flawed answer, prefilled in the editor, and edits it. How much they are told depends on tier: T1 names the flaw ("Buckets 2 and 3 overlap"), T2 says "this answer has one flaw", T3 says "this answer may have one or two flaws".
- **Scoring:** checklist, AI-graded after the set, each answer in its own call.

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Fixes each planted flaw (one check per flaw) | 50% split evenly | That flaw's tag |
| Adds no new flaw of the drill's types | 30% | The new flaw's tag (the AI picks from the drill's tag list) |
| Keeps the substance of the parts of the answer that were right | 20% | The drill's "dropped right part" tag (table below) |

- **Code pre-check:** an answer unchanged from the flawed version (after whitespace normalization) scores 0 and logs the planted flaw's tag, with no AI call.
- **One slip counts once:** when the keeps-right check fails, code passes the no-new-flaw check, so a new flaw that comes with losing a right part (stating as fact what the original framed as likely) costs the student once. The exceptions are an unchanged answer and one that addresses the grader (see Checklist grading call). An answer with two separate slips, such as an irrelevant bucket added and a right one dropped, also loses only the keeps-right share; that leniency is accepted.
- **Substance counts as kept:** a right part is kept if its substance is still used, even reworded, condensed or moved ("the extra visits add $1.2M" keeps "40% joined and visited 12% more"). Dropping it, or changing it so it is no longer right, fails.
- **Planted flaws aren't new:** a planted flaw left in place or reworded is judged by its fix check, and a weakness the original already had is not a new flaw. The fix described in the key is one example; any edit that removes the flaw and fits the case fixes it.
- **Answer key:** the flawed answer, its flaw types and tags, a model repair, and a note on which parts were right.
- **Item source:** derived from Level 1 items (PS-1 frameworks with a planted flaw; HY-1, EX-1 and SY-1 distractors), so the scenarios already exist and only the repair key is new. AI-drafted, human QA. A student is not served a Repair item derived from a Level 1 item they saw in the last 14 days.
- **Progression:** Repair sets don't change skill states. They move the student from Recognize to Construct (see Mastery).

| Drill | Flawed answer comes from | Input | Set and time (T1 / T2 / T3) | "Dropped right part" tag | Priority |
| --- | --- | --- | --- | --- | --- |
| PS-4 Fix the framework | PS-1 frameworks with a planted flaw (T3 may plant two) | Structured bucket editor, prefilled, same caps as PS-3 | 5 items; 120 / 90 / 75 s | `M.missing_bucket` | P0 |
| HY-3 Fix the hypothesis | HY-1 distractors: restates facts, shotgun, overconfident, untestable | Free text, prefilled, up to 40 words | 6 items; 60 / 45 / 35 s | `M.ignores_facts` | P0 |
| EX-5 Fix the takeaway | EX-1 distractors: trivial, misread, unsupported; chart stays visible | Free text, prefilled, up to 40 words | 6 items; 60 / 45 / 35 s | `M.unsupported_claim` | P1 |
| SY-3 Fix the recommendation | SY-1 distractors: buried, hedged, padded, unsupported | Free text, prefilled, up to 80 words | 5 items; 90 / 75 / 60 s | `M.unsupported_recommendation` | P0 |

### CL-4 Your next move (P1)

- **How it works:** two stages on the same item, mirroring HY-2.
  1. *Plan:* the student sees where the case stands (same setup as CL-1) and writes the next step and why, up to 40 words.
  2. *Adapt:* a new fact is revealed. The student taps Keep or Change, then writes up to 30 words why (including the new step if Change).
- **Set and time:** 4 items. Stage 1: 75 / 60 / 45 s. Stage 2: 60 / 45 / 35 s.
- **Scoring:** stage 1 is 60% of the item, stage 2 is 40%.

| Check | Weight | Failed check logs |
| --- | --- | --- |
| Names one specific next analysis, not a list | 20% | `M.illogical_next_step` |
| The step is logical: not already answered, on the objective, not jumping to a solution | 25% | `M.illogical_next_step` |
| Gives a reason tied to the latest finding | 15% | `M.illogical_next_step` |
| Keep/Change decision correct (auto) | 25% | `M.illogical_next_step` |
| Change reason uses the new fact | 15% | `M.illogical_next_step` |

- **How the decision is auto-checked:** as in HY-2. The AI classifies the stage 1 step into one of the key's 3–4 step families, or "other", in a separate call that sees only stage 1. The key states the correct action for each family given the new fact; code compares the student's tap. For "other", both actions are accepted.
- **Red flag:** gives a final recommendation instead of a next step (stage 1 capped at 0.4, `M.illogical_next_step`).
- **Defend:** none added; the Adapt stage plays that role.
- **Item source:** derived from CL-1 items plus one new fact per item. Each new fact must support at least one step family and undercut at least one. AI-drafted, human QA.

### Defend step

The Defend step trains what interviews test most: answering a follow-up about your own answer.

- **When:** after the main answer of a Construct item at tiers 2 and 3, including test-out sets (which run at tier 2). Not at tier 1, in the diagnostic, or in Repair or Recognize drills.
- **Types:**
  - *Justify:* a question about the student's own answer ("Which bucket would you dig into first, and why?"). Written reply, up to 40 words.
  - *Challenge:* scripted interviewer pushback on the case facts. Half the challenges in each drill's pool are valid and half are not. The student taps Hold or Update, then writes up to 40 words why. Each challenge opens with who raises it ("Our CFO says…", "A lumber analyst says…"). Neither kind may give itself away: the client's own people and outsiders both raise valid and invalid challenges, valid ones can point out a flaw in the reasoning, and invalid ones can bring a true fact that doesn't change the decision. Every fact a challenge, its reason or its model reply relies on is on the fact sheet, in the challenge, or worked out from them.
- **Time:** 60 s at T2, 45 s at T3.
- **Weight:** the Defend step is 25% of the item score; the main answer's weights scale to 75%. For HY-2 that makes stage 1 45%, stage 2 30%, Defend 25%.
- **Skills:** the Defend score counts toward the item's skills (it is part of the item score). Its checks also count toward `CL.pushback`.
- **Shorter sets:** drills with Defend serve one fewer item at T2 and T3: PS-3, HY-2 and CL-3 drop from 4 to 3 items; SY-2 stays at 3. Set size is set per tier in `drills.v1.json`.
- **Scoring:** one AI call per Defend reply, made with the set's other grading calls after the last item. Input: the item prompt, the student's main answer and reply (both as delimited data), the follow-up and the checks.

| Type | Check | Weight | Failed check logs |
| --- | --- | --- | --- |
| Justify | Answers the question asked and commits to one choice | 35% | `M.dodged_question` |
| Justify | Gives a reason that uses a case fact supporting the choice | 40% | `M.no_evidence_in_defense` |
| Justify | Consistent with the student's own main answer | 25% | `M.inconsistent_defense` |
| Challenge | Hold/Update decision correct (auto) | 40% | `M.caved_to_invalid_pushback` or `M.ignored_valid_pushback` |
| Challenge | Reason uses a fact from the case or the challenge that supports the decision, whether or not the decision was right | 40% | `M.no_evidence_in_defense` |
| Challenge | Says what changes (Update) or restates the conclusion (Hold), consistent with the main answer | 20% | `M.inconsistent_defense` |

- **Evidence that supports the choice:** a case fact counts only if it supports what the reply picks. "Warehouse rent, because costs rose 18%", when the 18% is the rise in shipping cost per order, fails. A case with no facts beyond its question needs one added, so a reply has something to cite; the follow-up's own premise ("if that analysis comes back flat") is not a case fact.
- **Vague replies count once:** a reply too vague to judge ("ride data", "more research") fails the checks about its content (Justify's answer and reason checks; HY-2's data and drop-result checks), not the consistency check. After Update, a Challenge reply must still say what the recommendation becomes; "do more testing" fails that check.

Follow-ups by drill (drill-specific checks replace the generic ones where listed):

| Drill | Type | Follow-up | Checks |
| --- | --- | --- | --- |
| PS-3 | Justify | "Which bucket would you dig into first, and why?" | Generic |
| HY-2 | Justify | "What data would you ask for first to test your hypothesis, and what result would make you drop it?" | Names a specific data request (40%, `M.untestable_hypothesis`); states a result that would reject it (35%, `M.untestable_hypothesis`); consistent with own hypothesis (25%, `M.inconsistent_defense`) |
| SY-2 | Challenge | Item-specific, e.g. "The CFO says your payback math ignores the ramp-up year." | Generic |
| CL-3 | Justify | "If that first analysis comes back flat, what would you look at next, and why?" | Generic |
| EX-4 (P1) | Justify | "What does this mean for the client's decision?" | States an implication for the decision (40%, `M.no_implication`); tied to the client's objective (35%, `M.implication_off_objective`); consistent (25%, `M.inconsistent_defense`) |
| QN-5 (P1) | Justify | "Defend your assumption for \[driver named in the key\]." | Gives a basis: a benchmark, comparison or derivation (60%, `M.unreasonable_assumption`); consistent with own number (40%, `M.inconsistent_defense`) |

- **Answer key additions:** follow-up type and text; for Challenge, whether it is valid and why; a model reply.
- **New tags** (both under `CL.pushback`, default severity minor): `M.dodged_question`, `M.inconsistent_defense`.

## Scoring system

Code computes every score; the AI's only job is to answer narrow yes/no checks about free-text answers and quote the evidence, and code verifies those quotes before using them.

### Item scoring rules

| Input type | Item score | Mistake tags come from |
| --- | --- | --- |
| Single choice | 1 if correct, else 0 | The tag on the chosen wrong option |
| Multi-select | max(0, correct picks − wrong picks) ÷ number of correct options | Tags on wrong picks and on missed correct options |
| Numeric | 1 if within the item's tolerance, else 0 | Trap-value match (QN-3 precedence), else `M.arithmetic_error` |
| Multi-step (QN-4, QN-5, HY-2, CL-2, CL-4) | Weighted sum of step scores, per the drill spec | Each failed step's tag |
| Checklist (free text) | Sum of weights of passed checks, then any red-flag cap applied | Each failed check's tag, plus red-flag tags |
| Repair (free text) | Checklist, as above; an unchanged answer scores 0 by code | Failed checks; unchanged answer logs the planted flaw's tag |
| Defend step (T2–T3 Construct items) | 25% of the item; checklist, plus an auto-checked decision for Challenge | Failed Defend checks (mostly `CL.pushback` tags) |
| Timeout with empty answer | 0 | `M.timeout` |
| Skip | 0 | `M.skipped` |

Set score = the average item score. Feedback text for every tag and check comes from the answer key, not from AI-written prose, so wording is consistent and reviewed.

### Numeric parsing and tolerance

- One shared parser converts student input to a number: commas, `$`, `%`, `k`/`K`, `m`/`M`/`mm`, `b`/`B`/`bn`, and the words thousand, million and billion.
- Each item stores `tolerance_type` (absolute or relative) and `tolerance_value`. Defaults: exact for integers, ±1% relative otherwise.
- Each item stores `percent_format`, one of three modes. Percent answers are stored in percent units (25 means 25%).
  - `none`: not a percent answer; `25%` is read as 0.25.
  - `percent`: `25` and `25%` both mean 25%; `0.25` means 0.25%.
  - `percent_or_decimal`: as `percent`, and a bare `0.25` also counts as 25%.
- Unparseable input is not scored; the student sees "Enter a number" and the timer keeps running.

### Checklist grading call

One call per written answer, made after the last item of the set; a set's calls run in parallel. Each Repair answer, Construct answer and Defend reply is graded in its own call, so a student's score never depends on their other answers: when answers shared a call, the grader's verdicts shifted with whatever else was in it (the same answer could lose 15–40 points depending on its neighbors). Calls are never batched. Grading moves to "as soon as each answer is submitted" only if results p95 goes over 10 s.

- **Model:** The cheapest model tier that meets the 90% agreement target on the golden set (see below), chosen per check. Structured JSON output enforced by schema.
- **Grader per check (2026-10-16):** Claude Haiku 4.5 (temperature 0) grades every check except the HY-2 follow-up's (data request, drop result, consistency), which Claude Sonnet 5.5 grades (thinking off, grading rules in its cached system prompt). Chosen from a two-run comparison of Haiku 4.5, Sonnet 5.5 and Haiku 5.5 on every golden set: only this mix cleared 90% on every check with fewer than 3% of verdicts changing between runs. About $0.0045 per graded answer without caching (about $0.91 per student per month at 200 answers).
- **Input:** The item's prompt, the student's answer, and from the key only the checks (id and question text), hypothesis families or categories if the drill uses them, and the red-flag definitions. Model answers are not sent, to keep tokens down.
- **Student text is data.** It is wrapped in clearly delimited tags, and the system prompt states that instructions inside it must be ignored. Code fails checks for an injection only on a high-confidence match: the answer names the grader or the system ("Grader:", "SYSTEM:") or tells it to ignore the rubric, mark checks passed or give full marks (`lib/drills/grading/injection.ts`). A match fails PS-3's case-specific and concrete sub-point checks, a Repair answer's no-new-flaw and keeps-right checks, and every check of a Defend reply. An injection the grader suspects without such a match is graded normally, logged, and flagged for human review.
- **Output per check:** `pass` (true/false) and `evidence`, an exact quote from the student's answer (required when `pass` is true; optional when false).
- **Output extras (only for drills that need them):** `hypothesis_family` for HY-2 (from its separate stage 1 call); step family for CL-4; `valid_ideas` (list of {text, category}) for CR-1.
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
- **Code pre-checks run first:** word caps, bucket counts, empty fields, unchanged Repair answers and number presence (SY-2) are checked by code. If a pre-check settles a check or red flag, it is not sent to the AI.

### Grading quality

- **Golden set:** each AI-graded drill and each Defend follow-up type has at least 30 human-graded answers, including edge cases (very short answers, off-topic answers, injection attempts, borderline passes).
- **Release gate:** any change to a grading prompt, model or checklist must reach at least 90% agreement with human labels on every check before it ships. This runs automatically in CI.
- **Labels follow the written rules, never grader output.** Each label cites the rule in `docs/drills-grading-guide.md` that decides it. A disagreement found in a gate run is reported and may lead to a proposed rule change; labels are never changed to match the grader. When a rule changes, every label in every affected golden set is rechecked against it, and each change is listed with its before and after.
- **Versioning:** every grade stores `grader_prompt_version` and `model_id`.
- **Monthly audit:** 100 randomly sampled graded answers are reviewed by a human; agreement is reported per check, including Defend checks.
- **Disputes (P1):** a "Disagree with this grade?" link on the results screen logs the item for QA review. Disputes don't change the score automatically.

## Mastery and adaptive progression

A skill is Practiced after two consecutive Construct sets at 80% or higher, at tier 2 or above (Defend included); it becomes Mastered when it passes a transfer check on unseen items, and Validated only when a later full case uses the skill without that skill's mistakes. All rules are fixed and stored in a config file so they can be tuned without code changes. The 80% bar and two consecutive sets stay for the pilot and will be tuned from its data.

### Skill score from a set

- Every item and every checklist check maps to one or more skills (checks map through their failure tag).
- A set's score for a skill = the weighted average of the items and checks tied to that skill.
- A set counts toward a skill only if it contains at least 3 items or checks for that skill.
- **Primary skills.** Each drill marks every skill it scores as primary or secondary (`drills.v1.json`). Only a drill's primary skills change state from its sets. A secondary skill's scores and mistakes still count toward its skill score, top mistakes and prescriptions, but can't make it Practiced. For example, QN-4's primary skill is `QN.setup`; it also scores `QN.arithmetic` and `QN.magnitude`, which only QN-3 can move, so a student can't reach Practiced on arithmetic without doing mental math. Secondary skills today: QN-4 (`QN.arithmetic`, `QN.magnitude`), QN-5 and EX-3 (`QN.arithmetic`). The drill a skill's chain serves must have it as a primary skill.

### Skill states and transitions

| From | To | Condition |
| --- | --- | --- |
| Not started | Learning | First prescription, diagnostic placement, plan start, or first set completed for the skill |
| Learning | Recognizes | 2 consecutive Recognize (Level 1) sets ≥ 80% on the skill, at T2 or above |
| Learning or Recognizes | Practiced | 2 consecutive Construct sets ≥ 80% on the skill, at T2 or above (Defend included). From Learning this is the test-out |
| Practiced | Mastered | Transfer check ≥ 80% |
| Practiced | Recognizes | Transfer check below 60%, or a full case logs any of the skill's mistake tags |
| Mastered | Validated | The next full case marks the skill as observed and logs none of its mistake tags. A retake (a case the student has finished before) can't validate: the student may remember it |
| Mastered or Validated | Recognizes | A full case logs any of the skill's mistake tags, or a spaced review scores below 60% |
| Not started or Learning | Recognizes | Credit down: a skill that builds on this one reaches Mastered (see Skill tree) |

Repair sets and lessons never change skill states.

**Skills with no live Construct drill** (for example `SY.summary`, `EX.traps`, and Business Judgment in the MVP): Level 1 criteria grant Practiced, the transfer check uses unseen Level 1 items at tier 3, and the profile labels the skill "Level 2 coming soon."

**Skills with no Recognize drill** (for example `QN.arithmetic`, `PS.depth`, `HY.update`, `EX.extraction` and `CL.data_requests`): they stay at Construct throughout. A set below 50% drops the tier instead of the stage (or goes to Repair, if the skill has a Repair drill).

### Where a student starts and how they move between stages

1. The starting stage comes from the track and the diagnostic (see Training program). Without either, the first set for a newly prescribed skill is Construct, tier 2. This is the test-out attempt; because it is at T2 it counts toward Practiced, and once Defend ships it includes the Defend step. Skills with no live Construct drill start at Recognize, tier 2.
2. After a Construct set: 80% or higher counts toward Practiced (T2 and above). 50–79% → the next set is Repair, or Construct again if the skill has no Repair drill. Below 50% → the next set is Recognize and the lesson is offered (in Sprint: Repair instead of Recognize). The stuck rule (Skill tree) may prescribe a prerequisite first.
3. Once a skill reaches Recognizes, the next set is Repair. A Repair set at 70% or higher moves the student to Construct; otherwise one more Repair set, then Construct regardless.
4. Skills with no Repair drill skip that stage.
5. In Sprint, and whenever the interview is 7 or fewer days away, Recognize is never served, except for skills with no live Construct drill.

### Difficulty tiers

- Each student has a current tier per drill, starting at T1. The test-out set is the exception: it is served at T2 and sets the drill's tier from its result.
- A set at 80% or higher moves the student up one tier (max T3). A set below 50% moves them down one tier (min T1). Anything in between keeps the tier.
- Only T2 and T3 sets count toward state changes. T3 is the "under time pressure" stage; the profile shows a "Timed" badge when a Mastered skill passes a T3 set.

### Spaced review

- A Mastered or Validated skill not practiced for 14 days becomes eligible for review.
- A review set uses the skill's Construct drill where one exists (otherwise Recognize), at the student's current tier, served in the workout's review slot.
- A review set is half the normal set size, rounded up. Drills with 4 or fewer items per set (PS-3, HY-2, QN-5, SY-2, CL-3, CR-1) use their full set size, so the review still meets the 3-items-or-checks minimum and counts toward the skill.
- At 80% or higher, the review clock resets. Below 60%, the skill drops to Recognizes. In between, another review is scheduled for 7 days later.

### Transfer check

- Unlocks 2 days after a skill reaches Practiced (immediately in Sprint) and is served in the workout's unfamiliar slot.
- A full-size Construct set at tier 2, with Defend, built only from items the student has never seen, from a case type and industry they haven't practiced on that skill in their last 3 sets. Generated drills use a different template context and new seeds.
- 80% or higher → Mastered. 60–79% → stays Practiced; one Construct set goes into the weak-spot pool and another transfer check unlocks 2 days later. Below 60% → Recognizes.
- Week 6 (Readiness) runs a transfer check on every prescribed skill still at Practiced.

### Progress bar toward the next state

The skill profile shows how many qualifying sets the student has (0, 1 or 2 of 2) and their most recent skill score against the 80% bar, in plain words: "1 of 2 passing sets. Last score: 74%. Need 80%." After Practiced it shows the transfer check: "Transfer check unlocks Thursday."

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
  "rubric_scores": {"structure": "needs_work", "quantitative": "meets_bar"},
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
- `rubric_scores` uses the case grader's format: the 8 dimension keys from `lib/scoring/rubric.ts` (`structure`, `quantitative`, `dataExhibit`, `judgment`, `creativity`, `synthesis`, `communication`, `pushback`), each rated `needs_work`, `meets_bar` or `strong`. Dimensions the grader couldn't rate are left out.
- `severity` is `minor` or `major`. Each tag's default is set in the taxonomy file. The case grader may downgrade a finding to `minor` if the candidate corrected it themselves or it didn't change the conclusion, and may upgrade `M.waited_for_interviewer` to `major` in candidate-led cases. The finding carries the final severity, and the prescription rules use it, not the default.
- `evidence` must be an exact quote from the transcript. The drills service shows it to the student in the prescription reason.
- The grader changes needed to emit this payload are deferred; the case grader will be updated later. Until then, drills are built and tested against fixture payloads.

### Prescription rules

1. Map each finding's tag to its skill. Count each mistake tag once per case: if the grader reports the same tag more than once, it counts as one finding, major if any of them is major.
2. Give each skill a priority score: +2 per major tag, +1 per minor tag (using each finding's final severity), +2 if the same skill was flagged in the previous case, +1 if the skill was Mastered or Validated (a regression).
3. Remove skills with no live drill. Their findings still appear in case feedback.
4. Take the 3 highest-scoring skills, with no more than 2 from the same skill area (PS, QN, EX and so on). If a third skill would be the area's third, skip it and take the next-highest skill from a different area. If there is none, prescribe only 2. Ties go to the skill in the lower state, then to the skill whose drill is listed first in the catalog.
5. For each skill, choose the drill from the skill-keyed drill map in config (`skill_drills`: each skill's Recognize, Repair and Construct drill, for example `PS.case_specific` → PS-1 / PS-4 / PS-3), and the stage and tier from the Mastery rules. Every tag maps to exactly one skill, so the skill decides the drill. If the finding's tag is listed in `focusable_tags` (for example, `M.zeros_error` → QN-3), the set focuses on that tag.
6. Write the reason from a template using the tag and the evidence quote: "In your last case you said '…two million divided by fifty dollars.' Breakeven uses contribution per unit, not price."

Prescriptions from the diagnostic and the plan follow the Training program rules, and the stuck rule can add prerequisite prescriptions (Skill tree). In a workout's weak-spot slot, all open prescriptions are ranked together, with +2 for skills in the week's focus areas.

### Prescriptions inside drills

- If one mistake tag accounts for 40% or more of a completed set's misses, the next set for that skill focuses on that tag (for example, 70% of mental math items become zeros problems).
- If a set reveals mistakes belonging to a different skill (for example, a zeros error in the QN-5 calculation step), they are weighed as in a case: +2 per major miss, +1 per minor miss (each tag's default severity). At 2 or more (one major miss, or minor misses adding up to 2 in the set), that skill gets a prescription with priority +1, placed behind the case prescriptions. It is skipped if the skill already has an open prescription or the student dismissed its last one.

### Lifecycle

- A prescription stays open until its skill reaches Mastered, or until a newer case regenerates the list. A prescription paused by the stuck rule resumes when its prerequisite reaches Practiced or after 3 prerequisite sets.
- When a newer case arrives, open prescriptions are recalculated: the previous case's and the diagnostic's prescriptions are superseded, and so is any other prescription for a skill the new case prescribes. Prescriptions created inside drills and by the plan stay open. A drill set already in progress is kept and finishes normally.
- Students can dismiss a prescription. Dismissals are logged and the skill is not re-prescribed until another case flags it.

### Picking the next case

When the Next case card appears, it recommends one case:

1. The case type whose main skill falls in the skill area of the most recently Practiced or Mastered prescribed skill, so the case retests it.
2. The same difficulty tier as the student's last case, or one tier higher if that case met the bar: no dimension rated `needs_work` and at least half of the rated dimensions `strong`.
3. A case the student hasn't taken.

This needs a `case_type` field on every case (the case schema's optional `caseType`) and a config map from each of the 14 case types to its main skill area (`case_type_to_skill_area` in `rules.v1.json`, approved by Matt on 2026-10-11; reasons in `docs/drills-case-type-map.md`):

| Skill area | Case types |
| --- | --- |
| QN Quantitative Rigor | profitability, cost reduction, pricing, investment decision, market sizing |
| PS Problem Structuring | market entry, growth strategy, public sector, operations |
| BJ Business Judgment | M&A, new product launch (BJ drills arrive in P1) |
| HY Hypothesis | turnaround, competitive response |
| EX Exhibit Interpretation | industry analysis |

**Small library.** The rules are relaxed in order (area, then tier) until a case qualifies. When the student has taken every case, the card offers the one taken longest ago as a retake. With no cases, there is no card. Nothing loops, including with the single case in the library today. The card links to the case page; drills can't start a case itself until the case product accepts a student who has already passed the club-code gate.

### Updating skill state from cases

- Any finding on a Practiced, Mastered or Validated skill drops it to Recognizes.
- A Mastered skill listed in `skills_observed` with no findings becomes Validated, unless the case is a retake. A case is a retake when the student finished the same case before (an earlier case result, or an earlier completed case session). Retakes still log findings, can drop a skill, and count toward weekly case targets.
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
  "stage": "construct",
  "tier": 2,
  "skills": ["PS.mece", "PS.case_specific", "PS.depth"],
  "case_type": "market_entry",
  "industry": "fitness",
  "prompt": "A regional gym chain is considering launching an at-home fitness subscription...",
  "exhibit": null,
  "input": {"type": "structured_buckets", "max_buckets": 5, "max_words": 120},
  "is_example": false,
  "options": [],
  "numeric": null,
  "checks": [
    {"check_id": "cover_demand", "question": "Does the framework cover customer demand for at-home fitness?",
     "weight": 0.10, "fail_tag": "M.missing_bucket", "feedback": "You didn't test whether members want this."}
  ],
  "red_flags": [
    {"id": "generic_framework", "definition": "A memorized framework not adapted to this case",
     "cap": 0.4, "tag": "M.generic_framework", "detection": "ai"}
  ],
  "defend": {"type": "justify", "text": "Which bucket would you dig into first, and why?", "model_reply": "..."},
  "model_answer": "...",
  "explanation": "...",
  "sources": [],
  "authorship": {"author_of_record": "...", "drafting_model": "...", "reviewed_by": "...",
                 "reviewed_at": "...", "similarity_check": "passed", "similarity_note": null,
                 "similarity_checked_at": "..."},
  "generator": null,
  "firm_style": null
}
```

- `options` (choice drills): each option has `id`, `text`, `correct`, `tag` (for wrong options) and `feedback`.
- `input.steps` (multi-step items, for example QN-4): the steps in order, each with an input `type` and its `weight` from the drill spec (QN-4: single choice 0.4, then numeric 0.6). `input.type` is the first step's type. Step weights are scoring rules, not answer data, so they reach the client.
- `numeric` (numeric drills): `answer`, `tolerance_type`, `tolerance_value`, `percent_format` (`none`, `percent` or `percent_or_decimal`), `trap_values` (each with `value` and `tag`). A trap matches when the student's number is within the item's tolerance of the trap value, or equals the trap value rounded the way students round (to 0–2 decimals, or to 2–3 significant figures). Generator tests reject any item where a rounded trap would land on the answer, a rounded answer would land on a trap, or two traps share a rounded form.
- `is_example` marks the drill's worked example, shown on the intro screen. One reviewed authored item per drill; it is never served in a set.
- Drill-specific extras live in `extras`: hypothesis families and the update fact (HY-2), driver cards and ranges (QN-5), key categories and target count (CR-1), relevant, irrelevant and deciding facts (SY-2), the critical check(s) (PS-3, CL-3).
- `generator` is null on authored items. On generated items it holds `template_id`, `template_version` and `seed`, and `extras.inputs` holds the structured inputs the answer is computed from.
- `firm_style` is reserved for future firm-style toggles.
- Items are versioned. Any edit creates a new version; attempts store the version they used.

New in v2:

- `stage` on every item: recognize, repair or construct.
- `industry` on every authored item, used by the unfamiliar slot and transfer checks: one of Consumer / CPG, Retail / E-commerce, Tech / SaaS, Pharma / Biotech, Healthcare Provider / Payor, Financial Services, Airlines / Travel / Hospitality, Industrials / Manufacturing, Logistics / Transportation, Energy / Utilities, Telecom / Media, Public / Education / Nonprofit, or Other; null when the item names no client. It is review metadata: it can change without a new item version.
- Industry rules (Matt, 2026-10-11): restaurants, cafés, bakery chains, venues, attractions and sports teams → Airlines / Travel / Hospitality; apps and online platforms → Tech / SaaS, unless they sell their own goods (→ Retail / E-commerce); products households buy, including vehicles and farm products → Consumer / CPG, products businesses buy → Industrials / Manufacturing; schools, classes, lessons, tutoring and childcare → Public / Education / Nonprofit; a government running transport, hospitals or utilities → that sector, a government policy decision → Public; professional services, vet care, and consumer and local services (salons, gyms, laundromats, cleaning, repair, pest control) → Other; investor or fund clients → the industry being invested in. `npm run drills:industry` tags new items with these rules; a human checks the tags it is unsure about.
- Repair items: `extras.flawed_answer`, `extras.flaw_tags` and `extras.derived_from` (the Level 1 item id).
- Construct items with Defend: `defend` = {`type` (justify or challenge), `text`, `valid` and `reason` (challenge only), `checks` (when drill-specific), `model_reply`}. Defend text stays on the server until the main answer is submitted.
- CL-4 items: step families, the new fact and the correct action per family, as in HY-2.

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
- A case (the same client situation) is used in one drill only, so a student who has seen it in one drill doesn't already know the answer in another. Repair items are the exception: they deliberately reuse their Level 1 item's scenario. A scenario check flags any two items in different drills that share a client type and key figures (words few items use, plus shared numbers, including chart values). A flagged pair is changed, or recorded with a reason in `drill-items/scenario-reviewed.json` once a human confirms the scenarios differ; validation fails on any other flagged pair. Every numeric range (QN-5 drivers and totals) cites a source or gives its derivation.
- **Wording checks (choice drills).** A pool of 20+ items fails validation, and can't be seeded, if its wording gives answers away: (1) length: the right answer is the longest, or the shortest, option in more than 30% of items; (2) phrases: a phrase, opening or ending appears in 5+ options and is right in 80%+ of them, or in 12+ and wrong in 95%+; (3) odd one out: within items, the right answer is the only option with (or without) some feature in 5+ items and at least 60% of such cases; (4) rule player: a solver that learns wording patterns from the rest of the pool, never reading the case, scores above 33% (chance is 25%). "Wording" includes punctuation and shape: colons, semicolons, dashes, brackets, sentence count and the final period. The review page shows each pool's results. Thresholds live in `lib/drills/content-checks.ts`.
- **Irrelevant facts (SY-1, SY-2, SY-3).** Padding must pass the partner test: a partner would say "interesting, but it doesn't change the answer". A fact that could change the answer (an award in a pricing case, a comparable, cash that changes the value of an up-front payment) isn't padding. Sunk costs and numbers outside the decision's math make good tempting padding. Each irrelevant fact's type is recorded in `drill-items/padding-types.json` (review metadata), and a drill's pool of 10+ items fails validation if any one type is more than 30% of it. A fact with a year keeps it everywhere: options, feedback, explanations and model answers never restate it as a duration ("in three years"), which goes stale; a content check, run against the current year, flags restatements. Dates must not be a shortcut: sunk costs are written in varied ways, some relevant facts carry a year, and a pool fails validation if under 30% of its facts with a year are relevant or over half its sunk costs carry one.
- **Challenge cues (SY-2).** Once a drill has 8+ Challenges, the pool fails validation if valid challenges are under 40% or over 60% of it, or if valid is predictable from who raises the challenge (the client's own people or outsiders) or from whether it brings a number that isn't in the case: any such group of 4+ challenges must be 20–80% valid.
- **Similarity check (clean room).** Each authored item gets a one-time AI review (`npm run drills:similarity`, Claude Opus 5.5 with web search) that flags anything closely resembling well-known published case-prep material (RocketBlocks, CaseCoach, Hacking the Case Interview, Management Consulted and similar). Common business situations and standard frameworks are not flagged. The result is stored on the item (`authorship.similarity_check`: `pending`, `passed`, `flagged` or `failed`, with a note and date); flagged items go to the reviewer, who marks them `passed` or `failed`. Validation keeps an authored item off `live` until it is reviewed and `passed`. Generated items are built from our own templates and are marked `not_applicable`. The check combines the model's knowledge with a few web searches per item for published cases with the same premise (without search it missed Oliver Wyman's Supermarket Pharmacy case); it records whether an item was checked with search, and can still miss paywalled or unindexed material.
- **Explanations** separate what the data shows, what is suspected, and what would confirm or overturn it.

### Lessons

- Format: `lesson_id`, `skill_id`, `version`, `status` (draft, in\_review, live, retired), `body` (markdown, 600 words or fewer, title included), `worked_example`, `mistakes` (list of {tag, one-line explanation}), `authorship`.
- Same workflow as authored items: AI-drafted from a lesson prompt and this PRD, reviewed by a human who becomes author of record, similarity-checked, versioned.
- The reviewer confirms the pattern matches how the drill's answer keys grade, so lessons never teach something the checklists penalize.
- Authoring: one markdown file per lesson in `/lessons`. Each file has front matter, then nine sections: The idea, Why interviewers care, Why it works, The pattern, Worked example, Another example, Tricky cases, Common mistakes, and Quick check (a question, then a line starting "**Answer:**"). Validation checks:
  - the 600-word limit;
  - one common-mistake line for each of the skill's mistake tags, and no others;
  - all four newer sections present, or none;
  - an answer to the quick check;
  - a reviewer on live lessons.
- The intro lives in `/lessons/intro/` with its own layout: The idea, then sections, where each numbered stage ends with a `Skills:` line. Validation checks the word limit, that every named skill exists, and that every skill with a lesson appears in exactly one stage. The intro is checked and reviewed like a lesson but not seeded.
- **Scenarios:** a lesson's examples, tricky cases and quick check must not reuse a drill item's scenario with the same question, so a lesson can't give away an item's answer. The same client type alone is allowed. A content check flags a lesson part that shares with an item on the same terms as two items: 2+ distinctive words and a figure, 3+ such words, or one word and 2+ figures.
  - A word is distinctive if few items and at most two lessons use it; a figure, if few items use it.
  - A human may record a flagged pair as different in `lessons/scenario-reviewed.json`, with a reason.
  - The check runs in the tests and in `npm run db:seed-lessons`, which refuses to publish while it flags anything.
- Review: a review page in the app (local development only) shows each lesson exactly as students see it, with Approve and Request changes; decisions are written into the lesson file and published with `npm run db:seed-lessons`. A combined file for reading outside the app is generated by `npm run drills:lessons-doc` (`docs/drills-content/lessons-review.md`).

### Launch pool sizes (P0)

| Drill | Authored items at launch | Reason |
| --- | --- | --- |
| PS-1 Spot the gap | 80 | 10 sets before repeats |
| PS-3 Framework builder | 40, each with a Defend follow-up | 10+ sets before repeats; also feeds transfer checks |
| PS-4 Fix the framework | 40 (derived from PS-1) | 8 sets before repeats |
| HY-1 Pick the best hypothesis | 80 | 10 sets before repeats |
| HY-2 Initial hypothesis | 40, each with a Defend follow-up | 10+ sets before repeats |
| HY-3 Fix the hypothesis | 40 (derived from HY-1) | 6–7 sets before repeats |
| QN-5 Market sizing | 30 | 10 sets before repeats |
| EX-1 Chart read | 80 | 10 sets before repeats |
| SY-1 Pick the best summary | 80 | 10 sets before repeats |
| SY-2 60-second recommendation | 30, each with a Challenge follow-up | 10 sets before repeats |
| SY-3 Fix the recommendation | 30 (derived from SY-1) | 6 sets before repeats |
| CL-1 What's next? | 80 | 10 sets before repeats |
| CL-3 What do you need to know? | 40, each with a Defend follow-up | 10+ sets before repeats |
| Lessons | 23, plus the intro | One per skill trained by a P0 drill, plus Defending your answer (`CL.pushback`) and How a case interview works |

QN-1, QN-3, QN-4, EX-2 and EX-3 are fully generated and need no authored pool.

**Pilot exception:** the pilot runs with the current Level 1 pools (40–50 items per drill: PS-1 50, HY-1 45, EX-1 45, SY-1 40, CL-1 40). They grow to 80 before wider launch, guided by item-health data from the pilot.

v2 adds about 110 Repair items, 150 Defend follow-ups and 22 lessons to review before launch: roughly 280 pieces on top of the existing items. Repair items reuse existing scenarios, so most of the work is writing and checking the repair key.

### Serving rules

- A student never sees the same authored item twice within 60 days. When a student exhausts a pool, the items they saw longest ago are reused.
- Transfer checks use only items the student has never seen. If none qualify, the check uses the item seen longest ago from a case type not practiced on that skill, and logs `transfer_pool_exhausted`.
- Repair items derived from a Level 1 item the student saw in the last 14 days are not served.
- Sets mix items across case types where possible.

### Item health

- After 50 attempts, each item's correct rate, average time and option distribution are checked daily.
- Items with a correct rate below 15%, or where one distractor is picked more often than the correct answer, are automatically pulled to review.
- **Pilot:** no daily job. Items are flagged at 20+ attempts at the top of the reports page, and Matt pulls them to review by hand. An item's attempts can't exceed the number of students (no repeats within 60 days), so 50 is out of reach in the pilot; below 20, one student moves the rate by 5+ points. The daily job at 50 attempts is revisited after the pilot.
- Items above 95% correct are flagged as too easy.
- Authored items are re-tiered from observed correct rates: T1 if 70% or higher, T2 if 40–69%, T3 if below 40%.

## Data model

The drills system needs 17 tables (18 with P1 disputes) plus 4 versioned config files; the `drill_attempts` table is the most important, because it is the item-level record everything else is computed from.

### Config files (versioned, loaded at startup)

- `taxonomy.vN.json`: skill areas, skills, mistake tags (with default severity and skill mapping), prerequisites, deprecations.
- `drills.vN.json`: per drill: id, name, level, stage, skills (each marked primary or secondary), input type, scoring type, set size and time limits per tier (set size varies by tier for drills with Defend), pass bar, Defend type, priority, live flag.
- `rules.vN.json`: mastery thresholds, tier step rules, stage moves, transfer delay and bars, spaced review intervals, prescription weights, stuck rule, workout mix and target minutes, the skill-keyed drill map (`skill_drills`), focusable tags, case-type-to-skill-area map.
- `programs.vN.json`: tracks, assignment thresholds, the six-week plan (theme, focus areas, case targets, milestones per week), the Sprint day plan, compression rules, workouts per week by availability.

Config files live in the repo and are validated with zod at startup. Changing a value needs a deploy but no code change.

### Tables

| Table | Key fields | Notes |
| --- | --- | --- |
| `student_profiles` | user\_id, org\_id (nullable), timezone, created\_at | The student record. The app has no users table, so drills adds this one. `timezone` is the browser's IANA time zone, stored at signup |
| `student_drill_settings` | student\_id, time\_multiplier (1, 1.5, 2), untimed, skipped\_examples\[\] | Extends `student_profiles`. `interview_date` moves to `student_programs` |
| `drill_items` | item\_id, version, drill\_id, status (draft, in\_review, live, retired), is\_example, stage, industry, tier, skills\[\], payload (JSON, per Content system), authorship (JSON), created\_at | Authored items only; generated items are rebuilt from seeds |
| `drill_item_stats` | item\_id, version, attempts, correct\_rate, avg\_time\_ms, option\_counts (JSON), computed\_at | Refreshed daily |
| `drill_sets` | set\_id, student\_id, drill\_id, level, stage, tier, size, untimed, source (prescription, continue, specific, review, diagnostic, plan), prescription\_id, workout\_id, slot (weak, review, unfamiliar), is\_transfer\_check, focus\_skill, focus\_tag, item\_plan (JSON), status (in\_progress, grading, completed, expired), current\_position, current\_served\_at, pending\_step (JSON), set\_score, passed, skill\_scores (JSON), taxonomy\_version, started\_at, completed\_at | One row per set. Items are served in order, so the timer for the item in play lives here (`current_served_at`). `item_plan` fixes the set's items at start. `pending_step` holds a multi-step item's finished steps, so a step can't change after its feedback is shown. One in-progress set per student, enforced by a unique index. Browse drills sets use `specific` |
| `drill_attempts` | attempt\_id, set\_id, student\_id, position, idempotency\_key, item\_id + item\_version **or** template\_id + template\_version + seed (enforced by a check constraint), response (JSON), served\_at, time\_ms, time\_limit\_ms, timed\_out, skipped, score, step\_scores (JSON), mistake\_tags\[\], check\_results (JSON: check\_id, pass, evidence), red\_flags\[\], defend\_response (JSON: decision, text), defend\_time\_ms, defend\_score, defend\_check\_results (JSON), grading\_status, grader\_prompt\_version, model\_id, submitted\_at | One row per item answered; the Defend step is part of the same row. Never deleted |
| `grading_jobs` | job\_id, set\_id, status, retries, input\_tokens, output\_tokens, cost\_usd, latency\_ms, error, created\_at | Tracks AI grading for a set |
| `drill_tiers` | student\_id, drill\_id, current\_tier, updated\_at | Current tier per student per drill |
| `skill_states` | student\_id, skill\_id, state (adds practiced), stage, l1\_passing\_streak, l2\_passing\_streak, last\_skill\_score, last\_practiced\_at, practiced\_at, transfer\_due\_at, next\_review\_at, low\_streak, repair\_sets, paused\_for\_prereq, prereq\_sets, next\_focus\_tag, updated\_at | Current state per student per skill. `low_streak`: sets in a row below 50% (stuck rule); `repair_sets`: Repair sets since entering Repair; `prereq_sets`: prerequisite sets since the stuck rule paused this skill; `next_focus_tag`: the tag the skill's next set focuses on |
| `skill_state_events` | student\_id, skill\_id, from\_state, to\_state, reason, source\_type (set, case, review), source\_id, created\_at | Full history, for the profile and analytics |
| `case_results` | case\_attempt\_id, student\_id, case\_id, case\_type, difficulty\_tier, rubric\_scores (JSON), skills\_observed\[\], findings (JSON), taxonomy\_version, received\_at | Written from the case grader payload |
| `prescriptions` | prescription\_id, student\_id, skill\_id, drill\_id, level, stage, tier, focus\_tag, priority, reason\_text, evidence\_quote, source\_type (case, drill, diagnostic, plan), source\_id, status (open, in\_progress, completed, dismissed, superseded, paused), created\_at, closed\_at | Open prescriptions drive the workout's weak-spot slot |
| `student_programs` (new) | student\_id, track (foundations, standard, sprint, self\_directed), plan\_version, start\_date (local), started\_at, interview\_date, workouts\_per\_week, cases\_done, current\_week, status (active, completed, switched) | One active row per student; a track switch closes the row and opens a new one. `current_week` is the plan week the student was last seen in, for the week-rollover event |
| `workouts` (new) | workout\_id, student\_id, program\_week, date (in the student's time zone), target\_minutes, blocks (JSON: slot, drill\_id, skill\_id, stage, tier, set\_id), status (planned, in\_progress, completed, expired) | One per student per day |
| `lessons` (new) | lesson\_id, skill\_id, version, status, body, worked\_example, mistakes (JSON), authorship (JSON) | Versioned like items |
| `lesson_views` (new) | student\_id, lesson\_id, version, source (auto, intro, library, low\_score, follow\_up), seconds\_open, skipped, viewed\_at | The intro is logged as `lesson-intro` (no lessons row). |
| `diagnostics` (new) | diagnostic\_id, student\_id, parts (JSON: drill\_id, size, set\_id, and per finished part its skill totals, item scores and missed tags), status (in\_progress, completed, skipped), overall\_score, placements (JSON), moved\_to\_track, started\_at, completed\_at | One in-progress diagnostic per student. Placement is redone as parts finish; a skipped one can be resumed |
| `grade_disputes` (P1) | dispute\_id, attempt\_id, student\_comment, status, reviewer\_notes, created\_at | QA queue |

The student's `org_id` (school or club) lives on `student_profiles`. It is set from the club code the first time the student passes the club-code gate (today, when starting a case) and isn't changed afterwards. Events read it from there.

All schema changes on the shared CaseTester Supabase project are additive: new tables, new enum values and new columns. Nothing `main`'s code uses is dropped, renamed or reshaped.

### Data rules

- Attempts, skill state events and case results are append-only. AI-graded fields on an attempt (score, check results, grading status) are filled in once when grading finishes.
- Student free-text answers are stored as entered and are only sent to the grading model; they are never used to train models without separate consent.
- All tables carry `taxonomy_version` or a reference to a row that does, so data from different taxonomy versions can be compared.

## Services and APIs

The drills system is seven logical components behind one student-facing API; AI is used in only one of them (the grading worker), and it runs asynchronously so it never blocks a student.

### Implementation on this stack

The components below are modules in the existing Next.js app (`lib/drills/*`), not separate services:

- Student-facing endpoints are Next.js route handlers and server actions.
- The grading queue is a Postgres table (`grading_jobs`). A job is started right after set completion (`after()`), and a Vercel cron retries failed jobs and finishes delayed grading within the 10-minute window.
- Case results reach the progress engine as an in-process function call from the scoring code, not an HTTP endpoint.
- Workouts are built on request (the first home load of the day), not by a scheduled job.

### Components

| Component | Responsibility |
| --- | --- |
| Drills API | Student-facing endpoints: onboarding, program, home, workouts, sets, items, attempts, results, lessons, profile, settings |
| Scoring service | Auto-checking, numeric parsing, trap-value diagnosis, checklist score calculation, red-flag caps, Defend weighting, Repair unchanged-answer check. Pure code, no AI |
| Generator library | Builds generated items from template, tier and seed. Shared by the Drills API and content admin preview |
| Grading worker | Consumes grading jobs from the queue, calls the model (one call per answer), validates output and quotes, writes results |
| Progress engine | Updates skill states, stages and tiers, runs transfer checks, the prescription rules and the stuck rule, schedules spaced reviews. Triggered by set completion and by case results |
| Program engine | Assigns tracks, builds and compresses plans, tracks weekly targets and milestones, creates plan prescriptions and builds each day's workout. No AI |
| Content admin (internal) | Authoring, review workflow, preview, publish and retire for authored items and lessons; item health dashboard |

The shared chart renderer is a frontend component.

### Student-facing endpoints

Route handlers live under `/api`. Each endpoint is marked with the phase that builds it; unmarked ones are built.

| Method and path | Purpose | Returns |
| --- | --- | --- |
| `GET /api/drills/home` (D3/D4) | Training home | Program header, today's workout (sets, reasons, estimated minutes), weekly targets, weakest skill, open prescriptions, next-case card |
| `POST /api/drills/onboarding` (D4) | Plan or self-directed, interview date, cases done, time per week, time zone | Suggested track |
| `GET /api/drills/program` (D4) | Current program | Track, plan, current week, weekly targets, milestones |
| `PUT /api/drills/program` (D4) | Switch track, change interview date or availability | Rebuilt plan |
| `GET /api/drills/workouts/today` (D4) | Builds today's workout if none exists | Blocks with slot, reason and estimated minutes |
| `GET /api/drills/catalog` (D4) | Browse drills | Skill areas, skills with state and stage, drills by stage, allowed tiers, Suggested badges |
| `GET /api/drills/suggested-next` (D4) | Suggested next set for self-directed students (also used for the home card) | Drill, stage, tier, reason, estimated minutes |
| `GET /api/drills/progress/summary` (D4) | Weaknesses, recent progress, due reviews and transfer checks, weekly summary | Top 3 weak skills with evidence, skills moved up, due items |
| `GET /api/drills/lessons/{skill_id}` (D4) | Lesson for a skill | Lesson content |
| `POST /api/drills/lessons/{lesson_id}/views` (D4) | Log a view or skip | — |
| `POST /api/drills/sets` | Start a set. Body: `skill_id` with an optional `level` (Practice something specific), or `drill_id` (Retry this set). Later phases add `source` (prescription, workout, diagnostic), `prescription_id`, and `drill_id` + `stage` + `tier` for Pick exactly; the server rejects a tier more than one above the student's current tier | `set_id` |
| `GET /api/drills/sets/{id}` | Resume a set | Status, current position, intro info (drill, skills, size, time per item, pass bar, worked example on first view) |
| `GET /api/drills/sets/{id}/items/{position}` | Fetch an item. Records `served_at` server-side | Item content and input spec, time limit and time remaining, finished steps of a multi-step item. **Never the answer key** |
| `GET /api/drills/sets/{id}/items/{position}/defend` (D5) | Defend follow-up; only after the main answer is submitted | Follow-up type and text |
| `POST /api/drills/sets/{id}/attempts` | Submit an answer, or one step of a multi-step item. Body: position, step, response, skip, timed\_out, idempotency key; D5 adds `part` (main or defend) | Auto-checked: score, correct answer, feedback (or the step's feedback mid-item). AI-graded: accepted |
| `POST /api/drills/sets/{id}/complete` | Finish the set; queues AI grading if needed | Status (`completed` or `grading`) |
| `GET /api/drills/sets/{id}/results` | Results screen data. Clients poll every 2 s while status is `grading` | Set score, pass, mistake summary, time against target, tier change, per-item results, skill state changes (D3), next action |
| `GET /api/skills/profile` (D3) | Skill profile | States, progress, program progress, top mistakes, rubric trends, history |
| `PATCH /api/prescriptions/{id}` (D3) | Dismiss a prescription | Updated prescription |
| `PUT /api/me/drill-settings` | Time multiplier, example preferences | Updated settings |
| `POST /api/attempts/{id}/dispute` (P1) | Dispute a grade | Dispute record |

The club-code check has its own route, `POST /api/club`, called at the club step. It records `org_id` and gates drills; case start still checks the code too.

The case library list (`GET /cases`, with filters and the Suggested mark) belongs to the case product backlog.

### Internal interfaces

| Interface | Purpose |
| --- | --- |
| Case results ingestion (in-process function) | Receives the case grader payload. Validates tags against the taxonomy, stores it, updates skill states and regenerates prescriptions. Idempotent on `case_attempt_id` |
| Taxonomy config | The case grader imports the same taxonomy loader as drills |
| Content admin API | Item and lesson CRUD, review state changes, generator preview by seed, item stats |

### Integrity rules

- Answer keys stay on the server until an item is submitted, and Defend follow-ups until the main answer is submitted.
- Time limits are enforced on the server from `served_at` (recorded on the drill set when the item is fetched) to submission, with a 2-second grace for network delay. Later submissions are marked `timed_out` and score as timeouts (0, `M.timeout`). An untimed set has no limit to enforce; it records the 1× limit as the pace target.
- Attempt submission is idempotent: a repeated idempotency key returns the original result.
- An item can only be fetched in order, and only once its previous item has been submitted.
- Each student can have one set in progress at a time.

### Event flow after a set completes

1. Auto-checked set: the Scoring service finalizes the set score immediately. AI-graded set: the Grading worker grades every answer (one call each, in parallel), then the Scoring service computes scores.
2. The Progress engine updates skill scores, stage, tier, skill states, transfer dates and review dates, and applies the stuck rule.
3. The Progress engine refreshes prescriptions; the Program engine updates weekly targets and milestones and the rest of today's workout.
4. The results screen shows everything in one response.

## Analytics and event logging

The most important question analytics must answer is whether drilling a skill reduces that skill's mistakes in the next full case; every event below exists to answer it or to keep the loop healthy.

### Events

Every event carries `student_id`, `org_id` (school or club, if any), `timestamp`, `taxonomy_version` and `app_version`.

| Event | Fired when | Key properties |
| --- | --- | --- |
| `drills_home_viewed` | Training home loads | track, week, open\_prescriptions, interview\_days\_out |
| `drill_set_started` | A set is created | set\_id, drill\_id, level, stage, tier, source, prescription\_id, focus\_tag, slot, suggested, untimed |
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
| `onboarding_completed` | Onboarding answers submitted | track\_suggested, interview\_days\_out, cases\_done, workouts\_per\_week |
| `diagnostic_completed` | Diagnostic results are final | overall\_score, placements (JSON) |
| `program_assigned` / `_switched` | Track set or changed | track, plan\_version, reason |
| `program_week_started` | Week rollover | week, milestones\_met (previous week) |
| `workout_built` / `_completed` | Workout created or finished | workout\_id, blocks, minutes\_target, minutes\_actual |
| `lesson_viewed` / `_skipped` | Lesson opened or skipped | lesson\_id, skill\_id, source, seconds\_open |
| `defend_submitted` | Defend reply submitted | attempt\_id, type, decision, score |
| `transfer_check_completed` | Transfer check results final | skill\_id, score, passed, attempt\_number |
| `prerequisite_prescribed` | Stuck rule fires | skill\_id, prerequisite\_id |
| `transfer_pool_exhausted` | No unseen item qualifies | skill\_id, drill\_id |
| `suggestion_shown` / `_started` | Suggested next card (self-directed) | drill\_id, reason, source |
| `drill_catalog_viewed` | Browse drills opens | — |
| `weekly_summary_viewed` | Monday recap shown | week (the Monday's date) |
| `repair_pool_exhausted` | A Repair set had to use items derived from ones seen in the last 14 days | drill\_id, available |
| `grade_dispute_submitted` (P1) | Student disputes a grade | attempt\_id |

### MVP reports

| Report | What it shows | How it's computed |
| --- | --- | --- |
| Loop funnel | Case taken → prescription created → set started → skill Practiced → Mastered → next case taken, with drop-off at each step | Each prescription created from a case, followed through: a set started on it, its skill reaching Practiced and Mastered after it was created, and a case taken after Mastered. All time |
| Program funnel | Onboarding → diagnostic → each plan week → last week, by track, with drop-off | Students by the track of their first program. A week counts as reached when its rollover was logged (`program_week_started`) or the program shows it as current. Sprint and Practice on my own have no weeks |
| Drill effectiveness | For each skill: rate of that skill's mistake tags per case before vs after Mastered. Compared against students who dismissed the same prescription, as a natural comparison group | That skill's mistake tags per case, before and after a student first reached Mastered, for students with a case on each side. The comparison group is split at the dismissal |
| Transfer | First-attempt transfer pass rate per skill; skills where students pass practice but fail transfer | First attempts of `transfer_check_completed`. A check comes only after Practiced, so each failure passed practice but failed transfer |
| Lessons | Next-set score for students who read the lesson vs those who skipped it | A student's first view or skip of each skill lesson, and the score of their next completed set on that skill. The intro lesson isn't counted |
| Defend | Defend scores by drill and type; Hold/Update accuracy on valid vs invalid challenges | Graded follow-up replies: average score by drill and type; for Challenges, how often Hold/Update was right, split by whether the challenge was valid (Update is right) or not (Hold is right) |
| Workout mix | Actual minutes per slot vs the 50/25/25 target | Workouts dated in the period. Planned: the minutes the builder gave each slot. Actual: start to finish of each block's completed set |
| Stuck rule | How often it fires per skill, and whether the stuck skill passes after the prerequisite | Each `prerequisite_prescribed`, and whether the student later passed a set on the stuck skill |
| Plan vs self-directed | Practice volume, skills reaching Mastered, transfer pass rates and case rubric gains between the two groups | Students grouped by their latest program. Sets per week cover the period; Mastered and transfer cover all time. Rubric gain: average rating (needs work 0, meets bar 1, strong 2) on the last case minus the first, for students with two or more cases |
| Engagement | Sets per active student per week, share of students returning within 7 days, average session length | Students with a set started in the period. Returning: another set on a later day within 7 days of their first set in the period. A session is a run of sets less than 30 minutes apart |
| Item health | Correct rate, average time and distractor pull per item; items flagged for review | Authored items, answered (not skipped) attempts; correct means a full score. Flags follow the Item health rules; in the pilot they need 20+ attempts and items are pulled by hand |
| Grading quality and cost | Agreement with human labels per check, retry and failure rates, cost per graded answer and per active student | Grading jobs created in the period. Cost per workout counts workouts with a graded set; cost per active student per month scales the period to 30 days. Agreement comes from the golden-set gate (`npm run drills:golden`); the monthly human sample is not built yet |

The reports page is `/drills/reports`, local development only, filterable by club and period (7, 28 or 90 days); `npm run drills:reports` prints the same in the terminal. Flagged items and the cost alert are at the top. An event-health section lists events with missing key properties or no rows yet.

All reports must be filterable by `org_id` so that career center and club dashboards can be built on the same data later.

## Cost controls and non-functional requirements

Running cost is held down by design: AI is used only to grade free-text answers, and drill grading should stay within $1.25 per active student per month (pilot budget, to confirm), a small share next to the cost of full cases.

### Cost controls

- **No AI at runtime except grading.** Items, lessons, plans and workouts are written ahead of time or built by fixed rules.
- **One small call per answer.** Each Repair answer, Construct answer and Defend reply is graded in its own call at temperature 0, after the last item of the set. HY-2 adds one short family call per answer.
- **Code first.** Empty answers, unchanged Repair answers, word caps, bucket counts and number presence are settled by code, with no AI call.
- **Defend only where it counts.** Tiers 2–3 only; never at tier 1 or in the diagnostic. Sets with Defend are one item shorter.
- **Small inputs.** A call carries only the prompt, the answer, check questions and red-flag definitions (Defend adds the student's main answer). Model answers and feedback text stay on the server.
- **Capped answers and outputs.** Word caps on every free-text input; a tight output token limit on every call.
- **Cheapest passing model.** Use the lowest-cost model tier that meets the 90% agreement gate. Re-test cheaper tiers when they become available.
- **Prompt caching.** Cache the fixed grading instructions where the model provider supports it. Today they are too short to be cached.
- **Usage cap.** 150 AI-graded answers per student per day. Auto-checked drills are unlimited.
- **Monitoring.** A dashboard of cost per graded answer, per workout and per active student, with an alert if the 7-day average exceeds budget by 25%. Pilot: a banner at the top of the reports page (last 7 days, per active student scaled to a month).

### Cost estimate

Estimate per active student per month on the Standard plan (4 workouts a week, up to 2 cases a week). It assumes a cheap grading model at about $1 per million input tokens and $5 per million output tokens (about $0.003–0.005 per graded answer) and about $0.50 per full text case; replace these with real prices before launch.

| Item | Volume per month | Estimated cost |
| --- | --- | --- |
| Workout grading (Repair, Construct, Defend) | \~17 workouts × \~12 graded answers ≈ 200 | $0.60–1.00 |
| Diagnostic | 2 graded answers, once | < $0.01 |
| Lessons, plans, workouts, auto-checked items | — | $0 |
| Full cases (not part of drills) | \~6 | \~$3.00 |
| **Total** |  | **\~$3.60–4.00** |

Drill grading is about a fifth of the total; full cases remain the main cost. The v1 target of "75% of attempts cost nothing" is replaced by the per-student budget.

### Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | Item load < 500 ms p95. Auto-checked feedback < 300 ms p95. AI-graded results < 10 s p95 after the last item |
| Availability | 99.5% during the pilot. Auto-checked drills keep working if the model provider is down; AI grading queues and completes later |
| Devices | Desktop-first for the pilot: latest 2 versions of Chrome, Safari, Edge and Firefox. Full support down to 360 px wide ships in P1 |
| Accessibility | WCAG 2.1 AA, including keyboard operation, chart data tables, screen-reader timer announcements and the time setting (with No time limit) |
| Security | Answer keys and Defend follow-ups never sent before they should be. Content admin restricted by role. All endpoints authenticated |
| Privacy | Text only, so no voice or biometric data is collected. Student answers are deleted when the account is deleted. Data from university partners may count as education records; confirm handling with legal before institutional launch |
| Configurability | Thresholds, weights, time limits, set sizes and maps live in config files and change without code changes (a deploy is still needed) |
| Observability | Structured logs and alerts for grading failures, retry rates, queue depth and quote-verification failures |

## Build phases, acceptance criteria and open questions

The build runs in seven phases, D0 to D6. Auto-checked drills ship before AI-graded ones, and the loop ships before the program built on it, so each risky piece sits on proven foundations; each phase has a hard exit gate. D0–D2 are done. The pilot launches after D3 and D4 (D6); D5 ships during the pilot.

Until D5 ships, Construct sets have no Defend step (so PS-3, HY-2 and CL-3 keep 4 items at every tier) and skills skip the Repair stage, as for skills with no Repair drill.

### Phases

| Phase | What gets built | Exit gate |
| --- | --- | --- |
| D0 Foundations (done) | Taxonomy v1 and config files, data model, numeric parser, generator framework, chart renderer, case grader payload contract | Config, schema, parser and generator tests pass. The grader gate (case grader emits valid payloads on 30 sample transcripts, with a human agreeing with at least 85% of its tags) is deferred until the grader is updated |
| D1 Auto-checked drills (done) | QN-1, QN-3, QN-4, EX-2, EX-3 (generated) and PS-1, HY-1, EX-1, SY-1, CL-1 (authored); item, feedback and results screens; Practice something specific | All generator tests pass; zero key errors in 1,000 sampled generated items; authored pools reviewed (pilot pool sizes, see Launch pool sizes) |
| D2 AI-graded drills (done) | PS-3, HY-2, SY-2, CL-3, plus QN-5; grading worker (one call per answer), golden sets, quote verification, failure handling | At least 90% agreement per check on every golden set; results < 10 s p95; cost per answer within budget |
| D3 The loop | Taxonomy prerequisites and Defend tags; progress engine (states including Practiced, stages, tiers, reviews, transfer checks, stuck rule), prescription engine, case results ingestion, skill profile | Scripted scenarios produce the exact state changes and prescriptions defined in this PRD |
| D4 Training program | Onboarding (with time zone), diagnostic, tracks and plans, Practice on my own, Browse drills, Program engine, workouts with the 50/25/25 mix, training home, Learn library, 22 P0 lessons | Scripted Foundations, Standard and Sprint students get the plans, workouts and milestone results defined in this PRD; lessons reviewed |
| D6 Pilot launch (after D3 and D4) | Analytics events and reports, WCAG 2.1 AA audit, pilot with the university club | Audit passed; all events firing; pilot students finish Week 0 and Week 1 of a plan and complete the full loop |
| D5 Chains and Defend (during the pilot) | Repair drills PS-4, HY-3, SY-3; Defend step on PS-3, HY-2, SY-2, CL-3; follow-ups written for existing items | At least 90% agreement per check on every new golden set; pools at launch size |
| P1 Fast follow | PS-2, QN-2, BJ-1, BJ-2, CR-1, CL-2, EX-4, EX-5, CL-4, QN-5 Defend, drawn skill-tree view, P1 lessons, grade disputes, 360 px support | Same gates as D1, D2 and D5 for the new drills |

### Definition of done for MVP

- [ ] Zero answer-key errors in a 200-item human QA sample of authored items across all P0 drills, including Repair items and Defend follow-ups.
- [ ] Answer keys and Defend follow-ups never reach the client before they should (verified by security test).
- [ ] AI grading agreement is at least 90% on every check of every AI-graded drill and Defend type.
- [ ] A test student can complete the full loop: onboarding → diagnostic → plan → workouts → case → prescriptions → Practiced → transfer check → Mastered → next case → Validated.
- [ ] Scripted Foundations, Standard and Sprint students get the plans, workouts and milestones defined in this PRD.
- [ ] All 22 P0 lessons are reviewed and live.
- [ ] Drill grading cost per active pilot student is within budget.
- [ ] WCAG 2.1 AA audit passed (`docs/drills-a11y-audit.md`: automated checks pass; the manual checklist remains).
- [ ] All events in Analytics fire with complete properties.

### Open questions

- [x] **Rubric scale and "meeting the bar":** the case grader rates each dimension on 3 levels (`needs_work`, `meets_bar`, `strong`). Decided 2026-10-11: a student moves up a case tier when no dimension is at `needs_work` and at least half are rated `strong`.
- [ ] **Grader changes:** How much work is it for the transcript-grading agent to emit skill tags, severity, `skills_observed` and exact evidence quotes? (Deferred: the grader will be updated later.)
- [x] **Tag severity:** Decided 2026-10-11: 35 major, 30 minor, set as defaults in `taxonomy.v1.json` (reasons in `docs/drills-tag-severity.md`). The case grader may adjust them per finding (see "What the case grader must send"). The two Defend tags default to minor.
- [x] **Mastery bar:** 80% on two consecutive sets for Practiced, and 80% on the transfer check, for the pilot (Matt, 2026-10-11). Tune from pilot data in config.
- [x] **First-time users:** Resolved in v2: the diagnostic moves to P0 and runs at onboarding; a full case is no longer required before drills.
- [x] **Pilot scope:** Decided 2026-10-11: the pilot launches with D3 and D4; D5 ships during the pilot.
- [x] **Skill tree sign-off:** Approved as written (Matt, 2026-10-11).
- [ ] **Plan content:** Confirm the six-week themes, milestones and case counts, and the Sprint day plan, with a club coach or recent hires.
- [ ] **Defend weight and timing:** Is 25% of the item right, and are 60 / 45 s enough to type 40 words?
- [ ] **Transfer delay:** Is a 2-day wait after Practiced right, or should it be longer for retention?
- [ ] **Cost budget:** Confirm the $1.25 per active student per month drill-grading budget once real model prices are known.
- [ ] **Free vs paid:** Are drills and tracks limited for free users, and if so, how?
- [ ] **Content review capacity:** About 280 new pieces (110 Repair items, 150 Defend follow-ups, 22 lessons) plus the Level 1 pools' growth to 80 before wider launch. @Matt reviews drill content.
- [ ] **University data handling:** Confirm with legal how student data from partner schools must be handled.
- [ ] **Firm-style toggles:** When should items start carrying `firm_style`?
- [x] **Case types:** Confirmed 2026-10-11: the 14 case types are `profitability`, `growth_strategy`, `market_entry`, `market_sizing`, `pricing`, `cost_reduction`, `operations`, `new_product_launch`, `m_and_a`, `investment_decision`, `competitive_response`, `turnaround`, `public_sector`, `industry_analysis`, the same list as the case product. It lives in `lib/case-types.ts`, shared by case files (`caseType`, optional until every case file has one) and drill items; the item schema enforces it; the case-type-to-skill-area map (each type's main skill) still needs writing.
