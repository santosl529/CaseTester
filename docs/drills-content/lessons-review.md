# Drill lessons: first read

22 lessons, one per skill, in skill order. Each is what a student sees on the lesson page. Generated from `/lessons` by `npm run drills:lessons-doc`; approve or request changes on the review page (`/drills/review/lessons`), not here.

## Contents

1. MECE structure: Buckets that don't overlap and miss nothing
2. Case-specific structure: A structure built for this case
3. Structure depth: Sub-points that say what you'd look at
4. Forming a hypothesis: A hypothesis you can test
5. Updating a hypothesis: Keep, revise or drop
6. Arithmetic: Clean arithmetic under time pressure
7. Zeros and units: Zeros and units
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

---

# Problem Structuring

## MECE structure: Buckets that don't overlap and miss nothing

*Draft · 287 of 400 words · `lessons/lesson-ps-mece.md`*

> A good structure splits the problem into buckets that don't overlap and that, together, cover everything that could explain the answer.

**Why interviewers care**

Overlapping buckets make you analyze the same thing twice and lose the thread. A missing bucket means the real cause can sit outside your framework, and you won't find it. Interviewers check both within seconds of seeing your structure.

**The pattern**

1. Start from the client's question and the number it hinges on: profit, wait time, market size.
2. Split that number into parts that add or multiply back to it (revenue and costs; arrivals and service speed).
3. Test overlap: for each pair of buckets, ask "would I look at the same data in both?" If yes, merge them or redraw the line.
4. Test gaps: take two or three likely causes and ask "which bucket would find this?" If none would, add one.
5. Keep it to three to five buckets.

**Worked example**

A city library's book checkouts fell 20% in two years.

First draft: (1) Visitors; (2) Foot traffic; (3) Digital lending. "Visitors" and "Foot traffic" overlap: both count people coming in. And nothing covers whether people who visit borrow less once inside.

Better: (1) **How many people visit**: by branch and opening hours; (2) **How much visitors borrow**: share who borrow, books per loan; (3) **Borrowing that moved elsewhere**: e-books and audiobooks. Shorter hours, a weaker collection and a switch to e-books each land in exactly one bucket.

**Common mistakes**

- Overlapping buckets: two buckets that send you to the same data, like "Demand" and "Market size".
- Missing bucket: a likely cause that no bucket would find, like leaving out costs on a profit question.

## Case-specific structure: A structure built for this case

*Draft · 265 of 400 words · `lessons/lesson-ps-case_specific.md`*

> Each bucket should be about this client and this decision, in its heading or its sub-points. A memorized framework only works once you adapt it.

**Why interviewers care**

Interviewers have heard "market, competition, company" hundreds of times. A tailored structure shows you understood the question, and it points you to a better first place to look.

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

**Common mistakes**

- Generic framework: a memorized list (profit tree, 4Ps, SWOT) whose headings and sub-points never mention this client.
- Irrelevant bucket: a bucket that wouldn't change the answer, like head-office rent when the question is pricing a new product.

## Structure depth: Sub-points that say what you'd look at

*Draft · 207 of 400 words · `lessons/lesson-ps-depth.md`*

> Under each bucket, name the specific things you'd examine, so the interviewer can see where your analysis goes next.

**Why interviewers care**

A heading says which area you care about. A sub-point shows you know what to measure. "Costs" says little; "fuel cost per flight hour" starts the analysis.

**The pattern**

1. For each bucket, ask: "what would I ask for first to test this?"
2. Write it as something you can measure or check: a metric, a segment, a comparison.
3. One to three sub-points per bucket is enough, a few words each.
4. Never repeat the heading as its own sub-point.

**Worked example**

A pet-food brand is deciding whether to launch a monthly subscription.

Shallow: **Customer demand**: demand; interest.

Concrete: **Customer demand**: share of current buyers who reorder every month; price they'd pay for free delivery; how many already subscribe to a rival's plan.

Shallow: **Economics**: revenue; costs.

Concrete: **Economics**: delivery cost per box; discount we'd give subscribers; extra orders per year from subscribers.

The concrete version tells the interviewer exactly what you'd request next.

**Common mistakes**

- Shallow structure: sub-points that restate the heading or use generic words ("revenue; costs") instead of naming what to check.

---

# Hypothesis

## Forming a hypothesis: A hypothesis you can test

*Draft · 266 of 400 words · `lessons/lesson-hy-form.md`*

> Lead with one likely cause, say which fact points to it, and say what data would confirm or reject it, framed as something to check.

**Why interviewers care**

Interviewers want a view early, kept testable. A hypothesis focuses the case; restating facts or listing every possible cause doesn't.

