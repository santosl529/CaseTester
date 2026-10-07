# Live run — Brew & Bean Profitability

- Session: `ce5cbfbd-e4ff-46e7-bfae-ba2479e5f8a6` · case `prof-001` · status **completed** · 2026-10-06
- Overall: **strong**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **56. Devon — the Indirect Asker**
- Tests: Rule 11's request detector at its hardest: requests without question marks, referential follow-ups that require resolving 'that,' and near-miss statements that must not be logged as unanswered requests.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_share_of_cogs`, `non_bean_input_change`, `menu_price_change`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":4,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":0,"crossDimensionRepeats":1,"dataRequestsNotInCase":0,"interviewerErrorMarks":0}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 5 | defer | cogs_pct | COGS as a percent of revenue, both years | no |
| 5 | defer | labor_pct | labor as a percent of revenue, both years | no |
| 5 | defer | overhead_pct | overhead and rent as a percent of revenue, both years | no |
| 7 | release | cogs_pct | COGS as a percent of revenue, both years | yes |
| 7 | release | labor_pct | labor as a percent of revenue, both years | yes |
| 7 | release | overhead_pct | overhead and rent as a percent of revenue, both years | yes |
| 9 | release | bean_share_of_cogs | the COGS breakdown, with coffee beans as a share of COGS | yes |
| 9 | release | non_bean_input_change | how much the other COGS inputs changed over two years | yes |
| 9 | release | menu_price_change | menu price changes over two years | yes |
| 11 | defer | — | the cost structure over time exhibit | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 10 | 0 | 0 | — |
| conduct_model | 10 | 0 | 0 | — |
| data_decisions | 6 | 4 | 0 | 5, 7, 9, 11 |
| end_gate | 10 | 0 | 0 | — |
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
| unit_check | 9 | 1 | 0 | 19 |
| verified_figures | 9 | 1 | 0 | 11 |
| vetoes | 10 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 10 | 6895 | 273 | $0.008 |
| interviewer (claude-sonnet-5-5) | 9 | 24004 | 1383 | $0.062 |
| coverage (claude-haiku-4-5-20251001) | 9 | 16569 | 1263 | $0.023 |
| data_request (claude-haiku-4-5) | 1 | 957 | 58 | $0.001 |
| judge (claude-opus-5-5) | 1 | 13410 | 13716 | $0.328 |
| verifier (claude-opus-5-5) | 1 | 6700 | 1911 | $0.065 |
| reconcile (claude-opus-5-5) | 1 | 3485 | 2365 | $0.061 |
| candidate simulator (claude-opus-5) | 10 | 26380 | 3752 | $0.226 |

- App cost (interviewer + scoring): **$0.55** · with simulator: **$0.77** · list prices, uncached
- Wall time: 4:08

## Feedback

**Top improvement:** Derive the numbers behind your recommendation instead of asserting them. Before proposing a 10–12% price increase, show the margin bridge: with cost dollars at 94% of revenue, margin = 1 − 0.94/(1+p), so about 11% only gets back to roughly 15%. Then show explicitly how procurement and waste close the remaining 8–9 points.

### Problem Structuring — meets_bar
- ✅ The candidate led with a data-backed hypothesis that this is a cost problem and said where to start, which is the prioritization the anchor asks for.
  > Revenue is up 15% but margin collapsed from 24% to 6%, so this is almost certainly a cost story rather than a demand story — costs have to be growing much faster than revenue.
  > I'd start with the cost breakdown and find which line grew disproportionately.
- ⚠️ The opening framework layered two overlapping cost cuts (fixed/variable and line items), so it was not MECE until the interviewer pushed. Once challenged, the candidate acknowledged this and repaired the structure by choosing one primary cost cut and adding store-cohort, product-mix, and below-the-line branches tailored to a 200-store chain.
  > So I'd split it: revenue into price and volume, and costs into fixed and variable.
  > Honestly, I conflated two cuts — fixed versus variable is one way to slice costs, and COGS/labor/rent/overhead is a different one.
  > I'd pick the line-item cut as primary and just flag which lines flex with volume.
  > So I'd add a cut by store cohort — mature versus recently opened.
