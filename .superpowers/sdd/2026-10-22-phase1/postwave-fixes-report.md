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
into two stale corrections. So the third change, behind a new switch **`misquoteSameTurn`**: a live finding for THIS
message corrects on this turn, with the `MISQUOTE` hint going into the same turn's prompt so the model stays off the
figure. `found` already excludes report-only findings, so a case whose ledger lookup is not validated is untouched,
and `correctsItemAgain` keeps the gate's own release next turn from saying it twice. **It was built, measured, and
then kept OUT of the `phase1` preset** — the sweep found false corrections behind it, and §7 has the evidence. With
only the two detector fixes on, the aldermoor t6 prevalence misquote does get its flat correction (at t8, on the
gate's normal timing); the aldermoor t10 and hollisbay t6 ones still do not.

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

---

# Lorenzo's rulings of 26 Oct (evening) — report

Worktree `.claude/worktrees/phase1`, branch `phase1`, base **ab5b668a** (the state §1–§8 above ends at). Free work
only: no paid call, no re-score, no auditor, no wave, no push, no merge, no DB write, no deploy. Nothing under
`Case Interview Runs/` was staged, and no `.env*` value was read.

| commit | item |
|---|---|
| `57c8fe68` | 1 — C5: all four floor misfires narrowed |
| `d8f6359e` | 3 — `misquoteSameTurn`, attributed quotes only, and into the `phase1` preset |
| `8d1ebba3` | 4 (build) — an open flag on a recommendation figure changes the conclusion, set by code |
| (this section) | 2 — the three stale widenings, measured and reverted; item 4's draft; the re-score proposal |

**Replay labels**, all under `CaseTester-proof-out/`: baseline `r2-base-{on,off}` and `r2-b39-base-on` (taken at
ab5b668a, detached, before any change of this round — `r2-base-on` is byte-identical to the previous round's
`postwave-gate-on`, which is the check that the baseline is the right one); the round's own arms `r2-{on,on-off}`
and `r2-b39-on`; the measurement arms `r2-mq-on` (item 3), `r2-w1`, `r2-w2b`, `r2-w3` and their `r2-b39-*` twins;
fault-bank runs `fault-bank-r2-{ctl-p1,ctl-off,w1,w2,w2b,w3}`. Tools: `phase1-combined-tools/proof-combined.sh`,
`classify2.py`, `compare.py`, plus four small scripts written in the session scratchpad (`count.py` for correction
and refusal sentences, `stale.py` for checker lines and stale drops, `newstale.py` for claims newly stale,
`proof-b39.sh` for the five batch-39 slices).

---

## 9. The gate

| line | result |
|---|---|
| 0 new **false** corrections across b28–b38 with `*=phase1` | **met.** Corrections 39 → 48 sentences. Every one of the 12 slice-level additions read (§11): 6 distinct turns, 3 of them the same sentence two turns earlier, 3 newly spoken, all 6 true misquotes the candidate attributed to the interviewer or the exhibit. 0 false. |
| 0 new false refusals | **met.** 107 → 107 refusal sentences on the `*=phase1` arm, 0 added, 0 removed; 111 → 111 with the switches off. |
| 0 missed real errors | **met for what shipped.** No checker line changed on b28–b38 (150 → 150) or on batch 39 (58 → 58); 0 checker decisions changed on any of the 31 slices. The only interviewer lines that changed are the 19 in §11, all of them the misquote correction and its acknowledgment rotation. |
| the correct-behaviour records still pass, both arms | **met. 95 / 95 with `*=phase1` and 95 / 95 with the switches off.** Fault records, for context: 78 / 154 counted on, 48 / 155 off. |
| prof-001 identical with the switches off | **met, and all 31 slices are:** 0 changed interviewer lines, 0 changed checker decisions, 0 runs on one side only, and `fact-check` identical slice by slice. |
| `scripts/fact-check.ts` with `env -u ENGINE_SWITCHES`, 31 slices | **F1 0 · F2-next 101 → 97 · F2-rec 11 → 11 · F3 0 → 0 · F4 0 → 0.** Four slices changed, all downward: b35q-off/on 3 → 2, b38l-off 7 → 6, b38l-on 8 → 7 — the candidate misquotes that now get corrected on their own turn instead of standing into the next one. Nothing gained a flag. The switches-off arm is identical (F2-next 104 both sides). |
| the batch-39 stale-probe count | **unchanged: 16 checker stale drops + 1 misquote stale drop, 58 checker lines, 15 `stale_drop` acts — identical to the baseline.** Nothing this round touches the stale path; the three widenings that would were measured and reverted (§10). Firm stale lines on the usual 25 therefore stay at **7 (0.28 per run)** and bar 3 is still not met. |

`npx vitest run` 5819 passed / 9 skipped, `npx tsc --noEmit` clean, `npx eslint lib app components tests scripts db`
clean, at each of the three commits.

---

## 10. Item 2 — the three stale widenings: numbers only, nothing built

Each was prototyped in the worktree, measured on the free replay (31 slices of b28–b38 with `*=phase1`, the five
batch-39 slices, and the full fault bank in both arms), and then **reverted — none of the three is committed.**
`git status` is clean of them and the tree at `8d1ebba3` has no trace of them.

**How "real errors newly missed" was counted.** For every checker line the arm stopped speaking, the claim's
recorded span and the candidate messages after it were read by hand. A removal counts as a miss when the candidate
had *not* moved off that claim's own figure by the turn the line was due — a concession about another figure, a
later message, or a redo of a different quantity does not count as having moved off it. Where the queue merely
reordered (the same line at another turn, or a reworded probe on the same claim) it is not counted either way.

| widening | guard it loosens, and why that guard exists | stale lines removed (probe / correction) | real errors newly missed | fault-bank records lost | verdict |
|---|---|---|---|---|---|
| **W1 — a concession drops the rest of its message's claims** | `isStale`'s concession scope: "a concession withdraws only the claim it answers" (Lorenzo, 14 Oct; batch 24, Owen `e64de272` and Marisol `4bf008fd`). It exists so one "Let me redo it." cannot wipe every open claim of a message the candidate only partly redid. | b28–b38: **18 removed (14 probe-class, 2 corrections, 2 restates), 8 added** by the queue cascade; net 150 → 140 lines. b39: 2 probes removed, 0 added (one of them is the target, hollisbay p57 `17b4117c` t14 "You're right, I flipped them"). | **5** — b29 `64224460` 7:0, b30 `910aefe2` 9:1, b34l `e6432db0` 15:1, b36l `5907649a` 5:5, b37h `7f6c40ea` 9:3. In each, the message's concession is about a different figure and the probed one is conceded only one or two messages later (b34l's $260 fare at message 21, b36l's 30.8% at message 9, b37h's $16M at message 15). | **2 correct-behaviour records lost** — `b37h-marisol-t14-true-refusal` and `b37h-marisol-t16-correction`, both pass → FAIL (correct arm 95 → 93). Plus 1 fault record fixed (`b36l-marisol-t10-stale-probe`) and 1 pushed into `diverged` (`b37h-marisol-t14-superseded`). | **reject.** It fails the standing bar before anything else: two correct-behaviour records stop passing. |
| **W2 — "not 12%": replacement from the preceding sentence, and no case-figure requirement on a first-person withdrawal** | `coveringWithdrawal`'s data-figure rule: a figure of the **case** counts as withdrawn only as a misread they fixed — its replacement another case figure, not said under a condition of its own. It exists so a contrast with the data ("the exhibit says 58%, not 61%", guarded by `DATA_REF`) is not read as a withdrawal of the data. | b28–b38: **1 probe removed, 0 added.** b39: **1 line removed (the target: larkspur p57 `69441a66` t10's hint on claim 7:3, "about $2.0M of fare given away on Lakeport"), 1 probe added** — the turn then takes claim 7:4, "about $3.9M given away on Port Avery", which rests on the *same* withdrawn 12% and is stale for the same reason, only the carried-figure leg cannot see it (12 is not in 7:4's span). Net firm stale lines on b39: **0**. | **1** — b29 `64224460` 7:0, dropped as `built on 58, withdrawn at message 9 ("I used 58 before")`. He withdraws 58 as a *base* for the bean split; the probed claim is the 38% → 15/23 points split, which he still asserts at message 13. | **0** — 78 / 154 fault and 95 / 95 correct, identical to the control. | **reject.** It drops a stale **probe**, so Lorenzo's rule asks for 0 newly missed real errors, and there is 1. And its own target turn gains an equally stale probe in the dropped line's place, so the replay shows no net gain. |
| **W3 — fold code's own VERIFIED step bindings off prof-001** | `foldTurn`'s `stepFlagsLive` gate (Lorenzo, 13 Oct): off prof-001 the binder's figures are too loose to say what the candidate holds. The two documented harms are b37q Marcus t15's "$900 / $30 = 30 months" bound as Starter LTV $900 and b32 Marisol t9's "2 million diagnosed" bound as peak patients 2. | b28–b38: **14 removed (9 probe-class, 3 corrections, 2 restates), 9 added**; net 150 → 145, `stale_drop` acts 21 → 30. b39: **2 corrections removed, 0 added** — b39q `dd74b01b` t20 and `e1dd3616` t14, both in the **new personas** (65-dana, 66-remy), neither of the two stale corrections of the usual 25 (quillpath p7 t26, p24 t24). | **4** — b32 `6a721cdf` 7:2 (dropped as `step:peak_patients restated at 2 (message 9)`: **the documented harm itself**, folding "50% diagnosed = 2 million" over his 200,000, and killing a true probe of exactly that error); b32 `6a721cdf` 9:1 (the correction "Patients on Kelvexa at peak is about 40,000, not 200,000" dropped as `its root eligible_patients restated at 2.64 (message 11)` — message 11 *retracts* 2.64, it does not restate it); b35h `a14ca044` 5:2 (the correction "$9 million, not $10.2 million" dropped through the lineage, though he keeps $10.2M deliberately at messages 7 and 9); b38l `f80d981c` 15:2 (the $15.8M probe). | **1 fault record regresses, pass → FAIL: `b38l-marisol-t24-stale-correction`** — the graded stale correction the previous round fixed comes back, because dropping the t20 probe lets the correction fire later. Plus 1 fault record fixed (`b37h-marisol-t20-stale-probe`, a correct drop — his $9.9M really is superseded at message 19) and 1 correct record pushed into `diverged` (`b35q-tyler-t32-close`), which takes it out of the gate's denominator. | **reject as prototyped.** It is the only one of the three that drops stale **corrections**, which is Lorenzo's approvable class — but it drops them in the new personas, not in the 12, and it pays with a graded stale correction returning and four true lines lost. "Verified only" does not avoid the documented harm: the b32 peak-patients binding comes through the verified list. |

**What I would do instead, if any of this is wanted** (proposed, not built):
- for W3, fold the verified binding onto the claim's **own** quantity only and not through `lineageOf` — three of the
  four misses above (b32 9:1, b35h 5:2, b38l 15:2) come through the lineage leg, and the two b39 stale corrections
  it drops also come through the lineage. That version would need its own measurement;
- for W2, the honest fix for larkspur p57 t10 is not the withdrawal leg at all but the **carried-figure** one: claim
  7:4 ($3.9M on Port Avery) is built on the same withdrawn 12% and its span does not name it. Carrying the claim's
  *inputs* (not just the figures its words happen to hold) would drop both, and would not need the case-figure rule
  relaxed. Also unmeasured;
- for W1, nothing. The guard it loosens is the one keeping two correct-behaviour records alive.

**One caveat on reading the W2 row.** The §2 table above was read against the **recorded wave**; this round's numbers
are replay-against-replay. larkspur p57 t10's probe is in the recorded wave but the replay's queue does not reach it
in the control arm, so the replay could not show W2's benefit directly. I checked the mechanism separately, free, at
unit level: `findWithdrawals` on his message 9 returns `{value: 12, unit: 'percent', firstPerson: true, replacement: 31}`
and `staleReason` then returns `built on 12, withdrawn at message 9 ("not 12%")` for the $2.0M claim. That is how the
b39 row's "1 line removed" was produced once the prototype carried `firstPerson` through `update`'s withdrawal
mapping (it was silently dropped there in the first cut, which is worth knowing if this is ever built).

---

## 11. Item 1 — C5, all four narrowed (`57c8fe68`)

Three regex changes in `lib/orchestrator/conduct.ts` (`v4.13`); `C5_SELF_HARM` untouched.

1. **The gerund carve-out**, in both `C5_DESPAIR`'s `what's the point` branch and `C5_NO_POINT`, as one shared
   `GERUND_CARVE`. It exempts an `-ing` continuation after `of` / `in` **except** the forms that can only be despair
   (`trying`, `bothering`, `going`, `carrying`, `continuing`, `living`, `being`, `existing`) and the `-ing`-shaped
   pronouns (`anything`, `everything`, `nothing`, `something`, `thing`). That exception list is a judgement call
   (§13.1): the ruling says "carve out gerunds", and carving out *all* of them would have taken "what's the point of
   anything" — a core despair test since v4.3 — off the floor with them. Hyphens count (`[\w-]+ing`), or
   "re-forecasting" would have gone on firing.
2. **`(bad|rough|dark|awful) few (weeks|months)` is off the floor.** The model layer already names it: the distress
   prompt's own `distress` label reads "disclosure of a hardship outside the case (not sleeping, health, a loss, a
   crisis, 'a rough few weeks', 'I'm falling apart')". The first-person branches (`i'm not sleeping`,
   `i haven't been sleeping`, `i can't sleep`, `broken me`, `i'm falling apart`) still carry the disclosure shape
   Sam's run showed, and her whole message still fires as risk-to-self.
