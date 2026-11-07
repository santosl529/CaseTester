import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { logDrillEvent } from '@/lib/drills/events';
import { dashboardView, type GroupBy, type Period } from '@/lib/drills/progress/dashboard-store';
import { ProgressScreen } from '@/components/drills/views/progress';

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

  return <ProgressScreen v={v} window={window} period={period} group={group} />;
}
