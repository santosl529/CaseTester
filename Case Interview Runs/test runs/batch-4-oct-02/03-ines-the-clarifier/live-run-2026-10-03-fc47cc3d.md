# Live run — Brew & Bean Profitability

- Session: `fc47cc3d-1af7-4512-ae95-0956803e4c20` · case `prof-001` · status **completed** · 2026-10-03
- Overall: **meets_bar**
- Candidate simulator: `claude-opus-5` (sees only the transcript)
- Persona: **3. Ines — the Clarifier**
- Tests: Rule 13 clarifying-question budget (N=2 default): tests whether a legitimately thorough candidate trips the ladder. If she does, N is too low or the quality guard is needed after all.
- Pacing: fast (no delay); persona pauses ≤600s

## Rule 11 / v4.1 checks

- Ledger items revealed: `stores_count`, `revenue_per_store`, `revenue_total`, `menu_price_change`, `cogs_pct`, `labor_pct`, `overhead_pct`, `bean_share_of_cogs`, `bean_price_change`, `non_bean_input_change`
- Force-released before the recommendation ask: none
- Scoring QA: `{"caveatFloors":0,"artifactTypes":[],"gapClaimDrops":0,"overallCapped":false,"verifierDrops":0,"answerKeyDrops":0,"evidenceStrips":0,"markClaimDrops":0,"caveatTextDrops":0,"dataRequestGaps":0,"reconcileMerges":5,"answerKeyReRates":0,"strongDowngrades":0,"evidencePointDrops":0,"transcriptArtifacts":0,"dataRequestBackfills":0,"crossDimensionRepeats":2,"dataRequestsNotInCase":7,"interviewerErrorMarks":0}`
- Assists / interventions: none

| Candidate turn | Response | Ledger items | Asked for | Revealed by then |
|---|---|---|---|---|
| 1 | release | stores_count, revenue_per_store, revenue_total | Whether revenue growth came from new store openings or same-store sales growth at existing locations | yes |
| 3 | refuse | — | Whether margin decline is concentrated in certain regions, store formats, or newer stores versus broad-based across all stores | no |
| 5 | release | menu_price_change | Whether the 15% revenue growth came from price increases or transaction volume | yes |
| 7 | release | cogs_pct, labor_pct, overhead_pct | Cost structure (COGS, labor, occupancy, corporate overhead) for both years as a percent of revenue | yes |
| 9 | refuse | — | Whether COGS includes food waste and spoilage, or only product inputs (beans, dairy, cups) | no |
| 11 | release | — | Confirmation of whether revenue growth of 15% is cumulative over two years or annual | no |
| 11 | release | bean_share_of_cogs, non_bean_input_change | Breakdown of COGS between coffee beans and other inputs (dairy, packaging, food) | yes |
| 13 | refuse | — | Competitor pricing actions over the same 2-year period | no |
| 13 | refuse | — | Contractual constraints on menu pricing | no |
| 15 | refuse | — | Coffee bean spend breakdown: proportion on contract versus spot market purchases | no |
| 19 | refuse | — | Price elasticity data — whether the chain has tested price increases before or has data on how much traffic volume would drop per point of price increase | no |

## Check decisions

| Check | Pass | Act | Skip | Acted at candidate turn |
|---|---|---|---|---|
| assumption_guard | 10 | 0 | 1 | — |
| conduct | 11 | 0 | 0 | — |
| conduct_model | 11 | 0 | 0 | — |
| data_promise | 10 | 1 | 0 | 3 |
| end_gate | 11 | 0 | 0 | — |
| exhibit_promise | 11 | 0 | 0 | — |
| fabricated_turn | 11 | 0 | 0 | — |
| final_message_release | 1 | 0 | 0 | — |
| forced_release | 1 | 0 | 10 | — |
| grace_ask | 11 | 0 | 0 | — |
| meta_leak | 11 | 0 | 0 | — |
| probe_guard | 11 | 0 | 0 | — |
| provenance | 11 | 0 | 0 | — |
| recompute | 11 | 0 | 0 | — |
| rung_delivery | 0 | 0 | 11 | — |
| same_turn_resolution | 7 | 2 | 2 | 1, 5 |
| spoken_close | 11 | 0 | 0 | — |
| stale_release | 9 | 0 | 0 | — |
| stall | 11 | 0 | 0 | — |
| style | 10 | 1 | 0 | 3 |
| system_language | 11 | 0 | 0 | — |
| time_warning | 11 | 0 | 0 | — |
| timeframe | 11 | 0 | 0 | — |
| unit_check | 11 | 0 | 0 | — |
| verified_figures | 11 | 0 | 0 | — |

