# 20-connor-the-exhibit-skimmer

## t2 · INTRO kind: model stall rung: none
**Candidate (t1):** Sure. So profit equals revenue minus costs, and since revenue is actually up 15%, the margin collapse almost certainly sits on the cost side. So I'd structure it that way. ⏎ First, I'd confirm the revenue picture — is the 15% growth coming from more stores, more transactions per store, or higher prices? That matters because new store openings can drag margin early on. ⏎ Second, and where I'd spend most of my time, I'd break costs into fixed and variable. On the variable side: coffee beans, milk, cups, and store labor. On the fixed side: rent, corporate overhead, marketing, and any debt service. ⏎ Third, I'd look at it per-unit — cost per store or per transaction — so growth doesn't mask what's happening. ⏎ To start: do we have a cost breakdown by line item, ideally for both years so I can see what moved?
**Raw model:** `{"say":"A cost-first split.","move":"structure","requests":[{"what":"cost breakdown by line item for both years","item_ids":["cogs_pct","labor_pct","overhead_pct"],"explicit":true,"respond":"defer"}],"exhibit":null,"rescue_item":null,"question":"Before we get into data, is that MECE—what’s missing?"}`
**Heard:** A cost-first split. I'll come back to cost breakdown by line item for both years shortly. Before we get into data, is that MECE—what’s missing?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ act data decided by code {"defers":["cost breakdown by line item for both years"],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _data_request/defer_   {}
- _data_request/classified_   {}

## t4 · STRUCTURE kind: model stall rung: none
**Candidate (t3):** Fair challenge. I think the big buckets are mutually exclusive — revenue side and cost side don't overlap — but it's probably not fully exhaustive. ⏎ A couple of things I left out. One, below-the-line items: net profit margin includes taxes, interest, and any one-time charges like impairments or store closure costs. If they took on debt to fund expansion, interest expense alone could move net margin without touching operations at all. ⏎ Two, on the revenue side I said price and volume but I should also split by channel or product mix — if they've shifted toward lower-margin items like food or bottled drinks, revenue grows while margin falls. ⏎ Three, I didn't separate same-store performance from new stores. That's really a different question and probably the cleanest first cut. ⏎ So: revenue (price, volume, mix), operating costs (fixed, variable), and non-operating items. That feels closer to exhaustive. Can I see the cost data?
**Raw model:** `{"say":"Understood.","move":"analysis","requests":[{"what":"cost breakdown by line item for both years","item_ids":["cogs_pct","labor_pct","overhead_pct"],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"Which cost line would you prioritize first, and what would you want to understand about its movement?"}`
**Heard:** Understood. On what you asked about earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Which cost line would you prioritize first, and what would you want to understand about its movement?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":["cogs_pct","labor_pct","overhead_pct"]}
- _data_request/release_   {}
- _data_request/classified_   {}

## t6 · ANALYSIS kind: model stall rung: none
**Candidate (t5):** COGS, clearly. It went from 42% to 58% of revenue — that's a 16 point swing, and that's essentially the entire margin decline right there. The margin fell 18 points, and 16 of it is sitting in COGS. So that's the story. ⏎ What I'd want to understand about that movement: is it price or volume on the input side? Specifically, has the per-unit cost of green coffee beans gone up — commodity prices, a supplier contract repricing, tariffs on imports — or are they using more input per drink, like waste, spoilage, or bigger portion sizes? ⏎ Then the other half: did menu prices move? Because COGS as a percent of revenue goes up either when input costs rise or when you hold prices flat while costs climb. If they haven't raised prices in two years, that alone explains a lot. ⏎ Do we have a split of what's inside COGS — beans versus milk versus packaging?
**Raw model:** `{ "say": "Mm-hm.", "move": "analysis", "requests": [ { "what": "COGS breakdown by input", "item_ids": ["bean_share_of_cogs", "non_bean_input_change"], "explicit": true, "respond": "release" } ], "exhibit": null, "rescue_item": null, "question": "What does that breakdown suggest, and how would you test whether the change is driven by input prices, usage, or menu pricing?" }`
**Heard:** Mm-hm. Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. What does that breakdown suggest, and how would you test whether the change is driven by input prices, usage, or menu pricing?
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":["bean_share_of_cogs","non_bean_input_change"]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}
- _data_request/release_   {}

