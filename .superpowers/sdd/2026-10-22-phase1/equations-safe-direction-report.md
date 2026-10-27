# The safe direction of the equations heard: built, measured, and it shields real errors

Lorenzo's ruling of 27 Oct, round 4, on `phase1` at `67d7979f`. Switch `equationClears`, commit
`0ea1ac33`; the replay and this report in the commits after it.

**Spend: $0.1608 of the $0.25 cap** — 223 Haiku 5.5 extractor calls at $0.00071 each. Nothing pushed,
nothing merged, no DB write, no deploy, nothing under `Case Interview Runs/` staged.

---

## Headline — the one number first

**Real errors shielded: NOT 0.** On the speech-like corpus **19 of 21 clears are real errors**, and on the
corpus's own recorded checker claims **88 of 211 flagged claims are blocked** — 42% of every doubt the
engine was about to speak — of which the 10 I read verbatim are all real errors. **So the switch does not
ship: it stays out of every preset, and it should not be turned on for a wave either.** It is kept, off
everywhere, because it carries the evidence (the same place `checkerEquations` sits after failing its
latency gate).

**False doubts cleared: 2 in all, both on the speech corpus** — one on sound evidence, one on a digit
coincidence. **On the voice corpus, including all three graded probes, it changes nothing.**

**The reason, in one sentence.** A doubt is almost never about whether the arithmetic holds; it is about
**which quantity the figure is** — the base, the unit, the year, whether the inputs were quoted right —
and the candidate's arithmetic is *internally correct* in precisely those errors. "Right arithmetic on the
wrong base" is the commonest real error this engine catches (round 2 §A.1 named it in the recordings
themselves: `9ccf0836` t20's "58% × 10% = 5.8"). A correct equation in his own words is therefore not
evidence that a doubt is false — it is that error's signature.

---

## 1. What was built, and where code re-reads his words

| file | what |
|---|---|
| `lib/orchestrator/checker-equations.ts` | `confirmedInOwnWords`, `clearedByEquation`, `clearNote`, `sameBreath`; `EquationCheck` gains `operands`, `result` (each figure as said and at its scale), `confirmed` and `rescued` |
| `lib/cases/engine-switches.ts` | `equationClears`, in `NON_PRESET_SWITCHES` |
| `lib/orchestrator/math-checker.ts` | `VetContext.equations`; the clear enters the `tolerated` chain beside `selfCleared` and `superseded` — it drops a flag, and can do nothing else |
| `lib/orchestrator/math-checker-live.ts` | `VerdictPayload.equations` (the row the gate reads a turn later); `gateCodeFindings` drops a code finding with the new outcome `equation_cleared`, placed after `derived` and before `released` |
| `lib/orchestrator/plan-turn.ts` | `equation_clear` check record: every gate clear logged with the equation, his words for it and code's verdict. The claim side is on the verdict row, in the claim's own `vetNotes` |
| `tests/orchestrator/equation-clears.test.ts` | 19 tests: the two shapes, both hooks, and every way an equation is refused |
| `scripts/equation-clears-replay.ts` | the three replay arms below, free to re-read from its cache |

**Where code re-reads the candidate's own words** — `confirmedInOwnWords(equation, message)`, run at the
edge inside `verifyEquation` so nothing downstream can skip it:

