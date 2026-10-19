---
lesson_id: lesson-qn-growth
skill_id: QN.growth
version: 1
status: live
title: Growth compounds
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
Each year's growth applies to the previous year's total, not to the starting number. That's **compounding**.

## Why interviewers care
Multi-year growth shows up in market sizing and investment cases. Adding the rates up understates the result, and the gap widens with higher rates and longer periods.

## Why it works
Each year's growth earns growth the next year, the way interest earns interest. Adding the rates leaves out that growth on growth, and the missing part gets bigger with the rate and the number of years.

## The pattern
1. Over n years at rate r: end = start × (1 + r)ⁿ.
2. For two years, multiply twice: 1.1 × 1.1 = 1.21, so 10% a year is 21% over two years, not 20%.
3. Rule of 72: doubling time ≈ 72 ÷ the growth rate in percent (8% a year doubles in about 9 years).
4. To find a yearly rate from a start and an end (often called the **CAGR**, compound annual growth rate), try rates until (1 + r)ⁿ fits.

## Worked example
Revenue of $50M grows 20% a year for three years.

Year 1: $50M × 1.2 = $60M.
Year 2: $60M × 1.2 = $72M.
Year 3: $72M × 1.2 = **$86.4M**.

Adding the rates instead (20% × 3 = 60%) gives $80M, which is $6.4M too low.

## Another example
A magazine's print subscribers fall 10% a year for three years, from 200K.

Year 1: 200K × 0.9 = 180K.
Year 2: 180K × 0.9 = 162K.
Year 3: 162K × 0.9 = **about 146K**.

Subtracting 30% gives 140K, too low: each year's 10% comes off a smaller base.

## Tricky cases
- **Up and down don't cancel.** Up 20%, then down 20%, is 1.2 × 0.8 = 0.96: a 4% fall overall.
- **The rule of 72 is a shortcut.** It's close for rates up to about 20%. At 50% a year it says 1.4 years; the real doubling time is about 1.7.

## Common mistakes
- `M.growth_error`: adding the yearly rates up (simple growth) instead of compounding them.

## Quick check
Sales of $10M grow 10% a year for two years, then fall 10% in year three. What are sales after year three?

**Answer:** $10.89M. $10M × 1.1 × 1.1 = $12.1M, then $12.1M × 0.9 = $10.89M. Adding the rates (+10%, +10%, −10%) gives $11M.
