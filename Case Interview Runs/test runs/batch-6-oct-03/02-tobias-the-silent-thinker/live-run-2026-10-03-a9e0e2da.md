# Live run — Brew & Bean Profitability

- Session: `a9e0e2da-d260-473d-9045-ff780dc34622` · case `prof-001` · status **completed** · 2026-10-03
- Overall: **meets_bar**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **2. Tobias — the Silent Thinker**
- Tests: Rule 13 silence tolerance as a false-positive test: the ladder must NOT fire on a candidate who is simply slow. The 60s check-in may fire (it is not a rung); a ladder rung or a technical pause is a fail. Pauses sit above the check-in on purpose — the 27 Sep run used 45–55s and never reached it.
- Pacing: human (8000ms think + 90 wpm typing, ≤90s per turn); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_price_change`, `non_bean_input_change`, `menu_price_change`, `avg_ticket`, `bean_share_of_cogs`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":true,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":6,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":1,"crossDimensionRepeats":1,"dataRequestsNotInCase":1,"interviewerErrorMarks":0}`
- Assists / interventions: silence_check_in@1, silence_check_in@4, silence_check_in@7, silence_check_in@10, silence_check_in@13, silence_check_in@16, load_shed@19

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 2 | defer | cogs_pct, labor_pct, overhead_pct | Cost breakdown as a percent of revenue for both years | no |
| 5 | release | cogs_pct, labor_pct, overhead_pct | Variable costs per unit of revenue (costs as a percent of revenue for current and prior year) | yes |
| 8 | release | bean_price_change | Coffee bean cost per pound versus two years ago | yes |
| 8 | release | non_bean_input_change | Dairy cost per gallon versus two years ago | yes |
| 8 | release | menu_price_change | Whether menu prices have changed in the last two years | yes |
| 11 | release | avg_ticket | Transaction counts and average ticket by year | yes |
| 11 | none | — | Whether the 40% bean price increase is market-wide or specific to the company's contracts | no |
| 14 | release | bean_share_of_cogs | The split of COGS between coffee beans and other inputs (dairy, packaging, food) | yes |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| assumption_guard | 7 | 0 | 1 | — |
| conduct | 8 | 0 | 0 | — |
| conduct_model | 8 | 0 | 0 | — |
| copied_check_in | 8 | 0 | 0 | — |
| data_promise | 8 | 0 | 0 | — |
| end_gate | 8 | 0 | 0 | — |
| exhibit_promise | 8 | 0 | 0 | — |
| fabricated_turn | 8 | 0 | 0 | — |
| final_message_release | 1 | 0 | 0 | — |
| forced_release | 1 | 0 | 7 | — |
| grace_ask | 8 | 0 | 0 | — |
| meta_leak | 8 | 0 | 0 | — |
| probe_guard | 8 | 0 | 0 | — |
| provenance | 8 | 0 | 0 | — |
| recompute | 8 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 8 | — |
| same_turn_resolution | 6 | 0 | 2 | — |
| spoken_close | 8 | 0 | 0 | — |
| stale_release | 6 | 0 | 0 | — |
| stall | 8 | 0 | 0 | — |
| style | 8 | 0 | 0 | — |
| system_language | 8 | 0 | 0 | — |
| time_warning | 7 | 1 | 0 | 19 |
| timeframe | 8 | 0 | 0 | — |
| unit_check | 5 | 3 | 0 | 14, 17, 21 |
| verified_figures | 7 | 1 | 0 | 8 |
| wordless_exhibit | 8 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 8 | 5493 | 203 | $0.007 |
| data_request (claude-haiku-4-5) | 16 | 12785 | 1231 | $0.019 |
| interviewer (claude-sonnet-5-5) | 8 | 64255 | 2419 | $0.153 |
| coverage (claude-haiku-4-5-20251001) | 7 | 11681 | 742 | $0.015 |
| judge (claude-opus-5-5) | 1 | 12788 | 11017 | $0.271 |
| verifier (claude-opus-5-5) | 1 | 5647 | 1643 | $0.055 |
| reconcile (claude-opus-5-5) | 1 | 3321 | 2414 | $0.062 |
| candidate simulator (claude-opus-5) | 8 | 18551 | 3062 | $0.169 |

- App cost (interviewer + scoring): **$0.58** · with simulator: **$0.75** · list prices, uncached
- Wall time: 22:30

## Feedback

