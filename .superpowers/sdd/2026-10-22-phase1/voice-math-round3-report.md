# `of` ships, the scale words are read but never flagged, and the equations go parallel

Lorenzo's rulings of 27 Oct, round 3, on `phase1` at `63e0377a`. Commits `5c4dff41` (item 1),
`34818edc` (item 2), `79e3f959` (item 3).

**Spend: $0.0448 of the $0.10 cap** — 38 Haiku 5.5 calls ($0.0246) and 1 Sonnet 5.5 call ($0.0202).
Nothing pushed, nothing merged, no DB write, no deploy, nothing under `Case Interview Runs/` staged.

**Headline.** The 50-claim sample is **clean — 50/50 verify right work, 0 verify wrong work** — so item 2
shipped as ruled, behind its own switch and out of the preset. `ofAsMultiplication` is in the `phase1`
preset and **the standing gate did not move by one number**. Item E's asynchronous variant **passes its
gate with 0 ms added** at p50, p90 and max, the recall regression is gone by construction (a test diffs
the whole checker request), and it drops the same b39 line the synchronous form did — but only after two
fixes the measurement forced: the extractor needs the candidate's own earlier messages, and
`supersededBy` was matching figures without their units.

---

## 1. `ofAsMultiplication` in the preset (`5c4dff41`)

The switch moved from `NON_PRESET_SWITCHES` into `PHASE1_SWITCHES`, beside the other stream-3 math
switches, with its rationale moved with it; a new contract test asserts the preset carries it and does
**not** carry `speechNormalization` or `checkerEquations`.

**Its own evidence, reproduced at this commit** (`speech-replay --arm=of`, 6,304 typed candidate
messages read as written): 102 turns changed, **107 claims gained, every one `correct`, 0 claims lost,
0 new flags, 0 flags removed, 0 verified figures lost**. On the 131 recorded voice turns the reader goes
3 claims → 6 with flags unchanged at 1 (`voice-math-measure.ts`, re-run: 6 claims, 6/0/0, 1 flag, 8
verified figures).

**The standing gate, re-run with the switch now inside `*=phase1`.** Lorenzo expected the preset's
numbers to change. **They do not change at all**, and that is the finding:

| line | expected | measured at `5c4dff41` |
|---|---|---|
| fault bank, `*=phase1` | fault 78/154, correct 95/95 | **fault 78 / 154, correct 95 / 95**, `run_missing` 0, 0 records moved into a skip class against `r2f-p1` |
| fault bank, switches off | fault 48/155, correct 95/95 | **fault 48 / 155, correct 95 / 95**, `run_missing` 0, 0 records moved against `r2f-off` |
| the 31-slice replay vs `r2f-gate` | nothing else moves | **31 slices, 230 runs, 6,020 turns: 0 changed checker decisions, 0 changed interviewer lines, 0 runs on one side only** |
| `fact-check.ts`, `env -u ENGINE_SWITCHES`, the same 31 slices | F1 0 · F2-next 97 · F2-rec 11 · F3 0 · F4 0 | **F1 0 · F2-next 97 · F2-rec 11 · F3 0 · F4 0** |

**Why nothing moved, and why every change is still an addition of correct claims.** The switch's whole
effect on the typed corpus is 107 new `correct` arithmetic claims and 86 new verified figures. A claim
changes a turn only by raising a flag (none: 0 new flags) or by a verified figure meeting a checker
claim or a step flag in the same sentence; across these 31 slices no new verified figure met one. So the
preset's fault and correct counts are the same numbers as before, and the one thing the switch adds —
claims the reader was blind to — adds nothing a candidate or an interviewer can see on this corpus. The
gain is live-side: those are the sentences a future interviewer will no longer doubt.

**Judgement call.** I report the preset's numbers as unchanged rather than hunting for a corpus where
they move. *Cost if wrong: the preset entry is proved safe on 230 runs but its benefit is proved only on
the reader's own output, not on a changed interviewer line. The 107 claims are each listed in the
round-2 report §D.*

---

## 2. Scale and currency words — the sample first, then the switch (`34818edc`)

Lorenzo chose "never a flag, `correct` allowed", on the condition that a sample of 50 of the 589 newly
verified claims be read first, because **a false `correct` shields a real error**: a claim the engine
verifies is a claim it will never probe, so wrong arithmetic verified as right goes unchallenged and
unreported — worse than leaving it unclear.

### 2.1 How the 50 were drawn

