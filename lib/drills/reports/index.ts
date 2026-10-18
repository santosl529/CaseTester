// The pilot reports in one call (docs/prd-drills.md "MVP reports"), plus the
// cost alert ("Monitoring") and event health (D6 "all events firing").
import 'server-only';
import { auditEventRows, missingEvents } from '../event-audit';
import {
  costAlert, defend, drillEffectiveness, engagement, gradingCost, itemHealth, lessons, loopFunnel, planVsSelf, programFunnel, stuckRule,
  transfer, workoutMix,
} from './compute';
import { loadEventRows, loadReportData, type ReportFilter } from './data';

export type { ReportFilter } from './data';
export { listOrgs, TEST_ORGS } from './data';

export async function buildReports(filter: ReportFilter) {
  const data = await loadReportData(filter);
  const audit = auditEventRows(await loadEventRows(filter, data.students.map(s => s.id)));
  return {
    filter: { org_id: filter.orgId ?? null, from: filter.from.toISOString(), to: filter.to.toISOString() },
    students: data.students.length,
    cost_alert: costAlert(data),
    loop_funnel: loopFunnel(data),
    program_funnel: programFunnel(data),
    drill_effectiveness: drillEffectiveness(data),
    transfer: transfer(data),
    lessons: lessons(data),
    defend: defend(data),
    workout_mix: workoutMix(data),
    stuck_rule: stuckRule(data),
    plan_vs_self_directed: planVsSelf(data),
    engagement: engagement(data),
    item_health: itemHealth(data),
    grading_cost: gradingCost(data),
    event_health: {
      how: 'Drills events logged in the range: rows per event, rows missing a key property, and events with no rows yet.',
      seen: Object.fromEntries(audit.seen),
      incomplete: audit.incomplete.slice(0, 50),
      incomplete_count: audit.incomplete.length,
      not_seen: missingEvents(audit.seen),
    },
  };
}

export type Reports = Awaited<ReturnType<typeof buildReports>>;
