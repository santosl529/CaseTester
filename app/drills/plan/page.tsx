import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentPrograms } from '@/db/schema';
import { studentOrRedirect } from '@/lib/drills/session';
import { healDiagnostic } from '@/lib/drills/grading/jobs';
import { activeProgram, programView, studentToday, todayWorkout, weekCounts, workoutWithStatus } from '@/lib/drills/program/store';
import { planSourceLine } from '@/lib/drills/program/plan-page';
import { CASE_RESULTS_WIRED } from '@/lib/drills/case-result';
import { pendingChecks, planFromCase } from '@/lib/drills/program/plan-source';
import { openPrescriptions } from '@/lib/drills/progress/profile';
import { PlanEmpty, PlanScreen } from '@/components/drills/views/plan';
import { hasSeenLesson, introLesson, lessonForSkill } from '@/lib/drills/program/lessons-store';
import { INTRO_LESSON_ID } from '@/lib/drills/lessons';

// "Your plan" (docs/prd-drills.md "Getting a plan"): shown after the first
// plan source (case, diagnostic or questionnaire), so no path ends without a
// next step: the track, this week's focus, the weekly schedule and the first
// workout. Self-directed students see their starting point and suggestions.
// The source line says what built the plan, when that's accurate (planSourceLine).

export default async function PlanPage() {
  const studentId = await studentOrRedirect();
  await healDiagnostic(studentId);
  await planFromCase(studentId);
  const program = await activeProgram(db, studentId);
  if (!program) redirect('/drills/start');
  if (!program.planSource) {
    // Practice on my own: Plan says there's no plan, and how to set one up (Matt, 13 Nov).
    if (program.track === 'self_directed') return <PlanEmpty />;
    redirect('/drills');
  }
  if (!program.planSeenAt) await db.update(studentPrograms).set({ planSeenAt: new Date() }).where(eq(studentPrograms.id, program.id));
  const view = (await programView(studentId))!;
  const source = planSourceLine(program.planSource, CASE_RESULTS_WIRED);
  const rx = (await openPrescriptions(studentId)).slice(0, 3);
  const checks = await pendingChecks(studentId);
  if (program.track === 'self_directed') {
    return <PlanScreen track={program.track} source={source} rx={rx} checks={checks} view={view} workout={null} next={-1} startHref={null} counts={{}} anyWorkout={false} />;
  }

  const row = await todayWorkout(studentId);
  const workout = row ? await workoutWithStatus(row) : null;
  const next = workout?.blocks.findIndex(b => b.status === 'todo') ?? -1;
  // Foundations reads the intro, then each skill's lesson, before its first set (as on the home).
  let startHref: string | null = null;
  if (program.track === 'foundations' && workout && next >= 0) {
    if (introLesson() !== null && !(await hasSeenLesson(studentId, INTRO_LESSON_ID))) startHref = '/drills/learn/intro?source=auto';
    else {
      const lesson = await lessonForSkill(workout.blocks[next].skill_id);
      if (lesson && !(await hasSeenLesson(studentId, lesson.lesson_id))) startHref = `/drills/learn/${encodeURIComponent(workout.blocks[next].skill_id)}?source=auto&workout=${workout.id}&block=${next}`;
    }
  }
  const { timezone } = await studentToday(studentId);
  const { byWeek, anyWorkout } = await weekCounts(studentId, view.plan, timezone);
  return <PlanScreen track={program.track} source={source} rx={rx} checks={checks} view={view} workout={workout} next={next} startHref={startHref} counts={byWeek} anyWorkout={anyWorkout} />;
}
