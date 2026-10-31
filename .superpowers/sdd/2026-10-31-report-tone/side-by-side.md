# Report tone — old vs new

Sessions: 4224252c, 904b0b33, 95e5d00b, aae091ff, 598645a0. Spend: spent $2.2658 of $3.00 — this process: claude-opus-5-5 8 calls $1.1723.

| Session | Case | Same ratings | Same claims | Quote audit (stripped / dropped) | Inline quotes verbatim | Rewrites passed | Jargon before → after | Accusing before → after |
|---|---|---|---|---|---|---|---|---|
| 4224252c | prof-001 | yes | yes | 0 / 0 | 49/49 | 38/38 | 5 → 0 | 4 → 0 |
| 904b0b33 | prof-002 | yes | yes | 0 / 0 | 54/54 | 30/30 | 1 → 0 | 0 → 0 |
| 95e5d00b | pricing-001 | yes | yes | 0 / 0 | 38/38 | 32/32 | 1 → 0 | 0 → 0 |
| aae091ff | prof-001 | yes | yes | 0 / 0 | 38/38 | 32/33 | 8 → 0 | 3 → 1 |
| 598645a0 | prof-001 | yes | yes | 0 / 0 | 22/22 | 16/16 | 2 → 0 | 0 → 0 |

## 4224252c — Brew & Bean Profitability (prof-001)

Mode: the stored report (scored 2026-10-27), plain-words pass only. Overall: adequate → adequate.

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 49 of 49 |
| Rewrites that passed the tone audit | 38 of 38 |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 5 → 0 |
| "you did not / never / failed / could not", before → after | 4 → 0 |

### Problem Structuring — needs work (unchanged)

**Strength 1**

*Before*

Once past the opening, you formed a sensible hypothesis that the problem sat on the cost side, using the revenue-up/margin-down tension.

> “if revenue grew 15% but margin dropped 18 points, the problem's likely on the cost side, so I'd start there.”

*After*

*In the follow-up on your opening structure, when the interviewer moved on and asked what data you would want first, you said "if revenue grew 15% but margin dropped 18 points, the problem's likely on the cost side, so I'd start there."*

Once past the opening, you formed a sensible working guess that the problem sat on the cost side, using the tension between revenue going up and margin going down. Interviewers want to see you use the facts given to pick a sensible place to start, rather than searching everywhere at once.

**Keep using the tension in the opening facts to point yourself at the most likely cause early.**

**To work on 1**

*Before*

The opening was a list of loosely related areas, not a MECE profit tree, and it mixed overlapping lenses such as internal/external and operations.

> “So, I'd want to look at the whole business — revenue, costs, the market, maybe competitors, and then figure out what's driving the margin down. I'd also look at internal versus external factors, and operations.”

*After*

*In the opening, when asked how you would approach the margin decline, you said "So, I'd want to look at the whole business — revenue, costs, the market, maybe competitors, and then figure out what's driving the margin down. I'd also look at internal versus external factors, and operations."*

The opening was a list of loosely related areas rather than a profit breakdown with no gaps or overlaps, and it mixed overlapping lenses such as internal/external and operations. A clean breakdown at the start shows the interviewer you can organise a messy problem, and overlapping lenses make it hard to follow where you are going.

**Next time, try starting from profit equals revenue minus costs and splitting each side into parts that don't overlap, such as price and volume, then COGS, labor and overhead.**

**To work on 2**

*Before*

When asked twice to name specific branches and a starting point, you could not produce a structure.

> “hmm, I'm not sure.”
> “I'm stuck, sorry.”

*After*

*In the follow-up on your opening structure, when the interviewer asked twice for specific branches and a starting point, you answered "hmm, I'm not sure." and then "I'm stuck, sorry."*

Across both requests, no structure came out, and the interviewer had to move the conversation on. Being able to lay out a structure on request is one of the core things a case interview tests.

**Next time, try having a default profit breakdown ready that you can say out loud immediately, then adapt it to the case.**

**To work on 3**

*Before*

You never restated the objective (find the root cause of a 24%→6% margin decline and reverse it) or tied the structure to that decision.

> “Basically I'd break it into profit drivers and then dig into whichever one looks off.”

*After*

*In the opening, when asked how you would approach the problem, you closed with "Basically I'd break it into profit drivers and then dig into whichever one looks off."*

The answer went straight to an approach without restating the objective (find the root cause of a 24%→6% margin decline and reverse it) or linking the structure to that decision. Restating the goal confirms you understood the question and lets the interviewer see how each part of your plan serves the client's decision.

**Next time, try opening with one sentence that restates the goal, then explain how each branch helps answer it.**

**Missed moment 1**

*Before*

Turn 2: the interviewer said 'That's a list of areas rather than a structure' and asked for specific branches and a starting point; you answered 'hmm, I'm not sure.'

A great answer: “Our goal is to find why margin fell from 24% to 6% while revenue grew 15%, and fix it. Profit is revenue minus costs. Revenue splits into price times volume, with volume split into traffic and items per visit. Costs split into COGS, labor, and overhead/rent. Revenue is up, so I'd start with costs as a percent of revenue, then check whether pricing kept pace with input costs. I'd also ask whether peers are seeing the same squeeze, which tells us how much pricing power we have.”

*After*

*In the follow-up on your opening structure, when the interviewer pointed out that you had given a list of areas and asked for specific branches and where you would start, you answered "hmm, I'm not sure."*

This was the moment to state the goal, lay out a clear profit breakdown and name a starting branch with a reason. A recovered structure here would have turned a weak opening into a solid one and set up the rest of the case.

Next time, try something like: “Our goal is to find why margin fell from 24% to 6% while revenue grew 15%, and fix it. Profit is revenue minus costs. Revenue splits into price times volume, with volume split into traffic and items per visit. Costs split into COGS, labor, and overhead/rent. Revenue is up, so I'd start with costs as a percent of revenue, then check whether pricing kept pace with input costs. I'd also ask whether peers are seeing the same squeeze, which tells us how much pricing power we have.”

### Quantitative & Analytical Rigor — adequate (unchanged)

**Strength 1**

*Before*

You backed traffic growth out of revenue and ticket growth correctly, and drew a business implication from it.

> “Revenue up 15%, ticket up 9.7%: 1.15 ÷ 1.097 ≈ 1.05, so traffic is only up about 5%.”

*After*

*In the exhibit discussion, when asked how the ticket figures squared with no pricing action, you said "Revenue up 15%, ticket up 9.7%: 1.15 ÷ 1.097 ≈ 1.05, so traffic is only up about 5%."*

You correctly worked out traffic growth from revenue and ticket growth, and then drew a business implication from it. Turning given figures into a new fact and saying what it means for the business is exactly the kind of maths interviewers reward.

**Keep pulling hidden figures out of the data you are given and saying what they mean for the client.**

**To work on 1**

*Before*

When probed, the candidate set up the break-even equation and solved it correctly (about 23.6%), but first asserted figures before computing them: 20% for full recovery, and a 9% rise recovering 'most' of the gap when it closes only about half (to about 13.8%).

> “Rough math: a 9% price increase on a $6.80 ticket adds about $0.61 of near-pure margin per transaction, which recovers most of the gap without touching volume.”
> “Getting back to 24% would take closer to a 20% increase, which isn't realistic in one move.”
> “I need (0.41 + 6.80x) ÷ (6.80 × (1+x)) = 0.24.”
> “So roughly a 24% price increase to fully restore the old margin on price alone — which nobody would do.”

*After*

*In the recommendation and the questions after it, you said a 9% rise "recovers most of the gap without touching volume" and that "Getting back to 24% would take closer to a 20% increase," before later setting up "I need (0.41 + 6.80x) ÷ (6.80 × (1+x)) = 0.24."*

When probed, you set up the break-even equation and solved it correctly (about 23.6%), but first stated figures before computing them: 20% for full recovery, and a 9% rise recovering most of the gap when it closes only about half (to about 13.8%). Numbers stated before they are checked can undercut trust in the rest of your analysis, even when you correct them later.

**Next time, try running the quick margin calculation on paper before saying any figure out loud.**

> “Rough math: a 9% price increase on a $6.80 ticket adds about $0.61 of near-pure margin per transaction, which recovers most of the gap without touching volume.”
> “Getting back to 24% would take closer to a 20% increase, which isn't realistic in one move.”
> “So roughly a 24% price increase to fully restore the old margin on price alone — which nobody would do.”

**To work on 2**

*Before*

Your first read of the exhibit got the subtraction wrong. You fixed it immediately, but it is another instance of speaking before checking.

> “so that's a 14-point increase”

*After*

*In the exhibit discussion, when asked which cost line drove the decline, your first read was "so that's a 14-point increase".*

The first subtraction was wrong; you corrected it immediately, but it is another case of speaking before checking. Even quickly fixed slips add up, and interviewers notice a pattern of numbers said before they are checked.

**Next time, try writing the subtraction down and checking it before you say the result.**

**To work on 3**

*Before*

The candidate split COGS into beans and other inputs, applied each inflation rate, and reconciled exactly to today's 58%, but then rounded blended input inflation up to 39% when those same figures give about 38%.

> “input costs rose about 39% over two years”
> “Two years ago COGS was 42 points of revenue: beans 25% of that is 10.5, other inputs 31.5.”
> “Total = 58.0 — exactly today's COGS.”

*After*

*In the recommendation, when giving your main reason, you said "input costs rose about 39% over two years", after earlier working out "Two years ago COGS was 42 points of revenue: beans 25% of that is 10.5, other inputs 31.5."*

You split COGS into beans and other inputs, applied each inflation rate and reconciled exactly to today's 58%, but then rounded the blended input inflation up to 39% when those same figures give about 38%. Small inconsistencies with your own earlier maths can make an interviewer question the rest of your figures.

**Next time, try reusing the exact figures from your own earlier calculation when you quote them in the recommendation.**

> “Total = 58.0 — exactly today's COGS.”

**Missed moment 1**

*Before*

Turn 17: you sized the 8–10% price recommendation for the board without running the margin math, and claimed it 'recovers most of the gap.'

A great answer: “Today profit is 6% of $6.80, about $0.41. A 9% increase adds $0.61 at no extra input cost, so profit is $1.02 on $7.41, about 13.8%. That closes roughly half the 18-point gap. Pricing is the lead lever, but procurement has to deliver the rest.”

*After*

*In the recommendation, when asked for a single recommendation for the board, you sized the 8–10% price rise by saying it "recovers most of the gap without touching volume."*

This was the point to run the margin maths on the price rise before claiming how much of the gap it closes. A board-level recommendation lands much better when the sizing behind it is already checked.

Next time, try something like: “Today profit is 6% of $6.80, about $0.41. A 9% increase adds $0.61 at no extra input cost, so profit is $1.02 on $7.41, about 13.8%. That closes roughly half the 18-point gap. Pricing is the lead lever, but procurement has to deliver the rest.”

### Data & Exhibit Interpretation — strong (unchanged)

**Strength 1**

*Before*

The candidate read every cost line systematically and isolated COGS as the driver (16 of the 18 points, with overhead at 2 and labor flat), though the very first read of the exhibit contained a subtraction error that was corrected right away.

> “So COGS explains 16 of the 18-point margin drop, about 89%, and overhead the other 2. Labor is completely flat.”
> “It goes 42 to 50 to 58, so that's a 14-point increase”

*After*

*In the exhibit discussion, when asked which cost line drove the decline, you concluded "So COGS explains 16 of the 18-point margin drop, about 89%, and overhead the other 2. Labor is completely flat."*

You read every cost line systematically and isolated COGS as the driver (16 of the 18 points, with overhead at 2 and labor flat), though your very first read, "It goes 42 to 50 to 58, so that's a 14-point increase", had a subtraction error that you corrected right away. Going through each line and sizing its share is what lets you pin down the real driver with confidence.

**Keep reading every line of an exhibit and sizing each one's share of the change, while checking the arithmetic first.**

**Strength 2**

*Before*

You drew implications from the data: ruling out fixed-cost absorption because the footprint was constant, and reframing the cost story as pricing inaction.

> “And since footprint is constant at 200 stores, this isn't a fixed-cost absorption issue.”
> “So it's really a pricing-inaction story dressed up as a cost story.”

*After*

*In the exhibit discussion, you said "And since footprint is constant at 200 stores, this isn't a fixed-cost absorption issue" and later "So it's really a pricing-inaction story dressed up as a cost story."*

You drew implications from the data, ruling out fixed-cost absorption because the store count was constant, and reframing the cost story as one of prices not being raised. Interviewers look for candidates who say what the numbers mean, not just what they are.

**Keep asking yourself what each new fact rules in or out and saying it aloud.**

**Strength 3**

*Before*

You proposed precise next data pulls: the COGS composition and menu price history.

> “Do we have a split of COGS — coffee beans, dairy, cups and packaging, food? And has the menu price changed over the two years?”

*After*

*In the exhibit discussion, after isolating COGS, you asked "Do we have a split of COGS — coffee beans, dairy, cups and packaging, food? And has the menu price changed over the two years?"*

You asked for precise next pieces of data: the make-up of COGS and the menu price history. Targeted data requests show you know exactly what would confirm or rule out your explanation.

**Keep following each finding with a specific data request that would test it.**

**To work on 1**

*Before*

Your decomposition showed beans adding only about 4.2 points versus about 11.8 from dairy, packaging, and food, but you never said so. Your next steps then leaned on beans.

> “Next steps: run the pilot, and in parallel start bean contract renegotiation as the second lever.”

*After*

*In the recommendation, your next steps were "run the pilot, and in parallel start bean contract renegotiation as the second lever."*

Your own breakdown showed beans adding only about 4.2 points versus about 11.8 from dairy, packaging and food, but that contrast went unmentioned, and the next steps then leaned on beans. Recommendations that don't follow your own numbers can point the client at the smaller problem.

**Next time, try stating which part of a breakdown is biggest and making sure your next steps target it.**

> “Next steps: run the pilot, and in parallel start bean contract renegotiation as the second lever.”

**Missed moment 1**

*Before*

Turn 11: right after reconciling 10.5→14.7 for beans and 31.5→43.3 for other inputs.

A great answer: “Notably, beans add only about 4 of the 16 points; dairy, packaging, and food add almost 12. So a bean-hedging fix alone won't solve this. Procurement has to cover every input.”

*After*

*In the exhibit discussion, right after you reconciled beans from 10.5 to 14.7 and other inputs from 31.5 to 43.3 to reach "Total = 58.0 — exactly today's COGS."*

This was the moment to point out how the 16 points split between beans and the other inputs, and what that means for the fix. Calling out which piece is biggest right away shapes a better recommendation later.

Next time, try something like: “Notably, beans add only about 4 of the 16 points; dairy, packaging, and food add almost 12. So a bean-hedging fix alone won't solve this. Procurement has to cover every input.”

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

You named elasticity as the main risk, unprompted, and paired it with a practical pilot against control stores.

> “Main risk is elasticity — if traffic falls more than a few percent, the increase self-defeats. I'd mitigate by piloting in 20 stores across two regions for six weeks”

*After*

*In the recommendation, without being asked about risk, you said "Main risk is elasticity — if traffic falls more than a few percent, the increase self-defeats. I'd mitigate by piloting in 20 stores across two regions for six weeks".*

You named customer price sensitivity as the main risk on your own and paired it with a practical pilot against control stores. Raising the biggest risk unprompted, with a way to test it, shows the practical judgment clients expect.

**Keep naming the main risk of your recommendation and a concrete way to test it.**

**Strength 2**

*Before*

Your competitive response was commercially savvy: reprice inelastic items while holding the visible headline price.

> “reprice the inelastic espresso and food items, hold the headline drip coffee price as the visible price signal, and lean harder on loyalty and procurement savings.”

*After*

*In the questions after your recommendation, when asked what you would do if a competitor held prices flat, you said "reprice the inelastic espresso and food items, hold the headline drip coffee price as the visible price signal, and lean harder on loyalty and procurement savings."*

Your competitive response was commercially savvy: raise prices on items customers are less sensitive to while holding the visible headline price. Nuanced responses like this show you understand how customers actually react to prices.

