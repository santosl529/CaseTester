## 01-maya-the-fr#3 · INTRO
**Candidate:** Okay, so... I'd want to look at a few things. First, revenue — like what's happening with sales. Second, costs, so what they're spending money on. And third, maybe external stuff, like competitors or the market overall. Does that seem okay as a starting point?

**Logged Sonnet reply (historical):** I won't say whether it's okay, so let's get more specific. Within revenue and costs, what exactly would you break down, and which branch would you look at first?

**sonnet (fresh)**
say: A three-part split.
requests: ["revenue_total:defer:false"]
question: Is that structure MECE — what's missing, and which branch would you prioritize first, and why?
flags: - · useful 3991ms

**luna-low run 1**
say: Mm-hm.
requests: []
question: Is that MECE — what's missing?
flags: - · useful 2431ms

**luna-low run 2**
say: You’ve split it across revenue, costs, and the market.
requests: []
question: Is that MECE — what might be missing?
flags: - · useful 2421ms

## 01-maya-the-fr#5 · CLARIFY
**Candidate:** Can I ask — is the 15% revenue growth from more stores, or more sales per store?

**Logged Sonnet reply (historical):** 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. Average revenue per store is $2.4M a year.

**sonnet (fresh)**
say: 
requests: ["revenue_per_store+stores_count:release:true"]
question: Before you go further, which branch would you prioritize, and why?
flags: - · useful 1492ms

**luna-low run 1**
say: Understood.
requests: ["revenue_per_store+stores_count:defer:true"]
question: Within revenue and costs, what specifically would you break down, and which branch would you prioritize first?
flags: - · useful 3591ms

**luna-low run 2**
say: Understood.
requests: ["revenue_per_store+stores_count:defer:true"]
question: Before we get into the data, how would you break down revenue and costs, and which area would you prioritize first?
flags: - · useful 4228ms

## 56-devon-the-i#4 · CLARIFY
**Candidate:** Fair challenge. A couple of gaps.

First, my split blurs COGS and operating expenses. Cleaner would be: COGS — beans, dairy, cups, food items; then store-level operating costs — labor, rent, utilities, maintenance; then corporate SG&A — marketing, HQ salaries, IT; then below-the-line items.

That last bucket is the real omission. We're looking at net margin, not operating margin, so interest expense, taxes, depreciation and any one-time charges all sit in there. If they took on debt or had a writedown, that shows up in net and nowhere else.

On revenue I was also thin. With the footprint flat at 200, that 15% is entirely same-store, which means it's price, traffic, ticket size, or mix — say more food and cold drinks versus drip coffee. Mix matters because those carry different margins.

I'll start by assuming the damage is operating-level rather than financing, but I'd want the P&L lines for both years to confirm.

**Logged Sonnet reply (historical):** Understood. The cost breakdown you asked for is below. What stands out to you? COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. To your question on the data: Total revenue is $480M a year. I'll come to that data shortly.

**sonnet (fresh)**
say: Understood.
requests: ["cogs_pct:release:true","labor_pct:release:true","overhead_pct:release:true"]
question: Which of these lines moved most, and what does that tell you about where you'd dig next?
flags: - · useful 2279ms

**luna-low run 1**
say: Understood.
requests: [":release:true","cogs_pct:release:true","labor_pct:release:true","overhead_pct:release:true"]
question: Given the cost figures, where would you focus next to identify the driver of the margin decline?
flags: - · useful 3045ms

**luna-low run 2**
say: Understood.
requests: [":release:true","cogs_pct:release:true","labor_pct:release:true","overhead_pct:release:true"]
question: What do these cost figures suggest about the source of the margin decline?
flags: - · useful 3324ms

## 06-destiny-the#14 · STRUCTURE
**Candidate:** maybe ingredients, people, and the store stuff like rent? I'd look at people first, I think baristas probably cost the most.

**Logged Sonnet reply (historical):** That's a structure: ingredients, people, and store costs. You've said baristas probably cost the most, but nothing so far supports that. What would you want to see to decide which bucket to prioritize?

**sonnet (fresh)**
say: Three cost buckets.
requests: []
question: Is that grouping complete, with nothing missing? And you said baristas probably cost the most, so how would you check that before deciding where to dig?
flags: - · useful 2122ms

**luna-low run 1**
say: Mm-hm.
requests: []
question: Is that MECE—what might be missing from your breakdown?
flags: - · useful 1711ms

