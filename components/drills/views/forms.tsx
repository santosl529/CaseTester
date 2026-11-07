import Link from 'next/link';
import { OnboardingForm, type AvailabilityOption } from '@/components/drills/onboarding-form';
import { QuestionnaireForm } from '@/components/drills/questionnaire-form';
import { ProgramSettings } from '@/components/drills/program-settings';

// The screens around the training forms: onboarding, the questionnaire and
// settings. Their pages (app/drills/start, questionnaire, settings) load the data.

export function StartScreen({ availability, today }: { availability: AvailabilityOption[]; today: string }) {
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Set up your training</h1>
        <p className="text-sm text-muted-foreground">A few quick questions. You can change your answers at any time.</p>
      </header>
      <OnboardingForm availability={availability} today={today} />
      <p className="text-sm"><Link href="/drills/browse" className="text-muted-foreground underline underline-offset-4">Skip for now and browse drills</Link></p>
    </main>
  );
}

export function QuestionnaireScreen(props: React.ComponentProps<typeof QuestionnaireForm>) {
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
      <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">A few questions</h1>
        <p className="text-sm text-muted-foreground">About 2–3 minutes. Your answers set where each skill starts; your first workouts include short checks that adjust it. A diagnostic or a full case later makes it more accurate.</p>
      </header>
      <QuestionnaireForm {...props} />
    </main>
  );
}

export function SettingsScreen(props: React.ComponentProps<typeof ProgramSettings>) {
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Training settings</h1>
        <Link href="/drills" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Training home</Link>
      </header>
      <ProgramSettings {...props} />
    </main>
  );
}
