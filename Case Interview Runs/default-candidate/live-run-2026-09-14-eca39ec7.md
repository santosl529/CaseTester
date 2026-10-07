# Live run — Brew & Bean Profitability

- Session: `eca39ec7-e853-42e6-99b2-846171e6874e` · case `prof-001` · status **completed** · 2026-09-14
- Overall: **meets_bar**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn)

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `stores_count`, `revenue_per_store`
- Force-released before the recommendation ask: `[{"phase":"ANALYSIS","itemIds":["stores_count","revenue_per_store"],"trigger":"time_warning"}]`
- Scoring QA: `{"artifactTypes":[],"gapClaimDrops":2,"verifierDrops":0,"evidenceStrips":0,"dataRequestGaps":2,"reconcileMerges":2,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":1,"crossDimensionRepeats":1,"dataRequestsNotInCase":0}`
- Assists / interventions: load_shed@5

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | cogs_pct, labor_pct, overhead_pct | Cost structure as a percent of revenue two years ago versus today | no |
| 3 | release | cogs_pct, labor_pct, overhead_pct | Cost as a percent of revenue breakdown (COGS, labor, overhead) comparing current to two years ago | yes |
| 3 | none | stores_count | Store count to assess whether revenue growth came from new store openings versus same-store growth | no |
| 3 | none | revenue_per_store | Same-store revenue or revenue per store to separate expansion impact from underlying unit economics | no |
| 5 | refuse | bean_share_of_cogs, non_bean_input_change | COGS broken into components: coffee beans, dairy, cups and packaging, food items for both current and prior periods | no |

## LLM usage

| Component | Calls | Input tokens | Output tokens |
|---|---|---|---|
| interviewer | 4 | 28254 | 374 |
| data_request | 4 | 3605 | 387 |
| coverage | 3 | 2907 | 558 |
| judge | 1 | 9001 | 3921 |
| verifier | 1 | 2961 | 558 |
| reconcile | 1 | 2578 | 1184 |

## Feedback

**Top improvement:** When sizing 'the problem,' size the margin compression itself — the 16-point COGS swing on current revenue (~$77M) — rather than the raw COGS dollar increase (~$103M), which blends in normal revenue growth and manufactures a misleading gap.

### Problem Structuring — strong
- ✅ Restated the objective before structuring and led with a clear hypothesis that this is a cost problem while flagging the need to verify the revenue side.
  > Let me make sure I have the objective right: revenue is up 15% over two years, but net margin fell from 24% to 6% — so we want to find the driver of the margin decline and fix it.
  > Since revenue grew, my instinct is that this is mostly a cost problem, but I don't want to assume that — revenue could be growing through discounting or new low-margin stores, so I'd still check the revenue side.
- ✅ Offered three tailored, largely non-overlapping buckets with relevant sub-points fit to a coffee chain.
  > First, revenue quality: is growth coming from price, ticket size, volume, or new store openings?
  > Second, costs: split into COGS — coffee beans, milk, cups — versus operating costs like labor, rent, utilities, and then corporate overhead.
- ✅ Prioritized explicitly with arithmetic reasoning when asked, and named the immature-store confound to separate expansion from true cost inflation.
  > I'd start with the cost bucket, and specifically cost as a percent of revenue rather than absolute dollars.
  > So I'd want store count and same-store revenue alongside the cost breakdown to separate those two stories.

### Quantitative & Analytical Rigor — meets_bar
- ⚠️ Cleanly decomposed the margin swing into cost-line contributions and correctly isolated COGS, but sized 'the problem' with the wrong quantity — the $103M COGS dollar increase (which reflects revenue growth) rather than the 16-point margin compression on current revenue (~$76.8M).
  > So COGS dollars rose about $103M, roughly 59%, against 15% revenue growth. That gap is the whole story.
  > Revenue today is 200 × $2.4M = $480M
  > Two years ago: 42 + 22 + 12 = 76% of revenue in costs, leaving 24% margin. Today: 58 + 22 + 14 = 94%, leaving 6%. So the 18-point decline breaks into 16 points from COGS and 2 points from overhead.
- ⚠️ Conflated the ~59% COGS dollar growth with a cost-per-unit or price signal and used it to assert prices lagged, when that figure blends volume growth and unit-cost growth.
  > revenue grew 15% while input costs grew ~59%, so prices almost certainly haven't kept pace with costs
- 💡 At turn 7 the candidate computed the $103M raw COGS increase and called it 'the whole story' instead of sizing the margin compression itself.
  > Better: The problem worth sizing is the 16 points of margin compression on today's ~$480M revenue — about $77M of lost profit a year. The raw COGS dollar increase includes normal growth from the 15% revenue rise, so it overstates the margin issue; the clean number is the 16-point compression.

