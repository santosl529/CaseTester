import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { introLesson, lessonSkills } from '@/lib/drills/program/lessons-store';
import { IntroLessonScreen } from '@/components/drills/views/lesson';

// "How a case interview works" (Matt, 2026-10-17): Foundations students see
// it first, before week 1 (source=auto, from the training home); it heads the
// Learn library for every track. Static, from lessons/intro/.
export default async function IntroLessonPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  await studentOrRedirect();
  const intro = introLesson();
  if (!intro) notFound();
  const auto = (await searchParams).source === 'auto';
  const withLesson = await lessonSkills();
  const skills = Object.fromEntries(DRILLS_CONFIG.taxonomy.skills.map(s => [s.id, { name: s.name, href: withLesson.has(s.id) ? `/drills/learn/${encodeURIComponent(s.id)}` : null }]));
  return <IntroLessonScreen intro={intro} skills={skills} auto={auto} />;
}
