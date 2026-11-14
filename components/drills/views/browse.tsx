import Link from 'next/link';
import { AppPage } from '@/components/brand/page';
import type { catalog } from '@/lib/drills/program/catalog';
import { browseStages } from '@/lib/drills/drill-info';
import { StartSetButton } from '@/components/drills/start-set-button';
import { PickDrill, type PickableDrill } from '@/components/drills/pick-drill';
import { BrowseTabs } from '@/components/drills/browse-tabs';
import { buttonVariants } from '@/components/ui/button';

const STATE = { not_started: 'Not started', learning: 'Learning', recognizes: 'Recognizes', practiced: 'Practiced', mastered: 'Mastered', validated: 'Validated' } as const;
// One line per interview stage, as in "How a case interview works".
const STAGE_LINE = {
  Clarify: 'Making sure you understand the problem before you solve it.',
  Structure: 'Laying out how you will attack the problem.',
  Analyze: 'Working through data, math and exhibits, and steering what comes next.',
  Recommend: 'Answering the client’s question, backed by evidence.',
} as const;

export type CatalogData = Awaited<ReturnType<typeof catalog>>;
export interface CurrentSet { id: string; name: string; done: number; size: number }

// Browse drills' screen; app/drills/browse/page.tsx loads its data. One job,
// choosing extra practice (Matt, 13 Nov): a set in progress first (the page's
// one main button), the skills suggested for you, then two tabs, By drill
// (stage-grouped cards; stages with no drill left out) and By skill (Practice: a quick start).
export function BrowseDrills({ areas, current }: { areas: CatalogData; current: CurrentSet | null }) {
  const pickable = new Map<string, PickableDrill>();
  for (const a of areas) for (const s of a.skills) for (const d of s.drills) if (!pickable.has(d.drill_id)) pickable.set(d.drill_id, d);
  const groups = browseStages(id => pickable.get(id)?.current_tier ?? 1);
  // Skills with an open prescription carry "Suggested" (catalog.ts); up to three, in the catalog's order.
  const suggested = areas.flatMap(a => a.skills).filter(s => s.suggested).slice(0, 3);

  const byDrill = groups.map(g => (
    <section key={g.stage} aria-labelledby={`stage-${g.stage}`} className="space-y-4">
      <div className="space-y-1">
        <h2 id={`stage-${g.stage}`} className="t-heading font-semibold">{g.stage}</h2>
        <p className="t-small text-ink/70">{STAGE_LINE[g.stage]}</p>
      </div>
      <ul className="space-y-3">
        {g.drills.map(d => {
          const pick = pickable.get(d.drill_id);
          return (
            <li key={d.drill_id} id={`drill-${d.drill_id}`} className="scroll-mt-20 space-y-1.5 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet">
              <h3 className="t-body font-semibold">{d.name}</h3>
              {d.what && <p className="t-small">{d.what}</p>}
              {pick
                ? <PickDrill skillId={d.primary_skill} drill={pick} compact meta={meta(d)} />
                : <p className="t-small text-ink/70">{meta(d)}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  ));

  const bySkill = (
    <>
      <p className="t-small text-ink/70">Practice picks the right drill and level for you.</p>
      {areas.map(area => (
        <div key={area.code} className="space-y-2">
          <h2 className="t-label font-semibold text-ink/70">{area.name}</h2>
          <ul className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
            {area.skills.map(s => (
              <li key={s.id} className="t-small flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="min-w-0 space-y-0.5">
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
                  <StartSetButton body={{ skill_id: s.id, quick_start: true, browse: true }} label="Practice" name={`Practice ${s.name}`} size="sm" variant="outline" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );

  return (
    <AppPage className="space-y-10">
      <header className="space-y-3">
        <h1 className="t-title">Browse drills</h1>
        <p className="t-body max-w-[65ch] text-ink/70">Every drill, by the stage of the interview it trains. Pick one and a level, or use Practice on a skill below and we pick the drill and level for you.</p>
      </header>
      {current && (
        <section aria-labelledby="continue" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-cobalt/40 bg-white p-5 shadow-panel sm:p-6">
          <div className="space-y-0.5">
            <h2 id="continue" className="t-heading font-semibold">{current.name}</h2>
            <p className="t-small text-ink/70 tabular-nums">{current.done} of {current.size} done</p>
          </div>
          <Link href={`/drills/sets/${current.id}`} className={buttonVariants({ size: 'lg' })}>Resume</Link>
        </section>
      )}
      {suggested.length > 0 && (
        <section aria-labelledby="suggested" className="space-y-2">
          <h2 id="suggested" className="t-label font-semibold text-ink/70">Suggested for you</h2>
          <ul className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
            {suggested.map(s => (
              <li key={s.id} className="t-small flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="min-w-0"><span className="font-semibold">{s.name}</span> <span className="text-ink/70">· {STATE[s.state]}</span></span>
                <StartSetButton body={{ skill_id: s.id, quick_start: true, browse: true }} label="Practice" name={`Practice ${s.name}`} size="sm" variant="outline" />
              </li>
            ))}
          </ul>
        </section>
      )}
      <BrowseTabs byDrill={byDrill} bySkill={bySkill} />
    </AppPage>
  );
}

const meta = (d: { items: number | null; minutes: number }) => [d.items && `${d.items} items`, `${Math.max(1, Math.round(d.minutes))} min`].filter(Boolean).join(' · ');
