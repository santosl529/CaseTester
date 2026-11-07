import Link from 'next/link';
import { answerText, type StepResponse } from '@/lib/drills/sets/scoring';
import type { CheckResults } from '@/lib/drills/grading/apply';
import type { Item } from '@/lib/drills/item-schema';
import type { reportQueue } from '@/lib/drills/feedback';
import type { ungradedAnswers } from '@/lib/drills/grading/jobs';
import { ReportReview } from '@/components/drills/report-review';

// Why an answer wasn't graded (drill_attempts.grading_issue).
const ISSUE: Record<string, string> = {
  refused: 'The grader declined it (review)', request_cap: 'Reached the request cap', billing: 'Spend-limit or billing error',
  over_word_limit: 'Over the word limits', error: 'Request error', failed_runs: 'Grading runs kept failing',
};
const REASON = { answer_key_wrong: 'Answer key is wrong', question_confusing: 'Question is confusing', grade_unfair: 'My grade seems unfair', other: 'Other' } as const;

function choiceText(item: Item, r: StepResponse) {
  if (r.type === 'choice') return item.options.find(o => o.id === r.option_id)?.text ?? r.option_id;
  if (r.type === 'choices') return r.option_ids.map(id => item.options.find(o => o.id === id)?.text ?? id).join('; ');
  return answerText(r);
}

type QueueRow = Awaited<ReturnType<typeof reportQueue>>[number];
type UngradedRow = Awaited<ReturnType<typeof ungradedAnswers>>[number];
export interface ReportQueueData {
  rows: QueueRow[];
  reports: { report: QueueRow['report']; attempt: QueueRow['attempt']; drillId: string; item: Item | null; steps: StepResponse[]; results: CheckResults | null }[];
  ungraded: { attempt: UngradedRow['attempt']; drillId: string; item: Item | null; steps: StepResponse[] }[];
}

// The report queue's screen (local development only); app/drills/review/reports/page.tsx loads it.
export function ReportQueueScreen({ rows, reports, ungraded }: ReportQueueData) {
  const refused = ungraded.filter(u => u.attempt.gradingIssue === 'refused').length;
  const open = rows.filter(r => r.report.status === 'open').length;
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

      <section aria-labelledby="ungraded" className="space-y-3">
        <h2 id="ungraded" className="text-base font-semibold">Answers not graded ({ungraded.length}, {refused} refused)</h2>
        <p className="text-sm text-muted-foreground">Answers grading gave up on: the student saw &ldquo;Grading delayed&rdquo; and the answer counts toward nothing. Refused ones come first, for your review.</p>
        {ungraded.length === 0 && <p className="text-sm">None.</p>}
        <ol className="space-y-4">
          {ungraded.map(({ attempt, drillId, item, steps }) => (
            <li key={attempt.id} className="space-y-2 rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={attempt.gradingIssue === 'refused' ? 'font-medium text-destructive' : 'font-medium'}>{ISSUE[attempt.gradingIssue ?? ''] ?? attempt.gradingIssue ?? 'Not graded'}</span>
                <span className="text-muted-foreground">{drillId} · {attempt.itemId ? `${attempt.itemId}@${attempt.itemVersion}` : attempt.templateId} · item {attempt.position + 1} · {attempt.submittedAt.toISOString().slice(0, 10)} · attempt {attempt.id.slice(0, 8)}</span>
              </div>
              {item && <p className="whitespace-pre-line">{item.prompt}</p>}
              {steps.map((s, i) => <p key={i} className="whitespace-pre-line text-muted-foreground">{steps.length > 1 ? `Step ${i + 1}: ` : ''}{item ? choiceText(item, s) : answerText(s)}</p>)}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
