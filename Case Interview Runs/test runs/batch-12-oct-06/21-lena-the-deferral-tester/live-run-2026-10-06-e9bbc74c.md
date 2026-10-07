# Live run — Brew & Bean Profitability

- Session: `e9bbc74c-bd27-4c54-b6db-d8443b467329` · case `prof-001` · status **completed** · 2026-10-06
- Overall: **strong**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **21. Lena — the Deferral Tester**
- Tests: The v3.4 non-response catch and deferral tracking directly: an explicit 'hold that' must be tracked and resolved before CLOSE, and if the data is never released, the resulting unverified assumption must attach a data-coverage caveat rather than a judgment ding.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `menu_price_change`, `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_share_of_cogs`, `bean_price_change`, `non_bean_input_change`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":8,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":0,"crossDimensionRepeats":2,"dataRequestsNotInCase":0,"interviewerErrorMarks":0}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | menu_price_change | menu price changes over the two years | no |
| 3 | release | menu_price_change | menu price changes over the two years | yes |
| 5 | release | cogs_pct, labor_pct, overhead_pct | the cost breakdown as a percent of revenue, current and prior period | yes |
| 7 | release | bean_share_of_cogs, bean_price_change, non_bean_input_change | the COGS split by input category | yes |
| 11 | defer | — | the cost structure exhibit | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 10 | 0 | 0 | — |
| conduct_model | 10 | 0 | 0 | — |
| data_decisions | 5 | 5 | 0 | 1, 3, 5, 7, 11 |
| end_gate | 9 | 1 | 0 | 19 |
| end_rec_ask_gate | 10 | 0 | 0 | — |
| model_turn_validation | 9 | 0 | 0 | — |
| recompute | 10 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 10 | — |
| stall | 10 | 0 | 0 | — |
| stream_buffer_switch | 9 | 0 | 0 | — |
| stream_prefix_mismatch | 9 | 0 | 1 | — |
| style | 10 | 0 | 0 | — |
| timeframe | 10 | 0 | 0 | — |
| turn_kind | 9 | 1 | 0 | 19 |
| unit_check | 8 | 2 | 0 | 9, 11 |
| verified_figures | 9 | 1 | 0 | 7 |
| vetoes | 10 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 10 | 7000 | 264 | $0.008 |
| interviewer (claude-sonnet-5-5) | 9 | 25080 | 1137 | $0.062 |
| coverage (claude-haiku-4-5-20251001) | 9 | 17191 | 1077 | $0.023 |
| data_request (claude-haiku-4-5) | 1 | 980 | 13 | $0.001 |
| judge (claude-opus-5-5) | 1 | 13298 | 11000 | $0.273 |
| verifier (claude-opus-5-5) | 1 | 6661 | 2092 | $0.068 |
| reconcile (claude-opus-5-5) | 1 | 3375 | 3766 | $0.089 |
| candidate simulator (claude-opus-5) | 10 | 26909 | 3977 | $0.234 |

- App cost (interviewer + scoring): **$0.52** · with simulator: **$0.76** · list prices, uncached
- Wall time: 3:56

## Feedback

**Top improvement:** Keep nested percentages in consistent units without prompting. Convert shares of COGS into points of revenue: beans ≈ 4.2 points and other inputs ≈ 11.8 of the 16-point COGS rise. Size the problem as margin points, not as "a 38-point gap" from input inflation.

### Problem Structuring — meets_bar
- ✅ When challenged on MECE, the candidate sharpened the structure by adding same-store vs. new-store, product and channel mix, and one-time vs. recurring costs.
  > Specifically, store count cuts across both — new stores add revenue and costs, so I'd pull that out as its own dimension: same-store performance versus new-store performance.
