import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { PrescriptionActions } from '@/components/drills/prescription-actions';
import { Source, StateLegend, TrendArrow, ViewToggle, stateStyle } from '@/components/drills/progress';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import type { dashboardView, GroupBy, Period } from '@/lib/drills/progress/dashboard-store';
import { STATE_LABEL, enoughTrend } from '@/lib/drills/progress/dashboard';
import { OptionsMenu } from '@/components/brand/options-menu';
import { Check, ChevronRight } from 'lucide-react';
import { AppPage } from '@/components/brand/page';

const pct = (x: number | null) => (x === null ? '' : `${Math.round(x * 100)}%`);
// The readiness line's state for the plan's key (milestone) skills (rules: readiness.milestone_min_state).
const MILESTONE_STATE = DRILLS_CONFIG.rules.dashboard.readiness.milestone_min_state;
const PERIOD_TEXT: Record<string, string> = { '2w': 'Last 2 weeks', '4w': 'Last 4 weeks', all: 'All time' };

export type DashboardData = Awaited<ReturnType<typeof dashboardView>>;

// Your progress's screen; app/drills/progress/page.tsx loads its data. One
// job, how am I doing (Matt, 13 Nov): readiness first, the skill map, focus
// areas and strengths, and the rest folded into More detail.
export function ProgressScreen({ v, window, period, group, openDetail = false }: { v: DashboardData; window: number; period: Period; group: GroupBy; openDetail?: boolean }) {
  const dash = DRILLS_CONFIG.rules.dashboard;
  const params = { window: String(window), period, group };
  const header = <h1 className="t-title">Your progress</h1>;

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
          {/* Outline: Your progress has no main button (Matt, 13 Nov). */}
          {v.has_plan
            ? <Link href="/drills" className={buttonVariants({ variant: 'outline' })}>Start today&apos;s workout</Link>
            : <Link href="/drills/plan" className={buttonVariants({ variant: 'outline' })}>Get your plan</Link>}
        </section>
      </AppPage>
    );
  }

  const milestones = v.readiness.lines.find(l => l.key === 'milestones');
  const stateOf = new Map(v.groups.flatMap(g => g.skills.map(s => [s.id, s.state] as const)));
  const focus = (
    <section aria-labelledby="focus" className="space-y-2">
      <h2 id="focus" className="t-heading font-semibold">Focus areas</h2>
      {v.focus.length === 0
        ? <p className="t-small text-ink/70">Nothing flagged right now.</p>
        : (
          <ol className="space-y-2">
            {v.focus.map(f => (
              <li key={f.prescription_id} className="space-y-2 t-small rounded-window border border-ink/12 bg-white p-4">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/drills/progress/${encodeURIComponent(f.skill_id)}?from=focus`} className="font-medium underline-offset-4 hover:underline">{f.name}</Link>
                  {stateOf.has(f.skill_id) && <span className="text-ink/70">{STATE_LABEL[stateOf.get(f.skill_id)!]}</span>}
                </p>
                {f.live && <PrescriptionActions id={f.prescription_id} paused={false} extra={{ dashboard: 'focus' }} startLabel="Practice" />}
              </li>
            ))}
          </ol>
        )}
      <p className="t-label text-ink/70">In the order your workouts pick them.</p>
    </section>
  );
  const strengths = v.strengths.length > 0 && (
    <section aria-labelledby="strengths" className="space-y-2">
      <h2 id="strengths" className="t-heading font-semibold">Strengths</h2>
      <ol className="space-y-2">
        {v.strengths.map(s => (
          <li key={s.id} className="t-small rounded-window border border-ink/12 bg-white p-4">
            <Link href={`/drills/progress/${encodeURIComponent(s.id)}?from=strengths`} className="font-medium underline-offset-4 hover:underline">{s.name}</Link>
            <span className="block text-ink/70">{s.state}{s.score !== null && `, last score ${pct(s.score)}`}</span>
          </li>
        ))}
      </ol>
      <Source from="drills" />
    </section>
  );
  const trend = (spec: Parameters<typeof DrillChart>[0]['spec'], kind: 'states' | 'gapped') => (
    <div className="space-y-1">
      {enoughTrend(spec, kind)
        ? <DrillChart spec={spec} />
        : <p className="t-small rounded-window border border-dashed border-ink/20 p-4 text-ink/70"><span className="font-semibold text-ink">{spec.title}</span> · Appears after 2 weeks of practice</p>}
      <Source from="drills" />
    </div>
  );

  return (
    <AppPage width="wide" className="space-y-10">
      {header}

      <section id="ready" aria-labelledby="ready-h" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
        <div className="space-y-1">
          <h2 id="ready-h" className="t-heading font-semibold">Interview readiness: {v.readiness.status}</h2>
          {milestones && <p className="t-small text-ink/70">{milestones.detail} key skills in your plan {MILESTONE_STATE === 'mastered' ? 'mastered' : `at ${STATE_LABEL[MILESTONE_STATE]} or above`}</p>}
        </div>
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

      <section aria-labelledby="map" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="map" className="t-heading font-semibold">Skill map</h2>
          <OptionsMenu label="View options">
            <ViewToggle label="Group by" name="group" current={group} params={params}
              options={[{ value: 'area', text: 'Skill area' }, { value: 'stage', text: 'Interview stage' }]} />
            <ViewToggle label="Skill-map arrows cover" name="period" current={period} params={params}
              options={Object.keys(dash.periods_days).map(p => ({ value: p, text: PERIOD_TEXT[p] ?? p }))} />
          </OptionsMenu>
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
        <p className="t-label text-ink/70">↑ improving · → steady · ↓ slipping · no arrow: not enough sets yet.</p>
        <Source from="drills" />
      </section>

      {/* Strengths beside the focus areas once there are some; before that, one line (Matt, 13 Nov). */}
      {strengths
        ? <div className="grid gap-6 md:grid-cols-2">{focus}{strengths}</div>
        : <div className="space-y-4">{focus}<p className="t-small text-ink/70">Skills appear here once you reach Practiced.</p></div>}

      <details open={openDetail} className="group rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
        <summary className="t-heading flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />More detail
        </summary>
        <div className="mt-6 space-y-8">
          <section aria-labelledby="summary" className="space-y-3">
            <h3 id="summary" className="sr-only">Summary</h3>
            <ViewToggle label="This summary compares" name="window" current={String(window)} params={params}
              options={dash.compare_windows_days.map(d => ({ value: String(d), text: d === 7 ? 'This week with last week' : `Last ${d} days with the ${d} before` }))} />
            <p className="t-body font-semibold">{v.summary.sentence}</p>
            <p className="t-small">{v.counts.mastered} of {v.counts.live} skills at Mastered or above</p>
            <Source from="both" />
          </section>
          <section aria-labelledby="trends" className="space-y-4">
            <h3 id="trends" className="t-card font-semibold">Trends</h3>
            <div className="grid gap-6 lg:grid-cols-2">
              {trend(v.trends.states, 'states')}
              {trend(v.trends.misses, 'gapped')}
              {trend(v.trends.pace, 'gapped')}
              <div className="space-y-1">
                {v.trends.rubric.length
                  ? v.trends.rubric.map(spec => <DrillChart key={spec.title} spec={spec} />)
                  : <p className="t-small text-ink/70">{v.case_data ? 'Case ratings appear once you have 2 different full cases at the same tier.' : 'Case ratings appear here once your full cases reach your training.'}</p>}
                <Source from="cases" />
              </div>
            </div>
          </section>
          {v.history.length > 0 && (
            <section aria-labelledby="activity" className="space-y-2">
              <h3 id="activity" className="t-card font-semibold">Recent activity</h3>
              <ul className="space-y-1 t-small">
                {v.history.map((h, i) => <li key={i}>{h.date}: {h.text}{h.score !== null && `, ${pct(h.score)}`}</li>)}
              </ul>
            </section>
          )}
        </div>
      </details>
    </AppPage>
  );
}