**Top improvement:** Derive every number you put in a recommendation. Your 'roughly 10% increase restores most of the margin' was never computed and is wrong: with costs at 94% of revenue, 10% pricing yields about a 14.5% margin (half the lost points), and returning to 24% would need about 24%. Set up margin = 1 − costs/(1+p) out loud before quoting a price move.

### Problem Structuring — meets_bar
- ✅ The candidate used the revenue-up / margin-down tension to form an early hypothesis and prioritize the cost side.
  > Since revenue is actually up 15% while margin collapsed from 24% to 6%, the problem is almost certainly on the cost side, so I'd weight my analysis there
- ✅ When asked to prioritize, the candidate gave a clear, arithmetic-based reason for starting with variable costs and designed a test that would eliminate buckets quickly.
  > Costs first — specifically variable costs per unit of revenue.
  > I can drop two of my three buckets.
- ⚠️ The client's objective (find the root cause and reverse the decline) was never restated, and the structure was not explicitly tied to the decision the CEO must make.
  > Here's how I'd approach it.
- ⚠️ The third bucket overlaps with the cost bucket, because commodity prices and wage legislation are drivers of COGS and labor rather than a separate area, so the framework is not fully MECE.
  > Third, external context: commodity prices, wage legislation, competitive pricing.
- 💡 Opening framework in turn 2, before the three buckets were listed.
  > Better: The goal is to find why margin fell 18 points while revenue grew 15%, and decide what reverses it. Profit is revenue minus costs. On revenue I'd split price versus volume (new stores versus same-store traffic and ticket). On costs I'd split COGS, labor and overhead, each as a percent of revenue over time. I'd test market factors such as commodity prices and competitor pricing inside each of those rather than as a separate bucket. My hypothesis is COGS rising with no menu price pass-through, so I'd start there.

### Quantitative & Analytical Rigor — needs_work
- ✅ The candidate tied out both margin figures step by step, and the results are correct (24% and 6%).
  > Two years ago: COGS 42, labor 22, overhead 12 — that's 76, leaving 24% margin, which ties out.
- ✅ The candidate ran a sensitivity check on the endpoints and correctly backed out traffic growth from revenue and ticket growth (1.15/1.10 ≈ 4.5%).
  > at 37.5% the old 42 becomes 57.8, at 40% it becomes 58.8, and observed is 58.
  > revenue up 15% with ticket up 10% implies transactions up only about 4.5%
- ⚠️ The headline price increase was asserted, never derived, and it is materially wrong. Costs are 94% of today's revenue. A 10% price rise with no volume loss gives 94/110 ≈ 85.5%, a ~14.5% margin, which recovers only about 8.5 of the 18 points. Returning to 24% needs roughly 94/76 ≈ 1.24, about a 24% increase.
  > First, price — a roughly 10% increase restores most of the margin, phased by market and tested first.
- ⚠️ The candidate first presented an unweighted 'blended' input-inflation number as if it were computed and admitted it was a guess only when challenged, but once given the 25% bean share, computed the weighted blend correctly and verified it against the observed 58% COGS.
  > call it roughly 39% blended
  > Honestly, I should be upfront: I didn't weight it rigorously.
  > Beans at 25% of COGS: 0.25 times 40 is 10, 0.75 times 37.5 is 28.1, blended 38.1%.
- 💡 Final recommendation, when the candidate proposed 'a roughly 10% increase'.
  > Better: Total costs are 94% of today's revenue. If absolute costs hold and volume holds, a price increase of p gives margin 1 − 0.94/(1+p). At 10% that's about 14.5%, so roughly half the lost margin. Getting back to 24% needs about 24%, which is too much in one move. So I'd pair a ~10% selective increase with procurement savings to close the rest, and test elasticity first.

### Data & Exhibit Interpretation — strong
- ✅ The candidate read the cost table systematically and isolated COGS as 16 of the 18 lost points (overhead 2, labor flat), but then overstated the conclusion by calling the full 18-point decline input inflation despite the 2-point overhead increase.
  > So of the 18 points lost, COGS accounts for 16 and overhead for 2.
  > The decline is fully input inflation with no price pass-through — nothing else to find.
- ✅ The candidate immediately proposed the right next step, splitting COGS into price versus quantity and checking menu pricing.
  > Next I'd split COGS into price and quantity.
  > have we taken any menu price increases in the last two years?
- ✅ The candidate did not stop at beans: using the 25% share, the candidate showed that non-bean inputs are the bigger pool.
  > beans are only a quarter of COGS, so the bigger pool is dairy, packaging, and food — 75%.
