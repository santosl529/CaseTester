# Report tone — old vs new

Sessions: 4224252c, 904b0b33, 95e5d00b, aae091ff, 598645a0. Spend: spent $1.0935 of $3.00 — this process: claude-opus-5-5 8 calls $1.0935.

| Session | Case | Same ratings | Same claims | Quote audit (stripped / dropped) | Inline quotes verbatim | Rewrites passed | Jargon before → after | Accusing before → after |
|---|---|---|---|---|---|---|---|---|
| 4224252c | prof-001 | yes | yes | 0 / 0 | 31/31 | 21/38 | 5 → 4 | 4 → 0 |
| 904b0b33 | prof-002 | yes | yes | 0 / 0 | 47/47 | 27/30 | 1 → 0 | 0 → 0 |
| 95e5d00b | pricing-001 | yes | yes | 0 / 0 | 40/40 | 32/32 | 1 → 0 | 0 → 0 |
| aae091ff | prof-001 | yes | yes | 0 / 0 | 42/42 | 31/33 | 8 → 1 | 3 → 1 |
| 598645a0 | prof-001 | yes | yes | 0 / 0 | 13/13 | 9/17 | 6 → 4 | 0 → 0 |

## 4224252c — Brew & Bean Profitability (prof-001)

Mode: the stored report (scored 2026-10-27), plain-words pass only. Overall: adequate → adequate.

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 31 of 31 |
| Rewrites that passed the tone audit | 21 of 38 — refused: structure.missedOpportunities.0 (not returned); quantitative.missedOpportunities.0 (not returned); dataExhibit.missedOpportunities.0 (not returned); judgment.missedOpportunities.0 (not returned); creativity.missedOpportunities.0 (not returned); synthesis.wentWell.0 (not returned); synthesis.wentWell.1 (not returned); synthesis.wentWell.2 (not returned); synthesis.needsWork.0 (not returned); synthesis.missedOpportunities.0 (not returned); communication.wentWell.0 (not returned); communication.needsWork.0 (not returned); communication.missedOpportunities.0 (not returned); pushback.wentWell.0 (not returned); pushback.wentWell.1 (not returned); pushback.needsWork.0 (not returned); pushback.missedOpportunities.0 (not returned) |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 5 → 4 |
| "you did not / never / failed / could not", before → after | 4 → 0 |

### Problem Structuring — needs work (unchanged)

**Strength 1**

*Before*

Once past the opening, you formed a sensible hypothesis that the problem sat on the cost side, using the revenue-up/margin-down tension.

> “if revenue grew 15% but margin dropped 18 points, the problem's likely on the cost side, so I'd start there.”

*After*

*In the follow-up on your opening structure, when asked what data you would want to see first, you said "if revenue grew 15% but margin dropped 18 points, the problem's likely on the cost side, so I'd start there."*

Once past the opening, you formed a sensible early guess that the problem sat on the cost side, using the tension between revenue going up and margin going down. Interviewers want to see you use the facts you are given to pick a likely answer and decide where to look first.

**Keep using the tension in the starting facts to form an early guess about where the problem sits.**

**To work on 1**

*Before*

The opening was a list of loosely related areas, not a MECE profit tree, and it mixed overlapping lenses such as internal/external and operations.

> “So, I'd want to look at the whole business — revenue, costs, the market, maybe competitors, and then figure out what's driving the margin down. I'd also look at internal versus external factors, and operations.”

*After*

*In the opening, when asked how you would approach the margin decline, you said "So, I'd want to look at the whole business — revenue, costs, the market, maybe competitors, and then figure out what's driving the margin down. I'd also look at internal versus external factors, and operations."*

The opening was a list of loosely related areas rather than a profit breakdown with no gaps or overlaps, and it mixed overlapping lenses such as internal versus external and operations. A clean breakdown shows the interviewer you can split a problem into parts that cover everything once, which shapes the rest of the case.

**Next time, try starting from profit equals revenue minus costs and splitting each side into parts that do not overlap before adding anything else.**

**To work on 2**

*Before*

When asked twice to name specific branches and a starting point, you could not produce a structure.

> “hmm, I'm not sure.”
> “I'm stuck, sorry.”

*After*

*In the follow-up on your opening structure, when asked twice to name specific branches and where you would start, you said "hmm, I'm not sure." and then "I'm stuck, sorry."*

Across both requests, no structure was produced, and the interviewer moved on. Laying out a structure on request is one of the core things a case interview tests, so stalling here costs a lot.

**Next time, try naming even two branches, revenue and costs, and saying which you would start with, rather than leaving the question unanswered.**

**To work on 3**

*Before*

You never restated the objective (find the root cause of a 24%→6% margin decline and reverse it) or tied the structure to that decision.

> “Basically I'd break it into profit drivers and then dig into whichever one looks off.”

*After*

*In the opening, when asked how you would approach the problem, you closed with "Basically I'd break it into profit drivers and then dig into whichever one looks off."*

The answer went straight to an approach without restating the objective (find the root cause of the 24% to 6% margin decline and reverse it) or tying the structure to that decision. Restating the goal shows you have understood the client's question and keeps your structure aimed at answering it.

**Next time, try opening with one sentence restating the goal, such as finding why margin fell from 24% to 6% and how to reverse it, then link each branch to it.**

**Missed moment 1**

*Before*

Turn 2: the interviewer said 'That's a list of areas rather than a structure' and asked for specific branches and a starting point; you answered 'hmm, I'm not sure.'

A great answer: “Our goal is to find why margin fell from 24% to 6% while revenue grew 15%, and fix it. Profit is revenue minus costs. Revenue splits into price times volume, with volume split into traffic and items per visit. Costs split into COGS, labor, and overhead/rent. Revenue is up, so I'd start with costs as a percent of revenue, then check whether pricing kept pace with input costs. I'd also ask whether peers are seeing the same squeeze, which tells us how much pricing power we have.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

### Quantitative & Analytical Rigor — adequate (unchanged)

**Strength 1**

*Before*

You backed traffic growth out of revenue and ticket growth correctly, and drew a business implication from it.

> “Revenue up 15%, ticket up 9.7%: 1.15 ÷ 1.097 ≈ 1.05, so traffic is only up about 5%.”

*After*

*In the exhibit discussion, when asked how the ticket figures fit your reading and what they meant for the 15% revenue growth, you said "Revenue up 15%, ticket up 9.7%: 1.15 ÷ 1.097 ≈ 1.05, so traffic is only up about 5%."*

You correctly worked out traffic growth from revenue and ticket growth, and drew a business implication from it. Turning given numbers into a new fact and then saying what it means is exactly the kind of math interviewers reward.

**Keep backing out the hidden figure from the numbers you have and stating what it means for the business.**

**To work on 1**

*Before*

When probed, the candidate set up the break-even equation and solved it correctly (about 23.6%), but first asserted figures before computing them: 20% for full recovery, and a 9% rise recovering 'most' of the gap when it closes only about half (to about 13.8%).

> “Rough math: a 9% price increase on a $6.80 ticket adds about $0.61 of near-pure margin per transaction, which recovers most of the gap without touching volume.”
> “Getting back to 24% would take closer to a 20% increase, which isn't realistic in one move.”
> “I need (0.41 + 6.80x) ÷ (6.80 × (1+x)) = 0.24.”
> “So roughly a 24% price increase to fully restore the old margin on price alone — which nobody would do.”

*After*

*In the recommendation, you said a 9% rise "recovers most of the gap without touching volume", and in the follow-up questions you said "Getting back to 24% would take closer to a 20% increase, which isn't realistic in one move."*

Figures were stated before being computed: 20% for full recovery, and a 9% rise recovering most of the gap when it closes only about half (to about 13.8%). When probed, you set up the break-even equation, "I need (0.41 + 6.80x) ÷ (6.80 × (1+x)) = 0.24.", and solved it correctly at about 23.6%, concluding "So roughly a 24% price increase to fully restore the old margin on price alone — which nobody would do." Numbers stated without checking can undermine trust in the rest of your analysis, even when you can calculate them correctly later.

**Next time, try running a quick calculation before stating any sizing figure, even if it means pausing for a few seconds.**

> “Rough math: a 9% price increase on a $6.80 ticket adds about $0.61 of near-pure margin per transaction, which recovers most of the gap without touching volume.”

**To work on 2**

*Before*

Your first read of the exhibit got the subtraction wrong. You fixed it immediately, but it is another instance of speaking before checking.

> “so that's a 14-point increase”

*After*

*In the exhibit discussion, when asked which cost line drove the decline, your first read of the COGS change was "so that's a 14-point increase".*

The subtraction in the first read was wrong; you fixed it immediately, but it is another case of speaking before checking. Even quickly corrected slips add up and make an interviewer double-check your other numbers.

**Next time, try doing the subtraction silently before saying the result aloud.**

**To work on 3**

*Before*

The candidate split COGS into beans and other inputs, applied each inflation rate, and reconciled exactly to today's 58%, but then rounded blended input inflation up to 39% when those same figures give about 38%.

> “input costs rose about 39% over two years”
> “Two years ago COGS was 42 points of revenue: beans 25% of that is 10.5, other inputs 31.5.”
> “Total = 58.0 — exactly today's COGS.”

*After*

*In the exhibit discussion, you split COGS with "Two years ago COGS was 42 points of revenue: beans 25% of that is 10.5, other inputs 31.5." and reached "Total = 58.0 — exactly today's COGS.", but in the recommendation you said "input costs rose about 39% over two years".*

You split COGS into beans and other inputs, applied each inflation rate and reconciled exactly to today's 58%, but then rounded blended input inflation up to 39% when those same figures give about 38%. Keeping figures consistent with your own earlier math shows care and makes your recommendation more believable.

**Next time, try reusing the exact figures from your earlier calculation when you restate them in the recommendation.**

**Missed moment 1**

*Before*

Turn 17: you sized the 8–10% price recommendation for the board without running the margin math, and claimed it 'recovers most of the gap.'

A great answer: “Today profit is 6% of $6.80, about $0.41. A 9% increase adds $0.61 at no extra input cost, so profit is $1.02 on $7.41, about 13.8%. That closes roughly half the 18-point gap. Pricing is the lead lever, but procurement has to deliver the rest.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

### Data & Exhibit Interpretation — strong (unchanged)

**Strength 1**

*Before*

The candidate read every cost line systematically and isolated COGS as the driver (16 of the 18 points, with overhead at 2 and labor flat), though the very first read of the exhibit contained a subtraction error that was corrected right away.

> “So COGS explains 16 of the 18-point margin drop, about 89%, and overhead the other 2. Labor is completely flat.”
> “It goes 42 to 50 to 58, so that's a 14-point increase”

*After*

*In the exhibit discussion, when asked which cost line drove the decline and how much it explained, you said "So COGS explains 16 of the 18-point margin drop, about 89%, and overhead the other 2. Labor is completely flat."*

You went through every cost line in order and isolated COGS as the driver (16 of the 18 points, with overhead at 2 and labor flat), though your very first read, "It goes 42 to 50 to 58, so that's a 14-point increase", had a subtraction error that you corrected right away. Checking every line and quantifying each one's share is how you find the real driver with confidence.

**Keep reading every line of an exhibit and stating how much of the change each explains.**

**Strength 2**

*Before*

You drew implications from the data: ruling out fixed-cost absorption because the footprint was constant, and reframing the cost story as pricing inaction.

> “And since footprint is constant at 200 stores, this isn't a fixed-cost absorption issue.”
> “So it's really a pricing-inaction story dressed up as a cost story.”

*After*

*In the exhibit discussion, you said "And since footprint is constant at 200 stores, this isn't a fixed-cost absorption issue." and later "So it's really a pricing-inaction story dressed up as a cost story."*

You drew implications from the data: ruling out spreading fixed costs over fewer sales because the store count was constant, and reframing the cost story as one of prices not being raised. Interviewers look for candidates who say what the numbers mean, not just what they are.

**Keep stating what each data point rules in or out.**

**Strength 3**

*Before*

You proposed precise next data pulls: the COGS composition and menu price history.

> “Do we have a split of COGS — coffee beans, dairy, cups and packaging, food? And has the menu price changed over the two years?”

*After*

*In the exhibit discussion, after finding COGS as the driver, you asked "Do we have a split of COGS — coffee beans, dairy, cups and packaging, food? And has the menu price changed over the two years?"*

You proposed precise next data requests: the makeup of COGS and the menu price history. Specific data requests show you know exactly what would confirm or reject your view.

**Keep asking for the specific breakdown that would test your current view.**

**To work on 1**

*Before*

Your decomposition showed beans adding only about 4.2 points versus about 11.8 from dairy, packaging, and food, but you never said so. Your next steps then leaned on beans.

> “Next steps: run the pilot, and in parallel start bean contract renegotiation as the second lever.”

*After*

*In the recommendation, your next steps were "Next steps: run the pilot, and in parallel start bean contract renegotiation as the second lever."*

Your own breakdown showed beans adding only about 4.2 points versus about 11.8 from dairy, packaging and food, but this went unsaid, and the next steps then leaned on beans. Your actions should follow where your numbers show the biggest problem, or the recommendation can aim at the smaller cause.

**Next time, try stating which part of your breakdown is largest and pointing your next steps at it.**

**Missed moment 1**

*Before*

Turn 11: right after reconciling 10.5→14.7 for beans and 31.5→43.3 for other inputs.

A great answer: “Notably, beans add only about 4 of the 16 points; dairy, packaging, and food add almost 12. So a bean-hedging fix alone won't solve this. Procurement has to cover every input.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

You named elasticity as the main risk, unprompted, and paired it with a practical pilot against control stores.

> “Main risk is elasticity — if traffic falls more than a few percent, the increase self-defeats. I'd mitigate by piloting in 20 stores across two regions for six weeks”

*After*

*In the recommendation, you said "Main risk is elasticity — if traffic falls more than a few percent, the increase self-defeats. I'd mitigate by piloting in 20 stores across two regions for six weeks".*

Without being asked, you named price sensitivity as the main risk and paired it with a practical pilot against control stores. Naming the biggest risk and a way to test it shows the judgment clients expect before acting.

**Keep naming the main risk of your recommendation and a practical way to test it.**

**Strength 2**

*Before*

Your competitive response was commercially savvy: reprice inelastic items while holding the visible headline price.

> “reprice the inelastic espresso and food items, hold the headline drip coffee price as the visible price signal, and lean harder on loyalty and procurement savings.”

*After*