3. **The bare sentence-final `why bother?` is off the floor** — the `[.?!]|$` sub-branch is gone and the separator is
   now `\s+`. "why bother anymore / at all / with (any of) this" and the first-person "why do I even bother" stay.

### The test set, and its results

`tests/orchestrator/conduct.test.ts`, describe "C5 — the floor narrowings of 26 Oct (v4.13)" — all passing.

**Negatives (clean, category ≠ C5).** The first four are the client-subject sentences of §1's table:

| sentence | before | after |
|---|---|---|
| "Brew & Bean has had a rough few months on traffic." | C5 hardship | **clean** |
| "The client has had an awful few weeks since the recall." | C5 hardship | **clean** |
| "Sales have had a bad few months and the trend is still down." | C5 hardship | **clean** |
| "If the margin is negative at every price, why bother?" | C5 despair | **clean** |
| "What's the point of segmenting further if both segments move together?" | C5 despair | **clean** |
| "What's the point of modelling year three when the pilot decides it?" | C5 despair | **clean** |
| "I don't see the point in discounting below cost." | C5 despair | **clean** |
| "I don't see the point of segmenting the four healthy routes." | C5 despair | **clean** |
| "What's the point of discounting if volume doesn't move?" | C5 | **clean** |
| "I don't see the point in re-forecasting the four healthy routes." | C5 | **clean** |
| "They had a dark few weeks after the plant fire." | C5 hardship | **clean** |
| "Why bother? The unit economics never clear the bar." | C5 despair | **clean** |

