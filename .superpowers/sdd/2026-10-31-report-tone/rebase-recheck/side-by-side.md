# Report tone — old vs new

Sessions: aae091ff. Spend: $0 (reused output, no LLM call).

| Session | Case | Same ratings | Same claims | Quote audit (stripped / dropped) | Inline quotes verbatim | Rewrites passed | Jargon before → after | Accusing before → after |
|---|---|---|---|---|---|---|---|---|
| aae091ff | prof-001 | yes | yes | 0 / 0 | 38/38 | 32/34 | 8 → 0 | 4 → 2 |

## aae091ff — Brew & Bean Profitability (prof-001)

Mode: reused .superpowers/sdd/2026-10-31-report-tone/aae091ff.json (no LLM call): its output through this code's audit — plain fields identical to that run. Overall: needs work → needs work.

| Check | Result |
|---|---|
| Same rating on every dimension, and overall | yes |
| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | yes |
| Evidence-quote audit on the new report | 0 quotes stripped, 0 points dropped |
| Quotes inside the new text verbatim from the candidate | 38 of 38 |
| Rewrites that passed the tone audit | 32 of 34 — refused: pushback.missedOpportunities.0 (refused in that run: figure dropped: 24%); topFix (not sent in that run (added after it)) |
| Jargon terms (MECE, Level 2, pressure test …), before → after | 8 → 0 |
| "you did not / never / failed / could not", before → after | 4 → 2 |

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

*(kept in the old wording — the audit refused the rewrite: refused in that run: figure dropped: 24%)*

### Top improvement

*Before*

Practice sizing the fix out loud from the P&L: write the equation first, compute, then sanity-check. Here, costs were 94% of revenue (58 + 22 + 14). A 10% price rise gives 94/110 ≈ 85.5% costs, or about a 14.5% margin. Restoring 24% needs 94/0.76 ≈ 1.237, about a 24% price increase. Your claims of "ten percent" and then "about fifty percent" both fail that check, and that is what turned a sound pricing recommendation into one you couldn't defend.

*After*

*(kept in the old wording — not sent in that run (added after it))*
