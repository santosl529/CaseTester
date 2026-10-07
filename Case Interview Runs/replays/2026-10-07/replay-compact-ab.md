## 01-maya-the-fr#3 · INTRO
**Candidate:** Okay, so... I'd want to look at a few things. First, revenue — like what's happening with sales. Second, costs, so what they're spending money on. And third, maybe external stuff, like competitors or the market overall. Does that seem okay as a starting point?

**Full (measured)**
say: A revenue, cost and external split.
requests: ["cogs_pct+labor_pct+overhead_pct:defer:false","revenue_total:defer:false"]
question: Before we go further, is that structure MECE, and which of those three branches would you prioritize first, and why?
flags: -

**Full (warm-up)**
say: A revenue, cost and external split.
requests: []
question: Before any data, is that structure MECE, and which branch would you prioritize first, and why?
flags: -

**Compact (measured)**
say: Revenue, costs, and external factors.
requests: []
question: Is that MECE, and if it isn't, what's missing?
flags: -

**Compact (warm-up)**
say: Revenue, costs, external factors.
requests: []
question: Is that MECE — what's missing, and which of those three branches would you prioritize first, and why?
flags: -

## 01-maya-the-fr#5 · CLARIFY
**Candidate:** Can I ask — is the 15% revenue growth from more stores, or more sales per store?

**Full (measured)**
say: 
requests: ["revenue_per_store+stores_count:defer:true"]
question: Before we get to that, I'd still like an answer to my last question. Within revenue and costs, what would you break down, and which branch do you look at first?
flags: -

**Full (warm-up)**
say: 
requests: ["revenue_per_store+stores_count:defer:true"]
question: Before I get into data, you still owe me an answer on your structure. Within revenue and costs, what exactly would you break down, and which branch would you look at first?
flags: -

**Compact (measured)**
say: Noted.
requests: ["revenue_per_store+stores_count:defer:true"]
question: Before I answer that, is your structure MECE — what's missing from revenue, costs and external factors?
flags: -

**Compact (warm-up)**
say: Noted.
requests: ["revenue_per_store+stores_count:defer:true"]
question: Before I answer that, what's missing or overlapping in the three areas you listed, and which one do you prioritize, and why?
flags: -

## 56-devon-the-i#4 · CLARIFY
**Candidate:** Fair challenge. A couple of gaps.

First, my split blurs COGS and operating expenses. Cleaner would be: COGS — beans, dairy, cups, food items; then store-level operating costs — labor, rent, utilities, maintenance; then corporate SG&A — marketing, HQ salaries, IT; then below-the-line items.

That last bucket is the real omission. We're looking at net margin, not operating margin, so interest expense, taxes, depreciation and any one-time charges all sit in there. If they took on debt or had a writedown, that shows up in net and nowhere else.

On revenue I was also thin. With the footprint flat at 200, that 15% is entirely same-store, which means it's price, traffic, ticket size, or mix — say more food and cold drinks versus drip coffee. Mix matters because those carry different margins.

I'll start by assuming the damage is operating-level rather than financing, but I'd want the P&L lines for both years to confirm.

**Full (measured)**
say: Understood.
requests: ["cogs_pct:release:true","labor_pct:release:true","overhead_pct:release:true"]
question: Based on those figures, which cost line would you dig into first, and why?
flags: -

**Full (warm-up)**
say: Understood.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true"]
question: With that in front of you, which line do you dig into first, and why?
flags: -

**Compact (measured)**
say: Got it.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true"]
question: With those cost percentages in front of you, which line would you dig into first, and why?
flags: -

**Compact (warm-up)**
say: Got it.
requests: ["cogs_pct:release:true","labor_pct:release:true","overhead_pct:release:true"]
question: Which of those cost lines would you look at first, and why?
flags: -

## 06-destiny-the#14 · STRUCTURE
**Candidate:** maybe ingredients, people, and the store stuff like rent? I'd look at people first, I think baristas probably cost the most.

