---
lesson_id: lesson-qn-arithmetic
skill_id: QN.arithmetic
version: 1
status: live
title: Clean arithmetic under time pressure
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
Break hard calculations into easy steps you can check, and say each step out loud.

## Why interviewers care
One slip can flip a recommendation. Interviewers watch for a clear, checkable method more than for speed.

## Why it works
Splitting a hard operation into easy ones cuts the number of places you can slip. Saying each step lets the interviewer follow you and catch a slip early. The estimate and the reverse check catch the slips that get through.

## The pattern
1. Estimate first, so you know roughly what the answer should be.
2. Split multiplication into easy parts: 48 × 25 = 48 × 100 ÷ 4 = 1,200.
3. Split division the same way: 3,600 ÷ 45 = 3,600 ÷ 9 ÷ 5 = 400 ÷ 5 = 80.
4. Check with the reverse operation: 80 × 45 = 3,600.
5. Round only when the question allows it.

## Worked example
A store sells 1,250 items a week at $36 each. What is weekly revenue?

Estimate: about 1,000 × $40 = $40,000.

Calculate: 1,250 × 36 = (1,000 × 36) + (250 × 36) = 36,000 + 9,000 = **$45,000**.

Check: $45,000 ÷ 36 = 1,250. And $45,000 is close to the $40,000 estimate, so no zeros went missing.

## Another example
A school fundraiser raised $8,400 from 240 families. What was the average gift?

Estimate: about $8,000 ÷ 250 = $32.

Calculate: 8,400 ÷ 240 = 840 ÷ 24 = **$35** (dividing both by 10 first).

Check: 35 × 240 = 7,000 + 1,400 = 8,400.

## Tricky cases
- **Rounding too early.** Rounding $36 to $40 before multiplying gives $50,000, 11% too high. Round for the estimate, not for the answer.
- **Close to the estimate isn't proof.** 46,000 is near the $40,000 estimate too, and it's wrong. The reverse check catches it: 46,000 ÷ 36 isn't 1,250.

## Common mistakes
- `M.arithmetic_error`: a slip in an operation, often in the last step or when carrying a digit.

## Quick check
What is 1,800 ÷ 24? Show the steps and the check.

**Answer:** 75. 1,800 ÷ 8 = 225, and 225 ÷ 3 = 75. Check: 75 × 24 = 1,500 + 300 = 1,800.
