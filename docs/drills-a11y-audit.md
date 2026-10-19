# Drills accessibility audit (WCAG 2.1 AA)

D6 gate: "WCAG 2.1 AA audit passed" (docs/prd-drills.md, "Accessibility" and "Phases").

**Status (2026-10-17): automated checks pass; not yet passed overall.** Timed items (WCAG 2.2.1) are resolved with "No time limit" (below). One thing remains before the gate can be signed off: a person runs the manual checklist at the end and records the result here.

## How to rerun

```
npm run dev            # in one terminal
npm run drills:a11y    # in another; A11Y_BASE_URL defaults to http://localhost:3000
```

It signs in as a throwaway student, scans every page below, and deletes the student afterwards. Results go to `logs/a11y/<time>.json`, with a screenshot of each page in `logs/a11y/<time>/`. Grading uses a stub model, so a run costs nothing.

## What is checked automatically

On each page:
- **axe-core** (4.13), with the WCAG 2.0 and 2.1 A and AA rules: contrast, labels, names, roles, landmarks, headings, ARIA use and similar.
- **Keyboard:** Tab from the top until focus wraps around. Every stop must show a visible focus indicator.
- **Reflow (WCAG 1.4.10):** at 320 CSS px wide, the page must not scroll sideways.

Pages (47): onboarding; the training home with no plan yet (Get your plan), with "Your plan is ready", with a check-in, with the feedback dialog open, for Practice on my own, and with the diagnostic offered again after a switch; the questionnaire; Your plan and Your starting point; diagnostic, browse drills (drill cards by interview stage), Learn library, the intro lesson, a full lesson (MECE), your skills, settings; the pilot reports (local development only; also with feedback data) and the review queue; a set intro (worked example, timer choice); "Report a problem" open on an item and on results; one set of each of the 18 live drills; an untimed set (EX-1); an item with a hidden timer showing its 10-second warning; HY-2's second stage; a CL-3 follow-up step; and results for PS-1 (with the usefulness check-in) and CL-3. Each page is also saved as a phone-width screenshot.

Automated checks find roughly a third of WCAG problems. They can't judge whether names make sense, whether announcements are timely, or how a screen reader reads a page.

## Results (2026-10-17)

| Check | Result |
| --- | --- |
| axe WCAG 2.1 A/AA rules | 0 violations on all 47 pages |
| Visible focus on every Tab stop | Pass on all 47 pages |
| Reflow at 320 px | Pass on all 47 pages, after one fix (below) |

**Fixed:** EX-3's data table was wider than a 320 px screen and made the whole page scroll sideways. Data tables now scroll inside their own box, which WCAG allows for tables. The box is focusable and labeled, so it can be scrolled with the keyboard (`components/drills/chart.tsx`).

## PRD requirements, checked in the code

| PRD requirement | Status |
| --- | --- |
| Full keyboard operation, including ordering inputs | Every live input is a native control (radio, checkbox, text, textarea, number), so it works with the keyboard; the Tab walk reached every one. No live drill uses an ordering input; the P1 drill that needs one must be checked when it ships. |
| Every chart has an accessible data table | Yes: charts have a "Show data table" disclosure; table exhibits are tables, with a caption and header cells. |
| Time accommodation, 1.5× or 2× | Yes, in Settings, now with No time limit (below). Mastery uses the adjusted limits. |
| Timers announce remaining time at 50%, 25% and 10 seconds | Yes: a polite live region announces each mark once, then "Time is up" (`components/drills/timer.tsx`). |

## Resolved: timed items (WCAG 2.2.1 Timing Adjustable, Level A)

WCAG 2.2.1 requires that a time limit can be turned off, extended at least 10×, or extended on a warning, unless it is essential. The 1.5× and 2× setting alone didn't meet it.

Matt's decision (2026-10-17): Settings → Time per item now offers **No time limit**.
- There is no timer and nothing times out; the server accepts the answer whenever it arrives.
- Untimed sets count fully toward every skill state, including Mastered, so students who need extra time aren't blocked from mastery.
- Results show the real time taken against the timed (1×) target, so students can work on pace.
- Each set records the setting when it starts (`drill_sets.untimed`), so changing it mid-set has no effect.
- Checked by `npm run drills:smoke` (answers 10 minutes late still count) and scanned by the audit (the untimed EX-1 set).

## Out of scope here