## LLM usage

| Component | Calls | Input tokens | Output tokens | Est. USD |
|---|---|---|---|---|
| distress (claude-haiku-4-5) | 11 | 7238 | 287 | $0.009 |
| data_request (claude-haiku-4-5) | 22 | 17055 | 1475 | $0.024 |
| interviewer (claude-sonnet-5-5) | 11 | 88000 | 1156 | $0.188 |
| coverage (claude-haiku-4-5-20251001) | 10 | 17524 | 1300 | $0.024 |
| judge (claude-opus-5-5) | 1 | 13605 | 12379 | $0.302 |
| verifier (claude-opus-5-5) | 1 | 6309 | 2175 | $0.069 |
| reconcile (claude-opus-5-5) | 1 | 3348 | 2298 | $0.059 |
| candidate simulator () | 0 | 0 | 0 | $0.000 |

- App cost (interviewer + scoring): **$0.67** · with simulator: **$0.67** · list prices, uncached
- Wall time: 23:23

## Feedback

**Top improvement:** Size the price lever from the target, using all cost lines, before presenting it. Total costs are about $451M, so restoring 24% margin at constant volume needs revenue of about $594M, roughly a 24% price increase. A 15% increase delivers about $72M of profit and an ~18% margin, so state explicitly that procurement and mix must close the remaining ~6 points.

### Problem Structuring — meets_bar
- ✅ Once pressure-tested, the candidate prioritized the cost branch with a clear hypothesis-driven reason.
  > I'd prioritize the cost branch first, specifically the largest lines as a percent of revenue.
  > So something variable or semi-variable is scaling badly.
- ⚠️ The structure arrived late: three turns of scoping questions came first, and the interviewer had to prompt for a framework. The objective was never restated up front.
  > Thanks — before I lay out a structure, I want to make sure I understand the business.
  > One more scoping question before I structure: did the 15% revenue growth come from price increases or from transaction volume?
- ⚠️ The final structure used clean line-item cost buckets plus a price/transactions/mix revenue split, which is a relevant and mostly MECE profit tree, but the first cost cut overlapped fixed/variable with line items and was fixed only after the interviewer's MECE challenge.
  > On cost: fixed versus variable — COGS (coffee beans, milk, cups), store labor, rent and occupancy, and corporate overhead and marketing.
  > Structurally, I'd split profit into revenue and cost. On revenue: price per ticket times transactions, by product mix — coffee vs. food vs. retail beans.
  > So I'd use line items as the primary cut — COGS, labor, occupancy, corporate overhead — and tag each as fixed or variable rather than treating those as separate branches.
- 💡 Turn 1, the candidate's first response to the prompt, which went straight to clarifying questions.
  > Better: Our goal is to find why net margin fell 18 points, from 24% to 6%, while revenue grew 15%, and how to restore it. I'll split profit into revenue (price × volume × mix) and costs (COGS, labor, occupancy, overhead). My hypothesis is costs, since margin collapsed while sales grew. The answer will tell the CEO whether to fix pricing, procurement, or operations.