- ⚠️ The candidate restated the numbers but never the CEO's objective (find the root cause and reverse it). The structure was never tied to that decision, and pricing power and competitor context were absent from the opening.
  > On the cost side I'd want the P&L broken into the big buckets: coffee and food inputs, labor, rent and occupancy, and corporate overhead.
- 💡 Turn 1 opening, where the candidate split revenue and costs along two overlapping cuts and did not frame the end decision.
  > Better: The CEO wants two things: why margin fell 18 points despite 15% growth, and how to get it back. I'll use profit = revenue − costs. Revenue is price × volume, and I want to know whether menu prices kept pace with inputs and whether peers raised theirs. Costs split into COGS, labor, and overhead, measured as % of revenue. Since revenue grew, my hypothesis is COGS, so I'd start there. The answer will point us to either pricing action or cost action.

### Quantitative & Analytical Rigor — meets_bar
- ✅ The candidate reconciled the line-item point changes to the full 18-point margin decline, an explicit sanity check that ruled out below-the-line items.
  > Total is 18 points, and the margin fell from 24 to 6, which is exactly 18.
- ✅ The candidate converted share-of-COGS into points of revenue correctly and narrated each step. It backed out the implied 40% bean increase and split the 16 points into 11.8 from other inputs and 4.2 from beans.
  > Two years ago COGS was 42 points of revenue. Beans at 25% of that is 10.5 points, and everything else — dairy, packaging, food — is the other 75%, so 31.5 points.
  > So both buckets inflated roughly 38–40%, but the non-bean bucket is three times larger, so it carries about 11.8 of the 16 points versus 4.2 from coffee.
- ✅ The candidate attached a business implication to the numbers: full absorption of input inflation, and a forward projection to losses.
  > Input costs rose ~38% and the client absorbed all of it.
  > If it runs another year, COGS hits 66 and profit goes to roughly negative 3.
- ⚠️ The 10–12% price increase was asserted, never derived, and it does not close the gap the candidate said pricing would close. Holding cost dollars constant, margin = 1 − 0.94/(1+p). A 10–12% increase lifts margin to only about 14.5–16%, roughly half the 18 points. Returning to 24% would need about 24%.
  > Pricing is the only lever big enough to close an 18-point gap.
  > First 90 days: a 10–12% price increase, phased and tested in a subset of markets so we can read elasticity before going chain-wide.
- ⚠️ The elasticity break-even was also asserted rather than computed. If COGS (58%) is the main variable cost, contribution is 42% of revenue today and 52% after a 10% increase, so volume could fall about 19% (42/52) before contribution drops. That is well above the roughly 10% the candidate stated.
  > Mechanically: if a 10% price increase costs more than roughly 10% of volume, contribution falls and we back it off to something like 5–6%, which might recover five or six points.
- 💡 Turn 17, when the candidate committed to a 10–12% price increase as the primary lever.
  > Better: Let me size it. Cost dollars are 94% of today's revenue. A price increase of p gives margin = 1 − 0.94/(1+p). At 11% that's about 15%, so price recovers roughly 9 of the 18 points. Getting fully back to 24% would need about 24%, which is too risky. So I'll take about 11% on price and look for the remaining 8–9 points in procurement and waste.

### Data & Exhibit Interpretation — strong
- ✅ The candidate read the exhibit line by line, isolated COGS as the driver, and went past beans to show that non-bean inputs carry most of the increase.
  > COGS climbs 42 → 50 → 58, so eight points each year, perfectly linear.
  > So both buckets inflated roughly 38–40%, but the non-bean bucket is three times larger, so it carries about 11.8 of the 16 points versus 4.2 from coffee.
- ✅ The candidate drew a sharp so-what from the trajectory: the trend is not mean-reverting and the chain is about a year from losses.
  > They're about twelve months from losing money at the chain level.
- ✅ The candidate proposed concrete next steps to test the read.
  > I'd test it by rebuilding unit economics on one drink: cost per cup then versus now against an unchanged price.
  > The question becomes how much price they can take without killing the volume that's been carrying revenue — I'd want whatever we have on competitor pricing.
- ⚠️ The candidate over-read the linear shape of the trend as evidence against mix shift. Steady growth in food share could also produce a smooth line. The stronger evidence was the 37.5% input price inflation already provided.
  > A mix shift toward food would usually show up unevenly, not as a clean eight points a year.
