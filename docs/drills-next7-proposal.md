# Next 7 drills: proposal

8 Nov 2026 · for Matt · status: **approved 10 Nov 2026** (rulings below; build under way on `design/unify-ui`)

Scope: priority 1 is EX-5, EX-4 with its follow-up, and CL-4. Priority 2 is BJ-1 and BJ-2. Priority 3 is PS-2 and CR-1. Specs come from `docs/prd-drills.md` (Drill catalog, Repair drills, Defend step).

## Decisions I need from you

Each one is explained in the section named in brackets.

| # | Decision | My recommendation |
| --- | --- | --- |
| D1 | CL-4's scenarios: derive from CL-1, as the spec says, or write new ones? [§7] | New scenarios. Derived ones hand CL-1's answer to stage 1 |
| D2 | EX-4's charts: "same charts and context as EX-1", or new? [§7] | New charts, for the same reason |
| D3 | Existing EX.takeaway / CL.next_step states [§1] | Keep the states. A Mastered or Validated student's first written review is due at once, served at tier 2 |
| D4 | Week order once BJ is live: the plan would serve BJ before week 3's milestone skills [§1] | The week's milestone skills first, then the other focus skills |
| D5 | Foundations gate on SY.complete. As built, it never holds anything back for a skill with no Recognize drill [§1] | Leave the code. Correct the PRD wording |
| D6 | Creativity appears in no week's focus, so plans never serve CR-1 [§1] | Make CR a week 4 focus area (Integration has none today) |
| D7 | Interview ready: the 5 new skills would join "every other skill at Practiced" automatically [§1] | Accept it, or keep the checklist to today's skills. Your call |
| D8 | Time limits: EX-4 60/45/35 s → 75/60/45; CR-1 90/75/60 s → 180/150/120 [§7] | Change both (ruled: EX-4 90/75/60) |
| D9 | CL-4's 15% reason check covers only Change [§7] | It covers Keep too |
| D10 | BJ-2's wrong options: what a specific-but-irrelevant pick logs [§7] | `M.generic_risk`, with feedback per option; no new tag |
| D11 | PS-2: how many high-value questions per item [§7] | Exactly 3 |
| D12 | CR-1: idea limit, and how the gate measures the idea count [§4, §7] | At most 20 ideas; the count agrees if within ±1 of yours |
| D13 | The intro lesson's stages for the new skills [§2] | BJ.so_what, CR.volume and CR.structure under Analyze; BJ.risks under Recommend; one added sentence on brainstorms |
| D14 | Which existing lessons change [§2] | CL.next_step v2 adds the keep-or-change step; EX.takeaway stays as it is |
| D15 | Branch [§6] | Branch off `design/unify-ui`, so the new screens are built in the new design. Rebase onto main once that merges |
| D16 | Similarity-check spend, each run over $5 [§5] | About $14 for priority 1, $10 for priority 2 and $8 for priority 3. I'll ask before each run |

## Matt's rulings (10 Nov 2026)

All 16 decisions approved as recommended, except where noted:

- **D7:** accepted. The 5 new skills join "every other skill at Practiced" in the readiness checklist.
- **D8:** EX-4 is **90 / 75 / 60 s** (the same as CL-3; 45 s at T3 is too little to read a new chart and type). CR-1 180 / 150 / 120 s as proposed. EX-5 stays at 60 / 45 / 35 s.
- **D12:** also the category rule in §7.6.
- **D15:** no new branch. Build directly on `design/unify-ui`, with the drill commits clearly labelled (`drills:`) and separate from the redesign work, so they could be split out if the redesign is delayed.
- **D3:** the go for the one-time update is given now; it runs at ship time.

Also approved: the other §7 spec fixes (thresholds for the multi-select wording checks come with the first batch); review batches 1a–3b, each priority starting with a small pilot batch; the drill cards as drafts, finalized with each batch; the new inputs on `/dev/ui-preview`; keeping `ask_judge_once.sql` out of any migration; shipping each priority once its gates pass and Matt approves its content. Merging to main waits for Lorenzo's go.

Matt asked to be told exactly which ~40 golden answers he labels blind, and where.

## 1. Effect on existing students

**Who is affected today:** almost no one.