**Full (measured)**
say: Three buckets: ingredients, people, and store costs.
requests: []
question: Is that set of buckets MECE, and where is marketing in it? Then tell me what you'd actually check to know whether it's people that's driving the decline.
flags: -

**Full (warm-up)**
say: Three cost buckets.
requests: []
question: Before you pick one: is that grouping complete, or is there a cost you listed that doesn't fit? And what makes you think baristas cost the most?
flags: -

**Compact (measured)**
say: Three buckets: ingredients, people, store costs.
requests: ["cogs_pct+labor_pct+overhead_pct:defer:true"]
question: You said baristas probably cost the most. What makes you think so, and is there anything on costs that your three buckets leave out?
flags: -

**Compact (warm-up)**
say: Three buckets: ingredients, people, store costs.
requests: ["cogs_pct+labor_pct+overhead_pct:defer:true"]
question: You said baristas probably cost the most. What makes you think that, and is that the bucket you'd prioritize over the other two?
flags: -

## 58-hugo-the-hi#6 · STRUCTURE
**Candidate:** I'd go to the cost breakdown first, because it's the fastest way to narrow eighteen points of margin. Revenue is up, so the loss is almost certainly sitting in one or two lines, and I'd rather find the line than guess at the mechanism.

Let me reason toward it while I wait. If revenue grew 15% and we hold the dollar profit implied by 24%, then at 6% net margin on the larger base, profit dollars are roughly a quarter of what they were — 0.06 × 1.15 = 6.9 versus 24, so about 71% of absolute profit gone. That's too large for overhead creep alone.

Given a specialty chain, COGS is typically around 30% of revenue and labor around 30%. If COGS held flat and labor absorbed the whole swing, labor would have to be running near 48% of revenue — which feels implausibly high for this format. Is that roughly where it landed, or is it split across lines?

**Full (measured)**
say: Understood, a cost-first priority.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true"]
question: What do those numbers tell you about where the margin went, and what would you want to look at next?
flags: -

**Full (warm-up)**
say: Understood.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true"]
question: With that in front of you, which line explains the gap, and what would you want to understand about it next?
flags: -

**Compact (measured)**
say: Got it.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true"]
question: Looking at those three lines across both years, which one explains most of the decline, and how did you get there?
flags: -

**Compact (warm-up)**
say: Mm-hm.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true"]
question: You said labor would need to be near 48% if COGS held flat. Looking at these figures, which line moved the most, and what does that tell you about where to dig next?
flags: -

## 01-maya-the-fr#7 · ANALYSIS
**Candidate:** Got it, thanks. Is that growth coming from price increases or more customers?

**Full (measured)**
say: Right.
requests: ["avg_ticket:release:true","menu_price_change:release:true"]
question: With that in hand, what does it tell you about where the profit problem sits, and what would you look at next?
flags: -

**Full (warm-up)**
say: Understood.
requests: ["avg_ticket:release:true","menu_price_change:release:true"]
question: Based on that, where does the revenue side leave you, and what would you look at next to explain the margin drop?
flags: -

**Compact (measured)**
say: 
requests: ["avg_ticket+menu_price_change:release:true"]
question: With that in hand, what does it tell you about where the margin problem is likely to sit?
flags: -

**Compact (warm-up)**
say: Mm-hm.
requests: ["avg_ticket+menu_price_change:release:true"]
question: With that in hand, what do you conclude about where the revenue growth came from, and how does it connect to the margin decline?
flags: -

## 06-destiny-the#20 · ANALYSIS
**Candidate:** I think the percentages already handle that. If COGS stayed at 42%, it would have grown with revenue but the margin would be the same. So the 16 points is the part that isn't just scaling. 16% of $480M is $76.8M of extra cost. And margin fell 18 points total, so COGS explains most of it, overhead the other 2.

