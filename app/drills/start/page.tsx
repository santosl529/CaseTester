import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { activeProgram, studentToday } from '@/lib/drills/program/store';
import { OnboardingForm } from '@/components/drills/onboarding-form';

// Onboarding (docs/prd-drills.md "Onboarding and diagnostic"). Students with a
// program go to the training home; changing it happens in settings.
export default async function StartPage() {
  const studentId = await studentOrRedirect();
  if (await activeProgram(db, studentId)) redirect('/drills');
  const { today } = await studentToday(studentId);
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Set up your training</h1>
        <p className="text-sm text-muted-foreground">A few quick questions. You can change your answers at any time.</p>
      </header>
      <OnboardingForm availability={DRILLS_CONFIG.programs.availability} today={today} />
      <p className="text-sm"><Link href="/drills/browse" className="text-muted-foreground underline underline-offset-4">Skip for now and browse drills</Link></p>
    </main>
  );
}