- Two accounts have ever done a drill set. The last set was on 19 Oct.
- There are 3 active programs: two Foundations (weeks 0 and 1) and one Practice on my own.
- Nobody is past Learning on EX.takeaway or CL.next_step; both sit at Learning, Recognize stage.
- No one has a state on SY.complete, BJ, CR or PS.clarifying_questions.
- One prescription is open: EX.takeaway, from a diagnostic.

These figures come from read-only queries on 8 Nov. So the rules below matter for the pilot more than for anyone now.

**EX.takeaway and CL.next_step (D3).** Today, Level 1 sets alone grant Practiced and Mastered on both skills, because neither has a live Construct drill. Once EX-4 and CL-4 are live, most of what you suggested happens without extra code:

- **Mastered or Validated:** keep the state. Spaced reviews already use the skill's Construct drill once one is live, so they switch to EX-4 or CL-4.
  - Two refinements to make the first written test come soon and mean something:
    - (a) A one-time update makes their next review due now, not 14 days after their last practice.
    - (b) That first written review is served at tier 2: EX-4 with its follow-up, or CL-4. Otherwise it would come at tier 1, the starting tier on a new drill.
  - Results follow the normal review rules: 80% or more resets the clock; under 60% drops the skill to Recognizes, which serves EX-5 then EX-4 (or CL-4 directly); in between, another review comes in 7 days.
  - The one-time update touches 0 rows today. It runs at ship time, with your go.
- **Practiced:** keep the state. Their transfer check is already "a Construct set at tier 2, with the follow-up", so it becomes EX-4 or CL-4 by itself.
- **Recognizes or Learning:** their next sets move up the chain: EX-5 then EX-4, or CL-4. Reaching Practiced now takes two written sets. A student partway there through Level 1 sets loses that progress. That's accepted: Level 1 no longer counts toward Practiced.

**New prerequisites going live.** "A prerequisite with no live drill is ignored" stops applying to four links:

| Link | Stuck rule (all tracks) | Foundations gate | Credit down |
| --- | --- | --- | --- |
| BJ.risks → SY.complete | Two SY.complete sets under 50% with BJ.risks below Practiced: BJ-2 is served first, and SY.complete pauses until BJ.risks reaches Practiced or 3 BJ-2 sets are done | **Holds nothing back (D5).** The gate works by serving the skill's Recognize drill instead, and SY.complete has none, since SY-2 is its only drill. This is true today too. Holding SY-2 back would also block SY.answer_first and SY.evidence, which SY-2 trains. I'd keep the code and change the PRD to "skills with no Recognize drill aren't gated" | Mastering SY.complete lifts BJ.risks to Recognizes |
| BJ.so_what → BJ.risks | Stuck on BJ-2: BJ-1 first | No Construct drill for BJ.risks, so nothing to gate | Mastering BJ.risks lifts BJ.so_what |
| EX.takeaway → BJ.so_what | Stuck on BJ-1: EX.takeaway sets first | BJ-3 isn't built, so nothing to gate | Mastering BJ.so_what lifts EX.takeaway |
| PS.mece → CR.structure | Stuck on CR-1: PS.mece sets first | CR-1 has no Recognize drill, so not gated | Mastering CR.structure lifts PS.mece |

Credit down only happens when a skill becomes Mastered; it doesn't apply to skills Mastered in the past. Nobody qualifies today, so no backfill is needed.

**Plans and prescriptions:**

- **Week 3's BJ focus (D4).** BJ is already a week 3 focus area. It's skipped only because it has no live drill. Once BJ is live, the plan's one-at-a-time plan prescription goes in prerequisite-then-catalog order, which puts BJ.so_what and BJ.risks before SY and CL. That would push back week 3's milestone skills (SY.answer_first, SY.evidence, CL.next_step). PS-2 has the same effect in week 1: PS.clarifying_questions would come before the milestone QN.setup. I suggest the plan picks the week's milestone skills first, in prerequisite order, then the other focus skills.
- **Creativity (D6):** no week focuses on CR, so plans never prescribe CR-1. It would come only from case prescriptions, Browse and Practice on my own. Week 4 (Integration) has no focus areas today; adding CR there fills that gap.
- **Diagnostic and questionnaire:** unchanged. The questionnaire's Structuring rating places PS.clarifying_questions automatically. BJ and CR aren't in the questionnaire, so they start at Not started.
- **Case prescriptions:** a full case that logs a BJ, CR or clarifying-question tag will now produce a prescription with a drill to serve. Case results reaching drills is still switched off (`CASE_RESULTS_WIRED`, `case_sessions`).
- **Interview ready (D7):** the checklist wants every live skill that isn't a milestone at Practiced. Five new live skills raise that bar.

