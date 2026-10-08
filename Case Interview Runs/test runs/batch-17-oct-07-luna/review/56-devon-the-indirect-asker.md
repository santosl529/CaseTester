# 56-devon-the-indirect-asker

## t2 · INTRO kind: model stall rung: none
**Candidate (t1):** Okay. So revenue is up 15% but margin collapsed from 24% to 6% — that's a huge drop, so the story is almost certainly on the cost side, not the top line. Let me structure it. ⏎ First I'd decompose profit: revenue minus costs. On revenue I'd want to know whether that 15% came from more stores, more transactions per store, or higher prices — because growth driven by opening new locations behaves very differently from same-store growth. ⏎ On costs I'd split fixed versus variable: COGS, so coffee beans, milk, cups; labor; rent and occupancy; then corporate overhead and marketing. ⏎ The useful thing to start with would be a cost breakdown as a percent of revenue, two years ago versus today, so I can see which line moved. I'll assume the 200 stores include recent openings unless told otherwise. ⏎ Where would you like me to dig in first?
**Raw model:** `{"say":"Understood.","move":"structure","requests":[{"what":"cost breakdown as a percentage of revenue","item_ids":["cogs_pct","labor_pct","overhead_pct"],"explicit":true,"respond":"defer"}],"exhibit":null,"rescue_item":null,"question":"Before we look at the numbers, is that MECE—what’s missing?"}`
**Heard:** Understood. I'll come back to cost breakdown as a percentage of revenue shortly. Before we look at the numbers, is that MECE—what’s missing?
- _check/data_decisions_ act data decided by code {"defers":["cost breakdown as a percentage of revenue"],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}
- _data_request/defer_   {}

## t4 · STRUCTURE kind: model stall rung: none
**Candidate (t3):** Fair push. A couple of gaps. ⏎ One, I jumped straight to operating costs and skipped everything below that line — interest expense if they took on debt to fund expansion, depreciation on new store buildouts, taxes, and any one-time charges like impairments or lease write-offs. Net margin is the metric here, not operating margin, so those all live inside the problem. ⏎ Two, my revenue side is thin. I said price, volume, stores — but I should also have mix: drinks versus food versus retail bags, and channel, so in-store versus delivery apps, since delivery carries commission that eats margin. ⏎ Three, I didn't separate same-store performance from new-store performance. New locations typically lose money while ramping, and if they've been opening aggressively that alone could explain a lot. ⏎ So: revenue by price, volume, mix, channel; costs by variable and fixed; then below-the-line items. I'd also want it split old stores versus new ones.
**Raw model:** `{"say":"Mm-hm.","move":"pressure_test","requests":[],"exhibit":null,"rescue_item":null,"question":"Which branch would you prioritize first, and why?"}`
**Heard:** Mm-hm. Which branch would you prioritize first, and why?
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}

## t6 · STRUCTURE kind: model stall rung: none
**Candidate (t5):** I'd start on the cost side, and specifically the split between existing stores and new ones. ⏎ Reason: revenue grew 15%, so demand isn't the issue. For margin to fall from 24% to 6% while revenue rises, costs have to be growing much faster than revenue — roughly, if margin dropped 18 points, costs went from 76% of revenue to 94%. On a revenue base that itself grew, that's a big absolute increase. So the cost side is where the answer is. ⏎ Within that, old-versus-new stores is the highest-leverage cut, because it separates two very different diagnoses. If mature stores are still healthy and the drag is all from a wave of new openings, that's a growth-pacing problem and arguably temporary. If same-store margins are eroding, it's structural — input costs, wages, or pricing — and much more urgent. ⏎ So first I'd want the margin on stores open more than two years versus those opened recently. Do we have that by location vintage?
**Raw model:** `{"say":"Understood.","move":"pressure_test","requests":[{"what":"store margins by location vintage","item_ids":[],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"Why prioritize store vintage over the cost breakdown you requested, and how would that distinguish the main causes of the decline?"}`
**Heard:** Understood. I don't have store margins by location vintage. Why prioritize store vintage over the cost breakdown you requested, and how would that distinguish the main causes of the decline?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":["store margins by location vintage"],"releases":[]}
- _data_request/refuse_   {}
- _data_request/classified_   {}

