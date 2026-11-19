import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reportsPageEnabled } from '@/lib/drills/review';
import { reportsAllowedFor } from '@/lib/drills/reports/access';
import { loadCaseSide } from '@/lib/drills/reports/case-side-load';
import { buildReports, listOrgs, TEST_ORGS } from '@/lib/drills/reports';
import { FEED_TYPES, feedbackReports, loadFeedback } from '@/lib/drills/reports/feedback';
import { PilotReports } from '@/components/drills/views/pilot-reports';

// The pilot reports (docs/prd-drills.md "MVP reports"): every student's data. In production only for the founder
// accounts in REPORTS_ALLOWED_EMAILS, checked here on the server; anyone else gets a 404 (Matt, 17 Nov, pre-pilot audit
// M6). The case side (interviews, the survey, sign-ups, activation) comes first, then the drills.
const PERIODS = [7, 28, 90] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ org?: string; days?: string; type?: string; page?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !reportsAllowedFor(user.email)) notFound();
  const q = await searchParams;
  const days = PERIODS.find(p => String(p) === q.days) ?? 28;
  const orgs = await listOrgs();
  // A test club (smokes, the accessibility audit) only when named in the URL.
  const org = q.org && (orgs.includes(q.org) || TEST_ORGS.includes(q.org)) ? q.org : null;
  const to = new Date();
  const r = await buildReports({ orgId: org, from: new Date(to.getTime() - days * 86_400_000), to });
  const type = q.type && q.type in FEED_TYPES ? q.type : undefined;
  const fb = feedbackReports(await loadFeedback(org), { type, page: q.page || undefined });
  const cases = await loadCaseSide({ orgId: org, from: new Date(to.getTime() - days * 86_400_000), to });
  // The review queue stays on developers' machines (it writes labels back into the repo's files).
  return <PilotReports r={r} fb={fb} orgs={orgs} org={org} days={days} type={type} page={q.page} cases={cases} reviewQueue={reportsPageEnabled()} />;
}
