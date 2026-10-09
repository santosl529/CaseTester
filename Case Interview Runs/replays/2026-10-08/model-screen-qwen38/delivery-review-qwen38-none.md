# qwen38-none: substantive run-to-run differences (15/26)

- 01-maya-the-fr#5 run-to-run: release:- exhibit:- promise:stores_count offer:- refuse:- | release:revenue_per_store+stores_count exhibit:- promise:- offer:- refuse:-
- 56-devon-the-i#4 run-to-run: release:- exhibit:- promise:cogs_pct offer:- refuse:- | release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
- 06-destiny-the#14 run-to-run: release:- exhibit:exhibit-a promise:revenue_per_store offer:- refuse:- | release:- exhibit:- promise:- offer:- refuse:-
- 01-maya-the-fr#7 run-to-run: release:- exhibit:- promise:- offer:- refuse:- | release:- exhibit:- promise:- offer:avg_ticket+menu_price_change refuse:-
- 06-destiny-the#20 run-to-run: release:- exhibit:- promise:- offer:bean_price_change refuse:- | release:- exhibit:exhibit-a promise:- offer:bean_price_change+bean_share_of_cogs+non_bean_input_change refuse:-
- 40-jasmine-the#8 run-to-run: release:bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:- refuse:- | release:bean_price_change+bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:revenue_total refuse:-
- 40-jasmine-the#6 run-to-run: release:- exhibit:- promise:- offer:- refuse:- | release:bean_price_change+bean_share_of_cogs exhibit:- promise:- offer:- refuse:-
- 08-claire-the-#8 run-to-run: release:- exhibit:exhibit-a promise:- offer:- refuse:- | release:- exhibit:- promise:- offer:- refuse:-
- 58-hugo-the-hi#12 run-to-run: release:menu_price_change exhibit:exhibit-a promise:- offer:- refuse:- | release:menu_price_change exhibit:- promise:- offer:- refuse:-
- 01-maya-the-fr#23 run-to-run: release:- exhibit:- promise:- offer:- refuse:- | release:bean_price_change+revenue_total exhibit:- promise:- offer:- refuse:-
- 18-nikhil-the-#2 run-to-run: release:- exhibit:- promise:avg_ticket+cogs_pct+labor_pct+overhead_pct+revenue_total+stores_count offer:- refuse:yes | release:- exhibit:- promise:avg_ticket+cogs_pct+labor_pct+overhead_pct+stores_count offer:- refuse:yes
- 09-derek-the-b#6 run-to-run: release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:menu_price_change refuse:- | release:- exhibit:- promise:cogs_pct+labor_pct+menu_price_change+overhead_pct offer:- refuse:-
- 18-nikhil-the-#6 run-to-run: release:- exhibit:- promise:bean_price_change+cogs_pct+labor_pct+menu_price_change+overhead_pct+revenue_per_store offer:- refuse:yes | release:- exhibit:- promise:cogs_pct+labor_pct+menu_price_change+overhead_pct+revenue_per_store offer:- refuse:-
- 18-nikhil-the-#24 run-to-run: release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:avg_ticket+bean_price_change+menu_price_change+revenue_per_store+revenue_total+stores_count offer:- refuse:- | release:- exhibit:- promise:- offer:- refuse:-
- 20-connor-the-#2 run-to-run: release:- exhibit:- promise:- offer:- refuse:yes | release:- exhibit:- promise:cogs_pct+labor_pct+overhead_pct offer:- refuse:-

## 01-maya-the-fr#3 · INTRO
**Candidate:** Okay, so... I'd want to look at a few things. First, revenue — like what's happening with sales. Second, costs, so what they're spending money on. And third, maybe external stuff, like competitors or the market overall. Does that seem okay as a starting point?

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Revenue, costs, and external factors. Is that MECE, and which of those three branches would you prioritize first, and why?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> Got it. Before you structure the framework, is there any scoping that would change the shape of the problem?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> Mm-hm. That's a starting point. Is it MECE — what's missing? And which branch do you prioritize, and why?


## 01-maya-the-fr#5 · CLARIFY
**Candidate:** Can I ask — is the 15% revenue growth from more stores, or more sales per store?

**sonnet (as delivered)** · release:- exhibit:- promise:revenue_per_store+stores_count offer:- refuse:-
> I'll come back to the split of revenue growth between store count and sales per store shortly. Before I answer that, I asked which branches you'd break down and which you'd look at first. Walk me through your priority, and why.