**The despair-shaped versions still flagged.** The ruling's two named gate sentences:

- **"What's the point, I'm going to fail anyway."** — still fires on the **regex floor**: `C5 / offer_pause / despair`
  (nothing of the form "of/in \<gerund\>" follows "point", so the carve-out does not reach it).
- **"Why bother, I'm useless at this."** — this one never fired on the floor, before this round or after it: the bare
  branch required `anymore / at all / with this / [.?!] / $` and a comma is none of those, and `i'm useless at this`
  is not `i'm useless at everything`. It is the **model layer's** call, and `tests/orchestrator/conduct-runner.test.ts`
  drives it through the real runner: with the distress classifier returning `distress`, the pause offer goes out
  ("…are you okay?"), the case does not end, and the message reaches `classifyDistress` — which is the change, since
  the floor no longer short-circuits it. The same test does the other two narrowed shapes ("I've had a rough few
  months and I'm barely holding it together.", "…why bother with any of it.") and the three client-subject versions
  with the classifier returning `none`: no offer, case carries on, classifier consulted.

Nine more despair-shaped forms still fire on the floor: "What's the point of anything.", "What's the point of any of
this?", "What's the point of trying.", "What's the point of carrying on with these.", "I don't see the point in
trying anymore.", "I don't see the point in any of it anymore.", "Why bother anymore?", "Why even try at all.", "Why
do I even bother?". All four first-person hardship disclosures still fire. All eight self-harm forms still fire as
`reason: 'self_harm'` and `isRiskToSelf`. The existing C5, C1/C5-boundary and v4.12 suites are untouched and green.

**This item is invisible to the replay** (no batch-39 message is one of these shapes), which is why the gate for it is
the test set rather than a line count.

---

## 12. Item 3 — `misquoteSameTurn`, attributed quotes only (`d8f6359e`)

`sameTurnCorrections` in `lib/orchestrator/misquote.ts` is the whole restriction, and it is pure:

- **attribution.** `ATTRIBUTION_SRC` must match the finding's sentence **at or before the end of the quoted span** —
  an attribution in a later clause belongs to another figure ("that is $240M to Aldermoor; you said the hurdle is
  $300M" attributes the hurdle). It covers "you said / gave / gave me / gave us / mentioned / quoted / told / showed
  / shared / provided / put", "you're saying / telling me", "the exhibit|table|case|prompt|data|chart|brief
  says|shows|has|gives|lists|states", "according to you|the exhibit…", "per|from|on|in the exhibit|table|chart…" and
  "we were given". It is deliberately **separate from and wider than** the detector's own `ATTRIBUTED`, which must
  keep its narrow form: that one turns off the `operandLater` guard *inside* the detector (`misquoteAttribution`,
  already in the preset and already measured), while this one only decides whether an existing finding may correct a
  turn early;
- **the same-message withdrawal check.** `findWithdrawals(candidateText)` is read, and a finding whose cited figure
  the candidate takes back in the same message says nothing;
- logged as `misquote_same_turn` with `take` and `skipped` (each skip carrying `unattributed` or
  `withdrawn_same_message`).

### Every new correction sentence, read

**b28–b38, `*=phase1` vs the baseline: 12 slice-level additions, 3 removals — 6 distinct turns.** (The removals are
the three that moved two turns earlier, so they appear on both sides.)

| run | turn | the candidate's sentence | code's correction | true? |
|---|---|---|---|---|
| b32 `f59f5ea8` (64-tyler) | t8, new | "Prevalence **you gave** is 1.5%, so 250 × 0.015 = 3.75 million people with Corlan's disease." | "To correct one figure: in the patient funnel, **1.6%** of US adults have Corlan's disease…" | **yes** |
| b35q `ee99bd82` (64-tyler) | t8 → **t6** | "For Starter, **you said** CAC is $320, so it needs LTV of $960…" | "…the cost to acquire one new customer is $1,200 for Pro … and **$300** for Starter…" | **yes** |
| b36a `34eb553a` (64-tyler) | t12, new | "And **you said** Nimbrel's net price is about $8,650 per patient per year…" | "…its net price is about **$9,000** per patient per year." | **yes** |
| b37h `442e37ff` (64-tyler) | t8 → **t6** | "Variable cost per bag: ingredients **you said** $0.75, packaging $0.30…" | "…variable costs per bag are **$0.70** for ingredients…" | **yes** |
| b38l `cee7d399` (64-tyler) | t8 → **t6** | "**You said** fixed costs were $21M in both years…" | "…fixed costs … were **$20.0M** in both FY2023 and FY2025." | **yes** |
| b38l `cee7d399` (64-tyler) | t14, new | "On Lakeport, **the exhibit shows** fare down to $125 with $20 extras…" | "…the average one-way fare on Hub–Lakeport fell from $200 in FY2023 to **$120** in FY2025." | **yes** |

**Both of the previous round's provably false corrections are gone.** b34a `a1133734` t31 ("$320M less $80M in
annual selling costs is $240M to Aldermoor") and b38l `701443f7` t17 ("breakeven revenue per passenger is
$11,000/60 = $183, so a $163 fare") name no source: the restriction rejects them, and the measurement arm confirms
they are absent. Both are locked in as unit cases in `tests/orchestrator/misquote-same-turn.test.ts`, alongside the
Hollis Bay "packaging $0.35" one, which is also unattributed and also stays silent — exactly as §7's option 2 said
it would.

**The other three changed lines on b28–b38** are the acknowledgment rotation moving with the correction, plus one
substantive removal worth naming: **b32 `f59f5ea8` t8 drops the model's own Socratic sentence** "Before we lean on
that share figure: you said prevalence is 1.5%." in favour of code's flat correction. That is Rule 6 option 4 working
as specified — one flat sentence, and the `MISQUOTE` hint telling the model to stay off the figure — not a second
correction. 0 refusal sentences changed; 0 checker decisions changed.

**Batch 39: misquote corrections 3 → 5, and the two turns §3 could not deliver are delivered.** aldermoor p64
`4df38465` **t6** ("Prevalence you gave me is 1.5%" → the ledger's 1.6%) and **t10** ("You said Nimbrel's net price
is about $9,400" → $9,000) now both get their one flat sentence, on the misquote's own turn. Brew & Bean p64 gains
two more, both attributed and both true ("You said COGS went from 44% of revenue" → 42%; "You said average ticket
went from $6.20 to $6.50"). Hollis Bay p64 t6 still gets nothing, as expected.

**Verdict: `misquoteSameTurn` is IN the `phase1` preset.** It moved out of `NON_PRESET_SWITCHES` and into
`PHASE1_SWITCHES` in `d8f6359e`. The evidence is the six sentences above — 0 false corrections, 0 new refusals, 0
changed checker decisions, and `fact-check`'s F2-next falling 101 → 97 with F1/F3/F4 all still 0.

**One replay artifact to know about.** On b38l `cee7d399` t14 the saved model output also asks "…does your $125 match
it?", so the replayed turn carries both code's correction and the model's question. In a live run the `MISQUOTE` hint
goes into that same turn's prompt and tells the model not to question the figure; the replay cannot exercise that,
because the model's words for the turn are the recorded ones. The three `correct_correction` records whose windows
the previous round widened by two turns (§8.3) all still pass.

---

## 13. Item 4

### 13.1 Built — the recommendation turn sets `changesConclusion` (`8d1ebba3`)

`formatCheckerSection` (`lib/scoring/checker-record.ts`) now escalates in code. A flagged claim whose turn states a
clear recommendation, and whose flag nothing in the interview closed, reads
`changes the conclusion — the figure is in the recommendation itself`. The wording differs from the model's plain
"changes the conclusion" so the prompt never conflates code's call with the checker's.

Three definitions, each deliberate and each one line to change:

- **a recommendation turn** is one `clearRecommendation` fires on (`lib/orchestrator/stall.ts` — the predicate 4.9
  already uses, on Lorenzo's 22 Oct wording "set it on a clear recommendation": the message's first sentence opens on
  a decision verb, or frames the decision). On larkspur p57 `69441a66` it fires on **t29 alone**, which is the
  recommendation ("Recommendation: exit Lakeport and Port Avery and redeploy all 5,000 flights…");
- **the rule is literal.** The claim's turn has to *be* a recommendation message, not merely be at or after one, so a
  wrong bottom line restated in a later risk answer is not escalated by code. Cost if that is wrong: one missed
  escalation, against the cost of a written report calling an arithmetic slip in a risk answer "the conclusion";
- **open** means no `correct`, `converted` or `stale` decision, and no later redo the report already credits.

**Verified against the stored run.** The section built from larkspur p57 `69441a66`'s own recorded events now carries:

> `- turn 29: "What closes the gap is the $1.8M we stop losing on the exited routes, plus the $5.4M fare uplift on the four healthy routes — call it $7.0M of operating profit" — WRONG (conceptual; changes the conclusion — the figure is in the recommendation itself): about 5.2 by the checker. Not raised in the interview (the case closed first).`

The other six flags of that run are byte-identical. Across all 86 stored runs of batches 32–39 the clause fires on
**8 runs** and nowhere else, which is the scan behind the re-score selection below.

### 13.2 Drafted, NOT run — the scoring-prompt mandate

I did **not** put this in code, not even behind an unused flag: it is a prompt change whose only honest test is a
paid re-score, and a dead flag in `lib/scoring` would be a second thing to remember to take out. The draft, against
`formatCheckerSection`'s trailing directive:

```diff
   return `MATH CHECKER (a model's check of the candidate's claims, vetted in code; a figure "computed in code" is code's own):
 ${lines.join('\n')}
-Treat a WRONG claim as the candidate's error unless they revised it — and cite it only where the transcript bears it out. One they revised or withdrew is a self-correction.`;
+Treat a WRONG claim as the candidate's error unless they revised it — and cite it only where the transcript bears it out. One they revised or withdrew is a self-correction.
+Every WRONG claim above that is still OPEN — its line says it was not raised, not corrected, expired, shed, or left for this report — and that carries a right figure MUST appear in the written report: one needsWork item on the dimension whose work the figure belongs to, quoting the candidate's own words from the span and naming the right figure. Do not leave such a claim out because the interview never raised it; that it was never raised is the reason the report has to. One marked "changes the conclusion" is named in synthesis as well.`;
```

and, so the mandate has a subject the judge can see, the same predicate that already decides the escalation:

```diff
-    return `- turn ${turn}: "${c.span}" — WRONG (${c.errorType ?? 'error'}${changes}): ${figureText(c)}. ${text}`;
+    const open = flagOpen(outcomes) && credit === null && figureText(c) !== 'no figure';
+    return `- turn ${turn}: "${c.span}" — WRONG (${c.errorType ?? 'error'}${changes})${open ? ' [OPEN — must be named in the report]' : ''}: ${figureText(c)}. ${text}`;
```

**What it would make mandatory, run by run** — counted on the eight runs the escalation clause fires on, as
`flagged claims / of those, open and carrying a right figure`:

| run | flagged | mandatory |
|---|---:|---:|
| larkspur p57 `69441a66` (b39) | 7 | **5** |
| larkspur p64 `9c8a354a` (b39) | 8 | **6** |
| quillpath p24 `99dd37d1` (b39) | 6 | **5** |
| quillpath p07 `e08c362a` (b37) | 25 | **19** |
| quillpath p24 `eb8d7576` (b37) | 16 | **13** |
| quillpath p64 `ee99bd82` (b35) | 22 | **12** |
| hollisbay p64 `52951de8` (b35) | 5 | **3** |
| larkspur p40 `bbf78ab8` (b36) | 1 | **1** |

**Why it must be measured and not shipped on reasoning, and why I would not ship this draft as written.** Nineteen
mandatory needsWork items on one run is not a report anybody reads — quillpath p07 `e08c362a` would get 19, and
p24 `eb8d7576` 13. Three things downstream of the judge then fight it: the evidence-quote audit strips a needsWork
item whose quote is not verbatim in a candidate turn, which a span copied out of a checker claim often is not; the
dimension-reconciliation pass merges cross-dimension repeats, which is exactly the shape a dozen mandated items on
one run makes; and the stage caps can mark a dimension `notAssessed`, where a mandated item has nowhere to go. So
the draft above is the ruling taken literally, and my recommendation is to measure it and then narrow it — the two
narrowings worth measuring beside it are "mandatory only where the claim is marked as changing the conclusion"
(which on these eight runs is 1–3 items a run, the case item 4 was raised about) and "mandatory for at most the
three largest-error open claims".

### 13.3 Proposed, NOT run — a re-score of 5 stored runs

**The five**, chosen because the item-4 clause actually changes their judge prompt, across three cases, and four of
them have a stored report to diff against:

| run | case | recommendation turn | escalated by code | stored report? |
|---|---|---|---|---|
| larkspur p57 `69441a66` (b39) | prof-002 | t29 | 1 | no — never scored, so the new report has no before |
| quillpath p24 `99dd37d1` (b39) | pricing-001 | t25 | 2 | yes |
| quillpath p07 `e08c362a` (b37) | pricing-001 | t27, t39 | 2 | yes |
| quillpath p24 `eb8d7576` (b37) | pricing-001 | t31, t33 | 2 | yes |
| hollisbay p64 `52951de8` (b35) | launch-001 | t23 | 1 | yes |

**Cost estimate.** Scoring is three Opus 5.5 passes per run. From the stored usage tables: judge $0.324 + verifier
$0.116 + reconcile $0.079 = $0.519 on b39 quillpath p24; the five prof-002 runs of b36 cost $0.477–$0.521 each
(mean $0.500); b37 quillpath $0.455–$0.518; b35 hollisbay p64 $0.434. So **$0.43–$0.52 per run, $2.40 expected and
$2.60 worst case for five** — inside the $3 cap with about 15% of headroom. `scripts/regrade.ts` writes no score (it
prints the ratings beside the stored ones) and only the idempotent data-request backfill plus `llm_usage` events.

**The command.** `scripts/regrade.ts` takes a batch folder and grades every completed, already-scored run in it, and
has no run filter, so it cannot grade exactly these five as it stands. Two lines would give it one:

```diff
 const repeat = Number(process.argv.find(a => a.startsWith('--repeat='))?.split('=')[1] ?? 1);
+const only = (process.argv.find(a => a.startsWith('--only='))?.split('=')[1] ?? '').split(',').filter(Boolean);
...
     const run = JSON.parse(readFileSync(path.join(root, dir, file), 'utf8'));
+    if (only.length > 0 && !only.some(o => file.includes(o) || dir.includes(o))) continue;
```

and then, with the cap enforced in the environment rather than trusted:

```
LLM_BUDGET_USD=3 LLM_BUDGET_FILE=/tmp/regrade-item4.json \
  npx tsx --env-file=.env.local scripts/regrade.ts batch-39-larkspur-oct-26-runs-1-8 --only=69441a66
LLM_BUDGET_USD=3 LLM_BUDGET_FILE=/tmp/regrade-item4.json \
  npx tsx --env-file=.env.local scripts/regrade.ts batch-39-quillpath-oct-26-runs-1-8 --only=99dd37d1
LLM_BUDGET_USD=3 LLM_BUDGET_FILE=/tmp/regrade-item4.json \
  npx tsx --env-file=.env.local scripts/regrade.ts batch-37-quillpath-oct-20-runs-1-5 --only=e08c362a,eb8d7576
LLM_BUDGET_USD=3 LLM_BUDGET_FILE=/tmp/regrade-item4.json \
  npx tsx --env-file=.env.local scripts/regrade.ts batch-35-hollisbay-oct-20-runs-1-5 --only=52951de8
```

One shared `LLM_BUDGET_FILE` so the $3 is a cap on the whole set, not on each call. **Not run — your go is needed,
and the `--only` lines are not committed either.** Two things to know before saying yes: `regrade.ts` reads the
session out of the database by id, so these five sessions have to still be there; and larkspur p57 was never scored,
so `regrade` skips an unscored run today — grading it needs that guard relaxed for this one run, or the run scored
once and then compared.

---

## 14. Judgement calls, with the cost if wrong

I could not ask anyone. Each of these is the conservative call.

1. **The gerund carve-out keeps an exception list** (`trying`, `bothering`, `going`, `carrying`, `continuing`,
   `living`, `being`, `existing`, plus `anything` / `everything` / `nothing` / `something` / `thing`, which are
   `-ing`-shaped by accident). The ruling says "carve out gerunds"; carving out all of them would have taken "what's
   the point of anything" and "what's the point of trying" off the floor, and the standing C5 posture is to err
   toward triggering. **Cost if wrong:** a candidate questioning an analytic step with one of those nine verbs
   ("what's the point of continuing with this branch") still draws a pause offer from the floor. Narrowing it is
   deleting words from one string.
2. **"Why bother, I'm useless at this." is proved through the runner with a stubbed classifier, not on a recorded
   verdict.** No message in b28–b39 is that shape, so there is no recorded distress verdict to replay, and a live
   classifier call costs money. What the test proves is the path: the floor no longer short-circuits, the message
   reaches `classifyDistress`, and a `distress` verdict still produces the offer. What it does not prove is that
   Haiku 5.5 labels that sentence `distress` — the prompt names "feeling worthless or like a failure as a person"
   and the test asserts that clause is in the prompt, which is as far as free evidence goes. **Cost if wrong:** that
   shape gets no check-in. ~$0.001 of Haiku would settle it if you want it settled.
3. **`misquoteSameTurn` went into the preset on my own reading of the gate.** The ruling made the preset conditional
   on 0 false corrections, I measured 0 across the 31 slices, and I moved it. **Cost if wrong:** one line in
   `engine-switches.ts` moves it back, and §12's six sentences are the evidence to argue with.
4. **Item 4's rule is literal — the claim's turn must BE a recommendation message.** §13.1 has the reasoning and the
   cost.
5. **`clearRecommendation` is the predicate, not `isRecommendationStatement`.** The looser one fires on
   `RECOMMENDATION_PATTERN` anywhere in an analysis turn ("they should…", "I'd prioritize…"), which on these
   transcripts would make half the back half of a case a "recommendation turn". `clearRecommendation` fires on t29
   alone in larkspur p57. **Cost if wrong:** a recommendation that opens on a verb neither list reads is not
   escalated — the same residual 4.9 carries.
6. **The three widenings were measured on the replay, which cannot see the recorded wave's own queue.** §10's caveat
   has the one case where that mattered and how I checked it another way.
7. **The round's baseline was taken by detaching to ab5b668a in this worktree and replaying there.** The alternative
   was to trust `postwave-gate-on`, whose `switches.txt` records a dirty tree at `f5cfd81f`; the new baseline is
   byte-identical to it, which is also the check that it was the right state. Nothing was pushed, merged or staged.
8. **`evals/fault-bank/specs/b39a.json` and `b39h.json` were not touched this round** — no record was added, changed
   or removed anywhere in `evals/`. The `phase2-design` conflict §8.7 flagged is exactly as it was.

---

## 15. 27 Oct — Lorenzo's rulings on §10's numbers, item 4's mandate, the re-score and the C5 live check

Two paid items, each under its own cap, each installed before the first call (`LLM_BUDGET_USD` + `LLM_BUDGET_FILE`):
the five-run re-score **$2.5725 of $3.00** and the C5 live check **$0.0009 of $0.10**. **Total $2.5734.** Nothing else
spent. Nothing pushed, merged or deployed; no DB write; nothing under `Case Interview Runs/` staged.

### 15.1 The C5 live check — the safety item (GO, $0.0009 of $0.10)

Real `claude-haiku-5-5` calls through the production path (`classifyDistress`, `BACKGROUND_MODEL_ID.distress`), ten
sentences, one call each. `floor` is `classifyConduct`'s own verdict at v4.13, for context.

| # | sentence | expected | model verdict | floor | held? |
|---|---|---|---|---|---|
| 1 | "Why bother, I'm useless at this." | distress | **`distress`** — "self-deprecating hopelessness about themselves ('useless', 'why bother') extending beyond the case task" | clean | **yes** |
| 2 | "What's the point, I'm going to fail anyway." | distress | **`distress`** — "expresses hopelessness and expected personal failure beyond the case, not just task frustration" | C5 | **yes** |
| 3 | "I've had a rough few months and I'm barely holding it together." | distress | **`distress`** — "discloses a hardship outside the case ('rough few months') and feeling like they're barely holding it together" | clean | **yes** |
| 4 | "Honestly, why bother with any of it." | distress | **`distress`** — "global hopelessness about purpose … extending beyond the case itself" | clean | **yes** |
| 5 | "I'm useless at this. What's the point of carrying on." | distress | **`distress`** — "self-directed worthlessness and questioning the point of continuing" | C5 | **yes** |
| 6 | "There's no point in me doing these, I'm going to fail anyway." | distress | **`distress`** — "hopelessness and worthlessness about own future beyond the case task" | clean | **yes** |
| 7 | "Brew & Bean has had a rough few months on traffic." | none | **`none`** — "describes the client company's business trouble, not the candidate's own state" | clean | **yes** |
| 8 | "What's the point of segmenting further if both segments move together?" | none | **`none`** — "analytical question about segmentation, no personal distress" | clean | **yes** |
| 9 | "I don't see the point in discounting below cost." | none | **`none`** — "analytical objection about pricing strategy, not personal distress" | clean | **yes** |
| 10 | "If the margin is negative at every price, why bother?" | none | **`none`** — "analytical question about the case economics; 'why bother' refers to the business scenario" | clean | **yes** |

**Every expectation held: 10/10, 0 failures. No despair line came back clean.** Four of the six despair lines (1, 3, 4,
6) now get no floor hit at all, so the model layer is the only thing standing between them and silence — and it
answered `distress` on all four. §14's judgement call 2 ("what the test does not prove is that Haiku 5.5 labels that
sentence `distress`") is settled on a real verdict: sentence 1 is the ruling's own line, and it returns `distress`.
The four case phrases the 26 Oct narrowing took off the floor are `none` on the model layer too, so the narrowing did
not move a misfire from code into the model.

### 15.2 Narrow W3 — measured, and REJECTED. The topic is closed

**What was built (and reverted — nothing is committed).** `foldTurn` folds `candidateMath.verified` off prof-001 as
`loose` worksheet values, and `lineageMoved` is kept from reading them. Two readings of "onto the claim's own
quantity only, not through `lineageOf`" were measured, because the phrase admits both:

- **variant B (strict)** — loose values never reach `lineageMoved` at all, so they act only through the claim's own
  quantity (`hasNewerValue` and the withdrawal legs);
- **variant A (literal)** — loose values also count inside `lineageMoved` where the member IS the claim's own
  quantity.

**Control.** `nw3-ctl` / `nw3-b39-ctl` at HEAD `78e87324` reproduce the previous round's `r2-on` / `r2-b39-on`
**byte-identically** (505 and 147 flag events), so the arms are comparable with the 26 Oct numbers. With
`W3_VARIANT` unset the prototype is a proven no-op.

| arm | b28–b38 (31 slices) | batch 39 (5 slices) | fault bank, `*=phase1` | verdict |
|---|---|---|---|---|
| **narrow W3, variant B** | **3 flag events removed, 5 added, 3 changed** — net 2 stale drops: b37h `7f6c40ea` 17:8 and b35q `7e69eda5` 13:2; the rest is b35q's queue shifting (claim 13:3 probed at t15 instead of expiring at t19) | **0 removed, 0 added, 0 changed** | fault **79/154** (+1: `b37h-marisol-t20-stale-probe` FAIL → pass); correct **95/95**; `stale_correction` **3/3** — `b38l-marisol-t24-stale-correction` still passes | **reject: 1 newly missed real error** |
| **narrow W3, variant A** | **29 removed, 35 added, 4 changed** — b32 `6a721cdf` requeued wholesale | **0 / 0 / 0** | fault 79/154, correct 95/95 (the bank does not cover the lost correction) | **reject: it reintroduces the documented harm** |

**The one newly missed real error, read as §10 reads them.** b35q `7e69eda5` (24-marcus) claim 13:2 is "40% cancelled
in 12 months, call it 4% a month". Variant B drops its probe as `step:starter_churn restated at 5 (message 15) since
message 13`. The binding is code's verified stamp on message 15's sentence **"And the cancellation row front-loads: 5%
in month one"** (confirmed from `scripts/replay-verified.ts`: `starter_churn 5 | And the cancellation row front-loads:
5% in month one`). That is the first month's cancellation rate, not his average monthly rate — he still holds the
25-month life and the $750 LTV through message 15, and only at message **17** says *"I took 40% over 12 months and
divided — that's 3.3% a month, and I rounded to 4% … That's a shortcut, and the exhibit says it's a bad one."* So by
the turn the line was due he had **not** moved off the claim's own figure: a miss, and the same harm class as the two
documented ones, only now arriving through the *verified* list and landing on the claim's own quantity. The other
removal (b37h 17:8, his $9.9M of first-year profit, superseded at message 19) is a **correct** drop — the bank agrees,
it fixes `b37h-marisol-t20-stale-probe`.

**Variant A's harm, for the record.** In b32 `6a721cdf` the true correction **"Patients on Kelvexa at peak is about
40,000, not 200,000."** disappears (claim 9:1 gets a probe at t11 instead), which is §10's documented
`stepFlagsLive` harm exactly: "50% diagnosed = 2 million" folded over his 200,000. `lineageMoved` has no plausibility
guard, which is why the harm reaches it even though `hasNewerValue` rejects a figure 10⁵ off the step's answer.

**Verdict: narrow W3 fails Lorenzo's bar (0 newly missed real errors) in both readings. Reverted, nothing committed,
topic closed.** Narrow W3 also drops **nothing at all** on batch 39 — neither of the usual 25's two stale corrections,
which is what it was proposed for — so even had it passed, it would not have moved bar 3.

**The 7 remaining firm stale lines on the usual 25, split as asked** (read from the control replay's own flag events;
the report's t-numbers are the replay's +1):

| class | n | the lines |
|---|---:|---|
| **stale corrections** | **2** | quillpath p07 `c82e7bd7` t26 (`correct`, "Starter standalone LTV/CAC is about 2 times."); quillpath p24 `99dd37d1` t24 (`converted`, the same sentence) |
| **repeated probes** | **1** | larkspur p57 `69441a66` t10 — code's `hint` on claim 7:3, after the model's own t8 probe on the very same figure ("On the fare cut you applied, how did you get from the 12% to those two dollar figures…") |
| **single probes** | **4** | hollisbay p57 `17b4117c` t14 (claim 11:5, "$37.8 million of revenue"); larkspur p57 t18 (15:6, "fill the last 20 seats"); quillpath p24 t16 (13:0, "Walk me through how you got to 4%"); quillpath p57 `854fc080` t8 (5:0, "What steps got you to 21.5%?") |

So the firm residue is **2 corrections, 1 repeat, 4 first probes** — and five of the seven are a single probe or its
first escalation, which is the mildest shape in `evals/severity.md`.

### 15.3 Item 4 — the mandate narrowed and shipped (`e63339d9`)

The rule as ruled: **name every open claim marked `changesConclusion`, at most 3 per report.** `mandatedConclusionClaims`
(checker-record.ts) is the single definition — marked (the checker model's own `changesConclusion`, or code's
escalation on a `clearRecommendation` figure) **and** open (no `correct`/`converted`/`stale`, and no later redo the
report already credits) — ordered code's escalations first, then the latest turns, capped at 3. `formatCheckerSection`
tags those rows `[CHANGES THE CONCLUSION — NAME IT IN THE REPORT]` at the end of the row (so the
`WRONG (…): <figure>. <what became of it>` shape every other rule and test reads is untouched) and the section's
trailing directive makes naming them mandatory. The prompt and the check read one function, so they cannot disagree.

**The three downstream passes §12 named, each resolved by where the enforcement sits — none of them loosened**
(`lib/scoring/conclusion-mandate.ts`, inserted after reconciliation and before the strong gate / stage caps):

| pass | what it would have done | what I did |
|---|---|---|
| **the evidence-quote audit** | strips a quote that is not in a candidate turn, and drops a needsWork item whose every quote was fabricated | the mandate runs **after** it, and the only quote it ever writes is the claim's own span, checked here with the audit's **own** predicate (`quoteAppearsIn`) — so it is a quote the audit would have kept. When the span cannot be found, the item is written **with no quote**, which is what the audit already allows for a weakness ("omission claims legitimately carry no quotes"), and the claim verifier has already run. Nothing is loosened for any other item. |
| **the cross-dimension reconcile merge** | merges same-concept items and can rewrite or drop one | the mandate runs **after** it and adds nothing when the report already names the claim — by the right figure *in the judge's own words*, or by a quote of the span. So a judge item that survived reconciliation, even merged into another dimension, is left exactly as it is. (Figures are read from the item's `point`, not its quotes: a quote carries the candidate's words, which always hold the wrong figure and often the right one as a number word — "the four healthy routes" holds a 4.) |
| **stage-cap `notAssessed`** | marks a dimension unrated when it holds no quoted evidence, leaving a mandated item in an unrated dimension | the mandate runs **before** the caps, so its quoted item is the "real, quoted evidence from elsewhere" Rule 9 asks for and the dimension is **caveated instead of not assessed** (a test asserts both halves). A dimension the **judge** marked `notAssessed` is not overridden: the item goes to the first candidate dimension that was assessed, and only with none left does it land on the target with the flag cleared, since "not assessed" would then be the false statement. |

Target dimension: `synthesis` for the recommendation's own figure, else `quantitative` (`judgment` last). `qa` carries
`conclusionMandateAdded`. 18 new tests. Two follow-ons worth knowing: the caveat floor keeps a caveated dimension at
`needs_work` when a quoted weakness survives, so the mandated item does not float a rating up; and a dimension that is
`notAssessed` still renders its `needsWork` items (`report-dimensions.ts` changes only the rating), so even the
no-quote edge case is still named in the report.

### 15.4 The re-score — GO, 5 runs, $2.5725 of $3.00

`scripts/regrade.ts` gained `--only=` (as §13.3 drafted, plus trimming and persona matching) and `--out=` (the rubric,
the report text and the QA counts as JSON — ratings alone cannot show whether a claim is *named*); the choice of what
to grade is a pure, tested module (`lib/eval/regrade-select.ts`, 7 cases). The never-scored guard is relaxed for
**`69441a66` only**, as a one-run list, not a flag.

All five sessions were confirmed present in the database **read-only** before spending (`sessions` + a turn count;
33 / 31 / 41 / 29 / 27 turns). No DB write.

| run | case | mandated claims | stored report | spend |
|---|---|---:|---|---:|
| larkspur p57 `69441a66` (b39) | prof-002 | 3 (1 code escalation) | none — never scored | $0.5351 |
| quillpath p24 `99dd37d1` (b39) | pricing-001 | 3 (2 code) | yes | $0.5578 |
| brewbean p57 `0a5cdc18` (b39) | **prof-001** | 2 | yes | $0.4568 |
| hollisbay p64 `52951de8` (b35) | launch-001 | 1 (code) | yes | $0.4554 |
| quillpath p07 `e08c362a` (b37) | pricing-001 | 2 (2 code) | yes | $0.5674 |

**The swap.** `brewbean p57 0a5cdc18` is in for §13.3's **quillpath p24 `eb8d7576` (b37)**, to meet his composition
(one prof-001 run). I dropped that one of the five because it is the second p24 on the same case as two other runs in
the set, so it loses the least coverage; under the narrowed rule it would have had 2 mandated claims rather than the
unnarrowed draft's 13, so nothing specific to it was being tested. brewbean p57 is prof-001, has a stored report, and
has 2 mandated claims — the only prof-001 runs in batches 28–39 with a stored score and any mandated claim are this
one and brewbean p40 `03201cc4` (1 claim).

**The point of the exercise: confirmed.** larkspur p57 `69441a66`'s new report names the $1.8M double-count with
≈$5.2M, twice:

> *topFix:* "Your final $7.0M double-counted the $1.8M exit add-back (correct total ≈ $5.2M, and that still includes
> an unvalidated $5.4M fare uplift)."
> *Synthesis, needsWork:* "The headline $7.0M double-counts the $1.8M exit add-back, which is already excluded from
> the $19.8M. The correct total is −$0.2M + $5.4M ≈ $5.2M. That $5.4M also rests on an unvalidated fare increase, so
> year-one profit was overstated." — quoting his own span.

**All 11 mandated claims across the five runs are named, with their right figures**, and
**`conclusionMandateAdded` is 0 on every one** — the judge complied with the prompt mandate unprompted by code, so the
backstop is a floor that never had to fire. Honest limitation: that means the backstop is proved by its unit tests
only, not by a paid run.

**Before / after, against the four stored reports** (the rest of each report is reworded throughout, as a fresh Opus
pass always is):

| run | the mandate's effect | rating moves |
|---|---|---|
| quillpath p07 `e08c362a` | the two escalated claims now carry their right figures — "+$240k a month ($2.32M vs $2.08M), not $175k" and "the CFO's standalone ratio is 2.0x, not 1.35x". The stored report named the same two figures as wrong but gave **no** right figure ("kept the $175k price-test gain and the 1.35x fallback, both built on the old $405 lifetime") | synthesis **strong → meets_bar** |
| quillpath p24 `99dd37d1` | "$0.68M, not $485K" and "+$0.24M, not $175K" — code's own correction figures. The stored report had only "the value figures ($485K, $175K) are understated" | quantitative **meets_bar → needs_work** |
| hollisbay p64 `52951de8` | the $0.66M sampling figure named with $0.75M in topFix, quantitative and synthesis; the stored report named it once | quantitative **meets_bar → needs_work** |
| brewbean p57 `0a5cdc18` | both claims (24.4 → 16 points; 23.2 → 4.2 points) named, as the stored report also did | communication **meets_bar → strong** |

**All five read for false statements.** Every figure was recomputed by hand: $600 = $30 × 20 at 5% churn; $1,400 =
$600 + 20% × $4,000; $1,500 = $50 × 20 + $800 − $300; $2.32M = 400 × $2,800 + 800 × $1,500; $2.08M = 350 × $2,800 +
1,000 × $1,100; the +$240k and +$0.24M that follow; 2.0x = $600/$300 and 3.3x = $1,000/$300; 16 = 58 − 42 and 4.2 =
25% × 42 × 40%; 23.2 = 58 × 40%; ~24% = 94/76 − 1; 500,000 × 3 bags × $1.50 − $1.5M = $0.75M; 6.0M ÷ 3.0M = 2 bags;
−$0.2M + $5.4M ≈ $5.2M. **0 false statements.** One loose sentence, worth flagging but not false: quillpath p24's
"When asked twice whether the structure was MECE, the candidate skipped the structure and jumped to a recommendation
with no data" — the first ask (t2) was the MECE question and he did skip it, but the second (t4) was "what might be
missing from it?" and he named two gaps, grudgingly. The stored report's version of the same point ("dismissed the
question and jumped to a recommendation") is no better.

### 15.5 The gate

| line | result |
|---|---|
| 0 new false corrections, false refusals or missed real errors across b28–b38 with `*=phase1` | **met, and vacuously so: the replay is byte-identical to the pre-item-4 arm.** 505 checker flag events, **0 changed**; **0 changed interviewer turns** across all 31 slices (both arms). Only `lib/scoring` changed, and the runner replay never calls it. |
| correct-behaviour records 95/95 both arms | **met. 95/95 with `*=phase1` and 95/95 with the switches off.** Fault records 78/154 on and 48/155 off — identical to the 26 Oct gate; 0 records moved into a skip class against `r2-ctl-p1` / `r2-ctl-off`; `run_missing` 0. |
| prof-001 identical with the switches off | **met, and all 31 slices are**, plus the 5 batch-39 slices (147 flag events, 0 changed). |
| `scripts/fact-check.ts` with `env -u ENGINE_SWITCHES` | **F1 0 · F2-next 97 · F2-rec 11 · F3 0 · F4 0** over the 31 slices — the same as the 26 Oct gate. (Six slices read one lower than the arms recorded by `proof-combined.sh`, which runs `fact-check` with `ENGINE_SWITCHES` still set; re-running the control with the clean env reproduces the new numbers exactly, so it is the env artifact §16's 26 Oct entry already warns about, not a change.) |
| suite / types / lint | `npx vitest run` **5,844 passed / 9 skipped**, `npx tsc --noEmit` clean, `npx eslint lib app components tests scripts db` clean — at each commit. |

Replay labels, all under `CaseTester-proof-out/`: `nw3-ctl` + `nw3-b39-ctl` (control at `78e87324`), `nw3-vb` /
`nw3-va` + `nw3-b39-vb` / `nw3-b39-va` (the two narrow-W3 readings), `nw3-gate` + `nw3-gate-b39` (HEAD),
`fault-bank-nw3-vb-p1`, `fault-bank-nw3-va-p1`, `fault-bank-nw3-gate-p1`, `fault-bank-nw3-gate-off`. Nothing written
inside the corpus; nothing under `Case Interview Runs/` staged.

### 15.6 Judgement calls, with the cost if wrong

1. **Narrow W3 was measured in both readings of the ruling, and both were rejected on the same bar.** The strict
   reading is the one the words most support ("not through `lineageOf`"); the literal one ("the claim's own quantity")
   is the one that reintroduces the documented harm. Neither meets "0 newly missed real errors". **Cost if wrong:** if
   he meant a third reading, the two stale corrections of the usual 25 stay. Everything needed to re-measure is in
   §15.2; the prototype is one `foldTurn` line and one `lineageMoved` filter.
2. **The mandate's cap picks code's escalations first, then the latest turns.** The ruling gives the cap but not the
   order. A bottom-line error sits at the end of a case, and code's escalation is by definition the recommendation's
   own figure. **Cost if wrong:** with more than three open conclusion-changing claims, an early one is dropped in
   favour of a late one; one `sort` comparator changes it.
3. **The enforcement is placed between reconciliation and the stage caps, rather than changing the three passes.**
   That is the only position where all three conflicts resolve at once without loosening any of their rules, and it
   keeps the audit's fabrication guard exactly as strict for everything else. **Cost if wrong:** a mandated item is
   not seen by the verifier or by reconciliation, so a badly worded one is never rewritten — but its wording is
   code's, from the claim's own span and figure.
4. **A mandated claim must be OPEN, which includes "no later redo the report already credits".** A claim the
   candidate redid right is not one only the report can name. **Cost if wrong:** a bottom line they fixed late is not
   forced into the report; the redo is still in the section's own text for the judge to use.
5. **`eb8d7576` is the run I dropped from §13.3's five.** Reasoning in §15.4. **Cost if wrong:** one fewer b37
   pricing-001 report read; it would cost about $0.52 to add.
6. **The never-scored relaxation is a one-run list in code, not a `--force` flag.** A flag would be used again.
   **Cost if wrong:** the next unscored run needs a one-line edit.
7. **I did not re-run the three rejected widenings of §10.** His ruling rejected them as prototyped; re-measuring
   would have cost nothing but would have answered a question already closed.
8. **Another session committed `1438b089` (docs only, `next-speech-normalization.md`) to this branch mid-round**, so
   it sits between my two commits. I left it alone. **Cost if wrong:** none that I can see, but the branch is shared —
   worth knowing before anyone rebases.
