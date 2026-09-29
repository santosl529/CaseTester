# Case Authoring Rules

Source: pilot transcript review (July 2026). Complements `docs/interviewer-behavior.md`.

## Pre-flight ledger consistency (hard QA gate)

Every case must be internally consistent before it ships: the prompt's stated
problem, the data-ledger values, the exhibits, and the math-step answers must
all reconcile with each other.

Why this is a hard gate: in a pilot run, prof-001's prompt said margins fell
12% → 6% while the P&L data (42→58% COGS, 22% labor, 12→14% overhead) implied
24% → 6%. The candidate correctly computed "the 18-point profit decline
(24% → 6%)" and the interviewer silently ratified the contradiction. An
inconsistent ledger is worse than a mid-case fabrication — it corrupts every
downstream number and there is no prompt rule that can save the interviewer
from it.

Requirements:

1. **Reconciliation test per case.** Every case file gets a `describe` block in
   `tests/cases/consistency.test.ts` that checks, in code:
   - cost-structure exhibits sum to 100% (or their stated total) in every period;
   - the prompt's headline figures match the exhibit/ledger they summarize;
   - every `mathSteps[].answer` is derivable from ledger/exhibit values, and the
     derivation is written into the test;
   - cross-item identities hold (e.g. revenue ÷ store count = revenue per store);
   - **the stated root cause is derivable from the ledger.** If
     `interviewerNotes`, an exhibit `interpretationKey`, or the
     `recommendationKey` says X drives the change, the ledger must contain the
     figures that make X add up, and the test writes the attribution out.
     prof-001 shipped claiming coffee beans (+40%) explained the entire
     16-point COGS jump — true only if beans were ~95% of COGS. The P&L summed
     perfectly, so every existing check passed, while candidates who did the
     share-of-COGS math correctly (beans explain ~a quarter) were graded
     against an answer the data could not reach.
2. **No case ships without its consistency block.** This is part of the 50-case
   QA gate alongside the zero-hallucination run (FR-4).
3. **Math-step descriptions must be clean derivations.** No author notes, doubts,
   or "flag:" comments in `description` — those belong in review, not in the
   shipped file (a pilot case shipped with "24%? No: prior was 12%..." in a
   description).

## Ledger values must be speakable sentences

When the interviewer reveals a ledger item, the orchestrator appends
`value` **verbatim** to the interviewer's spoken text (and M2 will speak it
aloud). Write every `value` as a complete spoken-language sentence, not a data
fragment.

- Bad: `"+40% increase in raw coffee bean costs"` (reads as a non-sequitur
  after "let me show you that data")
- Good: `"Raw coffee bean costs are up 40% over the past two years."`

Keep the canonical figures (`$480M`, `58%`) in the sentence so the
consistency test and the post-turn number audit can match them. One value = one
item: if a sentence bundles several figures (current + prior), that's fine, but
don't merge separate ledger items into one value.

## Exhibits declare the ledger items they display

If an exhibit shows the same figures as ledger items (prof-001's cost exhibit
shows the COGS, labor, and overhead percentages), list those ids in the
exhibit's `coversLedgerItems`. Showing the exhibit then marks them revealed,
exactly as if they had been read aloud. Without it, the ledger believes the
candidate never received data they have been working from: open-request hints
and scoring disagree with the transcript, and Rule 11's force-release re-reads
the figures to them before the recommendation ask (live run db41a01e). The
consistency test checks every listed id exists in the ledger.

## `mathSteps` double as the live recompute backstop

`docs/interviewer-behavior.md` Rule 2/14's deterministic recompute check
(`lib/orchestrator/recompute.ts`) and the judge's math grading
(`lib/scoring/judge.ts`'s `DETERMINISTIC MATH CHECK RESULTS` section) both run
against `mathSteps` — there is no separate derivation-formula config. Every
number a strong candidate should derive live (margin math, dollar impacts,
per-unit figures, nested-percentage conversions) needs a `mathSteps` entry with
an accurate `answer` and a deliberately chosen `tolerance`, or neither backstop
can catch a candidate getting it wrong.

`tolerance` also sets the boundary between `minor` and `case_breaking`
classification (a ≥2× relative-magnitude miss, or wrong sign, is always
`case_breaking` — see Rule 14). Author `tolerance` as the real acceptable
rounding band, not a loose catch-all; too generous a tolerance lets a
case-breaking error read as a non-issue.

**`altAnswers` for genuinely ambiguous quantities.** Some prompts admit more
than one defensible numeric result — e.g. "the dollar impact of the COGS
increase" can mean the margin impact (points × current revenue) OR the actual
increase in COGS *spend* (which also reflects revenue growth). Put every
defensible result in `altAnswers`; a candidate landing on any of them is not
flagged as an arithmetic error. Whether they then *use* the figure correctly
(e.g. don't treat raw spend growth as "the margin problem") is a conceptual
judgment the judge makes, not an arithmetic check. Do not use `altAnswers` to
paper over a genuinely wrong answer — only for quantities that are legitimately
computable more than one way.

**Source-span fields (required since v4.3).** Both checks used to treat any
number anywhere in the candidate's text as an attempt at a step. In the
27–28 Sep persona runs that produced all three false live corrections and a
false revenue-per-store error in most reports. Each step now declares:

- `cues` (required, ≥1) — phrases that name the step's metric ("per store",
  "margin", "impact"). A number counts toward the step only if a cue sits
  within five words of it in the same clause (clauses split at "but", "so",
  commas, dashes). Pick phrases a candidate uses when stating *this* quantity,
  not words that describe its inputs — "COGS" as a cue for the dollar-impact
  step matched "$280 million COGS", a spend figure.
- `unit` (`percent` | `points` | `usd`) — when set, only numbers that state
  this unit count. Unitless ratios and hypotheticals ("1 minus 0.94") are too
  weak to attribute. Set it on every step whose answer has a natural unit.
- `inputs` — the ledger item ids the step derives from. The step is checked
  only after all of them are revealed (live) or were revealed at some point
  (scoring). Leave empty only for steps derivable from the case prompt alone.
  Unknown ids fail case load.
- `live: false` — keeps a step out of the live recompute hint while still
  scoring it. Use it for figures stated in the case prompt (prof-001's 24% → 6%
  margins): candidates quote and reuse those constantly, and target margins
  ("back to 15%") read as wrong answers.

Before shipping a case, replay the checks over real transcripts and confirm
zero false live flags — see the v4.3 replay in `docs/interviewer-behavior.md`
Rule 2.

## Pacing config (optional)

Cases may set `pacing.phaseBudgetsMs` (per-phase time budgets, must sum to the
total case time, `TOTAL_CASE_MS` — currently 20 minutes — enforced by
`tests/cases/consistency.test.ts`) and
`pacing.timeWarningMs` (default 30s before time runs out). Omitted entirely,
the orchestrator falls back to an even split across the 8 active phases and
the 30s default warning (`lib/orchestrator/pacing.ts`). Prefer setting
`phaseBudgetsMs` for any case where structuring or analysis legitimately needs
more than an even 1/8th share of the clock — a uniform default fires spurious
pacing nudges during a healthy opening on an analysis-heavy case.
