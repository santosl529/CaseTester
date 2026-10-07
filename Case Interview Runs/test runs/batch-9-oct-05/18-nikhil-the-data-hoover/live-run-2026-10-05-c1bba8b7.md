# Live run — Brew & Bean Profitability

- Session: `c1bba8b7-415e-4259-91ca-5605f2350119` · case `prof-001` · status **completed** · 2026-10-05
- Overall: **meets_bar**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **18. Nikhil — the Data Hoover**
- Tests: Rule 11 under volume: every request must be released, refused, or explicitly deferred — none may be silently skipped. Also tests Rule 10 labeling when multiple figures are released at once.
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `stores_count`, `cogs_pct`, `labor_pct`, `overhead_pct`, `avg_ticket`, `menu_price_change`, `bean_share_of_cogs`, `non_bean_input_change`, `bean_price_change`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":5,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":1,"crossDimensionRepeats":2,"dataRequestsNotInCase":35,"interviewerErrorMarks":0}`
- Assists / interventions: load_shed@25

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | refuse | — | Competitive landscape — market share of Starbucks and regional players | no |
| 1 | refuse | — | Customer satisfaction or NPS scores | no |
| 1 | none | — | Revenue split by store versus wholesale | no |
| 1 | defer | avg_ticket | Average ticket size | no |
| 1 | none | — | Transaction volume per store per day | no |
| 1 | release | stores_count | Number of store openings over the two years | yes |
| 1 | none | labor_pct | Employee headcount and average wage | no |
| 1 | defer | cogs_pct, labor_pct, overhead_pct, bean_share_of_cogs, non_bean_input_change | Full cost breakdown by line item for both years | no |
| 3 | refuse | — | Marketing spend | no |
| 3 | refuse | — | New product lines launched | no |
| 3 | refuse | — | Store-level profitability variance across the 200 | no |
| 3 | refuse | — | Loyalty program penetration | no |
| 3 | defer | menu_price_change | Menu pricing changes over the two years | no |
| 3 | defer | cogs_pct | COGS as a percent of revenue in both years | no |
| 3 | defer | bean_price_change | Coffee bean commodity prices over the period | no |
| 3 | defer | labor_pct | Labor cost as a percent of revenue | no |
| 3 | refuse | — | Rent and lease terms per location | no |
| 5 | refuse | cogs_pct | Gross margin by year | yes |
| 5 | refuse | — | SG&A as a percent of revenue | no |
| 5 | refuse | — | D&A (depreciation and amortization) | no |
| 5 | refuse | — | Interest expense and debt load | no |
| 5 | refuse | — | One-time charges or write-offs | no |
| 5 | refuse | — | Franchise versus company-owned mix | no |
| 5 | refuse | — | Average hourly wage trend | no |
| 5 | refuse | bean_price_change, non_bean_input_change | Supplier contract terms on beans and dairy | no |
| 5 | refuse | — | Transaction volume by year | no |
| 5 | release | avg_ticket, menu_price_change | Average transaction value by year and breakdown of growth (price vs. volume) | yes |
| 7 | release | bean_price_change, non_bean_input_change | Whether COGS increase is driven by input prices rising versus volume of low-margin items | yes |
| 7 | release | bean_share_of_cogs, non_bean_input_change | COGS split into beans, dairy, pastry, and packaging | yes |
| 7 | release | bean_price_change | Bean price per pound by year | yes |
| 7 | refuse | — | Waste or spoilage rate | no |
| 7 | refuse | — | Product mix shift by category | no |
| 7 | release | non_bean_input_change | Dairy cost trend | yes |
| 7 | refuse | — | Margin on food items versus beverages | no |
| 7 | refuse | — | Number of SKUs added | no |
| 7 | refuse | — | Change in cup or packaging supplier | no |
| 9 | refuse | — | Coffee bean futures outlook | no |
| 9 | refuse | — | Hedging contracts in place | no |
| 9 | refuse | — | Dairy supplier concentration | no |
| 9 | refuse | — | Competitor pricing moves | no |
| 9 | refuse | — | Price elasticity estimates | no |
| 9 | refuse | — | Store-level waste | no |
| 9 | refuse | — | Regional cost variation | no |
| 9 | refuse | — | Private-label options | no |
| 11 | refuse | non_bean_input_change | Dairy share within the other inputs bucket of COGS | yes |
| 11 | refuse | — | Bean cost per pound in dollars | no |
| 13 | refuse | — | Items per visit broken down by product category | no |
| 15 | refuse | — | Beverage versus food split of incremental items sold | no |
| 17 | refuse | — | Data on current contract lengths or procurement centralization | no |
| 19 | none | — | Share of volume from loyalty or subscription customers | no |
| 19 | none | — | Price elasticity for menu items | no |
| 19 | none | — | Competitor pricing levels and whether competitors have raised prices | no |
| 25 | refuse | labor_pct | Fixed vs. variable breakdown of the 22% labor cost | yes |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| action_validation | 14 | 0 | 0 | — |
| assumption_guard | 13 | 0 | 1 | — |
| conduct | 14 | 0 | 0 | — |
| conduct_model | 14 | 0 | 0 | — |
| copied_check_in | 14 | 0 | 0 | — |
| data_promise | 14 | 0 | 0 | — |
| end_gate | 14 | 0 | 0 | — |
| end_rec_ask_gate | 14 | 0 | 0 | — |
| exhibit_promise | 14 | 0 | 0 | — |
| fabricated_turn | 14 | 0 | 0 | — |
| final_message_release | 1 | 0 | 0 | — |
| forced_release | 1 | 0 | 13 | — |
| grace_ask | 14 | 0 | 0 | — |
| meta_leak | 14 | 0 | 0 | — |
| offer_accepted | 14 | 0 | 0 | — |
| probe_guard | 14 | 0 | 0 | — |
| provenance | 14 | 0 | 0 | — |
| recompute | 14 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 14 | — |
| same_turn_resolution | 9 | 3 | 2 | 1, 3, 19 |
| spoken_close | 14 | 0 | 0 | — |
| stale_release | 12 | 0 | 0 | — |
| stall | 14 | 0 | 0 | — |
| stream_buffer_switch | 14 | 0 | 0 | — |
| stream_prefix_mismatch | 9 | 0 | 5 | — |
| style | 14 | 0 | 0 | — |
| synthesis_guard | 14 | 0 | 0 | — |
| system_language | 14 | 0 | 0 | — |
| time_warning | 14 | 0 | 1 | — |
| timeframe | 14 | 0 | 0 | — |
| unit_check | 13 | 1 | 0 | 9 |
| verified_figures | 13 | 1 | 0 | 21 |
| wordless_exhibit | 14 | 0 | 0 | — |
| wordless_reveal | 14 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 14 | 9050 | 374 | $0.011 |
| data_request (claude-haiku-4-5) | 28 | 27838 | 5363 | $0.055 |
| interviewer (claude-sonnet-5-5) | 14 | 51245 | 1410 | $0.117 |
| coverage (claude-haiku-4-5-20251001) | 13 | 29573 | 1648 | $0.038 |
| judge (claude-opus-5-5) | 1 | 15297 | 10803 | $0.277 |
| verifier (claude-opus-5-5) | 1 | 7475 | 2535 | $0.081 |
| reconcile (claude-opus-5-5) | 1 | 3493 | 2070 | $0.055 |
| candidate simulator (claude-opus-5) | 14 | 44408 | 4326 | $0.330 |

- App cost (interviewer + scoring): **$0.63** · with simulator: **$0.96** · list prices, uncached
- Wall time: 23:30

## Feedback

**Top improvement:** Open with a hypothesis-led structure instead of a data request. Restate the objective, lay out three or four tailored cost and revenue buckets for a coffee chain, and commit to where you'd start and why. Then replace the reflexive eight-item data lists with the one or two data points that would confirm or kill your current hypothesis.

### Problem Structuring — meets_bar
- ⚠️ The candidate eventually laid out a recognizable profit tree with an early, fact-based hypothesis that costs were the driver, but only after the interviewer asked for it; the opening skipped structure entirely and went straight to an eight-item data request.
  > Okay, great. Before I frame this, could I get some data?
  > Structurally I'd say profit equals revenue minus costs, so I'd look at both sides — revenue being price times volume, costs split into fixed and variable — and since revenue is up 15% but margin collapsed, costs are likely the driver.
- ⚠️ The cost split (fixed vs. variable) was generic rather than tailored to a coffee chain (COGS / labor / occupancy), and the candidate declined to prioritize a branch when asked directly.
  > On prioritization, I'd really want the numbers before I pick a branch.
- ⚠️ The candidate never restated the CEO's objective (find the root cause, then reverse it) or linked the structure to that decision.
  > Understood, footprint flat at 200.
- 💡 Turn 1, right after the prompt, the candidate opened with a data request before stating any framework.
  > Better: Our goal is to explain an 18-point margin drop on 15% revenue growth and find how to reverse it. Profit is revenue minus costs. On revenue I'd look at price, transactions and basket. On costs I'd look at COGS (beans, dairy, packaging, food), store labor, and occupancy/overhead. Since revenue grew, I'd hypothesize a cost problem, most likely COGS from commodity inflation. I'd also check whether we've passed any of it through in pricing and whether peers are seeing the same thing.

### Quantitative & Analytical Rigor — strong
- ✅ The candidate decomposed the COGS inflation correctly with a clear base-100 setup and cross-checked it against the 58/42 ratio, but first presented it in unlabeled 'points' that read like margin points; the units (points of revenue: ~4.2 from beans, ~11.8 from other inputs) only became clear after the interviewer challenged them.
  > So: if COGS was 100 units two years ago, beans were 25 of that and other inputs 75.
  > And that 38% matches the 58/42 ratio
  > so that contributes 0.25 × 40 = 10 points
- ✅ The candidate derived algebraically why the COGS ratio tracks unit cost under flat prices, and flagged the stable-mix assumption.
  > The ratio is then just cost per unit over price per unit. Price per unit is unchanged, so the ratio moves one-for-one with cost per unit.
- ✅ The pricing math was ultimately sound: on the walk-through the candidate corrected an earlier ~5-point sizing of a 10% price rise to the fuller ~8.6 points at flat volume, unprompted, by adding the labor and overhead denominator effect that the first estimate had ignored.
  > One thing I understated, though — labor and overhead are also expressed as a percent of revenue.
  > At a 10% price increase we can lose up to about 9% of transactions and still be revenue-neutral
  > A 10% price increase gets COGS to about 53% of revenue, recovering roughly 5 points.
- 💡 Turn 9, decomposing the COGS increase into beans vs. other inputs.
  > Better: Beans are 25% of a 42% COGS base, so about 10.5 points of revenue; up 40%, that adds ~4.2 points. Other inputs are ~31.5 points of revenue; up 37.5%, that adds ~11.8. Together that's the 16 points, so beans explain only about a quarter of the problem.

### Data & Exhibit Interpretation — strong
- ✅ The candidate isolated COGS as the driver with exact attribution of the 18 points and confirmed it against the exhibit trend.
  > COGS is the one that moved — 42% to 58%, so 16 points, versus overhead only 2 points and labor flat.
  > All 18 points of margin: 16 from COGS, 2 overhead.
- ✅ The candidate did not stop at beans: the decomposition showed non-bean inputs carry most of the increase, and the candidate tied this to the absence of price pass-through.
  > So input inflation explains essentially the entire move — it's not mix, and prices haven't been raised to offset it.
- ✅ The candidate read the time pattern in the exhibit rather than only the endpoints.
  > And the exhibit shows it's linear, roughly 8 points a year, while labor holds and overhead creeps 1 point a year.
- ⚠️ Next steps were mostly long lists of data requests rather than one targeted, hypothesis-driven check.
  > Still, could I get: one, bean futures outlook; two, hedging contracts in place; three, dairy supplier concentration
- 💡 Turn 13, reading the cost structure exhibit.
  > Better: The exhibit confirms 16 of the 18 points are COGS, and beans explain only about 4 of those. So the fix can't be a bean-hedging story alone. Next, I'd check dairy and packaging contracts and our pricing relative to peers.

### Business Judgment & Insight — strong
- ✅ The recommendation is commercially sound: a phased, piloted price increase that addresses two years of unpassed input inflation, paired with procurement.
  > I'd phase it: 5% now, test in a subset of stores, measure transaction count, then extend.
- ✅ The candidate proactively surfaced elasticity risk and gave a concrete contingency, narrowing to less price-sensitive items rather than abandoning pricing.
  > raise prices selectively on the items where input inflation was worst and demand is least price-sensitive — espresso drinks, food attachments — rather than across the board
- ✅ The candidate distinguished losing transactions from losing the marginal item per visit, a nuanced read of where the revenue growth came from.
  > I'd also want to see whether we lost transactions or just lost the marginal item per visit, since ticket size was doing the work in the first place.
- ⚠️ Early data requests were unfocused, covering NPS, market share, D&A and franchise mix before any hypothesis, which signals weak triage.
  > seven, customer satisfaction or NPS scores; eight, the competitive landscape — market share of Starbucks and regional players in our markets
- ⚠️ The labor reasoning in the 11% vs. 15% choice was muddled. Labor dollars don't scale with price at flat volume, so 15% is the mechanical figure at flat volume, yet the candidate called labor 'almost certainly isn't fully fixed' before reversing.
  > Labor almost certainly isn't fully fixed: baristas are scheduled to traffic, and at flat volume with higher prices you wouldn't need fewer hours, so arguably labor dollars are flat here and the 15% is defensible
- 💡 Turn 25, choosing which profit figure to present.
  > Better: At flat volume a price rise doesn't change labor or overhead dollars, so the mechanical answer is ~15%. I'd present a range: about 15% if volume holds, down toward 11% if we lose a few points of transactions. The pilot tells us where we land.

### Creativity & Brainstorming — meets_bar
- ✅ It included less obvious ideas: alternative-origin beans for non-signature blends, and steering the growing basket toward less-inflated items.
  > look at private-label or alternative-origin beans for the non-signature blends
  > push the basket toward items where input inflation hit less — the ticket is already rising on volume, so there's an opening to steer mix
- ⚠️ The brainstorm was grouped into clear buckets with several distinct levers, but within them the non-price levers were not ranked by impact or speed, and price was placed first only after the interviewer asked.
  > Beyond pricing, a few levers.
  > On procurement: lock in bean supply with forward contracts or hedges rather than buying spot, consolidate volume across the 200 stores into fewer suppliers for better terms
- 💡 Turn 17, closing the brainstorm.
  > Better: Ranking these: pricing is the biggest and fastest lever. Next is procurement across dairy, packaging and food, since that's about three-quarters of the inflation. Waste and portioning is a quick win. Overhead is worth a look but only 2 points.

### Synthesis & Recommendation — strong
- ✅ The candidate led with a clear, committed recommendation and supported it with the margin bridge from the analysis.
  > My recommendation: raise menu prices, phased, starting with a 5% increase tested in a subset of stores
  > Sixteen of those points are COGS, two are overhead, and labor is flat at 22%.
- ✅ The candidate named a specific risk and concrete next steps.
  > Next steps: pilot pricing in 20 stores, run a procurement review on bean and dairy contracts, and check the overhead drift.
- ⚠️ The headline impact was understated (~5 points) because the labor and overhead denominator effect was ignored, and the procurement lever went unsized.
  > A 10% price increase gets COGS to about 53% of revenue, recovering roughly 5 points.
- 💡 Turn 21, sizing the impact for the CEO.
  > Better: A 10% price rise at flat volume takes margin from 6% to roughly 11–15%, depending on how much transactions soften. Procurement on dairy and packaging, three-quarters of the inflation, closes more of the gap without touching customers.

### Communication & Delivery — meets_bar
- ⚠️ Nearly every turn ended with a reflexive eight-item data list, even after repeated signals that the data didn't exist. This diluted otherwise clear answers.
  > Could I get: one, gross margin by year; two, SG&A as a percent of revenue; three, D&A; four, interest expense and debt load
- ⚠️ Later answers were top-down and crisp, leading with the conclusion before the derivation, but the opening went to detail before structure, and the candidate avoided hypothesis language when asked to commit.
  > Okay, great. Before I frame this, could I get some data?
  > Price sits first — it's the fastest and largest lever.
  > I'd put 11% in front of the CEO, and footnote 15% as the upside case.
- 💡 Turn 7, after identifying COGS as the driver.
  > Better: My hypothesis is input-price inflation, not mix. To test it, the one thing I need is the COGS split by input and how each moved.

### Pushback, Composure & Case Leadership — meets_bar
- ✅ Under the units challenge, the candidate acknowledged it and clarified precisely without capitulating.
  > Fair challenge. They're not percentage points of revenue — they're contributions to the percentage increase in total COGS.
- ✅ When the 'clean read' claim was challenged, the candidate held the position with a derivation and named the condition under which it breaks.
  > The 15% volume growth sits in both numerator and denominator and cancels.
- ⚠️ The candidate did not adapt to repeated cues: asked to prioritize a branch, the candidate deflected to more data. Data dumps continued after many 'I don't have that' responses.
  > On prioritization, I'd really want the numbers before I pick a branch.
- 💡 Turn 4: 'which branch would you prioritize first, and why?'
  > Better: I'd start with costs, specifically COGS. Revenue grew 15% on a flat footprint, so revenue can't explain an 18-point margin drop, and commodity inputs are the most volatile line for a coffee chain.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

How would you like to approach this? Feel free to take a moment to gather your thoughts first.

**Candidate · 1:11** (turn 1)

Okay, great. Before I frame this, could I get some data? I'd like: one, the full cost breakdown by line item for both years; two, revenue split by store versus wholesale; three, average ticket size; four, transaction volume per store per day; five, number of store openings over the two years; six, employee headcount and average wage; seven, customer satisfaction or NPS scores; eight, the competitive landscape — market share of Starbucks and regional players in our markets.

That should give me enough to start isolating whether this is a revenue-side or cost-side issue.

**Interviewer · 1:13** (turn 2)

Let's keep to the case. Before I hand over data, I'd like to hear how you'd structure this problem. Take a minute if you need it, then walk me through your framework. To your question on the data: 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. I'll come to that data shortly. That isn't something I have data on.

**Candidate · 2:43** (turn 3)

Understood, footprint flat at 200.

Structurally I'd say profit equals revenue minus costs, so I'd look at both sides — revenue being price times volume, costs split into fixed and variable — and since revenue is up 15% but margin collapsed, costs are likely the driver.

To go further though, I'd want: one, COGS as a percent of revenue in both years; two, coffee bean commodity prices over the period; three, labor cost as a percent of revenue; four, rent and lease terms per location; five, marketing spend; six, any new product lines launched;七, store-level profitability variance across the 200; eight, loyalty program penetration.

Also — has menu pricing changed at all over the two years? That would tell me whether the 15% revenue growth is price or volume.

**Interviewer · 2:45** (turn 4)

I'll come to that data shortly. That isn't something I have data on. Is your framework MECE, and which branch would you prioritize first, and why?

**Candidate · 4:14** (turn 5)

I think it's MECE at the top level — revenue and costs are mutually exclusive and together exhaustive of profit, and within costs, fixed versus variable covers everything.

On prioritization, I'd really want the numbers before I pick a branch. Could I get: one, gross margin by year; two, SG&A as a percent of revenue; three, D&A; four, interest expense and debt load; five, any one-time charges or write-offs; six, franchise versus company-owned mix; seven, average hourly wage trend; eight, supplier contract terms on beans and dairy.

And separately, do we have transaction volume by year? If revenue grew 15% on flat store count, I'd want to know whether that's more customers or higher prices before I commit to a branch.

**Interviewer · 4:18** (turn 6)

COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. Menu prices have not changed in two years. I don't have transaction volume by year, gross margin, SG&A, D&A, debt, one-time charges, franchise mix, wage trend or supplier terms. Looking at what you now have, which cost line would you dig into first, and why?

**Candidate · 5:43** (turn 7)

COGS is the one that moved — 42% to 58%, so 16 points, versus overhead only 2 points and labor flat. That alone roughly accounts for the margin drop.

To dig in, could I get: one, COGS split into beans, dairy, pastry, and packaging; two, bean price per pound by year; three, dairy cost trend; four, waste or spoilage rate; five, product mix shift by category;六, the margin on food items versus beverages; seven, number of SKUs added; eight, any change in cup or packaging supplier.

And is there a per-unit cost figure versus a volume figure inside COGS? I'd want to know if it's input prices rising or us just selling more low-margin items.

**Interviewer · 5:45** (turn 8)

Okay, COGS is where the movement is. Here's the breakdown you asked for. Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Raw coffee bean costs are up 40% over the past two years. I don't have waste rates, SKU counts, category margins or a packaging supplier change. With these numbers in hand, walk me through what drove the COGS increase.

**Candidate · 7:14** (turn 9)

Let me do the math. Beans are 25% of COGS and up 40%, so that contributes 0.25 × 40 = 10 points. Other inputs are the other 75% and up 37.5%, so 0.75 × 37.5 = 28.1 points. Blended, COGS per unit is up about 38%.

And COGS as a share of revenue went 42% to 58%, which is 58/42 = 1.38, so also about 38%. So input inflation explains essentially the entire move — it's not mix, and prices haven't been raised to offset it.

Still, could I get: one, bean futures outlook; two, hedging contracts in place; three, dairy supplier concentration; four, competitor pricing moves; five, price elasticity estimates; six, store-level waste; seven, regional cost variation; eight, private-label options.

**Interviewer · 7:16** (turn 10)

You've got ten and twenty-eight point one as contributions. Points of what? Walk me through the units on those two figures. I don't have futures, hedging, supplier concentration, competitor pricing, elasticity, waste, regional costs or private-label data.

**Candidate · 8:46** (turn 11)

Fair challenge. They're not percentage points of revenue — they're contributions to the percentage increase in total COGS.

So: if COGS was 100 units two years ago, beans were 25 of that and other inputs 75. Beans rise 40%, so 25 becomes 35 — that's +10 units. Other inputs rise 37.5%, so 75 becomes 103.1 — that's +28.1 units. Total COGS goes from 100 to 138.1, a 38% increase. So the "points" are units of original COGS, which conveniently read as percent of the original base.

And that 38% matches the 58/42 ratio, so with flat volume assumptions the whole COGS-to-revenue move is input inflation passed straight through, uncompensated.

Could I also get bean cost per pound in dollars, and the dairy share within the "other inputs" bucket?

**Interviewer · 8:49** (turn 12)

I don't have bean cost per pound or a split within the other inputs. You said revenue per transaction is up while menu prices are flat, so what does that tell you about volume and about the 58 over 42 comparison? Here is a cost structure exhibit to help you check your work.

**Candidate · 10:19** (turn 13)

Right. Revenue is up 15% with flat menu prices, and ticket is up 10% from more items per visit — so transaction count is roughly 1.15/1.10 ≈ 1.045, about 4.5% more transactions. Nothing in the revenue growth came from price.

That matters for the 58/42 comparison: since price per item is unchanged, the revenue denominator only grew with volume and basket size, both of which also grow COGS. So the ratio moving from 42 to 58 is close to a clean read on per-unit input inflation — it isn't being distorted by pricing. And the exhibit shows it's linear, roughly 8 points a year, while labor holds and overhead creeps 1 point a year. All 18 points of margin: 16 from COGS, 2 overhead.

Do we have anything on items-per-visit mix by category?

**Interviewer · 10:22** (turn 14)

I don't have items-per-visit by category. You've called the 58 over 42 ratio a clean read, but that ratio is COGS over revenue, and you've shown revenue grew 15%. Walk me through why COGS per unit and the COGS-to-revenue ratio move by the same 38%.

**Candidate · 11:52** (turn 15)

Because of the flat menu prices. Write it as: COGS = units sold × cost per unit, and revenue = units sold × price per unit. The ratio is then just cost per unit over price per unit. Price per unit is unchanged, so the ratio moves one-for-one with cost per unit. The 15% volume growth sits in both numerator and denominator and cancels.

That only holds if the unit mix is stable — if the extra items per visit are skewed toward, say, food with a different cost-to-price ratio, the two numbers would diverge. The fact that 38% and 38% match so closely suggests mix isn't doing much work here, which supports treating this as pure input inflation.

Do we have anything on whether the incremental items are beverages or food? If not, I'll assume stable mix.

**Interviewer · 11:54** (turn 16)

I don't have the beverage versus food split of the incremental items, so you can proceed on that assumption. Beyond what we've discussed, what else could the client do to address this?

**Candidate · 13:24** (turn 17)

Beyond pricing, a few levers.

On procurement: lock in bean supply with forward contracts or hedges rather than buying spot, consolidate volume across the 200 stores into fewer suppliers for better terms, and look at private-label or alternative-origin beans for the non-signature blends.

On product: reformulate or reprice the highest-cost items specifically rather than a blanket increase, and push the basket toward items where input inflation hit less — the ticket is already rising on volume, so there's an opening to steer mix.

On waste and portioning: standardize pours and track spoilage, since dairy and food are the bulk of the inflated bucket.

On overhead: it's only 2 points but it's drifting, so worth a look at the lease renewals.

Do we have data on current contract lengths or procurement centralization? If not, I'd flag it as a first diligence item.

**Interviewer · 13:26** (turn 18)

I don't have contract lengths or procurement centralization. You said beyond pricing, so where does a price increase sit among these levers, and what would you want to know before pulling it?

**Candidate · 14:56** (turn 19)

Price sits first — it's the fastest and largest lever. Menu prices haven't moved in two years while inputs rose 38%, so there's a real gap. Rough math: to restore COGS to 42% of revenue at current unit costs, revenue per unit would need to rise by 58/42 − 1 ≈ 38%. That's too steep to take at once, but even a 10% increase would pull COGS to about 53% of revenue, recovering 5 margin points — most of the way back to double digits.

Before pulling it I'd want elasticity, competitor price levels, and the share of volume that's loyalty or subscription customers, since those are stickier. I'd also want to know whether competitors have already raised — if they have, we have cover.

I know you don't have elasticity. So I'd phase it: 5% now, test in a subset of stores, measure transaction count, then extend.

**Interviewer · 15:00** (turn 20)

Okay. You've worked through a lot of options. That isn't something I have data on. If you were presenting to the CEO right now, what is your recommendation?

**Candidate · 16:30** (turn 21)

My recommendation: raise menu prices, phased, starting with a 5% increase tested in a subset of stores, scaling toward roughly 10–15% over the next year, alongside locking in supply contracts.

The reasoning: margin fell 18 points, from 24% to 6%. Sixteen of those points are COGS, two are overhead, and labor is flat at 22%. Inside COGS, beans up 40% and other inputs up 37.5% blend to about 38% input inflation — and because menu prices haven't moved in two years, every bit of that passed straight to the bottom line. Revenue growth of 15% was all volume and basket size, which doesn't help margin.

A 10% price increase gets COGS to about 53% of revenue, recovering roughly 5 points.

Risks: we don't have elasticity or competitor pricing, and the 4.5% transaction growth could reverse. That's why I'd test before rolling out.

Next steps: pilot pricing in 20 stores, run a procurement review on bean and dairy contracts, and check the overhead drift.

**Interviewer · 16:34** (turn 22)

Okay. You said a 10% increase gets COGS to about 53% of revenue. Walk me through that calculation.

**Candidate · 18:04** (turn 23)

Sure. COGS as a percent of revenue is cost per unit over price per unit. If I raise price 10% and unit costs are unchanged, that ratio divides by 1.10: 58 / 1.10 = 52.7%, so call it 53%. That's a 5.3 point improvement, taking profit from 6% to roughly 11%.

One thing I understated, though — labor and overhead are also expressed as a percent of revenue. If those dollars stay fixed, labor goes 22 / 1.10 = 20%, and overhead 14 / 1.10 = 12.7%. So the total improvement is closer to 5.3 + 2 + 1.3 ≈ 8.6 points, putting profit near 15%.

That assumes volume holds flat at the higher price, which is exactly the assumption I can't verify without elasticity. If we lose volume, the fixed portion of overhead works against us.

**Interviewer · 18:07** (turn 24)

Okay. You now have profit near fifteen percent from that price increase, versus eleven a moment ago. Which of those two figures would you put in front of the CEO, and what has to be true for it to hold?

**Candidate · 19:37** (turn 25)

I'd put 11% in front of the CEO, and footnote 15% as the upside case.

The 11% only requires that unit costs and volume hold — it treats labor and overhead as scaling with revenue, which is conservative. The 15% additionally requires that labor and overhead dollars are genuinely fixed, so that they fall as a share of a larger revenue base. Labor almost certainly isn't fully fixed: baristas are scheduled to traffic, and at flat volume with higher prices you wouldn't need fewer hours, so arguably labor dollars are flat here and the 15% is defensible — but I haven't seen the fixed-variable split of that 22%, so I wouldn't bank it.

Both figures also assume volume doesn't fall. At 10% higher prices, even modest elasticity erodes this.

So: lead with 11%, show 15% as the ceiling, and let the pilot resolve which one is real.

**Interviewer · 19:39** (turn 26)

Okay. One last point on that pilot: if transactions fall in the test stores, what would you tell the CEO to do next?

**Candidate · 21:09** (turn 27)

First I'd check whether revenue per store actually fell, not just transactions. At a 10% price increase we can lose up to about 9% of transactions and still be revenue-neutral — and we'd be better off on margin, since we're selling fewer units at higher prices with the same fixed base. So a modest transaction decline is an acceptable outcome, not a failure.

If the decline is steeper than that, I'd tell the CEO not to abandon pricing but to narrow it: raise prices selectively on the items where input inflation was worst and demand is least price-sensitive — espresso drinks, food attachments — rather than across the board. And lean harder on the procurement and waste levers, which don't touch the customer at all.

I'd also want to see whether we lost transactions or just lost the marginal item per visit, since ticket size was doing the work in the first place. Those call for different responses.

**Interviewer · 21:11** (turn 28)

That's our time. Thanks for working through this with me — your written report will follow.