**The pattern**

1. Read the numbers: what moved, and what didn't?
2. Name the cause through a driver: "customers rent for fewer hours", not "sales issues".
3. Frame it as a hypothesis: "my hypothesis is", "likely".
4. Say how you'd test it: the data or comparison.
5. If you mention a second cause, make clear which one leads.

**Worked example**

A bike-rental shop's revenue fell 15% while the number of rentals stayed flat.

Weak: "Revenue per rental fell." That restates the facts.

Weak: "It could be price, mix, weather or competition." No cause leads.

Strong: "Rentals are flat, so revenue per rental fell about 15%. My hypothesis is that customers are switching from daily to hourly rentals. I'd compare the mix of hourly and daily rentals, and the average rental length, this year against last."

**Common mistakes**

- No hypothesis: proposing a fix, or answering a different question, instead of naming a cause.
- Restated the facts: repeating the numbers as a ratio ("revenue per rental fell") without saying why.
- Shotgun hypotheses: listing several causes with none leading.
- Overconfident hypothesis: stating the cause as settled before any data.
- Untestable hypothesis: no data that would confirm or reject it ("I'd analyze the data").
- Ignored the facts: a cause the given facts rule out, or one that uses none of them.

## Updating a hypothesis: Keep, revise or drop

*Draft · 239 of 400 words · `lessons/lesson-hy-update.md`*

> When a new fact arrives, say what it does to your hypothesis: keep it if the fact supports it, revise it if the fact points to a different cause, drop it if the fact rules it out.

**Why interviewers care**

Interviewers feed you data to see whether you follow the evidence. Clinging to your first idea and abandoning a supported one both cost points.

**The pattern**

1. Recall your current hypothesis and its mechanism.
2. Ask: is the new fact what I'd expect if I'm right?
3. Decide: keep, revise or drop.
4. Explain in one sentence that uses the fact: name the cause it points to, or say what it does to the mechanism.

**Worked example**

Your hypothesis for the bike-rental shop: customers switched from daily to hourly rentals.

New fact: the share of hourly rentals is unchanged, but the shop cut its daily price 20% in spring.

Decision: **revise**. "The rental mix didn't change, so it isn't a shift to hourly rentals. The 20% cut to the daily price lowers revenue per rental, so price is now my lead cause."

If the new fact had been "hourly rentals rose from 30% to 55% of rentals", you would **keep** your hypothesis, because that is exactly what it predicts.

**Common mistakes**

- Sticky hypothesis: keeping a hypothesis the new fact rules out, or explaining the decision without using the fact.
- Dropped a supported hypothesis: dropping a hypothesis the new fact actually supports.

---

# Quantitative Rigor

## Arithmetic: Clean arithmetic under time pressure

*Draft · 183 of 400 words · `lessons/lesson-qn-arithmetic.md`*

> Break hard calculations into easy steps you can check, and say each step out loud.

**Why interviewers care**

One slip can flip a recommendation. Interviewers watch for a clear, checkable method more than for speed.

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

**Common mistakes**

- Arithmetic error: a slip in an operation, often in the last step or when carrying a digit.

## Zeros and units: Zeros and units

*Draft · 203 of 400 words · `lessons/lesson-qn-magnitude.md`*

> Track zeros and units on purpose: write numbers in thousands, millions or billions, and label every result.

**Why interviewers care**

Being off by a factor of 1,000 is the most common math mistake in cases, and the easiest to catch with a quick check.

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

**Common mistakes**

- Zeros error: an answer off by a factor of 10, 100 or 1,000.
- Unit error: mixing units, like a monthly figure with a yearly one, or cents with dollars.

## Percentages: Percent change, percent of, and percentage points

*Draft · 210 of 400 words · `lessons/lesson-qn-percentages.md`*

> Percent change divides by the starting value, and a change between two percentages is measured in percentage points.

**Why interviewers care**

Margins, shares and growth rates come up in every case. The two classic slips, the wrong base and points versus percent, can change an answer enough to change the recommendation.

**The pattern**

1. Percent change = (new − old) ÷ old.
2. Percent of = part ÷ whole; check which number is the whole.
3. A margin that goes from 20% to 25% rose 5 **percentage points**, which is a 25% increase.
4. Say which one you mean.

**Worked example**

A price rises from $40 to $50.
Change = $10 ÷ $40 = **25%**. Dividing by the new price ($10 ÷ $50 = 20%) uses the wrong base.

A price falls from $50 to $40.
Change = −$10 ÷ $50 = **−20%**. Same $10, different base, different percent.

Market share goes from 12% to 15%.
That is up **3 percentage points**, or 25% in relative terms (3 ÷ 12).

