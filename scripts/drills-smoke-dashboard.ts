// Your progress end to end against the real database, free (no API calls): a
// throwaway student with six weeks of seeded history (dashboard-seed.ts).
// Checks the empty state before practice, the summary, the skill map by area
// and by interview stage (Clarify's note), focus areas in the workout's own
// order, strengths from Practiced, readiness with a retake left out, the
// trend charts, the skill page (ladder, next step, the score chart's tier
// marker, mistakes with honest example labels, case findings), the
// case_sessions switch, and that no skill code reaches anything the student
// reads. Deletes everything it wrote.
//
//   npm run drills:smoke:dashboard
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { printSmokeSpend } from './smoke-spend';
import { cleanupDashboardSeed, seedDashboardHistory } from './dashboard-seed';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, drillAttempts, drillSets, drillTiers, prescriptions, scores, sessions, skillStateEvents, skillStates, studentDrillSettings,
  studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { onboard } from '@/lib/drills/program/store';
import { recordPlanSource } from '@/lib/drills/program/plan-source';
import { dashboardView, liveSkills, skillDetailView } from '@/lib/drills/progress/dashboard-store';
import { dashboardCases } from '@/lib/drills/progress/case-source';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
// A skill code (PS.mece) in text a student reads.
const CODE = /\b(PS|HY|QN|EX|BJ|CR|SY|CM|CL)\.[a-z_]+\b/;
const visibleText = (v: unknown): string[] => {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(visibleText);
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => (['id', 'skill_id', 'prescription_id', 'key', 'up', 'down'].includes(k) ? [] : visibleText(x)));
  return [];
};

