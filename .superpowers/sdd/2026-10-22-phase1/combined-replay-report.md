# The combined cross-stream replay — gate condition 2 (26 Oct 2026)

**Verdict: gate condition 2 is MET.** Across b28–b38 (31 slices, 230 runs, 3,125 interviewer turns) with every
Phase 1 switch on: **0 new false refusals, 0 new wrong releases, 0 new false corrections.** Every changed data
turn, probe and correction against the contract base was read by hand — no sampling was needed on the turns that
carry content (see §2 for the exact coverage claim).

**Gate condition 3 (prof-001 identical with switches off) is still NOT met**, for the one known reason: the
ungated base fix moves b33 Jasmine's correction from t18 to t16. Nothing else on prof-001 moves with the switches
off. That is Lorenzo's open question 1, unchanged by this run.

**$0 spent.** Free replays only; no live model call, no DB write, nothing added under `Case Interview Runs/`,
nothing pushed. Branch `phase1` at `e3db556f`, worktree clean, engine code untouched.

---

## 1. Method

| | |
|---|---|
| Code under test | `phase1` worktree at `e3db556f` (every stream merged), clean tree |
| Base | `phase1-s4a-base` / `phase1-s3-base` — the contract commit `0f932c89`, no switches. The two labels are **byte-identical on all 230 run files**, which is what makes `phase1-s3-base` usable as the base here: it also carries base-code `fact-*.txt`, which `phase1-s4a-base` does not. |
| Arm (a) | `phase1-combined-off` — no `ENGINE_SWITCHES` |
| Arm (b) | `phase1-combined-on` — `ENGINE_SWITCHES='*=phase1'` (22 switches; `refusalNounCheck` and `recommendationOpensGate` are in `NON_PRESET_SWITCHES` and were **not** named) |
| Slices | the 21 standard ones + b36a, b36l, b37h, b37q (off and on) + b38l (off and on) = 31 |
| Root | `REPLAY_ROOT=/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs` |
| Output | `CaseTester-proof-out/phase1-combined-{off,on}/`, tools in `CaseTester-proof-out/phase1-combined-tools/` |
| Runtime | 37 s and 36 s. No slice failed; no run present on one side only, in either arm. |

Tooling: `proof-combined.sh` (round-6 `proof.sh` + b38l + a `switches.txt` provenance record + the `fact-check`
loop), round 6's `compare.py` and `datadiff.py`, and one new script, `classify2.py`.

**`classify2.py` exists because the stream tools' dedupe loses turns.** `linediff.py` and the first cut of my own
dedupe key a changed line by `(batch, persona, run, turnIndex)`, collapsing a batch's `-off` and `-on` slices.
Those are two different engine runs (the checker is mocked on in one), so when a turn changed in `b35q-on` and not
in `b35q-off`, whichever file the glob read last won: my first pass reported 9 changed turns for the off arm where
the true number is 11. `classify2.py` keys by the **full slice** and only merges entries whose before/after text is
identical. Anyone reusing `linediff.py`/`dedupe.py` should know this.

**Turn numbering** is the contract's: `tN` is the interviewer reply to the candidate message at
`turnIndex = N − 1`, i.e. the interviewer `turnIndex` printed by `compare.py`.

---

## 2. What was read, and what was counted

The on arm changes **1,306 interviewer lines** across the 31 slices. Keyed by (slice, run, turn, text) that is
**801 distinct entries**. They partition exactly:

| Class | Entries | Raw lines | How it was established |
|---|---|---|---|
| Acknowledgment-pool rotations (`ackRotation`, 4.10) | 620 | 1,057 | **Complete census of the substitutions, not a sample.** Every one of the 620 differs only in sentences drawn from the pool `{Understood. / Got it. / Mm-hm. / I see. / Right. / Okay.}`; there are **14 distinct substitutions** in all, enumerated and each inspected. No figure, no data decision, no question changes. |
| `close_wait` follow-up / stage-question swaps (4.8 `closeWaitMitigation`) | 56 | 56 | Same: **13 distinct substitutions**, all between the mitigation / first-step / measure question pools, all figure-free, 0 data decisions. |
| Content changes | 116 | 184 | **Every one read individually**, with the candidate's ask, the data decisions and the ledger values. |
| Identical to the off arm (the ungated base fixes) | 5 | 5 | Read; §3. |
| Changed in both arms, differently (ungated × switch) | 4 | 4 | Read; §6. |