1. the entry's `quoted` span must be a **verbatim substring of the message** (whitespace-squashed, case-folded);
2. **every operand and the stated result** must appear as a figure of the message — `figuresIn` runs
   `normalizeNumberWords` first, so "twenty eight point one" is the figure 28.1 (the brief's "number words
   or digits") — matched at a **1e-6 relative tolerance**, either as he said it or at its scale word's
   value. This is deliberately tighter than the 1% band the rest of the file uses for "the same quantity":
   this asks whether he *said* the figure;
3. fewer than two operands is never confirmed (a result with no working is not an equation).

`verifyEquation`'s existing `unquoted` guard (looser, 1%) must already have passed for the verdict to be
`correct` at all, so the confirmation is a second, independent reading of the same message.

**What may clear, and what may never.** `clearedByEquation` returns a clear or `null`; there is no path in
it that raises a flag, writes a correction or marks a figure correct. It refuses:

- a verdict that is not `correct` (an `incorrect` or `unclear` entry is no evidence either way);
- an entry code **rescued** off `incorrect` — the operand the rescue reads (1.10 for his "10%") is not a
  figure he said, so a rescue is evidence of *no error*, never of correctness;
- an entry that is not `confirmed`, and a low-confidence entry (already `unclear`).

And it clears in only two shapes, both requiring the equation's quoted words and the doubted clause to be
the same breath (containment, or a 12-character run in common — speech arrives unpunctuated, so a sentence
split would make a whole message one breath):

- **result** — the equation's stated result *is* the doubted figure: he derived the figure the line doubts,
  correctly, from figures he himself stated;
- **operand** — the equation's result is code's **own right figure** for that doubt and the doubted figure
  is one of the equation's operands: the doubted figure is an input of a calculation that lands where code
  says it should, so the line paired the wrong figure.

---

## 2. The three graded voice probes, one by one

All of them are in `9813d6ce`, the only recorded session with any checker line (round 2 §A.2). The
extractor ran on the three messages they sit on, plus the message carrying the false code flag — the only
four voice messages in the whole corpus with a doubt to clear (`--arm=voice`: 131 messages, 3 selected,
4 doubts). **4 equations heard, 2 of them clearing-eligible, 0 clears.**

| # | the probe | what the extractor heard on that message | cleared / blocked? |
|---|---|---|---|
| **1** | t28 on message 25, `checker:30%` — "COGS increased by thirty percent overall" (the checker's right figure 38.1). **The one right doubt.** | **nothing at all** — the message states a result and no working ("rev… oh, sorry. COGS increased by thirty percent overall. And looking at the figures, it looks like around") | **Not blocked.** Correct: the real error stands. |
| **2** | t30 on message 27, `non_bean_points_added` — "the other inputs account for twenty eight percent of the increase" (right 11.8); graded **a challenge of correct work** | one entry, `= 28%`, with **zero operands** → `unclear` ("fewer than two operands"), not confirmed | **Not blocked.** |
| **3** | t32 on message 27, `bean_points_added` — "the coffee only accounted for around, like, ten percent of that increase" (right 26); graded **a challenge of correct work, and a repeat** | one entry, `= 10%`, **zero operands** → `unclear`, not confirmed | **Not blocked.** |
| **4** | the false code flag `unit:COGS@25` on message 19 (expected 10.5), suppressed at the gate at the time | two entries, both `correct` **and** confirmed: `58 / 4 = 14.5` and `14.5 − 10.5 = 4` | **Not cleared.** Its figure (25) is neither equation's result, and code's right figure (10.5) is neither equation's result — it is an *operand* of the second. It stays suppressed for want of a checker claim, exactly as before. |

**Why #2 and #3 cannot be reached, and why that is the right answer.** The work the grader credited them
with is not in the message that was doubted. #2's operands (37.5% and 75%) are in **message 21** and, in
one breath, only at **message 31 — a turn after the probe**, in his answer to it. #3's operands are 25%
and 40%, and the **40% is the exhibit's figure, not his words**, so it can never be confirmed under any
reading. And the checker's own right figures for the two claims are 11.8 and 26, i.e. **both readings
agree the ambiguity is the base**, which is what the probes asked for ("what base is it on?"). Blocking
them on the strength of correct arithmetic would have removed the question that resolved the ambiguity —
which is the general finding of §4, arriving here first.

---

## 3. False doubts cleared, both corpora

Selection is free and comes first: only a message that **has** a doubt to clear is sent to the extractor
(`--dry` prints it). The arm's switches are `*=phase1,speechNormalization,scaleWordReading` (+
`checkerEquationsAsync,equationClears` for the on side) — the arm where the reader sees speech at all.

| arm | messages | doubts | clears | false doubts cleared | **real errors shielded** |
|---|---:|---:|---:|---:|---:|
| **voice-live** (the 131 recorded candidate messages) | 3 selected | 4 | **0** | 0 | **0** |
| **speech-like** (the whole typed corpus as STT hands it over, `toSpokenText`) | 100 selected | 108 code flags | **21** | **2** | **19** |
| **the claim side at scale** (the corpus's own recorded flagged checker claims, 120 of 508 messages sampled systematically) | 120 | 211 flagged claims | **88** | 0 found in the 10 read | **10 of 10 read; 88 clears in all** |

**The two false doubts cleared, both on the speech arm:**

1. **Sound, and the feature working as intended.** `default-candidate/…eb9f0abb:12`, step flag
   `revenue_per_store_check@2.087` expecting 2.4. He states today's figure (480/200 = 2.4) and then two
   years ago's (417.4/200 = 2.087); the step check bound the second to today's step. The equation
   `417.4 million$ / 200 = 2.087 million$` is correct, every figure is in his own words, and it is the
   doubted figure's own derivation. Shape **result**.
2. **Right outcome, wrong evidence — a digit coincidence.** `batch-36-larkspur…bbf78ab8:8`, arithmetic
   flag `arith:80 × 75 percent@180` expecting 6000. His chain ("3 thousand flights times 80 times 75
   percent is 180 thousand passengers") is right and code's reader misparsed it, so the flag is false —
   but it was cleared by `160$ + 20$ = 180$`, his *fare*. Same digits, a different quantity. This is the
   failure `supersededBy` was tightened against on 27 Oct (round 3 §3.4b) reappearing in a new place:
   `clearedByEquation` matches a figure's value and not its kind.

**The 19 real errors shielded on the speech arm**, by flag:

| flag | n | the shape, and why the doubt is true |
|---|---:|---|
| `unit:COGS@10` expecting **4.2** | 6 | "beans are 25% of COGS, up 40% — that's 10% of COGS, so about 10 points of revenue". `25% × 40% = 10%` is right; 10% **of COGS** is 10% × 42 = **4.2 points of revenue**. The unit-confuser's signature error, verified wrong by hand. |
| `unit:COGS@28` expecting **11.8** | 4 | the same error on the other 75%: `75% × 37.5% = 28%` of COGS is **11.8 points of revenue**, not 28. |
| `pricing:gain@5` expecting **8.5** (×4), `@8` expecting 12.3 (×3), `@7` expecting 10.8, `@5` expecting 7 | 9 | "a 10% price rise drops COGS from 58% to 53% of revenue — 5 points of margin back". `58 − 53 = 5` is right; the margin gain is **8.5 points**, because labor and overhead compress on the new revenue base too. The pricing check is the authority here and the recorded right answer is ~9 points (`tests/orchestrator/unit-base.test.ts`, Sofia t17). |

Every one of those clears took the **result** shape: his own subtraction or multiplication, correct on
figures he stated, standing in front of a figure that is the wrong *quantity*.

---

## 4. The claim side: 88 of 211, and the narrowing that does not save it

The doubt-probe half is the one the ruling was aimed at, so it was measured where flagged claims actually
exist: **508 messages of the corpus carry a verdict with a flagged claim**; 120 were sampled (every 4.2nd
of the ordered set, never the first N), giving **211 flagged claims**. Both sides are re-vetted with the
same context, so the only difference is the equations.

**88 of the 211 are blocked — 42%.** By the checker's own error type:

| the checker's `errorType` | clears |
|---|---:|
| conceptual | 29 |
| misquote | 28 |
| wrong_base | 16 |
| wrong_period | 9 |
| arithmetic | 4 |
| unit | 2 |

**Ten read verbatim, every one a real error shielded:**

| the claim (right figure) | his words | why the doubt is true |
|---|---|---|
| "5.8 points of revenue (0.58 × 10)" (4.2) | "fifty eight percent times the ten percent. That's five point eight." | round 2 §A.1's own example of right arithmetic on the wrong base. |
| "48" (24) | "$9.6M + $9.6M + $14.4M + $14.4M … a $48M margin hole" | the sum is right; it double-counts revenue and contribution. |
| "−13.2 ($M)" (−14.4) | "Port Avery: 46.8 down to 33.6, so −$13.2M" | right subtraction on a **misquoted** 33.6 (the line says 32.4). |
| "−22.8 ($M)" (−24) | "9.6 + 13.2 = 22.8 of the −24 total" | the same misquote, carried. |
| "7.5 points of revenue" (4.3) | "10% of 75% of COGS, so about 7.5 points of revenue" | 7.5% **of COGS** ≠ 7.5 points of revenue. |
| "40 points" (18) | "38 points of pressure plus two from overhead, call it 40" | the addition is right; the claim is not. |
| "21 points" (18) | "19 points from COGS plus 2 from overhead is 21 points" | right addition on a misread 61% COGS line. |
| "$2,000" (8000) | "list is $10,000, discounts are 20% of list, so the realized figure is $2,000" | `10,000 × 20% = 2,000` is right arithmetic for the **discount**, not the net price ($8,000). Case-breaking. |
| "$80 million" (320) | "40,000 × $2,000 = $80 million" | right multiplication on the $2,000 above. |
| "$220 million short" (−20) | "$80M against a $300M bar, so short by $220M" | right subtraction, same root. |

**The obvious narrowing fails too.** If a clear were allowed only where the doubt is itself about
arithmetic — the checker's `errorType: 'arithmetic'`, or a code flag of kind `arithmetic` — the 88 become
4 and the 21 become 1. **All four of those claim-side clears are the last four rows of the table above**
(Tyler's 19 + 2 = 21 and Marisol's $2,000 chain): the checker's "arithmetic" label does not mean "the
arithmetic does not hold", it means "the number is wrong and the path to it was arithmetic". And the one
code-side survivor is the 180-coincidence of §3. **There is no narrowing in the measured space that keeps
any of the feature and 0 shielded errors.**

---

## 5. The gate

Run with the switch out of every preset, which is where it stays.

| line | result |
|---|---|
| 0 new false flags | **Met by construction and by measurement.** Nothing new can raise a flag: `clearedByEquation` returns a clear or null, and both hooks only drop. The 31-slice replay reports 0 changed checker decisions and 0 changed interviewer lines. |
| 0 new false corrections | **Met.** 0 changed interviewer lines across the 31 slices; `fact-check` F2-next unchanged. |
| 0 missed real errors | **NOT met with the switch on** — 19 on the speech corpus and 88 flagged claims blocked on the claim side (§3, §4). **Met with the switch off, which is every preset and every default**: the gate arms below are unmoved. |
| correct records 95/95, both arms | **Met — 95 / 95 with `*=phase1` and 95 / 95 with the switches off**, 4 skipped in each, `run_missing` **0** in both. |
| fault bank `*=phase1` 78/154, off 48/155 | **Met exactly — fault 78 / 154 on `*=phase1` and 48 / 155 off** (labels `fault-bank-r4-p1`, `fault-bank-r4-off`). Against round 3's own labels, `316 → 316 records · 0 moved · 0 left the gate's denominator` in **both** arms. |
| prof-001 identical with the switches off (the 31-slice replay) | **Met — 31 slices, 230 runs, 6,020 turns: 0 changed checker decisions, 0 changed interviewer lines, 0 runs on one side only** (`compare-r4base-vs-r4g.md`). The baseline is a run of the same proof at **67d7979f**, the commit this work sits on — see the note below, which is why. |
| `scripts/fact-check.ts`, `env -u ENGINE_SWITCHES`, the same 31 slices | **Met — F1 0 · F2-next 104 · F2-rec 11 · F3 0 · F4 0, identical on both sides.** The F2-next figure is 104 and not round 3's 97 at the base as well as here: it moved before this work, not in it (note below). |
| `speechNormalization`, `checkerEquations`, `checkerEquationsAsync` and `equationClears` all out of the preset | **Met** — the contract test now asserts all four. |
| suite / types / lint | **`npx vitest run` 5,949 passed / 9 skipped, `npx tsc --noEmit` clean, `npx eslint lib app components tests scripts db` clean**, at each commit. |

**A note on the baseline, because it matters for reading any of these numbers.** Two commits landed inline on
this branch just before this work (`34818edc` "the scale word a figure carries" and `67d7979f` "a verified
figure's magnitude in words; `scaleWordReading` into the preset"). Replaying the same 31 slices at round 3's
HEAD (`r3c-gate`) and at `67d7979f` (`r4base`) shows **1,308 changed interviewer lines and 153 changed
checker decisions over the 230 runs**, with `fact-check` F2-next 103 → 104 — all of it theirs, none of it
mine, and all of it with `env -u ENGINE_SWITCHES` so it is not the preset entry. Most of the sample I read
is acknowledgment-phrase rotation ("Got it." → "Understood."), but at least one is a code-written data line
disappearing (`b28-off`, 54-owen t10). **I have left those commits alone, as the brief says, and flag the
numbers here for whoever owns them**; the fault bank is unmoved by them (0 records moved in either arm), so
the gate's bank figures are intact either way. Every gate line above is this work against `67d7979f`.

---

## 6. The spend

**$0.1608 of the $0.25 cap**, 223 Haiku 5.5 extractor calls at $0.00071 each: 3 on the voice arm, 100 on
the speech arm, 120 on the claim arm. Every call is cached by message id, so re-reading the results — and
every number in §2–§4 — costs nothing.

**The ledger was created EMPTY and checked before the first call**, as the brief required:
`lines 0, sum 0, isFinite true`. It was re-summed before the claim arm (`lines 103, sum 0.0728`,
a real number), and the budget's own line printed `already spent $0.0728` at that run's start. Round 2's
`{"spentUsd":0}` lapse is not repeated.

---

## 7. Judgement calls, each with its cost if wrong

1. **The confirmation corpus is the doubted message alone, not his whole transcript.** The ruling says "the
   candidate's own words"; `verifyEquation`'s existing guard and the extractor's own prompt are both
   same-message, so a wider reading is a different build. *Cost if wrong: graded probe #2 would be blocked
   under a whole-transcript reading (his 37.5% and 75% are in message 21). The measurement says that is a
   cost, not a benefit — the checker's right figure for that claim is 11.8, so blocking it adds one more
   shielded error to the 88.*
2. **A verdict code rescued off `incorrect` may never clear.** *Cost if wrong: a handful of percent-as-factor
   equations cannot clear. 3 of the 319 speech-arm equations were rescued; none would have cleared anything.*
3. **No power-of-ten slack in the figure match**, unlike `bestMiss`'s own readings. *Cost if wrong: a doubt
   stated at another scale than the equation's result is not cleared. Given §3's coincidence clear at the
   same scale, loosening this would only add shielded errors.*
4. **120 of the 508 flagged-claim messages, sampled systematically.** *Cost if wrong: the 42% rate carries
   a sampling error; it would have to be wrong by a factor of 40 to make the switch safe.*
5. **Hand-verified 10 of the 88 claim-side clears and 7 of the 21 code-side ones**; the remaining 14 on the
   code side are the same two flag keys with the same expected figures on other runs. *Cost if wrong: the
   headline needs 1 real error, and it has 17 read by hand.*
6. **The code is kept, behind a switch that is off everywhere, rather than reverted.** This is where
   `checkerEquations` sits after failing its latency gate: built, measured, named in the switch file with
   its reason. *Cost if wrong: dead code in `checker-equations.ts` and a replay script. One revert commit
   if Lorenzo wants it gone.*
7. **I did not invent a third clearing shape to catch the §A2 false code flag** (its 10.5 is an operand of a
   correct equation in the next clause). Widening the rule to "code's right figure appears anywhere in a
   correct equation of his" would have caught it — and, on this evidence, a great many more real errors.
   *Cost if wrong: the one false code flag in the live voice corpus is not cleared by this switch. It was
   already suppressed at the gate, so nothing was spoken either way. The honest fix for it is the
   `statedValid` check that step flags have and unit flags do not — a different task.*
8. **The speech arm's flags are read with `speechNormalization` and `scaleWordReading` on.** They are out of
   the preset, but they are the arm in which the reader sees spoken arithmetic at all. *Cost if wrong: a
   preset-only arm would have fewer flags to clear and so fewer shielded errors — a smaller denominator,
   the same conclusion.*

---

## 8. What is owed from Lorenzo

1. **The ruling as written cannot be shipped.** Confirm that `equationClears` stays off everywhere (my
   recommendation), or say to revert it.
2. **The half of the ruling that does hold** is the part already shipped in round 3: an equation may move a
   verdict *off* `incorrect`, which raises nothing and clears nothing. That stays as it is.
3. **Two real, separable fixes this measurement surfaced**, neither of them this switch:
   - the step check's `statedValid` has no counterpart in the unit check, which is why the `unit:COGS@25`
     false flag existed at all;
   - `clearedByEquation`'s figure match (and any future figure match) wants the kind-and-scale guard
     `supersededBy` got on 27 Oct — §3's coincidence is the same bug in a new place.
