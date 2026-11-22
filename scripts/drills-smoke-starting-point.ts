// A case interview as the starting point (Matt, 21–22 Nov) against the real database, as throwaway students, with
// made-up case results (no interview, no AI: free). A Brew & Bean result for a student with no plan source places
// skills by the quiz's places and logs starting_point_placed; the quiz skills it couldn't place come back as quick
// checks in this week's focus; a starting point that didn't meet the bar is set aside — not counted for readiness,
// not offered again by the next-case picker within 14 days, and the next attempt is not a retake. A student who
// answered the questions first gets no placement from the case; one whose first case met the bar keeps it as taken.
//
//   npm run drills:smoke:starting-point
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResults, diagnostics, drillAttempts, drillCheckins, drillFeedback, drillItemReports, drillQuestionnaires, drillSets, drillTiers,
  gradingJobs, lessonViews, prescriptions, skillStateEvents, skillStates, studentDrillSettings, studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { ingestCaseResult } from '@/lib/drills/progress/ingest';
import { onboard } from '@/lib/drills/program/store';
import { pendingChecks, submitQuestionnaire } from '@/lib/drills/program/plan-source';
import { startingPointFor } from '@/lib/drills/program/starting-point-store';
import { dashboardCases } from '@/lib/drills/progress/case-source';
import { nextCaseFor } from '@/lib/drills/program/store';
import { caseResultsWired } from '@/lib/drills/case-to-drills';

const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const students: string[] = [];
const DAY = 86_400_000;

async function newStudent() {
  const id = randomUUID();
  students.push(id);
  await db.insert(studentProfiles).values({ userId: id, orgId: 'smoke-test' });
  await onboard(id, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'UTC' });
  return id;
}

const WEAK = { structure: 'needs_work', quantitative: 'strong', dataExhibit: 'meets_bar', synthesis: 'meets_bar', communication: 'meets_bar', pushback: 'meets_bar', creativity: 'meets_bar', judgment: 'meets_bar' } as const;
const STRONG = { structure: 'strong', quantitative: 'strong', dataExhibit: 'strong', synthesis: 'strong', communication: 'meets_bar', pushback: 'meets_bar', creativity: 'meets_bar', judgment: 'meets_bar' } as const;
const bb = (student: string, at: Date, rubric: Record<string, string>) => ({
  case_attempt_id: randomUUID(), student_id: student, case_id: 'prof-001', case_type: 'profitability' as const, difficulty_tier: 2 as const,
  completed_at: at.toISOString(), taxonomy_version: DRILLS_CONFIG.taxonomy.version, rubric_scores: rubric,
  skills_observed: ['PS.mece', 'PS.case_specific', 'PS.depth', 'QN.setup', 'QN.arithmetic', 'EX.takeaway', 'SY.answer_first', 'SY.evidence', 'CM.concise'],
  findings: [{ tag: 'M.overlapping_buckets', severity: 'major' as const, turn_ids: [3], evidence: 'revenue, costs and pricing' }],
});
const state = async (s: string, skill: string) => (await db.select().from(skillStates).where(and(eq(skillStates.studentId, s), eq(skillStates.skillId, skill))))[0];