**Keep tailoring your moves to how customers see and react to specific prices.**

**Strength 3**

*Before*

Asked to assume competitor behavior, you made an explicit and justified assumption.

> “I'd assume specialty coffee peers faced the same bean and dairy inflation and passed at least some of it through, since that's the industry norm.”

*After*

*In the exhibit discussion, when the interviewer asked you to make a reasonable assumption about competitor pricing, you said "I'd assume specialty coffee peers faced the same bean and dairy inflation and passed at least some of it through, since that's the industry norm."*

You made a clear assumption about competitors and gave a reason for it. Stating assumptions openly with a rationale lets the interviewer follow and challenge your logic.

**Keep stating your assumptions explicitly with the reason behind them.**

**To work on 1**

*Before*

Your claim that volume growth is 'actively diluting margin' is a conceptual error. Each incremental item at flat prices still covers its 58% COGS and contributes positively. Margin fell because input costs were not passed through, not because volume grew.

> “so growth is actively diluting margin rather than helping”

*After*

*In the exhibit discussion, when interpreting the ticket growth, you said "so growth is actively diluting margin rather than helping".*

Saying growth dilutes margin is a conceptual error: each extra item at flat prices still covers its 58% COGS and adds profit. Margin fell because input costs were not passed through, not because volume grew. Mixing up the cause of a margin problem can lead to the wrong fix and is the kind of logic slip interviewers probe.

**Next time, try checking whether an extra unit still earns more than its cost before saying growth hurts margin.**

**To work on 2**

*Before*

Your board recommendation overstated what pricing alone delivers. The correct framing (pricing plus procurement) only emerged under challenge.

> “which recovers most of the gap without touching volume.”

*After*

*In the recommendation, when sizing the price rise for the board, you said it "which recovers most of the gap without touching volume."*

The board recommendation overstated what pricing alone delivers; the correct framing of pricing plus procurement only came out once the interviewer challenged it. A board recommendation needs to be right the first time, since the client may act on it before anyone challenges it.

**Next time, try sizing your main lever before presenting it and naming the other levers needed to close the gap.**

**To work on 3**

*Before*

Some cost levers carry risks you didn't flag. Locking forward contracts after a 40% run-up could lock in peak prices, and shrinking portions risks brand damage for a specialty chain.

> “renegotiate bean contracts or lock in forward pricing, since 40% spot exposure suggests they're buying unhedged.”

*After*

*In the brainstorm, when asked for other ways to recover margin, you suggested "renegotiate bean contracts or lock in forward pricing, since 40% spot exposure suggests they're buying unhedged."*

Some cost ideas carried risks that went unflagged: locking forward contracts after a 40% run-up could lock in peak prices, and shrinking portions risks brand damage for a specialty chain. Interviewers expect you to see the downside of each idea, not just the upside.

**Next time, try adding a short risk note to each cost idea as you list it.**

**Missed moment 1**

*Before*

Turn 13: interpreting what the ticket growth means for margin.

A great answer: “Growth itself isn't the problem. Each extra item still contributes after COGS, and attachment is helping absorb overhead. The issue is that per-item margin shrank because input costs rose about 38% and prices didn't move.”

*After*

*In the exhibit discussion, when asked what the ticket growth meant for the rest of the revenue growth, you described growth as diluting margin.*

This was the moment to separate the effect of growth from the effect of unchanged prices on per-item margin. Getting the cause right here sets up the correct fix for the client.

Next time, try something like: “Growth itself isn't the problem. Each extra item still contributes after COGS, and attachment is helping absorb overhead. The issue is that per-item margin shrank because input costs rose about 38% and prices didn't move.”

### Creativity & Brainstorming — strong (unchanged)

**Strength 1**

*Before*

You organized ideas into cost-side and revenue-side buckets, with several distinct levers in each.

> “On the cost side: renegotiate bean contracts or lock in forward pricing”
> “On the revenue side, beyond a straight price increase: reprice selectively on the most inelastic items like espresso drinks”

*After*

*In the brainstorm, when asked what else could recover margin, you organised your answer as "On the cost side: renegotiate bean contracts or lock in forward pricing" and "On the revenue side, beyond a straight price increase: reprice selectively on the most inelastic items like espresso drinks".*

You grouped ideas into cost-side and revenue-side buckets, with several distinct ideas in each. Grouping ideas makes a brainstorm easy to follow and shows you are covering the ground.

**Keep sorting brainstorm ideas into clear groups before listing them.**

**Strength 2**

*Before*

You included non-obvious levers such as waste and over-pouring control and a subscription program to protect traffic.

> “And look at waste: in coffee, spoilage and over-pouring can be a few points of COGS on its own.”
> “Introduce a loyalty or subscription program to hold traffic through a price increase.”

*After*

*In the brainstorm, you added "And look at waste: in coffee, spoilage and over-pouring can be a few points of COGS on its own." and "Introduce a loyalty or subscription program to hold traffic through a price increase."*

You included less obvious ideas such as controlling waste and over-pouring, and a subscription program to protect traffic. Non-obvious ideas show creativity and real knowledge of how the business runs.

**Keep adding a few less obvious, industry-specific ideas alongside the standard ones.**

**Strength 3**

*Before*

The candidate prioritized the ideas explicitly with a rationale, but the prioritization wasn't backed by sizing, with no estimate of how many margin points each lever could deliver.

> “I'd sequence it: pricing first because it's fastest and largest, procurement second, reformulation third.”

*After*

*In the brainstorm, you closed with "I'd sequence it: pricing first because it's fastest and largest, procurement second, reformulation third."*

You put the ideas in a clear order with a reason, though the order wasn't backed by any estimate of how many margin points each idea could deliver. Prioritising shows judgment, and sizing each idea makes that priority convincing.

**Keep ranking your ideas with a reason, and attach a rough margin-point estimate to each.**

**Missed moment 1**

*Before*

Turn 15: after listing the levers and sequencing them.

A great answer: “Roughly: pricing can recover 7–8 points, procurement across dairy, packaging, and beans perhaps 3–5, and waste 1–2. Together that gets close to the old 24%, which is why I'd run all three.”

*After*

*In the brainstorm, right after you listed the ideas and put them in order with "pricing first because it's fastest and largest".*

This was the moment to put rough numbers on each idea and show whether together they close the gap. Rough sizing turns a list of ideas into a plan the client can believe in.

Next time, try something like: “Roughly: pricing can recover 7–8 points, procurement across dairy, packaging, and beans perhaps 3–5, and waste 1–2. Together that gets close to the old 24%, which is why I'd run all three.”

### Synthesis & Recommendation — strong (unchanged)

**Strength 1**

*Before*

You led with a clear, specific recommendation.

> “Raise menu prices roughly 8–10% across the core menu, starting with espresso and specialty drinks.”

*After*

*In the recommendation, when asked for a single recommendation for the board, you opened with "Raise menu prices roughly 8–10% across the core menu, starting with espresso and specialty drinks."*

You led with a clear, specific recommendation. Leading with the answer is what senior clients and interviewers want to hear first.

**Keep opening your recommendation with the specific action before the reasons.**

**Strength 2**

*Before*

Your reasons were tied directly to the analysis, ruling out other drivers.

> “Nothing else is broken — labor is flat at 22%, overhead moved only two points, footprint is unchanged, and traffic is up 5%.”

*After*

*In the recommendation, explaining your reason, you said "Nothing else is broken — labor is flat at 22%, overhead moved only two points, footprint is unchanged, and traffic is up 5%."*

Your reasons were tied directly to the analysis and ruled out the other possible drivers. Linking reasons back to the evidence makes a recommendation hard to argue with.

**Keep backing your recommendation with the specific facts you uncovered.**

**Strength 3**

*Before*

You named the key risk and concrete next steps, concisely.

> “Next steps: run the pilot, and in parallel start bean contract renegotiation as the second lever.”

*After*

*In the recommendation, you finished with "Next steps: run the pilot, and in parallel start bean contract renegotiation as the second lever."*

You named the key risk and concrete next steps, concisely. Clear risks and next steps show the recommendation is ready to act on.

**Keep closing with the main risk and short, concrete next steps.**

**To work on 1**

*Before*

The supporting sizing in your recommendation was unchecked and overstated, which weakened an otherwise tight answer.

> “which recovers most of the gap without touching volume.”

*After*

*In the recommendation, sizing the price rise, you said it "which recovers most of the gap without touching volume."*

The sizing behind your recommendation was unchecked and overstated, which weakened an otherwise tight answer. One overstated number can undermine trust in an otherwise strong recommendation.

**Next time, try checking the one supporting number in your recommendation before you state it.**

**Missed moment 1**

*Before*

Turn 17: the one-line board recommendation.

A great answer: “Raise prices 8–10% on specialty SKUs, which restores roughly half the lost margin. Pair it with procurement across dairy, packaging, and beans to close the rest.”

*After*

*In the recommendation, when asked for a single recommendation to take to the board, you opened with "Raise menu prices roughly 8–10% across the core menu, starting with espresso and specialty drinks."*

This one-line answer was the place to state how much of the gap the price rise closes and what covers the rest. A board needs to know both the action and how far it gets them.

Next time, try something like: “Raise prices 8–10% on specialty SKUs, which restores roughly half the lost margin. Pair it with procurement across dairy, packaging, and beans to close the rest.”

### Communication & Delivery — adequate (unchanged)

**Strength 1**

*Before*

You used hypothesis-driven phrasing that framed what the data should show.

> “If prices held flat while input costs rose, that alone would push COGS as a percent of revenue up.”

*After*

*In the exhibit discussion, after asking about menu prices, you said "If prices held flat while input costs rose, that alone would push COGS as a percent of revenue up."*

You framed what the data should show if your explanation was right before seeing it. Saying what you expect to find makes your reasoning easy to follow and test.

**Keep stating what you expect the data to show before you look at it.**

**To work on 1**

*Before*

From the analysis onward the candidate was top-down and signposted with explicit enumeration, but the opening meandered and then stalled, so delivery wasn't consistently top-down across the interview.

> “So, I'd want to look at the whole business — revenue, costs, the market, maybe competitors”
> “I'm stuck, sorry.”
> “First, the direct one: COGS as a percent of revenue should fall from 58% toward the low 50s”

*After*

*In the opening you said "So, I'd want to look at the whole business — revenue, costs, the market, maybe competitors" and later "I'm stuck, sorry.", while in the later questions you said "First, the direct one: COGS as a percent of revenue should fall from 58% toward the low 50s".*

From the analysis onward you led with the answer and numbered your points clearly, but the opening wandered and then stalled, so delivery wasn't consistently answer-first across the interview. The opening sets the interviewer's first impression, so clear delivery matters most there.

**Next time, try using the same answer-first, numbered style from your very first answer.**

**Missed moment 1**

*Before*

Turn 3: you were stuck when asked for branches.

A great answer: “Let me take thirty seconds to lay this out. Then I'll walk you through two branches, revenue and cost, and say where I'd start.”

*After*

*In the follow-up on your opening structure, when asked for specific branches and a starting point, you answered "hmm, I'm not sure."*

This was the moment to ask for a short pause and say how you would lay out your answer. Asking for time and previewing your answer keeps you in control instead of stalling.

Next time, try something like: “Let me take thirty seconds to lay this out. Then I'll walk you through two branches, revenue and cost, and say where I'd start.”

### Pushback, Composure & Case Leadership — adequate (unchanged)

**Strength 1**

*Before*

Probed on the 20% figure, you owned the estimate and solved it properly.

> “I should have run that number before quoting 20%.”

*After*

*In the questions after your recommendation, when asked how you got the 20% figure, you said "I should have run that number before quoting 20%."*

You owned the estimate openly and then solved it properly. Owning a mistake and fixing it calmly builds trust with interviewers and clients.

**Keep acknowledging estimates plainly and working them through when challenged.**

**Strength 2**

*Before*

You drove the case proactively by requesting relevant data unprompted.

> “I'd also want to know whether revenue growth came from new stores or same-store sales, since opening locations adds fixed cost fast.”

*After*

*In the follow-up on your opening structure, when asked what data you wanted first, you added "I'd also want to know whether revenue growth came from new stores or same-store sales, since opening locations adds fixed cost fast."*

You drove the case forward by asking for relevant data on your own. Taking the lead on what to look at next shows you can run a problem, not just answer questions.

**Keep asking for the data that would test your thinking without waiting to be prompted.**

**To work on 1**

*Before*

Challenged on the sizing, the candidate rechecked the math and updated openly with explicit reasoning, but under the first challenge on structure the candidate froze twice without offering a partial answer and needed the interviewer to move on.

> “hmm, I'm not sure.”
> “I'm stuck, sorry.”
> “That's half the gap, not most of it — I overstated.”

*After*

*In the follow-up on your opening structure, when asked for branches, you answered "hmm, I'm not sure." and "I'm stuck, sorry.", whereas later, challenged on sizing, you said "That's half the gap, not most of it — I overstated."*

Challenged on the sizing, you rechecked the maths and updated openly with clear reasoning, but under the first challenge on structure you froze twice without offering a partial answer, and the interviewer had to move on. Offering even part of an answer under pressure keeps the conversation going and shows composure.

**Next time, try giving a partial answer, such as naming one branch, when you feel stuck.**

**Missed moment 1**

*Before*

Turn 4: the interviewer offered time and repeated 'which branch would you start with, and why?'

A great answer: “I'd start with costs. Revenue grew 15% while margin fell 18 points, so the squeeze is almost certainly a cost line growing faster than revenue. I'd want to see each cost line as a percent of revenue then versus now.”

*After*

*In the follow-up on your opening structure, when the interviewer offered you time and asked again which branch you would start with and why, you said "I'm stuck, sorry."*

This was a second chance to name a starting branch using the facts already given in the prompt. Recovering on the second ask would have shown composure and saved the opening.

Next time, try something like: “I'd start with costs. Revenue grew 15% while margin fell 18 points, so the squeeze is almost certainly a cost line growing faster than revenue. I'd want to see each cost line as a percent of revenue then versus now.”

**Top improvement** (unchanged): Open with a real, tailored profit tree instead of a list of areas: restate the objective, then split profit into revenue (price × traffic × items per visit) and costs (COGS, labor, overhead/rent), and say which branch you'd test first and why. In this case that was costs, since revenue grew while margin fell. Your later analysis was excellent, but freezing at the structuring stage is what an interviewer remembers. Second, compute any figure before quoting it.

---

## 904b0b33 — Larkspur Air Route Profitability (prof-002)

Mode: the stored report (scored 2026-10-27), plain-words pass only. Overall: adequate → adequate.

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 54 of 54 |
| Rewrites that passed the tone audit | 30 of 30 |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 1 → 0 |
| "you did not / never / failed / could not", before → after | 0 → 0 |

### Problem Structuring — needs work (unchanged)

**To work on 1**

*Before*

The candidate read the opening numbers well: an equal revenue drop and profit swing meant costs hadn't moved, and full planes pointed to yield. But the candidate then skipped structuring, jumped to a recommendation, and offered an 'input-cost squeeze' diagnosis that contradicted that flat-cost read.

> “Honestly, I think the answer's already visible, so let me just give you the recommendation and the structure falls out of it.”
> “It's an input-cost squeeze.”
> “a $24 million revenue drop turning into a $24 million profit swing tells me costs didn't come down at all”
> “If load factor held, that's a yield problem — they're getting less per seat.”

*After*

*In the opening and the first analysis question, when asked how you would structure the problem, you said "a $24 million revenue drop turning into a $24 million profit swing tells me costs didn't come down at all" and then "It's an input-cost squeeze."*

Your read of the opening numbers was sharp: an equal revenue drop and profit swing meant costs hadn't moved, and full planes pointed to yield ("If load factor held, that's a yield problem — they're getting less per seat."). But the answer then skipped the structure, went straight to a recommendation ("let me just give you the recommendation and the structure falls out of it"), and called it an input-cost squeeze, which contradicts that flat-cost read. Interviewers ask for a structure to see how you think, and a diagnosis that contradicts your own earlier logic undermines confidence in the rest.

