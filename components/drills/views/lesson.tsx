import Link from 'next/link';
import { drillsForSkill } from '@/lib/drills/drill-info';
import { IntroLessonBody, LessonBody, type IntroLessonContent, type LessonContent } from '@/components/drills/lesson';
import { IntroLessonActions, LessonActions } from '@/components/drills/lesson-actions';

type Source = 'auto' | 'intro' | 'library' | 'low_score';

// A lesson and the intro lesson. Their pages (app/drills/learn/[skillId] and
// …/intro) load the lesson and pick the mode.

export function LessonScreen({ lesson, mode, source, start }: {
  lesson: LessonContent & { lesson_id: string; version: number; skill_id: string };
  mode: 'full' | 'summary';
  source: Source;
  start: React.ComponentProps<typeof LessonActions>['start'];
}) {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-4 sm:p-6">
      <nav className="flex flex-wrap gap-x-4 text-sm">
        <Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link>
        <Link href="/drills/learn" className="text-muted-foreground underline-offset-4 hover:underline">All lessons</Link>
      </nav>
      <LessonBody lesson={lesson} mode={mode} />
      {drillsForSkill(lesson.skill_id).length > 0 && (
        <section aria-labelledby="practice" className="space-y-1">
          <h2 id="practice" className="text-sm font-medium">Drills that practice this</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {drillsForSkill(lesson.skill_id).map(d => <li key={d.drill_id} className="rounded-full border px-3 py-1">{d.name}</li>)}
          </ul>
        </section>
      )}
      <LessonActions lessonId={lesson.lesson_id} version={lesson.version} source={source} start={start} skippable={source === 'auto'} />
    </main>
  );
}

export function IntroLessonScreen({ intro, skills, auto }: {
  intro: IntroLessonContent & { lesson_id: string; version: number };
  skills: React.ComponentProps<typeof IntroLessonBody>['skills'];
  auto: boolean;
}) {
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
