# Live run — Brew & Bean Profitability

- Session: `dc37beda-86dd-45cd-bb9e-99af8919d96a` · case `prof-001` · status **completed** · 2026-10-05
- Overall: **strong**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **2. Tobias — the Silent Thinker**
- Tests: Rule 13 silence tolerance as a false-positive test: the ladder must NOT fire on a candidate who is simply slow. The 60s check-in may fire (it is not a rung); a ladder rung or a technical pause is a fail. Pauses sit above the check-in on purpose — the 27 Sep run used 45–55s and never reached it.
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_share_of_cogs`, `bean_price_change`, `non_bean_input_change`, `menu_price_change`, `avg_ticket`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":1,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":2,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":1,"crossDimensionRepeats":0,"dataRequestsNotInCase":2,"interviewerErrorMarks":0}`
- Assists / interventions: silence_check_in@1, silence_check_in@4, silence_check_in@7, silence_check_in@10, silence_check_in@13, silence_check_in@18, load_shed@19

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 2 | defer | cogs_pct, labor_pct, overhead_pct | Cost breakdown as a percentage of revenue for both years | no |
| 5 | release | cogs_pct, labor_pct, overhead_pct | Cost breakdown as a percentage of revenue for both years | yes |
| 8 | release | menu_price_change | Whether menu prices changed over the two-year period | yes |
| 8 | release | bean_share_of_cogs, non_bean_input_change | COGS breakdown into components (coffee beans, dairy, food, packaging) for both years | yes |
| 14 | refuse | — | Competitor pricing over the same period and elasticity data from past price changes | no |
| 16 | none | — | Item-level margin data by product SKU to identify high-margin and low-margin items | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| action_validation | 7 | 0 | 0 | — |
| assumption_guard | 6 | 0 | 1 | — |
| conduct | 7 | 0 | 0 | — |
| conduct_model | 7 | 0 | 0 | — |
| copied_check_in | 7 | 0 | 0 | — |
| data_promise | 7 | 0 | 0 | — |
| end_gate | 7 | 0 | 0 | — |
| end_rec_ask_gate | 7 | 0 | 0 | — |
| exhibit_promise | 7 | 0 | 0 | — |
| fabricated_turn | 7 | 0 | 0 | — |
| final_message_release | 1 | 0 | 0 | — |
| forced_release | 1 | 0 | 6 | — |
| grace_ask | 7 | 0 | 0 | — |
| meta_leak | 6 | 1 | 0 | 11 |
| offer_accepted | 7 | 0 | 0 | — |
| probe_guard | 7 | 0 | 0 | — |
| provenance | 7 | 0 | 0 | — |
| recompute | 7 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 7 | — |
| same_turn_resolution | 4 | 1 | 2 | 2 |
| spoken_close | 7 | 0 | 0 | — |
| stale_release | 5 | 0 | 0 | — |
| stall | 7 | 0 | 0 | — |
| stream_buffer_switch | 6 | 1 | 0 | 11 |
| stream_prefix_mismatch | 5 | 0 | 2 | — |
| style | 7 | 0 | 0 | — |
| synthesis_guard | 7 | 0 | 0 | — |
| system_language | 7 | 0 | 0 | — |
| time_warning | 7 | 0 | 0 | — |
| timeframe | 7 | 0 | 0 | — |
| unit_check | 7 | 0 | 0 | — |
| verified_figures | 4 | 3 | 0 | 8, 11, 19 |
| wordless_exhibit | 7 | 0 | 0 | — |
| wordless_reveal | 7 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 7 | 4803 | 188 | $0.006 |
| data_request (claude-haiku-4-5) | 14 | 14373 | 994 | $0.019 |
| interviewer (claude-sonnet-5-5) | 7 | 18894 | 681 | $0.045 |
| coverage (claude-haiku-4-5-20251001) | 6 | 9034 | 696 | $0.013 |
| judge (claude-opus-5-5) | 1 | 12615 | 12006 | $0.291 |
| verifier (claude-opus-5-5) | 1 | 5544 | 2311 | $0.068 |
| reconcile (claude-opus-5-5) | 1 | 3506 | 1714 | $0.048 |
| candidate simulator (claude-opus-5) | 7 | 14843 | 2614 | $0.140 |

