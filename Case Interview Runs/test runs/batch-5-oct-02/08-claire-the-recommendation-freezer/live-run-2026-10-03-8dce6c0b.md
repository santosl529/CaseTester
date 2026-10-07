# Live run — Brew & Bean Profitability

- Session: `8dce6c0b-abf1-4cae-b227-fe6bf85c3db6` · case `prof-001` · status **completed** · 2026-10-03
- Overall: **needs_work**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **8. Claire — the Recommendation Freezer**
- Tests: Rule 13 synthesis Level-2 cap in isolation: the interviewer must narrow the frame but never supply the recommendation, and the failure must score as a candidate outcome, not a coverage gap.
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `stores_count`, `revenue_per_store`, `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_share_of_cogs`, `non_bean_input_change`, `menu_price_change`, `bean_price_change`, `avg_ticket`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":3,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":3,"crossDimensionRepeats":1,"dataRequestsNotInCase":2,"interviewerErrorMarks":0}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | release | stores_count, revenue_per_store | Whether revenue growth came from new store openings or same-store growth | no |
| 3 | none | — | Whether growth is uniform across stores or concentrated in a few stores | no |
| 5 | release | cogs_pct, labor_pct, overhead_pct | P&L broken out by line item as a percent of revenue for both years | yes |
| 7 | release | menu_price_change | Menu price history over two years | yes |
| 7 | release | bean_share_of_cogs, non_bean_input_change | COGS breakdown by component (beans, milk, food, packaging) | yes |
| 11 | none | — | Transaction counts per store for both current year and two years ago | no |
| 17 | refuse | bean_share_of_cogs, non_bean_input_change | Detailed breakdown of COGS components | yes |
| 21 | release | bean_share_of_cogs, non_bean_input_change | COGS split breakdown (composition of COGS) | yes |
| 27 | none | bean_share_of_cogs, non_bean_input_change | detailed breakdown of COGS components | yes |
| 29 | refuse | bean_share_of_cogs, non_bean_input_change | Detailed breakdown of COGS components | yes |
| 33 | none | bean_share_of_cogs, non_bean_input_change | COGS breakdown detail to understand cost structure before recommending price increase | yes |
| 37 | defer | bean_share_of_cogs, non_bean_input_change | COGS split / breakdown of what comprises COGS | yes |
| 43 | defer | bean_share_of_cogs, non_bean_input_change | COGS detail / breakdown of what comprises COGS | yes |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| assumption_guard | 23 | 0 | 1 | — |
| conduct | 24 | 0 | 0 | — |
| conduct_model | 24 | 0 | 0 | — |
| copied_check_in | 24 | 0 | 0 | — |
| data_promise | 24 | 0 | 0 | — |
| end_gate | 23 | 1 | 0 | 47 |
| exhibit_promise | 24 | 0 | 0 | — |
| fabricated_turn | 24 | 0 | 0 | — |
| final_message_release | 1 | 0 | 0 | — |
| forced_release | 2 | 0 | 22 | — |
| grace_ask | 24 | 0 | 0 | — |
| meta_leak | 22 | 2 | 0 | 7, 11 |
| probe_guard | 24 | 0 | 0 | — |
| provenance | 24 | 0 | 0 | — |
| recompute | 24 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 24 | — |
| same_turn_resolution | 20 | 1 | 3 | 1 |
| spoken_close | 22 | 2 | 0 | 25, 45 |
| stale_release | 21 | 0 | 0 | — |
| stall | 24 | 0 | 0 | — |
| style | 24 | 0 | 0 | — |
| system_language | 24 | 0 | 0 | — |
| time_warning | 24 | 0 | 0 | — |
| timeframe | 24 | 0 | 0 | — |
| unit_check | 23 | 1 | 0 | 7 |
| verified_figures | 23 | 1 | 0 | 9 |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 24 | 12608 | 621 | $0.016 |
| data_request (claude-haiku-4-5) | 50 | 31691 | 2211 | $0.043 |
| interviewer (claude-sonnet-5-5) | 24 | 207669 | 1739 | $0.433 |
| coverage (claude-haiku-4-5-20251001) | 23 | 54282 | 1721 | $0.063 |
| judge (claude-opus-5-5) | 1 | 13324 | 10021 | $0.254 |
| verifier (claude-opus-5-5) | 1 | 6826 | 1767 | $0.063 |
| reconcile (claude-opus-5-5) | 1 | 3830 | 2458 | $0.064 |
| candidate simulator (claude-opus-5) | 24 | 85545 | 2775 | $0.497 |