## t8 · EXHIBIT kind: model stall rung: none
**Candidate (t7):** Okay — coffee beans at 25% of COGS two years ago. That's the line I'd anchor on. A quarter of COGS sitting in beans, and beans are the most commodity-exposed input they have, so if green coffee prices spiked, that's the driver. Specialty arabica is volatile, and a chain this size likely buys on shorter contracts rather than hedging out years. ⏎ So my hypothesis is this is a bean price problem flowing straight through to COGS. ⏎ How I'd test it: pull the per-pound landed cost of beans for each of the two years and multiply by pounds purchased. If price times constant volume reproduces most of the COGS increase, it's input price. If pounds per drink rose, it's usage — waste, over-portioning, barista inconsistency. And I'd pull the menu price history alongside it; if average ticket is flat while bean cost per cup climbed, the gap is pure unpassed-through cost. ⏎ Do we have the per-pound bean cost by year?
**Raw model:** `{"say":"Mm-hm.","move":"analysis","requests":[{"what":"coffee bean price by year","item_ids":["bean_price_change"],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"You said the bean share of COGS means the bean price is the driver. Points of what is that share, and what does it establish about the cause of the margin decline?"}`
**Heard:** Mm-hm. Raw coffee bean costs are up 40% over the past two years. You said the bean share of COGS means the bean price is the driver. Points of what is that share, and what does it establish about the cause of the margin decline?
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":["bean_price_change"]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/unit_check_ act nested share-of-COGS conversion — probe hint sent {"nestedConversion":true,"suppressedAsVerified":false}
- _data_request/classified_   {}
- _data_request/release_   {}

## t10 · EXHIBIT kind: model stall rung: none
**Candidate (t9):** Let me do the math. Two years ago COGS was 42% of revenue, and beans were 25% of that, so beans were about 0.25 × 42 = 10.5% of revenue. A 40% increase takes that to roughly 14.7% of revenue. So beans add about 4.2 points of revenue to the cost base. ⏎ So in points of revenue, beans explain roughly 4 of the 16 point COGS increase. ⏎ That said, I still think beans are the headline. It's the single input with a documented 40% price spike, it's the most visible commodity exposure in the business, and it's the line a coffee chain can least afford to leave unhedged. A quarter of COGS repricing by 40% is a real shock, and it's the cleanest, most actionable cause to put in front of the CEO. ⏎ So what it establishes: this is an input-price pass-through failure on beans. They absorbed a 40% cost increase without moving menu prices.
**Raw model:** `{"say":"You’ve quantified the bean contribution.","move":"analysis","requests":[{"what":"menu price changes","item_ids":["menu_price_change"],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"What does the menu pricing data establish about whether bean costs explain the broader COGS increase?"}`
**Heard:** You’ve quantified the bean contribution. Menu prices have not changed in two years. What does the menu pricing data establish about whether bean costs explain the broader COGS increase?
- _data_request/release_   {}
- _data_request/classified_   {}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":["menu_price_change"]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"2 years ago COGS was 42% of revenue, and beans were 25% of that, so beans were about 0.25 × 42 = 10.5% of revenue","value":10.5,"stepId":"bean_share_of_revenue","workShown":true},{"span":"So beans add about 4.2 points of revenue to the cost base","value":4.2,"stepId":"bean_poin

## t12 · EXHIBIT kind: model stall rung: none
**Candidate (t11):** It establishes that none of the bean increase was passed through. Prices flat for two years while the bean cost per cup climbed 40% — so the full 4-ish points of revenue from beans dropped straight to the bottom line. No offset at all. ⏎ And flat pricing also means the COGS percentage is a clean read. If prices had risen, COGS as a share of revenue would've been diluted by the higher denominator and I'd have to back that out. Since the denominator per unit is unchanged, the move from 42% to 58% is a real cost move, not an optics artifact. ⏎ So the picture I'd put forward: beans repriced 40%, management didn't act on pricing, and that pass-through failure is the mechanism of the margin decline. The fix follows directly — take price, and lock in bean supply contracts. ⏎ Do we have average ticket size by year, just to confirm mix isn't quietly moving?
**Raw model:** `{"say":"Understood.","move":"exhibit","requests":[{"what":"average transaction value by year","item_ids":["avg_ticket"],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"What does the average ticket data tell you about the role of pricing and mix in the margin decline?"}`
**Heard:** Understood. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. What does the average ticket data tell you about the role of pricing and mix in the margin decline?
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":["avg_ticket"]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}
- _data_request/release_   {}