*In the questions after your recommendation, when asked what you would do if a competitor held prices flat, you said "reprice the inelastic espresso and food items, hold the headline drip coffee price as the visible price signal, and lean harder on loyalty and procurement savings."*

Your competitive response was commercially savvy: raise prices on items customers are less sensitive to while holding the visible headline price. Practical, market-aware responses show you can turn analysis into moves a business would actually make.

**Keep tailoring your response to how customers actually see and react to prices.**

**Strength 3**

*Before*

Asked to assume competitor behavior, you made an explicit and justified assumption.

> “I'd assume specialty coffee peers faced the same bean and dairy inflation and passed at least some of it through, since that's the industry norm.”

*After*

*In the exhibit discussion, when the interviewer asked you to make a reasonable assumption about competitor pricing, you said "I'd assume specialty coffee peers faced the same bean and dairy inflation and passed at least some of it through, since that's the industry norm."*

You made an explicit assumption and gave a reason for it. Stating assumptions with a reason lets the interviewer follow and challenge your logic.

**Keep stating assumptions out loud along with why they are reasonable.**

**To work on 1**

*Before*

Your claim that volume growth is 'actively diluting margin' is a conceptual error. Each incremental item at flat prices still covers its 58% COGS and contributes positively. Margin fell because input costs were not passed through, not because volume grew.

> “so growth is actively diluting margin rather than helping”

*After*

*In the exhibit discussion, when asked what the ticket figures meant for revenue growth, you said "so growth is actively diluting margin rather than helping".*

This claim is a conceptual error: each extra item at flat prices still covers its 58% COGS and contributes positively. Margin fell because input costs were not passed through, not because volume grew. A wrong cause can send the client toward the wrong fix, so interviewers watch closely for this kind of logic.

**Next time, try checking whether each extra unit still earns more than it costs before saying growth hurts margin.**

**To work on 2**

*Before*

Your board recommendation overstated what pricing alone delivers. The correct framing (pricing plus procurement) only emerged under challenge.

> “which recovers most of the gap without touching volume.”

*After*

*In the recommendation, you said the price rise "which recovers most of the gap without touching volume."*

The board recommendation overstated what pricing alone delivers, and the correct framing of pricing plus procurement only came out when challenged. A board recommendation needs to be right the first time, since executives act on what they hear.

**Next time, try checking how far your main lever gets you before presenting it, and name the second lever up front if it falls short.**

**To work on 3**

*Before*

Some cost levers carry risks you didn't flag. Locking forward contracts after a 40% run-up could lock in peak prices, and shrinking portions risks brand damage for a specialty chain.

> “renegotiate bean contracts or lock in forward pricing, since 40% spot exposure suggests they're buying unhedged.”

*After*

*In the brainstorm, when asked what else could recover margin, you suggested "renegotiate bean contracts or lock in forward pricing, since 40% spot exposure suggests they're buying unhedged."*

Some cost levers came with risks left unflagged: locking forward contracts after a 40% run-up could lock in peak prices, and shrinking portions risks brand damage for a specialty chain. Interviewers value candidates who spot the downside of an idea before the client discovers it.

**Next time, try adding one quick risk to each lever you propose.**

**Missed moment 1**

*Before*

Turn 13: interpreting what the ticket growth means for margin.

A great answer: “Growth itself isn't the problem. Each extra item still contributes after COGS, and attachment is helping absorb overhead. The issue is that per-item margin shrank because input costs rose about 38% and prices didn't move.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

### Creativity & Brainstorming — strong (unchanged)

**Strength 1**

*Before*

You organized ideas into cost-side and revenue-side buckets, with several distinct levers in each.

> “On the cost side: renegotiate bean contracts or lock in forward pricing”
> “On the revenue side, beyond a straight price increase: reprice selectively on the most inelastic items like espresso drinks”

*After*

*In the brainstorm, when asked for ideas beyond a price increase, you began "On the cost side: renegotiate bean contracts or lock in forward pricing" and then "On the revenue side, beyond a straight price increase: reprice selectively on the most inelastic items like espresso drinks".*

You organized ideas into cost-side and revenue-side groups, with several distinct levers in each. Grouping ideas makes them easy to follow and shows you have covered the problem broadly.

**Keep sorting your ideas into clear groups with several distinct levers in each.**

**Strength 2**

*Before*

You included non-obvious levers such as waste and over-pouring control and a subscription program to protect traffic.

> “And look at waste: in coffee, spoilage and over-pouring can be a few points of COGS on its own.”
> “Introduce a loyalty or subscription program to hold traffic through a price increase.”

*After*

*In the brainstorm, you added "And look at waste: in coffee, spoilage and over-pouring can be a few points of COGS on its own." and "Introduce a loyalty or subscription program to hold traffic through a price increase."*

You included less obvious levers such as controlling waste and over-pouring, and a subscription program to protect traffic. Less obvious ideas show creativity beyond the standard list most candidates give.

**Keep adding a few less obvious, industry-specific ideas alongside the standard ones.**

**Strength 3**

*Before*

The candidate prioritized the ideas explicitly with a rationale, but the prioritization wasn't backed by sizing, with no estimate of how many margin points each lever could deliver.

> “I'd sequence it: pricing first because it's fastest and largest, procurement second, reformulation third.”

*After*

*In the brainstorm, you closed with "I'd sequence it: pricing first because it's fastest and largest, procurement second, reformulation third."*

You ordered the ideas explicitly with a reason, but the order was not backed by sizing, with no estimate of how many margin points each lever could deliver. Ranking ideas with a reason shows judgment about what matters most.

**Keep ranking your ideas with a reason, and attach a rough size to each.**

**Missed moment 1**

*Before*

Turn 15: after listing the levers and sequencing them.

A great answer: “Roughly: pricing can recover 7–8 points, procurement across dairy, packaging, and beans perhaps 3–5, and waste 1–2. Together that gets close to the old 24%, which is why I'd run all three.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

### Synthesis & Recommendation — strong (unchanged)

**Strength 1**

*Before*

You led with a clear, specific recommendation.

> “Raise menu prices roughly 8–10% across the core menu, starting with espresso and specialty drinks.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Strength 2**

*Before*

Your reasons were tied directly to the analysis, ruling out other drivers.

> “Nothing else is broken — labor is flat at 22%, overhead moved only two points, footprint is unchanged, and traffic is up 5%.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Strength 3**

*Before*

You named the key risk and concrete next steps, concisely.

> “Next steps: run the pilot, and in parallel start bean contract renegotiation as the second lever.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 1**

*Before*

The supporting sizing in your recommendation was unchecked and overstated, which weakened an otherwise tight answer.

> “which recovers most of the gap without touching volume.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Missed moment 1**

*Before*

Turn 17: the one-line board recommendation.

A great answer: “Raise prices 8–10% on specialty SKUs, which restores roughly half the lost margin. Pair it with procurement across dairy, packaging, and beans to close the rest.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

### Communication & Delivery — adequate (unchanged)

**Strength 1**

*Before*

You used hypothesis-driven phrasing that framed what the data should show.

> “If prices held flat while input costs rose, that alone would push COGS as a percent of revenue up.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 1**

*Before*

From the analysis onward the candidate was top-down and signposted with explicit enumeration, but the opening meandered and then stalled, so delivery wasn't consistently top-down across the interview.

> “So, I'd want to look at the whole business — revenue, costs, the market, maybe competitors”
> “I'm stuck, sorry.”
> “First, the direct one: COGS as a percent of revenue should fall from 58% toward the low 50s”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Missed moment 1**

*Before*

Turn 3: you were stuck when asked for branches.

A great answer: “Let me take thirty seconds to lay this out. Then I'll walk you through two branches, revenue and cost, and say where I'd start.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

### Pushback, Composure & Case Leadership — adequate (unchanged)

**Strength 1**

*Before*

Probed on the 20% figure, you owned the estimate and solved it properly.

> “I should have run that number before quoting 20%.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Strength 2**

*Before*

You drove the case proactively by requesting relevant data unprompted.

> “I'd also want to know whether revenue growth came from new stores or same-store sales, since opening locations adds fixed cost fast.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 1**

*Before*

Challenged on the sizing, the candidate rechecked the math and updated openly with explicit reasoning, but under the first challenge on structure the candidate froze twice without offering a partial answer and needed the interviewer to move on.

> “hmm, I'm not sure.”
> “I'm stuck, sorry.”
> “That's half the gap, not most of it — I overstated.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Missed moment 1**

*Before*

Turn 4: the interviewer offered time and repeated 'which branch would you start with, and why?'

A great answer: “I'd start with costs. Revenue grew 15% while margin fell 18 points, so the squeeze is almost certainly a cost line growing faster than revenue. I'd want to see each cost line as a percent of revenue then versus now.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Top improvement** (unchanged): Open with a real, tailored profit tree instead of a list of areas: restate the objective, then split profit into revenue (price × traffic × items per visit) and costs (COGS, labor, overhead/rent), and say which branch you'd test first and why. In this case that was costs, since revenue grew while margin fell. Your later analysis was excellent, but freezing at the structuring stage is what an interviewer remembers. Second, compute any figure before quoting it.

---

## 904b0b33 — Larkspur Air Route Profitability (prof-002)

Mode: the stored report (scored 2026-10-27), plain-words pass only. Overall: adequate → adequate.

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 47 of 47 |
| Rewrites that passed the tone audit | 27 of 30 — refused: pushback.wentWell.0 (not returned); pushback.wentWell.1 (not returned); pushback.needsWork.0 (not returned) |
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

*In the opening and the first analysis question, when the interviewer asked for your structure before any data, you said "Honestly, I think the answer's already visible, so let me just give you the recommendation and the structure falls out of it."*

Your first read of the numbers was sharp: you saw that "a $24 million revenue drop turning into a $24 million profit swing tells me costs didn't come down at all" and that full planes meant "a yield problem." The answer then skipped the structure, went straight to a recommendation, and called it "an input-cost squeeze," which contradicted your own flat-cost read. Interviewers want to see how you organize a problem before you solve it, and a diagnosis that conflicts with your own earlier logic undermines confidence in your reasoning.

**Next time, try laying out a full structure first when asked, and check that your diagnosis matches what you have already concluded from the numbers.**

> “It's an input-cost squeeze.”
> “If load factor held, that's a yield problem — they're getting less per seat.”

**To work on 2**

*Before*

When pressed, the candidate gave a recognizable profit tree and prioritized the fare branch with reasons. However, the route and external/competitive branches were missing until the interviewer pushed, and were then treated as refinements rather than real buckets.

> “Fair point in principle — a network average could hide mix.”
> “That's a cause behind the fare move rather than a new branch.”
> “revenue is seats times load factor times fare times flights; costs are fuel, labor, maintenance, airport fees, and fixed overhead.”
> “Fare is the live branch.”

*After*

*When the interviewer asked for the full set of drivers, you said "revenue is seats times load factor times fare times flights; costs are fuel, labor, maintenance, airport fees, and fixed overhead."*

You gave a recognizable profit tree and explained why "Fare is the live branch." However, the route-level and competitive branches appeared only after the interviewer pushed, and you then treated them as refinements, for example "That's a cause behind the fare move rather than a new branch." Missing branches like route mix or competitor entry can hide the real cause, and interviewers look for a structure that covers these from the start.

**Next time, try including route-by-route performance and external factors such as competitors as their own branches in your first structure.**

> “Fair point in principle — a network average could hide mix.”

**Missed moment 1**

*Before*

Turn 3, when the interviewer asked for a structure before giving any data.

A great answer: “The CEO wants to know what caused a $24M swing and how to get back to profit in 12 months. I'd look at four areas. (1) Revenue by route: passengers (seats × load factor) times revenue per passenger (fare + extras). (2) Variable cost per flight: fuel, crew, maintenance, fees. (3) Fixed costs: leases, hub, overhead. (4) External changes: competitor entry, demand, fuel. Revenue and profit both fell $24M with full planes, so I'd start with fare by route and check for a new competitor on specific routes.”

*After*

*Early in the analysis, the interviewer asked you to lay out how you would structure the problem before seeing any data, and you began with "Honestly, I think the answer's already visible, so let me just give you the recommendation and the structure falls out of it."*

This was the moment to set out a full structure covering revenue by route, costs and outside changes, and then say where you would start. A complete structure here would have pointed you to route-level fares and a possible competitor much earlier.

Next time, try something like: “The CEO wants to know what caused a $24M swing and how to get back to profit in 12 months. I'd look at four areas. (1) Revenue by route: passengers (seats × load factor) times revenue per passenger (fare + extras). (2) Variable cost per flight: fuel, crew, maintenance, fees. (3) Fixed costs: leases, hub, overhead. (4) External changes: competitor entry, demand, fuel. Revenue and profit both fell $24M with full planes, so I'd start with fare by route and check for a new competitor on specific routes.”

### Quantitative & Analytical Rigor — adequate (unchanged)

**Strength 1**

*Before*

The candidate stress-tested the new-route case at the first-year load factor and stated what the result meant for the 12-month goal.

> “At 60%: 48 passengers × $200 = $9,600 revenue, less $9,200 = $400 contribution per flight, × 5,000 = $2.0M.”
> “So we land roughly at breakeven in the first 12 months, not at $7.8M.”

*After*

*On the new-route exhibit, after the interviewer said first-year load factor is often around 60%, you worked it through: "At 60%: 48 passengers × $200 = $9,600 revenue, less $9,200 = $400 contribution per flight, × 5,000 = $2.0M."*

You tested the new-route case at the first-year load factor and spelled out the consequence for the 12-month goal: "So we land roughly at breakeven in the first 12 months, not at $7.8M." Testing the plan under realistic assumptions and tying the result back to the client's goal shows the rigor interviewers expect.

**Keep rerunning key numbers under the less favourable assumption and stating what the result means for the client's objective.**

**To work on 1**

*Before*

The Port Avery breakeven fare was overstated: $11,000 ÷ 60 = $183 is total revenue per passenger, so the breakeven fare is $183 − $20 extras = $163. The candidate fixed this only after the interviewer probed.

> “Port Avery needs $183, they're at $160.”

*After*

*On the Hub–Lakeport exhibit, while comparing breakevens, you said "Port Avery needs $183, they're at $160."*

The Port Avery breakeven fare was overstated: $11,000 ÷ 60 = $183 is total revenue per passenger, so after the $20 of extras the breakeven fare is $163. The correction came only after the interviewer asked how you got the figure. A breakeven that is off by the extras makes the gap look much bigger than it is, which can push the recommendation in the wrong direction.

