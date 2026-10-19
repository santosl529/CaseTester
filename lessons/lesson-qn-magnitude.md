---
lesson_id: lesson-qn-magnitude
skill_id: QN.magnitude
version: 1
status: live
title: Keep track of zeros and units
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
Track zeros and units on purpose: write numbers in thousands, millions or billions, and label every result.

## Why interviewers care
Being off by a factor of 1,000 is the most common math mistake in cases, and the easiest to catch with a quick check.

## Why it works
Big numbers are easy to lose a zero in, because the digits look the same at any size. Writing them as K, M and B (thousand, million, billion) makes the size part of the number, and labeling units makes a mismatch visible before you combine two numbers.

## The pattern
1. Convert big numbers to a short form: 2.4 million = 2.4M; 350 thousand = 0.35M.
2. Multiply the digits, then add the zeros: 3K × 4K = 12M (thousand × thousand = million).
3. Label units at every step: dollars per unit, units per year.
4. Convert before you combine: monthly to yearly, cents to dollars.
5. Check the size against something you know.

## Worked example
2.5 million households × 30% who buy × $120 a year.

2.5M × 0.3 = 0.75M households. 0.75M × $120 = **$90M a year**.

Check: roughly 1M households × $100 = $100M. Same order of magnitude, so the zeros are right.

If the $120 were a monthly price, convert first: $120 × 12 = $1,440 a year, and the total becomes $1.08B.

## Another example
A school district runs 400 buses. Each drives 150 km a school day, fuel costs 30 cents a km, and there are 180 school days. What is the yearly fuel bill?

400 × 150 = 60K km a day. 60K × $0.30 = $18K a day. $18K × 180 = **about $3.2M a year**.

Check: one bus costs 150 × $0.30 = $45 a day, about $8K a year; × 400 buses ≈ $3.2M.

## Tricky cases
- **Thousand times thousand.** 3K × 4K is 12M, not 12K.
- **A percent as a whole number.** 30% of 2.5M is 2.5M × 0.3 = 0.75M. Multiplying by 30 gives 75M, 100 times too big.
- **Cents.** 30 cents is $0.30. Using 30 makes the bill 100 times too big.

## Common mistakes
- `M.zeros_error`: an answer off by a factor of 10, 100 or 1,000.
- `M.unit_error`: mixing units, like a monthly figure with a yearly one, or cents with dollars.

## Quick check
A fitness app has 4M subscribers paying $9 a month. What is its yearly revenue?

**Answer:** $432M. 4M × $9 = $36M a month, and × 12 = $432M a year. Check: about 4M × $100 a year = $400M.
