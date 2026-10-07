# Live run — Brew & Bean Profitability

- Session: `3e70cfbe-e1be-4b31-b290-d0bd7cdad49b` · case `prof-001` · status **completed** · 2026-10-03
- Overall: **meets_bar**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **21. Lena — the Deferral Tester**
- Tests: The v3.4 non-response catch and deferral tracking directly: an explicit 'hold that' must be tracked and resolved before CLOSE, and if the data is never released, the resulting unverified assumption must attach a data-coverage caveat rather than a judgment ding.
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `menu_price_change`, `bean_share_of_cogs`, `bean_price_change`, `non_bean_input_change`, `revenue_per_store`, `stores_count`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":1,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":6,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":1,"crossDimensionRepeats":2,"dataRequestsNotInCase":2,"interviewerErrorMarks":0}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | menu_price_change | Menu price history over the two years | no |
| 1 | defer | cogs_pct, labor_pct, overhead_pct | Cost breakdown as a percent of revenue for both years | no |
| 3 | none | revenue_per_store | Confirmation of same-store revenue trend to understand if 15% total revenue growth is driven by new stores or organic growth | no |
| 5 | release | bean_share_of_cogs, non_bean_input_change | COGS breakdown into components (green coffee beans, dairy, cups and packaging, food items) as percent of revenue for both years | yes |
| 5 | refuse | — | Unit volumes and waste/spoilage rates changes over time | no |
| 9 | refuse | — | Spoilage or waste data | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| assumption_guard | 6 | 0 | 1 | — |
| conduct | 7 | 0 | 0 | — |
| conduct_model | 7 | 0 | 0 | — |
| copied_check_in | 7 | 0 | 0 | — |
| data_promise | 7 | 0 | 0 | — |
| end_gate | 6 | 1 | 0 | 13 |
| exhibit_promise | 7 | 0 | 0 | — |
| fabricated_turn | 7 | 0 | 0 | — |
| final_message_release | 1 | 0 | 0 | — |
| forced_release | 1 | 0 | 6 | — |
| grace_ask | 7 | 0 | 0 | — |
| meta_leak | 7 | 0 | 0 | — |
| probe_guard | 7 | 0 | 0 | — |
| provenance | 7 | 0 | 0 | — |
| recompute | 7 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 7 | — |
| same_turn_resolution | 3 | 2 | 2 | 1, 9 |
| spoken_close | 7 | 0 | 0 | — |
| stale_release | 5 | 0 | 0 | — |
| stall | 7 | 0 | 0 | — |
| style | 7 | 0 | 0 | — |
| system_language | 7 | 0 | 0 | — |
| time_warning | 7 | 0 | 0 | — |
| timeframe | 7 | 0 | 0 | — |
| unit_check | 6 | 1 | 0 | 5 |
| verified_figures | 5 | 2 | 0 | 7, 9 |
| wordless_exhibit | 7 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 7 | 4800 | 183 | $0.006 |
| data_request (claude-haiku-4-5) | 14 | 11243 | 820 | $0.015 |
| interviewer (claude-sonnet-5-5) | 7 | 53920 | 2220 | $0.130 |
| coverage (claude-haiku-4-5-20251001) | 6 | 8441 | 729 | $0.012 |
| judge (claude-opus-5-5) | 1 | 12361 | 8949 | $0.228 |
| verifier (claude-opus-5-5) | 1 | 5325 | 2335 | $0.068 |
| reconcile (claude-opus-5-5) | 1 | 3255 | 2302 | $0.059 |
| candidate simulator (claude-opus-5) | 7 | 13791 | 2553 | $0.133 |

- App cost (interviewer + scoring): **$0.52** · with simulator: **$0.65** · list prices, uncached
- Wall time: 13:06

## Feedback

**Top improvement:** Ground your recommendation's numbers and risks as rigorously as your diagnostic math. You sized the cost path with an asserted 10–20% procurement savings, even though hedges only lock in today's prices, and you called inflation market-wide without checking competitors. Derive savings bottom-up, test assumptions like competitor pricing explicitly, and name the key risk plus a stop/go trigger in the final recommendation.

