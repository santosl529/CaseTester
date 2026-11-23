import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reportsPageEnabled } from '@/lib/drills/review';
import { reportsAllowedFor } from '@/lib/drills/reports/access';
import { loadCaseSide } from '@/lib/drills/reports/case-side-load';
import { buildReports, listOrgs, TEST_ORGS } from '@/lib/drills/reports';
import { FEED_TYPES, feedbackReports, loadFeedback } from '@/lib/drills/reports/feedback';
import { PilotReports } from '@/components/drills/views/pilot-reports';
import { PilotDashboard } from '@/components/drills/views/pilot-dashboard';
import { buildWeeklyDashboard } from '@/lib/drills/reports/weekly-load';

// The pilot reports (docs/prd-drills.md "MVP reports"): every student's data. In production only for the founder
// accounts in REPORTS_ALLOWED_EMAILS, checked here on the server; anyone else gets a 404 (Matt, 17 Nov, pre-pilot audit
// M6). The case side (interviews, the survey, sign-ups, activation) comes first, then the drills.
const PERIODS = [7, 28, 90] as const;

// The weekly overview (Matt, 22 Nov 2026: the pilot dashboard) is the default; ?tab=details is the earlier drills detail.
const DAY_MS = 86_400_000;
const isDay = (s: string | undefined): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ org?: string; days?: string; type?: string; page?: string; tab?: string; from?: string; to?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !reportsAllowedFor(user.email)) notFound();
  const q = await searchParams;
  const days = PERIODS.find(p => String(p) === q.days) ?? 28;
  const orgs = await listOrgs();
  // A test club (smokes, the accessibility audit) only when named in the URL.
  const org = q.org && (orgs.includes(q.org) || TEST_ORGS.includes(q.org)) ? q.org : null;
  if (q.tab !== 'details') {
    const now = new Date();
    const to = isDay(q.to) ? new Date(Date.parse(q.to) + DAY_MS) : now;
    const from = isDay(q.from) ? new Date(Date.parse(q.from)) : new Date(to.getTime() - 56 * DAY_MS);
    const d = await buildWeeklyDashboard({ orgId: org, from, to: to < from ? from : to }, now);
    const detailsHref = `/drills/reports?tab=details${org ? `&org=${encodeURIComponent(org)}` : ''}`;
    return <PilotDashboard d={d} orgs={orgs} org={org} from={from.toISOString().slice(0, 10)} to={new Date(Math.min(to.getTime(), now.getTime()) - 1).toISOString().slice(0, 10)} detailsHref={detailsHref} />;
  }
  const to = new Date();
  const r = await buildReports({ orgId: org, from: new Date(to.getTime() - days * 86_400_000), to });
  const type = q.type && q.type in FEED_TYPES ? q.type : undefined;
  const fb = feedbackReports(await loadFeedback(org), { type, page: q.page || undefined });
  const cases = await loadCaseSide({ orgId: org, from: new Date(to.getTime() - days * 86_400_000), to });
  // The review queue stays on developers' machines (it writes labels back into the repo's files).
  return <PilotReports r={r} fb={fb} orgs={orgs} org={org} days={days} type={type} page={q.page} cases={cases} reviewQueue={reportsPageEnabled()} />;
}