**Full (measured)**
say: Understood. You've isolated COGS as the driver.
requests: []
question: Now go one level deeper into COGS. What are the possible reasons it rose so much as a share of revenue, and what would you want to look at first to find out which it is?
flags: -

**Full (warm-up)**
say: Understood.
requests: []
question: COGS is the driver, so what could explain it rising that much as a share of revenue? Give me the possible causes, and tell me which you'd test first and why.
flags: -

**Compact (measured)**
say: Got it.
requests: []
question: You've located the gap in COGS. What could be pushing COGS from 42% to 58% of revenue, and which of those would you test first?
flags: -

**Compact (warm-up)**
say: Mm-hm. The 16 points is the share that isn't scaling.
requests: []
question: You said COGS explains most of the 18-point drop and overhead the other 2. Check that: do those two pieces account for the full 18 points? Then tell me what you'd want to know next about what's driving COGS.
flags: -

## 09-derek-the-b#10 · ANALYSIS
**Candidate:** I hear the challenge, and let me defend the number rather than just move off it. Mechanically, yes, 25% of 58 is 14.5, so one reading gives you 14.5% of revenue. But I don't think that's the right framing for a margin bridge. Margin points aren't measured against the revenue line in isolation — they're measured against the cost structure that's actually moving, and the line that moved is COGS. When I say beans carry 25 points, I'm indexing to the COGS base, which is the base where the deterioration happened. Converting back to revenue flattens the signal and understates how concentrated the problem is.

And the flat menu price you just gave me reinforces it. Prices haven't moved in two years while input costs ran hard, so every dollar of input inflation dropped straight through to the bottom line with zero pass-through. That's the mechanism, and it's consistent with my 25-point read on beans — if the exposure were really only 14 and change, you wouldn't get the full 18-point collapse out of a cost base this size once you net off packaging and food, which barely moved.

So I'd keep 25 as my working figure and flag the 14.5 as a conservative floor. Either way beans rank first, dairy second. Can I get the actual COGS split now so I can size the pass-through gap?

**Full (measured)**
say: Understood.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: A margin point is a point of revenue, since net margin is profit over revenue. With that in mind, restate what the bean share of COGS means in points of revenue, and tell me whether your two-year margin bridge still holds.
flags: -

**Full (warm-up)**
say: Understood.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: Now that you have the split, restate beans in points of revenue, and tell me whether that explains the COGS increase you're trying to account for.
flags: -

**Compact (measured)**
say: Mm-hm.
requests: ["bean_share_of_cogs+non_bean_input_change:release:true"]
question: Margin points are measured on revenue, since margin is profit over revenue. You said 25 points of margin exposure from beans, and the whole decline is 18 points. How can one input account for more than the total decline?
flags: -

**Compact (warm-up)**
say: Got it.
requests: ["bean_share_of_cogs+non_bean_input_change:release:true"]
question: Margin is measured against revenue, so a 25-point margin hit means 25 points of revenue. You said 25 beans and 14.5 floor; they can't both be margin points. Which one is the margin figure, and why?
flags: -

## 40-jasmine-the#8 · ANALYSIS
**Candidate:** $480M revenue, 10% price increase on the same volume is $48M of incremental revenue, and since price carries no added cost, it drops to profit. I haircut for some volume loss to get $40–45M. Current profit is 6% of $480M, about $29M, so that roughly triples it.

**Full (measured)**
say: Got it.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: With those figures, what do they tell you about the driver of the COGS increase, and does it change your recommendation?
flags: -

**Full (warm-up)**
say: Understood.
requests: ["bean_share_of_cogs+non_bean_input_change:release:true"]
question: With that breakdown in hand, what does it tell you about the root cause, and does it change your pricing recommendation?
flags: -