### Problem Structuring — meets_bar
- ✅ The candidate formed an early, data-grounded hypothesis that this is a cost problem rather than a revenue problem, and prioritized accordingly.
  > So revenue is up 15% but margin collapsed from 24% to 6% — that's a huge drop, so this is almost certainly a cost story rather than a revenue story, but I want to confirm both sides.
  > So: costs first, biggest line item as a share of revenue, then what's driving that line.
- ⚠️ The candidate split the revenue and cost branches into relevant drivers and flagged pricing history early, but the framework stayed a two-bucket revenue/cost split with no external or competitive branch rather than 3–4 tailored buckets.
  > I'd break it into: first, revenue — is the 15% growth coming from new store openings, more transactions per store, or higher prices per ticket? Second, costs
  > is the 15% growth coming from new store openings, more transactions per store, or higher prices per ticket?
  > do we have menu-price history over the two years — have prices moved at all?
- ⚠️ The candidate restated the problem facts but never stated the client's objective or tied the structure to the decision the CEO must make.
  > So revenue is up 15% but margin collapsed from 24% to 6%
- 💡 Turn 1 opening, laying out the framework.
  > Better: The CEO's goal is to find the root cause of the 18-point margin drop and restore margin toward 24%. I'd look at three areas. First, revenue: volume versus price per ticket. Second, costs: COGS, labor and overhead as a share of revenue. Third, market context: are peers seeing the same input inflation, and do we have pricing power? I'd start with costs, because revenue is growing. The answer tells us whether the fix is pricing, procurement or operations.

### Quantitative & Analytical Rigor — strong
- ✅ The candidate set up the bean-versus-other-inputs decomposition on a revenue base of 100, converted nested percentages correctly, and narrated each step.
  > Two years ago COGS was 42. Beans were 25% of that = 10.5 points of revenue; everything else = 31.5 points.
  > Of the 16-point increase, beans account for 14.7 − 10.5 = 4.2 points, about 26%. The other inputs account for 11.8 points, about 74%.
- ✅ The candidate sanity-checked the reconstruction against the observed 58% and drew the business implication.
  > Total = 58.0 — which matches the 58% we see today exactly, so input inflation explains essentially the entire COGS move, no volume or waste effect needed.
  > So the headline "coffee prices spiked" is actually the smaller piece.
- ✅ The candidate correctly derived the break-even volume loss for a price increase using contribution margin (5 / (42 + 5) ≈ 10.6%).
  > At 58% COGS, roughly 42% contribution, so a 5% price rise can tolerate maybe a 10–11% volume drop before it's a wash.
- ⚠️ The procurement savings range was asserted rather than derived. The arithmetic on top of it is fine, but the 10–20% input-cost reduction had no supporting logic.
  > procurement levers — hedging and longer-term contracts on beans and dairy, supplier consolidation across 200 stores, packaging spec changes, and waste reduction — might claw back 10 to 20% of input cost
- 💡 Turn 13, sizing the cost-only path.
  > Better: Hedging locks in today's prices rather than reversing past inflation. So the real savings come from consolidation and spec changes, maybe 3–5% of input cost, which is about 2–3 margin points. Even an optimistic 10% is about 6 points. Cost-only gets us to roughly 9–12%, not 24%.

### Data & Exhibit Interpretation — strong
- ✅ The candidate read each cost line systematically and isolated COGS as driving 16 of the 18 points, but also blamed volume growth for diluting margin. At flat prices, extra volume still adds positive contribution, so it is unit-cost inflation, not volume, that compresses margin.
  > COGS, clearly. It's up 16 points of revenue while labor is flat and overhead only moved 2 — so roughly 16 of the 18 points of margin loss sit in COGS.
  > the 15% revenue growth is probably volume or new stores, not pricing, and it's actually diluting margin rather than helping.
- ✅ The candidate connected flat menu prices to the cost data and stated the implication.
  > since menu prices haven't moved in two years, none of that COGS inflation has been passed through to the customer.
- ✅ The candidate proposed a precise next step to test whether one input or broad inflation was the cause, then went beyond beans.
  > I want to know if this is one input spiking, like bean prices, or broad inflation across everything.
- 💡 Turn 5, after isolating COGS.
  > Better: Before splitting COGS, I'd ask whether peers show the same compression. If they do, it's market-wide inflation and pricing is the industry response. If not, it's a Brew & Bean sourcing problem.