So: of the turns that can carry a refusal, a release or a correction, **I read 100%** — all 125 (116 + 5 + 4) of
them. The 676 pool rotations I did not read line by line; I read the complete set of 27 sentence substitutions that
produce them, which covers every way those 676 lines differ. Nothing was sampled blind.

Independently, `datadiff.py` lists **143 changed data-turn rows → 75 distinct turns** whose data decisions or data
line moved. All 75 are inside the 116 read above.

---

## 3. Arm (a): switches off

**227 of 230 run files are byte-identical to the contract base.** The three that differ are exactly the runs the
ungated fixes touch.

| | off arm vs base |
|---|---|
| Changed interviewer lines | **11**, in 3 slice runs: b33-on 2, b35q-on 3, b37q-on 6 |
| Changed checker decisions | **47**: b31-on 1, b33-on 2, b34l-on 1, b35q-on 17, b37q-on 26 |
| Changed **data** turns | **0** on all 31 slices |
| New / changed check asks | **0**; Haiku ask-check calls 258 → 258 |
| `fact-check` F1/F2-next/F2-rec/F3/F4 | **identical on all 31 slices** |

Confirmed as the deliberate ungated changes, and nothing else:

1. **Scale fix in `codeCorrection`** — b35q Tyler `ee99bd82` t30: `"…is about $0.24k, not $210k."` →
   `"…is about $0.24 million, not $210k."` The non-USD extension is not exercised: no case in b22l/b28–b38 quotes
   a non-USD figure, so it has no corpus evidence either way.
2. **A pending correction rides any stage turn code writes** — b33 Jasmine `5cfdf48e` (prof-001): the 19.2%
   break-even correction moves t18 → t16, onto the coverage-made recommendation ask. Said exactly once either way.
   b35q Tyler t24 gains the `150` correction; b37q Raj t24 gains the `$600, not $405` correction before the exhibit
   (that one is the fault itself).
3. **An overdue stage turn holds the probe** — b31 Blake t21 and b34l Marisol t26 record `undelivered`/held rows
   instead of dropping the probe (bookkeeping only, no spoken line); b35q and b37q re-order their probe chains.

One consequence of (2) and (3) worth re-stating because it recurs in the on arm (§7.4): in b35q Tyler the probe
budget (`WRAP_UP_PROBES = 2`) spends a slot the `$600, not $405` correction had, so that correction ends
`unresolved_at_close` in the off arm and goes to the written report. The base-fixes report called this the only
debatable consequence of fix 1; it is unchanged here.

---

## 4. Arm (b): `*=phase1` — the data decisions

Read from every turn's `data_decisions` row across all 31 slices.

| | base → `*=phase1` |
|---|---|
| **Refusals the base did not say** | **0** |
| Base refusals that are gone | 2 — both the graded **FALSE** refusals: b38l Tyler `cee7d399` t2, b38l Jasmine `3f928012` t4 |
| **Releases the base did not make** | 33 turns — **every one answers the ask declared on that turn** (below) |
| Releases the base made that are now withheld | 5, all accounted for (below) |
| **Corrections the base did not say** | 6 turns — **all six verified true against the ledger** (§5) |
| Checker corrections the base said that are gone | 3 (§5) |
| `fact-check` F1 (interviewer false fact) | 0 → **0** on all 31 slices |
| `fact-check` F3 (false refusal) / F4 (undelivered claim) | 0 → **0** on all 31 slices |
| Haiku ask-check calls | 258 → **252** (fewer); 3 slices gain 1 new check ask each; no live model call added |

### 4.1 The 33 new releases

**23 are the must-reach releases Lorenzo approved** (`mustReachPhase1`), firing exactly where they were specified:

- `competitor_costs` before exhibit-3 on prof-002/Larkspur — 6 turns: b22l Marcus `27c2d0fb` t20, b22l Tyler
  `38014721` t16, b32 Raj `b17c59e1` t18, b32 Jasmine `5fa81cec` t12, b36l Jasmine `bbf78ab8` t10,
  b38l Marisol `f80d981c` t14.
- `cannibalization` and `retailer_support` before the recommendation on launch-001/Hollis Bay — 9 turns:
  b35h t18/t22/t24/t26 (Raj, Marcus, Marisol) + `52951de8` t22 (both items), b37h `ddbb070b` t22,
  `527217df` t18, `7f6c40ea` t28, `442e37ff` t18.
