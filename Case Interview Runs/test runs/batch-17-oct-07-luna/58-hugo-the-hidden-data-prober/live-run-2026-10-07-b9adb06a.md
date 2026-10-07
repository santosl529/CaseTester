# Live run — Brew & Bean Profitability

- Session: `b9adb06a-eb0a-48c4-ab19-06ec9b2f6a4e` · case `prof-001` · status **completed** · 2026-10-07
- Overall: **not scored**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **58. Hugo — the Hidden-Data Prober**
- Tests: A provenance trap the spec doesn't address: confirming or denying the guess leaks unreleased ledger data. The interviewer must decline to validate without revealing — likely a Rule 6 amendment, not just a test.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `non_bean_input_change`, `menu_price_change`, `avg_ticket`, `stores_count`, `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_price_change`, `bean_share_of_cogs`
- Force-released before the recommendation ask: none
- Scoring QA: `{}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | cogs_pct, labor_pct, overhead_pct | cost breakdown for both years | no |
| 3 | release | overhead_pct | overhead and rent as a share of revenue | yes |
| 3 | release | cogs_pct | COGS as a share of revenue | yes |
| 3 | release | labor_pct | labor as a share of revenue | yes |
| 5 | release | bean_price_change | coffee bean price change | yes |
| 5 | release | bean_share_of_cogs | coffee beans’ share of COGS | yes |
| 5 | defer | non_bean_input_change | other input cost changes | no |
| 7 | release | non_bean_input_change | other input cost changes | yes |
| 9 | release | avg_ticket, stores_count | revenue growth split between price, transaction volume, and new stores | yes |
| 9 | release | menu_price_change | menu price history | yes |
| 11 | refuse | — | competitor menu-price changes | no |
| 17 | refuse | — | Competitor menu price changes over the same period | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 9 | 0 | 0 | — |
| conduct_model | 9 | 0 | 0 | — |
| data_decisions | 2 | 7 | 0 | 1, 3, 5, 7, 9, 11, 17 |
| end_gate | 9 | 0 | 0 | — |
| end_rec_ask_gate | 8 | 1 | 0 | 15 |
| model_turn_validation | 7 | 1 | 0 | 15 |
| recompute | 9 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 9 | — |
| stall | 9 | 0 | 0 | — |
| stream_buffer_switch | 8 | 0 | 0 | — |
| stream_prefix_mismatch | 8 | 0 | 1 | — |
| style | 9 | 0 | 0 | — |
| timeframe | 9 | 0 | 0 | — |
| turn_kind | 7 | 2 | 0 | 15, 17 |
| unit_check | 9 | 0 | 0 | — |
| verified_figures | 2 | 7 | 0 | 5, 7, 9, 11, 13, 15, 17 |
| vetoes | 9 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 9 | 6044 | 241 | $0.007 |
| interviewer (openai/gpt-6-luna) | 9 | 6979 | 779 | $0.054 |
| coverage (claude-haiku-4-5-20251001) | 8 | 13228 | 368 | $0.015 |
| data_request (claude-haiku-4-5) | 1 | 956 | 57 | $0.001 |
| candidate simulator (claude-opus-5) | 9 | 21172 | 3454 | $0.192 |

- App cost (interviewer + scoring): **$0.08** · with simulator: **$0.27** · list prices, uncached
- Wall time: 2:15

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a minute if you need it, then tell me how you'd structure your approach.

**Candidate · 0:25** (turn 1)

Okay, so revenue is up 15% but margin fell from 24% to 6% — that's an 18-point drop, which is huge, so this is almost certainly a cost story rather than a demand story. Profit equals revenue minus costs, so I'd break it down that way.

On revenue, I'd want to know whether the 15% growth came from more stores, more transactions per store, or higher ticket — because if they opened a lot of new locations, new stores ramping up could drag margin on their own.

On costs, I'd split fixed versus variable: COGS (coffee beans, milk, cups), labor, rent and occupancy, then corporate overhead and marketing.

Let me start on costs since that's where the swing is. Do we have a breakdown of the cost structure for both years?

**Interviewer · 0:26** (turn 2)

Mm-hm. I'll come back to cost breakdown for both years shortly. Before we get into the data, is your framework MECE—what might be missing?

**Candidate · 0:35** (turn 3)

Fair challenge. A few gaps. First, I lumped everything into revenue and cost, but I didn't separate store-level economics from corporate — a chain can have healthy unit economics and still bleed at the corporate line, and the fix is completely different. Second, I treated the 200 stores as one average, when the decline could be concentrated in a subset — new markets, or stores on recently renewed leases.

Third, I didn't account for mix. If they've shifted toward food or cold drinks, those carry different margins even at constant prices and costs.

And on revenue I folded price into "ticket," but price and volume should sit separately, because 15% revenue growth with flat prices and rising input costs is a very different story from 15% growth driven by discounting.

So the cleaner structure is: unit-level P&L, decomposed into price, volume, mix, and cost per unit — then corporate costs on top. Does that hold up?

**Interviewer · 0:36** (turn 4)

Understood. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Which part of that structure would you prioritize first, and why?

**Candidate · 0:43** (turn 5)

COGS, clearly. Let me check the arithmetic: COGS up 16 points, overhead up 2, labor flat — that's 18 points, which exactly accounts for the margin going from 24% to 6%. So COGS is roughly 89% of the problem and overhead is the remaining 11%. Everything else is noise.

So the question becomes what's inside that 16 points. A specialty coffee chain's COGS is basically beans, dairy, cups and packaging, and food if they carry it.

Here's where I'd test something. Arabica prices ran up sharply over that window — if beans were, say, 40% of COGS two years ago and green coffee roughly doubled, beans alone would push COGS from 42% to around 59% with nothing else moving. That's essentially the whole gap. Is that roughly how it broke out — beans doing almost all the work?

**Interviewer · 0:45** (turn 6)

You’re testing whether bean inflation explains the COGS movement. Raw coffee bean costs are up 40% over the past two years. Coffee beans were 25% of COGS two years ago. I can share other input cost changes if you'd like. Given those figures, how much of the COGS increase can you attribute to beans, and what would you investigate next?

**Candidate · 0:55** (turn 7)

Let me size it. Beans were 25% of a 42-point COGS, so 10.5% of revenue. Up 40% gives 14.7% of revenue — an increase of 4.2 points.

So beans explain 4.2 of the 16-point COGS increase, about a quarter. My hypothesis was wrong; the other three quarters, roughly 11.8 points of revenue, is coming from somewhere else.

That's a lot to find. The other inputs were 31.5 points of revenue two years ago, and they'd need to reach 43.3 today — call it a 37% increase on that whole bucket, which is nearly bean-level inflation across everything else simultaneously. That strikes me as unlikely from pure commodity moves.

If dairy is around 30% of COGS and it rose in line with reported dairy inflation, you'd still be left needing the remaining inputs to climb close to 25% on their own. Is that roughly where it landed, or is something non-commodity sitting in that line?

**Interviewer · 0:56** (turn 8)

Mm-hm. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. What do those other input cost changes suggest, and what would you investigate next to explain the remaining COGS increase?

**Candidate · 1:03** (turn 9)

That closes it. Other inputs: 31.5 points of revenue × 1.375 = 43.3 points. Add beans at 14.7 and I get 58.0 — exactly today's COGS. So input inflation fully explains the 16-point move; there's no shrink, waste, or portioning problem hiding in there.

Which reframes the case entirely. The costs aren't the anomaly — commodity inflation happened to everyone. The anomaly is that Brew & Bean absorbed 100% of it. A specialty chain with pricing power should have passed most of that through.

So the real question is on the revenue side: what happened to menu prices? Do we have a menu-price history over the two years, and ideally the split of the 15% revenue growth between price, transaction volume, and new stores?

If prices were flat and the 15% came from volume and new units, then this isn't a cost problem at all — it's a pricing failure, and that's where the fix lives.

**Interviewer · 1:05** (turn 10)

You’ve framed this as a pricing question. Menu prices have not changed in two years. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. What does the menu-price history tell you, and how would you use it to assess whether pricing kept pace with input costs?

**Candidate · 1:16** (turn 11)

Flat prices for two years while blended input costs rose ~38%. And the 15% revenue growth is entirely organic — no new stores, ticket up 10% from basket size, so transactions up roughly 4.5%. Volume is healthy. Customers aren't leaving; they're buying more. That's real brand strength the client isn't monetizing.

Sizing the gap: per $100 of revenue, total costs are $94. To get back to a 24% margin at constant volume, I need 94/(1−0.24) = $123.7 of revenue — so about a 24% price increase. A full pass-through of input inflation would be closer to 38%, which would overshoot to roughly a 32% margin.

So the pricing hole is somewhere in that 24–38% band. If competitors took three or four increases of 5–8% over the window, they'd be sitting near 25% cumulative — right at my breakeven number. Is that roughly where the market landed?

**Interviewer · 1:17** (turn 12)

You’re testing how far pricing lagged the market. I don't have competitor menu-price changes. How would you use competitor pricing to judge your proposed price increase, and what would you recommend to the CEO?

**Candidate · 1:26** (turn 13)

Without competitor data I'd use it two ways: as a ceiling check — if peers moved ~25% and we move 24%, we land at parity, so elasticity risk is modest and the increase is a catch-up rather than a premium grab; and as a diagnostic on how much headroom we have before volume responds. I'd get it from menu scrapes and a quick mystery-shop across our top 20 markets.

Recommendation: raise prices roughly 20–25% over the next 12 months. This is a pricing failure, not a cost failure — inflation fully explains the 16-point COGS move, and Brew & Bean absorbed all of it while transactions still grew 4.5%.

Supporting: demand is strong, basket size is up, no footprint drag.

Execution: phase it in three increments of 7–8%, lead with high-margin and lower-visibility SKUs, test in two markets first.

Risks: 24% is steep; if elasticity bites, margin recovery stalls. Also renegotiate dairy and packaging contracts in parallel — that's the other 2 points from overhead.

**Interviewer · 1:28** (turn 14)

Understood. What is the biggest risk to your recommendation, and how would you mitigate it?

**Candidate · 2:05** (turn 15)

The biggest risk is that my 24% number is derived from accounting, not from customer behavior. I backed into it by solving for a 24% margin at constant volume — but constant volume is exactly the assumption a 24% price increase puts under pressure. If elasticity is even moderately negative, say volume drops 10%, I lose a meaningful chunk of the recovery and I've also damaged traffic, which is the one healthy thing in this business.

There's a specific wrinkle too: ticket is up because people are buying more items per visit. Multi-item baskets are more price-sensitive in aggregate — the second pastry is the first thing to go. So I could see ticket compress even if transactions hold.

Mitigation: test before scaling. Pilot in two or three comparable markets for 8–12 weeks, measure transactions and items-per-basket separately, and set a stop-gate — if traffic falls more than 3–4%, pause and shift weight to mix and supply-side levers instead.

**Interviewer · 2:07** (turn 16)

Understood. What's your recommendation to the client?

**Candidate · 2:14** (turn 17)

Recommendation: raise menu prices approximately 20–25% over the next four quarters, phased, with a market pilot first. That alone restores the bulk of the margin.

The logic: this is a pricing failure, not a cost problem. Beans added 4.2 points of revenue in cost, other inputs 11.8 — together exactly the 16-point COGS move, so there's no operational leakage to chase. Meanwhile prices have been frozen for two years while transactions grew 4.5% and baskets grew 10%. Demand is not the issue; the client simply never passed inflation through.

Sequencing: pilot 7–8% in two or three markets this quarter, measure transactions and items-per-basket separately, then roll out in three waves. In parallel, renegotiate dairy and packaging contracts and address the 2-point overhead creep — that's worth another point or two.

Risk: elasticity. Stop-gate if traffic falls beyond 3–4%.

What I'd want before committing to the exact number is competitor menu-price movement, which tells us whether 24% is catch-up or a premium.

**Interviewer · 2:15** (turn 18)

I don't have Competitor menu price changes over the same period. We'll stop there. Thanks for working through the case — your written report will follow.