**Compact (measured)**
say: Got it.
requests: ["bean_share_of_cogs:release:true","non_bean_input_change:release:true"]
question: You said revenue is $480M and profit is about $29M. Your revenue was already up 15% over two years, so does that $480M reflect today or two years ago, and does the base change your price-increase figure?
flags: -

**Compact (warm-up)**
say: Mm-hm.
requests: ["bean_share_of_cogs+non_bean_input_change:release:true"]
question: You said a haircut for volume loss gets you to forty to forty-five million. What volume loss did you assume, and what did it cost you in margin?
flags: unsourced_figure

## 58-hugo-the-hi#8 · ANALYSIS
**Candidate:** That lines up exactly — 16 points from COGS plus 2 from overhead is the full 18. Labor's a non-issue, and so is revenue. So this is a COGS story.

Now, COGS going from 42% to 58% while revenue grew 15% means COGS dollars grew a lot in absolute terms. If revenue is 100 → 115, COGS is 42 → 66.7. That's a 59% increase in COGS dollars against 15% more volume, so roughly 38% more cost per unit sold. That's a price or waste problem, not a volume problem.

Two candidates: input prices spiked, or they're selling more of something cheap-margin. If dairy is around 30% of COGS at a specialty chain, and milk prices alone drove this, milk would have to have roughly tripled — which I doubt. So the other inputs, mainly green coffee, would have to be running near 25% increases on top. Is that roughly the shape of it?

**Full (measured)**
say: Mm-hm.
requests: []
question: You said milk would have to have roughly tripled, with green coffee up near 25% on top. Walk me through how you got from the COGS share to those input price figures. Points of what, exactly?
flags: -

**Full (warm-up)**
say: Mm-hm.
requests: []
question: You said dairy is around 30% of COGS, and that other inputs would need roughly 25% increases. Points of what, and how did you get there? Walk me through it.
flags: -

**Compact (measured)**
say: Mm-hm.
requests: []
question: You said dairy is around thirty percent of COGS, and that other inputs would need to run near twenty-five percent increases. Walk me through how you got each of those. And when you tallied the eighteen points, points of what was each of the sixteen and the two?
flags: -

**Compact (warm-up)**
say: Mm-hm.
requests: []
question: You said milk would have to have roughly tripled and other inputs run near 25% increases. Walk me through how you got there. Points of what are you working in?
flags: -

## 40-jasmine-the#6 · ANALYSIS
**Candidate:** That closes it. Two years ago: 42 COGS plus 22 labor plus 12 overhead is 94, leaving 6 — wait, that gives 6% then, not 24%. Let me redo. 42 + 22 + 12 = 76, so margin 24%. Today 58 + 22 + 14 = 94, margin 6%. The 18-point drop is 16 points COGS and 2 points overhead. COGS is the whole case.

And since menu prices are flat, the 15% same-store revenue growth is pure volume or mix — they're selling more at an unchanged price while input cost per unit has climbed, so every incremental cup earns less. 16 points on $480M of revenue is about $77M of annual profit.

Recommendation: go after COGS. Take price — even a 6–8% menu increase, roughly in line with two years of input inflation, recovers most of the gap if volume holds; specialty coffee demand is fairly inelastic. In parallel, renegotiate or hedge bean contracts and audit waste and portioning. Overhead is a secondary $10M lever.

Risks: volume falloff if competitors hold price, and mix shift toward low-margin items I can't see without basket data. Next steps: a cost-per-unit decomposition to confirm it's input price not waste, and a price elasticity test in a few markets.

I'm done — can we do another case?

**Full (measured)**
say: Understood.
requests: []
question: You sized the COGS gap at $77M. Is that the margin problem, or does it include cost that simply grew with revenue?
flags: -

**Full (warm-up)**
say: Understood.
requests: []
question: You sized the COGS gap at about $77 million. Is that the margin problem, or does it include cost that simply grew with revenue?
flags: -

