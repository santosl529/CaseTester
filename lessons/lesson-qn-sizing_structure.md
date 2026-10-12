---
lesson_id: lesson-qn-sizing_structure
skill_id: QN.sizing_structure
version: 1
status: draft
title: Build the estimate as a chain of drivers
drafting_model: claude-opus-5-5
reviewed_by:
reviewed_at:
review_notes:
---
## The idea
An estimate is a chain of drivers that multiply to the answer, with each thing counted once.

## Why interviewers care
Interviewers care more about your chain than your final number. A missing driver or a double count makes the estimate wrong, however good the assumptions are.

## The pattern
1. Start from a population you can estimate: people, households, businesses.
2. Narrow to who buys: the share who use it.
3. Multiply by how often and how much: purchases a year, price.
4. Check that each driver adds something new; no two drivers should count the same thing.
5. Leave out drivers that don't change the total.

## Worked example
Yearly US spending on bike tune-ups.

Chain: US households (about 130M) × share with an adult bike that gets ridden (about 30%) × tune-ups per bike-owning household per year (about 0.5) × price per tune-up (about $80).

130M × 0.3 = 39M; × 0.5 = 19.5M tune-ups; × $80 = **about $1.6B**.

Double count: adding "number of bikes" next to "households with a bike". Driver that doesn't belong: "number of bike shops". It doesn't change how many tune-ups people buy.

## Common mistakes
- `M.missing_driver`: a chain that skips a step, like going from households straight to spending without the share who buy.
- `M.double_counting`: two drivers that count the same thing, like "households with a dog" and "number of dogs".
- `M.irrelevant_driver`: a driver that doesn't belong in the multiplication, like the number of stores that sell it.
