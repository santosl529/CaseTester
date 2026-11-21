// Step 6 of case results → drills (Matt, 15 Nov; proposal §8): the whole loop for one throwaway student against the
// real database, with the real grader and tagger — case → results → recommendations → workout → drills → skill
// progress → dashboard → next case → Validated. Two stored test-account interviews (persona students, no real
// student's words) are copied to the student and graded as if just finished: Larkspur Air, then Hollis Bay Snacks,
// both Easy. In between, the student passes a set for each recommended skill from the report, and one skill is seeded
// at Mastered (earning it through sets takes days of transfer waits) so the second case can validate it.
// The first case keeps its stored grade (from the same Opus grader) and runs the step scoreAndStore calls after
// grading; the second is graded live through scoreSession, as the report page does. A step that fails (for one, too
// little of the scoring budget left — a 218 s grading on the first run, 16 Nov) is retried as the report's Try again
// does (retryCaseRun). Paid: one grading (about $0.70) and two or three tagging calls (about $0.04 each; Matt's go,
// 16 Nov, about $2 in all), capped by LLM_BUDGET_USD; written drill answers are graded too (cents). Deletes
// everything it wrote, the copied sessions included.
//
//   LLM_BUDGET_USD=1.5 npm run drills:smoke:case-loop
import './smoke-log';
process.env.CASE_TO_DRILLS = 'on';
import { checkSmokeEvents } from './smoke-events';
import { printSmokeSpend } from './smoke-spend';
import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResultRuns, caseResults, drillAttempts, drillItems, drillSets, drillTiers, exhibitsShown, gradingJobs,
  prescriptions, revealedData, scores, sessionEvents, sessionTurns, sessions, skillStateEvents, skillStates,
  studentDrillSettings, studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { DRILLS_CONFIG, TAXONOMY_VERSION, getDrill, getMistakeTag } from '@/lib/drills/config';
import { requireRunBudget } from '@/lib/llm-budget';
import { scoreSession, storedCaseResultInput } from '@/lib/scoring/score-session';
import { retryCaseRun, runCaseRunAfterResponse } from '@/lib/drills/progress/case-runs';
import type { RubricScores } from '@/lib/scoring/judge';
import { nextCaseFor, onboard, todayWorkout } from '@/lib/drills/program/store';
import type { WorkoutBlock } from '@/lib/drills/program/workout';
import { reportDrillsView } from '@/lib/drills/progress/report-view';
import { dashboardView } from '@/lib/drills/progress/dashboard-store';
import { completeSet, fetchItem, setResults, startSet, submitAttempt } from '@/lib/drills/sets/service';
import type { StepResponse } from '@/lib/drills/sets/scoring';
import type { ItemRef } from '@/lib/drills/sets/plan';
import { rebuildItem } from '@/lib/drills/generators/registry';
import { ItemSchema, type Item, type Tier } from '@/lib/drills/item-schema';
import { D2_DRILLS, P1_DRILLS, REPAIR_DRILL_IDS, modelAnswerSteps } from '@/lib/drills/model-answers';
import { withDefend } from '@/lib/drills/defend';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const say = (line: string) => console.log(line);
// A skill code (PS.mece) in text a student reads.
const CODE = /\b(PS|HY|QN|EX|BJ|CR|SY|CM|CL)\.[a-z_]+\b/;
const RANK = ['not_started', 'learning', 'recognizes', 'practiced', 'mastered', 'validated'];
const HOUR = 3_600_000;

// The two interviews (test accounts, graded 27 Oct and 21 Oct): Larkspur's structure was rated Needs work, so it
// prescribes; Hollis Bay rated Synthesis and Quantitative Strong with no "needs work" points.
const CASE_A = { source: '904b0b33-3b7f-46ec-b034-3cf2fc00f36a', caseId: 'prof-002' };
const CASE_B = { source: '527217df-454c-481f-8b39-a58171596f85', caseId: 'launch-001' };
// The skill seeded at Mastered: the first of these the first case didn't flag (observed when the recommendation
// or a math step is answered; their dimensions were Strong on the stored Hollis Bay report).
const VALIDATE_CANDIDATES = ['SY.answer_first', 'SY.evidence', 'QN.arithmetic'];

const copied: string[] = [];

