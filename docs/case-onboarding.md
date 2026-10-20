# Case onboarding — the pipeline from PDF to listed case

The end-to-end process for bringing a new case onto the site. `case-authoring.md`
holds the rules for writing the case JSON; this file is the order of work, the
gates, who decides, what it costs, and where each case stands. Started 19 Oct
from batch 22 (Larkspur) and batch 32 (Larkspur + Aldermoor). **Keep it current:**
after every wave, fix or ruling, update the tracker and add a line to the lessons log.

Roles: **Lorenzo** rules on design points, sets the bar and caps, gives every paid
go-ahead and the listing go. **The case agent** authors, audits, fixes and does
the first grading. **The advisor (Claude, Cowork)** grades every wave
independently and blind to the agent's grade.

## Definition of done (a case is listable when all hold)

1. The fact audit is clean and every design point has a ruling (stage 2).
2. Anchors are audited and reviewed (stage 3), and all free checks pass (stage 4).
3. One full wave (5 personas, all scored) meets the bar after the last change to the
   case or the shared engine, by both grades (stage 6). Disagreements go to Lorenzo.
4. Lorenzo's listing go.

## Stage 0 — Source (free)

- A case PDF with an interviewer guide, exhibits, a worked answer key, the release
  order and timing. If the PDF is vague about a number or what gets released when,
  resolve that before authoring.
- Take the clock from the PDF. Don't shorten it: batch 22 ran a 25-minute case on 20
  minutes and 6 of 8 runs ran out of time.

## Stage 1 — Author the case JSON (free)

Follow `case-authoring.md` rule by rule. Things batch 32 showed are easy to miss:
- **Answer keys accept only correct readings.** A figure that is right only as
  another quantity ($150 is revenue per passenger, not the fare) is accepted only
  when the candidate names that quantity (the units rule). If the schema can't
  express that, accept it and log the gap, because a false correction is worse
  than a missed flag.
- **Signs and tolerances.** A loss is negative, and "+0.2 profit" must fail. Set
  tolerance from the PDF's rounding, never ±100%.
- **Every figure carries its year** where the case has more than one (the Larkspur
  "$1,840–$2,200 per flight" range is FY2023 only).
- **Brainstorm placement.** If the brainstorm ask presupposes a later exhibit
  ("If Aldermoor builds its own team…"), set `brainstorm.after` to that exhibit.
- **Content the PDF says to give before a stage** (Larkspur: the competitor's
  entry before the network fix) has no engine support yet; note it in
  `interviewerNotes` and log it.
- Start with `stepFlagsLive` off (report-only). Batch 22: step corrections on a
  new case produced about 19 false "It's closer to X, not Y" lines.

## Stage 2 — Fact audit against the PDF (free) → Lorenzo rules

- Check every ledger value, math step (answer, formula, tolerance), exhibit cell
  and prompt line against the PDF, and re-derive the PDF's own math.
- A script confirms every number in the JSON appears in the PDF.
- Fix transcription errors directly. List design and ambiguity points for
  Lorenzo's ruling, with nothing changed until he rules. Recurring kinds: clock
  length, answer keys accepting a wrong reading, unsigned steps, one anchor
  covering two figures.

## Stage 3 — Anchors (about $0.30–1.20 per case, cap $2)

1. Run `scripts/anchor-audit.ts`. An LLM proposes `factAnchors.names`/`covers`
   per ledger item from the JSON and PDF; the script lints, diffs and replays
   real asks.
