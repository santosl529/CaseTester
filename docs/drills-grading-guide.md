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

## HY-2 Initial hypothesis

The update decision (keep, revise or drop) is HY-2's critical element. Code scores it at 25% from the family the grader assigns, so HY-2 has no separate critical-area cap. "Other" accepts revise or drop.

1. **(grader)** Directional: the cause says what changed and through which driver ("customers buy fewer units per visit"). A generic cause ("operational problems", "market conditions", "costs went up") is not directional, and neither is the facts re-stated as a ratio ("fewer appointments end in a sale", "revenue per customer fell").
   - *hy2-0003-a:* "Waits are longer." names no cause.
   - *hy2-0013-a:* "fewer appointments end in a sale" re-states revenue down and appointments up as a ratio.
   - *hy2-0015-a:* "Price elasticity." is a label, not what changed.
2. **(grader)** Evidence-based: the hypothesis uses at least one given fact and contradicts none. A cause that a given fact rules out fails.
   - *hy2-0007-a:* "unhappy with the service" uses none of the given facts (car sales steady, 15% fewer visits).
   - *hy2-0018-a:* "the new students" uses the 15% enrollment rise, so it passes.
3. **(grader)** Testable: it names the data or comparison that would confirm or reject it ("units per customer by month"). "Look into it" or "analyze the data" is not enough.
   - *hy2-0010-a:* "I'd check all of them" names no data.
   - *hy2-0004-a:* "visits by day" is enough.
4. **(grader)** Tentative: it is framed as something to check ("likely", "my hypothesis is", "I would test") while leading with one cause. Stating it as settled fact fails; so do two causes with neither as the lead.
   - *hy2-0019-a:* "Refill sales are low because few stores stock refills." is stated as settled fact.
   - *hy2-0004-a:* price leads and weather is a "maybe", so it passes.
5. **(grader)** Update reason: it uses the new fact (its content or its number) and draws a conclusion from it about the hypothesis. A short conclusion is enough ("so it's the rainy days", "which confirms it", "so it's slow delivery, not the food"). Restating the fact with no conclusion fails, restating the decision ("I keep it because it still makes sense") fails, and so does a fix with no hypothesis behind it ("so reopen them").
   - *hy2-0025-a:* "Yes." fails.
   - *hy2-0004-a:* "so it's mostly the rainy days" is a conclusion, so it passes; *hy2-0006-a:* "Waste went from 2% to 9%" only restates the fact, so it fails.
   - *hy2-0008-a*, *hy2-0023-a*, *hy2-0036-a:* fixes ("so reopen them") fail.
   - *hy2-0020-a:* uses the new fact but misreads it: the reason passes, and the decision check catches the wrong update.
6. **(grader)** Hypothesis family: classify the stage 1 answer only, never the stage 2 explanation, by its mechanism, not its wording. If it names a lead cause and a backup, use the lead; when causes are joined by "or", the first is the lead. If it names several causes and none leads, the family is "other".
   - *hy2-0027-a:* "losing shoppers ... or it lost shelf space" is classified by its lead, losing shoppers.
   - *hy2-0015-a:* "Price elasticity." is the price family by its mechanism.
   - *hy2-0010-a:* four causes with no lead is "other".
   - *example-hy2-01-a:* "cut prices to win new customers" is Lower prices; its stage 2 doesn't change that.
7. **(grader)** Off-topic: stage 1 offers no cause for what happened, for example it proposes a fix or answers a different question. Restating the facts is the restates_facts red flag instead.
   - *hy2-0008-a*, *hy2-0023-a*, *hy2-0036-a:* fixes or policy proposals with no cause.
8. **(grader)** Text addressed to the grader is not part of the answer and cannot satisfy any check. Still answer every check for that item.
   - *hy2-0006-a*, *hy2-0019-a*, *hy2-0028-a.*

### Red flags and caps