async function main() {
  check(caseResultsWired(), 'run with CASE_TO_DRILLS=on (the npm script sets it)');
  try {
    // A new student whose first evidence is Brew & Bean, below the bar.
    const a = await newStudent();
    const first = bb(a, new Date(Date.now() - 20 * DAY), WEAK);
    const r1 = await ingestCaseResult(first);
    check(r1.status === 'ingested' && !r1.retake, `first case ingested (${JSON.stringify(r1)})`);
    const [program] = await db.select().from(studentPrograms).where(eq(studentPrograms.studentId, a));
    check(program.planSource === 'case', `the case is the plan source (${program.planSource})`);
    const mece = await state(a, 'PS.mece'), setup = await state(a, 'QN.setup'), depth = await state(a, 'PS.depth');
    check(mece?.state === 'learning' && mece.stage === 'recognize', `PS.mece (major finding) starts at Recognize (${mece?.state}/${mece?.stage})`);
    check(setup?.state === 'learning' && setup.stage === null, `QN.setup (quantitative Strong) tests out (${setup?.state}/${setup?.stage})`);
    check(depth?.state === 'learning' && (depth.stage === 'repair' || depth.stage === 'recognize'), `PS.depth takes the middle place (${depth?.state}/${depth?.stage})`);
    check(!(await state(a, 'EX.takeaway')), 'EX.takeaway (exhibits group off) stays unplaced');
    await new Promise(r => setTimeout(r, 1500));
    const [placedEvent] = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.userId, a), eq(analyticsEvents.eventType, 'starting_point_placed')));
    const untested = (placedEvent?.payloadJsonb as { untested?: string[] } | undefined)?.untested ?? [];
    check(Boolean(placedEvent) && untested.includes('HY.form'), `starting_point_placed logged, HY.form untested (${JSON.stringify(placedEvent?.payloadJsonb)})`);
    const checks = await pendingChecks(a);
    check(checks.every(id => untested.includes(id)), `quick checks only for untested skills (${checks.join(', ')})`);
    console.log(`placed; untested ${untested.length}; quick checks this week: ${checks.join(', ') || 'none'}`);

    const sp = await startingPointFor(db, a);
    check(sp?.caseAttemptId === first.case_attempt_id && sp.setAside, 'the first case is the starting point, set aside (below the bar)');
    const cases = await dashboardCases(a);
    check(cases.find(c => c.key === first.case_attempt_id)?.setAside === true, 'Your progress sees it set aside (not counted for readiness)');
    const pick = await nextCaseFor(a);
    check(pick?.case_id !== 'prof-001', `the picker doesn't offer Brew & Bean again yet (${pick?.case_id})`);

    // The next attempt at Brew & Bean is not a retake.
    const second = bb(a, new Date(Date.now() - 1 * DAY), STRONG);
    const r2 = await ingestCaseResult(second);
    check(r2.status === 'ingested' && r2.retake === false, `the next Brew & Bean attempt is not a retake (${JSON.stringify(r2)})`);
    const [row2] = await db.select().from(caseResults).where(eq(caseResults.caseAttemptId, second.case_attempt_id));
    check(row2?.retake === false, 'stored as a first attempt');
    const [placed2] = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.userId, a), eq(analyticsEvents.eventType, 'starting_point_placed')));
    check(placed2?.id === placedEvent?.id, 'only the starting-point case places skills');

    // Questions first, then the case: no placement from the case; the next attempt is a retake.
    const b = await newStudent();
    await submitQuestionnaire(b, { interview_date: null, cases_done: '1-5', availability: 'standard', ratings: { structuring: 3, math: 2, charts: 5, recommendations: 4 }, hardest: 'math' });
    await new Promise(r => setTimeout(r, 1100));
    await ingestCaseResult(bb(b, new Date(), WEAK));
    check(!(await startingPointFor(db, b)), 'questions first: the case is not a starting point');
    await new Promise(r => setTimeout(r, 1500));
    const bPlaced = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.userId, b), eq(analyticsEvents.eventType, 'starting_point_placed')));
    check(bPlaced.length === 0, 'questions first: no starting_point_placed');
    const rb2 = await ingestCaseResult(bb(b, new Date(Date.now() + 60_000), WEAK));
    check(rb2.retake === true, 'questions first: the next Brew & Bean attempt is a retake');

    // A first case that met the bar counts as taken: the next attempt is a retake.
    const c = await newStudent();
    await ingestCaseResult(bb(c, new Date(Date.now() - 3 * DAY), STRONG));
    const csp = await startingPointFor(db, c);
    check(Boolean(csp) && csp!.setAside === false, 'a starting point that met the bar is not set aside');
    const rc2 = await ingestCaseResult(bb(c, new Date(), WEAK));
    check(rc2.retake === true, 'met the bar: the next attempt is a retake');

    console.log('starting point: placement, quick checks, set aside for readiness and the picker, retakes');
  } finally {
    for (const s of students) {
      for (const t of [drillFeedback, drillItemReports, drillCheckins]) await db.delete(t).where(eq(t.studentId, s));
      const ids = (await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, s))).map(x => x.id);
      if (ids.length) {
        await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
        await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
        await db.delete(drillSets).where(inArray(drillSets.id, ids));
      }
      await db.delete(workouts).where(eq(workouts.studentId, s));
      await db.delete(diagnostics).where(eq(diagnostics.studentId, s));
      await db.delete(caseResults).where(eq(caseResults.studentId, s));
      await db.delete(studentPrograms).where(eq(studentPrograms.studentId, s));
      for (const t of [prescriptions, skillStateEvents, skillStates, drillTiers, studentDrillSettings, lessonViews, drillQuestionnaires]) await db.delete(t).where(eq(t.studentId, s));
      await db.delete(studentProfiles).where(eq(studentProfiles.userId, s));
    }
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents(students, failures);
    for (const s of students) await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, s));
    console.log(`cleaned up ${students.length} test students`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