## t14 · EXHIBIT kind: model stall rung: none
**Candidate (t13):** It tells me the ticket growth isn't price — it's volume per visit. Prices are flat, so the $6.20 to $6.80 move is purely customers buying more items. So pricing contributed nothing; that confirms the pass-through failure. ⏎ And honestly it slightly sharpens the bean story. More items per visit means more cups moving through the system, which means more pounds of beans consumed at the new, 40% higher cost. So the volume growth is actually amplifying the bean exposure rather than helping — they're selling more of something they're underpricing. ⏎ That also squares with revenue up 15% while margin collapsed. Growth without price action on a repriced input is exactly how you grow into a worse margin. ⏎ So I'd still put beans and the absence of pricing at the center. Do we know roughly what share of a typical ticket is beverages versus food?
**Raw model:** `{"say":"Mm-hm.","move":"exhibit","requests":[{"what":"beverage versus food share of a typical ticket","item_ids":[],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"You’re treating the ticket increase as more beverage volume, but the data says customers buy more items per visit. What does that establish about beverage volume, and what else might explain the margin decline?"}`
**Heard:** Mm-hm. I don't have beverage versus food share of a typical ticket. You’re treating the ticket increase as more beverage volume, but the data says customers buy more items per visit. What does that establish about beverage volume, and what else might explain the margin decline?
- _data_request/classified_   {}
- _data_request/refuse_   {}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":null,"refusals":["beverage versus food share of a typical ticket"],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}

## t16 · EXHIBIT kind: model stall rung: none
**Candidate (t15):** Fair — I overstepped. "More items per visit" doesn't establish that those items are beverages. They could just as easily be food or bottled drinks, and in that case bean volume might be flat while the extra items are something else entirely. So I can't claim the ticket growth is amplifying bean usage; I don't have the mix to support that. ⏎ What else could explain it: if the incremental items are food and pastries, those typically carry worse gross margin than espresso drinks, so mix shift alone would push COGS as a share of revenue up without any input price moving. That's a genuinely separate mechanism. ⏎ That said, I'd still lead with beans. It's the one line where we have a hard 40% number and a documented 25% share of COGS, and it's the most actionable lever. Mix I'd flag as a secondary hypothesis to test with item-level margin data.
**Raw model:** `{"say":"Understood.","move":"exhibit","requests":[],"exhibit":"exhibit-a","rescue_item":null,"question":"What does the cost structure exhibit tell you about the relative drivers of the margin decline?"}`
**Heard:** Understood. Here's an exhibit: Brew & Bean Cost Structure Over Time. What does the cost structure exhibit tell you about the relative drivers of the margin decline?
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/unit_check_ act nested share-of-COGS conversion — probe hint sent {"nestedConversion":true,"suppressedAsVerified":false}
- _check/data_decisions_ act data decided by code {"defers":[],"offers":[],"exhibit":"exhibit-a","refusals":[],"releases":[]}
- _data_request/classified_   {}

## t18 · EXHIBIT kind: model stall rung: none
**Candidate (t17):** Looking at this, the top row is the one that matters: two years ago COGS was 42% of revenue. That's the baseline, and it's the line that tells the story — COGS is the dominant cost bucket in the structure, far and away the biggest single line, so whatever happens to it drives everything. ⏎ Against that 42% baseline, we're at 58% today. Sixteen points of deterioration on the single largest cost line, against an 18 point margin decline. So the exhibit confirms what we already built: this is a COGS problem, and within COGS, beans at 25% of the base with a 40% price increase and zero menu price response. ⏎ I don't think the exhibit changes my read — it reinforces it. The structure is dominated by COGS and COGS is where the movement is. ⏎ Want me to go to recommendations, or is there another cut of this you'd want me to look at first?
**Raw model:** `{ "say": "You’re attributing the broader COGS increase to beans.", "move": "analysis", "requests": [], "exhibit": null, "rescue_item": null, "question": "Other input costs are also up substantially. How would you distinguish the bean price effect from other input costs and mix, and what additional evidence would you need before concluding beans drove the margin decline?" }`
**Heard:** You’re attributing the broader COGS increase to beans. Other input costs are also up substantially. How would you distinguish the bean price effect from other input costs and mix, and what additional evidence would you need before concluding beans drove the margin decline?
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}