- 💡 Turn 17, after receiving the 25% bean share.
  > Better: Beans were 10.5 points of revenue, so a 40% rise adds about 4.2 points. The other 31.5 points rising 37.5% add about 11.8. So beans are only about a quarter of the 16-point COGS move, and the bigger lever is dairy, packaging and food.

### Business Judgment & Insight — meets_bar
- ✅ The candidate proactively surfaced volume risk using the case's own traffic data and proposed a mitigation (market tests, a competitor check).
  > The risk is volume. Transactions are up only about 4.5% — traffic is nearly flat, so demand may be soft.
- ✅ The candidate honestly flagged an unsupported waste estimate and deprioritized it based on the evidence.
  > If waste had gotten worse, I'd expect COGS above 58. So I'd test it, but I'd rank it well below pricing and procurement.
- ⚠️ The candidate correctly identified price pass-through as the core lever and extended procurement beyond beans to the larger non-bean pool, but assumed without justification that ~10% pricing restores most of the margin. It recovers only about half the lost points, which understates how much procurement must contribute.
  > a roughly 10% increase restores most of the margin
  > Second, lock supply: forward contracts on beans, renegotiated dairy and packaging terms, since that's 75% of COGS.
- 💡 Recommending the price increase in turn 21.
  > Better: I'd raise prices selectively rather than across the board: more on specialty drinks where loyal customers are less price-sensitive, less on drip coffee where we compete on price. That recovers margin while protecting the traffic we can't afford to lose.

### Creativity & Brainstorming — strong
- ✅ The candidate organized the brainstorm into named levers with sub-ideas under each.
  > Beyond price increases, four levers.
- ✅ The candidate offered a non-obvious mix idea that builds on the items-per-visit finding, plus supplier consolidation across 200 stores.
  > Push them toward the highest-margin items — food attach, cold brew, larger sizes — rather than toward whatever they're adding now.
  > consolidate suppliers across 200 stores for scale
- ✅ The candidate prioritized the ideas, explicitly ranking overhead and waste below pricing and procurement.
  > Overhead: 2 points of the 18, worth a look but not the fight.
- ⚠️ The ideas skew heavily toward cost containment. Beyond mix, there is little on revenue-side or pricing-architecture options (for example, how to structure a price increase or new offerings).
  > Beyond price increases, four levers.

### Synthesis & Recommendation — strong
- ✅ The candidate led with a clear, committed recommendation and the reason for it.
  > My recommendation: raise menu prices.
- ✅ The candidate supported the recommendation with an ordered action plan, the key risk and next steps, but the synthesis carried the unsupported claim that ~10% pricing restores most of the margin and called the entire decline input inflation while acknowledging that overhead explains 2 points.
  > The risk is volume.
  > I'd want elasticity testing in a few markets before a national rollout, and I'd check what competitors have already done on price.
  > The entire decline is input inflation that was never passed through
  > overhead explains only 2 points
- 💡 Final recommendation, turn 21.
  > Better: Raise prices and fix procurement, in that order. Input costs rose about 38% with zero price pass-through, which explains the 16-point COGS jump. A selective ~10% increase recovers roughly half the margin, and renegotiating dairy, packaging and food, the 75% of COGS, closes more. The risk is traffic, which is nearly flat, so we pilot in a few markets first.

### Communication & Delivery — strong
- ✅ The candidate's answers were consistently answer-first with crisp framing lines.
  > The table closes the case on where, so now it's about why.
  > Costs first — specifically variable costs per unit of revenue.
- ✅ The candidate generally used hypothesis-driven phrasing and built on each new data point, but sometimes stated conclusions as settled fact before the supporting data was in, rather than as a hypothesis to confirm.
  > If input costs rose and we held price flat, that alone explains it.
  > On the ticket figure — that's important and it cuts in a specific direction.
  > It's fully explained by input inflation passed through with no price offset.

### Pushback, Composure & Case Leadership — strong
- ✅ The candidate committed to a precise-sounding 39% blended figure without flagging the missing weighting until the interviewer probed it, but when challenged, acknowledged the gap honestly and held the conclusion with an explicit sensitivity argument.
  > Honestly, I should be upfront: I didn't weight it rigorously.
  > But the conclusion isn't sensitive to it
  > call it roughly 39% blended
- ✅ When challenged on the waste estimate, the candidate labeled it a judgment call and updated its priority based on the evidence.
  > That's a judgment number, not something derived from anything you've given me — I should flag it as such.
