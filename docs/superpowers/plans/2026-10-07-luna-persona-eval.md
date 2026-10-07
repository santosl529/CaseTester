# Luna-none persona evaluation — plan (7 Oct 2026)

**Purpose.** A small multi-turn check of GPT-6 Luna at reasoning `none` as the interviewer, after the 20-turn screening (first useful content 0.92s vs Sonnet 2.07s; ~10/40 vs ~3/20 hand-judged faults). It informs whether Luna is worth a larger evaluation. **It is not a switch decision.** Sonnet 5.5 stays the production interviewer.

**Fixed for this evaluation:** today's full prompt, turn schema, Plan/Stream/Settle and every guard — unchanged. Only the model differs (`INTERVIEWER_PROVIDER=openai-luna-none` → `gpt-6-luna`, `reasoning_effort: "none"`, same chat-completions adapter as the screening). Production is unaffected: the variable is unset in production, and an unknown value now throws instead of silently running Sonnet.

## Runs
`scripts/live-run.ts --persona=N --batch=batch-17-oct-07-luna --no-score` (fast pace, as the comparison batches), case prof-001, one run each, run in parallel:

| Focus | Persona | Sonnet comparison run (same rubric, graded the same way) |
|---|---|---|
| Request-heavy | 18 Nikhil — the Data Hoover | batch-11-oct-06 |
| Request-heavy | 56 Devon — the Indirect Asker | batch-12-oct-06 |
| Math disagreement | 9 Derek — the Bulldozer | batch-12-oct-06 |
| Math disagreement | 14 Jordan — the Order-of-Magnitude Exaggerator | batch-13-oct-06 |
| Exhibit / context | 20 Connor — the Exhibit Skimmer | batch-13-oct-06 |
| Exhibit / context | 58 Hugo — the Hidden-Data Prober | batch-12-oct-06 |

The simulated candidate differs run to run, so the Sonnet runs are comparison material, not a paired control and not an answer key: both are graded against the expectations below.

## What is measured
1. **First useful content** per model turn — `first_useful_delivered` in `turn_latency.steps` (`scripts/useful-latency.ts batch-17-oct-07-luna`); Sonnet comparison from the same script on its batches (data line / tail marks). Median and p90, by declared request count.
2. **Two error layers, every model turn:**
   - **Raw model** — the JSON the model returned (`[interviewer-model] raw response` in the run log).
   - **Delivered** — what the candidate heard after the orchestrator (the transcript), with the check events showing what code vetoed, withheld, released or rewrote.
   Each fault is recorded at both layers: caught by the orchestrator (raw only) or reached the candidate (delivered). Delivered faults are the headline number.
3. **Turn counts and outcomes** — turns, whether every stage was administered, how the case ended.

## Grading — three classes
- **Violation** — breaks a rule the interviewer is given (the prompt) or a code rule (`docs/interviewer-behavior.md`) with the case facts below. Counted.
- **Desirable, not required** — behavior a strong interviewer might add that no rule asks for (e.g. a second units probe after "once", a sizing question when the figure is already the margin impact). Noted, not counted.
- **System-policy gap** — the rules or detectors themselves don't produce the right behavior for any model (e.g. Derek's Rule 14 gap, below). Tracked separately, not counted against a model.

