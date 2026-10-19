---
lesson_id: lesson-qn-setup
skill_id: QN.setup
version: 1
status: live
title: Set up the formula before you calculate
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
Before calculating, write the formula in words, then plug in the numbers.

## Why interviewers care
Most case math errors are setup errors, like dividing by the wrong thing or leaving out a term, not arithmetic. Interviewers often stop you at the setup to check it.

## Why it works
The formula is where the logic lives; the numbers only fill it in. Saying it in words first lets the interviewer check your logic before you spend time on arithmetic, and checking units catches a monthly cost set against a yearly volume.

## The pattern
1. Name what you're solving for, and its unit.
2. Write the formula in words: **breakeven** units (the volume where revenue just covers costs) = fixed costs ÷ (price − variable cost per unit).
3. Check that every term is in the same units and covers the same period.
4. Only then calculate.

## Worked example
A food truck pays $60,000 a year in **fixed costs** (costs that don't change with sales, like the truck and permits). It sells burritos at $12, and each costs $4 to make (a **variable cost**). How many burritos a year to break even?

Formula in words: fixed costs ÷ **contribution** per burrito (price minus variable cost: what each sale adds toward fixed costs).
Contribution per burrito = $12 − $4 = $8.
Breakeven = $60,000 ÷ $8 = **7,500 burritos a year**.

Wrong setup: $60,000 ÷ $12 = 5,000. It divides by price, as if each burrito cost nothing to make.

## Another example
A frame shop can buy a $50,000 cutting machine. It saves $20 on each of the 500 frames it makes a month, and costs $2,000 a month to run. What is the **payback** (the time the savings take to repay the cost)?

Formula in words: payback = cost ÷ net saving per month.
Net saving = ($20 × 500) − $2,000 = $8,000 a month.
Payback = $50,000 ÷ $8,000 = **about 6 months**.

Missing term: $50,000 ÷ $10,000 = 5 months leaves out the running cost.

## Tricky cases
- **Mixed periods.** Monthly fixed costs divided by contribution gives a monthly breakeven. Compare it with monthly sales, not yearly ones.
- **Revenue in place of profit.** Payback divides by the saving or profit, not by revenue: $100K of new sales at $90K of cost repays $10K a year, not $100K.

## Common mistakes
- `M.wrong_formula`: the right numbers in the wrong formula, like dividing fixed costs by price instead of contribution per unit.
- `M.missing_term`: a formula that leaves out a term, like ignoring fixed costs or one cost line.

## Quick check
A cooking school pays $4,000 a month in rent and staff. A class seat sells for $50, and each seat uses $10 of ingredients. How many seats a month does it need to sell to break even?

**Answer:** 100 seats: $4,000 ÷ ($50 − $10). Dividing by $50 (80 seats) leaves out the ingredients.
