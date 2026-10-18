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

Pages (34): onboarding, training home, diagnostic, browse drills, Learn library, the intro lesson, a full lesson (MECE), your skills, settings, the pilot reports (local development only), a set intro with a worked example, one set of each of the 18 live drills, an untimed set (EX-1), HY-2's second stage (new fact revealed), a CL-3 follow-up (Defend) step, and results pages for an auto-checked set (PS-1) and an AI-graded one (CL-3).

Automated checks find roughly a third of WCAG problems. They can't judge whether names make sense, whether announcements are timely, or how a screen reader reads a page.

## Results (2026-10-17)

| Check | Result |
| --- | --- |
| axe WCAG 2.1 A/AA rules | 0 violations on all 34 pages |
| Visible focus on every Tab stop | Pass on all 34 pages |
| Reflow at 320 px | Pass on all 34 pages, after one fix (below) |

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
- [ ] At 200% browser zoom, nothing is cut off or overlaps (WCAG 1.4.4).
- [ ] With the text-spacing bookmarklet (WCAG 1.4.12), no text is cut off.

Record the date, tester and result here when done.
