# Phase 1 gate verdict (26 Oct 2026)

Written for Lorenzo. Branch `phase1` at 7ba45c04 (all streams, base fixes, bank fixes, auditor cal2, Stream 3 tasks 4–7). **5,660 tests pass**, typecheck and lint clean. **No wave has run. Nothing pushed, merged to `main` or deployed.**

## The verdict in one line

**The substantive gate is met. One condition is not met as literally written, and that is a judgement call for you, not a defect.**

## Condition by condition

| Condition | Verdict |
|---|---|
| 0 new false refusals, wrong releases or false corrections across b28–b38 with `*=phase1` | **MET.** 0 / 0 / 0 over 31 slices, 230 runs, 3,125 interviewer turns. F1 = F3 = F4 = 0 on every slice in both arms; F2-next lower on 3 slices, higher on none. 125 of 125 content-changing entries read individually; the other 676 entries accounted for by a complete enumeration of 27 sentence substitutions — nothing sampled blind |
| Every correct-behaviour record passes both ways | **MET bar one.** 95 of 96. The exception is `b34a-tyler-t30-close`, the known "Go on." replay artifact, failing in both arms. Left labelled replayable pending your ruling |
| prof-001 identical with switches off | **MET with the exception you accepted** (§9 item 1). Only the ungated base fix moves one line: b33 Jasmine's "19.2% volume loss, not 5–6%" correction from t18 to t16, said once either way, fact-check unchanged on every prof-001 slice |
| Latency and model calls reported, no call added beyond the brief | **MET.** Per-turn code time mean 31.7 → 34.4 ms, p95 121 → 138 ms, max 209 → 228 ms against a 1.5 s budget. No new live model call; ask-check calls fell (258 → 254, and 68 → 65 on the bank slices); the want cue fires on 1.65% of interviewer turns |
| Tokens per stream, merge and review | **MET** — below |
| Every replayable fault record passes with `*=phase1` | **NOT MET as written: 65 of 155.** See the next section |

## Condition 1, honestly

The 90 records that do not pass are not regressions — nothing in the bank passes while its fault persists, and the independent re-review closed the opposite failure mode too (nothing fails while its fix is correct). They are faults **Phase 1 did not set out to fix in this phase**.

What Phase 1 targeted moved:

| Class | Off → on |
|---|---|
| `close_wait_reask` | 0 → 11 / 12 |
| `true_refusal` (correct records) | 19 / 19 held |
| `restatement` | 8 → 13 / 18 |
| Stream 4's records | → 45 / 102 |
| Stream 2's | → 10 / 18 |
| Stream 3's | → 12 / 39 |

The residue is Phase 2's classes — path leaks and spliced turns — plus records whose fixes are Stream 3 tasks that only landed at the end of this session. **The question for you: is condition 1 meant as "every record Phase 1 owns", in which case it is substantially met, or literally every replayable record, in which case Phase 1 cannot meet it by design?** The condition was written before we knew how the 212 records split by owner.

## M2: the result you asked for

Task 7 (definitions to the live checker) does what it was ordered to do before the wave.

**b37q Raj e08c362a t12 — the exact M2 pattern:**
- definitions **off**: `$405` rated **correct**, no flag — the checker accepting a combined exit rate as a Starter lifetime, the failure PRD §15 recorded as uncorrectable in round 6;
- definitions **on**: `$405` rated **error**, flagged, *"Under the case definition, Starter churn counts cancellations only, not upgrades."*

**Marcus eb8d7576 t14** is flagged in both arms, and with definitions the derivation names the mechanism: *"The candidate's 14 months wrongly counts upgraders as churn."*

Under your Q1 ruling, that checker error rating is exactly what permits code to speak the root correction. **M2 moves from "improved but uncorrectable" to correctable with the checker's agreement.**

**Consistency (your item 2, $0.19 of the $1 cap):** three further runs of both messages. The root flag is **4 for 4** — `error`, flagged, correct value $600, every run, both messages.

**Caveat, stated plainly:** aggregate recall over the 20 messages did **not** improve — off 7/20 and 9/20 on two runs, on 8/20. At n = 20 against a non-deterministic model that is noise, not a gain. The case for definitions rests on M2 specifically.

## Your item 1: the flags the definitions arm added

Flagged claims: **29 on, 22 off.** Every added flag classified from the saved verdicts:

| Run / turn | Candidate said | Why flagged | Verdict |
|---|---|---|---|
| 087451cb t26 | 40% as Pro's annual cancellation | Pro's month-12 figure is 21.5%; 40% is Starter's — rows swapped | real misquote |
| 087451cb t32 | $30 × 30 months = $900, "exactly 3.0x" | lifetime is 20 months → $600, 2.0x | real conceptual |
| 34eb553a t6 | 250 × 0.015 = 3.75M patients | the case states 1.6% → 4.0M | real misquote |
| 442e37ff t6 | 3.00 − 1.55 = $1.45 | ingredient cost is $1.50; result within ~3% | real misquote, tolerance-edge |
| e08c362a t12 | $405 / 1.35x / $1,205 | the M2 root and its two consequences | real conceptual |
| eb8d7576 t14 | "75% — better than Pro's 80%" | 75 < 80 | real arithmetic |
| eb8d7576 t14 | ~7% a month, ~14 months | counts upgraders as churn; ~5% | real conceptual (M2) |
| eb8d7576 t14 | $1,220, ~4x | $1,400, 4.7x; conclusion holds | real, understated |
| a2a5921b t12 | $100 − $22 = $78, × 50 = $3,900 | cost to serve is $20 → $4,000; result within 5% | real misquote, tolerance-edge |
| a2a5921b t30 | "$780 of $1,340"; "3x at $288 CAC" | $800 of $1,400; CAC is $300 | real misquote |
| cee7d399 t14 | −$300 a departure; $0.6M a year | −$600 and $1.2M | real misquote |