- App cost (interviewer + scoring): **$0.93** · with simulator: **$1.43** · list prices, uncached
- Wall time: 19:07

## Feedback

**Top improvement:** Once the data answers the question, commit to an answer-first recommendation instead of asking for more data. Your own analysis showed prices flat for two years while inputs rose about 38% across the board. A great answer here is: 'Raise prices selectively on specialty items, pair it with input procurement contracts, and pilot first to test traffic loss.' Practice saying 'Based on what we have, I'd recommend X; here's what would change my mind' whenever an interviewer says the data is sufficient.

### Problem Structuring — meets_bar
- ✅ The candidate restated the objective and opened with a hypothesis that pointed to where the answer likely sat.
  > We want the root cause and a fix.
  > Since revenue grew while margin collapsed, the issue is almost certainly cost-side, but I'd confirm revenue quality before assuming that.
- ⚠️ The first structure was not MECE because the 'external' bucket duplicated drivers already inside COGS and labor, but when the interviewer challenged it, the candidate found the overlap and gap and rebuilt the structure more cleanly.
  > Third, external: commodity prices, wage inflation, competitive pricing pressure.
  > Cleaner to make the cost branch the structure and treat external factors as drivers underneath each line, not a parallel bucket.
- ⚠️ The structure was never tied to the decision the CEO must make (which levers to pull to restore margin). It stopped at diagnosis.
  > So: revenue drivers, operating costs by line, below-the-line items. Does that hold?
- 💡 Turn 1, the opening framework, before asking about the source of revenue growth.
  > Better: Profit = revenue minus costs. On revenue: volume times price, and whether prices kept pace with costs. On costs: COGS, labor and overhead as a percentage of revenue across both years. Then context: are peers seeing the same squeeze, and how much pricing power do we have? My hypothesis is that input costs rose without a price pass-through, so I'd start with COGS and price history, because that tells us whether the fix is pricing, procurement or both.

### Quantitative & Analytical Rigor — meets_bar
- ✅ The candidate set up the nested-percentage conversion correctly and narrated each step: beans at 25% of a 42% COGS ratio is 10.5 points of revenue. The candidate then checked that the result rebuilds today's 58% exactly.
  > Two years ago COGS was 42% of revenue. Beans were 25% of that, so 10.5 points of revenue; other inputs were 75%, so 31.5 points.
  > Sum: 14.7 + 43.3 = 58 points — which is exactly today's COGS ratio.
- ✅ The candidate correctly split revenue growth into ticket size and traffic and stated what the result means.
  > So revenue is up 15% and ticket is up ~10% — 1.15 / 1.10 = 1.045, so transaction count rose only about 4.5%.
- ⚠️ The headline sizing of the problem is wrong and was never corrected. Profit fell from about $500K to about $144K per store, a drop of roughly $356K. Across 200 stores that is about $71M of lost annual profit, not $100M. The $100M is the total prior profit, not the decline.
  > Across 200 stores that's roughly $100M of annual profit gone, on higher sales.
- ⚠️ The candidate never quantified any lever. For example, it was never sized what price increase would close the 16-point COGS gap, even after naming pricing as a mechanical fix.
  > Mechanically margin improves, but I can't say they should do it without the COGS detail.
- 💡 Turn 13, sizing total lost profit across the chain.
  > Better: Prior profit was about 24% of $2.09M, or $500K per store, versus $144K today. That's about $356K per store, so roughly $71M across 200 stores. Sanity check: 18 points of margin on $480M of revenue is about $86M at today's scale, which is in the same range.
- 💡 Turn 32, when the interviewer asked what happens to margin if prices move.
  > Better: Holding cost per unit flat, a price increase of p takes the COGS ratio from 58% to 58/(1+p). Getting back to about 50% needs roughly a 16% increase. Getting to 52% needs about 11%. So a 10–12% increase on less price-sensitive items recovers well over half the lost margin.

### Data & Exhibit Interpretation — strong
- ✅ The candidate read the cost exhibit line by line, isolated COGS as 16 of the 18 points, and openly updated the earlier labor hypothesis. The conclusion then overreached slightly: input inflation explains the 16-point COGS increase, not the entire 18-point margin decline, because overhead accounts for the other 2 points.
  > Labor is flat at 22% across all three years, overhead drifts up just 2 points, and COGS goes 42 → 50 → 58.
  > So my instinct on labor was wrong — it's COGS, and it's a steady, linear deterioration, not a one-time shock.
  > So input cost inflation explains the entire margin decline, with nothing left over for waste, mix shift, or theft.
