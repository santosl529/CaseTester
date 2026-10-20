# Handoff — 20 Oct 2026: wave B2, the B1+B2 findings list, and the own-quantity hotfix to production

Next session: read this, then progress.md "## Now", then the two B1 gradings. Do the three jobs below in order (B2 and the hotfix can run in parallel; the findings list waits for B2's grade). **Build nothing from B1 or B2.**

## Lorenzo's message (verbatim, 20 Oct)

> B1 read. Go on B2: pricing-001 + launch-001, 5 runs each with the onboarding personas, all scored, cap $20, dry run first, on the same head as B1. No code changes before it.
>
> Grading rules, set now before the run:
> - A refusal is false (serious) when a ledger item answers what the candidate asked about, even if not in the exact form asked. Declining a finer cut the case doesn't hold, while giving what it does hold, is fine.
> - A hollow deferral (told it's coming, never released, no "We won't get to") is one firm moderate per ask.
>
> Don't build anything from B1 yet. After B2, put every B1 and B2 finding in one list, sorted: case data (free, no prof-001 recheck), then shared engine with serious faults first, then the bar lines (direct asks lost to code's turns), then the rest, logged only. Send me the list before building.
>
> Round 4's departures and your rulings 1–10 are approved.
>
> Hotfix: fast-forward main to hotfix-own-quantity (9be93ca), push main and let Vercel deploy. Before redeploying the LiveKit agent from that commit, list what changed under lib/orchestrator and lib/voice since a1544c0. Then redeploy and run one voice smoke session on prof-001. Report the Vercel deployment, the new agent version and the smoke export. Nothing else goes to main.

## State at handoff

- **Branch `engine-asks`** (worktree `.claude/worktrees/engine-asks`), HEAD **df544e4**, local only (not pushed or merged). B1 ran at **d71ac1c**. `git diff d71ac1c df544e4 -- lib app components scripts cases tests db` is empty: everything after d71ac1c is docs. So "the same head as B1" means running from this worktree as it is. Don't commit code before B2.
- **Rounds 1–4 are built and proven.** The plans are `docs/superpowers/plans/2026-10-19-engine-asks*.md` (rounds 1–4). The SDD ledgers are `.superpowers/sdd/2026-10-19-engine-asks{,-round2,-round3,-round4}/progress.md`, holding every ruling and deferred minor. They're gitignored; keep them until the merge. The round-4 proof is `Case Interview Runs/replays/2026-10-19/engine-asks/r4-final.md`: prof-001 0 regressions, 0 new false corrections.
- **Approved by Lorenzo (20 Oct):** round 4's departures (the no-"not X" fallback where no base is established; the late-probe quote cap) and the controller's round-4 rulings 1–10. The PRD §16 round-4 entry and its "proposed" marks need updating to say so: one docs commit, folded into the findings-list commit.
- **Wave A (batch 33, prof-001)** graded in `Case Interview Runs/test runs/batch-33/hand-grading.md`. **B1 (batch 34)** graded in `batch-34-larkspur/hand-grading.md` and `batch-34-aldermoor/hand-grading.md`; both fail on false statements and direct asks. Docs commit df544e4.
- **Hotfix branch `hotfix-own-quantity`** (worktree `.claude/worktrees/hotfix-own-quantity`), head **9be93ca**, off main 41cd358. It holds only `lib/orchestrator/own-quantity.ts` and its test. Suite on it: 4,840 passed; tsc and eslint clean. The replay vs main is 0/0: main's older stale rule closes b33 Marisol's claim first, so the fix is proven by its unit tests there. Report from Task 35: `.superpowers/sdd/2026-10-19-engine-asks-round4/task-35-report.md`.
- **Spend so far:** wave A $6.20; B1 $13.80; the live Haiku check $0.04.

## Job 1 — B2 (paid, authorized, cap $20)

- Cases:
  - pricing-001 (Quillpath SaaS Starter Plan Pricing) → batch `batch-35-quillpath`;
  - launch-001 (Hollis Bay Snacks New Product Launch) → batch `batch-35-hollisbay`.
  - Personas 7, 64, 57, 24, 40, all scored. Cap $10 each.
- **Dry run first**, from the engine-asks worktree:
  `npx tsx --env-file=.env.local scripts/persona-batch.ts --batch=batch-35-quillpath --interviewer=sonnet55-baseline --case=pricing-001 --personas=7,64,57,24,40 --cap=10 --dry`
  The same again for `batch-35-hollisbay --case=launch-001`.
  - The dry estimate under-counts new cases. B1's estimate was $4.88 each; actual was $7.25 and $6.55.
- **Launch** both without `--dry`, in parallel, in the background. Before that, start `caffeinate -i -t 4200` as its own background command: a laptop sleep killed a wave on 10 Oct. Each wave takes about 25–30 minutes at human pace.
- **Afterwards:**
  - Sum each `Case Interview Runs/test runs/<batch>/budget-ledger.jsonl` (the `usd` field) and stop caffeinate.
  - The launcher writes runs **inside the worktree's** "Case Interview Runs". Copy the two batch folders and the two wave folders (`batch-35-*-oct-20-runs-1-5`) into the main checkout's `Case Interview Runs/test runs/` with `cp -R`.
- **Grade** both cases, using the batch-34 gradings' format and the bar in `docs/case-onboarding.md` Stage 5:
  - phrasing is advisory;
  - count hollow deferrals;
  - **apply Lorenzo's two new grading rules above** (a refusal is serious when a ledger item answers the ask in any form; a hollow deferral is one firm moderate per ask);
  - read every transcript and report, with hand-verified counts beside the automated ones;
  - compare with batch 32's pricing/launch status (neither ran before; say so).
  - Write `Case Interview Runs/test runs/batch-35-*/hand-grading.md` (main checkout, with copies in the worktree).
  - Docs: PRD §16 entry, case-onboarding tracker/Next/lessons, progress.md. Stage only those docs, never "Case Interview Runs/".
- **Re-grade B1 under the new rules**:
  - the treatment-mix refusals (Aldermoor Marisol t14, Jasmine t4) are serious under rule 1;
  - each B1 hollow deferral becomes a firm moderate;
  - update both batch-34 hand-gradings and note the change.
- Then **stop**. B3 / prof-001 pre-merge wave waits for Lorenzo.

## Job 2 — the B1 + B2 findings list (no building)

One list, every finding from B1 and B2 (from the four hand-gradings and their open questions), sorted:

1. **Case data.** Free, no prof-001 recheck. Example: the entry-001 `current_treatment` cover ("current treatment mix" → the Nimbrel line).
2. **Shared engine, serious faults first.** Example: scope-emptied asks refused without the small-model check (Aldermoor treatment mix; the finer-cut exception kept in round 2), and Tyler t22 "no ramp assumption" in the same turn as the ramp data.
3. **Bar lines: direct asks lost to code's own probe or stage turns.** B1: Larkspur Marisol t11/t25 and Marcus t13; Aldermoor Tyler t21 and Marisol t23.
4. **The rest, logged only.** Examples:
   - the check's loose mapping and its 2 of 13 timeouts at 1.5 s;
   - a reworded brainstorm not credited (re-asked in 2 runs);
   - Marisol t22's possible stale probe;
   - the "Repeating what I said before:" data line doubled;
   - the "$83 million" figure-before-quantity misquote form (Lorenzo: not now);
   - "$8,650" missed;
   - the Marisol 15:2 stale residual;
   - the deferred minors in the round-4 ledger.

For each entry give the case, run and turn, a one-line fault, the class, the proposed fix and its prof-001 risk. Send it to Lorenzo as one message (or an Artifact page if long) and **wait for his ruling before building**.

## Job 3 — the own-quantity hotfix to production (outward-facing; Lorenzo authorized it)

1. **Before anything, check:**
   - `git -C <main checkout> status` is clean on main;
   - `main` is at 41cd358 and `git merge-base --is-ancestor main hotfix-own-quantity` holds, so the fast-forward is possible.
   - **Flag to Lorenzo first:** local main is **1 commit ahead of origin/main**: 41cd358 "docs(claude): never charge twice for one thing" (CLAUDE.md only; his rule). The hotfix branch sits on top of it, so pushing main also pushes 41cd358. His "Nothing else goes to main" may or may not mean to hold it back. It's docs-only and his own rule, but ask in one line before pushing (or push only if he confirms).
2. **Fast-forward and push:** in the main checkout, `git merge --ff-only hotfix-own-quantity`, then `git push origin main`. No other commits.
3. **Vercel:** let it deploy from the push. Report the deployment (the `case-tester` project's production URL, deployment id and commit), using `vercel ls` or the dashboard as the setup allows.
   - progress.md notes five Vercel projects on this repo; only `case-tester` was confirmed live.
4. **List what changed under lib/orchestrator and lib/voice since a1544c0** (the agent's current build, per Lorenzo):
   - `git log --oneline a1544c0..9be93ca -- lib/orchestrator lib/voice`
   - `git diff --stat a1544c0 9be93ca -- lib/orchestrator lib/voice`
   - Checked at handoff, expect two commits:
     - **8b458ee** fix(voice): the setup line ~1s after ready (`lib/voice/setup-timing.ts`, 20 lines);
     - **9be93ca** the own-quantity fix (`lib/orchestrator/own-quantity.ts`, 91 lines).
   - Show the list to Lorenzo in the report. He asked for the list "before redeploying", so produce it first; his go to redeploy is already given.
5. **Redeploy the LiveKit agent** from 9be93ca, per `docs/voice-deploy.md` (the "Deploy" section):
   - `lk agent deploy` from the main checkout at that commit;
   - then `lk agent status` and `lk agent versions` for the new version id.
   - Secrets are unchanged. Never read `.env*` or `.env.voice-worker`.
6. **One voice smoke session on prof-001.** This needs Lorenzo or a browser at the production site; voice sessions are his to run unless a headless path exists, so check `docs/voice-deploy.md` and progress.md.
   - Afterwards export it: `npx tsx --env-file=.env.local scripts/voice-export.ts <sessionId>`, into `Case Interview Runs/voice-live/2026-10-20/`.
   - Report: the Vercel deployment, the new agent version, and the smoke export path, plus a one-line read of it (no false line, timing normal).

## Gotchas

- **Paid runs:** the launcher (`npx tsx --env-file=.env.local scripts/persona-batch.ts:*`) is allow-listed. One wave per go-ahead; report after.
- **`.env.local`:** a symlink to the main checkout's file, already present in engine-asks. Never read it. The hotfix worktree has no symlink (it doesn't need one).
- **Never `git add` anything under "Case Interview Runs/":** recent batches aren't tracked. A round-4 commit swept in batch 33 by accident and had to be amended.
- **Proof tooling:** "Case Interview Runs/replays/2026-10-19/engine-asks/proof.sh <label>" plus `compare.sh <a> <b>`. There are 13 slices; outputs go to `/Users/lorenzo/coding/personal-projects/CaseTester-proof-out`. Not needed for B2.
- **Subagent-driven review discipline** (if anything gets built later): one implementer per task, a review per task, mutation tests, every prof-001 change listed and classified.
