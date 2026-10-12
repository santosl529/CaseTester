---
lesson_id: lesson-qn-growth
skill_id: QN.growth
version: 1
status: draft
title: Growth compounds
drafting_model: claude-opus-5-5
reviewed_by:
reviewed_at:
review_notes:
---
## The idea
Each year's growth applies to the previous year's total, not to the starting number.

## Why interviewers care
Multi-year growth shows up in market sizing and investment cases. Adding the rates up understates the result, and the gap widens with higher rates and longer periods.

## The pattern
1. Over n years at rate r: end = start × (1 + r)ⁿ.
2. For two years, multiply twice: 1.1 × 1.1 = 1.21, so 10% a year is 21% over two years, not 20%.
3. Rule of 72: doubling time ≈ 72 ÷ the growth rate in percent (8% a year doubles in about 9 years).
4. To find a yearly rate from a start and an end, try rates until (1 + r)ⁿ fits.

## Worked example
Revenue of $50M grows 20% a year for three years.

Year 1: $50M × 1.2 = $60M.
Year 2: $60M × 1.2 = $72M.
Year 3: $72M × 1.2 = **$86.4M**.

Adding the rates instead (20% × 3 = 60%) gives $80M, which is $6.4M too low.

## Common mistakes
- `M.growth_error`: adding the yearly rates up (simple growth) instead of compounding them.
