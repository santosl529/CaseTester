# Speech normalization for the arithmetic checker — the measurement, the pass, the replay

Lorenzo's brief of 27 Oct (`next-speech-normalization.md`), built on `phase1` at `7f5c4e9d`.
**Nothing was spent. No model call, no push, no merge, no DB write, nothing written inside the corpus.**

Commits: `147e7226` (the measurement), `b1b73191` (the pass), plus the replay commit this report ships with.
The switch is `speechNormalization`, and it is **in `NON_PRESET_SWITCHES`, not in the `phase1` preset** —
nameable for evaluation, off everywhere else, awaiting Lorenzo's ruling (his explicit instruction).

---

## 1. Measure first

`scripts/voice-math-measure.ts` (`147e7226`) runs `checkCandidateMath` — the arithmetic check, the step and unit
checks, the verified figures — over the recorded voice candidate turns in `Case Interview Runs/voice-live/` and over
the same case's typed turns. Free. Measured 27 Oct against the **main checkout's** corpus (the worktree's is partial),
`ENGINE_SWITCHES='*=spokenMathParser'`.

### What the voice corpus is

**131 candidate turns across 15 sessions, every one `prof-001`.** The turns are read from each session's
`<id>.jsonl` (the only record every session has): `candidateText` is the message the engine saw, and a `carried`
turn re-sends an earlier message with more speech appended, so a carry chain collapses to its longest text — which
reproduces the `session_turns` count exactly in the nine sessions that also have a `-db-dump.json` (9813d6ce 23,
44174f51 10, …). Six of the fifteen have no dump, so no per-turn reveal progression exists for them; the whole
ledger is treated as revealed for every voice turn (the most permissive setting for the data-bound checks, uniform
across sessions), and the typed arm is measured **both** ways so the comparison is not an artifact of that choice.

**This is a small, noisy corpus** — 131 turns, one case, five speakers, of which only 24 sentences carry two number
words and an operator word at all. Per-100 rates on it move by 0.8 for one turn. The typed comparison below and
§3's replay over 6,304 turns carry the weight; the voice number's value is that it is *zero*, which no sample size
makes ambiguous.

### Per 100 turns

| arm | turns | claims parsed | verified correct | flagged (`incorrect`) | unclear | all flags | verified figures |
|---|---:|---:|---:|---:|---:|---:|---:|
| **voice** (`voice-live`, all reveals) | 131 | **0.0** | **0.0** | **0.0** | **0.0** | 0.8 | 1.5 |
| typed `prof-001` (each run's reveals) | 4,977 | 32.3 | 32.1 | 0.2 | 0.0 | 2.3 | 53.3 |
| typed `prof-001` (all reveals) | 4,977 | 32.3 | 32.1 | 0.2 | 0.0 | 2.5 | 56.3 |

Absolute counts: voice **0 claims** (0 correct / 0 incorrect / 0 unclear), 1 flag and 2 verified figures — both from
the unit and step checks, neither from the candidate's stated arithmetic. Typed: 1,608 claims (1,598 / 8 / 2) over
916 turns, 113 flags, 2,654 verified figures.

**The finding stands, and is stronger than the 24-sentence version of it:** the arithmetic checker reaches a verdict
on about a third of typed candidate turns and on **none** of 131 real spoken ones. Changing the reveal basis moves
the typed flag and verified rates by 0.2 and 3.0 and the claim rate not at all, so the gap is not a reveal artifact.

### Every voice turn where a figure or equation the candidate clearly said was not parsed

32 turns say an operator between figures and yield no claim (`--unparsed`). Grouped by STT pattern; ✓ marks a
reading I checked by hand as the candidate's true arithmetic. **Three are fixed by §2 and marked so.**

**A. A filler run and its commas between the operands and the result** — the brief's headline pattern.
- `9813d6ce t14` "So fifty eight divided by four, **um**, gives us around, **um, sorry, uh**, fourteen point five"
  — 58 / 4 = 14.5 ✓ · **FIXED, verified correct**
- `e824fdf3 t33` "sixteen over forty two is, **yes, like**, thirty eight percent" — 16 / 42 = 38% ✓ · **FIXED,
  verified correct**
- `44174f51 t11` "twenty eight percent, **um**, times, **um**, **the** forty two, which gives us … eleven percent"
  — 28% × 42 = 11.76 against a stated 11 · still unparsed (pattern J)
- `9813d6ce t18`, `e824fdf3 t35` — filler runs with no operand chain in the sentence; nothing to parse either way

**B. A decimal spoken with no whole part** ("point two five", "point seven five", "point two").
- `9ccf0836 t10` "**point seven five** times thirty seven point five", "**point two five** times thirty seven point
  five" — now read as 0.75 and 0.25 (neither sentence states its own result, so still no claim there, but the figures
  are no longer lost and no longer leak into the next chain as separate operands)
- `e824fdf3 t19` "is **point one** plus the zero…", `t26` "It's **point two**" — now read; both sentences are
  abandoned mid-thought and state no result
- `e824fdf3 t28` "zero point six divided by six point two" — already read (it has its "zero")

**C. "something like" before the result.**
- `9ccf0836 t10` "three hundred seventy five divided by four is **something like** ninety three" — 375 / 4 = 93.75 ✓
  · **FIXED, verified correct**

**D. "of" as multiplication** — "X percent of Y is Z". **Deliberately left.**
- `9ccf0836 t24` "so **ten percent of forty two** is four point two points of revenue" ✓
- `9813d6ce t12` "it'll be **one fourth of forty two**, which is around ten … ten points of revenue" ✓
- `9813d6ce t15` "**seventy five percent** would be, like, around thirty one point five points of revenue" ✓
- `9ccf0836 t15`, `t20` "look at how much each factor is raising and then **multiply it by its share of COGS**"
- *Why:* `of` ends the expression by design — "25% of COGS" is not an operation, and that rule is what stops the
  reader turning a share into arithmetic. Making it an operator fires on written text too, so it breaks the
  typed-identity gate. *Cost if wrong: five true spoken claims stay unverified.*

**E. Fraction words** ("one fourth", "a third", "a quarter"). **Deliberately left.**
- `9813d6ce t12` "**one fourth** of forty two", `9ccf0836 t10` "which is **one fourth** of that"
- *Why:* both occurrences also need D, so on their own they buy nothing. *Cost if wrong: nothing beyond D's.*

**F. "and (you) get" as a result introducer.** **Deliberately left.**
- `44174f51 t10`/`t11` "you can do twenty five percent times forty percent **and get** ten percent" ✓ (25% × 40% =
  10% of COGS growth)
- *Why:* 43 real **written** uses in the corpus's digit sentences — "Take the 40% bean inflation on 25 points **and
  you get** ten points of margin", "Inflate that by 40% **and you get** 14.7 points". Making it an equals changes
  typed output. *Cost if wrong: one true spoken claim per occurrence stays unverified.*

**G. The operand chain in one sentence, the result in the next.** **Deliberately left.**
- `e824fdf3 t28` "So zero point six divided by six point two. Oh, so that's actually a nine point six seven ish
  increase." ✓ (0.6 / 6.2 = 9.68%)
- `9ccf0836 t20` "fifty eight percent times that number or times the ten percent. That's five point eight." ✓
- `9813d6ce t23` "If you multiply this to get together, you get twenty eight percent." / "So two thirty eight minus
  twenty eight."
- *Why:* joining sentences is the highest-risk change available — two unrelated sentences become one claim, and a
  spoken turn is full of sentence pairs that share no arithmetic. *Cost if wrong: three true spoken claims stay
  unverified.*

**H. A scale word after the figure** ("two hundred thousand", "180 thousand passengers"). **Deliberately left.**
- Not in the recordings with a stated result, but §3's replay shows it plainly: "200 thousand" reads as **200**, so
  `a1133734 t30`'s 200,000 and `bbf78ab8 t8`'s 180,000 lose three orders of magnitude.
- *Why:* this is `spokenMathParser`'s tolerance 1, which only ever **removes** a flag; teaching the live reader to
  absorb the scale word changes a figure's magnitude 1,000×, which is the single most dangerous shape to get wrong.
  *Cost if wrong: a spoken figure given with a scale word is read 1,000× small, so a claim that depends on it is
  unclear or flagged rather than verified — which is what happens today.*

**I. Currency words** ("forty cents", "six dollars and twenty cents"). **Deliberately left.**
- `e824fdf3 t24` "It's it's **forty cents** over two point…", `t27` "it'll be **sixty cents** over **six dollars and
  twenty cents**"
- *Why:* same tolerance-1/2 situation as H, and neither sentence states a result, so nothing is gained today.
  *Cost if wrong: nothing in this corpus.*

**J. An article or a filler between the operator and its operand** ("times, um, **the** forty two").
**Deliberately left.**
- `44174f51 t11`
- *Why:* it buys an `unclear` (28 × 42 = 11.76 against a stated 11 is between the bands), not a verified claim, and
  "divided by **the** 200 locations" in written text would become an operation. *Cost if wrong: one unclear.*

**K. Two adjacent spoken figures as one** ("two thirty eight" = 238).
- `9813d6ce t23` "So two thirty eight minus twenty eight." — no stated result. Already covered by
  `spokenMathParser`'s tolerance 4, which only removes flags.

**L. A doubled operator word** ("times times").
- `9813d6ce t20` "thirty seven point five percent **times times** seventy five percent, and you get the percent
  increase" — no numeric result stated, so collapsing it buys nothing. Left.

**M. A figure abandoned mid-thought.** **Deliberately left unparsed — this is the one I most want to leave.**
- `9ccf0836 t10` "So nine point three times three is, like, **twenty**, like, around… wait." — 9.3 × 3 = 27.9, and
  "twenty" is a guess he abandons two words later ("oh, twenty seven point nine percent")
- `9ccf0836 t22` "I will talk to us four point two percent. of… or no. It was forty… wait."
- `e824fdf3 t19` "that would be… so that divided by four is point one plus the zero… plus thirty seven. Sorry."
- `e824fdf3 t26` "forty cents over two point… what is it? Two points. Sorry."
- `314295e0 t6` "So that's a sixteen point increase. Wow. Yeah. So… oh, not even sixteen."
- *Why:* no filler sits inside these chains, so the comma still ends them and no claim is raised — by construction,
  not by luck, and `9ccf0836 t10` is pinned as a test. *Cost if wrong: a real slip inside an abandoned sentence
  passes unflagged. Worth it: raising a claim on a figure the candidate is in the middle of withdrawing is the
  likeliest way to speak a false flag at a candidate.*

**N. Ranges and transitions** ("from twenty four percent to six percent", "from six percent to about fourteen point
five") — `9e349fea t2`, `e824fdf3 t10`, `9813d6ce t2`, `9ccf0836 t25`/`t26`/`t28`, `44174f51 t7`, `314295e0 t7`,
`9813d6ce t13`. These state no arithmetic and must not raise a claim. Correct as they are.

**O. Run-on sentences with no punctuation** — the brief names this pattern; **it does not occur in the
recordings.** Deepgram Flux punctuates, and every one of the 131 turns has sentence stops and commas. §3's
`unpunctuated` arm measures the hypothetical anyway, and it is the only arm where the spoken form raises flags in
quantity (85), so if the STT configuration ever stops punctuating, this measurement has to be redone.

---

## 2. What was built

`lib/orchestrator/speech-normalize.ts`, switch `speechNormalization` (`b1b73191`). A **text pre-pass, not a second
grammar**: it rewrites four disfluency shapes and hands the sentence to the same reader the typed corpus goes
through, so the bands, the self-correction pass and `spokenMathParser`'s reading enumerator are untouched.
`checkStatedArithmetic` now computes its normalized text once and uses it for both the sentence split and the
self-correction search — otherwise a rewritten span would stop the correction reader finding its marker.

Threaded as a second `CandidateMathOptions` flag through `recompute.ts`, read from `switchOn` at the live turn
(`plan-turn.ts`) **and in scoring** (`challenge-marks.ts`), same as `spokenMathParser`. Every other call site keeps
today's behaviour by the default-off parameter.

| # | transform | bounded to |
|---|---|---|
| 1 | a filler run and the commas around it, mid-sentence | **after a figure** the run must carry a filler nobody writes (`um`, `uh`, `uhm`, `erm`, `hmm`, `mhm`, `you know`) before it may be read through, and the comma is kept — so "= 10, um, plus 0.75 × 37.5 = 28.1" stays two claims, as the typed form is. After an operator, an equals word or a hedge the run collapses to nothing. The run must be followed by a figure, reached through the reader's own lead-in words — so "I'm **sorry**, I really don't know" and "MECE, **yes**, that part is fine" are sentences, not gaps, and are left as written |
| 2 | a decimal spoken with no whole part ("point seven five" → 0.75) | only a figure **directly** before claims the decimal ("fourteen point five" stays for `normalizeNumberWords`), and the digit-word run must be maximal — "point three one fiveR" is notation, not a figure |
| 3 | "something like" → "about" | only after an equals word, and only in front of a figure that **closes its clause** — never "revise it to something like 10% traffic" or "the fare drop is something like $1,660 / 64 ≈ $26" |
| 4 | a comma between a result-introducer and its figure ("is, thirty eight percent") | only in front of a figure that closes its clause, so a comma before a fresh calculation is kept — "Roughly, 108 times 0.96 is about 104" is unchanged |

Transform 2 is the one that matters most for safety, and it was the hardest to get right. Applied **unevenly** it is
worse than not applied at all: with "point three zero" left as words, the digit words become operands of their own,
so "plus point three zero plus point two zero is point five zero" reads as "0 + 0.20 = 0.50" and is **flagged**. My
first version declined after a comma and produced exactly that false flag in the replay (`442e37ff t6`); the rule is
now "only a figure directly before", and the two switch-caused flags that version raised went to zero.

`tests/orchestrator/speech-normalize.test.ts`, 18 tests, every sentence a real recorded turn or a real written one.
What they pin: the brief's sentence reaches `correct`; the typed form of the same claim reads the same both ways;
a comma is never crossed to join two claims; the mid-thought "9.3 × 3 is, like, twenty" raises nothing either way;
batch 18 Maya's "16 / 18 … 1.6%" keeps its flag with a filler inside it; an ambiguous spoken reading lands
`unclear`, not flagged; a self-correction still reads on the normalized text; and the 80-sentence set of task 6
(`evals/spoken-math/sentences.json`) is **unchanged on all 56 written sentences** and gains claims on exactly three
of the 24 STT ones, all three hand-labelled `consistent`, with no `incorrect` verdict anywhere in that pool.

### What it does

| | turns | claims | verified correct | flagged | unclear |
|---|---:|---:|---:|---:|---:|
| voice, switch off | 131 | 0.0 (0) | 0.0 (0) | 0.0 (0) | 0.0 (0) |
| **voice, switch on** | 131 | **2.3 (3)** | **2.3 (3)** | **0.0 (0)** | **0.0 (0)** |
| typed `prof-001`, either way | 4,977 | 32.3 | 32.1 | 0.2 | 0.0 |

The three claims, each read by hand:

| session | turn | the sentence, as the reader now sees it | verdict |
|---|---|---|---|
| `e824fdf3` | t33 | 16 / 42 is 38 percent | **correct** ✓ (38.1%) |
| `9ccf0836` | t10 | 375 divided by 4 is about 93 | **correct** ✓ (93.75) |
| `9813d6ce` | t14 | 58 divided by 4, gives us around 14.5 | **correct** ✓ |

Three claims on 131 turns is 2.3 per 100 against the typed 32.3 — the checker is no longer blind on speech, but it is
still a long way from seeing what it sees in writing, and §1's D–J list is where the rest of the distance is.

---

## 3. The speech-like replay

`scripts/speech-replay.ts`. Every candidate turn of the whole corpus (6,304 messages, 518 runs, all cases) is
rewritten the way STT would hand it over — digits to number words, spoken currency ("$0.70" → "seventy cents") and
scale ("$320M" → "three hundred twenty million dollars"), the reader's symbols spoken ("×" → "times", "≈" → "is
about"), ranges spoken as ranges ("5-6 points" → "five to six points"), brackets and dashes gone — and replayed.

Three readings per turn, so the **spoken form's** effect and the **switch's own** effect are never confused:
`typed, off` (what the written turn gives today), `spoken, off` (the transform's own damage), `spoken, ON`.

Three arms. `spoken` keeps the commas and sentence stops, which is what Deepgram Flux actually writes — the
recordings are punctuated. `unpunctuated` is the brief's literal reading ("no punctuation") and is strictly harsher.
`fillers` injects ", um, " before every result introducer, deterministically.

| arm | reading | claims | correct | wrong | unclear | flags | verified |
|---|---|---:|---:|---:|---:|---:|---:|
| **spoken** | typed, off | 40.4 | 39.9 | 0.2 | 0.3 | 1.9 | 83.3 |
| | spoken, off | 23.7 | 20.0 | **3.5** | 0.2 | **4.9** | 54.0 |
| | **spoken, ON** | 26.8 | **26.3** | **0.3** | 0.3 | **1.7** | 62.0 |
| `fillers` | spoken, off | 0.7 | 0.5 | 0.1 | 0.0 | 1.7 | 34.7 |
| | spoken, ON | 2.2 | 2.0 | 0.1 | 0.1 | 1.6 | 36.1 |
| `unpunctuated` | spoken, off | 23.9 | 20.0 | 3.7 | 0.3 | 5.5 | 54.2 |
| | spoken, ON | 27.2 | 26.0 | 0.7 | 0.5 | 2.7 | 63.2 |

**The headline of the realistic arm is that the pass is a repair, not a risk.** The spoken form on its own almost
triples the written flag rate (1.9 → 4.9 per 100) and multiplies the wrong-claim rate seventeenfold (0.2 → 3.5),
because a share said as "point two five" loses its whole part and its digit words become operands. With the switch
on, both come back to the written level: **flags 1.7 against the written 1.9, wrong claims 0.3 against 0.2.** It
removes **221 false flags** the spoken form raised and adds **none**.

### The four gate lines

| line | result |
|---|---|
| **verified-correct and flag rates within a few points of the typed originals** | **Met in the realistic arm, on the flag side, and not on the verified side.** Flags **1.7 vs 1.9** per 100 and wrong claims **0.3 vs 0.2** — inside a point. Verified-correct is **26.3 vs 39.9** and verified figures **62.0 vs 83.3** — 13 and 21 points short, which is **not** "within a few points" and I am not going to call it met. The shortfall is the spoken form's, not the switch's: the switch lifts correct from 20.0 to 26.3 and verified from 54.0 to 62.0, and what remains is §1's D–J list — chiefly currency and scale words ending the expression (H, I), "of" as multiplication (D), and `normalizeNumberWords` reading a lone spoken "one" as a pronoun, so "**one** minus 2.86 divided by 3.54 is about 19 percent" loses the whole-as-1 reading the written "1 − 2.86/3.54" gets. In the `fillers` arm the shortfall is far worse (correct 2.0 vs 39.9): see the judgement call on the bare "is" below. |
| **0 new false flags or false corrections** | **Met for the switch, in the realistic arm: 0 new flags, 0 new corrections against the same spoken text with the switch off.** 221 flags removed. In the two synthetic arms the switch raises 2 flags each: in `fillers` they are `a1133734 t30` ("250 million **adults** × 1.6% × …") and `bbf78ab8 t8` ("3 thousand **flights** × 80 × 75%"), both of the **noun-break** class that task 6 reported and deliberately did not fix — **the written originals are flagged too**, at 200,000 and 180,000 instead of 200 and 180 (pattern H); in `unpunctuated` they are `527217df t8`'s two, from paragraphs merging once the sentence stops are gone. None is a new false flag on a well-formed spoken sentence. **Against the written original** the spoken form leaves 7 residual flags in the realistic arm, each read: 2 are the noun-break pair above; `4356f4ca t20` is the lone-"one" gap; `eb9f0abb t12` is a lost arithmetic claim letting a pre-existing case step check through; `d8ee5c25 t12` and `da2fd287 t16` are my transformer's own doing (quote marks and an em dash removed); `9dd34b4a t16` is a currency word ending the chain. **All 7 are present with the switch off as well**, so none is the switch's. The 2 residual corrections (`3f57efeb t10`, `2caaa8a4 t10`) are the same transformer artifact — an em dash removed changes the sentence split, so a figure the written form flags and the spoken form verifies; the unit error itself (`unit:COGS 10`) is still flagged in every reading. |
| **the typed corpus's output identical with the switch on** | **Met, and exactly: 0 of 6,304 candidate messages** across 518 runs change their arithmetic claims, their flags or their verified figures — spans, computed values, `approximate` and `selfCorrected` included. This is the constraint that shaped the pass: the first version differed on 5 messages, each by span text only, and every narrowing in §2's right-hand column comes from closing one of those. (`normalizeSpeech` still rewrites the *text* of 27 of the 6,304 — a mid-sentence "um" before a figure — but not one of them changes a claim, a flag or a verified figure.) |
| **prof-001 identical with the switches off** | **Met.** With `speechNormalization` off, `checkStatedArithmetic` computes the same text it always did, which the identity check above covers for every case including `prof-001`. The 31-slice replay at HEAD with `*=phase1` is byte-identical to the previous round's own arm (§4). |

---

## 4. The existing gate — nothing else moved

| line | result |
|---|---|
| fault bank, switches off (`sn-off`) | fault **48 pass / 154** counted, correct **95 / 95**, `run_missing` 0 |
| fault bank, `*=phase1` (`sn-p1`) | fault **78 pass / 154** counted (78/153 after the one `phase2`-owned record), correct **95 / 95**, `run_missing` 0 |
| no record left the gate's denominator | **Met.** `compare --against=nw3-gate-p1 --to=sn-p1`: 316 → 316 records, **0 moved, 0 left the denominator**. Same for `nw3-gate-off → sn-off`. (Comparing the `on` arm against the `off` arm instead reports one divergence, `b35q-marisol-t32-close-over-false` — that is the preset changing which kind of turn code writes, not a regression, and it is why the control is the previous round's matching arm.) |
| 31-slice replay at HEAD vs the previous round | **Met.** `compare.py nw3-gate sn-gate` over all 31 slices (230 runs, 6,020 turns): **0 changed checker decisions, 0 changed interviewer lines, 0 runs on one side only** |
| `scripts/fact-check.ts` with `env -u ENGINE_SWITCHES` | **F1 0 · F2-next 97 · F2-rec 11 · F3 0 · F4 0** over the 31 `sn-gate` slices — exactly the 27 Oct gate's numbers |
| suite / types / lint | `npx vitest run` **5,862 passed / 9 skipped**, `npx tsc --noEmit` clean, `npx eslint lib app components tests scripts db` clean — at each commit |

Labels, all under `CaseTester-proof-out/`: `fault-bank-sn-off`, `fault-bank-sn-p1`, `sn-gate`. Nothing written
inside the corpus; nothing under `Case Interview Runs/` staged.

---

## 5. Judgement calls, each with its cost if wrong

1. **The pass must be a byte-identical no-op on the typed corpus, and that constraint outranks coverage.** Every
   transform is narrowed until the 6,304-message identity check is clean, even where the wider form would have read
   more speech. *Cost if wrong: the pass reads less spoken arithmetic than it could — §1's D–J list. I would make
   this trade again: the whole risk of this change is a false flag spoken at a candidate, and "it cannot change
   anything about written text" is the cheapest hard bound available on that risk.*

2. **A filler before a bare "is" is not read through, so the `fillers` arm stays near zero.** The reader crosses a
   comma only for the introducers it already accepts — "so", "which is", "that's", "gives us", "about", "roughly",
   "=", "≈". The recordings' own example happens to use "gives us" (`9813d6ce t14`), so it works; the synthetic
   arm's ", um, is 14.7" does not, and that is why its claim rate is 2.2 against the written 40.4. Adding `is`,
   `are` and `equals` to the set — only where a hard filler was removed, which cannot happen in writing — is one
   small, well-bounded change and would be my first recommendation if Lorenzo wants more coverage. **I did not make
   it, because the brief says to normalize only patterns the recordings show, and the bare-"is" shape does not occur
   in the 131 turns.** *Cost if wrong: the commonest spoken introducer stays unread, so a real pilot will see far
   fewer claims than the three here suggest — this is the single biggest thing I left on the table, and it is
   measurable the same way in an hour.*

3. **"of" as multiplication is left out** (pattern D), although it is the most frequent unread shape in the
   recordings — five true claims. It fires on written text, so it cannot pass the identity gate as a speech-only
   transform. *Cost if wrong: five true spoken claims per corpus stay unverified. A narrow form (`<figure>% of
   <figure> is <figure>`) might be gateable; it needs its own measurement, and "25% of COGS" is exactly the sentence
   the existing rule exists to protect.*

4. **"and (you) get" is left out** (pattern F) on 43 real written uses. *Cost if wrong: one true spoken claim.*

5. **Scale and currency words after a figure are left out** (patterns H, I). They are `spokenMathParser`'s
   tolerances 1 and 2, which only ever remove a flag; teaching the **live reader** to absorb them changes a figure's
   magnitude by 100× or 1,000×. *Cost if wrong: every money or scale figure a candidate speaks in words ends its
   expression, which §3 shows is a large part of the verified-figure shortfall. This is the second thing I would
   take to Lorenzo, and unlike item 2 it needs real care.*

6. **An abandoned mid-thought figure is left unparsed** (pattern M), including `9ccf0836 t10`'s "9.3 × 3 is, like,
   twenty". *Cost if wrong: a real slip inside a sentence the candidate withdraws passes unflagged.*

7. **The three `fillers`/`unpunctuated` switch-flags are called not-new rather than new.** They are the noun-break
   pair the written originals also flag, and two merged-paragraph flags in an arm with no sentence stops. *Cost if
   wrong: I have understated the switch's blast radius by three records in two synthetic arms. The realistic arm's
   number, 0, is the one the recordings support.*

8. **The voice arm treats the whole ledger as revealed.** Six of fifteen sessions have no DB dump. *Cost if wrong:
   the voice flag and verified rates are at most as high as the real ones; the claim count — the number that matters
   — does not depend on reveals at all.*

9. **The replay's STT transform is mine, not a recognizer's.** It accounts for three of the seven residual
   form-flags (a stripped em dash, stripped quote marks). *Cost if wrong: the spoken-form damage in §3 is slightly
   overstated. It cuts against the pass looking good, not for it.*

10. **The switch is out of the preset and this report asks before it goes into any.** Lorenzo's explicit
    instruction, and the right default for the first Phase 1 change that raises claims rather than withholding them.

---

## 6. Recommendation

**Keep `speechNormalization` out of the `phase1` preset for now, and pin it on for the next voice session only.**

The safety case is as strong as a free measurement can make it: 0 of 6,304 written messages change, 0 new flags on
spoken text, 221 false flags removed, every claim it raises on the recordings hand-checked and correct. The reason
to wait is not safety, it is **value**: three claims on 131 turns is a small return, and item 2 above says why — the
commonest spoken result-introducer is still unread. A preset entry now buys little and spends the one thing this
change cannot get back, which is the first live evidence of it raising a claim at a real candidate.

So: run it on a live voice session behind `ENGINE_SWITCHES`, read the transcript, and decide the preset on what the
candidate actually heard. If Lorenzo would rather widen it first, item 2 is the change to make, and §3's harness
measures it in one free run.
