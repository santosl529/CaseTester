---
lesson_id: lesson-ps-mece
skill_id: PS.mece
version: 1
status: draft
title: Buckets that don't overlap and miss nothing
drafting_model: claude-opus-5-5
reviewed_by:
reviewed_at:
review_notes:
---
## The idea
A good structure is **MECE** (mutually exclusive, collectively exhaustive): its buckets don't overlap, and together they cover everything that could explain the answer.

## Why interviewers care
Overlapping buckets make you analyze the same thing twice and lose the thread. A missing bucket means the real cause can sit outside your framework, and you won't find it. Interviewers check both within seconds of seeing your structure.

## Why it works
A case is a search for the cause. When every likely cause has a clear home, you can rule buckets out one at a time and trust that the answer is in what's left. An overlap means ruling out one bucket half-rules out another; a gap means you can rule out every bucket and still miss the answer.

## The pattern
1. Start from the client's question and the number it hinges on: profit, wait time, market size.
2. Split that number into parts that add or multiply back to it (revenue and costs; arrivals and service speed).
3. Test overlap: for each pair of buckets, ask "would I look at the same data in both?" If yes, merge them or redraw the line.
4. Test gaps: take two or three likely causes and ask "which bucket would find this?" If none would, add one.
5. Keep it to three to five buckets.

## Worked example
A city library's book checkouts fell 20% in two years.

First draft: (1) Visitors; (2) Foot traffic; (3) Digital lending. "Visitors" and "Foot traffic" overlap: both count people coming in. And nothing covers whether people who visit borrow less once inside.

Better: (1) **How many people visit**: by branch and opening hours; (2) **How much visitors borrow**: share who borrow, books per loan; (3) **Borrowing that moved elsewhere**: e-books and audiobooks. Shorter hours, a weaker collection and a switch to e-books each have a clear home. A switch to e-books would also cut visits, but bucket 3 is where you'd measure it.

## Another example
Estimate the yearly UK market for school uniforms.

First draft: (1) Number of pupils; (2) Number of schools; (3) Spend per pupil. Pupils and schools count the same children: an overlap. And nothing covers hand-me-downs, so spend per pupil isn't the price of a new set.

Better: (1) **Pupils who wear a uniform**, by school stage; (2) **New items bought per pupil a year**, net of hand-me-downs; (3) **Price per item**. Pupils × items × price gives the total, with one bucket per driver.

## Tricky cases
- **"Demand" and "Market size" for a new co-working space.** Overlap: both size the pool of people who might rent.
- **Renaming an overlapping bucket but keeping its sub-points.** Still an overlap: "Audience: tickets by screen" next to "Revenue: tickets sold; price" counts tickets twice: change what the bucket examines, not its name.
- **Adding "Members: members per month" to a framework about a 15% fee rise at a yoga studio.** Still a gap: today's members don't say how many would quit at the higher fee. A nearby topic doesn't fill a gap.

## Common mistakes
- `M.overlapping_buckets`: two buckets that send you to the same data, like "Demand" and "Market size".
- `M.missing_bucket`: a likely cause that no bucket would find, like leaving out costs on a profit question.

## Quick check
A taxi company's profit per car fell. A candidate's buckets: (1) Fares per trip; (2) Trips per car per day. Is it MECE?

**Answer:** No, there's a gap: it covers only revenue. Profit is revenue minus costs, so it needs a third bucket for cost per car: fuel, repairs, insurance and driver pay.
