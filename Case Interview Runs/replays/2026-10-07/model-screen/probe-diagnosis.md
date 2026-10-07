# Derek t10 and Jasmine t6 — why the probe didn't come (7 Oct 2026)

Read-only. Prompts: `REPLAY_DUMP_IDS` (what the challengers saw) and `scripts/plan-inspect.ts` (today's production `planTurn` on reads rebuilt from the run record; flags {} — the run's final recomputeAttempts {} and explainProbed [] match; coverage null). Both gave the **identical per-turn prompt** for each turn. The live run's own check events on the same turns agree.

## Derek (batch-7, candidate turn 9 → interviewer turn 10) — the units error
- History: at t8 the interviewer already probed — "Points of what? A share of COGS is not the same as a share of revenue… what does 25% of COGS come to as a percentage of revenue?" At t9 Derek defends the COGS base ("I'm indexing to the COGS base… I'd keep 25 as my working figure").
- Per-turn hints: **none.** RECOMPUTE FLAG absent (no `mathSteps` entry covers bean points, and the bean share isn't released); VERIFIED FIGURES none; UNIT-CONVERSION FLAG absent — `detectNestedPercentConversion` needs the literal phrase "of COGS" plus a revenue/points phrase; the restatement says "25% of 58" and "the COGS base", so it doesn't match. Live run t9: recompute flags [], verified [], unit_check nestedConversion false.
- Fixed-prompt rules in force: "Nested percentages… probe the units once" and "An assertion… gets one Socratic pushback" — both already spent at t8. Rule 14's second attempt (supply the figure) is orchestrator-only and needs a recompute flag; its known limit ("bean arithmetic has no step… covered only by the unit-conversion probe, which has no counter") applies exactly.
- **Classification: absent, and the default rules cap a repeat.** No deterministic signal reached the model, and the only applicable instructions say "once", which a literal reader treats as used up. Luna moving on follows the prompt; Sonnet's re-probe (in one of two screenings, and partially in the other) goes beyond it.

## Jasmine (batch-8, candidate turn 5 → interviewer turn 6) — the sizing check
- Message: the bridge (16 COGS + 2 overhead = 18), "16 points on $480M of revenue is about $77M of annual profit", a full recommendation, risks, next steps, "I'm done — can we do another case?"
- Per-turn hints: VERIFIED FIGURES 24 and 6 (correct, "never doubt"); no recompute, unit-check, coverage or stall note.
- Fixed-prompt rules in force: the sizing rule — "check the quantity… is it the margin impact, or does it include cost that simply grew with revenue? **If the latter**, ask…". Her $77M is 16 points of revenue × $480M: the excess over scaling, i.e. the margin impact — not the latter. FLOW: "once it [the recommendation] is in, probe its biggest risk once (move "risk")".
- **Classification: present, condition not met — the probe was not required.** The prompt asks for the sizing question only when the figure includes normal growth; it doesn't. Going to the risk probe after a delivered recommendation is what FLOW says. Sonnet's "Is that the margin problem, or does it include cost that simply grew with revenue?" is a legitimate test but not a required one.

## Correction to the screening fault counts
Jasmine t6 should not have been scored as a fault for Luna-none, Luna-low or Sol-none (2 each). Corrected: Luna-none 10/40, Luna-low 8/40, Sol-none 8/40 (Sonnet unchanged). Derek t10 stays a gap, but one the current prompt doesn't ask the model to fill.