**qwen38-none run 1** · release:- exhibit:- promise:stores_count offer:- refuse:-
> Mm-hm. I'll come back to store count over the period shortly. That does make sense. Let's put that number on hold for a moment. Back to your structure: within revenue and costs, what exactly would you break down, and which branch would you look at first?


**qwen38-none run 2** · release:revenue_per_store+stores_count exhibit:- promise:- offer:- refuse:-
> Right. 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. Average revenue per store is $2.4M a year. Based on what you just heard, is the growth coming from more stores, more sales per store, or a mix?


## 56-devon-the-i#4 · CLARIFY
**Candidate:** Fair challenge. A couple of gaps.

First, my split blurs COGS and operating expenses. Cleaner would be: COGS — beans, dairy, cups, food items; then store-level operating costs — labor, rent, utilities, maintenance; then corporate SG&A — marketing, HQ salaries, IT; then below-the-line items.

That last bucket is the real omission. We're looking at net margin, not operating margin, so interest expense, taxes, depreciation and any one-time charges all sit in there. If they took on debt or had a writedown, that shows up in net and nowhere else.

On revenue I was also thin. With the footprint flat at 200, that 15% is entirely same-store, which means it's price, traffic, ticket size, or mix — say more food and cold drinks versus drip coffee. Mix matters because those carry different margins.

I'll start by assuming the damage is operating-level rather than financing, but I'd want the P&L lines for both years to confirm.

**sonnet (as delivered)** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
> Understood. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. With that in front of you, which line expanded the most, and what does that tell you about where to dig first?


**qwen38-none run 1** · release:- exhibit:- promise:cogs_pct offer:- refuse:-
> Understood. I'll come back to breakdown of costs as a percent of revenue for both years shortly. You've added the buckets, but I still don't have a choice — with margin down eighteen points across those lines, which single branch do you prioritize first and why?


**qwen38-none run 2** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
> Understood. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Given that structure, which specific cost line would you prioritize digging into first, and why?


## 06-destiny-the#14 · STRUCTURE
**Candidate:** maybe ingredients, people, and the store stuff like rent? I'd look at people first, I think baristas probably cost the most.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Three cost buckets. Before you pick one, is that list complete, and what is your reason for starting with people rather than ingredients?


**qwen38-none run 1** · release:- exhibit:exhibit-a promise:revenue_per_store offer:- refuse:-
> So ingredients, people, and store overhead. Here's an exhibit: Brew & Bean Cost Structure Over Time. I'll come back to cost breakdown as percentage of revenue by category shortly. Which of those three buckets would you look at first, and why?
- withheld (say, question_in_say): Which of those would you prioritize, and why?

**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> A split into ingredients, people, and store costs, with a first look at people. Okay. Before we pick a bucket and start pulling numbers, hold that thought for a second. Is that split MECE — anything in the cost pile that doesn't land in one of those three? And if a cost is already trending up now, is that the margin problem, or does it include the normal cost that comes with the fifteen percent revenue you already described?


## 58-hugo-the-hi#6 · STRUCTURE
**Candidate:** I'd go to the cost breakdown first, because it's the fastest way to narrow eighteen points of margin. Revenue is up, so the loss is almost certainly sitting in one or two lines, and I'd rather find the line than guess at the mechanism.

Let me reason toward it while I wait. If revenue grew 15% and we hold the dollar profit implied by 24%, then at 6% net margin on the larger base, profit dollars are roughly a quarter of what they were — 0.06 × 1.15 = 6.9 versus 24, so about 71% of absolute profit gone. That's too large for overhead creep alone.

Given a specialty chain, COGS is typically around 30% of revenue and labor around 30%. If COGS held flat and labor absorbed the whole swing, labor would have to be running near 48% of revenue — which feels implausibly high for this format. Is that roughly where it landed, or is it split across lines?

**sonnet (as delivered)** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
> Understood. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. What do those figures tell you about where the eighteen points went, and what would you want to dig into next?


**qwen38-none run 1** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
> A cost-first split, with the profit-dollar math on top of it. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Now that you have the three cost lines as percentages of revenue in both years, read that back to me — which line explains most of the swing?


**qwen38-none run 2** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
> That's a sharp read. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Given everything you've just seen, where is the primary driver of the margin decline, and how would you validate that finding?


## 01-maya-the-fr#7 · ANALYSIS
**Candidate:** Got it, thanks. Is that growth coming from price increases or more customers?