## 2. Pools, review load and batches

| Drill | Items to write | Set (T1/T2/T3) | Sets before repeats | Notes |
| --- | --- | --- | --- | --- |
| EX-5 Fix the takeaway | 40, from EX-1's distractors | 6 | 6–7 | Same as HY-3: not served within 14 days of its EX-1 item; T3 items plant two flaws |
| EX-4 Written chart takeaway | 40 new charts + 40 follow-up model replies | 6 / 5 / 5 | 7–8 | One fewer item with the follow-up, as for PS-3, HY-2 and CL-3 |
| CL-4 Your next move | 40 new scenarios (D1) | 4 | 10 | Each has 3–4 step families and a new fact that supports at least one family and undercuts at least one |
| BJ-1 "So what?" | 40 + 1 worked example | 8 | 5 | The pilot pool size, like the other Level 1 drills; 80 before wider launch |
| BJ-2 Risks and next steps | 40 + 1 worked example | 6 | 6–7 | 8 options, 3–4 correct |
| PS-2 Clarifying questions | 40 + 1 worked example | 6 | 6–7 | 8 questions, exactly 3 high-value (D11) |
| CR-1 Bucketed brainstorm | 30 | 3 | 10 | Key: 4–5 categories with example ideas, a target count, a model answer |

**What you review, in batches.** Each priority starts with a short pilot batch, as D2 did with PS-3, so systematic problems are caught before the full batch is written.

| Batch | Content | Golden labels to check |
| --- | --- | --- |
| 1a | Grading rules for EX-5, EX-4, the EX-4 follow-up and CL-4 (new sections of `docs/drills-grading-guide.md`); the first 8 items of each of the three drills | — |
| 1b | Remaining 32 EX-5, 32 EX-4 (with replies), 32 CL-4; CL.next_step lesson v2; 3 drill cards | about 125 answers (4 gates) |
| 2 | 40 BJ-1, 40 BJ-2 (first 8 of each beforehand); lessons BJ.so_what, BJ.risks; 2 drill cards | none (auto-checked) |
| 3a | CR-1 grading rules; first 6 CR-1 and 8 PS-2 items | — |
| 3b | Remaining 24 CR-1, 32 PS-2; lessons PS.clarifying_questions, CR.volume, CR.structure; the intro lesson's edit; 2 drill cards | about 35 answers (1 gate) |

**Totals:** 270 items, 40 follow-up replies, 5 new lessons, 2 lesson edits, 7 drill cards, and about 160 golden answers.

**Lessons (D13, D14):**

- The 5 new lessons use the existing format: nine sections, 600 words, one mistake line per tag, a quick check, and the scenario check against drill items. That's PS.clarifying_questions with 3 tags, BJ.so_what with 2, BJ.risks with 2, CR.volume with 1 and CR.structure with 2.
- The intro must list every skill that has a lesson under exactly one stage, so it needs the edit in D13.
- **CL.next_step:** CL-4's second stage (keep or change your step when a new fact arrives) is 40% of the item, and the lesson doesn't teach it. v2 adds a pattern step and a tricky case for it.
- **EX.takeaway:** the lesson already teaches the number and the tie to the client's question, which EX-4 and EX-5 grade, so it stays. The follow-up's "what it means for the decision" is BJ.so_what's lesson.

## 3. New inputs and screens, and accessibility risks

