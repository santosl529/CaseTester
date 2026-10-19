import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { StartSetButton } from '@/components/drills/start-set-button';
import { Source } from '@/components/drills/progress';
import { studentOrRedirect } from '@/lib/drills/session';
import { logDrillEvent } from '@/lib/drills/events';
import { skillDetailView } from '@/lib/drills/progress/dashboard-store';

const FROM = ['map', 'strengths', 'focus', 'prerequisite', 'results'] as const;

// One skill on Your progress: where the student is on the ladder and what the
// next step needs, the score per set (tier and stage changes marked), the
// skill's mistakes with the latest example, case findings, what it builds on,
// and Practice / Read the lesson. Skill codes appear only in the URL.
export default async function SkillPage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ from?: string }> }) {
  const studentId = await studentOrRedirect();
  const { skillId } = await params;
  const q = await searchParams;
  const s = await skillDetailView(studentId, decodeURIComponent(skillId));
  if (!s) notFound();
  await logDrillEvent(studentId, 'skill_detail_opened', {
    skill_id: s.id, state: s.state, from: FROM.find(f => f === q.from) ?? 'direct',
  });
  const current = s.ladder.findIndex(l => l.state === s.state);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-6">
      <header className="space-y-1">
        <Link href="/drills/progress" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Your progress</Link>
        <h1 className="text-xl font-semibold">{s.name}</h1>
        <p className="text-sm text-muted-foreground">{s.area}</p>
      </header>

      <section aria-labelledby="where" className="space-y-3">
        <h2 id="where" className="font-medium">Where you are</h2>
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          {s.ladder.map((l, i) => (
            <li key={l.state} aria-current={i === current ? 'step' : undefined}
              className={`rounded-full border px-3 py-1 ${i === current ? 'border-foreground bg-foreground font-medium text-background' : i < current ? 'border-foreground/40' : 'text-muted-foreground'}`}>
              {l.label}
              {l.state === 'validated' && i > current && <span className="sr-only"> (needs a full case)</span>}
            </li>
          ))}
        </ol>
        <p className="text-sm">{s.next}</p>
        <div className="flex flex-wrap gap-3">
          {s.live && <StartSetButton body={{ skill_id: s.id, quick_start: true, dashboard: 'detail' }} label="Practice this" />}
          {s.lesson && <Link href={`/drills/learn/${encodeURIComponent(s.id)}?source=library`} className={buttonVariants({ variant: 'outline' })}>Read the lesson</Link>}
        </div>
      </section>

      <section aria-labelledby="score" className="space-y-2">
        <h2 id="score" className="font-medium">Score over time</h2>
        {s.chart
          ? <DrillChart spec={s.chart} />
          : <p className="text-sm text-muted-foreground">No scores yet. A skill gets a score in a set with 3 or more questions or checks on it.</p>}
        {s.not_counted.length > 0 && (
          <p className="text-sm">Hollow dots don&apos;t count toward the next state. {s.not_counted.join(' ')}</p>
        )}
        <Source from="drills" />
      </section>

      <section aria-labelledby="mistakes" className="space-y-2">
        <h2 id="mistakes" className="font-medium">Mistakes</h2>
        {s.mistakes.length === 0
          ? <p className="text-sm text-muted-foreground">None of this skill&apos;s mistakes has come up yet.</p>
          : (
            <div role="region" aria-label="Mistakes on this skill" tabIndex={0} className="overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Mistakes on {s.name}: the last {s.window_days} days, the {s.window_days} days before, and the latest example</caption>
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="border-b px-2 py-1 font-medium">Mistake</th>
                    <th scope="col" className="border-b px-2 py-1 font-medium">Last {s.window_days} days</th>
                    <th scope="col" className="border-b px-2 py-1 font-medium">The {s.window_days} before</th>
                    <th scope="col" className="border-b px-2 py-1 font-medium">Latest example</th>
                  </tr>
                </thead>
                <tbody>
                  {s.mistakes.map(m => (
                    <tr key={m.label} className="align-top">
                      <th scope="row" className="border-b px-2 py-2 text-left font-normal">{m.label.charAt(0).toUpperCase() + m.label.slice(1)}</th>
                      <td className="border-b px-2 py-2">{m.trend === 'fixed' ? <span className="font-medium">Fixed ✓</span> : <>{m.recent} <span className="text-muted-foreground">{m.trend === 'up' ? '(more)' : m.trend === 'down' ? '(fewer)' : '(same)'}</span></>}</td>
                      <td className="border-b px-2 py-2">{m.before}</td>
                      <td className="border-b px-2 py-2">
                        {m.example ? (
                          <>
                            <span className="block">{m.example.label}: “{m.example.text}”</span>
                            {m.example.answer && <span className="block">The answer was: “{m.example.answer}”</span>}
                            <span className="block text-xs text-muted-foreground">{m.example.where}, {m.example.date}</span>
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
        <h2 id="cases" className="font-medium">From your full cases</h2>
        {s.findings.length
          ? (
            <ul className="space-y-2 text-sm">
              {s.findings.map((f, i) => <li key={i}><span className="font-medium">{f.label.charAt(0).toUpperCase() + f.label.slice(1)}</span> ({f.date}): “{f.quote}”</li>)}
            </ul>
          )
          : <p className="text-sm text-muted-foreground">{s.case_data ? 'No case has flagged this skill.' : 'Findings on this skill from your full cases appear here once your cases reach your training.'}</p>}
        <Source from="cases" />
      </section>

      {s.builds_on.length > 0 && (
        <section aria-labelledby="builds" className="space-y-2">
          <h2 id="builds" className="font-medium">Builds on</h2>
          <ul className="space-y-1 text-sm">
            {s.builds_on.map(b => (
              <li key={b.id}><Link href={`/drills/progress/${encodeURIComponent(b.id)}?from=prerequisite`} className="underline underline-offset-4">{b.name}</Link>: {b.state}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