// A copy of a finished interview for the student, finished at `completedAt`: the session and everything grading
// reads (turns, revealed data, exhibits shown, session events), and with `withScore` its latest stored grade.
async function copySession(src: typeof CASE_A, completedAt: Date, withScore = false): Promise<string> {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, src.source));
  if (!s || s.status !== 'completed' || s.caseId !== src.caseId || !s.completedAt) throw new Error(`source session ${src.source} is not a completed ${src.caseId}`);
  const shift = completedAt.getTime() - s.completedAt.getTime();
  const flags = { ...(s.flagsJsonb as Record<string, unknown>) };
  delete flags.scoringClaimAt;
  delete flags.scoringClaimBeat;
  const [copy] = await db.insert(sessions).values({
    userId: student, caseId: s.caseId, phase: s.phase, elapsedMs: s.elapsedMs, status: 'completed', abandonPhase: s.abandonPhase,
    phaseStartedAt: new Date(s.phaseStartedAt.getTime() + shift), startedAt: new Date(s.startedAt.getTime() + shift), completedAt,
    flagsJsonb: flags, coverageJsonb: s.coverageJsonb,
  }).returning({ id: sessions.id });
  copied.push(copy.id);
  const sessionId = copy.id;
  const turns = await db.select().from(sessionTurns).where(eq(sessionTurns.sessionId, src.source));
  if (turns.length) await db.insert(sessionTurns).values(turns.map(t => ({ sessionId, turnIndex: t.turnIndex, role: t.role, text: t.text, timestampMs: t.timestampMs, latencyMs: t.latencyMs })));
  const revealed = await db.select().from(revealedData).where(eq(revealedData.sessionId, src.source));
  if (revealed.length) await db.insert(revealedData).values(revealed.map(r => ({ sessionId, ledgerItemId: r.ledgerItemId, revealedAtMs: r.revealedAtMs })));
  const shown = await db.select().from(exhibitsShown).where(eq(exhibitsShown.sessionId, src.source));
  if (shown.length) await db.insert(exhibitsShown).values(shown.map(x => ({ sessionId, exhibitId: x.exhibitId, shownAtMs: x.shownAtMs })));
  const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, src.source));
  if (events.length) await db.insert(sessionEvents).values(events.map(e => ({ sessionId, category: e.category, subtype: e.subtype, turnIndex: e.turnIndex, phase: e.phase, payloadJsonb: e.payloadJsonb })));
  if (withScore) {
    const [score] = await db.select().from(scores).where(eq(scores.sessionId, src.source)).orderBy(desc(scores.createdAt)).limit(1);
    const kept = Object.fromEntries(Object.entries(score).filter(([k]) => !['id', 'sessionId', 'createdAt'].includes(k)));
    await db.insert(scores).values({ ...(kept as Omit<typeof scores.$inferInsert, 'sessionId'>), sessionId });
  }
  say(`copied ${src.caseId}${withScore ? ' with its stored grade' : ''} (${turns.length} turns, ${revealed.length} data items, ${events.length} session events)`);
  return sessionId;
}

// Live: grades a copied interview the way the report page does (scoreSession, which runs the step after storing the
// score). Otherwise: runs the step on the stored grade, as scoreAndStore does. Then reads what the step stored; a
// failed step is retried as the report's Try again does.
async function grade(sessionId: string, label: string, live: boolean) {
  const t0 = Date.now();
  if (live) {
    const { status } = await scoreSession({ sessionId, userId: student });
    check(status === 'scored', `${label}: scoring returned ${status}`);
  } else {
    const input = await storedCaseResultInput(sessionId);
    if (!input) throw new Error(`${label}: no stored input for the step`);
    await runCaseRunAfterResponse(sessionId, input, Date.now() + 300_000);
  }
  const [score] = await db.select().from(scores).where(eq(scores.sessionId, sessionId));
  let [run] = await db.select().from(caseResultRuns).where(eq(caseResultRuns.sessionId, sessionId));
  if (run?.status === 'failed') {
    say(`  the step failed (${run.error}); Try again`);
    const retried = await retryCaseRun(sessionId);
    check(retried === 'done', `${label}: Try again returned ${retried}`);
    [run] = await db.select().from(caseResultRuns).where(eq(caseResultRuns.sessionId, sessionId));
  }
  const [result] = await db.select().from(caseResults).where(eq(caseResults.caseAttemptId, sessionId));
  check(run?.mode === 'on' && run.status === 'applied', `${label}: case run ${run?.mode}/${run?.status}${run?.error ? ` — ${run.error}` : ''}`);
  check(Boolean(result) && !result.retake && !result.partial && result.nextSteps !== null, `${label}: case result ${JSON.stringify(result && { retake: result.retake, partial: result.partial, nextSteps: Boolean(result.nextSteps) })}`);
  const rubric = score?.rubricJsonb as RubricScores | undefined;
  const short = (r?: string | null) => (r === 'strong' ? 'Strong' : r === 'meets_bar' ? 'Adequate' : r === 'needs_work' ? 'Needs work' : '—');
  say(`${label}: ${live ? 'graded' : 'step run'} in ${Math.round((Date.now() - t0) / 1000)} s; ${Object.entries(result?.rubricScores as Record<string, string> ?? {}).map(([k, v]) => `${k} ${short(v)}`).join(', ')}`);
  const payload = run?.payload as { findings?: { tag: string; severity: string }[]; skills_observed?: string[] } | null;
  say(`  findings: ${payload?.findings?.map(f => `${skillOfTag(f.tag)} ${f.tag} (${f.severity})`).join('; ') || 'none'}`);
  say(`  skills observed: ${payload?.skills_observed?.join(', ') || 'none'}; tagging cost $${(run?.costUsd ?? 0).toFixed(3)}`);
  return { rubric: rubric ?? null, scoredAt: score?.createdAt ?? null, payload };
}

