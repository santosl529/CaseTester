import Link from 'next/link';
import type { ListedCase } from '@/lib/cases/listed';
import type { PastSession } from '@/lib/site/past-sessions';
import { SiteHeader } from '@/components/site-header';
import { StartCaseButton } from '@/components/start-case-button';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

// /home's page (site flow, 19 Oct): start a case, drills, past sessions.
export function HomeView({ cases, past }: { cases: ListedCase[]; past: PastSession[] }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6">
        <section id="cases" aria-labelledby="cases-h" className="scroll-mt-4 space-y-3">
          <h1 id="cases-h" className="text-lg font-semibold">Start a case</h1>
          <p className="text-sm text-neutral-600">A full interviewer-led case, about 20 minutes. You get a scored feedback report at the end.</p>
          <ul className="space-y-3">
            {cases.map(c => (
              <li key={c.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-neutral-500">{DIFFICULTY[c.difficulty]}</p>
                </div>
                <StartCaseButton caseId={c.id} label="Start this case" />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="drills-h" className="space-y-2">
          <h2 id="drills-h" className="text-lg font-semibold">Drills</h2>
          <p className="text-sm text-neutral-600">Short exercises on one skill at a time.</p>
          <Link href="/drills" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>Practice drills</Link>
        </section>

        <section aria-labelledby="past-h" className="space-y-2">
          <h2 id="past-h" className="text-lg font-semibold">Past sessions</h2>
          {past.length === 0 ? (
            <p className="text-sm text-neutral-600">No cases yet. Your reports will appear here.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {past.map(s => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.caseTitle}</p>
                    <p className="text-neutral-500">{s.date} · {s.status}</p>
                  </div>
                  {s.link && <Link href={s.link.href} className={cn(buttonVariants({ variant: s.link.label === 'Report' ? 'outline' : 'default', size: 'sm' }))}>{s.link.label}</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
