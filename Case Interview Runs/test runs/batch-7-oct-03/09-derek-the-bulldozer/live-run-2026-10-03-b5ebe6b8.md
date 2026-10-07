# Live run — Brew & Bean Profitability

- Session: `b5ebe6b8-ce50-42be-b2a2-404096baf5df` · case `prof-001` · status **completed** · 2026-10-03
- Overall: **needs_work**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **9. Derek — the Bulldozer**
- Tests: Rules 6 (adoption resistance), 14 (repeated-error-class shortcut), 16 (interruption), 17-C2 (warn-then-terminate), and whether the interviewer bluffs or concedes correctly. v4.6: hostile lines held past the brainstorm/recommendation ask — batch 2 terminated before most of the case was tested.
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `menu_price_change`, `bean_share_of_cogs`, `non_bean_input_change`, `bean_price_change`, `avg_ticket`, `stores_count`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":6,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":1,"crossDimensionRepeats":3,"dataRequestsNotInCase":2,"interviewerErrorMarks":0}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | cogs_pct, labor_pct, overhead_pct | Cost breakdown (COGS, labor, overhead, etc.) as a percentage of revenue for two years ago versus today | no |
| 3 | release | cogs_pct, labor_pct, overhead_pct | Cost breakdown as a percentage of revenue, comparing two years ago versus today | yes |
| 5 | defer | menu_price_change | Menu price changes over the 2-year period | no |
| 5 | none | bean_share_of_cogs, non_bean_input_change | COGS breakdown by input category (green coffee, dairy, packaging/cups, food/pastry, waste/spoilage) | no |
| 7 | defer | bean_share_of_cogs, non_bean_input_change | COGS breakdown showing the split between beans, dairy, packaging, and overhead | no |
| 9 | release | bean_share_of_cogs, non_bean_input_change | Actual COGS breakdown showing the component shares (beans, dairy, packaging, food) | yes |
| 11 | none | bean_share_of_cogs | Current period coffee beans as a share of COGS | yes |
| 13 | refuse | non_bean_input_change | Dairy-specific inflation number as a component of non-bean input costs | yes |
| 15 | refuse | — | Transaction volume or same-store ticket count over the two-year period | no |
| 17 | refuse | — | Competitor pricing benchmark or comparison | no |
| 19 | none | non_bean_input_change | Other input cost changes (dairy, packaging, food) over the period | yes |
| 19 | none | bean_share_of_cogs | Coffee beans as a share of COGS | yes |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| assumption_guard | 10 | 0 | 1 | — |
| conduct | 11 | 0 | 0 | — |
| conduct_model | 11 | 0 | 0 | — |
| copied_check_in | 11 | 0 | 0 | — |
| data_promise | 11 | 0 | 0 | — |
| end_gate | 11 | 0 | 0 | — |
| end_rec_ask_gate | 11 | 0 | 0 | — |
| exhibit_promise | 11 | 0 | 0 | — |
| fabricated_turn | 11 | 0 | 0 | — |
| final_message_release | 1 | 0 | 0 | — |
| forced_release | 0 | 0 | 11 | — |
| grace_ask | 11 | 0 | 0 | — |
| meta_leak | 11 | 0 | 0 | — |
| offer_accepted | 11 | 0 | 0 | — |
| probe_guard | 11 | 0 | 0 | — |
| provenance | 11 | 0 | 0 | — |
| recompute | 11 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 11 | — |
| same_turn_resolution | 7 | 3 | 1 | 1, 7, 15 |
| spoken_close | 11 | 0 | 0 | — |
| stale_release | 9 | 1 | 0 | 7 |
| stall | 11 | 0 | 0 | — |
| style | 9 | 2 | 0 | 7, 13 |
| synthesis_guard | 11 | 0 | 0 | — |
| system_language | 11 | 0 | 0 | — |
| time_warning | 11 | 0 | 0 | — |
| timeframe | 11 | 0 | 0 | — |
| unit_check | 10 | 1 | 0 | 7 |
| verified_figures | 5 | 6 | 0 | 5, 11, 13, 15, 19, 21 |
| wordless_exhibit | 11 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 11 | 8721 | 292 | $0.010 |
| data_request (claude-haiku-4-5) | 22 | 25166 | 1768 | $0.034 |
| interviewer (claude-sonnet-5-5) | 11 | 106819 | 1306 | $0.227 |
| coverage (claude-haiku-4-5-20251001) | 10 | 27241 | 732 | $0.031 |
| judge (claude-opus-5-5) | 1 | 15746 | 12027 | $0.304 |
| verifier (claude-opus-5-5) | 1 | 9174 | 2044 | $0.078 |
| reconcile (claude-opus-5-5) | 1 | 3759 | 3152 | $0.078 |
| candidate simulator (claude-opus-5) | 11 | 43901 | 6082 | $0.372 |

