import { redirect } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { homeView } from '@/lib/drills/program/home';
import { homeCheckin } from '@/lib/drills/feedback';
import { TrainingHome } from '@/components/drills/views/training-home';

// The training home (docs/prd-drills.md "Training home", "What the home
// serves", "Practice on my own").
export default async function DrillsHomePage() {
  const studentId = await studentOrRedirect();
  const home = await homeView(studentId);
  if (home.kind === 'onboarding') redirect('/drills/start');
  // "What would make this more useful?" after the first full case and week 1.
  const checkin = await homeCheckin(studentId);
  return <TrainingHome home={home} checkin={checkin} />;
}
