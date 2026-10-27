# The voice ground truth, the three follow-ups, and the checker's equations

Lorenzo's rulings of 27 Oct, on `phase1` at `c71da5a9`. Commits `a0326b9c` (B), `e64d8b87` (C), `a6462de2` (D),
`8a54a466` + `20fd9929` (E).

**Spend: $1.0138 of the $2.00 cap.** Nothing pushed, nothing merged, no DB write, no deploy, nothing under
`Case Interview Runs/` staged. Every switch is out of every preset — `speechNormalization` stayed out of `phase1`,
and `ofAsMultiplication` and `checkerEquations` were added to `NON_PRESET_SWITCHES` beside it.

**Headline: A–D all landed. E is built, measured, and fails its latency gate by 42×, so the synchronous form is not
shipped and an asynchronous variant is proposed in §E.6.**

---

## A. The voice ground truth (free)

### A.1 The recall denominator, hand-counted

The 131 candidate turns of the 15 `voice-live` sessions (main checkout's corpus), read in full. The measurement
scripts had only ever reported what the checker *found*; this is what there was to find.

**How I judged a claim.** A claim is a span in which the candidate asserts a numeric result that follows from
numbers by an operation, so that a checker could in principle verify or flag it. I counted two tiers, because they
are what two different parts of the engine can reach:

- **Tier 1 — self-contained.** Operands, operation and stated result are all in the turn (one sentence, or an
  adjacent pair: "zero point six divided by six point two. Oh, so that's actually a nine point six seven ish
  increase."). This is the only tier `checkStatedArithmetic` can ever verify, so **Tier 1 is the recall
  denominator**. A range delta with a stated result counts ("from twenty four to six percent, that's an eighteen
  point drop"); the operator is implicit in "drop" but both operands and the result are said.
- **Tier 2 — context-bound.** The result is stated but an operand or the operator comes from an earlier turn or
  from the ledger ("seventy five percent would be, like, around thirty one point five points of revenue" — the 42
  is not in the turn). Only the step/figure checks can reach these.
- **Not counted:** an operation with no stated result ("point seven five times thirty seven point five" and stop);
  a result-only restatement of an earlier derivation; a figure the candidate is in the middle of withdrawing and
  never lands ("nine point three times three is, like, twenty, like, around… wait" — I counted the *landed* "oh,
  twenty seven point nine percent" instead); a range or transition with no arithmetic.
- **Borderline**, listed apart: a true claim whose operand is never cleanly spoken.

| session | turns | **Tier 1** | Tier 2 | borderline | where the Tier 1 claims are |
|---|---:|---:|---:|---:|---|
| `5a94e805` | 10 | **1** | 0 | 0 | t6 24 − 6 = 18 |
| `a8ded3d6` | 7 | 0 | 0 | 0 | — |
| `9e349fea` | 2 | 0 | 0 | 0 | — |
| `e824fdf3` | 29 | **2** | 2 | 1 | t28 0.6 / 6.2 = 9.67; t33 16 / 42 = 38% · *borderline* t26 0.40 / 6.20 = 6.4% (the denominator is groped for, never said: "forty cents over two point… what is it? Two points.") |
| `314295e0` | 10 | 0 | 1 | 0 | — |
| `9ccf0836` | 21 | **9** | 0 | 1 | t10 ×4 (25%×40% = 10; 375/4 ≈ 93; 9.3×3 = 27.9; 27.9 + 10 ≈ 37.5), t20 58%×10% = 5.8, t24 ×3 (10%×42 = 4.2; 75%×42 = 31.5; 31.5×37.5% ≈ 11.8), t26 58 − 42 = 16 · *borderline* t24 "beans are only a quarter of the sixteen point increase" (4.2/16 ≈ ¼) |
| `9813d6ce` | 23 | **3** | 4 | 0 | t12 42/4 ≈ 10, t14 ×2 (58/4 = 14.5; 14.5 − 10.5 = 4) |
| `0f1b28ea` | 9 | 0 | 0 | 0 | — |
| `2b9059aa` | 1 | 0 | 0 | 0 | — |
| `44174f51` | 10 | **4** | 1 | 0 | t11 ×4 (25%×40% = 10; 10%×42 = 4.2; 75%×37.5% = 28; 28%×42 ≈ 11.8) |
| `8673be6e` · `97cc44af` · `9a2c19eb` · `b406165f` · `f3b07c57` | 9 | 0 | 0 | 0 | — |
| **total** | **131** | **19** | **8** | **2** |  |

**The denominator is 19 Tier-1 claims over 131 turns — 14.5 per 100.** Against the typed `prof-001` rate of 32.3
claims per 100 turns, speech states **less than half** as much checkable arithmetic per turn as writing does, which
is worth knowing on its own: part of the "speech gap" is that candidates say less of their working out loud. Nine
of the 19 are in one session (`9ccf0836`) and 16 of the 19 sit in just four turns.

**Recall against it:**

| arm | claims found | recall of the 19 |
|---|---:|---:|
| today (`spokenMathParser` only) | 0 | **0%** |
| `speechNormalization`, as of 27 Oct morning | 3 | **16%** |
| **+ follow-up 1 (§B)** | 3 | 16% — the bare-"is" shape does not occur in the recordings |
| **+ follow-up 3 (§D)** | **6** | **32%** |

Only **one** of the 19 is a real error (`9813d6ce` t17's "COGS increased by thirty percent overall" — it is 38%
relative or 16 points), and it was the one the interviewer did probe. Two more real slips are in the borderline and
withdrawn material: `e824fdf3` t26 uses 40 cents where the increase is 60 (he fixes it himself at t28), and
`9ccf0836` t20 computes 58% × 10% = 5.8 — right arithmetic on the wrong base (he fixes it himself at t24).

### A.2 Every checker probe and correction in those sessions, graded

**First, the coverage limit, because it is large.** Only **10 of the 15 sessions have any interviewer record at
all** (62 of the 131 turns): the twelve 19 Oct / 18 Oct sessions have a `-db-dump.json` with `session_turns` and
`session_events`, and `314295e0` has a hand-built transcript. The five earliest — `5a94e805`, `a8ded3d6`,
`9e349fea`, `e824fdf3`, `9ccf0836`, **69 turns, including the two math-heaviest sessions** — have only the agent's
per-turn `jsonl`, which carries timings, the ack and the segment kinds but **not a word the interviewer said** and
no `math_checker` events. Nothing can be graded there. I checked their mark keys for a checker-line mark and there
is none, so I cannot even say whether a line was spoken.

In the 10 recorded sessions, **`314295e0` and nine others produced no checker line at all**, and every checker line
in the whole recorded voice corpus is in `9813d6ce`:

| # | where | the line, verbatim | the candidate's own words | grade |
|---|---|---|---|---|
| 1 | `9813d6ce` t27, on message 25, `checker:30%`, `changesConclusion false` | "You said COGS increased by thirty percent overall. What base and measure is that on: points of revenue, relative change in share, or dollars?" | "rev… oh, sorry. COGS increased by thirty percent overall. And looking at the figures, it looks like around" | **right.** 42 → 58 of revenue is +16 points, or +38% relative. "Thirty percent" is wrong on either reading, and the line asks for the base rather than asserting a figure — the correct shape for a quantity whose *measure* is the ambiguity. |
| 2 | `9813d6ce` t29, on message 27, `non_bean_points_added`, `changesConclusion true` | "You said other inputs account for twenty eight percent of the increase. How did you get that, and what base is it on?" | "So the other inputs account for twenty eight percent of the increase, um, which means that, um, that the coffee only accounted for around, like, ten percent of that increase." | **a challenge of correct work.** 0.75 × 37.5% = 28.1% is exactly right as a relative increase in COGS, and the wording ("28% *of the increase*", when the share of the increase is 28.1/38.1 = 74%) is the real ambiguity. Defensible as a base question — it is what elicited his "That was based on relative change in share" — but the arithmetic was right and the engine did not know it. |
| 3 | `9813d6ce` t31, on message 27 — **the same message as #2** — `bean_points_added`, `changesConclusion false` | "You said coffee accounted for around ten percent of that increase. How did you get that figure, and what is it a percent of?" | same message as above | **a challenge of correct work, and a repeat.** 25% × 40% = 10% is right. It is the twin of #2 on the same turn, asked a turn later, on a figure the checker itself marked as not changing the conclusion. |
| 4 | `9813d6ce` t21, `unit:COGS@25` — **nothing spoken** | *(dropped at the gate: "no claim of the checker on this figure")* | "If beans are 25 percent of revenue, uh, 25 percent of cogs, sorry, um, that means that they accounted for 10 points or around 10, uh, point 5 points of revenue" | **a false code flag, correctly suppressed.** Code read the spoken self-correction ("25 percent of revenue, uh, 25 percent of cogs, sorry") as a unit error, expected 10.5, flagged 25. The candidate's figure, 10.5, is right. The gate held it because the checker did not rate that figure — the right outcome by luck of the gate, not by the flag being right. |

**The tally on what the candidate actually heard: 3 probes, 1 right, 2 challenges of correct work (and 2 of the 3 on
one turn), 0 corrections, 0 stale lines, 1 false code flag suppressed before it was spoken.** No real error went
unprobed in the recorded sessions. The two unprobed real slips (§A.1) are both in unrecorded sessions and both
self-corrected.

That is a 2-in-3 rate of doubting correct work, on n = 3, in sessions predating most of Phase 1 — too small to
price a regression against, and it is the only live voice evidence that exists. It is also the clearest argument
for the arithmetic checker reaching speech at all: in all three cases the candidate's arithmetic *was* in the
message, and code could not read it.

---

## B. Follow-up 1 — the bare "is" after a hard filler: **built** (`a0326b9c`)

`EQ_AFTER_COMMA` lets the reader cross a comma for the introducers it already knows — "so", "which is", "that's",
"gives us", "about", "roughly", "=", "≈" — and a bare "is" is not one of them. The recordings' own example happens
to say "gives us", so it worked; the commonest spoken shape, ", um, is 14.5", still raised nothing.

`is` / `are` / `equals` are now crossed, **only where a hard filler was removed** (`um`, `uh`, `uhm`, `erm`, `hmm`,
`mhm`, `you know`) and **only in front of a figure that closes its clause** — the same bound transforms 3 and 4
carry. The mechanism is the same text pre-pass: where the run follows a figure and carries a hard filler, the comma
it collapsed to is dropped instead of kept, which is exactly "the reader may cross it here".

| arm, per 100 turns | claims | correct | wrong | flags | verified |
|---|---:|---:|---:|---:|---:|
| the 131 voice turns, before | 2.3 | 2.3 | 0.0 | 0.8 | 3.8 |
| the 131 voice turns, after | 2.3 | 2.3 | 0.0 | 0.8 | 3.8 |
| replay `spoken` (realistic), before | 26.8 | 26.3 | 0.3 | 1.7 | 62.0 |
| replay `spoken`, after | 26.8 | 26.3 | 0.3 | 1.7 | 62.0 |
| replay `fillers`, before | 2.2 | 2.0 | 0.1 | 1.6 | 36.1 |
| **replay `fillers`, after** | **16.6** | **16.3** | 0.2 | **1.7** | **51.2** |
| replay `unpunctuated`, before | 27.2 | 26.0 | 0.7 | 2.7 | 63.2 |
| replay `unpunctuated`, after | 27.2 | 26.0 | 0.7 | 2.7 | 63.2 |

**The gain is entirely in the `fillers` arm, and it is large: claims 2.2 → 16.6 per 100, verified correct 2.0 →
16.3, verified figures 36.1 → 51.2, with flags unchanged at 1.7 against the written form's 1.9.** On the
recordings and in the realistic arm it changes nothing at all, because the shape does not occur in them — Deepgram
Flux's punctuation plus these five speakers' habits put the filler elsewhere. So this is insurance against a
speaker who says ", um, is": today such a candidate gets 2.2 claims per 100 turns, after this 16.6.

**Typed identity holds exactly: 0 of 6,304 written candidate messages** change a claim, a flag or a verified
figure. The gate is now a run rather than a memory — `speech-replay --arm=identity`. (I checked the `you know`
risk specifically, since that filler *is* writable: no written message reaches the path.)

**The `fillers` arm's switch-flags go 2 → 5, and none is new.** Each read:

| record | why it is not a new false flag |
|---|---|
| `a1133734` t30, `bbf78ab8` t8 | the noun-break pair task 6 reported. **The typed originals are flagged too**, at 200,000 and 180,000 against 200 and 180 |
| `dcc6774f` t6 (two flags) | **the typed original is flagged, with both switches off**: "months 3 to 6 about 0.72 over 3 is 2.16" reads "over" as a division where the candidate means "across 3 months" (× 3). A pre-existing false flag of a different class, on written text, which I am not fixing unasked |
| `9dd34b4a` t16 | the synthetic transform's own mangling of "1.15" into "9.71 point 1 5"; flagged with the switch **off** in the realistic arm |

---

## C. Follow-up 2 — scale and currency words: **measured only** (`e64d8b87`)

`scripts/scale-words-measure.ts`. Nothing in `lib/` changed and no switch was added: the recovery is simulated with
a pre-pass that folds the word into the figure in notation the reader already reads (`200 thousand` → `200k`,
`40 cents` → `$0.40`), so the number does not depend on how the feature would be built — and so the script cannot
be mistaken for the feature.

| arm, per 100 turns | claims | correct | wrong | flags | verified |
|---|---:|---:|---:|---:|---:|
| voice, as the reader reads | 2.3 | 2.3 | 0.0 | 0.8 | 3.8 |
| **voice, units absorbed** | **2.3** | **2.3** | 0.0 | 0.8 | 3.8 |
| corpus spoken, as the reader reads | 26.8 | 26.3 | 0.3 | 1.7 | 62.0 |
| **corpus spoken, units absorbed** | **35.2** | **34.7** | 0.3 | 1.8 | **76.4** |
| corpus as written, as the reader reads | 40.4 | 39.9 | 0.2 | 1.9 | 83.3 |
| corpus as written, units absorbed | 41.2 | 40.8 | 0.2 | 1.9 | 85.0 |

**On the 131 recorded voice turns it recovers nothing — 0 claims, 0 figures.** The report's §1 pattern I predicted
this and it is confirmed: the recordings' currency sentences state no result in the same breath ("It's it's forty
cents over two point… what is it? Two points. Sorry.").

**On spoken text corpus-wide it is the largest single recovery left: +602 claims (589 correct, 6 unclear), and
verified figures 62.0 → 76.4 against the written 83.3** — most of the remaining verified-figure shortfall §3 of the
27 Oct report could not close.

**It raises 7 flags, and all 7 are false, on work the written original gets right today.** Each read against the
typed source:

| record | the absorbed reading | why it is false |
|---|---|---|
| `a1133734` t30, `bbf78ab8` t8 | 200,000 and 180,000 | the noun-break pair; flagged in the written original too, only at a smaller magnitude |
| `dd74b01b` t18 (two) | "1k × $1208 = 1.40m", "800 × $1480 = 1.60m" | the stated result belongs to the *sum*, not the tail — a mis-assignment; the written original is verified correct |
| `7e69eda5` t12 | "1.70 × $30 × 12 = $252" | written "year one: 0.70 × $30 × 12 = $252". The replay's colon-stripping joins "year one" to the next operand — but the shape (an ordinal next to an operand) is real speech |
| `6f57da6e` t10 | "2m × 20% = 200k" | written "pool of 1 million: 1 million × 20% = 200,000". With the colon gone, `normalizeNumberWords` reads "one million one million" as **2 million** — a genuine reader quirk on a repeated figure |
| `3376e5fe` t10 | "$400 / $300 = 1" | written "= 1.3x"; the replay says "one point three" + a glued "x" |

**0 real errors caught.** So Lorenzo's rule — a scale-changing reading must never be a flag — costs nothing in
detection on this corpus, which is the single most useful thing this measurement says.

**What a safe version looks like.** His sentence has two readings and they are worth tens of claims apart, so I am
putting both numbers in front of him rather than choosing:

1. **"Capped at `unclear`"** — every claim whose reading absorbed a scale or currency word comes out `unclear`.
   Then it recovers **0 verified-correct claims** and can only remove flags, which is precisely what
   `spokenMathParser`'s tolerances 1 and 2 already do. The feature collapses into what exists; there is nothing to
   build.
2. **"Never a flag, `correct` allowed"** — the absorbed reading may verify but may never produce `incorrect`; a
   claim that would be `incorrect` under it is forced to `unclear`. Then it recovers **589 verified-correct claims
   and 14 points of verified figures on spoken text, and raises 0 flags by construction.** Every one of the 7 it
   would otherwise flag is false, so the cap costs nothing measurable.

My conservative call, if forced to pick: **(2)**, implemented as a verdict ceiling inside the reader (an
`absorbed` bit on the claim, `incorrect` → `unclear`), with `spokenMathParser`'s existing unit table reused so the
scale factors have one definition. **Cost if (2) is wrong:** a real spoken scale error — "two hundred thousand
times eight thousand dollars is sixteen million", which is 1.6 billion — would come out `unclear` rather than
flagged, so it reaches the candidate unchallenged by code. **Cost if (1) is right and I pushed (2):** nothing is
lost that today has, because all 7 flags are false; the risk is entirely in the unmeasured next corpus.

It would also change typed output (+146 claims, all `correct`, 0 new flags, 0 flags removed), so it needs its own
switch and its own ruling, exactly as D did.

---

## D. Follow-up 3 — "of" as multiplication: **built, and it meets the condition** (`a6462de2`)

Lorenzo dropped the typed-identity requirement for this one, on the condition that typed output may only **add
verified-correct claims or remove false flags** — 0 new flags, 0 new corrections, every changed turn read.

`of` still ends the expression everywhere it is the preposition that rule exists to protect. The new switch
`ofAsMultiplication` (`lib/orchestrator/of-multiplication.ts`, its own switch so the `speechNormalization`
identity gate keeps meaning what it says) reads it as × in the one position where it cannot be a noun: between a
**share** — a percent, or a fraction word ("one fourth", "a quarter", "two thirds") — and a **figure that follows
immediately**, with no article and no noun in between.

**The typed corpus, read as written (`speech-replay --arm=of`), 6,304 messages:**

| | |
|---|---:|
| turns changed | **102** |
| claims gained | **107 — every one `correct`** |
| claims lost | **0** |
| new flags | **0** |
| flags removed | 0 |
| verified figures lost | **0** |
| verified figures gained | 86 |
| turns changed with no claim change (the span's text only: "×" where "of" was) | 5 |

**Lorenzo's condition is met exactly, and all 107 gained claims were read.** They are the corpus's own
"25% × 42 = 10.5", "16% × $480M ≈ $77M", "20% × 200,000 = 40,000", "58% × 115 = 66.7", "70% × 80 = 56" family —
single-step share conversions the reader has always been blind to. The 5 span-only turns are `58cb8061` t14,
`06b98722` t14, `f6be6369` t18, `3d00df25` t6, `6bbc2163` t12; each keeps an identical claim set, verdicts
included.

One nuance worth Lorenzo's eye: a few gained claims are **right arithmetic on a wrong base** — `0a5cdc18` t16's
"I took the bean share of 25% but applied it to today's 58 instead of the 42, so 25% × 58 is 14.5" is verified
`correct`, because 0.25 × 58 *is* 14.5. Verifying the arithmetic does not endorse the base: the unit and
nested-conversion checks still own that, and **0 flags were removed and 0 verified figures lost**, so nothing that
used to challenge the base stopped.

**The 131 recorded voice turns: 3 claims → 6, verified figures 5 → 8, flags unchanged at 1.** The three new ones,
each read by hand:

| session | turn | as the reader now sees it | verdict |
|---|---|---|---|
| `9ccf0836` | t24 | 10 percent × 42 = 4.2 | **correct** ✓ |
| `9ccf0836` | t24 | 75 percent × 42 = 31.5 | **correct** ✓ |
| `9813d6ce` | t12 | 0.25 × 42, which is around 10 | **correct** ✓ (10.5, hedged) |

`9813d6ce` t12 is the test that matters most for safety: the same sentence contains both shapes — "coffee beans
with **25 percent of COGS** two years ago … **one fourth of forty two**, which is around ten" — and the first is
left exactly as written while the second is read. Pinned as a test, along with "multiply it by its share of COGS",
"a quarter of the sixteen point COGS increase", "two of three factors" and "25% of the 42 points".

Spoken replay, realistic arm, with B and D together: claims 26.8 → 28.0, correct 26.3 → 27.5, verified 62.0 →
62.9, flags still 1.7 against the written 1.9, **0 new flags**. The `fillers` and `unpunctuated` arms' switch-flag
counts do not move (5 and 2, the §B records).

---

## E. The checker's equations and answer sheet (`8a54a466`, `20fd9929`) — **fails the latency gate**

### E.1 What was built

No new model call: the existing per-message Sonnet checker output is widened, behind `checkerEquations`. Off, the
prompt and the output schema are byte-identical to today's.

- **(a) equations heard.** The model transcribes each stated calculation: operands with scale and unit, the
  operator, the stated result, its own words for it verbatim, and how sure it is that it **heard** the sentence
  right — never whether it is correct. `verifyEquation` then evaluates it in code with `verdictFor`, the same bands
  the text reader uses, reading the hedge from the candidate's own quoted words.
- **Code verifies (a) exactly, and three guards make that true rather than aspirational:** a `low`-confidence entry
  is `unclear` whatever the arithmetic says; an entry whose figures are not the message's is `unclear` with the
  reason; an entry whose quoted words are not a substring of the message is `unclear`. The model's own arithmetic
  is never read anywhere — verification happens at the edge, in `checkMathClaims`, so nothing downstream can reach
  the raw entry.
- **(b) answer sheet.** The quantities whose value **changed** in this message, changes only: a short label, the
  latest value with scale and unit, the words it comes from, and — my addition — `supersedes`, the earlier figure
  it replaces, as the candidate said it. That field is what makes code's drop exact instead of a fuzzy label match.
- **The drop.** `supersededBy` drops a probe or a correction when the claim's figure is one a sheet entry replaces,
  and only when the replacement is itself a figure the candidate said. Both halves are wired: the same-message half
  in `vetCheckerClaims`, and the **cross-message** half in plan-turn's `staleDrop` hook (the one Phase 1 task 2
  already uses for the worksheet), reading the verdict rows of every message after the claim up to this turn.
  The cross-message half is the one that matters: a stale line is by definition raised on message N and spoken at
  N + k.

16 unit tests, including the vetting end of it on the real b39 claim.

### E.2 b39's three remaining stale lines, one by one

Tested on the checker's **real** answer sheet for the candidate message that immediately precedes each spoken line
(3 calls, $0.134), with the claim value each recorded flag event actually carries.

| line | verdict |
|---|---|
| **quillpath p07 `c82e7bd7`** — "Starter standalone LTV/CAC is about 2 times." (interviewer turn 26, outcome `correct`, key `starter_ratio@1.4`, claim from message 21) | **DROPPED.** The sheet for message 25 reads `Starter standalone LTV/CAC = 2x (was 1.4x)`, from his own "Understood — using cancellation only, 1/0.05 = 20 months, $30 × 20 = $600 standalone, 2.0x". `supersededBy('1.4x', …)` fires: the replacement, 2, is a figure he said; 1.4 is the figure it replaces; they differ. |
| **quillpath p24 `99dd37d1`** — the same sentence (turn 24, outcome `converted`, key `starter_ratio@2.5`, claim from message 13) | **not dropped.** The sheet for message 23 is **empty**. He clarifies which cohort row he used and restates 7.4% a month and ~13.5 months, but never restates the **ratio**, so no figure supersedes 2.5x. |
| **larkspur p57 `69441a66`** — code's `hint` on claim 7:3 (turn 10, key `checker:2.0`, "You said about $2.0M of fare given away on Lakeport…") | **not dropped.** The sheet for message 9 supersedes the **rate**: `Lakeport fare cut = 36% (was 12%)`, `Port Avery fare cut = 31% (was 12%)`. It does not name the $2.0M built on the 12%, because he does not restate it until message 11 — one message after the line went out. |

**1 of 3.** Both misses are the same shape: the figure the sheet supersedes is an **input** to the claim, not the
claim's own figure. Following the input is lineage, and lineage is what narrow W3 was rejected for on 26 Oct — it
cost 1 newly missed real error. So `supersededBy` stays figure-level by choice, and the cheapest honest widening
for Lorenzo to rule on is to have each sheet entry also declare the figures **computed from** the one it replaces,
with code still requiring every figure to be the candidate's own. I did not build that; it is a lineage rule in a
new coat and it deserves its own evidence.

### E.3 No new false flags, no new false corrections, no missed real errors from code's side

| line | result |
|---|---|
| fault bank, switches off (`r2f-off`) | fault **48 / 155** counted, correct **95 / 95**, `run_missing` 0 |
| fault bank, `*=phase1` (`r2f-p1`) | fault **78 / 154** counted, correct **95 / 95**, `run_missing` 0 |
| no record left the gate's denominator | **Met, both arms.** `compare --against=sn-off --to=r2f-off` and `sn-p1 → r2f-p1`: **316 → 316 records, 0 moved, 0 left the denominator** |
| 31-slice replay at HEAD vs the previous round | **Met.** `compare-s3.py sn-gate r2f-gate`, 31 slices, 230 runs, 6,020 turns: **0 changed checker decisions, 0 changed interviewer lines, 0 runs on one side only** |
| `scripts/fact-check.ts` with `env -u ENGINE_SWITCHES` over those 31 slices | **F1 0 · F2-next 97 · F2-rec 11 · F3 0 · F4 0** — exactly the 27 Oct gate's numbers |
| prof-001 identical with the switches off | **Met** — it is inside the byte-identical 31-slice compare above, and `speech-replay --arm=identity` is 0 of 6,304 |
| suite / types / lint | `npx vitest run` **5,892 passed / 9 skipped**, `npx tsc --noEmit` clean, `npx eslint lib app components tests scripts db` clean — at each commit |

The expected off-arm figure in the brief was 48/154; the counted denominator off is **155**, and so was the previous
round's own off arm (`fault-bank-sn-off/results.md`) — the 154 belongs to the `*=phase1` arm. Nothing moved.

**One missed real error did appear, and it is not code's.** See §E.4: the model's own verdicts shifted when a second
task was added to its call.

### E.4 Latency, before and after — **the gate fails**

Paired, the same 16 labelled recall messages, `sonnet55-medium`, **one call at a time** (concurrency 1, so the
numbers are not queueing artifacts), arm A `*=phase1`, arm B `*=phase1,checkerEquations`:

| | p50 | p90 |
|---|---:|---:|
| checker, switch **off** | 11,114 ms | 15,663 ms |
| checker, switch **on** | 13,345 ms | 19,899 ms |
| **added** | **+2,231 ms** | **+4,236 ms** |
| paired per-message delta | median **+1,367 ms** | p90 **+6,496 ms** |

**The gate is at most 100 ms added at p90. It adds 4,236 ms — 42× the bar.** Per Lorenzo's instruction I stopped:
the synchronous form is **not shipped**, the switch is in `NON_PRESET_SWITCHES` with the failure written into its
comment, and the asynchronous variant is proposed below rather than built.

Cost moved with it, modestly: $0.0254 → $0.0295 a call, ≈$0.253 → ≈$0.294 an interview.

**And the second task changed the model's answers.** Firm recall **12/16 → 11/16**; "other flags on recall
messages" 2 → 3. The lost one is `fc290dc0` t20, whose "about 5 points" (margin gain from a 10% price rise; code
computes 8.5) went from `error/medium` **with a flag** to `unverifiable/low` **with none** — a missed real error.
I checked the obvious suspicion and it is not code's: **the answer sheet dropped nothing in either arm** on that
message or on `b284faee` t10 (the other claim-count change), and both sheets are empty of `supersedes`. It is
attention, not a guard. That is a second, independent reason not to ship the form where one call does both jobs.

### E.5 What the equations actually did, on real speech-shaped text

From the three probe calls, read in full. On `c82e7bd7` message 25 the checker heard **7 equations**; code verified
**4 correct** and ruled **3 `unclear`** — each because the model expanded a parenthesised sub-expression and the
intermediate is not in the message ("$600 + 0.20 × $4,000 = $1,400" became operands 600 + 800). Those three are
*correct* calculations marked unclear: the provenance guard is working in the safe direction and it costs 3 of 7
here. The cheapest fix, if Lorenzo wants it, is to accept an operand that is itself the stated result of another
entry in the same list — code can check that chain without trusting the model.

The answer sheets are good: 8 entries on `c82e7bd7` message 25, every one with the candidate's own words and the
figure it replaces; 3 on `69441a66` message 9; 0 on `99dd37d1` message 23, correctly, since nothing changed value
there.

### E.6 The asynchronous variant, proposed

The measurement says the cost is not the extraction, it is **doing it in the same call as the verdict**: the
output grows, the latency grows with it, and the model's attention is split. So:

1. **A second, small, parallel call instead of a second task.** The extraction needs only the candidate's message —
   not the ledger, the exhibits, the math steps or the pricing model. A Haiku 5.5 background classifier with a ~1k
   prompt (the role is already how `distress`, `coverage` and `probe_judge` are run, `BACKGROUND_MODEL_ID`), fired
   in parallel with the checker. Turn latency becomes `max(checker, extractor)` instead of `checker + the extra
   output`, and the extractor is a fraction of the checker's size. **The checker's own prompt and output schema go
   back to byte-identical**, which by construction removes the recall regression — verifiable for free with a
   prompt diff, no spend.
2. **Read it at delivery, not at the turn.** (b)'s only job is to drop a line **before it is spoken**, which is at
   least one turn after the message. So the extractor need not be ready in the turn its message arrives: the live
   turn never waits on it (the contract `math_checker` already has, except at the recommendation), and it still
   does its whole job. That takes it off the critical path entirely rather than shortening it.
3. **(a) need not be live at all for the safe direction.** An equation code verifies `correct` can clear a false
   flag, and that is worth having live; an equation code verifies `incorrect` raising a *new* flag is a separate
   decision with item C's risk profile, and it should be measured the way C was before it is wired anywhere.
   Scoring (`challenge-marks`) can read both with no latency cost at all.
4. **Nothing in the judging changes.** `verifyEquation` and `supersededBy` are pure and tested; only the transport
   moves. The guards — low confidence is unclear, every figure must be the candidate's, every quote must be his
   words, the replacement must be a figure he said — are the part that took the care and they are done.
5. **What it would cost to measure:** one extra classifier call per gated message, ≈$0.002–0.004 — about **$0.07
   for the same 16-message paired arm**, plus a free prompt diff to prove the checker is untouched. The gate to
   hold it to is the one Lorenzo set, now applied to the turn and not the call: at most 100 ms added at p90.

---

## The gate lines, in one place

| line | result |
|---|---|
| voice claims recovered vs the grammar normalizer | **3 → 6 of a hand-counted 19 (0% → 16% → 32%)**; B adds 0 on the recordings (the shape does not occur), D adds 3 |
| on the speech-like replay | realistic arm 26.8 → **28.0** claims and 62.0 → **62.9** verified per 100, flags 1.7 vs the written 1.9; `fillers` arm 2.2 → **17.3** claims, 36.1 → **51.8** verified |
| b39's 2 stale corrections and 1 repeated probe | **1 dropped** (`c82e7bd7` t26), **2 not** (`99dd37d1` t24, empty sheet; `69441a66` t10, the superseded figure is an input) — §E.2 |
| 0 new false flags / false corrections / missed real errors | **Met for code.** 0 new flags in the realistic arm and in D's typed arm; every switch-flag in the two synthetic arms traced to the typed original or the transform. **Not met for the model**: the synchronous widening cost 1 firm recall (§E.4) — one of the two reasons it is not shipped |
| correct records 95/95, fault bank both arms | **95 / 95** in both; fault **78 / 154** on `*=phase1`, **48 / 155** off (the brief's 154 off is the on-arm figure; the previous round's off arm was 155 too) |
| checker p50/p90 before vs after | **11,114 / 15,663 ms → 13,345 / 19,899 ms. +4,236 ms at p90 against a 100 ms gate — FAILED. Synchronous form not shipped; async variant in §E.6.** |
| `fact-check.ts` with `env -u ENGINE_SWITCHES` | **F1 0 · F2-next 97 · F2-rec 11 · F3 0 · F4 0** |
| prof-001 identical with the switches off | **Met** — 0 changed decisions and 0 changed lines over 31 slices / 230 runs / 6,020 turns, and 0 of 6,304 typed messages |

---

## Judgement calls, each with its cost if wrong

1. **The recall denominator is Tier 1 only (19), not Tier 1 + Tier 2 (27).** Tier 2's operands are not in the turn,
   so no arithmetic reader can ever reach them — counting them would understate recall against a number nothing
   can achieve. *Cost if wrong: the recall percentages in §A.1 are generous by a third (6/27 = 22% rather than
   32%). Both numbers are in the table.*
2. **A range delta with a stated result is a claim** ("from 24 to 6, that's an 18 point drop"). The operator is
   implicit but both operands and the result are spoken, and the reader does verify this shape in writing.
   *Cost if wrong: 3 of the 19 fall out and recall becomes 6/16 = 38%.*
3. **The probe grading covers 10 of 15 sessions, and I did not try to reconstruct the other five.** No interviewer
   words exist for them anywhere I could find — no dump, no transcript, no text in the agent jsonl. *Cost if wrong:
   the two math-heaviest sessions are ungraded, so the 2-in-3 "challenge of correct work" rate rests on 3 lines in
   one session. I would not price anything on it.*
4. **Probes #2 and #3 are graded "a challenge of correct work", not "right".** Both ask for a base rather than
   asserting, and #2 did elicit the base — a defensible interviewer move. But the arithmetic was right and the
   engine had no way to know it, which is the fact that matters for this round. *Cost if wrong: I have overstated
   the cost of the engine's blindness by two lines.*
5. **Follow-up 1 is implemented by dropping the comma, not by widening `EQ_AFTER_COMMA`.** They are equivalent for
   the reader, and dropping it keeps the grammar untouched and keeps the bound ("a figure that closes its clause")
   stricter than `EQ_AFTER_COMMA` is. *Cost if wrong: a shape where the introducer is crossable but the figure does
   not close the clause stays unread. None occurs in the corpus or the recordings.*
6. **`ofAsMultiplication` gets its own switch rather than joining `speechNormalization`.** It is not a speech
   transform and it does change written output, so folding it in would make the identity gate's documentation
   false and tie two decisions Lorenzo is taking separately. *Cost if wrong: one more switch name.*
7. **Fraction words ("one fourth", "a quarter") are included in D, but only in the `of`-multiplication position.**
   Pattern E on its own buys nothing — every occurrence in the recordings is in this position — and without them
   `9813d6ce` t12, the most frequent recorded shape, stays unread. *Cost if wrong: a sentence like "a third of 60 is
   25" gets a claim and would be flagged. It is a real error when it happens, so the flag would be right; the risk
   is a fraction word used loosely ("a third of the increase"), which the no-noun bound already excludes.*
8. **D's gained claims are allowed to verify right arithmetic on a wrong base** (`0a5cdc18`, `b5ebe6b8`). The unit
   and nested-conversion checks own the base, and 0 flags were removed. *Cost if wrong: the record now says
   "verified" beside a figure whose base is wrong, which could read as endorsement in a report. The flag that
   challenges the base is still there — I checked that specifically.*
9. **C is reported with both readings of Lorenzo's rule rather than one.** They differ by 589 verified claims, which
   is too large a gap to resolve by interpretation. *Cost if wrong: he has to read two numbers instead of one.*
10. **`supersededBy` matches on the figure, never on the label.** A fuzzy label match would have dropped the
    `99dd37d1` and `69441a66` lines too — and would be the mechanism that silences a probe on a quantity code only
    guessed at. *Cost if wrong: 2 of b39's 3 stale lines survive, which is exactly what §E.2 reports.*
11. **The answer sheet carries a `supersedes` field, which Lorenzo's sentence did not name.** "Changes only" implies
    a change, and naming the figure replaced is what lets code decide instead of guess. *Cost if wrong: one schema
    field and a little more output; without it the drop would have to match labels, which is call 10.*
12. **I stopped spending at $1.01 of $2.00.** The latency gate failed by 42× and the recall regression pointed the
    same way; more messages would have made the same conclusion more precise, not different. *Cost if wrong: the
    p90 pair rests on 16 messages, so the exact figure is noisy — the sign and the order of magnitude are not.*
13. **The budget ledger file was seeded in the wrong format on the first three calls.** I wrote
    `{"spentUsd":0}`; `FileLedger` expects one JSON line per call with a `usd` field, so `spent()` summed to `NaN`
    and the cap was not enforcing for those calls. I noticed it on the first run's `already spent $NaN`, repaired
    the file (3 calls, $0.1340) before anything else, and every later call was checked against a real total.
    *Cost if wrong — and it was wrong: $0.134 was spent with no live cap. The loss was bounded by the three
    `--at` targets I had named; a looser script would have been worse. The ledger file is a JSONL append log, not a
    state object, and I should have checked that before trusting the guard.*
14. **`eval-math-checker.ts` gained `--root=`/`CORPUS_ROOT`.** Its root was hardcoded relative, so it could only
    run from the main checkout — which would have measured the main checkout's code, not this branch's. Same
    change `build-math-labels.ts` already carries for the same reason. *Cost if wrong: one argument.*
15. **The equations' `incorrect` verdicts are recorded but wired to nothing live.** Raising a new flag from a
    model-heard equation has item C's risk profile and deserves item C's treatment. *Cost if wrong: (a)'s whole
    upside — catching a spoken math error the text reader cannot parse — is deferred. §E.6 item 3 says how to earn
    it.*

---

## What is where

| switch | state | preset |
|---|---|---|
| `speechNormalization` | built, widened by follow-up 1 | **out** (Lorenzo's instruction, unchanged) |
| `ofAsMultiplication` | built, meets his condition (§D) | **out**, awaiting his ruling |
| `checkerEquations` | built, **fails the latency gate** (§E.4) | **out**, and must not go in in this form |

Labels under `CaseTester-proof-out/`: `fault-bank-r2f-off`, `fault-bank-r2f-p1`, `r2f-gate` (and the superseded
first pass `r2-*`). Measurement scripts: `scripts/speech-replay.ts` (`--arm=identity`, `--arm=of`, `--of`),
`scripts/voice-math-measure.ts`, `scripts/scale-words-measure.ts`, `scripts/checker-equations-probe.ts`.