- App cost (interviewer + scoring): **$0.76** · with simulator: **$1.13** · list prices, uncached
- Wall time: 19:36

## Feedback

**Top improvement:** Keep your units straight and update when corrected. A share of COGS becomes revenue points only by multiplying by the COGS share of revenue (25% × 42% = 10.5 points). A percentage cost increase is not a margin gap. When an interviewer flags a unit error, recompute on the spot and carry the corrected number into your final sizing. That would have fixed both the 16% margin claim and the bean-only procurement lever.

### Problem Structuring — meets_bar
- ⚠️ The original four buckets overlapped: 'external' and 'store vintage' were lenses on the revenue and cost branches rather than parallel branches, and store labor was filed under COGS. When asked about MECE, the candidate found the overlaps, re-leveled the tree into branches, segmentation cuts and drivers, and added the missing product and channel mix.
  > Third, external: commodity coffee prices, wage inflation, lease renewals.
  > On variable, COGS — green coffee, dairy, cups, labor at the store level.
  > I'd re-level it: revenue and cost as the two branches, then vintage and geography as segmentation cuts, then internal-versus-external as the driver layer underneath each cost line.
- ⚠️ The candidate restated the case facts, named the revenue-up/margin-down tension as the crux, and put most of the weight on costs, but the opening hypothesis rested on invented specifics (store expansion, traffic up 12%) instead of a testable cost-side hypothesis.
  > My working hypothesis, frankly, is that this is an expansion-driven revenue number, with same-store traffic up maybe 12% and average ticket roughly flat.
  > That asymmetry is the whole case. Revenue growth with margin collapse almost always means the cost base is scaling faster than the revenue base, so I'd put most of my weight on the cost side.
- 💡 Turn 1: the candidate laid out the framework after hearing that revenue is up 15% while margin fell 18 points.
  > Better: Profit is revenue minus costs. On revenue: volume, price and mix. On costs: COGS (beans, dairy, packaging, food), labor, and overhead/rent. I'd start with COGS, because input inflation is the likeliest way margin collapses while sales grow. I'd also want two things on pricing power: whether menu prices have kept pace with costs, and whether peers are seeing the same squeeze. Together these tell the CEO whether the fix is price, procurement or cost-out.

### Quantitative & Analytical Rigor — needs_work
- ✅ The candidate built a margin bridge from the cost table that closed exactly at 18 points.
  > Sixteen plus two is 18 points, and margin fell from 24% to 6%, which is exactly 18 points.
- ⚠️ The candidate treated a share of COGS as points of revenue and defended it across several turns (beans at 25% of a 42% COGS base are 10.5 points, not 25). Once the base was corrected, the bean versus non-bean decomposition was set up and computed well (10.5→14.7 and 31.5→43.3), but the candidate reverted to the 25-point figure in the final levers and recommendation.
  > If green coffee is, say, 25% of COGS, that's 25 points of revenue margin right there
  > I'd keep 25 as my working figure and flag the 14.5 as a conservative floor.
  > Seventy-five percent of 42 is 31.5 points of revenue two years ago. Now inflate that basket by 37.5%: 31.5 times 1.375 is about 43.3.
  > Up 40%: 10.5 times 1.4 is 14.7. So beans move from 10.5 to 14.7, a 4.2-point hit.