**sonnet (as delivered)** · release:avg_ticket+menu_price_change exhibit:- promise:- offer:- refuse:-
> Right. Menu prices have not changed in two years. The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit. With revenue growth accounted for, which branch of your structure would you look at next, and why?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> Mm-hm. But you were going to show me how you'd structure the whole thing. Which branch do you prioritize, and why?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:avg_ticket+menu_price_change refuse:-
> Mm-hm. I can share menu price changes over 2 years and average transaction value if you'd like. Which branch would you pull next?
- withheld (question, provenance): Average ticket is up 2.1% and menu prices were flat, so that's not the story.

## 06-destiny-the#20 · ANALYSIS
**Candidate:** I think the percentages already handle that. If COGS stayed at 42%, it would have grown with revenue but the margin would be the same. So the 16 points is the part that isn't just scaling. 16% of $480M is $76.8M of extra cost. And margin fell 18 points total, so COGS explains most of it, overhead the other 2.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Right, the points are the margin effect, and you've tied them to the 18-point decline. COGS is the driver. What are the possible reasons it jumped from 42% to 58% of revenue, and which would you test first?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:bean_price_change refuse:-
> Right, and your math checks out. I can share coffee bean price change over 2 years if you'd like. So COGS is the driver. Now, what's inside COGS for a coffee shop? What's the first thing you'd want to know about the ingredients themselves?


**qwen38-none run 2** · release:- exhibit:exhibit-a promise:- offer:bean_price_change+bean_share_of_cogs+non_bean_input_change refuse:-
> Understood. Here's an exhibit: Brew & Bean Cost Structure Over Time. I can share COGS breakdown: coffee beans as a share of COGS, coffee bean price change over 2 years and COGS breakdown: other input cost changes (dairy, packaging, food) over 2 years if you'd like. You've isolated the 16 point COGS increase as the main driver. Which component inside COGS do you suspect is behind it, and what data would you need to confirm it?


## 09-derek-the-b#10 · ANALYSIS
**Candidate:** I hear the challenge, and let me defend the number rather than just move off it. Mechanically, yes, 25% of 58 is 14.5, so one reading gives you 14.5% of revenue. But I don't think that's the right framing for a margin bridge. Margin points aren't measured against the revenue line in isolation — they're measured against the cost structure that's actually moving, and the line that moved is COGS. When I say beans carry 25 points, I'm indexing to the COGS base, which is the base where the deterioration happened. Converting back to revenue flattens the signal and understates how concentrated the problem is.

And the flat menu price you just gave me reinforces it. Prices haven't moved in two years while input costs ran hard, so every dollar of input inflation dropped straight through to the bottom line with zero pass-through. That's the mechanism, and it's consistent with my 25-point read on beans — if the exposure were really only 14 and change, you wouldn't get the full 18-point collapse out of a cost base this size once you net off packaging and food, which barely moved.

So I'd keep 25 as my working figure and flag the 14.5 as a conservative floor. Either way beans rank first, dairy second. Can I get the actual COGS split now so I can size the pass-through gap?

**sonnet (as delivered)** · release:bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:- refuse:-
> Understood. Coming back to what you asked for earlier: Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Once you have those, tell me how the margin points actually split between beans and everything else, expressed against revenue.


**qwen38-none run 1** · release:bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:- refuse:-
> Got it. Coming back to what you asked for earlier: Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Do we have the actual split now, so you can size the pass-through gap?


**qwen38-none run 2** · release:bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:- refuse:-
> Got it. Coming back to what you asked for earlier: Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. What does it tell you?


## 40-jasmine-the#8 · ANALYSIS
**Candidate:** $480M revenue, 10% price increase on the same volume is $48M of incremental revenue, and since price carries no added cost, it drops to profit. I haircut for some volume loss to get $40–45M. Current profit is 6% of $480M, about $29M, so that roughly triples it.

**sonnet (as delivered)** · release:bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:- refuse:-
> Understood. You asked about this earlier: Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. With that in hand, what does it tell you about where the cost increase is coming from, and does it change your pricing recommendation?


**qwen38-none run 1** · release:bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:- refuse:-
> Show me the cost side. You asked about this earlier: Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Is that a dollar comparison or a margin-point comparison — and does it include revenue that simply grew with the 15% volume gain?


**qwen38-none run 2** · release:bean_price_change+bean_share_of_cogs+non_bean_input_change exhibit:- promise:- offer:revenue_total refuse:-
> Mm-hm. You asked about this earlier: Coffee beans were 25% of COGS two years ago. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Raw coffee bean costs are up 40% over the past two years. I can share revenue total if you'd like. Do you want to run the cost driver analysis first, or should we use Exhibit A to sanity-check the COGS shift?


