# Drill lessons: first read

23 lessons, one per skill, in skill order, after the Foundations intro, "How a case interview works". Lessons marked **new format** have the four added sections (Why it works, Another example, Tricky cases, Quick check). Each is what a student sees on the lesson page. Generated from `/lessons` by `npm run drills:lessons-doc`; approve or request changes on the review page (`/drills/review/lessons`), not here.

## Contents

0. Foundations intro: How a case interview works
1. MECE structure: Buckets that don't overlap and miss nothing
2. Case-specific structure: A structure built for this case
3. Structure depth: Sub-points that say what you'd look at
4. Forming a hypothesis: A hypothesis you can test
5. Updating a hypothesis: Keep, revise or drop
6. Arithmetic: Clean arithmetic under time pressure
7. Zeros and units: Keep track of zeros and units
8. Percentages: Percent change, percent of, and percentage points
9. Growth: Growth compounds
10. Math setup: Set up the formula before you calculate
11. Sizing structure: Build the estimate as a chain of drivers
12. Sizing assumptions: Assumptions you can justify
13. Sanity checking: Check the number before you present it
14. Chart takeaway: Find the takeaway that answers the question
15. Exhibit traps: Catch the detail that changes the answer
16. Data extraction: Pull the right number from a dense table
17. Answer first: Lead with the answer
18. Supporting evidence: Back it with the facts that decide it
19. Complete recommendation: Close with a risk and a next step
20. Mid-case summary: Summarize the case so far
21. Driving next steps: Propose the next step yourself
22. Data requests: Ask for specific data, in order
23. Handling pushback: Defending your answer

---

# Foundations intro: How a case interview works

*Approved · 502 of 600 words · `lessons/intro/how-a-case-interview-works.md`*

> A case interview is a business problem you work through out loud with the interviewer, in about 30 minutes. It runs in four stages: clarify, structure, analyze, recommend. Each stage tests different skills. Most have their own drill and a short lesson; the others you practice in full cases.

**Who steers**

In an **interviewer-led** case, the style McKinsey uses and the one these drills follow, the interviewer moves you from stage to stage with questions: "How would you structure this?", "What does this chart tell you?". In a **candidate-led** case, you decide what to look at next. The stages are the same either way.

Throughout, think out loud. The interviewer can only credit what they hear.

**1. Clarify**

**What happens:** The interviewer reads the prompt: a client, a problem and a goal. "Our client, a chain of 40 car-repair shops, has seen profit fall 20% in two years. Why, and what should it do?" You restate it in a sentence, then ask one or two questions about the objective: what counts as success, by when, and any limits.

**What interviewers look for:** that you've understood the question, and that your questions are about this case, not a checklist.

*Skills:* Clarifying questions (practiced in full cases)

**2. Structure**

**What happens:** You ask for a minute to plan, then lay out a **framework**: three to five areas that break the problem down, with what you'd look at in each. Many interviewers also want an early **hypothesis**: your best guess at the cause, stated so data can test it.

**What interviewers look for:** areas that don't overlap and miss nothing, built for this client rather than memorized, with specific things to check under each, and a view you could prove wrong.

*Skills:* MECE structure · Case-specific structure · Structure depth · Forming a hypothesis

**3. Analyze**

**What happens:** The interviewer hands you the case a piece at a time: a chart or table to read, a calculation, a market to estimate. After each piece, you say what it means for the question and what you'd look at next. You may be asked to sum up where you are.

**What interviewers look for:** specific data requests, in a sensible order; clean math you check before presenting; the one takeaway in each exhibit, without missing the detail that changes it; a hypothesis that moves with the evidence; and you, not the interviewer, proposing the next step.

*Skills:* Data requests · Driving next steps · Math setup · Arithmetic · Zeros and units · Percentages · Growth · Sizing structure · Sizing assumptions · Sanity checking · Chart takeaway · Exhibit traps · Data extraction · Updating a hypothesis · Mid-case summary

**4. Recommend**

**What happens:** The interviewer asks for your answer, often as if the client's CEO just walked in. You have about a minute. Then they may question it or push back.

**What interviewers look for:** the recommendation in your first sentence; the two or three facts that decide it, with their numbers; a specific risk and a concrete next step; and, under pushback, a defense that holds when the facts hold and changes when they don't.

*Skills:* Answer first · Supporting evidence · Complete recommendation · Handling pushback

**How your plan follows it**

The six-week plans (Foundations and Standard) build these skills a few at a time, then put them together:

- Week 1: Structure and math
- Week 2: Hypotheses and exhibits
- Week 3: Judgment and synthesis
- Week 4: Integration
- Week 5: Interview performance
- Week 6: Readiness

---

# Problem Structuring

## MECE structure: Buckets that don't overlap and miss nothing

*Approved · new format · 594 of 600 words · `lessons/lesson-ps-mece.md`*

> A good structure is **MECE** (mutually exclusive, collectively exhaustive): its buckets don't overlap, and together they cover everything that could explain the answer.

**Why interviewers care**

Overlapping buckets make you analyze the same thing twice. A missing bucket means the real cause can sit outside your framework, and you won't find it. Interviewers spot both within seconds.

**Why it works**

A case is a search for the cause. When every likely cause has a clear home, you can rule buckets out one at a time and trust what's left. An overlap means ruling out one bucket half-rules out another; a gap means you can rule out every bucket and still miss the answer.

**The pattern**

1. Start from the client's question and the number it hinges on: profit, wait time, market size.
2. Split that number into parts that add or multiply back to it (revenue and costs; arrivals and service speed).
3. Test overlap: for each pair of buckets, ask "would I look at the same data in both?" If yes, merge them or redraw the line.
4. Test gaps: take two or three likely causes and ask "which bucket would find this?" If none would, add one.
5. Keep it to three to five buckets.

**Worked example**

A city library's book checkouts fell 20% in two years.

First draft: (1) Visitors; (2) Foot traffic; (3) Digital lending. "Visitors" and "Foot traffic" overlap: both count people coming in. Nothing covers whether visitors borrow less once inside.

Better: (1) **How many people visit**: by branch and opening hours; (2) **How much visitors borrow**: share who borrow, books per loan; (3) **Borrowing that moved elsewhere**: e-books and audiobooks. Shorter hours, a weaker collection and a switch to e-books each have a clear home. A switch to e-books would also cut visits, but bucket 3 is where you'd measure it.

**Another example**

A chicken restaurant's drive-through wait at lunch rose from 3 minutes to 6.

First draft: (1) Cars arriving; (2) The lunch rush; (3) Kitchen speed. "Cars arriving" and "The lunch rush" overlap: both count cars. Nothing covers the speaker and the pay window, where cars wait to order and pay even when the kitchen is fast.

Better: (1) **Arrivals**: cars per 15 minutes at lunch; (2) **Ordering and paying**: time at the speaker and the pay window; (3) **Waiting for food**: kitchen time per order; orders remade. Every minute of the wait sits in one step.

**Tricky cases**

- **"Demand" and "Market size" for a new co-working space.** Overlap: both size the pool of people who might rent.
- **Renaming an overlapping bucket but keeping its sub-points.** Still an overlap. "Audience: tickets by screen" next to "Revenue: tickets sold; price" counts tickets twice, so change what the bucket examines, not its name.
- **Adding "Members: members per month" to a framework about a 15% fee rise at a yoga studio.** Still a gap: today's members don't say how many would quit at the higher fee. A nearby topic doesn't fill a gap.

**Common mistakes**

- Overlapping buckets: two buckets that send you to the same data, like "Demand" and "Market size".
- Missing bucket: a likely cause that no bucket would find, like leaving out costs on a profit question.

**Quick check**

A taxi company's profit per car fell. A candidate's buckets: (1) Fares per trip; (2) Trips per car per day. Is it MECE?

*Answer (hidden until the student asks):* No, there's a gap: it covers only revenue. Profit is revenue minus costs, so it needs a third bucket for cost per car: fuel, repairs, insurance and driver pay.

## Case-specific structure: A structure built for this case

*Approved · new format · 554 of 600 words · `lessons/lesson-ps-case_specific.md`*