**Next time, try laying out a full structure first, then checking that your diagnosis matches what you have already worked out from the numbers.**

> “Honestly, I think the answer's already visible, so let me just give you the recommendation and the structure falls out of it.”

**To work on 2**

*Before*

When pressed, the candidate gave a recognizable profit tree and prioritized the fare branch with reasons. However, the route and external/competitive branches were missing until the interviewer pushed, and were then treated as refinements rather than real buckets.

> “Fair point in principle — a network average could hide mix.”
> “That's a cause behind the fare move rather than a new branch.”
> “revenue is seats times load factor times fare times flights; costs are fuel, labor, maintenance, airport fees, and fixed overhead.”
> “Fare is the live branch.”

*After*

*When the interviewer asked for the full set of drivers, you said "revenue is seats times load factor times fare times flights; costs are fuel, labor, maintenance, airport fees, and fixed overhead" and "Fare is the live branch."*

Once pressed, you gave a recognizable profit tree and gave reasons for focusing on fare. The route and external/competitive branches only appeared after the interviewer pushed, and were then treated as refinements ("That's a cause behind the fare move rather than a new branch.") rather than real buckets. In this case the cause sat exactly in the route and competitor areas, so leaving them out of the structure risks missing the real answer.

**Next time, try including a route-level cut and an external-changes bucket (competitors, demand) as full parts of your structure from the start.**

> “Fair point in principle — a network average could hide mix.”

**Missed moment 1**

*Before*

Turn 3, when the interviewer asked for a structure before giving any data.

A great answer: “The CEO wants to know what caused a $24M swing and how to get back to profit in 12 months. I'd look at four areas. (1) Revenue by route: passengers (seats × load factor) times revenue per passenger (fare + extras). (2) Variable cost per flight: fuel, crew, maintenance, fees. (3) Fixed costs: leases, hub, overhead. (4) External changes: competitor entry, demand, fuel. Revenue and profit both fell $24M with full planes, so I'd start with fare by route and check for a new competitor on specific routes.”

*After*

*Early in the analysis, the interviewer asked for your full approach before sharing any data, and you replied "Honestly, I think the answer's already visible, so let me just give you the recommendation and the structure falls out of it."*

This was the moment to show a complete structure covering revenue by route, costs and outside changes, then say where you would start. A clear structure at this point earns trust and points you toward the right data early.

Next time, try something like: “The CEO wants to know what caused a $24M swing and how to get back to profit in 12 months. I'd look at four areas. (1) Revenue by route: passengers (seats × load factor) times revenue per passenger (fare + extras). (2) Variable cost per flight: fuel, crew, maintenance, fees. (3) Fixed costs: leases, hub, overhead. (4) External changes: competitor entry, demand, fuel. Revenue and profit both fell $24M with full planes, so I'd start with fare by route and check for a new competitor on specific routes.”

### Quantitative & Analytical Rigor — adequate (unchanged)

**Strength 1**

*Before*

The candidate stress-tested the new-route case at the first-year load factor and stated what the result meant for the 12-month goal.

> “At 60%: 48 passengers × $200 = $9,600 revenue, less $9,200 = $400 contribution per flight, × 5,000 = $2.0M.”
> “So we land roughly at breakeven in the first 12 months, not at $7.8M.”

*After*

*On the new-route exhibit, after the interviewer said first-year load factor is often around 60%, you worked out "At 60%: 48 passengers × $200 = $9,600 revenue, less $9,200 = $400 contribution per flight, × 5,000 = $2.0M."*

You re-ran the new-route numbers at the first-year load factor and spelled out what that meant for the 12-month goal: "So we land roughly at breakeven in the first 12 months, not at $7.8M." Interviewers value candidates who test their own numbers against realistic conditions and tie the result back to the client's goal.

**Keep re-running key numbers under the realistic case and stating plainly what the result means for the objective.**

**To work on 1**

*Before*

The Port Avery breakeven fare was overstated: $11,000 ÷ 60 = $183 is total revenue per passenger, so the breakeven fare is $183 − $20 extras = $163. The candidate fixed this only after the interviewer probed.

> “Port Avery needs $183, they're at $160.”

*After*

*On the Lakeport exhibit, while comparing breakeven fares, you said "Port Avery needs $183, they're at $160."*

The $183 figure ($11,000 ÷ 60) is total revenue needed per passenger, so the breakeven fare is $183 − $20 extras = $163. The correction came only after the interviewer asked how you got it. Calculation slips on a key number can lead to the wrong conclusion and cost credibility unless you catch them yourself.

**Next time, try pausing after each result to check what it measures (total revenue versus fare) before using it.**

**To work on 2**

*Before*

Later in the case, the candidate set up per-flight economics before computing, narrated each step, and reconciled results back to the exhibit totals. Early on, though, the candidate asserted a fare increase and a profit outcome without deriving either.

> “Larkspur needs to raise fares roughly 12–15% to recover the $24 million gap”
> “That gets you from negative $4 million to positive $15–20 million.”
> “Port Avery: 80 seats at 75% is 60 passengers. FY23 revenue per flight is 60 × ($240 + $20) = $15,600, less $11,000 variable, so contribution of $4,600.”
> “Times 3,000 flights, that's roughly negative $0.54M — matches the negative $0.6M in the exhibit. Good, that reconciles.”

*After*

*Early in the analysis, you said "Larkspur needs to raise fares roughly 12–15% to recover the $24 million gap" and "That gets you from negative $4 million to positive $15–20 million."*

Later in the case your maths was strong: you set up per-flight economics before computing, talked through each step, and checked results against the exhibit totals ("Good, that reconciles."). Early on, though, the fare increase and profit outcome were stated without being worked out. Unsupported numbers make an interviewer question whether your later figures can be trusted.

**Next time, try showing the short calculation behind any figure you put forward, even early in the case.**

> “Port Avery: 80 seats at 75% is 60 passengers. FY23 revenue per flight is 60 × ($240 + $20) = $15,600, less $11,000 variable, so contribution of $4,600.”
> “Times 3,000 flights, that's roughly negative $0.54M — matches the negative $0.6M in the exhibit. Good, that reconciles.”

**To work on 3**

*Before*

The 3% uplift was applied to total revenue on the four routes, which includes extras, and assumed no volume loss. The fare-only uplift is somewhat smaller.

> “A 3% fare increase there is roughly $3.8M of near-pure contribution”

*After*

*In the brainstorm on first-year profitability, you said "A 3% fare increase there is roughly $3.8M of near-pure contribution".*

The 3% was applied to total revenue on the four routes, which includes extras, and assumed no passengers would be lost. A fare-only increase would be somewhat smaller. Overstating a lever's size can make a plan look safer than it is.

**Next time, try applying a price change only to the fare part of revenue and noting what volume loss would do to it.**

**Missed moment 1**

*Before*

Turn 13, sizing Port Avery's breakeven.

A great answer: “Breakeven revenue per passenger is $11,000 ÷ 60 = $183. Take off $20 of extras and the breakeven fare is $163. At $160 they're $3 short — about $180 a flight, or roughly $0.5–0.6M a year across 3,000 flights, which matches the exhibit.”

*After*

*When the interviewer gave the Port Avery figures, you worked out per-flight contribution correctly and then said "breakeven fare is about $183 before extras."*

This was the moment to separate the revenue needed per passenger from the fare by taking the extras out. Getting breakeven right the first time shows the route is only slightly below breakeven, which shapes the recommendation.

Next time, try something like: “Breakeven revenue per passenger is $11,000 ÷ 60 = $183. Take off $20 of extras and the breakeven fare is $163. At $160 they're $3 short — about $180 a flight, or roughly $0.5–0.6M a year across 3,000 flights, which matches the exhibit.”

### Data & Exhibit Interpretation — strong (unchanged)

**Strength 1**

*Before*

The candidate read the route exhibit systematically: the flat routes first, then the two routes that account for exactly $24M.

> “Four routes are flat — Cedar Bluff up $0.4M, Granite Falls down $0.2M, Millbrook down $0.2M, Westhaven flat.”
> “That's $24.0M — the entire swing, exactly.”

*After*

*On the route results exhibit, you started with "Four routes are flat — Cedar Bluff up $0.4M, Granite Falls down $0.2M, Millbrook down $0.2M, Westhaven flat."*

You read the exhibit in an orderly way: the flat routes first, then the two routes that add up to exactly $24M ("That's $24.0M — the entire swing, exactly."). Interviewers look for candidates who quickly isolate where a problem sits and confirm it adds up.

**Keep reading exhibits in that order: set aside what is stable, then size what moved and tie it to the total.**

**Strength 2**

*Before*

The candidate spotted that the best routes collapsed with the same ~$80 fare cut and inferred a competitor. Yet the implication drawn from the exhibit still pointed to raising fares on those contested routes, despite that hypothesis.

> “The highest-margin routes collapsed, which smells like someone entered those two markets specifically and Larkspur matched fare down.”
> “Do we know who entered these two routes and what they're charging?”
> “Push fare back up on Lakeport and Port Avery, unbundle extras”

*After*

*On the route results exhibit, you said "The highest-margin routes collapsed, which smells like someone entered those two markets specifically and Larkspur matched fare down."*

You spotted that the best routes collapsed with the same ~$80 fare cut and inferred a competitor, then asked "Do we know who entered these two routes and what they're charging?" Yet the conclusion you drew still pointed to raising fares on those contested routes ("Push fare back up on Lakeport and Port Avery, unbundle extras"). Spotting a pattern in the data is valuable, and it carries more weight when the conclusion follows from it.

**Keep looking for patterns that point to a cause, and let that cause shape the action you recommend.**

**Strength 3**

*Before*

On the new-route exhibit, the candidate flagged that the case depends on the load-factor assumption before being told about the ramp-up.

> “The whole case rests on that ramp assumption.”

*After*

*On the new-route exhibit, you said "The whole case rests on that ramp assumption."*

You flagged that the new-route case depends on the load-factor assumption before the interviewer mentioned the ramp-up. Naming the assumption a plan hinges on, unprompted, shows mature judgment about data.

**Keep identifying the single assumption that drives the result before you are asked.**

**Missed moment 1**

*Before*

Turn 15, right after isolating the two routes and suspecting a new entrant.

A great answer: “If a competitor entered and Larkspur matched, raising fares back will likely lose passengers. So before choosing a lever, I'd check who entered, their cost position, and what the aircraft could earn elsewhere.”

*After*

*On the route results exhibit, right after you isolated the two routes and said it "smells like someone entered those two markets specifically", you went on to "Push fare back up on Lakeport and Port Avery".*

This was the moment to follow your competitor idea through to what it means for raising fares. Linking a suspected cause to its effect on your lever prevents recommending something the market will punish.

Next time, try something like: “If a competitor entered and Larkspur matched, raising fares back will likely lose passengers. So before choosing a lever, I'd check who entered, their cost position, and what the aircraft could earn elsewhere.”

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

The candidate raised risks and practical mitigations: phasing the exit, stage-gating on booking curves, and pricing where there is no competitor.

> “I'd phase the Port Avery exit — it's only $0.6M negative — as a hedge, and stage-gate the launch on booking curves at 90 days.”
> “that's the one place pricing power actually exists.”

*After*

*In your final recommendation, you said "I'd phase the Port Avery exit — it's only $0.6M negative — as a hedge, and stage-gate the launch on booking curves at 90 days."*

You raised risks and practical ways to reduce them: phasing the exit, gating the launch on booking curves, and pricing where there is no competitor ("that's the one place pricing power actually exists."). Clients trust recommendations that come with realistic ways to limit the downside.

**Keep pairing each risk with a concrete, practical step to manage it.**

**To work on 1**

*Before*

Once given the competitor data, the candidate correctly judged the fare war unwinnable and tested it with a breakeven load factor. Before that, the candidate held onto raising fares on contested routes for most of the analysis, even after suspecting a competitor had matched, and dropped the idea only when directly challenged.

> “So, as I've been saying: price is the lever.”
> “Push fare back up on Lakeport and Port Avery, unbundle extras”
> “So Larkspur would need to retain about two-thirds of its traffic at a 67% price premium.”
> “The LCC is 30% lower cost — Larkspur can't win a price war it structurally loses.”

*After*

*On the Lakeport exhibit, after noting the fare cuts looked like matching a competitor, you said "So, as I've been saying: price is the lever."*

Once given the competitor data, you rightly judged the fare war unwinnable and tested it with a breakeven load factor ("The LCC is 30% lower cost — Larkspur can't win a price war it structurally loses."). Before that, raising fares on the contested routes stayed in the plan for most of the analysis, even after you suspected a competitor had matched, and was dropped only when directly challenged. Interviewers want to see you update your view as soon as your own evidence points elsewhere, not only when pushed.

**Next time, try asking what a new piece of evidence does to your current recommendation the moment you notice it.**

> “Push fare back up on Lakeport and Port Avery, unbundle extras”
> “So Larkspur would need to retain about two-thirds of its traffic at a 67% price premium.”

**To work on 2**

*Before*

The opening plan was a blanket fare increase across all six routes, with no regard for competitive response.

> “raise base fares across all six routes, phased over two quarters so you don't shock demand.”

*After*

*Early in the analysis, your plan began "raise base fares across all six routes, phased over two quarters so you don't shock demand."*

The opening plan was a blanket fare increase on all six routes, with no regard for how competitors would respond. Pricing moves that ignore competitors are a common red flag for business sense in interviews.

**Next time, try asking how competitors would react before recommending any price change.**

**Missed moment 1**

*Before*

Turn 17, after noting both fare cuts were about $80 and looked like matching a competitor.

A great answer: “If Larkspur is matching a competitor, raising fares will cost passengers. The real question is whether Larkspur has a cost or product advantage on these routes. If it doesn't, the aircraft should go somewhere they aren't fighting a lower-cost rival.”

*After*

*On the Lakeport exhibit, after noting both fare cuts were "roughly $80 off the fare" and "that looks like matching a specific competitor fare", you concluded "price is the lever."*

This was the moment to ask whether Larkspur could win on these routes at all. Turning that observation into a strategic question would have led you to the right answer before being challenged.

Next time, try something like: “If Larkspur is matching a competitor, raising fares will cost passengers. The real question is whether Larkspur has a cost or product advantage on these routes. If it doesn't, the aircraft should go somewhere they aren't fighting a lower-cost rival.”

### Creativity & Brainstorming — adequate (unchanged)

**Strength 1**

*Before*

Some ideas were non-obvious: keeping a loss-making route flying as a bridge during the ramp-up, and segmenting peak business frequencies.

> “keep it flying a few more months while Ashford and Brookhaven ramp, so we're not carrying 5,000 immature flights at once.”
> “hold a smaller number of peak business frequencies at higher fare.”

*After*

*In the brainstorm, you suggested Port Avery "keep it flying a few more months while Ashford and Brookhaven ramp, so we're not carrying 5,000 immature flights at once."*

Some of your ideas were non-obvious: keeping a loss-making route flying as a bridge during the ramp-up, and keeping "a smaller number of peak business frequencies at higher fare." Ideas that go beyond the obvious levers make you stand out.

**Keep looking for creative options like bridging and segmenting alongside the standard ones.**

> “hold a smaller number of peak business frequencies at higher fare.”

**To work on 1**

*Before*

The candidate offered several distinct levers and ranked them explicitly by confidence. But they came as a flat numbered list with no organizing buckets, leaned on revenue, and included no cost-side or fleet ideas.

> “Second, extras. $20 per passenger is low; bags and seat selection on the four safe routes could add a few dollars a head.”
> “A few levers, roughly in order of how much I trust them.”

*After*

*In the brainstorm on first-year profitability, you opened with "A few levers, roughly in order of how much I trust them."*

You offered several distinct levers and ranked them clearly by confidence. They came as a flat numbered list without grouping, leaned on revenue, and included no cost-side or fleet ideas. Grouping ideas shows you have covered the full range and makes gaps such as costs easy to spot.

**Next time, try sorting ideas into a few groups such as revenue, cost and fleet before listing them.**