## 58-hugo-the-hi#8 · ANALYSIS
**Candidate:** That lines up exactly — 16 points from COGS plus 2 from overhead is the full 18. Labor's a non-issue, and so is revenue. So this is a COGS story.

Now, COGS going from 42% to 58% while revenue grew 15% means COGS dollars grew a lot in absolute terms. If revenue is 100 → 115, COGS is 42 → 66.7. That's a 59% increase in COGS dollars against 15% more volume, so roughly 38% more cost per unit sold. That's a price or waste problem, not a volume problem.

Two candidates: input prices spiked, or they're selling more of something cheap-margin. If dairy is around 30% of COGS at a specialty chain, and milk prices alone drove this, milk would have to have roughly tripled — which I doubt. So the other inputs, mainly green coffee, would have to be running near 25% increases on top. Is that roughly the shape of it?

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. You said milk would have to have roughly tripled, with green coffee near 25% on top. Points of what? Walk me through how you got from COGS rising 16 points of revenue to those input price figures.


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> That step from 42% of revenue to 38% more cost per unit — walk me through it. Check that 38% — is that right?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> Your cost-per-unit math looks off. Walk me through the 38%.


## 40-jasmine-the#6 · ANALYSIS
**Candidate:** That closes it. Two years ago: 42 COGS plus 22 labor plus 12 overhead is 94, leaving 6 — wait, that gives 6% then, not 24%. Let me redo. 42 + 22 + 12 = 76, so margin 24%. Today 58 + 22 + 14 = 94, margin 6%. The 18-point drop is 16 points COGS and 2 points overhead. COGS is the whole case.

And since menu prices are flat, the 15% same-store revenue growth is pure volume or mix — they're selling more at an unchanged price while input cost per unit has climbed, so every incremental cup earns less. 16 points on $480M of revenue is about $77M of annual profit.

Recommendation: go after COGS. Take price — even a 6–8% menu increase, roughly in line with two years of input inflation, recovers most of the gap if volume holds; specialty coffee demand is fairly inelastic. In parallel, renegotiate or hedge bean contracts and audit waste and portioning. Overhead is a secondary $10M lever.

Risks: volume falloff if competitors hold price, and mix shift toward low-margin items I can't see without basket data. Next steps: a cost-per-unit decomposition to confirm it's input price not waste, and a price elasticity test in a few markets.

I'm done — can we do another case?

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. You sized the COGS gap at about $77M. Is that the margin problem, or does it include cost that simply grew with revenue, and how did you get there?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> You've jumped ahead — let's stay with the diagnosis first. You've landed on COGS as the driver, but you haven't yet broken that 16-point jump apart. Within COGS, which specific input do you suspect, and what data would you pull next to confirm it?


**qwen38-none run 2** · release:bean_price_change+bean_share_of_cogs exhibit:- promise:- offer:- refuse:-
> Understood. Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. You've said COGS is the whole case, but you've also jumped to the recommendation. Before we get there, I want to see the actual split. How much of that 16-point COGS increase is coffee beans versus other inputs?


## 01-maya-the-fr#9 · EXHIBIT
**Candidate:** Okay. And on the cost side — do we have a breakdown of their cost structure?

**sonnet (as delivered)** · release:- exhibit:exhibit-a promise:- offer:- refuse:-
> Here's an exhibit: Brew & Bean Cost Structure Over Time. What does it tell you?


**qwen38-none run 1** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
> Got it. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. Which cost line do you want to dig into first, and why?


**qwen38-none run 2** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:- refuse:-
> Understood. COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. So revenue is up with no price change and a bigger ticket. Walk me through how you'd dig into the cost side to explain the margin drop.


## 08-claire-the-#8 · EXHIBIT
**Candidate:** Let me test whether input inflation alone explains it. Beans were 25% of COGS and rose 40% → 0.25 × 40% = 10 points. Other inputs were 75% and rose 37.5% → 0.75 × 37.5% = 28.1 points. Total COGS inflation ≈ 38%.

Old COGS was 42% of revenue. Since menu prices are flat, that 42% scales directly with input cost: 42% × 1.38 = 58%. That's exactly where COGS sits today. So input inflation fully explains the 16-point move — there's no waste or portioning problem hiding in there.

And with prices flat and store count flat, the entire 15% revenue growth is volume — they're selling about 15% more units at unchanged prices while each unit costs 38% more to make. So they've essentially absorbed two years of broad commodity inflation without passing any of it through.

Interesting that it's not just beans — the non-bean basket rose almost as much.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. You said 42% times 1.38 gives you 58%, which you're treating as today's COGS share of revenue. But revenue itself grew over this period. Points of what are you comparing, and does that hold when you account for the growth?