**Next time, try listing every revenue source per passenger before calculating a breakeven fare, and subtract the non-fare revenue explicitly.**

**To work on 2**

*Before*

Later in the case, the candidate set up per-flight economics before computing, narrated each step, and reconciled results back to the exhibit totals. Early on, though, the candidate asserted a fare increase and a profit outcome without deriving either.

> “Larkspur needs to raise fares roughly 12–15% to recover the $24 million gap”
> “That gets you from negative $4 million to positive $15–20 million.”
> “Port Avery: 80 seats at 75% is 60 passengers. FY23 revenue per flight is 60 × ($240 + $20) = $15,600, less $11,000 variable, so contribution of $4,600.”
> “Times 3,000 flights, that's roughly negative $0.54M — matches the negative $0.6M in the exhibit. Good, that reconciles.”

*After*

*Early in the analysis, when asked for your structure, you said Larkspur "needs to raise fares roughly 12–15% to recover the $24 million gap" and "That gets you from negative $4 million to positive $15–20 million."*

Later in the case you set up per-flight economics before computing, talked through each step and checked results against the exhibit, as in "Good, that reconciles." Early on, though, the fare increase and the profit outcome were stated without any working behind them. Numbers stated without a derivation are hard for an interviewer to trust, even when your later math is strong.

**Next time, try showing the setup behind any figure from the start, as you did in your later Port Avery per-flight math.**

> “Port Avery: 80 seats at 75% is 60 passengers. FY23 revenue per flight is 60 × ($240 + $20) = $15,600, less $11,000 variable, so contribution of $4,600.”
> “Times 3,000 flights, that's roughly negative $0.54M — matches the negative $0.6M in the exhibit. Good, that reconciles.”

**To work on 3**

*Before*

The 3% uplift was applied to total revenue on the four routes, which includes extras, and assumed no volume loss. The fare-only uplift is somewhat smaller.

> “A 3% fare increase there is roughly $3.8M of near-pure contribution”

*After*

*In the brainstorm on first-year profitability, you said "A 3% fare increase there is roughly $3.8M of near-pure contribution".*

The 3% was applied to total revenue on the four routes, which includes extras, and assumed no passengers would be lost. The fare-only uplift is somewhat smaller. Sizing a lever on the wrong base, with no volume effect, overstates how much it closes the gap.

**Next time, try applying a fare increase only to fare revenue and stating an assumption for any passenger loss.**

**Missed moment 1**

*Before*

Turn 13, sizing Port Avery's breakeven.

A great answer: “Breakeven revenue per passenger is $11,000 ÷ 60 = $183. Take off $20 of extras and the breakeven fare is $163. At $160 they're $3 short — about $180 a flight, or roughly $0.5–0.6M a year across 3,000 flights, which matches the exhibit.”

*After*

*After the interviewer shared the Port Avery per-flight figures, you worked out its economics, starting with "Port Avery: 80 seats at 75% is 60 passengers."*

This was the point to take the $20 of extras off the revenue needed per passenger and get the true breakeven fare. Getting the breakeven right here would have shown the route was only slightly below breakeven and avoided the later correction.

Next time, try something like: “Breakeven revenue per passenger is $11,000 ÷ 60 = $183. Take off $20 of extras and the breakeven fare is $163. At $160 they're $3 short — about $180 a flight, or roughly $0.5–0.6M a year across 3,000 flights, which matches the exhibit.”

### Data & Exhibit Interpretation — strong (unchanged)

**Strength 1**

*Before*

The candidate read the route exhibit systematically: the flat routes first, then the two routes that account for exactly $24M.

> “Four routes are flat — Cedar Bluff up $0.4M, Granite Falls down $0.2M, Millbrook down $0.2M, Westhaven flat.”
> “That's $24.0M — the entire swing, exactly.”

*After*

*On the route results exhibit, you started with "Four routes are flat — Cedar Bluff up $0.4M, Granite Falls down $0.2M, Millbrook down $0.2M, Westhaven flat."*

You read the exhibit in a clear order: the flat routes first, then the two routes that account for exactly $24M, concluding "That's $24.0M — the entire swing, exactly." Reading an exhibit systematically and tying it to the full gap shows the interviewer you can find the signal quickly.

**Keep clearing out what has not changed first and then reconciling the movers to the total.**

**Strength 2**

*Before*

The candidate spotted that the best routes collapsed with the same ~$80 fare cut and inferred a competitor. Yet the implication drawn from the exhibit still pointed to raising fares on those contested routes, despite that hypothesis.

> “The highest-margin routes collapsed, which smells like someone entered those two markets specifically and Larkspur matched fare down.”
> “Do we know who entered these two routes and what they're charging?”
> “Push fare back up on Lakeport and Port Avery, unbundle extras”

*After*

*On the route results exhibit, you said "The highest-margin routes collapsed, which smells like someone entered those two markets specifically and Larkspur matched fare down."*

You spotted that the best routes collapsed with the same ~$80 fare cut and inferred a competitor, then asked "Do we know who entered these two routes and what they're charging?" Yet the implication you drew still pointed to raising fares on those contested routes: "Push fare back up on Lakeport and Port Avery, unbundle extras". Spotting a pattern like a matched fare cut is exactly the insight interviewers look for, and it is strongest when the conclusion follows from it.

**Keep reading patterns across routes to infer the cause, and let that inference shape the conclusion you draw from the exhibit.**

**Strength 3**

*Before*

On the new-route exhibit, the candidate flagged that the case depends on the load-factor assumption before being told about the ramp-up.

> “The whole case rests on that ramp assumption.”

*After*

*On the new-route exhibit, before the interviewer mentioned the ramp-up, you said "The whole case rests on that ramp assumption."*

You flagged that the new-route case depends on the load-factor assumption before being told about the ramp-up. Spotting the assumption a plan hinges on, unprompted, shows strong judgment about where the risk sits.

**Keep naming the single assumption a plan depends on as soon as you see the numbers.**

**Missed moment 1**

*Before*

Turn 15, right after isolating the two routes and suspecting a new entrant.

A great answer: “If a competitor entered and Larkspur matched, raising fares back will likely lose passengers. So before choosing a lever, I'd check who entered, their cost position, and what the aircraft could earn elsewhere.”

*After*

*On the route results exhibit, right after isolating the two routes and saying "someone entered those two markets specifically and Larkspur matched fare down," you moved on to recommending higher fares there.*

This was the moment to let the competitor suspicion change which lever you would consider. Checking the competitor before picking a lever would have kept you from anchoring on a fare increase that could not hold.

Next time, try something like: “If a competitor entered and Larkspur matched, raising fares back will likely lose passengers. So before choosing a lever, I'd check who entered, their cost position, and what the aircraft could earn elsewhere.”

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

The candidate raised risks and practical mitigations: phasing the exit, stage-gating on booking curves, and pricing where there is no competitor.

> “I'd phase the Port Avery exit — it's only $0.6M negative — as a hedge, and stage-gate the launch on booking curves at 90 days.”
> “that's the one place pricing power actually exists.”

*After*

*In your final recommendation, when asked for the biggest risk, you said "I'd phase the Port Avery exit — it's only $0.6M negative — as a hedge, and stage-gate the launch on booking curves at 90 days."*

You raised risks along with practical ways to manage them: phasing the exit, waiting on booking curves before committing, and pricing where there is no competitor, since "that's the one place pricing power actually exists." Pairing risks with concrete mitigations makes a recommendation credible to a client.

**Keep attaching a practical hedge to each risk you raise.**

**To work on 1**

*Before*

Once given the competitor data, the candidate correctly judged the fare war unwinnable and tested it with a breakeven load factor. Before that, the candidate held onto raising fares on contested routes for most of the analysis, even after suspecting a competitor had matched, and dropped the idea only when directly challenged.

> “So, as I've been saying: price is the lever.”
> “Push fare back up on Lakeport and Port Avery, unbundle extras”
> “So Larkspur would need to retain about two-thirds of its traffic at a 67% price premium.”
> “The LCC is 30% lower cost — Larkspur can't win a price war it structurally loses.”

*After*

*On the Hub–Lakeport exhibit, after suspecting a competitor had matched fares, you said "So, as I've been saying: price is the lever."*

Once given the competitor data, you correctly judged the fare war unwinnable and tested it with a breakeven load factor: "So Larkspur would need to retain about two-thirds of its traffic at a 67% price premium." Before that, raising fares on the contested routes stayed in the plan for most of the analysis, as in "Push fare back up on Lakeport and Port Avery, unbundle extras", and was dropped only when the interviewer challenged it directly. Holding a recommendation after your own evidence points against it signals that you are anchored rather than following the facts.

**Next time, try asking what your own new inference means for the current recommendation as soon as you make it.**

> “The LCC is 30% lower cost — Larkspur can't win a price war it structurally loses.”

**To work on 2**

*Before*

The opening plan was a blanket fare increase across all six routes, with no regard for competitive response.

> “raise base fares across all six routes, phased over two quarters so you don't shock demand.”

*After*

*In the early analysis, when asked for your structure, your plan was to "raise base fares across all six routes, phased over two quarters so you don't shock demand."*

The opening plan was a blanket fare increase across all six routes, with no regard for how competitors would respond. In a priced market, a fare move without considering competitor reaction can lose passengers and make the problem worse.

**Next time, try checking competitor position on each route before proposing a price change.**

**Missed moment 1**

*Before*

Turn 17, after noting both fare cuts were about $80 and looked like matching a competitor.

A great answer: “If Larkspur is matching a competitor, raising fares will cost passengers. The real question is whether Larkspur has a cost or product advantage on these routes. If it doesn't, the aircraft should go somewhere they aren't fighting a lower-cost rival.”

*After*

*On the Hub–Lakeport exhibit, after noting both fare cuts were about $80 and "looks like matching a specific competitor fare," you went on to say price was the lever.*

This was the moment to ask what a matched competitor fare means for Larkspur's ability to raise prices. Asking about Larkspur's cost or product position here would have led you to redeploying the aircraft before the interviewer had to challenge you.

Next time, try something like: “If Larkspur is matching a competitor, raising fares will cost passengers. The real question is whether Larkspur has a cost or product advantage on these routes. If it doesn't, the aircraft should go somewhere they aren't fighting a lower-cost rival.”

### Creativity & Brainstorming — adequate (unchanged)

**Strength 1**

*Before*

Some ideas were non-obvious: keeping a loss-making route flying as a bridge during the ramp-up, and segmenting peak business frequencies.

> “keep it flying a few more months while Ashford and Brookhaven ramp, so we're not carrying 5,000 immature flights at once.”
> “hold a smaller number of peak business frequencies at higher fare.”

*After*

*In the brainstorm on first-year profitability, you suggested Larkspur "keep it flying a few more months while Ashford and Brookhaven ramp, so we're not carrying 5,000 immature flights at once."*

Some of your ideas were non-obvious: keeping a loss-making route flying as a bridge during the ramp-up, and choosing to "hold a smaller number of peak business frequencies at higher fare." Non-obvious ideas show the interviewer you can think beyond the standard levers.

**Keep looking for creative options around timing and customer segments, not just the standard levers.**

**To work on 1**

*Before*

The candidate offered several distinct levers and ranked them explicitly by confidence. But they came as a flat numbered list with no organizing buckets, leaned on revenue, and included no cost-side or fleet ideas.

> “Second, extras. $20 per passenger is low; bags and seat selection on the four safe routes could add a few dollars a head.”
> “A few levers, roughly in order of how much I trust them.”

*After*

*In the brainstorm on first-year profitability, you opened with "A few levers, roughly in order of how much I trust them."*

You offered several distinct levers and ranked them explicitly by confidence, such as "Second, extras. $20 per passenger is low; bags and seat selection on the four safe routes could add a few dollars a head." But they came as a flat numbered list with no organizing groups, leaned on revenue, and included no cost-side or fleet ideas. Grouping ideas shows the interviewer your list covers the problem, and leaving out costs and fleet narrows the options.

**Next time, try sorting ideas into groups such as revenue, cost and fleet before ranking them.**

**Missed moment 1**

*Before*

Turn 27, asked what else could secure first-year profitability.

A great answer: “I'd group ideas into three buckets. (1) Revenue on uncontested routes: fares, extras, schedule. (2) Cost: overhead, fees, sub-leasing spare aircraft time. (3) Transition risk: phasing exits, launch promotions, partnerships to feed the new routes. Then I'd rank them by speed and size.”

*After*

*In the brainstorm, when the interviewer asked what else could make Larkspur profitable in the first year, you gave a ranked list of four levers.*

This was the chance to organize ideas into groups that included cost and fleet options alongside revenue. Groups make it clear your ideas cover the whole problem and bring out options a single list can miss.

Next time, try something like: “I'd group ideas into three buckets. (1) Revenue on uncontested routes: fares, extras, schedule. (2) Cost: overhead, fees, sub-leasing spare aircraft time. (3) Transition risk: phasing exits, launch promotions, partnerships to feed the new routes. Then I'd rank them by speed and size.”

### Synthesis & Recommendation — strong (unchanged)

**Strength 1**

*Before*

The candidate led with a clear recommendation backed by quantified reasons. However, the headline said 'exit' outright while the follow-up said not to cut either route until booking evidence arrives; the phased exit belongs in the headline itself.

> “Recommendation: exit Hub–Lakeport and Hub–Port Avery, redeploy those 5,000 flights to Ashford and Brookhaven, and raise fares on the four protected routes.”
> “The entire $24M swing sits on those two routes — $9.6M and $14.4M, exactly $24M — and it's all fare, not load factor or cost.”
> “Don't cut Lakeport or Port Avery until we see the booking curve on the new routes”

*After*

*In your final recommendation, you led with "Recommendation: exit Hub–Lakeport and Hub–Port Avery, redeploy those 5,000 flights to Ashford and Brookhaven, and raise fares on the four protected routes."*

You led with a clear recommendation backed by quantified reasons, such as "The entire $24M swing sits on those two routes — $9.6M and $14.4M, exactly $24M — and it's all fare, not load factor or cost." However, the headline said exit outright, while your next answer said "Don't cut Lakeport or Port Avery until we see the booking curve on the new routes"; the phased exit belongs in the headline itself. A clear, quantified headline is what a CEO acts on, so it needs to match the plan you would actually run.

**Keep leading with a quantified recommendation, and make sure the headline already includes any phasing you plan.**

**Strength 2**

*Before*

The candidate named the key risk with a hedge, then gave sequenced next steps.

