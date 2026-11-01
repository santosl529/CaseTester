# Site launch: copy changes, old → new

For Matt and Lorenzo (31 Oct 2026, branch `site-launch`). Matt's exhibition design (UI-Overhaul `5b8364b2`) becomes the public site at `/` and `/how-it-works`. Lorenzo's rulings: the brand is CasePace; every stat and feature claim matches what exists today; the site is public. The diagnostic, plans and lessons stay, worded to match what's built (his answer, 31 Oct).

**The finding that drove most changes:** an interview's result does not reach the drills plan. `lib/drills/case-result.ts` says "The grader doesn't emit it yet — that change is deferred", and nothing calls it. So every line where an interview slip "becomes" a weak spot, a workout row or a plan update was false. Plans come from the diagnostic or the questionnaire and update from drill results. The report names what to work on, but the plan doesn't read it. (Related, in the product itself and not changed here: the drills home offers "Take a full case — the most accurate" as a way to get a plan, and that path can never produce one.)

Reasons: **stat replaced**, **claim removed**, **claim reworded/narrowed**, **button fixed**, **rebrand**, **matched to product**.

## 1. Stats band (home)

Counted from the repo when the page is built (`lib/site/stats.ts`, server only, never the database). The client receives only the finished labels.

| Old | New | Source |
|---|---|---|
| 8 — Skills, trained to the consulting standard | 8 — Skills rated in every interview report | `RUBRIC_DIMENSION_KEYS.length` |
| 20+ — Lessons, from first principles to offer-level | 23 — Lessons, each one skill in a few minutes | lessons with `status: live` |
| 200+ — Drills built to close your gaps | 18 — Drills, each a short timed set on one skill | drills with `live: true` (11 more not live) |
| 10+ — Industries, with the nuances interviewers want | 4 — Full cases, by voice or text, across 4 industries | `LISTED_CASE_IDS` (4); industries from `CASE_INDUSTRY` (coffee chain → Retail, airline, SaaS, snacks → CPG) |
| 24/7 — Practice whenever you're ready | unchanged | — |

"Voice and text" goes into the cases label rather than its own tile, which keeps the band at five tiles. A case listed without an industry fails the build.

## 2. Copy changes

