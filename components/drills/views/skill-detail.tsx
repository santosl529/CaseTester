import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { StartSetButton } from '@/components/drills/start-set-button';
import { Source } from '@/components/drills/progress';
import type { skillDetailView } from '@/lib/drills/progress/dashboard-store';
import { Check } from 'lucide-react';
import { AppPage } from '@/components/brand/page';
import { BackLink } from '@/components/brand/links';

export type SkillDetailData = NonNullable<Awaited<ReturnType<typeof skillDetailView>>>;

// One skill on Your progress; app/drills/progress/[skillId]/page.tsx loads its data.
export function SkillDetail({ s }: { s: SkillDetailData }) {
  const current = s.ladder.findIndex(l => l.state === s.state);

  return (
    <AppPage width="reading" className="space-y-10">
      <nav><BackLink href="/drills/progress">Your progress</BackLink></nav>
      <header className="space-y-2">
        <h1 className="t-title">{s.name}</h1>
        <p className="t-small text-ink/70">{s.area}</p>
      </header>

      <section aria-labelledby="where" className="space-y-3">
        <h2 id="where" className="t-heading font-semibold">Where you are</h2>
        {/* Steps passed in a Cobalt outline, the current one solid (green once
            Mastered: Validated is the step that makes it so), the rest quiet. */}
        <ol className="t-small flex flex-wrap items-center gap-1.5">
          {s.ladder.map((l, i) => (
            <li key={l.state} aria-current={i === current ? 'step' : undefined}
              className={`rounded-full border px-3 py-1 ${i === current
                ? (l.state === 'mastered' || l.state === 'validated' ? 'border-mastery bg-mastery font-semibold text-ink' : 'border-cobalt bg-cobalt font-semibold text-white')
                : i < current ? 'border-cobalt/50 bg-white text-ink' : 'border-ink/15 bg-white text-ink/70'}`}>
              {l.label}
              {l.state === 'validated' && i > current && <span className="sr-only"> (needs a full case)</span>}
            </li>
          ))}
        </ol>
        <p className="t-small">{s.next}</p>
        <div className="flex flex-wrap gap-3">
          {s.live && <StartSetButton body={{ skill_id: s.id, quick_start: true, dashboard: 'detail' }} label="Practice this" />}
          {s.lesson && <Link href={`/drills/learn/${encodeURIComponent(s.id)}?source=library`} className={buttonVariants({ variant: 'outline' })}>Read the lesson</Link>}
        </div>
      </section>

      <section aria-labelledby="score" className="space-y-2">
        <h2 id="score" className="t-heading font-semibold">Score over time</h2>
        {s.chart
          ? <DrillChart spec={s.chart} />
          : <p className="t-small text-ink/70">No scores yet. A skill gets a score in a set with 3 or more questions or checks on it.</p>}
        {s.not_counted.length > 0 && (
          <p className="t-small">Hollow dots don&apos;t count toward the next state. {s.not_counted.join(' ')}</p>
        )}
        <Source from="drills" />
      </section>

      <section aria-labelledby="mistakes" className="space-y-2">
        <h2 id="mistakes" className="t-heading font-semibold">Mistakes</h2>
        {s.mistakes.length === 0
          ? <p className="t-small text-ink/70">None of this skill&apos;s mistakes has come up yet.</p>
          : (
            <div role="region" aria-label="Mistakes on this skill" tabIndex={0} className="overflow-x-auto rounded-window border border-ink/12 bg-white">
              <table className="w-full border-collapse t-small">
                <caption className="sr-only">Mistakes on {s.name}: the last {s.window_days} days, the {s.window_days} days before, and the latest example</caption>
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="border-b border-ink/12 bg-paper px-3 py-2 font-medium text-ink/70">Mistake</th>
                    <th scope="col" className="border-b border-ink/12 bg-paper px-3 py-2 font-medium text-ink/70">Last {s.window_days} days</th>
                    <th scope="col" className="border-b border-ink/12 bg-paper px-3 py-2 font-medium text-ink/70">The {s.window_days} before</th>
                    <th scope="col" className="border-b border-ink/12 bg-paper px-3 py-2 font-medium text-ink/70">Latest example</th>
                  </tr>
                </thead>
                <tbody>
                  {s.mistakes.map(m => (
                    <tr key={m.label} className="align-top">
                      <th scope="row" className="border-b border-ink/10 px-3 py-2.5 text-left font-semibold">{m.label.charAt(0).toUpperCase() + m.label.slice(1)}</th>
                      <td className="border-b border-ink/10 px-3 py-2.5">{m.trend === 'fixed' ? <span className="inline-flex items-center gap-1 font-semibold">Fixed <Check aria-hidden="true" className="size-3.5 text-mastery" strokeWidth={3} /></span> : <>{m.recent} <span className="text-ink/70">{m.trend === 'up' ? '(more)' : m.trend === 'down' ? '(fewer)' : '(same)'}</span></>}</td>
                      <td className="border-b border-ink/10 px-3 py-2.5">{m.before}</td>
                      <td className="border-b border-ink/10 px-3 py-2.5">
                        {m.example ? (
                          <>
                            <span className="block">{m.example.label}: “{m.example.text}”</span>
                            {m.example.answer && <span className="block">The answer was: “{m.example.answer}”</span>}
                            <span className="block t-label text-ink/70">{m.example.where}, {m.example.date}</span>
                          </>
                        ) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Source from="both" />
      </section>

      <section aria-labelledby="cases" className="space-y-2">
        <h2 id="cases" className="t-heading font-semibold">From your full cases</h2>
        {s.findings.length
          ? (
            <ul className="space-y-2 t-small">
              {s.findings.map((f, i) => <li key={i}><span className="font-medium">{f.label.charAt(0).toUpperCase() + f.label.slice(1)}</span> ({f.date}): “{f.quote}”</li>)}
            </ul>
          )
          : <p className="t-small text-ink/70">{s.case_data ? 'No case has flagged this skill.' : 'Findings on this skill from your full cases appear here once your cases reach your training.'}</p>}
        <Source from="cases" />
      </section>

      {s.builds_on.length > 0 && (
        <section aria-labelledby="builds" className="space-y-2">
          <h2 id="builds" className="t-heading font-semibold">Builds on</h2>
          <ul className="space-y-1 t-small">
            {s.builds_on.map(b => (
              <li key={b.id}><Link href={`/drills/progress/${encodeURIComponent(b.id)}?from=prerequisite`} className="link">{b.name}</Link>: {b.state}</li>
            ))}
          </ul>
        </section>
      )}
    </AppPage>
  );
}
