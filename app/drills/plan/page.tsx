import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentPrograms } from '@/db/schema';
import { studentOrRedirect } from '@/lib/drills/session';
import { healDiagnostic } from '@/lib/drills/grading/jobs';
import { activeProgram, programView, todayWorkout, workoutWithStatus } from '@/lib/drills/program/store';
import { pendingChecks, planFromCase } from '@/lib/drills/program/plan-source';
import { openPrescriptions } from '@/lib/drills/progress/profile';
import { PlanScreen } from '@/components/drills/views/plan';
import { hasSeenLesson, introLesson, lessonForSkill } from '@/lib/drills/program/lessons-store';
import { INTRO_LESSON_ID } from '@/lib/drills/lessons';

// "Your plan" (docs/prd-drills.md "Getting a plan"): shown after the first
// plan source (case, diagnostic or questionnaire), so no path ends without a
// next step: the track, this week's focus, the weekly schedule and the first
// workout. Self-directed students see their starting point and suggestions.
const SOURCE = {
  case: 'Built from your first full case.',
  diagnostic: 'Built from your diagnostic.',
  questionnaire: 'Built from your answers. Self-ratings are a rough start, so your first workouts include short checks that adjust where each skill starts. A diagnostic or a full case later makes the plan more accurate.',
} as const;

export default async function PlanPage() {
  const studentId = await studentOrRedirect();
  await healDiagnostic(studentId);
  await planFromCase(studentId);
  const program = await activeProgram(db, studentId);
  if (!program) redirect('/drills/start');
  if (!program.planSource) redirect('/drills');
  if (!program.planSeenAt) await db.update(studentPrograms).set({ planSeenAt: new Date() }).where(eq(studentPrograms.id, program.id));
  const view = (await programView(studentId))!;
  const source = SOURCE[program.planSource as keyof typeof SOURCE];
  const rx = (await openPrescriptions(studentId)).slice(0, 3);
  const checks = await pendingChecks(studentId);
  if (program.track === 'self_directed') {
    return <PlanScreen track={program.track} source={source} rx={rx} checks={checks} view={view} workout={null} next={-1} startHref={null} />;
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
  return <PlanScreen track={program.track} source={source} rx={rx} checks={checks} view={view} workout={workout} next={next} startHref={startHref} />;
}