> “Second, extras. $20 per passenger is low; bags and seat selection on the four safe routes could add a few dollars a head.”

**Missed moment 1**

*Before*

Turn 27, asked what else could secure first-year profitability.

A great answer: “I'd group ideas into three buckets. (1) Revenue on uncontested routes: fares, extras, schedule. (2) Cost: overhead, fees, sub-leasing spare aircraft time. (3) Transition risk: phasing exits, launch promotions, partnerships to feed the new routes. Then I'd rank them by speed and size.”

*After*

*In the brainstorm, when asked what else could secure first-year profit, you listed levers starting with "First, the four protected routes."*

This was the moment to organize ideas into groups that include costs and the transition. A grouped list shows breadth and makes it easier to rank ideas by speed and size.

Next time, try something like: “I'd group ideas into three buckets. (1) Revenue on uncontested routes: fares, extras, schedule. (2) Cost: overhead, fees, sub-leasing spare aircraft time. (3) Transition risk: phasing exits, launch promotions, partnerships to feed the new routes. Then I'd rank them by speed and size.”

### Synthesis & Recommendation — strong (unchanged)

**Strength 1**

*Before*

The candidate led with a clear recommendation backed by quantified reasons. However, the headline said 'exit' outright while the follow-up said not to cut either route until booking evidence arrives; the phased exit belongs in the headline itself.

> “Recommendation: exit Hub–Lakeport and Hub–Port Avery, redeploy those 5,000 flights to Ashford and Brookhaven, and raise fares on the four protected routes.”
> “The entire $24M swing sits on those two routes — $9.6M and $14.4M, exactly $24M — and it's all fare, not load factor or cost.”
> “Don't cut Lakeport or Port Avery until we see the booking curve on the new routes”

*After*

*For the final recommendation, you opened with "Recommendation: exit Hub–Lakeport and Hub–Port Avery, redeploy those 5,000 flights to Ashford and Brookhaven, and raise fares on the four protected routes."*

You led with a clear recommendation backed by numbers ("$9.6M and $14.4M, exactly $24M"). However, the headline said exit outright, while the follow-up said "Don't cut Lakeport or Port Avery until we see the booking curve on the new routes"; the phased exit belongs in the headline itself. A clear, quantified opening is what clients want, and it needs to match what you say next.

**Keep leading with a numbered-up recommendation, and make sure the headline already includes any phasing.**

> “The entire $24M swing sits on those two routes — $9.6M and $14.4M, exactly $24M — and it's all fare, not load factor or cost.”

**Strength 2**

*Before*

The candidate named the key risk with a hedge, then gave sequenced next steps.

> “Biggest risk: the new routes are unproven.”
> “So: price test now, new-route sales immediately, exits sequenced behind the booking evidence, Lakeport first since it's the worse of the two.”

*After*

*In the closing questions, you said "Biggest risk: the new routes are unproven."*

You named the key risk with a hedge, then gave next steps in order: "price test now, new-route sales immediately, exits sequenced behind the booking evidence, Lakeport first since it's the worse of the two." A clear risk and an ordered action plan make a recommendation feel ready to act on.

**Keep closing with the main risk, a hedge, and next steps in a clear order.**

> “So: price test now, new-route sales immediately, exits sequenced behind the booking evidence, Lakeport first since it's the worse of the two.”

**Missed moment 1**

*Before*

Turn 29, the final recommendation.

A great answer: “Recommendation: redeploy the Lakeport and Port Avery flying to Ashford and Brookhaven, phased — Lakeport first — while lifting fares about 3% on the four uncontested routes to cover the year-one ramp.”

*After*

*For the final recommendation, you opened with "Recommendation: exit Hub–Lakeport and Hub–Port Avery".*

This was the moment to fold the phasing into the headline so it matched your later advice. A headline that already reflects the plan avoids seeming to contradict yourself.

Next time, try something like: “Recommendation: redeploy the Lakeport and Port Avery flying to Ashford and Brookhaven, phased — Lakeport first — while lifting fares about 3% on the four uncontested routes to cover the year-one ramp.”

### Communication & Delivery — adequate (unchanged)

**Strength 1**

*Before*

Later answers were well signposted and numbered.

> “First, the four protected routes.”

*After*

*In your later answers, such as the levers list, you began with "First, the four protected routes."*

Your later answers were clearly announced and numbered. Numbered, clearly announced points make it easy for an interviewer to follow you.

**Keep numbering your points and telling the listener where you are going.**

**To work on 1**

*Before*

Early on, the tone was dismissive of the interviewer's structuring prompts, and the candidate repeated the same position rather than listening.

> “If you want it organized, fine”
> “But I'd note we've now spent several rounds on structure and I don't think the shape of the answer is going to move.”

*After*

*When the interviewer asked how you would organize the drivers, you said "If you want it organized, fine".*

Early on, the tone came across as dismissive of the interviewer's requests for a structure, and the same position was repeated rather than heard ("But I'd note we've now spent several rounds on structure and I don't think the shape of the answer is going to move."). Interviewers also assess how you would come across with clients, and dismissiveness is a strong negative.

**Next time, try acknowledging the request and answering it fully before restating your view.**

**To work on 2**

*Before*

The candidate was answer-first and hypothesis-led, often stating expectations before seeing data. At the opening, though, the candidate gave conclusions before laying out any structure.

> “The structure is basically implied by that: revenue levers, cost levers, and the fare is the one that moves.”
> “let me say upfront what I expect it to show, so we can test me.”

*After*

*Early in the analysis, you said "The structure is basically implied by that: revenue levers, cost levers, and the fare is the one that moves."*

You led with your answer and your expectations, often saying what you expected before seeing data ("let me say upfront what I expect it to show, so we can test me."). At the opening, though, conclusions came before any structure. Leading with the answer is valued, but only once the interviewer has seen how you got there.

**Next time, try laying out the structure briefly first, then stating your expected answer.**

**Missed moment 1**

*Before*

Turn 5, after the interviewer redirected to drivers rather than fixes.

A great answer: “Fair — let me lay out the full tree first and then tell you where I'd start, so we don't anchor too early.”

*After*

*When the interviewer redirected you to drivers rather than fixes, you replied "I hear you, but I'd push back a little — I don't think we're missing much."*

This was the moment to accept the redirect and show the full picture before narrowing. Accepting a redirect gracefully shows you listen and keeps the interviewer on your side.

Next time, try something like: “Fair — let me lay out the full tree first and then tell you where I'd start, so we don't anchor too early.”

### Pushback, Composure & Case Leadership — adequate (unchanged)

**Strength 1**

*Before*

When probed on the Port Avery figure, the candidate owned the error and corrected it cleanly.

> “Let me redo it, because I think I was sloppy.”

*After*

*When the interviewer asked how you calculated the Port Avery figure, you said "Let me redo it, because I think I was sloppy."*

You owned the error and corrected it cleanly. Calmly owning and fixing a mistake builds more trust than defending it.

**Keep owning errors openly and walking through the corrected calculation.**

**Strength 2**

*Before*

The candidate drove the case by repeatedly asking for relevant data.

> “Do we know who entered these two routes and what they're charging?”

*After*

*On the Lakeport exhibit, you asked "Do we know who entered these two routes and what they're charging?"*

You drove the case by repeatedly asking for relevant data. Asking for the right data shows you are leading the case, not just reacting.

**Keep asking targeted questions for the data that would settle your open questions.**

**To work on 1**

*Before*

When challenged on fares, the candidate updated with explicit quantitative reasoning rather than simply giving in. Earlier, however, the candidate defended a premature recommendation through several structure prompts and only partly took that feedback on board.

> “I hear you, but I'd push back a little — I don't think we're missing much.”
> “But the recommendation doesn't change — raise fares, unbundle ancillaries, hold capacity.”
> “Lakeport breakeven at $200 fare plus $20 extras: $9,000 ÷ $220 = 41 passengers, so 51% load factor.”
> “So I'll concede the blanket fare increase doesn't work on these two routes.”

*After*

*When the interviewer asked for the full set of drivers, you said "I hear you, but I'd push back a little — I don't think we're missing much."*

When challenged on fares, you updated using clear numbers ("Lakeport breakeven at $200 fare plus $20 extras: $9,000 ÷ $220 = 41 passengers, so 51% load factor.") rather than simply giving in. Earlier, though, the early recommendation was defended through several structure prompts ("But the recommendation doesn't change — raise fares, unbundle ancillaries, hold capacity.") and that feedback was only partly taken on board. Interviewers repeat a prompt to signal something is missing, and resisting it costs you the hint.

**Next time, try treating a repeated prompt as a cue to step back and widen your answer.**

> “So I'll concede the blanket fare increase doesn't work on these two routes.”

**Missed moment 1**

*Before*

Turn 6, when the interviewer noted that network averages can hide route problems.

A great answer: “Good point — that could change the lever, not just where I aim it. If the fall is concentrated on a few routes, I need to know why before assuming price is the fix.”

*After*

*When the interviewer noted that a network average can hide route problems, you replied "I'd say that's a refinement of the same answer, not a different one."*

This was the moment to accept that a route-level problem could change the fix itself. Taking the challenge seriously here would have opened up the competitor explanation much earlier.

Next time, try something like: “Good point — that could change the lever, not just where I aim it. If the fall is concentrated on a few routes, I need to know why before assuming price is the fix.”

**Top improvement** (unchanged): Diagnose before you prescribe. Open with a tailored, route-level profit tree that includes an external/competition bucket, and treat 'price is the lever' as a hypothesis to test, not a conclusion to defend. Your early 'raise fares 12–15%' anchor survived even your own competitor inference until the interviewer forced the issue.

---

## 95e5d00b — Quillpath SaaS Starter Plan Pricing (pricing-001)

Mode: the stored report (scored 2026-10-27), plain-words pass only. Overall: adequate → adequate.

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 38 of 38 |
| Rewrites that passed the tone audit | 32 of 32 |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 1 → 0 |
| "you did not / never / failed / could not", before → after | 0 → 0 |

### Problem Structuring — needs work (unchanged)

**To work on 1**

*Before*

The candidate skipped structuring and opened with a recommendation built on cost inflation and click-price assumptions that no case data supported.

> “Honestly, I think I can already give you my answer, and the structure will fall out of it.”
> “Software businesses like this have seen input costs climb hard: cloud hosting, payment processing on the "get paid" feature, and most of all paid acquisition”

*After*

*In the opening, when the interviewer asked you to lay out the full structure before any data, you said "Honestly, I think I can already give you my answer, and the structure will fall out of it."*

The answer skipped the structure and went straight to a recommendation built on cost inflation and click prices, as in "Software businesses like this have seen input costs climb hard: cloud hosting, payment processing on the "get paid" feature, and most of all paid acquisition". No case data supported those assumptions. Interviewers want to see how you will find the answer before you give one, and a recommendation resting on unsupported assumptions is hard to trust.

**Next time, try laying out three or four areas you would examine before offering any answer, and keep your instinct as a hunch to test.**

**To work on 2**

*Before*

The candidate initially ranked the plan interaction as second-order, which treated the plans as independent even though that is where the answer actually sat, and the four buckets came only after two prompts and had no sub-points. Once pressed, the candidate accepted that the Pro interaction mattered and raised it to a co-equal bucket, with a reason tied to the $60 price gap.

> “And I'd test the first two first, because that's literally the 3x ratio the board cares about. Three and four are second-order.”
> “Fair challenge — if Starter is pulling customers who would otherwise have paid $100, that's a $60 hole per switcher, and it could be big enough to swamp the Starter unit economics entirely. So I'll upgrade it from second-order to co-equal with the other two.”

*After*

*In the opening, when asked for the main areas and which to test first, you said "Three and four are second-order", putting the interaction with Pro behind value and acquisition cost.*

Ranking the interaction with Pro as second-order treated the two plans as independent, even though that is where the answer actually sat, and the four areas came only after two prompts and had no sub-points. Once pressed, you accepted the Pro interaction mattered and raised it to co-equal, with a reason tied to the $60 price gap: "that's a $60 hole per switcher". In a pricing case with two plans, how they affect each other is often the heart of the answer, so ranking it low early can steer the whole analysis off course.

**Next time, try asking how each new option affects the existing business before ranking your areas, and give each area two or three sub-points.**

> “And I'd test the first two first, because that's literally the 3x ratio the board cares about. Three and four are second-order.”
> “Fair challenge — if Starter is pulling customers who would otherwise have paid $100, that's a $60 hole per switcher, and it could be big enough to swamp the Starter unit economics entirely. So I'll upgrade it from second-order to co-equal with the other two.”

**To work on 3**

*Before*

The candidate claimed the decision didn't depend on the analysis. That cuts the link between the structure and the choice it is meant to inform.

> “But I'd note that whichever way those numbers land, the action is the same.”

*After*

*In the opening, after listing your four areas, you said "But I'd note that whichever way those numbers land, the action is the same."*

This claimed the decision did not depend on the analysis, which cuts the link between your structure and the choice it is meant to inform. A structure is only useful if its results could change what you recommend; otherwise the interviewer sees it as decoration.

**Next time, try stating for each area what result would push you towards keeping, repricing or shutting the plan.**

**Missed moment 1**

*Before*

Turn 2, when the interviewer asked for the full structure before any data was shared.

A great answer: “The goal is to maximize total value from the plan line, not just to pass a ratio. I'd look at four things. First, standalone economics by plan: margin, churn, CAC, then LTV/CAC. Second, interactions: Starter customers upgrading to Pro, which helps, and Starter taking Pro sign-ups, which hurts. Third, options: keep at $40, reprice, change features, or shut down. Fourth, the market: competitor entry prices and what small businesses will pay. I'd start with the interactions, because a plan can fail 3x on its own and still be worth keeping if it feeds Pro.”

*After*

*In the opening, the interviewer asked for the full structure before sharing any data: the main areas and how they fit together.*

This was the moment to set out a goal, a few distinct areas and a starting point, rather than a recommendation. A clear opening structure shows the interviewer how you will reach the answer and gives you a map to return to as data arrives.

Next time, try something like: “The goal is to maximize total value from the plan line, not just to pass a ratio. I'd look at four things. First, standalone economics by plan: margin, churn, CAC, then LTV/CAC. Second, interactions: Starter customers upgrading to Pro, which helps, and Starter taking Pro sign-ups, which hurts. Third, options: keep at $40, reprice, change features, or shut down. Fourth, the market: competitor entry prices and what small businesses will pay. I'd start with the interactions, because a plan can fail 3x on its own and still be worth keeping if it feeds Pro.”

### Quantitative & Analytical Rigor — adequate (unchanged)

**Strength 1**

*Before*

The price-test valuation was set up and computed correctly: about $2.08M a month at $40 versus $2.32M at $60, a gain of roughly $240k a month.

> “At $40: Starter 1,000 × $1,100 net = $1,100k. Pro 350 × ($4,000 − $1,200) = $980k. Total ≈ $2,080k.”
> “So $60 is worth about $240k a month more, roughly $2.9m a year”

*After*

*Reading the price-test exhibit, you valued both price points, starting with "At $40: Starter 1,000 × $1,100 net = $1,100k. Pro 350 × ($4,000 − $1,200) = $980k. Total ≈ $2,080k."*

The valuation was set up and computed correctly: about $2.08M a month at $40 versus $2.32M at $60, a gain of roughly $240k a month, which you described as "So $60 is worth about $240k a month more, roughly $2.9m a year". Turning a test result into a total monthly value across both plans is exactly what lets a client compare options.

**Keep valuing every option on the same full basis, both plans included, before comparing them.**

**Strength 2**

*Before*

The candidate built an accurate churn breakeven for the $60 price and stated what it means for the decision.

> “If upgrades held at 20% ($800), standalone would need to be $700 — $50/0.0714, a 7.1% cancellation rate. So churn could worsen from 5% to about 7% before $60 stops winning.”

*After*

*When asked what would happen if $60 buyers churned more and upgraded less, you said "So churn could worsen from 5% to about 7% before $60 stops winning."*

You built an accurate churn breakeven for the $60 price and stated what it means for the decision. A breakeven tells the client how much can go wrong before the recommendation flips, which makes risk concrete.

