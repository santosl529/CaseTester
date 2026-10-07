# Live run — Brew & Bean Profitability

- Session: `cefeaa4e-eaef-4263-8ec7-415e994ccef3` · case `prof-001` · status **completed** · 2026-10-07
- Overall: **not scored**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **15. Tyler — the Misquoter**
- Tests: Rule 14's routing boundary: misquotes of revealed data go to Rule 6-correct as a one-sentence flat reset, not a two-attempt Socratic probe. Tests whether the interviewer wastes clock treating a misquote as a derivation error.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_share_of_cogs`, `non_bean_input_change`, `bean_price_change`, `menu_price_change`
- Force-released before the recommendation ask: none
- Scoring QA: `{}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | defer | cogs_pct, labor_pct, overhead_pct | the cost breakdown as a percent of revenue for both years | no |
| 3 | release | overhead_pct | overhead and rent as a percent of revenue, both years | yes |
| 3 | release | labor_pct | labor as a percent of revenue, both years | yes |
| 3 | release | cogs_pct | COGS as a percent of revenue, both years | yes |
| 5 | release | bean_share_of_cogs, non_bean_input_change, bean_price_change | the COGS breakdown | yes |
| 5 | defer | menu_price_change | menu price changes over the past two years | no |
| 7 | release | menu_price_change | menu price changes over the past two years | yes |
| 13 | refuse | — | customer price elasticity and transaction volume data | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| conduct | 9 | 0 | 0 | — |
| conduct_model | 9 | 0 | 0 | — |
| data_decisions | 3 | 6 | 0 | 1, 3, 5, 7, 9, 13 |
| end_gate | 9 | 0 | 0 | — |
| end_rec_ask_gate | 9 | 0 | 0 | — |
| model_turn_validation | 8 | 0 | 0 | — |
| recompute | 9 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 9 | — |
| stall | 9 | 0 | 0 | — |
| stream_buffer_switch | 8 | 0 | 0 | — |
| stream_prefix_mismatch | 8 | 0 | 1 | — |
| style | 8 | 1 | 0 | 1 |
| timeframe | 9 | 0 | 0 | — |
| turn_kind | 8 | 1 | 0 | 17 |
| unit_check | 9 | 0 | 0 | — |
| verified_figures | 5 | 4 | 0 | 7, 9, 15, 17 |
| vetoes | 7 | 2 | 0 | 7, 9 |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 9 | 6309 | 242 | $0.008 |
| interviewer (claude-sonnet-5-5) | 8 | 22137 | 1219 | $0.056 |
| coverage (claude-haiku-4-5-20251001) | 8 | 14434 | 788 | $0.018 |
| data_request (claude-haiku-4-5) | 1 | 970 | 17 | $0.001 |
| candidate simulator (claude-opus-5, claude-opus-4-8) | 9 | 23220 | 3723 | $0.209 |

- App cost (interviewer + scoring): **$0.08** · with simulator: **$0.29** · list prices, uncached
- Wall time: 1:46

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

Take a minute if you need it, then tell me how you'd structure your approach.

**Candidate · 0:25** (turn 1)

Okay, so the puzzle is that revenue is up 15% but margin collapsed from 24% to 6% — that's an 18-point drop, which is huge. So this is almost certainly a cost problem, not a revenue problem, though I want to confirm revenue quality too.

I'd structure it in three buckets. First, revenue: is the 15% growth coming from more stores, more transactions per store, or higher prices? If it's all new store openings and same-store sales are flat or down, that changes things. Second, costs: split into COGS — coffee beans, milk, cups — and operating costs like labor, rent, utilities, and then corporate overhead. I'd want to see which line grew fastest as a percent of revenue. Third, external context: competitor pricing, commodity markets, wage inflation.

Can I start with the cost breakdown as a percent of revenue for both years?

**Interviewer · 0:28** (turn 2)

A revenue, cost, external split. I'll come back to the cost breakdown as a percent of revenue for both years shortly. Before we get into data, is that structure MECE? What's missing, or overlapping, in those three buckets?

**Candidate · 0:34** (turn 3)

Fair challenge. There's an overlap: my "external" bucket isn't really a separate driver — commodity prices and wage inflation show up inside COGS and labor, so I'd be double-counting. I'd rather fold external in as the "why" layer under each cost line rather than a parallel branch.

What's missing is a mix dimension. Revenue and cost both need to be split by store cohort — new stores versus mature stores — because if they've opened a lot of locations recently, new stores typically run at lower margin while they ramp, and that alone could drag the average down without anything being wrong operationally. Related, I'm missing product mix and channel: espresso drinks versus beans versus food, in-store versus delivery apps, since delivery carries commission fees that hit margin hard.

So revised: revenue drivers, cost drivers, each cut by store cohort and product mix.

**Interviewer · 0:36** (turn 4)

You've revised it, folding external factors under each cost line and adding cohort and mix cuts. On what you asked about earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. What do those numbers tell you, and where would you dig next?

**Candidate · 0:43** (turn 5)

That's pretty decisive. COGS jumped from 42% to 61% of revenue — call it a 19-point swing — while labor held flat at 22% and overhead only moved two points, 12% to 14%. So of the 18-point margin decline, COGS explains roughly 19 points and overhead another 2, which actually slightly overshoots the total decline, meaning something small must have moved the other way, maybe a bit of gross price leverage.

Either way, the story is overwhelmingly COGS. Labor isn't the issue at all.

So I'd dig into what's inside that 58-ish percent line. Three possibilities: input cost inflation, specifically green coffee and dairy, which have both run hot; waste and spoilage, if they're over-brewing or over-ordering; or mix shift toward lower-margin items like food and bottled drinks.

Do we have the COGS line broken into beans, dairy, packaging, and food? And separately — has the client raised menu prices at all in those two years?

**Interviewer · 0:46** (turn 6)

Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Raw coffee bean costs are up 40% over the past two years. I'll come back to menu price changes over the past two years shortly. Before we go further, check your COGS figure against the data I gave you. Then walk me through how COGS, labor and overhead add up to the margin decline.

**Candidate · 0:53** (turn 7)

You're right to make me check — I said 61% but you gave me 58% today, up from 42%. So the COGS swing is 16 points, not 19. Let me redo the bridge.

Two years ago: COGS 42, labor 22, overhead 12 — total cost 76%, leaving 24% margin. Checks out.

Today: COGS 58, labor 22, overhead 14 — total cost 94%, leaving 6% margin. Also checks out.

So the 18-point margin decline breaks down as: COGS +16 points, overhead +2 points, labor flat. COGS is ~89% of the problem, overhead the rest. Much cleaner than my earlier version — no phantom offset needed.

Now within COGS: beans were 25% of COGS and bean costs are up 40%, so that alone adds 25% × 40% = 10 points onto that slice of COGS. The other inputs are up 37.5%. Both are rising faster than revenue, which is why COGS is outrunning sales. So this really looks like input inflation that hasn't been passed through to menu prices — which is why I keep wanting the price history.

**Interviewer · 0:56** (turn 8)

The bridge is clear. Coming back to what you asked for earlier: Menu prices have not changed in two years. You said beans add 10 points on that slice of COGS. Walk me through that conversion, and tell me how much of the 16-point COGS increase you'd attribute to beans versus the other inputs.

**Candidate · 1:05** (turn 9)

Let me correct myself — my "10 points" was sloppy; that was a percentage increase on the bean slice, not points of revenue. Let me do it properly in revenue terms.

Beans were 25% of COGS, and COGS was 42% of revenue two years ago, so beans = 25% × 42% = 10.5% of revenue. Bean costs up 40%, and since prices are flat and we're holding volume roughly proportional, that slice goes to 10.5% × 1.4 = 14.7% of revenue — an increase of about 4.2 points.

The other inputs were 75% of COGS = 31.5% of revenue, up 37.5%, so 31.5% × 1.375 = 43.3% — an increase of about 11.8 points.

Adding those, 4.2 + 11.8 ≈ 16 points, which matches the total COGS increase nicely. So despite beans having the higher inflation rate, the other inputs — dairy, packaging, food — drive the larger share, about 12 of the 16 points, because they're a much bigger base.

So the fix has to hit both, but especially the non-bean inputs.

**Interviewer · 1:07** (turn 10)

Understood. Here's an exhibit: Brew & Bean Cost Structure Over Time. What does it tell you, and does it change or confirm your read of the problem?

**Candidate · 1:14** (turn 11)

This confirms the read and adds the trajectory. COGS climbed steadily — 42 to 50 to 58 — so +8 points last year and +8 points this year, a consistent march, not a one-time shock. Labor stayed flat at 22 the whole time, and overhead crept 12 to 13 to 14, a point a year. Profit fell 24 to 15 to 6, tracking almost entirely with COGS.

The steadiness is the key insight. If this were a single bad bean harvest you'd see one big jump; instead it's a sustained squeeze, consistent with ongoing input inflation combined with menu prices frozen for two full years. Every year costs rose and the client absorbed all of it.

So nothing changes my diagnosis — it sharpens it. The root cause is input-cost inflation, led in dollar terms by dairy, packaging, and food, with beans a secondary driver, and critically zero price pass-through.

That points straight at pricing as the main lever. Want me to move into recommendations, or size the price increase needed to restore margin first?

**Interviewer · 1:16** (turn 12)

Got it, a steady squeeze rather than a one-time shock. You've named pricing as the main lever. Beyond that, what else could Brew & Bean do to rebuild its margin? Take me through as many ideas as you can.

**Candidate · 1:25** (turn 13)

Sure, let me go broad across both sides of the P&L.

On COGS — the biggest lever:
- Procurement: renegotiate supplier contracts, consolidate vendors for volume discounts, lock in forward contracts or hedge on coffee and dairy to smooth that 40% volatility.
- Input substitution: cheaper-but-comparable bean blends, alternative milk suppliers, right-sizing packaging, reducing SKU complexity.
- Waste reduction: tighten brewing and ordering to cut spoilage, better demand forecasting.
- Product mix: push customers toward higher-margin drinks and away from low-margin food, if food is dragging.

On pricing, beyond a blanket increase:
- Selective increases on low-elasticity items, premium/seasonal drinks, and loyalty bundling to protect volume.

On overhead — smaller but creeping:
- Review corporate G&A, renegotiate rent, improve store-level utilities and scheduling efficiency.

On revenue growth to dilute fixed costs:
- Loyalty program, upselling, higher-margin retail beans and merchandise, and reviewing delivery-app commissions if they're eating margin.

Pricing and procurement are where the real points are. Before I'd commit to a price rise, though, I'd want transaction volume and price elasticity — do we have any data on how sensitive their customers are?

**Interviewer · 1:27** (turn 14)

A broad set of levers across both sides of the P&L. I don't have customer price elasticity and transaction volume data. Pulling it together: what is your overall recommendation to the CEO, which levers would you prioritize, and why?

**Candidate · 1:34** (turn 15)

Here's my recommendation. Brew & Bean's margin fell from 24% to 6% almost entirely because COGS rose 16 points, from 42% to 58% of revenue, while menu prices stayed flat for two years. The root cause is input inflation with zero pass-through, so the primary fix is pricing, supported by procurement.

Priority one: raise menu prices. Costs rose ~16 points and prices moved zero, so even a modest increase recaptures a lot. Roughly, since we're 6% margin today, a price increase passes almost straight to the bottom line — a 5% price rise at stable volume adds about 5 points of margin. I'd phase it in and target low-elasticity premium drinks first.

Priority two: procurement — forward contracts and renegotiated dairy and packaging deals, since those inputs drive 12 of the 16 points.

Third: waste reduction and mix shift as ongoing margin support.

Risks: price increases could hurt volume — that's why I want elasticity data before finalizing magnitude. Next steps: pull elasticity and volume, run a pricing pilot in a few markets, and get supplier contract terms up for renegotiation.

**Interviewer · 1:37** (turn 16)

Understood. You named volume loss from price increases as a risk. If the price increase triggers more volume loss than you expected, and procurement savings also come in slower than planned, how does your recommendation hold up, and what would you do?

**Candidate · 1:45** (turn 17)

Good stress test. If both levers underdeliver, my recommendation is still directionally right but I can't rely on price alone — that's exactly the fragility of a single big lever.

First, I'd lean on the structure of the problem: at 6% margin, volume loss hurts, but I'd check contribution margin. Even post-inflation, a coffee is still sold well above its variable input cost, so losing marginal transactions costs us less than it looks — the danger is losing enough volume that we can't cover fixed labor and rent. So I'd watch same-store transaction counts closely in the pilot and set a stop-loss threshold before rolling out chain-wide.

Operationally, I'd shift weight toward the levers that don't depend on customer behavior or supplier goodwill: waste and spoilage reduction, SKU rationalization, scheduling efficiency, and overhead cuts — the 2 points there are controllable internally.

And I'd stage it: pilot pricing in a few markets, measure actual elasticity, and calibrate the national increase to what volume tolerates rather than committing blind. If price can only do half the job, procurement plus internal efficiency has to close the rest — which is why I wouldn't bet everything on one lever.

**Interviewer · 1:46** (turn 18)

That's time. Thanks for working through it — your written report will follow.
