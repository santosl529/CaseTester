import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG, getMistakeTag, getSkill } from '@/lib/drills/config';
import { lessonProblems, loadLessons, MAX_WORDS, P0_LESSON_SKILLS } from '@/lib/drills/lessons';
import { lessonReviewEnabled } from '@/lib/drills/review';
import { LessonBody } from '@/components/drills/lesson';
import { LessonReviewButtons } from '@/components/drills/lesson-review';

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
  const counts = { live: 0, in_review: 0, draft: 0, retired: 0 };
  for (const l of lessons) counts[l.status]++;
  return (
    <main className="mx-auto w-full max-w-2xl space-y-10 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Lesson review</h1>
        <p className="text-sm text-muted-foreground">{lessons.length} lessons: {counts.live} approved, {counts.in_review} with changes requested, {counts.draft} to review.{missing.length > 0 && ` Not written yet: ${missing.map(id => getSkill(id).name).join(', ')}.`}</p>
        <nav aria-label="Lessons" className="flex flex-wrap gap-2 pt-2 text-xs">
          {lessons.map(l => <a key={l.lesson_id} href={`#${l.lesson_id}`} className="rounded-full border px-2 py-1 hover:bg-muted">{getSkill(l.skill_id).name}{l.status === 'live' ? ' ✓' : ''}</a>)}
        </nav>
      </header>
      {lessons.map(l => {
        const problems = lessonProblems(l);
        return (
          <section key={l.lesson_id} id={l.lesson_id} className="space-y-4 border-t pt-8">
            <p className="text-xs text-muted-foreground">{l.file} · v{l.version} · {l.words} of {MAX_WORDS} words</p>
            {problems.length > 0 && <ul role="alert" className="list-disc pl-5 text-sm text-destructive">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
            <LessonBody lesson={{ ...l, skill_name: getSkill(l.skill_id).name, mistakes: l.mistakes.map(m => ({ ...m, label: getMistakeTag(m.tag)?.label ?? m.tag })) }} />
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">Summary card (Standard, Sprint and self-directed students)</summary>
              <div className="pt-4"><LessonBody mode="summary" lesson={{ ...l, skill_name: getSkill(l.skill_id).name, mistakes: l.mistakes.map(m => ({ ...m, label: getMistakeTag(m.tag)?.label ?? m.tag })) }} /></div>
            </details>
            <LessonReviewButtons lessonId={l.lesson_id} status={l.status} notes={l.authorship.review_notes} />
          </section>
        );
      })}
    </main>
  );
}