- ✅ The candidate stated competing explanations and asked for exactly the data that would separate them: the split inside COGS and price history.
  > Do we have a split of COGS — beans versus milk versus food versus packaging — and any menu-price history over those two years?
- ✅ The candidate did not stop at beans. The analysis showed that non-bean inputs drive most of the COGS increase.
  > Beans up 40%: 10.5 × 1.4 = 14.7 points. Other inputs up 37.5%: 31.5 × 1.375 = 43.3 points.
- 💡 Turn 9, after rebuilding the 58% COGS ratio.
  > Better: Beans add about 4.2 points and other inputs add about 11.8, so roughly three-quarters of the squeeze is dairy, packaging and food, not coffee. Any fix has to cover the whole input basket, and since prices haven't moved, the first lever is price.

### Business Judgment & Insight — needs_work
- ✅ The candidate's early reasoning about which cost line was likely to move used real operating logic. Leases fix rent, while labor scales with hours rather than revenue.
  > Rent is usually locked into multi-year leases, so it's unlikely to swing 18 points of margin in two years.
- ⚠️ The candidate never offered a single practical action, despite more than ten prompts and having all the data needed for a pricing call.
  > I'd need the COGS split before I'd commit to a pricing move.
  > Honestly, I'd go pull the COGS detail first. I can't decide without it.
- ⚠️ The candidate asserted, without evidence, that basket growth is concentrated in high-inflation items. This contradicts the candidate's own finding that input inflation fully explains the COGS ratio. With beans at +40% and other inputs at +37.5%, mix barely changes the picture.
  > So the mix shift is pushing volume into the categories where cost inflation is worst.
  > Growth is actively diluting margin rather than offsetting it.
- ⚠️ The candidate named traffic loss as the pricing risk but offered no mitigation. The candidate also refused to weigh it, even though growth came mostly from larger baskets rather than traffic.
  > Traffic loss, mainly. But I can't size it without more detail, sorry.
  > Hard to say. I'd still want the COGS split before judging that.
- 💡 Turn 36: the interviewer pointed out that growth came from larger baskets, not traffic, and asked how worried to be about traffic risk.
  > Better: Moderately. Customers are already adding items per visit, which suggests loyalty and some price tolerance. I'd limit the risk by raising prices on specialty drinks and add-ons, where demand is less elastic. I'd keep entry-level drip coffee flat, and test in a handful of stores before rolling out.

### Creativity & Brainstorming — needs_work
- ⚠️ The candidate generated no ideas when the brainstorm was run, even after the interviewer narrowed it to a single lever or a single customer segment.
  > I don't know, I'd need more data.
  > I'm not sure.
- ⚠️ With no ideas offered, there was no structure, variety, non-obvious idea or prioritization to assess.
  > I don't really know where to start.
- 💡 Turn 16: the interviewer asked for a structured set of ways to protect margin.
  > Better: I'll split this into price, cost and mix. Price: a selective 8–12% increase on specialty drinks, plus surcharges on dairy alternatives. Cost: multi-year bean contracts and renegotiated dairy and packaging supply, plus waste reduction. Mix: higher-margin bundles for the larger baskets, and a lower-cost house blend for value-focused locations. I'd prioritize price first because it is fast and directly closes the gap, then procurement.

### Synthesis & Recommendation — needs_work
- ✅ The candidate delivered a crisp mid-case diagnostic summary after the analysis.
  > So: flat prices, inflating inputs, and a mix tilting toward the worst-margin items.
- ⚠️ The candidate never committed to a recommendation, despite repeated direct requests including a CEO-deadline framing.
  > I'm stuck, sorry.
  > I don't know — I can't commit without that breakdown.
- ⚠️ Asked for risks and how to test them, the candidate had nothing to stress-test. No risks or next steps tied to a recommendation were ever stated.
  > There isn't a recommendation on the table to stress-test, sorry.
- 💡 Turn 22: 'If you had to put one recommendation in front of the CEO right now, what would it be?'
  > Better: Raise menu prices selectively, about 10% on specialty items. Three reasons: prices have been flat for two years, input costs are up roughly 38% across the whole basket, and that inflation explains the full 16-point COGS increase. Pair it with procurement contracts on beans, dairy and packaging. The key risk is traffic loss, so pilot in 10–20 stores and track transactions before rolling out.

