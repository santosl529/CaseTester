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
A good structure splits the problem into buckets that don't overlap and that, together, cover everything that could explain the answer.

## Why interviewers care
Overlapping buckets make you analyze the same thing twice and lose the thread. A missing bucket means the real cause can sit outside your framework, and you won't find it. Interviewers check both within seconds of seeing your structure.

## The pattern
1. Start from the client's question and the number it hinges on: profit, wait time, market size.
2. Split that number into parts that add or multiply back to it (revenue and costs; arrivals and service speed).
3. Test overlap: for each pair of buckets, ask "would I look at the same data in both?" If yes, merge them or redraw the line.
4. Test gaps: take two or three likely causes and ask "which bucket would find this?" If none would, add one.
5. Keep it to three to five buckets.

## Worked example
A city library's book checkouts fell 20% in two years.

First draft: (1) Visitors; (2) Foot traffic; (3) Digital lending. "Visitors" and "Foot traffic" overlap: both count people coming in. And nothing covers whether people who visit borrow less once inside.

Better: (1) **How many people visit**: by branch and opening hours; (2) **How much visitors borrow**: share who borrow, books per loan; (3) **Borrowing that moved elsewhere**: e-books and audiobooks. Shorter hours, a weaker collection and a switch to e-books each land in exactly one bucket.

## Common mistakes
- `M.overlapping_buckets`: two buckets that send you to the same data, like "Demand" and "Market size".
- `M.missing_bucket`: a likely cause that no bucket would find, like leaving out costs on a profit question.