> Each **bucket** (one heading of your framework, the set of areas you'll look at) should be about this client and this decision, in its heading or its sub-points. A memorized framework only works once you adapt it.

**Why interviewers care**

Interviewers have heard "market, competition, company" hundreds of times. A tailored structure shows you understood the question, and it points you to a better first place to look.

**Why it works**

The buckets you choose decide where you look first. Buckets in the case's own terms point at the data that decides this question. Generic ones walk every client through the same checklist, so the issue that decides this case may get one line, or none.

**The pattern**

1. Restate the objective in one line, with the client and the number.
2. Ask what decides this specific question.
3. Name buckets in the case's terms. A standard heading is fine if its sub-points are about this client ("Revenue: membership fees, gear rental").
4. Cut any bucket that wouldn't change the decision.

**Worked example**

A US chain of climbing gyms is deciding whether to open in Mexico City.

Generic: (1) Market; (2) Competition; (3) Costs; (4) Risks. Nothing here is about climbing or Mexico City.

Tailored:
1. **Climbers in Mexico City**: how many people climb, and how many would pay a monthly membership.
2. **Local climbing gyms**: their prices and how full they are at peak hours.
3. **Our economics there**: rent for a large warehouse space, wall build-out, staff pay.
4. **Running a site far from home**: can our managers and wall-setters support it?

Each bucket would change the answer, and each says where to look first.

**Another example**

A family-owned maker of kitchen knives sells only through kitchen shops. Should it also sell direct to customers online?

Generic: (1) Revenue; (2) Costs; (3) Competition; (4) Risks.

Tailored:
1. **Online knife buyers**: how many buy a knife without holding it first, and what they pay.
2. **The kitchen shops**: their share of our sales, and whether they'd drop us.
3. **Margin per knife sold direct**: our price minus shipping, packaging and returns.
4. **Reaching buyers online**: ad cost per sale, against the shops' cut.

**Tricky cases**

- **A standard heading with case sub-points.** "Costs: shipping per knife; cost of a returned knife" passes. The sub-points make it about this client.
- **The client's name on a generic heading.** "Knife revenue; Knife costs; Knife competition" is still generic. Adding the name doesn't change what you'd look at.
- **A bucket outside the brief.** "Staff salaries" fails when the client asked only about costs other than salaries, however specific its sub-points.

**Common mistakes**

- Generic framework: a memorized list (profit tree, 4Ps, SWOT) whose headings and sub-points never mention this client. Adding the client's name to generic headings ("German revenue, German costs") is still generic.
- Irrelevant bucket: a bucket that wouldn't change the answer, like head-office rent when the question is pricing a new product.

**Quick check**

A city wants more residents to use its public ice rinks each winter. A candidate's buckets: (1) Market; (2) Competition; (3) Customers. Is the structure case-specific? Rewrite one bucket.

*Answer (hidden until the student asks):* No: nothing mentions rinks, residents or winter. For example: "**Who skates now**: visits per rink by age group, this winter against last."

## Structure depth: Sub-points that say what you'd look at

*Approved · new format · 413 of 600 words · `lessons/lesson-ps-depth.md`*

> Under each bucket, name the specific things you'd examine (the **sub-points**), so the interviewer can see where your analysis goes next.

**Why interviewers care**

A heading says which area you care about. A sub-point shows you know what to measure. "Costs" says little; "fuel cost per flight hour" starts the analysis.

**Why it works**

A sub-point is your first data request in advance. If it names something you can measure, the interviewer can hand you that data and the case moves. If it repeats the heading, you still have to work out what to ask for, in front of them.

**The pattern**

1. For each bucket, ask: "what would I ask for first to test this?"
2. Write it as something you can measure or check: a metric (a number you can track, like orders per month), a segment (a group, like new customers), or a comparison.
3. One to three sub-points per bucket is enough, a few words each.
4. Never repeat the heading as its own sub-point.

**Worked example**

A pet-food brand is deciding whether to launch a monthly subscription.

Shallow: **Customer demand**: demand; interest.

Concrete: **Customer demand**: share of current buyers who reorder every month; price they'd pay for free delivery; how many already subscribe to a rival's plan.

Shallow: **Economics**: revenue; costs.

Concrete: **Economics**: delivery cost per box; discount we'd give subscribers; extra orders per year from subscribers.

The concrete version tells the interviewer exactly what you'd request next.

**Another example**

A city orchestra's ticket revenue fell 20% this season.

Shallow: **Audience**: attendance; demand.

Concrete: **Audience**: tickets sold per performance, this season against last; share of subscribers who renewed.

Shallow: **Pricing**: prices.

Concrete: **Pricing**: average price paid per seat, by section; share of tickets sold at a discount.

**Tricky cases**

- **A case heading with generic sub-points.** "The subscribers: revenue; profit" is about this client, but "revenue; profit" names nothing to measure. It's still shallow.
- **Long but vague.** "A full analysis of every aspect of demand" is long, and still names nothing you could ask for. Length isn't depth.

**Common mistakes**

- Shallow structure: sub-points that restate the heading or use generic words ("revenue; costs") instead of naming what to check.

**Quick check**

A kayak-tour company's profit per tour fell. A candidate's bucket: **Costs**: costs; expenses. Rewrite the sub-points.

*Answer (hidden until the student asks):* For example: guide pay per tour; kayak repairs per season; insurance per tour. Each names something you could ask for.

---

# Hypothesis

## Forming a hypothesis: A hypothesis you can test

*Approved · new format · 574 of 600 words · `lessons/lesson-hy-form.md`*

> Lead with one likely cause, say which fact points to it, and say what data would confirm or reject it, framed as something to check. A **hypothesis** is that: your best guess at the cause, stated so data can prove it wrong.

**Why interviewers care**

Interviewers want a view early, kept testable. A hypothesis focuses the case; restating facts or listing every possible cause doesn't.

**Why it works**

A hypothesis tells you which data to ask for first. Naming the cause through a **driver** (a part of the number that moves it, like price or volume) gives you a specific comparison to run. Saying in advance what result would drop it keeps you honest: when that result comes back, you move on instead of explaining it away.

**The pattern**

1. Read the numbers: what moved, and what didn't?
2. Name the cause through a driver: "customers rent for fewer hours", not "sales issues".
3. Frame it as a hypothesis: "my hypothesis is", "likely".
4. Say how you'd test it, and what result would make you drop it.
5. If you mention a second cause, make clear which one leads.

**Worked example**

A bike-rental shop's revenue fell 15% while the number of rentals stayed flat.

Weak: "Revenue per rental fell." That restates the facts.

Weak: "It could be price, mix, weather or competition." No cause leads.

Strong: "Rentals are flat, so revenue per rental fell about 15%. My hypothesis is that customers are switching from daily to hourly rentals. I'd compare the mix of hourly and daily rentals this year against last. If the mix hasn't changed, I'd drop it."

**Another example**

A city's driver's-license office handles 20% fewer applications a day, though as many people arrive and staffing hasn't changed.

Strong: "Arrivals and staff are steady, so each clerk handles fewer applications an hour. My hypothesis is that more forms arrive incomplete and need follow-up. I'd compare the share of applications sent back for missing information, this year against last. If that share hasn't risen, I'd drop it."

**Tricky cases**

- **A lead and a "maybe".** "Most likely incomplete forms; maybe a slower computer system" passes: one cause leads. "It could be the forms or the computers," with neither leading, doesn't.
- **A drop result that would confirm it.** "I'd drop it if more forms came back incomplete" is backwards: that result supports the hypothesis. The drop result is the one your hypothesis says won't happen.
- **A survey with no metric.** "Survey the clerks" names a method. "Ask clerks how many forms a day they send back" says what it measures, so it counts.

**Common mistakes**

- No hypothesis: proposing a fix, or answering a different question, instead of naming a cause.
- Restated the facts: repeating the numbers as a ratio ("revenue per rental fell") without saying why.
- Shotgun hypotheses: listing several causes with none leading.
- Overconfident hypothesis: stating the cause as settled before any data.
- Untestable hypothesis: no data that would confirm or reject it ("I'd analyze the data").
- Ignored the facts: a cause the given facts rule out, or one that uses none of them.

**Quick check**

A cupcake shop's revenue fell 10% while the number of customers held steady. Give a hypothesis, the test, and the result that would make you drop it.

*Answer (hidden until the student asks):* For example: "Customers are steady, so each spends less. My hypothesis is that customers are buying fewer cupcakes per visit. I'd compare cupcakes per order this year against last. If that hasn't fallen, I'd drop it."

## Updating a hypothesis: Keep, revise or drop

*Approved · new format · 598 of 600 words · `lessons/lesson-hy-update.md`*

> When a new fact arrives, say what it does to your hypothesis: keep it if the fact is what your hypothesis predicts, revise it if the fact leaves your cause possible but shows the main cause is elsewhere, and drop it if the fact rules your cause out.

**Why interviewers care**

Interviewers feed you data to see whether you follow the evidence. Clinging to your first idea and abandoning a supported one both cost points.

**Why it works**

A hypothesis predicts what the data should show. Comparing each new fact against that prediction, out loud, shows your view moves with the evidence, not with pressure, and points your next analysis at the cause that's left.

**The pattern**

1. Recall your current hypothesis and its **mechanism** (how the cause moves the number).
2. Ask: is the new fact what I'd expect if I'm right?
3. Decide:
   - **Keep**: the fact is what your hypothesis predicts.
   - **Revise**: the fact doesn't rule your cause out, but shows the main cause is elsewhere or narrower. Move your lead to what the fact points to.
   - **Drop**: the fact rules your cause out: what it says happened didn't happen. Say what the fact points to instead.
4. Explain in one sentence that uses the fact: name the cause it points to, or say what it does to the mechanism.

**Worked example**

Your hypothesis for the bike-rental shop: customers switched from daily to hourly rentals.

New fact: the share of hourly rentals is unchanged, but the shop cut its daily price 20% in spring.

Decision: **drop**. "The rental mix didn't change, so it isn't a shift to hourly rentals. The 20% cut to the daily price lowers revenue per rental, so price is now my lead cause."

If the new fact had been "hourly rentals rose slightly, from 30% to 33%, and the daily price fell 20%", you would **revise**: some customers did switch, but 3 points can't explain the fall, so the price cut becomes your lead cause.

If it had been "hourly rentals rose from 30% to 55% of rentals", you would **keep** your hypothesis, because that is exactly what it predicts.

**Another example**

A camping store's sales fell 12% this spring. Your hypothesis: a new outdoor superstore nearby is taking its shoppers.

"Shopper counts fell 15%, mostly on weekends, when the superstore runs sales." **Keep**: shoppers left, as predicted.

"Shopper counts are flat, but the best-selling stoves were out of stock for six weeks." **Drop**: shoppers didn't leave; the stock gap cut what they could buy.

**Tricky cases**

- **Restating the fact.** "Shopper counts are flat." alone fails. Say what it means for your cause.
- **Restating the decision.** "I keep it because it still makes sense" doesn't use the fact. The reason has to.
- **When you'd named a backup.** Say you led with the superstore and named a stock problem as your backup. The flat shopper counts rule out the lead, so Drop is right. Revise is right too: the fact is what your backup predicts, so you move your lead to it.

**Common mistakes**

- Sticky hypothesis: keeping a hypothesis the new fact rules out, or explaining the decision without using the fact.
- Dropped a supported hypothesis: dropping a hypothesis the new fact actually supports.

**Quick check**

Hypothesis: an airport currency-exchange desk's revenue fell because travelers exchange smaller amounts. New fact: the average exchange is unchanged, but transactions fell 20% after the desk moved to a far terminal. Keep, revise or drop?

*Answer (hidden until the student asks):* Drop: the average exchange didn't change, so it isn't smaller amounts. The move cut transactions, so the desk's location is now the lead cause.

---

# Quantitative Rigor

## Arithmetic: Clean arithmetic under time pressure

*Approved · new format · 350 of 600 words · `lessons/lesson-qn-arithmetic.md`*

> Break hard calculations into easy steps you can check, and say each step out loud.

**Why interviewers care**

One slip can flip a recommendation. Interviewers watch for a clear, checkable method more than for speed.

**Why it works**

Splitting a hard operation into easy ones cuts the number of places you can slip. Saying each step lets the interviewer follow you and catch a slip early. The estimate and the reverse check catch the slips that get through.

**The pattern**

1. Estimate first, so you know roughly what the answer should be.
2. Split multiplication into easy parts: 48 × 25 = 48 × 100 ÷ 4 = 1,200.
3. Split division the same way: 3,600 ÷ 45 = 3,600 ÷ 9 ÷ 5 = 400 ÷ 5 = 80.
4. Check with the reverse operation: 80 × 45 = 3,600.
5. Round only when the question allows it.

**Worked example**

A store sells 1,250 items a week at $36 each. What is weekly revenue?

Estimate: about 1,000 × $40 = $40,000.

Calculate: 1,250 × 36 = (1,000 × 36) + (250 × 36) = 36,000 + 9,000 = **$45,000**.

Check: $45,000 ÷ 36 = 1,250. And $45,000 is close to the $40,000 estimate, so no zeros went missing.

**Another example**

A school fundraiser raised $8,400 from 240 families. What was the average gift?

Estimate: about $8,000 ÷ 250 = $32.

Calculate: 8,400 ÷ 240 = 840 ÷ 24 = **$35** (dividing both by 10 first).

Check: 35 × 240 = 7,000 + 1,400 = 8,400.

**Tricky cases**

- **Rounding too early.** Rounding $36 to $40 before multiplying gives $50,000, 11% too high. Round for the estimate, not for the answer.
- **Close to the estimate isn't proof.** 46,000 is near the $40,000 estimate too, and it's wrong. The reverse check catches it: 46,000 ÷ 36 isn't 1,250.

**Common mistakes**

- Arithmetic error: a slip in an operation, often in the last step or when carrying a digit.

**Quick check**

What is 1,800 ÷ 24? Show the steps and the check.

*Answer (hidden until the student asks):* 75. 1,800 ÷ 8 = 225, and 225 ÷ 3 = 75. Check: 75 × 24 = 1,500 + 300 = 1,800.

## Zeros and units: Keep track of zeros and units

*Approved · new format · 416 of 600 words · `lessons/lesson-qn-magnitude.md`*

> Track zeros and units on purpose: write numbers in thousands, millions or billions, and label every result.

**Why interviewers care**

Being off by a factor of 1,000 is the most common math mistake in cases, and the easiest to catch with a quick check.

**Why it works**

Big numbers are easy to lose a zero in, because the digits look the same at any size. Writing them as K, M and B (thousand, million, billion) makes the size part of the number, and labeling units makes a mismatch visible before you combine two numbers.

**The pattern**

1. Convert big numbers to a short form: 2.4 million = 2.4M; 350 thousand = 0.35M.
2. Multiply the digits, then add the zeros: 3K × 4K = 12M (thousand × thousand = million).
3. Label units at every step: dollars per unit, units per year.
4. Convert before you combine: monthly to yearly, cents to dollars.
5. Check the size against something you know.

**Worked example**

2.5 million households × 30% who buy × $120 a year.

2.5M × 0.3 = 0.75M households. 0.75M × $120 = **$90M a year**.

Check: roughly 1M households × $100 = $100M. Same order of magnitude, so the zeros are right.

If the $120 were a monthly price, convert first: $120 × 12 = $1,440 a year, and the total becomes $1.08B.

**Another example**

A school district runs 400 buses. Each drives 150 km a school day, fuel costs 30 cents a km, and there are 180 school days. What is the yearly fuel bill?

400 × 150 = 60K km a day. 60K × $0.30 = $18K a day. $18K × 180 = **about $3.2M a year**.

Check: one bus costs 150 × $0.30 = $45 a day, about $8K a year; × 400 buses ≈ $3.2M.

**Tricky cases**

- **Thousand times thousand.** 3K × 4K is 12M, not 12K.
- **A percent as a whole number.** 30% of 2.5M is 2.5M × 0.3 = 0.75M. Multiplying by 30 gives 75M, 100 times too big.
- **Cents.** 30 cents is $0.30. Using 30 makes the bill 100 times too big.

**Common mistakes**

- Zeros error: an answer off by a factor of 10, 100 or 1,000.
- Unit error: mixing units, like a monthly figure with a yearly one, or cents with dollars.

**Quick check**

A fitness app has 4M subscribers paying $9 a month. What is its yearly revenue?

*Answer (hidden until the student asks):* $432M. 4M × $9 = $36M a month, and × 12 = $432M a year. Check: about 4M × $100 a year = $400M.

## Percentages: Percent change, percent of, and percentage points

*Approved · new format · 401 of 600 words · `lessons/lesson-qn-percentages.md`*

> Percent change divides by the starting value, and a change between two percentages is measured in percentage points.

**Why interviewers care**

Margins, shares and growth rates come up in every case. The two classic slips, the wrong base and points versus percent, can change an answer enough to change the recommendation.

**Why it works**

A percent is always a share of something, the **base** (the number you divide by), and a different base gives a different answer. Margins and shares are already percentages, so the gap between two of them is counted in points. Saying which you mean keeps 3 points from being heard as 3%.

**The pattern**

1. Percent change = (new − old) ÷ old.
2. Percent of = part ÷ whole; check which number is the whole.
3. A margin (profit as a share of revenue) that goes from 20% to 25% rose 5 **percentage points**, which is a 25% increase.
4. Say which one you mean.

**Worked example**

A price rises from $40 to $50.
Change = $10 ÷ $40 = **25%**. Dividing by the new price ($10 ÷ $50 = 20%) uses the wrong base.

A price falls from $50 to $40.
Change = −$10 ÷ $50 = **−20%**. Same $10, different base, different percent.

Market share goes from 12% to 15%.
That is up **3 percentage points**, or 25% in relative terms (3 ÷ 12).

**Another example**

An online pet-supplies store had 60 returns from 400 orders last year, and 90 from 450 this year.

Returns rose 30 ÷ 60 = **50%**.
The return rate went from 60 ÷ 400 = 15% to 90 ÷ 450 = 20%: up **5 percentage points**, a 33% relative rise (5 ÷ 15).

**Tricky cases**

- **Up and down by the same percent.** $40 up 25% is $50; $50 down 25% is $37.50, not $40. The second change has a bigger base.
- **Which whole?** 60 returns from 400 orders is a 15% return rate. Dividing by 2,000 site visitors (3%) answers a different question.

**Common mistakes**

- Wrong base: dividing by the new value, or by the wrong whole, instead of the starting value.
- Percent vs percentage points: calling a move from 12% to 15% "3%" when it is 3 percentage points.

**Quick check**

Market share falls from 20% to 16%. By how many points did it fall, and by what percent?

*Answer (hidden until the student asks):* 4 percentage points, which is a 20% fall (4 ÷ 20).

## Growth: Growth compounds

*Approved · new format · 376 of 600 words · `lessons/lesson-qn-growth.md`*

> Each year's growth applies to the previous year's total, not to the starting number. That's **compounding**.

**Why interviewers care**

Multi-year growth shows up in market sizing and investment cases. Adding the rates up understates the result, and the gap widens with higher rates and longer periods.

**Why it works**

Each year's growth earns growth the next year, the way interest earns interest. Adding the rates leaves out that growth on growth, and the missing part gets bigger with the rate and the number of years.

**The pattern**

1. Over n years at rate r: end = start × (1 + r)ⁿ.
2. For two years, multiply twice: 1.1 × 1.1 = 1.21, so 10% a year is 21% over two years, not 20%.
3. Rule of 72: doubling time ≈ 72 ÷ the growth rate in percent (8% a year doubles in about 9 years).
4. To find a yearly rate from a start and an end (often called the **CAGR**, compound annual growth rate), try rates until (1 + r)ⁿ fits.

**Worked example**

Revenue of $50M grows 20% a year for three years.

Year 1: $50M × 1.2 = $60M.
Year 2: $60M × 1.2 = $72M.
Year 3: $72M × 1.2 = **$86.4M**.

Adding the rates instead (20% × 3 = 60%) gives $80M, which is $6.4M too low.

**Another example**

A magazine's print subscribers fall 10% a year for three years, from 200K.

Year 1: 200K × 0.9 = 180K.
Year 2: 180K × 0.9 = 162K.
Year 3: 162K × 0.9 = **about 146K**.

Subtracting 30% gives 140K, too low: each year's 10% comes off a smaller base.

**Tricky cases**

- **Up and down don't cancel.** Up 20%, then down 20%, is 1.2 × 0.8 = 0.96: a 4% fall overall.
- **The rule of 72 is a shortcut.** It's close for rates up to about 20%. At 50% a year it says 1.4 years; the real doubling time is about 1.7.

**Common mistakes**

- Growth error: adding the yearly rates up (simple growth) instead of compounding them.

**Quick check**

Sales of $10M grow 10% a year for two years, then fall 10% in year three. What are sales after year three?

*Answer (hidden until the student asks):* $10.89M. $10M × 1.1 × 1.1 = $12.1M, then $12.1M × 0.9 = $10.89M. Adding the rates (+10%, +10%, −10%) gives $11M.

## Math setup: Set up the formula before you calculate

*Approved · new format · 477 of 600 words · `lessons/lesson-qn-setup.md`*

> Before calculating, write the formula in words, then plug in the numbers.

**Why interviewers care**

Most case math errors are setup errors, like dividing by the wrong thing or leaving out a term, not arithmetic. Interviewers often stop you at the setup to check it.

**Why it works**

The formula is where the logic lives; the numbers only fill it in. Saying it in words first lets the interviewer check your logic before you spend time on arithmetic, and checking units catches a monthly cost set against a yearly volume.

**The pattern**

1. Name what you're solving for, and its unit.
2. Write the formula in words: **breakeven** units (the volume where revenue just covers costs) = fixed costs ÷ (price − variable cost per unit).
3. Check that every term is in the same units and covers the same period.
4. Only then calculate.

**Worked example**

A food truck pays $60,000 a year in **fixed costs** (costs that don't change with sales, like the truck and permits). It sells burritos at $12, and each costs $4 to make (a **variable cost**). How many burritos a year to break even?

Formula in words: fixed costs ÷ **contribution** per burrito (price minus variable cost: what each sale adds toward fixed costs).
Contribution per burrito = $12 − $4 = $8.
Breakeven = $60,000 ÷ $8 = **7,500 burritos a year**.

Wrong setup: $60,000 ÷ $12 = 5,000. It divides by price, as if each burrito cost nothing to make.

**Another example**

A frame shop can buy a $50,000 cutting machine. It saves $20 on each of the 500 frames it makes a month, and costs $2,000 a month to run. What is the **payback** (the time the savings take to repay the cost)?

Formula in words: payback = cost ÷ net saving per month.
Net saving = ($20 × 500) − $2,000 = $8,000 a month.
Payback = $50,000 ÷ $8,000 = **about 6 months**.

Missing term: $50,000 ÷ $10,000 = 5 months leaves out the running cost.

**Tricky cases**

- **Mixed periods.** Monthly fixed costs divided by contribution gives a monthly breakeven. Compare it with monthly sales, not yearly ones.
- **Revenue in place of profit.** Payback divides by the saving or profit, not by revenue: $100K of new sales at $90K of cost repays $10K a year, not $100K.

**Common mistakes**

- Wrong formula: the right numbers in the wrong formula, like dividing fixed costs by price instead of contribution per unit.
- Missing term: a formula that leaves out a term, like ignoring fixed costs or one cost line.

**Quick check**

A cooking school pays $4,000 a month in rent and staff. A class seat sells for $50, and each seat uses $10 of ingredients. How many seats a month does it need to sell to break even?

*Answer (hidden until the student asks):* 100 seats: $4,000 ÷ ($50 − $10). Dividing by $50 (80 seats) leaves out the ingredients.

## Sizing structure: Build the estimate as a chain of drivers

*Approved · new format · 496 of 600 words · `lessons/lesson-qn-sizing_structure.md`*

> An estimate is a chain of **drivers** (the factors you multiply) that multiply to the answer, with each thing counted once.

**Why interviewers care**

In a **market sizing** question (estimating how big something is, like yearly spending on a product), interviewers care more about your chain than your final number. A missing driver or a double count makes the estimate wrong, however good the assumptions are.

**Why it works**

Each driver is one step from a population to the answer, and multiplying works only if each step is counted once. A clean chain lets the interviewer test one assumption at a time, and lets you fix one number without redoing the rest.

**The pattern**

1. Start from a population you can estimate: people, households, businesses.
2. Narrow to who buys: the share who use it.
3. Multiply by how often and how much: purchases a year, price.
4. Check that each driver adds something new; no two drivers should count the same thing.
5. Leave out drivers that don't change the total.

**Worked example**

Yearly US spending on bike tune-ups.

Chain: US households (about 130M) × share with an adult bike that gets ridden (about 30%) × tune-ups per bike-owning household per year (about 0.5) × price per tune-up (about $80).

130M × 0.3 = 39M; × 0.5 = 19.5M tune-ups; × $80 = **about $1.6B**.

Double count: adding "number of bikes" next to "households with a bike". Driver that doesn't belong: "number of bike shops". It doesn't change how many tune-ups people buy.

**Another example**

Yearly US spending on guitar strings.

Chain: US adults (about 260M) × share who play guitar regularly (about 5%) × string sets per player per year (about 4) × price per set (about $8).

260M × 0.05 = 13M players; × 4 = 52M sets; × $8 = **about $400M**.

**Tricky cases**

- **Drivers in different units.** If sets are counted per player, adding "guitars per player" counts guitars twice. Pick one unit, player or guitar, and keep every driver in it.
- **True but not a factor.** "Average income" may affect who plays, but it isn't a step you multiply by. Put its effect into the share who play.
- **Skipping the share who buy.** Going from adults straight to sets assumes every adult plays.

**Common mistakes**

- Missing driver: a chain that skips a step, like going from households straight to spending without the share who buy.
- Double counting: two drivers that count the same thing, like "households with a dog" and "number of dogs".
- Driver that doesn't belong: a driver that doesn't belong in the multiplication, like the number of stores that sell it.

**Quick check**

Sizing yearly US spending on aquarium fish food, a candidate multiplies: households × share with a fish tank × tubs of food per tank per year × price per tub × number of pet stores. Which driver doesn't belong?

*Answer (hidden until the student asks):* Number of pet stores: it doesn't change how much food the fish eat. Leave it out.

## Sizing assumptions: Assumptions you can justify

*Approved · new format · 408 of 600 words · `lessons/lesson-qn-assumptions.md`*

> Pick numbers you can justify in one line, from something you know or can work out.

**Why interviewers care**

Interviewers accept a range of reasonable assumptions. They push back when a number has no basis or is far from reality.

**Why it works**

An estimate is only as good as its weakest assumption, and the interviewer can't check a number you don't explain. A one-line basis turns a guess into reasoning they can follow, then agree with or adjust.

**The pattern**

1. Anchor to figures you know: about 340M people and 130M households in the US, about 50 working weeks a year.
2. Work out what you don't know: "a haircut every 6 weeks is about 8–9 a year".
3. Use round numbers that keep the math easy.
4. Say the basis out loud, in a few words.

**Worked example**

How many coffees does a city office worker buy each week?

"Many buy one on workdays and some never do. Say 60% buy about 4 a week, so the average is about 0.6 × 4 = **2.4 a week**."

Unreasonable: "Every worker buys 3 coffees a day." It has no basis, and it is about six times the estimate above.

**Another example**

How many gallons of gas does a US car use in a year?

"Most drivers cover about 1,000 miles a month, so about 12,000 a year. A typical car gets about 25 miles a gallon, so 12,000 ÷ 25 = **about 500 gallons a year**."

Unreasonable: "About 50 gallons a year." That would be under 1,300 miles, about 25 a week.

**Tricky cases**

- **Two different numbers, both fine.** "50% of workers buy coffee" and "70% buy coffee" can both pass, if each comes with a reason. The basis matters more than the exact figure.
- **Precise but baseless.** "37.4% of workers" sounds exact, but it's no better than "about 40%" unless you can say where it comes from.
- **A believable number in the wrong place.** "4 a week" is per coffee buyer. Using it for every worker, including those who never buy, overstates the average.

**Common mistakes**

- Unreasonable assumption: a number far outside what's believable, or one given with no basis.

**Quick check**

How many light bulbs does a US household replace in a year? Give a number and its basis.

*Answer (hidden until the student asks):* About 4. A home has about 40 bulbs, and an LED bulb lasts about 10 years, so about 40 ÷ 10 = 4 a year. A nearby number with a clear basis is fine too.

## Sanity checking: Check the number before you present it

*Approved · new format · 413 of 600 words · `lessons/lesson-qn-sanity_check.md`*

> Before you present a number, compare it with something you know.

**Why interviewers care**

A quick check catches zeros and setup errors, and it shows judgment. Interviewers expect you to notice when a result can't be right, and to trust one that can.

**Why it works**

A total is hard to judge, but a per-unit number is something you've seen: a store's daily sales, a household's monthly bill. Comparing against it catches zeros and setup slips, and it confirms a good answer, so you can move on with confidence.

**The pattern**

1. Turn the total into a per-unit number: per household, per store, per employee, per day.
2. Compare it with what you'd expect from everyday experience.
3. More than about three times off? Recheck the zeros and the setup.
4. If it is plausible, say why in one line and move on. Don't "fix" a good answer.

**Worked example**

You estimate that a 30-store pizza chain earns $900M a year.

Per store: $900M ÷ 30 = $30M a year, about $80,000 a day. A pizza restaurant takes in more like $1–2M a year, so this is about 20 times too high. Recheck.

If the estimate were $45M, that is $1.5M per store, about $4,000 a day: plausible. Say so and continue.

**Another example**

You estimate that a city of 1M people has 20,000 gas stations.

Per station: 1M ÷ 20,000 = one station per 50 people. The city has roughly 700K cars; if each fills up once a week, that's about 100K fill-ups a day, only 5 per station. A station does a few hundred a day, so the city needs a few hundred stations, not 20,000. Recheck.

**Tricky cases**

- **A big total that's fine per unit.** $40B a year on video games sounds huge, but it's about $300 per US household, $25 a month: plausible. Keep it.
- **Off, but within range.** A result twice your benchmark isn't a reason to change it. Recheck the setup, and change the number only if you find the slip.

**Common mistakes**

- Accepted an implausible result: presenting a result that a quick per-unit check shows can't be right.
- Rejected a plausible result: rejecting or "correcting" a result that is actually reasonable.

**Quick check**

You estimate that a town of 40,000 people has 400 pharmacies. Is that plausible?

*Answer (hidden until the student asks):* No: one per 100 people. At about 12 prescriptions per person a year, each would fill about 1,200 a year, under 5 a day. A pharmacy fills far more, so recheck; about 10 is more plausible.

---

# Exhibit Interpretation

## Chart takeaway: Find the takeaway that answers the question

*Approved · new format · 449 of 600 words · `lessons/lesson-ex-takeaway.md`*

> The **takeaway** is the one thing in the chart that answers the client's question, stated with the number that proves it.

**Why interviewers care**

Interviewers hand you exhibits to see whether you find the insight fast. Describing every bar wastes time, and stating something the chart doesn't show costs trust.

**Why it works**

An exhibit is handed over to answer one question. Tying the biggest relevant change to that question, with its number, turns a picture into a step in the case. Saying only what the chart shows keeps your claims checkable.

**The pattern**

1. Read the title, axes and units first.
2. Reread the client's question.
3. Find what changed most, or differs most, in a way that bears on that question.
4. State it with the number: "labor drove the drop: up $15M while other lines were flat".
5. Say only what the chart shows. If you suspect a cause it doesn't show, call it a hypothesis.

**Worked example**

Question: why did profit fall?
Chart: revenue flat at $200M for three years; labor up from $60M to $75M; rent and materials flat.

Trivial: "Revenue was $200M every year." True, but it doesn't answer why profit fell.

Misread: "Revenue fell." It didn't.

Unsupported: "Labor rose because of a new union contract." The chart doesn't show why.

Takeaway: "**Labor costs explain the profit drop: up $15M while revenue and the other costs held flat.**"

**Another example**

Question: should a hot-sauce brand put more into selling online?
Chart: share of sales by channel, 2021 to 2024. Supermarkets 70% → 58%; online 10% → 24%; restaurants 20% → 18%.

Trivial: "Supermarkets are the biggest channel." True, but the question is about online.

Takeaway: "**Online is gaining share fastest: its share more than doubled, from 10% to 24%, while supermarkets fell 12 points.**"

**Tricky cases**

- **A share isn't an amount.** Online's share rising doesn't prove online sales rose: if total sales fell, a bigger share can mean flat sales. Say "share".
- **A likely cause, labeled.** "Perhaps shoppers are buying more online, which I'd check" is fine: it's framed as a hypothesis, not stated as fact.

**Common mistakes**

- Trivial takeaway: something true but beside the client's question, like describing the biggest bar when the question is about change.
- Misread trend: reading the chart wrong, like calling a decline a rise or comparing the wrong years.
- Unsupported claim: a cause or fact the chart doesn't show, stated as if it did.

**Quick check**

Question: why did a family arcade's profit fall? Chart: visitors flat at 200K a year; spend per visitor down from $40 to $32; costs flat. What's the takeaway?

*Answer (hidden until the student asks):* "Spend per visitor explains it: down $8, or 20%, while visitors and costs held flat."

## Exhibit traps: Catch the detail that changes the answer

*Approved · new format · 462 of 600 words · `lessons/lesson-ex-traps.md`*

> Before reading values, check the units, where the axis starts, which axis each series uses, the footnotes, whether values are indexed, and whether the periods match.

**Why interviewers care**

Interview exhibits (the charts and tables you're handed) often hide one detail that changes the answer. Catching it is the point of the question.

**Why it works**

Each shortcut a chart takes changes how the picture maps to the numbers: a cut-off axis, a second axis, an index, a footnote. Checking them before you read values means you read the numbers, not the shape.

**The pattern**

1. Units: thousands or millions? Dollars or percent?
2. Axis: does it start at zero? A cut-off axis makes changes look bigger.
3. Two axes (a **dual-axis** chart): which series uses which?
4. Footnotes: what is left out or defined differently?
5. **Indexed** values (each year shown against a base year set to 100, like 2020 = 100) show change, not size.
6. Periods: quarters or years? Do the columns cover the same span?

**Worked example**

A bar chart of sales shows one bar twice as tall as the other, labeled 95 and 105. The axis starts at 85, so the bars are 10 and 20 tall, but the real increase is 10 ÷ 95, about **11%**, not a doubling.

A footnote reads "excludes online sales". Any conclusion is about store sales only.

**Another example**

A line chart shows a product's sales indexed to 2020 = 100. By 2024 the line is at 130.

"Sales rose by 130" or "by 30" reads the index as an amount. It means sales rose 30% since 2020. If 2020 sales were $8M, 2024 sales are about $10.4M, up $2.4M.

**Tricky cases**

- **A footnote that redefines.** "Revenue is net of returns" changes what the bars measure. Comparing them with gross revenue from another exhibit mixes two definitions.
- **A line above the bars.** On a dual-axis chart, the bars may be in $M on the left and the line in % on the right. The line sitting higher doesn't mean it's bigger.

**Common mistakes**

- Missed units: reading thousands as millions, or a percent as an amount.
- Axis misread: judging size from bar height when the axis doesn't start at zero.
- Dual-axis misread: reading a series against the wrong axis.
- Missed footnote: ignoring a note that leaves out or redefines part of the data.
- Read indexed values as absolute: treating indexed values (2020 = 100) as actual amounts.
- Mismatched time periods: comparing different periods, like a quarter with a year.

**Quick check**

A chart shows Q1 2025 sales of $30M next to full-year 2024 sales of $100M. Did sales fall 70%?

*Answer (hidden until the student asks):* No: it compares a quarter with a year. At the 2024 pace, a quarter is about $25M, so Q1 is up about 20%.

## Data extraction: Pull the right number from a dense table

*Approved · new format · 373 of 600 words · `lessons/lesson-ex-extraction.md`*

> Find the exact row, column and period the question asks for before you calculate.

**Why interviewers care**

Dense tables test precision. Taking a value from the neighboring row or year is easy under time pressure, and silently wrong.

**Why it works**

A dense table holds many right-looking numbers and only one right answer. Pinning down the segment, metric and period before you look keeps your eye from landing on a neighbor. Checking units, and both ends of a ratio, catches the slips that remain.

**The pattern**

1. Mark the question's key words: which segment, which metric, which period.
2. Find the row, then the column, and read the cell where they cross.
3. Check the units in the header.
4. For a change or a ratio, make sure both values come from the right row and the right years.

**Worked example**

Question: "What was the West region's 2024 profit margin?"

The table has a row per region and columns for revenue and profit in 2023 and 2024. West 2024: revenue $80M, profit $12M.

Margin = $12M ÷ $80M = **15%**.

Easy slips: West's 2023 profit next to its 2024 revenue, or the East row just above.

**Another example**

Question: "How much did online camping-gear sales grow from 2023 to 2024?"

A sporting-goods retailer's table has a row per product line, split into store, online and total, with revenue for 2022, 2023 and 2024 in $K. Camping, online: 2023 $400K, 2024 $520K.

Growth = ($520K − $400K) ÷ $400K = **30%**.

Easy slips: the 2022 column, the "Camping, total" row, or reading $K as $M.

**Tricky cases**

- **A total row.** "Camping, total" sits right below "Camping, online". The question asks for one channel, so the total is the wrong row.
- **A ratio from two years.** 2024 profit over 2023 revenue looks like a margin, but it isn't one. Both numbers must come from the same year.

**Common mistakes**

- Wrong data point: using a value from the wrong row, column or year.

**Quick check**

The table shows:
- West: 2023 revenue $70M, profit $7M; 2024 revenue $80M, profit $12M.
- East: 2023 revenue $90M, profit $9M; 2024 revenue $100M, profit $10M.

What was West's 2023 profit margin?

*Answer (hidden until the student asks):* 10%: $7M ÷ $70M. Dividing by 2024 revenue ($7M ÷ $80M) mixes years.

---

# Synthesis

## Answer first: Lead with the answer

*Approved · new format · 429 of 600 words · `lessons/lesson-sy-answer_first.md`*

> State your **recommendation** (the action you advise the client to take) in the first sentence, then support it.

**Why interviewers care**

Partners and interviewers want the answer before the reasoning. Starting with context, or **hedging** (avoiding a clear position), makes you sound unsure even when your analysis is right.

**Why it works**

A listener judges each reason against the answer it supports. Hearing the answer first, they can check each reason as it arrives. Hearing it last, they have to hold every reason until they learn what it was for, and a hedge leaves them nothing to check at all.

**The pattern**

1. First sentence: the action that answers the client's question.
2. A condition is fine if it still picks a direction ("Yes, starting with a pilot").
3. Then two or three reasons with numbers.
4. Then a risk and a next step.

**Worked example**

Question: should a craft chocolate maker start selling to hotels?

Buried: "Hotels are a growing channel. Margins are a bit lower, but our kitchen has spare weekday capacity, so on balance we should probably go ahead."

Hedged: "It depends on how hotels respond."

Answer first: "**Yes: start selling to hotels, beginning with 10 in our city.** Hotel orders would add about $400K a year at a 30% margin, and our kitchen has spare capacity on weekdays."

**Another example**

Question: should a mountain lodge that closes from June to September stay open for summer hikers?

Buried: "Hiking in the region has grown, and our rooms sit empty all summer, so it could make sense to open."

Answer first: "**Yes: open for summer, starting with weekends in June.** Summer bookings would add about $300K a year, and the rooms and most staff are idle for those four months now."

**Tricky cases**

- **A reason in the first sentence.** "Too small a market." is a reason, not a recommendation. Say the action: "Don't enter: the market is too small."
- **Two actions in one sentence.** "Open for summer and add guided hikes" still commits to a direction, so it counts.
- **Restating the question first.** "Should we open in summer? Let's look at it." delays the answer. The first sentence has to commit.

**Common mistakes**

- Buried recommendation: the recommendation comes at the end, after the context.
- Hedged recommendation: "it depends" or "there are pros and cons" with no clear position.

**Quick check**

Which opening leads with the answer? (a) "Our rooms are empty all summer, so opening could work." (b) "Open for summer, starting with weekends." (c) "It depends on how many hikers come."

*Answer (hidden until the student asks):* (b). (a) starts with context and only says it "could work"; (c) is hedged.

## Supporting evidence: Back it with the facts that decide it

*Approved · new format · 586 of 600 words · `lessons/lesson-sy-evidence.md`*

> Support your recommendation with the two or three facts that decide it, with their numbers, and leave out the rest.

**Why interviewers care**

Interviewers check whether you can separate what matters from what doesn't. Most cases have one **deciding fact**, the fact your answer turns on; missing it, or padding with irrelevant ones, weakens the answer.

**Why it works**

A recommendation is only as strong as the fact that would change it. Lead with that fact and its number, and the listener can check your logic in seconds. Padding makes them sort out what matters, and they may sort it differently from you.

**The pattern**

1. Ask: which fact, if it changed, would change my answer? That's the deciding fact, so use it.
2. Add one or two more relevant facts, with numbers.
3. Leave out facts that wouldn't change the decision. Mentioning one only to dismiss it is fine.
4. Check every number against the facts you were given.

**Worked example**

Should a dental group buy a second X-ray machine?

Facts: patients wait three weeks for an X-ray slot; the machine costs $90K; each extra scan adds $120 of profit after costs, and about 1,000 more scans a year would fit; the office was repainted last year.

Deciding fact: **payback**, the time the extra profit takes to repay the cost. 1,000 × $120 = $120K a year, so the $90K is back in about nine months. Irrelevant: the repainting.

"**Buy it.** About 1,000 extra scans a year at $120 of profit each bring in $120K, paying back the $90K in about nine months, and it clears a three-week wait."

**Another example**

Should a winery build its own bottling line?

Facts: renting a mobile bottling truck costs $40K a year; its own line would cost $150K, plus $10K a year to run, and lasts 15 years; it bottles the same volume every year; a new label design cost $8K last year.

Deciding fact: the yearly saving. $40K − $10K = $30K a year, so the $150K pays back in five years, a third of the line's life. Irrelevant: the label design, which is spent either way.

"**Build the line.** It saves $30K a year against renting the truck, so the $150K pays back in five years, well within its 15-year life."

**Tricky cases**

- **Mentioning an irrelevant fact only to dismiss it.** Fine: "The repainting shouldn't drive this" shows you saw it and set it aside.
- **A number you work out from the facts.** It counts as using them: "1,000 × $120 = $120K a year" uses the scan facts.
- **The right call with no reason.** "Buy it." makes the right call but never uses the payback, so it misses the deciding fact. A right answer still needs its reason.

**Common mistakes**

- Unsupported recommendation: reasons with no numbers, or numbers that don't match the facts.
- Irrelevant facts: using a fact that doesn't bear on the decision as a reason.
- Ignored the deciding fact: a confident answer that never uses the fact that decides it.

**Quick check**

Should a gym add a 6 a.m. class? Facts: 40 members have asked for it; the instructor costs $60 a class; the class would bring in about $150 a class in extra fees; the gym's logo was redesigned in March. Which fact do you leave out, and what's the recommendation?

*Answer (hidden until the student asks):* Leave out the logo. Add the class: about $150 a class in extra fees against $60 for the instructor is $90 a class, and 40 members have asked for it.

## Complete recommendation: Close with a risk and a next step

*Approved · new format · 421 of 600 words · `lessons/lesson-sy-complete.md`*

> A complete recommendation ends with one specific **risk** (something that could make it wrong) and one concrete **next step** (what the client should do first).

**Why interviewers care**

It shows you know what could make you wrong and how the client should move forward, which is what a client needs to act.

**Why it works**

Every recommendation rests on a few things the case couldn't settle. Naming the one most likely to make you wrong, and a step that tests it soon, lets the client act now and learn fast instead of waiting for certainty.

**The pattern**

1. Risk: something specific to this case that could make the recommendation wrong.
2. Next step: a concrete action with a scope, a time frame or a metric.
3. One of each is enough. Keep each to a sentence.

**Worked example**

Recommendation: the chocolate maker should start selling to hotels, beginning with 10.

Generic (fails): "There are some risks, so we should do more analysis."

Specific: "**The main risk is that hotels want custom-branded chocolates we can't make at our volume. As a next step, I'd pilot with three hotels for two months and track how many reorder.**"

**Another example**

Recommendation: an apple orchard should open for pick-your-own on fall weekends.

Specific: "**The main risk is rain: most pickers would come on Saturdays and Sundays, so a wet October could halve visits. As a next step, I'd open two acres for six weekends this fall and track visitors and spend per visit.**"

**Tricky cases**

- **A reason dressed as a risk.** "Demand for farm visits is growing fast" supports the plan. It isn't something that could make it wrong.
- **Analysis as the next step.** "Study it further" fails. "Survey 200 past visitors on what they'd pay" names who, how many and what, so it's concrete.
- **The case's words on a generic risk.** "There are risks with pick-your-own" is still generic. Say what could go wrong.

**Common mistakes**

- Missing risk or next step: no risk, no next step, or only generic ones ("there are risks", "study it further").

**Quick check**

Recommendation: a locksmith should add emergency evening call-outs. Which risk is specific, and what's a next step to match? (a) "There are some risks to consider." (b) "Evening call-outs may not cover the overtime pay if fewer than three come in a night."

*Answer (hidden until the student asks):* (b): it says what could go wrong and when. A next step to match: "Offer evening call-outs in one district for a month and count call-outs per night."

## Mid-case summary: Summarize the case so far

*Approved · new format · 399 of 600 words · `lessons/lesson-sy-summary.md`*

> A **mid-case summary** (a short recap when the interviewer asks "where are we?") says what you've found, what it means so far, and what is still open, accurately.

**Why interviewers care**

Interviewers ask for summaries to check that you're tracking the case. Misstating a number, or claiming an analysis you haven't done, costs trust fast.

**Why it works**

A summary checks that you and the interviewer hold the same picture of the case. Getting the numbers right and naming what's open shows you know where you are and where to go next, which is most of leading a case.

**The pattern**

1. Restate the objective in a phrase.
2. Say what you've found, with the key numbers, only from analysis you've done.
3. Say what it suggests so far.
4. Name what you haven't looked at yet, and what's next.

**Worked example**

"We're finding out why the hotel's profit fell 10%. Revenue is flat, and we found laundry costs rose 40% after a new supplier contract. So far, costs look like the cause, and laundry is the biggest change. We haven't looked at staffing yet; that's next."

Inaccurate versions: "Revenue fell" (it was flat); "Staffing is fine" (not checked yet); leaving out that staffing is still open.

**Another example**

"We're deciding whether a jazz club should add Sunday afternoon shows. Demand looks strong: Saturday shows sell out, and 70% of members say they'd come on Sundays. We haven't costed a seventh day of staff yet; that's next."

Inaccurate versions: "Sundays would be profitable" (no costs checked yet); "All members would come" (70% said so).

**Tricky cases**

- **A lead stated as a finding.** "Laundry caused the drop" claims more than you've shown. "So far, costs look like the cause" is accurate.
- **Accurate, but nothing open.** Every number can be right and the summary still incomplete, if it doesn't say what's next.

**Common mistakes**

- Inaccurate summary: a summary that misstates a number, claims an analysis not done, or leaves out what's still open.

**Quick check**

Objective: why a bus-tour company's profit fell 15%. Found: fuel cost per tour up 25%; ticket revenue flat. Not yet checked: driver pay. Which summary is accurate? (a) "Revenue fell and fuel rose, so it's fuel." (b) "Revenue is flat and fuel cost per tour rose 25%, so fuel looks like the main cause. Driver pay is next."

*Answer (hidden until the student asks):* (b). (a) says revenue fell (it was flat), treats fuel as settled, and leaves out driver pay.

---

# Case Leadership

## Driving next steps: Propose the next step yourself

*Approved · new format · 427 of 600 words · `lessons/lesson-cl-next_step.md`*

> After each finding, propose the next analysis yourself: the one that moves the case furthest toward the answer.

**Why interviewers care**

Candidates who wait to be told what to do score lower on **case leadership** (driving the case forward yourself). A good next step shows you know where the answer probably is.

**Why it works**

Each analysis should shrink the space where the answer can be. The step that tests the most likely cause, or the biggest open question, shrinks it most. Proposing it yourself shows you're leading the case, not following it.

**The pattern**

1. Say what the latest finding means.
2. Pick the step that tests the most likely cause or the biggest open question.
3. Skip steps that are already answered or off the objective.
4. Don't jump to a solution before you know the cause.
5. Propose it: "Next, I'd like to look at…"

**Worked example**

Objective: find out why an online cookware shop's orders fell 25%.
Latest finding: site visits are flat.

"Visits are flat, so fewer visitors are ordering. **Next, I'd look at where visitors drop off between product page, cart and checkout.**"

Weaker choices: "Let's look at the number of visits" (already answered); "Let's cut prices" (a fix before the cause); "Let's review the supplier contracts" (sensible, but it matters less right now).

**Another example**

Objective: decide whether a planetarium should open a café.
Latest finding: 60% of visitors say they'd buy food on site.

"So there's demand. **Next, I'd estimate what the café would earn a year against what it costs to build and staff.**"

Weaker choices: "Let's survey visitors about food" (already answered); "Let's design the menu" (a detail before the decision); "Let's look at ticket prices" (off the objective).

**Tricky cases**

- **A sensible step at the wrong time.** Checking supplier contracts isn't wrong, but when the finding points to checkout, it matters less right now.
- **A hypothesis to test isn't a fix.** "Next, I'd check whether checkout errors rose" tests a cause. "Fix the checkout" jumps to a solution.

**Common mistakes**

- Waited for the interviewer: stopping after a finding without proposing what to do next.
- Illogical next step: a step that's already answered, off the objective, or a fix before the cause is known.
- Low-priority next step: a sensible analysis that matters less right now than another.

**Quick check**

Objective: find out why a dry cleaner's profit fell 20%. Latest finding: revenue is flat. What's the next step?

*Answer (hidden until the student asks):* Costs: revenue is flat, so the fall is in costs. "Next, I'd look at cost per garment by line (labor, chemicals, rent), this year against last."

## Data requests: Ask for specific data, in order

*Changes requested · new format · 524 of 600 words · `lessons/lesson-cl-data_requests.md`* · Your notes: Step 3, the vague-request mistake and a tricky case changed to match the new CL-3 specific-requests rule (Matt, 2026-10-17).

> Break the metric into its **drivers** (the parts that add or multiply up to it), say which you'd start with and why, and ask for specific data.

**Why interviewers care**

Asking for "all the data" signals there's no plan. Interviewers reward candidates who know exactly what to request, and in what order.

**Why it works**

The breakdown shows every place the cause could be; the starting point and its reason show where you think it most likely is. Specific requests get specific answers back, so each one rules a driver in or out.

**The pattern**

1. Break the metric down: profit = price − costs; costs = feed + labor + transport.
2. Start where the problem most likely sits, and say why: the part that changed most, the biggest cost, or the part the client controls.
3. Name a specific measure in every request, and slice your first one: by a **cut** (a split, like by region or by product), a comparison or a time period: "feed cost per liter by month for two years".
4. Keep it to a few requests, grouped by driver.
5. Diagnose before proposing fixes.

**Worked example**

A regional dairy's profit per liter of milk fell from 8¢ to 5¢.

"Profit per liter is the price we receive minus feed, labor and transport costs per liter. **I'd start with feed, since it's the biggest cost and feed prices move most.** I'd ask for feed cost per liter by month for the last two years, and the price we receive per liter by buyer over the same period."

Vague: "information on costs". A laundry list: ten requests with no order. Too early: "we should cut staff".

**Another example**

A dance school's active students fell 18% this year, while new sign-ups held steady.

"Active students are new sign-ups plus students who stay from last term. **Sign-ups held steady, so I'd start with students who stay.** I'd ask for the share of students who re-enroll each term, by class style, this year against last."

**Tricky cases**

- **A list of reports isn't a breakdown.** "Student data, sales by month, survey results" names sources, not the parts that make up the metric.
- **Drivers you name to break the metric down aren't requests.** "Sign-ups plus students who stay" is the breakdown. Only the data you ask to see has to be specific.
- **Only the first request needs a slice.** After "the share who re-enroll, by class style, this year against last", "then the share who switch to another style" is fine: it names a measure. "Then student data" isn't: it names none.

**Common mistakes**

- Vague data request: a request that names no measure ("information about costs"), or a first request with no cut, comparison or period.
- Laundry list: many requests with no structure or starting point.
- Premature solution: proposing fixes ("cut staff") before finding the cause.

**Quick check**

An aquarium's ticket revenue fell 10%. Which request is specific enough: (a) "information about visitors"; (b) "tickets sold per day by ticket type, this year against last"?

*Answer (hidden until the student asks):* (b): a measure (tickets sold), a cut (by ticket type) and a comparison (this year against last). (a) names no measure.

## Handling pushback: Defending your answer

*Approved · new format · 600 of 600 words · `lessons/lesson-cl-pushback.md`*

> When the interviewer asks about your answer, answer the question and back it with a case fact. When they push back, **hold** if the challenge doesn't change the facts your answer turns on, and **update** if it does.

**Why interviewers care**

The follow-up is often the real test. Interviewers watch whether you stand by a sound answer, change a weak one, and give a reason either way.

**Why it works**

A follow-up checks whether your answer rests on the case. If your choice is tied to a fact, you can defend it; if a challenge changes that fact, the honest move is to change your answer and say how.

**The pattern**

**Justify** ("Which bucket would you dig into first, and why?"):
1. Pick one thing, and say it first.
2. Back it with a case fact that supports it: a number, or something the case says.
3. Stay consistent with your own answer. If you pick something new, say why.

**Challenge** ("Our CFO says…"):
1. Ask: does this change the facts my recommendation turns on?
2. **Hold** if it doesn't. Give the reason with a fact, and restate your recommendation.
3. **Update** if it does. Say what your recommendation becomes. A change within the plan counts ("open next spring, not now").

**Worked example**

A chain of laundromats' profit fell 30% while customer visits held steady. Water and energy prices rose sharply. Your framework: visits; revenue per visit; cost per visit.

Follow-up: "Which bucket would you dig into first, and why?"

Strong: "**Cost per visit.** Visits held steady while profit fell 30%, and water and energy prices rose sharply, so each wash costs more; I'd check water and energy cost per visit."

Weak: "Revenue per visit, because it's the most important." No case fact.

**Another example**

You recommended that a bakery chain open a fourth shop: $80K a year after rent repays its $200K fit-out in 2.5 years, inside the 3-year limit.

"A local realtor says rents in the area rose 5% last year." **Hold.** "The $80K already includes our signed rent, so this doesn't change it. I'd still open the shop."

"Our CFO says the $80K leaves out $30K a year for a second delivery van." **Update.** "That makes it $50K a year, a 4-year payback, past our 3-year limit. I'd open only if the fit-out comes down to about $150K."

**Tricky cases**

- **A case fact that doesn't support your pick.** "Visits, because profit fell 30%" fails: visits held steady, so the fall isn't in visits. The fact has to back what you picked.
- **A true fact that doesn't change your deciding facts.** It's a reason to hold, not to update.
- **Choosing Hold and saying nothing else.** "Hold." is a decision, not a defense: give the fact and restate your recommendation.

**Common mistakes**

- Dodged the question: listing options without picking one, or answering a different question.
- No evidence in defense: a generic reason ("it's the most important"), or a case fact that doesn't support the pick.
- Defense inconsistent with your answer: picking something your answer never mentioned without saying why, or a Hold that contradicts your recommendation.
- Caved to invalid pushback: updating when the challenge doesn't change your deciding facts.
- Ignored valid pushback: holding when it does.

**Quick check**

You recommended a $600K oven that saves $200K a year, a 3-year payback against a 4-year limit. The plant manager says: "The supplier just raised the price to $900K." Hold or update, and why?

*Answer (hidden until the student asks):* Update: at $900K the payback is 4.5 years, past the limit. I'd push the price down to $800K, the most that pays back in 4 years, or not buy.