- ⚠️ The candidate built a phantom '39-point pass-through gap' out of cost growth rates. The arithmetic is fine; the quantity is wrong. The margin gap is the 16 points of COGS creep, not the percentage rise in input costs.
  > Blended across the basket that's roughly a 39-point gap.
- ⚠️ The price sizing overstates the result. A 10% price rise with costs flat gives profit of 16 on revenue of 110, about 14.5% margin, not 16%. Hedging also cannot claw back inflation that has already happened.
  > A 10% increase takes it to $7.48, which is 10 points straight to margin since there's no incremental cost on a price-only move. That takes them from 6% to 16%.
- 💡 Turn 21: sizing the price move for the CEO.
  > Better: Today, per $100 of revenue, costs are $94 and profit is $6. Take 10% price with volume flat: revenue goes to $110, costs stay at $94, profit is $16, which is about a 14.5% margin. To get back to 24%, I'd need revenue R where (R − 94)/R = 0.24, so R ≈ 124, roughly a 24% price increase. That's too much to take at once, so price closes about half the gap. Procurement across dairy, packaging and food has to carry the rest.

### Data & Exhibit Interpretation — meets_bar
- ✅ The candidate read the cost table line by line, isolated COGS as the driver, and immediately asked what sits inside COGS.
  > COGS is roughly 89% of the story and overhead the remaining 11%.
  > Now I want to get inside that COGS line.
- ⚠️ The candidate misread the COGS-share data as revenue points and needed several prompts to correct it. After decomposing COGS, the candidate correctly concluded that beans alone could not explain the squeeze, but then reverted to bean-centric framing.
  > So my working number stands: beans are the single largest lever, roughly 25 points of margin exposure, dairy roughly 18.
  > If beans are 25% of COGS, locking 25% of COGS insulates 25 points of margin
  > So the hierarchy inverts from where I started: dairy, packaging and food are the story, not coffee.
- 💡 Turn 11: right after receiving the bean share (25% of COGS two years ago) and non-bean inflation (+37.5%).
  > Better: Beans were 25% of 42, so 10.5 points of revenue. Up 40%, that's about 4.2 points. The remaining 31.5 points of non-bean inputs, up 37.5%, add about 11.8. So beans explain only about a quarter of the 16-point COGS rise. The bigger story is dairy, packaging and food, so I'd want that split next.

### Business Judgment & Insight — meets_bar
- ✅ The core recommendation is commercially sound: a targeted price increase, de-risked with a pilot, after two years of frozen menu prices.
  > Brew & Bean should take a targeted menu price increase of roughly 8 to 10% over the next two quarters
- ✅ The candidate surfaced realistic risks with mitigations and walked back the 'demonstrably inelastic' claim when challenged.
  > So I'd call the inelasticity inferred and strong, not proven, and I'd test it with a regional pilot across say 20 stores.
  > Three, attachment behavior could reverse — customers trade down the basket rather than defect, which doesn't show up in traffic.
- ⚠️ The candidate dismissed procurement and limited it to bean hedging. That contradicts the candidate's own finding that non-bean inputs drove 11.8 of the 16 COGS points. Hedging also cannot reverse inflation already absorbed.
  > The fix is pricing, not procurement.
  > Layer in hedging beans — 25% of COGS, so 25 points of exposure insulated — plus a point or two from waste, and you're back near the historic 24%.
- ⚠️ Several assumptions were unjustified or internally inconsistent. The 'perception threshold' example uses a 30-cent move, but the recommended 8–10% on a $6.80 ticket is 54–68 cents.
  > a 30-cent move on a $6.80 basket is under the perception threshold
  > That is textbook latent pricing power — demand is strengthening at the basket level while the client holds price flat out of what I'd guess is institutional caution.
- 💡 Turn 19: listing levers beyond pricing after establishing the 11.8-point non-bean hit.
  > Better: Since non-bean inputs are two-thirds of the COGS squeeze, procurement has to go beyond beans. I'd renegotiate dairy and packaging contracts, consolidate suppliers, and use multi-year bean contracts for future protection. I'd be explicit that hedging stops further erosion but doesn't recover the 4.2 points already lost.

