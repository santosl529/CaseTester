import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { settingsFor } from '@/lib/drills/sets/service';
import { activeProgram, studentToday } from '@/lib/drills/program/store';
import { ProgramSettings } from '@/components/drills/program-settings';

export default async function DrillSettingsPage() {
  const studentId = await studentOrRedirect();
  const program = await activeProgram(db, studentId);
  if (!program) redirect('/drills/start');
  const [{ today }, settings] = await Promise.all([studentToday(studentId), settingsFor(studentId)]);
  const availability = DRILLS_CONFIG.programs.availability;
  const current = availability.find(a => a.workouts_per_week === program.workoutsPerWeek) ?? availability.find(a => a.default)!;
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Training settings</h1>
        <Link href="/drills" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Training home</Link>
      </header>
      <ProgramSettings track={program.track} interviewDate={program.interviewDate} availabilityId={current.id}
        availability={availability} today={today} timeMultiplier={settings.timeMultiplier} />
    </main>
  );
}
