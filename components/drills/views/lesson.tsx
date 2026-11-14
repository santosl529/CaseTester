import { AppPage } from '@/components/brand/page';
import { Breadcrumbs } from '@/components/brand/breadcrumbs';
import { ArrowLink } from '@/components/brand/links';
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
      <div className="space-y-4">
        <Breadcrumbs trail={[{ label: 'Learn', href: '/drills/learn' }, { label: lesson.skill_name }]} />
        <LessonBody lesson={lesson} mode={mode} />
      </div>
      <div className="space-y-6 border-t border-ink/12 pt-8">
        {/* Where this is practised, as links to the drill on Drills (Matt, 13 Nov; it used to be on Learn's list). */}
        {drillsForSkill(lesson.skill_id).length > 0 && (
          <section aria-labelledby="practice" className="t-small flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
            <h2 id="practice" className="font-semibold">Practice this in:</h2>
            <ul className="contents">
              {drillsForSkill(lesson.skill_id).map(d => <li key={d.drill_id}><ArrowLink href={`/drills/browse#drill-${d.drill_id}`}>{d.name}</ArrowLink></li>)}
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
      <div className="space-y-4">
        <Breadcrumbs trail={[{ label: 'Learn', href: '/drills/learn' }, { label: intro.title }]} />
        <IntroLessonBody lesson={intro} skills={skills} />
      </div>
      <div className="border-t border-ink/12 pt-8">
        <IntroLessonActions lessonId={intro.lesson_id} version={intro.version} source={auto ? 'auto' : 'library'}
          next={auto ? { href: '/drills', label: 'Start training' } : { href: '/drills/learn', label: 'Back to lessons' }} />
      </div>
    </AppPage>
  );
}