## t8 · STRUCTURE kind: model stall rung: none
**Candidate (t7):** Honest answer — I probably shouldn't. The cost breakdown is the more fundamental cut, and vintage is a slice I'd layer on top of it. Without knowing which line moved, splitting by vintage just tells me where the pain is, not what it is. ⏎ The logic for vintage was that it's diagnostic in a different way: new stores have a predictable signature. High rent and depreciation relative to a revenue base that hasn't ramped, overstaffed labor, low throughput. Mature stores eroding looks completely different — COGS percentage climbing from bean prices, or wage inflation, or discounting that quietly cut realized price. Same symptom, opposite remedies. ⏎ But since that cut isn't available, let's just take the cost breakdown as a percent of revenue, both years. I'll work from whichever line moved most. And I'll assume for now the store count hasn't changed dramatically unless you tell me otherwise.
**Raw model:** `{"say":"Understood.","move":"analysis","requests":[{"what":"cost breakdown as a percentage of revenue","item_ids":["cogs_pct","labor_pct","overhead_pct"],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"How do these cost lines compare across the two periods, and which change appears to explain the margin decline?"}`
**Heard:** Understood. On what you asked about earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. How do these cost lines compare across the two periods, and which change appears to explain the margin decline?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":["cogs_pct","labor_pct","overhead_pct"]}
- _data_request/classified_   {}
- _data_request/release_   {}

## t10 · ANALYSIS kind: model stall rung: none
**Candidate (t9):** Let me add them up. Two years ago: 42 plus 22 plus 12 is 76% of revenue in costs, which leaves 24% margin — that matches exactly. Today: 58 plus 22 plus 14 is 94%, leaving 6%. Also matches. So these three lines fully account for the decline, no hidden below-the-line item. ⏎ Of the 18-point drop, COGS is 16 points and overhead is 2. Labor is flat at 22%, which is actually notable — if wages were inflating you'd expect it to rise, so they've either held headcount tight or passed volume through efficiently. ⏎ So COGS is the whole story. Sixteen points on revenue is enormous. That's either input cost inflation, waste or spoilage, a mix shift toward lower-margin items, or — and this is the one I keep coming back to — flat menu prices against rising input costs, which would show up exactly like this. ⏎ The thing I'd want next is what sits inside that COGS line and how each piece moved. And separately, whether prices have been touched at all in two years.
**Raw model:** `{"say":"Understood.","move":"analysis","requests":[{"what":"COGS breakdown by component","item_ids":["bean_share_of_cogs","non_bean_input_change"],"explicit":true,"respond":"release"},{"what":"menu price changes","item_ids":["menu_price_change"],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"How would you quantify the contribution of those changes to the COGS increase, and what would you investigate next?"}`
**Heard:** Understood. Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Menu prices have not changed in two years. How would you quantify the contribution of those changes to the COGS increase, and what would you investigate next?
- _data_request/release_   {}
- _data_request/classified_   {}
- _data_request/release_   {}
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":["bean_share_of_cogs","non_bean_input_change","menu_price_change"]}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"2 years ago: 42 plus 22 plus 12 is 76% of revenue in costs, which leaves 24% margin — that matches exactly","value":24,"stepId":"profit_margin_prior","workShown":false}]}

## t12 · EXHIBIT kind: model stall rung: none
**Candidate (t11):** Let me work it in points of revenue. COGS was 42% of revenue. Beans were 25% of that, so 10.5 points. Everything else — dairy, packaging, food — is the other 75%, so 31.5 points. ⏎ Those other inputs up 37.5%: 31.5 times 1.375 is 43.3 points. So that's an increase of 11.8 points. ⏎ Total COGS today is 58 points. Subtract the 43.3 for other inputs and beans must be 14.7 points, up from 10.5. That's a 4.2-point increase, roughly 40% inflation on beans. ⏎ So of the 16-point COGS rise, about 11.8 is non-bean inputs and 4.2 is beans. Dairy and packaging are the bigger driver, though beans inflated at a similar rate — they just started from a smaller base. ⏎ And the kicker is prices haven't moved in two years. They've absorbed every point of that inflation. Since revenue grew 15% on flat pricing, that growth is all volume — they're selling more at steadily worse unit economics. ⏎ Next I'd test pricing power: what competitors have done on price, and elasticity.
**Raw model:** `{"say":"Understood.","move":"analysis","requests":[{"what":"competitor pricing","item_ids":[],"explicit":true,"respond":"release"},{"what":"price elasticity","item_ids":[],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"What would you want to learn about competitor pricing and customer sensitivity before recommending a price change?"}`
**Heard:** Understood. I don't have competitor pricing or price elasticity. What would you want to learn about competitor pricing and customer sensitivity before recommending a price change?
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"Beans were 25% of that, so 10.5 points","value":10.5,"stepId":"bean_share_of_revenue","workShown":true},{"span":"Those other inputs up 37.5%: 31.5 times 1.375 is 43.3 points","value":43.3,"stepId":"non_bean_points_now","workShown":true}]}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":["competitor pricing","price elasticity"],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}
- _data_request/refuse_   {}
- _data_request/refuse_   {}