| Drill | Input | New work |
| --- | --- | --- |
| EX-5 | Prefilled text with the chart | None. HY-3's editor and EX-1's chart |
| EX-4 | Text with the chart, then the follow-up | None. CL-3's flow with a chart |
| CL-4 | Text, Keep/Change, text | None. HY-2's two-stage flow (reveal, per-stage timer) |
| BJ-1 | Single choice | None |
| BJ-2, PS-2 | Multi-select | The checkbox list exists (QN-5). New: PS-2's 3-pick limit; scoring for both; a multi-select version of the wording checks (§7) |
| CR-1 | **Grouped editor (new)** | Categories with ideas. Built from PS-3's bucket editor (same add and remove pattern, already through the audit), with a 12-word cap per idea, 2–5 categories and at most 20 ideas |

**Accessibility risks**, each checked with `npm run drills:a11y` (axe) and added to the manual checklist in `docs/drills-a11y-audit.md`:

- **Grouped editor:**
  - Every field needs its own name ("Category 2, idea 3").
  - Focus goes to the new field after "Add", and to a sensible neighbour after "Remove".
  - Limits are announced without speaking on every keystroke.
  - It must work at 390 px without sideways scrolling.
- **PS-2's pick limit:** a 4th tick is refused with a spoken message ("You can choose up to 3"). Disabling the other boxes is avoided, because some screen readers skip disabled controls.
- **CL-4's new fact:** announced and focused when it appears, as HY-2 does.
- **Charts under time pressure (EX-4, EX-5):** the chart's table view must stay usable while writing. The timer options (No timer, Hide timer, No time limit) already apply to every drill.
- **Prefilled text (EX-5):** the flawed answer must be read out as the field's starting value, as in HY-3.

I'd add the new inputs to the dev preview pages (`/dev/ui-preview`), so you can look at them before any content exists.

## 4. Golden sets and labels

Five gates need golden sets, each with at least 30 answers and every check at 90% or above: EX-5, EX-4, EX-4 follow-up, CL-4 and CR-1. BJ-1, BJ-2 and PS-2 are scored by code.

**The process**, the same as D2 and D5, where you chose "Claude drafts, Matt checks every grade":

1. I draft the grading rules for each new check, and you approve them before any label is written, so every label can cite a rule.
2. I write the answers, about 30–35 per gate: normal ~55%, borderline ~15%, short, off-topic and injection ~10% each.
   - CL-4: some answers in an "other" step family, plus both correct and wrong Keep/Change taps.
   - CR-1: duplicates, invalid ideas, misplaced ideas, a single category, and an answer padded with near-duplicate ideas.
3. I label each answer, citing the rule in its notes. You check every grade.
4. Gate runs report disagreements. Labels never move to match the grader. A disagreement leads to a proposed rule change, and every affected label is rechecked.

**What you label yourself, blind**, before seeing my labels: about 40 answers.

- The borderline answers in each gate (about 5 × 5).
- The idea count and category placement on 10 CR-1 answers. It's the most judgment-heavy label, and a new kind.
- The step family on 5 CL-4 edge answers. A wrong family makes the Keep/Change grade wrong.

Where we disagree, the rule gets clarified before the gate runs. That keeps the gate from measuring Claude against Claude.

**Two gate definitions the spec doesn't give:**

- **CL-4:** the step-family classification is gated too, at 90% or above, as HY-2's family effectively is: the Keep/Change grade depends on it.
- **CR-1 (D12):** the volume component is a count, not a yes or no. It agrees when the grader's count of distinct valid ideas is within ±1 of your count. The idea list is quote-checked by code: each idea must appear in the student's answer.

**Model:** Haiku 4.5 for every check. I'd propose Sonnet for a check only if Haiku can't reach 90% after the rules are settled, with the comparison runs reported.

## 5. Costs

**Per graded answer** (Haiku 4.5). These are estimates from the size of the prompts similar drills send today; the gate runs measure the real figure.

| Drill | Calls per answer | Estimate | Compared with |
| --- | --- | --- | --- |
| EX-5 | 1 | ~$0.0035 | HY-3 plus a chart |
| EX-4 | 1, plus 1 for the follow-up reply at T2–T3 | ~$0.0031 + ~$0.0028 (reply) ≈ $0.006 an item | CL-3 |
| CL-4 | 2 (main + step family) | ~$0.0057 | HY-2's main and family calls |
| CR-1 | 1, with a longer output (the idea list) | ~$0.0053 | PS-3, capped at 20 ideas |