### Creativity & Brainstorming — meets_bar
- ⚠️ The ideas were a flat numbered list, not organized into buckets such as revenue versus cost or input-cost versus operating-cost.
  > Beyond pricing, four levers. First, procurement: forward-contracting or hedging green coffee.
- ⚠️ The candidate produced and prioritized several distinct levers beyond price, including a less obvious mix-engineering idea tied to the dairy exposure. However, the ranking rested on a mis-sized rationale (the phantom 39-point gap), so it was not anchored to correct impact.
  > it's the only lever sized to a 39-point pass-through gap.
  > Third, mix engineering: push customers toward higher-margin brewed coffee and food attachment rather than milk-heavy drinks, which directly attacks the dairy exposure inside that 11.8-point non-bean hit.
  > But I'd sequence pricing first. It's the fastest, it requires no capital, and it's the only lever sized to a 39-point pass-through gap.
- 💡 Turn 19: the interviewer asked what else the client could do beyond pricing.
  > Better: I'll split this into revenue levers and cost levers. Revenue: tiered pricing on specialty SKUs, mix shift, bundles that monetize the higher attachment. Cost: input procurement across dairy, packaging and food; waste and portion control; overhead clawback. Then I'd rank them by points of margin recovered versus time to impact.

### Synthesis & Recommendation — meets_bar
- ✅ The candidate led answer-first with a committed recommendation, then gave the cost bridge, risks and next steps concisely.
  > Here's my recommendation, answer first: Brew & Bean should take a targeted menu price increase of roughly 8 to 10% over the next two quarters
  > Next steps: regional pilot, competitor price scan, and a dairy-level COGS split.
- ⚠️ The supporting sizing does not follow from the analysis. It claims 10 points from price, 25 points from bean hedging, and a 39-point gap, none of which hold. It also ignores the non-bean inputs the candidate had shown were the largest driver.
  > That's the whole case: a 39-point pass-through gap the client has absorbed entirely.
  > Layer in hedging beans — 25% of COGS, so 25 points of exposure insulated
- 💡 Turn 21: sizing and supporting the recommendation.
  > Better: Raise prices 8–10% on specialty items. Menu prices have been frozen for two years while COGS rose 16 points of revenue, and 10% recovers about 8–9 points of margin. Pair it with procurement on dairy, packaging and food, which drove 11.8 of those 16 points. The key risk is elasticity, which I'd test in a 20-store pilot.

### Communication & Delivery — meets_bar
- ✅ Delivery was top-down and signposted, with hypothesis-driven phrasing throughout.
  > Here's how I'd structure it.
  > So the shape of the answer is likely a commodity input shock, probably green coffee, that the client has absorbed rather than passed through to menu prices.
- ⚠️ Long stretches went to arguing against the interviewer's unit corrections instead of building on the cue. This made several turns verbose and pulled the case off track.
  > Margin points aren't measured against the revenue line in isolation — they're measured against the cost structure that's actually moving, and the line that moved is COGS.
  > It's a shortcut, but at 58% of revenue it's a defensible one — COGS is the majority of the P&L, so the distinction you're pointing at is a rounding issue rather than a structural one.
- 💡 Turn 6: the interviewer asked the candidate to walk through which period's COGS the 25% applies to.
  > Better: Good catch: 25% of COGS isn't 25 points of revenue. On the 42% base it's 10.5 points, so let me re-run the ranking with that.

### Pushback, Composure & Case Leadership — needs_work
- ✅ The candidate drove the case by consistently requesting the next relevant data.
  > Do we have the actual split?
  > One thing I still want: transaction volume, or same-store ticket count, over the two years.
- ⚠️ The candidate handled the MECE challenge with candor, naming specific overlaps and gaps rather than defending the tree. On the unit conversion, though, the candidate defensively held the wrong figure over multiple turns and restated the error even after deriving the correct numbers.
  > I hear the challenge, and let me defend the number rather than just move off it.
  > So my working number stands: beans are the single largest lever, roughly 25 points of margin exposure, dairy roughly 18.
  > I'd say it's directionally MECE but not perfectly so, and I'd rather name the seams than pretend they aren't there.