// The full item (with its key) behind a set position: rebuilt from its seed, or read from drill_items.
async function itemFor(setId: string, position: number): Promise<Item> {
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, setId));
  const ref = (set.itemPlan as ItemRef[])[position];
  if (ref.kind === 'generated') return rebuildItem(ref, set.tier as Tier);
  const [row] = await db.select().from(drillItems).where(and(eq(drillItems.itemId, ref.item_id), eq(drillItems.version, ref.version)));
  return ItemSchema.parse(row.payload);
}

// Right answers to every item: a written drill's model answer (with its Defend follow-up when the set runs one),
// otherwise the key's option or number on each step.
async function passSet(setId: string) {
  const [set] = await db.select({ size: drillSets.size }).from(drillSets).where(eq(drillSets.id, setId));
  for (let position = 0; position < set.size; position++) {
    const fetched = await fetchItem(student, setId, position);
    const item = await itemFor(setId, position);
    let answers: StepResponse[];
    if ([...D2_DRILLS, ...REPAIR_DRILL_IDS, ...P1_DRILLS].includes(item.drill_id)) {
      const defend = Boolean(fetched.item.input.steps?.some(st => st.defend)) && item.defend;
      answers = modelAnswerSteps(defend ? withDefend(item) : item);
    } else {
      const steps = item.input.steps?.length ?? 1;
      answers = Array.from({ length: steps }, (_, i) => ((item.input.steps?.[i].type ?? item.input.type) === 'numeric'
        ? { type: 'numeric' as const, value: String(item.numeric!.answer) }
        : { type: 'choice' as const, option_id: item.options.find(o => o.correct)!.id }));
    }
    for (const [i, response] of answers.entries()) {
      await submitAttempt(student, setId, { position, idempotency_key: `loop-${setId}-${position}-${i}`, step: i, response, skip: false, timed_out: false });
    }
  }
  await completeSet(student, setId);
  return setResults(student, setId);
}

async function stateOf(skillId: string) {
  const [s] = await db.select().from(skillStates).where(and(eq(skillStates.studentId, student), eq(skillStates.skillId, skillId)));
  return s ?? null;
}

const skillOfTag = (tag: string) => getMistakeTag(tag)?.skill ?? tag;
const dimensionOf = (skillId: string) => {
  const area = DRILLS_CONFIG.taxonomy.skills.find(s => s.id === skillId)!.area;
  return DRILLS_CONFIG.taxonomy.areas.find(a => a.code === area)!.rubric_dimension;
};

