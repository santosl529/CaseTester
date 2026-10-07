# Live run — Brew & Bean Profitability

- Session: `bb0faa72-3edf-46c8-8782-3e12d4ceeecb` · case `prof-001` · status **completed** · 2026-10-07
- Overall: **not scored**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **26. Daniel — the Interviewer-Led Expecter**
- Tests: Rule 4's Socratic default against a candidate who won't lead: how much direction is coaching versus administration, and whether case-leadership scoring distinguishes passivity from inability.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `menu_price_change`, `bean_price_change`, `bean_share_of_cogs`, `non_bean_input_change`
- Force-released before the recommendation ask: none
- Scoring QA: `{}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | cogs_pct, labor_pct, overhead_pct | the cost breakdown | no |
| 5 | defer | menu_price_change | menu price history | no |
| 5 | release | cogs_pct, labor_pct, overhead_pct | the cost breakdown by line, both years | yes |
| 7 | release | menu_price_change | menu price changes over 2 years | yes |
| 9 | release | bean_price_change | coffee bean price change over two years | yes |
| 11 | defer | non_bean_input_change | other input cost changes | no |
| 11 | defer | bean_share_of_cogs | coffee beans as a share of COGS | no |
| 13 | release | bean_share_of_cogs | coffee beans as a share of COGS | yes |
| 13 | release | non_bean_input_change | dairy, packaging and food input cost changes | yes |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 12 | 0 | 0 | — |
| conduct_model | 12 | 0 | 0 | — |
| data_decisions | 5 | 7 | 0 | 1, 5, 7, 9, 11, 13, 15 |
| end_gate | 12 | 0 | 0 | — |
| end_rec_ask_gate | 12 | 0 | 0 | — |
| model_turn_validation | 11 | 0 | 0 | — |
| recompute | 12 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 12 | — |
| stall | 12 | 0 | 0 | — |
| stream_buffer_switch | 11 | 0 | 0 | — |
| stream_prefix_mismatch | 11 | 0 | 1 | — |
| style | 10 | 2 | 0 | 1, 13 |
| timeframe | 12 | 0 | 0 | — |
| turn_kind | 11 | 1 | 0 | 23 |
| unit_check | 9 | 3 | 0 | 11, 13, 15 |
| verified_figures | 11 | 1 | 0 | 7 |
| vetoes | 12 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 12 | 8133 | 340 | $0.010 |
| interviewer (claude-sonnet-5-5) | 11 | 10676 | 1540 | $0.037 |
| coverage (claude-haiku-4-5-20251001) | 11 | 23322 | 716 | $0.027 |
| data_request (claude-haiku-4-5) | 1 | 935 | 17 | $0.001 |
| candidate simulator (claude-opus-5) | 12 | 35053 | 4268 | $0.282 |

- App cost (interviewer + scoring): **$0.07** · with simulator: **$0.36** · list prices, uncached
- Wall time: 1:44

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a moment, then walk me through how you'd approach this.

**Candidate · 0:07** (turn 1)

Let me take a second to structure this.

So revenue is up 15% but net margin fell from 24% to 6% — that's a big drop, and since revenue grew, the problem is almost certainly on the cost side, or in mix.

I'd break it into two branches. First, revenue: is the 15% growth coming from new stores, more transactions per store, or higher prices? That matters because if growth is driven by opening locations, new stores may be dragging margin while they ramp.

Second, costs, split into COGS and operating costs. Under COGS I'd look at coffee beans, milk, cups and packaging. Under operating costs, store labor, rent and occupancy, marketing, and corporate overhead. I'd want to see each as a percent of revenue two years ago versus today to see which line expanded.

I'd start with the cost side since that's where the margin compression most likely sits.

What would you like me to look at next?

**Interviewer · 0:09** (turn 2)

A cost-first split. Is that structure MECE, and what's missing? And which branch would you prioritize first, and why?

**Candidate · 0:14** (turn 3)

Fair challenge. I think it's mostly MECE on costs — COGS versus operating costs versus overhead don't overlap and should sum to total cost. What I left out is anything below the operating line: interest expense, depreciation, and taxes. Since the metric is net profit margin, not operating margin, those matter. If the chain took on debt to fund expansion, interest could explain a chunk of the drop on its own. I also didn't explicitly include one-time items like store closures or impairments.

On priority, I'd start with costs as a percent of revenue, because revenue grew — so the issue isn't demand collapsing, it's that costs grew faster than 15%. Within costs I'd go to the largest lines first, which in coffee retail I'd expect to be labor and occupancy, then COGS.

What would you like me to look at next?

**Interviewer · 0:17** (turn 4)

Understood. You've said costs grew faster than revenue. Which specific data would you ask for first to test that, and what result would tell you where the problem sits?

**Candidate · 0:23** (turn 5)

I'd ask for the P&L broken out by cost line for both years — two years ago and today — expressed both in absolute dollars and as a percent of revenue. Specifically: COGS, store labor, rent and occupancy, marketing, corporate overhead, and then interest and depreciation below the line.

The percent-of-revenue view is what tells me where the problem sits. If, say, labor went from 25% of revenue to 35% while everything else held flat, that's the driver and I'd dig into whether it's wage rates, hours per store, or headcount per store. If instead every line crept up a point or two, the story is different — that would point to a revenue-quality problem, like discounting or price not keeping up with inflation.

One thing I'd also want alongside that: menu price history over the two years, so I can tell whether the 15% revenue growth is price or volume.

What would you like me to look at next?

**Interviewer · 0:26** (turn 6)

A cost-line view in both years. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. I'll come back to menu price history shortly. Looking at those cost lines against the price data, where does the margin compression sit, and what does that tell you about where to dig next?

**Candidate · 0:33** (turn 7)

Let me do the math. Two years ago: 42 + 22 + 12 = 94% of revenue in costs, leaving 6%... no, wait — 100 minus 76 is 24%. That matches the 24% margin. Today: 58 + 22 + 14 = 94%, leaving 6%. That matches too. So the full 18-point decline is accounted for, and 16 of those 18 points sit in COGS. Overhead explains 2 points. Labor explains nothing.

So this is essentially a COGS story. That tells me to dig into what's inside COGS: input costs per unit — green coffee, milk, cups — versus quantity used per drink, versus waste and spoilage. And it could also be a mix effect, if they've shifted toward more expensive products, or a price effect, if prices haven't moved while input costs rose.

What would you like me to look at next?

**Interviewer · 0:35** (turn 8)

Got it. You asked about this earlier: Menu prices have not changed in two years. You offered price, mix and input cost as possible COGS explanations. Using that price figure, what does it tell you, and which COGS hypothesis do you test next?

**Candidate · 0:41** (turn 9)

Flat prices for two years is a big deal. It means the 15% revenue growth is all volume — more transactions or more stores — not price. And it means that if input costs per unit rose at all, that increase flows straight into COGS percent of revenue, because there's no offsetting price increase.

Let me sanity-check the size. COGS went from 42% to 58% of revenue. With price held constant, that's roughly a 38% increase in cost per dollar of revenue — 16 divided by 42. That's a very large input cost increase to absorb in two years, but coffee and dairy are commodity inputs and have been volatile, so it's plausible.

So the hypothesis I'd test next is input cost per unit — specifically green coffee and milk prices over the two years. If those explain most of the 16 points, we're done diagnosing. If they only explain part, I'd look at waste and spoilage, then product mix.

What would you like me to look at next?

**Interviewer · 0:44** (turn 10)

You said the roughly 38 percent increase is plausible for commodity inputs. Walk me through that. Raw coffee bean costs are up 40% over the past two years. Before you read that figure, how would you check whether that 38 percent increase in cost per revenue dollar is a believable input-cost move, and what would you compare it against?

**Candidate · 0:51** (turn 11)

Right — before accepting it, I'd want to decompose COGS into its components and weight them. The question is: what share of COGS is beans versus milk versus cups, packaging, food items? A 40% move in beans only produces a 38% move in total COGS if beans are essentially all of COGS, which they're not — in specialty coffee, beans are often a relatively small slice of cost of goods, maybe 20-30%, with dairy, cups and food making up the rest.

So the comparison is: weighted average input inflation versus the 38% implied. If beans are 25% of COGS and up 40%, that's 10 points of the 38 — leaves 28 unexplained. I'd then check dairy and packaging inflation against published commodity indices for the same period, and whatever's left after that is internal: waste, spoilage, portioning, or mix shift toward costlier drinks.

So the bean figure alone probably isn't sufficient.

What would you like me to look at next?

**Interviewer · 0:54** (turn 12)

Mm-hm. I can share coffee beans as a share of COGS and other input cost changes if you'd like. You said beans at a quarter of COGS and up 40% gives ten points of the 38. Points of what? Walk me through that conversion using the bean share you just received.

**Candidate · 1:00** (turn 13)

Let me be precise, because I was loose there — and I should flag that I assumed the 25% share, I haven't actually been given it.

The 38% is the percentage increase in COGS per dollar of revenue, from 42 cents to 58 cents. Since prices are flat, that's the same as the percentage increase in COGS per unit sold.

Now the conversion. If beans are 25% of COGS and bean cost rises 40%, the contribution to total COGS growth is the weight times the increase: 0.25 × 40% = 10%. So beans alone would push COGS up 10%, not 38%. Both numbers are percentage increases in total COGS, so they're comparable — that's what I meant by "10 points of the 38."

That leaves 28% of COGS growth from other sources. So yes, I'd take the actual bean share and the dairy and packaging cost changes.

What would you like me to look at next?

**Interviewer · 1:03** (turn 14)

Understood, and you flagged the assumption yourself. Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. With those two figures in hand, how much of the COGS increase do input prices explain? Points of what is your answer, and what does the remainder tell you?

**Candidate · 1:09** (turn 15)

Let me compute both pieces.

Beans: weight 25%, up 40%. 0.25 × 40 = 10% increase in total COGS.

Other inputs: weight 75%, up 37.5%. 0.75 × 37.5 = 28.1% increase in total COGS.

Sum: 10 + 28.1 = 38.1% increase in COGS per unit. And "points of what" — these are percentage points of growth in total COGS per unit sold, which is the same basis as the 38% implied by the move from 42 to 58 cents of COGS per revenue dollar, since prices are flat.

So input price inflation explains essentially the entire COGS increase — all 38%. The remainder is roughly zero.

That tells me this isn't a waste, spoilage, portioning, or mix problem. Operations are fine. It's a pure pass-through problem: input costs rose nearly 40% and Brew & Bean held menu prices flat for two years, so the entire increase hit the margin.

What would you like me to look at next?

**Interviewer · 1:11** (turn 16)

Got it. Here's an exhibit: Brew & Bean Cost Structure Over Time. Before that, you said the move comes to 38 percent of COGS. Points of what is the 16-point COGS move in revenue terms, and how does the 38 percent relate to it? Then read this exhibit and tell me what it adds.

**Candidate · 1:18** (turn 17)

Two different bases, so let me be clear. The 16 is percentage points of revenue — COGS went from 42 cents to 58 cents per dollar of revenue. The 38% is a percentage increase relative to the COGS base itself: 16 divided by 42 equals 38%. Same move, just expressed against revenue versus against COGS. Input inflation is naturally measured on the cost base, so the 38% is the right comparison for the pass-through check.

On the exhibit: the deterioration is steady, not a one-time shock. COGS goes 42, 50, 58 — eight points of revenue each year. Profit goes 24, 15, 6, so roughly nine points lost per year. Labor is flat at 22 throughout, confirming it's not a driver. Overhead creeps one point a year, 12 to 13 to 14, so it's a real but minor contributor, two of the eighteen points.

The steadiness matters — this is sustained commodity inflation they've absorbed year after year, not a single bad quarter.

What would you like me to look at next?

**Interviewer · 1:20** (turn 18)

Understood. Beyond what we've discussed, what else could Brew & Bean do to reverse the margin decline? Give me a range of ideas, not just the first one that comes to mind.

**Candidate · 1:27** (turn 19)

Let me group them into three buckets.

On price: raise menu prices, but not uniformly — take more on low-elasticity items like espresso drinks and food attachments, less on the signature drip coffee that drives traffic. Could also stage it over a few increases rather than one jump to limit sticker shock.

On input costs: lock in forward contracts or hedges on beans and dairy so they're not fully exposed next year, renegotiate supplier terms using their 200-store scale, consolidate SKUs to get volume discounts, and look at portioning and sourcing — a different bean blend or origin at a lower price point.

On mix: push customers toward higher-margin items — food, pastries, cold brew, and retail bagged beans. Loyalty programs and bundles can do that without a visible price increase.

On the other cost lines: overhead is up two points, so corporate cost discipline is worth a look even though it's smaller.

And longer term, I'd consider whether some locations are structurally unprofitable.

What would you like me to look at next?

**Interviewer · 1:29** (turn 20)

A three-bucket list, with price and input costs both covered. The CEO asks you for your recommendation. Which of these levers would you pull first, and why?

**Candidate · 1:35** (turn 21)

My recommendation: raise menu prices first, and do it now. That's the fastest, highest-impact lever, and it directly addresses the root cause.

Here's the logic. Input costs rose roughly 38% over two years and explain essentially the entire 16-point COGS increase. Menu prices have been flat the whole time, so Brew & Bean absorbed all of it. Rough math: to restore COGS from 58% back toward 42% of revenue, you'd need price up around 38% if volume held — that's too much at once, but even a 10-15% increase phased over two or three steps recovers a meaningful share of the margin, and it requires no operational change.

Risks: volume loss if customers are price-sensitive, and competitor pricing — if peers already raised prices, Brew & Bean has headroom; if not, they're exposed.

Next steps: test elasticity in a subset of stores, benchmark competitor prices, and in parallel start hedging beans and dairy so this doesn't recur.

What would you like me to look at next?

**Interviewer · 1:37** (turn 22)

Price first, with hedging in parallel. What is the biggest risk to that recommendation, and how would you mitigate it?

**Candidate · 1:43** (turn 23)

The biggest risk is demand elasticity — that a 10-15% price increase drives enough volume loss to offset the margin gain. Specialty coffee is discretionary and there are substitutes everywhere, including making it at home, so customers may trade down or reduce visit frequency.

A quick sanity check on how much cushion there is: if prices rise 10% and COGS per unit is unchanged, COGS falls from 58% to about 53% of revenue, so roughly 5 points of margin. That's real, but if volume drops meaningfully the fixed lines — labor at 22% and overhead at 14% — get spread over fewer units and partially eat the gain.

Mitigation: pilot the increase in a representative set of stores, maybe 20 of the 200, across different market types, and measure transaction counts and ticket size for a few weeks before rolling out nationally. Also benchmark competitors first, and lead with the less elastic items. If elasticity looks bad, shift weight toward mix and sourcing levers.

What would you like me to look at next?

**Interviewer · 1:44** (turn 24)

That's our time. Thanks for working through this with me — your written report will follow.