- 💡 Turn 13, ruling out the mix hypothesis.
  > Better: Mix probably isn't the main story. Non-bean input prices alone rising 37.5% explains about 11.8 of the 16 points, and beans explain the rest, so price inflation fully accounts for COGS. I'd still confirm with a units-by-category split, but it's no longer my lead hypothesis.

### Business Judgment & Insight — meets_bar
- ✅ Under pushback, the candidate stayed realistic and chose sensible leading indicators.
  > Then the plan shifts weight from price to cost, and I'd be honest with the CEO that an 18-point recovery stops being realistic in one year.
  > What I'd watch early: transaction counts weekly rather than revenue, since revenue lags and can look fine while traffic bleeds.
- ⚠️ The pricing-power argument rests on an inference the candidate's own earlier assumption undercuts. Revenue growth driven by new store openings says little about willingness to pay at existing stores.
  > Volume has grown — revenue is up 15% on unchanged prices — which tells me demand is healthy and there's room to take price.
  > I'll assume for now some of it is new locations, since 200 stores suggests expansion.
- ⚠️ The candidate surfaced elasticity and competitor risk on the staged, piloted price increase and offered a mitigation. Other levers came without that risk awareness: shrinking portions and charging for formerly free add-ons can damage a specialty brand, and the overhead claim was asserted with no data.
  > Indirect pricing: shrink portion sizes at the same price, cut discounting and free refills, charge for add-ons that used to be free.
  > Overhead: it's only two points, but corporate headcount hasn't scaled with revenue efficiently.
  > Risks: elasticity is the big one — if volume drops more than roughly 10%, price alone doesn't get there, which is why I'd pilot first.
- 💡 Turn 17, justifying room to take price.
  > Better: Growth on flat prices is encouraging, but some of it may be new stores. So the real test of pricing power is same-store traffic plus how far our prices now sit below competitors after two years of inflation. I'd target the increase at specialty drinks, where customers are least price-sensitive, rather than drip coffee.

### Creativity & Brainstorming — strong
- ✅ The candidate announced buckets up front and filled them with many distinct ideas across procurement, operations, mix, indirect pricing, overhead, and footprint.
  > Let me bucket it — procurement, operations, mix, and footprint.
- ✅ The candidate included non-obvious levers beyond renegotiating contracts.
  > Packaging is probably the softest target — spec down cup and lid materials, that's invisible to the customer.
  > Indirect pricing: shrink portion sizes at the same price, cut discounting and free refills, charge for add-ons that used to be free.
- ✅ The candidate later sequenced the ideas into a phased plan, which prioritizes them. Within the brainstorm itself, though, the ideas were not ranked by size of impact, and the overhead and footprint buckets were thin.
  > Months three to twelve: waste and portion control, mix-shift toward espresso-based and black coffee, packaging respec.
  > Footprint: close or renegotiate the worst-performing stores — though I still haven't seen performance by location.
- 💡 End of the turn 15 brainstorm.
  > Better: If I rank these, non-bean procurement and packaging come first because that bucket is three times the size of beans. Next is waste reduction, because it's fast and invisible to customers. Mix shift is slower and footprint depends on store data.

### Synthesis & Recommendation — strong
- ✅ The candidate gave an answer-first recommendation with reasons tied directly to the analysis.
  > My recommendation: raise menu prices now, in a staged way, and run procurement reform alongside it.
  > Inputs rose roughly 38% while menu prices sat flat for two years, so Brew & Bean absorbed the entire increase.
- ✅ The candidate named the key risk and concrete next steps.
  > Next steps: elasticity testing, competitor price benchmark, and store-level P&Ls — I'd still like to see what last year looked like by location.
- ⚠️ The synthesis claims pricing can close the 18-point gap but never shows how the plan adds up. The candidate gave no margin bridge from 6% back toward the target.
  > Pricing is the only lever big enough to close an 18-point gap.
- 💡 Turn 17, the overall call.
  > Better: Together, about 11% on price recovers roughly 9 points and a 10% procurement saving on COGS adds about 5–6. That gets us to the low 20s within a year, with waste reduction as the buffer.