**Common mistakes**

- Wrong base: dividing by the new value, or by the wrong whole, instead of the starting value.
- Percent vs percentage points: calling a move from 12% to 15% "3%" when it is 3 percentage points.

## Growth: Growth compounds

*Draft · 183 of 400 words · `lessons/lesson-qn-growth.md`*

> Each year's growth applies to the previous year's total, not to the starting number.

**Why interviewers care**

Multi-year growth shows up in market sizing and investment cases. Adding the rates up understates the result, and the gap widens with higher rates and longer periods.

**The pattern**

1. Over n years at rate r: end = start × (1 + r)ⁿ.
2. For two years, multiply twice: 1.1 × 1.1 = 1.21, so 10% a year is 21% over two years, not 20%.
3. Rule of 72: doubling time ≈ 72 ÷ the growth rate in percent (8% a year doubles in about 9 years).
4. To find a yearly rate from a start and an end, try rates until (1 + r)ⁿ fits.

**Worked example**

Revenue of $50M grows 20% a year for three years.

Year 1: $50M × 1.2 = $60M.
Year 2: $60M × 1.2 = $72M.
Year 3: $72M × 1.2 = **$86.4M**.

Adding the rates instead (20% × 3 = 60%) gives $80M, which is $6.4M too low.

**Common mistakes**

- Growth error: adding the yearly rates up (simple growth) instead of compounding them.

## Math setup: Set up the formula before you calculate

*Draft · 211 of 400 words · `lessons/lesson-qn-setup.md`*

> Before calculating, write the formula in words, then plug in the numbers.

**Why interviewers care**

Most case math errors are setup errors, like dividing by the wrong thing or leaving out a term, not arithmetic. Interviewers often stop you at the setup to check it.

**The pattern**

1. Name what you're solving for, and its unit.
2. Write the formula in words: breakeven units = fixed costs ÷ (price − variable cost per unit).
3. Check that every term is in the same units and covers the same period.
4. Only then calculate.

**Worked example**

A food truck pays $60,000 a year in fixed costs. It sells burritos at $12, and each costs $4 to make. How many burritos a year to break even?

Formula in words: fixed costs ÷ contribution per burrito.
Contribution per burrito = $12 − $4 = $8.
Breakeven = $60,000 ÷ $8 = **7,500 burritos a year**.

Wrong setup: $60,000 ÷ $12 = 5,000. It divides by price, as if each burrito cost nothing to make.

**Common mistakes**

- Wrong formula: the right numbers in the wrong formula, like dividing fixed costs by price instead of contribution per unit.
- Missing term: a formula that leaves out a term, like ignoring fixed costs or one cost line.

## Sizing structure: Build the estimate as a chain of drivers

*Draft · 255 of 400 words · `lessons/lesson-qn-sizing_structure.md`*

> An estimate is a chain of drivers that multiply to the answer, with each thing counted once.

**Why interviewers care**

Interviewers care more about your chain than your final number. A missing driver or a double count makes the estimate wrong, however good the assumptions are.

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

**Common mistakes**

- Missing driver: a chain that skips a step, like going from households straight to spending without the share who buy.
- Double counting: two drivers that count the same thing, like "households with a dog" and "number of dogs".
- Driver that doesn't belong: a driver that doesn't belong in the multiplication, like the number of stores that sell it.

## Sizing assumptions: Assumptions you can justify

*Draft · 174 of 400 words · `lessons/lesson-qn-assumptions.md`*

> Pick numbers you can justify in one line, from something you know or can work out.

**Why interviewers care**

Interviewers accept a range of reasonable assumptions. They push back when a number has no basis or is far from reality.

**The pattern**

1. Anchor to figures you know: about 330M people and 130M households in the US, about 50 working weeks a year.
2. Work out what you don't know: "a haircut every 6 weeks is about 8 a year".
3. Use round numbers that keep the math easy.
4. Say the basis out loud, in a few words.

**Worked example**

How many coffees does a city office worker buy each week?

"Many buy one on workdays and some never do. Say 60% buy about 4 a week, so the average is about 0.6 × 4 = **2.4 a week**."

Unreasonable: "Every worker buys 3 coffees a day." It has no basis, and it is about six times the estimate above.

**Common mistakes**

- Unreasonable assumption: a number far outside what's believable, or one given with no basis.

## Sanity checking: Check the number before you present it

*Draft · 196 of 400 words · `lessons/lesson-qn-sanity_check.md`*

> Before you present a number, compare it with something you know.

**Why interviewers care**

A quick check catches zeros and setup errors, and it shows judgment. Interviewers expect you to notice when a result can't be right, and to trust one that can.