2. **Review by hand.**
   - Strike generic phrases that would send an ask to the wrong item ("average
     fare" sent new-route fare asks to Lakeport). A wrong item released counts as
     serious in grading.
   - Remember the matcher splits an ask at "and".
3. Write **negative probes** (asks that must not map to an item) as well as
   positive ones. Batch 32's audit had 21 probes for about 900 phrases, which is
   too few.
4. **Quote anchors** for every figure a candidate may restate, including prose
   cells in exhibits. Before splitting an anchor that covers two figures, test
   both ways: the pricing "Pro sign-ups" split created false flags on true
   statements, so it stayed shared.
5. Known engine limits until PRD §15 (p) is fixed: quotes written with
   "million", and figures inside arithmetic, are never checked.

## Stage 4 — Free checks

The case tests and the new-case end-to-end tests; `step-binding-check`;
`plan-inspect`; `fact-check` and the replay tools on any saved runs of the case.
Read D6 and data-release flags on new cases as leads, not counts: they carry
prof-001 assumptions.

## Stage 5 — Fix the bar before any paid run

- **Bar (batch 31's, plus reports):**
  - zero false statements, including in scored reports and their "Better" answers;
  - no close over an unprobed checker flag unless both wrap-up probes were spent;
  - no required stage owed at close, and direct asks answered;
  - at most 2 firm moderate faults per interview;
  - the phrasing check.
- **Severity:** `evals/severity.md`. A false refusal of data the case holds is
  serious. A report rating a dimension with no evidence counts as a false
  statement (Lorenzo, 19 Oct).
- Any easing for a first look must be decided before the run, not after.

## Stage 6 — Paid waves (about $6–7 per case per wave; cap $11)

- Personas: 7 Raj, 64 Tyler (case-neutral misquoter), 57 Marisol, 24 Marcus,
  40 Jasmine. All scored, human pace, `scripts/persona-batch.ts --case=<id>`.
- At most two cases per wave, as parallel batches. One wave per go-ahead, each
  with its own cap.
- **Two grades:**
  - The agent grades every transcript and report into `hand-grading.md` in the
    batch folder.
  - The advisor grades independently and blind, then the disputed turns are
    checked in the transcripts.
  - Batch 32: the first grade missed 2 interviewer false refusals, 1 report error
    and most moderate faults. Don't skip the second grade.
- Classify every fault as **case data** (fix in the JSON, free), **shared
  engine** (PRD §15 proposal, built only with a prof-001 recheck) or
  **simulator**.

## Stage 7 — Iterate

Case-data fixes plus free replays, then the next wave. Shared-engine fixes go in
bundles, each verified by replays of batches 28–31 (prof-001 must stay identical
except where the fix applies) and a prof-001 wave.

## Stage 8 — List and go live

- Add the id to `LISTED_CASE_IDS` (`lib/cases/listed.ts`, from the site-flow
  work). `/api/session` rejects any case not on that list.
- **Voice, before the case is offered in voice:**
  - `sttKeyterms`;
  - TTS pronunciations for the case's jargon (as COGS → "cogs");
  - optionally, data-line variants;
  - one live voice session, exported and read.
- **After launch:** export and read the first real sessions.

## Costs (19 Oct prices)

| Step | Cost |
|---|---|
| Fact audit, free checks, replays | free (agent time only) |
| Anchor audit | $0.30–1.20 per case |
| One wave (5 runs, all scored) | ≈ $6–7 (25-minute case) |
| Shared-engine recheck (prof-001 wave) | ≈ $6–8 |

## Tracker

| Case | Clock | Authored | Fact audit | Anchors | Waves | Bar | Listed |
|---|---|---|---|---|---|---|---|
| prof-001 Brew & Bean | 20 | yes | yes | tuned over batches 18–31 | 20–31; 33 (engine-asks wave A) | **met** (batch 31, `main`); not met on `engine-asks` (33): 1 serious false statement (code's own-quantity line, pre-existing), 1 report error, 1 close over a false-stale flag, 1 ask ignored, 4 same-opening pairs | **yes** |
| prof-002 Larkspur | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed | 22, 32 | not met: 3 false refusals, 2 report errors (32) | no |
| entry-001 Aldermoor | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed; brainstorm after Exh 3 | 32 | not met: stage owed, moderates (32) | no |
| pricing-001 Quillpath | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed | — | — | no |
| launch-001 Hollis Bay | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed | — | — | no |

**Next (19 Oct):** wave A of the engine-asks bundle (batch 33, prof-001, 10
runs, 6feb4d5, $6.20 of $10) is graded — not met: Marisol t14's misframed
conversion line (serious; `own-quantity.ts`, unchanged since batch 31, only
prof-001 has share bases), a Tyler report figure, Blake's false-stale close,
Marisol t19's ignored ask, 4 same-opening pairs; firm moderates 2 (batch 31: 4);
the small-model check 7 calls, 0 hollow deferrals, 0 wrong releases
(`Case Interview Runs/test runs/batch-33/hand-grading.md`; fix proposals in PRD
§16, awaiting his ruling). **B1 (prof-002 + entry-001, cap $20) awaits Lorenzo's
go**, then B2 (pricing-001 + launch-001, cap $20), each on his go.

## Shared-engine gaps that affect new cases (PRD §15)

Status: open unless marked. **Bundle built (engine-asks, 19 Oct; not merged or
deployed; free proof done, `final.md`; round 2 — Lorenzo's rulings 1–8 on that
proof — built and free-proved, `r2-final.md`; by his ruling 8 the round-1
controller rulings marked "proposed" are his; round 3 — his rulings 1–7 on the
round-2 proof — built and free-proved, `r3-final.md`; by his round-3 acceptance
the round-2 controller rulings are his, except the scope filter on the check's
mapping, which he overruled (ruling 5); round-3 controller rulings are proposed,
awaiting him):** (q), (r), (h), (o), (p) with (c), (k),
(l), (m) and the strengths check (with (m)), all below; out of it and open: (s),
(t), (j) the stale-check redo, (i) the misquote-in-recommendation gate. **(q)** asks the model never declares go unanswered. *Built on engine-asks (not merged), part 1: guard B reads "I'd want:" and addressed asks after the brainstorm; part 2: an item-less deferral is checked by the small model (a named deferral, or refused when it maps to no item; the generic "settle your structure" line is gone), and a basis ask is out of scope of an item that doesn't say where its figure comes from; (a basis-emptied ask the check maps back only to the item the basis rule cut was refused here; round 3, ruling 5, reverses it). Round 3 (ruling 5): code refuses an unmatched ask only when the check maps it to no item — any ledger item it finds, scope-cut or basis-cut, is a named deferral (or "We won't get to" at a wrap-up); the cut / out-of-scope ids are only logged (`basisCut`, `outOfScope`); asks the finer-cut rules empty stay refused unchecked. Round 3 (ruling 3): only item-backed deferrals (gated ids, a request's held ledger items, the gate's deferrals) hold the model's figure question; the check's item-less named deferral and "We won't get to" lines hold no data, so a probe on figures stays (b31 Sofia t10; `itemlessDefers`). Round 3 (ruling 4): on a wrap-up or close turn every deferral — item-backed, the gate's, over the cap, the release order's, the check's named ones — is "We won't get to <ask> today.", or "We won't get to that today." for an ask over 8 words as said or a list (two asks or more, a comma, an "and"; new pool `wont_get_to_that`); such an item holds nothing, leaves the open-requests queue until asked again (`promisedRows`, rows logged `wontGetTo`) and stays a coverage gap in the report. Round 2 (rulings 2 and 3): every item-less ask code would refuse goes through the check — item-less releases and a code-written turn's item-less detections too (asks a finer-cut scope rule emptied stay refused unchecked); the check is capped at 1.5 s (a timeout defers); on a wrap-up or close turn (code's recommendation ask included) the named deferral is "We won't get to <ask> today."; the check's mapping was held to the same scope rules as the model's (superseded by round 3, ruling 5); `rec_ask` counted as wrap-up, finer-cut-emptied asks left unchecked and the line as one variant were the controller's rulings (19 Oct), Lorenzo's by his round-3 acceptance. The live check (round 3, 41 calls on prof-001's 34 asks): refused 33, deferred 8 (7 hollow), 0 wrong releases, 0 timeouts at 1.5 s, p95 1.3 s.*
**(r)** the live false-refusal guard and F3 read names, not covers. *Built on engine-asks (not merged): both pass `{ covers: true }` to `findFalseRefusals`, which sends an object no item name hits through `coverageOf`.* **(h)** a
stage deadline yields to every checker line. *Built on engine-asks (not merged): a deadline yields to a probe once (`flags.stageYielded`; an exhibit's by its id), then the stage goes and a probe due then is held for the next model turn (code's own probe too: not marked handled or counted, re-gated then — final review; Lorenzo's by his round-2 ruling 8; since round 2, ruling 6, the held probe is re-gated exempt from the wait and dedupes none of the checker's claims on its stage turn, and the gate's `code_gate` rows are read in turn order, so its re-gate's outcome is the one that counts); a correction (the checker's or code's own) rides on any overdue stage turn, said first, and a misquote no longer blocks it (R7).* **(o)** the correction cap resets on
each derived figure. *Built on engine-asks (not merged), part (a): a flag is stale only when the quantity is restated at a different value (R2); said again at its own figure the error stands, and the key dedupes it. Part (b): a flagged claim whose span (or another claim of its key) carries another step's wrong result (`rootOf`, the root's head figure) rides on that root's line — `derived` only on a turn the root is said, else it waits; a raised, open root carried into a new message comes back there with its next Rule-14 attempt (the correction follows the wrong input); the root takes the claim's rating; once the root closes the claim goes to the report ("built on a closed input"); code's own finding on it yields to a raised root. A step span at a case figure no longer counts as a restatement (the trade-off accepted, Lorenzo's round-2 ruling 8). Round 2 (ruling 1): a root closed by a live correction is recorded (`flags.mathChecker.corrected`, the line said); the first later claim still on its wrong value gets that correction once more, as a correction (one math line, rides on an overdue stage turn), then the report ("restated once"); a root closed when attempts ran out keeps "built on a closed input". Round 3 (ruling 1): the restatement is the line delivered, verbatim — a correction's or a conversion's (a conversion now records its line too); the built "<root> is <right>, not <wrong>" form and its scale-word code are gone (b28/b29 Jordan: no "not 38" on a figure true as growth on its own base). Round 3 (ruling 2): a correction is said at most twice — the 13 Oct recommendation re-correction counts as the restatement (heard, it marks its key and every key with the same line restated; a key restated, or sharing a restated line, gets no re-correction; b29 Jordan t20); counted per line too (`flags.mathChecker.said`) — any correction, restatement or re-correction whose line was said twice is not said, its key closes report-only ("its correction was already said twice", and the report says so); a restatement that ends shed, expired or cut off by the close carries its root, so the report says the root's correction instead of "not raised". Round 2 (ruling 4): the close hold reads that inherited rating too — the selection carries the highest conclusion-changing rating, final-answer messages and hold rank riding on the root, so a minor root with a rider in the final answers holds the close, once (keyed by the root; its line heard on a model turn counts as that probe). The restatement's rank (below a conclusion-changing flag, above age — Aldermoor Marisol 11:5's probe expires behind it), a waiting flag closed by an identical line, and the model-turn probe count were the controller's rulings, Lorenzo's by his round-3 acceptance; counting "said twice" per line as well as per key is a round-3 controller ruling — proposed, awaiting him.* **(p)** "million" and arithmetic quotes are unchecked. *Built on engine-asks (not merged), with (c): the quote grammar reads a figure before a full stop ("The shelf price is $4.49."), thousands ("$1,200", not "$1"), and a scale word ("$77 million" against the item's "$80 million", at full scale; a scaled figure quotes only an item stated at scale); arithmetic skips a quote only up to the end of the anchor's clause, unless the quoted figure is an operand later; "you gave / you said" links an anchor to its figure; cells written "$80 million" or "250 million" are lookup facts; a figure written in full ("$1,200,000") is read at the item's scale; the checker's claim is no longer deduped for a misquote flag the gate will hold (checker_disagrees), so its probe still goes; since the final review, any code flag dedupes it only when the gate released that flag. Still open: a figure before its quantity — see the gap below.*
**(s)** a ledger line can't be ordered after an exhibit. **(t)** an existing
group beats a more specific cover. Others:
- (j) the stale check misses a late redo;
- (i) a repeated misquote in the recommendation is dropped without a checker flag;
- *(m) built on engine-asks (not merged):* reports' "Better" answers and the facts of strengths are fact-checked: `auditBetterFigures` lists figures no case value or one operation of two explains, the verifier gets them as hints, and an unsupported Better answer is blanked (moment stays) or an unsupported strength dropped;
- *(l) the caveat floor covers only needs_work: built on engine-asks (not merged):* any assessed dimension with no quote in wentWell or needsWork is now not assessed, whatever its rating and caveat (R4); a strong overall is re-capped against the dimensions still assessed;
- (k) literal `\uXXXX` appears in the interviewer's text. *Built on engine-asks (not merged): `decodeLiteralEscapes` decodes `\uXXXX` (exactly four hex digits) in the streamed sentences and fields and in the final parsed turn, before any guard reads it.*
- a bare "cost breakdown" cover on prof-002 withheld the true "I don't have the fixed cost breakdown" (b22 Omar t14). *Built on engine-asks (not merged): case data only; the bare phrase is replaced by phrases naming what each item holds (fuel, unit, per-flight, a period-wide or by-route breakdown), so "fixed cost breakdown" covers nothing; "the / a / full / total / overall cost breakdown" keep the bare asks mapped (a controller ruling, Lorenzo's by his round-3 acceptance — the first cut unmapped b22 Marcus's "the cost breakdown"); an article-less or possessive ask ("our cost breakdown") now maps to nothing — see the gap below.*
- "say before stage" isn't supported.
- a quote with the figure before its quantity ("the $77 million annual selling
  cost", Aldermoor Tyler t17) isn't read — not now (Lorenzo, 19 Oct, round-2 ruling 7); a widening
  of the quote grammar, needs the labelled set rechecked.
- the check's topical mappings (Lorenzo, 19 Oct, round-3 point 4, as proposed:
  logged, not built): the scope rules don't read "competitor pricing" as
  outside menu prices, nor period cuts ("the bean share today" against a share
  from two years ago). Since round 3 (ruling 5) any item the check finds is a
  named deferral, so such a mapping is a deferral nothing keeps. Live (r3 Haiku
  check): every "competitor pricing" ask mapped to nothing and was refused; the
  period cuts mapped (b31 Sofia t8 "coffee beans as a share of COGS today", t10
  "the current split of COGS by category" → `bean_share_of_cogs`) — hollow
  deferrals. Wave A shows how often it happens live.
- possessive or quantifier asks on prof-002 (Lorenzo, 19 Oct, round-3 point 7,
  as proposed: logged, not built): the determiner-anchored covers ("the / a /
  full / total / overall cost breakdown") don't map "our cost breakdown", "any
  cost breakdown" or a bare "Cost breakdown", so they reach the small-model
  check (a named deferral or a refusal on its verdict) instead of the cover's
  items. Add covers only if a wave shows it.

## Lessons log

- 13 Oct, batch 22: step corrections on a new case produced about 19 false
  corrections. New cases start report-only.
- 19 Oct, batch 32: a 25-minute case belongs on 25 minutes.
- 19 Oct, batch 32: thin anchors produce false refusals ("that's not something
  I have"), the most common false statement on new cases. Audit anchors before
  the first wave.
- 19 Oct, batch 32: anchors can't answer an ask the model never declares. That
  is engine work (q), not case data.
- 19 Oct, batch 32: an answer key can grade a wrong answer as right (an unsigned
  loss, a figure for the wrong quantity). The fact audit has to read the keys,
  not just the values.
- 19 Oct, batch 32: a brainstorm that presupposes an option, asked before the
  options exhibit, steers the decision. Use `brainstorm.after`.
- 19 Oct, batch 32: the first-pass grade under-counted. Keep two independent
  grades.
- 19 Oct, batch 32: reports can state false figures in "Better" answers, and can
  rate untested dimensions.
- 19 Oct, batch 32: "Understood." opens consecutive turns in every run. It isn't
  a bar failure, but it will sound robotic in voice.
- 19 Oct, engine-asks rulings: an item-less deferral (and an ask
  the basis rule empties) is checked by a small model against the ledger
  before code refuses it — item-less releases, a code-written turn's item-less
  detections among them, were still refused unchecked (round 2 checks them too,
  below); a flag is stale only when the quantity is restated
  at a different value; reports are fact-checked in Better answers and in the
  facts of strengths; any dimension with no evidence is not assessed; new-case
  waves run at most 10 sessions at once.
- 19 Oct, engine-asks free proof: a fix in shared code can be proved free on
  prof-001 by replaying its saved runs (checker off and on) and listing every
  changed decision and line; it caught a false positive (Guard B on "Do you
  want me to work from 25%?") and a probe delayed by a dedupe before any spend.
  The replay can't show regenerations, small-model checks or scoring — a wave
  has to.
- 19 Oct, engine-asks proof rulings (Lorenzo): a later claim at a corrected wrong
  value hears the correction once more, then the report; every code refusal of an
  unmatched ask goes through the small-model check (1.5s cap, a timeout defers);
  at the close a mapped ask hears "We won't get to <ask> today."; close hold uses
  the highest rating riding on a root; prof-002's "cost breakdown" cover to be
  narrowed; the figure-before-quantity form ("the $77 million annual selling
  cost") left open — logged in the gaps list.
- 19 Oct, engine-asks round 2 (free proof final2 → r2-final): a replay whose
  small-model check is mocked to no answer turns every refusal it would check
  into a named deferral (68 prof-001 slice-lines, 7 more by phrase rotation) — the proof shows the
  timeout path, not the live verdict, so a scope filter on the check's mapping
  and a paid wave are what tell a true refusal from a hollow deferral. Narrowing
  a cover by deleting a phrase can unmap the asks it was written for; anchor
  the replacement on the words those asks use ("the cost breakdown") and replay
  them. Ordering choices (where a restatement ranks) move other probes; prove
  each candidate ordering on the corpus before picking one.
- 19 Oct, engine-asks round-2 rulings (Lorenzo): a restatement repeats the
  original correction line word for word (a new "not X" can contradict the units
  fix); a correction is said at most twice in all; only item-backed deferrals hold
  the model's figure question; every deferral at a close is "We won't get to <ask>
  today." ("…that today." for a long or list label); code refuses an unmatched ask
  only when the small-model check says the case doesn't hold it.
- 19 Oct, engine-asks round 3 (free proof r2-final → r3-final, live check $0.04):
  a correction counted "at most twice" has to count sayings of the line, not
  only of the key — the 13 Oct re-correction and a restatement can carry the
  same words under different keys (b29 Jordan heard one line three times).
  Read a fact-check count the per-task lists don't name (b29 STAGE 3 → 2) back
  to its turn before calling it an interaction. A mocked check can't show a
  rule that acts on the verdict (ruling 5: 0 replay changes); a cents-level live
  run of the check on the corpus asks can (33 refused, 8 deferred, 0 wrong
  releases).
- 19 Oct, batch 33 (engine-asks wave A): a code-written line can be false even
  when its figure is a true case value — "about 10 points, not 5.8" was right on
  COGS's own base, wrong on the candidate's (revenue points), and she built her
  recommendation on it. fact-check's F1/F3/F4 don't test which quantity a
  correction is on; read every code correction against the candidate's own
  words. A stale reading can fire on the same figure used as another quantity
  ("10" in "a 10–12% price increase").