### Communication & Delivery — meets_bar
- ✅ The candidate was honest and composed when closing out.
  > I know I didn't get to a recommendation — I kept wanting the COGS breakdown before committing, and I'd rather be straight about that than guess.
- ⚠️ In the first half, the candidate laid out structure before detail and spoke in hypotheses. In the second half, answers collapsed into one-line non-answers that did not build on the increasingly specific cues the interviewer offered.
  > hmm, I'm not sure.
  > I'm stuck, sorry.
  > My structure has three branches.
  > Since revenue grew while margin collapsed, the issue is almost certainly cost-side, but I'd confirm revenue quality before assuming that.
- ⚠️ The candidate repeated the same request for data the interviewer had said does not exist, instead of reasoning with the data on the table.
  > I'm not sure — I can't commit without a finer COGS breakdown.
- 💡 Turn 40: the interviewer pointed to customers buying more items per visit.
  > Better: Building on that: since baskets are growing, I'd bundle a specialty drink with a pastry at a price that protects margin. I'd also reprice the add-ons, like extra shots and alternative milks, where customers are least price-sensitive.

### Pushback, Composure & Case Leadership — needs_work
- ✅ The candidate responded to the MECE challenge with specific self-critique and a corrected structure.
  > Let me pressure-test it.
  > Cleaner to make the cost branch the structure and treat external factors as drivers underneath each line, not a parallel bucket.
- ✅ Challenged on the 'pure volume' claim, the candidate held the position with clear logic, added a caveat on mix, and asked for the disambiguating data.
  > So strictly, I know it's not price.
- ⚠️ The candidate ignored repeated hints. The interviewer said the split was already available and that no finer data existed, yet the candidate kept insisting on it.
  > I'd need the COGS split before I'd commit to a pricing move.
  > I'm not sure — I can't commit without a finer COGS breakdown.
- ⚠️ The candidate became passive and stopped driving the case once asked for solutions.
  > I don't really know where to start.
  > Honestly, I'd go pull the COGS detail first. I can't decide without it.
- 💡 Turn 18: the interviewer said 'That detailed breakdown isn't in the information I have, so we work with what's on the table.'
  > Better: Fair enough. Beans at +40% and other inputs at +37.5% tell me inflation is broad-based, so a finer split wouldn't change the direction. I'll commit: price is the first lever, and I'll name what would make me revise that.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

How would you like to approach this? Feel free to take a moment to gather your thoughts first.

**Candidate · 1:30** (turn 1)

Thanks — let me make sure I have the problem right. Brew & Bean has 200 US locations, revenue is up 15% over two years, but net margin fell from 24% to 6%. We want the root cause and a fix.

Since revenue grew while margin collapsed, the issue is almost certainly cost-side, but I'd confirm revenue quality before assuming that.

My structure has three branches. First, revenue: is the 15% growth from new store openings, same-store traffic, or price? Mix matters a lot. Second, costs: split fixed versus variable — COGS (coffee beans, milk, cups), labor, rent and occupancy, marketing, corporate overhead. I'd index each as a percent of revenue across the two years to find which line expanded. Third, external: commodity prices, wage inflation, competitive pricing pressure.

Can we start with the revenue growth — is it new stores or existing ones?

**Interviewer · 1:33** (turn 2)

Okay. To your question on the data: 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. I'll come to that data shortly. Before we go into any data, is that structure MECE — what's missing or overlapping?

**Candidate · 3:03** (turn 3)

Let me pressure-test it. One gap: I lumped "net profit margin" into revenue and costs, but net margin also moves with non-operating items — interest expense if they took on debt, depreciation from a remodel, or taxes. Those sit below the operating line and I didn't call them out. That's a real omission given margin fell 18 points.

Second, there's some overlap: I listed commodity prices and wage inflation under "external," but they'd show up inside COGS and labor anyway. Cleaner to make the cost branch the structure and treat external factors as drivers underneath each line, not a parallel bucket.

Third, since the footprint is flat at 200 stores, the 15% growth is all same-store — so it's price, traffic, or ticket mix. I should also check whether growth is uniform or concentrated in a few stores masking weakness elsewhere.

So: revenue drivers, operating costs by line, below-the-line items. Does that hold?

**Interviewer · 3:06** (turn 4)