Today's average is $0.0045 per graded answer (gate mix, 16 Oct).

**Per student per month**, against the $1.25 budget:

- Today's estimate is about 200 graded answers × $0.0045 ≈ $0.91.
- The new drills turn EX.takeaway and CL.next_step practice from free multiple choice into written answers, and add CR-1. BJ and PS-2 are free.
- Workouts are time-boxed, so volume rises less than the drill count suggests: about 230 answers at a blended ~$0.0047 ≈ **$1.05–1.10**.
- A heavy month of about 260 answers would cost about **$1.25**, right at the budget.
- The 400-a-month cap bounds the worst case at about $2.30 (about $1.80 today).
- The reports page measures the real figure in the pilot, and the 25%-over-budget alert still applies.

**Build costs:**

| Item | Estimate |
| --- | --- |
| Web similarity checks, 270 items at ~$0.12 (EX-5 included, following HY-3's precedent) | ~$32 (P1 $14 · P2 $10 · P3 $8) |
| Golden runs: 5 new gates × about 6 runs while the rules settle, plus one confirming run of all 16 gates | ~$8 |
| `drills:models` (every model answer scores 100%, 3 runs) | ~$3 |
| Smokes | cents |
| **Total** | **~$45** |

Each priority's similarity run is over $5, so I'll ask before each one. Drafting content costs nothing extra: I write it in session.

## 6. Build order and estimate

A session is one working session of mine. Your review time comes between sessions.

| Priority | Sessions | Contents | Ships when |
| --- | --- | --- | --- |
| 1 | 5 | (1) Config and code: EX-4 moved to P1 with its follow-up; CL-4 added to `drills.v1.json` (it's missing today, 29 of 30 drills); the skill-keyed drill map (CL.next_step → CL-4); grader paths, scoring, import templates, tests, rule drafts → batch 1a. (2–3) Content and golden sets → batch 1b. (4) Gate runs, rule fixes, `drills:models`, timing (p95 under 6 s with feedback after each question). (5) Wiring: Browse, Learn, dashboard, prescriptions, the D3 update, CL.next_step lesson v2, smokes, accessibility, PRD and progress | All four gates at 90% or above, smokes pass, your content approval |
| 2 | 3 | Multi-select scoring and wording checks, BJ config, week order (D4); content and 2 lessons → batch 2; ship | Wording checks pass, your approval |
| 3 | 4 | Grouped editor, CR-1 grading and code checks, PS-2 and its limit, CR in week 4 (D6); content, golden set and 3 lessons, intro edit → batches 3a and 3b; gate; ship | CR-1 gate at 90% or above, your approval |

**About 12 sessions in all.**

**Shipping a priority:**

- Seed its items and lessons to the shared database (additive data), set the drills live, and merge to main.
- Merging and deploying wait for Lorenzo's go, as for every merge to main now.
- I update the PRD (catalog, pool sizes, cost, phases, history) and progress as each priority ships. The drills ledger is the root `progress.md`, with a line in `.superpowers/sdd/progress.md`.

**Database:** I expect no migration. Drill ids, responses, the CR-1 idea list and the CL-4 family all fit columns that exist. If one turns out to be needed, it will be additive and numbered 0024, and I'll tell you the number for Lorenzo.

One trap: `db/migrations-pending/ask_judge_once.sql` is unapplied but declared in `db/schema.ts`, so a `db:generate` would sweep its index into 0024. It has to be kept out.

## 7. Spec changes I'd make

1. **CL-4 from CL-1 (D1).**
   - CL-4's first stage asks CL-1's own question ("what's the best next step?") on the same situation, so a student who did the CL-1 item already knows the answer.
   - The Repair exception doesn't cover it: CL-4 is a Construct drill, so it counts toward Practiced and supplies transfer checks, which must use unseen items.
   - Excluding derived items a student has seen would empty the pool for anyone who has done 5 CL-1 sets (40 items).
   - New scenarios cost about the same review work, since the families, the new fact and the model answers are new either way.
2. **EX-4 on EX-1's charts (D2).** The same problem: EX-1's right option is the takeaway EX-4 asks for, and "one case, one drill" fails.
3. **EX-4's time (D8).**
   - At 35 s, a student must read a new chart and type up to 40 words from scratch. Typing alone takes 45–60 s at student speeds.
   - Proposed: 75 / 60 / 45 s, the same as CL-4's stage 1 with the same 40-word cap.
   - EX-5 keeps 60 / 45 / 35 s: like HY-3, it's an edit, not a blank page.
4. **CR-1's time (D8).**
   - 8 or more typed ideas plus 2–5 headers in 60 s needs 50+ words a minute with no thinking time.
   - Proposed: 180 / 150 / 120 s. A full set at T1 is then about 9 minutes, which still fits a 20-minute workout.
   - Add a 20-idea limit (D12), which also caps grading cost.
5. **CL-4's reason check (D9).**
   - "Change reason uses the new fact" leaves a correct Keep with no reason check.
   - Proposed: "The reason uses the new fact: for Keep, why the step still stands; for Change, the new step and why." Same 15%.
   - Considered and not proposed: a check that the step is the top priority (`M.low_priority_next_step`). CL-1 already trains prioritization; revisit with pilot data.
6. **CR-1's grading rules (D12).** The spec doesn't say when "ideas sit in the right category" fails. Proposed: it fails when 2 or more ideas sit in the wrong category, or when one category is a catch-all ("Other").
7. **BJ-2's distractors (D10).**
   - If every wrong option is generic ("execution risk") and every right one specific, the drill rewards spotting specific-sounding text, and the wording checks would catch that.
   - So the distractors mix three kinds: generic; specific but about something else; specific but minor or already handled by the recommendation.
   - All log `M.generic_risk` (the skill reads "specific, relevant"). Each option's feedback says which kind it is.
8. **PS-2 (D11).**
   - Exactly 3 high-value questions per item, so a perfect score takes 3 good picks, and 2–3 low-value ones.
   - `M.too_many_questions` can't occur, since picks are capped at 3. It stays a full-case tag.
9. **Wording checks for multi-select (PS-2, BJ-2).**
   - Today's checks assume one right option per item; the length check skips multi-select items without a word.
   - Proposed: the same four checks, with the right options taken as a set:
     - Right options are not systematically the longest.
     - Phrase cues as now.
     - Odd-one-out within the item.
     - A rule player measured against random picking.
   - Thresholds go in `content-checks.ts`, for your approval with the first batch.
10. **Smaller fixes:**
    - `drills.v1.json` lists EX-4 as P2; the PRD says P1.
    - EX-4's skills: EX.takeaway is primary. BJ.so_what is secondary, because the follow-up's checks log BJ tags. As with every follow-up, the reply also counts toward CL.pushback.
    - The PRD's Foundations-gate wording (D5).

## Appendix: draft drill cards

These are for Browse and Learn, in the style of the approved ones (`lib/drills/config/drill-descriptions.json`).

| Drill | What you do | How it helps |
| --- | --- | --- |
| EX-5 Fix the takeaway | Fix a flawed chart takeaway so it answers the client's question with a number the chart supports. | A takeaway that's beside the point, or reads the chart wrong, costs trust fast; this trains you to catch it before you say it. |
| EX-4 Written chart takeaway | Write the one takeaway from a chart that matters to the client, with the number that proves it. | In the interview there are no options to choose from: you find the "so what" yourself, in seconds. |
| CL-4 Your next move | Propose the next analysis and why, then keep or change it when a new fact arrives. | Interviewers expect you to drive the case, and to change course when the data surprises you. |
| BJ-1 "So what?" | Pick what a finding means for the client's decision, from four options. | A number only matters once you say what it means for the client; interviewers listen for that after every finding. |
| BJ-2 Risks and next steps | Pick every risk and next step that's specific to a recommendation, and skip the generic ones. | A recommendation should end with a real risk and a concrete next step, not "execution risk". |
| PS-2 Clarifying questions | Choose up to three questions to ask after hearing a case prompt. | Your first questions show whether you understood the problem; a few sharp ones beat a checklist. |
| CR-1 Bucketed brainstorm | Brainstorm ideas for a client question and group them into clear categories. | Brainstorm questions test how many ideas you find and how well you organize them, quickly. |
