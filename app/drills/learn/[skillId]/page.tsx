import Link from 'next/link';
import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { lessonForSkill } from '@/lib/drills/program/lessons-store';
import { activeProgram } from '@/lib/drills/program/store';
import { db } from '@/db/client';
import { LessonBody } from '@/components/drills/lesson';
import { LessonActions } from '@/components/drills/lesson-actions';

const SOURCES = ['auto', 'intro', 'library', 'low_score'] as const;
type Source = (typeof SOURCES)[number];

// A lesson (docs/prd-drills.md "Lessons"). Opened from the Learn library, a
// drill intro, a low-scoring set, or automatically before a Foundations
// student's first set of a skill (then "Try it" starts that workout block).
export default async function LessonPage({ params, searchParams }: {
  params: Promise<{ skillId: string }>;
  searchParams: Promise<{ source?: string; workout?: string; block?: string }>;
}) {
  const studentId = await studentOrRedirect();
  const { skillId } = await params;
  const sp = await searchParams;
  const lesson = await lessonForSkill(decodeURIComponent(skillId));
  if (!lesson) notFound();
  const source: Source = SOURCES.includes(sp.source as Source) ? sp.source as Source : 'library';
  // Foundations gets the full lesson; every other track a summary card with
  // "Read full lesson" (Matt, 2026-10-16).
  const program = await activeProgram(db, studentId);
  const mode = program?.track === 'foundations' ? 'full' : 'summary';
  const start = sp.workout && sp.block !== undefined
    ? { workout_id: sp.workout, block: Number(sp.block) }
    : { skill_id: lesson.skill_id, quick_start: true };
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-4 sm:p-6">
      <nav className="flex flex-wrap gap-x-4 text-sm">
        <Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link>
        <Link href="/drills/learn" className="text-muted-foreground underline-offset-4 hover:underline">All lessons</Link>
      </nav>
      <LessonBody lesson={lesson} mode={mode} />
      <LessonActions lessonId={lesson.lesson_id} version={lesson.version} source={source} start={start} skippable={source === 'auto'} />
    </main>
  );
}
