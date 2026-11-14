import Link from 'next/link';
import { AppPage } from '@/components/brand/page';
import { OnboardingForm, type AvailabilityOption } from '@/components/drills/onboarding-form';
import { QuestionnaireForm } from '@/components/drills/questionnaire-form';
import { ProgramSettings } from '@/components/drills/program-settings';

// The screens around the training forms: onboarding, the questionnaire and
// settings. Their pages (app/drills/start, questionnaire, settings) load the data.

export function StartScreen({ availability, today }: { availability: AvailabilityOption[]; today: string }) {
  return (
    <AppPage width="narrow" className="space-y-8">
      <header className="space-y-2">
        <h1 className="t-title">Set up your training</h1>
        <p className="t-small text-ink/70">A few quick questions. You can change your answers at any time.</p>
      </header>
      <OnboardingForm availability={availability} today={today} />
      <p className="t-small"><Link href="/drills/browse" className="link-quiet">Skip for now and browse drills</Link></p>
    </AppPage>
  );
}

export function QuestionnaireScreen(props: React.ComponentProps<typeof QuestionnaireForm>) {
  return (
    <AppPage width="narrow" className="space-y-8">
      <header className="space-y-2">
        <h1 className="t-title">A few questions</h1>
        <p className="t-small text-ink/70">About 2–3 minutes. Your answers set where each skill starts; your first workouts include short checks that adjust it. A diagnostic or a full case later makes it more accurate.</p>
      </header>
      <QuestionnaireForm {...props} />
    </AppPage>
  );
}

export function SettingsScreen(props: React.ComponentProps<typeof ProgramSettings>) {
  return (
    <AppPage width="narrow" className="space-y-8">
      <h1 className="t-title">Training settings</h1>
      <ProgramSettings {...props} />
    </AppPage>
  );
}