The 589 are the claims the absorbed reading newly verifies `correct` on the spoken corpus
(`scripts/scale-words-sample.ts`, written for this, with `ENGINE_SWITCHES='*=spokenMathParser,speechNormalization'`
— the arm the 27 Oct measurement reported). Each claim is classed by the readings **inside its own span**
(the pre-pass's output notation says which it took: `200k`, `320m`, `$0.40`), the classes are filled to a
quota with a floor of 4 each so no reading goes untested, and within a class the rows are ordered by
(case, run, turn) and taken every n-th — never the first 50.

| reading in the span | in the 589 | sampled |
|---|---:|---:|
| currency (`$`) | 207 | 16 |
| currency + k | 113 | 8 |
| M | 95 | 7 |
| M + currency + k | 90 | 7 |
| M + currency | 51 | 4 |
| M + k | 20 | 4 |
| k | 13 | 4 |
| B | **0** | 0 |

**There is no `billion` reading among the 589** — the corpus's billions are written as "$1.6 billion" in
sentences that state no result in the same breath, so the reader never gets a claim out of one. The
sample spans **all 5 cases** (pricing-001 19, prof-002 12, entry-001 9, launch-001 6, prof-001 4) and
**36 runs**, i.e. 36 different personas.

### 2.2 The sample, with every verdict

Each one recomputed by hand from the operands in the span. "Reading" is which scale/currency word the
absorbed reading folded in.

| # | case | run | turn | reading | the span, as the reader takes it | recomputed by hand | verdict |
|---|---|---|---|---|---|---|---|
| 1 | entry-001 | `6544aa01` | t6 | M | Straight down the funnel 250m times 1.6 percent is 4m with Corlan's. | 250,000,000 x 0.016 = 4,000,000 | **right** |
| 2 | entry-001 | `257e027f` | t6 | M | 250m times 1.6 percent is 4m with the disease. | 250,000,000 x 0.016 = 4,000,000 | **right** |
| 3 | launch-001 | `a14ca044` | t16 | M | Probably would buy 30m times 20 percent is 6m households, and 60 percent of those convert, so 3.6m. | 30,000,000 x 0.20 = 6,000,000 | **right** |
| 4 | launch-001 | `442e37ff` | t22 | M | If conversion runs 20 percent light and bags per household come in at 2.5 instead of 3, volume is 9 times 0.8 times 0.83 is about 6.0m, exactly break-… | 9m x 0.8 x 0.83 = 5.976m, hedged "about 6.0m" | **right** |
| 5 | prof-001 | `b284faee` | t8 | M | Another way to see it if COGS had held at 42 percent of today's revenue, it would be 0.42 times 480 is 202m dollars. | 0.42 x 480 = 201.6, hedged "would be" 202 | **right** |
| 6 | prof-001 | `9e9aa0d2` | t20 | M | So revenue is 451.2 divided by 0.76 is 593.7m dollars. | 451.2 / 0.76 = 593.68 | **right** |
| 7 | prof-001 | `47733a4b` | t10 | M | To get back to 24 percent, revenue needs to be 451.2 divided by 0.76 is 593.7m dollars, which is a 23.7 percent price increase. | 451.2 / 0.76 = 593.68 | **right** |
| 8 | entry-001 | `4df38465` | t10 | M+currency | 41600 times $9400 is 391m dollars in peak annual net sales. | 41,600 x 9,400 = 391,040,000 | **right** |
| 9 | launch-001 | `52951de8` | t12 | M+currency | That makes fixed costs $3.0 plus $4.5 plus $1.5 is 9.0m dollars, and breakeven volume 9.0m dollars divided by $1.50 is 6.0m bags. | 3.0 + 4.5 + 1.5 = 9.0 | **right** |
| 10 | launch-001 | `35e83e7f` | t14 | M+currency | Revenue is 9m times $3.00 is 27m dollars, call it 9 percent on top of the 300m dollars base. | 9m x 3.00 = 27m | **right** |
| 11 | pricing-001 | `99dd37d1` | t22 | M+currency | Pro rises to 400 times $2800 is 1.12m dollars. | 400 x 2,800 = 1,120,000 | **right** |
| 12 | entry-001 | `6a721cdf` | t16 | M+currency+k | Rough sensitivity net price at $1500 instead of 2k dollars gives 200k times $1500 is 300m dollars, exactly at the bar. | 200,000 x 1,500 = 300,000,000 | **right** |
| 13 | pricing-001 | `e08c362a` | t18 | M+currency+k | Value created by Starter 1k times $1205 is about 1.21m dollars. | 1,000 x 1,205 = 1,205,000, hedged "about 1.21m" | **right** |
| 14 | pricing-001 | `854fc080` | t20 | M+currency+k | Monthly value test is 800 times $1800 is 1.44m dollars control is 1k times $1400 is 1.4m dollars. | 800 x 1,800 = 1,440,000 | **right** |
| 15 | prof-002 | `43fa5038` | t28 | M+currency+k | If Larkspur can lift extras from $20 to $30 per passenger bag fees, seat selection, a loyalty or co-brand card on the 4 healthy routes that's 9k fligh… | 5,000 x 56 x 10 = 2,800,000 | **right** |
| 16 | prof-002 | `5fa81cec` | t12 | M+currency+k | FY 2025 60 times $140 is $8400, less 9k dollars is minus $600 times 2k is minus 1.2m dollars. | -600 x 2,000 = -1,200,000 | **right** |
| 17 | prof-002 | `a7d9f44e` | t16 | M+currency+k | FY 2023 $200 times 60 is 12k dollars plus $1200 extras is $13200, minus 9k dollars variable is $4200 per flight, times 2k is 8.4m dollars. | 200 x 60 = 12,000 | **right** |
| 18 | prof-002 | `f80d981c` | t14 | M+currency+k | FY 2023 60 times $240 plus $20, is $15600, less 11k dollars is $4600 times 3k is 13.8m dollars. | 4,600 x 3,000 = 13,800,000 | **right** |
| 19 | entry-001 | `a1133734` | t18 | M+k | It confirms the chain I built, so the arithmetic holds 250m times 1.6 percent times 50 percent times 50 percent is 1.0m treated, times 20 percent is 2… | 250m x .016 x .5 x .5 = 1.0m | **right** |
| 20 | entry-001 | `6f57da6e` | t6 | M+k | Moderate-to-severe is a disease characteristic, so I'd read that 20 percent against the prevalent population rather than the treated slice 20 percent … | 0.20 x 4.16m = 832,000 | **right** |
| 21 | entry-001 | `4df38465` | t22 | M+k | Option B 200k times 25 percent is 50k patients times 8k dollars is 400m dollars net sales. | 200,000 x 0.25 = 50,000 | **right** |
| 22 | launch-001 | `61bb8b4d` | t12 | M+k | If they're in, say, 10k stores and each moves 12 bags a week, that's 10k times 12 times 52 is 6.24m bags. | 10,000 x 12 x 52 = 6,240,000 | **right** |
| 23 | launch-001 | `a14ca044` | t6 | currency | Price is $3.00, so contribution per bag is $3.00 minus $1.50 is $1.50. | 3.00 - 1.50 = 1.50 | **right** |
| 24 | pricing-001 | `5c3d2c21` | t16 | currency | Fair if I use cancellations only rather than blending in upgrades, the Starter life is longer, around 20 months, and $30 times 20 is $600. | 30 x 20 = 600 | **right** |
| 25 | pricing-001 | `087451cb` | t30 | currency | $80 divided by $30 is 2.67, so about 2 point sevenx Pro is worth roughly 2.7 times a Starter customer per month of life. | 80 / 30 = 2.667, hedged "2.67" | **right** |
| 26 | pricing-001 | `ee99bd82` | t24 | currency | If churn holds, Starter LTV is $50 divided by 0.074 is about $676. | 50 / 0.074 = 675.7, hedged "about 676" | **right** |
| 27 | pricing-001 | `e08c362a` | t32 | currency | I then applied the same expected on-plan lifetime I derived from the control cohort, 13.5 months $50 times 13.5 is $675. | 50 x 13.5 = 675 | **right** |
| 28 | pricing-001 | `3376e5fe` | t14 | currency | $40 minus $10 is $30 contribution, divided by 7.5 percent monthly exit rate is about 13 months → ~$400 standalone. | 40 - 10 = 30 | **right** |
| 29 | pricing-001 | `084e7508` | t6 | currency | At $40 a month that's $900 divided by $40 is 22.5 months a customer has to stay. | 900 / 40 = 22.5 | **right** |
| 30 | pricing-001 | `a2a5921b` | t8 | currency | Total value per Starter sign-up is the standalone LTV plus the upgrade value $700 plus $780 is $1480. | 700 + 780 = 1,480 | **right** |
| 31 | pricing-001 | `99dd37d1` | t14 | currency | Starter gross margin is $40 minus $10 is $30 a month. | 40 - 10 = 30 | **right** |
| 32 | pricing-001 | `854fc080` | t8 | currency | Now on contribution, not revenue Pro is $100 minus $20 is $80 Starter is $40 minus $10 is $30. | 100 - 20 = 80 | **right** |
| 33 | pricing-001 | `dd74b01b` | t18 | currency | Holding churn and upgrade behavior constant which is the big assumption Starter-stage LTV is $50 times 13.6 is about $680, plus the $800 upgrade credi… | 50 x 13.6 = 680 | **right** |
| 34 | prof-001 | `6312a37d` | t16 | currency | New profit per drink $5.75 minus $2.90 minus $1.80 is $1.05. | 5.75 - 2.90 - 1.80 = 1.05 | **right** |
| 35 | prof-002 | `9bbf41bc` | t20 | currency | Per flight 80 times 70 percent is 56 passengers, at $180 plus $20 is $200 each, so $11200 revenue. | 180 + 20 = 200 (and 80 x 0.7 = 56) | **right** |
| 36 | prof-002 | `6e5a1c90` | t14 | currency | Redo FY 2025 60 passengers times $120 plus $20, is 60 times $140 is $8400 revenue per flight. | 60 x 140 = 8,400 | **right** |
| 37 | prof-002 | `a7d9f44e` | t24 | currency | $9200 divided by $160 is 57.5 passengers, which is 72 percent load. | 9,200 / 160 = 57.5 | **right** |
| 38 | prof-002 | `cee7d399` | t8 | currency | $14300 divided by 60 is about $238 average revenue per passenger in FY 2023, versus $12570 divided by 60 is about $210 in FY 2025. | 12,570 / 60 = 209.5, hedged "about 210" | **right** |
| 39 | pricing-001 | `5c3d2c21` | t22 | currency+k | Margin per Starter goes $30 → $50, and 800 times $50 is 40k dollars a month versus 1k times $30 is 30k dollars. | 1,000 x 30 = 30,000 | **right** |
| 40 | pricing-001 | `087451cb` | t32 | currency+k | 3, the price test is accretive 800 times $50 plus 400 times $80 is 72k dollars versus 58k dollars at control, roughly 24 percent better monthly margin… | 800 x 50 + 400 x 80 = 72,000 | **right** |
| 41 | pricing-001 | `eb8d7576` | t28 | currency+k | Control 1k times $920 is 920k dollars, plus 350 times $2800 is 980k dollars. | 350 x 2,800 = 980,000 | **right** |
| 42 | pricing-001 | `084e7508` | t30 | currency+k | Redoing the net incremental 700 times $1500 is 1050k dollars, less 130k dollars is 920k dollars a month. | 700 x 1,500 = 1,050,000 | **right** |
| 43 | pricing-001 | `854fc080` | t16 | currency+k | Pro LTV is $80 times 50 is 4k dollars, CAC $1200, ratio 3.3 threex. | 80 x 50 = 4,000 | **right** |
| 44 | prof-002 | `43fa5038` | t14 | currency+k | Port Avery 46.8 divided by 3k is $15600 → 32.4 divided by 3k is $10800. | 46.8m / 3,000 = 15,600 | **right** |
| 45 | prof-002 | `a7d9f44e` | t10 | currency+k | Port Avery was 46.8 divided by 3k is $15600 per flight, now 32.4 divided by 3k is $10800 down 31 percent. | 32.4m / 3,000 = 10,800 | **right** |
| 46 | prof-002 | `3f928012` | t6 | currency+k | Port Avery per flight revenue 60 times $180 is $10800 versus 11k dollars variable it's now contribution-negative, so flying it destroys cash. | 60 x 180 = 10,800 | **right** |
| 47 | entry-001 | `cdb8ca52` | t12 | k | Eligible pool is 200k, so 50k divided by 200k is 25 percent, not 27 percent. | 50,000 / 200,000 = 25% | **right** |
| 48 | entry-001 | `5bc506bc` | t6 | k | Of those, Aldermoor forecasts 20 percent on Kelvexa at peak 400k times 0.2 is 80k patients. | 400,000 x 0.2 = 80,000 | **right** |
| 49 | pricing-001 | `084e7508` | t22 | k | Cannibalization is 30 percent, so 30 percent times 1k is 300 are trade-downs and 700 are incremental. | 0.30 x 1,000 = 300 | **right** |
| 50 | prof-002 | `6e5a1c90` | t30 | k | That's 2500 plus 2500 is 5k, plus 2k plus 2k is 4k, so 9k flights not 8k. | 2,500 + 2,500 = 5,000 | **right** |

**50 of 50 verify right work. 0 verify wrong work.** Fourteen of the fifty are verified through a
power-of-ten tolerance (#1–#5, #19–#21, #44, #45, #49 and others): the reader's single reading computes a
figure 100 or 1,000,000 times off the stated one, and the verdict is `correct` because the scale reading
makes it consistent. In every one of those the candidate's own arithmetic is right; the slack is the
scale factor, not the sum. Seven are hedged approximations ("about", "roughly") inside the band: #4, #5,
#13, #25, #26, #38 — each within 2% of the exact figure, and #4 and #13 exactly right on the unrounded
chain.

### 2.3 The global check behind the sample

A sample of 50 cannot prove the other 539, so I also measured the shape of the slack across **all 589**:
for each, the ratio of the stated result to the reader's single computed value.

| the stated result over the computed value | claims |
|---|---:|
| exactly 1 (within 1%) | 441 |
| exactly 10⁶ | 92 |
| exactly 10⁻² (the cents reading) | 44 |
| exactly 10⁴ | 3 |
| exactly 10² | 4 |
| exactly 10⁻⁶ | 1 |
| **not a power of ten** | **4** |

**585 of 589 differ from the single reading only by an exact power of ten** — which is the scale factor
itself, the thing the feature exists to absorb. The 4 that do not were read as well, and all four are
right:

| claim | by hand | verdict |
|---|---|---|
| `5c3d2c21` t34 "$1500 divided by $80 is about 19 months" | 18.75, hedged "about 19" | **right** |
| `3376e5fe` t6 "one divided by 0.075 is about 13 months → $40 times 13 is about $530" | 13.33 × $40 = $533; "$40 × 13" is his rounding of the step, "about $530" the unrounded answer | **right** |
| `3f928012` t28 "$8 times 780k is about 6m dollars" | $6.24M, hedged "about 6m" | **right** |
| `5433fa09` t14 "$6.80 over $6.20 is 9.7 percent" | 6.80/6.20 − 1 = 9.68% — the percent increase | **right** |

So: nothing in the 589 verifies wrong arithmetic, and nothing in the 589 is verified through slack that
is not either the scale factor or a hedge the reader already honours. **Shipped.**

### 2.4 What shipped, and how the ruling is enforced by construction

`lib/orchestrator/scale-words.ts` — `absorbScaleWords` folds a scale or currency word that follows a
figure **immediately** into the figure's own notation ("200 thousand" → `200k`, "$320 million" → `320m`,
"forty cents" → `$0.40`, "six dollars and twenty cents" → `$6.20`), and only where the word ends there,
so "thousands of patients" and "a million-dollar question" are untouched. **It is the pre-pass the 27 Oct
measurement simulated, unchanged** — `scale-words-measure.ts` now imports it, so what ships is exactly
what was measured and exactly what the 50-claim sample was drawn from (checked claim by claim: the two
sets are identical, 589 = 589, 0 on either side only).

- **A second pass, deduped against the first.** The reader runs as today, then re-reads only the
  sentences the absorption changes, dropping any claim the first pass already raised. No claim and no
  verdict of today's reading can move — measured, not asserted: **0 claims lost, 0 verdicts changed** in
  both arms.
- **`incorrect` → `unclear` on any absorbed claim.** `flagsFromArithmetic` maps `incorrect` only, so an
  absorbed reading can never raise a flag. The 7 flags the simulation raised (all 7 false) come out
  `unclear`.
- **An absorbed claim may not silence a flag either** (`recompute.ts`): a `correct` claim normally
  suppresses a step flag in its sentence, and an absorbed one is not allowed to — a false `correct`
  shielding a real error is the same harm read backwards. Measured: **0 flags removed**.
- **The span stays the candidate's own sentence.** The absorbed text is the reader's working; it must
  never reach a prompt as a quote of what he said (verified figures are quoted into the interviewer's
  prompt as `arithmetic_ok: … (in "<span>")`).

| arm, 6,304 messages | turns changed | claims gained | lost | new flags | flags removed | verified lost |
|---|---:|---|---:|---:|---:|---:|
| spoken (`--arm=scale-spoken --sn`) | 349 | **602 — 589 `correct`, 13 `unclear`, 0 `incorrect`** | 0 | **0** | **0** | **0** |
| as written (`--arm=scale`) | 98 | **146, every one `correct`** | 0 | **0** | **0** | **0** |
| the 131 recorded voice turns | 0 | 0 | 0 | 0 | 0 | 0 |

**Switch: `scaleWordReading`, out of every preset.** He approved the reading, not the preset entry — so
it is nameable for evaluation and off everywhere else, pending his ruling.

**One thing to decide before it enters a preset, which the sample surfaced.** A verified absorbed claim
becomes a verified figure, and verified figures are quoted into the interviewer's prompt with their value
("arithmetic_ok: 200k × 20 percent = 40000 holds"). The *span* is now the candidate's own words, so
nothing fabricated is quoted — but the rendered **value** of an absorbed claim is the absorbed one
(`300000000` where he said "300m"). It is his own quantity, at the right magnitude; it just reads
long. Worth his eye, not a blocker.

**Known gap, pinned as a test:** a figure carrying both a scale and a currency word ("8 thousand
dollars") still ends the expression — the currency fold wants digits immediately before "dollars", and
`thousand` is in the way. Widening it would read claims no sample has checked, so it waits for its own
evidence.

---

## 3. Item E's asynchronous variant (`79e3f959`) — it passes, with 0 ms added

### 3.1 What was built

`lib/orchestrator/equation-extractor.ts`: a second, small call, fired **in parallel** with the checker
from inside `startMathCheck`, on a background classifier (`BACKGROUND_MODEL_ID.equations`, Haiku 5.5,
thinking disabled, effort medium, the reply's JSON enforced by schema). Its prompt carries the
candidate's own words and nothing of the case — no ledger, no exhibit, no math step, no answer key, and
not even the interviewer's lines. It asks for transcription only, never a verdict. `verifyEquation` and
`supersededBy` are the same pure, tested functions: **the model hears, code judges**, with the same four
guards (low confidence is `unclear`, every figure must be one the message states, every quoted span must
be the candidate's own words, a replacement must itself be a figure he said).

It fails open: an error or a timeout leaves the verdict exactly as it is today (tested). `plan-turn`'s
cross-message `staleDrop` reads the sheet from either source.

### 3.2 The checker's prompt is byte-identical — tested, not argued

The test captures the **whole** request the checker sends — system prompt, user message, model,
`max_tokens`, `thinking`, `output_config` and its schema, `betas`, `fallbacks` — and asserts
`JSON.stringify(async) === JSON.stringify(off)`, and that `checkerEquations` on does differ (in the
output schema as well as the prompt).

So the checker call with this switch on **is** today's call. Firm recall is therefore the off arm's
**12/16**, by construction: there is no second task to split the model's attention and no larger output
schema. **The round-2 regression (12/16 → 11/16, `fc290dc0` t20's real error going `error/medium` →
`unverifiable/low`) cannot occur in this form, and no paid arm was needed to show it.**

### 3.3 Verdict arrival against the turn boundary — the number that decides it

The checker is off the interviewer's critical path: nothing in `plan-turn`, `session-runner` or
`settle-turn` awaits `startMathCheck`'s promise, and verdicts are read from stored `math_checker` rows on
a later turn. So the question is not added turn time but **when the verdict becomes available** — a late
verdict pushes a probe or correction a turn later, or past the close.

Paired over the same 16 labelled recall messages, one call at a time (concurrency 1), the checker numbers
being round 2's recorded per-message latencies and the extractor's measured here
(`scripts/equation-extractor-latency.ts`):

| verdict arrival | p50 | p90 | max |
|---|---:|---:|---:|
| today — the checker alone | 11,114 ms | 15,663 ms | 16,932 ms |
| the synchronous widening (`checkerEquations`) | 13,345 ms | 19,899 ms | 22,976 ms |
| the extractor alone | 2,563 ms | 3,992 ms | 4,280 ms |
| **asynchronous — max(checker, extractor)** | **11,114 ms** | **15,663 ms** | **16,932 ms** |
| **added by the asynchronous form** | **0 ms** | **0 ms** | **0 ms** |

The extractor is faster than the checker on **all 16** messages, so the parallel arm's arrival is the
checker's own arrival, to the millisecond. **Lorenzo's bar is at most 100 ms added at p90; this adds 0.**

**Against the real turn boundary.** The only live speech timings that exist are the recorded `voice-live`
sessions: **115 candidate-turn gaps** across them (the time from one candidate's speech ending to the
next's, which is when the next turn is planned) — p10 12,129 ms, p50 26,890 ms, p90 67,289 ms, min
6,261 ms. Over all (message × gap) pairs:

| arm | verdicts landing before the next turn | too late to act on |
|---|---:|---:|
| today | **89.5%** | 10.5% |
| the synchronous widening | 85.5% | 14.5% |
| **asynchronous** | **89.5%** | **10.5%** |

**The synchronous form would have pushed 4.0 points of verdicts past the turn they could act on. This
pushes none.** (Each message's own run window is in the script's third table and is a harness pacing
artefact — `--pace=human` runs sit at ~92 s, fast ones at ~9 s — so it decides nothing; for the record it
is 12 in time, 1 too late in every arm including today, 3 with no later turn.)

### 3.4 Two findings the run forced, both fixed

**(a) `supersedes` names a figure from an EARLIER message, so "the message alone" cannot do (b)'s job.**
With the message alone, the Haiku extractor's sheet for `c82e7bd7` message 25 had 4 entries and no
standalone-LTV/CAC entry; a **Sonnet 5.5** extractor on the same message (1 call, $0.0202) produced
"Starter standalone multiple = 2" with `supersedes` **empty** — because the earlier value, 1.4x, is in an
earlier message, not this one. So the extractor is now given the candidate's **own last 8 messages** and
told they are for `supersedes` only. Still no case data, and not the interviewer's lines either. With
them its sheet has 10 entries with their superseded figures, and:

| b39 line | the checker's own sheet (synchronous) | the parallel extractor's sheet (asynchronous) |
|---|---|---|
| quillpath p07 `c82e7bd7` t26, claim `1.4x` | **DROPPED** — "Starter standalone LTV/CAC is now 2x, replacing 1.4x" | **DROPPED** — "Starter standalone LTV/CAC is now 2, replacing 1.4x" |
| quillpath p24 `99dd37d1` t24, claim `2.5x` | not dropped (nothing supersedes the ratio) | not dropped (nothing supersedes the ratio) |
| larkspur p57 `69441a66` t10, claim `2.0` | not dropped (the superseded figure is an input) | not dropped (the superseded figure is an input) |

**1 of 3, the same line, the same reason — §E.2's outcome exactly, from the small parallel call.** The
extractor's own latency with the priors is still p50 2,563 / p90 3,992 ms, so the arrival table above is
the one with them.

**(b) `supersededBy` was matching figures without their units, and dropped a line it should not have.**
On the first (message-only) run it dropped the `c82e7bd7` probe — but on the entry superseding **"$1.4m
net"**, against a claim value of **"1.4x"**. Same digits, a different quantity. A false drop is a line
that should have been spoken and never is, which is a missed real error, so: each figure now carries its
kind (`$` / `%` / `x`) and its explicit scale, and a pair whose kinds or scales disagree is not a match. A
bare figure still matches, since the words say nothing either way. Four tests pin it.

### 3.5 The equations themselves, and why `incorrect` must stay wired to nothing

Code rated **5** of the extractor run's equations `incorrect`, and **3 of the 5 were false** — every one
of the three a percent the model transcribed as a factor the candidate never meant:

| the entry | the candidate's words | code's verdict, before | truth |
|---|---|---|---|
| `115 × 10% = 126.5` | "A 10% price increase takes revenue to 126.5" | `incorrect` | right — he means 115 × 1.10 |
| `480m$ × 10% = 528m$` | "a 10% price increase takes revenue to $528M" | `incorrect` | right |
| `158.8 − 115 = 38%` | "versus 115 today — that's a 38% price increase" | `incorrect` | right — 158.8/115 − 1 = 38.1% |
| `4.2 points + 11.8 points = 18 points` | "the 18-point decline is fully explained — 4.2 from beans, 11.8 from dairy" | `incorrect` | **a real error** — it is 16 |
| `16 / 18 = 1.6%` | "16 over 18… 18/18 would be 2. So 16/18 is like 1.6%" | `incorrect` | wrong work (0.89) |

So `verifyEquation` gained the two readings the deterministic reader already allows, **in the safe
direction only — a verdict may move off `incorrect`, never onto it**: a percent operand read as a growth
factor on a `*`/`/` equation (→ `correct`, exactly as `checkStatedArithmetic`'s own `pctAt` rescue does
it), and a relative change transcribed as a difference (→ `unclear`, because the transcribed operator may
not be the one he meant — never a flag). After it: 2 `correct`, 1 `unclear`, and the two real errors stay
`incorrect`. All five are pinned as tests.

**They are still wired to nothing live**, as round 2 left them (judgement call 15). This round is the
reason to keep it that way: the false rate on `incorrect` was 3 in 5 before the rescues, which is exactly
item C's risk profile, and the rescues were measured on 16 messages, not on a corpus.

---

## The gate for the round

Run at HEAD (`79e3f959`), and at item 2's commit before it; both are identical to item 1's.

| line | result |
|---|---|
| 0 new false flags | **Met.** 0 new flags in every arm measured: `ofAsMultiplication` typed (6,304 messages), `scaleWordReading` spoken and written, the 31-slice replay (0 changed checker decisions), the fault bank (no class moved). |
| 0 new false corrections | **Met.** 0 changed interviewer lines across 31 slices / 230 runs / 6,020 turns; `fact-check` F2-next unchanged at 97. |
| 0 missed real errors | **Met, and one existing risk removed**: `supersededBy`'s unit-blind figure match would have dropped a true line on a digit coincidence (§3.4b). The scale-word reading is barred from silencing a flag (0 flags removed), and the equation rescues move verdicts off `incorrect` only, never onto it. |
| correct records 95/95, both arms | **95 / 95 with `*=phase1` and 95 / 95 with the switches off**, at all three commits. Fault **78 / 154** on and **48 / 155** off — unchanged from the 27 Oct gate. `run_missing` **0**; **no record moved** from `fails_as_expected` into a skip class in either arm. |
| prof-001 identical with the switches off | **Met** — inside the 31-slice compare: `r2f-gate → r3-gate`, `r3-gate → r3b-gate` and `r3b-gate → r3c-gate` each report **0 changed decisions, 0 changed lines, 0 runs on one side only** over 230 runs and 6,020 turns. |
| `scripts/fact-check.ts`, `env -u ENGINE_SWITCHES`, 31 slices | **F1 0 · F2-next 97 · F2-rec 11 · F3 0 · F4 0** at every commit. |
| `speechNormalization` stays out of the preset | **Met** — untouched, and the contract test now asserts the preset does not carry it. |
| suite / types / lint | `npx vitest run` **5,928 passed / 9 skipped**, `npx tsc --noEmit` clean, `npx eslint lib app components tests scripts db` clean — at each commit. |
| the asynchronous variant's own gate (≤ 100 ms added at p90) | **Met with 0 ms** (§3.3). |

Labels under `CaseTester-proof-out/`: `r3-gate`, `r3b-gate`, `r3c-gate`, `fault-bank-r3-{p1,off}`,
`fault-bank-r3b-{p1,off}`, `fault-bank-r3c-{p1,off}`; compares `compare-r2f-gate-vs-r3-gate.md`,
`compare-r3-gate-vs-r3b-gate.md`, `compare-r3b-gate-vs-r3c-gate.md`. Nothing written inside the corpus;
nothing under `Case Interview Runs/` staged.

---

## Where each switch stands

| switch | state | preset |
|---|---|---|
| `ofAsMultiplication` | shipped | **in `phase1`** (Lorenzo's ruling, item 1) |
| `scaleWordReading` | shipped, sample clean | **out** — he approved the reading, not the preset; awaiting that ruling |
| `speechNormalization` | built (round 1 + follow-up 1) | **out** (his standing instruction, untouched) |
| `checkerEquationsAsync` | built, passes its latency gate with 0 ms added | **out**, nameable for evaluation |
| `checkerEquations` | built, **fails its latency gate**; superseded by the async form | **out**, and must not go in in this form |

---

## The spend

**$0.0448 of the $0.10 cap**, 39 calls: 38 Haiku 5.5 ($0.0246) and 1 Sonnet 5.5 ($0.0202).

- 16 extractor calls, message only — $0.0077
- 3 b39 drop calls, message only — $0.0019
- 1 Sonnet 5.5 extractor call on `c82e7bd7` (the `supersedes` question) — $0.0202
- 3 b39 drop calls with the candidate's earlier messages — $0.0030
- 16 extractor calls with the earlier messages (the arrival table) — $0.0120

**The budget ledger was correct from the first call, and checked before it.** `LLM_BUDGET_FILE` is a
JSONL append log, one line per call with a `usd` field — not a state object. I created it empty and ran a
summing check before spending (`lines 0, sum 0, isFinite true`), and re-ran that check before each later
paid command (`lines 16, sum 0.00766`, `lines 20, sum 0.0298`, `lines 23, sum 0.0327` — a real number
every time). The cap was enforcing from call 1; round 2's `{"spentUsd":0}` lapse is not repeated.

The whole round's free evidence — three gate runs, the 589-claim measurement, the 50-claim sample, the
115 voice-gap distribution, the typed and spoken replays — cost $0.

---

## Judgement calls, each with its cost if wrong

1. **The 50 were stratified by the readings in each claim's span, with a floor of 4 per class, not drawn
   in proportion.** Proportional would have been ~45 currency and 0–1 `k`; the point of the sample is to
   test every reading. *Cost if wrong: the sample over-weights the rare readings, so it says less about
   the plain currency class than a proportional draw would. That class has 16 of the 50 — still the
   largest block — and the global power-of-ten check (§2.3) covers all 589.*
2. **`absorbScaleWords` is the measured pre-pass unchanged, including its one gap** ("8 thousand
   dollars"). Shipping a wider reading than was sampled would put claims in front of a candidate that
   nothing checked. *Cost if wrong: a real spoken shape stays unread, and the recovery is smaller than it
   could be. Pinned as a test so the next round sees it.*
3. **An absorbed claim may not silence a step flag.** "Never a flag" is about raising one; silencing one
   is the same harm backwards, and a false `correct` is precisely what he was worried about. *Cost if
   wrong: a false step flag an absorbed correct claim would legitimately clear stays. 0 flags were
   removed either way on this corpus, so the cost is unmeasurable here.*
4. **The absorbed claim's span is the candidate's sentence, not the absorbed text.** Verified figures are
   quoted into the interviewer's prompt. *Cost if wrong: nothing; it is strictly safer. The absorbed
   figure's rendered value still appears, which is §2.4's note for his eye.*
5. **`scaleWordReading` is out of the preset.** He approved the reading; the preset is a separate
   decision, and the only one of the three switches he named explicitly was `ofAsMultiplication`. *Cost
   if wrong: a round's delay on 589 verified claims and 14 points of verified figures on speech. One line
   to change.*
6. **The extractor is given the candidate's own last 8 messages, which §E.6 did not propose** (it said
   "the message alone"). Without them the answer sheet cannot fill `supersedes`, and (b) does not work at
   all — proved on two models. The candidate's own words are not case data, which is the boundary the
   proposal was drawing. *Cost if wrong: a larger prompt (~700 → ~1,500 tokens) and a slightly slower
   call, both measured and both far inside the gate. If he meant the literal message only, the variant
   ships with (a) alone and (b) stays the checker's job.*
7. **8 priors, not all of them.** A case runs 20–30 candidate messages; the figure a new value replaces
   is almost always recent. *Cost if wrong: a value last stated more than 8 messages ago is not named as
   superseded, and its stale line is not dropped. One constant.*
8. **`supersededBy` now refuses a pair whose kinds or scales disagree, but a bare figure still matches.**
   Requiring a kind on both sides would have lost the larkspur `2.0` case's shape entirely. *Cost if
   wrong: a bare figure can still match the wrong quantity — the same coincidence, one unit word away.
   Tightening it further needs its own evidence.*
9. **`verifyEquation`'s two rescues were added on 16 messages' evidence, in the safe direction only.**
   Leaving a 3-in-5 false rate on `incorrect` unremarked would have been worse, and both rescues mirror
   readings the deterministic reader already allows. *Cost if wrong: an equation that is genuinely wrong
   but accidentally consistent under a growth-factor reading comes out `correct`. Since `incorrect` is
   wired to nothing live, the live cost today is zero; it becomes real the day (a) is wired up, which
   §E.6 item 3 already says needs item C's treatment.*
10. **I did not re-run the checker to re-measure recall.** The byte-identity test makes the off arm's
    12/16 the async arm's by construction, and a paid arm would have cost ~$0.5 to re-derive a number
    that cannot differ. *Cost if wrong: if the request were not byte-identical, recall would be unknown.
    The test asserts the whole serialized request, not a part of it.*
11. **The extractor's equations are not stored on the verdict row**, matching the synchronous form, which
    stored only the answer sheet. *Cost if wrong: scoring cannot read them later without a schema change
    (one optional field). The raw model entries are not stored either, so re-verifying §3.5 offline
    needed hand-reconstruction from the expressions.*
12. **I stopped at $0.0448 of $0.10.** Every question the brief asked is answered, and the one open
    question left (how good the Haiku sheet is across a corpus, not 4 messages) needs a labelled set, not
    more of these calls. *Cost if wrong: the arrival table rests on 16 messages and the drop equivalence
    on 3 — the same denominators round 2 used, so they are comparable, and both are small.*

---

## What is owed from Lorenzo

1. **Does `scaleWordReading` enter the `phase1` preset?** The sample is clean and the reading is his; the
   preset entry is not yet ruled. (§2.4 names the one cosmetic consequence to look at first.)
2. **Does the asynchronous variant enter a preset, or run behind `ENGINE_SWITCHES` for one wave first?**
   It adds 0 ms to verdict arrival, leaves the checker's call untouched, and does §E.2's job — but its
   answer sheet is a Haiku transcription, evaluated on 4 messages.
3. **Is the equations half (a) worth wiring to anything?** Today it is recorded and read by nothing. The
   safe direction (an equation code verifies `correct` clearing a false flag) is worth having; the unsafe
   one (an `incorrect` raising a new flag) needs item C's treatment, and §3.5 is the reason.
