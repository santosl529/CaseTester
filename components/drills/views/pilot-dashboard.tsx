import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppPage } from '@/components/brand/page';
import { RUBRIC_DIMENSION_LABELS } from '@/lib/scoring/rubric';
import { TARGETS, statusOf, weekName, type Ratio, type Status, type WeeklyDashboard } from '@/lib/drills/reports/weekly';

// The pilot dashboard (Matt, 22 Nov 2026): one weekly page for the founders. Five tiles for the last full week, then
// the sections week by week. Every percentage shows its count; no answers or transcripts. The older drills detail is
// the Details tab. Numbers: lib/drills/reports/weekly.ts.

const pct = (r: Ratio | { value: number | null }) => (r.value === null ? '—' : `${Math.round(r.value * 100)}%`);
const count = (r: Ratio) => `${r.n} of ${r.of}`;
const both = (r: Ratio) => (r.of === 0 ? '—' : `${pct(r)} (${count(r)})`);
const num = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));
const usd = (v: number | null) => (v === null ? '—' : `$${v.toFixed(2)}`);
const STATUS_TEXT: Record<Status, string> = { green: 'On target', amber: 'Close', red: 'Below target', none: 'No data yet' };
const STATUS_DOT: Record<Status, string> = { green: 'bg-mastery', amber: 'bg-caution', red: 'bg-alert', none: 'bg-ink/25' };
const STATUS_EDGE: Record<Status, string> = { green: 'border-t-mastery', amber: 'border-t-caution', red: 'border-t-alert', none: 'border-t-ink/20' };

function change(now: number | null, before: number | null, unit: 'pts' | 'num'): string {
  if (now === null || before === null) return 'no change to show';
  const d = unit === 'pts' ? Math.round((now - before) * 100) : Math.round((now - before) * 10) / 10;
  if (d === 0) return 'no change since last week';
  return `${d > 0 ? '↑' : '↓'} ${Math.abs(d)}${unit === 'pts' ? ' pts' : ''} since last week`;
}

function Tile({ title, value, detail, target, status, delta, extra }: {
  title: string; value: string; detail: string; target: string; status: Status; delta: string; extra?: ReactNode;
}) {
  return (
    <section aria-label={title} className={`space-y-2 rounded-panel border border-t-4 border-ink/12 bg-white p-4 shadow-quiet ${STATUS_EDGE[status]}`}>
      <div className="space-y-0.5">
        <h3 className="t-body font-semibold">{title}</h3>
        <span className="t-label inline-flex items-center gap-1.5 whitespace-nowrap text-ink/80"><span aria-hidden="true" className={`size-2.5 rounded-full ${STATUS_DOT[status]}`} />{STATUS_TEXT[status]}</span>
      </div>
      <p className="t-title tabular-nums">{value}</p>
      <p className="t-small tabular-nums">{detail}</p>
      <p className="t-label text-ink/70">Target {target} · {delta}</p>
      {extra && <p className="t-label text-ink/80">{extra}</p>}
    </section>
  );
}

function Section({ id, title, how, children }: { id: string; title: string; how: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="t-heading font-semibold">{title}</h2>
      <p className="t-small text-ink/70">{how}</p>
      {children}
    </section>
  );
}