### Communication & Delivery — strong
- ✅ The candidate was consistently signposted and answer-first, opening turns with the conclusion or a roadmap.
  > The exhibit confirms the read and adds a trajectory.
  > Let me bucket it — procurement, operations, mix, and footprint.
- ✅ The candidate used hypothesis-driven phrasing throughout.
  > Revenue is up 15% but margin collapsed from 24% to 6%, so this is almost certainly a cost story rather than a demand story — costs have to be growing much faster than revenue.
- ✅ The candidate built on the interviewer's cue about MECE, carrying the line-item cut forward in the next turn.
  > First thing I'd want is the P&L for both years expressed as a percent of revenue, line by line — COGS, labor, occupancy, corporate — because absolute dollars will all be up on a 15% revenue base and that obscures things.
- ⚠️ Turn 7 largely re-explained the method from turn 5 instead of simply requesting the offered data, which slowed the pace.
  > I can't tell you which moved most until I see the numbers, so go ahead and share them.

### Pushback, Composure & Case Leadership — strong
- ✅ The candidate acknowledged the MECE challenge specifically and updated with explicit reasoning rather than capitulating vaguely.
  > Honestly, I conflated two cuts — fixed versus variable is one way to slice costs, and COGS/labor/rent/overhead is a different one.
- ✅ On the elasticity challenge, the candidate held the core direction, shifted weight to cost levers, and was candid about what changes. However, the fallback numbers given under pushback were asserted rather than derived, which weakens the reasoning behind the update.
  > Then the plan shifts weight from price to cost, and I'd be honest with the CEO that an 18-point recovery stops being realistic in one year.
  > Mechanically: if a 10% price increase costs more than roughly 10% of volume, contribution falls and we back it off to something like 5–6%, which might recover five or six points.
- ✅ The candidate drove the case proactively by asking for specific data and proposing tests.
  > And I'd check whether this is industry-wide commodity inflation or something specific to their supply contracts — do we have that by region?

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

How would you like to approach this? Feel free to take a moment to gather your thoughts first.

**Candidate · 0:12** (turn 1)

Let me lay out how I'd structure this. Revenue is up 15% but margin collapsed from 24% to 6%, so this is almost certainly a cost story rather than a demand story — costs have to be growing much faster than revenue.

So I'd split it: revenue into price and volume, and costs into fixed and variable. On the revenue side, the useful thing would be whether that 15% came from new store openings versus same-store growth — those have very different cost implications. I'll assume for now some of it is new locations, since 200 stores suggests expansion.

On the cost side I'd want the P&L broken into the big buckets: coffee and food inputs, labor, rent and occupancy, and corporate overhead. The two-year window matters because wages and lease rates both moved a lot recently.

I'd start with the cost breakdown and find which line grew disproportionately.

**Interviewer · 0:15** (turn 2)

Okay, a revenue split and a cost breakdown. You've split revenue by price and volume and costs by fixed and variable, then described the cost side as COGS, labor, rent and overhead. Is that MECE, and what's missing from the structure?

**Candidate · 0:22** (turn 3)

Fair push. Honestly, I conflated two cuts — fixed versus variable is one way to slice costs, and COGS/labor/rent/overhead is a different one. Layering them loosely isn't clean. I'd pick the line-item cut as primary and just flag which lines flex with volume.

What's missing: I didn't separate store-level economics from corporate costs. With 200 locations, a margin collapse could come from new stores running at a loss while mature stores are fine, and a blended P&L would hide that entirely. So I'd add a cut by store cohort — mature versus recently opened.

I also left out product mix. If the growth came from lower-margin food or cold drinks rather than brewed coffee, revenue rises while gross margin falls, and nothing in my cost buckets would show that.

Last gap — I treated the 24% to 6% as purely operating. Interest expense on expansion debt or one-time charges could sit below the line.

**Interviewer · 0:24** (turn 4)

Understood. You said you'd start with the cost breakdown to find which line grew disproportionately. What specific data would you ask for first, and what would you do with it?

**Candidate · 0:30** (turn 5)

First thing I'd want is the P&L for both years expressed as a percent of revenue, line by line — COGS, labor, occupancy, corporate — because absolute dollars will all be up on a 15% revenue base and that obscures things. Eighteen points of margin have to show up somewhere, so I'd look for the line that gained several points of revenue share.

