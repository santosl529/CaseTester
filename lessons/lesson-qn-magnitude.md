---
lesson_id: lesson-qn-magnitude
skill_id: QN.magnitude
version: 1
status: draft
title: Zeros and units
drafting_model: claude-opus-5-5
reviewed_by:
reviewed_at:
review_notes:
---
## The idea
Track zeros and units on purpose: write numbers in thousands, millions or billions, and label every result.

## Why interviewers care
Being off by a factor of 1,000 is the most common math mistake in cases, and the easiest to catch with a quick check.

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

## Common mistakes
- `M.zeros_error`: an answer off by a factor of 10, 100 or 1,000.
- `M.unit_error`: mixing units, like a monthly figure with a yearly one, or cents with dollars.