**Compact (measured)**
say: Noted. You said about $77M of annual profit — walk me through that figure.
requests: []
question: Starting from the revenue base you used, how did you get from 16 points of COGS to that dollar figure, and is it the margin problem or does it include normal growth?
flags: -

**Compact (warm-up)**
say: Got it. A COGS-first conclusion.
requests: []
question: You said a 6 to 8 percent price increase, roughly in line with two years of input inflation. What inflation figure is that based on, and where does it come from in the data you have?
flags: -

## 01-maya-the-fr#9 · EXHIBIT
**Candidate:** Okay. And on the cost side — do we have a breakdown of their cost structure?

**Full (measured)**
say: Understood.
requests: ["exhibit-a:release:true"]
question: What does it tell you?
flags: -

**Full (warm-up)**
say: 
requests: ["exhibit-a:release:true"]
question: What does it tell you?
flags: -

**Compact (measured)**
say: Mm-hm.
requests: ["cogs_pct+labor_pct+overhead_pct:release:true","exhibit:exhibit-a"]
question: What does it tell you?
flags: -

**Compact (warm-up)**
say: 
requests: ["exhibit-a:release:true","exhibit:exhibit-a"]
question: What does it tell you?
flags: -

## 08-claire-the-#8 · EXHIBIT
**Candidate:** Let me test whether input inflation alone explains it. Beans were 25% of COGS and rose 40% → 0.25 × 40% = 10 points. Other inputs were 75% and rose 37.5% → 0.75 × 37.5% = 28.1 points. Total COGS inflation ≈ 38%.

Old COGS was 42% of revenue. Since menu prices are flat, that 42% scales directly with input cost: 42% × 1.38 = 58%. That's exactly where COGS sits today. So input inflation fully explains the 16-point move — there's no waste or portioning problem hiding in there.

And with prices flat and store count flat, the entire 15% revenue growth is volume — they're selling about 15% more units at unchanged prices while each unit costs 38% more to make. So they've essentially absorbed two years of broad commodity inflation without passing any of it through.

Interesting that it's not just beans — the non-bean basket rose almost as much.

**Full (measured)**
say: Right.
requests: []
question: You said input cost inflation is about 38%, and that 42% scales to 58%. Points of what, exactly, is the 10 from beans and the 28.1 from other inputs, and what is it a share of?
flags: -

**Full (warm-up)**
say: Right.
requests: []
question: You said 42% scales with input cost and landed on 58%. Points of what, though: if volume grew 15% at flat prices, does COGS as a share of revenue rise by the same 38% as unit cost? Walk me through that conversion.
flags: -

**Compact (measured)**
say: Mm-hm.
requests: []
question: You said input inflation fully explains the move. Walk me through how you got from the 38% rise in input costs to the 16 points: what is the 42% a share of, and what base is the 58% measured against?
flags: -

**Compact (warm-up)**
say: Got it.
requests: []
question: You said 42% times 1.38 gives 58%. Walk me through why that scaling works on revenue today, given volume grew fifteen percent. Points of what are you measuring there?
flags: -

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

**Full (measured)**
say: Mm-hm.
requests: ["menu_price_change:release:true"]
question: With that in hand, does your price-held-flat conclusion stand, and how does it change what you'd tell the CEO?
flags: -

**Full (warm-up)**
say: Your reconciliation holds against the figures I gave you.
requests: ["menu_price_change:release:true"]
question: With that in hand, how does it change your read of the root cause, and what would you want to see next?
flags: -

**Compact (measured)**
say: Your reconciliation matches the figures we have.
requests: ["menu_price_change:release:true","exhibit:exhibit-a"]
question: What does this exhibit tell you, and how does it bear on what you just concluded?
flags: -

**Compact (warm-up)**
say: Got it.
requests: ["menu_price_change:release:true"]
question: You said prices were held flat and the whole 15% is volume. Before I confirm that, how would you test whether volume growth is coming from more stores, more transactions per store, or both?
flags: -

