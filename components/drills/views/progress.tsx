import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { PrescriptionActions } from '@/components/drills/prescription-actions';
import { Source, StateLegend, TrendArrow, ViewToggle, stateStyle } from '@/components/drills/progress';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import type { dashboardView, GroupBy, Period } from '@/lib/drills/progress/dashboard-store';
import { STATE_LABEL } from '@/lib/drills/progress/dashboard';
import { Check } from 'lucide-react';
import { AppPage } from '@/components/brand/page';
import { Meter } from '@/components/brand/progress';

const pct = (x: number | null) => (x === null ? '' : `${Math.round(x * 100)}%`);
const PERIOD_TEXT: Record<string, string> = { '2w': 'Last 2 weeks', '4w': 'Last 4 weeks', all: 'All time' };

export type DashboardData = Awaited<ReturnType<typeof dashboardView>>;

// Your progress's screen; app/drills/progress/page.tsx loads its data.
export function ProgressScreen({ v, window, period, group }: { v: DashboardData; window: number; period: Period; group: GroupBy }) {
  const dash = DRILLS_CONFIG.rules.dashboard;
  const params = { window: String(window), period, group };
  const header = (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="t-title">Your progress</h1>
      <Link href="/drills" className="link t-small">Training home</Link>
    </header>
  );

  // Before any practice: what the page will show, and where to start.
  if (!v.practiced) {
    return (
      <AppPage width="wide" className="space-y-10">
        {header}
        <section aria-labelledby="empty" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="empty" className="t-heading font-semibold">Your progress shows up here once you start practicing</h2>
          <ul className="list-disc space-y-1 pl-5 t-small">
            <li>Whether you&apos;re improving, holding steady or slipping, in one sentence.</li>
            <li>A map of all {v.counts.live} skills, from Not started to Validated, with a trend for each.</li>
            <li>Your strengths and the skills to focus on next, the same ones your workouts pick.</li>
            <li>A checklist of how close you are to interview ready.</li>
            <li>Charts of your skills, mistakes and pace over the weeks.</li>
          </ul>
          {v.has_plan
            ? <Link href="/drills" className={buttonVariants()}>Start today&apos;s workout</Link>
            : <Link href="/drills/plan" className={buttonVariants()}>Get your plan</Link>}
        </section>
      </AppPage>
    );
  }

  return (
    <AppPage width="wide" className="space-y-10">
      {header}

      <section aria-labelledby="summary" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
        <h2 id="summary" className="sr-only">Summary</h2>
        <ViewToggle label="This summary compares" name="window" current={String(window)} params={params}
          options={dash.compare_windows_days.map(d => ({ value: String(d), text: d === 7 ? 'This week with last week' : `Last ${d} days with the ${d} before` }))} />
        <p className="t-heading font-semibold">{v.summary.sentence}</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 t-small">
          <li>{v.counts.mastered} of {v.counts.live} skills at Mastered or above</li>
          <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* The homepage's readiness meter: how many of the checklist's lines are met. */}
            <Meter value={v.readiness.lines.length ? v.readiness.met / v.readiness.lines.length : 0} label={`Interview ready: ${v.readiness.met} of ${v.readiness.lines.length} met`} />
            <span>Interview ready, today: <span className="font-semibold">{v.readiness.status}</span> ({v.readiness.met} of {v.readiness.lines.length}) · <a href="#ready" className="link">See the checklist</a></span>
          </li>
        </ul>
        {v.week && (
          <p className="t-small">
            Week {v.week.number} ({v.week.theme}) milestones: {v.week.milestone_skills.map(s => `${s.name}: ${s.state}`).join(' · ') || 'none this week'}
            {v.week.met && ' · met'}
          </p>
        )}
        <Source from="both" />
      </section>

      <section aria-labelledby="map" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="map" className="t-heading font-semibold">Skill map</h2>
          <div className="flex flex-wrap gap-3">
            <ViewToggle label="Group by" name="group" current={group} params={params}
              options={[{ value: 'area', text: 'Skill area' }, { value: 'stage', text: 'Interview stage' }]} />
            <ViewToggle label="Skill-map arrows cover" name="period" current={period} params={params}
              options={Object.keys(dash.periods_days).map(p => ({ value: p, text: PERIOD_TEXT[p] ?? p }))} />
          </div>
        </div>
        {v.groups.map(g => (
          <div key={g.title} className="space-y-2">
            <h3 className="t-label font-semibold text-ink/70">{g.title}</h3>
            {g.note && <p className="t-small text-ink/70">{g.note}</p>}
            {g.skills.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.skills.map(s => (
                  <li key={s.id}>
                    <Link href={`/drills/progress/${encodeURIComponent(s.id)}?from=map`}
                      style={stateStyle(s.state)}
                      className="t-small flex items-center justify-between gap-2 rounded-window px-3 py-2.5 transition-[filter] hover:brightness-95 motion-reduce:transition-none">
                      <span className="font-semibold">{s.name}</span>
                      <span className="flex items-center gap-2 whitespace-nowrap">{STATE_LABEL[s.state]} <TrendArrow arrow={s.arrow} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <StateLegend />
        <p className="t-label text-ink/70">↑ improving · → steady · ↓ slipping · no arrow: not enough sets yet. A skill moving up a state, or 3 sets against the 3 before at the same tier and kind of drill.</p>
        <Source from="drills" />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="strengths" className="space-y-2">
          <h2 id="strengths" className="t-heading font-semibold">Strengths</h2>
          {v.strengths.length === 0
            ? <p className="t-small text-ink/70">Strengths appear once a skill reaches Practiced.</p>
            : (
              <ol className="space-y-2">
                {v.strengths.map(s => (
                  <li key={s.id} className="t-small rounded-window border border-ink/12 bg-white p-4">
                    <Link href={`/drills/progress/${encodeURIComponent(s.id)}?from=strengths`} className="font-medium underline-offset-4 hover:underline">{s.name}</Link>
                    <span className="block text-ink/70">{s.state}{s.score !== null && `, last score ${pct(s.score)}`}</span>
                  </li>
                ))}
              </ol>
            )}
          <Source from="drills" />
        </section>
        <section aria-labelledby="focus" className="space-y-2">
          <h2 id="focus" className="t-heading font-semibold">Focus areas</h2>
          {v.focus.length === 0
            ? <p className="t-small text-ink/70">Nothing flagged right now.</p>
            : (
              <ol className="space-y-2">
                {v.focus.map(f => (
                  <li key={f.prescription_id} className="space-y-2 t-small rounded-window border border-ink/12 bg-white p-4">
                    <Link href={`/drills/progress/${encodeURIComponent(f.skill_id)}?from=focus`} className="font-medium underline-offset-4 hover:underline">{f.name}</Link>
                    <p className="text-ink/70">{f.reason}</p>
                    {f.live && <PrescriptionActions id={f.prescription_id} paused={false} extra={{ dashboard: 'focus' }} startLabel="Practice" />}
                  </li>
                ))}
              </ol>
            )}
          <p className="t-label text-ink/70">In the order your workouts pick them.</p>
          <Source from="both" />
        </section>
      </div>

      <section id="ready" aria-labelledby="ready-h" className="space-y-2 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
        <h2 id="ready-h" className="t-heading font-semibold">Interview ready, today: {v.readiness.status}</h2>
        <ul className="space-y-2 t-small">
          {v.readiness.lines.map(l => (
            <li key={l.key} className="flex gap-2">
              <span aria-hidden="true" className={`mt-0.5 flex size-4 flex-none items-center justify-center rounded-full ${l.met ? 'bg-mastery text-ink' : 'border border-ink/30 bg-white'}`}>{l.met && <Check className="size-2.5" strokeWidth={3} />}</span>
              <span><span className="sr-only">{l.met ? 'Done: ' : 'Not yet: '}</span>{l.text}. <span className="text-ink/70">{l.detail}</span></span>
            </li>
          ))}
        </ul>
        <p className="t-label text-ink/70">This can change: a skill that slips in a review, or a new skill joining the training, moves it back.</p>
        <Source from="both" />
      </section>

      <section aria-labelledby="trends" className="space-y-4">
        <h2 id="trends" className="t-heading font-semibold">Trends</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-1"><DrillChart spec={v.trends.states} /><Source from="drills" /></div>
          <div className="space-y-1"><DrillChart spec={v.trends.misses} /><Source from="drills" /></div>
          <div className="space-y-1"><DrillChart spec={v.trends.pace} /><Source from="drills" /></div>
          <div className="space-y-1">
            {v.trends.rubric.length
              ? v.trends.rubric.map(spec => <DrillChart key={spec.title} spec={spec} />)
              : <p className="t-small text-ink/70">{v.case_data ? 'Case ratings appear once you have 2 different full cases at the same tier.' : 'Case ratings appear here once your full cases reach your training.'}</p>}
            <Source from="cases" />
          </div>
        </div>
      </section>

      <details className="rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
        <summary className="cursor-pointer font-medium">Recent activity</summary>
        <ul className="mt-3 space-y-1 t-small">
          {v.history.map((h, i) => <li key={i}>{h.date}: {h.text}{h.score !== null && `, ${pct(h.score)}`}</li>)}
        </ul>
      </details>
    </AppPage>
  );
}