- ✅ The candidate drove the case by requesting the specific data that would confirm or kill the hypothesis.
  > So: transaction counts and average ticket by year.

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a minute if you need it, then tell me how you'd structure your approach.

**Interviewer · 1:01** (turn 1)

Still with me? Take your time. The question on the table: how would you approach this problem?

**Candidate · 2:48** (turn 2)

Here's how I'd approach it. Since revenue is actually up 15% while margin collapsed from 24% to 6%, the problem is almost certainly on the cost side, so I'd weight my analysis there — but I want to confirm the revenue picture first, because revenue growth can hide a bad mix.

Three buckets.

First, revenue quality: is the 15% growth coming from new stores, more transactions per store, or higher prices? If it's new-store driven, same-store revenue could be flat or down, and new stores may be dragging margin while they ramp.

Second, costs, split fixed versus variable. Variable would be coffee beans, milk, cups, and store labor. Fixed would be rent, corporate overhead, and any marketing or tech spend.

Third, external context: commodity prices, wage legislation, competitive pricing.

To start — do we have a cost breakdown as a percent of revenue for both years?

**Interviewer · 2:52** (turn 3)

Hold the cost breakdown for a moment, we'll come back to it. You've given me three buckets. Which one do you prioritize first, and why?

**Interviewer · 3:54** (turn 4)

Still with me? Take your time. The question on the table: which one do you prioritize first, and why?

**Candidate · 5:33** (turn 5)

Costs first — specifically variable costs per unit of revenue.

The reason is arithmetic. Revenue grew 15% and margin fell 18 points. If this were purely a fixed-cost problem — say overhead or new-store rent — you'd generally expect growing revenue to spread fixed costs and *help* margin, not hurt it that badly. For fixed costs alone to drive an 18-point drop, we'd need a very large absolute step-up in spend, which is possible but would be a single, visible line item we'd find quickly.

A drop that large alongside revenue growth more often means cost is scaling with volume and scaling faster than revenue — so cost per cup went up. That points at beans, milk, packaging, or store labor.

The practical reason it's first: it's also the easiest to disprove. One table of costs as a percent of revenue for both years tells me immediately whether this is a variable-cost story or a fixed-cost story, and I can drop two of my three buckets.

**Interviewer · 5:38** (turn 6)

COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Okay, that's the cost table you asked for. What does it tell you, and what would you look at next?

**Interviewer · 6:40** (turn 7)

Still with me? Take your time. The question on the table: what does it tell you, and what would you look at next?

**Candidate · 8:27** (turn 8)

The table closes the case on where, so now it's about why.

Two years ago: COGS 42, labor 22, overhead 12 — that's 76, leaving 24% margin, which ties out. Today: 58 plus 22 plus 14 is 94, leaving 6%. Ties out again.

So of the 18 points lost, COGS accounts for 16 and overhead for 2. Labor is flat as a percent of revenue, which also tells me stores are staffing proportionally to volume — no operational blowup there. Overhead is a rounding issue by comparison. This is a COGS case.

Next I'd split COGS into price and quantity. On price: what are we paying per pound for beans and per gallon for dairy versus two years ago — is this a commodity spike we're absorbing? On quantity: has waste, spoilage, or portioning changed, or has product mix shifted toward lower-margin items?

And the other side of that ratio — have we taken any menu price increases in the last two years? If input costs rose and we held price flat, that alone explains it.

**Interviewer · 8:31** (turn 9)

Raw coffee bean costs are up 40% over the past two years. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Menu prices have not changed in two years. Given those three figures, what do you conclude about the driver, and what would you need to confirm it?

**Interviewer · 9:33** (turn 10)

Still with me? Take your time. The question on the table: given those three figures, what do you conclude about the driver, and what would you need to confirm it?

**Candidate · 11:20** (turn 11)

It's fully explained by input inflation passed through with no price offset.

Check the math: beans up 40%, everything else up 37.5% — call it roughly 39% blended. Old COGS was 42% of revenue. Hold menu price flat and hold volume per store constant, and that 42 becomes 42 times 1.39, which is about 58.4. Observed is 58. That's the entire 16-point move, with essentially nothing left over.

That's a strong result, because it means I don't need a second story — no waste problem, no mix shift, no procurement failure. One cause.

Two things to confirm. First, that revenue growth is volume, not price — if the 15% came from selling more cups at the same price, the arithmetic holds; if any of it came from price, my blended number is off and something else is also wrong. So: transaction counts and average ticket by year.

