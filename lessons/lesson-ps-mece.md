---
lesson_id: lesson-ps-mece
skill_id: PS.mece
version: 1
status: live
title: Buckets that don't overlap and miss nothing
drafting_model: claude-opus-5-5
reviewed_by: Matthew Santos
reviewed_at: 2026-10-17
review_notes: 
---
## The idea
A good structure is **MECE** (mutually exclusive, collectively exhaustive): its buckets don't overlap, and together they cover everything that could explain the answer.

## Why interviewers care
Overlapping buckets make you analyze the same thing twice. A missing bucket means the real cause can sit outside your framework, and you won't find it. Interviewers spot both within seconds.

## Why it works
A case is a search for the cause. When every likely cause has a clear home, you can rule buckets out one at a time and trust what's left. An overlap means ruling out one bucket half-rules out another; a gap means you can rule out every bucket and still miss the answer.

## The pattern
1. Start from the client's question and the number it hinges on: profit, wait time, market size.
2. Split that number into parts that add or multiply back to it (revenue and costs; arrivals and service speed).
3. Test overlap: for each pair of buckets, ask "would I look at the same data in both?" If yes, merge them or redraw the line.
4. Test gaps: take two or three likely causes and ask "which bucket would find this?" If none would, add one.
5. Keep it to three to five buckets.

## Worked example
A city library's book checkouts fell 20% in two years.

First draft: (1) Visitors; (2) Foot traffic; (3) Digital lending. "Visitors" and "Foot traffic" overlap: both count people coming in. Nothing covers whether visitors borrow less once inside.

Better: (1) **How many people visit**: by branch and opening hours; (2) **How much visitors borrow**: share who borrow, books per loan; (3) **Borrowing that moved elsewhere**: e-books and audiobooks. Shorter hours, a weaker collection and a switch to e-books each have a clear home. A switch to e-books would also cut visits, but bucket 3 is where you'd measure it.

## Another example
A chicken restaurant's drive-through wait at lunch rose from 3 minutes to 6.

First draft: (1) Cars arriving; (2) The lunch rush; (3) Kitchen speed. "Cars arriving" and "The lunch rush" overlap: both count cars. Nothing covers the speaker and the pay window, where cars wait to order and pay even when the kitchen is fast.

Better: (1) **Arrivals**: cars per 15 minutes at lunch; (2) **Ordering and paying**: time at the speaker and the pay window; (3) **Waiting for food**: kitchen time per order; orders remade. Every minute of the wait sits in one step.

## Tricky cases
- **"Demand" and "Market size" for a new co-working space.** Overlap: both size the pool of people who might rent.
- **Renaming an overlapping bucket but keeping its sub-points.** Still an overlap. "Audience: tickets by screen" next to "Revenue: tickets sold; price" counts tickets twice, so change what the bucket examines, not its name.
- **Adding "Members: members per month" to a framework about a 15% fee rise at a yoga studio.** Still a gap: today's members don't say how many would quit at the higher fee. A nearby topic doesn't fill a gap.

## Common mistakes
- `M.overlapping_buckets`: two buckets that send you to the same data, like "Demand" and "Market size".
- `M.missing_bucket`: a likely cause that no bucket would find, like leaving out costs on a profit question.

## Quick check
A taxi company's profit per car fell. A candidate's buckets: (1) Fares per trip; (2) Trips per car per day. Is it MECE?

**Answer:** No, there's a gap: it covers only revenue. Profit is revenue minus costs, so it needs a third bucket for cost per car: fuel, repairs, insurance and driver pay.