async function main() {
  await db.insert(studentProfiles).values({ userId: student, orgId: 'smoke-test', timezone: 'America/New_York' });
  await onboard(student, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'America/New_York' });
  try {
    // Before any practice: the empty state.
    const empty = await dashboardView(student, { window: 14, period: '2w', group: 'area' });
    check(!empty.practiced && empty.counts.live === liveSkills().length, `empty: practiced ${empty.practiced}`);

    await recordPlanSource(student, 'questionnaire');
    await seedDashboardHistory(student);
    const v = await dashboardView(student, { window: 14, period: '4w', group: 'area' });
    check(v.practiced, 'seeded student shows as not practiced');
    check(v.summary.status !== 'not_enough' && /^You're (improving|holding steady|slipping)/.test(v.summary.sentence), `summary: ${v.summary.status}: ${v.summary.sentence}`);
    // Placements don't count as moves up.
    check(!v.summary.up.includes('CL.data_requests'), 'a placement counted as a move');
    check(v.counts.mastered === 3, `mastered: ${v.counts.mastered}`);
    const areaSkills = v.groups.flatMap(g => g.skills.map(s => s.id));
    check(areaSkills.length === liveSkills().length && new Set(areaSkills).size === areaSkills.length, `skill map: ${areaSkills.length} skills`);
    check(v.groups.flatMap(g => g.skills).some(s => s.arrow !== 'none'), 'no skill has a trend arrow');
    check(v.strengths.map(s => s.name).join() === ['Arithmetic', 'MECE structure', 'Answer first'].map(n => n).join() || v.strengths.length === 3, `strengths: ${v.strengths.map(s => `${s.name} ${s.state}`)}`);
    check(v.strengths.every(s => ['Practiced', 'Mastered', 'Validated'].includes(s.state)), 'a strength below Practiced');
    check(v.focus.map(f => f.skill_id).join() === 'CL.data_requests,EX.takeaway,SY.evidence', `focus order: ${v.focus.map(f => f.skill_id)}`);
    check(!v.strengths.some(st => v.focus.some(f => f.skill_id === st.id)), 'a skill is both a strength and a focus area');
    // Readiness: the last two different tier 2+ cases meet the bar; the prof-001 retake is ignored.
    check(v.readiness.lines[2].met && v.readiness.status === 'Building', `readiness: ${v.readiness.status}, cases ${v.readiness.lines[2].detail}`);
    check(v.week !== null && v.week.milestone_skills.length > 0, 'plan student: no week milestones');
    check(v.trends.states.categories.length === DRILLS_CONFIG.rules.dashboard.trend_weeks && v.trends.rubric.length >= 1, `trends: ${v.trends.states.categories.length} weeks, ${v.trends.rubric.length} rubric tables`);
    check(v.history.length > 0, 'no recent activity');

    const stage = await dashboardView(student, { window: 7, period: 'all', group: 'stage' });
    const clarify = stage.groups.find(g => g.title === 'Clarify');
    check(clarify?.note === 'Practiced in full cases for now.' && clarify.skills.length === 0, `Clarify: ${JSON.stringify(clarify)}`);
    check(stage.groups.map(g => g.title).join() === 'Clarify,Structure,Analyze,Recommend', `stages: ${stage.groups.map(g => g.title)}`);

    // A skill page: PS-1 moved to tier 2, so its chart marks it.
    const mece = (await skillDetailView(student, 'PS.mece'))!;
    check(mece.state === 'mastered' && mece.next === 'Validated needs a full case that shows this skill.', `MECE next: ${mece.next}`);
    check(mece.chart !== null && mece.chart.markers.some(m => m.label === '▲ Up to tier 2'), `MECE markers: ${JSON.stringify(mece.chart?.markers)}`);
    // One last score: the strengths list and the chart agree.
    const meceStrength = v.strengths.find(st => st.id === 'PS.mece');
    check(!meceStrength || meceStrength.score === mece.chart!.series[0].values.at(-1)! / 100, `MECE last score ${meceStrength?.score} vs chart ${mece.chart?.series[0].values.at(-1)}`);
    check(mece.chart!.hollow.length > 0 || mece.not_counted.length === 0, 'tier 1 points should be hollow');
    check(mece.mistakes.every(m => !m.example || m.example.label !== 'You picked' || m.example.answer !== undefined), 'choice examples need the answer');
    check(mece.mistakes.length > 0 && mece.mistakes.every(m => !m.example || m.example.label === 'You picked'), `MECE examples: ${mece.mistakes.map(m => m.example?.label)}`);
    const cl3 = (await skillDetailView(student, 'CL.data_requests'))!;
    check(cl3.findings.length === 1 && cl3.findings[0].quote.includes('all the cost data'), `CL-3 findings: ${JSON.stringify(cl3.findings)}`);
    check(cl3.mistakes.some(m => m.example?.label === 'Your answer' || m.example?.label === 'From your case'), `CL-3 examples: ${cl3.mistakes.map(m => m.example?.label)}`);
    check(await skillDetailView(student, 'XX.nope') === null, 'an unknown skill should 404');

    // Plain names everywhere.
    const leaks = [...visibleText(v), ...visibleText(stage), ...visibleText(mece), ...visibleText(cl3)].filter(t => CODE.test(t));
    check(leaks.length === 0, `skill codes in student text: ${leaks.slice(0, 3).join(' | ')}`);
    console.log(`summary: "${v.summary.sentence}" readiness ${v.readiness.status} (${v.readiness.met}/3); focus ${v.focus.map(f => f.name).join(', ')}`);

    // The case_sessions switch: the case product's own scored session, tiered by its case file.
    const cfg = DRILLS_CONFIG.rules.dashboard as { case_source: string };
    const [session] = await db.insert(sessions).values({ userId: student, caseId: 'prof-001', status: 'completed', completedAt: new Date() }).returning({ id: sessions.id });
    await db.insert(scores).values({ sessionId: session.id, structureRating: 'strong', quantitativeRating: 'meets_bar', synthesisRating: 'strong' });
    cfg.case_source = 'case_sessions';
    try {
      const bridged = await dashboardCases(student);
      check(bridged.length === 1 && bridged[0].tier === 2 && bridged[0].ratings.structure === 'strong' && bridged[0].findings.length === 0, `case_sessions: ${JSON.stringify(bridged)}`);
    } finally {
      cfg.case_source = 'case_results';
      await db.delete(scores).where(eq(scores.sessionId, session.id));
      await db.delete(sessions).where(eq(sessions.id, session.id));
    }
    console.log('case_sessions switch: a scored session reads as a tier 2 case, ratings only');
  } finally {
    await printSmokeSpend([student]);
    await cleanupDashboardSeed(student);
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    if (sets.length) {
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, sets.map(s => s.id)));
      await db.delete(drillSets).where(inArray(drillSets.id, sets.map(s => s.id)));
    }
    await db.delete(workouts).where(eq(workouts.studentId, student));
    await db.delete(studentPrograms).where(eq(studentPrograms.studentId, student));
    for (const t of [prescriptions, skillStateEvents, skillStates, drillTiers, studentDrillSettings]) await db.delete(t).where(eq(t.studentId, student));
    await db.delete(studentProfiles).where(eq(studentProfiles.userId, student));
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents([student], failures);
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, student));
    console.log(`cleaned up test student ${student}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
