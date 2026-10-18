import Link from 'next/link';
import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { reportsPageEnabled } from '@/lib/drills/review';
import { reportQueue } from '@/lib/drills/feedback';
import { planOf, resolveItem } from '@/lib/drills/grading/jobs';
import { answerText, type StepResponse } from '@/lib/drills/sets/scoring';
import type { CheckResults } from '@/lib/drills/grading/apply';
import type { Item, Tier } from '@/lib/drills/item-schema';
import { ReportReview } from '@/components/drills/report-review';

// The review queue for "Report a problem" (local development only): each
// report with the item, the student's answer and the grade. Disputed AI
// grades are labeled check by check here; `npm run drills:export-disputes`
// then writes the labeled ones to /drill-golden.
const REASON = { answer_key_wrong: 'Answer key is wrong', question_confusing: 'Question is confusing', grade_unfair: 'My grade seems unfair', other: 'Other' } as const;

function choiceText(item: Item, r: StepResponse) {
  if (r.type === 'choice') return item.options.find(o => o.id === r.option_id)?.text ?? r.option_id;
  if (r.type === 'choices') return r.option_ids.map(id => item.options.find(o => o.id === id)?.text ?? id).join('; ');
  return answerText(r);
}

export default async function ReportQueuePage() {
  if (!reportsPageEnabled()) notFound();
  await studentOrRedirect();
  const rows = await reportQueue();
  const open = rows.filter(r => r.report.status === 'open').length;
  const reports = await Promise.all(rows.map(async ({ report, attempt, drillId, tier, plan }) => {
    const ref = (plan as ReturnType<typeof planOf>)[report.position];
    const item = ref ? await resolveItem(ref, tier as Tier).catch(() => null) : null;
    const steps = ((attempt?.response as { steps?: StepResponse[] } | null)?.steps ?? []);
    const results = attempt?.checkResults as CheckResults | null;
    return { report, attempt, drillId, item, steps, results };
  }));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Reported items</h1>
          <Link href="/drills/reports" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Pilot reports</Link>
        </div>
        <p className="text-sm text-muted-foreground">{rows.length} reports, {open} open. Label a disputed grade check by check (your label, not the grader&apos;s), then run <code>npm run drills:export-disputes</code> to add labeled ones to the golden sets.</p>
      </header>
      {reports.length === 0 && <p className="text-sm">No reports yet.</p>}
      <ol className="space-y-6">
        {reports.map(({ report, attempt, drillId, item, steps, results }) => (
          <li key={report.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{REASON[report.reason]}</span>
              <span className="text-muted-foreground">
                {drillId} · {report.itemId ? `${report.itemId}@${report.itemVersion}` : report.templateId} · item {report.position + 1} · {report.screen} screen · {report.createdAt.toISOString().slice(0, 10)} · {report.status}
              </span>
            </div>
            {report.comment && <p className="rounded-md bg-muted/50 p-2 text-sm">“{report.comment}”</p>}
            {item && <p className="whitespace-pre-line text-sm">{item.prompt}</p>}
            {attempt ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Student&apos;s answer ({attempt.score === null ? 'not graded' : `${Math.round(attempt.score * 100)}%`}{attempt.skipped ? ', skipped' : ''}{attempt.timedOut ? ', timed out' : ''})</p>
                {steps.map((s, i) => <p key={i} className="whitespace-pre-line text-muted-foreground">{steps.length > 1 ? `Step ${i + 1}: ` : ''}{item ? choiceText(item, s) : answerText(s)}</p>)}
                {item && item.options.length > 0 && <p className="text-muted-foreground">Key: {item.options.filter(o => o.correct).map(o => o.text).join('; ')}</p>}
              </div>
            ) : <p className="text-sm text-muted-foreground">Reported before answering.</p>}
            <ReportReview id={report.id} status={report.status} notes={report.reviewerNotes ?? ''}
              checks={(results?.checks ?? []).map(c => ({ id: c.check_id, grader: c.pass, by: c.by, evidence: c.evidence, label: (report.labels as Record<string, boolean> | null)?.[c.check_id] ?? c.pass }))}
              flags={(results?.red_flags ?? []).map(f => ({ id: f.id, grader: f.present, label: (report.redFlags as Record<string, boolean> | null)?.[f.id] ?? f.present }))}
              exported={report.exportedAt !== null} />
          </li>
        ))}
      </ol>
    </main>
  );
}