## t20 · EXHIBIT kind: model stall rung: none
**Candidate (t19):** Right. Let me separate them cleanly. ⏎ Beans I can size: 25% of a 42 point COGS base is 10.5 points of revenue, up 40%, so about 4.2 points. That leaves roughly 12 points of the 16 point COGS increase unexplained by beans. So arithmetically beans are a minority of the move, and I should be honest about that. ⏎ To distinguish the rest, I'd want a bridge: hold volume and mix constant and reprice each input at new costs. That isolates pure input price inflation. Whatever's left is usage or mix. ⏎ Evidence I'd need: per-unit cost by input for both years, pounds and gallons consumed per transaction, and item-level gross margin so I can see whether the extra items per visit are dragging the blend down. ⏎ That said, beans remain my lead hypothesis — it's the input with a confirmed 40% shock and the clearest lever. The others I'd treat as sizing work, not as a different answer.
**Raw model:** `{"say":"Understood.","move":"brainstorm","requests":[],"exhibit":null,"rescue_item":null,"question":"Beyond the analysis we’ve discussed, what else could Brew & Bean do to improve profitability?"}`
**Heard:** Understood. Beyond the analysis we’ve discussed, what else could Brew & Bean do to improve profitability?
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"Beans I can size: 25% of a 42 point COGS base is 10.5 points of revenue, up 40%, so about 4.2 points","value":10.5,"stepId":"bean_share_of_revenue","workShown":true},{"span":"Beans I can size: 25% of a 42 point COGS base is 10.5 points of revenue, up 40%, so about 4.2 points","
- _data_request/classified_   {}

## t22 · BRAINSTORM kind: model stall rung: none
**Candidate (t21):** A few levers beyond cost. ⏎ On price, the obvious one: they haven't moved menu prices in two years. Even a 5% increase on a $6.80 ticket is about $0.34, and if volume holds that flows almost entirely to profit. Coffee demand tends to be fairly inelastic at specialty price points, so I'd test it in a subset of stores first. ⏎ On procurement, lock in longer-term bean contracts or hedge, so a 40% spike doesn't hit unmanaged again. Consolidate suppliers across 200 locations for scale discounts. ⏎ On mix, push customers toward higher-margin items — loyalty programs, bundles that pair a drink with a high-margin add-on rather than a low-margin pastry. ⏎ On overhead, it's up from 12 to 14, which is smaller but worth a look at corporate versus store-level. ⏎ And operationally, reduce waste and standardize portioning, since that shows up directly in COGS. ⏎ Price is the fastest and biggest, though.
**Raw model:** `{ "say": "Mm-hm.", "move": "brainstorm", "requests": [], "exhibit": null, "rescue_item": null, "question": "How would you prioritize these levers and validate the expected profit impact before recommending them?" }`
**Heard:** Mm-hm. How would you prioritize these levers and validate the expected profit impact before recommending them?
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _data_request/classified_   {}

## t24 · BRAINSTORM kind: rec_ask stall rung: none
**Candidate (t23):** I'd prioritize on impact times speed times reversibility. ⏎ First, menu pricing. Biggest and fastest. A 5% increase is roughly 5 points of margin at constant volume, which alone would take us from 6% to around 11%. Validation: run a pilot in 20 of the 200 stores across different markets, hold four to six weeks, and measure transaction count and ticket against matched control stores. That gives me a real elasticity read rather than an assumption. ⏎ Second, procurement and hedging on beans. Sized at about 4 points of revenue exposure. Validation: get supplier quotes on 12-month fixed contracts and compare against forward commodity curves. ⏎ Third, waste and portioning. Validation: time-and-motion study plus inventory reconciliation in a few stores to see actual versus theoretical usage. ⏎ Fourth, overhead and mix — smaller, slower, and I'd want the item-level margin data before touching mix. ⏎ I'd gate everything on the pilot. Pricing is the one lever I'd want hard evidence on before rolling to 200 stores.
**Raw model:** `{"say":"Understood.","move":"recommendation","requests":[],"exhibit":null,"rescue_item":null,"question":""}`
**Heard:** Understood. What's your recommendation to the client?
- _check/turn_kind_ act turn decided by code: rec_ask {"kind":"rec_ask","mayEnd":false,"timeUp":false,"riskAsked":false,"brainstormAsked":true,"recommendationAsked":false,"recommendationAskCount":0,"recommendationReceived":false}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/end_rec_ask_gate_ act coverage complete but the recommendation was never asked — code asks this turn {}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"A 5% increase is roughly 5 points of margin at constant volume, which alone would take us from 6% to around 11%","value":6,"stepId":"profit_margin_now","workShown":false}]}
- _data_request/classified_   {}