### Data & Exhibit Interpretation — strong
_Coverage caveat: The candidate asked for the COGS component breakdown (beans/dairy/packaging/food) at turn 5 and it was never provided, so the deeper extraction (that beans explain only ~a quarter of the COGS rise) was foreclosed by the interviewer, not by the candidate._
- ✅ Read the cost table systematically, tied each line back to the margin bridge, and named COGS as the specific driver rather than saying 'costs went up.'
  > So COGS is roughly 90% of the problem — that's where I'd spend the rest of my time.
  > Labor is flat and isn't the story.
- ✅ Extracted a non-obvious second-order insight — flat labor despite 15% growth argues against the immature-store theory — and stated its so-what.
  > labor holding flat at 22% while revenue grew 15% is actually a mild positive, and it makes me less worried about the immature-store theory I raised.
  > The fact that only COGS moved suggests something specific to cost of goods rather than a broad volume problem.
- ✅ Proposed a concrete next step by requesting the COGS component breakdown to isolate the driver within COGS.
  > Can I get COGS broken into its components — coffee beans, dairy, cups and packaging, food items — for both periods?

### Business Judgment & Insight — meets_bar
_Coverage caveat: The candidate requested the COGS component breakdown at turn 5 and it was withheld, so his inability to weight beans vs. other inputs precisely rests on data the interviewer never provided._
- ✅ Proactively surfaced the key structural confound (new-store dilution) and then updated his view when the data argued against it.
  > If they grew 15% by opening new stores that aren't mature yet, those stores carry full rent and labor but lower volume, and that would show up as cost-percent deterioration even though the real cause is expansion.
- ✅ Named a genuine risk that changes the recommended fix — a price-driven vs. volume/spoilage-driven cost rise.
  > Risk: if the increase is volume-driven rather than price-driven, hedging won't help and it's a waste or spoilage issue instead.

### Creativity & Brainstorming — meets_bar
_Coverage caveat: The interviewer never ran a dedicated brainstorm and load-shed later stages for time, so this rating reflects limited secondary evidence from the recommendation, not a candidate failing._
- ✅ Generated a small, structured set of distinct input-cost levers under time pressure.
  > look at forward contracts or hedging, supplier renegotiation, and origin diversification

### Synthesis & Recommendation — meets_bar
- ✅ Correctly used the 200-stores-flat fact to rule out footprint dilution and pin the growth as same-store.
  > 200 stores flat, so all 15% of growth is same-store — the footprint isn't diluting anything.
- ⚠️ Led answer-first with a committed, evidence-tied conclusion, two actions, a risk, and a next step in a compact package, but built that closing argument on the $103M raw COGS increase as 'the whole story' rather than the 16-point margin compression, weakening the quantitative backbone of the synthesis.
  > So COGS dollars rose about $103M, roughly 59%, against 15% revenue growth. That gap is the whole story.
  > Bottom line: the profit decline is essentially entirely a cost-of-goods problem, and I'd focus the CEO on input costs and pricing, not on growth or labor.
  > Next step: itemize COGS and separate bean price per pound from pounds consumed.
- 💡 Closing recommendation quantified the problem via the wrong figure just before the interviewer's flag.
  > Better: The margin problem is worth about $77M a year — the 16-point COGS compression on today's ~$480M revenue — and the fix is pricing plus broad procurement, since prices haven't moved with input costs.

### Communication & Delivery — strong
- ✅ Consistently top-down and signposted, opening with the objective and numbering buckets and actions.
  > I'd structure it in three buckets:
  > Two actions: first, address input cost... Second, pricing
- ✅ Used hypothesis-driven language and narrated his reasoning before conclusions.
  > Since revenue grew, my instinct is that this is mostly a cost problem, but I don't want to assume that
  > That lines up cleanly.

### Pushback, Composure & Case Leadership — meets_bar
- ✅ Responded crisply to the prioritization challenge with explicit arithmetic reasoning rather than deflecting.
  > I'd start with the cost bucket, and specifically cost as a percent of revenue rather than absolute dollars.
  > The reason is the arithmetic. Revenue grew 15%, so if costs had stayed flat as a share of revenue, margin would have held at 24%.
- ✅ Adapted smoothly when the interviewer signaled time pressure and pivoted directly to a bottom-line answer.
  > Bottom line: the profit decline is essentially entirely a cost-of-goods problem
- ⚠️ The interviewer's final substantive flag on the $103M vs. margin-compression quantity landed at the close with no chance for the candidate to incorporate it — but the underlying framing error was one a stronger candidate would have avoided proactively.
  > So COGS dollars rose about $103M, roughly 59%, against 15% revenue growth. That gap is the whole story.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a moment, then walk me through how you'd approach this.

