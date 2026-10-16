// Copies lessons from /lessons into the lessons table (docs/prd-drills.md
// "Lessons"). Like drill items: a new lesson_id@version is inserted; a draft
// or a lesson in review is updated in place; a live lesson may only change
// its review record; any other edit to it needs a new version. Refuses to
// seed while any lesson has a problem (length, mistake lines, reviewer).
//
//   npm run db:seed-lessons
import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { lessons } from '@/db/schema';
import { lessonProblems, loadLessons, type Lesson } from '@/lib/drills/lessons';

type Stored = Pick<Lesson, 'title' | 'idea' | 'why' | 'pattern' | 'worked_example' | 'mistakes'> & Partial<Pick<Lesson, 'why_it_works' | 'another_example' | 'tricky_cases' | 'quick_check'>>;
const content = (l: Stored) =>
  JSON.stringify([l.title, l.idea, l.why, l.pattern, l.worked_example, l.mistakes, l.why_it_works ?? null, l.another_example ?? null, l.tricky_cases ?? null, l.quick_check ?? null]);
// The v2 sections ride in the body JSON, so no new columns are needed.
const body = (l: Lesson) => JSON.stringify({ title: l.title, idea: l.idea, why: l.why, pattern: l.pattern,
  why_it_works: l.why_it_works, another_example: l.another_example, tricky_cases: l.tricky_cases, quick_check: l.quick_check });

async function main() {
  const all = loadLessons();
  const problems = all.flatMap(lessonProblems);
  if (problems.length) throw new Error(`Lesson problems:\n${problems.join('\n')}`);
  let inserted = 0, updated = 0, unchanged = 0;
  const conflicts: string[] = [];
  for (const l of all) {
    const where = and(eq(lessons.lessonId, l.lesson_id), eq(lessons.version, l.version));
    const [row] = await db.select().from(lessons).where(where);
    const values = { body: body(l), workedExample: l.worked_example, mistakes: l.mistakes, authorship: l.authorship, status: l.status, skillId: l.skill_id };
    if (!row) {
      await db.insert(lessons).values({ lessonId: l.lesson_id, version: l.version, ...values });
      inserted++;
      continue;
    }
    const stored = { ...JSON.parse(row.body), worked_example: row.workedExample, mistakes: row.mistakes };
    if (content(stored) !== content(l) && row.status === 'live') {
      conflicts.push(`${l.lesson_id}@${l.version}: live content changed; bump "version" to publish the edit`);
      continue;
    }
    if (content(stored) !== content(l) || row.status !== l.status || JSON.stringify(row.authorship) !== JSON.stringify(l.authorship)) {
      await db.update(lessons).set(values).where(where);
      updated++;
    } else unchanged++;
  }
  // A newer live version retires older live ones.
  for (const l of all.filter(x => x.status === 'live' && x.version > 1)) {
    await db.update(lessons).set({ status: 'retired' })
      .where(and(eq(lessons.lessonId, l.lesson_id), lt(lessons.version, l.version), eq(lessons.status, 'live')));
  }
  console.log(`lessons: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged, ${conflicts.length} conflicts`);
  if (conflicts.length) { console.error(conflicts.join('\n')); process.exit(1); }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