**qwen38-none run 1** · release:- exhibit:exhibit-a promise:- offer:- refuse:-
> Got it. Here's an exhibit: Brew & Bean Cost Structure Over Time. What does it tell you?
- withheld (question, handover_in_question): Here's an exhibit, the cost structure over time.

**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> Unit check first, though. When you say the bean line contributes ten points and the other inputs twenty-eight points — points of what?


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

**sonnet (as delivered)** · release:menu_price_change exhibit:exhibit-a promise:- offer:- refuse:-
> A full reconciliation of the COGS ratio. Menu prices have not changed in two years. Here's an exhibit: Brew & Bean Cost Structure Over Time. What does the exhibit tell you about where the margin went, and what does it add to what you've already derived?


**qwen38-none run 1** · release:menu_price_change exhibit:exhibit-a promise:- offer:- refuse:-
> Your reconciliation is exact. Menu prices have not changed in two years. Here's an exhibit: Brew & Bean Cost Structure Over Time. What does this tell you about the driver, and what's your first recommendation?
- withheld (question, provenance): Menu price changes over the last two years were 0% — prices were held flat.
- withheld (question, handover_in_question): Here's the cost structure exhibit.

**qwen38-none run 2** · release:menu_price_change exhibit:- promise:- offer:- refuse:-
> Got it. Menu prices have not changed in two years. If the margin decline is entirely input-driven, what's the client's realistic playbook to claw it back?


## 01-maya-the-fr#27 · EXHIBIT
**Candidate:** They're both percentages of revenue, I think.

So COGS grew 16 percent, from 42 to 58. That's the sixteen.

Sorry, I know you're pointing at something and I'm not seeing it.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> You're right that both are percentages of revenue. So 42 to 58 is a shift in what share of revenue goes to COGS. Is that the same as COGS growing sixteen percent? Take a minute and tell me what you'd call that move.


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> We'll keep going. Go on.
- withheld (say, provenance): Try it another way: if revenue were $100, what would COGS have been two years ago, and what is it today?
- withheld (question, provenance): How much larger is today's COGS than two years ago, as a dollar change on that $100 of revenue?

**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> So those two numbers are shares of the same thing, revenue. In that case, what does a move from 42 to 58 actually represent, in plain words?


## 01-maya-the-fr#23 · BRAINSTORM
**Candidate:** I'm okay, really — I'd rather keep going. Sorry about that.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> No need to apologize. Understood. Back to the COGS line: you said 42 to 58 is a 16% increase. Is it 16 percent, or 16 points of revenue? Which is it, and which one lines up with the 18 points of margin lost?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. Do you want to walk through that framing again on the case, or would a break help?


**qwen38-none run 2** · release:bean_price_change+revenue_total exhibit:- promise:- offer:- refuse:-
> Raw coffee bean costs are up 40% over the past two years. Total revenue is $480M a year. You've isolated COGS. Within COGS, what's your next move to find the driver?


## 56-devon-the-i#10 · BRAINSTORM
**Candidate:** Sizing first. Costs in dollars are 94% of $480M = $451.2M, and a price increase doesn't move them if volume holds. I'll take it volume holds flat for the moment.

To get back to 24%, revenue needs to be 451.2 / 0.76 = $593.7M, which is a 23.7% price increase. That's a lot to ask of a customer in one go. A more realistic target — say 15% net margin — needs 451.2 / 0.85 = $530.8M, or about a 10.6% increase. That alone recovers roughly $44M of profit.

On the customer base, what matters is elasticity: at a 10% increase, how much traffic walks. Breakeven on a 10.6% price rise with 58% variable COGS — contribution per unit goes from 42 to 52.6 cents on the dollar, so we could lose around 20% of volume before we're worse off. That's a wide cushion.

I'd also want the competitive price points nearby, and whether loyalty members behave differently. Do we have that by location?

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:yes (1 refused)
> Mm-hm. I don't have competitive price points and loyalty behavior by location. Setting pricing aside, what else could Brew & Bean do to rebuild its margin?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:yes (1 refused)
> That ties out to the prior figures, so the sizing is in. I don't have competitive pricing and loyalty member behavior by location. Beyond the price lever, what else could the client do here, and where do those options leave you?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:yes (2 refused)
> Got it. I don't have competitive price points or loyalty member behavior. Beyond price, what else could the client do to claw back that margin?