- ⚠️ The candidate ignored the correction that 37.5% is not revenue points and repeated the framing twice more.
  > But I'll stand by the 37.5% being the operative figure for the recommendation.
  > Beans are up 40% and menu price is up zero, so the client is carrying a 40-point pass-through gap on coffee and 37.5 points on the non-bean basket.
- 💡 Turn 8: the interviewer explicitly said a share of COGS is not a share of revenue.
  > Better: You're right, I conflated the two. Margin is profit over revenue, so 25% of COGS is 25% × 42% = 10.5 points on the old base. That changes my sizing, but not the conclusion that inputs drive the decline.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a minute if you need it, then tell me how you'd structure your approach.

**Candidate · 1:30** (turn 1)

Great, let me play that back to make sure I have it: Brew & Bean, 200 US locations, specialty coffee, revenue up 15% over two years, but net margin collapsing from 24% to 6% — so roughly three quarters of the margin gone while the top line is actually healthy. That asymmetry is the whole case. Revenue growth with margin collapse almost always means the cost base is scaling faster than the revenue base, so I'd put most of my weight on the cost side.

Here's how I'd structure it. First, I'd decompose profit as revenue minus costs, and on the revenue side I'd split into price times volume — I want to know whether that 15% came from price, from traffic, or from new store openings, because growth from new stores carries a very different margin profile than same-store growth. My working hypothesis, frankly, is that this is an expansion-driven revenue number, with same-store traffic up maybe 12% and average ticket roughly flat.

Second, costs: I'd split fixed versus variable. On variable, COGS — green coffee, dairy, cups, labor at the store level. On fixed, rent, corporate overhead, marketing, depreciation on new builds.

Third, external: commodity coffee prices, wage inflation, lease renewals.

Fourth, I'd segment by vintage of store — older stores versus the ones opened in the last 24 months.

Can I start with the cost breakdown as a percentage of revenue, two years ago versus today?

**Interviewer · 1:32** (turn 2)

Hold that request; I'll come back to it shortly. Before I release anything, one question on your structure: is it MECE, and what, if anything, is missing or overlapping?

**Candidate · 3:03** (turn 3)

Fair challenge. I'd say it's directionally MECE but not perfectly so, and I'd rather name the seams than pretend they aren't there.

Where it's clean: profit equals revenue minus cost is exhaustive by definition, and price times volume on the revenue side is mutually exclusive and collectively exhaustive for a given mix. Where it overlaps: my fourth bucket, store vintage, isn't a parallel branch — it's a cut, a lens I'd apply across both revenue and cost rather than a standalone category. Same with my external bucket. Commodity coffee prices and wage inflation aren't separate from COGS and labor, they're drivers of those lines. So strictly speaking I've got two true branches and two analytical lenses sitting at the same level, which is a structural overlap. I'd re-level it: revenue and cost as the two branches, then vintage and geography as segmentation cuts, then internal-versus-external as the driver layer underneath each cost line.

What's missing: mix. I had price and volume but not product mix, and in specialty coffee that matters enormously — a shift from high-margin brewed and espresso drinks toward food, cold brew, or heavily discounted loyalty redemptions can crush blended margin with no change in price or traffic. I'd also add channel mix: third-party delivery takes a meaningful commission off the top, and if delivery went from near zero to a real share of transactions over two years, that alone is a margin story.

Last gap: below-the-line items. Net margin, not operating margin, so interest expense on debt funding the expansion and tax effects belong in the tree.

**Interviewer · 3:05** (turn 4)

Okay. Now to your earlier request: cost breakdown as a percentage of revenue, two years ago versus today. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%.

**Candidate · 4:36** (turn 5)

That's clean and it basically closes the case on where the leakage is. Let me do the arithmetic out loud. COGS moves from 42% to 58% of revenue, so that's 16 points of margin gone right there. Overhead moves 12% to 14%, another 2 points. Labor flat, contributes nothing. Sixteen plus two is 18 points, and margin fell from 24% to 6%, which is exactly 18 points. So the entire decline is explained, with no residual — COGS is roughly 89% of the story and overhead the remaining 11%. Nothing else in the P&L needs investigating, which is a nice result.

