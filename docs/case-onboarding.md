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
| prof-001 Brew & Bean | 20 | yes | yes | tuned over batches 18–31 | 20–31 | **met** (batch 31) | **yes** |
| prof-002 Larkspur | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed | 22, 32 | not met: 3 false refusals, 2 report errors (32) | no |
| entry-001 Aldermoor | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed; brainstorm after Exh 3 | 32 | not met: stage owed, moderates (32) | no |
| pricing-001 Quillpath | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed | — | — | no |
| launch-001 Hollis Bay | 25 | yes | 19 Oct, rulings applied | 19 Oct, reviewed | — | — | no |

**Next (19 Oct):** the shared-engine bundle (plan first), then a prof-001
recheck plus all four new cases, in two waves.

## Shared-engine gaps that affect new cases (PRD §15)

Status: open unless marked. **(q)** asks the model never declares go unanswered.
**(r)** the live false-refusal guard and F3 read names, not covers. **(h)** a
stage deadline yields to every checker line. **(o)** the correction cap resets on
each derived figure. **(p)** "million" and arithmetic quotes are unchecked.
**(s)** a ledger line can't be ordered after an exhibit. **(t)** an existing
group beats a more specific cover. Others:
- the stale check misses a late redo;
- a repeated misquote in the recommendation is dropped without a checker flag;
- reports' "Better" answers aren't fact-checked;
- the caveat floor covers only needs_work;
- literal `\uXXXX` appears in the interviewer's text;
- "say before stage" isn't supported.

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