**Candidate · 1:30** (turn 1)

Let me make sure I have the objective right: revenue is up 15% over two years, but net margin fell from 24% to 6% — so we want to find the driver of the margin decline and fix it.

Since revenue grew, my instinct is that this is mostly a cost problem, but I don't want to assume that — revenue could be growing through discounting or new low-margin stores, so I'd still check the revenue side.

I'd structure it in three buckets:

First, revenue quality: is growth coming from price, ticket size, volume, or new store openings? If they opened a lot of new stores, immature stores could be dragging margin.

Second, costs: split into COGS — coffee beans, milk, cups — versus operating costs like labor, rent, utilities, and then corporate overhead. I'd want to see which line grew fastest as a percent of revenue.

Third, external factors: commodity prices, wage inflation, competition.

To start, could I get the cost structure as a percent of revenue two years ago versus today?

**Interviewer · 1:32** (turn 2)

Understood. Before the data — which of those three buckets do you prioritize, and why?

**Candidate · 3:03** (turn 3)

I'd start with the cost bucket, and specifically cost as a percent of revenue rather than absolute dollars.

The reason is the arithmetic. Revenue grew 15%, so if costs had stayed flat as a share of revenue, margin would have held at 24%. Instead it dropped 18 points. That's a very large swing, and an 18-point margin loss on a business that's still growing points to costs rising faster than revenue rather than a demand problem.

Within costs, I'd look first at the biggest lines — for a coffee chain I'd expect COGS, labor, and rent to be the three heaviest, so a few points of movement there explains more than anything in overhead.

The one thing I'd flag is that the revenue bucket could be hiding inside this. If they grew 15% by opening new stores that aren't mature yet, those stores carry full rent and labor but lower volume, and that would show up as cost-percent deterioration even though the real cause is expansion. So I'd want store count and same-store revenue alongside the cost breakdown to separate those two stories.

**Interviewer · 3:06** (turn 4)

Here's the cost structure as a percent of revenue, current versus two years ago. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%.

**Candidate · 4:36** (turn 5)

That lines up cleanly. Two years ago: 42 + 22 + 12 = 76% of revenue in costs, leaving 24% margin. Today: 58 + 22 + 14 = 94%, leaving 6%. So the 18-point decline breaks into 16 points from COGS and 2 points from overhead. Labor is flat and isn't the story.

So COGS is roughly 90% of the problem — that's where I'd spend the rest of my time.

Also worth noting: labor holding flat at 22% while revenue grew 15% is actually a mild positive, and it makes me less worried about the immature-store theory I raised. New stores with weak volume would usually show labor deleveraging too, since you staff a store regardless of traffic. The fact that only COGS moved suggests something specific to cost of goods rather than a broad volume problem.

Can I get COGS broken into its components — coffee beans, dairy, cups and packaging, food items — for both periods?

**Interviewer · 4:40** (turn 6)

I don't have the itemized COGS breakdown. But I can speak to bean costs. What specifically do you want on beans? Before we wrap, on what you asked about earlier: 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. Average revenue per store is $2.4M a year. We're near time. What's your bottom-line recommendation to the CEO?

**Candidate · 6:10** (turn 7)

Bottom line: the profit decline is essentially entirely a cost-of-goods problem, and I'd focus the CEO on input costs and pricing, not on growth or labor.

Supporting math: 200 stores flat, so all 15% of growth is same-store — the footprint isn't diluting anything. Revenue today is 200 × $2.4M = $480M, so COGS is 58% × $480M ≈ $278M. Two years ago revenue was roughly $480M ÷ 1.15 ≈ $417M, and COGS at 42% ≈ $175M. So COGS dollars rose about $103M, roughly 59%, against 15% revenue growth. That gap is the whole story.

Two actions: first, address input cost — if beans are the driver, look at forward contracts or hedging, supplier renegotiation, and origin diversification. Second, pricing — revenue grew 15% while input costs grew ~59%, so prices almost certainly haven't kept pace with costs, and specialty coffee should have room to pass some through.

Risk: if the increase is volume-driven rather than price-driven, hedging won't help and it's a waste or spoilage issue instead.

Next step: itemize COGS and separate bean price per pound from pounds consumed. That distinguishes a market-price problem from an operational one, and the fix is different in each case.

**Interviewer · 6:14** (turn 8)

One flag before we close. The COGS dollar increase you computed includes normal growth — the margin problem is the 16-point compression, a different quantity than the $103M.

That's where we're out of time. Thank you for working through this — you'll get a full written report with detailed feedback. Nice work today.
