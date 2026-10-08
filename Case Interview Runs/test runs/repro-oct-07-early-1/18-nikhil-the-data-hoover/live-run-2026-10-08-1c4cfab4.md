# Live run — Brew & Bean Profitability

- Session: `1c4cfab4-ab94-4012-9a9a-414ca75ea93f` · case `prof-001` · status **active** · 2026-10-08
- Overall: **not scored**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **18. Nikhil — the Data Hoover**
- Tests: Rule 11 under volume: every request must be released, refused, or explicitly deferred — none may be silently skipped. Also tests Rule 10 labeling when multiple figures are released at once.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `avg_ticket`, `stores_count`, `revenue_total`
- Force-released before the recommendation ask: none
- Scoring QA: `{}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | refuse | — | revenue by channel | no |
| 1 | refuse | — | transactions per store per day | no |
| 1 | defer | avg_ticket | average ticket size | no |
| 1 | refuse | — | headcount per store and hourly wage rates | no |
| 1 | refuse | — | lease terms and rent per square foot | no |
| 1 | defer | stores_count | locations opened in the last two years | no |
| 1 | refuse | — | customer satisfaction or NPS trends | no |
| 1 | defer | cogs_pct, labor_pct, overhead_pct | full cost breakdown by line item | no |
| 3 | defer | bean_share_of_cogs, non_bean_input_change | COGS input split | no |
| 3 | defer | cogs_pct | COGS as a share of revenue | no |
| 3 | defer | labor_pct | Labor as a share of revenue | no |
| 3 | defer | overhead_pct | Overhead and rent as a share of revenue | no |
| 3 | defer | avg_ticket | Average transaction value | no |
| 3 | defer | stores_count | Number of stores | no |
| 3 | defer | bean_price_change | Coffee bean price change | no |
| 3 | refuse | — | Supplier contract terms and renegotiations | no |
| 3 | defer | menu_price_change | Menu price changes | no |
| 3 | refuse | — | Waste and spoilage as a share of product cost | no |
| 3 | refuse | — | Corporate and store-level overhead breakdown | no |
| 3 | refuse | — | Competitor margins | no |
| 3 | refuse | — | Marketing spend as a share of revenue | no |
| 5 | defer | labor_pct | Labor as a share of revenue | no |
| 5 | defer | overhead_pct | Overhead and rent as a share of revenue | no |
| 5 | release | avg_ticket | Average transaction value | yes |
| 5 | release | cogs_pct | COGS as a share of revenue | yes |
| 5 | release | stores_count | Number of stores | yes |
| 5 | defer | bean_share_of_cogs | Coffee beans as a share of COGS | no |
| 5 | defer | non_bean_input_change | Other input cost changes | no |
| 5 | defer | bean_price_change | Coffee bean price change | no |
| 5 | defer | menu_price_change | Menu price changes | no |
| 5 | refuse | — | COGS in absolute dollars | no |
| 5 | defer | revenue_total | Total revenue in dollars for both years | no |
| 5 | refuse | — | Dairy, packaging and food split within COGS | no |
| 5 | refuse | — | Pounds of beans purchased per year | no |
| 5 | refuse | — | Coffee hedging or forward-buying | no |
| 5 | refuse | — | Drink mix | no |
| 5 | refuse | — | Same-store sales versus new-store growth | no |
| 5 | refuse | — | Regional cost variation | no |
| 7 | refuse | — | revenue two years ago | no |
| 7 | refuse | — | annual transaction count | no |
| 7 | refuse | — | items per transaction | no |
| 7 | refuse | — | gross margin by product category | no |
| 7 | refuse | — | price elasticity estimates | no |
| 7 | refuse | — | loyalty program penetration | no |
| 7 | refuse | — | franchise versus company-owned split | no |
| 7 | refuse | — | store closures | no |
| 7 | defer | labor_pct | labor as a share of revenue | no |
| 7 | defer | overhead_pct | overhead and rent as a share of revenue | no |
| 7 | defer | bean_share_of_cogs | coffee beans as a share of COGS | no |
| 7 | defer | non_bean_input_change | other input cost changes | no |
| 7 | defer | bean_price_change | coffee bean price change | no |
| 7 | defer | menu_price_change | menu price changes | no |
| 7 | release | revenue_total | total annual revenue | yes |

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
| distress (claude-haiku-4-5) | 4 | 2523 | 112 | $0.003 |
| interviewer (openai/gpt-6-luna) | 4 | 3725 | 1465 | $0.055 |
| coverage (claude-haiku-4-5-20251001) | 4 | 4659 | 390 | $0.007 |
| candidate simulator () | 0 | 0 | 0 | $0.000 |

- App cost (interviewer + scoring): **$0.06** · with simulator: **$0.06** · list prices, uncached
- Wall time: 0:13

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a moment, then walk me through how you'd approach this.

**Candidate · 0:00** (turn 1)

Okay, so profitability — revenue up but margin way down, so something on the cost side. Before I frame anything, can I get some data?

One, the full cost breakdown by line item for both years. Two, revenue split by store versus any wholesale or packaged bean channel. Three, number of transactions per store per day. Four, average ticket size. Five, headcount per store and hourly wage rates. Six, the lease terms and rent per square foot. Seven, how many of the 200 locations opened in the last two years. Eight, customer satisfaction or Net Promoter Score trends.

Do we have those?

**Interviewer · 0:03** (turn 2)

Understood. I don't have revenue by channel, transactions per store per day, headcount per store and hourly wage rates, lease terms and rent per square foot or customer satisfaction or NPS trends. I'll come back to full cost breakdown by line item, average ticket size and locations opened in the last two years shortly. Before we get into data, how would you structure the analysis?

**Candidate · 0:03** (turn 3)

Sure — before I lay it out, a few more things would help.

One, the COGS split by input: green coffee beans, dairy, syrups, cups and lids, pastries. Two, green coffee commodity prices over the last two years. Three, supplier contract terms and whether any were renegotiated. Four, menu price history — have we raised prices at all in those two years? Five, waste and spoilage as a percent of product cost. Six, the overhead breakdown between corporate and store-level. Seven, competitor margins for the specialty coffee segment. Eight, marketing spend as a percent of revenue.

Structurally, I'd go profit equals revenue minus cost, then drive down the cost side since COGS jumped sixteen points. Do we have the COGS input split?

**Interviewer · 0:06** (turn 4)

Mm-hm. I don't have Supplier contract terms and renegotiations, Waste and spoilage as a share of product cost, Corporate and store-level overhead breakdown, Competitor margins or Marketing spend as a share of revenue. I'll come back to COGS input split, COGS as a share of revenue, Labor as a share of revenue, Overhead and rent as a share of revenue, Average transaction value, Number of stores, Coffee bean price change and Menu price changes shortly. Is that MECE — what's missing?

**Candidate · 0:06** (turn 5)

Before I quantify, a few more asks.

One, COGS in absolute dollars for both years, not just percent. Two, total revenue in dollars for both years. Three, the split of the other 75% of COGS across dairy, packaging, and food individually. Four, pounds of beans purchased per year. Five, whether we hedge or forward-buy coffee. Six, the mix of drinks sold — brewed versus espresso versus cold brew. Seven, same-store sales growth versus growth from new stores. Eight, regional cost variation across the 200 locations.

And again, menu price history, whenever you have it.

Directionally, beans at 25% of COGS up 40%, and the other 75% up 37.5%, so basically everything's up roughly 38–40%. Which is why COGS went 42 to 58. But I'd want the dollar figures before I commit to a number.

**Interviewer · 0:09** (turn 6)

Understood. On what you asked about earlier: COGS is 58% of revenue today, up from 42% two years ago. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. I don't have COGS in absolute dollars, Dairy, packaging and food split within COGS, Pounds of beans purchased per year, Coffee hedging or forward-buying, Drink mix, Same-store sales versus new-store growth or Regional cost variation. I'll come back to Coffee beans as a share of COGS, Other input cost changes, Coffee bean price change, Menu price changes and Total revenue in dollars for both years shortly. I can share Labor as a share of revenue and Overhead and rent as a share of revenue if you'd like. You’ve described input costs rising by roughly 38–40%; walk me through the basis for that, and how it relates to the change in COGS as a share of revenue.

**Candidate · 0:09** (turn 7)

A few more things first.

One, revenue two years ago in dollars. Two, transaction count per year. Three, items per transaction then versus now. Four, gross margin by product category. Five, price elasticity estimates if we raised prices. Six, loyalty program penetration.七 — sorry, seven, franchise versus company-owned split. Eight, any store closures in the period.

On what I have: revenue is $480M today, up 15%, so roughly $417M two years ago. COGS went from 42% to 58% — at today's revenue that's $278M versus $202M at the old rate, so about $76M of margin destroyed. And the whole 18-point margin drop is 16 points COGS, 2 points overhead. The key insight is input costs rose ~38–40% but menu prices are flat, so we absorbed all of it. Revenue growth came from basket size, not price.

**Interviewer · 0:12** (turn 8)

Mm-hm. You asked about this earlier: Total revenue is $480M a year. I don't have revenue two years ago, annual transaction count, items per transaction, gross margin by product category, price elasticity estimates, loyalty program penetration, franchise versus company-owned split or store closures. I can share labor as a share of revenue, overhead and rent as a share of revenue, coffee beans as a share of COGS, other input cost changes, coffee bean price change and menu price changes if you'd like. You’ve attributed the margin decline to input costs and flat menu prices. Can you check that against the cost and pricing data, then tell me what you conclude?