Then I'd size it. If labor went from, say, 25% to 33%, that's eight points of the eighteen, and I'd chase it: wage rate per hour versus hours per store versus headcount from new openings. Same logic for COGS — input price per pound versus units sold.

I'd also take the same percent-of-revenue view split by store cohort, since that's where I suspect it hides.

I'll assume for now no major one-time charges distorting either year.

**Interviewer · 0:32** (turn 6)

Okay, a percent-of-revenue view by line. I can share COGS as a percent of revenue, both years, labor as a percent of revenue, both years and overhead and rent as a percent of revenue, both years if you'd like. Which line moved the most, and how much of the margin decline does it account for?

**Candidate · 0:36** (turn 7)

I'd take all three, but if I have to prioritize, start with labor and COGS as percent of revenue for both years — those are the two biggest variable lines in a coffee chain and the most likely culprits.

I can't tell you which moved most until I see the numbers, so go ahead and share them. What I'll do with them: take the point change in each line, sum it, and compare that sum against the 18 points of margin lost. If labor moved 8 points and COGS 6, that's 14 of the 18 explained, and I'd look for the remaining 4 in rent, overhead, or below the line.

Rent and overhead I'd still want, since expansion would push occupancy up.

**Interviewer · 0:40** (turn 8)

Okay. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Take the point change in each line and compare the total against the margin decline. What does that tell you, and where would you dig first?

**Candidate · 0:47** (turn 9)

Let me add it up. COGS went 42 to 58, that's 16 points. Labor flat, zero. Overhead 12 to 14, two points. Total is 18 points, and the margin fell from 24 to 6, which is exactly 18. So the lines reconcile fully — no hidden below-the-line item, and nothing on the revenue side eroding price.

COGS is 16 of the 18, so roughly 90% of the problem. That's where I'd spend my time; overhead is a rounding error by comparison.

Now, a 16-point jump in COGS is enormous. Two broad causes: input costs per unit rose, or the mix shifted toward lower-margin items. Price could also be a factor — if menu prices stayed flat while green coffee went up, COGS as a percent of revenue climbs mechanically.

The useful thing here would be a breakdown of what sits inside COGS — coffee beans, dairy, food, packaging — and how each moved. I'd also want to know what happened to menu prices over the two years.

**Interviewer · 0:49** (turn 10)

Okay. Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Menu prices have not changed in two years. With that in hand, what's driving the COGS increase, and how would you test it?

**Candidate · 0:58** (turn 11)

Let me work the numbers. Two years ago COGS was 42 points of revenue. Beans at 25% of that is 10.5 points, and everything else — dairy, packaging, food — is the other 75%, so 31.5 points.

Other inputs up 37.5%: 31.5 × 1.375 = 43.3 points of revenue today. Total COGS today is 58, so beans must be 58 − 43.3 = 14.7 points, up from 10.5. That's a 40% increase on beans.

So both buckets inflated roughly 38–40%, but the non-bean bucket is three times larger, so it carries about 11.8 of the 16 points versus 4.2 from coffee.

The real driver, though, is that menu prices haven't moved in two years. Input costs rose ~38% and the client absorbed all of it. Since prices are flat, the 15% revenue growth is pure volume — they're selling more units at a collapsing per-unit margin.

I'd test it by rebuilding unit economics on one drink: cost per cup then versus now against an unchanged price. And I'd check whether this is industry-wide commodity inflation or something specific to their supply contracts — do we have that by region?

**Interviewer · 1:00** (turn 12)

Okay, so flat prices against roughly 38 to 40 percent input inflation. Take a look at this: Brew & Bean Cost Structure Over Time. Take a look at this exhibit and tell me what it shows, and whether it changes or confirms your read of the problem.

**Candidate · 1:07** (turn 13)

The exhibit confirms the read and adds a trajectory. COGS climbs 42 → 50 → 58, so eight points each year, perfectly linear. Labor is pinned at 22 all three years, overhead creeps one point a year. Profit falls 24 → 15 → 6, nine points annually.

Two things that matter. First, this isn't a one-time commodity spike that might mean-revert — it's a steady two-year march, which says either sustained input inflation or structurally worse sourcing. Second, the slope hasn't flattened. If it runs another year, COGS hits 66 and profit goes to roughly negative 3. They're about twelve months from losing money at the chain level.

