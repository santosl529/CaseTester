---
lesson_id: lesson-qn-sizing_structure
skill_id: QN.sizing_structure
version: 1
status: live
title: Build the estimate as a chain of drivers
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
An estimate is a chain of **drivers** (the factors you multiply) that multiply to the answer, with each thing counted once.

## Why interviewers care
In a **market sizing** question (estimating how big something is, like yearly spending on a product), interviewers care more about your chain than your final number. A missing driver or a double count makes the estimate wrong, however good the assumptions are.

## Why it works
Each driver is one step from a population to the answer, and multiplying works only if each step is counted once. A clean chain lets the interviewer test one assumption at a time, and lets you fix one number without redoing the rest.

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

## Another example
Yearly US spending on guitar strings.

Chain: US adults (about 260M) × share who play guitar regularly (about 5%) × string sets per player per year (about 4) × price per set (about $8).

260M × 0.05 = 13M players; × 4 = 52M sets; × $8 = **about $400M**.

## Tricky cases
- **Drivers in different units.** If sets are counted per player, adding "guitars per player" counts guitars twice. Pick one unit, player or guitar, and keep every driver in it.
- **True but not a factor.** "Average income" may affect who plays, but it isn't a step you multiply by. Put its effect into the share who play.
- **Skipping the share who buy.** Going from adults straight to sets assumes every adult plays.

## Common mistakes
- `M.missing_driver`: a chain that skips a step, like going from households straight to spending without the share who buy.
- `M.double_counting`: two drivers that count the same thing, like "households with a dog" and "number of dogs".
- `M.irrelevant_driver`: a driver that doesn't belong in the multiplication, like the number of stores that sell it.

## Quick check
Sizing yearly US spending on aquarium fish food, a candidate multiplies: households × share with a fish tank × tubs of food per tank per year × price per tub × number of pet stores. Which driver doesn't belong?

**Answer:** Number of pet stores: it doesn't change how much food the fish eat. Leave it out.
