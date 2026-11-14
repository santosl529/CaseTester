import { reportRecipient } from '@/lib/site/problem-report';
import { ReportProblemButton } from '@/components/report-problem';

// The Report a problem button, only where a report can be sent: REPORT_EMAIL_TO and RESEND_API_KEY both set
// (server-side, read per request). Without them the button would only ever say it couldn't send.
export function ReportProblem({ sessionId }: { sessionId?: string }) {
  if (!reportRecipient() || !process.env.RESEND_API_KEY?.trim()) return null;
  return <ReportProblemButton sessionId={sessionId} />;
}