| # | Where | Old | New | Reason |
|---|---|---|---|---|
| 1 | Home · hero headline | A complete case interview training program, built around you. / Diagnostic, lessons, skill drills, and AI mock interviews, all in one comprehensive, personalized plan that adapts as you improve. / [Take the free diagnostic] | Mock case interviews with an AI interviewer that plays it like the real thing. / Voice or text interviews, a feedback report on the 8 skills case interviews test, and a diagnostic, lessons and drills in a plan that updates as you practice. / [Start a mock interview] | Reworded: leads with what is live (voice and text mock interviews, the 8-skill report); "complete program" overclaims with 4 cases; the plan updates from drills, not from interviews. |
| 2 | Home · under the hero button | No experience needed. Free to start. | No experience needed. Free with your consulting club’s access code. | Reworded: signing up needs a club code (club-code gate); there is no paid tier, so "free" stays, with the condition stated. |
| 3 | Home · hero demo, step labels | Live interview · Gap caught · Plan adapts | Live interview · Math checked · In your report | Claim removed: an interview result does not reach the plan (lib/drills/case-result.ts: "the grader doesn't emit it yet"). The third step now shows the report quoting the slip, which is live. |
| 4 | Home · hero demo, third panel | Lorenzo’s plan · Week 1 of 6 / Today’s workout: Weak spot · Consulting math — From your interview: margin was 2%, not 4%. / Skill map: Math setup Not started → Learning | Feedback report · Sample · Fresh Basket / Problem structuring — Strong / Quantitative rigor — Needs work: What needs work “It went from 6% to 4%.” → The margin fell to 2%, not 4%: costs rose from 94% to 98% of sales. Set up the margin before you calculate. / Exhibit interpretation — Strong / Business judgment — Adequate / 8 skills rated. Every point quotes the moment it refers to. | Claim removed: the panel showed the interview slip arriving in "Lorenzo’s plan" as a new workout row ("From your interview: margin was 2%, not 4%"), which the product does not do. Replaced by the report point quoting the line. |
| 5 | Loop · Diagnose card | Benchmark yourself on the 8 skills top firms test. | A 15-minute diagnostic finds where each skill starts. | Reworded: the diagnostic is 10 parts of short drill questions (about 15 minutes) placing you per drill skill; it does not score the 8 rubric skills. |
| 6 | Loop · Your plan card | 1 week, 2 weeks, 3 months, or anywhere in between, built around your gaps. | A 6-week plan, or a 7-day Sprint, built around your gaps. | Claim reworded: the tracks are Foundations and Standard (6 weeks) and Sprint (7 days); there are no 2-week or 3-month plans. |
| 7 | Loop · Plan updates card | Every result recalibrates your plan to what’s holding you back now. | Every drill set updates your plan to what’s holding you back now. | Claim narrowed: drill results update the plan; interview results do not yet. |
| 8 | How it works · 01 story line | Lorenzo’s diagnostic. He says the margin fell to 4%. It fell to 2%. | Lorenzo’s first mock interview. He says the margin fell to 4%. It fell to 2%. | Reworded: the chapter shows a mock interview; the diagnostic is short questions, not an interview. |
| 9 | How it works · 02 story line | His plan starts with that slip: margin math leads today’s workout. | His diagnostic finds the same slip, so math setup leads today’s workout. | Claim reworded: the plan is built from the diagnostic (or the questionnaire), not from the interview. |
| 10 | How it works · 06 story line | Math setup reaches Mastered. The report found his next weak spot. | Math setup reaches Mastered in his drills. His report names the next weak spot. | Reworded: mastery comes from drill results; the report names a weak spot but does not move the plan. |
| 11 | How it works · 01 Diagnose | Start with a live mock interview. When you say the margin fell to 4% and the case says 2%, the interviewer asks you to walk through your math, the way a real one would. A short skills check follows, and you leave with a score on each of the 8 skills and a ranked list of what to fix first. | Start with a mock interview. When you say the margin fell to 4% and the case says 2%, the interviewer asks you to walk through your math, the way a real one would, and your report rates each of the 8 skills. Then a 15-minute diagnostic of short questions finds where each skill starts and builds your plan. | Claim reworded: there is no "short skills check" after the interview and no ranked list; the report rates the 8 skills (with one top improvement) and the diagnostic is a separate 15-minute part of drills. |
| 12 | How it works · 02 Your plan | Tell us your interview date, whether it’s next Friday or next semester, and your plan works backward from it. Each day brings one workout of about 20 minutes: drills on your weakest skill, a quick review of something you’ve already learned, and one thing you haven’t seen yet. | Choose a 6-week plan, or a 7-day Sprint when your interview is close. Each day brings one workout of 20 to 30 minutes: drills on your weakest skill, a quick review of something you’ve already learned, and one thing you haven’t seen yet. | Claim reworded: plans are fixed tracks (6 weeks, or a 7-day Sprint the home offers when the interview is near), not any length worked back from a date; Sprint workouts are 30 minutes (programs.v1.json). |
| 13 | How it works · 05 Mock interview | The interviewer shares data only when you ask for the right thing, pushes back when your logic is thin, and runs the case interviewer-led or candidate-led, the two formats firms use. Afterward, each of the 8 skills gets a rating, and every comment quotes the moment in your interview it refers to. | The interviewer shares data only when you ask for the right thing, pushes back when your logic is thin, and checks your math as you go, by voice or by text. Afterward, each of the 8 skills gets a rating, and every comment quotes the moment in your interview it refers to. | Claim removed: candidate-led cases do not exist (interviewer-led only). Added what is live: math checks, voice or text. |
| 14 | How it works · 06 Plan updates | If your mock interview shows you mixing up percentages and percentage points, that goes straight into tomorrow’s workout. A skill moves from learning to practiced once you pass it consistently, and to mastered only after you pass it on problems from an industry you haven’t practiced in. | Mix up percentages and percentage points in a drill set, and that leads your next workout. A skill moves from learning to practiced once you pass it consistently, and to mastered only after you pass it again days later, on a problem from an industry you haven’t just practiced. Your interview report names what to work on too; the plan doesn’t read it yet, so pick that drill yourself. | Claim removed: a mock interview result does not reach the workout (case → drills is deferred). Mastery wording matched to the transfer check (2 days later, avoiding recent industries). |
| 15 | How it works · 01 transcript note | Math slip caught: it’s 2%. This becomes Lorenzo’s weak spot. | Math slip caught: it’s 2%. His report will quote this line. | Claim reworded: the interview does not set a weak spot in the plan; the report quotes the line. |
| 16 | How it works · 02 workout row | From your diagnostic: margin was 2%, not 4%. / 8 min | From your diagnostic: math setup. / 8 min | Reworded: the diagnostic places skills from short questions; it never saw the interview’s margin figure. |
| 17 | How it works · 04 follow-up label | Follow-up · Framework builder | Framework builder · Follow-up | Reworded: follow-ups exist on Framework builder and three other construct drills, not on Consulting math; the label now names the drill first. |
| 18 | How it works · 05 report row | Quantitative rigor / Strong / Day 1: Focus area | Quantitative rigor / Strong | Claim removed: the report does not compare with earlier sessions ("Day 1: Focus area"). |
| 19 | How it works · 05 report stages | Structure · Math · Exhibits · Brainstorming · Synthesis | (removed) | Claim removed: the report has no stage-by-stage breakdown (it rates the 8 skills, with a top improvement, a model answer and the transcript). |
| 20 | How it works · 06 workout row | From your mock interview: percent vs. percentage points. / 8 min | From your drills: percent vs. percentage points. / 8 min | Claim removed: the workout row came "from your mock interview", which the product does not do. |
| 21 | Both pages · call to action (link target) | [Take the free diagnostic] → (click) “Contact our team to learn more!” | [Start a mock interview] → /sign-in?next=/home | Button fixed: "Take the free diagnostic" only changed its label to "Contact our team to learn more!"; every primary button is now a link to /sign-in?next=/home. |
| 22 | Metadata · home | home: { title: `${BRAND} \| Case interview training built around you`, description: `${BRAND} is a complete case interview training program: a diagnostic, lessons, skill drills and AI mock interviews in one personalized plan that adapts as you improve.` }, | home: { title: `${BRAND} \| AI mock case interviews and training`, description: `${BRAND} runs mock case interviews with an AI interviewer, by voice or text, and rates you on the 8 skills case interviews test, with a diagnostic, lessons and drills to practice between cases.` }, | Metadata: matched to the honest hero; "complete program" and "adapts" claims removed. |
| 23 | Metadata · How it works | product: { title: `How it works \| ${BRAND}`, description: `Every step of the ${BRAND} training loop, from the free diagnostic to your plan, lessons, drills and AI mock interviews, to the skill you finally master.` }, | How it works | Metadata: "free diagnostic" removed; the brand comes from the site-wide title template. |
| 24 | How it works · intro | From your first case to offer-ready / [Take the free diagnostic] | From your first case to interview day / [Start a mock interview] | Reworded: "offer-ready" is a promise; button now goes somewhere real. |
| 25 | Both pages · final call to action | Find out where you stand. It’s free. / Take the diagnostic and get a personalized training plan in minutes. / [Take the free diagnostic] | Find out where you stand. / Take a mock interview and get your report on all 8 skills in minutes. / [Start a mock interview] | Claim removed: the free diagnostic as the entry point; the button now starts a mock interview (via sign-in). |
| 26 | Home · What sets us apart headline | Most AI case tools stop at the mock interview. We build the plan that gets you ready. | Most AI case tools stop at the mock interview. We add the drills and lessons to fix what it finds. | Reworded: the plan is not built from the interview. |
| 27 | Home · slide 01 body | It asks for your structure, shares exhibits only when you ask for the right data, and stops you when the math is off. Afterward, every piece of feedback quotes the moment in your interview it refers to. | It asks for your structure, shares exhibits only when you ask for the right data, and asks you to walk through it when the math is off. Afterward, every piece of feedback quotes the moment in your interview it refers to. | Reworded: the interviewer probes a math error; it does not stop the case. |
| 28 | Home · slide 02 body | Your diagnostic and every case you take reshape what you practice next. Whether your interview is next Friday or next semester, you’ll always know exactly what today’s workout is. | Your diagnostic sets your plan, and every drill set you finish reshapes it. Whether your interview is six weeks or seven days away, you’ll always know exactly what today’s workout is. | Claim removed: cases do not reshape the plan; plan lengths matched to the tracks. |
| 29 | Home · slide 03 body | Every mistake you make in a case is matched to a short lesson and a set of targeted drills. Learn the concept in about three minutes, then practice it with drills from a library of 200+ that give instant feedback and test whether you really understand. | Each skill has a short lesson and targeted drills. Learn the concept in about three minutes, then practice it with drills that give instant feedback and, on harder sets, make you defend your answer. | Claims removed: "200+" drills (18 are live) and case mistakes matched to lessons and drills (not wired). |
| 30 | Home · What sets us apart button | Take the free diagnostic | Start a mock interview | Button fixed: goes to /sign-in?next=/home. |
| 31 | Home · slide 01 tag | Live voice | Voice or text | Reworded: text interviews are live too. |
| 32 | Home · Under the hood body | A multi-agent architecture runs each part of your interview, every output is verified, and every mistake becomes a drill built to fix it. | Separate AI agents run each part of your interview, every number the interviewer says comes from the case, and the report’s quotes are checked against your transcript. | Claim removed: "every mistake becomes a drill" (interview mistakes don’t reach drills); "every output is verified" narrowed to the checks that exist (number audit, quote audit). |
| 33 | Home · slide 03 lesson title | Percentages vs. percentage points | Percent change, percent of, and percentage points | Matched to the live lesson’s title (lessons/lesson-qn-percentages.md). |
| 34 | Home · slide 03 drill follow-up | Follow-up: The CFO tells the board the margin “grew 2%”. What would you say instead, and why? / Your reply · up to 60 words | (removed) | Claim removed: Mental math has no follow-up questions (only Framework builder, Initial hypothesis, 60-second recommendation and What do you need to know do). |
| 35 | File header comment | (code comment) | (code comment) | Code comment (not on the page). |
| 36 | Home · slide 02 character | AI planner | Your plan | Claim removed: plans are built by rules, not an AI planner. |
| 37 | Home · slide 03 character | AI teacher | Lessons | Claim removed: lessons are human-reviewed static pages, not an AI teacher. |
| 38 | Home · slide 03 character | AI drills coach | Drills | Claim removed: drills are graded by code and rules, not an AI coach. |
| 39 | How it works · story pill | Passed in a new case | Right in a new case | Reworded: a case does not count toward a skill’s level; the pill now just says he got it right. |
| 40 | How it works · 05 report label | </span>The 8 skills top firms hire for | </span>The 8 skills in every report | Reworded: unverifiable claim about what firms hire for. |
| 41 | How it works · 04 follow-up box | Your reply · up to 60 words | Your reply · up to 40 words | Matched to the product: follow-up replies are capped at 40 words (rules.defend.max_words). |
| 42 | How it works · 01 snapshot title | Skill snapshot | From his report | Reworded: the snapshot is the report’s ratings, not a separate skills check. |
| 43 | How it works · 01 snapshot ratings | Strong start / Focus area | Strong / Needs work | Matched to the report’s rating labels. |
| 44 | Both pages · sticky header button | [Free diagnostic] (phone) / [Take the free diagnostic] | [Start] (phone) / [Start a mock interview] | Button fixed: the free diagnostic does not exist; goes to /sign-in?next=/home. |
| 45 | Both pages · sticky header link | Product | How it works | Matched to the page’s name and route (/how-it-works). |
| 46 | Both pages · footer link | Product | How it works | Matched to the page’s name and route. |
| 47 | How it works · chapter rail button | Take the free diagnostic | Start a mock interview | Button fixed: goes to /sign-in?next=/home. |
| 48 | Loop · meter label | Readiness | Progress | Claim removed: there is no readiness score in the product; the meter is decoration. |
| 49 | Home · Under the hood, layer 04 | Every mistake maps to one of 60+ error types, each with drills to fix it | Drill mistakes map to one of 60+ error types, each with drills to fix it | Claim narrowed: drill mistakes are tagged (67 error types); interview mistakes are not. |
| 50 | Home · Under the hood, layer 02 | Separate agents interview, share data and grade, so the case feels real and scores stay impartial. | Separate agents interview, check the math and grade, so the interviewer never grades its own case. | Reworded: code, not an agent, decides which data is shared; "impartial" is unmeasured. The scorer is a separate model from the interviewer. |
| 51 | Home · Under the hood, layer 04 | Every mistake maps to one of 60+ error types, each with drills to fix it | Drill mistakes map to one of 60+ error types, each with drills to fix it | Claim narrowed: drill mistakes are tagged (67 error types); interview mistakes are not. |
| 52 | Home · Under the hood, layer 02 | Separate agents interview, share data and grade, so the case feels real and scores stay impartial. | Separate agents interview, check the math and grade, so the interviewer never grades its own case. | Reworded: code, not an agent, decides which data is shared; "impartial" is unmeasured. The scorer is a separate model from the interviewer. |

