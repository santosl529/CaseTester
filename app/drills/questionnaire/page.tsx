import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { activeProgram, studentToday } from '@/lib/drills/program/store';
import { QuestionnaireForm } from '@/components/drills/questionnaire-form';

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
    <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
      <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">A few questions</h1>
        <p className="text-sm text-muted-foreground">About 2–3 minutes. Your answers set where each skill starts; your first workouts include short checks that adjust it. A diagnostic or a full case later makes it more accurate.</p>
      </header>
      <QuestionnaireForm availability={availability} today={today} showHours={program.track !== 'self_directed'}
        initial={{ interview_date: program.interviewDate, cases_done: program.casesDone as '0' | '1-5' | '6+' | null, availability: current.id }} />
    </main>
  );
}