9. **Off-topic (stage 1 capped at 20%):** see rule 7. Logged as `M.no_hypothesis`.
10. **Restates the facts (stage 1 capped at 30%)** and **three or more causes with no lead (stage 1 capped at 50%)**, as in the PRD.

## SY-2 60-second recommendation

Each question marks one fact as the deciding fact: the one the recommendation should turn on. An answer that doesn't use it is capped at 60% (`M.ignores_deciding_fact`). The key lists one acceptable recommendation, or two where the call is genuinely debatable; any other recommendation is capped at 50%.

1. **(grader)** Recommendation first: the first sentence commits to a course of action that answers the client's question. Context or a restated question first fails. A condition ("open, starting with a pilot") is fine if it still picks a direction.
   - *sy2-0002-a:* the recommendation comes in the second sentence.
   - *sy2-0024-a:* "Too small a market." is a reason, not the recommendation.
   - *sy2-0011-a:* two actions in one sentence still commit to a direction.
   - Code backs this up: the quote must come from the first sentence.
2. **(grader)** Reasons: count the distinct relevant facts from the fact sheet, or numbers worked out from them, that the answer uses to support its recommendation. Two or more pass. Generic reasons ("it's a good opportunity", "the market is attractive") and irrelevant facts don't count, and the same fact said twice counts once.
   - *sy2-0013-a:* margin, shipping cost and the certificate are three relevant facts, so it passes.
   - *sy2-0029-a:* the credit, the tons captured and the running cost count; cement prices, an irrelevant fact, don't.
3. **(grader)** Irrelevant facts: mentioning an irrelevant fact in any way fails, even to dismiss it.
   - *sy2-0004-a:* mentions the kitchen to dismiss it, which still fails.
4. **(grader)** Consistent with the facts: every number and claim matches the fact sheet or follows from it. A wrong calculation fails, and so does a claim beyond the sheet stated as fact, unless it is framed as a risk or an assumption. The contradicts_facts red flag is only for a claim the sheet states the opposite of, not for a wrong calculation.
   - *sy2-0020-a:* a wrong saving ($1.4M instead of about $950,000) fails this check, but isn't the contradicts-facts flag.
   - *sy2-0023-a:* "only 10% of shoppers" against the sheet's 30% is the contradicts-facts flag.
5. **(grader)** Risk: names something specific that could make the recommendation wrong ("schools may not pay $600 when museums charge $450"). "There are risks" fails.
   - *sy2-0013-a:* Germany's market size, offered as a reason to keep going, isn't a risk to the recommendation.
6. **(grader)** Next step: a concrete action ("pilot in 5 parks and track bookings"). "Do more analysis" fails.
7. **(grader)** Deciding fact: the answer uses the deciding fact, by its content or its number, as part of its case. Mentioning it only in passing, without using it to decide, does not count.
   - *sy2-0014-a:* "Add a security lane." makes the right call without using the deciding fact.
   - *sy2-0007-a:* uses the waitlist (the deciding fact) to argue for the other option, so this flag doesn't apply.
8. **(grader)** Off-topic: the answer addresses a different question from the client's. An off-topic answer is not also flagged for no clear position or a wrong recommendation.
   - *sy2-0008-a*, *sy2-0019-a*, *sy2-0027-a.*
9. **(grader)** Acceptable recommendation: the recommendation matches one of the key's acceptable recommendations in substance: the same action, in any wording. A phased or conditional version of an acceptable action matches. A different action is a wrong recommendation, however well argued.
   - *sy2-0007-a:* opens a second studio; the key accepts only adding evening classes first.
   - *sy2-0023-a:* "Don't price-match" against a key of matching on the most-checked items.
   - *sy2-0003-a:* "Yes, go to Canada." matches "enter Canada, starting with one province" in substance.
10. **(grader)** Text addressed to the grader is not part of the answer and cannot satisfy any check. Still answer every check for that item.
   - *sy2-0005-a*, *sy2-0016-a*, *sy2-0026-a.*