It also kills the mix hypothesis for me. A mix shift toward food would usually show up unevenly, not as a clean eight points a year.

So the diagnosis holds: flat menu prices against compounding input inflation, and the company absorbing 100% of it. The question becomes how much price they can take without killing the volume that's been carrying revenue — I'd want whatever we have on competitor pricing.

**Interviewer · 1:10** (turn 14)

Okay. Beyond pricing, what else could Brew & Bean do to stop this margin decline, or even win some of it back? Give me as many distinct ideas as you can.

**Candidate · 1:17** (turn 15)

Let me bucket it — procurement, operations, mix, and footprint.

Procurement: renegotiate bean contracts, lock in forward hedges rather than buying spot, consolidate suppliers across 200 stores for volume discounts, dual-source dairy, go direct-to-origin on coffee and cut intermediaries. Packaging is probably the softest target — spec down cup and lid materials, that's invisible to the customer.

Operations: attack waste. Dairy spoilage, over-pouring, brewed coffee dumped at end of shift. Portion control and smaller batch brewing. Those don't need price increases to show up.

Mix: push higher-margin items. Black coffee and espresso carry far better margins than milk-heavy and food. Loyalty incentives or bundling steered toward those. Also push oat-free and smaller sizes if dairy is the inflating line.

Indirect pricing: shrink portion sizes at the same price, cut discounting and free refills, charge for add-ons that used to be free.

Overhead: it's only two points, but corporate headcount hasn't scaled with revenue efficiently.

Footprint: close or renegotiate the worst-performing stores — though I still haven't seen performance by location.

**Interviewer · 1:19** (turn 16)

Okay, a wide set of levers across procurement, operations, mix and footprint. Pull it together for the CEO: what do you recommend Brew & Bean do, in what order, and what is your overall call?

**Candidate · 1:27** (turn 17)

My recommendation: raise menu prices now, in a staged way, and run procurement reform alongside it. Pricing is the only lever big enough to close an 18-point gap.

The logic: all 18 points of margin loss are explained by cost lines, 16 from COGS alone. Inputs rose roughly 38% while menu prices sat flat for two years, so Brew & Bean absorbed the entire increase. Volume has grown — revenue is up 15% on unchanged prices — which tells me demand is healthy and there's room to take price.

Order of operations. First 90 days: a 10–12% price increase, phased and tested in a subset of markets so we can read elasticity before going chain-wide. Simultaneously, renegotiate bean and dairy contracts and move off spot purchasing into forward hedges. Months three to twelve: waste and portion control, mix-shift toward espresso-based and black coffee, packaging respec.

Risks: elasticity is the big one — if volume drops more than roughly 10%, price alone doesn't get there, which is why I'd pilot first. Competitor positioning matters too; if peers held prices, we lose share.

Next steps: elasticity testing, competitor price benchmark, and store-level P&Ls — I'd still like to see what last year looked like by location.

**Interviewer · 1:29** (turn 18)

Okay. You named elasticity as the main risk. Suppose the pilot shows volume falling by more than you can afford and price alone can't close the gap. What does your plan do then, and what would you watch to catch that early?

**Candidate · 1:37** (turn 19)

Then the plan shifts weight from price to cost, and I'd be honest with the CEO that an 18-point recovery stops being realistic in one year.

Mechanically: if a 10% price increase costs more than roughly 10% of volume, contribution falls and we back it off to something like 5–6%, which might recover five or six points. The rest has to come from COGS. Procurement is the biggest remaining lever — on 58 points of COGS, a 10% input reduction is 5.8 points on its own. Then waste and portion control, call it two or three points, and mix shift toward espresso. Stack those and you're plausibly back to the mid-teens, not 24.

What I'd watch early: transaction counts weekly rather than revenue, since revenue lags and can look fine while traffic bleeds. Also average ticket — if customers trade down to smaller sizes or drop the food attach, that shows up before overall volume does. And churn in the loyalty base, which is the earliest signal of all.

If traffic breaks badly, the footprint question comes back — and that's where the per-store numbers would matter.

**Interviewer · 1:38** (turn 20)

That's time. Thanks for working through it — your written report will follow.
