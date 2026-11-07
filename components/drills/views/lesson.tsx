import { AppPage } from '@/components/brand/page';
import { BackLink } from '@/components/brand/links';
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
    <AppPage className="space-y-10">
      <nav className="flex flex-wrap gap-x-6 gap-y-2">
        <BackLink href="/drills">Training home</BackLink>
        <BackLink href="/drills/learn">All lessons</BackLink>
      </nav>
      <LessonBody lesson={lesson} mode={mode} />
      <div className="space-y-6 border-t border-ink/12 pt-8">
        {drillsForSkill(lesson.skill_id).length > 0 && (
          <section aria-labelledby="practice" className="space-y-2">
            <h2 id="practice" className="t-small font-semibold">Drills that practice this</h2>
            <ul className="t-small flex flex-wrap gap-2">
              {drillsForSkill(lesson.skill_id).map(d => <li key={d.drill_id} className="rounded-full border border-ink/20 bg-white px-3 py-1">{d.name}</li>)}
            </ul>
          </section>
        )}
        <LessonActions lessonId={lesson.lesson_id} version={lesson.version} source={source} start={start} skippable={source === 'auto'} />
      </div>
    </AppPage>
  );
}

export function IntroLessonScreen({ intro, skills, auto }: {
  intro: IntroLessonContent & { lesson_id: string; version: number };
  skills: React.ComponentProps<typeof IntroLessonBody>['skills'];
  auto: boolean;
}) {
  return (
    <AppPage className="space-y-10">
      <nav className="flex flex-wrap gap-x-6 gap-y-2">
        <BackLink href="/drills">Training home</BackLink>
        <BackLink href="/drills/learn">All lessons</BackLink>
      </nav>
      <IntroLessonBody lesson={intro} skills={skills} />
      <div className="border-t border-ink/12 pt-8">
        <IntroLessonActions lessonId={intro.lesson_id} version={intro.version} source={auto ? 'auto' : 'library'}
          next={auto ? { href: '/drills', label: 'Start training' } : { href: '/drills/learn', label: 'Back to lessons' }} />
      </div>
    </AppPage>
  );
}