## 01-maya-the-fr#27 · EXHIBIT
**Candidate:** They're both percentages of revenue, I think.

So COGS grew 16 percent, from 42 to 58. That's the sixteen.

Sorry, I know you're pointing at something and I'm not seeing it.

**Full (measured)**
say: You're right that both are percentages of revenue.
requests: []
question: So COGS went from 42% of revenue to 58% of revenue. Is that sixteen percent growth in COGS, or sixteen points of revenue? Which one is it, and which one explains the margin drop?
flags: -

**Full (warm-up)**
say: You've got the base right: both are percent of revenue.
requests: []
question: So the sixteen is sixteen points of revenue, which is a different thing from COGS growing sixteen percent. Does that change how you'd say it, and how much of the margin drop is COGS?
flags: -

**Compact (measured)**
say: Right, both are shares of revenue.
requests: []
question: So 42 and 58 are each a percent of revenue. Is the move from one to the other sixteen percent, or sixteen of something else? Take your time and say what unit you'd attach to it.
flags: -

**Compact (warm-up)**
say: You've got the base right: both are shares of revenue.
requests: []
question: So the move from 42 to 58 is sixteen points of revenue. How does that compare with the sixteen percent you said for COGS growth, and what does it mean for margin?
flags: -

## 01-maya-the-fr#23 · BRAINSTORM
**Candidate:** I'm okay, really — I'd rather keep going. Sorry about that.

**Full (measured)**
say: No need to apologize. Understood.
requests: []
question: Back to the cost lines: COGS went from 42% to 58% of revenue. Is that a 16 percent increase, or something else? Tell me which, and how you'd say it precisely.
flags: -

**Full (warm-up)**
say: No need to apologize. Carrying on.
requests: []
question: Back to your COGS numbers: you said 42 to 58 is a 16% increase. Is it 16%, or 16 points of revenue? Walk me through the difference, and which one belongs in the margin bridge.
flags: -

**Compact (measured)**
say: No need to apologize.
requests: []
question: Back to the COGS numbers: you said 42 to 58 is a 16% increase. Is that 16 percentage points of revenue, or a 16% rise in COGS itself? Which one is it, and why does it matter for the story?
flags: -

**Compact (warm-up)**
say: No need to apologize.
requests: []
question: Back to the cost lines. You said COGS went from 42 to 58 and called that a 16% increase. Walk me through what 42 to 58 is as a percent change, versus what it is in points of revenue.
flags: -

## 56-devon-the-i#10 · BRAINSTORM
**Candidate:** Sizing first. Costs in dollars are 94% of $480M = $451.2M, and a price increase doesn't move them if volume holds. I'll take it volume holds flat for the moment.

To get back to 24%, revenue needs to be 451.2 / 0.76 = $593.7M, which is a 23.7% price increase. That's a lot to ask of a customer in one go. A more realistic target — say 15% net margin — needs 451.2 / 0.85 = $530.8M, or about a 10.6% increase. That alone recovers roughly $44M of profit.

On the customer base, what matters is elasticity: at a 10% increase, how much traffic walks. Breakeven on a 10.6% price rise with 58% variable COGS — contribution per unit goes from 42 to 52.6 cents on the dollar, so we could lose around 20% of volume before we're worse off. That's a wide cushion.

I'd also want the competitive price points nearby, and whether loyalty members behave differently. Do we have that by location?

**Full (measured)**
say: Understood.
requests: [":release:true"]
question: Price is one lever. Beyond what we've discussed, what else could Brew & Bean do to close the margin gap?
flags: -

**Full (warm-up)**
say: Mm-hm.
requests: [":release:true"]
question: Setting price aside, what else could Brew & Bean do to close the gap, on cost, on revenue, or anywhere else?
flags: -

**Compact (measured)**
say: Mm-hm.
requests: [":defer:true"]
question: Beyond price, what else could Brew & Bean do to close this gap? Think broadly, including levers we haven't discussed.
flags: -