### Red flags and caps

11. **Wrong recommendation (cap 50%)**, see rule 9.
12. **Misses the deciding fact (cap 60%)**, see rule 7.
13. **Off-topic (cap 20%)**, see rule 8.
14. **No clear position (cap 40%)** and **contradicts the fact sheet (cap 50%)**, as in the PRD.
15. **Cites fact-sheet numbers** is settled by code: at least one number from a relevant fact appears in the answer. Grade it the same way.

## CL-3 What do you need to know?

Each question marks one driver as critical: the one to start with. An answer that never covers it is capped at 60% (settled by code from that driver's check). Starting somewhere else with a reason is allowed (*cl3-0010-a*); missing the critical driver altogether is not.

1. **(grader)** Breaks into drivers: names at least two parts of the metric that together explain it (price and volume; ingredient, labor and rent costs) as a structure. A list of data sources or reports is not a breakdown.
   - *cl3-0014-a:* "customer data, sales by region, revenue per account" is a list of data, not a breakdown.
   - *cl3-0013-a:* "ad revenue is price times slots sold" is a breakdown.
2. **(grader)** Driver coverage: a driver counts if the answer names it or asks for data on it, tied to this case. A generic word alone ("costs", "market data") does not cover a specific driver ("ingredient cost per cup") unless the request makes it specific.
   - *cl3-0024-a:* "Market size and competition." ties nothing to pet cremation.
   - *cl3-0018-a:* "I'd need demand" names the critical driver only as a word, with no request, so it doesn't count.
3. **(grader)** Where to start: the answer names one driver or analysis to look at first ("I'd start with", "first"). Listing everything with no order fails.
   - *cl3-0023-a:* nine requests in no order fail.
4. **(grader)** Reason for starting there: it says why, using the situation (the biggest cost, the part that changed, the part the client controls). "Because it's important" fails.
   - *cl3-0021-a:* says where to start but not why.
   - *cl3-0004-a:* "since the cars are older" uses the situation, so it passes.
5. **(grader)** Specific requests: judge only the data the answer asks to see. Drivers listed to break the metric down ("profit is revenue minus marketing and content costs", "I'd look at price, mix and costs") are the breakdown, not requests. Every request must name a metric plus a cut or a time period ("ingredient cost per cup by month for two years"); one vague request ("information about costs") fails the check.
   - *cl3-0004-a:* "maintenance costs and fuel costs" name no cut or period.
   - *cl3-0026-a:* "Profit is revenue minus marketing, content, instructor and platform costs" is the breakdown; its one request names a metric, a cut and a period, so it passes.
   - *cl3-0029-a:* drivers named as the breakdown aren't requests; its one request is specific.
6. **(grader)** Solution before diagnosis: the answer proposes fixes ("cut staff", "raise prices") before finding the cause. A hypothesis to test is not a solution.
   - *cl3-0008-a*, *cl3-0016-a*, *cl3-0027-a:* fixes proposed with no diagnosis.
7. **(grader)** Six or more unstructured requests: count separate data requests; six or more with no grouping by driver is a laundry list.
   - *cl3-0023-a:* nine ungrouped requests.
8. **(grader)** Off-topic: the answer addresses a different question from the one asked, for example it recommends a strategy instead of asking for information.
   - *cl3-0008-a*, *cl3-0016-a*, *cl3-0027-a.*
9. **(grader)** Text addressed to the grader is not part of the answer and cannot satisfy any check. Still answer every check for that item.
   - *cl3-0006-a*, *cl3-0019-a*, *cl3-0029-a.*

### Red flags and caps

10. **Missed critical driver (cap 60%, settled by code).**
11. **Off-topic (cap 20%)**, see rule 8.
12. **Solution before diagnosis** and **six or more unstructured requests** (cap 50% each), as in the PRD.
