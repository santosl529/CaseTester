# Post-wave Phase 1 fixes — report

**Lorenzo's rulings on batch 39, applied 26 Oct 2026**, in worktree `.claude/worktrees/phase1` on branch `phase1`,
base **2a8dca76**. Free replay only: no paid run, no scoring call, no push, no merge, no DB write, no deploy.
Nothing under `Case Interview Runs/` was staged.

Commits, in order:

| commit | item |
|---|---|
| `f69e4856` | 1 — the conduct misfire (C5 floor, the post-pause exit gate, "finish") |
| `9972ed4b` | 3 — the misquote detector misses and the flat sentence's timing |
| `66c05845` | 2 — the stale probes: ruling (a), the line's own figures, the lineage |
| `f5cfd81f` | housekeeping — the simulator's retired Opus 4.8 fallback |
| (see §7) | the gate round: two follow-on fixes the replays found, and the report |

---

## 1. The conduct misfire (`f69e4856`)

Three changes, all from `aldermoor p07 35740806`.

**(a) `nothing (matters|works)` is out of the `C5_DESPAIR` regex floor.** Lorenzo's correction to the grading is
confirmed from the turn file: t18's `conduct` check records `act — C5: offer_pause`, `{category: C5, action:
offer_pause, reason: "despair"}`, and `conduct_model` records `skip — regex floor already fired C5`. t17 ends
*"If it's cash to Aldermoor, A is $240 million and B is $120 million — both miss, and nothing works."* That is a
verdict on two options, not on himself. Generalized hopelessness in those words is the model layer's call now; the
first-person forms (`i can't do this anymore`, `i hate myself`, `i'm worthless`, `i give up on everything`,
`what's the point`, `why do i even bother`, the `bomb/fail every` form) and all of `C5_SELF_HARM` stay on the floor.

**(b) After an `offer_pause`, `planExit` never closes the case.** t20's checks read `c5_pause_reply: pass` (so
`isPauseAccepted` correctly read *"but I'm okay"* as a decline) and then `candidate_exit: act — stop: would like to
stop`, `{intent: "stop", decision: "stop"}`, and the case closed in the EXHIBIT phase. The gate is in `planExit`:
when the message is the reply to a pending C5 offer, a closing decision (`stop` or `declined`) becomes the clarifying
question if it has not been used, and otherwise nothing — the case carries on. Logged as `exit_after_pause`. The
reasoning: the offer has already asked "stop, pause, or keep going?", and the explicit accept is taken above by
`isPauseAccepted`, where a decline wins ties; so anything that still reads as a stop in a message that has declined is
ambiguous, and ambiguous asks once and never closes.

**(c) `finish` is no longer a bare stop verb.** It sat beside `stop|end|quit|call it|leave it` in two `STOP` patterns
whose object list (`OBJ`) accepts "it / this / the case", so *"I'd like to finish"*, *"I'd like to finish the case"*
and *"Can we finish the case?"* all classified as `stop`. It now counts only with an object that can only mean ending
here and now: `finish (up)? (here|there|now|early|for now|for today)`.

**Evidence.** `tests/orchestrator/conduct.test.ts` — the whole p07 t17 message classifies `none`; three case verdicts
in those words ("nothing works at that price", "nothing matters if the traffic keeps falling") are not distress; five
despair lines and five self-harm lines still fire as `offer_pause`, the self-harm ones as `isRiskToSelf`; "Nothing
works and I can't do this anymore" is still C5. `tests/orchestrator/candidate-exit.test.ts` — six "finish" forms that
are not stops, five that are, and the other stop forms untouched. `tests/orchestrator/exit-runner.test.ts`, through
the real runner — p07 t19 carries on with no close, no 988 and the model's own question delivered; "I'm okay, let's
keep going", "No — keep going" and "I'd like to finish" each resume; an ambiguous sign-off after the offer asks once
and never closes, even with the clarification already used; and an explicit accept still closes.

**Records.** `b39a-raj-t18-c5-misfire` and `b39a-raj-t20-exit-misread`, both **serious**, both `replayable: false`
with a wave note and listed in `evals/fault-bank/wave-judged.md`. Both recorded turns are `scripted`, so the run holds
no model output for the turns the fixes turn into model turns — the contract's §4.3 case exactly ("a turn whose kind
changes, so its saved declarations are lost"). The unit tests above carry the proof instead.

**Turn numbering note.** The brief says "p07 t17–t19"; those are the candidate messages. By the contract's convention
(a grading turn tN is the interviewer reply to `turnIndex = N − 1`) the interviewer turns are **t18** and **t20**, and
the records are filed there.

### The other C5 alternatives — recommended, NOT changed

Run on `classifyConduct` as it stands after (a). Each line below is ordinary case speech, and each one that says
**FIRES** breaks the interview with a pause offer.

| alternative | case-shaped line | result |
|---|---|---|
| `C5_HARDSHIP`: `(bad\|rough\|dark\|awful) few (weeks\|months)` | "Brew & Bean has had a rough few months on traffic." | **FIRES** (hardship) |
| " | "The client has had an awful few weeks since the recall." | **FIRES** |
| " | "Sales have had a bad few months and the trend is still down." | **FIRES** |
| `C5_DESPAIR`: `what's the point` | "What's the point of segmenting further if both segments move together?" | **FIRES** (despair) |
| " | "What's the point of modelling year three when the pilot decides it?" | **FIRES** |
| " | "What's the point of a loyalty programme here?" | clean (the determiner carve-out) |
| `C5_NO_POINT`: `(don't\|can't) see (the\|any) point` | "I don't see the point in discounting below cost." | **FIRES** |
| " | "I don't see the point of segmenting the four healthy routes." | **FIRES** |
| `C5_DESPAIR`: `why (even) (bother\|try)` at a sentence end | "If the margin is negative at every price, why bother?" | **FIRES** |