### Business Judgment & Insight — meets_bar
- ✅ The candidate surfaced concrete pricing risks and a rigorous, controlled pilot design to mitigate them.
  > Second, mix shift — customers trade down from a $6 latte to drip coffee.
  > pilot across maybe 20 stores, matched to control stores on volume and demographics, varying the increase — say 3%, 5%, 8% — for 8 to 12 weeks.
- ✅ The candidate used the flat footprint to infer same-store traffic growth as evidence of pricing power, which is commercially astute.
  > flat footprint plus flat prices means the entire 15% revenue growth is same-store volume.
- ⚠️ Some assumptions were unsupported. The candidate called the inflation market-wide without having asked about competitors.
  > input inflation of roughly 40%, which is market-wide, not a Brew & Bean execution failure.
- ⚠️ The 10–20% procurement claw-back is optimistic. Hedges and long-term contracts lock in current prices rather than reversing two years of inflation.
  > might claw back 10 to 20% of input cost, which on a 58-point base is maybe 6 to 11 points of margin.
- ⚠️ The mix lever rested on a questionable assumption: in coffee chains, beverages typically carry higher margins than food.
  > food, which usually carries better margin than beverages
- 💡 Turn 13, claiming inflation is market-wide.
  > Better: If competitors face the same ~40% input inflation and have already raised prices, our frozen menu is underpriced versus the market. That makes a selective increase lower-risk than the CEO fears. I'd verify competitor pricing before the pilot.

### Creativity & Brainstorming — meets_bar
- ⚠️ The candidate organized ideas into four clear buckets with several distinct levers, but they were mostly conventional margin levers with no clearly non-obvious idea.
  > Also loyalty programs to lift ticket size without discounting.
  > I'd group it into four buckets.
  > Lock in longer-term contracts or hedges on beans and dairy rather than buying at spot, consolidate suppliers across 200 stores for volume leverage, and look at packaging spec changes that customers won't notice.
- ⚠️ The candidate targeted the pricing idea rather than applying it across the board and gave a rationale for its sequencing, but did not rank the remaining buckets by impact or feasibility.
  > I'd sequence pricing first; it's fastest.
  > A modest increase targeted at the least price-sensitive items — espresso drinks, where customers are loyal — could recover a lot.
- 💡 Turn 9 brainstorm.
  > Better: One less obvious lever is a tiered product line: a lower-cost house blend for value-oriented stores, with specialty origins priced at a premium. That lets us raise average price while protecting price-sensitive traffic. I'd rank the levers pricing first, then procurement, then mix, then operations, by margin impact.

### Synthesis & Recommendation — meets_bar
- ✅ The candidate led with a committed recommendation that responded directly to the CEO's constraint.
  > My recommendation: a cost-only path can get you partway, but it won't get you back to 24% — I'd take it, and I'd keep a small pricing pilot alive in parallel.
- ⚠️ The final recommendation did not name the key risk of the plan, such as volume loss from pricing or supplier constraints on procurement, or how it would be monitored.
  > That's evidence of pricing power, not fragility.
- ⚠️ The candidate tied the supporting reasons to the analysis and closed concisely with a next step, but the margin path relied on an unjustified procurement savings range, which weakens the headline numbers.
  > That takes you from 6% to roughly 12–17%. Meaningful, but short of 24%.
  > Sixteen of the eighteen margin points sit in COGS
  > So: launch procurement now, and run a 20-store pilot at 3% to quantify the risk rather than assume it. Next step, bean and dairy contract terms.
- 💡 Turn 13 final recommendation.
  > Better: Launch procurement now across beans, dairy and packaging, since non-bean inputs drive three-quarters of the COGS increase. Run a 3% price pilot in 20 stores in parallel. The key risk is traffic loss; we'd stop the pilot if transactions fall more than about 5% versus control stores. Next steps: renegotiate supplier contracts and launch the pilot within 30 days.

### Communication & Delivery — strong
- ✅ The candidate's answers were consistently top-down, opening with the conclusion. However, the final answer's opening line packed concession, conclusion and parallel action into one sentence, which slightly blurred the headline.
  > I'd prioritize the cost branch first.
  > COGS, clearly.
  > a cost-only path can get you partway, but it won't get you back to 24% — I'd take it, and I'd keep a small pricing pilot alive in parallel.