### Quantitative & Analytical Rigor — meets_bar
- ✅ The COGS reconciliation was laid out step by step, and it ties exactly: input inflation by category, scaled by volume, rebuilds current COGS of about $278M.
  > Two years ago COGS ≈ $175M. Beans 25% = $43.75M; other inputs 75% = $131.25M.
  > Volume is up 15% with flat menu prices, so scale the whole thing: $241.8M × 1.15 = $278M.
- ✅ The candidate proactively flagged the cumulative-vs-annual growth assumption and showed how the base would change under each reading.
  > If it's 15% annually, the base would be $480M ÷ 1.15² ≈ $363M, and COGS two years ago would be about $152M — making the dollar growth even steeper.
- ⚠️ The headline sizing of the price lever was understated: it counted only COGS dilution and then multiplied a margin delta by new revenue. Correctly, all costs stay at $451M, so +$72M revenue is +$72M profit and margin reaches about 18.3%. The candidate fixed this only when the interviewer probed.
  > COGS stays $278M, falling from 58% to about 50% — roughly 8 points of margin, or $40M.
  > And 7.5% × $552M ≈ $41M, which is where the $40M came from.
- ⚠️ The 15% price increase was asserted, not derived from the goal. Restoring 24% margin at constant volume requires revenue of $451.2M / 0.76 ≈ $594M, about a 24% increase. The chosen 15% reaches only about 18%, and that gap was never stated.
  > Sizing: a 15% price increase at constant volume takes revenue from $480M to $552M.
- 💡 Turn 19, when sizing the price recommendation.
  > Better: Total costs are 94% of $480M, about $451M, and stay fixed at constant volume. To get back to 24% margin, revenue must reach $451M / 0.76 ≈ $594M, roughly a 24% price increase. A 15% increase gives $552M revenue and about $101M profit, an 18% margin, so procurement and mix need to close the remaining ~6 points.

### Data & Exhibit Interpretation — strong
- ✅ The candidate read every line of the exhibit across all three periods and attributed all 18 points of margin loss.
  > COGS goes 42 → 50 → 58, up 16 points. Overhead goes 12 → 13 → 14, up 2. Labor is dead flat at 22.
  > So COGS is ~89% of the problem; overhead is a rounding error by comparison.
- ✅ The candidate isolated COGS, noted the steady trend shape, and asked what sits inside COGS as the next step.
  > COGS rose steadily both years, not as a one-time step, which reads more like a trend than a single contract shock.
  > Before I diagnose: is COGS here purely product inputs — beans, dairy, cups — or does it also include in-store food waste and spoilage?
- ✅ Rather than stopping at the bean spike, the candidate tested beans and other inputs together and showed they fully explain the COGS move, but the split stayed in dollars and was never converted to margin points. Showing that beans explain only about 4 of the 16 points would have made clear that procurement must cover dairy and packaging too.
  > That's exactly the current COGS figure I derived. So the COGS increase is fully explained
  > Apply the input price inflation: beans $43.75M × 1.40 = $61.25M.
- 💡 Turn 13, after the reconciliation tied out.
  > Better: In margin terms, beans were about 10.5 points of revenue and rose 40%, which explains only about 4 of the 16 COGS points. The other ~12 points come from dairy, packaging, and food, so a bean-only fix won't work.

### Business Judgment & Insight — meets_bar
- ✅ The recommendation is commercially sound and staged, with price pass-through supported by procurement and mix.
  > Recommendation: Brew & Bean should pass through input inflation via a staged menu price increase, starting immediately, backed by procurement and mix actions.
- ✅ The elasticity assumption, made after asking for data the interviewer didn't have, was reasoned from the evidence available.
  > Absent that, I'll assume modest elasticity given specialty coffee's brand loyalty and the fact that volume grew 15% at flat prices, which suggests healthy demand.
- ⚠️ The candidate claimed volume growth worsened the problem. With roughly 42% gross contribution per cup, extra volume added profit dollars, and margin percentage is driven by price vs. input cost, not by unit count.
  > Volume growth actually made it worse, since every incremental cup is sold at a compressed margin.
