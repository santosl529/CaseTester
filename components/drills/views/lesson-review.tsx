import { DRILLS_CONFIG, getMistakeTag, getSkill } from '@/lib/drills/config';
import { introProblems, lessonIdFor, lessonProblems, MAX_WORDS, type IntroLesson, type Lesson } from '@/lib/drills/lessons';
import { IntroLessonBody, LessonBody } from '@/components/drills/lesson';
import { LessonReviewButtons } from '@/components/drills/lesson-review';
import { AppPage } from '@/components/brand/page';

// Lesson review's screen (local development only); app/drills/review/lessons/page.tsx loads the lessons.
export function LessonReviewScreen({ lessons, missing, intro }: { lessons: Lesson[]; missing: string[]; intro: IntroLesson | null }) {
  const counts = { live: 0, in_review: 0, draft: 0, retired: 0 };
  for (const l of [...lessons, ...(intro ? [intro] : [])]) counts[l.status]++;
  const skillLinks = Object.fromEntries(DRILLS_CONFIG.taxonomy.skills.map(s => [s.id, { name: s.name, href: lessons.some(l => l.skill_id === s.id) ? `#${lessonIdFor(s.id)}` : null }]));
  return (
    <AppPage className="space-y-12">
      <header className="space-y-3">
        <h1 className="t-title">Lesson review</h1>
        <p className="t-small text-ink/70">{lessons.length + (intro ? 1 : 0)} lessons: {counts.live} approved, {counts.in_review} with changes requested, {counts.draft} to review.{missing.length > 0 && ` Not written yet: ${missing.map(id => getSkill(id).name).join(', ')}.`}</p>
        <nav aria-label="Lessons" className="flex flex-wrap gap-2 pt-2 t-label">
          {intro && <a href={`#${intro.lesson_id}`} className="rounded-full border border-ink/20 bg-white px-2.5 py-1 hover:border-cobalt hover:text-cobalt">How a case interview works{intro.status === 'live' ? ' ✓' : ''}</a>}
          {lessons.map(l => <a key={l.lesson_id} href={`#${l.lesson_id}`} className="rounded-full border border-ink/20 bg-white px-2.5 py-1 hover:border-cobalt hover:text-cobalt">{getSkill(l.skill_id).name}{l.status === 'live' ? ' ✓' : ''}</a>)}
        </nav>
      </header>
      {intro && (() => {
        const problems = introProblems(intro, lessons.map(l => l.skill_id));
        return (
          <section id={intro.lesson_id} className="space-y-4 border-t border-ink/12 pt-10">
            <p className="t-label text-ink/70">{intro.file} · v{intro.version} · {intro.words} of {MAX_WORDS} words · Foundations intro</p>
            {problems.length > 0 && <ul role="alert" className="list-disc pl-5 t-small text-alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            <IntroLessonBody lesson={intro} skills={skillLinks} />
            <LessonReviewButtons lessonId={intro.lesson_id} status={intro.status} notes={intro.authorship.review_notes} />
          </section>
        );
      })()}
      {lessons.map(l => {
        const problems = lessonProblems(l);
        return (
          <section key={l.lesson_id} id={l.lesson_id} className="space-y-4 border-t border-ink/12 pt-10">
            <p className="t-label text-ink/70">{l.file} · v{l.version} · {l.words} of {MAX_WORDS} words</p>
            {problems.length > 0 && <ul role="alert" className="list-disc pl-5 t-small text-alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            <LessonBody lesson={{ ...l, skill_name: getSkill(l.skill_id).name, mistakes: l.mistakes.map(m => ({ ...m, label: getMistakeTag(m.tag)?.label ?? m.tag })) }} />
            <details className="rounded-panel border border-ink/12 bg-white p-5">
              <summary className="cursor-pointer t-small font-semibold">Summary card (Standard, Sprint and self-directed students)</summary>
              <div className="pt-4"><LessonBody mode="summary" lesson={{ ...l, skill_name: getSkill(l.skill_id).name, mistakes: l.mistakes.map(m => ({ ...m, label: getMistakeTag(m.tag)?.label ?? m.tag })) }} /></div>
            </details>
            <LessonReviewButtons lessonId={l.lesson_id} status={l.status} notes={l.authorship.review_notes} />
          </section>
        );
      })}
    </AppPage>
  );
}
