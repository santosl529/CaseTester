import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { loadIntroLesson, loadLessons, P0_LESSON_SKILLS } from '@/lib/drills/lessons';
import { lessonReviewEnabled } from '@/lib/drills/review';
import { LessonReviewScreen } from '@/components/drills/views/lesson-review';

// Lesson review (local development only): every lesson rendered as students
// see it, with its word count, any problems, and Approve / Request changes.
// Decisions are written into the lesson files; `npm run db:seed-lessons`
// publishes approved ones.
export default async function LessonReviewPage() {
  if (!lessonReviewEnabled()) notFound();
  await studentOrRedirect();
  // In skill order (Problem Structuring first), as everywhere else.
  const order = DRILLS_CONFIG.taxonomy.skills.map(x => x.id);
  const lessons = loadLessons().sort((a, b) => order.indexOf(a.skill_id) - order.indexOf(b.skill_id));
  const missing = P0_LESSON_SKILLS().filter(id => !lessons.some(l => l.skill_id === id));
  const intro = loadIntroLesson();
  return <LessonReviewScreen lessons={lessons} missing={missing} intro={intro} />;
}