**The pattern**

1. Turn the total into a per-unit number: per household, per store, per employee, per day.
2. Compare it with what you'd expect from everyday experience.
3. More than about three times off? Recheck the zeros and the setup.
4. If it is plausible, say why in one line and move on. Don't "fix" a good answer.

**Worked example**

You estimate that a 30-store pizza chain earns $900M a year.

Per store: $900M ÷ 30 = $30M a year, about $80,000 a day. A pizza restaurant takes in more like $1–2M a year, so this is about 20 times too high. Recheck.

If the estimate were $45M, that is $1.5M per store, about $4,000 a day: plausible. Say so and continue.

**Common mistakes**

- Accepted an implausible result: presenting a result that a quick per-unit check shows can't be right.
- Rejected a plausible result: rejecting or "correcting" a result that is actually reasonable.

---

# Exhibit Interpretation

## Chart takeaway: Find the takeaway that answers the question

*Draft · 249 of 400 words · `lessons/lesson-ex-takeaway.md`*

> The takeaway is the one thing in the chart that answers the client's question, stated with the number that proves it.

**Why interviewers care**

Interviewers hand you exhibits to see whether you find the insight fast. Describing every bar wastes time, and stating something the chart doesn't show costs trust.

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

**Common mistakes**

- Trivial takeaway: something true but beside the client's question, like describing the biggest bar when the question is about change.
- Misread trend: reading the chart wrong, like calling a decline a rise or comparing the wrong years.
- Unsupported claim: a cause or fact the chart doesn't show, stated as if it did.

## Exhibit traps: Catch the detail that changes the answer

*Draft · 241 of 400 words · `lessons/lesson-ex-traps.md`*

> Before reading values, check the units, where the axis starts, which axis each series uses, the footnotes, whether values are indexed, and whether the periods match.

**Why interviewers care**

Interview exhibits often hide one detail that changes the answer. Catching it is the point of the question.

**The pattern**

1. Units: thousands or millions? Dollars or percent?
2. Axis: does it start at zero? A cut-off axis makes changes look bigger.
3. Two axes: which series uses which?
4. Footnotes: what is left out or defined differently?
5. Indexed values (2020 = 100) show change, not size.
6. Periods: quarters or years? Do the columns cover the same span?

**Worked example**

A bar chart of sales shows one bar about twice as tall as the other, labeled 95 and 105. The axis starts at 90, so the real increase is 10 ÷ 95, about **11%**, not a doubling.

A footnote reads "excludes online sales". Any conclusion is about store sales only.

**Common mistakes**

- Missed units: reading thousands as millions, or a percent as an amount.
- Axis misread: judging size from bar height when the axis doesn't start at zero.
- Dual-axis misread: reading a series against the wrong axis.
- Missed footnote: ignoring a note that leaves out or redefines part of the data.
- Read indexed values as absolute: treating indexed values (2020 = 100) as actual amounts.
- Mismatched time periods: comparing different periods, like a quarter with a year.

## Data extraction: Pull the right number from a dense table

*Draft · 166 of 400 words · `lessons/lesson-ex-extraction.md`*

> Find the exact row, column and period the question asks for before you calculate.

**Why interviewers care**

Dense tables test precision. Taking a value from the neighboring row or year is easy under time pressure, and silently wrong.

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

**Common mistakes**

- Wrong data point: using a value from the wrong row, column or year.

---

# Synthesis

## Answer first: Lead with the answer

*Draft · 184 of 400 words · `lessons/lesson-sy-answer_first.md`*

> State your recommendation in the first sentence, then support it.

**Why interviewers care**

Partners and interviewers want the answer before the reasoning. Starting with context, or hedging, makes you sound unsure even when your analysis is right.

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

**Common mistakes**

- Buried recommendation: the recommendation comes at the end, after the context.
- Hedged recommendation: "it depends" or "there are pros and cons" with no clear position.

## Supporting evidence: Back it with the facts that decide it

*Draft · 249 of 400 words · `lessons/lesson-sy-evidence.md`*

> Support your recommendation with the two or three facts that decide it, with their numbers, and leave out the rest.

**Why interviewers care**

Interviewers check whether you can separate what matters from what doesn't. Most cases have one deciding fact; missing it, or padding with irrelevant ones, weakens the answer.

**The pattern**

1. Ask: which fact, if it changed, would change my answer? That's the deciding fact, so use it.
2. Add one or two more relevant facts, with numbers.
3. Leave out facts that wouldn't change the decision. Mentioning one only to dismiss it is fine.
4. Check every number against the facts you were given.

**Worked example**

Should a dental group buy a second X-ray machine?

