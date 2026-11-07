import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { reportsPageEnabled } from '@/lib/drills/review';
import { buildReports, listOrgs, TEST_ORGS } from '@/lib/drills/reports';
import { FEED_TYPES, feedbackReports, loadFeedback } from '@/lib/drills/reports/feedback';
import { PilotReports } from '@/components/drills/views/pilot-reports';

// The pilot reports (docs/prd-drills.md "MVP reports"), local development
// only: every student's data from the database the dev server points at.
// Flagged items come first, for Matt to pull by hand during the pilot.
const PERIODS = [7, 28, 90] as const;

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
  const type = q.type && q.type in FEED_TYPES ? q.type : undefined;
  const fb = feedbackReports(await loadFeedback(org), { type, page: q.page || undefined });
  return <PilotReports r={r} fb={fb} orgs={orgs} org={org} days={days} type={type} page={q.page} />;
}
