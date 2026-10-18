import Link from 'next/link';
import { studentOrRedirect } from '@/lib/drills/session';
import { catalog } from '@/lib/drills/program/catalog';
import { drillCards } from '@/lib/drills/drill-info';
import { inProgressSet } from '@/lib/drills/sets/service';
import { logDrillEvent } from '@/lib/drills/events';
import { StartSetButton } from '@/components/drills/start-set-button';
import { PickDrill, type PickableDrill } from '@/components/drills/pick-drill';

const STATE = { not_started: 'Not started', learning: 'Learning', recognizes: 'Recognizes', practiced: 'Practiced', mastered: 'Mastered', validated: 'Validated' } as const;
// One line per interview stage, as in "How a case interview works".
const STAGE_LINE = {
  Clarify: 'Making sure you understand the problem before you solve it.',
  Structure: 'Laying out how you will attack the problem.',
  Analyze: 'Working through data, math and exhibits, and steering what comes next.',
  Recommend: 'Answering the client’s question, backed by evidence.',
} as const;

// Browse drills (docs/prd-drills.md "Browse drills"): every drill as a card,
// grouped by the interview stage it trains, with what you do, how it helps,
// its skills and time, and a tier to start at. Quick start by skill (the
// system picks the drill, stage and tier) is below. Browsed sets count toward
// skills like any other.
export default async function BrowseDrillsPage() {
  const studentId = await studentOrRedirect();
  const [areas, current] = await Promise.all([catalog(studentId), inProgressSet(studentId)]);
  await logDrillEvent(studentId, 'drill_catalog_viewed', {});
  const pickable = new Map<string, PickableDrill>();
  for (const a of areas) for (const s of a.skills) for (const d of s.drills) if (!pickable.has(d.drill_id)) pickable.set(d.drill_id, d);
  const groups = drillCards(id => pickable.get(id)?.current_tier ?? 1);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Browse drills</h1>
        <p className="text-sm text-muted-foreground">Every drill, by the stage of the interview it trains. Pick one and a tier, or use Quick start on a skill below and we pick the drill and level for you.</p>
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
      {groups.map(g => (
        <section key={g.stage} aria-labelledby={`stage-${g.stage}`} className="space-y-3">
          <div>
            <h2 id={`stage-${g.stage}`} className="font-semibold">{g.stage}</h2>
            <p className="text-sm text-muted-foreground">{STAGE_LINE[g.stage]}</p>
          </div>
          {g.drills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drill yet: you practice this stage in full cases.</p>
          ) : (
            <ul className="space-y-3">
              {g.drills.map(d => {
                const pick = pickable.get(d.drill_id);
                return (
                  <li key={d.drill_id} className="space-y-2 rounded-lg border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium">{d.name}</h3>
                      <span className="text-xs text-muted-foreground">{d.stages.join(' · ')}</span>
                    </div>
                    {d.what && <p className="text-sm">{d.what}</p>}
                    {d.why && <p className="text-sm text-muted-foreground">{d.why}</p>}
                    <p className="text-xs text-muted-foreground">Skills: {d.skills.map(s => s.name).join(', ')} · {d.items} items · about {d.minutes} min</p>
                    {pick && <PickDrill skillId={d.primary_skill} drill={pick} compact />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      <section aria-labelledby="by-skill" className="space-y-3">
        <h2 id="by-skill" className="font-semibold">Practice a skill</h2>
        <p className="text-sm text-muted-foreground">Quick start picks the right drill, stage and tier for the skill.</p>
        {areas.map(area => (
          <div key={area.code} className="space-y-2">
            <h3 className="text-sm font-semibold">{area.name}</h3>
            <ul className="divide-y rounded-lg border">
              {area.skills.map(s => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <span className="space-y-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.suggested && <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">Suggested</span>}
                      <span className="text-muted-foreground">{STATE[s.state]}</span>
                    </span>
                    <span className="block text-muted-foreground">{s.description}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {s.has_lesson && <Link href={`/drills/learn/${encodeURIComponent(s.id)}`} className="underline underline-offset-4">Short lesson</Link>}
                    <StartSetButton body={{ skill_id: s.id, quick_start: true, browse: true }} label={`Quick start: ${s.name}`} size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
