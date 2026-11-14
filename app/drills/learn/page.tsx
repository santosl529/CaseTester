import { studentOrRedirect } from '@/lib/drills/session';
import { introLesson, lessonSkills, readLessons } from '@/lib/drills/program/lessons-store';
import { programView } from '@/lib/drills/program/store';
import { skillProfile } from '@/lib/drills/progress/profile';
import { getMistakeTag } from '@/lib/drills/config';
import { forYouLessons } from '@/lib/drills/learn-page';
import { LearnLibrary } from '@/components/drills/views/learn-library';

// The Learn library (docs/prd-drills.md "Training home"): "How a case
// interview works" first, for every track (Matt, 2026-10-17), then one short
// lesson per skill, grouped by skill area. Read marks and For you this week
// (Matt, 13 Nov) come from lesson views, the plan's week and the most
// frequent mistake of the last 30 days.
export default async function LearnPage() {
  const studentId = await studentOrRedirect();
  const [available, read, view, profile] = await Promise.all([lessonSkills(), readLessons(studentId), programView(studentId), skillProfile(studentId)]);
  const week = view?.plan.kind === 'weeks' ? view.week : null;
  const weekSkills = week ? [...week.focus_skills, ...week.milestones.flatMap(m => (m.type === 'skills' ? m.skills : []))] : [];
  const top = profile.top_mistakes[0];
  const weakest = top ? getMistakeTag(top.tag)?.skill ?? null : null;
  const forYou = forYouLessons({ available, read: read.skills, weekSkills, weakest });
  return <LearnLibrary available={available} intro={introLesson()} read={read.skills} introRead={read.intro} forYou={forYou} />;
}
