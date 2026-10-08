# Live run — Brew & Bean Profitability

- Session: `b86dfbc9-9243-480b-88eb-ca6b9111597e` · case `prof-001` · status **active** · 2026-10-08
- Overall: **not scored**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **18. Nikhil — the Data Hoover**
- Tests: Rule 11 under volume: every request must be released, refused, or explicitly deferred — none may be silently skipped. Also tests Rule 10 labeling when multiple figures are released at once.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `menu_price_change`, `revenue_total`, `non_bean_input_change`, `avg_ticket`, `bean_share_of_cogs`, `bean_price_change`, `cogs_pct`, `labor_pct`, `overhead_pct`
- Force-released before the recommendation ask: none
- Scoring QA: `{}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | refuse | — | revenue split by store and wholesale or packaged bean channel | no |
| 1 | refuse | — | customer satisfaction or Net Promoter Score trends | no |
| 1 | refuse | — | number of locations opened in the last two years | no |
| 1 | refuse | — | lease terms and rent per square foot | no |
| 1 | refuse | — | headcount per store and hourly wage rates | no |
| 1 | defer | avg_ticket | average ticket size | no |
| 1 | refuse | — | transactions per store per day | no |
| 1 | defer | cogs_pct, labor_pct, overhead_pct | cost breakdown by line item for both years | no |
| 3 | refuse | — | Marketing spend as a percentage of revenue | no |
| 3 | refuse | — | Competitor margins | no |
| 3 | defer | overhead_pct | Corporate and store-level overhead breakdown | no |
| 3 | refuse | — | Waste and spoilage as a share of product cost | no |
| 3 | defer | menu_price_change | Menu price changes | no |
| 3 | refuse | — | Supplier contract terms and renegotiations | no |
| 3 | defer | bean_price_change | Green coffee commodity price change | no |
| 3 | defer | bean_share_of_cogs | Green coffee input cost split | no |
| 3 | defer | cogs_pct | COGS as a percentage of revenue | no |
| 5 | defer | cogs_pct | COGS as a percentage of revenue for both years | no |
| 5 | defer | bean_share_of_cogs | coffee beans' share of prior-period COGS | no |
| 5 | refuse | — | COGS in dollars for both years | no |
| 5 | defer | bean_price_change | coffee bean price change over the period | no |
| 5 | refuse | — | same-store sales versus new-store growth | no |
| 5 | refuse | — | regional cost variation | no |
| 5 | release | menu_price_change | menu price history | yes |
| 5 | refuse | — | drink mix by type | no |
| 5 | refuse | — | coffee hedging or forward-buying | no |
| 5 | refuse | — | annual pounds of beans purchased | no |
| 5 | release | non_bean_input_change | dairy, packaging and food split of COGS | yes |
| 5 | release | revenue_total | total revenue in dollars for both years | yes |
| 7 | refuse | — | Items per transaction over time | no |
| 7 | refuse | — | Annual transaction count | no |
| 7 | refuse | — | Revenue two years ago | no |
| 7 | refuse | — | Loyalty program penetration | no |
| 7 | refuse | — | Franchise versus company-owned store split | no |
| 7 | refuse | — | Store closures | no |
| 7 | release | cogs_pct | COGS as a percentage of revenue | yes |
| 7 | release | labor_pct | Labor as a percentage of revenue | yes |
| 7 | release | overhead_pct | Overhead and rent as a percentage of revenue | yes |
| 7 | release | avg_ticket | Average transaction value | yes |
| 7 | release | bean_share_of_cogs | Coffee beans' share of prior-period COGS | yes |
| 7 | release | bean_price_change | Coffee bean price change | yes |
| 7 | refuse | — | Price elasticity estimates | no |
| 7 | refuse | — | Gross margin by product category | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 4 | 0 | 0 | — |
| conduct_model | 4 | 0 | 0 | — |
| data_decisions | 0 | 4 | 0 | 1, 3, 5, 7 |
| end_gate | 4 | 0 | 0 | — |
| end_rec_ask_gate | 4 | 0 | 0 | — |
| model_turn_validation | 4 | 0 | 0 | — |
| pressure_test_repeat | 4 | 0 | 0 | — |
| recompute | 4 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 4 | — |
| stall | 4 | 0 | 0 | — |
| stream_buffer_switch | 4 | 0 | 0 | — |
| stream_prefix_mismatch | 4 | 0 | 0 | — |
| style | 2 | 2 | 0 | 1, 3 |
| timeframe | 4 | 0 | 0 | — |
| turn_kind | 4 | 0 | 0 | — |
| unit_check | 4 | 0 | 0 | — |
| verified_figures | 4 | 0 | 0 | — |
| vetoes | 4 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 4 | 2523 | 110 | $0.003 |
| interviewer (openai/gpt-6-luna) | 4 | 3367 | 1266 | $0.048 |
| coverage (claude-haiku-4-5-20251001) | 4 | 4553 | 394 | $0.007 |
| candidate simulator () | 0 | 0 | 0 | $0.000 |

- App cost (interviewer + scoring): **$0.06** · with simulator: **$0.06** · list prices, uncached
- Wall time: 0:16

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a moment, then walk me through how you'd approach this.

**Candidate · 0:00** (turn 1)

Okay, so profitability — revenue up but margin way down, so something on the cost side. Before I frame anything, can I get some data?

One, the full cost breakdown by line item for both years. Two, revenue split by store versus any wholesale or packaged bean channel. Three, number of transactions per store per day. Four, average ticket size. Five, headcount per store and hourly wage rates. Six, the lease terms and rent per square foot. Seven, how many of the 200 locations opened in the last two years. Eight, customer satisfaction or Net Promoter Score trends.

Do we have those?

**Interviewer · 0:04** (turn 2)

Understood. I don't have revenue split by store and wholesale or packaged bean channel, transactions per store per day, headcount per store and hourly wage rates, lease terms and rent per square foot, number of locations opened in the last two years or customer satisfaction or Net Promoter Score trends. I'll come back to cost breakdown by line item for both years and average ticket size shortly. Before we get into the data, how would you structure the problem?

**Candidate · 0:04** (turn 3)

Sure — before I lay it out, a few more things would help.

One, the COGS split by input: green coffee beans, dairy, syrups, cups and lids, pastries. Two, green coffee commodity prices over the last two years. Three, supplier contract terms and whether any were renegotiated. Four, menu price history — have we raised prices at all in those two years? Five, waste and spoilage as a percent of product cost. Six, the overhead breakdown between corporate and store-level. Seven, competitor margins for the specialty coffee segment. Eight, marketing spend as a percent of revenue.

Structurally, I'd go profit equals revenue minus cost, then drive down the cost side since COGS jumped sixteen points. Do we have the COGS input split?

**Interviewer · 0:06** (turn 4)

You’ve framed profit as revenue minus cost. I don't have Supplier contract terms and renegotiations, Waste and spoilage as a share of product cost, Competitor margins or Marketing spend as a percentage of revenue. I'll come back to COGS as a percentage of revenue, Green coffee input cost split, Green coffee commodity price change, Menu price changes and Corporate and store-level overhead breakdown shortly. Is that MECE—what might be missing?

**Candidate · 0:06** (turn 5)

Before I quantify, a few more asks.

One, COGS in absolute dollars for both years, not just percent. Two, total revenue in dollars for both years. Three, the split of the other 75% of COGS across dairy, packaging, and food individually. Four, pounds of beans purchased per year. Five, whether we hedge or forward-buy coffee. Six, the mix of drinks sold — brewed versus espresso versus cold brew. Seven, same-store sales growth versus growth from new stores. Eight, regional cost variation across the 200 locations.

And again, menu price history, whenever you have it.

Directionally, beans at 25% of COGS up 40%, and the other 75% up 37.5%, so basically everything's up roughly 38–40%. Which is why COGS went 42 to 58. But I'd want the dollar figures before I commit to a number.

**Interviewer · 0:09** (turn 6)

You’re asking for the dollar bridge and several underlying drivers. On what you asked about earlier: Menu prices have not changed in two years. Total revenue is $480M a year. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. I don't have COGS in dollars for both years, annual pounds of beans purchased, coffee hedging or forward-buying, drink mix by type, same-store sales versus new-store growth or regional cost variation. I'll come back to COGS as a percentage of revenue for both years, coffee beans' share of prior-period COGS and coffee bean price change over the period shortly. Using the cost figures and the numbers you cited, walk me through the margin impact of each COGS driver and distinguish the margin decline from costs that simply rose with revenue.

**Candidate · 0:09** (turn 7)

A few more things first.

One, revenue two years ago in dollars. Two, transaction count per year. Three, items per transaction then versus now. Four, gross margin by product category. Five, price elasticity estimates if we raised prices. Six, loyalty program penetration.七 — sorry, seven, franchise versus company-owned split. Eight, any store closures in the period.

On what I have: revenue is $480M today, up 15%, so roughly $417M two years ago. COGS went from 42% to 58% — at today's revenue that's $278M versus $202M at the old rate, so about $76M of margin destroyed. And the whole 18-point margin drop is 16 points COGS, 2 points overhead. The key insight is input costs rose ~38–40% but menu prices are flat, so we absorbed all of it. Revenue growth came from basket size, not price.

**Interviewer · 0:12** (turn 8)

You’re attributing the decline to input costs and basket growth. You asked about this earlier: The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. Here's an exhibit: Brew & Bean Cost Structure Over Time. I don't have Revenue two years ago, Annual transaction count, Items per transaction over time, Gross margin by product category, Price elasticity estimates, Loyalty program penetration, Franchise versus company-owned store split or Store closures. What does the exhibit tell you, and how would you reconcile it with your margin bridge?
