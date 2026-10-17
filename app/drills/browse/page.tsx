import Link from 'next/link';
import { studentOrRedirect } from '@/lib/drills/session';
import { catalog } from '@/lib/drills/program/catalog';
import { inProgressSet } from '@/lib/drills/sets/service';
import { logDrillEvent } from '@/lib/drills/events';
import { StartSetButton } from '@/components/drills/start-set-button';
import { PickDrill } from '@/components/drills/pick-drill';

const STATE = { not_started: 'Not started', learning: 'Learning', recognizes: 'Recognizes', practiced: 'Practiced', mastered: 'Mastered', validated: 'Validated' } as const;

// Browse drills (docs/prd-drills.md "Browse drills"): every skill area and
// skill, with Quick start (the system picks the drill, stage and tier) or a
// specific drill and tier. Browsed sets count toward skills like any other.
export default async function BrowseDrillsPage() {
  const studentId = await studentOrRedirect();
  const [areas, current] = await Promise.all([catalog(studentId), inProgressSet(studentId)]);
  await logDrillEvent(studentId, 'drill_catalog_viewed', {});
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Browse drills</h1>
        <p className="text-sm text-muted-foreground">Practice any skill. Quick start picks the right drill and level for you; or pick a drill and tier yourself.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/drills" className="underline-offset-4 hover:underline">Training home</Link>
          <Link href="/drills/learn" className="underline-offset-4 hover:underline">Learn</Link>
          <Link href="/drills/profile" className="underline-offset-4 hover:underline">Your skills</Link>
        </nav>
      </header>
      {current && (
        <p className="rounded-lg border p-3 text-sm">
          You have a set in progress. <Link href={`/drills/sets/${current.id}`} className="font-medium underline underline-offset-4">Resume it</Link>
        </p>
      )}
      {areas.map(area => (
        <section key={area.code} aria-labelledby={`area-${area.code}`} className="space-y-3">
          <h2 id={`area-${area.code}`} className="text-sm font-semibold">{area.name}</h2>
          <ul className="space-y-3">
            {area.skills.map(s => (
              <li key={s.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.suggested && <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">Suggested</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{STATE[s.state]}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StartSetButton body={{ skill_id: s.id, quick_start: true, browse: true }} label="Quick start" size="sm" />
                  {s.has_lesson && <Link href={`/drills/learn/${encodeURIComponent(s.id)}`} className="text-sm underline underline-offset-4">Short lesson</Link>}
                </div>
                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Pick a drill and tier</summary>
                  <div className="mt-2 divide-y">
                    {s.drills.map(d => <PickDrill key={d.drill_id} skillId={s.id} drill={d} />)}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