**luna-low run 2**
say: You’ve grouped costs and prioritized labor.
requests: []
question: Is that MECE—what’s missing?
flags: - · useful 2194ms

## 58-hugo-the-hi#6 · STRUCTURE
**Candidate:** I'd go to the cost breakdown first, because it's the fastest way to narrow eighteen points of margin. Revenue is up, so the loss is almost certainly sitting in one or two lines, and I'd rather find the line than guess at the mechanism.

Let me reason toward it while I wait. If revenue grew 15% and we hold the dollar profit implied by 24%, then at 6% net margin on the larger base, profit dollars are roughly a quarter of what they were — 0.06 × 1.15 = 6.9 versus 24, so about 71% of absolute profit gone. That's too large for overhead creep alone.

Given a specialty chain, COGS is typically around 30% of revenue and labor around 30%. If COGS held flat and labor absorbed the whole swing, labor would have to be running near 48% of revenue — which feels implausibly high for this format. Is that roughly where it landed, or is it split across lines?

**Logged Sonnet reply (historical):** Your profit math is coherent, and the cost breakdown is earned now. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%.

**sonnet (fresh)**
say: Understood.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true"]
question: With those numbers in front of you, which line is driving the decline, and what would you want to understand next about it?
flags: - · useful 1656ms

**luna-low run 1**
say: Understood.
requests: ["cogs_pct:release:true","labor_pct:release:true","overhead_pct:release:true"]
question: What do these cost changes tell you about the margin decline, and how would you quantify each line’s contribution?
flags: - · useful 3498ms

**luna-low run 2**
say: Understood.
requests: ["cogs_pct:release:true","labor_pct:release:true","overhead_pct:release:true"]
question: What do these cost figures tell you about the source of the margin decline?
flags: - · useful 3495ms

## 01-maya-the-fr#7 · ANALYSIS
**Candidate:** Got it, thanks. Is that growth coming from price increases or more customers?

**Logged Sonnet reply (historical):** Menu prices have not changed in two years. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit.

**sonnet (fresh)**
say: 
requests: ["avg_ticket+menu_price_change:defer:true"]
question: Before I get into that, I'd like to hear your full structure. Within revenue and costs, what would you break down, and which branch would you prioritize first and why?
flags: - · useful 1739ms

**luna-low run 1**
say: Understood.
requests: [":release:true","avg_ticket:release:true","menu_price_change:release:true"]
question: Given those figures, what can you infer about the source of revenue growth?
flags: - · useful 1769ms

**luna-low run 2**
say: Understood.
requests: ["avg_ticket:release:true","menu_price_change:release:true"]
question: Based on those figures, what can you infer about whether revenue growth came from price or customer volume?
flags: - · useful 1713ms

## 06-destiny-the#20 · ANALYSIS
**Candidate:** I think the percentages already handle that. If COGS stayed at 42%, it would have grown with revenue but the margin would be the same. So the 16 points is the part that isn't just scaling. 16% of $480M is $76.8M of extra cost. And margin fell 18 points total, so COGS explains most of it, overhead the other 2.

**Logged Sonnet reply (historical):** Okay. The point change is the margin impact, and the arithmetic holds against what we have. Now that COGS is the area, what would you want to dig into next to understand why it rose?

**sonnet (fresh)**
say: Understood.
requests: []
question: COGS is the lead suspect. What could be pushing it up from 42% to 58% of revenue, and what would you want to look at to find out which it is?
flags: - · useful 2043ms

**luna-low run 1**
say: Understood.
requests: []
question: What would you investigate next to understand why COGS rose as a share of revenue?
flags: - · useful 3652ms

**luna-low run 2**
say: Understood.
requests: []
question: What would you investigate next to explain why COGS rose, and what data would you request?
flags: - · useful 3492ms

## 09-derek-the-b#10 · ANALYSIS
**Candidate:** I hear the challenge, and let me defend the number rather than just move off it. Mechanically, yes, 25% of 58 is 14.5, so one reading gives you 14.5% of revenue. But I don't think that's the right framing for a margin bridge. Margin points aren't measured against the revenue line in isolation — they're measured against the cost structure that's actually moving, and the line that moved is COGS. When I say beans carry 25 points, I'm indexing to the COGS base, which is the base where the deterioration happened. Converting back to revenue flattens the signal and understates how concentrated the problem is.