- ⚠️ The candidate surfaced elasticity and competitor risk and proposed a regional pilot to mitigate them, but proposed a single across-the-board increase without considering where pricing power is greatest, such as specialty vs. basic items.
  > Sizing: a 15% price increase at constant volume takes revenue from $480M to $552M.
  > Risks: elasticity is unmeasured, and competitors may have already repriced.
  > Next steps — pilot a 10–15% increase in two regions, measure traffic, and run a supplier RFP in parallel.
- 💡 Turn 13, when stating the root cause.
  > Better: Volume growth actually helped profit dollars, since each cup still carries positive contribution. The margin collapse is purely a price-cost gap: inputs up ~38%, prices up 0%.

### Creativity & Brainstorming — meets_bar
- ✅ The candidate generated four distinct non-price levers, with procurement options made contingent on the contract situation.
  > Taking both as given, four non-price levers.
  > If they're on spot, hedge — lock forward contracts on beans and dairy to stop the bleeding. If they're already contracted, the lever shifts to consolidating volume across 200 stores into fewer suppliers for better terms at renewal.
- ✅ Several ideas were non-obvious, including a lower-cost drip blend that protects the specialty line and a labor operating-leverage angle.
  > Blend in a lower-cost bean on drip while protecting the specialty line, and tighten dairy and packaging spec.
  > Four, the overlooked line: labor at 22% flat despite 15% more volume means zero operating leverage.
- ⚠️ The four levers were listed but not ranked by impact or ease, so it's unclear which to pursue first.
  > Net: price is still the biggest lever, but these can cover part of the gap.
- 💡 Turn 17, closing out the brainstorm.
  > Better: Ranking them: procurement first, since it's the largest addressable spend and inputs are 75% non-bean. Mix shift second, since it's fast and low-risk. Then input substitution. Labor scheduling last, since it's harder to execute and smaller.

### Synthesis & Recommendation — meets_bar
- ✅ The synthesis named the key risks and gave concrete next steps.
  > Risks: elasticity is unmeasured, and competitors may have already repriced.
- ⚠️ The candidate gave a clear, committed recommendation tied directly to the root cause, but the synthesis opened with another data request instead of leading with the answer.
  > One quick thing first: do we have any read on price elasticity — has the chain ever tested a price increase, or do we know how much traffic they'd lose per point of price?
  > Recommendation: Brew & Bean should pass through input inflation via a staged menu price increase, starting immediately, backed by procurement and mix actions.
  > Root cause is clean: inputs rose ~38% over two years while menu prices rose 0%.
- ⚠️ The impact sizing presented to the CEO was materially understated ($40M vs. about $72M) and had to be corrected under probing.
  > COGS stays $278M, falling from 58% to about 50% — roughly 8 points of margin, or $40M.
- 💡 Start of turn 19, when asked for the recommendation.
  > Better: Brew & Bean should raise menu prices now, because inputs rose ~38% while prices stayed flat, which fully explains 16 of the 18 lost points. A 15% increase adds about $72M of profit and lifts margin to ~18%, and procurement plus mix close the rest. The key risk is elasticity, so I'd pilot in two regions first.

### Communication & Delivery — meets_bar
- ✅ The candidate signposted clearly with numbered levers and explicit structure narration.
  > Taking both as given, four non-price levers.
- ✅ The candidate used hypothesis-driven phrasing and built on the interviewer's cues.
  > So something variable or semi-variable is scaling badly.
  > Fair point on mix — flat menu prices don't rule out customers trading down to cheaper items.
- ⚠️ Answers were repeatedly prefaced with another scoping question, which delayed the structure, the brainstorm, and the recommendation.
  > Fair — let me scope one thing before I list options, because it changes which levers are real.
  > One more scoping question before I structure: did the 15% revenue growth come from price increases or from transaction volume?