> “Biggest risk: the new routes are unproven.”
> “So: price test now, new-route sales immediately, exits sequenced behind the booking evidence, Lakeport first since it's the worse of the two.”

*After*

*In your final recommendation and next steps, you said "Biggest risk: the new routes are unproven."*

You named the key risk with a hedge, then gave sequenced next steps: "So: price test now, new-route sales immediately, exits sequenced behind the booking evidence, Lakeport first since it's the worse of the two." A named risk plus ordered next steps shows the client exactly how to act.

**Keep closing with the main risk, its hedge, and a clear order of actions.**

**Missed moment 1**

*Before*

Turn 29, the final recommendation.

A great answer: “Recommendation: redeploy the Lakeport and Port Avery flying to Ashford and Brookhaven, phased — Lakeport first — while lifting fares about 3% on the four uncontested routes to cover the year-one ramp.”

*After*

*In the final recommendation, when asked how Larkspur gets back to an operating profit within twelve months, you opened with "Recommendation: exit Hub–Lakeport and Hub–Port Avery".*

This headline was the place to build in the phased, Lakeport-first exit that your next answer described. A headline that already contains the phasing stays consistent with your next steps and is easier for a CEO to act on.

Next time, try something like: “Recommendation: redeploy the Lakeport and Port Avery flying to Ashford and Brookhaven, phased — Lakeport first — while lifting fares about 3% on the four uncontested routes to cover the year-one ramp.”

### Communication & Delivery — adequate (unchanged)

**Strength 1**

*Before*

Later answers were well signposted and numbered.

> “First, the four protected routes.”

*After*

*In your later answers, such as the brainstorm, you laid out points with labels like "First, the four protected routes."*

Your later answers were clearly labelled and numbered. Clearly announced, numbered points make your answer easy for the interviewer to follow.

**Keep numbering your points and announcing what each one covers.**

**To work on 1**

*Before*

Early on, the tone was dismissive of the interviewer's structuring prompts, and the candidate repeated the same position rather than listening.

> “If you want it organized, fine”
> “But I'd note we've now spent several rounds on structure and I don't think the shape of the answer is going to move.”

*After*

*When the interviewer asked how you would organize the drivers, you said "If you want it organized, fine", and later "But I'd note we've now spent several rounds on structure and I don't think the shape of the answer is going to move."*

Early on, the tone came across as dismissive of the interviewer's prompts to structure, and the same position was repeated rather than engaging with what was being asked. Interviewers read how you respond to their steering as a preview of how you would work with clients and teammates.

**Next time, try acknowledging the prompt and answering it fully before returning to your view.**

**To work on 2**

*Before*

The candidate was answer-first and hypothesis-led, often stating expectations before seeing data. At the opening, though, the candidate gave conclusions before laying out any structure.

> “The structure is basically implied by that: revenue levers, cost levers, and the fare is the one that moves.”
> “let me say upfront what I expect it to show, so we can test me.”

*After*

*In the early analysis, when asked for your structure, you said "The structure is basically implied by that: revenue levers, cost levers, and the fare is the one that moves."*

You were answer-first and led with a clear expectation, often stating what you expected before seeing data, as in "let me say upfront what I expect it to show, so we can test me." At the opening, though, conclusions came before any structure was laid out. Leading with a view is valued, but only once the interviewer has seen the structure that supports it.

**Next time, try giving your structure first and then stating your starting view within it.**

**Missed moment 1**

*Before*

Turn 5, after the interviewer redirected to drivers rather than fixes.

A great answer: “Fair — let me lay out the full tree first and then tell you where I'd start, so we don't anchor too early.”

*After*

*After the interviewer redirected you from fixes to drivers, you answered "I hear you, but I'd push back a little — I don't think we're missing much."*

This was the moment to accept the redirect and lay out the full set of drivers before naming where you would start. Taking the redirect cleanly signals you are coachable and keeps the conversation moving forward.

Next time, try something like: “Fair — let me lay out the full tree first and then tell you where I'd start, so we don't anchor too early.”

### Pushback, Composure & Case Leadership — adequate (unchanged)

**Strength 1**

*Before*

When probed on the Port Avery figure, the candidate owned the error and corrected it cleanly.

> “Let me redo it, because I think I was sloppy.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Strength 2**

*Before*

The candidate drove the case by repeatedly asking for relevant data.

> “Do we know who entered these two routes and what they're charging?”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 1**

*Before*

When challenged on fares, the candidate updated with explicit quantitative reasoning rather than simply giving in. Earlier, however, the candidate defended a premature recommendation through several structure prompts and only partly took that feedback on board.

> “I hear you, but I'd push back a little — I don't think we're missing much.”
> “But the recommendation doesn't change — raise fares, unbundle ancillaries, hold capacity.”
> “Lakeport breakeven at $200 fare plus $20 extras: $9,000 ÷ $220 = 41 passengers, so 51% load factor.”
> “So I'll concede the blanket fare increase doesn't work on these two routes.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Missed moment 1**

*Before*

Turn 6, when the interviewer noted that network averages can hide route problems.

A great answer: “Good point — that could change the lever, not just where I aim it. If the fall is concentrated on a few routes, I need to know why before assuming price is the fix.”

*After*

*When the interviewer pointed out that network averages can hide route-level problems, you said "I'd say that's a refinement of the same answer, not a different one."*

This was the moment to recognize that a route-level problem could change the lever itself, not just where you apply it. Being open to the possibility here would have shown you follow evidence rather than defend an early answer.

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
| Quotes inside the new text verbatim from the candidate | 40 of 40 |
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

*In the opening, when the interviewer asked for the full structure before any data, you said "Honestly, I think I can already give you my answer, and the structure will fall out of it."*

The answer skipped the structure and went straight to a recommendation built on cost inflation and rising click prices, such as "Software businesses like this have seen input costs climb hard", which no case data supported. Interviewers want to see how you would break the problem down before you commit to an answer, and a conclusion resting on unsupported assumptions is hard to trust.

**Next time, try laying out the main areas you would examine and how they link to the CEO's decision before offering any recommendation.**

> “Software businesses like this have seen input costs climb hard: cloud hosting, payment processing on the "get paid" feature, and most of all paid acquisition”

**To work on 2**

*Before*

The candidate initially ranked the plan interaction as second-order, which treated the plans as independent even though that is where the answer actually sat, and the four buckets came only after two prompts and had no sub-points. Once pressed, the candidate accepted that the Pro interaction mattered and raised it to a co-equal bucket, with a reason tied to the $60 price gap.

> “And I'd test the first two first, because that's literally the 3x ratio the board cares about. Three and four are second-order.”
> “Fair challenge — if Starter is pulling customers who would otherwise have paid $100, that's a $60 hole per switcher, and it could be big enough to swamp the Starter unit economics entirely. So I'll upgrade it from second-order to co-equal with the other two.”

*After*

*In the opening, when asked which areas you would test first, you said "Three and four are second-order", putting the interaction with Pro behind the other areas.*

Ranking the Pro interaction as second-order treated the two plans as independent, even though that is where the answer actually sat, and your four areas came only after two prompts and had no sub-points. Once pressed, you accepted it mattered and raised it to co-equal, with a reason tied to the $60 price gap: "that's a $60 hole per switcher". In a pricing case with two linked products, how the products affect each other often decides the answer, so it needs to sit at the centre of the plan from the start.

**Next time, try offering your areas on the first request, each with two or three sub-points, and ask yourself which one most likely holds the answer before ranking them.**

> “And I'd test the first two first, because that's literally the 3x ratio the board cares about. Three and four are second-order.”
> “Fair challenge — if Starter is pulling customers who would otherwise have paid $100, that's a $60 hole per switcher, and it could be big enough to swamp the Starter unit economics entirely. So I'll upgrade it from second-order to co-equal with the other two.”

**To work on 3**

*Before*

The candidate claimed the decision didn't depend on the analysis. That cuts the link between the structure and the choice it is meant to inform.

> “But I'd note that whichever way those numbers land, the action is the same.”

*After*

*In the opening, when asked for your main areas and what you would test first, you said "But I'd note that whichever way those numbers land, the action is the same."*

This claimed the decision would not depend on the analysis, which cuts the link between your structure and the choice it is meant to inform. A structure is only useful if its results could change the recommendation, so saying they cannot makes the analysis look pointless.

**Next time, try stating for each area what result would push you toward keeping, repricing or shutting down Starter.**

**Missed moment 1**

*Before*

Turn 2, when the interviewer asked for the full structure before any data was shared.

A great answer: “The goal is to maximize total value from the plan line, not just to pass a ratio. I'd look at four things. First, standalone economics by plan: margin, churn, CAC, then LTV/CAC. Second, interactions: Starter customers upgrading to Pro, which helps, and Starter taking Pro sign-ups, which hurts. Third, options: keep at $40, reprice, change features, or shut down. Fourth, the market: competitor entry prices and what small businesses will pay. I'd start with the interactions, because a plan can fail 3x on its own and still be worth keeping if it feeds Pro.”

*After*

*In the opening, the interviewer asked you to lay out the full structure and how the areas fit together before any data was shared.*

The answer went to a recommendation instead, so the chance to set out a complete plan, including how the two plans affect each other, passed by. A clear opening plan shapes the whole case and shows the interviewer where you expect the answer to lie.

Next time, try something like: “The goal is to maximize total value from the plan line, not just to pass a ratio. I'd look at four things. First, standalone economics by plan: margin, churn, CAC, then LTV/CAC. Second, interactions: Starter customers upgrading to Pro, which helps, and Starter taking Pro sign-ups, which hurts. Third, options: keep at $40, reprice, change features, or shut down. Fourth, the market: competitor entry prices and what small businesses will pay. I'd start with the interactions, because a plan can fail 3x on its own and still be worth keeping if it feeds Pro.”

### Quantitative & Analytical Rigor — adequate (unchanged)

**Strength 1**

*Before*

The price-test valuation was set up and computed correctly: about $2.08M a month at $40 versus $2.32M at $60, a gain of roughly $240k a month.

> “At $40: Starter 1,000 × $1,100 net = $1,100k. Pro 350 × ($4,000 − $1,200) = $980k. Total ≈ $2,080k.”
> “So $60 is worth about $240k a month more, roughly $2.9m a year”

*After*

*When reading the price-test exhibit, you valued both price points, saying "At $40: Starter 1,000 × $1,100 net = $1,100k. Pro 350 × ($4,000 − $1,200) = $980k. Total ≈ $2,080k."*

The valuation was set up and computed correctly: about $2.08M a month at $40 versus $2.32M at $60, a gain of roughly $240k a month. Turning a test result into a clear monthly value gap is exactly what lets a client make a pricing call.

**Keep valuing each option in full, including the effect on the other plan, and stating the difference in dollars.**

> “So $60 is worth about $240k a month more, roughly $2.9m a year”

**Strength 2**

*Before*

The candidate built an accurate churn breakeven for the $60 price and stated what it means for the decision.

> “If upgrades held at 20% ($800), standalone would need to be $700 — $50/0.0714, a 7.1% cancellation rate. So churn could worsen from 5% to about 7% before $60 stops winning.”

*After*

*When asked what worse churn and upgrades at $60 would do to your recommendation, you said "So churn could worsen from 5% to about 7% before $60 stops winning."*

You built an accurate churn breakeven for the $60 price and stated what it means for the decision. A breakeven tells the client how much can go wrong before the decision flips, which is often more useful than a single estimate.

**Keep working out the breakeven point for your key risk and saying plainly what it means for the choice.**

> “If upgrades held at 20% ($800), standalone would need to be $700 — $50/0.0714, a 7.1% cancellation rate. So churn could worsen from 5% to about 7% before $60 stops winning.”

**To work on 1**

*Before*

The candidate questioned the approximation behind the 4.2% figure and bracketed the result instead of defending a single point. Even so, several conceptual errors went uncaught until the interviewer flagged them. LTV was first built on price ($100/0.02 = $5,000) rather than margin. Starter churn was taken as the 7.4% total exit rate, and later as 4.2%, rather than the 5% read directly from month-1 cancellations. Correct figures: Starter $30 ÷ 5% = $600, plus $800 of upgrade value, gives $1,400 (4.7×).

> “LTV ≈ $100/0.02 = $5,000 against $1,200 CAC — about 4.2x.”
> “Using the total exit rate of 7.4%/month, $30 / 0.074 ≈ $405 of standalone Starter value.”
> “cancellations and upgrades are competing exits from the same pool, so treating 60% as a clean "survival" curve isn't quite right”

*After*

*Reading the cohort and economics exhibits, you first said "LTV ≈ $100/0.02 = $5,000 against $1,200 CAC — about 4.2x."*

You did question the approximation behind the 4.2% figure and bracketed the result instead of defending one number, noting "cancellations and upgrades are competing exits from the same pool". Even so, several conceptual errors stayed in place until the interviewer flagged them: lifetime value was first built on price rather than margin, and Starter churn was taken as the 7.4% total exit rate and later 4.2%, rather than the 5% read directly from month-1 cancellations; the correct figures are $30 ÷ 5% = $600, plus $800 of upgrade value, giving $1,400 (4.7×). Errors in the basic inputs carry through every later number, and an interviewer will notice when the corrections come from them rather than from you.

**Next time, try checking two things before any lifetime value calculation: whether you are using margin, and whether your churn rate counts only customers who actually leave.**

> “Using the total exit rate of 7.4%/month, $30 / 0.074 ≈ $405 of standalone Starter value.”
> “cancellations and upgrades are competing exits from the same pool, so treating 60% as a clean "survival" curve isn't quite right”

**To work on 2**

*Before*

The cannibalization sizing used the wrong $905 net figure and needed an interviewer correction to reach $1,100.

> “the blended per-sign-up value is $1,205 less $300 CAC = $905 net”

*After*

*Sizing cannibalization from the volume exhibit, you said "the blended per-sign-up value is $1,205 less $300 CAC = $905 net".*

The sizing rested on the wrong $905 net figure, and it took an interviewer correction to reach $1,100. When a key input is off, the whole comparison built on it is off too.

**Next time, try re-checking your per-customer value against the latest data before using it to size anything larger.**

**To work on 3**

*Before*

The upgrade threshold given in the final answer was imprecise. With churn unchanged, $60 keeps winning until upgrades fall below 12.5% ($1,000 + u × $4,000 = $1,500), not 15%.

> “but a drop in upgrades below 15% would hurt more”

*After*

*In your final recommendation, you said "but a drop in upgrades below 15% would hurt more".*

