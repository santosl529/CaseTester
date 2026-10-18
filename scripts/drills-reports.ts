// The pilot reports in the terminal (lib/drills/reports).
//
//   npm run drills:reports                       every student, last 28 days
//   npm run drills:reports -- --org <club org id> --days 7
//   npm run drills:reports -- --json             the full data as JSON
import { buildReports, type Reports } from '@/lib/drills/reports';

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const days = Number(arg('--days') ?? 28);
const to = new Date();
const from = new Date(to.getTime() - days * 86_400_000);

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
const num = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? '–' : x.toFixed(d));
const usd = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `$${x.toFixed(2)}`);

function print(r: Reports) {
  const h = (title: string, how: string) => console.log(`\n## ${title}\n${how}`);
  console.log(`# Drills pilot reports\n${r.filter.org_id ?? 'all clubs'}, ${r.filter.from.slice(0, 10)} to ${r.filter.to.slice(0, 10)}, ${r.students} students`);
  console.log(r.cost_alert.alert
    ? `\n!! COST ALERT: ${usd(r.cost_alert.per_student_month)} per active student per month (last 7 days), budget ${usd(r.cost_alert.budget)}`
    : `\nCost (last 7 days): ${usd(r.cost_alert.per_student_month)} per active student per month, budget ${usd(r.cost_alert.budget)}`);

  h('Loop funnel', r.loop_funnel.how);
  console.log(`cases taken: ${r.loop_funnel.cases_taken}`);
  for (const s of r.loop_funnel.steps) console.log(`  ${s.step}: ${s.n} (${pct(s.of_first)} of first)`);

  h('Program funnel', r.program_funnel.how);
  for (const t of r.program_funnel.tracks) console.log(`  ${t.track}: ${t.steps.map(s => `${s.step} ${s.n}`).join(' → ')}`);

  h('Drill effectiveness', r.drill_effectiveness.how);
  if (!r.drill_effectiveness.skills.length) console.log('  no data yet');
  for (const s of r.drill_effectiveness.skills) console.log(`  ${s.skill_id}: mastered n=${s.mastered.n} ${num(s.mastered.before, 2)} → ${num(s.mastered.after, 2)}; dismissed n=${s.dismissed.n} ${num(s.dismissed.before, 2)} → ${num(s.dismissed.after, 2)}`);

  h('Transfer', r.transfer.how);
  console.log(`  overall first-attempt pass rate: ${pct(r.transfer.overall_pass_rate)}`);
  for (const s of r.transfer.skills) console.log(`  ${s.skill_id}: ${pct(s.pass_rate)} of ${s.first_attempts}; ${s.practiced_but_failed} passed practice but failed transfer`);

  h('Lessons', r.lessons.how);
  console.log(`  read: n=${r.lessons.read.n}, next set ${pct(r.lessons.read.next_set_score)}; skipped: n=${r.lessons.skipped.n}, next set ${pct(r.lessons.skipped.next_set_score)}`);

  h('Defend', r.defend.how);
  if (!r.defend.rows.length) console.log('  no data yet');
  for (const d of r.defend.rows) console.log(`  ${d.drill_id} ${d.type}: n=${d.n}, avg ${pct(d.avg_score)}; valid challenge right ${pct(d.valid_challenge.right)} (n=${d.valid_challenge.n}), invalid right ${pct(d.invalid_challenge.right)} (n=${d.invalid_challenge.n})`);

  h('Workout mix', r.workout_mix.how);
  for (const s of r.workout_mix.slots) console.log(`  ${s.slot}: target ${pct(s.target)}, planned ${pct(s.planned_share)}, actual ${pct(s.actual_share)} (${s.actual_minutes} min)`);

  h('Stuck rule', r.stuck_rule.how);
  if (!r.stuck_rule.skills.length) console.log('  never fired');
  for (const s of r.stuck_rule.skills) console.log(`  ${s.skill_id}: fired ${s.fired}, passed after ${s.passed_after} (${pct(s.pass_rate)})`);

  h('Plan vs self-directed', r.plan_vs_self_directed.how);
  for (const g of ['plan', 'self_directed'] as const) {
    const x = r.plan_vs_self_directed[g];
    console.log(`  ${g}: ${x.students} students, ${num(x.sets_per_student_per_week)} sets/week, ${num(x.skills_mastered_per_student)} skills mastered, transfer ${pct(x.transfer_pass_rate)}, rubric gain ${num(x.rubric_gain.avg, 2)} (n=${x.rubric_gain.students})`);
  }

  h('Engagement', r.engagement.how);
  const e = r.engagement;
  console.log(`  ${e.active_students} active students, ${num(e.sets_per_active_student_per_week)} sets/week each, ${pct(e.returned_within_7_days)} returned within 7 days, sessions ${num(e.avg_session_minutes)} min`);

  h('Item health', r.item_health.how);
  const flagged = r.item_health.items.filter(i => i.flags.length);
  console.log(`  ${r.item_health.items.length} items answered, ${flagged.length} flagged`);
  for (const i of flagged.slice(0, 30)) console.log(`  ${i.item}: ${i.attempts} attempts, ${pct(i.correct_rate)} correct — ${i.flags.join('; ')}`);

  h('Grading quality and cost', r.grading_cost.how);
  const g = r.grading_cost;
  console.log(`  ${g.jobs} jobs, ${pct(g.failure_rate)} failed, ${pct(g.retry_rate)} retried; ${usd(g.cost_usd)} for ${g.graded_answers} graded answers  (${g.cost_per_graded_answer === null ? '–' : `$${g.cost_per_graded_answer.toFixed(4)}`} each, ${usd(g.cost_per_workout)} per workout); ${usd(g.cost_per_active_student_month)} per active student per month`);

  h('Event health', r.event_health.how);
  console.log(`  ${Object.values(r.event_health.seen).reduce((a, b) => a + b, 0)} rows, ${r.event_health.incomplete_count} missing a key property`);
  for (const line of r.event_health.incomplete.slice(0, 10)) console.log(`  ${line}`);
  console.log(`  no rows yet: ${r.event_health.not_seen.join(', ') || 'none'}`);
}

buildReports({ orgId: arg('--org') ?? null, from, to })
  .then(r => {
    if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else print(r);
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