- ⚠️ The candidate opened with a clear profit = revenue − costs split and an early hypothesis that costs were the driver, but did not commit to a starting point and handed that choice back to the interviewer until prompted.
  > Either way, where would you like me to start — revenue drivers or the cost side?
  > So revenue is up 15% but margin collapsed from 24% to 6% — that's a huge drop, so costs are almost certainly growing much faster than revenue.
  > On costs, I'd split fixed versus variable: COGS (coffee beans, milk, cups), labor, rent and occupancy, and then corporate overhead.
- ⚠️ The objective (find the root cause and reverse it) was not restated, and the structure was not tied to the decision the CEO must make. The "fixed versus variable" label also did not match the line items listed.
  > First, decompose profit into revenue and costs.
- 💡 Turn 1 opening, right after laying out revenue and cost branches.
  > Better: Our goal is to find why margin fell 18 points despite 15% growth and decide how to restore it. Since revenue is growing, my hypothesis is that unit costs rose without price pass-through, so I'd start with costs as a share of revenue, then check pricing power and whether competitors face the same squeeze.

### Quantitative & Analytical Rigor — meets_bar
- ✅ The candidate reconciled the margin bridge accurately: 16 points from COGS plus 2 from overhead equals the 18-point decline.
  > So 16 plus 2 is 18 points — and the margin fell 24% to 6%, which is exactly 18 points.
- ⚠️ After an interviewer probe exposed mixed units in the first pass, the candidate rebuilt the math on a $100 base and sanity-checked it (42% × 1.38 ≈ 58%), but never converted beans' share into revenue points (beans ≈ 4.2 points, other inputs ≈ 11.8 of the 16).
  > Beans are 25% of COGS, up 40%: contributes 0.25 × 40 = 10 points.
  > Fair — I was sloppy with units.
  > If the cost of goods for that same unit rose 38%, then 42% × 1.38 = 58.0% — which is exactly the COGS share we observe today.
- ⚠️ The candidate set up and solved the pricing and break-even equations correctly (X ≈ 17.5%, ~26% allowable volume loss), but the elasticity threshold in the recommendation was asserted without derivation and contradicts that break-even, which implies elasticity up to ~1.7, not 1.
  > At 15%, I'd need elasticity below about 1 to come out ahead
  > To get back to 80% — a 20% margin — X works out to about 17.5%.
  > that's about a 26% volume loss before I'm worse off.
- 💡 Turn 9, weighting the bean vs. other-input increases.
  > Better: Beans were 25% of a 42-point COGS base, about 10.5 points of revenue; up 40% that adds ~4.2 points. Other inputs were ~31.5 points; up 37.5% that adds ~11.8. Together that's the 16-point rise, so beans explain only about a quarter.

### Data & Exhibit Interpretation — strong
- ✅ The candidate isolated COGS as the driver and quantified its share of the decline.
  > So COGS explains roughly 89% of the decline, and that's clearly where the answer is.
- ✅ The candidate avoided the beans trap, recognizing that broad input inflation, not beans alone, drives COGS.
  > So beans only explain about 10 of those 38 points — roughly a quarter. The other three-quarters is dairy, packaging, and food.
- ✅ The candidate read every exhibit line systematically and drew a trajectory insight about urgency, but the structural, non-mean-reverting claim rests on only three data points, and the read closed without a concrete next step.
  > Reading across, COGS goes 42 → 50 → 58, so eight points per year, perfectly linear.
  > They're about twelve months from losing money at the company level.
  > This isn't a one-time commodity shock that might mean-revert; it's a steady grind of input inflation hitting an unchanged price list every single year.
- 💡 Turn 13, closing the exhibit read.
  > Better: So the root cause is flat prices against ~38% input inflation. Next I'd check whether peers raised prices over the same period, which tells us how much pricing room we have.

### Business Judgment & Insight — meets_bar
- ✅ The candidate showed commercial sense that new-store rollout and delivery commissions can dilute margin.
  > because growth from opening new stores can actually drag margin early on.
- ⚠️ The interviewer explicitly raised competitors holding prices, and the candidate never addressed competitive response or relative pricing power.
  > I'd decide it with break-even volume math rather than a gut call.