- App cost (interviewer + scoring): **$0.49** · with simulator: **$0.63** · list prices, uncached
- Wall time: 21:04

## Feedback

**Top improvement:** Derive the impact of your recommended lever out loud before you quote it. You said a 10% price increase recovers 'roughly 4 points.' With costs at 94 points and volume flat, 10% price takes margin to 16/110 ≈ 14.5%, about 8.5 points. Then state how much volume loss that cushion could absorb. Getting this number right is what makes pricing clearly the primary lever.

### Problem Structuring — meets_bar
- ✅ The candidate used the case facts to form an early hypothesis and weighted the structure toward costs before asking for any data.
  > Since revenue is up 15% but margin fell from 24% to 6%, the problem is almost certainly on the cost side, so I'd weight my structure there — but I want to confirm revenue quality first.
- ⚠️ The opening framework had overlapping buckets, with external factors duplicating causes already inside COGS and labor. Only when prompted did the candidate rebuild it as a clean profit = revenue − cost tree with a clear rule for prioritizing within costs.
  > Three, external factors: commodity price moves, wage legislation, competitive pressure forcing discounting.
  > keep revenue and cost as the two mutually exclusive branches, since profit is just revenue minus cost, and treat external factors as a cause layer sitting underneath each cost line rather than a third bucket
  > Within cost, I'd start with the largest line as a percentage of revenue and the one that moved most between the two years, because that's where the 18 points are hiding.
- ⚠️ The candidate never restated the CEO's objective (find the root cause and reverse it) or linked the structure to the decision it would inform. The opening went straight to buckets.
  > Three buckets. One, revenue: is the 15% growth coming from new store openings, same-store volume, or price?
- 💡 Opening framework in turn 2, before listing buckets.
  > Better: The CEO needs two things: why margin fell 18 points while revenue grew 15%, and which levers reverse it. Since profit is revenue minus cost, I'll split it two ways. Revenue is volume times price, and I want to know whether price has kept pace. Costs are COGS, labor and overhead. Under each branch I'll test external drivers like commodity inflation and competitor pricing. Rising revenue tells me the answer likely sits in a cost line that outran price, so I'd start there. That diagnosis will tell us whether the fix is pricing, procurement, or operations.

### Quantitative & Analytical Rigor — meets_bar
- ✅ The candidate converted the nested share correctly from percent of COGS to points of revenue, narrated each step, and checked that the total reconciled to the observed 58%.
  > Two years ago COGS was 42 points of revenue. Beans were 25% of that, so 10.5 points; everything else was 75%, so 31.5 points.
  > Total 58.0 points — which matches the 58% exactly.
- ✅ The candidate drew a sharp business implication from the arithmetic: beans explain only about a quarter of the COGS increase.
  > beans only contribute 4.2 of the 16 points. Dairy, packaging, and food contribute 11.8 points, nearly three times as much
- ✅ The candidate correctly backed out transaction growth from revenue and ticket growth, and sized procurement properly.
  > transactions are up about 1.15 / 1.10 = 1.045, so roughly 4.5% more transactions
  > Inputs are 58 points of revenue, so a 5% reduction in input cost is about 2.9 points of margin.
- ⚠️ The price-increase impact was asserted without derivation, and it is materially understated. With volume and costs held flat, a 10% price rise takes revenue from 100 to 110 against 94 of costs. Margin goes to 16/110 ≈ 14.5%, a gain of about 8.5 points, not about 4. This undersells the candidate's own primary lever.
  > A 10% price increase on 58% COGS recovers roughly 4 points of margin.
