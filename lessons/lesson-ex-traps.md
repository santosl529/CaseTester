---
lesson_id: lesson-ex-traps
skill_id: EX.traps
version: 1
status: live
title: Catch the detail that changes the answer
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
Before reading values, check the units, where the axis starts, which axis each series uses, the footnotes, whether values are indexed, and whether the periods match.

## Why interviewers care
Interview exhibits (the charts and tables you're handed) often hide one detail that changes the answer. Catching it is the point of the question.

## Why it works
Each shortcut a chart takes changes how the picture maps to the numbers: a cut-off axis, a second axis, an index, a footnote. Checking them before you read values means you read the numbers, not the shape.

## The pattern
1. Units: thousands or millions? Dollars or percent?
2. Axis: does it start at zero? A cut-off axis makes changes look bigger.
3. Two axes (a **dual-axis** chart): which series uses which?
4. Footnotes: what is left out or defined differently?
5. **Indexed** values (each year shown against a base year set to 100, like 2020 = 100) show change, not size.
6. Periods: quarters or years? Do the columns cover the same span?

## Worked example
A bar chart of sales shows one bar twice as tall as the other, labeled 95 and 105. The axis starts at 85, so the bars are 10 and 20 tall, but the real increase is 10 ÷ 95, about **11%**, not a doubling.

A footnote reads "excludes online sales". Any conclusion is about store sales only.

## Another example
A line chart shows a product's sales indexed to 2020 = 100. By 2024 the line is at 130.

"Sales rose by 130" or "by 30" reads the index as an amount. It means sales rose 30% since 2020. If 2020 sales were $8M, 2024 sales are about $10.4M, up $2.4M.

## Tricky cases
- **A footnote that redefines.** "Revenue is net of returns" changes what the bars measure. Comparing them with gross revenue from another exhibit mixes two definitions.
- **A line above the bars.** On a dual-axis chart, the bars may be in $M on the left and the line in % on the right. The line sitting higher doesn't mean it's bigger.

## Common mistakes
- `M.missed_units`: reading thousands as millions, or a percent as an amount.
- `M.axis_misread`: judging size from bar height when the axis doesn't start at zero.
- `M.dual_axis_misread`: reading a series against the wrong axis.
- `M.missed_footnote`: ignoring a note that leaves out or redefines part of the data.
- `M.indexed_misread`: treating indexed values (2020 = 100) as actual amounts.
- `M.period_mismatch`: comparing different periods, like a quarter with a year.

## Quick check
A chart shows Q1 2025 sales of $30M next to full-year 2024 sales of $100M. Did sales fall 70%?

**Answer:** No: it compares a quarter with a year. At the 2024 pace, a quarter is about $25M, so Q1 is up about 20%.
