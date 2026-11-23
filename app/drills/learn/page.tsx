import { studentOrRedirect } from '@/lib/drills/session';
import { introLesson, lessonSkills, readLessons } from '@/lib/drills/program/lessons-store';
import { programView, sharedRanking } from '@/lib/drills/program/store';
import { forYouLessons } from '@/lib/drills/learn-page';
import { LearnLibrary } from '@/components/drills/views/learn-library';

// The Learn library (docs/prd-drills.md "Training home"): "How a case
// interview works" first, for every track (Matt, 2026-10-17), then one short
// lesson per skill, grouped by skill area. Read marks and For you this week
// (Matt, 13 Nov) come from lesson views, the shared ranking (15 Nov) and the
// plan's week.
export default async function LearnPage() {
  const studentId = await studentOrRedirect();
  const [available, read, view, ranking] = await Promise.all([lessonSkills(), readLessons(studentId), programView(studentId), sharedRanking(studentId)]);
  const week = view?.plan.kind === 'weeks' ? view.week : null;
  const weekSkills = week ? [...week.focus_skills, ...week.milestones.flatMap(m => (m.type === 'skills' ? m.skills : []))] : [];
  const forYou = forYouLessons({ available, read: read.skills, weekSkills, ranked: ranking.map(rx => rx.skill_id) });
  return <LearnLibrary available={available} intro={introLesson()} read={read.skills} introRead={read.intro} forYou={forYou} />;
}