**Keep working out the breakeven on your key risk and saying plainly what it means for the decision.**

> “If upgrades held at 20% ($800), standalone would need to be $700 — $50/0.0714, a 7.1% cancellation rate. So churn could worsen from 5% to about 7% before $60 stops winning.”

**To work on 1**

*Before*

The candidate questioned the approximation behind the 4.2% figure and bracketed the result instead of defending a single point. Even so, several conceptual errors went uncaught until the interviewer flagged them. LTV was first built on price ($100/0.02 = $5,000) rather than margin. Starter churn was taken as the 7.4% total exit rate, and later as 4.2%, rather than the 5% read directly from month-1 cancellations. Correct figures: Starter $30 ÷ 5% = $600, plus $800 of upgrade value, gives $1,400 (4.7×).

> “LTV ≈ $100/0.02 = $5,000 against $1,200 CAC — about 4.2x.”
> “Using the total exit rate of 7.4%/month, $30 / 0.074 ≈ $405 of standalone Starter value.”
> “cancellations and upgrades are competing exits from the same pool, so treating 60% as a clean "survival" curve isn't quite right”

*After*

*Across the exhibit discussion, from "LTV ≈ $100/0.02 = $5,000 against $1,200 CAC — about 4.2x" to "Using the total exit rate of 7.4%/month, $30 / 0.074 ≈ $405 of standalone Starter value."*

You questioned the approximation behind the 4.2% figure and bracketed the result, noting "cancellations and upgrades are competing exits from the same pool", but several conceptual errors stood until the interviewer flagged them: lifetime value was first built on price ($100/0.02 = $5,000) rather than margin, and Starter churn was taken as the 7.4% total exit rate, then 4.2%, rather than the 5% read directly from month-1 cancellations. The correct figures are Starter $30 ÷ 5% = $600, plus $800 of upgrade value, giving $1,400 (4.7×). Errors in the core definitions carry through every later number, and needing the interviewer to catch them weakens confidence in your analysis.

**Next time, try checking two things before any lifetime value: are you using margin, and does your churn rate count only customers who actually leave.**

> “cancellations and upgrades are competing exits from the same pool, so treating 60% as a clean "survival" curve isn't quite right”

**To work on 2**

*Before*

The cannibalization sizing used the wrong $905 net figure and needed an interviewer correction to reach $1,100.

> “the blended per-sign-up value is $1,205 less $300 CAC = $905 net”

*After*

*Reading the new-customers exhibit, you said "the blended per-sign-up value is $1,205 less $300 CAC = $905 net".*

The cannibalization sizing used the wrong $905 net figure, and it took an interviewer correction to reach $1,100. When a sizing rests on an earlier flawed figure, the conclusion may hold but the numbers presented to a client are wrong.

**Next time, try re-checking the inputs you carry forward before using them in a new calculation.**

**To work on 3**

*Before*

The upgrade threshold given in the final answer was imprecise. With churn unchanged, $60 keeps winning until upgrades fall below 12.5% ($1,000 + u × $4,000 = $1,500), not 15%.

> “but a drop in upgrades below 15% would hurt more”

*After*

*In your final recommendation, you said "but a drop in upgrades below 15% would hurt more".*

The upgrade threshold was imprecise: with churn unchanged, $60 keeps winning until upgrades fall below 12.5% ($1,000 + u × $4,000 = $1,500), not 15%. Thresholds in a final recommendation are what the client will monitor, so they need to be right.

**Next time, try writing out the one-line breakeven equation for each risk before quoting its threshold.**

**Missed moment 1**

*Before*

Turn 11, reading the Starter cohort status table.

A great answer: “Month 1 shows 5% cancelled and 1% upgraded, and cancellations are steady. So Starter churn is 5%, not the 6% total exit — upgraders don't leave. Using margin, LTV is $30 ÷ 5% = $600, plus 20% × $4,000 = $800 of upgrade value, so $1,400 on a $300 CAC, or 4.7×.”

*After*

*When you first read the Starter cohort status table, alongside the acquisition costs of $1,200 for Pro and $300 for Starter.*

The month-1 row held a direct read of the cancellation rate, which could have anchored a correct margin-based lifetime value from the start. Reading the right rate off the exhibit first time avoids a chain of corrections later in the case.

Next time, try something like: “Month 1 shows 5% cancelled and 1% upgraded, and cancellations are steady. So Starter churn is 5%, not the 6% total exit — upgraders don't leave. Using margin, LTV is $30 ÷ 5% = $600, plus 20% × $4,000 = $800 of upgrade value, so $1,400 on a $300 CAC, or 4.7×.”

### Data & Exhibit Interpretation — adequate (unchanged)

**Strength 1**

*Before*

From the cohort exhibit, the candidate saw that the 20% who upgrade are what the CFO's standalone test leaves out.

> “So the CFO is undercounting upgrades, and I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap.”

*After*

*Reading the cohort exhibit, you said "So the CFO is undercounting upgrades, and I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap."*

You saw that the 20% who upgrade are what the CFO's standalone test leaves out. Spotting what an existing analysis misses is often the key insight that resolves a disagreement between executives.

**Keep asking what a client's current test leaves out when you read an exhibit.**

**Strength 2**

*Before*

On the volume exhibit, the candidate set the 150 lost Pro sign-ups against the 200 upgrades a month and drew a clear so-what.

> “But 20% of 1,000 Starters, 200 a month, upgrade to Pro. So Pro intake is actually higher than before, and those 200 cost $300 rather than $1,200 to land.”

*After*

*When the interviewer gave new-customer volumes before and after launch, you said "But 20% of 1,000 Starters, 200 a month, upgrade to Pro. So Pro intake is actually higher than before, and those 200 cost $300 rather than $1,200 to land."*

You set the 150 lost Pro sign-ups against the 200 upgrades a month and drew a clear conclusion. Netting a loss against an offsetting gain turns raw volumes into a point the client can act on.

**Keep putting gains and losses side by side and stating what they mean together.**

**Strength 3**

*Before*

The candidate proposed a relevant next question on how many Starter customers were trading down from Pro.

> “Do we have any sense of what share of Starter sign-ups are genuinely new versus Pro leads trading down?”

*After*

*Reading the plan-economics exhibit, you asked "Do we have any sense of what share of Starter sign-ups are genuinely new versus Pro leads trading down?"*

You proposed a relevant next question on how many Starter customers were trading down from Pro. Asking for the data that would settle the biggest open question shows you are steering the case.

**Keep naming the specific data that would resolve your biggest uncertainty.**

**To work on 1**

*Before*

The candidate misread the Starter cohort, treating the drop in 'still on Starter' as churn, even though upgraders didn't leave and month-1 cancellations were simply 5%.

> “Starter: only 40% still on Starter at 12 months, so 0.4^(1/12) ≈ 0.926, about 7.4% leaving per month.”

*After*

*Reading the Starter cohort exhibit, you said "Starter: only 40% still on Starter at 12 months, so 0.4^(1/12) ≈ 0.926, about 7.4% leaving per month."*

The drop in customers still on Starter was treated as churn, even though upgraders did not leave and month-1 cancellations were simply 5%. Misreading what a table's rows measure leads to wrong numbers that look precise.

**Next time, try reading each row's label and the first month's figures before doing any calculation.**

**To work on 2**

*Before*

The economics exhibit was waved through as confirmation rather than read on its own terms, and its definition of lifetime was then applied with a compounding shortcut that gave 4.2%.

> “This confirms the numbers I just ran, so no change to the conclusion”

*After*

*When shown the plan-economics exhibit, you opened with "This confirms the numbers I just ran, so no change to the conclusion".*

The exhibit was treated as confirmation rather than read on its own terms, and its definition of lifetime was then applied with a compounding shortcut that gave 4.2%. Each new exhibit is usually shared to add or correct something, so skimming it as confirmation risks missing the point.

**Next time, try stating what is new or different in each exhibit before relating it to your earlier numbers.**

**Missed moment 1**

*Before*

Turn 25, reading the price-test exhibit.

A great answer: “At $60, Starter sign-ups fall by 200 but Pro rises by 50, so some trade-downs come back. That fits the $20 gap, and $60 is still well under Pro. The catch is that eight weeks can't show churn or upgrade rates. Next, I'd work out the churn and upgrade levels at which $60 stops beating $40.”

*After*

*Reading the eight-week Starter price-test exhibit, after the interviewer gave Starter net value at $40 as about $1,100.*

Before valuing both prices, there was room to describe what the shifts in sign-ups by plan showed and what the test could not show. Describing what an exhibit shows and its limits first makes the following calculation easier to follow and trust.

Next time, try something like: “At $60, Starter sign-ups fall by 200 but Pro rises by 50, so some trade-downs come back. That fits the $20 gap, and $60 is still well under Pro. The catch is that eight weeks can't show churn or upgrade rates. Next, I'd work out the churn and upgrade levels at which $60 stops beating $40.”

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

The rollout plan was practical: new customers only, existing Starter customers grandfathered, and results tracked by cohort.

> “roll $60 to new customers only, grandfather existing Starters, and track month-3 and month-6 cancellation and upgrade rates before touching the base.”

*After*

*In your recommendation, you proposed to "roll $60 to new customers only, grandfather existing Starters, and track month-3 and month-6 cancellation and upgrade rates before touching the base."*

The rollout plan was practical: new customers only, existing Starter customers grandfathered, and results tracked by cohort. A low-risk rollout makes a recommendation easier for a CEO to approve.

**Keep pairing recommendations with a staged, low-risk way to put them into practice.**

**Strength 2**

*Before*

The candidate set explicit monitoring thresholds and a rollback trigger, which mitigates the main risk.

> “If it's under $1,200 by month six, I'd roll back to the mid-forties rather than hold.”

*After*

*When asked how you would know it was working six months in, you said "If it's under $1,200 by month six, I'd roll back to the mid-forties rather than hold."*

You set explicit monitoring thresholds and a rollback trigger, which mitigates the main risk. A clear trigger to reverse course shows the client the downside is controlled.

**Keep attaching specific thresholds and a fallback to your recommendations.**

**To work on 1**

*Before*

The opening recommendation rested on invented cost-inflation and price-elasticity assumptions that the case never supported.

> “So the $40 price point was set against an older cost base and no longer covers it.”
> “If you can triple volume with a $60 price cut, you almost certainly didn't need to cut all the way to $40”

*After*

*In the opening, you said "So the $40 price point was set against an older cost base and no longer covers it" and "If you can triple volume with a $60 price cut, you almost certainly didn't need to cut all the way to $40".*

The opening recommendation rested on invented cost-inflation and price-elasticity assumptions that the case never supported. Assumptions presented as facts can lead the whole case in the wrong direction and undermine trust.

**Next time, try labelling an early idea as a hunch and naming the data that would confirm or reject it.**

**To work on 2**

*Before*

The recommended price moved from $55 to $60 between consecutive turns without any explanation of what changed.

> “So: still recommend moving up, but to $55 rather than $60”
> “Recommendation: keep Starter, and raise the price to $60.”

*After*

*After the stress test you said "So: still recommend moving up, but to $55 rather than $60", and in your final answer "Recommendation: keep Starter, and raise the price to $60."*

The recommended price moved from $55 to $60 between consecutive answers without any explanation of what changed. Unexplained shifts in the headline number make the recommendation look unstable.

**Next time, try saying explicitly why you are changing a number whenever your recommendation moves.**

**Missed moment 1**

*Before*

Turn 3, asked for a structure, the candidate instead asserted a cost-inflation story.

A great answer: “My working hypothesis is that Starter may fail 3x on its own but create value through upgrades. I'll hold off recommending until I see the economics and the interaction with Pro.”

*After*

*In the opening, when the interviewer asked for a structure, the answer instead set out a cost-inflation story.*

This was a chance to frame an initial view as a hunch to be tested and hold off on a firm recommendation. Framing an early view as provisional keeps you open to the data and shows sound judgment.

Next time, try something like: “My working hypothesis is that Starter may fail 3x on its own but create value through upgrades. I'll hold off recommending until I see the economics and the interaction with Pro.”

### Creativity & Brainstorming — not assessed (unchanged)

*This case had no brainstorm stage, and the few options the candidate offered elsewhere are too thin to rate creativity — this reflects session design, not a candidate failing.*

### Synthesis & Recommendation — strong (unchanged)

**Strength 1**

*Before*

The final answer led with the recommendation and gave three reasons, each tied to the analysis.

> “Recommendation: keep Starter, and raise the price to $60.”
> “Two, Starter is the better Pro acquisition channel: 200 upgrades a month more than replace the 150 cannibalized Pro sign-ups, at a quarter of the cost.”

*After*

*In your final recommendation, you opened with "Recommendation: keep Starter, and raise the price to $60." and gave reasons such as "Two, Starter is the better Pro acquisition channel: 200 upgrades a month more than replace the 150 cannibalized Pro sign-ups, at a quarter of the cost."*

The final answer led with the recommendation and gave three reasons, each tied to the analysis. Leading with the answer and backing it with analysis is exactly how a CEO wants to hear a recommendation.

**Keep leading with the answer and giving a few reasons, each linked to a number you worked out.**

**Strength 2**

*Before*

The answer named the key risk with a quantified threshold, plus concrete next steps, but two figures were imprecise. The upgrade threshold should be 12.5%, not 15%. The ratio also mixed net and gross: $1,100 is the net value, and 4.7× is $1,400 ÷ $300.

> “My math says churn can drift from 5% to about 7% before $60 stops winning”
> “$1,100 net value per sign-up on a $300 CAC, about 4.7x”

*After*

*In your final recommendation, you said "My math says churn can drift from 5% to about 7% before $60 stops winning" and "$1,100 net value per sign-up on a $300 CAC, about 4.7x".*

The answer named the key risk with a quantified threshold, plus concrete next steps, but two figures were imprecise: the upgrade threshold should be 12.5%, not 15%, and the ratio mixed net and gross, since $1,100 is the net value and 4.7× is $1,400 ÷ $300. A quantified risk and clear next steps make a recommendation actionable, as long as the numbers are consistent.

**Keep naming the key risk with a threshold and next steps, and check that each figure uses the same basis.**

**Missed moment 1**

*Before*

Turn 29, closing the recommendation.

A great answer: “Starter is worth $1,400 per sign-up against a $300 CAC, or 4.7×. Netting cannibalization, a month of sign-ups is worth $2.08M with Starter versus $1.40M with Pro only. At $60 it rises to $2.32M, and that holds unless churn passes about 7% or upgrades fall below 12.5%.”

*After*

*Closing your final recommendation, after the interviewer shared that Pro marketing was unchanged and that most would-be Pro buyers chose Starter to save money.*

The close could have pulled the total value across both plans into a few consistent headline figures with the conditions under which they hold. A tight closing with consistent numbers is what the CEO will remember and repeat.

Next time, try something like: “Starter is worth $1,400 per sign-up against a $300 CAC, or 4.7×. Netting cannibalization, a month of sign-ups is worth $2.08M with Starter versus $1.40M with Pro only. At $60 it rises to $2.32M, and that holds unless churn passes about 7% or upgrades fall below 12.5%.”

### Communication & Delivery — adequate (unchanged)

**Strength 1**

*Before*

Later turns were answer-first and well signposted, with numbered points.

> “Four things. One, month-3 and month-6 cancellation for the $60 cohort versus the 5% monthly baseline”

*After*

*When asked how you would know the change was working, you said "Four things. One, month-3 and month-6 cancellation for the $60 cohort versus the 5% monthly baseline".*

Later answers led with the answer and were clearly laid out with numbered points. Numbered points let the interviewer follow and take notes easily.

**Keep announcing how many points you have and numbering them as you go.**

**Strength 2**

*Before*

The candidate picked up the interviewer's margin cue and reframed cleanly.

> “Right — "worth" should be gross margin, not revenue.”

*After*

*When the interviewer asked whether the board's rule measures worth by price or margin, you said "Right — "worth" should be gross margin, not revenue."*

