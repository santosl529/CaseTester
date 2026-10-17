import Link from 'next/link';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { introLesson, lessonSkills } from '@/lib/drills/program/lessons-store';

// The Learn library (docs/prd-drills.md "Training home"): "How a case
// interview works" first, for every track (Matt, 2026-10-17), then one short
// lesson per skill, grouped by skill area.
export default async function LearnPage() {
  await studentOrRedirect();
  const available = await lessonSkills();
  const intro = introLesson();
  const areas = DRILLS_CONFIG.taxonomy.areas
    .map(a => ({ ...a, skills: DRILLS_CONFIG.taxonomy.skills.filter(s => s.area === a.code && available.has(s.id)) }))
    .filter(a => a.skills.length > 0);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Learn</h1>
        <p className="text-sm text-muted-foreground">Short lessons, a few minutes each: the idea, a pattern to follow, worked examples and the usual mistakes.</p>
        <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>
      </header>
      {intro && (
        <section aria-labelledby="start-here" className="space-y-2">
          <h2 id="start-here" className="text-sm font-semibold">Start here</h2>
          <Link href="/drills/learn/intro" className="block rounded-lg border p-3 text-sm hover:bg-muted/50">
            <span className="font-medium">{intro.title}</span>
            <span className="block text-muted-foreground">The four stages of a case, what interviewers look for in each, and the skills each one uses.</span>
          </Link>
        </section>
      )}
      {areas.length === 0 && !intro && <p className="text-sm">Lessons are on their way.</p>}
      {areas.map(a => (
        <section key={a.code} aria-labelledby={`area-${a.code}`} className="space-y-2">
          <h2 id={`area-${a.code}`} className="text-sm font-semibold">{a.name}</h2>
          <ul className="divide-y rounded-lg border">
            {a.skills.map(s => (
              <li key={s.id}>
                <Link href={`/drills/learn/${encodeURIComponent(s.id)}`} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm hover:bg-muted/50">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{s.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