Second, whether the 40% is market-wide or specific to our contracts — that determines whether competitors are absorbing the same hit.

**Interviewer · 11:25** (turn 12)

The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. You called the blended figure roughly 39%. Walk me through how you weighted it.

**Interviewer · 12:26** (turn 13)

Still with me? Take your time.

**Candidate · 14:07** (turn 14)

Honestly, I should be upfront: I didn't weight it rigorously. The two figures are 40% and 37.5%, only two and a half points apart, so any weighting lands between them — beans-heavy gives 40, food-heavy gives 37.5. I split toward the middle and rounded to 39 because I don't have the split of COGS between beans and everything else. That's the one input I'd still want. But the conclusion isn't sensitive to it: at 37.5% the old 42 becomes 57.8, at 40% it becomes 58.8, and observed is 58. Either end explains the gap.

On the ticket figure — that's important and it cuts in a specific direction. The $6.80 is up 10% on items per visit, not price. More items means proportionally more cost, so it doesn't improve margin. And revenue up 15% with ticket up 10% implies transactions up only about 4.5%. Traffic is nearly flat.

**Interviewer · 14:11** (turn 15)

Coffee beans were 25% of COGS two years ago. Beyond what we've discussed, what else could the client do to reverse the decline?

**Interviewer · 15:13** (turn 16)

Still with me? Take your time. The question on the table: beyond what we've discussed, what else could the client do to reverse the decline?

**Candidate · 17:02** (turn 17)

First, that number closes it exactly. Beans at 25% of COGS: 0.25 times 40 is 10, 0.75 times 37.5 is 28.1, blended 38.1%. Old COGS 42 times 1.381 is 58.0. That's the observed figure to the decimal. The decline is fully input inflation with no price pass-through — nothing else to find.

Beyond price increases, four levers.

Procurement: beans are only a quarter of COGS, so the bigger pool is dairy, packaging, and food — 75%. Renegotiate those contracts, consolidate suppliers across 200 stores for scale, and lock forward contracts or hedges on beans so we're not re-exposed next year.

Mix: ticket is up because customers buy more items. Push them toward the highest-margin items — food attach, cold brew, larger sizes — rather than toward whatever they're adding now.

Portion and waste control: a point or two of COGS often sits in spoilage and over-pouring.

Overhead: 2 points of the 18, worth a look but not the fight.

**Interviewer · 17:04** (turn 18)

Understood. You mentioned a point or two of COGS sitting in spoilage and over-pouring. Walk me through where that estimate comes from.

**Candidate · 18:34** (turn 19)

That's a judgment number, not something derived from anything you've given me — I should flag it as such.

Where it comes from: in food service generally, waste runs in the low single digits of food cost, and it's the line operators most often find slack in because it's measured poorly. A point or two of revenue on a 58-point COGS base is roughly a 2–3% reduction in input usage, which is the kind of gain a portioning or inventory program typically delivers. So it's a plausible order of magnitude rather than an estimate I can defend from the case facts.

The honest point is that this case has no evidence of a waste problem at all. The 38.1% blended inflation on a 42% base reproduces the observed 58% almost exactly, which means quantity per unit of revenue didn't change. If waste had gotten worse, I'd expect COGS above 58. So I'd test it, but I'd rank it well below pricing and procurement.

**Interviewer · 18:36** (turn 20)

Understood. Time is nearly up, so give me your final recommendation to the CEO. What would you do, and in what order?

**Candidate · 20:07** (turn 21)

My recommendation: raise menu prices. The entire decline is input inflation that was never passed through, and no amount of cost work closes an 18-point gap.

The case for it: beans up 40%, everything else up 37.5%, which at a 25/75 split blends to 38.1%. Applied to the old 42% COGS base, that gives 58.0% — exactly what we see. Labor is flat as a percent of revenue, overhead explains only 2 points. There is no operational failure. Prices simply haven't moved in two years.

Order of actions. First, price — a roughly 10% increase restores most of the margin, phased by market and tested first. Second, lock supply: forward contracts on beans, renegotiated dairy and packaging terms, since that's 75% of COGS. Third, steer mix toward high-margin items, since customers are already adding items per visit. Fourth, trim overhead.

The risk is volume. Transactions are up only about 4.5% — traffic is nearly flat, so demand may be soft. I'd want elasticity testing in a few markets before a national rollout, and I'd check what competitors have already done on price.

**Interviewer · 20:08** (turn 22)

We'll stop there. Thanks for working through the case — your written report will follow.