You picked up the interviewer's margin cue and reframed cleanly. Taking a cue quickly and adjusting shows you are listening and keeps the case moving.

**Keep acknowledging a cue directly and adjusting your approach in the same answer.**

**To work on 1**

*Before*

In the opening, the candidate brushed off repeated requests for a structure, which made the early turns hard to follow and confrontational.

> “That's the recommendation. The areas to check are just the pieces of it — price, cost, retention.”

*After*

*In the opening, when asked for the full structure, you said "That's the recommendation. The areas to check are just the pieces of it — price, cost, retention."*

Repeated requests for a structure were brushed off, which made the early answers hard to follow and confrontational. When an interviewer asks twice for something, setting it aside makes the conversation tense and harder to follow.

**Next time, try giving exactly what was asked first, then adding your view afterwards if useful.**

**To work on 2**

*Before*

The candidate repeated the price-raise conclusion at the end of almost every turn, even when it wasn't the question asked.

> “So the conclusion doesn't turn on the precision. Keep Starter — and raise price.”

*After*

*When asked only for the steps behind the 4.2% figure, you ended with "So the conclusion doesn't turn on the precision. Keep Starter — and raise price."*

The price-raise conclusion was repeated at the end of almost every answer, even when it was not the question asked. Repeating the conclusion can come across as anchoring and crowds out the answer to the actual question.

**Next time, try ending each answer on the point the interviewer asked about and saving the recommendation for when it is requested.**

**Missed moment 1**

*Before*

Turn 2, when the interviewer asked for the main areas and how they fit together.

A great answer: “I'll lay out four areas, say how they connect to the CEO's decision, and then tell you where I'd start and why.”

*After*

*In the opening, when the interviewer asked for the main areas you would look at and how they fit together.*

A short preview of how you would lay out your answer would have shown the interviewer exactly what was coming. A brief roadmap at the start makes everything that follows easier to follow.

Next time, try something like: “I'll lay out four areas, say how they connect to the CEO's decision, and then tell you where I'd start and why.”

### Pushback, Composure & Case Leadership — adequate (unchanged)

**Strength 1**

*Before*

The candidate incorporated the interviewer's 5% correction and used it to drive a quantified stress test.

> “Taking 5% as the cancellation rate: Starter standalone at $40 is $30/0.05 = $600, plus $800 upgrade = $1,400, less $300 = $1,100 net.”

*After*

*When the interviewer said Starter's monthly cancellation rate is about 5%, you said "Taking 5% as the cancellation rate: Starter standalone at $40 is $30/0.05 = $600, plus $800 upgrade = $1,400, less $300 = $1,100 net."*

You incorporated the 5% correction and used it to drive a quantified stress test. Absorbing a correction smoothly and building on it shows composure and keeps the analysis moving.

**Keep taking corrections on board straight away and using them to sharpen your analysis.**

**To work on 1**

*Before*

The candidate was initially defensive when challenged on structure and anchored on a conclusion reached before seeing any data. Later, when the evidence warranted it, the candidate updated with stated reasoning, dropping the cost-inflation thesis and switching to margin.

> “Fair, but I'd push back a little — I don't think I'm missing a structure”
> “Which is the recommendation I've been making since the start, now with evidence behind it.”
> “I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap.”

*After*

*When challenged on structure you said "Fair, but I'd push back a little — I don't think I'm missing a structure", and later "Which is the recommendation I've been making since the start, now with evidence behind it."*

The early response to the structure challenge was defensive and anchored on a conclusion reached before seeing any data. Later, when the evidence warranted it, you updated with stated reasoning, dropping the cost-inflation view with "I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap" and switching to margin. Holding on to an early conclusion under challenge can look like you are defending a position rather than following the evidence.

**Next time, try treating a challenge as a prompt to revisit your approach and say what evidence would change your mind.**

**Missed moment 1**

*Before*

Turn 6, when the interviewer said the recommendation rested on unevidenced cost inflation and elasticity.

A great answer: “That's fair — I got ahead of the data. Let me set the hypothesis aside, lay out the areas properly, and test it against the numbers.”

*After*

*In the opening, when the interviewer said the recommendation rested on cost inflation and price elasticity you had not evidenced.*

This was the moment to acknowledge the point briefly and reset to laying out the areas properly. A quick, gracious reset under challenge shows composure and wins back the interviewer's confidence.

Next time, try something like: “That's fair — I got ahead of the data. Let me set the hypothesis aside, lay out the areas properly, and test it against the numbers.”

**Top improvement** (unchanged): Before giving any answer, build a structure that doesn't presuppose one: name the goal (total value created), put plan interactions — upgrades and cannibalization — up front as the likely crux, and let the data drive the recommendation instead of opening with an unevidenced hypothesis and defending it.

---

## aae091ff — Brew & Bean Profitability (prof-001)

Mode: the stored report (scored 2026-10-29), plain-words pass only. Overall: needs work → needs work.

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 38 of 38 |
| Rewrites that passed the tone audit | 32 of 33 — refused: pushback.missedOpportunities.0 (figure dropped: 24%) |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 8 → 0 |
| "you did not / never / failed / could not", before → after | 3 → 1 |

### Problem Structuring — needs work (unchanged)

**To work on 1**

*Before*

You anchored the opening on the profit equation with revenue and cost branches, a relevant starting point, but the framework stayed generic and left out volume on the revenue side until the interviewer prompted you twice.

> “which includes price and, you know, potentially, our mix of products as well as cost, which is, like, fixed and variable cost”
> “I think potentially the, um, the units sold”
> “you know, because profit equals revenue minus costs.”

*After*

*In the opening, when asked how you would approach the profit decline, you said "you know, because profit equals revenue minus costs."*

Building the opening on the profit equation, with a revenue branch and a cost branch, was a relevant start. The framework stayed generic, though, and volume on the revenue side only came in as "the units sold" after the interviewer had prompted you twice. Interviewers want an opening structure that fits the specific client and covers every driver before they have to ask for it.

**Next time, try breaking revenue into volume, price and mix from the start, and name the cost lines a coffee chain actually has.**

> “which includes price and, you know, potentially, our mix of products as well as cost, which is, like, fixed and variable cost”
> “I think potentially the, um, the units sold”

**To work on 2**

*Before*

On the MECE pressure test you called your own structure messy but did not fix it or say what was missing, so the interviewer had to lead you through the gaps.

> “Yeah. I think it's messy.”

*After*

*In the follow-up on your opening structure, when the interviewer asked whether it had no gaps or overlaps and what was missing, you said "Yeah. I think it's messy."*

You called your own structure messy, but the answer stopped there without fixing it or naming what was missing, so the interviewer had to lead you through the gaps. When an interviewer challenges your structure, they want to see you repair it on the spot, not just agree that it has problems.

**Next time, try naming the specific gap and restating the corrected structure in one or two sentences.**

**To work on 3**

*Before*

When asked to prioritize, you picked cost first with a reason tied to the case facts, but you did not prioritize until prompted. The cost branch also stayed at fixed vs. variable rather than a coffee chain's real cost lines (COGS, labor, rent/overhead) until the interviewer pushed.

> “I'd like to look at, um, like, fixed and variable cost.”
> “I would like to check cost first because revenue has been increasing.”

*After*

*In the follow-up on your opening structure, when asked which area to check first, you said "I would like to check cost first because revenue has been increasing."*

Choosing cost first was backed by a reason tied to the case facts, but that choice only came once you were prompted. The cost branch also stayed at "fixed and variable cost" rather than a coffee chain's real cost lines (COGS, labor, rent/overhead) until the interviewer pushed. Interviewers look for you to say where you would start, and why, without being asked, and to break costs into lines that match the business.

**Next time, try ending your opening by saying which branch you would check first and listing the client's actual cost lines.**

> “I'd like to look at, um, like, fixed and variable cost.”

**Missed moment 1**

*Before*

Turn 1, the opening framework for a margin that fell from 24% to 6% while revenue grew 15%.

A great answer: “Our goal is to find why margin fell 18 points despite 15% revenue growth and how to restore it. Profit is revenue minus cost. Revenue is volume times price, plus mix. Costs split into COGS (beans, dairy, packaging, food), labor, and rent/overhead. Since revenue grew, my hypothesis is that costs outpaced pricing, so I'd start with each cost line as a percentage of revenue and then check whether we raised prices and whether competitors face the same input inflation.”

*After*

*In the opening, the interviewer described a margin that fell from 24% to 6% while revenue grew 15%, and asked how you would approach it.*

Your framework split profit into revenue and cost, but it stayed generic and did not state a starting guess about where to look first. A strong opening that fits the client and states a likely cause sets the direction for the whole case.

Next time, try something like: “Our goal is to find why margin fell 18 points despite 15% revenue growth and how to restore it. Profit is revenue minus cost. Revenue is volume times price, plus mix. Costs split into COGS (beans, dairy, packaging, food), labor, and rent/overhead. Since revenue grew, my hypothesis is that costs outpaced pricing, so I'd start with each cost line as a percentage of revenue and then check whether we raised prices and whether competitors face the same input inflation.”

**Missed moment 2**

*Before*

Turn 2, when asked "Is that structure MECE, and what's missing from it?"

A great answer: “Not quite. Fixed vs. variable overlaps with how I'd actually look at the P&L, and I left out volume. Let me restate it: revenue = volume × price × mix, and costs = COGS, labor, overhead. I'd prioritize costs and pricing, since revenue is growing but margin collapsed.”

*After*

*In the follow-up on your opening structure, the interviewer asked whether your structure had no gaps or overlaps and what was missing from it.*

Your answer, "Yeah. I think it's messy.", agreed with the concern but left out what was missing and how you would fix the structure. This is a chance to show you can repair your own framework calmly and pick a priority.

Next time, try something like: “Not quite. Fixed vs. variable overlaps with how I'd actually look at the P&L, and I left out volume. Let me restate it: revenue = volume × price × mix, and costs = COGS, labor, overhead. I'd prioritize costs and pricing, since revenue is growing but margin collapsed.”

### Quantitative & Analytical Rigor — needs work (unchanged)

**To work on 1**

*Before*

You asserted a 10% price increase without deriving it and could not explain it when asked.

> “Yeah. Ten percent.”
> “I'm not sure.”

*After*

*In the questions after your recommendation, when the interviewer asked how a margin can fall, you replied "Yeah. Ten percent."*

You stated a 10% price increase without working it out, and when asked how you got it, you could not explain it. Earlier, a question about testing the cost explanation got the reply "I'm not sure." In a real interview, a number with no reasoning behind it carries no weight and quickly erodes the interviewer's confidence.

**Next time, try writing down the calculation step by step before you say any number out loud.**

**To work on 2**

*Before*

You claimed the 10% increase restores the margin without doing any arithmetic. In fact, costs are 94% of revenue today (58 + 22 + 14), so a 10% price rise brings them to 94/110 ≈ 85.5% of revenue, a margin of about 14.5%, not back near 24%.

> “Yes. It does.”

*After*

*In the questions after your recommendation, when asked how much a 10% price rise would lift the margin and whether that gets the client back, you said "Yes. It does."*

You said the 10% increase restores the margin, but there was no arithmetic behind it. Costs are 94% of revenue today (58 + 22 + 14), so a 10% price rise brings them to 94/110 ≈ 85.5% of revenue, a margin of about 14.5%, not back near 24%. Interviewers check whether your recommendation actually solves the problem, and a quick calculation shows this.

**Next time, try dividing today's costs by the new revenue to check the margin before you answer yes or no.**

**To work on 3**

*Before*

Your revised figure was conceptually wrong. Input costs rising ~40% does not mean prices must rise ~50%. To restore a 24% margin with costs at 94% of today's revenue, revenue must rise to 94/0.76 ≈ 123.7, a price increase of about 23.7%, assuming volume and costs hold.

> “Oh, actually, it should be about fifty percent because their cost have increased by about forty percent.”

*After*

*In the questions after your recommendation, when asked what costs become as a share of revenue after a 10% price rise, you said "Oh, actually, it should be about fifty percent because their cost have increased by about forty percent."*

The revised figure rested on a wrong idea: input costs rising ~40% does not mean prices must rise ~50%. To restore a 24% margin with costs at 94% of today's revenue, revenue must rise to 94/0.76 ≈ 123.7, a price increase of about 23.7%, assuming volume and costs hold. Getting the logic behind a calculation wrong, even when you get roughly the right size, leads to a recommendation the client cannot rely on.

**Next time, try setting the target margin first, then working out the revenue needed to cover today's costs at that margin.**

**Missed moment 1**

*Before*

Turns 42–44, when the interviewer asked you to work out the gap using the 24% and 6% margins.

A great answer: “Costs are 58 + 22 + 14 = 94% of revenue today, which leaves a 6% margin. To get back to 24%, costs must be 76% of revenue, so revenue needs to be 94 / 0.76 ≈ 1.237 times today's level. That's roughly a 24% price increase if volume and costs hold. That's too much to take in one go, so I'd pair a targeted price rise with procurement savings.”

*After*

*In the questions after your recommendation, the interviewer asked you to work out the gap the price increase needed to close, then pointed you to the 24% and 6% margins.*

Your answers were "I'm not sure." and "Temper", so the calculation was left unworked. Sizing the gap is what turns a direction into a recommendation the CEO can act on.

Next time, try something like: “Costs are 58 + 22 + 14 = 94% of revenue today, which leaves a 6% margin. To get back to 24%, costs must be 76% of revenue, so revenue needs to be 94 / 0.76 ≈ 1.237 times today's level. That's roughly a 24% price increase if volume and costs hold. That's too much to take in one go, so I'd pair a targeted price rise with procurement savings.”

**Missed moment 2**

*Before*

Turn 20, after learning beans are 25% of COGS.

A great answer: “COGS was 42% of revenue, so beans were about 10.5 points and other inputs about 31.5 points. Beans up 40% adds about 4.2 points. Other inputs up 37.5% add about 11.8 points. That's roughly 16 points total, which matches the COGS jump from 42% to 58%. So non-bean inputs drive about three-quarters of the increase.”

*After*

*In the exhibit discussion, the interviewer told you coffee beans were 25% of COGS two years ago and asked what the two input increases meant.*

Your answer reached the right direction, that other inputs matter more, but it stopped short of turning the percentages into margin points. Turning the split into points shows exactly how much each input contributes.

Next time, try something like: “COGS was 42% of revenue, so beans were about 10.5 points and other inputs about 31.5 points. Beans up 40% adds about 4.2 points. Other inputs up 37.5% add about 11.8 points. That's roughly 16 points total, which matches the COGS jump from 42% to 58%. So non-bean inputs drive about three-quarters of the increase.”

### Data & Exhibit Interpretation — adequate (unchanged)

**Strength 1**

*Before*

You went inside COGS, asked for the composition data needed to size each input, and reached the right directional conclusion that non-bean inputs matter more.

> “I'd like to see, uh, what percentage, um, these particular line line items, uh, make up.”
> “And the other input costs make up a much larger portion. And so I think the the problem more so lies in with the increase in the input costs of the dairy packaging and food.”

*After*

*In the exhibit discussion, when asked what you would need to size the COGS increase, you said "I'd like to see, uh, what percentage, um, these particular line line items, uh, make up."*

You looked inside COGS, asked for the breakdown needed to size each input, and reached the right directional conclusion: "the problem more so lies in with the increase in the input costs of the dairy packaging and food." Asking for the right breakdown is how you find the real driver rather than stopping at the headline number.

**Keep asking for the breakdown of a cost line before you decide which part of it is driving the problem.**

> “And the other input costs make up a much larger portion. And so I think the the problem more so lies in with the increase in the input costs of the dairy packaging and food.”

**To work on 1**

*Before*

You read the exhibit line by line and correctly isolated COGS as the main driver, with labor flat and overhead up slightly, but you described it only qualitatively. You never quantified that COGS accounted for 16 of the 18 lost points (42% to 58%) and overhead for 2 (12% to 14%).

> “main issue is COGS, which has dramatically increased”
> “So I see our labor has stayed steady. I see overhead has been slightly increasing over time. However, main issue is COGS, which has dramatically increased and which makes up a large portion of the problem with profit.”