The upgrade threshold was imprecise: with churn unchanged, $60 keeps winning until upgrades fall below 12.5% ($1,000 + u × $4,000 = $1,500), not 15%. Thresholds in a recommendation become monitoring triggers, so an imprecise one can lead the client to act at the wrong time.

**Next time, try writing out the one-line breakeven equation for each threshold before you state it.**

**Missed moment 1**

*Before*

Turn 11, reading the Starter cohort status table.

A great answer: “Month 1 shows 5% cancelled and 1% upgraded, and cancellations are steady. So Starter churn is 5%, not the 6% total exit — upgraders don't leave. Using margin, LTV is $30 ÷ 5% = $600, plus 20% × $4,000 = $800 of upgrade value, so $1,400 on a $300 CAC, or 4.7×.”

*After*

*Reading the Starter cohort status table, when asked what it told you about the board's rule, you worked from "only 40% still on Starter at 12 months".*

The month-1 figures already gave the cancellation rate directly, and using them with margin would have produced the right value without the compounding shortcut. Picking the simplest correct figure from an exhibit saves time and avoids errors that ripple through later numbers.

Next time, try something like: “Month 1 shows 5% cancelled and 1% upgraded, and cancellations are steady. So Starter churn is 5%, not the 6% total exit — upgraders don't leave. Using margin, LTV is $30 ÷ 5% = $600, plus 20% × $4,000 = $800 of upgrade value, so $1,400 on a $300 CAC, or 4.7×.”

### Data & Exhibit Interpretation — adequate (unchanged)

**Strength 1**

*Before*

From the cohort exhibit, the candidate saw that the 20% who upgrade are what the CFO's standalone test leaves out.

> “So the CFO is undercounting upgrades, and I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap.”

*After*

*Reading the cohort exhibit, you said "So the CFO is undercounting upgrades, and I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap."*

You saw that the 20% who upgrade are what the CFO's standalone test leaves out. Spotting what the client's own test misses is often the key insight that resolves the disagreement.

**Keep asking what a client's measure leaves out when it seems to contradict the data.**

**Strength 2**

*Before*

On the volume exhibit, the candidate set the 150 lost Pro sign-ups against the 200 upgrades a month and drew a clear so-what.

> “But 20% of 1,000 Starters, 200 a month, upgrade to Pro. So Pro intake is actually higher than before, and those 200 cost $300 rather than $1,200 to land.”

*After*

*When the volume figures were shared, you said "But 20% of 1,000 Starters, 200 a month, upgrade to Pro. So Pro intake is actually higher than before, and those 200 cost $300 rather than $1,200 to land."*

You set the 150 lost Pro sign-ups against the 200 upgrades a month and drew a clear so-what. Netting the loss against the gain is what turns a worrying number into a usable conclusion.

**Keep weighing each loss against its offsetting gain and stating what the net result means.**

**Strength 3**

*Before*

The candidate proposed a relevant next question on how many Starter customers were trading down from Pro.

> “Do we have any sense of what share of Starter sign-ups are genuinely new versus Pro leads trading down?”

*After*

*While discussing the economics exhibit, you asked "Do we have any sense of what share of Starter sign-ups are genuinely new versus Pro leads trading down?"*

You proposed a relevant next question on how many Starter customers were trading down from Pro. Asking for the data that matters most to the decision shows you are steering the case, not just reacting.

**Keep naming the specific data that would settle your biggest open question.**

**To work on 1**

*Before*

The candidate misread the Starter cohort, treating the drop in 'still on Starter' as churn, even though upgraders didn't leave and month-1 cancellations were simply 5%.

> “Starter: only 40% still on Starter at 12 months, so 0.4^(1/12) ≈ 0.926, about 7.4% leaving per month.”

*After*

*Reading the Starter cohort exhibit, you said "Starter: only 40% still on Starter at 12 months, so 0.4^(1/12) ≈ 0.926, about 7.4% leaving per month."*

The drop in customers still on Starter was read as churn, even though upgraders did not leave and month-1 cancellations were simply 5%. Misreading what a row in an exhibit measures can flip a plan from pass to fail.

**Next time, try stating what each line of a table measures, and reading the simplest figure first, before doing any calculation.**

**To work on 2**

*Before*

The economics exhibit was waved through as confirmation rather than read on its own terms, and its definition of lifetime was then applied with a compounding shortcut that gave 4.2%.

> “This confirms the numbers I just ran, so no change to the conclusion”

*After*

*When shown the economics exhibit and asked what you took from it, you said "This confirms the numbers I just ran, so no change to the conclusion".*

The exhibit was treated as confirmation rather than read on its own terms, and its definition of lifetime was then applied with a compounding shortcut that gave 4.2%. New exhibits often carry the correction the interviewer wants you to find, so reading them as confirmation can hide it.

**Next time, try reading each new exhibit fresh, noting its definitions and figures, before comparing it with your earlier numbers.**

**Missed moment 1**

*Before*

Turn 25, reading the price-test exhibit.

A great answer: “At $60, Starter sign-ups fall by 200 but Pro rises by 50, so some trade-downs come back. That fits the $20 gap, and $60 is still well under Pro. The catch is that eight weeks can't show churn or upgrade rates. Next, I'd work out the churn and upgrade levels at which $60 stops beating $40.”

*After*

*Reading the price-test exhibit, you went straight to valuation, starting with "This is the test I was hoping for."*

The movement in sign-ups across both plans, and what an eight-week test can and cannot show, was a chance for a short plain reading before the maths. Saying what the exhibit shows in plain terms first helps the interviewer follow your logic and see the limits of the data.

Next time, try something like: “At $60, Starter sign-ups fall by 200 but Pro rises by 50, so some trade-downs come back. That fits the $20 gap, and $60 is still well under Pro. The catch is that eight weeks can't show churn or upgrade rates. Next, I'd work out the churn and upgrade levels at which $60 stops beating $40.”

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

The rollout plan was practical: new customers only, existing Starter customers grandfathered, and results tracked by cohort.

> “roll $60 to new customers only, grandfather existing Starters, and track month-3 and month-6 cancellation and upgrade rates before touching the base.”

*After*

*In your final recommendation, you proposed to "roll $60 to new customers only, grandfather existing Starters, and track month-3 and month-6 cancellation and upgrade rates before touching the base."*

The rollout plan was practical: new customers only, existing Starter customers grandfathered, and results tracked by cohort. A careful rollout shows the client how to act on the advice without taking on unnecessary risk.

**Keep pairing your recommendation with a low-risk way to put it into practice.**

**Strength 2**

*Before*

The candidate set explicit monitoring thresholds and a rollback trigger, which mitigates the main risk.

> “If it's under $1,200 by month six, I'd roll back to the mid-forties rather than hold.”

*After*

*Asked how you would know it was working six months in, you said "If it's under $1,200 by month six, I'd roll back to the mid-forties rather than hold."*

You set explicit monitoring thresholds and a rollback trigger, which mitigates the main risk. Clear triggers let the client act quickly if the risk you named actually shows up.

**Keep attaching a specific number and a fallback action to each risk you raise.**

**To work on 1**

*Before*

The opening recommendation rested on invented cost-inflation and price-elasticity assumptions that the case never supported.

> “So the $40 price point was set against an older cost base and no longer covers it.”
> “If you can triple volume with a $60 price cut, you almost certainly didn't need to cut all the way to $40”

*After*

*In the opening, explaining your early recommendation, you said "So the $40 price point was set against an older cost base and no longer covers it" and "If you can triple volume with a $60 price cut, you almost certainly didn't need to cut all the way to $40".*

The opening recommendation rested on cost-inflation and price-elasticity assumptions that you introduced yourself and that the case never supported. Building on invented assumptions puts the whole answer at risk once real data arrives.

**Next time, try labelling any early idea as something to test and naming the data that would confirm or reject it.**

**To work on 2**

*Before*

The recommended price moved from $55 to $60 between consecutive turns without any explanation of what changed.

> “So: still recommend moving up, but to $55 rather than $60”
> “Recommendation: keep Starter, and raise the price to $60.”

*After*

*Under questioning on the risks of $60, you said "So: still recommend moving up, but to $55 rather than $60", then in the final answer said "Recommendation: keep Starter, and raise the price to $60."*

The recommended price moved from $55 to $60 between consecutive answers without any explanation of what changed. An unexplained change in the headline number makes the recommendation look unstable.

**Next time, try saying explicitly what new fact moved your number whenever you change it.**

**Missed moment 1**

*Before*

Turn 3, asked for a structure, the candidate instead asserted a cost-inflation story.

A great answer: “My working hypothesis is that Starter may fail 3x on its own but create value through upgrades. I'll hold off recommending until I see the economics and the interaction with Pro.”

*After*

*In the opening, asked for a structure, you instead offered a cost-inflation story: "So the $40 price point was set against an older cost base and no longer covers it."*

A working idea, held loosely and tied to the data needed to test it, would have kept the door open without committing early. Stating an early view as something to test, not a conclusion, shows judgment and keeps you flexible when data arrives.

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

*In your final recommendation, you opened with "Recommendation: keep Starter, and raise the price to $60." and supported it with points like "200 upgrades a month more than replace the 150 cannibalized Pro sign-ups, at a quarter of the cost."*

The final answer led with the recommendation and gave three reasons, each tied to the analysis. Leading with the answer and backing it with numbers is what a busy executive needs.

**Keep opening with the recommendation and giving a short list of reasons tied to your numbers.**

> “Two, Starter is the better Pro acquisition channel: 200 upgrades a month more than replace the 150 cannibalized Pro sign-ups, at a quarter of the cost.”

**Strength 2**

*Before*

The answer named the key risk with a quantified threshold, plus concrete next steps, but two figures were imprecise. The upgrade threshold should be 12.5%, not 15%. The ratio also mixed net and gross: $1,100 is the net value, and 4.7× is $1,400 ÷ $300.

> “My math says churn can drift from 5% to about 7% before $60 stops winning”
> “$1,100 net value per sign-up on a $300 CAC, about 4.7x”

*After*

*In your final recommendation, you said "My math says churn can drift from 5% to about 7% before $60 stops winning" and "$1,100 net value per sign-up on a $300 CAC, about 4.7x".*

You named the key risk with a quantified threshold, plus concrete next steps, but two figures were imprecise. The upgrade threshold should be 12.5%, not 15%, and the ratio mixed net and gross: $1,100 is the net value, while 4.7× is $1,400 ÷ $300. Quantified risks make a recommendation credible, but only if the numbers behind them are consistent.

**Keep naming risks with a number attached, and check that each ratio uses matching figures before you say it.**

**Missed moment 1**

*Before*

Turn 29, closing the recommendation.

A great answer: “Starter is worth $1,400 per sign-up against a $300 CAC, or 4.7×. Netting cannibalization, a month of sign-ups is worth $2.08M with Starter versus $1.40M with Pro only. At $60 it rises to $2.32M, and that holds unless churn passes about 7% or upgrades fall below 12.5%.”

*After*

*Closing your final recommendation to the CEO, you summed up with "Recommendation: keep Starter, and raise the price to $60."*

The close could have pulled the corrected figures together into a single picture of total monthly value with and without Starter, plus the limits at which the call would change. A closing summary built on total value gives the CEO one clear comparison to act on.

Next time, try something like: “Starter is worth $1,400 per sign-up against a $300 CAC, or 4.7×. Netting cannibalization, a month of sign-ups is worth $2.08M with Starter versus $1.40M with Pro only. At $60 it rises to $2.32M, and that holds unless churn passes about 7% or upgrades fall below 12.5%.”

### Communication & Delivery — adequate (unchanged)

**Strength 1**

*Before*

Later turns were answer-first and well signposted, with numbered points.

> “Four things. One, month-3 and month-6 cancellation for the $60 cohort versus the 5% monthly baseline”

*After*

*Asked how you would know the change was working, you said "Four things. One, month-3 and month-6 cancellation for the $60 cohort versus the 5% monthly baseline".*

Later answers put the answer first and told the listener what was coming, with numbered points. Numbered, answer-first replies are easy for an interviewer to follow and note down.

**Keep announcing how many points you have and walking through them in order.**

**Strength 2**

*Before*

The candidate picked up the interviewer's margin cue and reframed cleanly.

> “Right — "worth" should be gross margin, not revenue.”

*After*

*When the interviewer asked whether the board's rule measures worth by price or by margin, you said "Right — "worth" should be gross margin, not revenue."*

You picked up the interviewer's margin cue and reframed cleanly. Responding quickly and cleanly to a cue shows you can take direction without losing your footing.

**Keep acknowledging a cue directly and showing how it changes your approach.**

**To work on 1**

*Before*

In the opening, the candidate brushed off repeated requests for a structure, which made the early turns hard to follow and confrontational.

> “That's the recommendation. The areas to check are just the pieces of it — price, cost, retention.”

*After*

*In the opening, after being asked for a structure, you said "That's the recommendation. The areas to check are just the pieces of it — price, cost, retention."*

The repeated requests for a structure were brushed aside, which made the early answers hard to follow and confrontational. When an interviewer asks for something more than once, setting it aside sends a signal about how you would work with a client.

**Next time, try giving the interviewer exactly what they ask for first, then adding your own view after.**

**To work on 2**

*Before*

The candidate repeated the price-raise conclusion at the end of almost every turn, even when it wasn't the question asked.

> “So the conclusion doesn't turn on the precision. Keep Starter — and raise price.”

*After*

*Asked only for the steps behind your 4.2% figure, you closed with "So the conclusion doesn't turn on the precision. Keep Starter — and raise price."*

The price-raise conclusion was repeated at the end of almost every answer, even when it was not the question asked. Repeating the same conclusion can come across as not listening and makes it harder to see the new point in each answer.

**Next time, try ending each answer on the question that was actually asked and saving the recommendation for when it is requested.**

**Missed moment 1**

*Before*

Turn 2, when the interviewer asked for the main areas and how they fit together.

A great answer: “I'll lay out four areas, say how they connect to the CEO's decision, and then tell you where I'd start and why.”

*After*

*In the opening, the interviewer asked for the main areas and how they fit together.*

A one-line preview of what you were about to lay out would have shown the interviewer you were answering their question. Telling the listener the shape of your answer up front makes everything after it easier to follow.

Next time, try something like: “I'll lay out four areas, say how they connect to the CEO's decision, and then tell you where I'd start and why.”

### Pushback, Composure & Case Leadership — adequate (unchanged)

**Strength 1**

*Before*