And the flat menu price you just gave me reinforces it. Prices haven't moved in two years while input costs ran hard, so every dollar of input inflation dropped straight through to the bottom line with zero pass-through. That's the mechanism, and it's consistent with my 25-point read on beans — if the exposure were really only 14 and change, you wouldn't get the full 18-point collapse out of a cost base this size once you net off packaging and food, which barely moved.

So I'd keep 25 as my working figure and flag the 14.5 as a conservative floor. Either way beans rank first, dairy second. Can I get the actual COGS split now so I can size the pass-through gap?

**Logged Sonnet reply (historical):** Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Margin points are measured against revenue, since margin is profit over revenue. Using the share you have, which period's COGS does it pair with, and what does it come to in points of revenue?

**sonnet (fresh)**
say: Understood.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: Using those, what share of the margin decline do beans actually explain, expressed in points of revenue? Walk me through the conversion.
flags: - · useful 2269ms

**luna-low run 1**
say: Understood.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: Using those figures, how would you quantify the contribution of bean costs and other inputs to the margin decline?
flags: - · useful 3035ms

**luna-low run 2**
say: You’re keeping the 25-point figure as your working estimate.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: Using these figures, how would you quantify the margin impact of beans and other inputs, and what can you conclude about the main driver?
flags: - · useful 2782ms

## 40-jasmine-the#8 · ANALYSIS
**Candidate:** $480M revenue, 10% price increase on the same volume is $48M of incremental revenue, and since price carries no added cost, it drops to profit. I haircut for some volume loss to get $40–45M. Current profit is 6% of $480M, about $29M, so that roughly triples it.

**Logged Sonnet reply (historical):** Okay. You haven't yet confirmed the COGS driver, which is what you said the next step was. Which specific data would you want to confirm what is driving the COGS increase, and why?

**sonnet (fresh)**
say: Understood.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: Setting pricing aside, what else could Brew & Bean do to recover its margin?
flags: - · useful 2030ms

**luna-low run 1**
say: Understood.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true","exhibit:exhibit-a"]
question: What does the exhibit tell you about the drivers of the margin decline?
flags: - · useful 3753ms

**luna-low run 2**
say: Understood.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: How would you test and manage the risk that a price increase reduces transaction volume more than you assumed?
flags: - · useful 3804ms

## 58-hugo-the-hi#8 · ANALYSIS
**Candidate:** That lines up exactly — 16 points from COGS plus 2 from overhead is the full 18. Labor's a non-issue, and so is revenue. So this is a COGS story.

Now, COGS going from 42% to 58% while revenue grew 15% means COGS dollars grew a lot in absolute terms. If revenue is 100 → 115, COGS is 42 → 66.7. That's a 59% increase in COGS dollars against 15% more volume, so roughly 38% more cost per unit sold. That's a price or waste problem, not a volume problem.

Two candidates: input prices spiked, or they're selling more of something cheap-margin. If dairy is around 30% of COGS at a specialty chain, and milk prices alone drove this, milk would have to have roughly tripled — which I doubt. So the other inputs, mainly green coffee, would have to be running near 25% increases on top. Is that roughly the shape of it?

**Logged Sonnet reply (historical):** I'll take your COGS dollar math as you showed it. The 30% dairy share and the roughly 25% bean increase are your assumptions, and the milk tripling and 25% figures don't follow from anything we've established. Walk me through how you got from a 30% dairy share to milk having to triple, and what you'd need to know to replace that assumption with data. Hold that request; I'll come back to it shortly.

**sonnet (fresh)**
say: Mm-hm.
requests: []
question: You said milk would have to have roughly tripled and coffee would need about twenty-five percent increases on top. Points of what? Walk me through how you got from the COGS jump to those input price changes.
flags: - · useful 2389ms

