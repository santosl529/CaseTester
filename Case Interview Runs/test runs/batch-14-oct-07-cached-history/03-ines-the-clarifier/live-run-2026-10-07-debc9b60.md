# Live run — Brew & Bean Profitability

- Session: `debc9b60-0bb0-4002-add8-ed09d0680be8` · case `prof-001` · status **completed** · 2026-10-07
- Overall: **not scored**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **3. Ines — the Clarifier**
- Tests: Rule 13 clarifying-question budget (N=2 default): tests whether a legitimately thorough candidate trips the ladder. If she does, N is too low or the quality guard is needed after all.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `stores_count`, `cogs_pct`, `labor_pct`, `overhead_pct`, `menu_price_change`, `bean_share_of_cogs`, `non_bean_input_change`, `avg_ticket`, `bean_price_change`
- Force-released before the recommendation ask: none
- Scoring QA: `{}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | refuse | — | whether the margin decline is chain-wide or concentrated in a subset of stores | no |
| 3 | release | stores_count | the breakdown of revenue growth between new stores and same-store sales | yes |
| 5 | defer | menu_price_change, avg_ticket | the price, volume and mix split of revenue growth | no |
| 7 | defer | — | the cost breakdown as a percent of revenue | no |
| 9 | release | cogs_pct, labor_pct, overhead_pct | the cost breakdown as a percent of revenue | yes |
| 9 | defer | menu_price_change | menu price changes over 2 years | no |
| 9 | defer | avg_ticket | average transaction value | no |
| 11 | release | bean_share_of_cogs, non_bean_input_change | the COGS breakdown by input | yes |
| 11 | release | menu_price_change | menu price changes over 2 years | yes |
| 11 | defer | avg_ticket | average transaction value | no |
| 13 | defer | bean_price_change | coffee bean price change over two years | no |
| 13 | release | avg_ticket | average transaction value | yes |
| 15 | defer | — | the cost structure exhibit | no |
| 15 | refuse | — | gross margin by category | no |
| 17 | release | bean_price_change | the coffee bean price change over two years | yes |
| 19 | refuse | — | competitor pricing over the past two years | no |
| 25 | refuse | — | Waste audit and spend-by-vendor breakdown to size input cost reduction opportunities | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 13 | 0 | 0 | — |
| conduct_model | 13 | 0 | 0 | — |
| data_decisions | 2 | 11 | 0 | 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 25 |
| end_gate | 13 | 0 | 0 | — |
| end_rec_ask_gate | 13 | 0 | 0 | — |
| model_turn_validation | 12 | 0 | 0 | — |
| recompute | 13 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 13 | — |
| stall | 13 | 0 | 0 | — |
| stream_buffer_switch | 12 | 0 | 0 | — |
| stream_prefix_mismatch | 12 | 0 | 1 | — |
| style | 13 | 0 | 0 | — |
| timeframe | 13 | 0 | 0 | — |
| turn_kind | 12 | 1 | 0 | 25 |
| unit_check | 12 | 1 | 0 | 23 |
| verified_figures | 10 | 3 | 0 | 11, 13, 19 |
| vetoes | 12 | 1 | 0 | 15 |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 13 | 8326 | 345 | $0.010 |
| interviewer (claude-sonnet-5-5) | 12 | 12480 | 1811 | $0.043 |
| coverage (claude-haiku-4-5-20251001) | 12 | 22508 | 1182 | $0.028 |
| data_request (claude-haiku-4-5) | 1 | 927 | 64 | $0.001 |
| candidate simulator (claude-opus-5) | 13 | 35558 | 4319 | $0.286 |

- App cost (interviewer + scoring): **$0.08** · with simulator: **$0.37** · list prices, uncached
- Wall time: 1:46

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a minute if you need it, then tell me how you'd structure your approach.

**Candidate · 0:03** (turn 1)

Before I jump into structure, I'd like to make sure I understand the situation.

First question: when you say net profit margin fell from 24% to 6%, is that a chain-wide average, or is it concentrated in a subset of stores? I'm trying to figure out whether this is a systemic cost issue or a problem with specific locations or regions.

**Interviewer · 0:05** (turn 2)

Understood. I don't have whether the margin decline is chain-wide or concentrated in a subset of stores. What other scoping questions do you have, or are you ready to walk me through your structure?

**Candidate · 0:08** (turn 3)

Okay, I'll assume for now it's broadly chain-wide until data says otherwise.

Second question: on the 15% revenue growth over two years — is that coming from opening new locations, or from same-store sales growth? That matters a lot, because if we've been opening stores aggressively, the margin decline could partly be new stores that haven't matured yet, plus the buildout and overhead that comes with expansion. If instead it's same-store growth with a flat store count, then the problem is almost certainly on the cost side of existing operations.

**Interviewer · 0:10** (turn 4)

Understood. 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. Any other scoping questions, or are you ready to walk me through your structure?

**Candidate · 0:14** (turn 5)

That's helpful — flat footprint means this is same-store, so it's an operations and cost story.

Third question: within that 15% same-store revenue growth, do we know how much came from price increases versus transaction volume versus a shift in what people are buying? I ask because if they raised prices and revenue only grew 15%, traffic may actually be falling, which would point to a different problem than if volume is genuinely up and costs just outran it.

**Interviewer · 0:16** (turn 6)

Mm-hm. I'll come back to the price, volume and mix split of revenue growth shortly. You've got a good read on the situation now. How would you structure your approach to finding the root cause of the margin decline?

**Candidate · 0:21** (turn 7)

Here's how I'd structure it. Profit equals revenue minus costs, and since revenue is up 15% with a flat footprint, I'd weight the cost side but still check revenue quality.

On revenue, I'd decompose into price, volume, and mix — a shift toward lower-margin items, say more food or more discounting through a loyalty app, could pull blended margin down even with revenue up.

On costs, I'd split fixed versus variable. Variable: COGS — coffee beans, dairy, cups — and store labor, which in coffee is usually the two biggest lines. Fixed: rent and occupancy, corporate overhead, marketing, and any tech or delivery-platform fees.

For each line I'd ask whether it grew faster than revenue over the two years, and if so, whether that's unit price inflation or more units consumed per dollar of sales.

Do we have a cost breakdown as a percent of revenue for both years?

**Interviewer · 0:24** (turn 8)

A revenue-first split, then costs by line. Is that structure MECE, and which branch would you prioritize first, and why?

**Candidate · 0:29** (turn 9)

I think it's MECE at the top — revenue and cost are exhaustive and don't overlap, and within cost, fixed versus variable covers everything. The one place I'd flag overlap risk is mix: a shift toward food shows up in both revenue mix and COGS, so I'd be careful to count it once, as a margin effect rather than twice.

I'd prioritize the cost branch first, specifically COGS and store labor. Reason: revenue grew 15% while margin fell 18 points. If this were purely a revenue-quality problem, you'd expect weaker top-line growth too. An 18-point swing on growing revenue means costs grew substantially faster than 15% — that's a big absolute dollar movement, and it almost has to sit in the one or two largest cost lines. So I'd size those first and only go back to mix if the cost lines don't explain the full gap.

**Interviewer · 0:31** (turn 10)

Got it. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. I'll come back to menu price changes over 2 years and average transaction value shortly. Where does that point you, and what would you want to dig into next?

**Candidate · 0:37** (turn 11)

That ties out almost perfectly. COGS up 16 points, overhead up 2, labor flat — that's 18 points of margin, and margin fell exactly 18 points, from 24% to 6%. So COGS is roughly 90% of the problem and overhead is a rounding-error contributor. I'd focus there.

Before I go further, a question to narrow it: within COGS, do we have the split by input — coffee beans versus dairy versus packaging and cups versus food items? A 16-point move is enormous, and I'd want to know whether it's one input spiking or a broad-based increase, because the fixes are completely different. A single-input spike points to commodity pricing or a supplier contract; a broad increase points to something structural like waste, shrinkage, or portioning.

**Interviewer · 0:39** (turn 12)

A COGS-led read. Coming back to what you asked for earlier: Menu prices have not changed in two years. Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. I'll come back to average transaction value shortly. What does that tell you about whether this is a single-input spike or something broader, and what would you check next?

**Candidate · 0:48** (turn 13)

Let me run it. Two years ago COGS was 42% of revenue: beans at 25% of that is 10.5 points of revenue, everything else is 31.5 points.

Prices haven't changed, so with 15% revenue growth, volume is up 15% — meaning unit cost inflation passes straight through to the percent-of-revenue figure. Other inputs up 37.5%: 31.5 × 1.375 = 43.3 points of revenue. Total COGS today is 58, so beans must be 58 − 43.3 ≈ 14.7 points, versus 10.5 before. That's about a 40% increase.

So it's broad-based — roughly 40% inflation on beans and 37.5% on everything else. Not a single-input spike. And critically, zero of it has been passed to customers in two years of flat menu prices. That's the real root cause: input inflation plus pricing paralysis.

Next I'd check supplier contracts and whether waste or portioning adds anything on top.

**Interviewer · 0:50** (turn 14)

A bean split worked out from the COGS total. On what you asked about earlier: The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. I can share coffee bean price change over two years if you'd like. You called this input inflation plus pricing paralysis. Given that, what would you want to test before concluding that raising prices is the fix?

**Candidate · 0:56** (turn 15)

That ATV detail actually complicates my read a bit. If prices are flat and ATV is up 10% on more items per visit, then revenue growth of 15% implies transaction count is only up about 5% — and the extra items could be lower-margin food, which would mean mix is doing some of the damage I attributed purely to inflation.

Before I'd conclude price is the fix, here's what I'd want to test first: do we know the gross margin by category — espresso drinks versus brewed coffee versus food and pastry? If the incremental items customers are adding are food at a much thinner margin, raising coffee prices alone won't fix the blend, and we might need to reprice or re-engineer the food attach specifically.

**Interviewer · 0:58** (turn 16)

Your ticket reasoning is a hypothesis, not a data point. Here's an exhibit: Brew & Bean Cost Structure Over Time. I don't have gross margin by category. What does the exhibit tell you, and how does it square with your mix hypothesis?

**Candidate · 1:04** (turn 17)

Fair — I was extrapolating. The exhibit shows COGS rising in a steady, linear 8 points per year: 42, 50, 58. Labor dead flat at 22, overhead creeping one point a year.

That pattern argues against my mix hypothesis being the main driver. A shift in what customers buy would more likely show up as a step change or an accelerating curve as a new food program ramps — not a metronomic 8 points a year for two straight years. Steady linear escalation with flat menu prices looks much more like continuous input-cost inflation passing straight through, which is consistent with the 37.5–40% figures I backed into.

So I'd demote mix to a secondary effect worth quantifying later, not the root cause. And yes — I'd take the coffee bean price change over two years, to confirm my ~40% back-solve is real rather than an artifact of my arithmetic.

**Interviewer · 1:07** (turn 18)

A linear read of the exhibit. Raw coffee bean costs are up 40% over the past two years. With that figure in hand, does your back-solved estimate for beans hold up, and what does it mean for the root cause?

**Candidate · 1:13** (turn 19)

It holds — I backed into roughly 40% on beans from the COGS total, and the actual figure is 40%. That's a good cross-check: my 43.3-point estimate for non-bean inputs and 14.7 for beans is consistent with the reported data, so the arithmetic isn't an artifact.

What it means for root cause: this is broad-based commodity and input inflation — 40% on beans, 37.5% on everything else — colliding with two years of completely flat menu prices. Labor held, overhead barely moved. Brew & Bean absorbed every dollar of inflation into margin instead of passing any of it through.

Before I give a recommendation, one question that would change what I'd advise: do we know anything about what competitors have done with their pricing over the same two years? If peers have already raised prices 20–30%, Brew & Bean has real headroom. If the market has also held flat, a unilateral increase is much riskier.

**Interviewer · 1:15** (turn 20)

Competitor pricing is a fair question for a recommendation. I don't have competitor pricing over the past two years. Beyond raising menu prices, what else could Brew & Bean do to win back margin? Give me as many distinct levers as you can.

**Candidate · 1:23** (turn 21)

Without competitor data I'll assume at least some peers have passed through inflation, since it's industry-wide.

Levers beyond a straight menu price increase:

On input cost: renegotiate supplier contracts or consolidate volume with fewer vendors; lock in forward contracts or hedge beans rather than buying spot; qualify a second bean origin or a lower-cost blend for drip where palate sensitivity is lower; re-spec packaging — lids, cups, sleeves are often over-engineered.

On usage: audit waste and shrinkage — brewed coffee dumped at end of batch, over-portioned dairy, free refills; tighten portioning with scales or auto-dosing; reduce SKU count so fewer items spoil.

On mix and pricing architecture: shift customers toward high-margin drinks, reprice only the most inflated inputs rather than across the board, upsell to larger sizes where incremental cost is cents, introduce oat/alt-milk surcharges, and use bundles so the ticket rises without a visible per-item increase.

On overhead: it's only 2 points, but renegotiate rent at renewal and trim corporate.

Labor is flat, so I'd leave it alone.

**Interviewer · 1:25** (turn 22)

A broad set of levers. Pulling it together, what is your recommendation to the CEO: which levers would you pull first, and what outcome would you expect from them?

**Candidate · 1:37** (turn 23)

My recommendation: pass through price now, and pair it with a procurement and waste program. Beans are up 40% and other inputs 37.5% while menu prices haven't moved in two years — that gap is the entire 18-point margin decline, and no amount of cost discipline closes a 16-point COGS hole on its own.

Sizing it: on 100 of revenue, costs are 94 and profit is 6. A 10% price increase with volume held flat gives revenue 110 against the same 94 of cost — profit of 16, or roughly 14.5% margin. Layer on 3 points of COGS from supplier renegotiation, waste reduction, and packaging re-spec, and you're near 17%. That recovers most of the gap without touching labor.

Sequencing: price first, because it's immediate; procurement runs on a 3–6 month contract cycle.

Risks: elasticity is the big one — ATV is up on items per visit, not price, so we haven't tested willingness to pay. Phase increases by region and watch transaction counts.

Next steps: pilot pricing in 20 stores, pull competitor pricing, and get category-level margins to target the increases.

**Interviewer · 1:39** (turn 24)

A price-first recommendation with procurement behind it. You said three points of COGS from procurement and waste. Points of what, and how did you get there? Then tell me the biggest risk to your recommendation.

**Candidate · 1:45** (turn 25)

Fair challenge — three points of revenue at current volumes, so about 3 dollars on a 100-revenue base against COGS of 58. In COGS terms that's roughly a 5% reduction in input spend.

And I should be straight: I didn't derive it, I assumed it. It's a judgment figure from the levers I listed — typically a few points of brewed-coffee waste and dairy over-portioning, plus packaging re-spec and vendor consolidation. I'd want a waste audit and a spend-by-vendor breakdown to size it properly before putting it in front of the CEO. Treat it as illustrative, not committed.

Biggest risk is elasticity. The entire recommendation rests on a 10% price increase holding volume, and we have no evidence for that — prices haven't moved in two years, so there's no recent demand response to read. Transaction count is only up ~5%, which hints traffic is already soft. If volume drops more than about 9%, the increase is margin-neutral at best.

**Interviewer · 1:46** (turn 26)

I don't have Waste audit and spend-by-vendor breakdown to size input cost reduction opportunities. That's time. Thanks for working through it — your written report will follow.