## 01-maya-the-fr#31 · RECOMMENDATION
**Candidate:** Umm. Maybe raise prices, since they haven't changed in two years? Or renegotiate supplier contracts, maybe lock in longer-term bean pricing. Possibly change the menu mix toward items with cheaper inputs.

I'm not sure beyond that, sorry.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. Of those ideas and everything we've covered, what would you recommend to the CEO, and why that lever first?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. Thank you. So, wrap it up for the CEO: what's your headline on the root cause, and what are the specific recommendations you'd make?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> Mm-hm. Set those aside for a moment. What would you actually recommend to the CEO to reverse the margin decline, and in what order?


## 58-hugo-the-hi#16 · RECOMMENDATION
**Candidate:** A few levers, roughly in order of how much they'd move the needle.

Procurement: beans are up 40% on spot. Forward contracts or hedging won't recover past losses but stops the bleeding, and with 200 locations they have scale to negotiate directly with roasters or importers rather than buying through a distributor.

Mix: push customers toward the items where input cost is lowest as a share of price. Brewed drip and espresso use far less dairy than a large latte, so featuring those, or making the smaller sizes more prominent on the menu board, lifts blended margin without a headline price change.

Portion and waste control: at 58% COGS, even a one or two point reduction in dairy waste, overpour, or unsold pastries is real money.

Overhead: it drifted from 12% to 14% while labor held flat — worth understanding whether that's new-store support costs or corporate bloat.

Quietest lever is substitution — reformulating to a cheaper milk or bean blend — but I'd be cautious, since "specialty" is the brand promise and quality erosion costs you the pricing power you need.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. Your recommendation leads with a price increase. What's the single biggest risk that could make it fail, and how would you know early that it's happening?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> Got it. Of the price increase you recommended, what's the biggest risk to it working, and how would you address it?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> Got it. How confident are you in that recommendation given the data we have, and what would make you walk it back?


## 01-maya-the-fr#33 · WRAP
**Candidate:** I don't know, sorry. I can't really pick between them.

**sonnet (as delivered)** · release:- exhibit:- promise:- offer:- refuse:-
> Mm-hm. Let's make it concrete. The CEO needs a recommendation: what should Brew & Bean do, and what is your reasoning? Use what you've found about the cost drivers and the fact that prices haven't moved.


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> If you had to pick one, which one goes first?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> You keep saying you can't pick. Take a breath. Which one of those three levers would you do first, and why?


## 18-nikhil-the-#2 · INTRO
**Candidate:** Great, thanks. Before I frame anything, could I get some data?

First, the full cost breakdown — COGS, labor, rent, other — for both years. Second, revenue by location versus total. Third, the number of locations two years ago versus today. Fourth, average ticket size. Fifth, transaction volume per store per day. Sixth, employee headcount and average wage. Seventh, customer satisfaction or NPS scores over the period. Eighth, market share versus competitors like Starbucks and local independents.

That should give me a picture of what's moving. Do we have any of those?

**sonnet (as delivered)** · release:- exhibit:- promise:avg_ticket+cogs_pct+labor_pct+overhead_pct+revenue_per_store+revenue_total+stores_count offer:- refuse:yes (4 refused)
> Understood. I don't have transaction volume per store per day, employee headcount and average wage, customer satisfaction or NPS scores or market share versus competitors. I'll come back to the full cost breakdown for both years, revenue by location versus total, the number of locations two years ago versus today and average ticket size shortly. Before we get into data, how would you structure this problem? Take a minute if you need it.


**qwen38-none run 1** · release:- exhibit:- promise:avg_ticket+cogs_pct+labor_pct+overhead_pct+revenue_total+stores_count offer:- refuse:yes (4 refused)
> We'll build the structure before pulling numbers. I don't have transaction volume per store per day, employee headcount and average wage, customer satisfaction or NPS scores over the period or market share versus competitors like Starbucks and local independents. I'll come back to the full cost breakdown — COGS, labor, rent, other — for both years, revenue by location versus total, the number of locations two years ago versus today and average ticket size shortly. Take a minute and lay out how you'd structure the problem — the branches you'd walk and the order you'd work them in.


**qwen38-none run 2** · release:- exhibit:- promise:avg_ticket+cogs_pct+labor_pct+overhead_pct+stores_count offer:- refuse:yes (5 refused)
> Understood. I don't have revenue by location versus total, transaction volume per store per day, employee headcount and average wage, customer satisfaction or NPS scores over the period or market share versus competitors. I'll come back to the full cost breakdown — COGS, labor, rent, other — for both years, the number of locations two years ago versus today and average ticket size shortly. Before I answer that — what structure do you want to walk this through in? Give me the branches you'd check and in what order.