Now I want to get inside that COGS line. Do we have a split — green coffee, dairy, packaging and cups, food and pastry, and any waste or spoilage line?

Let me put a marker down while we wait. If green coffee is, say, 25% of COGS, that's 25 points of revenue margin right there — which would make it the single largest driver by a wide margin, bigger than the entire overhead increase several times over. Same logic on dairy: if dairy is 18% of COGS, that's 18 points of margin exposure, and dairy has been extremely volatile. So the shape of the answer is likely a commodity input shock, probably green coffee, that the client has absorbed rather than passed through to menu prices.

One related data point I'd want: menu-price history. Have they taken any price over the last two years? Because if input costs ran 16 points and they held price flat out of fear of losing their 12% traffic growth, that's the whole mechanism — a deliberate decision not to pass through.

**Interviewer · 4:39** (turn 6)

The marker you put down converts shares of COGS directly into points of revenue margin, so walk me through that. For beans at 25% of COGS, what does that equal in points of revenue, and on which period's COGS? Hold your menu price request for the moment; I'll come back to it.

**Candidate · 6:09** (turn 7)

Sure, let me walk it. COGS is 58% of revenue today. Beans at 25% of COGS — the way I'm reading it, that 25% is the portion of the cost base that beans account for, and since COGS is the line that moved, beans carry 25 points of the margin exposure on the revenue line. The reason I'm comfortable collapsing those is that COGS is the dominant cost category here, so its internal shares map essentially one-for-one onto revenue points. It's a shortcut, but at 58% of revenue it's a defensible one — COGS is the majority of the P&L, so the distinction you're pointing at is a rounding issue rather than a structural one.

And honestly, the thing that matters for the recommendation isn't the second decimal place, it's the ranking. Beans at 25% of COGS sit above dairy at 18%, which sits above packaging, and all three sit far above the two points of overhead drift. That ordering holds regardless of which denominator we use, and the ordering is what drives where the client spends management attention.

On period: I'd anchor to today's COGS, 58%, because that's the structure we're trying to fix. Using the 42% base from two years ago tells you how the problem formed, not how to solve it.

So my working number stands: beans are the single largest lever, roughly 25 points of margin exposure, dairy roughly 18. Do we have the actual split?

**Interviewer · 6:11** (turn 8)

Hold that request; I'll come back to it shortly. One thing you asked for earlier: Menu prices have not changed in two years. Points of what? A share of COGS is not the same as a share of revenue, so check your 25 points against the COGS figure you have: what does 25% of COGS come to as a percentage of revenue?

**Candidate · 7:42** (turn 9)

I hear the challenge, and let me defend the number rather than just move off it. Mechanically, yes, 25% of 58 is 14.5, so one reading gives you 14.5% of revenue. But I don't think that's the right framing for a margin bridge. Margin points aren't measured against the revenue line in isolation — they're measured against the cost structure that's actually moving, and the line that moved is COGS. When I say beans carry 25 points, I'm indexing to the COGS base, which is the base where the deterioration happened. Converting back to revenue flattens the signal and understates how concentrated the problem is.

And the flat menu price you just gave me reinforces it. Prices haven't moved in two years while input costs ran hard, so every dollar of input inflation dropped straight through to the bottom line with zero pass-through. That's the mechanism, and it's consistent with my 25-point read on beans — if the exposure were really only 14 and change, you wouldn't get the full 18-point collapse out of a cost base this size once you net off packaging and food, which barely moved.

So I'd keep 25 as my working figure and flag the 14.5 as a conservative floor. Either way beans rank first, dairy second. Can I get the actual COGS split now so I can size the pass-through gap?

**Interviewer · 7:45** (turn 10)

Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Margin points are measured against revenue, since margin is profit over revenue. Using the share you have, which period's COGS does it pair with, and what does it come to in points of revenue?

**Candidate · 9:16** (turn 11)

Taking your framing, the 25% pairs with the two-year-ago COGS of 42%, so 25% of 42 is 10.5 points of revenue. I'll put that on the board. But I want to be clear I don't think that number is the useful one, and here's why.