## t14 · EXHIBIT kind: model stall rung: none
**Candidate (t13):** Three things, in order of how much they'd change my recommendation. ⏎ First, whether competitors have already raised. If Starbucks and the local independents have all moved up 10–15% over two years, Brew & Bean is now the cheap option in a specialty segment, and raising is low-risk — they're closing a gap, not opening one. If everyone held flat, that's a different conversation. ⏎ Second, elasticity by item, not in aggregate. A latte buyer on a daily habit behaves very differently from someone buying a bag of beans. And loyalty members versus walk-ins — I'd expect repeat customers to be far less sensitive. ⏎ Third, I'd want to know whether any price testing has happened. Even a handful of stores that moved prices would give real data rather than survey intent, which overstates sensitivity. ⏎ Practically, I'd pilot it: raise in a subset of markets, hold a control group, watch transaction counts for a quarter. Did anything like that happen last year?
**Raw model:** `{"say":"Understood.","move":"exhibit","requests":[{"what":"prior-year price test results","item_ids":[],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"What does the cost structure exhibit tell you about the drivers of the margin decline?"}`
**Heard:** Understood. I don't have prior-year price test results. What does the cost structure exhibit tell you about the drivers of the margin decline?
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":["prior-year price test results"],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/refuse_   {}
- _data_request/classified_   {}

## t16 · EXHIBIT kind: model stall rung: none
**Candidate (t15):** Reading it straight: this is an input-cost shock that was never passed through. ⏎ Labor flat at 22% says operations aren't broken — they haven't overstaffed or lost productivity. Overhead up 2 points is real but minor, and some of that is probably just the scale of a growing chain. Those aren't the story. ⏎ COGS moving 42 to 58 is the story, and it's broad-based — beans up roughly 40%, everything else up 37.5%. The fact that both moved together tells me this is market-wide commodity inflation, not a sourcing mistake or a bad contract on one item. Which also means competitors are facing the same pressure. ⏎ And the response was no response. Prices frozen for two years while every input rose. So the 15% revenue growth is actually a bit misleading — it's volume growth on deteriorating unit economics. They sold more of something that got progressively less profitable. ⏎ Structural, not cyclical, and entirely fixable through pricing and procurement. The urgency is that at 6% margin, one more bad quarter of dairy prices puts them near breakeven.
**Raw model:** `{"say":"Mm-hm.","move":"brainstorm","requests":[],"exhibit":null,"rescue_item":null,"question":"Beyond pricing and procurement, what else could Brew & Bean do to restore profitability?"}`
**Heard:** Mm-hm. Beyond pricing and procurement, what else could Brew & Bean do to restore profitability?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"The urgency is that at 6% margin, one more bad quarter of dairy prices puts them near breakeven","value":6,"stepId":"profit_margin_now","workShown":false}]}
- _data_request/classified_   {}

## t18 · BRAINSTORM kind: model stall rung: none
**Candidate (t17):** A few levers. ⏎ Menu mix and engineering. Dairy is the big inflated input, so push items that use less of it — brewed coffee, cold brew, espresso-based drinks in smaller formats. Price plant milks to cover their cost rather than absorbing them. And reposition high-margin items on the menu board. Food and retail bags may carry different margins entirely, which I'd want to see. ⏎ Waste and portion control. Sixteen points of COGS inflation makes every gram of spilled milk and every unsold pastry more expensive than it was. Standardizing pours and tightening end-of-day production could recover one to two points without touching the customer. ⏎ Reformulation and sizing. Slightly smaller default sizes, or cheaper packaging — cups and lids sit in that inflated bucket and customers don't choose a shop based on lid quality. ⏎ Overhead, the 2-point creep. Worth a look, though it's small relative to COGS. ⏎ Volume leverage on procurement — 200 locations should command better contracts than they're apparently getting.
**Raw model:** `{"say":"Understood.","move":"analysis","requests":[],"exhibit":null,"rescue_item":null,"question":"Points of what?"}`
**Heard:** Understood. Points of what?
- _check/unit_check_ act nested share-of-COGS conversion — probe hint sent {"nestedConversion":true,"suppressedAsVerified":false}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}