async function main() {
  const budget = requireRunBudget('drills-smoke-case-loop');
  await db.insert(studentProfiles).values({ userId: student, orgId: 'smoke-test', timezone: 'America/New_York' });
  await onboard(student, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'America/New_York' });
  try {
    // ---- 1. The first case: results and recommendations.
    say('\n1. First case: Larkspur Air (Easy)');
    const a = await copySession(CASE_A, new Date(Date.now() - 3 * HOUR), true);
    const first = await grade(a, 'Larkspur Air', false);
    const openRx = await db.select().from(prescriptions).where(and(eq(prescriptions.studentId, student), eq(prescriptions.status, 'open')));
    check(openRx.length >= 1 && openRx.length <= 3 && openRx.every(p => p.sourceType === 'case' && p.sourceId === a), `prescriptions: ${openRx.map(p => `${p.skillId} ${p.sourceType}`).join(', ')}`);
    check(openRx.every(p => !CODE.test(p.reasonText)), 'a skill code in a prescription reason');
    for (const p of openRx) say(`  prescription: ${p.skillId} → ${p.drillId} ${p.stage} tier ${p.tier}, priority ${p.priority}: "${p.reasonText}"`);
    for (const p of openRx) check(RANK.indexOf((await stateOf(p.skillId))?.state ?? 'not_started') >= 1, `${p.skillId}: still Not started after its prescription`);

    const viewA = await reportDrillsView(student, a, first.rubric, { caseId: CASE_A.caseId, scoredAt: first.scoredAt });
    const stepsA = viewA?.nextSteps?.state === 'ready' ? viewA.nextSteps : null;
    check(viewA !== null && viewA.comparison === null, `first case: comparison ${JSON.stringify(viewA?.comparison)}`);
    check(stepsA !== null && stepsA.snapshot.skills.length >= 1 && !stepsA.ready && stepsA.done.length === 0, `first report's next steps: ${JSON.stringify(viewA?.nextSteps)}`);
    if (!stepsA) throw new Error('no next steps on the first report; stopping');
    check(stepsA.snapshot.skills.every(s => openRx.some(p => p.id === s.prescription_id)), 'a next step without its open prescription');
    check(stepsA.snapshot.skills.every(s => s.why && s.quote && !CODE.test(`${s.name} ${s.why}`)), 'a next step without a plain why and quote');
    check(typeof stepsA.nextCase === 'object' && stepsA.nextCase?.title === 'Hollis Bay Snacks New Product Launch' && stepsA.nextCase.difficulty === 'Easy', `next case on the report: ${JSON.stringify(stepsA.nextCase)}`);
    say('  Your next steps:');
    for (const s of stepsA.snapshot.skills) say(`    ${s.name}: ${s.why} "${s.quote}" — ${s.practice ? `${s.practice.drill_name} · Level ${s.practice.level} · about ${s.practice.minutes} min` : 'no drill'}${s.lesson ? `; lesson ${s.lesson.minutes} min` : ''}`);
    if (stepsA.snapshot.also) say(`    Also from this case: ${stepsA.snapshot.also.name}: ${stepsA.snapshot.also.why}`);
    say(`    about ${stepsA.minutes} min; then ${typeof stepsA.nextCase === 'object' ? `${stepsA.nextCase?.title} · ${stepsA.nextCase?.difficulty}` : stepsA.nextCase}`);
    if (stepsA.strengths.length) say(`    What went well: ${stepsA.strengths.map(s => s.label).join(', ')}`);

    // ---- 2. The workout: the case made the plan and leads today's workout.
    say('\n2. Today\'s workout');
    const [program] = await db.select().from(studentPrograms).where(eq(studentPrograms.studentId, student));
    check(program?.planSource === 'case', `plan source: ${program?.planSource}`);
    const workout = await todayWorkout(student);
    const blocks = (workout?.blocks ?? []) as WorkoutBlock[];
    check(blocks.some(b => openRx.some(p => p.id === b.prescription_id)), `today's workout has no case prescription: ${blocks.map(b => `${b.slot} ${b.skill_id}`).join(', ')}`);
    for (const b of blocks) say(`  ${b.slot}: ${b.skill_id} ${b.drill_id} tier ${b.tier}${b.prescription_id ? ' (from the case)' : ''} — ${b.reason}`);

    // ---- 3. Practice from the report, and skill progress.
    say('\n3. Practice from the report');
    const before = new Map<string, string>();
    for (const s of stepsA.snapshot.skills) before.set(s.skill_id, (await stateOf(s.skill_id))?.state ?? 'not_started');
    const practiced: { drillId: string; focus: string | null }[] = [];
    for (const s of stepsA.snapshot.skills.filter(x => x.practice)) {
      const { set_id } = await startSet(student, { prescription_id: s.prescription_id, report: { case_attempt_id: a, skill_id: s.skill_id } });
      const r = await passSet(set_id);
      const [row] = await db.select({ drillId: drillSets.drillId, focus: drillSets.focusSkill, passed: drillSets.passed, tier: drillSets.tier }).from(drillSets).where(eq(drillSets.id, set_id));
      practiced.push(row);
      check(r.status === 'completed' && row.passed === true, `${s.skill_id}: set ${r.status}, passed ${row.passed}, score ${r.status === 'completed' ? r.score : '?'}`);
      const after = await stateOf(s.skill_id);
      say(`  ${s.name}: ${row.drillId} tier ${row.tier}, ${r.status === 'completed' ? Math.round((r.score ?? 0) * 100) : '?'}% → ${before.get(s.skill_id)} → ${after?.state} (level-2 passing streak ${after?.l2PassingStreak})`);
      check(after !== null && (RANK.indexOf(after.state) > RANK.indexOf(before.get(s.skill_id)!) || after.l2PassingStreak + after.l1PassingStreak > 0), `${s.skill_id}: no progress from a passing set`);
    }
    const tickedA = await reportDrillsView(student, a, first.rubric, { caseId: CASE_A.caseId, scoredAt: first.scoredAt });
    const ticked = tickedA?.nextSteps?.state === 'ready' ? tickedA.nextSteps : null;
    const withDrill = stepsA.snapshot.skills.filter(s => s.practice).map(s => s.skill_id);
    check(ticked !== null && withDrill.every(id => ticked.done.includes(id)) && ticked.ready, `report after practice: done ${ticked?.done}, ready ${ticked?.ready}`);
    say(`  the report now ticks ${ticked?.done.length} of ${stepsA.snapshot.skills.length}; ready for the next case: ${ticked?.ready}`);
    await new Promise(r => setTimeout(r, 1000));
    const completedEvents = await db.select({ p: analyticsEvents.payloadJsonb }).from(analyticsEvents)
      .where(and(eq(analyticsEvents.userId, student), eq(analyticsEvents.eventType, 'next_step_completed')));
    check(completedEvents.length === practiced.length, `next_step_completed events: ${completedEvents.length} for ${practiced.length} sets`);

    // ---- 4. The dashboard after one case.
    say('\n4. Your progress after one case');
    const dash1 = await dashboardView(student, { window: 14, period: '2w', group: 'area' });
    check(JSON.stringify(dash1.case_to_case) === JSON.stringify([{ level: 'Easy', kind: 'one' }]), `Case to case after one case: ${JSON.stringify(dash1.case_to_case)}`);
    check(dash1.focus.length > 0, 'no focus areas after a case');
    say(`  focus: ${dash1.focus.map(f => f.name).join(', ')}; Case to case: Easy, one so far; summary: ${dash1.summary.sentence}`);

    // ---- 5. The next case, with one skill seeded at Mastered.
    say('\n5. Next case');
    const pick = await nextCaseFor(student);
    check(pick?.case_id === CASE_B.caseId && !pick.retake, `next case: ${JSON.stringify(pick)}`);
    const flaggedA = new Set((first.payload?.findings ?? []).map(f => skillOfTag(f.tag)));
    const seeded = VALIDATE_CANDIDATES.find(id => !flaggedA.has(id) && !openRx.some(p => p.skillId === id))!;
    const now = new Date();
    await db.insert(skillStates).values({
      studentId: student, skillId: seeded, state: 'mastered', stage: 'construct', practicedAt: new Date(now.getTime() - 10 * 24 * HOUR),
      lastPracticedAt: new Date(now.getTime() - 2 * 24 * HOUR), nextReviewAt: new Date(now.getTime() + 20 * 24 * HOUR), taxonomyVersion: TAXONOMY_VERSION,
    }).onConflictDoUpdate({ target: [skillStates.studentId, skillStates.skillId], set: { state: 'mastered', stage: 'construct', nextReviewAt: new Date(now.getTime() + 20 * 24 * HOUR) } });
    say(`  suggested: ${pick?.title}; seeded ${seeded} at Mastered`);
    const b = await copySession(CASE_B, new Date());
    const second = await grade(b, 'Hollis Bay Snacks', true);

    // ---- 6. Validated, the comparison, and the dashboard after two cases.
    say('\n6. After the second case');
    const seededAfter = await stateOf(seeded);
    const flaggedB = (second.payload?.findings ?? []).filter(f => skillOfTag(f.tag) === seeded);
    const observedB = second.payload?.skills_observed?.includes(seeded);
    check(seededAfter?.state === 'validated', `${seeded}: ${seededAfter?.state} (observed ${observedB}, findings ${flaggedB.map(f => f.tag).join(', ') || 'none'})`);
    const [validatedEvent] = await db.select().from(skillStateEvents).where(and(eq(skillStateEvents.studentId, student), eq(skillStateEvents.skillId, seeded), eq(skillStateEvents.toState, 'validated')));
    check(validatedEvent?.fromState === 'mastered', `${seeded}: no Mastered → Validated event`);
    say(`  ${seeded}: Mastered → ${seededAfter?.state}`);

    const viewB = await reportDrillsView(student, b, second.rubric, { caseId: CASE_B.caseId, scoredAt: second.scoredAt });
    const cmp = viewB?.comparison;
    check(cmp?.kind === 'same_level' && cmp.previous.sessionId === a && cmp.rows.length > 0, `comparison: ${JSON.stringify(cmp && { kind: cmp.kind, previous: cmp.previous.sessionId, rows: cmp.rows.length })}`);
    for (const row of cmp?.rows ?? []) {
      const expected = row.move > 0 ? practiced.filter(s => (s.focus ? [s.focus] : getDrill(s.drillId).primary_skills).some(id => dimensionOf(id) === row.dimension)).length : 0;
      check(row.sets === expected, `${row.dimension}: ${row.sets} sets counted, expected ${expected}`);
      say(`  ${row.dimension}: ${row.before} → ${row.after}${row.move > 0 ? ' ↑' : row.move < 0 ? ' ↓' : ''}${row.sets ? ` (practiced in ${row.sets} drill sets since your last case)` : ''}`);
    }
    check(viewB?.nextSteps?.state === 'ready', `second report's next steps: ${viewB?.nextSteps?.state}`);

    const dash2 = await dashboardView(student, { window: 14, period: '2w', group: 'area' });
    const easy = dash2.case_to_case.find(c => c.level === 'Easy');
    const moved = (cmp?.rows ?? []).filter(r => r.move !== 0).length;
    check(easy?.kind === 'compared' && easy.from.title.startsWith('Larkspur') && easy.to.title.startsWith('Hollis Bay') && easy.moved.length === moved,
      `Case to case after two cases: ${JSON.stringify(dash2.case_to_case)}`);
    check(dash2.summary.case_lines.length === moved, `summary case lines: ${dash2.summary.case_lines.length}, moved ${moved}`);
    for (const line of dash2.summary.case_lines) say(`  summary: ${line}`);
    check(dash2.strengths.length === 0 || !dash2.strengths.some(s => CODE.test(s.name)), 'a skill code in strengths');

    const after = await nextCaseFor(student);
    check(after !== null && (after.case_id === null ? after.retake : ![CASE_A.caseId, CASE_B.caseId].includes(after.case_id)), `next case after both Easy cases: ${JSON.stringify(after)}`);
    say(`  next case now: ${after?.title ?? 'every case taken'}`);
  } finally {
    console.log('');
    await printSmokeSpend([student]);
    console.log(`[budget] ${budget.summary()}`);
    // Events are written after the response; give them a moment.
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents([student], failures);
    const sets = (await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student))).map(s => s.id);
    if (sets.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, sets));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, sets));
      await db.delete(drillSets).where(inArray(drillSets.id, sets));
    }
    await db.delete(workouts).where(eq(workouts.studentId, student));
    await db.delete(studentPrograms).where(eq(studentPrograms.studentId, student));
    for (const t of [prescriptions, skillStateEvents, skillStates, caseResults, drillTiers, studentDrillSettings]) await db.delete(t).where(eq(t.studentId, student));
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, student));
    if (copied.length) {
      await db.delete(analyticsEvents).where(inArray(analyticsEvents.sessionId, copied));
      for (const t of [caseResultRuns, scores, sessionEvents, revealedData, exhibitsShown, sessionTurns]) await db.delete(t).where(inArray(t.sessionId, copied));
      await db.delete(sessions).where(inArray(sessions.id, copied));
    }
    await db.delete(studentProfiles).where(eq(studentProfiles.userId, student));
    const left = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, student));
    console.log(`cleaned up test student ${student} (${copied.length} copied sessions; ${left.length} left)`);
  }
  if (failures.length) {
    console.error(`\nCase loop smoke FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nCase loop smoke passed: case → results → next steps → workout → practice → skill progress → dashboard → next case → Validated.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