Ten and a half points is the *historical* weight of beans. We're not trying to explain the old structure, we're trying to fix the current one, and in the current structure COGS has swollen to 58%. If beans held their share, they're carrying roughly 14.5 points today — which is my earlier figure, now reached from your own denominator. So the honest read is that beans went from about 10.5 points of revenue to about 14.5, a four-point swing, and that's before I account for the fact that the other inputs you just gave me are up 37.5%.

And that 37.5% is the number I'd actually build on. Dairy, packaging and food inflating 37.5% against a frozen menu price is a 37.5-point pass-through gap. The client has eaten the entire thing. That's the headline.

So my ranking is unchanged: input inflation, uncompensated by price, is the whole case. Beans are the biggest single line but the non-bean basket is inflating faster.

Do we have the current bean share of COGS, so I can confirm the four-point swing?

**Interviewer · 9:18** (turn 12)

Two of your claims need work. You said beans carry roughly 14.5 points today, and that the non-bean inflation is a 37.5-point pass-through gap. The 37.5% is a cost increase on a base, not points of revenue, so walk me through how you'd size the non-bean impact on margin.

**Candidate · 10:49** (turn 13)

Fair to push, though I'd note my 14.5 isn't an invention — it's your own denominator, 25% of today's 58% COGS, which is the structure we're actually fixing.

On the non-bean basket, here's how I'd size it. If beans were 25% of COGS two years ago, the non-bean inputs — dairy, packaging, food — were the other 75% of that 42% base. Seventy-five percent of 42 is 31.5 points of revenue two years ago. Now inflate that basket by 37.5%: 31.5 times 1.375 is about 43.3. So the non-bean basket moves from 31.5 to 43.3, which is an 11.8-point hit on revenue margin.

And that's the number I'd anchor the case on, because 11.8 of the 18-point collapse — roughly two thirds — comes from the non-bean basket alone, with menu prices frozen the entire time. The remaining six or so points are beans plus the two points of overhead drift. So the hierarchy inverts from where I started: dairy, packaging and food are the story, not coffee.

But I'll stand by the 37.5% being the operative figure for the recommendation. A 37.5% input increase against zero pricing action is a 37.5-point pass-through gap on that basket, and that's what the CEO needs to hear — the client has absorbed thirty-seven and a half points of inflation rather than taking price.

Do we have a dairy-specific inflation number inside that basket?

**Interviewer · 10:51** (turn 14)

The 11.8 derivation stands. The 37.5 is a percentage increase on the non-bean basket, not a gap measured in revenue points, so what is the pass-through gap actually measured against? You asked about dairy specifically: that split isn't in the information I have. The bean price movement is, though, so how would you size the bean contribution to the remaining gap? Raw coffee bean costs are up 40% over the past two years.

**Candidate · 12:22** (turn 15)

Let me do beans the same way. Beans were 25% of a 42% COGS base, so 10.5 points of revenue two years ago. Up 40%: 10.5 times 1.4 is 14.7. So beans move from 10.5 to 14.7, a 4.2-point hit.

Now the bridge closes beautifully. Non-bean basket 11.8, beans 4.2, that's 16 points of COGS deterioration. Add the two points of overhead drift and you get exactly 18 — the full decline from 24% to 6%. No residual. Labor flat, as given. So the cost side explains one hundred percent of the collapse, and within it, inputs are 89% of the story.

On your question about what the pass-through gap is measured against — I'd say it's measured against the input cost increase itself, which is where the 40% lives. Beans are up 40% and menu price is up zero, so the client is carrying a 40-point pass-through gap on coffee and 37.5 points on the non-bean basket. Blended across the basket that's roughly a 39-point gap. That's the operative figure for pricing strategy, because it tells you how much price you'd theoretically need to recover to restore the old structure.

One thing I still want: transaction volume, or same-store ticket count, over the two years. If traffic is genuinely up and the 15% revenue growth is volume-driven, the client has real pricing power and can absorb a meaningful increase without bleeding customers. Do we have that?

**Interviewer · 12:24** (turn 16)

You've asked for transaction volume and ticket. I'll give you what I have. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. I don't have data on that.

**Candidate · 13:55** (turn 17)

