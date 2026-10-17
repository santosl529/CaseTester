---
lesson_id: lesson-qn-sanity_check
skill_id: QN.sanity_check
version: 1
status: live
title: Check the number before you present it
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
Before you present a number, compare it with something you know.

## Why interviewers care
A quick check catches zeros and setup errors, and it shows judgment. Interviewers expect you to notice when a result can't be right, and to trust one that can.

## Why it works
A total is hard to judge, but a per-unit number is something you've seen: a store's daily sales, a household's monthly bill. Comparing against it catches zeros and setup slips, and it confirms a good answer, so you can move on with confidence.

## The pattern
1. Turn the total into a per-unit number: per household, per store, per employee, per day.
2. Compare it with what you'd expect from everyday experience.
3. More than about three times off? Recheck the zeros and the setup.
4. If it is plausible, say why in one line and move on. Don't "fix" a good answer.

## Worked example
You estimate that a 30-store pizza chain earns $900M a year.

Per store: $900M ÷ 30 = $30M a year, about $80,000 a day. A pizza restaurant takes in more like $1–2M a year, so this is about 20 times too high. Recheck.

If the estimate were $45M, that is $1.5M per store, about $4,000 a day: plausible. Say so and continue.

## Another example
You estimate that a city of 1M people has 20,000 gas stations.

Per station: 1M ÷ 20,000 = one station per 50 people. The city has roughly 700K cars; if each fills up once a week, that's about 100K fill-ups a day, only 5 per station. A station does a few hundred a day, so the city needs a few hundred stations, not 20,000. Recheck.

## Tricky cases
- **A big total that's fine per unit.** $40B a year on video games sounds huge, but it's about $300 per US household, $25 a month: plausible. Keep it.
- **Off, but within range.** A result twice your benchmark isn't a reason to change it. Recheck the setup, and change the number only if you find the slip.

## Common mistakes
- `M.implausible_accepted`: presenting a result that a quick per-unit check shows can't be right.
- `M.plausible_rejected`: rejecting or "correcting" a result that is actually reasonable.

## Quick check
You estimate that a town of 40,000 people has 400 pharmacies. Is that plausible?

**Answer:** No: one per 100 people. At about 12 prescriptions per person a year, each would fill about 1,200 a year, under 5 a day. A pharmacy fills far more, so recheck; about 10 is more plausible.