- ⚠️ The size of the problem was framed with the wrong quantity. The 38% is input-cost inflation, not a margin gap; the actual gap is ~16–18 margin points. The candidate corrected this to 16 points in the recommendation.
  > no amount of procurement savings closes a 38-point gap.
- ⚠️ The candidate surfaced the volume-loss risk and paired it with practical mitigations such as market tests, segmentation, and protecting drip coffee, but justified an aggressive 15–18% across-the-board price rise only with volume-constant math rather than evidence on customer or competitor tolerance.
  > Brew & Bean should raise menu prices roughly 15–18% over the next two to three quarters, phased
  > if it's only drip coffee, I'd hold that as a traffic driver and take price on specialty drinks instead.
  > And I'd segment — urban stores likely tolerate more than suburban.
- 💡 Turn 19: "Suppose a price increase does cost you meaningful volume, or competitors hold their prices."
  > Better: If competitors hold, I'd first check whether they face the same 38% input inflation. If they do, they can't hold for long. Meanwhile I'd lead on specialty drinks where we're differentiated and keep drip coffee near competitor parity.

### Creativity & Brainstorming — strong
- ✅ The candidate organized ideas into clear buckets (pricing, cost, mix/revenue, structural) with many distinct ideas.
  > Let me go wide, grouped into three buckets.
- ✅ Non-obvious ideas included elasticity-based differential pricing, add-on charges, good-better-best tiering, and a house blend.
  > price the high-elasticity items like drip coffee gently and take more on lattes and cold drinks; good-better-best tiering; charging for add-ons like oat milk and extra shots
- ✅ The candidate prioritized the top pick explicitly and tied it back to the root cause, but did not rank the remaining cost and mix levers, and announced three buckets while delivering four.
  > The priority is pricing, though — that's the mismatch we identified
  > Structural: close or remodel underperforming stores, and revisit the new-store rollout if those units are dilutive.
- 💡 End of turn 15, after listing the ideas.
  > Better: Ranked by impact and speed: first, selective pricing on specialty drinks; second, procurement across dairy, packaging, and beans; third, mix levers like food attach. Structural moves come last because they're slow and costly.

### Synthesis & Recommendation — strong
- ✅ The candidate led with a committed, specific recommendation, including a durable fix.
  > My recommendation: Brew & Bean should raise menu prices roughly 15–18% over the next two to three quarters, phased, and then index prices to input costs annually so this never recurs.
- ✅ The recommendation was backed by quantified impact, the diagnosed root cause, and concrete next steps, but the risk statement relied on an underived elasticity threshold, which weakened an otherwise tight close.
  > Why pricing: the root cause is two years of flat prices against ~38% blended input inflation.
  > Next steps: price-elasticity test in 10–20 stores, parallel supplier renegotiation and hedging on beans and dairy, and a loyalty program to retain regulars through the increase.
  > At 15%, I'd need elasticity below about 1 to come out ahead
- 💡 Turn 17, framing procurement's role.
  > Better: Pricing closes most of the gap. Procurement across all inputs, not just beans, protects the margin, since beans drove only about a quarter of the COGS rise.

### Communication & Delivery — strong
- ✅ The candidate was answer-first with clear signposting through most of the case, but the opening ended by deferring direction to the interviewer instead of stating a prioritized path.
  > This confirms it, and it adds one useful thing: the trajectory.
  > I'd decide it with break-even volume math rather than a gut call.
  > Either way, where would you like me to start — revenue drivers or the cost side?
- ✅ The candidate used hypothesis-driven language and built on interviewer cues.
  > Good — that confirms the assumption, so the 15% is pure volume or new stores, and every cost increase flows straight to the bottom line with no pricing offset.
- 💡 Turn 1 close.
  > Better: I'll start with costs as a share of revenue, since revenue is growing. Do we have that breakdown, along with menu-price history?

### Pushback, Composure & Case Leadership — strong
- ✅ On the MECE challenge, the candidate acknowledged it specifically and updated the structure with explicit reasoning.
  > Fair challenge. Revenue versus cost is MECE at the top level, but my sub-branches aren't clean.