The candidate incorporated the interviewer's 5% correction and used it to drive a quantified stress test.

> “Taking 5% as the cancellation rate: Starter standalone at $40 is $30/0.05 = $600, plus $800 upgrade = $1,400, less $300 = $1,100 net.”

*After*

*After the interviewer corrected the cancellation rate, you said "Taking 5% as the cancellation rate: Starter standalone at $40 is $30/0.05 = $600, plus $800 upgrade = $1,400, less $300 = $1,100 net."*

You took on the interviewer's 5% correction and used it to drive a quantified test of how far things could worsen. Absorbing a correction smoothly and building on it shows composure under challenge.

**Keep folding corrections straight into your numbers and moving the analysis forward.**

**To work on 1**

*Before*

The candidate was initially defensive when challenged on structure and anchored on a conclusion reached before seeing any data. Later, when the evidence warranted it, the candidate updated with stated reasoning, dropping the cost-inflation thesis and switching to margin.

> “Fair, but I'd push back a little — I don't think I'm missing a structure”
> “Which is the recommendation I've been making since the start, now with evidence behind it.”
> “I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap.”

*After*

*When challenged on structure in the opening, you said "Fair, but I'd push back a little — I don't think I'm missing a structure", and later said "Which is the recommendation I've been making since the start, now with evidence behind it."*

Your first response to the challenge was defensive and held on to a conclusion reached before seeing any data. Later, when the evidence warranted it, you updated with stated reasoning, saying "I'll concede my cost-inflation read isn't supported — $300 self-serve CAC is cheap" and switching to margin. Interviewers watch how you take challenge, and holding to an early view can look like defending a position rather than following the evidence.

**Next time, try treating an early challenge as a prompt to step back, and drop your initial view as readily as you did once the data came in.**

**Missed moment 1**

*Before*

Turn 6, when the interviewer said the recommendation rested on unevidenced cost inflation and elasticity.

A great answer: “That's fair — I got ahead of the data. Let me set the hypothesis aside, lay out the areas properly, and test it against the numbers.”

*After*

*In the opening, the interviewer said your recommendation rested on cost inflation and price elasticity that had no evidence, and you replied "Fair, but I'd push back a little".*