// A week-by-week table that scrolls inside its own box on a phone.
function WeekTable({ label, weeks, rows }: { label: string; weeks: string[]; rows: { name: string; cells: string[] }[] }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-panel border border-ink/12 bg-white">
      <table className="t-small w-full border-collapse">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="text-left text-ink/70">
            <th scope="col" className="sticky left-0 bg-white px-3 py-2 font-medium"><span className="sr-only">Measure</span></th>
            {weeks.map(w => <th key={w} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{weekName(w)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-t border-ink/10">
              <th scope="row" className="sticky left-0 bg-white px-3 py-2 text-left font-medium whitespace-nowrap">{r.name}</th>
              {r.cells.map((c, i) => <td key={i} className="whitespace-nowrap px-3 py-2 tabular-nums">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PilotDashboard({ d, orgs, org, from, to, detailsHref }: {
  d: WeeklyDashboard; orgs: string[]; org: string | null; from: string; to: string; detailsHref: string;
}) {
  const t = d.tiles, p = d.prev;
  const weeks = d.weeks;
  return (
    <AppPage width="wide" className="space-y-10">
      <header className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="t-title">Pilot dashboard</h1>
          <nav aria-label="Report views" className="t-small flex gap-4">
            <span aria-current="page" className="font-semibold">Overview</span>
            <Link href={detailsHref} className="link">Details</Link>
          </nav>
        </div>
        <form className="t-small flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-ink/70">Club</span>
            <select name="org" defaultValue={org ?? ''} className="h-9 rounded-field border border-ink/20 bg-white px-2">
              <option value="">All clubs</option>
              {orgs.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-ink/70">From</span>
            <input type="date" name="from" defaultValue={from} className="h-9 rounded-field border border-ink/20 bg-white px-2" />
          </label>
          <label className="space-y-1">
            <span className="block text-ink/70">To</span>
            <input type="date" name="to" defaultValue={to} className="h-9 rounded-field border border-ink/20 bg-white px-2" />
          </label>
          <button type="submit" className="h-9 cursor-pointer rounded-full border border-ink px-4 font-medium transition-colors hover:border-cobalt hover:text-cobalt motion-reduce:transition-none">Show</button>
        </form>
        <p className="t-small text-ink/70">
          Weeks run Monday to Sunday, US Eastern. Real students only: not the test clubs, the evaluation accounts or the founders.
          {d.focus ? ` The tiles show the week of ${weekName(d.focus)}, the last full week, against the week before.` : ' No full week in this range yet.'}
        </p>
      </header>

      {t && p && (
        <section aria-labelledby="tiles-h" className="space-y-3">
          <h2 id="tiles-h" className="sr-only">This week</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Tile title="Start" value={pct(t.start)} detail={`${count(t.start)} activated within 7 days`} target="50%"
              status={statusOf(t.start.value, TARGETS.start)} delta={change(t.start.value, p.start.value, 'pts')}
              extra={`Finished a first case: ${both(t.start.firstCase)}`} />
            <Tile title="Come back" value={pct(t.comeBack)} detail={`${count(t.comeBack)} active in week 4`} target="30%"
              status={statusOf(t.comeBack.value, TARGETS.comeBack)} delta={change(t.comeBack.value, p.comeBack.value, 'pts')} />
            <Tile title="Use" value={t.use.value === null ? '—' : `${num(t.use.value)} days`} detail={`practice days per active student (${t.use.students} active)`} target="2 or more"
              status={statusOf(t.use.value, TARGETS.use)} delta={change(t.use.value, p.use.value, 'num')}
              extra={`Cases per student: ${num(t.use.casesPerStudent)} (${t.use.cases} cases)`} />
            <Tile title="Improve" value={pct(t.improve)} detail={`${count(t.improve)} flagged skills practised, not flagged again`} target="50%"
              status={statusOf(t.improve.value, TARGETS.improve)} delta={change(t.improve.value, p.improve.value, 'pts')} />
            <Tile title="Value" value={num(t.value.value)} detail={`“How useful”, 1–5 (${t.value.n} ratings)`} target="4.0"
              status={statusOf(t.value.value, TARGETS.value)} delta={change(t.value.value, p.value.value, 'num')}
              extra={`Realism: ${num(t.value.realism)}`} />
          </div>
        </section>
      )}

      <Section id="funnel-h" title="Funnel" how="Students who signed up in the range, and how far each got (ever).">
        <ol className="t-small grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {d.funnel.map(f => (
            <li key={f.step} className="rounded-panel border border-ink/12 bg-white p-3">
              <span className="block text-ink/70">{f.step}</span>
              <span className="t-body font-semibold tabular-nums">{f.step === 'Signed up' ? f.n : both(f)}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="cohorts-h" title="Weekly cohorts" how="By sign-up week: the share active (a drill set finished or a case started) in each of their first four weeks. Blank until that week is over.">
        <div role="region" aria-label="Cohorts by sign-up week" tabIndex={0} className="overflow-x-auto rounded-panel border border-ink/12 bg-white">
          <table className="t-small w-full border-collapse">
            <caption className="sr-only">Active share by week since sign-up, for each sign-up week</caption>
            <thead><tr className="text-left text-ink/70">
              <th scope="col" className="px-3 py-2 font-medium">Signed up</th><th scope="col" className="px-3 py-2 font-medium">Students</th>
              {[1, 2, 3, 4].map(k => <th key={k} scope="col" className="px-3 py-2 font-medium">Week {k}</th>)}
            </tr></thead>
            <tbody>
              {d.cohorts.filter(c => c.n > 0).map(c => (
                <tr key={c.week} className="border-t border-ink/10">
                  <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">{weekName(c.week)}</th>
                  <td className="px-3 py-2 tabular-nums">{c.n}</td>
                  {c.weeks.map((r, i) => <td key={i} className="whitespace-nowrap px-3 py-2 tabular-nums">{r ? both(r) : '—'}</td>)}
                </tr>
              ))}
              {d.cohorts.every(c => c.n === 0) && <tr><td colSpan={6} className="px-3 py-3 text-ink/70">No sign-ups in this range.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="traffic-h" title="Website traffic" how="Page views, logged-out visitors (a daily anonymous code) and logged-in students. A session ends after 30 minutes without a page view; its length runs from the first view to the last, so a one-page session counts as 0 minutes.">
        <WeekTable label="Website traffic by week" weeks={weeks} rows={[
          { name: 'Page views', cells: d.traffic.map(x => String(x.views)) },
          { name: 'Visitors, logged out', cells: d.traffic.map(x => String(x.visitors)) },
          { name: '…of whom signed up', cells: d.traffic.map(x => (x.visitors ? `${x.visitorsWhoSignedUp} of ${x.visitors}` : '—')) },
          { name: 'Students, logged in', cells: d.traffic.map(x => String(x.students)) },
          { name: 'Sessions', cells: d.traffic.map(x => String(x.sessions)) },
          { name: 'Avg session (min)', cells: d.traffic.map(x => num(x.avgSessionMinutes)) },
          { name: 'Pages per session', cells: d.traffic.map(x => num(x.pagesPerSession)) },
        ]} />
        <div className="t-small space-y-1">
          <h3 className="font-semibold">Top pages{d.focus ? `, week of ${weekName(d.focus)}` : ''}</h3>
          {d.topPages.length ? (
            <ol className="space-y-0.5">{d.topPages.map(x => <li key={x.path} className="tabular-nums"><code>{x.path}</code> · {x.views}</li>)}</ol>
          ) : <p className="text-ink/70">No page views yet.</p>}
        </div>
      </Section>

      <Section id="learning-h" title="Learning" how="Skills reaching each state that week; and, for each full case at the same level as the student's previous one (not a retake, not ended early), how each dimension moved, shown as up / same / down.">
        <WeekTable label="Skills reaching each state, by week" weeks={weeks} rows={[
          { name: '→ Practiced', cells: d.learning.map(x => String(x.practiced)) },
          { name: '→ Mastered', cells: d.learning.map(x => String(x.mastered)) },
          { name: '→ Validated', cells: d.learning.map(x => String(x.validated)) },
        ]} />
        <WeekTable label="Case to case by dimension, by week (up / same / down)" weeks={weeks}
          rows={[...new Set(d.learning.flatMap(x => Object.keys(x.dimensions)))].sort().map(dim => ({
            name: RUBRIC_DIMENSION_LABELS[dim as keyof typeof RUBRIC_DIMENSION_LABELS] ?? dim, cells: d.learning.map(x => (x.dimensions[dim] ? `${x.dimensions[dim].up} / ${x.dimensions[dim].same} / ${x.dimensions[dim].down}` : '—')),
          }))} />
      </Section>

      <Section id="steps-h" title="Next steps follow-through" how="Skills listed on reports that week: clicked, practised, and whether the skill's dimension went up in the student's next case at the same level (of those with one).">
        <WeekTable label="Next steps follow-through by week" weeks={weeks} rows={[
          { name: 'Shown', cells: d.nextSteps.map(x => String(x.shown)) },
          { name: 'Clicked', cells: d.nextSteps.map(x => both(x.clicked)) },
          { name: 'Practised', cells: d.nextSteps.map(x => both(x.practiced)) },
          { name: 'Dimension improved', cells: d.nextSteps.map(x => both(x.improved)) },
        ]} />
      </Section>

      <Section id="reliability-h" title="Reliability" how={`Cases started that week and how many finished; voice sessions with a failure (blocked microphone, no connection, no interviewer, dropped); Sentry errors (every user) per active student${d.sentryAvailable ? '' : ' — Sentry could not be read'}; answers grading gave up on or jobs stuck over 15 minutes; "My grade seems unfair" reports per 100 graded answers.`}>
        <WeekTable label="Reliability by week" weeks={weeks} rows={[
          { name: 'Cases finished', cells: d.reliability.map(x => both(x.cases)) },
          { name: 'Voice sessions failed', cells: d.reliability.map(x => both(x.voiceFailed)) },
          { name: 'Errors per active student', cells: d.reliability.map(x => (x.errors === null ? '—' : `${num(x.errorsPerStudent)} (${x.errors} ${x.errors === 1 ? 'error' : 'errors'})`)) },
          { name: 'Stuck grading', cells: d.reliability.map(x => String(x.stuckGrading)) },
          { name: 'Disputes per 100 graded', cells: d.reliability.map(x => (x.disputesPer100.graded ? `${num(x.disputesPer100.per100)} (${x.disputesPer100.disputes} of ${x.disputesPer100.graded})` : '—')) },
        ]} />
      </Section>

      <Section id="cost-h" title="Cost" how="AI cost per active student per month, over the four weeks ending each week (scaled to 30 days). Drills grading against the $1.25 budget; cases (interview, grading, tagging) separately, with no target: they count against the case limits. Speech (voice) isn't included.">
        <WeekTable label="Cost per active student per month, by week" weeks={weeks} rows={[
          { name: 'Drills (of $1.25)', cells: d.cost.map(x => (x.drills === null ? '—' : `${usd(x.drills)}${x.drills > 1.25 ? ' — over' : ''}`)) },
          { name: 'Cases', cells: d.cost.map(x => usd(x.cases)) },
          { name: 'Active students', cells: d.cost.map(x => String(x.students)) },
        ]} />
      </Section>

      <Section id="reach-h" title="Reach" how="Sign-ups and active students by club. Wrong club codes typed (every club; there is no account to filter by): a sign of word of mouth beyond the invited clubs.">
        <WeekTable label="Reach by club and week (sign-ups · active)" weeks={weeks} rows={[
          ...d.reach.clubs.map(c => ({ name: c.org, cells: c.weeks.map(x => `${x.signUps} · ${x.active}`) })),
          { name: 'Wrong club codes', cells: d.reach.wrongCodes.map(String) },
        ]} />
      </Section>

      <Section id="limits-h" title="Limits" how="Of the students who started a case or hit a limit that week, the share who hit the daily or the monthly case limit.">
        <WeekTable label="Case limits hit, by week" weeks={weeks} rows={[
          { name: 'Daily limit', cells: d.limits.map(x => both(x.daily)) },
          { name: 'Monthly limit', cells: d.limits.map(x => both(x.monthly)) },
        ]} />
      </Section>

      <Section id="comments-h" title="Latest comments" how="The last 10 messages from the Feedback button and the first-case check-in: the text, where it was sent and when. Never who.">
        {d.comments.length ? (
          <ul className="space-y-2">
            {d.comments.map((c, i) => (
              <li key={i} className="t-small rounded-panel border border-ink/12 bg-white p-3">
                <p>{c.text}</p>
                <p className="t-label text-ink/70">{c.where} · {c.at.toISOString().slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="t-small text-ink/70">No comments yet.</p>}
      </Section>
    </AppPage>
  );
}