Not a table row, but changed with the copy:
- **Hero demo, step 3**: the panel showing "Today's workout" and the skill map is replaced by a report excerpt (`hero-demo.tsx` `ReportView`, 1 Nov). It has three of the 8 skills with ratings, plus Quantitative rigor opened to the quoted line and the point. It fills the panel's fixed height and fits at 320px wide.
- **How it works, 05**: the report's stage strip (Structure · Math · Exhibits · Brainstorming · Synthesis) is removed, along with its animation.
- **Slide 03 drill screen**: the follow-up box is removed. **How it works, 04**: the follow-up box stays (Framework builder has follow-ups), now capped at 40 words.
- **Every primary button**: `StartCta` is a link to `/sign-in?next=/home`. The old `DiagnosticCta` was a `<button>` that only changed its label. Its phone CSS for the two-line label is removed.

Kept as written, flagged for Matt:
- **The sample story** (Lorenzo, Fresh Basket, Harbor Coffee) is fictional and labelled "Sample student" and "Source: CasePace sample session". Fresh Basket and Harbor Coffee aren't real cases in the product.
- **Lesson sample (03)**: an at-home fitness launch. The live lesson with this title uses a climbing-gym example. Same format, different content.
- **Character names** (Graham, Valeria, Imani, Kai) are illustrations. The interviewer never gives its name.
- **"Most prep tools give you generic drills…"** and **"All Engineered for YOU to Succeed"** are opinion or tagline, so they stay.

