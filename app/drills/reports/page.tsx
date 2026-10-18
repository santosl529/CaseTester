import Link from 'next/link';
import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { reportsPageEnabled } from '@/lib/drills/review';
import { buildReports, listOrgs, TEST_ORGS } from '@/lib/drills/reports';
import { getSkill } from '@/lib/drills/config';
import { FEED_TYPES, feedbackReports, loadFeedback } from '@/lib/drills/reports/feedback';

// The pilot reports (docs/prd-drills.md "MVP reports"), local development
// only: every student's data from the database the dev server points at.
// Flagged items come first, for Matt to pull by hand during the pilot.
const PERIODS = [7, 28, 90] as const;
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
const num = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? '–' : x.toFixed(d));
const usd = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `$${x.toFixed(2)}`);
const skillName = (id: string) => { try { return getSkill(id).name; } catch { return id; } };

function Section({ id, title, how, children }: { id: string; title: string; how: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{how}</p>
      {children}
    </section>
  );
}

function Table({ head, rows, caption }: { head: string[]; rows: (string | number)[][]; caption: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map(h => <th key={h} scope="col" className="border-b px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (j === 0
              ? <th key={j} scope="row" className="border-b px-2 py-1 text-left font-normal">{c}</th>
              : <td key={j} className="border-b px-2 py-1 tabular-nums">{c}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ org?: string; days?: string; type?: string; page?: string }> }) {
  if (!reportsPageEnabled()) notFound();
  await studentOrRedirect();
  const q = await searchParams;
  const days = PERIODS.find(p => String(p) === q.days) ?? 28;
  const orgs = await listOrgs();
  // A test club (smokes, the accessibility audit) only when named in the URL.
  const org = q.org && (orgs.includes(q.org) || TEST_ORGS.includes(q.org)) ? q.org : null;
  const to = new Date();
  const r = await buildReports({ orgId: org, from: new Date(to.getTime() - days * 86_400_000), to });
  const flagged = r.item_health.items.filter(i => i.flags.length);
  const type = q.type && q.type in FEED_TYPES ? q.type : undefined;
  const fb = feedbackReports(await loadFeedback(org), { type, page: q.page || undefined });
  const date = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6">
      <header className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Pilot reports</h1>
          <Link href="/drills" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Training home</Link>
        </div>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-muted-foreground">Club</span>
            <select name="org" defaultValue={org ?? ''} className="rounded-md border bg-background px-2 py-1">
              <option value="">All clubs</option>
              {orgs.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-muted-foreground">Period</span>
            <select name="days" defaultValue={String(days)} className="rounded-md border bg-background px-2 py-1">
              {PERIODS.map(p => <option key={p} value={p}>Last {p} days</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md border px-3 py-1 font-medium hover:bg-muted">Show</button>
        </form>
        <p className="text-sm text-muted-foreground">{r.students} students. Funnels, mastery and transfer cover all time; activity and cost cover the period.</p>
      </header>

      <p role={r.cost_alert.alert ? 'alert' : undefined}
        className={`rounded-lg border p-3 text-sm ${r.cost_alert.alert ? 'border-destructive font-medium text-destructive' : ''}`}>
        {r.cost_alert.alert ? 'Cost alert: ' : 'Grading cost, last 7 days: '}
        {usd(r.cost_alert.per_student_month)} per active student per month, against a {usd(r.cost_alert.budget)} budget.
        {r.cost_alert.alert && ' That is more than 25% over budget.'}
      </p>

      <Section id="flagged" title={`Items to review (${flagged.length} flagged, ${fb.reported.length} reported)`} how={r.item_health.how}>
        <h3 className="text-sm font-medium">Flagged by their numbers</h3>
        <Table caption="Flagged items" head={['Item', 'Drill', 'Attempts', 'Correct', 'Avg time', 'Flags']}
          rows={flagged.map(i => [i.item, i.drill_id ?? '–', i.attempts, pct(i.correct_rate), `${num(i.avg_time_s, 0)} s`, i.flags.join('; ')])} />
        <h3 className="pt-2 text-sm font-medium">Reported by students</h3>
        <Table caption="Reported items" head={['Item', 'Drill', 'Reports', 'Open', 'Reasons', 'Latest comment']}
          rows={fb.reported.map(i => [i.item, i.drill_id, i.reports, i.open, Object.entries(i.reasons).map(([k, n]) => `${k} ×${n}`).join('; '), i.latest ?? '–'])} />
        <p className="text-xs text-muted-foreground">Review and label reports in the <Link href="/drills/review/reports" className="underline underline-offset-4">review queue</Link>.</p>
        <p className="text-xs text-muted-foreground">To pull an item: set its <code>&quot;status&quot;</code> to <code>&quot;in_review&quot;</code> in <code>drill-items/&lt;drill&gt;/&lt;item&gt;.json</code>, then run <code>npm run db:seed-drill-items</code>.</p>
      </Section>

      <Section id="feedback" title="Feedback" how="The feedback button, item reports and answered check-ins, newest first (latest 100). The club filter above applies.">
        <form className="flex flex-wrap items-end gap-3 text-sm">
          {org && <input type="hidden" name="org" value={org} />}
          <input type="hidden" name="days" value={days} />
          <label className="space-y-1">
            <span className="block text-muted-foreground">Type</span>
            <select name="type" defaultValue={type ?? ''} className="rounded-md border bg-background px-2 py-1">
              <option value="">All types</option>
              {Object.entries(FEED_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-muted-foreground">Page</span>
            <select name="page" defaultValue={q.page ?? ''} className="rounded-md border bg-background px-2 py-1">
              <option value="">All pages</option>
              {fb.feed.pages.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md border px-3 py-1 font-medium hover:bg-muted">Filter</button>
        </form>
        <p className="text-sm text-muted-foreground">{fb.feed.total} entries{fb.feed.total > fb.feed.entries.length ? `, showing the latest ${fb.feed.entries.length}` : ''}.</p>
        <Table caption="Feedback" head={['When', 'Type', 'Page', 'Item', 'Comment', 'Club']}
          rows={fb.feed.entries.map(e => [date(e.at), e.detail, e.page, e.item ?? '–', e.comment ?? '–', e.club ?? '–'])} />
        <h3 className="pt-2 text-sm font-medium">How useful was today’s practice? (1–5, by week)</h3>
        <Table caption="Check-in average by week" head={['Week of', 'Answers', 'Average', 'Dismissed']}
          rows={fb.weeks.map(w => [w.week, w.answered, num(w.average), w.dismissed])} />
      </Section>

      <Section id="loop" title="Loop funnel" how={r.loop_funnel.how}>
        <p className="text-sm">{r.loop_funnel.cases_taken} cases taken.</p>
        <Table caption="Loop funnel" head={['Step', 'Count', 'Of previous', 'Of first']}
          rows={r.loop_funnel.steps.map(s => [s.step, s.n, pct(s.of_previous), pct(s.of_first)])} />
      </Section>

      <Section id="plan-sources" title="How students got their plan" how={r.plan_sources.how}>
        <Table caption="Plan sources" head={['Source', 'Students']}
          rows={[['A full case', r.plan_sources.case], ['The diagnostic', r.plan_sources.diagnostic], ['The questionnaire', r.plan_sources.questionnaire], ['No plan yet', r.plan_sources.none]]} />
      </Section>

      <Section id="pauses" title={`Timer pauses (${r.pauses.total})`} how={r.pauses.how}>
        <Table caption="Timer pauses by student" head={['Student', 'Club', 'Pauses', 'Total paused', 'Longest', 'Reasons']}
          rows={r.pauses.students.map(p => [p.student.slice(0, 8), p.club ?? '–', p.pauses, `${Math.round(p.total_ms / 1000)} s`, `${Math.round(p.longest_ms / 1000)} s`, Object.entries(p.reasons).map(([k, n]) => `${k} ×${n}`).join(', ')])} />
      </Section>

      <Section id="program" title="Program funnel" how={r.program_funnel.how}>
        <Table caption="Program funnel" head={['Track', ...r.program_funnel.tracks.find(t => t.track === 'standard')!.steps.map(s => s.step)]}
          rows={r.program_funnel.tracks.map(t => [t.track, ...t.steps.map(s => s.n)])} />
      </Section>

      <Section id="effectiveness" title="Drill effectiveness" how={r.drill_effectiveness.how}>
        <Table caption="Drill effectiveness" head={['Skill', 'Mastered (n)', 'Before', 'After', 'Dismissed (n)', 'Before', 'After']}
          rows={r.drill_effectiveness.skills.map(s => [skillName(s.skill_id), s.mastered.n, num(s.mastered.before, 2), num(s.mastered.after, 2), s.dismissed.n, num(s.dismissed.before, 2), num(s.dismissed.after, 2)])} />
      </Section>

      <Section id="transfer" title="Transfer" how={r.transfer.how}>
        <p className="text-sm">Overall first-attempt pass rate: {pct(r.transfer.overall_pass_rate)}.</p>
        <Table caption="Transfer by skill" head={['Skill', 'First attempts', 'Pass rate', 'Passed practice, failed transfer']}
          rows={r.transfer.skills.map(s => [skillName(s.skill_id), s.first_attempts, pct(s.pass_rate), s.practiced_but_failed])} />
      </Section>

      <Section id="lessons" title="Lessons" how={r.lessons.how}>
        <Table caption="Lessons" head={['', 'Students', 'Next set score']}
          rows={[['Read the lesson', r.lessons.read.n, pct(r.lessons.read.next_set_score)], ['Skipped it', r.lessons.skipped.n, pct(r.lessons.skipped.next_set_score)]]} />
      </Section>

      <Section id="defend" title="Defend" how={r.defend.how}>
        <Table caption="Defend" head={['Drill', 'Type', 'Replies', 'Avg score', 'Right on valid challenges', 'Right on invalid challenges']}
          rows={r.defend.rows.map(d => [d.drill_id, d.type, d.n, pct(d.avg_score), `${pct(d.valid_challenge.right)} (${d.valid_challenge.n})`, `${pct(d.invalid_challenge.right)} (${d.invalid_challenge.n})`])} />
      </Section>

      <Section id="mix" title="Workout mix" how={r.workout_mix.how}>
        <Table caption="Workout mix" head={['Slot', 'Target', 'Planned', 'Actual', 'Actual minutes']}
          rows={r.workout_mix.slots.map(s => [s.slot, pct(s.target), pct(s.planned_share), pct(s.actual_share), s.actual_minutes])} />
      </Section>

      <Section id="stuck" title="Stuck rule" how={r.stuck_rule.how}>
        <Table caption="Stuck rule" head={['Skill', 'Fired', 'Passed after', 'Rate']}
          rows={r.stuck_rule.skills.map(s => [skillName(s.skill_id), s.fired, s.passed_after, pct(s.pass_rate)])} />
      </Section>

      <Section id="plan" title="Plan vs self-directed" how={r.plan_vs_self_directed.how}>
        <Table caption="Plan vs self-directed" head={['Group', 'Students', 'Sets per week', 'Skills mastered', 'Transfer pass rate', 'Rubric gain (n)']}
          rows={(['plan', 'self_directed'] as const).map(g => {
            const x = r.plan_vs_self_directed[g];
            return [g === 'plan' ? 'Plan' : 'Practice on my own', x.students, num(x.sets_per_student_per_week), num(x.skills_mastered_per_student), pct(x.transfer_pass_rate), `${num(x.rubric_gain.avg, 2)} (${x.rubric_gain.students})`];
          })} />
      </Section>

      <Section id="engagement" title="Engagement" how={r.engagement.how}>
        <Table caption="Engagement" head={['Active students', 'Sets per student per week', 'Returned within 7 days', 'Avg session']}
          rows={[[r.engagement.active_students, num(r.engagement.sets_per_active_student_per_week), pct(r.engagement.returned_within_7_days), `${num(r.engagement.avg_session_minutes)} min`]]} />
      </Section>

      <Section id="items" title="Item health" how={`${r.item_health.items.length} items answered in all. The flagged ones are listed at the top.`}>
        <Table caption="Most answered items" head={['Item', 'Drill', 'Attempts', 'Correct', 'Avg score', 'Avg time']}
          rows={r.item_health.items.slice(0, 25).map(i => [i.item, i.drill_id ?? '–', i.attempts, pct(i.correct_rate), pct(i.avg_score), `${num(i.avg_time_s, 0)} s`])} />
      </Section>

      <Section id="grading" title="Grading quality and cost" how={r.grading_cost.how}>
        <Table caption="Grading quality and cost" head={['Jobs', 'Failed', 'Retried', 'Cost', 'Graded answers', 'Per answer', 'Per workout', 'Per active student per month']}
          rows={[[r.grading_cost.jobs, pct(r.grading_cost.failure_rate), pct(r.grading_cost.retry_rate), usd(r.grading_cost.cost_usd), r.grading_cost.graded_answers,
            r.grading_cost.cost_per_graded_answer === null ? '–' : `$${r.grading_cost.cost_per_graded_answer.toFixed(4)}`, usd(r.grading_cost.cost_per_workout), usd(r.grading_cost.cost_per_active_student_month)]]} />
      </Section>

      <Section id="events" title="Event health" how={r.event_health.how}>
        <p className="text-sm">{Object.values(r.event_health.seen).reduce((a, b) => a + b, 0)} rows; {r.event_health.incomplete_count} missing a key property.</p>
        {r.event_health.incomplete.length > 0 && <ul className="list-disc pl-5 text-sm">{r.event_health.incomplete.slice(0, 10).map(l => <li key={l}>{l}</li>)}</ul>}
        <p className="text-sm text-muted-foreground">No rows yet: {r.event_health.not_seen.join(', ') || 'none'}.</p>
      </Section>
    </main>
  );
}