- ✅ The candidate owned the units error and rebuilt the math, reconciling it to the 16-point rise.
  > Fair — I was sloppy with units. Let me redo it.
- ✅ The candidate drove the case by requesting targeted data and proposing tests.
  > Then I'd want that biggest line broken into price versus quantity. Do we have that breakdown?
- ⚠️ In the final challenge, the candidate held the pricing position with math but left the competitor scenario unanswered.
  > So I'd push until projected volume loss approaches roughly half that cushion, call it 12–13%, and stop there.
- 💡 Turn 19: the interviewer raised "competitors hold their prices."
  > Better: My position holds on specialty drinks, but if peers hold drip prices I'd match them there. The test is whether competitors face the same inflation; if they do, they will follow within a few quarters.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a moment, then walk me through how you'd approach this.

**Candidate · 0:06** (turn 1)

Let me take a second to lay this out.

So revenue is up 15% but margin collapsed from 24% to 6% — that's a huge drop, so costs are almost certainly growing much faster than revenue. My approach would be:

First, decompose profit into revenue and costs. On revenue, I'd want to know whether the 15% growth came from more stores, more transactions per store, or higher prices per ticket — because growth from opening new stores can actually drag margin early on.

On costs, I'd split fixed versus variable: COGS (coffee beans, milk, cups), labor, rent and occupancy, and then corporate overhead. Then I'd find which line grew fastest as a percent of revenue.

One thing before I dig into costs — do we have menu-price history over the two years? Whether they raised prices matters for reading the revenue growth.

Either way, where would you like me to start — revenue drivers or the cost side?

**Interviewer · 0:08** (turn 2)

Okay, a revenue-and-cost split. I'll come back to menu price changes over the two years shortly. Before we go into data: is that structure MECE, and what might it be missing? Then tell me which branch you'd prioritize, and why.

**Candidate · 0:15** (turn 3)

Fair challenge. Revenue versus cost is MECE at the top level, but my sub-branches aren't clean. Specifically, store count cuts across both — new stores add revenue and costs, so I'd pull that out as its own dimension: same-store performance versus new-store performance. That's probably the sharper cut.

What I'm missing: mix. Both product mix — if they've shifted toward food or cold drinks with different margins — and channel mix, like delivery apps, which carry commissions that hit margin hard. I'd also flag one-time versus recurring costs; a two-year decline could partly be investment spend like a new POS rollout or remodels.

I'd prioritize the cost branch. Revenue grew 15%, so demand isn't the problem — the issue is that something on the cost side is scaling faster. And since I haven't heard that prices moved, I'll assume menu prices held flat, which means that 15% is volume or store count, not pricing. That makes it even more likely the answer sits in costs.

**Interviewer · 0:18** (turn 4)

Okay, cost branch first. On what you asked about earlier: Menu prices have not changed in two years. Which specific cost data would you want first, and what would you be looking for in it?

**Candidate · 0:24** (turn 5)

Good — that confirms the assumption, so the 15% is pure volume or new stores, and every cost increase flows straight to the bottom line with no pricing offset.

What I'd want first is the full cost breakdown as a percentage of revenue for both year one and year two — COGS, labor, rent and occupancy, marketing, and corporate overhead. Percent of revenue rather than absolute dollars, because revenue grew 15%, so a cost line can grow in dollars and still be fine; what matters is whether it outpaced that 15%.

What I'm looking for: the margin fell 18 points, so I want to see which lines account for that 18. If it's one line, it's a specific operational issue. If it's spread evenly across all of them, that points to something structural — like new stores running at much worse unit economics and dragging the average.

Then I'd want that biggest line broken into price versus quantity. Do we have that breakdown?

**Interviewer · 0:26** (turn 6)

Okay. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Which of those lines accounts for most of the margin decline, and what would you want to dig into next?

**Candidate · 0:33** (turn 7)

