# Tester fixes — build and gate (29 Oct)

Branch `tester-fixes` off main f38d4ce2. Lorenzo's rulings on the investigation (`investigation.md`), built behind three
switches outside the presets: `recLastQuestion`, `stuckRescue`, `unrevealedPresupposition`. $0 — every number a free
replay or a local read. Nothing pushed or deployed; no DB write.

Arms: **prod** = `*=phase1,phase2,-asyncAskJudge` (Vercel production); **new** = prod + the three switches; **off** = no
ENGINE_SWITCHES. Replays: b39 + b40 (9 slices, 51 runs, 711 turns) with their recorded checker verdicts; the fault bank
(342 records); aae091ff as a voice replay with the agent's switches (`…,speechNormalization`).

## What was built

- **`recLastQuestion`.** Code's recommendation ask, the time warning and the grace ask ask for the recommendation, the
  main risks and the next steps in one question (pools `rec_ask_full`, `time_warning_full`, `grace_ask_full`, 5 versions
  each, seeded first pick). The model's own ask is replaced by code's after the existing holds (only once no owed stage
  holds it) — any question the stage record reads as the ask, its move label included. The first substantive reply since
  the ask is the recommendation (`substantiveReply`: not a clarifying question, "give me a minute", a repeat request, a
  hedge or a refusal to commit; those get the normal handling and the next substantive reply counts). The next turn is
  the close: no risk question, close wait, rec-math probe or revision. Open errors: `unresolved_at_close` → the report.
  The risk counts when the answer names one; otherwise the stage record says "asked within the recommendation question;
  the candidate's answer named no risk", no follow-up. Ruling 2: no math after the recommendation (the close is next);
  the per-case sizing question is logged in PRD §15.
