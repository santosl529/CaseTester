# Tester session aae091ff — investigation (29 Oct)

Brew & Bean (prof-001), voice, production config. Sources: `Case Interview Runs/voice-live/2026-10-29/` (transcript, db dump — the per-turn `check` events are keyed by the candidate message, n → interviewer n+1). Branch `tester-fixes` off f38d4ce2. Nothing built; $0.

## A. Who wrote t38–t56, and why nothing stopped it

**Every turn t36–t56 is a model turn** (`turn_kind` = `model` on all ten). No checker line (the math checker selected nothing; its one flag, on t55, landed after the session ended), no close hold (`waits`/`probed` empty), no stage hold (`owed: null`), no rec-math probe, no wrap-up probe (`wrap_up_cap` untouched, 2 left). Code's share of the chain: the voice stuck-acks on t44 / t50 ("Take your time.", "Sure, take a moment."), rung 2's guidance on t46 (the model wrote "Let's simplify…" from it), and t48 — the probe guard withheld the model's "ten percent of what" doubt (`unsupported_challenge_blocked`) and said `probe_method`'s "Walk me through how you worked that out."

**Root cause: the recommendation was never received.** The model asked for it (t34 — `asksForConclusion` true, `recommendationAsked` true, count 1). t35's answer — "I would choose... so, like, the price increases, we haven't increased our price in quite a while…" — matches none of `answersRecommendationAsk`'s patterns (COMMITS / ACTION_LEAD / FIRST_LEAD / LEVER_LEAD) nor `clearRecommendation` (and `recommendationOpensGate` is off). Verified by calling both on the text: both false. So `recommendationReceived` stayed false to the end, and with it:

- `closeDue` needs `recommendationReceived && recommendationAsked && riskAsked`, or `recommendationUnresolved` (ask count ≥ 2). The risk was asked (t36, by the model) and answered, but received was false; the model never re-asked, so the count stayed 1. **Nothing could close the case before time-up (20:00); the tester ended it at 14:27.**
- The stall ladder stays live (it stands down only once a recommendation is delivered), so the model kept "analysing" in RECOMMENDATION with no instruction to stop — and it spent the turns on sizing the price increase, the math the case never asked for before the recommendation.

**Why the stall ladder didn't stop the chain.** It counts *consecutive* no-progress replies (threshold 2), and any reply classified `analysis` resets the count: t39, t41 (vague but substantive), t47 "Ten percent." (a figure → analysis), t51, t55 all reset it. It fired once (rung 2 at t46 on t43 + t45), and RECOMMENDATION caps the ladder at rung 2 (`SYNTHESIS_RUNG_CAP`), so there was nothing left to escalate to. `synthesisUnresolved` (the close-without-recommendation path) needs two consecutive no-progress replies at the cap — the alternating answers never gave it two.

## B. t22–t26

**The two "I'm not sure" did count as a stall — that is what `hedge` is.** What happened:

- t21 (a substantive analysis) was **classified hedge** because `HEDGE_PATTERN` matches a bare `um`/`uh` anywhere in the message — on voice almost every answer has one. Count 1.
- t23 "I'm not sure." → count 2 → **rung 1 fired** (t24: code's restate, "Sure, take a moment. The question on the table: …"), firing on t21 + t23. The count resets to 0 after a rung ("give the rung a chance to land").
- t25 "I'm not sure. I don't know." → count 1 only: rung 2 needs one more. So t26 was a plain model turn with no rung guidance.
- t27 "What happened with prices?" is a data request (progress) → reset; the model then released menu prices (t28).

So the candidate's second consecutive "not sure" on the same question got a model turn, not help — the ladder treats rung 1 (re-asking) as the response to the first two, and its count restarts.

**t26 passed the undelivered-data check because there isn't one for words.** "Given what you now know about prices, what does that tell you about how the client responded…" — `menu_price_change` was revealed only at t28. The checks that exist: the number audit (FR-4: figures only — t26 has none), the assumption guard (`assumption-guard.ts`: only a sentence that *challenges an assumption* — "assum…", "haven't verified" — about an item the candidate requested), and the pending-data / restate guards (data lines). Nothing reads a model sentence that *presupposes* an unrevealed item's content.

## Proposed build (for your OK — four points need a ruling)

All behind new switches, off by default: `recLastQuestion` (A), `stuckRescue` (B1), `unrevealedPresupposition` (B2).

**A — `recLastQuestion`**
1. Code's rec-ask pools (`rec_ask`, `late_rec_ask`, `grace_ask`, `time_warning`) get versions that ask for the recommendation, its main risks and next steps in one question.
2. **Ruling needed (Q1):** when the *model* asks for the recommendation (as t34 did), code replaces its question with code's rec ask — otherwise the question doesn't ask for risks and next steps. I propose: yes, replace.
3. Received: under the switch, **any non-hedge, non-question, non-refusal reply to the rec ask is the recommendation** (the t35 miss is the root cause; the pattern lists will keep missing spoken phrasing). Then the next turn is the close: no `risk_ask`, `close_wait` (after_risk / first_step / measure), `rec_math_probe`, `rec_revision` / `rec_math_revision` / `analysis_revision`, wrap-up probes; the end gate opens on the received recommendation alone.
4. The risk stage: counted when the answer names a risk (the 16 Oct rule, reused); if it names none, the report says so; no follow-up.
5. Open errors at close go to the report's open-claims section — already the path (conclusion-mandate, 27 Oct); I'll add the rec-answer's checker verdict wait so a flag on the last answer isn't lost.
6. **Ruling needed (Q2): "any sizing the case needs is asked before the rec ask."** No case field says which math is needed: `mathSteps` has no must-ask flag, and prof-001's are all derivations the candidate may or may not do. Options: (a) a new optional case field `sizingAsk` (a question code puts before the rec ask, once, if the candidate hasn't sized it) — authored per case, none today; (b) only the no-math-after rule now, sizing-before later. I propose (b) now + (a) as a case-authoring follow-up.

**B1 — `stuckRescue`**
- Two consecutive no-progress replies to the same question → the existing rescue ladder's help (rung 2's narrowed question with a hint, or rung 3's release of the next item in sequence), not rung 1's re-ask; at most two questions on one point for a stuck candidate, then move on; the report notes it (a `stuck_moved_on` note into the scoring input).
- **Ruling needed (Q3):** the `um`/`uh` hedge rule. Fixing it is what keeps t21 from counting; leaving it means a voice candidate who says "um" twice in substantive answers gets a hint. I propose: under the switch, a filler word alone doesn't make a hedge when the message has a substantive sentence (≥ 8 words, not a hedge phrase).

**B2 — `unrevealedPresupposition`**
- A model sentence with a presupposition cue ("given what you now know about", "as you've seen", "with that in hand", "now that you have/know", "knowing that", "from what you've seen on") **and** a match against an unrevealed item's label or ask phrases → withheld, unless code releases that item in the same turn; the withheld question falls back as the probe guard's do.
- **Ruling needed (Q4):** cue-only sentences with no item match ("With that in hand, what's next?" when nothing new was released) — keep (my proposal: only item-matched sentences are withheld; cue-only ones are counted in the corpus report for you to judge).
- I'll report every hit over b39–b40 + the bank before you rule on over-blocking.

Gate as you set it; plus the three records (aae091ff t26, the t38–t56 chain — as a voice-session record, which the bank hasn't held before; I'll build it from the db dump).