Let me add it up. COGS went from 42% to 58%, that's 16 points. Overhead 12% to 14%, 2 points. Labor flat. So 16 plus 2 is 18 points — and the margin fell 24% to 6%, which is exactly 18 points. So COGS explains roughly 89% of the decline, and that's clearly where the answer is.

What I'd dig into next: COGS as a percent of revenue rose while menu prices stayed flat, so the cost per unit sold went up and nothing offset it. I'd break that into a few buckets.

First, input prices — what happened to green coffee bean costs and dairy over the two years? Commodity spikes would do this.

Second, waste and spoilage — is more product being thrown out?

Third, product mix — did they shift toward lower-margin items like food or elaborate cold drinks?

Fourth, portion sizes or recipe changes, and supplier terms — did they lose a volume discount or switch vendors?

Do we have the split of COGS by input category across the two years?

**Interviewer · 0:35** (turn 8)

Okay, a split of COGS by input. Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. With those figures in hand, what is driving the COGS increase, and how would you test it?

**Candidate · 0:43** (turn 9)

Let me do the weighting, because the narrative "beans spiked 40%" is a bit of a trap.

Beans are 25% of COGS, up 40%: contributes 0.25 × 40 = 10 points. Everything else is 75% of COGS, up 37.5%: 0.75 × 37.5 = 28.1 points. Total blended input inflation is about 38%.

So beans only explain about 10 of those 38 points — roughly a quarter. The other three-quarters is dairy, packaging, and food. This isn't a coffee bean story, it's broad-based input inflation across the whole basket.

And it ties out: COGS went from 42% to 58% of revenue, which is a 38% increase in the ratio — almost exactly the blended input inflation. That tells me volumes and portions are behaving normally and there's no hidden waste problem. It's purely that costs inflated ~38% and menu prices were held flat for two years, so none of it was passed through.

To test it: confirm unit volumes per store are roughly flat-to-up, and check that COGS per transaction rose in line with that 38%.

**Interviewer · 0:45** (turn 10)

Okay. You said beans contribute ten points and the rest about twenty-eight, so the ratio rose roughly thirty-eight percent. Points of what? Walk me through how those weighted figures connect to the sixteen-point rise in COGS as a share of revenue.

**Candidate · 0:51** (turn 11)

Fair — I was sloppy with units. Let me redo it.

The 10 and 28 are points of COGS inflation, not points of revenue. So: if COGS was $100 two years ago, beans were $25 and other inputs $75. Beans up 40% → $25 becomes $35, so +$10. Other inputs up 37.5% → $75 becomes $103.13, so +$28.13. New total is $138.13, so the basket inflated about 38%.

Now connect that to revenue share. COGS was 42% of revenue. Menu prices are flat, so the revenue per unit sold didn't move. If the cost of goods for that same unit rose 38%, then 42% × 1.38 = 58.0% — which is exactly the COGS share we observe today.

So the 16-point rise in COGS share is just the 38% input inflation applied to the original 42% base, with zero price pass-through. The two figures are consistent, and that consistency is what tells me there's no separate waste or mix problem hiding in there.

**Interviewer · 0:54** (turn 12)

Okay, the units reconcile. Take a look at this: Brew & Bean Cost Structure Over Time. Take a look at this exhibit. What does it tell you, and does it change or confirm your view of the root cause?

**Candidate · 1:00** (turn 13)

This confirms it, and it adds one useful thing: the trajectory.

Reading across, COGS goes 42 → 50 → 58, so eight points per year, perfectly linear. Profit goes 24 → 15 → 6, so nine points down per year. Labor is flat at 22 the entire time, and overhead creeps one point a year, 12 → 13 → 14.

Two takeaways. First, it confirms the root cause — COGS is the whole story, labor is genuinely a non-issue, and overhead is minor noise. Second, the linearity matters. This isn't a one-time commodity shock that might mean-revert; it's a steady grind of input inflation hitting an unchanged price list every single year. That's a structural pricing problem, not a procurement accident.