## 2b. In the product (drills home), 1 Nov

| Where | Old | New | Reason |
|---|---|---|---|
| Drills home · "Get your plan" (no plan yet) | Three options: Answer a few questions / Take the diagnostic / **Take a full case — About 35 minutes. The most accurate. [Go to cases]** | Two options: Answer a few questions / Take the diagnostic | Option hidden (Lorenzo, 1 Nov): a case result can't produce a plan until the grader sends its payload (`CASE_RESULTS_WIRED = false` in `lib/drills/case-result.ts`; PRD §15 next build item). |

Seen, not changed: when today's workout is empty, it says "Take the diagnostic or a case so we can find them", and a case doesn't find weak spots yet either.

## 3. Rebrand (CaseTester → CasePace)

The app shows almost no "CaseTester". These product names changed:

| Where | Old | New |
|---|---|---|
| Browser tab, every page | Create Next App | CasePace (pages: "<page> \| CasePace") |
| App header (home, case, report, voice, drills) | Case Practice | CasePace |
| Sign-in card | Case Interview Practice | CasePace (links to /) |
| PDF report heading | Interview Feedback | CasePace · Interview Feedback |
| PDF document title / author | Interview Feedback — <case> | Interview Feedback — <case> \| CasePace; author CasePace |
| PDF file name | case-report-<case>-<id>.pdf | casepace-report-<case>-<id>.pdf |
| Site pages (header, footer, slides) | CasePace already (Matt) | unchanged |