- ✅ The candidate used hypothesis-driven phrasing and built directly on the interviewer's new information.
  > this is almost certainly a cost story rather than a revenue story
  > That's actually useful — flat footprint plus flat prices means the entire 15% revenue growth is same-store volume.

### Pushback, Composure & Case Leadership — strong
- ✅ When the CEO rejected pricing, the candidate partly accommodated with a cost path but held the core view with explicit evidence rather than capitulating.
  > The structural point is that prices have been flat for two years while costs rose 40%, and volume still grew 15% per store on a flat footprint. That's evidence of pricing power, not fragility.
- ✅ The candidate drove the case by proactively requesting data and proposing next steps.
  > Could I start with the cost breakdown as a percent of revenue for both years?
  > So: launch procurement now, and run a 20-store pilot at 3% to quantify the risk rather than assume it.
- ✅ The candidate incorporated the footprint hint immediately to strengthen the pricing-power argument.
  > Traffic is up roughly 15% per store, so demand is strong and that supports pricing power.
- 💡 Turn 10, the interviewer probing the claim that demand is 'usually fairly inelastic'.
  > Better: Fair challenge: that was an industry generalization, not something our data shows. What we do know is that traffic grew 15% at flat prices. The pilot is how I'd measure Brew & Bean's actual elasticity.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

How would you like to approach this? Feel free to take a moment to gather your thoughts first.

**Candidate · 1:30** (turn 1)

Let me take a second to structure this.

So revenue is up 15% but margin collapsed from 24% to 6% — that's a huge drop, so this is almost certainly a cost story rather than a revenue story, but I want to confirm both sides.

I'd break it into: first, revenue — is the 15% growth coming from new store openings, more transactions per store, or higher prices per ticket? Second, costs — split into COGS (coffee beans, milk, cups, food) and operating costs (labor, rent, utilities, marketing, corporate overhead), and look at which line grew fastest as a percent of revenue.

One thing I'd want early: do we have menu-price history over the two years — have prices moved at all?

If that's not handy, I'll come back to it. Could I start with the cost breakdown as a percent of revenue for both years?

**Interviewer · 1:34** (turn 2)

Hold both data requests for a moment. You've split the problem into revenue and costs. I'll come to that data shortly. Which branch do you prioritize first, and why?

**Candidate · 3:05** (turn 3)

I'd prioritize the cost branch first.

The logic: revenue grew 15%, so demand isn't collapsing — customers are still showing up. If revenue is up and margin fell by 18 points, the cost base has to have grown much faster than revenue. On a simple basis, if revenue was 100 going to 115, profit went from 24 to about 6.9, so costs went from 76 to about 108 — that's roughly 42% cost growth against 15% revenue growth. That gap is where the story is.

The caveat is that "revenue" hides mix. If the 15% is purely new stores, same-store revenue could be flat or down, and that would pull me back to the revenue side. But even then, the cost line is where the 18 points went.

So: costs first, biggest line item as a share of revenue, then what's driving that line.

**Interviewer · 3:09** (turn 4)

COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Menu prices have not changed in two years. Those are current figures. Which line do you go after first, and what would you ask for next?

**Candidate · 4:40** (turn 5)

COGS, clearly. It's up 16 points of revenue while labor is flat and overhead only moved 2 — so roughly 16 of the 18 points of margin loss sit in COGS.

And since menu prices haven't moved in two years, none of that COGS inflation has been passed through to the customer. That's important: revenue per cup is flat while cost per cup is rising, so the 15% revenue growth is probably volume or new stores, not pricing, and it's actually diluting margin rather than helping.

Next I'd want a split of COGS into its components — green coffee beans, dairy, cups and packaging, food items — for both years, as a percent of revenue. I want to know if this is one input spiking, like bean prices, or broad inflation across everything. I'd also ask whether unit volumes and waste or spoilage rates have changed, since higher throughput with poor yield management shows up the same way.

**Interviewer · 4:46** (turn 6)

Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Average revenue per store is $2.4M a year. I don't have waste or spoilage rates. Using these figures, how much of the COGS increase do beans explain?

**Candidate · 6:17** (turn 7)

Let me run it on a revenue base of 100.

Two years ago COGS was 42. Beans were 25% of that = 10.5 points of revenue; everything else = 31.5 points.

