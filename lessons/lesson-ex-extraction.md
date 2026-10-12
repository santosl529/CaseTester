---
lesson_id: lesson-ex-extraction
skill_id: EX.extraction
version: 1
status: draft
title: Pull the right number from a dense table
drafting_model: claude-opus-5-5
reviewed_by:
reviewed_at:
review_notes:
---
## The idea
Find the exact row, column and period the question asks for before you calculate.

## Why interviewers care
Dense tables test precision. Taking a value from the neighboring row or year is easy under time pressure, and silently wrong.

## The pattern
1. Mark the question's key words: which segment, which metric, which period.
2. Find the row, then the column, and read the cell where they cross.
3. Check the units in the header.
4. For a change or a ratio, make sure both values come from the right row and the right years.

## Worked example
Question: "What was the West region's 2024 profit margin?"

The table has a row per region and columns for revenue and profit in 2023 and 2024. West 2024: revenue $80M, profit $12M.

Margin = $12M ÷ $80M = **15%**.

Easy slips: West's 2023 profit next to its 2024 revenue, or the East row just above.

## Common mistakes
- `M.wrong_data_point`: using a value from the wrong row, column or year.
