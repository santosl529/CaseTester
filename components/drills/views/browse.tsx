import Link from 'next/link';
import { AppPage } from '@/components/brand/page';
import type { catalog } from '@/lib/drills/program/catalog';
import { drillCards } from '@/lib/drills/drill-info';
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

export type CatalogData = Awaited<ReturnType<typeof catalog>>;

// Browse drills' screen; app/drills/browse/page.tsx loads its data.
export function BrowseDrills({ areas, current }: { areas: CatalogData; current: { id: string } | null }) {
  const pickable = new Map<string, PickableDrill>();
  for (const a of areas) for (const s of a.skills) for (const d of s.drills) if (!pickable.has(d.drill_id)) pickable.set(d.drill_id, d);
  const groups = drillCards(id => pickable.get(id)?.current_tier ?? 1);
  return (
    <AppPage className="space-y-12">
      <header className="space-y-3">
        <h1 className="t-title">Browse drills</h1>
        <p className="t-body max-w-[65ch] text-ink/70">Every drill, by the stage of the interview it trains. Pick one and a tier, or use Quick start on a skill below and we pick the drill and level for you.</p>
        <nav className="t-small flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/drills" className="link">Training home</Link>
          <Link href="/drills/learn" className="link">Learn</Link>
          <Link href="/drills/progress" className="link">Your progress</Link>
        </nav>
      </header>
      {current && (
        <p className="t-small rounded-panel bg-sky/60 px-5 py-4">
          You have a set in progress. <Link href={`/drills/sets/${current.id}`} className="link">Resume it</Link>
        </p>
      )}
      {groups.map(g => (
        <section key={g.stage} aria-labelledby={`stage-${g.stage}`} className="space-y-4">
          <div className="space-y-1">
            <h2 id={`stage-${g.stage}`} className="t-heading font-semibold">{g.stage}</h2>
            <p className="t-small text-ink/70">{STAGE_LINE[g.stage]}</p>
          </div>
          {g.drills.length === 0 ? (
            <p className="t-small text-ink/70">No drill yet: you practice this stage in full cases.</p>
          ) : (
            <ul className="space-y-3">
              {g.drills.map(d => {
                const pick = pickable.get(d.drill_id);
                return (
                  <li key={d.drill_id} className="space-y-2 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="t-body font-semibold">{d.name}</h3>
                      <span className="t-label text-ink/70">{d.stages.join(' · ')}</span>
                    </div>
                    {d.what && <p className="t-small">{d.what}</p>}
                    {d.why && <p className="t-small text-ink/70">{d.why}</p>}
                    <p className="t-label text-ink/70">Skills: {d.skills.map(s => s.name).join(', ')} · {d.items} items · about {d.minutes} min</p>
                    {pick && <PickDrill skillId={d.primary_skill} drill={pick} compact />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      <section aria-labelledby="by-skill" className="space-y-4">
        <div className="space-y-1">
          <h2 id="by-skill" className="t-heading font-semibold">Practice a skill</h2>
          <p className="t-small text-ink/70">Quick start picks the right drill, stage and tier for the skill.</p>
        </div>
        {areas.map(area => (
          <div key={area.code} className="space-y-2">
            <h3 className="t-label font-semibold text-ink/70">{area.name}</h3>
            <ul className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
              {area.skills.map(s => (
                <li key={s.id} className="t-small flex flex-wrap items-center justify-between gap-3 p-4">
                  <span className="space-y-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      {s.suggested && <span className="t-label rounded-full bg-cobalt px-2 py-0.5 font-semibold text-white">Suggested</span>}
                      <span className="text-ink/70">{STATE[s.state]}</span>
                    </span>
                    <span className="block text-ink/70">{s.description}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    {s.has_lesson && <Link href={`/drills/learn/${encodeURIComponent(s.id)}`} className="link">Short lesson</Link>}
                    {/* Outline, not primary: a list of starts has no single main action. */}
                    <StartSetButton body={{ skill_id: s.id, quick_start: true, browse: true }} label={`Quick start: ${s.name}`} size="sm" variant="outline" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </AppPage>
  );
}