Checked, with no brand to change: the end screen, drills pages, the web report heading ("Interview Feedback", under the CasePace header), error pages (none exist, so Next's defaults show no brand).

**Lines the voice agent or interviewer speaks: none name the product.** Searched: the interviewer prompts and scripts, code-written lines and pools (`lib/orchestrator/phrasing.ts`), and the voice agent and fillers (`lib/voice`). Nothing to change.

Not renamed, as instructed: the repo, the package (`casetester`), env vars, DB tables, internal names, and the localStorage key `casetester.voice.fillers` (renaming it would reset students' "Thinking sounds" setting).

## 4. For Lorenzo to change by hand (outside the code)

- **Supabase → Authentication → Email templates** (confirm signup, magic link, reset password): any sender name or "CaseTester"/default wording → CasePace. Also **Site URL / Redirect URLs**: the app root is now the public homepage. Students sign in at `/sign-in`, so add it if the redirect allow-list names `/` alone.
- **Vercel**: the project name (`case-tester`) and any domain, if the site should live at a CasePace domain. The pages set no `metadataBase`, so link-preview URLs use the Vercel production URL until a domain is set.
- **LiveKit**: the agent name `case-interviewer` is internal and never shown, so no change is needed.
- **Club codes / onboarding emails** sent to clubs by hand, if they say CaseTester.