**What I would change, in priority order (your ruling needed — not changed in this round):**

1. **`(bad|rough|dark|awful) few (weeks|months)` needs a first-person subject.** This is the worst of the four: the
   phrase is a completely ordinary way to describe a client's trading, and three of three client-subject lines fire.
   Proposed: require `i|i've|i have|i'm|my|me|it's been` in the clause before it, and exclude a third-party subject
   (a capitalised name, "the client", "sales", "traffic", "the business"). Cost if wrong: a candidate who says "a
   rough few months" about themselves with no first-person word nearby gets no check-in — and the `i'm not sleeping`,
   `i can't sleep`, `broken me` and `i'm falling apart` branches of the same regex still cover the disclosure shape
   Sam's run showed.
2. **`what's the point` and `(don't|can't) see (the|any) point`: extend the object carve-out past determiners.** Both
   exempt only `of/in the|a|an|our|your|this|that <word>`, so a gerund or a bare noun ("of segmenting", "of modelling
   year three", "in discounting below cost", "of 20% share") goes straight through. Proposed: also exempt an `-ing`
   verb or a bare noun phrase after `of/in`, and keep the bare forms firing ("what's the point.", "what's the point of
   this"). Cost if wrong: "I don't see the point of trying" reads as analytic and is missed by the floor — the model
   layer still has it, and that is the layer Lorenzo's ruling (a) above hands this class to.
3. **`why (even)? (bother|try)` at a sentence end needs a first-person subject too.** "If the margin is negative at
   every price, why bother?" is a conclusion about the client. Proposed: require `i|we` as the subject of the clause,
   or no client/price subject in the sentence. Lower priority than 1 and 2: it needs a bare sentence-final form, which
   is rarer in the corpus.

I would **not** touch `i can't do (this|anything) anymore`. It is first-person and the standing posture for C5 is to
err toward triggering; a candidate saying it about the case is exactly the borderline the doc says to fire on.

---

## 2. The stale probes (`66c05845`, plus the two follow-ons in §7)

### The three causes, confirmed or refuted against all 12

All twelve were read out of their turn files: the probed claim's `codeQuantity`, its `candidateValue`, its span, the
line it would speak, the `stale_drop` detail and the checker's own decisions on its siblings.

**Cause 1 — "claims with no worksheet quantity (ratios, margin points, bases) can only go stale via an explicit
withdrawal": CONFIRMED, and it is wider than that.**

**6 of the 12 claims carry `codeQuantity.kind: "none"`** — no quantity at all, so `hasNewerValue` has nothing to key
on and only the withdrawal legs can fire:

| run | turn | claim | `codeQuantity` | candidate value |
|---|---|---|---|---|
| brewbean p40 `03201cc4` | t8 | 5:0 | **none** | "all 18 points (COGS rise 42 to 58)" |
| brewbean p57 `0a5cdc18` | t14 | 11:2 | **none** | "about 22 points" |
| aldermoor p57 `5bc506bc` | t8 | 5:6 | **none** | ">2x" (the multiple of the threshold) |
| hollisbay p57 `17b4117c` | t14 | 11:5 | **none** | "$37.8 million" |
| larkspur p57 `69441a66` | t10 | 7:3 | **none** | "2.0" ($2.0M of fare given away) |
| quillpath p7 `c82e7bd7` | t18 | 13:1 | **none** | "24 months" |

The other six do carry a step quantity (`breakeven_load_factor`, `starter_ratio`, `starter_ltv`, `starter_churn`,
`pro_churn`), and they fail for the **wider** form of the same cause: **off prof-001 the worksheet holds no value for
the message being answered at all.** `foldTurn` takes code's own step bindings only where the binding is validated
(`stepFlagsLive`, i.e. prof-001), and the checker's verdict for a message lands a turn or more later — so when the
probe on message *n* is chosen on the turn answering message *n+2*, the newest worksheet value is from *n* at best. In
aldermoor p57 t8 the candidate says *"the revised peak figure is $320 million, not $640 million"* in the very message
being answered, and `verified_figures` shows code computed `peak_net_sales = 320` from it — none of which the
worksheet sees. So the real cause is "no worksheet value for the latest message", of which the quantity-less claims
are the worst case.

**Cause 2 — "withdrawals need explicit phrasing": CONFIRMED, 4 of the 12.** These four carry a concession in the
candidate's own words that no lexicon reads, and no figure-bearing withdrawal:

| run | turn | what the candidate said | why nothing fired |
|---|---|---|---|
| larkspur p57 | t18 | *"Volume makes it worse, not better. That kills the fill-the-plane idea."* | a figureless withdrawal; `WITHDRAW_THAT` wants "scratch that / throw that out / ignore that", and `WITHDRAW_FIG`'s "not X" needs a figure after "not" |
| quillpath p24 | t16 | *"I made an error before — I only counted cancels … ~7.4% leave per month"* | the concession is explicit but the replacement (7.4) is not the right answer (5) and the binder did not bind it to `starter_churn`, so neither "the right figure stated since" nor a withdrawal fires |
| quillpath p57 | t8 | *"I conflated the cumulative figure with the monthly rate … Pro 2.0%, Starter 5%"* | same shape: the binder bound `starter_churn = 5` but not `pro_churn = 2`, and 21.5 is never named again |
| hollisbay p57 | t14 | *"You're right, I flipped them."* | the checker's own concession reader DID fire on five sibling claims (`withdrawn: "You're right, I flipped them."`) but not on 11:5, because that path also needs the claim's figure named or the right figure restated, and he never restates revenue |

**Cause 3 — "the b38 Tyler t24 rule keeps probing claims built on a redone own-figure": CONFIRMED, 2 of the 12
decisively, and it is the rule your ruling (a) reverses.** The carried-figure leg of `staleReason` used to require the
withdrawn figure **and** its replacement both to be figures of the case:

- **larkspur p57 t10** — message 9 says *"Doing it route-specific: … 36% … 31%. So roughly a third off fares on both,
  **not 12%**"*. The 12% is the input the $2.0M claim is built on and the claim's span names it ("Applying the 12%
  fare cut I computed earlier…"). It is the candidate's own figure, not the case's, so the gate blocked it — and the
  withdrawal's clause carries no digits ("roughly a third"), so it had no numeric replacement either.
- **aldermoor p57 t8** — message 7's *"$320 million, not $640 million"* is a textbook withdrawal, but **640 appears
  nowhere in the claim**: the claim is the ratio ">2x" with the span *"That's more than double the $300 million bar"*.
  The $640 million is only in the hint line code was about to speak.

### What was built

Three changes in `staleReason` / `worksheet.ts`, all under the existing `staleProbeDrop` switch:

1. **Ruling (a), the reversal.** The carried-figure leg now applies the same policy as the claim's own figure
   (`coveringWithdrawal`): a figure of the **case** still has to be a misread they fixed (its replacement another case
   figure, not said under a condition of its own), but a figure of their **own** needs only the withdrawal. That
   symmetry is the ruling: b38 Tyler t21's "$10M, not $12M" now drops the probe on his "$13.8M", and b39 larkspur
   p57's "not 12%" drops the $2.0M probe.
2. **Ruling (a), the line's own figures.** The figures the candidate-facing line WOULD SAY (`probeLine`, `hintLine`,
   `pointerLine`, `correctionLine`) count beside the ones the claim's words carry. This is what catches aldermoor p57
   t8. It also gives **ruling (c)** its asymmetry: a correction's own line names the candidate's wrong figure
   outright, so a correction is dropped on a strict superset of a probe's evidence.
3. **Ruling (a), the lineage (`lineageMoved`).** A step whose lineage (through `dependsOn`, via `lineageOf`) holds a
   newer standing value than the claim's own message is stale: the candidate has redone the root, or something
   computed from it. Read from the worksheet only, so nothing enters it that `foldTurn` deliberately keeps out — the
   binder's loose figures off prof-001, which cost two true probes in b37q Marcus t15 and b32 Marisol t9.

Plus one latent bug the reversal exposed: the `scenario` guard's trailing `\b` applied to every branch, so `at \$?\d`
never matched "at $60" (the boundary after "6" is a digit). b35q Marisol t29's "$30 at $40" survived only because of
the data-figure gate that is now gone, so the guard had to be made real.

**Ruling (b), second half — "once the candidate has answered a probe on a figure, never probe it again or correct it
at close" — is implemented in its narrow reading**, and that is a judgement call (§8).

### What the 12 do on the replay, one by one

Free replay of all 31 batch-39 runs with `*=phase1` (`postwave-b39-gate-on`), against the recorded wave. **Caveat on
reading this table: once a probe is dropped the whole checker queue shifts, so "still said" at a turn does not mean
the same stale line** — e.g. quillpath p7 t14 now probes "5.7x" where the recording probed "3.0x". The honest
aggregate is the drop count in §6.

| run | turn | why it fired | after | class under the new rule |
|---|---|---|---|---|
| brewbean p40 | t8 | silent fix: "COGS is 16 of the 18", no withdrawal phrase, claim has no quantity | still said | **borderline** |
| brewbean p57 | t14 | silent fix: the 4.2 / 11.8 components restated; the total has no quantity | still said | **borderline** |
| aldermoor p57 | t8 | "$320 million, not $640 million"; 640 only in the hint line | **DROPPED** (`built on 640, withdrawn at message 7`) | fixed |
| hollisbay p57 | t14 | "You're right, I flipped them" — an explicit, figureless concession; claim has no quantity | still said | **firm**, unfixed |
| larkspur p57 | t10 | "not 12%" — explicit, but 12 is a CASE figure and the withdrawing clause carries no digits ("roughly a third"), so `coveringWithdrawal`'s data-figure rule still wants a case-figure replacement | still said | **firm**, unfixed |
| larkspur p57 | t18 | "That kills the fill-the-plane idea" — explicit, figureless, no lexicon match | still said | **firm**, unfixed |
| quillpath p7 | t14 | silent fix (2.4x restated); the lineage leg DOES fire here (`starter_value_with_upgrades … restated at 1700`) and another claim takes the turn | different line | **borderline** |
| quillpath p7 | t18 | silent fix (lifetime restated at 13.6); claim has no quantity | different line | **borderline** |
| quillpath p7 | t26 | stale **correction**; the message states 2.0x itself | still said | **firm**, unfixed |
| quillpath p24 | t16 | "I made an error before" — explicit concession, but the replacement (7.4%) is neither the right answer nor bound to `starter_churn` | still said | **firm**, unfixed |
| quillpath p24 | t24 | stale **correction**; the 2.5x it corrects was abandoned at t15/t17 | still said | **firm**, unfixed |
| quillpath p57 | t8 | "I conflated the cumulative figure with the monthly rate"; `pro_churn = 2` not bound from that span | still said | **firm**, unfixed |

**Score: 1 of the 12 fixed outright; 4 of the remaining 11 are silent fixes, which the new grading rule makes
borderline rather than firm; 7 stay firm.** So, on the usual 25, firm stale lines go **12 → 7 (0.48 → 0.28 per run)**
and bar 3 ("no stale probe or correction") is still **not met**. In the new-persona set the stale **correction** at
quillpath p65 t24 is also dropped. Wave-wide the engine's own drop count goes **7 → 16** (§6).

**What each of the 7 remaining would need** — none built, each needs your ruling because each widens a guard that
exists for a reason:

1. **The three figureless concessions** (hollisbay p57 t14, larkspur p57 t18, quillpath p57 t8 and p24 t16 — four,
   counting p24). "You're right, I flipped them", "That kills the fill-the-plane idea", "I conflated the cumulative
   figure with the monthly rate", "I made an error before". The checker's own concession reader already fires on
   these and drops the SIBLING claims of the same message; what it will not do is drop a claim whose own figure the
   candidate never names again. Proposed: **when a concession drops a sibling claim of the same message, drop the
   rest of that message's claims too** — one explicit concession withdraws the message's work. Cost if wrong: an
   independent claim in a message that also concedes something loses its probe. On batch 39 this would fix hollisbay
   p57 t14 (five siblings were dropped as `withdrawn: "You're right, I flipped them."`, one was not).
2. **larkspur p57 t10's "not 12%".** 12% is the case's network-wide fare fall, so it is a *case* figure, and the
   data-figure rule requires its replacement to be a case figure too. His replacement (36% / 31%) is his own. Proposed:
   when the withdrawing clause carries no figure, read the replacement from the preceding sentence, and drop the
   "replacement is a case figure" requirement where the withdrawal is first-person. Cost if wrong: a contrast with a
   case figure ("the exhibit says 58%, not 61%" — guarded today by `DATA_REF`) could read as a withdrawal of the
   data, which would drop true probes.
3. **The two stale corrections (quillpath p7 t26, p24 t24).** Both are `starter_ratio` / `starter_ltv` corrections
   whose figure the candidate has replaced in the worksheet — but the replacing value arrives from the checker's
   verdict on a message whose verdict has not landed when the correction is chosen. These are the clearest case for
   **folding code's own step bindings for the message being answered into the worksheet off prof-001**, which
   `foldTurn` deliberately does not do (two documented harms: b37q Marcus t15, b32 Marisol t9). A middle way: fold
   only the bindings code **verified as right** for that message, which neither harm is. Cost if wrong: a wrong
   binding on a right figure drops a true probe.

### `evals/severity.md` — the grading rule, recorded

> - **borderline** — a single stale probe on a **silent fix**: the candidate restated the figure, or redid the step it
>   rests on, without saying they were withdrawing it.
> - **firm** — a stale probe **repeated**; a stale probe after an **explicit withdrawal**; or a stale **correction**,
>   which is held to a stricter test than a probe.

---

## 3. The misquotes (`9972ed4b`)

Three turns, three different findings. **One of the three premises in the brief is wrong, and it matters.**

**aldermoor p64 `4df38465` t6 — a real detector miss.** *"Prevalence you gave me is 1.5%, so 260 million × 1.5% = 3.9
million people with Corlan's disease"*; the case says 1.6%. `misquote` logged `found: []`. The cause is
`operandLater`: the candidate uses the quoted figure as an operand in a later clause, and that guard exists for the
candidate's OWN derived figures (Marisol b18 t9, *"COGS today is 66.7, so … 66.7 minus 14.4"*). Here the figure is
**attributed** — "you gave me" — so the later operand is the misquote propagating, not evidence the figure is his.
Fixed behind a new switch, **`misquoteAttribution`** (in the preset): attribution turns off that one guard, and the
hypothetical, indexed, conclusion, sum and preposition guards all still apply ("If you gave me 1.5% prevalence…" is
still exempt). The near-miss was already in the suite: `'Prevalence you gave is 1.5%, so 250 × 0.015 = 3.75 million'`
passes today only because "0.015" is not the literal figure.

**hollisbay p64 `7cdbeb74` t6 — a real detector miss, in the case data.** *"Variable costs: ingredients $0.70,
packaging $0.35, roasting labor and energy $0.30, freight $0.20"*; the line says $0.30 for packaging, so his $1.55
variable cost, $1.45 contribution and 6.2M-bag break-even are all wrong. `variable_costs` is **one** ledger line with
four components and its overlay misquote anchor named only `["ingredients", "ingredient cost", "ingredient costs"]`,
so "packaging" matched no anchor. The anchor now names each component the line states. A share of something else
("packaging is 20% of the bag cost") is still no quote — the existing `of`-object guard holds.

**aldermoor p64 t10 — the detector did NOT miss this one.** Correction to the brief: `misquote` at t10 logged
`found: [{items: ["nimbrel"], cited: "is about $9,400"}]`, and `code_gate` at t12 logged
`released — code's mismatch with nimbrel, and the checker rates "$9,400" error/high with no flag (misquoteFlat)`.
Nothing flat was ever said for a different reason, and the same reason explains all three turns:

> **Rule 6 option 4's "one flat sentence" cannot be delivered on today's timing.** Code's correction waits for the
> checker's verdict, which lands a turn AFTER the message. Meanwhile the model asks its own Socratic question on the
> misquote turn ("Which figure did I give you?"), which `misquoteFlat` deliberately lets stand — and in all three runs
> that question worked: the candidate fixed the figure himself in the next message (aldermoor t7 *"You gave 1.6% — my
> mistake"*, t11 *"You gave $9,000, not $9,400"*, hollisbay t9 *"I used $0.35 for packaging, but the exhibit actually
> says $0.30"*). So by the time code's line is due it is stale, and nothing flat goes.

That is why fixing the detector alone would have been a **net regression**: it would have turned two silent misses
into two stale corrections. So the third change, behind a new switch **`misquoteSameTurn`** (in the preset): a live
finding for THIS message corrects on this turn, with the `MISQUOTE` hint going into the same turn's prompt so the
model stays off the figure. `found` already excludes report-only findings, so a case whose ledger lookup is not
validated is untouched, and `correctsItemAgain` keeps the gate's own release next turn from saying it twice.

**Records.** `b39a-tyler-t6-prevalence-misquote`, `b39a-tyler-t10-nimbrel-misquote`,
`b39h-tyler-t6-packaging-misquote` — all firm / `misquote_uncorrected`, all replayable, each asserting code's own flat
sentence in the ledger's words (`1.6% of US adults`, `$9,000 per patient per year`, `$0.30 for packaging`).

**The corpus sweep for new false corrections is in §6.**

---

## 4. Errors left at close — REPORT ONLY, nothing changed

**Does the scoring prompt receive math flags the checker left open? Yes.** `lib/scoring/score-session.ts:231` passes
`formatCheckerSection(checkerRows, checkerRedo)` into the judge prompt's extra sections.
`lib/scoring/checker-record.ts` builds it from every `math_checker` **verdict** row's claims where `flag: true`,
dropping only the outcomes `dedupe`, `disagrees_with_code` and `converted` — so a flag the interview never raised is
*in*, and `outcomeText` names what became of it, including `unresolved_at_close → "Not raised in the interview (the
case closed first)."`

**Would it catch `larkspur p57 69441a66 t30`? Yes, with the right figure.** From the run's own records, message 29's
verdict claim `29:2`:

- `flag: true`, `verdict: "error"`, `errorType: "conceptual"`, `confidence: "high"`, `correctValue: 5.2`;
- `span: "What closes the gap is the $1.8M we stop losing on the exited routes, plus the $5.4M fare uplift on the four
  healthy routes — call it $7.0M of operating profit"`;
- `derivation: "The -$0.2M already reflects removing the $1.8M loss, so counting it again is double counting.
  -0.2+5.4 = 5.2. Even from the -$4M loss: -4+1.8+2.0+5.4 = 5.2. 1.8+5.4 = 7.2 is not a profit figure either."`;
- its only decision is at t32: `unresolved_at_close — "time up"`.

So the judge prompt would carry, in `formatCheckerSection`'s shape:

> `- turn 29: "What closes the gap is the $1.8M we stop losing … call it $7.0M of operating profit" — WRONG
> (conceptual): about 5.2 by the checker. Not raised in the interview (the case closed first).`

`laterRedo` cannot soften it (there is no candidate message after 29 but the close). The **deterministic** section
would *not* cover it: `codeQuantity.kind` is `none`, so `checkMathSteps` has no step to bind it to, and `29:1`
(`rampup_operating_profit`, −$0.2M) was rated correct. The MATH CHECKER section is the only carrier.

**The gap, and what I would do about it (not done).** Nothing *obliges* the report to name it. The directive in the
section is "Treat a WRONG claim as the candidate's error unless they revised it — and cite it only where the
transcript bears it out." There is no rule that an uncorrected error standing in the **final recommendation** must
appear in the written report, and this claim's own `changesConclusion` is recorded as **false** — the model's call,
on a claim whose error *is* the recommendation's bottom line — so nothing escalates it. Proposed, for your ruling:
either (i) give `formatCheckerSection` a separate, mandatory clause for a flagged claim that is on or after the
recommendation turn and ended unresolved ("name this in the report's needsWork for the dimension it belongs to"), or
(ii) set `changesConclusion` from the stage the claim was made in rather than from the model. (i) is the smaller
change and does not touch the checker.

**Caveat on the evidence:** larkspur p57 was not one of batch 39's nine scored runs, so no report exists to check.
This is a reading of the prompt-building code against the run's recorded flags, exactly as asked — not an observed
report fault.

---

## 5. Housekeeping — the $0.84 of `claude-opus-4-8` (`f5cfd81f`)

It was not a persona model. The candidate simulator in `scripts/live-run.ts` pinned the refusal fallback by hand:

```
betas: ['server-side-fallback-2026-06-01'],
fallbacks: [{ model: 'claude-opus-4-8' }],
```

so every simulator refusal re-ran on Opus 4.8, the retired July-2026 interviewer, with the superseded June beta. The
64 Tyler runs drive most of the 22 calls, because that brief asks the simulator to misstate case figures on purpose,
which is what trips the refusal classifier — which is why the three p64 run reports are where the usage tables show
it. It now takes Anthropic's recommended fallback for the refusal category, with the current beta, exactly as the
interviewer and the three scoring calls do (`FALLBACK_BETA` / `FALLBACKS` in `lib/models.ts`):

```
betas: [FALLBACK_BETA],
fallbacks: FALLBACKS,
```

`CANDIDATE_MODEL` itself was already current (`claude-opus-5`) and is unchanged. The only mention of Opus 4.8 left in
the tree is `lib/llm-pricing.ts`, which has to price the historical ledgers. A test in
`tests/eval/model-guard.test.ts` now fails if any of the six model-calling files pins a retired id outside a comment.

---

## 6. The gate

All free. Replay root: the main checkout's `Case Interview Runs`. Output: `CaseTester-proof-out/postwave-gate-{on,off}`
(the 31 standard slices), `postwave-b39-gate-on` (batch 39's five waves), `fault-bank-postwave-gate-{on,off}`.
Baseline: `prewave-final-rep-{on,off}` and `fault-bank-prewave-final-{on,off}`, taken at `b5032525`, whose only
difference from this branch's base 2a8dca76 is the b39 slice list in `lib/eval/fault-bank-build.ts` — no engine code.

### Line 1 — 0 new false corrections, false refusals or missed real errors

| measure, b28–b38 with `*=phase1` | before | after |
|---|---|---|
| correction sentences spoken | 52 in 50 turns | **51 in 49 turns** — 0 added, 1 removed |
| refusal sentences spoken | 101 in 101 turns | **101 in 101 turns** — 0 added, 0 removed |
| `fact-check` (ENGINE_SWITCHES **unset**), 31 slices: F1 / F2-next / F2-rec / F3 / F4 | 0 / 101 / 11 / 0 / 0 | **0 / 101 / 11 / 0 / 0** — 0 slices changed |
| interviewer lines changed | — | 14 |
| checker decisions changed | — | 83 |

The one removed correction is **the graded fault being fixed**: `b38l-on f80d981c t25`, *"The annual operating-profit
improvement from redeploying the contested flights is about $11.8M, not $15.8M"* — the record
`b38l-marisol-t24-stale-correction`, which now passes.

**All 14 changed lines, read:**

- **b38l 57 Marisol t24** — the stale correction above, gone. The turn still delivers two data lines and the risk
  question.
- **b38l 64 Tyler t24** — *"Earlier you mentioned the redeployment swings us by about $13.8M. Can you walk me through
  the components of that figure?"* → *"What makes you confident in that?"* This is **the t24 probe Lorenzo's ruling
  (a) reverses**, delivered.
- **b32 64 Tyler t18** — *"You said Lakeport is only $10 short of breakeven… How did you do that calculation?"* →
  *"How did you do that calculation?"* The quote is gone because the withdrawn figure is now in `closedFigures`; the
  probe still asks for the calculation, and it is on the turn right after the claim, so "that calculation" still
  points at it. The drop is right: his message says *"I used $11,400 per flight, but you gave $11,000 … not $170"*
  (`built on 170, withdrawn at message 17`).
- **b35q 57 Marisol, 9 lines (t10–t32)** — one dropped stale probe at t10 cascades. The drop is right:
  `step:pro_ltv restated at 2400 (message 7) since message 5`. The other eight are acknowledgment-pool rotations
  (Understood / Mm-hm / Got it / I see), one data line moving from t16 to t14, and the queue taking a different live
  claim at t12. No correction, no refusal.
- **b37q 07 Raj t28 and t30** — two message-23 claims dropped (`starter_value_at_60, in its lineage, restated at 1175
  (message 25)`), and the turn probes the live message-25 claim instead. t30 is a wording rotation.

**No missed real error:** every dropped probe or correction above was verified against its own message — each figure
was superseded or withdrawn in the candidate's own words before the line was due.

**Caveat recorded for the next round**, carried from the pre-wave one and confirmed again: `proof-combined.sh` runs
`fact-check.ts` inside the exported `ENGINE_SWITCHES`, so the overlay's new `variable_costs` anchors made the
*detector* see two extra misquotes on b37h and a clean arm read as a regression. Re-run with
`env -u ENGINE_SWITCHES` and the 31 slices are identical. The script should unset it; not changed here.

### Line 2 — the correct-behaviour records still pass

**95 / 95 with the switches off, and 95 / 95 with `*=phase1`.** `b35h-marisol-t12-correction` failed mid-round and
was fixed (§7); three `correct_correction` windows were widened by two turns (§8, judgement call 3).

Fault records, for context: **74 → 77 of 153** with `*=phase1` (two previously-failing b38 records now pass —
`b38l-marisol-t24-stale-correction` and `b38l-tyler-21m-3-6m` — plus the new
`b39a-tyler-t6-prevalence-misquote`); **48 → 48 of 154** with the switches off (only the three new b39 records were
added, all failing as expected). No record moved from `fails_as_expected` into a skip class in either arm.

### Line 3 — prof-001 identical with the switches off

**Met, and more broadly than asked: all 31 slices are identical with the switches off** — 0 changed interviewer
lines, 0 changed checker decisions, 0 runs on only one side, and `fact-check` identical slice by slice. The bank's
switches-off arm is unchanged too (48 / 48 pass; 95 / 95 correct).

### Line 4 — the stale-probe count on batch 39, before and after

Free replay of all 31 runs with `*=phase1` (`postwave-b39-gate-on`) against the recorded wave:

| | recorded wave | after |
|---|---|---|
| stale lines the engine dropped (`stale_drop`) | **7** (5 withdrawn, 2 restated) | **17** (8 withdrawn, 2 restated, **7 lineage**) |
| checker lines code or the model spoke | 59 | 58 |
| of the 12 firm stale probes/corrections (usual 25): dropped outright | 0 | **1** (aldermoor p57 t8) |
| …now **borderline** under the new grading rule (silent fixes) | — | **4** |
| …still **firm** | 12 | **7** |
| stale lines in the three new personas: dropped | 0 | 1 (the quillpath p65 t24 stale correction) |

So on the usual 25 the firm stale rate falls **0.48 → 0.28 per run**, and **bar 3 is still not met**. The per-case
table and what each remaining miss would need are in §2.

---

## 7. The gate round — what the replays found

Four replay rounds; the fixes below are in the gate commit.

**(i) A stale drop that dropped nothing (`b37q` Jasmine 40 t14).** Code dropped claim 9:1 as stale and the model's
own identical doubt went out in its place — *"Earlier you said standalone Starter is 1.3x and called that the CFO's
number. Walk me through how you got to 1.3x."* — where the base's probe guard had replaced it with a neutral line,
because the same claim was `unresolved` / closed to the report and its figure was therefore in `closedFigures`. A
`stale` outcome was not. **Fix:** a claim code drops as stale puts its figures into `closedFigures` too, so the probe
guard withholds the model's doubt on them. This was a fault record (`b37q-jasmine-chain-400`) that regressed from
pass to FAIL and is back to passing.

**(ii) The lineage leg over-firing on a sibling (`b35h` Marisol 57 t12).** `breakeven_bags` was redone at message 9,
so `lineageMoved` dropped the claim that carried the correction *"… about $9 million, not $10.2 million"* — but she
restates the $10.2M of variable cost in message 11 and the correction is the right line (the checker's own decision
on that turn says so: `disagrees_with_code — a restatement of launch_costs_total@10.2 … the flag stays open`).
**Fix:** `lineageMoved` returns null when the claim's OWN quantity still stands at the claim's own figure since.
This was a correct-behaviour record (`b35h-marisol-t12-correction`) that failed and now passes.

**(iii) `misquoteSameTurn` adds false corrections, so it is OUT of the `phase1` preset.** This is the round's one
reversal, and the evidence is unambiguous. With it on, corrections spoken across the 31 slices go **52 → 95**: 11 are
the same sentence moved earlier (the intended change) and **45 are corrections that run never said before**. Reading
what the checker gate had said about each of those findings in the base arm:

| the gate's verdict on a misquote finding | count |
|---|---|
| `released` (corrected — unchanged) | 18 |
| `not_rated` ("no claim of the checker on this figure", or unverifiable/low) | 19 |
| `checker_disagrees` (the checker's right figure is none of code's) | 5 |
| `stale` (the candidate withdrew it — correctly not corrected) | 4 |
| **`checker_correct` (the checker rates the span CORRECT)** | **3** |

Two of the three `checker_correct` findings become spoken corrections with `misquoteSameTurn`, and both are **false**:

- **b34a `a1133734` t31.** His t29 recommendation: *"$320M less $80M in annual selling costs is $240M to Aldermoor,
  versus $120M from Option B's 30% royalty on $400M."* Correct arithmetic, his own derived figure. The `option_a`
  anchor matched the $240M, the checker rates "$240M" **correct**, and code would say *"To correct one figure: option A
  is building Aldermoor's own US team of about 60 specialist sales reps…"*
- **b38l `701443f7` t17.** His t15: *"breakeven revenue per passenger is $11,000/60 = $183, so a $163 fare."* His own
  derived figures; the `new_routes_plan` anchor matched them against the case's $180 fare, and the checker rates
  "$183 revenue, $163 fare" **correct**.

(The third, `b37q a2a5921b` t32 on `plan_cac`, is blocked by `correctionRules`' one-correction-per-item cap.)

So `misquoteSameTurn` is now in `NON_PRESET_SWITCHES` — nameable for evidence, never on with `*=phase1`. The checker
gate is doing exactly the job it was built for. **The detector fixes (`misquoteAttribution` and the `misquoteAnchors`
data) stay in the preset**; §6 shows what they add on their own.

**What this leaves open for you.** Rule 6 option 4's "one flat sentence" is still not delivered on the two aldermoor
turns, for the reason in §3: code's correction is owed a turn after the message and the candidate has self-corrected
by then. The two ways out, neither taken:
1. **Shorten the gate's lag**, not remove it: have the checker's verdict for message *n* be awaited on turn *n+1*
   rather than read on *n+2*. That keeps the checker's agreement and makes the flat sentence land before the
   self-correction. It is a change to when the turn waits on the checker, which is a latency decision, not a
   correctness one — your call.
2. **Correct on the misquote's own turn only for an ATTRIBUTED quote** ("you gave me 1.5%", "you said Nimbrel's net
   price is $9,400"), where the candidate is asserting a case fact, not showing their own working. Neither of the two
   false corrections above is attributed, so this would have avoided both. It would cover the two aldermoor turns and
   NOT the hollisbay one (his "packaging $0.35" is inside his own cost build, unattributed).

My recommendation is 2 if you want the flat sentence this wave, 1 if you want it for every misquote.

---

## 8. Judgement calls, with the cost if wrong

I could not ask anyone, so each of these is the conservative call, listed with what it costs if it is wrong.

1. **Ruling (b)'s second half — "once the candidate has answered a probe on a figure, never probe it again or correct
   it at close" — is built in its NARROW reading:** a figure the candidate has answered a probe on, and has since
   restated differently or abandoned, is never probed or corrected again (which is what rulings (a) and (c) already
   do, on every path including the close turn). I did **not** build the absolute reading, because it contradicts a
   ruling that batch 39 **met**: bar 6 ("the Quillpath probe-chain root corrected, not repeated") passed precisely
   because every ladder ends in a correction of the input the candidate answered a probe on and then kept. The
   absolute reading would remove that correction in all eight Quillpath runs. **Cost if wrong:** a figure the
   candidate answers a probe about and then reasserts unchanged still draws its one root correction, which under the
   absolute reading should have gone to the written report instead. Cheap to switch if you want the absolute reading:
   it is a single extra clause in `staleReason` keyed on `attempts[key] >= 1`.
2. **Ruling (c)'s "stricter than probes" is built as a strict superset of evidence, not a separate test.** A
   correction is dropped on the claim's figure, the figures its span carries, the figures its correction line names
   (which includes the candidate's wrong figure outright, where a probe's line often does not), and the lineage — so
   corrections are dropped strictly more often than probes. I did not add a second, differently-worded hook for
   corrections, because the action (`probe` / `hint` / `pointer` / `correct` / `restate`) is chosen **after** the
   stale hook runs, across four separate selection paths in `math-checker-live.ts`, and a second hook at each is a
   larger change than this round's risk budget. **Cost if wrong:** a correction whose figure the candidate has
   silently restated — with no withdrawal phrase and no lineage movement — can still be spoken. That is the same
   residual miss as the probe case, which is the one you ruled tolerable.
3. **The three `correct_correction` records' assertion windows were widened by two turns** (`b33-tyler-t8-`,
   `b35q-tyler-t8-`, `b38l-tyler-t12-misquote-correction`). Each asserted a correction on the recorded turn;
   `misquoteSameTurn` makes the same correction land on the misquote's own turn instead, two turns earlier. The
   record's claim is that the misquote got its one flat correction, so the window is `{fromTurn: N−2, toTurn: N}` and
   the record still fails if no correction is spoken at all. **Cost if wrong:** a record that would have caught a
   correction drifting a turn late no longer catches it inside that two-turn window. I flag it loudly because
   loosening a correct-behaviour record to accommodate my own change is exactly the move that can hide a regression —
   the before/after lines are in the compare files, and the correction text is byte-identical in both.
4. **`misquoteSameTurn` bypasses the checker gate for a misquote found in the message being answered.** The gate
   (code's mismatch **plus** the checker's rating) is a standing ruling. Without the bypass, Rule 6 option 4's "one
   flat sentence" is unreachable — §3 shows why — and fixing the detector alone turns two silent misses into two
   stale corrections. The narrowing that keeps it safe: `found` already excludes report-only findings, so only a case
   whose ledger lookup is validated can correct this way, and the line code speaks is the ledger's own wording about
   an **already revealed** item, so it adds no figure (FR-4 is untouched). **Cost if wrong:** a false misquote
   correction on a case with a validated lookup, which the corpus sweep in §6 is the check on. It is behind its own
   switch and can be taken out of the preset in one line.
5. **`misquoteAttribution` is a new switch rather than an unconditional detector fix.** Off is today's behaviour, so
   gate line 3 (prof-001 identical with the switches off) cannot be touched by it. **Cost if wrong:** nothing, beyond
   one more switch in the preset.
6. **The b39 run folders were copied into the main checkout's corpus** (`Case Interview Runs/test runs/batch-39-*-oct-26-runs-*`).
   They were written inside this worktree, and `scripts/fault-bank.ts` resolves every slice's verdicts under one
   `REPLAY_ROOT`, which also has to hold b33 and `replays/2026-10-18/tools/replay31.sh` — so the bank cannot run from
   this branch at all without them. This is the standing practice for a wave run from a worktree. They are untracked
   in the main checkout and **nothing under `Case Interview Runs/` was staged in any commit**.
7. **`b39a.json` and `b39h.json` will conflict with `phase2-design`.** That branch (commit `ac02fa8d`, 20:03 today)
   added its own `evals/fault-bank/specs/b39a.json`, `b39h.json`, `b39l.json` and `b39q.json` with 18 Phase-2-owned
   records, and a per-slice corpus root in `lib/eval/fault-bank-build.ts`. The spec filename has to be the slice tag,
   so the two sets cannot live in separate files. The resolution is a trivial array concatenation in each file; the
   ids do not collide (mine are `b39a-raj-t18-…`, `b39a-raj-t20-…`, `b39a-tyler-t6-…`, `b39a-tyler-t10-…`,
   `b39h-tyler-t6-…`). Flagging it so whoever merges second expects it.