*After*

*In the exhibit discussion, when asked which cost line to focus on, you said "So I see our labor has stayed steady. I see overhead has been slightly increasing over time. However, main issue is COGS, which has dramatically increased".*

You read the exhibit line by line and correctly picked out COGS as the main driver, with labor flat and overhead up slightly, but the description stayed in words only. The answer left out that COGS accounted for 16 of the 18 lost points (42% to 58%) and overhead for 2 (12% to 14%). Putting numbers on each line shows the interviewer how much of the problem you have explained.

**Next time, try stating the change in each cost line in percentage points and checking that they add up to the total drop.**

> “So I see our labor has stayed steady. I see overhead has been slightly increasing over time. However, main issue is COGS, which has dramatically increased and which makes up a large portion of the problem with profit.”

**Missed moment 1**

*Before*

Turn 22, when asked how to test whether the cost increase fully explains the margin drop.

A great answer: “The cost lines add up exactly: COGS +16 points and overhead +2 equals the 18-point drop, so costs explain it in a mechanical sense. The real question is why revenue didn't keep pace. Revenue grew 15% while inputs rose ~38%, so I'd want to know whether we changed menu prices and whether volume or mix shifted.”

*After*

*In the exhibit discussion, the interviewer asked how you would test whether the cost increase fully explains the margin drop and what revenue data you would want.*

Your answer was "I'm not sure.", which left both the check on the cost lines and the revenue question open. Adding up the cost lines and turning to pricing is the step that uncovers the real root cause.

Next time, try something like: “The cost lines add up exactly: COGS +16 points and overhead +2 equals the 18-point drop, so costs explain it in a mechanical sense. The real question is why revenue didn't keep pace. Revenue grew 15% while inputs rose ~38%, so I'd want to know whether we changed menu prices and whether volume or mix shifted.”

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

Your levers were practical and commercially sound: price selectively on less elastic products and secure better supply contracts.

> “on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts.”

*After*

*In the brainstorm, when asked for ideas to reverse the decline, you suggested to "take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts."*

Both levers were practical and commercially sound: price selectively where customers are less sensitive, and secure better supply terms. Interviewers value ideas a real client could act on, not just a long list.

**Keep proposing levers that are specific about where and how the client would act.**

> “on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts.”

**To work on 1**

*Before*

You framed the root cause as purely a cost problem even after learning menu prices had not moved in two years. The insight that flat pricing against ~38% input inflation is half the story was not drawn out.

> “Because no change in price... in many pricing has occurred, essentially, the problem really is with the cost that we've experienced cost increases.”

*After*

*At the end of the exhibit discussion, after hearing menu prices had not changed in two years, you said "Because no change in price... in many pricing has occurred, essentially, the problem really is with the cost that we've experienced cost increases."*

The root cause was framed as purely a cost problem even after you learned prices were flat. The point that flat pricing against ~38% input inflation is half the story was not drawn out. The insight interviewers look for is the one that changes what the client should do, here that prices never caught up with costs.

**Next time, try comparing how much prices moved against how much costs moved and naming the gap as the cause.**

**To work on 2**

*Before*

Your assumption that a slight price increase would be enough was not realistic. Closing the gap requires roughly a 24% price increase, or a combination of pricing and procurement.

> “And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much.”

*After*

*In the recommendation, when asked which lever to lead with, you said "And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much."*

The assumption that a slight price increase would be enough was not realistic. Closing the gap needs roughly a 24% price increase, or a mix of pricing and procurement. A recommendation that underestimates what is needed would leave the client well short of its target.

**Next time, try checking the size of the gap before describing how big the fix needs to be.**

**To work on 3**

*Before*

You named a realistic risk (volume loss) and a sensible mitigation (test which products can carry a premium), but only once the interviewer asked. No risks were raised proactively.

> “I think the biggest risk is that we'll lose volume if we take price on the wrong type of product.”

*After*

*In the questions after your recommendation, when asked about the biggest risk, you said "I think the biggest risk is that we'll lose volume if we take price on the wrong type of product."*

The risk you named, volume loss, was realistic and the fix, testing which products can carry a premium, was sensible, but both came only once the interviewer asked. No risks came up before that. Raising risks yourself shows the interviewer you are thinking like someone advising the CEO.

**Next time, try ending your recommendation with the main risk and how you would reduce it, before being asked.**

**Missed moment 1**

*Before*

Turn 29, after hearing menu prices were unchanged for two years.

A great answer: “So the root cause is that input costs rose roughly 38% and we passed none of it through to prices. That points to a pricing and procurement fix rather than cutting labor or overhead, which are already flat or lean. I'd also check whether competitors raised prices, since that tells us how much pricing power we have.”

*After*

*At the end of the exhibit discussion, the interviewer told you menu prices had been unchanged for two years and asked what that meant for the root cause.*

Your answer pointed back to costs alone and left out that none of the cost increase had been passed on to prices. This was the moment to name the real root cause and point to the right fix.

Next time, try something like: “So the root cause is that input costs rose roughly 38% and we passed none of it through to prices. That points to a pricing and procurement fix rather than cutting labor or overhead, which are already flat or lean. I'd also check whether competitors raised prices, since that tells us how much pricing power we have.”

### Creativity & Brainstorming — adequate (unchanged)

**Strength 1**

*Before*

You loosely organized your ideas into a price side and a cost side.

> “on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts.”

*After*

*In the brainstorm, when asked for a few distinct ideas, you said "on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts."*

You loosely grouped your ideas into a price side and a cost side. Grouping ideas helps the interviewer follow your thinking and see that you are covering different areas.

**Keep sorting your ideas into clear groups as you list them.**

**Strength 2**

*Before*

When pushed for more levers, you added a distinct mix-shift idea.

> “Maybe we could advertise our products that have higher margin to begin with, so we force consumers to trade up.”

*After*

*In the brainstorm, when pushed for levers beyond price and supplier terms, you said "Maybe we could advertise our products that have higher margin to begin with, so we force consumers to trade up."*

When asked for more, you added a separate idea: shifting the sales mix toward higher-margin items. Being able to come up with a genuinely new idea when pushed shows range in your thinking.

**Keep adding new types of levers when the interviewer asks for more, rather than repeating earlier ones.**

**Missed moment 1**

*Before*

Turn 32, when asked for levers beyond price and supplier terms.

A great answer: “I'll think across product, operations, and customer. On product: trim low-margin SKUs, adjust portion and cup sizes, and launch a value blend for budget-sensitive stores. On operations: cut waste in dairy and food, and switch packaging specs. On customer: a loyalty program that nudges people toward higher-margin specialty drinks. I'd prioritize pricing plus procurement first because they hit the biggest gap fastest.”

*After*

*In the brainstorm, the interviewer asked what other levers, beyond price and supplier terms, the client could pull.*

You added one idea, the mix shift, without grouping your thinking into areas to find more. A few clear groups help you produce a wider set of ideas and then pick a priority.

Next time, try something like: “I'll think across product, operations, and customer. On product: trim low-margin SKUs, adjust portion and cup sizes, and launch a value blend for budget-sensitive stores. On operations: cut waste in dairy and food, and switch packaging specs. On customer: a loyalty program that nudges people toward higher-margin specialty drinks. I'd prioritize pricing plus procurement first because they hit the biggest gap fastest.”

### Synthesis & Recommendation — adequate (unchanged)

**Strength 1**

*Before*

You named the key risk and a next step to mitigate it.

> “And so I would do an analysis where I would try to see which products people would pay a premium for.”

*After*

*In the questions after your recommendation, when asked about risk and mitigation, you said "And so I would do an analysis where I would try to see which products people would pay a premium for."*

You named the key risk and a next step to reduce it. Pairing a risk with a concrete next step makes a recommendation feel ready for action.

**Keep pairing each risk you name with a specific analysis or action to address it.**

**To work on 1**

*Before*

You committed to a clear recommendation, price increases, tied to the finding that prices had been flat, but the support was vague and unquantified. It did not reference the 16-point COGS rise, the ~38% input inflation, or how much price is needed.

> “And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much.”
> “I would choose... so, like, the price increases, we haven't increased our price in quite a while.”

*After*

*In the recommendation, when asked which lever to put in front of the CEO, you said "I would choose... so, like, the price increases, we haven't increased our price in quite a while."*

You committed to a clear recommendation, price increases, linked to the finding that prices had been flat, but the support was vague and had no numbers. It left out the 16-point COGS rise, the ~38% input inflation and how much price is needed. A CEO is persuaded by a recommendation backed by the key figures from the analysis.

**Next time, try backing your recommendation with two or three figures from the case, including how large the change needs to be.**

> “And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much.”

**To work on 2**

*Before*

You could not size the recommendation, even after a Level 2 narrowing hint. The interviewer had to lead, and your answers were unsupported claims rather than a defensible number.

> “I would see what the gap is and try to see, you know, if we can make it up for it with the price increase.”
> “Yes. It does.”

*After*

*In the questions after your recommendation, when asked which figures you would compare to size the price increase, you said "I would see what the gap is and try to see, you know, if we can make it up for it with the price increase."*

The recommendation stayed unsized even after the interviewer narrowed the question. The interviewer had to lead, and answers such as "Yes. It does." were claims rather than a number you could defend. Interviewers expect you to put a defensible size on your recommendation, since that is what the client acts on.

**Next time, try starting from the margin figures you already have and talking through each step of the calculation out loud.**

**Missed moment 1**

*Before*

Turn 34, when asked which lever to put in front of the CEO first.

A great answer: “I'd recommend selective price increases on specialty drinks, paired with procurement across beans, dairy, and packaging. Three reasons. First, COGS drove 16 of the 18 lost margin points. Second, about three-quarters of that came from non-bean inputs. Third, menu prices haven't moved in two years while inputs rose ~38%. Restoring 24% fully would take ~24% on price alone, so I'd combine pricing with supplier savings. The key risk is volume loss, so next I'd test elasticity by SKU and check competitor pricing.”

*After*

*In the recommendation, the interviewer asked which of the levers you would put in front of the CEO first, and why.*

You chose price increases, but the reasons stayed general and did not draw on the figures from the case. A clear answer followed by numbered, evidence-based reasons is what a CEO expects to hear.

Next time, try something like: “I'd recommend selective price increases on specialty drinks, paired with procurement across beans, dairy, and packaging. Three reasons. First, COGS drove 16 of the 18 lost margin points. Second, about three-quarters of that came from non-bean inputs. Third, menu prices haven't moved in two years while inputs rose ~38%. Restoring 24% fully would take ~24% on price alone, so I'd combine pricing with supplier savings. The key risk is volume loss, so next I'd test elasticity by SKU and check competitor pricing.”

### Communication & Delivery — needs work (unchanged)

**Strength 1**

*Before*

At times you used hypothesis-driven phrasing to steer the case.

> “Um, I'm thinking that maybe it's not a revenue issue. It's more of a cost issue.”

*After*

*In the follow-up on your opening structure, when asked where to look first, you said "Um, I'm thinking that maybe it's not a revenue issue. It's more of a cost issue."*

At times you stated a working guess about the cause and used it to steer where the case went next. Stating a likely answer early gives the discussion direction and shows you are leading the case.

**Keep stating your working guess out loud and using it to decide what to look at next.**

**To work on 1**

*Before*

Many of your answers were fragmentary or non-answers, which made your reasoning hard to follow and forced the interviewer to re-ask repeatedly.

> “Yeah. Ten percent.”
> “Yes. It does.”

*After*

*In the questions after your recommendation, when asked how much the price rise would lift the margin, you replied "Yes. It does."*

Many answers were fragments or non-answers, such as "Yeah. Ten percent.", which made your reasoning hard to follow and led the interviewer to re-ask several times. Interviewers can only credit reasoning they can hear, so short replies hide whatever thinking you have done.

**Next time, try answering in full sentences that give your conclusion and the reason behind it.**

**To work on 2**

*Before*

Your delivery had heavy filler and little signposting beyond the opening, and you sometimes lost track of the question.

> “Well, I like to see, um, like, fixed cost that would be, like, overhead labor and then variable cost.”
> “Can you repeat the question?”

*After*

*In the follow-up on your opening structure, when asked how to break down the cost base, you said "Well, I like to see, um, like, fixed cost that would be, like, overhead labor and then variable cost."*

There was a lot of filler, and beyond the opening you rarely told the interviewer how your answer would be laid out. You also sometimes lost track of the question, as in "Can you repeat the question?" Clear, organised delivery makes you sound confident and makes it easy for the interviewer to follow.

**Next time, try pausing briefly, repeating the question back, and saying how many parts your answer has before you start.**

**Missed moment 1**

*Before*

Turn 23, when asked a two-part question about testing the cost explanation and revenue-side data.

A great answer: “Let me take that in two parts. First, to test whether costs explain the drop, I'd add up the cost-line changes against the 18-point decline. Second, on revenue, I'd want price changes, volume, and mix over the two years.”

*After*

*In the exhibit discussion, the interviewer asked a two-part question about testing the cost explanation and which revenue data you would want.*

Your answer was "I'm not sure.", so neither part of the question was addressed. Splitting a two-part question into its parts makes it easier to answer and to follow.

Next time, try something like: “Let me take that in two parts. First, to test whether costs explain the drop, I'd add up the cost-line changes against the 18-point decline. Second, on revenue, I'd want price changes, volume, and mix over the two years.”

### Pushback, Composure & Case Leadership — needs work (unchanged)

**To work on 1**

*Before*

On the structure pressure test you conceded without fixing anything, leaving the interviewer to lead.

> “Yeah. I think it's messy.”

*After*

*In the follow-up on your opening structure, when the interviewer challenged your structure, you said "Yeah. I think it's messy."*

You agreed with the challenge but left the structure unchanged, so the interviewer had to lead from there. How you respond to a challenge shows whether you can stay in charge of the case under pressure.

**Next time, try following any agreement with a quick fix, such as naming the missing piece and restating the structure.**

**To work on 2**

*Before*

At points you drove the analysis by asking for the data needed to size the cost drivers, but under challenge you turned passive. You defaulted to "not sure" and needed a Level 1 restatement and a Level 2 narrowing hint to move forward.

> “I'm not sure. I don't know. I think cost is a problem.”
> “I'd like to see, uh, what percentage, um, these particular line line items, uh, make up.”
> “What happened with prices?”

*After*

*In the exhibit discussion, when the interviewer repeated the question about testing the cost explanation, you said "I'm not sure. I don't know. I think cost is a problem."*

At points you drove the analysis by asking for the data to size the cost drivers, as in "I'd like to see, uh, what percentage, um, these particular line line items, uh, make up." Under challenge, though, you became passive and fell back on "not sure", so the interviewer had to repeat the question and then narrow it before you moved on. Interviewers watch how you handle being stuck, and talking through a partial idea keeps you leading the case.

**Next time, try saying out loud what you do know and one step you could take, instead of stopping at "not sure".**

> “What happened with prices?”

**To work on 3**

*Before*

When the interviewer probed your sizing, you flipped from 10% to 50% without reasoning that holds up, rather than working the numbers to defend or update the figure.

> “Oh, actually, it should be about fifty percent because their cost have increased by about forty percent.”

*After*

*In the questions after your recommendation, when the interviewer probed your sizing, you said "Oh, actually, it should be about fifty percent because their cost have increased by about forty percent."*

You switched from 10% to 50% with reasoning that does not hold up, instead of working the numbers to defend or update the figure. Changing a number without working it through suggests guessing, which weakens trust in all your figures.

**Next time, try redoing the calculation out loud when challenged, then either defending or updating your figure based on the result.**

**Missed moment 1**

*Before*

Turn 52, when the interviewer challenged whether a 10% price rise gets the client back near 24%.

A great answer: “Let me check. Costs are 94% of today's revenue. With a 10% price rise they become 94/110, about 85.5%, so margin is about 14.5%. That's better, but not back to 24%. I'd update: we'd need about 24% on price alone, so I'd combine roughly 10–12% targeted pricing with procurement savings to close the rest.”

*After*