**Compact (warm-up)**
say: Mm-hm.
requests: [":defer:true"]
question: Beyond price, what else could Brew & Bean do to rebuild its margin? Give me as many ideas as you can.
flags: -

## 01-maya-the-fr#31 · RECOMMENDATION
**Candidate:** Umm. Maybe raise prices, since they haven't changed in two years? Or renegotiate supplier contracts, maybe lock in longer-term bean pricing. Possibly change the menu mix toward items with cheaper inputs.

I'm not sure beyond that, sorry.

**Full (measured)**
say: Understood.
requests: []
question: If you were presenting to the CEO right now, what would you recommend, and which of those ideas would you lead with?
flags: -

**Full (warm-up)**
say: Understood.
requests: []
question: Based on everything you've worked through, what do you recommend the CEO do, and why that first?
flags: -

**Compact (measured)**
say: Got it.
requests: []
question: Of the options you listed, which one or ones would you recommend to the CEO, and why?
flags: -

**Compact (warm-up)**
say: Got it. Three levers on the table.
requests: []
question: With about eleven minutes left, if you were presenting to the CEO right now, what would you recommend Brew & Bean do, and why that over the other options?
flags: -

## 58-hugo-the-hi#16 · RECOMMENDATION
**Candidate:** A few levers, roughly in order of how much they'd move the needle.

Procurement: beans are up 40% on spot. Forward contracts or hedging won't recover past losses but stops the bleeding, and with 200 locations they have scale to negotiate directly with roasters or importers rather than buying through a distributor.

Mix: push customers toward the items where input cost is lowest as a share of price. Brewed drip and espresso use far less dairy than a large latte, so featuring those, or making the smaller sizes more prominent on the menu board, lifts blended margin without a headline price change.

Portion and waste control: at 58% COGS, even a one or two point reduction in dairy waste, overpour, or unsold pastries is real money.

Overhead: it drifted from 12% to 14% while labor held flat — worth understanding whether that's new-store support costs or corporate bloat.

Quietest lever is substitution — reformulating to a cheaper milk or bean blend — but I'd be cautious, since "specialty" is the brand promise and quality erosion costs you the pricing power you need.

**Full (measured)**
say: Understood.
requests: []
question: Coming back to your pricing recommendation: what's the single biggest risk to it, and how would you mitigate it?
flags: -

**Full (warm-up)**
say: Mm-hm.
requests: []
question: Back to your pricing recommendation: what's the single biggest risk to it, and how would you know early if it's materializing?
flags: -

**Compact (measured)**
say: Got it.
requests: []
question: You said a 10% increase is far more digestible and that traffic loss is a risk. What would you watch for to know the price increase is failing, and what would you do if it were?
flags: -

**Compact (warm-up)**
say: Got it.
requests: []
question: You said a 10% price increase gets you to roughly 15% margin while risking traffic. What's the biggest risk that could leave the recommendation short of that, and how would you test or mitigate it?
flags: -

## 01-maya-the-fr#33 · WRAP
**Candidate:** I don't know, sorry. I can't really pick between them.

**Full (measured)**
say: Understood.
requests: []
question: Take a minute if you need it. If you were advising the CEO today, what would you recommend, and what's your reasoning from the data we've covered?
flags: -

**Full (warm-up)**
say: Understood.
requests: []
question: Take a minute if you need it. Given what we've found, what would you recommend the CEO do first, and what's your reasoning?
flags: -

**Compact (measured)**
say: Understood.
requests: []
question: Imagine the CEO asks for your single recommendation right now. Based on the cost picture you've worked through, what would you tell them to do, and what's your reason?
flags: -

**Compact (warm-up)**
say: That's fine. Let's use what we have.
requests: []
question: The CEO is waiting on an answer. Based on everything you've found, what do you recommend Brew & Bean do, and why?
flags: -
