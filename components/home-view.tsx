import Link from 'next/link';
import type { ListedCase } from '@/lib/cases/listed';
import type { PastSession } from '@/lib/site/past-sessions';
import { SiteHeader } from '@/components/site-header';
import { StartCaseButton } from '@/components/start-case-button';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AppPage } from '@/components/brand/page';

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

// /home's page (site flow, 19 Oct): start a case, drills, past sessions.
export function HomeView({ cases, past }: { cases: ListedCase[]; past: PastSession[] }) {
  return (
    <>
      <SiteHeader />
      <AppPage width="reading" className="space-y-10">
        <section id="cases" aria-labelledby="cases-h" className="scroll-mt-20 space-y-4">
          <div className="space-y-2">
            <h1 id="cases-h" className="t-title">Start a case</h1>
            <p className="t-body text-ink/70">A full interviewer-led case, about 20 minutes. You get a scored feedback report at the end.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {cases.map(c => (
              <li key={c.id} className="flex flex-col justify-between gap-5 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
                <div className="space-y-1">
                  <p className="t-heading font-semibold">{c.title}</p>
                  <p className="t-small text-ink/70">{DIFFICULTY[c.difficulty]}</p>
                </div>
                <StartCaseButton caseId={c.id} label="Start this case" variant="outline" />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="drills-h" className="space-y-3">
          <h2 id="drills-h" className="t-heading font-semibold">Drills</h2>
          <p className="t-small text-ink/70">Short exercises on one skill at a time.</p>
          <Link href="/drills" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>Practice drills</Link>
        </section>

        <section aria-labelledby="past-h" className="space-y-3">
          <h2 id="past-h" className="t-heading font-semibold">Past sessions</h2>
          {past.length === 0 ? (
            <p className="t-small text-ink/70">No cases yet. Your reports will appear here.</p>
          ) : (
            <ul className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
              {past.map(s => (
                <li key={s.id} className="t-small flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.caseTitle}</p>
                    <p className="text-ink/70">{s.date} · {s.status}</p>
                  </div>
                  {s.link && <Link href={s.link.href} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>{s.link.label}</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </AppPage>
    </>
  );
}
