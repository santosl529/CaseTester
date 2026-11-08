import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AppPage } from '@/components/brand/page';
import { BackLink } from '@/components/brand/links';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { drillsForSkill } from '@/lib/drills/drill-info';
import type { IntroLesson } from '@/lib/drills/lessons';

// The Learn library's screen; app/drills/learn/page.tsx loads its data.
export function LearnLibrary({ available, intro }: { available: Set<string>; intro: IntroLesson | null }) {
  const areas = DRILLS_CONFIG.taxonomy.areas
    .map(a => ({ ...a, skills: DRILLS_CONFIG.taxonomy.skills.filter(s => s.area === a.code && available.has(s.id)) }))
    .filter(a => a.skills.length > 0);
  return (
    <AppPage className="space-y-10">
      <nav><BackLink href="/drills">Training home</BackLink></nav>
      <header className="space-y-3">
        <h1 className="t-title">Learn</h1>
        <p className="t-body max-w-[65ch] text-ink/70">Short lessons, a few minutes each: the idea, a pattern to follow, worked examples and the usual mistakes.</p>
      </header>
      {intro && (
        <section aria-labelledby="start-here" className="space-y-2">
          <h2 id="start-here" className="t-label font-semibold text-ink/70">Start here</h2>
          <Link href="/drills/learn/intro" className="group flex items-center gap-4 rounded-panel bg-sky/60 p-5 transition-colors hover:bg-sky motion-reduce:transition-none">
            <span className="t-small flex-1">
              <span className="t-body block font-semibold">{intro.title}</span>
              <span className="block text-ink/75">The four stages of a case, what interviewers look for in each, and the skills each one uses.</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 flex-none text-ink/60 group-hover:text-cobalt" />
          </Link>
        </section>
      )}
      {areas.length === 0 && !intro && <p className="t-body">Lessons are on their way.</p>}
      {areas.map(a => (
        <section key={a.code} aria-labelledby={`area-${a.code}`} className="space-y-2">
          <h2 id={`area-${a.code}`} className="t-label font-semibold text-ink/70">{a.name}</h2>
          <ul className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
            {a.skills.map(s => (
              <li key={s.id}>
                <Link href={`/drills/learn/${encodeURIComponent(s.id)}`} className="group t-small flex items-center gap-4 p-4 transition-colors hover:bg-paper motion-reduce:transition-none">
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="font-semibold group-hover:text-cobalt">{s.name}</span>
                      <span className="text-ink/70">{s.description}</span>
                    </span>
                    {drillsForSkill(s.id).length > 0 && <span className="t-label block text-ink/70">Practiced in: {drillsForSkill(s.id).map(d => d.name).join(', ')}</span>}
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 flex-none text-ink/40 group-hover:text-cobalt" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </AppPage>
  );
}