- `why_pro_fell` before the recommendation on pricing-001/Quillpath — 8 turns: b35q t20/t24/t26/t28 and
  b37q t24/t24/t26/t28.

**10 come from the cover / want-cue / deferral-closing paths.** Each was checked against the model's declared
`requests` for that turn and against the candidate's own sentence:

| Run · turn | Items | Why it answers the ask |
|---|---|---|
| b22l Raj `43fa5038` t14 | `extras_revenue` | closes his own t8 deferral ("revenue split into ticket and ancillary revenue") |
| b28 Blake `32f0a72b` t12 (prof-001) | `bean_price_change`, `bean_share_of_cogs`, `non_bean_input_change` | he named them: "what I'd confirm … the split of COGS by input, so I can see whether beans or dairy moved". The base only *offered* them ("I can share … if you'd like"); 4.6's want cue reads the ask and code releases |
| b28 Owen `4e94b924` t10 (prof-001) | `avg_ticket`, `revenue_total` | "I'd want … transaction volume and average ticket, so I can model what a given price increase does to the top line" |
| b32 Raj `b17c59e1` t10 | `op_profit_definition` | the model's own `requests` row for "the cost breakdown by line item" lists `fixed_costs, unit_costs, op_profit_definition`; the released line enumerates the cost lines and carries no figure |
| b34a Raj `14055867` t12 | `current_treatment` | the model declared the ask "the competitive set and the current US standard of care"; `covers_added` attaches `current_treatment` to that same ask (Stream 2 cover data) |
| b35h Marisol `a14ca044` t10 | `longer_term_goals` | the model declared "Hollis Bay's goals beyond year one, including year-two marketing and line costs" → `longer_term_goals`. **The loosest of the 33** — see §7.7 |
| b36a Tyler `34eb553a` t10 | `current_treatment` | he asked for "the competitive set … standard of care … competitor shares" |
| b36a Tyler `34eb553a` t12 | `insurance_coverage` | closes the one-turn deferral the same switch set created at t10 (§6.4) |
| b38l Tyler `cee7d399` t4 | `routes_schedule` | the t1 ask "the split of the revenue decline between passengers and average fare" — same flights, same planes: Lorenzo's 13 Oct ruling answers it with this line |
| b38l Jasmine `3f928012` t12 | `extras_revenue` | her t3 ask, through the open-request path |

**No new release carries a figure the candidate had not asked about, and none answers a different question from the
one on the turn. 0 new wrong releases.**

### 4.2 The 5 withheld releases

| Run · turn | Item | Reading |
|---|---|---|
| b22l Tyler `38014721` t18 | `competitor_costs` | already released at t16 by must-reach; the turn now says "I gave you the competitor's costs and fares a moment ago" (4.1). Neutral |
| b35h Raj `01b805d6` t26 | `cannibalization` | released earlier at t18 by must-reach. Neutral — and this is the benign `b35h-raj-t26-cannibalization` bank record whose window needs widening |
| b36a Tyler `34eb553a` t10 | `insurance_coverage` | deferred one turn, delivered at t12. Neutral (§6.4) |
| b34l Marisol `e6432db0` t30 | `unit_costs` | Stream 4a's known F4 behaviour: silently gated, ids recorded; the turn answers his cost-disadvantage ask from the exhibit's own variable-cost breakdown instead. Neutral |
| b38l Jasmine `3f928012` t4 | `port_avery_per_flight` | Stream 4a's known **fixed fault**: the coarse partial the batch-38 grading itself left uncounted; she gets the ask she actually made, at t12 |

---

## 5. Arm (b): the corrections

### 5.1 Six new corrections, all true

Five fire through `misquoteFlat` (3.4), one only exists because Stream 2's `misquoteAnchors` lets code *detect* the
quote (§6.1). For each: the candidate's cited figure, the ledger value, and the correction spoken.

