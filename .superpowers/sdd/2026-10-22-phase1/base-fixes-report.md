# Phase 1 — two base regressions from the fault bank (branch `phase1-base-fixes`)

Branch `phase1-base-fixes`, off `phase1` a1f16107. Two commits, both **ungated** plain
bug fixes (no Phase 1 engine switch), like Stream 3's scale fix:

| commit | what |
|---|---|
| `56c54edd` | a pending correction rides on any stage turn code writes, never dropped (b35q) |
| `cb38676f` | an overdue stage turn holds the probe, whatever else made it go (b34l) |

Suite 5,196 pass (9 skipped), `npx tsc --noEmit` clean, `npx eslint lib app components tests scripts db` clean at each commit.
No API spend: every measurement is the free replay. Nothing under `Case Interview Runs/` was staged.

---

## 1. `b35q-marisol-t26-correction` — a pending correction dropped on a code-written stage turn

### The mechanism

`plan-turn.ts` decided what a code-written turn does with the checker's selection from two
derived booleans:

- `deadlineStage` — this stage turn's kind would be *something else* if its deadline were
  let go, i.e. the deadline alone made it go;
- `overdueStage` — the stage's own deadline has passed.

and then:

```ts
const stageCorrection = overdueStage && sel && correctsNow(sel) ? sel : null;  // rides
const stageCodeLines  = overdueStage ? liveFlags.filter(codeCorrects)… : [];   // rides
const stageHeld       = deadlineStage && sel && !correctsNow(sel) ? sel : null; // waits
const checkerUsed     = sel && (kind === 'model' || stageCorrection || …) ? sel : null;
```

A stage turn or recommendation ask that **complete coverage** forced (`awaitingRecAsk`,
from `canEndCase`) satisfies *neither* boolean: it is not overdue, and because coverage
would force the same kind with the deadline held, `deadlineStage` is false too. The
selection is then not said (`checkerUsed` null, the model never ran), not booked — the
selected decision is filtered out of `checkerDecisions` by
`filter(d => … || checkerUsed)` — and not held. It is **dropped**: nothing records it, so
it carries only by luck, and it expires three messages after its claim or goes stale the
moment the candidate restates the figure.

The named record is a replay failure, but the fault is real and **visible in a live run**,
which is the stronger evidence. `batch-37-quillpath` Raj `e08c362a`, as recorded:

| turn | kind | coverage may end | overdue | selected | used |
|---|---|---|---|---|---|
| t24 | `stage_exhibit` | yes | no | `19:0` **correct** | `null` |
| t26 | `rec_ask` | yes | no | `21:0` **correct** | `null` |
| t28 | `model` | — | — | — | `19:0` **expired**, "3 messages since the claim" |

Two corrections in a row lost on one case. The `$600, not $405` correction of his
`starter_ltv` root — the figure his whole recommendation rested on — was selected at t24,
again at t26, and only actually said at **t36**, the second-to-last turn.

In `b35q` Marisol itself the t26 turn is a coverage-made `rec_ask` of exactly this shape;
the recorded `$4,000, not $2,400` line cannot be reproduced in replay because that run
diverges from t12 (a row fix at t12 closes the `21.5%/40%` inputs and everything built on
them becomes report-only), so the record is a cascade failure. The mechanism Lorenzo named
is nevertheless exactly right, and b37q Raj shows it live.

### The fix

One predicate: a correction rides on **every** turn kind code writes for a stage or the
recommendation ask, overdue or not.

```ts
const stageTurn = DEADLINE_KINDS.has(kind);   // stage_exhibit | stage_brainstorm | stage_analysis | rec_ask
const stageCorrection = stageTurn && sel && correctsNow(sel) ? sel : null;
const stageCodeLines  = stageTurn ? liveFlags.filter(codeCorrects).map(f => recMathLine(f, 'correct')) : [];
```

Everything downstream already handles it: `session-runner.ts`'s `codeWrittenTurn` puts
`stageCheckerLine.line` first in the turn's `say`, Settle puts it before code's
recommendation question, and the heard-check/undo path is the one a model turn uses. Only
the probe still waits. This is the standing rule as written ("a correction goes first");
the base honoured it only when the deadline made the turn.

### Tests

`tests/orchestrator/due-stage-checker.test.ts`, in the existing R7 runner describe (real
`runTurn`, prof-001, the b37q/b35q shape — coverage complete, a stage owed, the deadline
not yet reached, one correction pending). Both failed before the change with the
correction missing from the spoken turn:

- *coverage complete at 10:00, the brainstorm owed but not yet due: the correction rides on the brainstorm turn*
- *the same at code's recommendation ask (the brainstorm already delivered): the correction before code's question*