## 09-derek-the-b#6 · STRUCTURE
**Candidate:** Fair challenge. Let me stress-test it for gaps.

A few things I'd add. First, revenue quality — I lumped price and volume together, but I should separate organic same-store growth from growth that comes purely from new units. If the 15% is all new stores and same-store revenue is actually flat or declining, that's a completely different diagnosis than if mature stores are growing. So: store count by year, and same-store sales growth.

Second, product and channel mix. A shift from high-margin drip and espresso toward lower-margin food, or toward delivery platforms that take 20 to 30 percent of the ticket, would compress margin without any input cost moving at all. Delivery aggregator commission is a line that often hides inside "other" and I'd want to see it explicitly.

Third, waste and shrink. In coffee, spoilage on dairy and pastries is a real COGS leak and it's operationally fixable, so it's worth isolating.

Fourth, below-the-line items — depreciation from the buildout, interest if expansion was debt-funded, and any one-time impairments or closure costs. Net margin is the metric here, not operating margin, so capital structure matters.

Fifth, competitive and external context — are competitors seeing the same compression? That tells us industry versus company-specific.

So the cleaner structure is: revenue decomposition, variable costs, fixed costs, below-the-line, external. Can I see the cost breakdown now?

**sonnet (as delivered)** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:menu_price_change offer:- refuse:-
> Understood. Coming back to what you asked for earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. I'll come back to menu price changes over two years shortly. What do these numbers tell you, and where do you go next?


**qwen38-none run 1** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:- offer:menu_price_change refuse:-
> Understood. Coming back to what you asked for earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. I can share Menu price changes over two years if you'd like. With those figures in front of you, where do you look first and what does it tell you?


**qwen38-none run 2** · release:- exhibit:- promise:cogs_pct+labor_pct+menu_price_change+overhead_pct offer:- refuse:-
> Understood. I'll come back to cost breakdown by year and menu-price history shortly. Which branch do you prioritize, and why?


## 18-nikhil-the-#6 · STRUCTURE
**Candidate:** Probably something's missing, yeah. Let me add to the list rather than guess.

One, revenue per store per year so I can separate same-store growth from new-store growth. Two, gross margin by product category — drinks versus food versus packaged beans. Three, the mix shift across those categories over two years. Four, waste or spoilage rates. Five, discounting and promotional activity as a percent of gross sales. Six, delivery platform commissions if they're on DoorDash or Uber Eats. Seven, training and turnover costs. Eight, depreciation and amortization by year, and whether new store buildouts are being capitalized or expensed.

Also, going back to something I asked earlier — do we have the menu price history? Whether prices moved at all over the two years matters for whether the 15% revenue growth is price or volume.

**sonnet (as delivered)** · release:revenue_per_store exhibit:- promise:menu_price_change offer:- refuse:yes (7 refused)
> Understood. Coming back to what you asked for earlier: Average revenue per store is $2.4M a year. I don't have gross margin by product category, category mix shift, waste or spoilage rates, discounting and promotional activity, delivery platform commissions, training and turnover costs or depreciation and amortization. I'll come back to menu price history shortly. You've listed a lot of data you'd want, but you still haven't given me a framework. In a few sentences, what are the branches you'd use to find the root cause of the margin decline, and which one do you prioritize first, and why?


**qwen38-none run 1** · release:- exhibit:- promise:bean_price_change+cogs_pct+labor_pct+menu_price_change+overhead_pct+revenue_per_store offer:- refuse:yes (7 refused)
> Got it. I don't have gross margin by product category — drinks versus food versus packaged beans, the mix shift across those categories over two years, waste or spoilage rates, discounting and promotional activity as a percent of gross sales, delivery platform commissions if they're on DoorDash or Uber Eats, training and turnover costs or depreciation and amortization by year, and whether new store buildouts are being capitalized or expensed. I'll come back to COGS as a percentage of revenue, rent expense by year, labor expense by year, corporate overhead or SG&A by year, wholesale arabica and robusta prices, revenue per store per year and menu price history shortly. You keep expanding the list rather than prioritizing — of everything on your framework, which branch do you test first, and why?


**qwen38-none run 2** · release:- exhibit:- promise:cogs_pct+labor_pct+menu_price_change+overhead_pct+revenue_per_store offer:- refuse:-
> Mm-hm. I'll come back to COGS as % of revenue, labor as % of revenue, overhead / rent as % of revenue, average revenue per store and menu price changes over 2 years shortly. That's a long list. If you could only pull one first piece of data, what would it be and why?


