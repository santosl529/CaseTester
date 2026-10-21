# Case Authoring Rules

Onboarding a case end to end (stages, gates, costs, tracker): `docs/case-onboarding.md`.

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

## Ledger timeframes

Each ledger item declares the period of every figure its sentence states, keyed
by the figure as written: `"timeframes": { "58": "current", "42": "prior" }`.
Periods: `current`, `prior`, `change` (a growth rate or delta), `both` (a
figure that holds for both periods, e.g. "labor is 22%, stable"). The
interviewer-behavior Rule 6 timeframe check uses it to spot a calculation that
pairs one period's figure with another's (25% of COGS *two years ago* × 58%
COGS *today*). Every key must appear in the item's `value` (a test checks
this).

## Answer-key ideas

The recommendation key is prose; list the specific ideas in it — the levers,
numbers, and named options a strong answer *might* include — in
`answerKeyIdeas`, each with the phrases that name it:

```json
{ "idea": "Lower-cost commodity blend for budget-conscious locations",
  "phrases": ["commodity blend", "lower-cost blend", "cheaper blend"] }
```

A report may not fault a candidate for not producing one of these
(interviewer-behavior Rule 3 v4.5; `lib/scoring/answer-key-pass.ts` removes
any weakness that names one the candidate never raised). List only
*examples*. Do not list the case's core insight or a lever the rubric
expects (in prof-001, raising prices and addressing input costs): faulting a
candidate for never considering supply-side levers at all is a legitimate
judgment critique, and a phrase like "supply contract" would strip it.
Phrases are matched case-insensitively as substrings, en dashes folded to
hyphens.

## `mathSteps` double as the live recompute backstop

**Binding a figure to a step (13 Oct, after Larkspur).** Give every money step
a `scale` — `"unit"` for a per-unit figure ($4,200 per flight), `"million"` for
one stated in $M — and every count (passengers, patients, bags) `unit:
"count"`. Use `flagNotCues` for sentences that are about another quantity for
mismatch purposes but may still carry this step's correct figure (other routes,
another period, "per passenger", scenarios: "half of plan", "trigger", "to
break even"); `notCues` exclude a sentence from verification too. Check with
`npx tsx scripts/step-binding-check.ts "--root=<batch folder>"` and label every
flag in `evals/step-binding-labels.json`.

**`stepFlagsLive` (13 Oct).** A case's step flags only probe the candidate
once its step binding is validated: run the deterministic checks over its
transcripts and get zero false flags. Until then leave `stepFlagsLive` out —
its step flags are logged (`recompute_report_only`) and never spoken. Set it
to `true` only with that validation recorded (prof-001 is the only case).

**The anchor audit (19 Oct; `scripts/anchor-audit.ts`).** Before a case's first
wave, run it: an LLM reads the case JSON and the PDF (as text) and proposes, per
ledger item, the names candidates use for it and the asks it answers without
naming it; the script lints the proposal, writes a diff, replays a file of asks
(`--asks=`: real ones from transcripts, `evals/anchor-probes.json` for asks that
must not misfire) through today's anchors and the proposed ones, and `--apply`
merges a reviewed proposal into `factAnchors.names`/`covers`. Review is the
human step — strike a phrase that sends an ask to the wrong item, add the ones
the asks need. Batch 32: three false refusals of held data were asks no anchor
named; the model's raw proposal fixed one of five, the reviewed one all five.
Know the matcher: it splits a declared ask at commas, "and", "or", "plus" and
matches each part alone; names before covers; a name only when the rest of
its part is neutral words; a short generic cover ("average fare") fires on every
part that contains it.

