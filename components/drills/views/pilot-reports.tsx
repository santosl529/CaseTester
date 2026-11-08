import Link from 'next/link';
import { AppPage } from '@/components/brand/page';
import { getSkill } from '@/lib/drills/config';
import type { Reports } from '@/lib/drills/reports';
import type { feedbackReports } from '@/lib/drills/reports/feedback';
import { FEED_TYPES } from '@/lib/drills/reports/feedback-compute';

const PERIODS = [7, 28, 90] as const;
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
const num = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? '–' : x.toFixed(d));
const usd = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `$${x.toFixed(2)}`);
const skillName = (id: string) => { try { return getSkill(id).name; } catch { return id; } };

function Section({ id, title, how, children }: { id: string; title: string; how: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="t-heading font-semibold">{title}</h2>
      <p className="t-label max-w-[80ch] text-ink/70">{how}</p>
      {children}
    </section>
  );
}

function Table({ head, rows, caption }: { head: string[]; rows: (string | number)[][]; caption: string }) {
  if (rows.length === 0) return <p className="t-small text-ink/70">No data yet.</p>;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-window border border-ink/12 bg-white">
      <table className="t-small w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead><tr className="bg-paper text-ink/70">{head.map(h => <th key={h} scope="col" className="border-b border-ink/12 px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (j === 0
              ? <th key={j} scope="row" className="border-b border-ink/10 px-3 py-2 text-left font-normal">{c}</th>
              : <td key={j} className="border-b border-ink/10 px-3 py-2 tabular-nums">{c}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The pilot reports' screen (local development only); app/drills/reports/page.tsx loads the data.
export function PilotReports({ r, fb, orgs, org, days, type, page }: {
  r: Reports; fb: ReturnType<typeof feedbackReports>; orgs: string[]; org: string | null; days: number; type: string | undefined; page: string | undefined;
}) {
  const q = { page };
  const flagged = r.item_health.items.filter(i => i.flags.length);
  const date = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

  return (
    <AppPage width="wide" className="space-y-12">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="t-title">Pilot reports</h1>
          <Link href="/drills" className="link t-small">Training home</Link>
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
            <span className="block text-ink/70">Period</span>
            <select name="days" defaultValue={String(days)} className="h-9 rounded-field border border-ink/20 bg-white px-2">
              {PERIODS.map(p => <option key={p} value={p}>Last {p} days</option>)}
            </select>
          </label>
          <button type="submit" className="h-9 cursor-pointer rounded-full border border-ink px-4 font-medium transition-colors hover:border-cobalt hover:text-cobalt motion-reduce:transition-none">Show</button>
        </form>
        <p className="t-small text-ink/70">{r.students} students. Funnels, mastery and transfer cover all time; activity and cost cover the period.</p>
      </header>

      <p role={r.cost_alert.alert ? 'alert' : undefined}
        className={`t-small rounded-panel border bg-white p-4 ${r.cost_alert.alert ? 'border-alert/50 font-semibold text-alert' : 'border-ink/12'}`}>
        {r.cost_alert.alert ? 'Cost alert: ' : 'Grading cost, last 7 days: '}
        {usd(r.cost_alert.per_student_month)} per active student per month, against a {usd(r.cost_alert.budget)} budget.
        {r.cost_alert.alert && ' That is more than 25% over budget.'}
        {' '}Today: {usd(r.spend_today.cost_usd)} of the {usd(r.spend_today.limit_usd)} daily limit (US Eastern day).
        {r.spend_today.paused === 'spend' && ' New written sets are paused for the rest of the day.'}
        {r.spend_today.paused === 'billing' && ' A spend-limit or billing error came back today: grading is stopped and new written sets are paused for the rest of the day.'}
      </p>

      <Section id="flagged" title={`Items to review (${flagged.length} flagged, ${fb.reported.length} reported)`} how={r.item_health.how}>
        <h3 className="t-small font-semibold">Flagged by their numbers</h3>
        <Table caption="Flagged items" head={['Item', 'Drill', 'Attempts', 'Correct', 'Avg time', 'Flags']}
          rows={flagged.map(i => [i.item, i.drill_id ?? '–', i.attempts, pct(i.correct_rate), `${num(i.avg_time_s, 0)} s`, i.flags.join('; ')])} />
        <h3 className="t-small pt-2 font-semibold">Reported by students</h3>
        <Table caption="Reported items" head={['Item', 'Drill', 'Reports', 'Open', 'Reasons', 'Latest comment']}
          rows={fb.reported.map(i => [i.item, i.drill_id, i.reports, i.open, Object.entries(i.reasons).map(([k, n]) => `${k} ×${n}`).join('; '), i.latest ?? '–'])} />
        <p className="t-label text-ink/70">Review and label reports in the <Link href="/drills/review/reports" className="link">review queue</Link>.</p>
        <p className="t-label text-ink/70">To pull an item: set its <code>&quot;status&quot;</code> to <code>&quot;in_review&quot;</code> in <code>drill-items/&lt;drill&gt;/&lt;item&gt;.json</code>, then run <code>npm run db:seed-drill-items</code>.</p>
      </Section>

      <Section id="feedback" title="Feedback" how="The feedback button, item reports and answered check-ins, newest first (latest 100). The club filter above applies.">
        <form className="t-small flex flex-wrap items-end gap-3">
          {org && <input type="hidden" name="org" value={org} />}
          <input type="hidden" name="days" value={days} />
          <label className="space-y-1">
            <span className="block text-ink/70">Type</span>
            <select name="type" defaultValue={type ?? ''} className="h-9 rounded-field border border-ink/20 bg-white px-2">
              <option value="">All types</option>
              {Object.entries(FEED_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-ink/70">Page</span>
            <select name="page" defaultValue={q.page ?? ''} className="h-9 rounded-field border border-ink/20 bg-white px-2">
              <option value="">All pages</option>
              {fb.feed.pages.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="submit" className="h-9 cursor-pointer rounded-full border border-ink px-4 font-medium transition-colors hover:border-cobalt hover:text-cobalt motion-reduce:transition-none">Filter</button>
        </form>
        <p className="t-small text-ink/70">{fb.feed.total} entries{fb.feed.total > fb.feed.entries.length ? `, showing the latest ${fb.feed.entries.length}` : ''}.</p>
        <Table caption="Feedback" head={['When', 'Type', 'Page', 'Item', 'Comment', 'Club']}
          rows={fb.feed.entries.map(e => [date(e.at), e.detail, e.page, e.item ?? '–', e.comment ?? '–', e.club ?? '–'])} />
        <h3 className="t-small pt-2 font-semibold">How useful was today’s practice? (1–5, by week)</h3>
        <Table caption="Check-in average by week" head={['Week of', 'Answers', 'Average', 'Dismissed']}
          rows={fb.weeks.map(w => [w.week, w.answered, num(w.average), w.dismissed])} />
      </Section>

      <Section id="loop" title="Loop funnel" how={r.loop_funnel.how}>
        <p className="t-small">{r.loop_funnel.cases_taken} cases taken.</p>
        <Table caption="Loop funnel" head={['Step', 'Count', 'Of previous', 'Of first']}
          rows={r.loop_funnel.steps.map(s => [s.step, s.n, pct(s.of_previous), pct(s.of_first)])} />
      </Section>

      <Section id="plan-sources" title="How students got their plan" how={r.plan_sources.how}>
        <Table caption="Plan sources" head={['Source', 'Students']}
          rows={[['A full case', r.plan_sources.case], ['The diagnostic', r.plan_sources.diagnostic], ['The questionnaire', r.plan_sources.questionnaire], ['No plan yet', r.plan_sources.none]]} />
      </Section>

      <Section id="feedback-timing" title="Feedback timing" how={r.feedback_modes.how}>
        <Table caption="Results by feedback mode" head={['Mode', 'Students', 'Sets', 'Completed', 'Average score', 'Passed']}
          rows={r.feedback_modes.modes.map(m => [m.mode === 'immediate' ? 'After each question' : 'At the end of the set', m.students, m.sets, pct(m.completion_rate), pct(m.avg_score), pct(m.pass_rate)])} />
        <p className="t-small">Immediate grading wait: {r.feedback_modes.immediate_wait_ms.answers} answers, p50 {r.feedback_modes.immediate_wait_ms.p50 === null ? '–' : `${(r.feedback_modes.immediate_wait_ms.p50 / 1000).toFixed(1)} s`}, p95 {r.feedback_modes.immediate_wait_ms.p95 === null ? '–' : `${(r.feedback_modes.immediate_wait_ms.p95 / 1000).toFixed(1)} s`}.</p>
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
        <p className="t-small">Overall first-attempt pass rate: {pct(r.transfer.overall_pass_rate)}.</p>
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
        <Table caption="Grading quality and cost" head={['Jobs', 'Failed', 'Retried', 'Requests (failed)', 'Cost', 'Graded answers', 'Not graded', 'Per answer', 'Per workout', 'Per active student per month']}
          rows={[[r.grading_cost.jobs, pct(r.grading_cost.failure_rate), pct(r.grading_cost.retry_rate), `${r.grading_cost.requests} (${r.grading_cost.failed_requests})`, usd(r.grading_cost.cost_usd), r.grading_cost.graded_answers, r.grading_cost.ungraded_answers,
            r.grading_cost.cost_per_graded_answer === null ? '–' : `$${r.grading_cost.cost_per_graded_answer.toFixed(4)}`, usd(r.grading_cost.cost_per_workout), usd(r.grading_cost.cost_per_active_student_month)]]} />
      </Section>

      <Section id="events" title="Event health" how={r.event_health.how}>
        <p className="t-small">{Object.values(r.event_health.seen).reduce((a, b) => a + b, 0)} rows; {r.event_health.incomplete_count} missing a key property.</p>
        {r.event_health.incomplete.length > 0 && <ul className="t-small list-disc pl-5">{r.event_health.incomplete.slice(0, 10).map(l => <li key={l}>{l}</li>)}</ul>}
        <p className="t-small text-ink/70">No rows yet: {r.event_health.not_seen.join(', ') || 'none'}.</p>
      </Section>
    </AppPage>
  );
}