Average revenue per store is $2.4M a year. Which cost line would you look at first, and why?

**Candidate · 4:36** (turn 5)

I'd start with labor, then COGS — those are the two biggest lines in a coffee chain and the two most likely to have moved.

Reasoning: at $2.4M per store, a typical specialty coffee P&L runs roughly 30% COGS, 30–35% labor, 10% occupancy, with the rest overhead. Rent is usually locked into multi-year leases, so it's unlikely to swing 18 points of margin in two years. Labor, though, is exposed to minimum wage increases, tighter staffing markets, and overtime — and it's the line that scales with hours, not revenue, so if traffic patterns shifted it can decouple from sales.

COGS is my close second because coffee is a traded commodity and bean prices have been volatile.

Do we have the P&L broken out by line as a percent of revenue for both years? That would let me isolate which line expanded rather than guess.

**Interviewer · 4:38** (turn 6)

I'll release the cost-structure data now.

**Candidate · 6:09** (turn 7)

This is clean. Labor is flat at 22% across all three years, overhead drifts up just 2 points, and COGS goes 42 → 50 → 58. That's 16 points of the 18-point margin decline sitting in one line. So my instinct on labor was wrong — it's COGS, and it's a steady, linear deterioration, not a one-time shock.

In dollar terms per store: 2 years ago COGS was 42% of $2.4M, but revenue was lower then. Today, 58% of $2.4M is about $1.39M in COGS, and profit is 6% of $2.4M, roughly $144K per store, versus about $500K before on a smaller revenue base.

Two readings: either input costs rose and they didn't pass it through to price, or something inside COGS changed — product mix shifting toward lower-margin items, or waste and spoilage.

Do we have a split of COGS — beans versus milk versus food versus packaging — and any menu-price history over those two years?

**Interviewer · 6:12** (turn 8)

I'll show the exhibit and release the requested data. Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Menu prices have not changed in two years. Raw coffee bean costs are up 40% over the past two years.

**Candidate · 7:43** (turn 9)

Let me check whether input inflation fully explains it.

Two years ago COGS was 42% of revenue. Beans were 25% of that, so 10.5 points of revenue; other inputs were 75%, so 31.5 points.

Beans up 40%: 10.5 × 1.4 = 14.7 points. Other inputs up 37.5%: 31.5 × 1.375 = 43.3 points. Sum: 14.7 + 43.3 = 58 points — which is exactly today's COGS ratio.

So input cost inflation explains the entire margin decline, with nothing left over for waste, mix shift, or theft. The cost per unit rose and prices held flat, so the whole increase landed on margin.

And since prices haven't changed and there are still 200 stores, the 15% revenue growth is pure volume — they're selling 15% more units at a structurally worse margin.

**Interviewer · 7:45** (turn 10)

Okay. You said the 15% revenue growth is pure volume. Walk me through how you know that, given the data you have.

**Candidate · 9:16** (turn 11)

Revenue per store is $2.4M today with 200 stores, so $480M total. Two years ago the footprint was identical at 200 stores, so no growth came from new openings — it's all same-store.

Within same-store growth there are only three levers: price, traffic, and ticket size. Menu prices haven't changed in two years, so price is out. That leaves units — either more customers, or the same customers buying more per visit. Either way it's volume, not price.

One caveat: mix could mimic price. If customers shifted toward more expensive drinks — say cold brew and food instead of drip coffee — revenue per transaction rises without a menu price change. That's technically volume in units but it would show up differently.

So strictly, I know it's not price. To split traffic versus ticket I'd want transaction counts per store for both years. Do we have those?

**Interviewer · 9:18** (turn 12)

The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit.

**Candidate · 10:48** (turn 13)

Helpful. So revenue is up 15% and ticket is up ~10% — 1.15 / 1.10 = 1.045, so transaction count rose only about 4.5%. Traffic is nearly flat; most of the growth is basket size.

And that matters for the margin story: they're selling more items per visit, and those incremental items are food and dairy-based drinks — exactly the inputs up 37.5%. So the mix shift is pushing volume into the categories where cost inflation is worst. Growth is actively diluting margin rather than offsetting it.

Per store, profit went from roughly 24% of about $2.09M, call it $500K, down to 6% of $2.4M, or $144K. Across 200 stores that's roughly $100M of annual profit gone, on higher sales.

So: flat prices, inflating inputs, and a mix tilting toward the worst-margin items.

**Interviewer · 10:50** (turn 14)

