---
lesson_id: lesson-ex-traps
skill_id: EX.traps
version: 1
status: draft
title: Catch the detail that changes the answer
drafting_model: claude-opus-5-5
reviewed_by:
reviewed_at:
review_notes:
---
## The idea
Before reading values, check the units, where the axis starts, which axis each series uses, the footnotes, whether values are indexed, and whether the periods match.

## Why interviewers care
Interview exhibits often hide one detail that changes the answer. Catching it is the point of the question.

## The pattern
1. Units: thousands or millions? Dollars or percent?
2. Axis: does it start at zero? A cut-off axis makes changes look bigger.
3. Two axes: which series uses which?
4. Footnotes: what is left out or defined differently?
5. Indexed values (2020 = 100) show change, not size.
6. Periods: quarters or years? Do the columns cover the same span?

## Worked example
A bar chart of sales shows one bar about twice as tall as the other, labeled 95 and 105. The axis starts at 90, so the real increase is 10 ÷ 95, about **11%**, not a doubling.

A footnote reads "excludes online sales". Any conclusion is about store sales only.

## Common mistakes
- `M.missed_units`: reading thousands as millions, or a percent as an amount.
- `M.axis_misread`: judging size from bar height when the axis doesn't start at zero.
- `M.dual_axis_misread`: reading a series against the wrong axis.
- `M.missed_footnote`: ignoring a note that leaves out or redefines part of the data.
- `M.indexed_misread`: treating indexed values (2020 = 100) as actual amounts.
- `M.period_mismatch`: comparing different periods, like a quarter with a year.