- ⚠️ The waste-recovery figure was stated as a benchmark with no derivation or anchor to the case data.
  > That's typically 1–3 points recoverable with tighter standards.
- 💡 Sizing the pricing lever in the final recommendation (turn 19).
  > Better: Let me size it. Costs today are 94 points of revenue. If price rises 10% with volume flat, revenue goes to 110 and margin goes to 16 over 110, about 14.5%, so roughly 8 to 9 points recovered. On a 94% cost base, each 1% of volume lost costs much less than 1% of profit, so we could absorb a meaningful traffic dip and still come out well ahead. That's why pricing leads.

### Data & Exhibit Interpretation — strong
- ✅ The candidate read the cost table systematically and reconciled it to the full margin decline before drawing conclusions.
  > COGS up 16 points, overhead up 2, labor flat — that's 18 points of margin, which exactly matches the 24% to 6% decline.
- ✅ The candidate isolated COGS as the driver, quantified its share, and offered candidate causes behind it.
  > So COGS explains roughly 89% of the problem.
  > A 16-point swing in COGS as a percentage of revenue means either input costs rose sharply without being passed through to price, or the mix of what we're selling shifted toward lower-margin items, or there's waste — spoilage, over-portioning — that's grown.
- ✅ The candidate proposed precise next steps: the COGS component split and menu-price history. The candidate then tested whether the bean spike alone explains the move.
  > First, a split of that COGS line into its components — coffee beans, dairy, food, packaging — for both years, so I can see which input moved.
  > Hedging coffee alone would fix a quarter of the problem.
- ⚠️ The 2-point overhead increase, about 11% of the decline, was dismissed rather than briefly probed for a driver such as expansion costs.
  > Overhead is a rounding error by comparison.
- 💡 Reading the cost breakdown in turn 8, when overhead was waved off.
  > Better: Overhead adds 2 of the 18 points. That's small, but I'd quickly check whether it's tied to new-store openings or rent escalators, because it won't fix itself.

### Business Judgment & Insight — strong
- ✅ The candidate correctly identified the lack of price action as the commercial root cause and recommended a phased, market-tested price increase.
  > The real root cause is that menu prices held flat through roughly 38% broad input inflation.
  > I'd phase it — mid-single digits now, test by market.
- ✅ The candidate surfaced the key risk of pricing into thin traffic growth unprompted and paired it with a mitigation.
  > Risks: we have no elasticity or competitor data, and traffic is only growing 4.5%, so a clumsy increase could stall it.
- ✅ The candidate read the ticket-size data correctly: higher basket size lifts gross profit dollars but not margin. The candidate used traffic health as evidence of pricing headroom.
  > it lifts absolute gross profit dollars but does nothing for margin. Only price does that.
  > Demand is healthy and basket is expanding, which suggests we have some pricing headroom we've simply never tested in two years.
- ⚠️ The candidate contradicted the mix lever while proposing it. Shifting what sells is exactly how the blended COGS ratio changes.
  > We can't change the 58% blended ratio, but we can shift what sells.
- ⚠️ The candidate proposed hedging and long-term fixed contracts without noting the risk of locking in costs at today's elevated input prices.
  > forward hedging on coffee and dairy to stop the bleeding from future moves
- 💡 Proposing procurement levers in turn 16.
  > Better: One caution on hedging. Input prices are up about 38%, so locking in multi-year contracts now could fix us at the peak. I'd ladder contracts and hedge a portion rather than all of our volume.

### Creativity & Brainstorming — meets_bar
- ✅ The candidate organized the brainstorm into three labeled levers and ordered them by impact.
  > Three other levers, roughly in order of impact.
- ✅ The procurement bucket held several distinct tactics rather than a single generic idea.
  > I'd look at consolidating to fewer suppliers for volume discounts, longer-term fixed contracts, and forward hedging on coffee and dairy to stop the bleeding from future moves.
  > Private-label or direct-from-origin sourcing on beans too.
