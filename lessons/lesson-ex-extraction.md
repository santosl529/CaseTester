---
lesson_id: lesson-ex-extraction
skill_id: EX.extraction
version: 1
status: live
title: Pull the right number from a dense table
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
Find the exact row, column and period the question asks for before you calculate.

## Why interviewers care
Dense tables test precision. Taking a value from the neighboring row or year is easy under time pressure, and silently wrong.

## Why it works
A dense table holds many right-looking numbers and only one right answer. Pinning down the segment, metric and period before you look keeps your eye from landing on a neighbor. Checking units, and both ends of a ratio, catches the slips that remain.

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

## Another example
Question: "How much did online camping-gear sales grow from 2023 to 2024?"

A sporting-goods retailer's table has a row per product line, split into store, online and total, with revenue for 2022, 2023 and 2024 in $K. Camping, online: 2023 $400K, 2024 $520K.

Growth = ($520K − $400K) ÷ $400K = **30%**.

Easy slips: the 2022 column, the "Camping, total" row, or reading $K as $M.

## Tricky cases
- **A total row.** "Camping, total" sits right below "Camping, online". The question asks for one channel, so the total is the wrong row.
- **A ratio from two years.** 2024 profit over 2023 revenue looks like a margin, but it isn't one. Both numbers must come from the same year.

## Common mistakes
- `M.wrong_data_point`: using a value from the wrong row, column or year.

## Quick check
The table shows:
- West: 2023 revenue $70M, profit $7M; 2024 revenue $80M, profit $12M.
- East: 2023 revenue $90M, profit $9M; 2024 revenue $100M, profit $10M.

What was West's 2023 profit margin?

**Answer:** 10%: $7M ÷ $70M. Dividing by 2024 revenue ($7M ÷ $80M) mixes years.