- 💡 Turn 15, when the interviewer asked what else the client could do.
  > Better: I'd split non-price levers into procurement, mix, input specs, and operations. For procurement, the right move depends on whether beans are bought on contract or spot, so I'll cover both cases.

### Pushback, Composure & Case Leadership — strong
- ✅ On the MECE pressure test, the candidate acknowledged the overlap and updated the structure with explicit reasoning.
  > On MECE: it's roughly clean, but I'd tighten one thing.
- ✅ When asked to walk through the sizing, the candidate found the error and corrected it transparently with the full-cost logic, but the error surfaced only under interviewer probing, and a self-check before presenting would have caught it.
  > Let me walk it and then correct myself.
  > My $40M understated it — the right number is about $72M of incremental profit.
  > The 8 points came only from the COGS line
- ✅ The candidate drove the case forward by requesting the next data and flagged assumptions proactively.
  > One caveat I should flag: I assumed the 15% is cumulative over the two years, not 15% per year.
  > Can I see the cost structure for both years?

## Transcript

**Interviewer · 0:00** (turn 0)

Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem?

How would you like to approach this? Feel free to take a moment to gather your thoughts first.

**Candidate · 0:56** (turn 1)

Thanks — before I lay out a structure, I want to make sure I understand the business.

First question: when you say revenue grew 15% over two years, is that mostly from opening new locations, or from same-store sales growth at the existing 200? That changes a lot — if they've been expanding aggressively, the margin hit could be new stores ramping up rather than anything wrong with the core business.

**Interviewer · 0:58** (turn 2)

The question maps to the store count and revenue per store, so I'll release both. 200 stores today — and it was 200 stores two years ago, so the footprint hasn’t changed. Average revenue per store is $2.4M a year. To your question on the data: Total revenue is $480M a year.

**Candidate · 1:53** (turn 3)

Good — so flat footprint, which means the 15% is all same-store growth. That's helpful, it rules out expansion drag.

Second question: is this margin decline broad-based across all 200 stores, or is it concentrated in a subset — certain regions, certain store formats, or stores that opened more recently? If it's concentrated, I'd want to go hunting in that segment rather than assume something systemic like commodity costs.

**Interviewer · 1:55** (turn 4)

That's not a cut I have. What I do have is the company-wide cost structure over the two years. With that in mind, how would you lay out your structure for the problem? That breakdown isn't something I have. What would you ask for instead?

**Candidate · 3:26** (turn 5)

Understood — I'll treat it as systemic company-wide then.

One more scoping question before I structure: did the 15% revenue growth come from price increases or from transaction volume? If they raised menu prices and revenue only grew 15%, traffic may actually be down, and a volume decline with fixed costs spread thinner would show up as margin compression on its own.

Structurally, I'd split profit into revenue and cost. On revenue: price per ticket times transactions, by product mix — coffee vs. food vs. retail beans. On cost: fixed versus variable — COGS (coffee beans, milk, cups), store labor, rent and occupancy, and corporate overhead and marketing. Then I'd index each cost line as a percent of revenue across the two years and find which ones grew faster than the 15% revenue growth. That's where the 18 points of margin went.

**Interviewer · 3:28** (turn 6)

I'll apply one pressure test to your structure. To your question on the data: Menu prices have not changed in two years. Is that MECE, and which branch would you prioritize first, and why?

**Candidate · 4:58** (turn 7)

Prices flat means all 15% is transaction volume — traffic is up, so the demand side looks healthy. That points me hard at costs.

On MECE: it's roughly clean, but I'd tighten one thing. Splitting costs by fixed/variable and then also by line item double-counts, since store labor has both a fixed base and a variable component. So I'd use line items as the primary cut — COGS, labor, occupancy, corporate overhead — and tag each as fixed or variable rather than treating those as separate branches.

I'd prioritize the cost branch first, specifically the largest lines as a percent of revenue. Reason: revenue is growing on volume with flat prices, so margin fell 18 points while the top line expanded — costs must have grown materially faster than 15%. And with volume up, any truly fixed cost should be getting *diluted*, improving margin. So something variable or semi-variable is scaling badly. Can I see the cost structure for both years?