- ⚠️ The ideas were conventional cost-side levers (procurement, mix, waste). None was non-obvious, and nothing addressed revenue or menu architecture beyond the price finding.
  > Third, waste and portioning.
  > Push high-margin items — brewed coffee, espresso drinks without dairy, food we control — and de-emphasize or delist the worst-margin SKUs.
- 💡 Answering 'Beyond pricing, what else could the client do?' in turn 16.
  > Better: I'll split this into cost-to-serve, menu architecture, and revenue quality. Beyond procurement, I'd redesign cup sizes and recipes to cut dairy per drink. I'd add a modest upcharge on dairy alternatives and extra shots. I'd use the loyalty app to steer traffic toward high-margin bundles, and add a premium reserve tier that carries price more easily. Of these, recipe and size redesign is fastest because it attacks the 11.8 points from non-bean inputs directly.

### Synthesis & Recommendation — strong
- ✅ The recommendation was answer-first, with the root cause stated immediately.
  > My recommendation: Brew & Bean should raise menu prices immediately, and pair it with a procurement overhaul.
  > The root cause is that the company absorbed roughly 38% input inflation over two years without changing price once.
- ✅ The supporting reasons came straight from the analysis, especially the finding that this is a broad-basket problem.
  > Beans are the headline but only 4.2 points; dairy, packaging and food are 11.8. So this is a broad-basket problem, not a coffee problem.
- ✅ The candidate named the key risk and concrete next steps within a tight close.
  > Next steps: price-test in two or three markets, pull item-level margins, and open supplier negotiations now.
- ⚠️ The sizing behind the lead lever was understated. That weakens the case for prioritizing pricing and makes the levers look closer in impact than they are.
  > A 10% price increase on 58% COGS recovers roughly 4 points of margin.
- 💡 Quantifying the combined path back to target margin in turn 19.
  > Better: Together, a phased 8–10% price increase worth 7 to 8 points, plus 2 to 3 points from procurement, gets us from 6% back to roughly the mid-teens within a year. Mix and waste close more of the gap toward 24%.

### Communication & Delivery — strong
- ✅ Answers were consistently top-down, giving the conclusion before the supporting detail.
  > COGS, clearly.
  > That's an important distinction, and it doesn't rescue us.
- ✅ The candidate signposted structure throughout and used explicit hypothesis language.
  > Three buckets.
  > My hypothesis going in is that costs have grown faster than revenue, likely in COGS or labor.
- 💡 Right after each new question or data drop (turns 0, 3, 6, 9, 12, 17), when the interviewer had to prompt.
  > Better: Let me take 20 seconds to work through the numbers, then I'll walk you through it.

### Pushback, Composure & Case Leadership — strong
- ✅ When the MECE challenge came, the candidate conceded only the specific flaw, explained why, and restructured with reasoning rather than capitulating wholesale.
  > Not strictly, no. External factors overlap with the first two — a commodity price spike shows up inside COGS, a minimum wage increase shows up inside labor.
- ✅ The candidate generally drove the case by requesting the right data at each step. The exception came after stating a clear rule for which cost line to examine, when the candidate handed the lead back to the interviewer instead of asking for that specific data.
  > Second, have menu prices changed at all over the two years? If input costs rose and we never repriced, that alone could explain most of this.
  > Do we have anything on competitor pricing over the same period, or any elasticity data from past price changes?
  > Which cost line should I look at first?
- ✅ The candidate absorbed new information immediately and extended it into a fresh insight.
  > It also tells me where the 15% revenue growth came from.
- 💡 End of turn 5, after explaining the prioritization logic.
  > Better: So I'd like the cost lines as a percentage of revenue for both years. I'll start with whichever is largest and moved most.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a minute if you need it, then tell me how you'd structure your approach.

**Interviewer · 1:01** (turn 1)