| Run · turn | Candidate said | Ledger holds | Correction spoken | Verdict |
|---|---|---|---|---|
| b38l Tyler `cee7d399` t8 | "fixed costs were $21M in both years" | `fixed_costs` = $20.0M | "To correct one figure: fixed costs … were $20.0M in both FY2023 and FY2025." | **fixed graded fault** |
| b34l Tyler `51ad0cb8` t8 | "At 14,500 flights × 80 seats = 1.16M seats." | `network_totals` = 14,000 flights | "To correct one figure: across all six routes … on 14,000 flights a year…" | **fixed graded fault** |
| b36l Tyler `4e91d638` t8 | "Port Avery revenue fell from about $44 million to $32.4 million" | `route_results_port_avery` = $46.8M → $32.4M | "To correct one figure: on Hub–Port Avery, revenue fell from $46.8M to $32.4M…" | **fixed graded fault** |
| b37h Tyler `442e37ff` t8 | "ingredients you said $0.75" (total $1.55/bag) | `variable_costs` ingredients $0.70 (total $1.50) | "To correct one figure: variable costs per bag are $0.70 for ingredients…" | **fixed graded fault** |
| b32 Tyler `51b8cc22` t28 | "Port Avery revenue went from $46.8M to $33.6M" | $32.4M | "A correction on one figure: on Hub–Port Avery, revenue fell from $46.8M to $32.4M…" | **fixed graded fault**, with two residuals (§7.2) |
| b38l Tyler `cee7d399` t32 | "Westhaven's $3.6M of contribution" | `route_results_other` Westhaven = $3.8M | "A correction on one figure: on the other four routes … Hub–Westhaven … $3.8M of contribution." | **fixed graded fault**, with a residual (§7.3) |

In every case the checker had rated the span `error`/high, and the line code wrote is the ledger's own text.
**0 new false corrections.**

### 5.2 Three checker corrections the base said and the arm does not

| Run | Line | Reading |
|---|---|---|
| b38l Marisol `f80d981c` | "The annual operating-profit improvement … is about $11.8M, not $15.8M." | `staleProbeDrop`: *"step:network_improvement restated at 11.8 (message 21) since message 15"* — **she had already restated the right figure**. Correcting her would have been a correction of something she no longer said. **Fixed fault.** |
| b35q Tyler `ee99bd82` | "Extra value per month … is about $0.24k, not $210k." | replaced by a probe of that derived figure, while the **root** correction ("Starter standalone lifetime value at $40 is about $600, not $405") is now spoken at t27 — in the off arm that root correction is lost instead. `rootLineage` working as specified. **Neutral, arguably better.** |
| b35q Marisol `087451cb` | "Starter standalone LTV/CAC is about 2 times." | traded for a probe and ends `unresolved_at_close` ("time up"). **A loss** — §7.4 |

### 5.3 Twelve stale drops, each with the candidate's own withdrawal

`staleProbeDrop` dropped 12 probes/corrections. Every one names the message where the candidate withdrew or
restated the figure, so none is a dropped live error:

| Run · turn | Reason recorded |
|---|---|
| b28 Marisol `3172597b` t26 | 17 withdrawn at message 23 ("not 17%") |
| b29 Marcus `51056656` t12 | `pricing:new_margin@10` restated at 14.5 (message 7) |
| b31 Jordan `1c8ef4cb` t22 | 5 withdrawn at message 19 ("not 5") |
| b31 Tyler `9443bf5f` t10 | 61 withdrawn at message 9 ("not 61%") — the dropped line is the base's "COGS is 58% … up from 42%" |
| b31 Marisol `07e9f231` t16 | 18 withdrawn at message 15 ("not 18") |
| b33 Tyler `0150f744` t18 | 19 withdrawn at message 17 ("not 19%") — **prof-001**, §8 |
| b35q Marisol `087451cb` t14, t26 | built on 1200, withdrawn at message 13; 30 withdrawn at message 25 |
| b35q Tyler `ee99bd82` t28 | `step:starter_ltv` restated at 405 (message 25) |
| b37q Marisol `084e7508` t14 | 22.5 withdrawn at message 11 |
| b38l Marisol `f80d981c` t14, t24 | built on 9000, withdrawn at message 13; `step:network_improvement` restated at 11.8 |

### 5.4 Fourteen probe-guard replacements

`probeGuardMethod` (3.5) changed the guard's replacement question on **14 distinct turns (26 lines)**. All 14 new
replacements are figure-free, which is the rule: "How did you get to $80?" → "Those figures — what do they tell
you?" (b35q Tyler t6); "How did you get to $9.0M?" → "How do you read those numbers?" (b37h Tyler t6);
"How did you get to 24?" → "What do you take from those numbers?" (b38l Marisol t10); "You computed $1,800
positive per Port Avery flight using $9,000 variable cost…" → "Walk me through how you worked that out."
(b38l Marisol t16); and nine more of the same shape. One further replacement changed in the record only
(b36a Raj `3fdb20e8` t4) and is never spoken.

