---
lesson_id: lesson-cl-data_requests
skill_id: CL.data_requests
version: 2
status: in_review
title: Ask for specific data, in order
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: Step 3, the vague-request mistake and a tricky case changed to match the new CL-3 specific-requests rule (Matt, 2026-10-17).
---
## The idea
Break the metric into its **drivers** (the parts that add or multiply up to it), say which you'd start with and why, and ask for specific data.

## Why interviewers care
Asking for "all the data" signals there's no plan. Interviewers reward candidates who know exactly what to request, and in what order.

## Why it works
The breakdown shows every place the cause could be; the starting point and its reason show where you think it most likely is. Specific requests get specific answers back, so each one rules a driver in or out.

## The pattern
1. Break the metric down: profit = price − costs; costs = feed + labor + transport.
2. Start where the problem most likely sits, and say why: the part that changed most, the biggest cost, or the part the client controls.
3. Name a specific measure in every request, and slice your first one: by a **cut** (a split, like by region or by product), a comparison or a time period: "feed cost per liter by month for two years".
4. Keep it to a few requests, grouped by driver.
5. Diagnose before proposing fixes.

## Worked example
A regional dairy's profit per liter of milk fell from 8¢ to 5¢.

"Profit per liter is the price we receive minus feed, labor and transport costs per liter. **I'd start with feed, since it's the biggest cost and feed prices move most.** I'd ask for feed cost per liter by month for the last two years, and the price we receive per liter by buyer over the same period."

Vague: "information on costs". A laundry list: ten requests with no order. Too early: "we should cut staff".

## Another example
A dance school's active students fell 18% this year, while new sign-ups held steady.

"Active students are new sign-ups plus students who stay from last term. **Sign-ups held steady, so I'd start with students who stay.** I'd ask for the share of students who re-enroll each term, by class style, this year against last."

## Tricky cases
- **A list of reports isn't a breakdown.** "Student data, sales by month, survey results" names sources, not the parts that make up the metric.
- **Drivers you name to break the metric down aren't requests.** "Sign-ups plus students who stay" is the breakdown. Only the data you ask to see has to be specific.
- **Only the first request needs a slice.** After "the share who re-enroll, by class style, this year against last", "then the share who switch to another style" is fine: it names a measure. "Then student data" isn't: it names none.

## Common mistakes
- `M.vague_data_request`: a request that names no measure ("information about costs"), or a first request with no cut, comparison or period.
- `M.laundry_list`: many requests with no structure or starting point.
- `M.premature_solution`: proposing fixes ("cut staff") before finding the cause.

## Quick check
An aquarium's ticket revenue fell 10%. Which request is specific enough: (a) "information about visitors"; (b) "tickets sold per day by ticket type, this year against last"?

**Answer:** (b): a measure (tickets sold), a cut (by ticket type) and a comparison (this year against last). (a) names no measure.