**`factAnchors.covers` (13 Oct).** Before code says "I don't have X" it checks
whether a ledger item or a prompt fact covers X. Most asks are matched by an
item's names; `covers` lists the asks an item or prompt fact answers without
naming it: prof-001's store count (flat at 200) answers "same-store sales",
"same-store revenue", "new stores"; its net-margin prompt fact answers "net
margin"; Larkspur's competitor line answers "aircraft size". Keep phrases to
the thing asked for, not a qualifier: "same-store sales", not "same-store".
prof-001's average ticket answers transaction-volume asks ("transaction
volume", "transaction counts", "transactions per store") — the case gives
volume through the ticket and revenue (Lorenzo, 15 Oct; before that,
"same-store transaction counts" was refused as traffic the case doesn't hold).
A cut the case doesn't hold ("by store", "per item") isn't covered unless the
phrase itself carries it ("transaction volume per store"), and a further cut
beside a phrase ("broken down by customer segment", "per day") never is. An
item a phrase names for an ask also stays in that ask's scope when the model
maps it. A covering item is given (restated if already out), a prompt fact is
restated, and in a list only the entries nothing covers are refused. A
phrase is matched across the whole ask ("fares and volume" covers both
entries of the list it splits into). A prompt fact may carry no figure when
the prompt states it only in words (Larkspur's `planes_as_full`, direction
flat): it is restated by its `say`.

**Covers for the forms candidates use (20 Oct, round 5).** B1 and B2 refused
held data for "treatment mix", "breakdown by drug class", "store count",
"distribution rate", "chip volume" and "forecast versus actual" (D1–D5). Audit
covers for the mix / breakdown-by / how-many / store-count / trend forms of
every landscape and reach item. No bare category word ("distribution" would
also take "distribution costs", which are freight). A count ask ("how many …",
"number of …") of an item whose value states no figure gets the item's line
(when it isn't out yet) and "I don't have the number of …", unless a cover carries the count ("how many
stores" keeps `retailer_support` whole; the count rule is proposed, awaiting
Lorenzo). A one-off, upfront or setup cost asked of an item that states only an
annual or monthly figure is a finer cut the same way. Add each batch ask
verbatim, and a true-refusal probe per cover, to `evals/anchor-probes.json`.
On a tagged case (round 6, below) the matcher also folds plurals and a few
synonyms and reads the candidate's own sentence, so author the singular,
"how many" form once.

**`ledgerLookupLive` (13 Oct).** The exact lookup also reads ledger lines no
exhibit shows, figure by figure, for the quantity named next to each
(`lib/orchestrator/cell-lookup.ts`). Write such lines so each figure sits next
to its quantity ("variable cost of $11,000 per flight", "the average fare fell
from $240 to $160", "a 75% load factor", "80 seats"). A misread of these
figures is corrected only with `ledgerLookupLive: true`; until the lookup is
checked on the case's transcripts (`step-binding-check.ts --misquotes`, every
`misquote-report-only` flag read) leave it out — such flags are logged, never
spoken. No case is live yet.

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
  step matched "$280 million COGS", a spend figure. **Since round 5 (20 Oct,
  E6) the live stale reader reads them too:** a later figure closes the step's
  flag when it is tied to a phrase whose head noun a cue (or the checker's
  quantity) names. The engine adds no synonyms (Lorenzo), so the case's own
  words for the quantity belong here: launch-001's `launch_costs_total` takes
  "fixed costs" (Hollis Bay Tyler's "fixed costs $3.0 + $4.5 + $1.5 = $9.0
  million").
- `unit` (`percent` | `points` | `usd` | `ratio`) — when set, only numbers that
  state this unit count. Unitless ratios and hypotheticals ("1 minus 0.94") are
  too weak to attribute. Set it on every step whose answer has a natural unit.
  `ratio` (20 Oct, E3) is for a multiple such as LTV/CAC (pricing-001's
  `pro_ratio`, `starter_ratio`, `starter_ratio_with_upgrades`): it reads
  "2.5x", "2 times" or a bare figure, never a $ or % figure; code's line says
  "about 2 times", never "$2"; the claim is keyed by its x / times figure. A
  `usd` step at `scale: "million"` gets "about $9 million, not $8.8 million"
  for a bare "8.8".
- `inputs` — the ledger item ids the step derives from. The step is checked
  only after all of them are revealed (live) or were revealed at some point
  (scoring). Leave empty only for steps derivable from the case prompt alone.
  Unknown ids fail case load.
- `live: false` — keeps a step out of the live recompute hint while still
  scoring it. Use it for figures stated in the case prompt (prof-001's 24% → 6%
  margins): candidates quote and reuse those constantly, and target margins
  ("back to 15%") read as wrong answers.

- `unit` may be a list (`["percent", "points"]`) when candidates state the
  step either way ("10.5% of revenue" / "10.5 points").
- `verifyOnly: true` (v4.6) — the step confirms correct figures
  (`recompute_ok`, interviewer-behavior Rule 2) but never raises a mismatch,
  live or in scoring. Use it for arithmetic surrounded by legitimate nearby
  numbers, where a span mismatch is too weak to act on: prof-001's bean
  steps (10.5 points, 4.2 points) sit next to "beans up 40%" in nearly every
  turn. Without a step, a correct figure cannot be verified, and the
  interviewer probes it (batch 2: four "points of what?" on correct 10.5s).
- `operands` (v4.6) — the figures a candidate states when showing their work
  (`[25, 42]` for 25% × 42% = 10.5). The work-shown test needs every operand
  plus an operation word in the figure's sentence or the two before it.
  Decimal forms count (0.25 for 25). A step without operands is always
  "work not shown".
- Verification matches the cue anywhere in the sentence, not just the
  clause — safe because it can only confirm a correct figure. Flags stay
  clause-scoped. Spoken numbers are normalized first ("ten and a half").

- `quantity`, `timeframe` (v4.10) — what the figure is ("net profit margin
  today") and its period (`current` / `prior` / `change`). A recompute flag
  names the candidate's claim in these terms, in the logs and for scoring.
  Server-only.

Before shipping a case, replay the checks over real transcripts and confirm
zero false live flags — see the v4.3 replay in `docs/interviewer-behavior.md`
Rule 2.

## `shareBases` — the unit check's base lines (v4.10)

A share OF a cost line converted into points of revenue must be multiplied by
that line's own share of revenue (beans at 25% of COGS, COGS at 42% of revenue
→ 10.5 points). The unit check (`lib/orchestrator/unit-check.ts`) does that
arithmetic itself, so it needs to know which lines candidates take shares of
and which ledger item gives each line's share of revenue:

```json
"shareBases": [{ "name": "COGS", "aliases": ["cost of goods sold", "cost of goods"], "item": "cogs_pct" }]
```

The values come from the base item's `timeframes` (prof-001: 58 current, 42
prior), and the check runs only once that item is revealed — the candidate
can't convert with a base they don't have. Without `shareBases` a case has no
nested-percentage check (and no keyword fallback: the v4.6 detector is gone).

## `sttKeyterms` — names the voice's speech-to-text should expect (17 Oct)

Deepgram Flux is opened with keyterms (`lib/voice/keyterms.ts`): the generic
case-interview terms (COGS, MECE, EBITDA, P&L, SG&A, SKU, CAGR, break-even,
percentage points) and the case's own names. List the client, products,
places and any coined term a candidate will say — written as the checks read
them ("Brew & Bean", "Kelvexa", "Corlan's disease", "Hub–Lakeport" cities).
At most 40; Deepgram advises 20–50 terms in all. Session 9ccf0836 heard
"COGS share" as "Cogshare", which no check reads as COGS.

```json
"sttKeyterms": ["Brew & Bean", "green coffee", "dairy"]
```

## `quoteAnchors` — the misquote check's item names (v4.11)

When a candidate misstates a figure they were given ("COGS went from 42% to
61%" when the exhibit says 58%), code corrects it once, in the ledger's own
words (Rule 6 option 4, `lib/orchestrator/misquote.ts`). To recognise the
quote it needs the words candidates use for each quotable item:

```json
"quoteAnchors": [
  { "item": "cogs_pct", "names": ["cogs", "cost of goods sold", "cost of goods"], "kind": "level" },
  { "item": "avg_ticket", "names": ["ticket", "average ticket", "transaction value"], "kind": "level" },
  { "item": "bean_price_change", "names": ["beans", "bean prices", "bean costs"], "kind": "change" },
  { "item": "bean_share_of_cogs", "names": ["beans", "bean share"], "kind": "level", "of": ["cogs", "cost of goods"] }
]
```

- `names`: lower-case words a candidate would put right before the figure
  ("COGS is …", "the ticket is …", "beans are up …"). Include the words
  candidates actually say, not only the label's ("ticket" for the average
  transaction value). A name may be shared by two items; a figure either
  states is not a misquote.
- `kind`: `level` for an item that states values ("58% … up from 42%");
  `change` for one that states a change ("up 40%").
- `of`: for a share item, what it is a share of — the quote must say so
  ("beans were 25% of COGS").
- The figures come from the item's `timeframes` (an item without timeframes
  can't be an anchor — the case fails to load). A shown exhibit's column
  counts too, matched by column name to the item's `names` ("COGS" → cogs).

Without `quoteAnchors` a case has no misquote check.

## Exhibit release order and notes (13 Oct)

An exhibit that must not come before others lists them in `after` (each
earlier in the `exhibits` list — no cycles), and any ledger items that must be
out first in `requiresItems`. `after` may also name the `brainstorm` stage: the
exhibit then waits until the brainstorm has been asked (by code or the
interviewer) — use it when the exhibit would give the brainstorm away (Hollis
Bay's sampling proposal). Under time pressure that wait is dropped, so a
required exhibit still goes out with the recommendation ask. Only a case whose
brainstorm is owed may use it (the loader rejects it otherwise). Until then code releases neither the exhibit nor
an item only it shows, on any path (a request, an ask covering its data, the
model's handover); an ask for it is deferred out loud, and the model is told it
is "not yet". A predecessor counts as out once shown, or once all of its data
has been read out as lines. Author the order the guide's release rules give:
Larkspur 1 → 2 → 3, Aldermoor 3 after 1, Quillpath 4 after 1–3, Hollis 3 after
1, 2 and the brainstorm.

`required: true` makes an exhibit owed before the case ends (Lorenzo, 13 Oct):
while it is unshown, code hands it over in place of a recommendation ask or a
close (with the ask, under time pressure). Its `after` exhibits must be
required too. The four AI Casing cases mark every exhibit required — each
opens a module of the guide. prof-001 marks none (one exhibit owed, as before).

Footnotes go in `notes` (one paragraph, shown under the table, never spoken),
not in the title: the title is read aloud at handover ("Here's an exhibit: …")
and sits in the interviewer's prompt before anything is released. Every figure
in the notes must be in a sentence the exhibit covers, like its cells
(consistency test).

**Notes are read by the candidate (20 Oct, D6, Lorenzo).** The chat and the
voice room's exhibit panel show them under the table, and since round 5 the
simulated candidate gets them too (`exhibitAsText`: the rows, then
`Note: <notes>`; before that, waves never saw them). Write them for the
candidate. Keep notes as notes; never move them into rows. Every item in
`coversLedgerItems` must have its figures and key words (words of seven or
more letters) somewhere on the exhibit: cells, column headers, title or notes
(consistency test). An item that came out only on an exhibit is restated as
"As the exhibit shows: <its ledger line>", one that was said as "As I
mentioned: …" (`restate_exhibit` pool), so a ledger line should read after
either lead-in. One that opens "As …" reads twice ("As the exhibit shows: As a
share of revenue…", prof-001; cosmetic, logged).

## The analysis ask's lead (13 Oct)

Write `analysisCore.ask` as "Let's hold the recommendation for now: <the
question>?". Code says the lead only when a recommendation is in play: the
candidate just gave one, or was just asked for one. Otherwise it asks the
question plainly ("What's driving the margin drop, …?").

## No unreleased figure in a label, an exhibit title or a stage line (FR-4)

Labels and exhibit titles are in the interviewer's prompt from the first turn;
`analysisCore.ask` and `brainstorm.ask` are spoken whenever code needs them.
None may carry a figure the case prompt doesn't state (years and period counts
like "over 2 years" aside) — "Survey: purchase intent at $3.99" told the model
the price before the exhibit was shown. Put the figure in the ledger sentence,
the exhibit's cells or its notes. Enforced for every case in
`tests/cases/consistency.test.ts`.

## Every item has a spoken name (13 Oct)

`spoken` is the item's name in a promise — "I'll come back to ___ shortly",
"I'll share ___ once we've settled your structure", "I can share ___ if you'd
like": a noun phrase, lower-case unless it opens with a name, no end
punctuation, no figure the prompt lacks, and nothing the candidate should
find out ("what changed on those two routes", not "a new competitor"). Every
item in every case has one (consistency test).

## Every math step lists its inputs (13 Oct)

`inputs` is required in practice: a step with none is checked from the first
turn, before its figures are out (consistency test). A prompt-derivable step
lists the ledger items that confirm it (prof-002's operating-profit swing:
the network totals and fixed costs).

## Covers on a tagged case (21 Oct, round 6)

A case with `factAnchors.tags` (below) gets round 6's cover matching; prof-001
has no tags and keeps the literal matcher. On a tagged case:

- **The matcher folds before it matches**, the ask and the phrase alike:
  plural and possessive endings, and `COVER_SYNONYMS` — "number of" / "count
  of" → "how many", "departures" → "flights", "doors" → "stores", "pricing" →
  "price" (as a noun). Don't author plural or synonym variants: "avoidable fixed
  costs" already covers "avoidable fixed cost", and "how many stores" covers "a
  distribution estimate by number of stores" (Hollis Bay Marisol t7, audit row 5).
- **The candidate's asking sentence is matched too**, not only the model's
  rewording, so a phrase can match an ask through the candidate's words.
- **A hit is dropped** when its list entry names another entity and not the
  item's own (the tags' entity words), when it names a region the item's label
  and line don't (Europe, EU, UK, Canada, Asia, international), or when a count
  is asked "in total" / "altogether" of an item whose line states no total.
- **A matched item is released only if its tags and scope agree**; otherwise
  the ask gets a named deferral with no small-model call.

**Writing covers** (Lorenzo, 21 Oct: "Each must be multi-word and specific,
with no bare "cost" or "flights"."):
- Multi-word and specific: the thing asked for, as candidates say it ("cost per
  seat mile", "total departures", "average fare by route"). Never a bare
  "cost", "flights", "distribution" or "volume".
- A phrase on two items only when the ask is answered by both (prof-002's
  "average fare by route" on both route fares, listed in the lint's
  `INTENDED_PAIRS`).
- A phrase that already gives the coarse form through the candidate's sentence
  doesn't need a cover: launch-001's "chip bag volume" was removed because it
  released `why_now` whole, where the sentence path gives `why_now` + "I don't
  have annual chip bag volume."
- A modifier before a phrase isn't read ("fixed costs per available seat mile"
  meets "cost per available seat mile"); keep that in mind for generic heads.

**The cover lint** (free, no model calls):
`npx tsx scripts/cover-lint.ts --runs "<main>/Case Interview Runs/test runs" --out <file.md>`.
It lists every folded phrase shared by two items' covers (intended / at BASE /
new), every candidate sentence and model-declared ask in the case's runs that a
new or changed phrase matches (or an existing phrase newly matches through the
fold), what the engine does with it and the `tagsAgree` verdict, every model ask
whose coverage changes from BASE, and the count per phrase. Read every match and
mark it "answers" or "doesn't"; narrow or remove a phrase with a match that
doesn't answer before committing it.

## `factAnchors.tags` — whose figure, and forecast or current (21 Oct, round 6)

prof-002's block (entity words shortened):

```json
"tags": {
  "clientWords": ["Larkspur", "our", "we"],
  "entities": [{ "id": "competitor", "rival": true,
                 "words": ["entrant", "competitor", "competitors", "low-cost carrier", "rival"],
                 "items": ["competitor_entry", "competitor_costs"] }],
  "forecast": ["new_routes_plan", "new_routes_cost_flights", "new_route_rampup"]
}
```

- `clientWords`: the words that name the client's own business or product
  (launch-001: "chickpea", "the line", "the new line", "roasted", "the snack").
  They are read outside a question's frame ("Do we know …" names nobody).
- `entities`: each other company or product the case talks about — the words
  that name it and the items about it. Items in no entity are the client's.
  `rival: true` for a competitor (prof-002's `competitor`, entry-001's
  `nimbrel`); leave it off for something the client owns (launch-001's `chips`
  is the client's own chip business). A rival's own item answers a competitor or
  benchmark ask.
- `forecast`: the items that state a forecast, plan or estimate. An ask with a
  current marker (today, currently, now, this year) doesn't get them.
- An ask naming another entity and no client word doesn't get the client's
  items; an ask naming one entity doesn't get another entity's items. An item
  whose own label or line names the asked entity counts as answering it
  coarsely (its line plus "I don't have <the ask>").
- Adding `tags` opts the case into round 6's matching and answer gate (period
  and scope on every path; topic, entity and forecast on the small-model
  check's verdicts). Ids must be ledger items or prompt facts; entity objects
  are strict (an unknown key fails load). A case with no entity confusion still
  gets an empty block (pricing-001: `entities: []`, `forecast: []`).

## `mustReach` — items code volunteers (21 Oct, round 6)

`mustReach: [{ "item": "<ledger id>", "before": "<exhibit id>" | "recommendation" }]`.
For content the guide says the candidate must have before a point, whether or
not they ask (prof-002: `competitor_entry` before `exhibit-3`, the network fix;
`new_route_rampup` before `recommendation`). Code releases the item first in the
data line on the turn that hands over that exhibit or asks for the
recommendation, if it isn't out yet. The report notes it as volunteered and the
judge doesn't credit the candidate for asking. Use it sparingly: it changes what
every candidate hears, and so the comparability of waves. prof-002 is the only
case with it.

## Step roots: `dependsOn` and `inputQuestion` (21 Oct, round 6)

- `dependsOn: ["<step id>"]` on a math step built on another step's result
  (pricing-001: twelve Starter steps depend on `starter_ltv`). Read
  transitively; unknown ids and cycles fail load.
- `inputQuestion` on a root step: one neutral question about the input the
  candidate may have misread ("Which row of the Starter cohort table did you
  use for cancellations?"). It must end in "?" and carry no digit — no figure,
  no arithmetic, no hint of the answer.
- With either field, a deterministic step flag on the root (live or
  report-only) links the derived claims built on it: they aren't probed one by
  one, and the root gets the question once. Code never corrects from the step
  flag alone; corrections still need the checker. Declare `dependsOn` only for
  real derivations: a step listed as dependent goes quiet while its root stands.
  pricing-001 is the only case with them; its step flags are report-only, so a
  false binding can ask an unneeded question (PRD §15).

## Labels say what the item is (v4.10)

The model maps requests to items by their labels, and so does the data-request
classifier. A label must describe the quantity — a composition, a level, a
change — not a category two items share. prof-001 had "COGS breakdown: coffee
beans as a share of COGS" and "COGS breakdown: other input cost changes …":
asking for "the COGS split" released the 37.5% price change in 7 batch-18
runs. They are now "Composition of COGS: coffee beans' share of COGS" and
"Price change of the other inputs (dairy, packaging, food) over 2 years". No
unique-prefix rule is enforced at load: two items may legitimately share
words; the label just has to say what each one is. Don't repeat the period in
the label (`labelWithPeriod` adds it from `timeframes`).

## Case format (v4.10)

`format`: `interviewer_led` (default) or `candidate_led`. An interviewer-led
case owes the exhibit (if it has one) and the brainstorm before a normal end;
code administers an owed stage once (interviewer-behavior Rule 9). A
candidate-led case owes nothing. Only interviewer-led cases exist so far.

## The brainstorm (13 Oct)

`brainstorm.ask`: the case's own brainstorm question, from the guide ("What
could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep
buying them?"). Code asks it when the brainstorm is owed, the model's prompt
shows it, and it counts as the brainstorm when the interviewer asks it in
close wording. Several lines rotate (prof-001 keeps its three). Code asks it
whatever has been said, so it must not presume a topic came up ("Beyond
pricing, …" was asked before pricing was mentioned — session 9813d6ce, 18 Oct;
pinned by a test for prof-001). Without it the
generic question is asked, which is case-neutral. `brainstorm.required: false`
for a case with no brainstorm module (Quillpath): nothing is owed, and the
case can close without one; scoring tells the judge the stage is "not part of
this case" and rates Creativity on evidence elsewhere, with the caveat "This
case has no brainstorm stage" (or not assessed).

`brainstorm.after` (Lorenzo, 13 Oct): exhibits the brainstorm waits on, when
its question assumes what they show (Larkspur's "…profitable in the first
year?" assumes Exhibit 3's new-routes plan; prof-002 sets `["exhibit-3"]`).
Until each is out — shown, or its data released as lines — the brainstorm
isn't owed: code hands over the next ready exhibit instead; the interviewer's
earlier brainstorm question (move `brainstorm`, or the case's own ask in any
move) is held and replaced by that exhibit, or by a question about the figures
when an exhibit already goes out that turn; no question counts as the
brainstorm yet; the prompt says it comes after the exhibit. No wait under time
pressure. The loader takes only known, required exhibits, none of which waits
on the brainstorm itself.

## Pacing config (optional)

Cases may set `pacing.phaseBudgetsMs` (per-phase time budgets, must sum to the
total case time, `TOTAL_CASE_MS` — currently 20 minutes — enforced by
`tests/cases/consistency.test.ts`) and
`pacing.timeWarningMs` (default 90s before time runs out in text mode; the
warning also fires early enough for the candidate's own pace — 15 Oct). Omitted
entirely, the orchestrator falls back to an even split across the 8 active
phases and the 90s default warning (`lib/orchestrator/pacing.ts`). **The
budgets are stage deadlines (15 Oct):** a required lead exhibit and the core
analysis are owed by the end of the ANALYSIS budget, later exhibits and the
brainstorm by the end of EXHIBIT, the recommendation ask by the end of
BRAINSTORM — so RECOMMENDATION + WRAP should leave room for two exchanges
(the recommendation and its risk question, ~3 minutes at a typed pace). The AI Casing cases
were written for 25 minutes and run at 25 (`pacing.totalMs`; prof-002 since 13
Oct, the others since 19 Oct), with budgets ×1.25 and at least 3 minutes for
RECOMMENDATION + WRAP, taken from ANALYSIS (Lorenzo, 15 and 19 Oct); prof-001
runs 20. Wave reports give each stage's minute
per run (`scripts/stage-minutes.ts`). Prefer setting
`phaseBudgetsMs` for any case where structuring or analysis legitimately needs
more than an even 1/8th share of the clock — a uniform default fires spurious
pacing nudges during a healthy opening on an analysis-heavy case.