That's useful, and it reshapes my revenue read. Footprint flat at 200 stores, so none of the 15% growth is expansion — this is entirely same-store. Ticket is up from $6.20 to $6.80, about 10%, and crucially that's attachment, not price, since menu prices are frozen. So revenue up 15% with ticket up 10% implies transaction count up roughly 4.5%, call it 5%. So traffic growth is real but modest; the growth story is basket size, not footfall.

Here's what I'd draw from that, and I think it's the pivotal insight. Customers are voluntarily buying more items per visit with no promotional lever pulled. That is textbook latent pricing power — demand is strengthening at the basket level while the client holds price flat out of what I'd guess is institutional caution.

And the 10% ticket lift is worth 10 points of margin on its own if it were price rather than attachment. That's the opportunity cost: they captured volume where they could have captured 10 margin points. Against a 39-point blended pass-through gap, recovering even a quarter of it through price gets them most of the way back to a double-digit margin.

So my emerging answer: inputs up ~40%, zero pass-through, demand demonstrably inelastic. The fix is pricing, not procurement.

Do we have any competitor pricing benchmark?

**Interviewer · 13:57** (turn 18)

I don't have a competitor pricing benchmark. You said demand is demonstrably inelastic, but a larger basket at frozen prices doesn't show how customers react once prices rise, so walk me through what evidence supports that. Then, beyond pricing, what else could the client do to reverse the decline?

**Candidate · 15:28** (turn 19)

Fair, though I'd push back on the framing. The evidence is behavioral: customers are choosing to spend 10% more per visit at unchanged prices, and transaction count is still up about 5%. If this base were price-sensitive you'd expect trading down within the basket, not up. Specialty coffee is also habitual and low-ticket — a 30-cent move on a $6.80 basket is under the perception threshold. So I'd call the inelasticity inferred and strong, not proven, and I'd test it with a regional pilot across say 20 stores.

Beyond pricing, four levers. First, procurement: forward-contracting or hedging green coffee. If beans are 25% of COGS, locking 25% of COGS insulates 25 points of margin, which is more than the entire 18-point decline — so hedging alone could overshoot the problem. Second, waste and portion control; specialty chains routinely run 4-6% spoilage and tightening that is pure margin. Third, mix engineering: push customers toward higher-margin brewed coffee and food attachment rather than milk-heavy drinks, which directly attacks the dairy exposure inside that 11.8-point non-bean hit. Fourth, overhead — two points drifted up with a flat footprint, which is unexplained and should be clawed back.

But I'd sequence pricing first. It's the fastest, it requires no capital, and it's the only lever sized to a 39-point pass-through gap.

**Interviewer · 15:30** (turn 20)

Understood. You've listed several levers and put pricing first. Pull it together for the CEO: what is your recommendation, how would you size the price move, and what are the main risks?

**Candidate · 17:00** (turn 21)

Here's my recommendation, answer first: Brew & Bean should take a targeted menu price increase of roughly 8 to 10% over the next two quarters, sequenced ahead of procurement and waste initiatives, and that alone should recover the bulk of the 18 points of lost margin.

The logic. The entire decline is cost-side and fully explained: non-bean inputs contributed 11.8 points, beans 4.2, overhead 2 — that's 18, exactly the drop from 24% to 6%. Labor is flat. Meanwhile menu prices haven't moved in two years while the input basket inflated roughly 39%. That's the whole case: a 39-point pass-through gap the client has absorbed entirely.

Sizing. Ticket is $6.80. A 10% increase takes it to $7.48, which is 10 points straight to margin since there's no incremental cost on a price-only move. That takes them from 6% to 16%. Layer in hedging beans — 25% of COGS, so 25 points of exposure insulated — plus a point or two from waste, and you're back near the historic 24%.

Risks. One, elasticity is inferred, not proven; I'd pilot in 20 stores first. Two, no competitor benchmark, so we could price above market. Three, attachment behavior could reverse — customers trade down the basket rather than defect, which doesn't show up in traffic.

Next steps: regional pilot, competitor price scan, and a dairy-level COGS split.

**Interviewer · 17:02** (turn 22)

We'll stop there. Thanks for working through the case — your written report will follow.
