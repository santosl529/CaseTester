import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { activeProgram, studentToday } from '@/lib/drills/program/store';
import { StartScreen } from '@/components/drills/views/forms';

// Onboarding (docs/prd-drills.md "Onboarding and diagnostic"). Students with a
// program go to the training home; changing it happens in settings.
export default async function StartPage() {
  const studentId = await studentOrRedirect();
  if (await activeProgram(db, studentId)) redirect('/drills');
  const { today } = await studentToday(studentId);
  return <StartScreen availability={DRILLS_CONFIG.programs.availability} today={today} />;
}