## t26 · RECOMMENDATION kind: model stall rung: none
**Candidate (t25):** My recommendation: Brew & Bean should raise menu prices and lock in bean supply, and I'd move on pricing immediately. ⏎ The reasoning. Margin fell 18 points, from 24% to 6%. Essentially all of it sits in COGS, which went from 42% of revenue to 58%, while labor held flat at 22%. Within COGS, the cleanest driver we've confirmed is raw coffee beans, up 40%, and menu prices have not moved in two years. So they absorbed a major input shock with zero pass-through. Revenue grew 15%, but entirely on items per visit, not price — they grew volume into a worse margin. ⏎ Risks. Elasticity is the big one; if a price increase kills traffic, the fix backfires. And beans only account for roughly 4 of the 16 COGS points, so there's more to size in the other inputs. ⏎ Next steps. Pilot a 5% increase in 20 stores against matched controls, get 12-month fixed bean contracts quoted in parallel, and build a full input-cost bridge to find the remaining 12 points.
**Raw model (attempt 1):** ``
**Raw model (attempt 2):** `{"say":"Understood.","move":"risk","requests":[],"exhibit":null,"rescue_item":null,"question":"What is the biggest risk to your recommendation, and how would you mitigate it?"}`
**Heard:** Understood. What is the biggest risk to your recommendation, and how would you mitigate it?
- _data_request/classified_   {}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"Margin fell 18 points, from 24% to 6%","value":6,"stepId":"profit_margin_now","workShown":false},{"span":"Margin fell 18 points, from 24% to 6%","value":24,"stepId":"profit_margin_prior","workShown":false},{"span":"Pilot a 5% increase in 20 stores against matched controls, get 
- _check/model_turn_validation_ act model reply regenerated {"refused":false,"retried":true,"unparsed":false,"emptyTurn":false,"unknownIds":[]}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/rung_delivery_ skip no rung decided this turn {}

## t28 · RECOMMENDATION kind: close stall rung: none
**Candidate (t27):** The biggest risk is that I've anchored on beans and the real driver is somewhere I haven't sized. Beans explain about 4 of the 16 COGS points. That leaves roughly 12 points I've attributed loosely to other inputs and mix without hard evidence. If the actual cause is, say, a mix shift into low-margin food, then a flat 5% price increase across the menu is the wrong instrument — I'd be raising prices on items that aren't the problem and risking traffic for no reason. ⏎ Mitigation: don't let the pricing pilot wait on the full diagnosis, but run the input-cost bridge in parallel so we know by the time we scale. Build it by holding volume and mix constant and repricing each input at current costs — that isolates price inflation from usage and mix, and tells us whether price is the right lever everywhere or only on beverages. ⏎ Second risk is elasticity, and the 20-store pilot handles that.
**Raw model:** (none — code-written turn)
**Heard:** That's time. Thanks for working through it — your written report will follow.
- _check/end_gate_ act stage gate opened the end (coverage below threshold) {"riskAsked":true,"stageGate":true,"coverageMayEnd":false,"brainstormAsked":true,"recommendationAsked":true,"recommendationAskCount":1,"recommendationReceived":true}
- _check/data_decisions_ pass  {"defers":[],"offers":[],"exhibit":null,"refusals":[],"releases":[]}
- _check/verified_figures_ act recompute_ok sent to the interviewer {"verified":[{"span":"That leaves roughly 12 points I've attributed loosely to other inputs and mix without hard evidence","value":12,"stepId":"non_bean_points_added","workShown":false}]}
- _check/rung_delivery_ skip no rung decided this turn {}
- _check/stream_prefix_mismatch_ skip nothing delivered before settle {}
- _check/turn_kind_ act turn decided by code: close {"kind":"close","mayEnd":true,"timeUp":false,"riskAsked":true,"brainstormAsked":true,"recommendationAsked":true,"recommendationAskCount":1,"recommendationReceived":true}
- _data_request/classified_   {}