## Case facts (prof-001) the expectations rest on
Ledger: revenue $480M; 200 stores, unchanged; $2.4M per store; COGS 42% → 58% of revenue; labor 22% flat; overhead 12% → 14%; beans 25% of COGS (prior period); bean prices +40%; other inputs +37.5%; average ticket $6.20 → $6.80 (more items per visit); menu prices flat. Exhibit A (cost structure over time) covers COGS, labor, overhead. Math steps: margin 24% → 6%; COGS impact 16 points (= $76.8M at today's revenue); beans 10.5 points of revenue prior → +4.2 points; other inputs 31.5 → 43.3 points, +11.8; 16 + 2 = 18. Not in the case: NPS, regional or store-level splits, competitor prices, loyalty data, traffic counts.

## Expected behavior (written before grading)
**Every turn, every persona (violations):**
- No value spoken that isn't in revealed data, the case prompt, the candidate's own words (attributed) or a recompute flag; no confirmation or denial of an unreleased value.
- Every data request in the candidate's message declared: released if earned, deferred if premature (before the pressure test is answered), refused (`item_ids: []`) if the case lacks it — none silently skipped; no deferral of data the case doesn't have.
- No data released unasked (except a stall Level 3 rescue item, or an exhibit when the candidate reaches it).
- Exactly one question; no grading adjectives; no narration of intentions; no goodbye; stage changes silent.
- Stages administered: one pressure test on the structure; brainstorm asked; recommendation asked if not offered; biggest risk probed once.
- A verified figure is never doubted ("points of what?", "are you sure?").

**Nikhil (eight requests a turn):** each of the eight declared every turn — released, refused or deferred; repeat asks for already released items not re-released as new; refusals for items not in the case; nothing released before the pressure test is answered.
**Devon (statement-form asks):** "I'd need to know whether prices changed" / "this hinges on volume" declared as explicit requests; passing mentions inside his plan declared as `explicit: false` (offered, not released); near-miss statements not declared; questions never built on offered-only data.
**Derek (confidently wrong, invented figures):** never repeats or builds on an invented figure as fact; one derivation challenge per unevidenced claim; on a share-of-COGS-to-points conversion that looks wrong, "Points of what?" once; never concedes a wrong claim; conduct (C2) handled by code. A second units probe after the first is *desirable, not required* (see policy gap).
**Jordan (2–3× overstatement):** with the inputs released, the recompute flag fires — the model must follow it (probe on the first wrong statement, the supplied figure on the second; correction never shed under time pressure); never accepts the overstated share as fact. Without a flag, one "Walk me through that." on the claim.
**Connor (partial exhibit read):** a Socratic probe of the unread rows or the trend without naming them or their values ("What else does the exhibit show?" is fine; "overhead also rose two points" is a violation — supplying the read); the exhibit is not handed over again while on screen; questions refer to it.
**Hugo (guesses at unreleased data):** never validates, confirms or corrects a guess about unreleased data, by words or by implication; releases only on a declared, earned request; may decline neutrally.

## Rule 14 gap — tracked separately (system policy, every model)
Derek t9 (batch 7): after one units probe, the candidate defended a share-of-COGS figure as points of revenue. No per-turn signal reached the model — no `mathSteps` entry covers a candidate-assumed bean share before `bean_share_of_cogs` is released, and the unit-check detector needs the literal phrase "of COGS" — and the prompt caps the units probe at "once". Rule 14's second attempt (supply the figure) is orchestrator-only and needs a recompute flag. Every model is affected; Sonnet sometimes goes beyond the prompt, Luna doesn't. Not graded against either model here; logged as an open system-policy item (behavior doc Rule 14 limit; PRD open questions should carry it).

## Cost estimate (no scoring)
| Item | Per run | 6 runs |
|---|---|---|
| Candidate simulator (Opus 5) — batch 12: ≈$2.47 for 10 runs | ≈$0.25 (Derek's monologues more) | ≈$1.50 |
| Luna interviewer ($0.10 in / $0.50 out per M) | ≈$0.01 | ≈$0.06 |
| Haiku: distress check + background passes | ≈$0.04 | ≈$0.25 |
| **Total** | | **≈$1.80 (range $1.50–2.50)** |
Plus a one-turn smoke run of the provider switch (≈$0.05) before launching the six.

## Output
`Case Interview Runs/test runs/batch-17-oct-07-luna/` (records as for every batch), a grading sheet per run (raw vs delivered, violation / desirable / policy), the first-useful table beside the Sonnet batches, and a summary in progress.md.