## t20 · BRAINSTORM kind: rec_ask stall rung: none
**Candidate (t19):** Points of revenue — percentage points of margin, same units I've been using throughout. ⏎ So when I say waste control could recover one to two points, I mean COGS falls from 58% of revenue to roughly 56–57%, which drops straight to net margin and takes them from 6% to 7–8%. Same unit as the 16-point COGS increase and the 18-point margin decline. ⏎ I should be careful there, though. That one-to-two-point figure is my estimate, not something you've given me. I'd want actual waste and spoilage data per store to size it properly — I'm reasoning from the fact that a typical food-service operation runs meaningful shrink, and that shrink got 37.5% more expensive. Could be smaller. ⏎ The pricing lever is the one that's actually sized by the data. Everything else I've listed is directionally right but unquantified until we see store-level operating detail.
**Raw model:** `{"say":"Understood.","move":"recommendation","requests":[],"exhibit":null,"rescue_item":null,"question":""}`
**Heard:** Understood. Pull it together — what's your recommendation to the CEO?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"So when I say waste control could recover one to 2 points, I mean COGS falls from 58% of revenue to roughly 56–57%, which drops straight to net margin and takes them from 6% to 7–8%","value":6,"stepId":"profit_margin_now","workShown":false}]}
- _check/end_rec_ask_gate_ act coverage complete but the recommendation was never asked — code asks this turn {}
- _check/turn_kind_ act turn decided by code: rec_ask {"kind":"rec_ask","mayEnd":false,"timeUp":false,"riskAsked":false,"brainstormAsked":true,"recommendationAsked":false,"recommendationAskCount":0,"recommendationReceived":false}
- _data_request/classified_   {}

## t22 · RECOMMENDATION kind: model stall rung: none
**Candidate (t21):** My recommendation: raise menu prices, phased, and do it now — that's the only lever sized to the problem. ⏎ The math. Margin fell 18 points, and 16 of those are COGS. Costs are 94% of revenue. If they pass through even half the input inflation, call it an 8% price increase with volume held flat, revenue rises 8% while costs stay roughly constant in dollars — that alone restores most of the gap. Nothing else on the list is that big. ⏎ Supporting moves: renegotiate dairy and packaging contracts using 200-store scale, shift the menu toward lower-dairy drinks, and tighten waste. Together maybe two to three points. ⏎ Risks. Volume is the one that worries me. Fifteen percent growth on frozen prices may mean they've been buying share, and some of that walks when prices move. Mitigate by piloting across a subset of markets with a control group before chain-wide rollout. ⏎ Next steps: competitor price benchmarking, a four-to-six week price test, and item-level margin data to guide the mix shift.
**Raw model:** `{"say":"Mm-hm.","move":"risk","requests":[],"exhibit":null,"rescue_item":null,"question":"You identified volume loss as the main risk. What evidence would you monitor in the pilot to determine whether the price increase is improving profit without damaging demand?"}`
**Heard:** Mm-hm. You identified volume loss as the main risk. What evidence would you monitor in the pilot to determine whether the price increase is improving profit without damaging demand?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _data_request/classified_   {}

## t24 · RECOMMENDATION kind: close stall rung: none
**Candidate (t23):** Primary metric is profit per store per week, pilot versus control — not revenue, because revenue can rise on price while profit falls if transactions collapse. That's the single number that decides it. ⏎ Underneath that, transaction counts. That's the cleanest read on demand, because it's unaffected by the price change itself. If tickets per day hold within a couple percent of control, elasticity is low and I'd roll out. A sharp drop means I've misjudged it. ⏎ Then average ticket, to confirm the increase actually stuck and wasn't eaten by discounting or by customers trading down to cheaper items. Related: mix shift — if everyone moves from lattes to drip coffee, realized margin may not improve as modeled. ⏎ Repeat visit frequency among loyalty members, which is the early warning on churn. Aggregate transactions can look fine for weeks while the daily regulars quietly thin out. ⏎ And I'd run it at least a full quarter. Coffee is habitual, so attrition shows up slowly.
**Raw model:** (none — code-written turn)
**Heard:** We'll stop there. Thanks for working through the case — your written report will follow.
- _check/stream_prefix_mismatch_ skip nothing delivered before settle {}
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/turn_kind_ act turn decided by code: close {"kind":"close","mayEnd":true,"timeUp":false,"riskAsked":true,"brainstormAsked":true,"recommendationAsked":true,"recommendationAskCount":1,"recommendationReceived":true}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _data_request/classified_   {}