Facts: patients wait three weeks for an X-ray slot; the machine costs $90K; each extra scan earns $120, and about 1,000 more scans a year would fit; the office was repainted last year.

Deciding fact: payback. 1,000 × $120 = $120K a year, so the $90K is back in about nine months. Irrelevant: the repainting.

"**Buy it.** About 1,000 extra scans a year at $120 bring in $120K, paying back the $90K in about nine months, and it clears a three-week wait."

**Common mistakes**

- Unsupported recommendation: reasons with no numbers, or numbers that don't match the facts.
- Irrelevant facts: using a fact that doesn't bear on the decision as a reason.
- Ignored the deciding fact: a confident answer that never uses the fact that decides it.

## Complete recommendation: Close with a risk and a next step

*Draft · 165 of 400 words · `lessons/lesson-sy-complete.md`*

> A complete recommendation ends with one specific risk and one concrete next step.

**Why interviewers care**

It shows you know what could make you wrong and how the client should move forward, which is what a client needs to act.

**The pattern**

1. Risk: something specific to this case that could make the recommendation wrong.
2. Next step: a concrete action with a scope, a time frame or a metric.
3. One of each is enough. Keep each to a sentence.

**Worked example**

Recommendation: the chocolate maker should start selling to hotels, beginning with 10.

Generic (fails): "There are some risks, so we should do more analysis."

Specific: "**The main risk is that hotels want custom-branded chocolates we can't make at our volume. As a next step, I'd pilot with three hotels for two months and track how many reorder.**"

**Common mistakes**

- Missing risk or next step: no risk, no next step, or only generic ones ("there are risks", "study it further").

## Mid-case summary: Summarize the case so far

*Draft · 172 of 400 words · `lessons/lesson-sy-summary.md`*

> A mid-case summary says what you've found, what it means so far, and what is still open, accurately.

**Why interviewers care**

Interviewers ask for summaries to check that you're tracking the case. Misstating a number, or claiming an analysis you haven't done, costs trust fast.

**The pattern**

1. Restate the objective in a phrase.
2. Say what you've found, with the key numbers, only from analysis you've done.
3. Say what it suggests so far.
4. Name what you haven't looked at yet, and what's next.

**Worked example**

"We're finding out why the hotel's profit fell 10%. Revenue is flat, and we found laundry costs rose 40% after a new supplier contract. So far, costs look like the cause, and laundry is the biggest change. We haven't looked at staffing yet; that's next."

Inaccurate versions: "Revenue fell" (it was flat); "Staffing is fine" (not checked yet); leaving out that staffing is still open.

**Common mistakes**

- Inaccurate summary: a summary that misstates a number, claims an analysis not done, or leaves out what's still open.

---

# Case Leadership

## Driving next steps: Propose the next step yourself

*Draft · 222 of 400 words · `lessons/lesson-cl-next_step.md`*

> After each finding, propose the next analysis yourself: the one that moves the case furthest toward the answer.

**Why interviewers care**

Candidates who wait to be told what to do score lower on case leadership. A good next step shows you know where the answer probably is.

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

**Common mistakes**

- Waited for the interviewer: stopping after a finding without proposing what to do next.
- Illogical next step: a step that's already answered, off the objective, or a fix before the cause is known.
- Low-priority next step: a sensible analysis that matters less right now than another.

## Data requests: Ask for specific data, in order

*Draft · 250 of 400 words · `lessons/lesson-cl-data_requests.md`*

> Break the metric into its drivers, say which you'd start with and why, and ask for specific data.

**Why interviewers care**

Asking for "all the data" signals there's no plan. Interviewers reward candidates who know exactly what to request, and in what order.

**The pattern**

1. Break the metric down: profit = price − costs; costs = feed + labor + transport.
2. Start where the problem most likely sits, and say why: the part that changed most, the biggest cost, or the part the client controls.
3. Make each request a metric plus a cut or a time period: "feed cost per liter by month for two years".
4. Keep it to a few requests, grouped by driver.
5. Diagnose before proposing fixes.

**Worked example**

A regional dairy's profit per liter of milk fell from 8¢ to 5¢.

"Profit per liter is the price we receive minus feed, labor and transport costs per liter. **I'd start with feed, since it's the biggest cost and feed prices move most.** I'd ask for feed cost per liter by month for the last two years, and the price we receive per liter by buyer over the same period."

Vague: "information on costs". A laundry list: ten requests with no order. Too early: "we should cut staff".

**Common mistakes**

- Vague data request: a request with no metric, cut or period ("information about costs").
- Laundry list: many requests with no structure or starting point.
- Premature solution: proposing fixes ("cut staff") before finding the cause.
