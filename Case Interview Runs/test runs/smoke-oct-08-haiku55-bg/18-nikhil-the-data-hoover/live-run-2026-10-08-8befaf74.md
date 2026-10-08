# Live run — Brew & Bean Profitability

- Session: `8befaf74-25a2-4c56-9f9e-f286cde3d067` · case `prof-001` · status **active** · 2026-10-08
- Overall: **not scored**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **18. Nikhil — the Data Hoover**
- Tests: Rule 11 under volume: every request must be released, refused, or explicitly deferred — none may be silently skipped. Also tests Rule 10 labeling when multiple figures are released at once.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: none
- Force-released before the recommendation ask: none
- Scoring QA: `{}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | cogs_pct, labor_pct, overhead_pct | the full cost breakdown by line item for both years | no |
| 1 | refuse | — | revenue split by store versus wholesale or packaged bean channel | no |
| 1 | refuse | — | transactions per store per day | no |
| 1 | defer | avg_ticket | average ticket size | no |
| 1 | refuse | — | headcount per store and hourly wage rates | no |
| 1 | refuse | — | lease terms and rent per square foot | no |
| 1 | defer | stores_count | how many locations opened in the last two years | no |
| 1 | refuse | — | customer satisfaction or NPS trends | no |
| 3 | defer | bean_price_change | green coffee commodity prices | no |
| 3 | refuse | — | competitor margins for the specialty coffee segment | no |
| 3 | refuse | — | marketing spend as a percent of revenue | no |
| 3 | refuse | — | supplier contract terms | no |
| 3 | defer | menu_price_change | menu price history | no |
| 3 | refuse | — | waste and spoilage as a percent of product cost | no |
| 3 | defer | bean_share_of_cogs, non_bean_input_change | the COGS split by input | no |
| 3 | refuse | — | the overhead breakdown between corporate and store-level | no |
| 5 | defer | menu_price_change | menu price history | no |
| 5 | refuse | — | regional cost variation across the locations | no |
| 5 | refuse | — | same-store sales growth versus growth from new stores | no |
| 5 | refuse | — | the mix of drinks sold | no |
| 5 | refuse | — | whether the company hedges or forward-buys coffee | no |
| 5 | refuse | — | pounds of beans purchased per year | no |
| 5 | defer | non_bean_input_change | the split of the other COGS across dairy, packaging and food individually | no |
| 5 | defer | revenue_total | total revenue in dollars for both years | no |
| 5 | refuse | — | COGS in absolute dollars for both years | no |
| 7 | refuse | — | any store closures in the period | no |
| 7 | refuse | — | the franchise versus company-owned split | no |
| 7 | refuse | — | loyalty program penetration | no |
| 7 | refuse | — | price elasticity estimates | no |
| 7 | refuse | — | gross margin by product category | no |
| 7 | refuse | — | items per transaction then versus now | no |
| 7 | refuse | — | transaction count per year | no |
| 7 | refuse | — | revenue two years ago in dollars | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 4 | 0 | 0 | — |
| conduct_model | 4 | 0 | 0 | — |
| data_decisions | 0 | 4 | 0 | 1, 3, 5, 7 |
| end_gate | 4 | 0 | 0 | — |
| end_rec_ask_gate | 4 | 0 | 0 | — |
| model_turn_validation | 4 | 0 | 0 | — |
| pressure_test | 1 | 3 | 0 | 3, 5, 7 |
| recompute | 4 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 4 | — |
| stall | 4 | 0 | 0 | — |
| stream_buffer_switch | 4 | 0 | 0 | — |
| stream_prefix_mismatch | 4 | 0 | 0 | — |
| style | 1 | 3 | 0 | 1, 3, 5 |
| timeframe | 4 | 0 | 0 | — |
| turn_kind | 4 | 0 | 0 | — |
| unit_check | 4 | 0 | 0 | — |
| verified_figures | 4 | 0 | 0 | — |
| vetoes | 4 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens (incl. cache) | Output tokens | USD |
|---|---|---|---|---|
| distress (claude-haiku-5-5) | 4 | 3415 | 172 | $0.000 |
| interviewer (claude-sonnet-5-5) | 4 | 25823 | 1897 | $0.047 |
| coverage (claude-haiku-4-5-20251001) | 4 | 4487 | 604 | $0.008 |
| probe_judge (claude-haiku-5-5) | 2 | 1764 | 121 | $0.000 |
| candidate simulator () | 0 | 0 | 0 | $0.000 |

- App cost (interviewer, background, scoring; from llm_usage): **$0.06** · with simulator: **$0.06** · list prices, cache included
- Metered (every Anthropic call this process made, incl. aborted streams): spent $0.1255 of $0.30 — this process: claude-haiku-5-5 6 calls $0.0007; claude-sonnet-5-5 4 calls $0.0470; claude-haiku-4-5-20251001 4 calls $0.0075
- Wall time: 0:22

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a moment, then walk me through how you'd approach this.

**Candidate · 0:00** (turn 1)

Okay, so profitability — revenue up but margin way down, so something on the cost side. Before I frame anything, can I get some data?

One, the full cost breakdown by line item for both years. Two, revenue split by store versus any wholesale or packaged bean channel. Three, number of transactions per store per day. Four, average ticket size. Five, headcount per store and hourly wage rates. Six, the lease terms and rent per square foot. Seven, how many of the 200 locations opened in the last two years. Eight, customer satisfaction or Net Promoter Score trends.

Do we have those?

**Interviewer · 0:05** (turn 2)

Right. I don't have revenue split by store versus wholesale or packaged bean channel, transactions per store per day, headcount per store and hourly wage rates, lease terms and rent per square foot or customer satisfaction or NPS trends. I'll come back to the full cost breakdown by line item for both years, average ticket size and how many locations opened in the last two years shortly. That's a long list of data. Before I release anything, take a minute and lay out the structure you'd use to organize this problem. How would you break it down?

**Candidate · 0:05** (turn 3)

Sure — before I lay it out, a few more things would help.

One, the COGS split by input: green coffee beans, dairy, syrups, cups and lids, pastries. Two, green coffee commodity prices over the last two years. Three, supplier contract terms and whether any were renegotiated. Four, menu price history — have we raised prices at all in those two years? Five, waste and spoilage as a percent of product cost. Six, the overhead breakdown between corporate and store-level. Seven, competitor margins for the specialty coffee segment. Eight, marketing spend as a percent of revenue.

Structurally, I'd go profit equals revenue minus cost, then drive down the cost side since COGS jumped sixteen points. Do we have the COGS input split?

**Interviewer · 0:09** (turn 4)

Understood. I don't have supplier contract terms, waste and spoilage as a percent of product cost, the overhead breakdown between corporate and store-level, competitor margins for the specialty coffee segment or marketing spend as a percent of revenue. I'll come back to the COGS split by input, green coffee commodity prices and menu price history shortly. You said COGS jumped sixteen points. Where did that come from, since you haven't seen any cost data yet? And your structure so far is revenue minus cost with the cost side first. Is that MECE, and what's missing?

**Candidate · 0:09** (turn 5)

Before I quantify, a few more asks.

One, COGS in absolute dollars for both years, not just percent. Two, total revenue in dollars for both years. Three, the split of the other 75% of COGS across dairy, packaging, and food individually. Four, pounds of beans purchased per year. Five, whether we hedge or forward-buy coffee. Six, the mix of drinks sold — brewed versus espresso versus cold brew. Seven, same-store sales growth versus growth from new stores. Eight, regional cost variation across the 200 locations.

And again, menu price history, whenever you have it.

Directionally, beans at 25% of COGS up 40%, and the other 75% up 37.5%, so basically everything's up roughly 38–40%. Which is why COGS went 42 to 58. But I'd want the dollar figures before I commit to a number.

**Interviewer · 0:16** (turn 6)

Mm-hm. I don't have COGS in absolute dollars for both years, pounds of beans purchased per year, whether the company hedges or forward-buys coffee, the mix of drinks sold, same-store sales growth versus growth from new stores or regional cost variation across the locations. I'll come back to total revenue in dollars for both years, the split of the other COGS across dairy, packaging and food individually and menu price history shortly. Before I share that data, I'd like your answer on the structure: what might be missing from your structure?

**Candidate · 0:16** (turn 7)

A few more things first.

One, revenue two years ago in dollars. Two, transaction count per year. Three, items per transaction then versus now. Four, gross margin by product category. Five, price elasticity estimates if we raised prices. Six, loyalty program penetration.七 — sorry, seven, franchise versus company-owned split. Eight, any store closures in the period.

On what I have: revenue is $480M today, up 15%, so roughly $417M two years ago. COGS went from 42% to 58% — at today's revenue that's $278M versus $202M at the old rate, so about $76M of margin destroyed. And the whole 18-point margin drop is 16 points COGS, 2 points overhead. The key insight is input costs rose ~38–40% but menu prices are flat, so we absorbed all of it. Revenue growth came from basket size, not price.

**Interviewer · 0:20** (turn 8)

Understood. I don't have revenue two years ago in dollars, transaction count per year, items per transaction then versus now, gross margin by product category, price elasticity estimates, loyalty program penetration, the franchise versus company-owned split or any store closures in the period. Which part of the problem would you dig into first?