**luna-low run 1**
say: You’ve narrowed it to input prices or mix.
requests: ["bean_price_change:release:true","bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: Points of what?
flags: - · useful 3264ms

**luna-low run 2**
say: Mm-hm.
requests: ["bean_price_change:release:true","bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: Points of what?
flags: - · useful 2252ms

## 40-jasmine-the#6 · ANALYSIS
**Candidate:** That closes it. Two years ago: 42 COGS plus 22 labor plus 12 overhead is 94, leaving 6 — wait, that gives 6% then, not 24%. Let me redo. 42 + 22 + 12 = 76, so margin 24%. Today 58 + 22 + 14 = 94, margin 6%. The 18-point drop is 16 points COGS and 2 points overhead. COGS is the whole case.

And since menu prices are flat, the 15% same-store revenue growth is pure volume or mix — they're selling more at an unchanged price while input cost per unit has climbed, so every incremental cup earns less. 16 points on $480M of revenue is about $77M of annual profit.

Recommendation: go after COGS. Take price — even a 6–8% menu increase, roughly in line with two years of input inflation, recovers most of the gap if volume holds; specialty coffee demand is fairly inelastic. In parallel, renegotiate or hedge bean contracts and audit waste and portioning. Overhead is a secondary $10M lever.

Risks: volume falloff if competitors hold price, and mix shift toward low-margin items I can't see without basket data. Next steps: a cost-per-unit decomposition to confirm it's input price not waste, and a price elasticity test in a few markets.

I'm done — can we do another case?

**Logged Sonnet reply (historical):** Several pieces of that need checking. You said 16 points on $480M of revenue is about $77M of annual profit. Walk me through that.

**sonnet (fresh)**
say: Understood.
requests: []
question: You sized the COGS problem at about $77M a year. Is that the margin problem, or does it include cost that simply grew with revenue?
flags: - · useful 1864ms

**luna-low run 1**
say: Understood. Let's stay with this case.
requests: []
question: Which risk to your recommendation is most significant, and how would you mitigate it?
flags: - · useful 2859ms

**luna-low run 2**
say: Understood.
requests: []
question: Which of those risks is most material, and how would you mitigate it?
flags: - · useful 2800ms

## 01-maya-the-fr#9 · EXHIBIT
**Candidate:** Okay. And on the cost side — do we have a breakdown of their cost structure?

**Logged Sonnet reply (historical):** Take a look at this and tell me what you see.

**sonnet (fresh)**
say: Right.
requests: ["exhibit-a:release:true"]
question: What does it tell you?
flags: - · useful 1880ms

**luna-low run 1**
say: Understood.
requests: ["cogs_pct+exhibit-a+labor_pct+overhead_pct:release:true","exhibit:exhibit-a"]
question: What does the exhibit tell you about the drivers of the profit decline?
flags: - · useful 2888ms

**luna-low run 2**
say: Understood.
requests: ["cogs_pct+exhibit-a+labor_pct+overhead_pct:release:true"]
question: What does the cost breakdown tell you?
flags: - · useful 2750ms

## 08-claire-the-#8 · EXHIBIT
**Candidate:** Let me test whether input inflation alone explains it. Beans were 25% of COGS and rose 40% → 0.25 × 40% = 10 points. Other inputs were 75% and rose 37.5% → 0.75 × 37.5% = 28.1 points. Total COGS inflation ≈ 38%.

Old COGS was 42% of revenue. Since menu prices are flat, that 42% scales directly with input cost: 42% × 1.38 = 58%. That's exactly where COGS sits today. So input inflation fully explains the 16-point move — there's no waste or portioning problem hiding in there.

And with prices flat and store count flat, the entire 15% revenue growth is volume — they're selling about 15% more units at unchanged prices while each unit costs 38% more to make. So they've essentially absorbed two years of broad commodity inflation without passing any of it through.

Interesting that it's not just beans — the non-bean basket rose almost as much.

**Logged Sonnet reply (historical):** They then applied that to old COGS of 42% of revenue to reach 58%. But that scaling treats revenue as flat, while revenue grew 15%. The conversion needs a check, but the unit flag here concerns the shares of COGS, which they've handled with consistent bases. The cleaner issue is the 42% to 58% step. Walk me through the step from 42% to 58%. Does multiplying old COGS as a share of revenue by the input inflation figure account for the 15% revenue growth?

**sonnet (fresh)**
say: Mm-hm.
requests: []
question: You said the 42% scales with input costs and lands at 58%. One thing to pin down: your 10 points and 28.1 points, points of what? Walk me through how those sit against revenue and COGS.
flags: - · useful 1956ms

**luna-low run 1**
say: Mm-hm.
requests: ["exhibit:exhibit-a"]
question: Points of what, and what does the exhibit tell you?
flags: - · useful 3047ms

**luna-low run 2**
say: Mm-hm.
requests: []
question: Those ten and twenty-eight points—points of what?
flags: - · useful 2392ms

## 58-hugo-the-hi#12 · EXHIBIT
**Candidate:** That reconciles perfectly. Let me show it.

Old COGS = 42 points of revenue. Beans at 25% = 10.5, other inputs at 75% = 31.5.

Scale quantities by the 15% volume growth, then apply inflation:
Beans: 10.5 × 1.15 × 1.40 = 16.9
Other: 31.5 × 1.15 × 1.375 = 49.8
Total = 66.7 against revenue of 115 → 58.0%.

That's the exact COGS ratio you gave me, so input price inflation explains essentially all 16 points. No waste, no mix shift, no procurement failure needed.

But that reconciliation only works if the 15% revenue growth is pure volume. Which means menu prices haven't moved at all in two years while inputs rose nearly 40%. That's the real finding — Brew & Bean absorbed the entire commodity shock.

Do we have the menu price history to confirm prices were held flat?

**Logged Sonnet reply (historical):** Your arithmetic is shown and consistent with the figures. You've asked for menu price history, and that's the right thing to confirm. Menu prices have not changed in two years.

**sonnet (fresh)**
say: Your reconciliation matches the cost figures.
requests: ["menu_price_change:release:true"]
question: With that in hand, how does it change your read of the cause, and what does it tell you about where to look next?
flags: - · useful 1605ms

**luna-low run 1**
say: Understood.
requests: ["menu_price_change:release:true","exhibit:exhibit-a"]
question: What does the exhibit tell you about the cost changes, and how does the menu price history affect your conclusion?
flags: - · useful 3962ms

**luna-low run 2**
say: You’ve tied the input-cost changes to the COGS ratio.
requests: ["menu_price_change:release:true","exhibit:exhibit-a"]
question: What does the exhibit tell you, and does it support your conclusion about what drove the margin decline?
flags: - · useful 2476ms

## 01-maya-the-fr#27 · EXHIBIT
**Candidate:** They're both percentages of revenue, I think.

So COGS grew 16 percent, from 42 to 58. That's the sixteen.

Sorry, I know you're pointing at something and I'm not seeing it.

**Logged Sonnet reply (historical):** You're right that both are percentages of revenue. So the move from 42 to 58 is sixteen points of revenue, and your earlier line was that it explains sixteen of the eighteen points of margin drop. Now, what inside COGS would you want to dig into to understand why it rose?

**sonnet (fresh)**
say: You're right that both are shares of revenue.
requests: []
question: So the sixteen is points of revenue, not growth in COGS itself. With that in mind, what does it mean for the margin, and what would you want to understand next about why COGS moved?
flags: - · useful 3552ms

**luna-low run 1**
say: Mm-hm.
requests: []
question: Since both figures are percentages of revenue, how would you describe the change from 42% to 58%?
flags: - · useful 1615ms

**luna-low run 2**
say: Mm-hm.
requests: []
question: Since both figures are shares of revenue, how would you describe the change from 42% to 58%?
flags: - · useful 2716ms

## 01-maya-the-fr#23 · BRAINSTORM
**Candidate:** I'm okay, really — I'd rather keep going. Sorry about that.

**Logged Sonnet reply (historical):** No apology needed. You said COGS went from 42 to 58 of revenue, and that you counted it as 16 of the 18 points of margin loss. What do you think is driving COGS up?

**sonnet (fresh)**
say: No need to apologize.
requests: []
question: You said COGS accounts for 16 of the 18 points of margin loss, and that's points of revenue. Now the nature of the increase: what could be driving COGS up from 42 to 58 percent of revenue?
flags: - · useful 3950ms

**luna-low run 1**
say: Understood.
requests: []
question: Beyond the cost drivers we've discussed, what else could Brew & Bean do to improve profitability?
flags: - · useful 2866ms

**luna-low run 2**
say: Understood.
requests: []
question: Beyond what we've discussed, what else could the client do to improve profitability?
flags: - · useful 1834ms

## 56-devon-the-i#10 · BRAINSTORM
**Candidate:** Sizing first. Costs in dollars are 94% of $480M = $451.2M, and a price increase doesn't move them if volume holds. I'll take it volume holds flat for the moment.

To get back to 24%, revenue needs to be 451.2 / 0.76 = $593.7M, which is a 23.7% price increase. That's a lot to ask of a customer in one go. A more realistic target — say 15% net margin — needs 451.2 / 0.85 = $530.8M, or about a 10.6% increase. That alone recovers roughly $44M of profit.

On the customer base, what matters is elasticity: at a 10% increase, how much traffic walks. Breakeven on a 10.6% price rise with 58% variable COGS — contribution per unit goes from 42 to 52.6 cents on the dollar, so we could lose around 20% of volume before we're worse off. That's a wide cushion.

I'd also want the competitive price points nearby, and whether loyalty members behave differently. Do we have that by location?

**Logged Sonnet reply (historical):** I don't have competitive price points or any loyalty or location-level cut. Beyond price, what else could Brew & Bean do to recover margin?

**sonnet (fresh)**
say: Right.
requests: [":release:true"]
question: Beyond price, what else could Brew & Bean do to rebuild its margin?
flags: - · useful 1707ms

**luna-low run 1**
say: Mm-hm.
requests: [":release:true"]
question: Beyond the price changes you’ve discussed, what else could Brew & Bean do to reverse the profit decline?
flags: - · useful 2620ms

**luna-low run 2**
say: Mm-hm.
requests: [":release:true"]
question: Beyond the price lever you’ve discussed, what else could Brew & Bean do to reverse the margin decline?
flags: - · useful 2439ms

## 01-maya-the-fr#31 · RECOMMENDATION
**Candidate:** Umm. Maybe raise prices, since they haven't changed in two years? Or renegotiate supplier contracts, maybe lock in longer-term bean pricing. Possibly change the menu mix toward items with cheaper inputs.

I'm not sure beyond that, sorry.

**Logged Sonnet reply (historical):** Okay. Of those ideas, which would you prioritize, and why?

**sonnet (fresh)**
say: Understood.
requests: []
question: Given all of that, what would you recommend to the CEO, and which lever would you pull first?
flags: - · useful 2998ms

**luna-low run 1**
say: You’ve identified several possible actions.
requests: []
question: What would you recommend to the CEO, and what is the main evidence behind your recommendation?
flags: - · useful 1581ms

**luna-low run 2**
say: You’ve outlined several possible levers.
requests: []
question: What would you recommend to the CEO, and how would you prioritize those actions?
flags: - · useful 1450ms

## 58-hugo-the-hi#16 · RECOMMENDATION
**Candidate:** A few levers, roughly in order of how much they'd move the needle.

Procurement: beans are up 40% on spot. Forward contracts or hedging won't recover past losses but stops the bleeding, and with 200 locations they have scale to negotiate directly with roasters or importers rather than buying through a distributor.

Mix: push customers toward the items where input cost is lowest as a share of price. Brewed drip and espresso use far less dairy than a large latte, so featuring those, or making the smaller sizes more prominent on the menu board, lifts blended margin without a headline price change.

Portion and waste control: at 58% COGS, even a one or two point reduction in dairy waste, overpour, or unsold pastries is real money.

Overhead: it drifted from 12% to 14% while labor held flat — worth understanding whether that's new-store support costs or corporate bloat.

Quietest lever is substitution — reformulating to a cheaper milk or bean blend — but I'd be cautious, since "specialty" is the brand promise and quality erosion costs you the pricing power you need.

**Logged Sonnet reply (historical):** Okay. Of everything you've laid out, which would you put in front of the CEO first, and what would you want to see before committing to it?

**sonnet (fresh)**
say: Understood.
requests: []
question: You recommended a price increase as the main lever. What's the biggest risk to that recommendation, and how would you mitigate it?
flags: - · useful 2129ms

**luna-low run 1**
say: Understood.
requests: []
question: What is the biggest risk to your recommendation, and how would you mitigate it?
flags: - · useful 1566ms

**luna-low run 2**
say: Understood.
requests: []
question: What is the biggest risk to your recommendation, and how would you mitigate it?
flags: - · useful 1842ms

## 01-maya-the-fr#33 · WRAP
**Candidate:** I don't know, sorry. I can't really pick between them.

**Logged Sonnet reply (historical):** Take a minute if you need it. You've told me the cost pressure is across beans and the other inputs, and that prices haven't moved in two years. Given that, which one lever would you lead with?

**sonnet (fresh)**
say: Understood. You have what you need from the cost data: the input cost growth you worked out, and the fact that prices haven't moved in two years.
requests: []
question: If you were presenting to the CEO right now, what would you recommend Brew & Bean do first, and what's your reason?
flags: - · useful 2427ms

**luna-low run 1**
say: Understood.
requests: []
question: What would you recommend Brew & Bean do to reverse the margin decline?
flags: - · useful 2064ms

**luna-low run 2**
say: Understood.
requests: []
question: What would you recommend Brew & Bean do, and how would you support that recommendation?
flags: - · useful 2197ms
