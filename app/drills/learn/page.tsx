import { studentOrRedirect } from '@/lib/drills/session';
import { introLesson, lessonSkills } from '@/lib/drills/program/lessons-store';
import { LearnLibrary } from '@/components/drills/views/learn-library';

// The Learn library (docs/prd-drills.md "Training home"): "How a case
// interview works" first, for every track (Matt, 2026-10-17), then one short
// lesson per skill, grouped by skill area.
export default async function LearnPage() {
  await studentOrRedirect();
  const available = await lessonSkills();
  const intro = introLesson();
  return <LearnLibrary available={available} intro={intro} />;
}