- **The landing page** (case product, shared with `main`): its email, password and club-code fields use placeholders as their only labels. Every drills student signs in through it, so it should be fixed on `main`.
- **Dark mode:** the drills pages have none, so there's nothing to check.

## Manual checklist (a person, before sign-off)

Use VoiceOver (macOS: Cmd+F5) in Safari, and do one full set of PS-1, EX-1 and CL-3.
- [ ] Each page's heading and the item's question are read on arrival; the order makes sense.
- [ ] Each answer option, field and button is read with a clear name.
- [ ] The timer announces at 50%, 25% and 10 seconds, without interrupting typing.
- [ ] After Submit, the feedback ("Correct", "Partly correct", "Not quite" or "Answer saved" for written answers, and the explanation) is announced.
- [ ] On an AI-graded set, "Grading your answers…" and then the results are announced.
- [ ] A chart's "Show data table" opens with the keyboard and the table is read with its headers.
- [ ] A whole set can be completed with the keyboard alone, with focus never lost after Submit or Next.
- [ ] **Immediate feedback: the grading wait** (the automated audit can't reach it). Start a CL-3 set, choose **After each question** on the intro, answer item 1 and press Submit (at tier 2–3, also answer the follow-up and press Submit).
  - You should hear "Grading your answer." right after Submit, and focus should land on the "Grading your answer…" box (VoiceOver reads it), not jump to the top of the page.
  - Pressing Tab during the wait shouldn't lose focus or reach a hidden control.
  - Within a few seconds you should hear "Your feedback is ready below.", and focus should be on the **Next item** button ("Next item, button").
  - To hear the delayed path, run the app locally and turn off Wi-Fi just before pressing Submit: you should hear "Grading delayed. You will see it on your results.", see the Grading delayed note, and **Next item** should still work with the keyboard.
- [ ] **Immediate feedback: the panel on the question screen** (the audit checks the same panel only on the results screen). With the feedback from the check above showing, open the VoiceOver rotor (VO+U), go to Landmarks and choose **Feedback**.
  - You should hear the verdict first ("Partly correct (60%)", or "Correct" or "Not quite").
  - Then each check in order, read as "Passed:" or "Missed:", then the check's question, then the quoted evidence or the tip.
  - Then any red flag, "A strong answer" with the model answer, and for a follow-up, the follow-up, your reply and its checks.
  - VO+Right should move through all of it in that order, and Tab should go from the panel to **Next item** without skipping it.
- [ ] **Your progress: the skill map and its views** (the audit checks the markup, not what VoiceOver says). Open Your progress after some practice.
  - Tab through the skill map. Each tile should be read as one link: the skill name, its state and its trend in words, for example "MECE structure, Mastered, improving, link" (or "not enough data for a trend"). You should never hear a skill code like "PS.mece".
  - In **Group by** and **Trends over**, the selected option should be read as current ("Skill area, current, link"). Choosing another should update the page without losing your place (focus stays on the views or moves to the page, never into nothing), and the new grouping should be read in order: Clarify, Structure, Analyze, Recommend. Clarify should say "Practiced in full cases for now."
  - In **Interview ready**, each line should start with "Done:" or "Not yet:".
  - Under Focus areas, **Practice** should open a set, and **Dismiss** should remove the card with focus kept on the page, not lost.
  - **Recent activity** should open and close with Space or Enter, and you should hear "collapsed" and "expanded".
- [ ] **Your progress: charts and the skill page.** Open a skill with a tier change (for example MECE structure after moving up a tier).
  - On the ladder, the current state should be read as the current step ("Mastered, current step"); Validated, when not reached, should add "(needs a full case)".
  - On "Score over time", press **Show data table** with the keyboard. The table should be read with its headers ("Score", "Note"), and the tier change should be read in the Note column ("Up to tier 2"). Below the chart you should hear "Dashed line: the 80% bar."
  - In the Mistakes table, each row should be read as the mistake, the counts with "(more)", "(fewer)" or "(same)", and an example starting "Your answer:", "You picked:" or "From your case:".
  - Repeat **Show data table** on each trend chart on Your progress; a week with no answers should be read as "–", not 0.
- [ ] At 200% browser zoom, nothing is cut off or overlaps (WCAG 1.4.4).
- [ ] With the text-spacing bookmarklet (WCAG 1.4.12), no text is cut off.

Record the date, tester and result here when done.