**Interviewer · 5:01** (turn 8)

Prices are flat, but I'd note the data doesn't yet separate traffic from ticket size or mix, so that's still open. On your request, I'll show the cost structure exhibit. Tell me what you see in it.

**Candidate · 6:32** (turn 9)

Fair point on mix — flat menu prices don't rule out customers trading down to cheaper items.

Reading the exhibit, all as percent of revenue: COGS goes 42 → 50 → 58, up 16 points. Overhead goes 12 → 13 → 14, up 2. Labor is dead flat at 22. Total 18 points, which exactly matches the margin fall from 24 to 6. So COGS is ~89% of the problem; overhead is a rounding error by comparison.

Two things stand out. One, labor holding at exactly 22% while volume grew 15% is itself odd — I'd expect some fixed-cost dilution there, so labor in dollars grew right alongside revenue. Two, COGS rose steadily both years, not as a one-time step, which reads more like a trend than a single contract shock.

In dollars, COGS went from 42% of ~$417M to 58% of $480M — roughly $175M to $278M.

Before I diagnose: is COGS here purely product inputs — beans, dairy, cups — or does it also include in-store food waste and spoilage?

**Interviewer · 6:34** (turn 10)

I don't have a split of what sits inside COGS beyond the input categories. The next breakdown I can give you is how much of COGS is coffee beans versus other inputs, and how each has moved.

Before I do, you converted the COGS percentages into dollars. Walk me through how you got the starting revenue figure.

**Candidate · 8:05** (turn 11)

Sure. Current revenue is $480M, and revenue grew 15% over the two years, so I treated $480M as the end point and backed into the start: $480M ÷ 1.15 = $417.4M, call it $417M.

Then COGS two years ago is 42% × $417M ≈ $175M, and today it's 58% × $480M ≈ $278M. So COGS dollars grew about $103M, or roughly 59% — versus revenue up 15%.

One caveat I should flag: I assumed the 15% is cumulative over the two years, not 15% per year. If it's 15% annually, the base would be $480M ÷ 1.15² ≈ $363M, and COGS two years ago would be about $152M — making the dollar growth even steeper. Can you confirm which it is? Either way the direction holds: COGS is growing roughly four times faster than the top line.

Yes, please — I'd like the beans versus other inputs split.

**Interviewer · 8:07** (turn 12)

The prompt states revenue grew 15% over the same two-year period, so your cumulative reading holds. Your derivation checks out against the data. Coffee beans were 25% of COGS two years ago. Raw coffee bean costs are up 40% over the past two years. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years.

**Candidate · 9:39** (turn 13)

Let me run that.

Two years ago COGS ≈ $175M. Beans 25% = $43.75M; other inputs 75% = $131.25M.

Apply the input price inflation: beans $43.75M × 1.40 = $61.25M. Other $131.25M × 1.375 = $180.5M. Total = $241.8M.

But that's price only, holding volume constant. Volume is up 15% with flat menu prices, so scale the whole thing: $241.8M × 1.15 = $278M.

That's exactly the current COGS figure I derived. So the COGS increase is fully explained — roughly 38% blended input inflation compounded with 15% more units sold. There's no hidden waste, shrink, or sourcing problem left over.

And the root cause follows directly: input costs rose ~38% while menu prices rose 0%. Brew & Bean absorbed two years of commodity inflation entirely. Volume growth actually made it worse, since every incremental cup is sold at a compressed margin.

Before I go to a recommendation, two things I'd want. First — is there any contractual reason prices haven't moved, or a competitive one? What have competitors done on price over the same period?

**Interviewer · 9:41** (turn 14)

Your reconciliation ties out to the revealed cost figures. I don't have competitor pricing or any contractual constraint on menu prices. Beyond raising prices, what else could the client do to reverse this?

