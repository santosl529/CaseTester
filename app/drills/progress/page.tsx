import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { PrescriptionActions } from '@/components/drills/prescription-actions';
import { Source, StateLegend, TrendArrow, ViewToggle, stateStyle } from '@/components/drills/progress';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { logDrillEvent } from '@/lib/drills/events';
import { dashboardView, type GroupBy, type Period } from '@/lib/drills/progress/dashboard-store';
import { STATE_LABEL } from '@/lib/drills/progress/dashboard';

const pct = (x: number | null) => (x === null ? '' : `${Math.round(x * 100)}%`);
const PERIOD_TEXT: Record<string, string> = { '2w': 'Last 2 weeks', '4w': 'Last 4 weeks', all: 'All time' };

// Your progress (docs/prd-drills.md "Your progress"): where the student stands
// on every skill, whether they're getting better, strengths and focus areas,
// and how close they are to interview ready. Replaces Your skills.
export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ window?: string; period?: string; group?: string; changed?: string }> }) {
  const studentId = await studentOrRedirect();
  const q = await searchParams;
  const dash = DRILLS_CONFIG.rules.dashboard;
  const window = dash.compare_windows_days.find(d => String(d) === q.window) ?? dash.compare_windows_days[0];
  const period = (q.period && q.period in dash.periods_days ? q.period : '2w') as Period;
  const group: GroupBy = q.group === 'stage' ? 'stage' : 'area';
  const params = { window: String(window), period, group };
  const v = await dashboardView(studentId, { window, period, group });

  await logDrillEvent(studentId, 'dashboard_viewed', {
    summary_status: v.summary.status, readiness_status: v.readiness.status, window_days: window, period, group_by: group, practiced: v.practiced,
  });
  if (q.changed && q.changed in params) {
    await logDrillEvent(studentId, 'dashboard_filter_changed', { filter: q.changed, value: params[q.changed as keyof typeof params] });
  }

  const header = (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="text-xl font-semibold">Your progress</h1>
      <Link href="/drills" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Training home</Link>
    </header>
  );

  // Before any practice: what the page will show, and where to start.
  if (!v.practiced) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        {header}
        <section aria-labelledby="empty" className="space-y-3 rounded-lg border p-4">
          <h2 id="empty" className="font-medium">Your progress shows up here once you start practicing</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
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
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6">
      {header}

      <section aria-labelledby="summary" className="space-y-3 rounded-lg border p-4">
        <h2 id="summary" className="sr-only">Summary</h2>
        <ViewToggle label="This summary compares" name="window" current={String(window)} params={params}
          options={dash.compare_windows_days.map(d => ({ value: String(d), text: d === 7 ? 'This week with last week' : `Last ${d} days with the ${d} before` }))} />
        <p className="text-base font-medium">{v.summary.sentence}</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <li>{v.counts.mastered} of {v.counts.live} skills at Mastered or above</li>
          <li>Interview ready, today: <span className="font-medium">{v.readiness.status}</span> ({v.readiness.met} of {v.readiness.lines.length}) · <a href="#ready" className="underline underline-offset-4">See the checklist</a></li>
        </ul>
        {v.week && (
          <p className="text-sm">
            Week {v.week.number} ({v.week.theme}) milestones: {v.week.milestone_skills.map(s => `${s.name}: ${s.state}`).join(' · ') || 'none this week'}
            {v.week.met && ' · met'}
          </p>
        )}
        <Source from="both" />
      </section>

      <section aria-labelledby="map" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="map" className="font-medium">Skill map</h2>
          <div className="flex flex-wrap gap-3">
            <ViewToggle label="Group by" name="group" current={group} params={params}
              options={[{ value: 'area', text: 'Skill area' }, { value: 'stage', text: 'Interview stage' }]} />
            <ViewToggle label="Skill-map arrows cover" name="period" current={period} params={params}
              options={Object.keys(dash.periods_days).map(p => ({ value: p, text: PERIOD_TEXT[p] ?? p }))} />
          </div>
        </div>
        {v.groups.map(g => (
          <div key={g.title} className="space-y-2">
            <h3 className="text-sm font-semibold">{g.title}</h3>
            {g.note && <p className="text-sm text-muted-foreground">{g.note}</p>}
            {g.skills.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.skills.map(s => (
                  <li key={s.id}>
                    <Link href={`/drills/progress/${encodeURIComponent(s.id)}?from=map`}
                      style={stateStyle(s.state)}
                      className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="flex items-center gap-2 whitespace-nowrap">{STATE_LABEL[s.state]} <TrendArrow arrow={s.arrow} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <StateLegend />
        <p className="text-xs text-muted-foreground">↑ improving · → steady · ↓ slipping · no arrow: not enough sets yet. A skill moving up a state, or 3 sets against the 3 before at the same tier and kind of drill.</p>
        <Source from="drills" />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="strengths" className="space-y-2">
          <h2 id="strengths" className="font-medium">Strengths</h2>
          {v.strengths.length === 0
            ? <p className="text-sm text-muted-foreground">Strengths appear once a skill reaches Practiced.</p>
            : (
              <ol className="space-y-2">
                {v.strengths.map(s => (
                  <li key={s.id} className="rounded-md border p-3 text-sm">
                    <Link href={`/drills/progress/${encodeURIComponent(s.id)}?from=strengths`} className="font-medium underline-offset-4 hover:underline">{s.name}</Link>
                    <span className="block text-muted-foreground">{s.state}{s.score !== null && `, last score ${pct(s.score)}`}</span>
                  </li>
                ))}
              </ol>
            )}
          <Source from="drills" />
        </section>
        <section aria-labelledby="focus" className="space-y-2">
          <h2 id="focus" className="font-medium">Focus areas</h2>
          {v.focus.length === 0
            ? <p className="text-sm text-muted-foreground">Nothing flagged right now.</p>
            : (
              <ol className="space-y-2">
                {v.focus.map(f => (
                  <li key={f.prescription_id} className="space-y-2 rounded-md border p-3 text-sm">
                    <Link href={`/drills/progress/${encodeURIComponent(f.skill_id)}?from=focus`} className="font-medium underline-offset-4 hover:underline">{f.name}</Link>
                    <p className="text-muted-foreground">{f.reason}</p>
                    {f.live && <PrescriptionActions id={f.prescription_id} paused={false} extra={{ dashboard: 'focus' }} startLabel="Practice" />}
                  </li>
                ))}
              </ol>
            )}
          <p className="text-xs text-muted-foreground">In the order your workouts pick them.</p>
          <Source from="both" />
        </section>
      </div>

      <section id="ready" aria-labelledby="ready-h" className="space-y-2 rounded-lg border p-4">
        <h2 id="ready-h" className="font-medium">Interview ready, today: {v.readiness.status}</h2>
        <ul className="space-y-2 text-sm">
          {v.readiness.lines.map(l => (
            <li key={l.key} className="flex gap-2">
              <span aria-hidden="true" className={l.met ? 'text-primary' : 'text-muted-foreground'}>{l.met ? '✓' : '○'}</span>
              <span><span className="sr-only">{l.met ? 'Done: ' : 'Not yet: '}</span>{l.text}. <span className="text-muted-foreground">{l.detail}</span></span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">This can change: a skill that slips in a review, or a new skill joining the training, moves it back.</p>
        <Source from="both" />
      </section>

      <section aria-labelledby="trends" className="space-y-4">
        <h2 id="trends" className="font-medium">Trends</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-1"><DrillChart spec={v.trends.states} /><Source from="drills" /></div>
          <div className="space-y-1"><DrillChart spec={v.trends.misses} /><Source from="drills" /></div>
          <div className="space-y-1"><DrillChart spec={v.trends.pace} /><Source from="drills" /></div>
          <div className="space-y-1">
            {v.trends.rubric.length
              ? v.trends.rubric.map(spec => <DrillChart key={spec.title} spec={spec} />)
              : <p className="text-sm text-muted-foreground">{v.case_data ? 'Case ratings appear once you have 2 different full cases at the same tier.' : 'Case ratings appear here once your full cases reach your training.'}</p>}
            <Source from="cases" />
          </div>
        </div>
      </section>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">Recent activity</summary>
        <ul className="mt-3 space-y-1 text-sm">
          {v.history.map((h, i) => <li key={i}>{h.date}: {h.text}{h.score !== null && `, ${pct(h.score)}`}</li>)}
        </ul>
      </details>
    </main>
  );
}
