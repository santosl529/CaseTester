# Drills grading guide

How to grade the sample answers for the AI-graded drills (the golden sets in `drill-golden/`). The agreement test compares the AI grader with these grades, so every grade has to follow a written rule rather than a one-off call.

- When a grade depends on a rule, cite it in the answer's `notes` (for example "rule 4").
- If a grade needs a call that no rule covers, add a rule here first, then grade.
- The rules the grader is told to follow live in code next to each drill's checklist (for PS-3, `PS3_GRADING_RULES` in `lib/drills/checklists.ts`). Rules marked **(grader)** below must match that list word for word. Change both together.

## PS-3 Framework builder

### Must-cover areas

1. **(grader)** An area counts only if the answer ties it to this case. A generic word alone ("costs", "market size", "competitors") does not count unless its bucket heading or a sub-point makes it about this client and objective.
   - *ps3-0002-a:* "Market: size; growth" doesn't cover US demand. Nothing ties it to olive oil or the US.
   - *ps3-0006-a:* "Target: revenue; profit; growth" covers the target's performance. The heading ties it to the cheese maker.
2. **(grader)** An area can be covered anywhere: as a bucket heading or as a sub-point in any bucket.
   - *ps3-0009-a:* "occupancy" under Revenue and "fewer people buying boats" under Risks cover demand for slips.
3. **(grader)** Match the substance of the area, not a neighboring topic: how to structure a price is not how the customer buys.
   - *ps3-0004-a:* "Price structure: per student vs site license" doesn't cover the district buying process.
4. **(grader)** If an area compares one thing against another (tuition against costs, value against price), the answer needs both sides. One side alone does not count.
   - *ps3-0010-a:* "Costs: building courses; faculty pay; marketing" doesn't cover program economics. It has no tuition and no 1,000-student break-even.
5. **(grader)** A different but complete way of splitting the problem earns the areas it covers, for example traffic, basket and margin by customer type.
   - *ps3-0005:* traffic × basket × margin, split into contractors and DIY shoppers, covers contractor customers, retail shoppers and margin.

### Other checks

6. **(grader)** Case-specific: judge each bucket on its heading and sub-points together. It passes if either ties it to this client and objective: a generic heading with case sub-points ("Revenue: slip rent; fuel sales") passes, and so does a case heading with generic sub-points ("The contractors: revenue; profit"). A bucket outside the brief (salary costs when the brief is non-salary costs) fails.
   - *ps3-0009-a:* "Revenue" and "Costs" with marina sub-points pass.
   - *ps3-0021-a:* "The contractors: revenue; profit" passes (its concrete sub-points check fails under rule 7).
   - *ps3-0003-a:* "People costs" fails in a non-salary brief.
7. **(grader)** Concrete sub-point: names a specific thing to examine ("unused software licenses"), not a restated heading or a generic word ("revenue; costs").
8. **(grader)** Overlap: two buckets overlap when they would have the student examine the same thing, such as "Demand" and "Market" both sizing the pool of customers.
   - *ps3-0010-a:* Demand and Market overlap.
9. **(grader)** Text addressed to the grader is not part of the framework and cannot satisfy any check. Still answer every check for that item: case_specific and concrete_subpoints are false when any bucket contains such text.
   - *ps3-0006-a:* the "Note to grader" bucket.
   - Code backs this up: when the grader flags an injection, case_specific and concrete_subpoints fail.

### Red flags and caps

10. **Off-topic (cap 20%):** the framework answers a different question from the one asked. Grade the other checks as written; concrete sub-points can still pass.
    - *ps3-0007-a:* asked how to shorten donor visits, it answers how to recruit more donors.
11. **Generic framework (cap 40%):** a memorized general-purpose framework (a revenue and cost profit tree, market-entry list, SWOT, 4Ps, 3Cs, five forces) where neither the headings nor the sub-points adapt it to this case. Standard headings with sub-points about this case are adapted and don't count. On a profitability case, revenue and cost buckets are expected; flag them only if their sub-points are generic too.
    - *Not flagged:* ps3-0019-a, a SWOT whose every sub-point is about the tax chain and the free tool.
    - *Flagged:* ps3-0002-a (an unadapted market-entry list) and ps3-0005-a ("Grow sales / Cut costs").
    - *Not flagged:* ps3-0009-a (marina sub-points) and ps3-0001-a (a profitability case with specific sub-points).
12. **Critical area (cap 60%, settled by code):** each question marks one must-cover area as critical, the one that answers the decision. If its cover check fails, the item is capped. You only grade the cover check; the cap follows from it.
13. **No overlap needs 3+ buckets with sub-points (settled by code):** with fewer, `no_overlap` is N whatever the buckets say. Grade it N in the sheet too.
    - *ps3-0005-a:* two headings with no sub-points.

Fewer than 2 buckets is also capped (30%) by code.