**Candidate · 10:31** (turn 15)

Fair — let me scope one thing before I list options, because it changes which levers are real.

How much of the bean spend is on contract versus spot? If they're buying at spot with no hedging, forward contracts or locking in supply are available to them; if they're already on multi-year contracts, that lever is gone and the 40% is baked in.

**Interviewer · 10:33** (turn 16)

That's not in the information I have, so treat it as an open question. Take both possibilities as given and tell me what else the client could do, beyond raising prices.

**Candidate · 12:03** (turn 17)

Taking both as given, four non-price levers.

One, procurement. If they're on spot, hedge — lock forward contracts on beans and dairy to stop the bleeding. If they're already contracted, the lever shifts to consolidating volume across 200 stores into fewer suppliers for better terms at renewal. Either way, 200 locations is real buying power.

Two, mix shift. Flat menu prices with volume up 15% means more units at thin margins. Push customers toward higher-margin items — retail bean bags, food attach, larger sizes — which raises effective ticket without changing a single posted price.

Three, input substitution and portion control. Blend in a lower-cost bean on drip while protecting the specialty line, and tighten dairy and packaging spec. A 1-point COGS improvement is ~$5M.

Four, the overlooked line: labor at 22% flat despite 15% more volume means zero operating leverage. Scheduling to traffic patterns should let labor fall as a percent of sales.

Net: price is still the biggest lever, but these can cover part of the gap.

**Interviewer · 12:06** (turn 18)

Understood. You've given me levers; now put it together for the CEO. What's your recommendation, including what you'd do first and how you'd size the impact?

**Candidate · 13:36** (turn 19)

One quick thing first: do we have any read on price elasticity — has the chain ever tested a price increase, or do we know how much traffic they'd lose per point of price? It won't change my recommendation's direction, but it sizes the risk. Absent that, I'll assume modest elasticity given specialty coffee's brand loyalty and the fact that volume grew 15% at flat prices, which suggests healthy demand.

Recommendation: Brew & Bean should pass through input inflation via a staged menu price increase, starting immediately, backed by procurement and mix actions.

Root cause is clean: inputs rose ~38% over two years while menu prices rose 0%. That fully reconciles the COGS move from 42% to 58% of revenue and accounts for 16 of the 18 lost margin points.

Sizing: a 15% price increase at constant volume takes revenue from $480M to $552M. COGS stays $278M, falling from 58% to about 50% — roughly 8 points of margin, or $40M. Procurement and mix could plausibly deliver another 3–4 points.

Risks: elasticity is unmeasured, and competitors may have already repriced. Next steps — pilot a 10–15% increase in two regions, measure traffic, and run a supplier RFP in parallel.

**Interviewer · 13:39** (turn 20)

The data doesn't include any price test or elasticity read, so that stays an assumption.

Your sizing says a 15% price increase lifts revenue to $552M and drops COGS to about 50% of revenue. Walk me through how that gets you to roughly 8 points of margin and $40M.

**Candidate · 15:09** (turn 21)

Let me walk it and then correct myself.

The 8 points came only from the COGS line: COGS stays at $278M in dollars because volume is flat, so as a percent of revenue it goes from $278M/$480M = 57.9% to $278M/$552M = 50.4%. That's 7.5 points, call it 8. And 7.5% × $552M ≈ $41M, which is where the $40M came from.

But I under-counted. Labor and overhead are also flat in dollars if volume doesn't change — labor 22% × $480M = $106M, overhead 14% × $480M = $67M. Those dilute too.

Cleaner: all costs are unchanged at $451M, revenue rises $72M, so profit goes from $28.8M to $100.8M. Margin = 100.8/552 = 18.3%, up roughly 12 points, not 8.

So the price lever alone gets them most of the way back to 24%. My $40M understated it — the right number is about $72M of incremental profit.

**Interviewer · 15:11** (turn 22)

That's our time. Thanks for working through this with me — your written report will follow.