This was a chance to accept the point briefly and reset, rather than defend the earlier answer. Acknowledging a fair challenge quickly builds credibility and gets the case back on track.

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
| Quotes inside the new text verbatim from the candidate | 42 of 42 |
| Rewrites that passed the tone audit | 31 of 33 — refused: quantitative.needsWork.2 (figure added: 100%); communication.needsWork.1 (quote not in the candidate's words: "two parts: first…, second….") |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 8 → 1 |
| "you did not / never / failed / could not", before → after | 3 → 1 |

### Problem Structuring — needs work (unchanged)

**To work on 1**

*Before*

You anchored the opening on the profit equation with revenue and cost branches, a relevant starting point, but the framework stayed generic and left out volume on the revenue side until the interviewer prompted you twice.

> “which includes price and, you know, potentially, our mix of products as well as cost, which is, like, fixed and variable cost”
> “I think potentially the, um, the units sold”
> “you know, because profit equals revenue minus costs.”

*After*

*In the opening, when asked how you would approach the drop in margin from 24% to 6%, you said "profit equals revenue minus costs" and split revenue into "price and, you know, potentially, our mix of products".*

Starting from the profit equation with revenue and cost branches was a relevant first step. The framework stayed generic, though, and volume on the revenue side only came in as "the units sold" after the interviewer had asked about gaps twice. Interviewers expect an opening framework that fits the specific client and covers the obvious drivers without having to be prompted.

**Next time, try writing revenue as volume times price, plus mix, before you start talking, so every revenue driver is on the page from the start.**

> “which includes price and, you know, potentially, our mix of products as well as cost, which is, like, fixed and variable cost”
> “I think potentially the, um, the units sold”
> “you know, because profit equals revenue minus costs.”

**To work on 2**

*Before*

On the MECE pressure test you called your own structure messy but did not fix it or say what was missing, so the interviewer had to lead you through the gaps.

> “Yeah. I think it's messy.”

*After*

*In the follow-up on your opening structure, when the interviewer asked whether it had any gaps or overlaps and what was missing, you said "Yeah. I think it's messy."*

You called your own structure messy but left it as it was and named nothing that was missing. The interviewer then had to walk you through the gaps. When an interviewer questions your structure, they want to see you repair it on the spot, not only agree that it has problems.

**Next time, try naming the specific gap and restating the corrected structure in the same answer.**

**To work on 3**

*Before*

When asked to prioritize, you picked cost first with a reason tied to the case facts, but you did not prioritize until prompted. The cost branch also stayed at fixed vs. variable rather than a coffee chain's real cost lines (COGS, labor, rent/overhead) until the interviewer pushed.

> “I'd like to look at, um, like, fixed and variable cost.”
> “I would like to check cost first because revenue has been increasing.”

*After*

*In the follow-up on your opening structure, you chose "I would like to check cost first because revenue has been increasing", after earlier framing cost only as "fixed and variable cost".*

Your choice of cost came with a reason tied to the case facts, but you only ranked the branches once prompted. The cost side also stayed at fixed versus variable rather than a coffee chain's real cost lines (COGS, labor, rent/overhead) until the interviewer pushed. Ranking your branches on your own initiative and using cost lines that fit the business shows you can lead the case rather than follow it.

**Next time, try stating which branch you would check first, and why, right at the end of your opening, with costs broken into the client's actual cost lines.**

> “I'd like to look at, um, like, fixed and variable cost.”

**Missed moment 1**

*Before*

Turn 1, the opening framework for a margin that fell from 24% to 6% while revenue grew 15%.

A great answer: “Our goal is to find why margin fell 18 points despite 15% revenue growth and how to restore it. Profit is revenue minus cost. Revenue is volume times price, plus mix. Costs split into COGS (beans, dairy, packaging, food), labor, and rent/overhead. Since revenue grew, my hypothesis is that costs outpaced pricing, so I'd start with each cost line as a percentage of revenue and then check whether we raised prices and whether competitors face the same input inflation.”

*After*

*In the opening, when asked how you would approach a margin that fell from 24% to 6% while revenue grew 15%, you began with "profit equals revenue minus costs."*

The framework stayed general, with no goal stated, no volume, and costs split only into fixed and variable. A sharp, client-specific opening sets the direction for the whole case and shows the interviewer you can lead it.

Next time, try something like: “Our goal is to find why margin fell 18 points despite 15% revenue growth and how to restore it. Profit is revenue minus cost. Revenue is volume times price, plus mix. Costs split into COGS (beans, dairy, packaging, food), labor, and rent/overhead. Since revenue grew, my hypothesis is that costs outpaced pricing, so I'd start with each cost line as a percentage of revenue and then check whether we raised prices and whether competitors face the same input inflation.”

**Missed moment 2**

*Before*

Turn 2, when asked "Is that structure MECE, and what's missing from it?"

A great answer: “Not quite. Fixed vs. variable overlaps with how I'd actually look at the P&L, and I left out volume. Let me restate it: revenue = volume × price × mix, and costs = COGS, labor, overhead. I'd prioritize costs and pricing, since revenue is growing but margin collapsed.”

*After*

*In the follow-up on your opening structure, when asked whether it had gaps or overlaps and what was missing, you answered "Yeah. I think it's messy."*

This was a chance to name the gap and restate a cleaner structure on the spot. Fixing your own structure when questioned shows you can take feedback and improve quickly.

Next time, try something like: “Not quite. Fixed vs. variable overlaps with how I'd actually look at the P&L, and I left out volume. Let me restate it: revenue = volume × price × mix, and costs = COGS, labor, overhead. I'd prioritize costs and pricing, since revenue is growing but margin collapsed.”

### Quantitative & Analytical Rigor — needs work (unchanged)

**To work on 1**

*Before*

You asserted a 10% price increase without deriving it and could not explain it when asked.

> “Yeah. Ten percent.”
> “I'm not sure.”

*After*

*In the questions after your recommendation, when the interviewer asked about the two ways a margin can fall, you answered "Yeah. Ten percent.", and earlier, at the exhibit, you answered "I'm not sure." when asked how to test the cost explanation.*

You gave a 10% price increase with no working behind it. When asked how you got it, you could not explain it. In a real interview, a number you cannot explain carries no weight and weakens trust in the rest of your analysis.

**Next time, try writing out the calculation step by step before you state any figure.**

**To work on 2**

*Before*

You claimed the 10% increase restores the margin without doing any arithmetic. In fact, costs are 94% of revenue today (58 + 22 + 14), so a 10% price rise brings them to 94/110 ≈ 85.5% of revenue, a margin of about 14.5%, not back near 24%.

> “Yes. It does.”

*After*

*In the questions after your recommendation, when the interviewer asked how much a 10% price rise would lift the margin and whether that gets the client back near where they were, you said "Yes. It does."*

You said the 10% increase restores the margin without doing any arithmetic. In fact, costs are 94% of revenue today (58 + 22 + 14), so a 10% price rise brings them to 94/110 ≈ 85.5% of revenue, a margin of about 14.5%, not back near 24%. Agreeing to a claim without checking the numbers can lead you to a wrong recommendation that the interviewer will spot right away.

**Next time, try dividing today's costs by the new revenue to work out the resulting margin before answering yes or no.**

**To work on 3**

*Before*

Your revised figure was conceptually wrong. Input costs rising ~40% does not mean prices must rise ~50%. To restore a 24% margin with costs at 94% of today's revenue, revenue must rise to 94/0.76 ≈ 123.7, a price increase of about 23.7%, assuming volume and costs hold.

> “Oh, actually, it should be about fifty percent because their cost have increased by about forty percent.”

*After*

*(kept in the old wording — the audit refused the rewrite: figure added: 100%)*

**Missed moment 1**

*Before*

Turns 42–44, when the interviewer asked you to work out the gap using the 24% and 6% margins.

A great answer: “Costs are 58 + 22 + 14 = 94% of revenue today, which leaves a 6% margin. To get back to 24%, costs must be 76% of revenue, so revenue needs to be 94 / 0.76 ≈ 1.237 times today's level. That's roughly a 24% price increase if volume and costs hold. That's too much to take in one go, so I'd pair a targeted price rise with procurement savings.”

*After*

*In the questions after your recommendation, when the interviewer asked you to work out the gap using the 24% and 6% margins, you answered "I'm not sure."*

The figures needed to size the price increase were already on the table. Turning the case figures into a required price change is the calculation that makes a recommendation credible.

Next time, try something like: “Costs are 58 + 22 + 14 = 94% of revenue today, which leaves a 6% margin. To get back to 24%, costs must be 76% of revenue, so revenue needs to be 94 / 0.76 ≈ 1.237 times today's level. That's roughly a 24% price increase if volume and costs hold. That's too much to take in one go, so I'd pair a targeted price rise with procurement savings.”

**Missed moment 2**

*Before*

Turn 20, after learning beans are 25% of COGS.

A great answer: “COGS was 42% of revenue, so beans were about 10.5 points and other inputs about 31.5 points. Beans up 40% adds about 4.2 points. Other inputs up 37.5% add about 11.8 points. That's roughly 16 points total, which matches the COGS jump from 42% to 58%. So non-bean inputs drive about three-quarters of the increase.”

*After*

*At the exhibit, after learning beans were 25% of COGS, you said "the other input costs make up a much larger portion."*

The direction was right, and the numbers were there to size how much each input added. Sizing each driver shows exactly how much of the problem you have explained.

Next time, try something like: “COGS was 42% of revenue, so beans were about 10.5 points and other inputs about 31.5 points. Beans up 40% adds about 4.2 points. Other inputs up 37.5% add about 11.8 points. That's roughly 16 points total, which matches the COGS jump from 42% to 58%. So non-bean inputs drive about three-quarters of the increase.”

### Data & Exhibit Interpretation — adequate (unchanged)

**Strength 1**

*Before*

You went inside COGS, asked for the composition data needed to size each input, and reached the right directional conclusion that non-bean inputs matter more.

> “I'd like to see, uh, what percentage, um, these particular line line items, uh, make up.”
> “And the other input costs make up a much larger portion. And so I think the the problem more so lies in with the increase in the input costs of the dairy packaging and food.”

*After*

*At the exhibit, you asked "I'd like to see, uh, what percentage, um, these particular line line items, uh, make up" and then concluded "the problem more so lies in with the increase in the input costs of the dairy packaging and food."*

You looked inside COGS and asked for the breakdown needed to size each input. You then reached the right directional conclusion that non-bean inputs matter more. Asking for the data that lets you size each driver is exactly how strong candidates find the real cause.

**Keep asking for the breakdown that lets you size each driver before you draw a conclusion.**

> “And the other input costs make up a much larger portion. And so I think the the problem more so lies in with the increase in the input costs of the dairy packaging and food.”

**To work on 1**

*Before*

You read the exhibit line by line and correctly isolated COGS as the main driver, with labor flat and overhead up slightly, but you described it only qualitatively. You never quantified that COGS accounted for 16 of the 18 lost points (42% to 58%) and overhead for 2 (12% to 14%).

> “main issue is COGS, which has dramatically increased”
> “So I see our labor has stayed steady. I see overhead has been slightly increasing over time. However, main issue is COGS, which has dramatically increased and which makes up a large portion of the problem with profit.”

*After*

*At the exhibit, when asked which cost line to focus on, you said "So I see our labor has stayed steady. I see overhead has been slightly increasing over time. However, main issue is COGS, which has dramatically increased".*

You read the exhibit line by line and correctly singled out COGS as the main driver, with labor flat and overhead up slightly. The description stayed qualitative, though, and the answer left out that COGS accounted for 16 of the 18 lost points (42% to 58%) and overhead for 2 (12% to 14%). Putting numbers on each driver shows the interviewer how much of the problem you have explained.

**Next time, try stating the change in each cost line in percentage points and checking that they add up to the total margin drop.**

> “So I see our labor has stayed steady. I see overhead has been slightly increasing over time. However, main issue is COGS, which has dramatically increased and which makes up a large portion of the problem with profit.”

**Missed moment 1**

*Before*

Turn 22, when asked how to test whether the cost increase fully explains the margin drop.

A great answer: “The cost lines add up exactly: COGS +16 points and overhead +2 equals the 18-point drop, so costs explain it in a mechanical sense. The real question is why revenue didn't keep pace. Revenue grew 15% while inputs rose ~38%, so I'd want to know whether we changed menu prices and whether volume or mix shifted.”

*After*

*At the exhibit, when asked how to test whether the cost increase fully explains the margin drop and what revenue data you would want, you answered "I'm not sure."*

Adding up the cost-line changes and turning to the revenue side would have answered both parts. Checking that the drivers add up to the total, then asking why revenue lagged, is how you get to the real root cause.

Next time, try something like: “The cost lines add up exactly: COGS +16 points and overhead +2 equals the 18-point drop, so costs explain it in a mechanical sense. The real question is why revenue didn't keep pace. Revenue grew 15% while inputs rose ~38%, so I'd want to know whether we changed menu prices and whether volume or mix shifted.”

### Business Judgment & Insight — adequate (unchanged)

**Strength 1**

*Before*

Your levers were practical and commercially sound: price selectively on less elastic products and secure better supply contracts.

> “on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts.”

*After*

*In the brainstorm, when asked for ideas to reverse the margin decline, you suggested "on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts."*

Your ideas were practical and commercially sound: raise prices selectively on less elastic products and secure better supply contracts. Ideas a client could actually act on show the interviewer you think like a business adviser.

**Keep offering concrete ideas that a client could put into practice.**

**To work on 1**

*Before*

You framed the root cause as purely a cost problem even after learning menu prices had not moved in two years. The insight that flat pricing against ~38% input inflation is half the story was not drawn out.

> “Because no change in price... in many pricing has occurred, essentially, the problem really is with the cost that we've experienced cost increases.”

*After*

*At the exhibit, after hearing menu prices had not changed in two years, you said "Because no change in price... in many pricing has occurred, essentially, the problem really is with the cost that we've experienced cost increases."*

You described the root cause as purely a cost problem even after learning prices had stayed flat. The point that flat pricing against ~38% input inflation is half the story was left unstated. Spotting that the client absorbed cost increases without passing them on is the central insight of this case.

**Next time, try comparing how much prices moved against how much costs moved, and stating the gap between them as part of the root cause.**

**To work on 2**

*Before*

Your assumption that a slight price increase would be enough was not realistic. Closing the gap requires roughly a 24% price increase, or a combination of pricing and procurement.

> “And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much.”

*After*

*In the recommendation, you said "And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much."*

The assumption that a slight price increase would be enough was not realistic. Closing the gap requires roughly a 24% price increase, or a combination of pricing and procurement. A recommendation that falls far short of the problem's size would not hold up in front of a CEO.

**Next time, try sizing the gap first and then checking whether your chosen lever is big enough to close it.**

**To work on 3**

*Before*

You named a realistic risk (volume loss) and a sensible mitigation (test which products can carry a premium), but only once the interviewer asked. No risks were raised proactively.

> “I think the biggest risk is that we'll lose volume if we take price on the wrong type of product.”

*After*

*In the questions after your recommendation, when asked for the biggest risk, you said "I think the biggest risk is that we'll lose volume if we take price on the wrong type of product."*

You named a realistic risk (volume loss) and a sensible way to reduce it (test which products can carry a premium), but only once the interviewer asked. No risks came up before that. Raising risks yourself shows the interviewer you have thought the recommendation through.

**Next time, try ending your recommendation with the main risk and how you would reduce it, before being asked.**

**Missed moment 1**

*Before*

Turn 29, after hearing menu prices were unchanged for two years.

A great answer: “So the root cause is that input costs rose roughly 38% and we passed none of it through to prices. That points to a pricing and procurement fix rather than cutting labor or overhead, which are already flat or lean. I'd also check whether competitors raised prices, since that tells us how much pricing power we have.”

*After*

*At the exhibit, after hearing menu prices were unchanged for two years, you concluded "the problem really is with the cost."*

This was the moment to connect flat prices with rising input costs as the root cause. Drawing out that link is the key insight of the case and points straight to the right fix.

Next time, try something like: “So the root cause is that input costs rose roughly 38% and we passed none of it through to prices. That points to a pricing and procurement fix rather than cutting labor or overhead, which are already flat or lean. I'd also check whether competitors raised prices, since that tells us how much pricing power we have.”

### Creativity & Brainstorming — adequate (unchanged)

**Strength 1**

*Before*

You loosely organized your ideas into a price side and a cost side.

> “on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts.”

*After*

*In the brainstorm, you grouped your ideas as "on the price side, take selective price increases on, uh, less elastic products, and then also on the cost side, try to get better supply contracts."*

You loosely organized your ideas into a price side and a cost side. Grouping ideas makes them easier to follow and shows you are covering the problem in an orderly way.

**Keep sorting your ideas into clear groups as you share them.**

**Strength 2**

*Before*

When pushed for more levers, you added a distinct mix-shift idea.

> “Maybe we could advertise our products that have higher margin to begin with, so we force consumers to trade up.”

*After*

*In the brainstorm, when asked for ideas beyond price and supplier terms, you said "Maybe we could advertise our products that have higher margin to begin with, so we force consumers to trade up."*

When pushed for more ideas, you added a distinct one: shifting sales toward higher-margin products. Coming up with a genuinely different idea under pressure shows range in your thinking.

**Keep adding ideas that differ from the ones already on the table when the interviewer asks for more.**

**Missed moment 1**

*Before*

Turn 32, when asked for levers beyond price and supplier terms.

A great answer: “I'll think across product, operations, and customer. On product: trim low-margin SKUs, adjust portion and cup sizes, and launch a value blend for budget-sensitive stores. On operations: cut waste in dairy and food, and switch packaging specs. On customer: a loyalty program that nudges people toward higher-margin specialty drinks. I'd prioritize pricing plus procurement first because they hit the biggest gap fastest.”

*After*

*In the brainstorm, when asked for ideas beyond price and supplier terms, you offered one: "Maybe we could advertise our products that have higher margin to begin with, so we force consumers to trade up."*

A wider sweep across several areas of the business would have produced more distinct ideas. Interviewers reward a broad, organized set of ideas followed by a clear sense of which matter most.

Next time, try something like: “I'll think across product, operations, and customer. On product: trim low-margin SKUs, adjust portion and cup sizes, and launch a value blend for budget-sensitive stores. On operations: cut waste in dairy and food, and switch packaging specs. On customer: a loyalty program that nudges people toward higher-margin specialty drinks. I'd prioritize pricing plus procurement first because they hit the biggest gap fastest.”

### Synthesis & Recommendation — adequate (unchanged)

**Strength 1**

*Before*

You named the key risk and a next step to mitigate it.

> “And so I would do an analysis where I would try to see which products people would pay a premium for.”

*After*

*In the questions after your recommendation, when asked for the biggest risk and how to reduce it, you said "And so I would do an analysis where I would try to see which products people would pay a premium for."*

You named the key risk and a next step to reduce it. Pairing a risk with a concrete next step makes a recommendation feel ready to act on.

**Keep pairing each risk you name with a specific next step.**

**To work on 1**

*Before*

You committed to a clear recommendation, price increases, tied to the finding that prices had been flat, but the support was vague and unquantified. It did not reference the 16-point COGS rise, the ~38% input inflation, or how much price is needed.

> “And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much.”
> “I would choose... so, like, the price increases, we haven't increased our price in quite a while.”

*After*

*In the recommendation, when asked which idea to put in front of the CEO first, you said "I would choose... so, like, the price increases, we haven't increased our price in quite a while."*

You committed to a clear recommendation, price increases, tied to the finding that prices had been flat, but the support was vague and had no numbers. It left out the 16-point COGS rise, the ~38% input inflation, and how much price is needed. A CEO acts on a recommendation backed by the key numbers, not on a general sense that costs went up.

**Next time, try backing your recommendation with two or three numbers from the case, including how big the change needs to be.**

> “And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much.”

**To work on 2**

*Before*

You could not size the recommendation, even after a Level 2 narrowing hint. The interviewer had to lead, and your answers were unsupported claims rather than a defensible number.

> “I would see what the gap is and try to see, you know, if we can make it up for it with the price increase.”
> “Yes. It does.”

*After*

*In the questions after your recommendation, when asked which figures you would compare to size the price increase, you said "I would see what the gap is and try to see, you know, if we can make it up for it with the price increase."*

The recommendation stayed unsized, even after the interviewer narrowed the question. The interviewer had to lead, and answers such as "Yes. It does." were unsupported claims rather than a number you could defend. Being able to put a number on your own recommendation is one of the main things interviewers test at the end of a case.

**Next time, try saying out loud which two figures you would use and doing the division step by step, even if roughly.**

**Missed moment 1**

*Before*

Turn 34, when asked which lever to put in front of the CEO first.

A great answer: “I'd recommend selective price increases on specialty drinks, paired with procurement across beans, dairy, and packaging. Three reasons. First, COGS drove 16 of the 18 lost margin points. Second, about three-quarters of that came from non-bean inputs. Third, menu prices haven't moved in two years while inputs rose ~38%. Restoring 24% fully would take ~24% on price alone, so I'd combine pricing with supplier savings. The key risk is volume loss, so next I'd test elasticity by SKU and check competitor pricing.”

*After*

*In the recommendation, when asked which idea to put in front of the CEO first, you chose price increases because "we haven't increased our price in quite a while."*

A recommendation with numbered reasons, figures from the case, a risk and next steps would have been much stronger. A clear, numbers-backed final answer is what a CEO, and an interviewer, remembers.

Next time, try something like: “I'd recommend selective price increases on specialty drinks, paired with procurement across beans, dairy, and packaging. Three reasons. First, COGS drove 16 of the 18 lost margin points. Second, about three-quarters of that came from non-bean inputs. Third, menu prices haven't moved in two years while inputs rose ~38%. Restoring 24% fully would take ~24% on price alone, so I'd combine pricing with supplier savings. The key risk is volume loss, so next I'd test elasticity by SKU and check competitor pricing.”

### Communication & Delivery — needs work (unchanged)

**Strength 1**

*Before*

At times you used hypothesis-driven phrasing to steer the case.

> “Um, I'm thinking that maybe it's not a revenue issue. It's more of a cost issue.”

*After*

*In the follow-up on your opening structure, when asked which area to check first, you said "Um, I'm thinking that maybe it's not a revenue issue. It's more of a cost issue."*

At times you stated a working guess about the answer and used it to steer the case. Stating a working guess gives your analysis direction and helps the interviewer follow your logic.

**Keep stating your working guess early and using it to pick where to look next.**

**To work on 1**

*Before*

Many of your answers were fragmentary or non-answers, which made your reasoning hard to follow and forced the interviewer to re-ask repeatedly.

> “Yeah. Ten percent.”
> “Yes. It does.”

*After*

*In the questions after your recommendation, you answered with short replies such as "Yeah. Ten percent." and "Yes. It does." when asked about how margins fall and to take the interviewer through the arithmetic.*

Many of your answers were fragments or did not answer the question. This made your reasoning hard to follow, and the interviewer had to ask again repeatedly. Interviewers judge your reasoning, and they cannot assess reasoning they do not hear.

**Next time, try giving your answer in a full sentence followed by one sentence explaining how you got there.**

**To work on 2**

*Before*

Your delivery had heavy filler and little signposting beyond the opening, and you sometimes lost track of the question.

> “Well, I like to see, um, like, fixed cost that would be, like, overhead labor and then variable cost.”
> “Can you repeat the question?”

*After*

*(kept in the old wording — the audit refused the rewrite: quote not in the candidate's words: "two parts: first…, second….")*

**Missed moment 1**

*Before*

Turn 23, when asked a two-part question about testing the cost explanation and revenue-side data.

A great answer: “Let me take that in two parts. First, to test whether costs explain the drop, I'd add up the cost-line changes against the 18-point decline. Second, on revenue, I'd want price changes, volume, and mix over the two years.”

*After*

*At the exhibit, when asked a two-part question about testing the cost explanation and what revenue data you would want, you answered "I'm not sure."*

Splitting the question into its two parts would have given you a way into an answer. Breaking a question into parts helps you think and lets the interviewer follow along.

Next time, try something like: “Let me take that in two parts. First, to test whether costs explain the drop, I'd add up the cost-line changes against the 18-point decline. Second, on revenue, I'd want price changes, volume, and mix over the two years.”

### Pushback, Composure & Case Leadership — needs work (unchanged)

**To work on 1**

*Before*

On the structure pressure test you conceded without fixing anything, leaving the interviewer to lead.

> “Yeah. I think it's messy.”

*After*

*In the follow-up on your opening structure, when the interviewer questioned whether it had gaps or overlaps, you said "Yeah. I think it's messy."*

You agreed with the challenge without fixing anything, which left the interviewer to lead. How you respond to a challenge shows whether you can take charge of a case under pressure.

**Next time, try answering a challenge with a corrected version of your structure rather than just agreeing.**

**To work on 2**

*Before*

At points you drove the analysis by asking for the data needed to size the cost drivers, but under challenge you turned passive. You defaulted to "not sure" and needed a Level 1 restatement and a Level 2 narrowing hint to move forward.

> “I'm not sure. I don't know. I think cost is a problem.”
> “I'd like to see, uh, what percentage, um, these particular line line items, uh, make up.”
> “What happened with prices?”

*After*

*At the exhibit, you moved the analysis forward by asking "I'd like to see, uh, what percentage, um, these particular line line items, uh, make up", but when challenged later you said "I'm not sure. I don't know. I think cost is a problem."*

At points you drove the analysis by asking for the data needed to size the cost drivers, but under challenge you became passive. You fell back on "not sure" and needed the interviewer to repeat the question and then narrow it, with prompts like "What happened with prices?" before moving forward. Interviewers look for candidates who keep pushing the analysis forward even when they are stuck.

**Next time, try saying what you do know and proposing one piece of data you would check, instead of stopping at "not sure".**

**To work on 3**

*Before*

When the interviewer probed your sizing, you flipped from 10% to 50% without reasoning that holds up, rather than working the numbers to defend or update the figure.

> “Oh, actually, it should be about fifty percent because their cost have increased by about forty percent.”

*After*

*In the questions after your recommendation, when the interviewer probed your sizing, you said "Oh, actually, it should be about fifty percent because their cost have increased by about forty percent."*

You switched from 10% to 50% with reasoning that does not hold up, rather than working the numbers to defend or update the figure. Changing a number without calculations behind it signals guessing and makes the interviewer doubt every figure you give.

**Next time, try recalculating out loud when your number is questioned, then either defend it or update it based on that working.**

**Missed moment 1**

*Before*

Turn 52, when the interviewer challenged whether a 10% price rise gets the client back near 24%.

A great answer: “Let me check. Costs are 94% of today's revenue. With a 10% price rise they become 94/110, about 85.5%, so margin is about 14.5%. That's better, but not back to 24%. I'd update: we'd need about 24% on price alone, so I'd combine roughly 10–12% targeted pricing with procurement savings to close the rest.”

*After*

*In the questions after your recommendation, when the interviewer asked whether a 10% price rise gets the client back near 24%, you said "Yes. It does."*

This was the moment to check the arithmetic and update the figure if needed. Checking and updating your own number under challenge shows composure and builds trust.

Next time, try something like: “Let me check. Costs are 94% of today's revenue. With a 10% price rise they become 94/110, about 85.5%, so margin is about 14.5%. That's better, but not back to 24%. I'd update: we'd need about 24% on price alone, so I'd combine roughly 10–12% targeted pricing with procurement savings to close the rest.”

**Top improvement** (unchanged): Practice sizing the fix out loud from the P&L: write the equation first, compute, then sanity-check. Here, costs were 94% of revenue (58 + 22 + 14). A 10% price rise gives 94/110 ≈ 85.5% costs, or about a 14.5% margin. Restoring 24% needs 94/0.76 ≈ 1.237, about a 24% price increase. Your claims of "ten percent" and then "about fifty percent" both fail that check, and that is what turned a sound pricing recommendation into one you couldn't defend.

---

## 598645a0 — Brew & Bean Profitability (prof-001)

Mode: never scored — full scoring as a dry run (no DB write); "before" is its report before the plain-words pass. Overall: none (partial) → none (partial).

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 13 of 13 |
| Rewrites that passed the tone audit | 9 of 17 — refused: judgment.needsWork.0 (not returned); judgment.needsWork.1 (not returned); communication.needsWork.0 (not returned); communication.needsWork.1 (not returned); communication.needsWork.2 (not returned); pushback.needsWork.0 (not returned); pushback.needsWork.1 (not returned); pushback.needsWork.2 (not returned) |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 6 → 4 |
| "you did not / never / failed / could not", before → after | 0 → 0 |

Passes that ran in this scoring (qa counters): judge; quote audit 0 stripped / 0 dropped; verifier 0 dropped; answer-key pass 0 removed, 0 re-rated; reconciliation 4 merged, 0 gap drops; mandate 0 added; strong gate 0 lowered; stage caps 0 not assessed, 0 caveated; floor 0; plain words 9 written, 8 refused.

### Problem Structuring — needs work (unchanged)

**Strength 1**

*Before*

The candidate named a branch to start with rather than treating all buckets equally.

> “the Brezhaw Brezhaw is prioritized is COGS, as I think it would have the largest impact here.”

*After*

*In the follow-up on your opening structure, when asked which branch you would prioritize first and why, you said "the Brezhaw Brezhaw is prioritized is COGS, as I think it would have the largest impact here."*

You named one branch to start with instead of treating all the buckets as equally important. Interviewers want to see you choose where to dig first, because that is how real cases move quickly toward an answer.

**Keep picking a clear starting branch and giving a reason for that choice.**

**To work on 1**

*Before*

Once prompted, the candidate gave a recognizable profit tree, splitting costs into COGS, overhead and labor and revenue into volume and spend per transaction, but jumped straight to an answer first, so the framework appeared only after the interviewer asked for it.

> “Yeah. I think the problem is COGS.”
> “Um, well, the costs, which are split into COGS as well as overhead and the labor cost.”
> “the profits are gonna be based on the volume and, um, the, uh, amount of money you're getting per transaction.”

*After*

*In the opening, when invited to walk through how you would approach the case, you said "Yeah. I think the problem is COGS."*

Once the interviewer asked for a structure, you gave a recognizable profit tree, splitting costs into COGS, overhead and labor ("the costs, which are split into COGS as well as overhead and the labor cost") and revenue into volume and "amount of money you're getting per transaction." But the answer came first, so the framework appeared only after the interviewer asked for it. Interviewers judge how you organize a problem before reaching a conclusion, so a structure that only appears on request looks weaker than one you lead with.

**Next time, try laying out your full profit tree first and only then stating which branch you suspect.**

> “Um, well, the costs, which are split into COGS as well as overhead and the labor cost.”
> “the profits are gonna be based on the volume and, um, the, uh, amount of money you're getting per transaction.”

**To work on 2**

*Before*

The objective (explain an 18-point margin drop despite 15% revenue growth, then reverse it) was never restated, and the revenue branch was mislabeled as 'profits'.

> “And then on the other side, you would need to look at the profits.”

*After*

*In the opening, when asked how you would structure the problem, you said "And then on the other side, you would need to look at the profits."*

The goal of the case (explain an 18-point margin drop despite 15% revenue growth, then reverse it) was not restated, and the revenue branch was labeled as "profits." Restating the goal shows you understood the problem, and mixing up revenue and profit makes the structure confusing in a case that hinges on the difference between them.

**Next time, try opening with one sentence restating the goal and labeling the two branches clearly as revenue and costs.**

**To work on 3**

*Before*

Asked whether the structure was MECE, the candidate affirmed it without testing it, then half-acknowledged gaps without naming them. The tree was not tailored to a coffee chain (e.g., price changes, input mix, competitor behavior).

> “Yes. I think that is, Macy.”
> “Um, there are no other really big ones that I would need to cover.”

*After*

*In the follow-up on your opening structure, when asked whether the structure had no gaps or overlaps and what was missing, you said "Yes. I think that is, Macy." and "Um, there are no other really big ones that I would need to cover."*

You confirmed the structure was complete without checking it, then half-acknowledged there might be other costs without naming them. The tree was also not tailored to a coffee chain, for example price changes, input mix or competitor behavior. Interviewers ask this question to see whether you can examine your own work, and a tree fitted to the client's business shows real understanding.

**Next time, try walking through each branch out loud when asked about gaps and naming at least one specific item missing for this business.**

**Missed moment 1**

*Before*

Turn 3, the opening response 'I think the problem is COGS', given before any framework.

A great answer: “Our goal is to explain why net margin fell from 24% to 6% while revenue grew 15%, and then find levers to restore it. I'd split profit into revenue and costs. On revenue: price per item, transaction volume and product mix. On costs: COGS (beans, dairy, food, packaging), labor, occupancy and overhead, and other. Because revenue grew while margin collapsed, my hypothesis is that costs, likely COGS, outpaced prices. So I'd start by comparing each cost line as a percent of revenue two years ago versus today.”

*After*

*In the opening, when the interviewer invited you to ask questions or walk through your approach, you answered "Yeah. I think the problem is COGS."*

The answer went straight to a conclusion before any goal or framework was laid out. Your first answer sets the interviewer's view of how you think, so it is the best moment to show a clear goal, a full structure and a hypothesis tied to the facts given.

Next time, try something like: “Our goal is to explain why net margin fell from 24% to 6% while revenue grew 15%, and then find levers to restore it. I'd split profit into revenue and costs. On revenue: price per item, transaction volume and product mix. On costs: COGS (beans, dairy, food, packaging), labor, occupancy and overhead, and other. Because revenue grew while margin collapsed, my hypothesis is that costs, likely COGS, outpaced prices. So I'd start by comparing each cost line as a percent of revenue two years ago versus today.”

**Missed moment 2**

*Before*

Turn 6, the interviewer asked 'Is that MECE, and what's missing?'

A great answer: “It's mostly MECE, but I'd add an 'other costs' bucket (marketing, D&A, one-offs) so costs add to 100%. I'd also make price changes explicit on the revenue side, because flat menu prices against rising input costs would show up as margin compression even with revenue growth. I'd also want to know whether competitors are seeing the same squeeze.”

*After*

*In the follow-up on your opening structure, when the interviewer asked whether the structure had no gaps or overlaps and what was missing, you replied "Yes. I think that is, Macy."*

The question was an opening to improve the structure, but the answer confirmed it as it was. Naming a missing bucket yourself shows you can test your own thinking, which interviewers value highly.

Next time, try something like: “It's mostly MECE, but I'd add an 'other costs' bucket (marketing, D&A, one-offs) so costs add to 100%. I'd also make price changes explicit on the revenue side, because flat menu prices against rising input costs would show up as margin compression even with revenue growth. I'd also want to know whether competitors are seeing the same squeeze.”

### Quantitative & Analytical Rigor — not assessed (unchanged)

*The analysis stage was never administered and no case data was released, so there was no math to evaluate.*

### Data & Exhibit Interpretation — not assessed (unchanged)

*No exhibit or data was shown during the session, so exhibit interpretation could not be assessed.*

### Business Judgment & Insight — adequate (unchanged)

*The analysis, brainstorm and recommendation stages were never administered, so this rating rests only on the opening hypothesis reasoning, not on recommendations or risk handling.*

**To work on 1**

*Before*

Growing revenue was used to rule out the revenue side entirely. That ignores that flat menu prices against rising input costs, or a shift in mix, would compress margin even while revenue grows.

> “I know that it's not going to be on the, uh, revenue side of things as the revenue is increasing.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 2**

*Before*

The candidate used the prompt's facts (revenue up, profit down) to reason toward the cost side and tried to eliminate overhead and labor in turn, but dismissed both on unverified assumptions: a 15% revenue increase could easily include new stores, and the labor claim had no stated basis.

> “most likely, the overhead shouldn't change too much as you're probably not, um, adding more... any more stores or anything like that.”
> “And the labor itself, um, wouldn't be enough by itself to explain the large change.”
> “So we need to look at the cost side.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Missed moment 1**

*Before*

Turn 9, justifying why COGS is the likely driver.

A great answer: “Revenue growth tells me volume or price held up, so the squeeze is likely costs rising faster than prices. That still leaves a revenue-side question: have we raised menu prices at all? I'd also ask whether peers are seeing the same margin squeeze, which would point to industry-wide input inflation rather than something Brew & Bean-specific.”

*After*

*In the follow-up on your opening structure, when asked what your COGS view was based on, you reasoned that "it's not going to be on the, uh, revenue side of things as the revenue is increasing."*

The reasoning closed off the revenue side completely instead of keeping open questions about pricing and the wider market. Showing how revenue growth and a margin squeeze fit together, and what outside comparison would sharpen it, is the kind of insight that sets strong candidates apart.

Next time, try something like: “Revenue growth tells me volume or price held up, so the squeeze is likely costs rising faster than prices. That still leaves a revenue-side question: have we raised menu prices at all? I'd also ask whether peers are seeing the same margin squeeze, which would point to industry-wide input inflation rather than something Brew & Bean-specific.”

### Creativity & Brainstorming — not assessed (unchanged)

*The interviewer never ran a brainstorm, so creativity could not be assessed.*

### Synthesis & Recommendation — not assessed (unchanged)

*The recommendation stage was never reached, so synthesis could not be assessed.*

### Communication & Delivery — needs work (unchanged)

**To work on 1**

*Before*

The opening exchange was abrupt and unprofessional in tone, which sets a poor first impression with a client-facing interviewer.

> “Hi. Can you stop talking for a second?”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 2**

*Before*

Heavy filler and garbled phrasing made key turns hard to follow, and one answer trailed off unfinished.

> “Um, the Brezhaw Brezhaw is prioritized is COGS, as I think it would have the largest impact here.”
> “I don't know. I just feel like”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 3**

*Before*

The candidate put a hypothesis on the table early and used some ordinal signposting when laying out the framework, but the answer came before the structure and terms were misused (revenue called 'profits'), so the logic was not delivered top-down.

> “And then on the other side, you would need to look at the profits.”
> “Yeah. I think the problem is COGS.”
> “basically, you would look at a couple separate things.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Missed moment 1**

*Before*

Turn 1, needing time to think after the case prompt.

A great answer: “Thanks. Could I take 60 seconds to structure my thoughts before walking you through my approach?”

*After*

*In the opening, right after the case was presented and you were told to take a moment, you said "Hi. Can you stop talking for a second?"*

You needed time to think, but the request came across as abrupt. Asking for thinking time politely is normal and expected, and how you ask shapes the interviewer's first impression.

Next time, try something like: “Thanks. Could I take 60 seconds to structure my thoughts before walking you through my approach?”

### Pushback, Composure & Case Leadership — needs work (unchanged)

**To work on 1**

*Before*

On the first challenge to the COGS hypothesis, the candidate offered elimination reasoning rather than simply abandoning the view, but when the same challenge was restated (a Level 1 assist), the candidate dropped the reasoning entirely instead of holding it with evidence or reframing it as a testable hypothesis.

> “I don't know. I just feel like”
> “So we need to look at the cost side.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 2**

*Before*

Challenged on MECE-ness, the candidate defended the structure reflexively without examining it.

> “Yes. I think that is, Macy.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**To work on 3**

*Before*

The candidate never drove the case forward: no data was requested and no next step proposed. The interviewer had to supply the next question about what data would test the hypothesis.

> “I think most likely there has been some change in COGS as that are... would have a direct effect on profits.”

*After*

*(kept in the old wording — the audit refused the rewrite: not returned)*

**Missed moment 1**

*Before*

Turn 10, the interviewer restated 'What is that based on, since you haven't seen any numbers yet?'

A great answer: “Fair point — it's a hypothesis, not a conclusion. It's based on two things: revenue grew while margin fell 18 points, which points to costs outpacing prices; and for a coffee chain, COGS is typically the largest variable cost and the one most exposed to commodity inflation. To test it, I'd like each cost line as a percent of revenue two years ago versus today, plus any change in menu prices over that period.”

*After*

*In the follow-up on your opening structure, when the interviewer repeated the question of what your COGS view was based on without any numbers, you said "I don't know. I just feel like"*

The reasoning you had given a moment earlier was dropped instead of being restated as a hypothesis with a plan to test it. When an interviewer repeats a challenge, they want to see you calmly stand by your logic and propose how to check it.

Next time, try something like: “Fair point — it's a hypothesis, not a conclusion. It's based on two things: revenue grew while margin fell 18 points, which points to costs outpacing prices; and for a coffee chain, COGS is typically the largest variable cost and the one most exposed to commodity inflation. To test it, I'd like each cost line as a percent of revenue two years ago versus today, plus any change in menu prices over that period.”

**Top improvement** (unchanged): Open by restating the objective and laying out a complete profit tree before naming an answer. Then present any hypothesis as testable: give the reasoning plus the specific data you'd ask for (e.g., cost lines as a percent of revenue then versus now, and menu price changes). That way, when challenged, you can point to the test instead of falling back on 'I just feel like.'