*(kept in the old wording — the audit refused the rewrite: figure dropped: 24%)*

**Top improvement** (unchanged): Practice sizing the fix out loud from the P&L: write the equation first, compute, then sanity-check. Here, costs were 94% of revenue (58 + 22 + 14). A 10% price rise gives 94/110 ≈ 85.5% costs, or about a 14.5% margin. Restoring 24% needs 94/0.76 ≈ 1.237, about a 24% price increase. Your claims of "ten percent" and then "about fifty percent" both fail that check, and that is what turned a sound pricing recommendation into one you couldn't defend.

---

## 598645a0 — Brew & Bean Profitability (prof-001)

Mode: never scored — full scoring as a dry run (no DB write); "before" is its report before the plain-words pass. Overall: none (partial) → none (partial).

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 22 of 22 |
| Rewrites that passed the tone audit | 16 of 16 |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 2 → 0 |
| "you did not / never / failed / could not", before → after | 0 → 0 |

Passes that ran in this scoring (qa counters): judge; quote audit 0 stripped / 0 dropped; verifier 0 dropped; answer-key pass 0 removed, 0 re-rated; reconciliation 4 merged, 0 gap drops; mandate 0 added; strong gate 0 lowered; stage caps 0 not assessed, 0 caveated; floor 0; plain words 16 written, 0 refused.

### Problem Structuring — needs work (unchanged)

**To work on 1**

*Before*

Once prompted, the candidate laid out a recognizable profit tree (COGS, overhead and labor on one side, volume and money per transaction on the other), but jumped straight to an answer first, and the framework appeared only after the interviewer asked for it.

> “Yeah. I think the problem is COGS.”
> “the costs, which are split into COGS as well as overhead and the labor cost”
> “the profits are gonna be based on the volume and, um, the, uh, amount of money you're getting per transaction”

*After*

*In the opening, when the interviewer invited you to walk through how you would approach the case, you said "Yeah. I think the problem is COGS."*

Once the interviewer asked for a structure, you laid out a recognizable profit tree, with "COGS as well as overhead and the labor cost" on one side and volume and money per transaction on the other. But the answer came first, and the framework appeared only after the interviewer asked for it. Interviewers want to see how you organize a problem before you land on an answer, so leading with the structure shows your thinking is grounded.

**Next time, try laying out your profit tree first and only then naming which branch you suspect.**

> “the costs, which are split into COGS as well as overhead and the labor cost”
> “the profits are gonna be based on the volume and, um, the, uh, amount of money you're getting per transaction”

**To work on 2**

*Before*

The objective (restore margin from 6% toward 24% despite 15% revenue growth) was never restated, and the revenue branch was mislabeled as 'profits.'

> “And then on the other side, you would need to look at the profits.”

*After*

*In the opening, when asked how you would structure the problem, you said "And then on the other side, you would need to look at the profits."*

The goal of restoring margin from 6% toward 24% despite 15% revenue growth was not restated, and the branch covering volume and price, which is revenue, was labeled as profits. Restating the goal and naming branches correctly shows the interviewer you have understood the problem and keeps your tree logically sound.

**Next time, try opening with one sentence restating the objective, and label the two sides of your tree as revenue and costs.**

**To work on 3**

*Before*

When asked what was missing, the candidate declared the structure MECE, then vaguely conceded 'other costs.' Neither branch got tailored sub-points such as menu pricing, product mix or input categories.

> “Yes. I think that is, Macy.”
> “there are no other really big ones that I would need to cover”

*After*

*In the follow-up on your structure, when asked whether it had gaps or overlaps and what was missing, you said "Yes. I think that is, Macy." and "there are no other really big ones that I would need to cover".*

You stated the structure was complete, then loosely conceded there might be other costs. Neither branch was broken into sub-points specific to this client, such as menu pricing, product mix or input categories. Specific sub-points tailored to the client show the interviewer you can turn a generic framework into one that actually finds the problem.

**Next time, try adding two or three client-specific sub-points under each branch, such as menu pricing and product mix under revenue and input categories under COGS.**

**Missed moment 1**

*Before*

Opening response to the case prompt at turn 3, where the candidate said only "I think the problem is COGS."

A great answer: “Our goal is to explain why net margin fell from 24% to 6% while revenue grew 15%, and to reverse it. I'd use a profit tree. On revenue: volume (transactions per store, store count) and price (menu prices, mix, discounting). On costs: COGS (beans, dairy, food, packaging), labor, overhead and rent, and other. Since revenue is growing, my hypothesis is that costs grew faster than price, most likely COGS. I'd also check whether menu prices kept pace with input costs and whether competitors see the same squeeze.”

*After*

*In the opening, when the interviewer gave you time to ask questions or walk through your approach, you said only "I think the problem is COGS."*

The answer named a likely cause without stating the goal or laying out a structure to test it. The first answer sets the interviewer's impression of how you think, so a restated goal plus a clear structure makes a strong start.

Next time, try something like: “Our goal is to explain why net margin fell from 24% to 6% while revenue grew 15%, and to reverse it. I'd use a profit tree. On revenue: volume (transactions per store, store count) and price (menu prices, mix, discounting). On costs: COGS (beans, dairy, food, packaging), labor, overhead and rent, and other. Since revenue is growing, my hypothesis is that costs grew faster than price, most likely COGS. I'd also check whether menu prices kept pace with input costs and whether competitors see the same squeeze.”

**Missed moment 2**

*Before*

Interviewer asked at turn 6: "Is that MECE, and what's missing?"

A great answer: “Mostly, but I'd add an 'other costs' bucket, such as marketing, G&A and one-offs, and split price into list price versus mix and discounting. I'd prioritize the cost side, specifically each cost line as a % of revenue over the two years, because flat or rising revenue with collapsing margin points to costs outpacing price.”

*After*

*In the follow-up on your structure, when the interviewer asked whether it had gaps or overlaps, what was missing, and which branch you would look at first, you said "Yes. I think that is, Macy."*

This was a chance to name what was missing and explain your priority with a clear reason. When an interviewer asks what is missing, they usually expect you to find something, and naming it shows openness and rigor.

Next time, try something like: “Mostly, but I'd add an 'other costs' bucket, such as marketing, G&A and one-offs, and split price into list price versus mix and discounting. I'd prioritize the cost side, specifically each cost line as a % of revenue over the two years, because flat or rising revenue with collapsing margin points to costs outpacing price.”

### Quantitative & Analytical Rigor — not assessed (unchanged)

*The interview ended before any analysis or math stage was administered, so there is no evidence to rate quantitative rigor.*

### Data & Exhibit Interpretation — not assessed (unchanged)

*No exhibit or case data was shown before the interview ended, so exhibit interpretation could not be assessed.*

### Business Judgment & Insight — needs work (unchanged)

**To work on 1**

*Before*

The candidate reasoned that growing revenue alongside a shrinking margin points toward the cost side, which is a sensible first-cut elimination, but then ruled out the revenue side entirely, ignoring the possibility that prices failed to keep pace with costs.

> “That's probably not where the problem is going to be. So we need to look at the cost side.”
> “I know that it's not going to be on the, uh, revenue side of things as the revenue is increasing”

*After*

*In the follow-up on your structure, when asked what your COGS view was based on, you said "I know that it's not going to be on the, uh, revenue side of things as the revenue is increasing".*

Reasoning that growing revenue with a shrinking margin points to the cost side was a sensible first cut. But the revenue side was then ruled out entirely, leaving aside the possibility that prices did not keep pace with costs. Margin depends on price relative to cost, so dropping the revenue side can lead you to miss part of the cause and part of the fix.

**Next time, try keeping price on the table by asking whether menu prices rose in line with input costs.**

> “That's probably not where the problem is going to be. So we need to look at the cost side.”

**To work on 2**

*Before*

The candidate dismissed overhead and labor with unverified assumptions. Store count was never confirmed, and 15% revenue growth could easily include new locations.

> “most likely, the overhead shouldn't change too much as you're probably not, um, adding more... any more stores or anything like that”
> “And the labor itself, um, wouldn't be enough by itself to explain the large change.”

*After*

*In the follow-up on your structure, when asked what your COGS view was based on, you said overhead "shouldn't change too much as you're probably not, um, adding more... any more stores or anything like that" and that labor "wouldn't be enough by itself to explain the large change."*

Overhead and labor were set aside based on assumptions that were not checked. Store count was not confirmed, and 15% revenue growth could easily include new locations. Ruling out branches on untested assumptions can send the whole case in the wrong direction.

**Next time, try asking the interviewer to confirm a fact like store count before you rule out a cost branch.**

> “most likely, the overhead shouldn't change too much as you're probably not, um, adding more... any more stores or anything like that”
> “And the labor itself, um, wouldn't be enough by itself to explain the large change.”

**To work on 3**

*Before*

When asked again for the basis of the hypothesis, the candidate fell back on intuition rather than a testable rationale.

> “I don't know. I just feel like”

*After*

*In the follow-up on your structure, when the interviewer asked a second time what your COGS view was based on, you said "I don't know. I just feel like".*

The answer fell back on intuition instead of a reason that could be tested. Interviewers look for a hypothesis tied to logic or data, because that is what lets a team check it.

**Next time, try tying your hypothesis to the facts in the prompt and naming the data that would confirm or reject it.**

**Missed moment 1**

*Before*

Explaining why COGS is the likely driver (turn 9)

A great answer: “Revenue is up, so the margin loss has to come from costs growing faster than price. Specialty coffee is exposed to volatile inputs like beans and dairy, so COGS is my lead hypothesis. But I'd also check whether menu prices have moved at all. If they haven't, part of the fix is pricing, not just costs.”

*After*

*In the follow-up on your structure, when asked what your COGS view was based on, you said "So we need to look at the cost side."*

This was a chance to give a clear reason why COGS leads while keeping pricing in view. A reasoned hypothesis that still leaves room for other causes shows sound business judgment.

Next time, try something like: “Revenue is up, so the margin loss has to come from costs growing faster than price. Specialty coffee is exposed to volatile inputs like beans and dairy, so COGS is my lead hypothesis. But I'd also check whether menu prices have moved at all. If they haven't, part of the fix is pricing, not just costs.”

### Creativity & Brainstorming — not assessed (unchanged)

*The interview ended before any brainstorming question was asked, so creativity could not be assessed.*

### Synthesis & Recommendation — not assessed (unchanged)

*The interview ended before the recommendation stage, so synthesis could not be assessed.*

### Communication & Delivery — needs work (unchanged)

**To work on 1**

*Before*

The opening was abrupt and unprofessional in tone toward the interviewer.

> “Hi. Can you stop talking for a second?”

*After*

*At the very start, right after the interviewer presented the case, you said "Hi. Can you stop talking for a second?"*

The opening came across as abrupt and unprofessional in tone toward the interviewer. Interviewers also judge whether they could put you in front of a client, and first impressions weigh heavily.

**Next time, try asking politely for a moment, for example by thanking the interviewer and saying you would like to take a minute to organize your thoughts.**

**To work on 2**

*Before*

Delivery was heavy with filler and self-corrections, and the structure was hard to follow without clear signposting.

> “Uh, the first one being the costs or the COGS. Um, well, the costs, which are split into COGS as well as overhead and the labor cost.”
> “Well, since there was such a large decline in revenue... oh, sorry. Not revenue.”

*After*

*When laying out your structure, you said "Uh, the first one being the costs or the COGS. Um, well, the costs, which are split into COGS as well as overhead and the labor cost." and later "Well, since there was such a large decline in revenue... oh, sorry. Not revenue."*

The delivery had a lot of filler words and self-corrections, and the structure was hard to follow without clear verbal markers of where each part began. If the interviewer cannot follow your structure, good thinking can get lost.

**Next time, try announcing how many parts you have and numbering them as you go, pausing silently instead of using filler.**

**To work on 3**

*Before*

The candidate opened with a hypothesis, showing an instinct for answer-first delivery, but stated it before laying out any structure and trailed off without finishing a thought when pressed.

> “I don't know. I just feel like”
> “Yeah. I think the problem is COGS.”

*After*

*In the opening you said "Yeah. I think the problem is COGS." and, when pressed later on its basis, you said "I don't know. I just feel like".*

Opening with a hypothesis shows an instinct for leading with the answer, but it came before any structure, and when pressed the thought trailed off unfinished. Leading with the answer only works when it is backed by a structure and finished sentences the interviewer can follow.

**Next time, try stating your hypothesis together with your structure, and finish every sentence even if you need a pause first.**

**Missed moment 1**

*Before*

Turn 5, laying out the structure

A great answer: “I'll look at two sides. First, revenue, which is volume times price. Second, costs, in four buckets: COGS, labor, overhead, and other. I'll start with COGS, because...”

*After*

*In the opening, when asked how you would structure the problem and where COGS sits, you began "My niche structure would be... basically, you would look at a couple separate things."*

This was a chance to lay out the structure in a short, numbered way that is easy to follow. A crisp, numbered structure lets the interviewer follow you and makes you sound confident.

Next time, try something like: “I'll look at two sides. First, revenue, which is volume times price. Second, costs, in four buckets: COGS, labor, overhead, and other. I'll start with COGS, because...”

### Pushback, Composure & Case Leadership — needs work (unchanged)

**To work on 1**

*Before*

On the first challenge, the candidate attempted a reasoned defense of the COGS hypothesis by eliminating revenue, overhead and labor, but when the same challenge was restated, the candidate abandoned that reasoning instead of holding it or proposing a test.

> “I don't know. I just feel like”
> “So I think most likely there has been some change in COGS as that are... would have a direct effect on profits.”

*After*

*In the follow-up on your structure, when first asked what your COGS view was based on, you said "So I think most likely there has been some change in COGS as that are... would have a direct effect on profits." and when the question was restated you said "I don't know. I just feel like".*

On the first challenge you gave a reasoned defense by eliminating revenue, overhead and labor. When the same challenge was restated, that reasoning was dropped instead of being held or turned into a proposed test. Interviewers often repeat a challenge to see if you can stand by sound reasoning calmly, so holding your logic shows composure.

**Next time, try restating your earlier reasoning briefly and then proposing the data that would test it.**

**To work on 2**

*Before*

The candidate was passive and never asked for any data (cost lines as % of revenue, menu price history, peer margins) to move the case forward.

> “Yes. I think that is, Macy.”

*After*

*In the follow-up on your structure, when asked about gaps and which branch to prioritize, you said "Yes. I think that is, Macy."*

The case stayed passive, with no request for data such as cost lines as % of revenue, menu price history or peer margins to move it forward. Asking for the right data shows you can lead the case rather than wait to be guided.

**Next time, try asking for one specific piece of data, such as each cost line as % of revenue over the two years, as soon as you name your priority.**

**Missed moment 1**

*Before*

Interviewer restated at turn 10: "What is that based on, since you haven't seen any numbers yet?"

A great answer: “Fair, it's a hypothesis, not a conclusion. It rests on the fact that revenue grew while margin fell 18 points. To test it, I'd want each cost line as a % of revenue now versus two years ago. If COGS explains most of the 18 points, I'd break it down by input. I'd also check whether menu prices changed over that period and whether peers saw similar compression.”

*After*

*In the follow-up on your structure, when the interviewer restated the question of what your COGS view was based on without any numbers, you said "I don't know. I just feel like".*

This was a chance to call it a hypothesis, give its basis, and propose how to test it. Responding to a repeated challenge with a clear test shows composure and keeps the case moving.

Next time, try something like: “Fair, it's a hypothesis, not a conclusion. It rests on the fact that revenue grew while margin fell 18 points. To test it, I'd want each cost line as a % of revenue now versus two years ago. If COGS explains most of the 18 points, I'd break it down by input. I'd also check whether menu prices changed over that period and whether peers saw similar compression.”

**Top improvement** (unchanged): Before naming a culprit, restate the objective and lay out a full profit tree: revenue as volume × price, and costs as COGS, labor, overhead and other. Then treat your hypothesis as something to test, not defend by feel. When challenged, name the exact data that would confirm or kill it, such as each cost line as a % of revenue over the two years and whether menu prices changed.
