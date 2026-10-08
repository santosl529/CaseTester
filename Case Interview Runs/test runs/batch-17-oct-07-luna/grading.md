# Batch 17 — Luna-none persona evaluation: grading (7 Oct 2026)

Graded by hand against the expectations in `docs/superpowers/plans/2026-10-07-luna-persona-eval.md` (written before grading). Review sheets: `review/` (Luna) and `review/sonnet/` (the same personas' Sonnet runs, batches 11–13, graded on the same rubric — comparison material, not an answer key). One run per persona and model; different simulated candidates; the Sonnet runs predate some 6–7 Oct fixes (e.g. the exhibit-handover guard).

Unit: a model turn with at least one fault. "Raw" = the model's JSON; "delivered" = what the candidate heard after the orchestrator.

## Summary
| | Luna-none | Sonnet |
|---|---|---|
| Model turns | 82 | 57 |
| Turns with a violation (delivered) | **27** (33%) + 1 mixed-cause | **19** (33%) |
| — excluding Nikhil | 9 / 53 (17%) | 15 / 46 (33%) |
| Request handling (skipped / under-released / built on offered data / data talk) | 18 turns — 14 of them Nikhil's loop | 6 turns |
| Stage / flow (repeated pressure test, loop, missed brainstorm, risk replaced, rec re-asked, over-probing after the risk probe) | Nikhil loop (13 repeated pressure tests), Hugo brainstorm never asked, Nikhil rec re-asked + risk replaced, Jordan 2 extra risk probes, Derek re-asked a given structure | Nikhil 3 extra probes after the risk probe |
| Exhibit referenced before it was on screen | 3 (Nikhil ×2, Devon) | 0 |
| Answer or method inside the pushback; correcting math itself | 0 | 6 (Derek ×2, Jordan ×3, …) |
| Grading in say; doubled exhibit handover; stacked questions | 0 | 5 |
| Unsourced figures, leaks, confirming a guess about unreleased data | 0 | 0 |
| Raw faults caught by the orchestrator | 4 empty replies regenerated; 1 provenance withhold | 1 data-talk say vetoed; 1 assumption-guard withhold |
| First useful content, median / p90 | **1.11 / 2.00s** | **2.32 / 3.22s** |

## Per persona (delivered violations / model turns)
- **Nikhil — Luna 18/29, Sonnet 4/11.** Luna: t2–t4 every request declared correctly; then **t6–t32, 14 turns, no request declared at all** although Nikhil asked for eight items every turn (including repeats of open requests), and the pressure test repeated every turn ("Which branch would you prioritize?" / "Is that MECE?") after he had prioritized ("Cost side, largest line first") — the deferred data was never released until t34. Later: an exhibit asked about before it was handed over (t38, t42); recommendation asked again after it was given (t56); the risk stage replaced by a bare "Points of what?" under move "risk" (t58). Sonnet: 6 explicit asks marked `explicit: false` with no ids, so silently dropped (t4); three probes after the risk probe (t18–t22).
- **Devon — Luna 4/11, Sonnet 3/9.** Luna: second pressure test while the earned cost breakdown stayed deferred (t4, t6); bean price not released with the rest of "how each piece moved" (t10); asked about "the cost structure exhibit" never handed over (t14). Sonnet: a statement-form request not declared (t2); "First thing I'd want is…" marked passing, so offered not released (t6); doubled exhibit handover (t12).
- **Derek — Luna 2/9, Sonnet 3/9.** Luna: re-asked for a structure he had just given (t2); bean price / other inputs offered instead of released on an explicit ask (t8). The units error was probed every turn the unit check fired (t8, t12) and Derek reconciled correctly at t13. Sonnet: named the method in the units probe (t10); corrected the math itself in say ("Your 11.8 points is the margin number…") with narration (t12); a question built on offered data (t14).
- **Jordan — Luna 2/12, Sonnet 5/11.** Luna: two extra probes after the risk probe (t22, t24). Sonnet: the answer inside the pushback (t8, t10, t12 — "COGS is up 16, overhead 2, labor flat. Does that sum…"), doubled exhibit handover (t14), grading in say ("The 24% on-price derivation is clear.", t18).
- **Connor — Luna 0/13, Sonnet 1/8.** Sonnet: units probe and risk probe stacked in one turn (t16). Neither probed the unread exhibit rows — desirable, not required by any rule.
- **Hugo — Luna 1/8 (+1 mixed), Sonnet 3/9.** Luna: brainstorm never asked (t14 went straight to risk); t16 code re-asked the recommendation after Hugo gave it (mixed: the model labelled its t12 rec question "analysis"). No guess about unreleased data confirmed or denied by either model. Sonnet: grading in say ("that's a sensible prioritization", t4); a question built on offered data (t8); declined data in its own words in the question (t12).

## Desirable, not required (not counted)
Connor: probing the unread exhibit rows (both models). Derek t16 (Luna): challenging the flawed pricing math in the recommendation. Jordan t20 (Luna): tailoring the risk probe to a risk the candidate already named.

## System-policy issues (all models; not charged to either)
1. **Rule 14 second attempt** — Jordan's "40 points" (2.5×) was never corrected in the Luna run (two probes, then nothing; no recompute flag covers it); in Sonnet's run, three probes and no supplied figure either. Derek's units error was caught this time because the unit check matched every turn.
2. **Unit-check false positives** send "Points of what?" on correct figures (Luna: Nikhil t48, t58, Devon t18; flags also fired on Derek t4/t16/t20, Sonnet Connor t16).
3. **Provenance guard** withheld an attributed figure said in words ("ten million"; the candidate wrote "$10M") and left a bare "Points of what?" (Luna Nikhil t48).
4. **Release cap** defers items on an explicit ask (Luna Derek t6, Nikhil t36/t38; Sonnet Nikhil t6/t8).
5. **Stall check** classifies enumerated request lists as analysis progress; at fast pace no pacing alert fired — nothing in the system broke Nikhil's 14-turn loop.
6. **Stage tracking by move label** — brainstorm/recommendation recorded from `move`, so a mislabelled question closes the case without a brainstorm (Luna Hugo, Jordan; Sonnet Nikhil) or re-asks a given recommendation (Luna Hugo t16).
7. **Close turn** answers final-message requests with odd releases and capitalised refusal labels ("I don't have Information about…", Luna Jordan t26, Hugo t18).

## Read
Excluding Nikhil, Luna made fewer delivered faults than Sonnet (17% vs 33% of turns) and its faults were different in kind: Sonnet's were mostly style and rigor-overreach (grading, giving the answer away, over-probing); Luna's were request judgment and context (deferred data never released, exhibits referenced before handover, a stage skipped). Nikhil's run is the decisive one: a 14-turn loop with eight requests a turn silently ignored — a failure the product can't ship — and nothing in the system caught it. One run per persona can't say whether that loop is systematic.