- **`stuckRescue`.** Ruling 3, voice turns only: a filler word alone is no hedge when the answer has a substantive
  sentence. Typed turns are unchanged by construction — the corpus scan found 4 of 4,645 typed messages ("Hmm. …",
  batches 18–21) that the rule would have changed, so it reads `ctx.voice`. A stall gets the ladder's Level 2 (hint) or
  Level 3 (release), never Level 1's bare re-ask. Your addition: at most two questions per point (`stuck-point.ts`: questions
  sharing content words, the case prompt's own words aside) for a candidate who isn't converging (the reply made no
  progress or is under 8 words; never on a data request; the ladder's rung goes first). Then the model is told to move on,
  and a third question on the point is replaced by `move_on` + a phase question, logged `stuck_moved_on`, which the report's
  assists section reads.
- **`unrevealedPresupposition`.** Ruling 4, narrow: a cue ("given what you now know about", "now that you have", "with X in
  hand", "knowing that …") whose object best matches an unrevealed item's label or ask phrases is withheld, unless this
  turn hands that item over. An earlier reveal sharing the words does not clear it (t26's "prices" are the menu prices'
  as much as the bean prices'). Your addition, when it is the turn's only question: (a) stuck and the item next in the
  release order → released at the end of the data line, sentence kept; (b) otherwise the question on the table again.
  Cue-only sentences are counted (`presupposition_cue_only`), never withheld.

Fixes found on the way, before the gate numbers below: "a second increase" read as "give me a second" (b33 Owen t13 — the
moment/repeat test now reads the rest of the message); the point cap linked questions through the case prompt's words
(aae t30's brainstorm read as t26's point) and could replace a stage question (now never); model asks in other words
("do you recommend a US launch…") closed with no risk asked (now replaced — any ask the stage record reads); two ask
versions put the risks in an imperative after the question (now one question, as every reader of asks expects);
presupposition matching read "the menu price change" as the bean prices' (best match only, stem fix) and said "with
those input costs in hand" right after their release was a hit (a handover this turn clears it).

## Gate

| | result |
|---|---|
| Switches off and prod: branch vs main | **byte-identical text and decisions** on all 711 turns, both arms (only the ask check's `latencyMs` differs) |
| Correct records | off **95/95**, prod **95/95**; new **73/77** — see below |
| True refusals (shadow) | **18 pass + 1 n/a of 19** in prod and in new (unchanged) |
| F1 / F3 / F4 (b39–b40) | 0 / 0 / 0 in both arms |
| F2-next / F2-rec | 15 → 12 / 2 → 1 (the post-recommendation turns that held them are gone) |
| STAGE / CLOSE | 12 → 3 / 1 → 0 |
| New releases | **0** on b39–b40; aae091ff t26 releases `menu_price_change` (rule (a); right — it was t28's) |
| New turns with no question | **0** (non-close turns without a question: 56 → 46) |
| Fault records (gate condition 1) | prod 88/153 → new 74/132; 8 left the denominator, every one read by hand below |
| Records added | `v29-tester-t26-presupposes-menu-prices`, `v29-tester-t34-rec-ask-risks-next-steps`, `v29-tester-t36-close-after-rec` (the t34–t56 chain): all three fail on the recording (`check`: 342/342, 0 wrong), fail in prod, pass in new (t36 as `diverged`: code now writes the turn, by construction) |
| Suite / types / lint | 7,060 pass, `tsc` clean, `eslint lib app components tests scripts db` clean |

**The 4 correct records that fail with the switches on** — b33 Owen t14, b33 Tyler t16, b34a Tyler t28, b36l Raj t26 —
each pins a probe on the recommendation's own figure, said after the recommendation. Your ruling A removes those turns.
In all four the close records the flag `unresolved_at_close`, and the report gets it. They need re-grading to the ruling;
that's your call. **18 more correct records** (closes and wrap-up probes after the recommendation) are now `diverged`:
their turns no longer exist.

**The 8 records that left the denominator** — b35h Marisol t32, b35q Raj t36, b37q Raj t38, b37q Tyler t32 (each a rec re-ask),
b36a Marisol t30 (close re-ask), b36a Jasmine t24 (second-key probe), b35h Raj t26 (chip-margin ask), v29 t36. Each fault
turn lay after a recommendation that now closes the case. Read by hand: every close follows a real recommendation
(`closes-b39-b40.md`). Fixed by construction, not hidden.

**Every changed turn** (`changed-turns-b39-b40.md`, 97 turns): 48 closes on the answer (48 of 51 runs end earlier — the
3 others never answered a recommendation ask), 25 model asks replaced by code's, 24 of code's own asks in the new wording.
Nothing else changed: no stall rung, point cap or presupposition fired on b39–b40. **All 48 closes hand-read**
(`closes-b39-b40.md`). Each answers the recommendation ask. Two open on revisited math with a lean at the end (b39a Marisol t27
"So A looks stronger…", b40q Marisol t27 "Still favors $60…"). Under your rule they are substantive and close the case. A
candidate who revisits a calculation in reply to the ask gets no second ask.

**What the switch removes** (prod's turns after the new close, 48 runs): 29 close waits, 19 rec-math probes, 25 model
turns (risk questions and post-recommendation pushback), 2 time warnings; 589 turns instead of 711. Runs end a median
3.1 min (max 10.1) earlier. On 26 Oct you kept `recommendationOpensGate` off because it removed post-recommendation
pushback, a scored dimension. This ruling removes it deliberately: the pushback rating now rests on the turns before the ask.

## aae091ff (voice replay, the agent's switches)

The prod arm reproduces the session (28 of 29 turns as said, acknowledgments aside). The new arm:
- **t24:** a model turn told to move on (point cap: t20 and t22 were one point, t23 "I'm not sure"). The replay shows "Go
  on." because nothing was recorded for a model turn there.
- **t26:** Level 2 fires (t23 + t25), and the presupposition rule (a) releases the menu prices before the question: "In two
  years, menu prices haven't changed. Given what you now know about prices, …".
- **t34:** "What's your recommendation to the client, what are the main risks to your plan, and what are your next steps?"
- **t36:** the close (t35 is the recommendation; the risk recorded as none named).

18 turns instead of 29. t38–t56 never happen.

## Corpus scans (static, 378 saved runs, 4,645 turns, 9,798 model sentences)

- **Presupposition hits: 9, all true** (item only offered or refused). 7 were delivered, all batch 20 (12 Oct); 2 were already
  withheld by F4. 0 on b28–b40. Five false hits found on the first pass were fixed (handover clearance, best match) and pinned.
- **Cue-only sentences: 106**, counted, not withheld — for your judgement on over-blocking.
- **Point-cap candidates: 13**, all batches 18–19: Destiny's cost-line loop with no data (b18), Victor's "No." ×10 (b18),
  and Victor's "anything else" close loop (b19). None in b20–b40.

## Production

Code first, then the switch names. `ENGINE_SWITCHES` throws at startup on an unknown name, so setting these before
this branch is deployed would refuse to boot.

- Vercel: `*=phase1,phase2,-asyncAskJudge,recLastQuestion,stuckRescue,unrevealedPresupposition`
- Agent: `*=phase1,phase2,-asyncAskJudge,speechNormalization,recLastQuestion,stuckRescue,unrevealedPresupposition`

## Limits

- Free replay drives the saved model output. A turn whose prompt the switches change (Level 2 guidance, move-on guidance)
  replays with the old words, and a turn that becomes a model turn gets "Go on.".
- The persona replies answer the original questions, so a replaced ask's reply was written to a similar ask, not to ours.
- aae091ff is rebuilt from its export (`scripts/voice-turn-file.ts`), with no recorded model output.
- The point cap and the voice filler rule have no typed evidence of firing. Their only replay evidence is aae091ff.