Still with me? Take your time. The question on the table: how would you approach this problem?

**Candidate · 2:48** (turn 2)

Here's how I'd approach it. Since revenue is up 15% but margin fell from 24% to 6%, the problem is almost certainly on the cost side, so I'd weight my structure there — but I want to confirm revenue quality first.

Three buckets. One, revenue: is the 15% growth coming from new store openings, same-store volume, or price? Growth driven purely by opening new stores can mask flat or declining per-store economics.

Two, costs, split fixed versus variable: COGS — coffee beans, milk, packaging; labor — wages, hours, turnover; occupancy — rent, utilities; and corporate overhead, including anything tied to the expansion.

Three, external factors: commodity price moves, wage legislation, competitive pressure forcing discounting.

My hypothesis going in is that costs have grown faster than revenue, likely in COGS or labor.

To start: do we have a cost breakdown as a percentage of revenue for both years?

**Interviewer · 2:50** (turn 3)

Before we get to data: you've laid out revenue, costs, and external factors. Hold that request; I'll come back to it shortly. Is that MECE, and which branch do you prioritize first, and why?

**Interviewer · 3:51** (turn 4)

Still with me? Take your time. The question on the table: is that MECE, and which branch do you prioritize first, and why?

**Candidate · 5:32** (turn 5)

Not strictly, no. External factors overlap with the first two — a commodity price spike shows up inside COGS, a minimum wage increase shows up inside labor. So I'd restructure: keep revenue and cost as the two mutually exclusive branches, since profit is just revenue minus cost, and treat external factors as a cause layer sitting underneath each cost line rather than a third bucket. That's cleanly MECE.

I'd prioritize cost. Revenue grew 15%, so the denominator is healthy — if costs had stayed proportional, margin would be flat. An 18-point margin drop with rising revenue means costs grew substantially faster. Within cost, I'd start with the largest line as a percentage of revenue and the one that moved most between the two years, because that's where the 18 points are hiding.

Which cost line should I look at first?

**Interviewer · 5:35** (turn 6)

Okay. You asked for the cost breakdown as a percentage of revenue for both years, so here it is. Which line would you look at first, and why? COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%.

**Interviewer · 6:36** (turn 7)

Still with me? Take your time. The question on the table: which line would you look at first, and why?

**Candidate · 8:23** (turn 8)

COGS, clearly. Let me check it reconciles: COGS up 16 points, overhead up 2, labor flat — that's 18 points of margin, which exactly matches the 24% to 6% decline. So COGS explains roughly 89% of the problem. Overhead is a rounding error by comparison.

That's a very large move. A 16-point swing in COGS as a percentage of revenue means either input costs rose sharply without being passed through to price, or the mix of what we're selling shifted toward lower-margin items, or there's waste — spoilage, over-portioning — that's grown.

Two things I'd want. First, a split of that COGS line into its components — coffee beans, dairy, food, packaging — for both years, so I can see which input moved. Second, have menu prices changed at all over the two years? If input costs rose and we never repriced, that alone could explain most of this.

**Interviewer · 8:26** (turn 9)

Okay. Here's the component view you asked for, along with the pricing question. Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Menu prices have not changed in two years. Using these, what do you conclude about what's driving the COGS increase?

**Interviewer · 9:27** (turn 10)

Still with me? Take your time. The question on the table: using these, what do you conclude about what's driving the COGS increase?

**Candidate · 11:18** (turn 11)

Let me run it. Two years ago COGS was 42 points of revenue. Beans were 25% of that, so 10.5 points; everything else was 75%, so 31.5 points.

Beans up 40%: 10.5 × 1.4 = 14.7 points. Other inputs up 37.5%: 31.5 × 1.375 = 43.3 points. Total 58.0 points — which matches the 58% exactly.

So two conclusions. First, this is almost entirely input cost inflation passed straight through to the P&L with zero price action. Volume and mix aren't the story; the arithmetic closes without them.