---

## 6. Interactions — changes that appear only with two switches on

This is why the combined run exists. Five interactions, none harmful, all worth knowing.

### 6.1 Stream 2 `misquoteAnchors` × Stream 3's misquote correction — b36l Tyler `4e91d638` t8
In the base, `misquote.found` on the triggering turn is **empty**: code cannot see "fell from about $44 million" as
a quote of `route_results_port_avery`. With the overlay's anchors attached it does, the checker's existing flag on
"44" then carries, and the normal correction path (not `misquoteFlat`) speaks the ledger line. **Neither Stream 2's
nor Stream 3's own arm produces this correction.** It is correct, and it is the sixth of §5.1.

### 6.2 Stream 2 `itemCovers` × stage ordering — b28 Blake `32f0a72b` t16 and t18 (prof-001)
With covers attached, the analysis stage counts as covered, so code stops imposing its stage question and the
model's own line is spoken: at t16 "What's driving the margin drop, and what would you need to know to pin it
down?" becomes the model's probe "You said a 10% price rise takes margin from 6 to roughly 11. Which cost lines
did you restate on the higher revenue base to get that?" (his claim, verbatim, from the previous message), and at
t18 "Let's hold the recommendation for now: what's driving the margin drop…" becomes "Pull it together — what's
your recommendation to the CEO?" (`turn_kind` moves `stage_analysis` → `rec_ask`). An improvement: the base was
re-asking a diagnosis Blake had already given at length. Neither stream saw it alone.

### 6.3 The ungated base fixes × `rootLineage` / `staleProbeDrop` — 4 turns changed differently in the two arms
These are the only turns where base, off arm and on arm are three different lines:

| Turn | base | off arm | `*=phase1` |
|---|---|---|---|
| b35q Tyler `ee99bd82` t28 | "$0.24k, not $210k…" | "Before we wrap up — show me how you got to 676." | "Starter standalone lifetime value at $40 is about $600, not $405…" |
| b35q Tyler t30 | "$600, not $405…" | "$0.24 million, not $210k…" | "Before we wrap up — you put it at '$210k' — can you show me that calculation step by step?" |
| b37q Raj `e08c362a` t30 | probe on "$905 × 1,000 = $905k" | probe on "$940k" | probe on "$940k" (ack differs only) |
| b37q Raj t36 | "$600, not $405" + the 13.5-month probe | probe on "$905,000 a month" | "What's driving your confidence there?" — the lineage's probe budget is spent, the root was corrected at t24 |

Net: in b35q Tyler the **on arm speaks the root correction the off arm loses**; in b37q Raj the on arm spends one
fewer probe. No new statement is false in any of the three worlds.