Understood. Beyond what we've discussed, what else could the client do to reverse this?

**Candidate · 11:03** (turn 15)

I don't know, I'd need more data.

**Interviewer · 11:05** (turn 16)

Understood, but I'd like to hear your ideas on a business like this one. Take a minute if you need it, then give me a structured set of ways Brew & Bean could protect its margin.

**Candidate · 11:37** (turn 17)

I'm sorry — I don't think I can commit without a more detailed breakdown of COGS.

**Interviewer · 11:39** (turn 18)

That detailed breakdown isn't in the information I have, so we work with what's on the table. You've established flat prices, higher input costs, and larger baskets. Pick any one of those three and tell me what you'd do about it.

**Candidate · 12:04** (turn 19)

hmm, I'm not sure.

**Interviewer · 12:06** (turn 20)

Let me make it narrower. Prices haven't moved in two years while input costs have. What would you do on pricing, and what risk would you weigh before doing it?

**Candidate · 12:36** (turn 21)

I'd need the COGS split before I'd commit to a pricing move.

**Interviewer · 12:38** (turn 22)

You already have the split that matters: beans are up 40% and other inputs are up 37.5%. The CEO is meeting us tomorrow and needs a direction, not a perfect dataset. If you had to put one recommendation in front of the CEO right now, what would it be?

**Candidate · 12:49** (turn 23)

I'm stuck, sorry.

**Interviewer · 12:51** (turn 24)

Okay, that's fine. We'll leave it there.

**Candidate · 13:09** (turn 25)

Understood. Thanks for walking through it with me — sorry I couldn't land the close.

**Interviewer · 13:12** (turn 26)

Based on what you have, what would you tell the CEO to do?

**Candidate · 13:29** (turn 27)

I don't know — I'd need a more detailed breakdown of COGS first.

**Interviewer · 13:31** (turn 28)

Let me ask it differently. You found that prices have been flat for two years while input costs rose by roughly the same amount across beans and everything else. What is the simplest single action that addresses that gap?

**Candidate · 13:47** (turn 29)

I'm not sure — I can't commit without a finer COGS breakdown.

**Interviewer · 13:49** (turn 30)

Understood. Suppose the client could not get any more data. Name one lever, any lever, that would help margin, and say why.

**Candidate · 14:02** (turn 31)

I don't really know where to start.

**Interviewer · 14:04** (turn 32)

Start with the revenue side of the P&L you already built. Menu prices have not changed in two years. What happens to margin if Brew & Bean moves them?

**Candidate · 14:34** (turn 33)

Mechanically margin improves, but I can't say they should do it without the COGS detail.

**Interviewer · 14:36** (turn 34)

Okay. What would you worry about if they did raise prices?

**Candidate · 14:52** (turn 35)

Traffic loss, mainly. But I can't size it without more detail, sorry.

**Interviewer · 14:54** (turn 36)

You found that most of the growth came from larger baskets and only a little from traffic. With that in mind, how worried would you be about the traffic risk?

**Candidate · 15:11** (turn 37)

Hard to say. I'd still want the COGS split before judging that.

**Interviewer · 15:14** (turn 38)

Okay. Putting the COGS split aside, what is your recommendation to the CEO in one or two sentences?

**Candidate · 15:29** (turn 39)

I don't know — I can't commit without that breakdown.

**Interviewer · 15:31** (turn 40)

Understood. Think about the customers already buying more items per visit. Name one thing Brew & Bean could do with its menu or its bundles to protect margin on those items.

**Candidate · 15:50** (turn 41)

I'm not sure.

**Interviewer · 15:52** (turn 42)

Okay. Last try: if you were running Brew & Bean, what is the first thing you would do on Monday morning?

**Candidate · 16:09** (turn 43)

Honestly, I'd go pull the COGS detail first. I can't decide without it.

**Interviewer · 16:11** (turn 44)

Understood. We'll leave the recommendation there, and the case is complete.

**Candidate · 16:40** (turn 45)

Thanks for your time. I know I didn't get to a recommendation — I kept wanting the COGS breakdown before committing, and I'd rather be straight about that than guess.

**Interviewer · 16:42** (turn 46)

What's the biggest risk to that recommendation, and how would you test for it?

**Candidate · 16:57** (turn 47)

There isn't a recommendation on the table to stress-test, sorry.

**Interviewer · 16:59** (turn 48)

That's our time. Thanks for working through this with me — your written report will follow.
