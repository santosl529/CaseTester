import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { activeProgram, studentToday } from '@/lib/drills/program/store';
import { QuestionnaireScreen } from '@/components/drills/views/forms';

// The 2–3 minute questionnaire (docs/prd-drills.md "Getting a plan"): the
// quickest of the three ways to get a plan; the least precise, so the first
// workouts check its placements.
export default async function QuestionnairePage() {
  const studentId = await studentOrRedirect();
  const program = await activeProgram(db, studentId);
  if (!program) redirect('/drills/start');
  const { today } = await studentToday(studentId);
  const availability = DRILLS_CONFIG.programs.availability;
  const current = availability.find(a => a.workouts_per_week === program.workoutsPerWeek) ?? availability.find(a => a.default)!;
  return (
    <QuestionnaireScreen availability={availability} today={today} showHours={program.track !== 'self_directed'}
      initial={{ interview_date: program.interviewDate, cases_done: program.casesDone as '0' | '1-5' | '6+' | null, availability: current.id }} />
  );
}
