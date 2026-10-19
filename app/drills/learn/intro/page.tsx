import Link from 'next/link';
import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { introLesson, lessonSkills } from '@/lib/drills/program/lessons-store';
import { IntroLessonBody } from '@/components/drills/lesson';
import { IntroLessonActions } from '@/components/drills/lesson-actions';

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
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-4 sm:p-6">
      <nav className="flex flex-wrap gap-x-4 text-sm">
        <Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link>
        <Link href="/drills/learn" className="text-muted-foreground underline-offset-4 hover:underline">All lessons</Link>
      </nav>
      <IntroLessonBody lesson={intro} skills={skills} />
      <IntroLessonActions lessonId={intro.lesson_id} version={intro.version} source={auto ? 'auto' : 'library'}
        next={auto ? { href: '/drills', label: 'Start training' } : { href: '/drills/learn', label: 'Back to lessons' }} />
    </main>
  );
}