Since menu prices haven't changed, cost inflation flows straight through per unit. Beans up 40%: 10.5 × 1.4 = 14.7. Other inputs up 37.5%: 31.5 × 1.375 = 43.3. Total = 58.0 — which matches the 58% we see today exactly, so input inflation explains essentially the entire COGS move, no volume or waste effect needed.

Of the 16-point increase, beans account for 14.7 − 10.5 = 4.2 points, about 26%. The other inputs account for 11.8 points, about 74%.

So the headline "coffee prices spiked" is actually the smaller piece. Dairy, packaging and food are the bigger driver, mostly because they're three-quarters of the COGS base to begin with.

**Interviewer · 6:19** (turn 8)

Understood. Beyond what we've discussed, what else could Brew & Bean do to reverse the margin decline? Give me a structured set of ideas.

**Candidate · 7:50** (turn 9)

I'd group it into four buckets.

Pricing, since prices have been frozen for two years while inputs rose nearly 40%. A modest increase targeted at the least price-sensitive items — espresso drinks, where customers are loyal — could recover a lot. Rough math: a 5% price increase on a 100 revenue base with costs flat adds about 5 points of margin, nearly doubling the 6%. Specialty coffee demand is usually fairly inelastic, which supports this.

Procurement and supply. Lock in longer-term contracts or hedges on beans and dairy rather than buying at spot, consolidate suppliers across 200 stores for volume leverage, and look at packaging spec changes that customers won't notice.

Mix. Push higher-margin items — food, which usually carries better margin than beverages, and non-dairy or sizes where cost per unit is lower. Also loyalty programs to lift ticket size without discounting.

Operations. Waste and yield — I couldn't get spoilage data, but at 58% COGS even a point of waste reduction is real money. Also reviewing underperforming stores against the $2.4M average.

I'd sequence pricing first; it's fastest.

**Interviewer · 7:52** (turn 10)

Understood. You sequenced pricing first and said demand for specialty coffee is usually fairly inelastic. To your question on the data: 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. What risks would that carry for Brew & Bean, and how would you test them before rolling it out across all stores?

**Candidate · 9:23** (turn 11)

That's actually useful — flat footprint plus flat prices means the entire 15% revenue growth is same-store volume. Traffic is up roughly 15% per store, so demand is strong and that supports pricing power. Revenue per store today is $2.4M, so two years ago it was about $2.09M.

Risks on the price increase: first, volume loss — if the 15% traffic growth came partly from being cheaper than competitors, raising prices could reverse it. At 58% COGS, roughly 42% contribution, so a 5% price rise can tolerate maybe a 10–11% volume drop before it's a wash. Second, mix shift — customers trade down from a $6 latte to drip coffee. Third, brand perception in a loyalty-driven category. Fourth, competitor response.

How I'd test: pilot across maybe 20 stores, matched to control stores on volume and demographics, varying the increase — say 3%, 5%, 8% — for 8 to 12 weeks. Measure transaction counts, ticket size, item mix, and loyalty churn, not just revenue. Then roll out the tier that holds volume.

**Interviewer · 9:29** (turn 12)

Suppose the CEO pushes back and says raising prices is too risky, and wants to focus only on costs. What's your recommendation to the CEO?

**Candidate · 10:59** (turn 13)

My recommendation: a cost-only path can get you partway, but it won't get you back to 24% — I'd take it, and I'd keep a small pricing pilot alive in parallel.

Here's why. Sixteen of the eighteen margin points sit in COGS, and that's driven by input inflation of roughly 40%, which is market-wide, not a Brew & Bean execution failure. Realistically, procurement levers — hedging and longer-term contracts on beans and dairy, supplier consolidation across 200 stores, packaging spec changes, and waste reduction — might claw back 10 to 20% of input cost, which on a 58-point base is maybe 6 to 11 points of margin. That takes you from 6% to roughly 12–17%. Meaningful, but short of 24%.

The structural point is that prices have been flat for two years while costs rose 40%, and volume still grew 15% per store on a flat footprint. That's evidence of pricing power, not fragility.

So: launch procurement now, and run a 20-store pilot at 3% to quantify the risk rather than assume it. Next step, bean and dairy contract terms.

**Interviewer · 11:01** (turn 14)

That's our time. Thanks for working through this with me — your written report will follow.