## 18-nikhil-the-#14 · STRUCTURE
**Candidate:** I'd say the cost side over the revenue side, since revenue grew 15% and margin still fell eighteen points — but which cost line, I can't call yet.

To get there: one, the four main cost lines ranked by size in year three. Two, the same ranked by growth rate. Three, gross margin versus operating margin by year, so I can tell whether it's above or below the gross line. Four, whether the margin decline was gradual or stepped in one year. Five, same-store margin versus chain-wide margin. Six, the number of stores opened in each of the two years. Seven, average time to breakeven for a new store. Eight, whether any markets were exited.

Give me those and I'll name the branch.

**sonnet (as delivered)** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:avg_ticket+bean_price_change+menu_price_change+revenue_per_store+revenue_total+stores_count offer:- refuse:-
> A cost-first split. Coming back to what you asked for earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. I'll come back to revenue and store count, menu price history and average ticket and wholesale coffee bean prices shortly. Within the cost side, which line would you test first, and what would you expect to see?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:-
> Got it. Is that MECE—what's missing?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> Mm-hm. You're asking for a lot of data before picking a branch. Which branch would you prioritize first, and why?


## 18-nikhil-the-#24 · STRUCTURE
**Candidate:** Cost side, largest line first. That's the same answer because nothing new has come in to change it.

Here's what I'd need to go further: one, COGS in dollars, year one and year three. Two, labor in dollars, year one and year three. Three, rent in dollars, both years. Four, SG&A in dollars, both years. Five, total revenue in dollars, both years. Six, net profit in dollars, both years. Seven, store count, both years. Eight, revenue per store, both years.

With revenue and the four cost lines I can compute each as a percent of sales, see the percentage-point deltas, and the branch picks itself. Right now I'd be naming a line on instinct rather than evidence, and I'd rather not anchor the team on a guess.

**sonnet (as delivered)** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:avg_ticket+menu_price_change+revenue_per_store+revenue_total+stores_count offer:- refuse:-
> You've named cost as the priority branch, with revenue as the other side. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. I'll come back to total annual revenue, store count by year, revenue per store, menu price history and average ticket size shortly. What do these figures tell you about where the margin went, and what would you dig into next?


**qwen38-none run 1** · release:cogs_pct+labor_pct+overhead_pct exhibit:- promise:avg_ticket+bean_price_change+menu_price_change+revenue_per_store+revenue_total+stores_count offer:- refuse:-
> Understood. You asked about this earlier: COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable. Overhead is 14% of revenue, up slightly from 12%. I'll come back to total annual revenue, store count by year, revenue per store, average transaction value, menu price changes over two years and coffee bean price change over two years shortly. Based on these cost and revenue figures, which branch would you prioritize and why?


**qwen38-none run 2** · release:- exhibit:- promise:- offer:- refuse:-
> Understood. You've listed the same set of numbers several times and still haven't named a branch. Decide: which specific cost line would you investigate first, and what assumption would make you prefer that one over the others? Commit — you can update it when the data lands.


## 20-connor-the-#2 · INTRO
**Candidate:** Sure. So profit equals revenue minus costs, and since revenue is actually up 15%, the margin collapse almost certainly sits on the cost side. So I'd structure it that way.

First, I'd confirm the revenue picture — is the 15% growth coming from more stores, more transactions per store, or higher prices? That matters because new store openings can drag margin early on.

Second, and where I'd spend most of my time, I'd break costs into fixed and variable. On the variable side: coffee beans, milk, cups, and store labor. On the fixed side: rent, corporate overhead, marketing, and any debt service.

Third, I'd look at it per-unit — cost per store or per transaction — so growth doesn't mask what's happening.

To start: do we have a cost breakdown by line item, ideally for both years so I can see what moved?

**sonnet (as delivered)** · release:- exhibit:- promise:cogs_pct+labor_pct+overhead_pct offer:- refuse:-
> A revenue-then-cost split. I'll come back to the cost breakdown by line item for both years shortly. Before we pull data: you've committed to costs as the main branch. Is that structure MECE, and which part would you prioritize first, and why?


**qwen38-none run 1** · release:- exhibit:- promise:- offer:- refuse:yes (1 refused)
> Got it. I don't have a cost breakdown by line item for both years. Before we pull that data — of those two branches, which would you start digging into first, and what would you use to decide?


**qwen38-none run 2** · release:- exhibit:- promise:cogs_pct+labor_pct+overhead_pct offer:- refuse:-
> Got it. I'll come back to a cost breakdown by line item for both years shortly. Where does your framework fall short?

