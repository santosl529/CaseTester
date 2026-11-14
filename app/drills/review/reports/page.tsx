import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { reportsPageEnabled } from '@/lib/drills/review';
import { reportQueue } from '@/lib/drills/feedback';
import { planOf, resolveItem, ungradedAnswers } from '@/lib/drills/grading/jobs';
import type { StepResponse } from '@/lib/drills/sets/scoring';
import type { CheckResults } from '@/lib/drills/grading/apply';
import type { Tier } from '@/lib/drills/item-schema';
import { ReportQueueScreen } from '@/components/drills/views/report-queue';

// The review queue for "Report a problem" (local development only): each
// report with the item, the student's answer and the grade. Disputed AI
// grades are labeled check by check here; `npm run drills:export-disputes`
// then writes the labeled ones to /drill-golden.
export default async function ReportQueuePage() {
  if (!reportsPageEnabled()) notFound();
  await studentOrRedirect();
  const rows = await reportQueue();
  const ungraded = await Promise.all((await ungradedAnswers()).map(async ({ attempt, drillId, tier, plan }) => {
    const ref = (plan as ReturnType<typeof planOf>)[attempt.position];
    const item = ref ? await resolveItem(ref, tier as Tier).catch(() => null) : null;
    return { attempt, drillId, item, steps: ((attempt.response as { steps?: StepResponse[] } | null)?.steps ?? []) };
  }));
  const reports = await Promise.all(rows.map(async ({ report, attempt, drillId, tier, plan }) => {
    const ref = (plan as ReturnType<typeof planOf>)[report.position];
    const item = ref ? await resolveItem(ref, tier as Tier).catch(() => null) : null;
    const steps = ((attempt?.response as { steps?: StepResponse[] } | null)?.steps ?? []);
    const results = attempt?.checkResults as CheckResults | null;
    return { report, attempt, drillId, item, steps, results };
  }));

  return <ReportQueueScreen rows={rows} reports={reports} ungraded={ungraded} />;
}
