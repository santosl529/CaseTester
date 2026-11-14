import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { settingsFor } from '@/lib/drills/sets/service';
import { activeProgram, studentToday } from '@/lib/drills/program/store';
import { SettingsScreen } from '@/components/drills/views/forms';

export default async function DrillSettingsPage() {
  const studentId = await studentOrRedirect();
  const program = await activeProgram(db, studentId);
  if (!program) redirect('/drills/start');
  const [{ today }, settings] = await Promise.all([studentToday(studentId), settingsFor(studentId)]);
  const availability = DRILLS_CONFIG.programs.availability;
  const current = availability.find(a => a.workouts_per_week === program.workoutsPerWeek) ?? availability.find(a => a.default)!;
  return (
    <SettingsScreen track={program.track} interviewDate={program.interviewDate} availabilityId={current.id}
      availability={availability} today={today} timeMultiplier={settings.timeMultiplier} untimed={settings.untimed}
      feedbackMode={settings.feedbackMode} />
  );
}
