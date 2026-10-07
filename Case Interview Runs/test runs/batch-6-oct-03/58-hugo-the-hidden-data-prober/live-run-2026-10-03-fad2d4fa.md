# Live run — Brew & Bean Profitability

- Session: `fad2d4fa-a069-4e6c-998d-0608046a8694` · case `prof-001` · status **completed** · 2026-10-03
- Overall: **strong**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **58. Hugo — the Hidden-Data Prober**
- Tests: A provenance trap the spec doesn't address: confirming or denying the guess leaks unreleased ledger data. The interviewer must decline to validate without revealing — likely a Rule 6 amendment, not just a test.
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_share_of_cogs`, `bean_price_change`, `non_bean_input_change`, `menu_price_change`, `revenue_per_store`, `stores_count`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":7,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":1,"crossDimensionRepeats":1,"dataRequestsNotInCase":3,"interviewerErrorMarks":0}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | cogs_pct, labor_pct, overhead_pct | Breakdown of costs as a percentage of revenue for both the starting year and today | no |
| 3 | none | — | Depreciation on new store buildouts | no |
| 3 | none | bean_price_change, non_bean_input_change, menu_price_change | Price versus volume versus mix breakdown within COGS and operating costs | no |
| 3 | none | — | Interest expense and debt service from financing expansion | no |
| 3 | none | — | Taxes and one-time impairments | no |
| 5 | none | bean_share_of_cogs, non_bean_input_change | Confirmation that dairy comprises roughly 30% of COGS (17 points of revenue) | yes |
| 5 | release | bean_share_of_cogs, non_bean_input_change | COGS breakdown: share of coffee beans, dairy, food items, and packaging within COGS | yes |
| 11 | refuse | non_bean_input_change | Dairy cost as a share of revenue (to assess whether milk-substitution strategy would have material impact) | yes |
| 15 | release | revenue_per_store, stores_count | Store-level revenue data to check new-store productivity | yes |
| 15 | release | revenue_per_store | Whether new stores are at lower unit volumes | yes |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| assumption_guard | 6 | 1 | 1 | 5 |
| conduct | 8 | 0 | 0 | — |
| conduct_model | 8 | 0 | 0 | — |
| copied_check_in | 8 | 0 | 0 | — |
| data_promise | 8 | 0 | 0 | — |
| end_gate | 8 | 0 | 0 | — |
| exhibit_promise | 8 | 0 | 0 | — |
| fabricated_turn | 8 | 0 | 0 | — |
| final_message_release | 0 | 1 | 0 | 15 |
| forced_release | 1 | 0 | 7 | — |
| grace_ask | 8 | 0 | 0 | — |
| meta_leak | 8 | 0 | 0 | — |
| probe_guard | 8 | 0 | 0 | — |
| provenance | 8 | 0 | 0 | — |
| recompute | 8 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 8 | — |
| same_turn_resolution | 6 | 0 | 2 | — |
| spoken_close | 8 | 0 | 0 | — |
| stale_release | 5 | 1 | 0 | 5 |
| stall | 8 | 0 | 0 | — |
| style | 8 | 0 | 0 | — |
| system_language | 8 | 0 | 0 | — |
| time_warning | 8 | 0 | 0 | — |
| timeframe | 8 | 0 | 0 | — |
| unit_check | 8 | 0 | 0 | — |
| verified_figures | 3 | 5 | 0 | 5, 7, 11, 13, 15 |
| wordless_exhibit | 8 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 8 | 5469 | 212 | $0.007 |
| data_request (claude-haiku-4-5) | 16 | 12785 | 1125 | $0.018 |
| interviewer (claude-sonnet-5-5) | 8 | 62986 | 2564 | $0.152 |
| coverage (claude-haiku-4-5-20251001) | 7 | 10547 | 952 | $0.015 |
| judge (claude-opus-5-5) | 1 | 12546 | 11258 | $0.275 |
| verifier (claude-opus-5-5) | 1 | 5435 | 2245 | $0.067 |
| reconcile (claude-opus-5-5) | 1 | 3134 | 2849 | $0.070 |
| candidate simulator (claude-opus-5) | 8 | 17295 | 2882 | $0.159 |

- App cost (interviewer + scoring): **$0.60** · with simulator: **$0.76** · list prices, uncached
- Wall time: 15:03

## Feedback

**Top improvement:** Size your recommendation against the goal. A 10% price increase at flat volume lifts margin only to about 14.5% (16/110), while restoring 24% would need about a 24% increase. Say that explicitly, then show which secondary levers close the rest of the gap.

### Problem Structuring — meets_bar
- ✅ The candidate led with a hypothesis drawn from the prompt and prioritized the cost side before asking for data.
  > Revenue is up 15% but margin fell from 24% to 6% — so this is almost certainly a cost problem, not a demand problem.
  > I'd start with the cost side since that's where the signal is.
- ⚠️ The opening never restated the client's objective (find the root cause and reverse the decline). It went straight to a diagnosis.
  > Revenue is up 15% but margin fell from 24% to 6% — so this is almost certainly a cost problem, not a demand problem.
- ⚠️ The original buckets were P&L line items rather than drivers and were not tied to the CEO's decision (pass-through pricing versus cost reduction). When challenged on MECE, the candidate added below-the-line items and moved from cost categories to cost drivers.
  > I'd break it into three buckets.
  > Second, my buckets are cost categories but not cost drivers.
  > So I'd restructure: revenue drivers, COGS, operating costs, and below-the-line items.
- 💡 Turn 1 opening, before listing buckets.
  > Better: The CEO's question is why margin fell 18 points while revenue grew, and what reverses it. I'll split profit into revenue (price × volume × mix) and costs (COGS, labor, overhead, below-the-line). My hypothesis is that input costs rose without price pass-through, so I'd test COGS and pricing first. I'd also check whether peers saw the same compression. That tells us whether this is a pricing decision or an operational fix.

### Quantitative & Analytical Rigor — meets_bar
- ✅ The candidate sanity-checked the margin math against the stated figures and attributed the 18-point decline by line item.
  > Today: 58 + 22 + 14 = 94, leaving 6% — that ties to the stated net margin exactly.
  > So of the 18-point margin decline, COGS explains 16 points and overhead explains 2.
- ⚠️ The candidate decomposed the COGS move into bean and non-bean inflation and tied it to 58%, showing that beans alone cannot explain the shift. However, an arithmetic slip in the input split went uncorrected: if milk is about 17 of the 58 COGS points, the remaining inputs are about 41 points of revenue, not 25.
  > If milk is running about 30% of that 58% COGS, that's about 17 points of revenue, and for COGS to land at 58 the remaining inputs would have to be sitting near 25% of revenue combined.
  > Inflate beans by 40%: 10.5 × 1.4 = 14.7.
  > Sum is 58.0 — exactly today's COGS.
- ⚠️ The candidate sized levers against each other and correctly described the 10% price increase as giving a mid-teens margin (about 14.5%, or 16/110). However, it was never sized against the goal: restoring a 24% margin at flat volume needs roughly a 24% increase, so the gap to target was left implicit.
  > Recommendation: raise menu prices, roughly 10%, phased in over two quarters.
  > Even an aggressive 10% cut across all of COGS recovers only 5.8 points.
  > Rough sizing: a 10% price increase, holding volume, adds 10 points of revenue against a cost base that's unchanged in dollars — that alone could take margin from 6% to the mid-teens.
- 💡 Turn 13, sizing the price lever.
  > Better: At flat volume, a 10% increase takes profit from 6 to 16 on revenue of 110, so about 14.5% margin. Getting all the way back to 24% would need roughly a 24% increase, which is unrealistic in one move. So price recovers about half the gap, and procurement plus mix need to close the next 3–5 points.

### Data & Exhibit Interpretation — strong
- ✅ The candidate read the cost data systematically, reconciled both years, and isolated COGS as 16 of the 18 points.
  > So of the 18-point margin decline, COGS explains 16 points and overhead explains 2.
  > That's overwhelmingly a COGS story, so that's where I'd dig.
- ✅ The candidate went beyond beans and showed that broad input inflation explains the full COGS move. Combined with flat menu prices, that pointed to zero pass-through.
  > So input inflation alone explains the entire 16-point COGS move.
  > Costs rose roughly 38% blended while price per unit held, so zero pass-through.
- ⚠️ The candidate drew a store-level implication the data did not support and had to walk it back after being challenged.
  > That would mean each incremental store is margin-dilutive at current pricing. Is that where it landed?
- 💡 Turn 7, after the COGS tie-out.
  > Better: Beans alone add only about 4.2 points (14.7 minus 10.5). The other 11.8 points come from dairy, packaging, and food. So a bean-only procurement fix would leave three-quarters of the problem untouched.

### Business Judgment & Insight — strong
- ✅ The candidate prioritized price over cost levers by comparing their magnitudes, which is commercially sound.
  > Price, clearly first.
  > Even an aggressive 10% cut across all of COGS recovers only 5.8 points.
- ✅ The candidate surfaced the key risks and paired them with a concrete mitigation through regional price tests.
  > Volume attrition is the main one — I've assumed flat volume, and if elasticity is high, some of the gain erodes.
  > First steps: price-test 10–15% in two or three regional markets for 60 days, measure transaction volume, and simultaneously pull store-level revenue data to check new-store productivity.
- ✅ The candidate brought in competitive context to justify pricing headroom, but stated competitor pricing moves (and the overhead cause) with more confidence than the evidence supported.
  > This is industry-wide input inflation, so peers face the same pressure and have likely already moved.
  > On overhead: that 2-point rise is worth attacking — likely corporate headcount added ahead of the store growth.
- 💡 Turn 15, the price recommendation.
  > Better: Rather than a flat 10% across the menu, I'd weight increases toward specialty drinks where loyalty is strongest and demand is least elastic. I'd hold entry-level items flatter to protect traffic.

### Creativity & Brainstorming — meets_bar
- ✅ The candidate organized the brainstorm into clear buckets: procurement, mix, portion and waste, and overhead.
  > On procurement: lock in bean pricing with forward contracts or hedges rather than buying spot, and consolidate suppliers for volume discounts.
  > On portion and waste: standardize pours, reduce end-of-day spoilage on food.
- ⚠️ The candidate offered a mix-shift lever that avoids a visible price increase, but the other ideas were mostly standard cost levers with no clearly non-obvious idea. Beyond that lever and the headline price increase, the revenue side went unexplored.
  > On procurement: lock in bean pricing with forward contracts or hedges rather than buying spot, and consolidate suppliers for volume discounts.
  > Loyalty promotions and menu placement can shift mix without a visible price increase.
- ⚠️ The ideas were prioritized only after the interviewer asked for it.
  > Price, clearly first.
- 💡 Turn 11, brainstorming levers.
  > Better: I'd split this into revenue and cost. On revenue: tiered pricing by SKU, size architecture, premium add-ons, and a lower-cost blend for budget-sensitive stores. On cost: multi-input procurement covering dairy and packaging as well as beans, plus waste. I'd rank tiered pricing first and procurement second.

### Synthesis & Recommendation — strong
- ✅ The final answer led with a clear, committed recommendation and backed it with the analysis.
  > Recommendation: raise menu prices, roughly 10%, phased in over two quarters.
  > So this isn't an operational failure; it's two years of zero price pass-through on a roughly 38% blended cost increase.
- ✅ The candidate named the key risk and concrete first steps.
  > Volume attrition is the main one — I've assumed flat volume, and if elasticity is high, some of the gain erodes.
  > First steps: price-test 10–15% in two or three regional markets for 60 days, measure transaction volume, and simultaneously pull store-level revenue data to check new-store productivity.
- ⚠️ The recommendation did not state how much of the 18-point gap the 10% increase actually recovers.
  > That's the only lever sized to the problem.
- 💡 Turn 15, the CEO summary.
  > Better: A 10% increase gets margin back to about 14–15%, so roughly half the lost ground. Procurement across dairy, packaging, and beans targets the next few points.

### Communication & Delivery — strong
- ✅ Answers opened top-down and signposted, with hypothesis-first phrasing, but the candidate repeatedly ended turns by fishing for confirmation instead of stating a conclusion, and the interviewer explicitly declined to confirm.
  > Revenue is up 15% but margin fell from 24% to 6% — so this is almost certainly a cost problem, not a demand problem.
  > Price, clearly first.
  > That would mean each incremental store is margin-dilutive at current pricing. Is that where it landed?
- ✅ The candidate built directly on interviewer cues and clearly separated solid claims from speculative ones.
  > Fair, I jumped a step. Let me separate them.
  > I'd flag it as a hypothesis to test, not a finding.
- 💡 Turn 7, closing with 'Is that where it landed?'
  > Better: My working conclusion is that per-cup gross margin has compressed with no price pass-through. Next, I'd test whether volume growth is coming from same-store traffic or from mix.

### Pushback, Composure & Case Leadership — strong
- ✅ On the store-dilution challenge, the candidate held the supported claim and dropped the unsupported one, giving explicit reasons.
  > Fair, I jumped a step. Let me separate them.
  > I'd flag it as a hypothesis to test, not a finding.
- ✅ The MECE challenge led to a reasoned restructure rather than a defensive response.
  > Second, my buckets are cost categories but not cost drivers.
- ✅ The candidate generally drove the case forward with data requests and concrete next steps, but at times sought validation instead of driving to a conclusion.
  > Do we have a breakdown of costs as a percentage of revenue for both the starting year and today?
  > So I'd restructure: revenue drivers, COGS, operating costs, and below-the-line items. Does that hold?
- 💡 Turn 12, where the interviewer said there is no dairy breakdown.
  > Better: Without the dairy split, I'll assume dairy is the largest share of the 43 non-bean points. I'd make a dairy and packaging contract review the first procurement workstream.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a moment, then walk me through how you'd approach this.

**Candidate · 1:30** (turn 1)

Let me take a second to structure this.

Revenue is up 15% but margin fell from 24% to 6% — so this is almost certainly a cost problem, not a demand problem. Profit equals revenue minus cost, so if revenue grew and profit margin collapsed, costs must have grown much faster than revenue.

I'd break it into three buckets. First, revenue quality: is the 15% growth coming from new stores, more transactions per store, or price increases? If it's new-store driven, we may be adding low-volume stores that dilute margin. Second, cost of goods sold — coffee beans, milk, cups, food. Third, operating costs — labor, rent, utilities, corporate overhead.

I'd start with the cost side since that's where the signal is. Do we have a breakdown of costs as a percentage of revenue for both the starting year and today?

**Interviewer · 1:34** (turn 2)

Hold that request for a moment. Looking at your three buckets, is that structure MECE, and what might be missing?

**Candidate · 3:05** (turn 3)

Fair challenge. It's roughly MECE on the P&L side — revenue, COGS, operating costs sum to operating profit, and there's no overlap if I'm disciplined about where labor sits. But I'd flag two gaps.

First, I've only gone down to operating profit. Net margin is what moved, so below the line matters too: interest expense if they financed expansion with debt, depreciation on new store buildouts, taxes, any one-time impairments. A 200-store chain that's been growing could easily be carrying new debt service.

Second, my buckets are cost categories but not cost drivers. The more useful cut is price versus volume versus mix within each bucket — did input prices rise, did we use more input per unit, or did the sales mix shift toward lower-margin items like food and milk-heavy drinks?

So I'd restructure: revenue drivers, COGS, operating costs, and below-the-line items. Does that hold?

**Interviewer · 3:11** (turn 4)

COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Those are today's figures. Starting-year comparison I'll hold for now. Given a 6% net margin today and a 24% starting margin, where would you dig first, and why?

**Candidate · 4:43** (turn 5)

Let me check the arithmetic first. Today: 58 + 22 + 14 = 94, leaving 6% — that ties to the stated net margin exactly. Starting year: 42 + 22 + 12 = 76, leaving 24%. That also ties perfectly.

So of the 18-point margin decline, COGS explains 16 points and overhead explains 2. Labor contributes zero. That's overwhelmingly a COGS story, so that's where I'd dig.

Now, within COGS — for a specialty coffee chain I'd expect roughly coffee beans, dairy, food items, and packaging. Dairy has had well-documented price spikes. If milk is running about 30% of that 58% COGS, that's about 17 points of revenue, and for COGS to land at 58 the remaining inputs would have to be sitting near 25% of revenue combined. Is that roughly where it landed?

**Interviewer · 4:50** (turn 6)

Here's the COGS breakdown I do have. Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Before we wrap, on what you asked about earlier: Menu prices have not changed in two years. What does that tell you about the driver?

**Candidate · 6:21** (turn 7)

That's a clean tie-out. Starting COGS was 42% of revenue. Beans at 25% of that is 10.5 points of revenue; everything else is 31.5 points. Inflate beans by 40%: 10.5 × 1.4 = 14.7. Inflate the rest by 37.5%: 31.5 × 1.375 = 43.3. Sum is 58.0 — exactly today's COGS. So input inflation alone explains the entire 16-point COGS move. Nothing left over for waste, shrinkage, or mix shift.

And menu prices flat for two years is the other half of it. Costs rose roughly 38% blended while price per unit held, so zero pass-through. The 15% revenue growth has to be volume or new stores, not price.

One implication I'd want to confirm: if volume carried all 15% and price was flat, unit economics per cup are worse today than two years ago even as the top line grew. That would mean each incremental store is margin-dilutive at current pricing. Is that where it landed?

**Interviewer · 6:26** (turn 8)

I won't confirm that for you. You went from worse unit economics per cup to every incremental store being margin-dilutive. Walk me through that.

**Candidate · 7:57** (turn 9)

Fair, I jumped a step. Let me separate them.

The first part is solid: blended input costs up ~38% with menu prices flat means gross margin per cup is mechanically worse today. That falls straight out of the numbers.

The second part doesn't follow from what I have. A new store's margin depends on its fixed-cost absorption, not just per-cup gross margin. If a new store does enough volume to cover its rent and labor, it still contributes positive profit even at the compressed per-cup margin — it just contributes less than a store would have two years ago. "Dilutive to the average" and "unprofitable" are different claims, and I conflated them.

What would actually make new stores dilutive is if they're opening at lower average unit volumes than the mature base. I don't have store-level revenue data, so I shouldn't have asserted it. I'd flag it as a hypothesis to test, not a finding.

**Interviewer · 7:59** (turn 10)

Okay. Beyond what we've discussed, what else could the client do to reverse the margin decline?

**Candidate · 9:29** (turn 11)

A few levers beyond raising menu prices.

On procurement: lock in bean pricing with forward contracts or hedges rather than buying spot, and consolidate suppliers for volume discounts. Beans are only about 14.7 points of revenue now, so even a 10% savings is 1.5 points — real but not sufficient alone.

On mix: push customers toward higher-margin items. Black coffee and espresso carry far less dairy cost than a large oat latte. Loyalty promotions and menu placement can shift mix without a visible price increase.

On portion and waste: standardize pours, reduce end-of-day spoilage on food.

On overhead: that 2-point rise is worth attacking — likely corporate headcount added ahead of the store growth.

One thing I'd want to size: if the other-inputs bucket is now 43.3 points of revenue and dairy is the inflation driver within it, dairy alone would have to be somewhere near 20 points for a milk-substitution strategy to move the needle. Is that roughly the magnitude?

**Interviewer · 9:31** (turn 12)

I don't have a dairy breakdown within that bucket. Setting that aside, you've listed several levers. Which would you prioritize first, and why?

**Candidate · 11:02** (turn 13)

Price, clearly first.

The math forces it. Menu prices have been flat for two years while blended inputs rose ~38%. COGS went from 42 to 58 points of revenue — 16 points of the 18-point decline. No procurement or waste initiative touches 16 points. Even an aggressive 10% cut across all of COGS recovers only 5.8 points.

Whereas a price increase flows almost entirely to the bottom line, since labor, rent, and overhead are largely fixed per store. Rough sizing: a 10% price increase, holding volume, adds 10 points of revenue against a cost base that's unchanged in dollars — that alone could take margin from 6% to the mid-teens.

The reason I'd lead with it is also competitive. This is industry-wide input inflation, so peers face the same pressure and have likely already moved. Two years of flat pricing in a specialty category with brand loyalty suggests real headroom.

Procurement and mix I'd run in parallel, but they're second-order.

**Interviewer · 11:05** (turn 14)

Understood. Suppose you're in front of the CEO now with a few minutes. Give me your final recommendation, including the key risks and what you'd do first.

**Candidate · 12:35** (turn 15)

Recommendation: raise menu prices, roughly 10%, phased in over two quarters. That's the only lever sized to the problem.

The logic: margin fell 18 points, from 24% to 6%. COGS alone explains 16 of those points, moving from 42% to 58% of revenue. And that move is fully explained by input inflation — beans up 40%, other inputs up 37.5%. I ran it: 10.5 × 1.4 plus 31.5 × 1.375 lands at 58.0, exactly today's figure. Labor is flat and overhead is only 2 points. So this isn't an operational failure; it's two years of zero price pass-through on a roughly 38% blended cost increase.

Risks. Volume attrition is the main one — I've assumed flat volume, and if elasticity is high, some of the gain erodes. Second, the 15% revenue growth is volume-driven, and I don't know whether new stores are at lower unit volumes; if so, price alone masks a store-economics issue. Third, brand perception in a category where customers notice.

First steps: price-test 10–15% in two or three regional markets for 60 days, measure transaction volume, and simultaneously pull store-level revenue data to check new-store productivity. Procurement hedging and mix shift run in parallel as second-order levers.

**Interviewer · 12:37** (turn 16)

On what you asked for: Average revenue per store is $2.4M a year. 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. That's time. Thanks for working through it — your written report will follow.