`tests/orchestrator/stage-deadlines.test.ts` — one existing test asserted the old
behaviour and was updated (see judgement calls): *a stage turn coverage makes before its
deadline (12:00): the correction rides on it too*.

---

## 2. `b34l-marisol-t26-probe` — the brainstorm was genuinely due; the probe was dropped, not held

### Was the brainstorm pulled forward?

**No.** It was overdue from t24. In the replay of `batch-34-larkspur` Marisol `e6432db0`,
t26's `stage_yield` reads `deadlineStage: false, overdueStage: true` — the brainstorm's
deadline (the exhibit budget's end) had passed, and t24 was already a `stage_brainstorm`
turn that spent itself on a data line.

What differs from the live run is the **once-per-stage yield**. Live, t26 yielded
(`yielded: ["brainstorm"]`) and the `$2,800` probe went out, with the brainstorm at t28.
In replay it did not yield, because `yieldedNow` only counts a yield when holding the
stage would change the kind — and `awaitingRecAsk` (complete coverage) forced
`stage_brainstorm` either way.

And the coverage difference at that exact turn is a **replay artifact**. The harness has
no coverage scores, so `canEndCase` falls back to
`elapsedMs >= totalMs * COVERAGE_TIME_FLOOR_FRACTION`; the turn's recorded elapsed is
1,205,145 ms and prof-002's floor is 0.8 × 1,500,000 = 1,200,000 ms. It flips to may-end
5 seconds over the line, on the one turn in question, while the live run's real coverage
agent said not complete (`coverageMayEnd` is false in every saved record up to
`turnIndex` 29). So `b34l-marisol-t26-probe` fails as an artifact, and should be judged
as one.

It did, however, expose a real base fault on the same turn: with the stage legitimately
winning, the probe was **dropped instead of held**. `stageHeld` required `deadlineStage`,
so `flags.mathChecker.held` was never written, no `undelivered` decision was recorded, and
23:0 simply vanished from the plan.

### The fix (small, made)

```ts
const stageHeld = (deadlineStage || overdueStage) && sel && !correctsNow(sel) ? sel : null;
```

A stage turn **past its own deadline** holds the probe, whatever else also made it go.
Held, it keeps its turn, is exempt from the three-message expiry, and takes the next turn
over code's coverage ask (`awaitingRecAsk` already contains `&& !heldNow`). That is
verbatim the standing rule: "the probe is held to the next turn, once". The
`heldDecision` reason text was made accurate for a turn that is overdue without having
yielded.

In the b34l run itself the held probe then goes `stale` at t28 — the candidate withdrew
the claim ("Let me redo it.") — which is the correct outcome and why the fix changes no
spoken line there.

### What is **not** fixed, deliberately — two known base issues for the gate report

**(a) The once-per-stage yield is defeated by a second reason forcing the same kind.**
`stageDue` is `owedStage !== undefined && ptClosed && !timeUp && !underTimePressure &&
(closeDue || awaitingRecAsk || byTime(...owedDeadline))`. The `held()` gate lives only
inside `byTime`, so a stage turn that complete coverage (or the close) forces can never
yield to a probe, even its one allowed yield. Proposed fix: gate the coverage arm on the
yield too — `(awaitingRecAsk && !held(owedStage))` — leaving `closeDue` unconditional.
I did **not** make this: it changes stage ordering on the coverage and close paths, the
engine already distinguishes deliberately between yielding to an *already-held* line
(which it does, via `!heldNow`) and yielding to a fresh probe (which it does not), and
Lorenzo's instruction was to fix b34l only if small. This needs his ruling.
It is also what would make `b34l-marisol-t26-probe` pass, so if the record is kept as
replayable the gate should expect it to fail until (a) is ruled on.

**(b) A stage turn *inside* its budget still drops the probe.** The hold now covers
overdue stage turns; a coverage-made stage turn before the deadline still leaves a probe
unbooked. Measured cost of extending the hold to every stage turn
(`stageTurn && sel && !correctsNow(sel)`): 4 changed interviewer lines, all in
`b32-on` Marisol `6e5a1c90` — one improvement (t20 probes her live 8,000-flight claim
instead of the 10,000 one she withdrew two messages later), the case closing at t28 rather
than t30, and **one new fault**: t24 became "Got it. Of the risks you listed, which one
could most undermine this recommendation? What were the steps in that calculation?" — a
dangling question, because `probe_guard` withheld the model's setup sentence ("And earlier
you said … = $4.8M.") and left its trailing question behind. That is a pre-existing gap in
`settle-turn.ts`'s `mathWithheld` rule, which takes a challenge's *setup* with it but not
its trailing question. Proposed order: fix that veto first (drop a bare trailing
"what were the steps / walk me through that calculation" whose referent sentence was
withheld), then extend the hold. I reverted this wider variant; the narrow one ships.

---

## 3. Replay evidence — every changed turn

Free replay, the round-6 `proof.sh` pattern (its slices and verdict sets) plus a
`b38l-off` slice (b38 Larkspur has no recorded checker verdicts, so off only): **30 slice
runs — the 21 standard ones plus b36a/b36l/b37h/b37q off+on and b38l off**. Script and the
extended `compare.py` in this session's scratchpad; output outside the corpus at
`/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-base-fixes-{base,fix1,fix2,final}`,
with `compare-phase1-base-fixes-base-vs-phase1-base-fixes-final.md`.

The `base` run (a1f16107, the two fixes stashed) reproduces `r6-final` byte-for-byte on
the runs checked, so the comparison is against the contract base.

**Totals, base → final: 11 changed interviewer lines in 3 of 30 slice runs, 2 added
bookkeeping rows in 2 more, and `fact-check` counts identical on every one of the 30
(F1/F2-next/F2-rec/F3/F4 unchanged everywhere — 0 new hallucinated figures, 0 new wrong
releases).** 26 of the 30 slice runs are byte-identical; every `-off` arm is identical.

| slice run | decisions changed | lines changed |
|---|---|---|
| b31-on | 1 | 0 |
| b33-on | 2 | 2 |
| b34l-on | 1 | 0 |
| b35q-on | 17 | 3 |
| b37q-on | 26 | 6 |
| the other 25 | 0 | 0 |

### Turn by turn

**b31-on** Blake `47fa8cfd` t21 — *fixed (bookkeeping)*. `19:0` ("What steps got you to 1
point?") was dropped on an overdue coverage-made `rec_ask`; it is now recorded
`undelivered` / held. No spoken line changes.

**b34l-on** Marisol `e6432db0` t26 — *fixed (bookkeeping)*. `23:0` ("What steps got you to
60?") is now `undelivered` / held instead of vanishing; it goes `stale` at t28 because she
withdrew the claim. No spoken line changes. The fault-bank record still fails, as an
artifact (§2).

**b33-on** Jasmine `5cfdf48e` — *fixed*. **This is prof-001.**
- t16 `rec_ask`: `+ "From today's 6% margin, with COGS varying with volume, a 10% price
  rise breaks even at about a 19.2% volume loss, not 5-6%."` before "If you had to advise
  the CEO now, what would you recommend?"
- t18: the same line no longer said here; the risk question stands alone.
- The correction is said **exactly once** in both runs. It now reaches her *before* she
  gives the recommendation instead of after — the point of the rule.

**b35q-on** Tyler `ee99bd82` (pricing-001) — *1 fixed, 2 neutral, 1 trade, 1 artifact*.
- t24 `rec_ask`: `+ "Pro sign-ups a month lost after Starter launched is about 150."`
  before code's recommendation ask (it was said on the next model turn before). *fixed.*
- t26: **text unchanged**, but it now repeats the t24 correction. *Replay artifact*: the
  replay replays the model's saved output for t26 verbatim, and in the recorded world the
  flag was still open at t26 so the model had been given its hint. Live, the flag is
  closed at t24 and no hint goes out. Worth noting as a residual: the "said twice" guard
  covers code's own lines, not a model's spontaneous repeat of a closed correction.
- t28: `- "Extra value per month … is about $0.24k, not $210k. Would that change your
  recommendation at all?"` `+ "Before we wrap up — show me how you got to 676."` *neutral*
  — 676 is his own figure from the previous message, and `23:1` previously **expired**
  unprobed.
- t30: the `$0.24k, not $210k` correction, two turns later, with "Does your recommendation
  change, given that?". *neutral.*
- **The trade:** `25:2` ("Starter standalone lifetime value at $40 is about $600, not
  $405.") is no longer spoken; it ends `unresolved_at_close` and goes to the written
  report. The binding constraint is `WRAP_UP_PROBES = 2`: the t28 probe takes a slot the
  correction had. No new false statement, but one correction was traded for one probe of a
  flag that used to die silently. This is the only debatable consequence of fix 1 in the
  whole corpus.

**b37q-on** Raj `e08c362a` (pricing-001) — *1 fixed, 5 neutral knock-ons*.
- t24 `stage_exhibit`: `+ "Starter standalone lifetime value at $40 is about $600, not
  $405."` before the exhibit. **This is the fault itself** — the correction that was
  dropped at t24, dropped again at t26 and only said at t36. *fixed.*
- t28/t30/t32/t34/t36: the probe chain re-orders because `21:1` is now closed at t24 — the
  `$620,000`, `$940k` and `$905,000` probes and two second-step hints go in a different
  order. All on his own figures; *neutral*.
- One consequence to record: at t32 the base had the model's own voluntary risk question
  ("What's the single biggest risk to your recommendation, and how would you protect
  against it?"); now a probe takes that turn, because the risk is not yet *due*
  (`stagesDue.risk` needs the recommendation in or the time warning). The risk is asked at
  the time warning instead (t38, with the recommendation, per the late-rec-ask rule) and
  the end gate is satisfied at t40, as before. He never gives a recommendation in either
  run.

### prof-001

prof-001 runs the b28, b29, b30, b31 and b33 slices. With the checker off (`-off` arms)
prof-001 is **byte-identical**. With recorded verdicts: b28-on, b29-on, b30-on identical;
b31-on gains one bookkeeping row and no spoken line; **b33-on Jasmine is the one prof-001
run whose spoken text changes** — the one correction moves from t18 to t16, onto code's
recommendation ask, said once, as described above. The fix legitimately touches it: it is
the same coverage-made recommendation ask the fault is about. `fact-check` on every
prof-001 slice is unchanged.

---

## 4. Judgement calls

1. **Fix 1 is wide, fix 2 is narrow.** Corrections now ride on *any* code-written stage
   turn or recommendation ask; probes are held only on one past its own deadline. The
   asymmetry is Lorenzo's own ("a correction must ride … never drop. Fix now" vs "a
   pending probe takes precedence … fix if small") and the standing rule's ("a correction
   goes first" is unconditional; "the probe is held … once" is conditioned on a *due*
   stage). The wider probe hold is measured and written up in §2(b) rather than shipped.
2. **I did not implement "a pending probe takes precedence over a stage turn".** In b34l
   the stage was past its deadline, so time did force it; giving a fresh probe precedence
   means change (a) in §2, which is a stage-ordering decision on the coverage and close
   paths. Logged for a ruling instead.
3. **One existing test was changed to the opposite assertion.**
   `stage-deadlines.test.ts`, "a stage turn coverage makes before its deadline (12:00) is
   not overdue: the correction waits (unchanged)" asserted `stageCheckerLine` is null and
   code says nothing. It was written as a scope boundary of the 19 Oct review fix 1, not
   as a ruling, and its word "waits" turns out to be wrong — nothing carried the line. It
   now asserts the correction rides.
4. **Two assertions loosened, intent preserved.** `math-checker-plan.test.ts`'s two
   "on a code-written turn … the flag waits" tests asserted
   `flags.mathChecker` is `undefined`. They now assert `handled` is empty (plus, for the
   first, that no `MATH CHECK FLAG` hint goes out) and keep the "no derived row" check;
   the turn in that fixture is an overdue stage turn, so the waiting probe is now recorded
   as held. Nothing those tests were about has changed.
5. **b35q Tyler's trade accepted** (§3): one correction to the report in exchange for one
   probe of a previously-expiring flag. Reversing it would mean raising `WRAP_UP_PROBES`,
   which is Lorenzo's number.
6. **b35q Tyler t26's doubled correction classed as a replay artifact**, on the grounds
   that the model's saved say for that turn was produced while the flag was still open.
   Flagged as a residual rather than fixed.
7. **b34l's fault-bank record classed as an artifact, not a regression** — on the
   `COVERAGE_TIME_FLOOR_FRACTION` arithmetic in §2, which puts the turn 5 seconds over the
   fallback floor. The Stream 1 review's "real base change" reading is half right: the
   turn ordering is an artifact, the dropped probe underneath it is real.
8. **b38 ran off only.** No recorded checker verdicts exist for batch 38, so the b38l
   slice has no `-on` arm; its 143 turns are identical.
9. **progress.md and the PRD were not touched.** No Phase 1 stream branch has touched
   them — they all report into `.superpowers/sdd/2026-10-22-phase1/` and the lead
   consolidates — and five branches editing the same "## Now" would conflict. The PRD §15
   entry for these two ungated base changes, and the progress.md line, are **owed at the
   phase1 merge**; the wording is in §1 and §2 above.
10. **No fault-bank run.** The bank lives on `phase1-s1-eval` and is not merged into
    `phase1`, and the Stream 1 review's fixes 1–5/14 are still owed, so a run here would
    report known-bad records. The two records' expected status after these fixes:
    `b35q-marisol-t26-correction` still fails (its run diverges from t12 for unrelated
    reasons — the mechanism is fixed and proved on b37q Raj instead);
    `b34l-marisol-t26-probe` still fails (artifact; it would pass only with change (a)).
    Both belong in the wave-judged or artifact column, not the gate's pass list.