### 6.4 Stream 2 covers × 4.3 `haikuTagGate` — b36a Tyler `34eb553a` t10 / t12
He asks about payer access. The base releases `insurance_coverage` at t10. With the switches on, the tag gate
**defers** it ("Let's hold payer access and prior approval for a little later") and instead releases
`current_treatment`, which covers his standard-of-care ask; `insurance_coverage` then arrives at t12 ("On what you
asked about earlier: US insurers usually require prior approval…"). One turn's delay on data he asked for, fully
resolved. Neutral, but it is the clearest case of 4.3's "a mismatch defers" costing a turn, and only the
combination produces it.

### 6.5 `mustReachPhase1` × 4.1 `restateRules` — b22l Tyler `38014721` t16 / t18
Must-reach releases `competitor_costs` at t16 (before exhibit-3). His t18 question then asks for exactly that, and
4.1 answers with a named restatement — "I gave you the competitor's costs and fares a moment ago" — rather than
re-reading the line. Correct, and only visible with both switches on.

---

## 7. Residuals and judgement calls — nothing that fails the gate, all for Lorenzo

1. **A bare "Go on." as the entire interviewer turn, in three places.** b32 Marcus `eb170e49` t32 and
   b37q Marcus `eb8d7576` t32 (4.9 narrow: the time warning skips a fresh recommendation ask, and nothing else
   remains in the model's saved turn), and b33 Tyler `0150f744` t18 (the stale probe is dropped and the model's
   turn was only that probe). In a live run the model writes its own sentence, so this is partly a replay artefact
   — the same artefact already keeps `b34a-tyler-t30-close` failing in the bank. Worth naming because it is now
   three turns, not one.
2. **`misquoteFlat` can repeat a correction verbatim, and can cost the close.** b32 Tyler `51b8cc22`: the Port
   Avery line was already corrected at **t12**; he re-misquotes it at t27 and the arm speaks the *identical*
   correction again at t28. Re-correcting a repeated error is defensible, but (a) the turn's `misquote` check
   records `alreadyCorrected: [route_results_port_avery]` and the "said once" guard does not cover this path, and
   (b) spending t28 on it pushes the mitigation question to t30, so the run never reaches its closing line inside
   the recorded turns (base: t30 is "That's everything I wanted to cover…"; arm: t30 is the measure question).
3. **A flat correction can land on the closing turn, unanswerable.** b38l Tyler `cee7d399` t32 prepends a ~70-word
   read-out of the whole four-route block to the closing line, to fix one figure ($3.8M against his $3.6M) — and
   the line never names which figure was wrong. The case then ends; he cannot revise. Correct data, poor delivery.
4. **The correction-for-probe trade now has a second instance.** b35q Marisol `087451cb` loses
   "Starter standalone LTV/CAC is about 2 times" to `unresolved_at_close` because `WRAP_UP_PROBES = 2` and the
   stale drops freed two probe slots that the probes took. The base-fixes report flagged this shape on b35q Tyler
   as "the only debatable consequence of fix 1"; with the switches on it happens in a second run. If the trade is
   wrong, the cap is the lever, not the switches.
5. **`fact-check` run inside an "on" arm is not the same instrument as the base's.** `prove.sh` /
   `proof-s4a.sh` / my `proof-combined.sh` all run `scripts/fact-check.ts` with `ENGINE_SWITCHES` still in the
   environment, and the overlay's `misquoteAnchors` makes `findCandidateMisquotes` **detect more** candidate
   misquotes. Those files show b37h F2-next 0 → 2 and b37q 2 → 3 — which reads as a regression and is not one:
   re-running the detector with the switches off over the *same* transcripts gives 0 and 2, i.e. unchanged from
   base. §9 reports both. Any future arm comparison should pin the detector.
6. **`b35h` Marisol `a14ca044` t10 is the loosest release of the 33.** The model declared the ask as "Hollis Bay's
   goals beyond year one, including year-two marketing and line costs" and code released `longer_term_goals`
   ("Hollis Bay's hope is that the line becomes a growth platform…"). It answers the declared ask; it does not
   answer what she actually wanted (year-two marketing spend), for which **no ledger item exists** — so the only
   alternative was a refusal. Classified neutral, flagged because it is a judgement call.
7. **b33 Blake `cb23e17b` t6**: the base's unsolicited offer ("I can share labor as a percent of revenue … if
   you'd like") disappears entirely. He never asked for it, so this is not a withholding; it is 4.1/4.3 removing an
   unsolicited offer. Neutral, noted because it is the mirror image of b28 Blake t12, where an offer became a
   release.

---

## 8. prof-001 (Brew & Bean — b28, b29, b30, b31, b33)

### With the switches off
**Only the ungated base fixes move, and only on two slices:**

| Slice | decisions changed | lines changed |
|---|---|---|
| b28-off/on, b29-off/on, b30-off/on, b31-off | 0 | 0 |
| b31-on | 1 (a held `undelivered` row, Blake `47fa8cfd` t21) | **0** |
| b33-on | 2 | **2** — Jasmine `5cfdf48e`: the 19.2% break-even correction moves **t18 → t16**, onto the coverage-made recommendation ask. Said exactly once in both arms. |

`fact-check` is identical on every prof-001 slice. **Nothing else on prof-001 changes with the switches off** —
no data turn, no release, no refusal, no check ask. Gate condition 3 therefore fails only on that one line, which
is Lorenzo's open question 1.

### With `*=phase1`
289 distinct changed entries on prof-001: **247 acknowledgment rotations**, **26 close_wait/stage-question swaps**,
and **16 content changes** (13 distinct turns), every one read:

| Run · turn | Change | Class |
|---|---|---|
| b28 Blake `32f0a72b` t12 | three offered items become released, answering the data he named | **fixed graded fault** (4.6 + 4.2) |
| b28 Blake t16, t18 | code's stage question gives way to the model's own probe; the recommendation ask arrives at t18 | **neutral/improvement** (§6.2) |
| b28 Owen `4e94b924` t10 | `avg_ticket` + `revenue_total` released on his named want | **fixed graded fault** |
| b30 Omar `83ed9d40` t6 | the same three COGS figures, re-ordered | **neutral** |
| b30 Caleb `990fc873` t10 | the average-transaction restatement becomes "I gave you the average transaction value a moment ago" | **neutral** (4.1) |
| b31 Tyler `9443bf5f` t10 | the "COGS is 58% … up from 42%" correction is dropped — he withdrew the 61% it corrected, at message 9 | **fixed graded fault** (3.2) |
| b31 Marisol `07e9f231` t18 | the wrap-up probe re-quotes her *newer* sentence instead of the 14%/18-point one she withdrew | **fixed graded fault** (3.2) |
| b33 Sofia `f86f6530` t10, b33 Marisol `31e33506` t10, t14 | the probe guard's replacement asks about method | **neutral** (3.5) |
| b33 Tyler `0150f744` t18 | the "19%" probe is dropped — he had corrected himself to 15% in the message before — leaving a bare "Go on." | **fixed graded fault**, with §7.1's residual |
| b33 Blake `cb23e17b` t6 | the unsolicited labor offer disappears | **neutral** (§7.7) |
| b33 Jasmine `5cfdf48e` t16, t18 | the ungated t18 → t16 move | **ungated**, as §3 |

**On prof-001 with every switch on: 0 new refusals, 0 new releases that miss their ask, 0 new corrections,
0 corrections or probes dropped while the claim still stood, F1/F3/F4 = 0, and 5 graded faults fixed.** The two
drops (b31 Tyler t10, b33 Tyler t18) each name the candidate's own withdrawal in the record.

---

## 9. `fact-check` counts per slice, both arms, against base

Same instrument throughout (the detector run with no `ENGINE_SWITCHES`), so the only variable is the transcript.
Format F1 / F2-next / F2-rec / F3 / F4.

| slice | base | arm (a) off | arm (b) `*=phase1` |
|---|---|---|---|
| b38l-off | 0/8/0/0/0 | 0/8/0/0/0 | 0/**7**/0/0/0 |
| b38l-on | 0/9/0/0/0 | 0/9/0/0/0 | 0/**7**/0/0/0 |
| b28-off / b28-on | 0/4/1/0/0 | 0/4/1/0/0 | 0/4/1/0/0 |
| b29-off / b29-on | 0/4/1/0/0 | 0/4/1/0/0 | 0/4/1/0/0 |
| b30-off / b30-on | 0/1/0/0/0 | 0/1/0/0/0 | 0/1/0/0/0 |
| b31-off | 0/3/0/0/0 | 0/3/0/0/0 | 0/3/0/0/0 |
| b31-on | 0/2/0/0/0 | 0/2/0/0/0 | 0/2/0/0/0 |
| b32-off / b32-on | 0/7/1/0/0 | 0/7/1/0/0 | 0/7/1/0/0 |
| b33-off / b33-on | 0/2/0/0/0 | 0/2/0/0/0 | 0/2/0/0/0 |
| b22l-off | 0/6/1/0/0 | 0/6/1/0/0 | 0/6/1/0/0 |
| b34a-off / b34a-on | 0/1/1/0/0 | 0/1/1/0/0 | 0/1/1/0/0 |
| b34l-off | 0/9/0/0/0 | 0/9/0/0/0 | 0/9/0/0/0 |
| b34l-on | 0/9/0/0/0 | 0/9/0/0/0 | 0/**8**/0/0/0 |
| b35h-off / b35h-on | 0/2/0/0/0 | 0/2/0/0/0 | 0/2/0/0/0 |
| b35q-off / b35q-on | 0/3/0/0/0 | 0/3/0/0/0 | 0/3/0/0/0 |
| b36a-off / b36a-on | 0/1/0/0/0 | 0/1/0/0/0 | 0/1/0/0/0 |
| b36l-off / b36l-on | 0/2/0/0/0 | 0/2/0/0/0 | 0/2/0/0/0 |
| b37h-off / b37h-on | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 |
| b37q-off / b37q-on | 0/2/1/0/0 | 0/2/1/0/0 | 0/2/1/0/0 |

**F1 = 0, F3 = 0, F4 = 0 on all 31 slices in all three worlds.** F2-next (a candidate misquote left uncorrected
next turn) is identical on 28 slices and **lower on 3**; no slice is higher. F2-rec is identical everywhere.
The switched-detector files (`phase1-combined-on/fact-*.txt`) additionally read b37h 0 → 2 and b37q 2 → 3 on
F2-next; that is the §7.5 instrument artefact, and the neutral-detector copies are in
`phase1-combined-on/factbase/`.

---

## 10. The per-stream claims, reconciled

| Claim | Combined measurement | Reading |
|---|---|---|
| **Stream 3**: 10 lines, 0 new false corrections | the 12 stale drops and the root-lineage re-ordering all appear; **0 new false corrections** confirmed over the whole corpus | **confirmed** |
| **misquoteFlat**: 6 lines | 5 corrections whose `code_gate` reason names `misquoteFlat`, plus 1 more (b36l Tyler t8) that only the Stream 2 anchors make detectable = **6 correction turns** | **confirmed**, with §6.1 as the new attribution |
| **probeGuardMethod**: 21 lines | **26 lines, 14 distinct turns** (+1 record-only) | **slightly more**, same character: the extra turns are b35q Tyler t16 (replacement → replacement) and one guard that fires only when the other switches re-order the run |
| **Stream 4a**: 29 lines, 0 new refusals, 2 new releases | **0 new refusals** confirmed corpus-wide; 4a's own two new releases (b38l Tyler t4 `routes_schedule`, b38l Jasmine t12 `extras_revenue`) both present and both answering their ask | **confirmed.** The other 31 release turns are Stream 2's must-reach and covers, which 4a measured only in its overlay arm (it reported 53 lines there) |
| **Stream 4b**: 1,176 lines, 0 changed decisions | **1,057 ack-rotation lines + 56 close_wait/stage swaps + 3 skipped rec re-asks = 1,116 lines of 4b character**, 0 changed data decisions among them | **consistent.** The ~60-line gap is turns where another switch also changed the line, so they are counted in the content class instead of the rotation class — not lines that stopped rotating |

---

## 11. Gate condition 2, stated plainly

> **2. No new false refusals, wrong releases or false corrections across b28–b38 with `*=phase1`. Every changed
> data or checker turn against the contract base is read by hand.**

**MET.**

- **New false refusals: 0.** No refusal anywhere in the 31 slices is new; two graded false refusals are gone.
- **New wrong releases: 0.** All 33 new release turns answer the ask declared on that turn; 23 are the approved
  must-reach releases. One (§7.6) is a judgement call, and is figure-free.
- **New false corrections: 0.** All six new corrections quote the ledger against a figure the candidate really
  mis-stated and the checker really rated an error. Three checker corrections disappear: one because the candidate
  had already restated the right value, one replaced by the root correction, one lost to the probe cap (§7.4).
- **Coverage: complete on the turns that can carry those three faults.** 125 of 125 content-changing entries read
  individually; the remaining 676 entries (1,113 raw lines) are pool rotations whose 27 distinct substitutions were
  enumerated and checked. Nothing was sampled blind.
- Deterministic backstops agree: **F1 = F3 = F4 = 0 on every slice in both arms**, and F2-next never rises.

What remains open is **condition 3** (prof-001's one ungated line) and the judgement calls in §7 — none of which
is a new false refusal, wrong release or false correction.

---

## 12. Artefacts

- `CaseTester-proof-out/phase1-combined-off/`, `…/phase1-combined-on/` (+ `…/phase1-combined-on/factbase/`, the
  neutral-detector `fact-*.txt`); each carries `switches.txt` with the env, HEAD and `git status`.
- `CaseTester-proof-out/compare-phase1-s3-base-vs-phase1-combined-{off,on}.md`
- `CaseTester-proof-out/datadiff-phase1-s3-base-vs-phase1-combined-{off,on}.{md,json}`
- `CaseTester-proof-out/c2-phase1-combined-{off,on}-{rest,ack}.json`, `final-switch-turns.json`,
  `final-interaction-turns.json`, `read-other.txt` (the 116 content changes as read)
- `CaseTester-proof-out/phase1-combined-tools/` — `proof-combined.sh`, `classify2.py`, and copies of round 6's
  `compare.py` / `datadiff.py` / `turns.py` / `linediff.py` / `dedupe.py`