And it's urgent. If I extrapolate the same eight points next year, COGS hits 66, overhead 15, and profit goes to roughly negative 3. They're about twelve months from losing money at the company level.

So the root cause is two years of flat menu prices against ~38% input inflation.

**Interviewer · 1:02** (turn 14)

Okay. Beyond what we've discussed so far, what else could Brew & Bean do to address this? Give me as wide a range of ideas as you can.

**Candidate · 1:10** (turn 15)

Let me go wide, grouped into three buckets.

Pricing levers: a straight menu price increase; but also smarter versions — price the high-elasticity items like drip coffee gently and take more on lattes and cold drinks; good-better-best tiering; charging for add-ons like oat milk and extra shots; and a loyalty program so regulars feel insulated from the increase.

Cost levers: renegotiate supplier contracts and consolidate vendors for volume discounts; hedge or forward-buy coffee and dairy to lock in prices; vertical integration or direct trade on beans; audit portion sizes and waste; reformulate high-cost recipes; standardize packaging across SKUs; and look at whether a private-label or house blend lowers the bean cost.

Mix and revenue levers: push high-margin items — food attach, retail bags of beans, merchandise; subscription coffee plans for predictable revenue; and reassess delivery-app channels if commissions are eroding margin.

Structural: close or remodel underperforming stores, and revisit the new-store rollout if those units are dilutive.

The priority is pricing, though — that's the mismatch we identified, and no amount of procurement savings closes a 38-point gap.

**Interviewer · 1:12** (turn 16)

Okay, a broad set of ideas. Let's pull it together. If you were presenting to the CEO now, what do you recommend, and what are the next steps?

**Candidate · 1:20** (turn 17)

My recommendation: Brew & Bean should raise menu prices roughly 15–18% over the next two to three quarters, phased, and then index prices to input costs annually so this never recurs.

The math: total costs are 94% of revenue today. Holding unit volume constant, a price increase of X scales revenue but not costs, so costs as a share become 94/(1+X). To get back to 80% — a 20% margin — X works out to about 17.5%. A 15% increase gets costs to about 82%, so an 18% margin. Even a 10% increase roughly triples profit from 6% to about 15%.

Why pricing: the root cause is two years of flat prices against ~38% blended input inflation. Procurement savings can't close a 16-point gap.

Risks: volume loss. At 15%, I'd need elasticity below about 1 to come out ahead — worth testing in a few markets first.

Next steps: price-elasticity test in 10–20 stores, parallel supplier renegotiation and hedging on beans and dairy, and a loyalty program to retain regulars through the increase.

**Interviewer · 1:22** (turn 18)

Okay. You said the biggest risk is volume loss. Suppose a price increase does cost you meaningful volume, or competitors hold their prices. How would you decide how far to push, and what would you do if the test came back unfavorable?

**Candidate · 1:30** (turn 19)

I'd decide it with break-even volume math rather than a gut call.

At today's structure, COGS is 58% of revenue, so contribution margin per unit is about 42%. If I raise price 15%, I can afford to lose volume until the gain is wiped out. Roughly: new contribution per unit is (1.15 − 0.58)/1.15 ≈ 49.6% of the new price. To hold total contribution constant, volume can fall until 1.15 × 0.496 equals 1.00 × 0.42 — that's about a 26% volume loss before I'm worse off. That's a wide cushion, which makes me fairly comfortable pushing.

So I'd push until projected volume loss approaches roughly half that cushion, call it 12–13%, and stop there.

If the test came back unfavorable, I'd first check whether the loss is uniform or concentrated — if it's only drip coffee, I'd hold that as a traffic driver and take price on specialty drinks instead. Then I'd shift weight to mix and cost levers: food attach, bean retail, supplier renegotiation, hedging. And I'd segment — urban stores likely tolerate more than suburban.

**Interviewer · 1:30** (turn 20)

We'll stop there. Thanks for working through the case — your written report will follow.