Second — and this is the part I'd push back on with the CEO — beans get the attention because 40% is the headline number, but beans only contribute 4.2 of the 16 points. Dairy, packaging, and food contribute 11.8 points, nearly three times as much, because they're 75% of the basket. Hedging coffee alone would fix a quarter of the problem.

The real root cause is that menu prices held flat through roughly 38% broad input inflation.

**Interviewer · 11:20** (turn 12)

Understood. Your arithmetic is on the table. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit.

**Interviewer · 12:21** (turn 13)

Still with me? Take your time.

**Candidate · 14:08** (turn 14)

That's an important distinction, and it doesn't rescue us. Ticket size is up 10%, but entirely through units per visit, not price. Every incremental item carries the same 58% cost ratio, so adding items scales revenue and COGS together — it lifts absolute gross profit dollars but does nothing for margin. Only price does that.

It also tells me where the 15% revenue growth came from. If revenue is up 15% and ticket is up 10%, transactions are up about 1.15 / 1.10 = 1.045, so roughly 4.5% more transactions. So traffic is modestly growing, not collapsing — customers aren't walking away.

That's actually encouraging for the recommendation. Demand is healthy and basket is expanding, which suggests we have some pricing headroom we've simply never tested in two years.

Do we have anything on competitor pricing over the same period, or any elasticity data from past price changes?

**Interviewer · 14:11** (turn 15)

I don't have competitor pricing or elasticity data. Beyond pricing, what else could the client do to reverse the margin decline?

**Candidate · 15:41** (turn 16)

Three other levers, roughly in order of impact.

First, procurement. Inputs are 58 points of revenue, so a 5% reduction in input cost is about 2.9 points of margin. With 200 locations we have real scale — I'd look at consolidating to fewer suppliers for volume discounts, longer-term fixed contracts, and forward hedging on coffee and dairy to stop the bleeding from future moves. Private-label or direct-from-origin sourcing on beans too.

Second, mix. We can't change the 58% blended ratio, but we can shift what sells. Push high-margin items — brewed coffee, espresso drinks without dairy, food we control — and de-emphasize or delist the worst-margin SKUs. I'd want item-level margin data to target this properly.

Third, waste and portioning. A 16-point COGS move invites the question of whether spoilage or over-pouring has crept up alongside it. That's typically 1–3 points recoverable with tighter standards.

Overhead is up 2 points and worth a look, but it's a tenth of the problem — I wouldn't lead there.

**Interviewer · 15:44** (turn 17)

Okay. Putting those levers together with your price finding, what is your recommendation to the CEO?

**Interviewer · 16:45** (turn 18)

Still with me? Take your time. The question on the table: putting those levers together with your price finding, what is your recommendation to the CEO?

**Candidate · 18:39** (turn 19)

My recommendation: Brew & Bean should raise menu prices immediately, and pair it with a procurement overhaul. The root cause is that the company absorbed roughly 38% input inflation over two years without changing price once.

The math: COGS went from 42 to 58 points of revenue, overhead from 12 to 14 — that's the full 18-point margin decline, and COGS alone is 16 of it. Beans are the headline but only 4.2 points; dairy, packaging and food are 11.8. So this is a broad-basket problem, not a coffee problem.

Pricing is the fastest lever because it flows almost entirely to the bottom line. A 10% price increase on 58% COGS recovers roughly 4 points of margin. I'd phase it — mid-single digits now, test by market. Procurement — consolidated contracts and hedging on coffee and dairy — adds 2 to 3 points over 6 to 12 months. Mix shift and waste control add another 1 to 3.

Risks: we have no elasticity or competitor data, and traffic is only growing 4.5%, so a clumsy increase could stall it. Next steps: price-test in two or three markets, pull item-level margins, and open supplier negotiations now.

**Interviewer · 18:40** (turn 20)

We'll stop there. Thanks for working through the case — your written report will follow.