**Zero false flags on correct work — your blocker test passes.** Two notes:
- **Two flags sit on results within tolerance whose inputs are misquoted** (442e37ff t6, a2a5921b t12). The misquote is the real fault, so flagging is right, but the spoken line must name the misquoted input rather than "correct" a result that is within tolerance. Worth one check of what `misquoteFlat` says on those two turns before the wave.
- **Several additions are derived consequences of a flagged root** (e08c362a t12's 1.35x and $1,205; eb8d7576 t14's $1,220). Under `rootLineage` those link to the root instead of being probed separately, so 29 flags do not mean 29 spoken lines.

## What Phase 1 delivered, on free replays

- **13 graded faults fixed** on the replay, including both batch-38 false "split" refusals, Tyler's doubled 90-word restatement, his hollow deferral, both of batch-38 Marisol's firm faults, and four misquotes now corrected (the $21M fixed costs and the $3.6M Westhaven figure among them).
- **prof-001 gains 5 fixes with no new harm of any class.**
- **The b35q Marcus false correction is gone from every arm** — the one Phase 1 itself introduced and the review caught.
- **9 false math flags removed with 0 true flags suppressed** (your P3 ruling), measured over the parser's entire blast radius rather than a sample.
- **Two base regressions fixed**, one of them bigger than the record that found it: b37q Raj's root correction had been dropped entirely and only reached him at t36.
- **The measuring instrument itself was repaired**: 7 records had been hiding in `diverged` rather than failing, and 4 passed on silence.

## Money

**$9.51 across all of Phase 1.**

| Item | Spend | Cap |
|---|---|---|
| Auditor calibration 1 | $3.62 | $25 |
| Auditor calibration 2 | $3.58 | $5 |
| Definitions re-check (3 arms) | $2.12 | $3 |
| M2 consistency (3 runs) | $0.19 | $1 |
| **Total** | **$9.51** | — |

My error on the re-check: the first run did not persist its verdicts, so a second on-arm run was needed to get a same-run comparison. That cost about $0.60 more than planned, inside the cap.

## Tokens

Session 1: 3,154,658. Session 2: ~2.87M. Session 3 (this one): ~2.0M — auditor 186,696, bank 262,364, Stream 3 tasks 4–7 415,153 + 296,080, combined replay 304,053, plus the lead's merging, replays and this verdict.

## Still open for you

1. **Condition 1's reading** (above) — the only thing between here and a clean verdict.
2. **`b34a-tyler-t30-close`**: relabel the "Go on." artifact non-replayable, or leave it failing in both arms? It costs one correct record either way. There are now three such bare "Go on." turns, not one.
3. **`misquoteFlat` repeats a correction already given**: b32 Tyler is corrected at t12, re-misquotes at t27, and gets the identical line at t28 — the "said once" guard does not cover that path, and spending t28 pushes the close out.
4. **A flat correction lands on the closing turn**: b38l Tyler t32 prepends ~70 words to the goodbye to fix one figure, never names which figure was wrong, and the case ends with no chance to revise.
5. **The correction-for-probe trade has a second instance** (b35q Marisol). The binding constraint is `WRAP_UP_PROBES = 2`, not any switch.
6. **§9 item 10 could not be followed literally**: `mathSteps[].inputs` are ledger ids, so `pro_ltv` would fail to load and, if it loaded, would silence that step's own check. The missing thing is the `dependsOn` edge — recommended form `dependsOn: ["starter_ltv","pro_ltv"]`, replayed in the lineage arm. Not built.
7. **§9 item 11 unverified**: what the worksheet binds b35q 5c3d2c21 t13's "$600, not $400" to with switches on. The free method is in the Stream 3 report.
8. **~300 unread detector flags** in the checker-label builder: a bare rebuild writes 671 labels against the 350 committed, because the D6 scan now flags messages in b22–38 nobody has read. The labels were merged additively and the scan left untouched. What happens to those ~300 is yours.
9. **b38 Tyler t14's "$125" misquote is still not caught** — code never finds it, because the Lakeport fare anchors don't match the sentence. Across 487 runs, 49 turns withheld a math challenge and none named a figure code had found misquoted. The fix is a route-scoped anchor: case data, not math code.
10. **The arithmetic checker is blind on real speech**: all 24 real STT sentences in `voice-live` produce no claim at all — fillers and commas break every chain. Pinned by a test so it cannot drift. Fixing it means raising claims on speech, the opposite risk profile.
11. **Two tolerance-edge misquote flags** (above) — check `misquoteFlat`'s wording on them before the wave.
12. **4.4 is not implemented**, by your ruling: `refusalNounCheck` left the preset because it cost 3 correct and 3 fault records while leaving its own `false_refusal` class unchanged at 7/15. The two false refusals it was written for are fixed by 4.2 and 4.5 instead.

## The wave, when you want it

Not started, and it needs your explicit go. As specified: all five cases × the usual 5 personas, plus the 3 new personas (65 Dana, 66 Remy, 67 Victor) on prof-002 and pricing-001 — 31 runs, `ENGINE_SWITCHES='*=phase1'`, hard cap $50, grading auditor → hand → your blind second grade.

Three things to decide first:
- the auditor grades **as triage only** (87% / 92% family recall on asks and math, but class right on 81 of 96 and severity on 62 of 96, and it misses a serious false refusal twice);
- a new wave on an existing batch manifest needs `--new-version`, because personas 65–67 changed the bands hash;
- **4.6 reaches the wave untested** — the want cue cannot be proven offline, since the replay serves each run's saved classifier detections. Your ruling was to report its firings and how many were real asks.
