import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { emailConfig, sendEmail } from '@/lib/email/send';
import { parseProblemReport, problemReportEmail, reportRecipient } from '@/lib/site/problem-report';
import { hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { jsonRoute } from '@/lib/http/route-guard';

// Report a problem (lib/site/problem-report.ts): emails the founders what the student wrote, reply-to the student.
// Signed in only; 5 an hour per student (RATE_LIMIT_PROBLEM_REPORTS_PER_HOUR) before any email. A session id names
// the interview only when it is the student's own. No REPORT_EMAIL_TO or RESEND_API_KEY, or Resend refusing:
// 503 report_unavailable (logged without what the student wrote).
async function handlePOST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = await hitRateLimit(rateRule('problemReport'), `user:${user.id}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const parsed = parseProblemReport(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const to = reportRecipient();
  const cfg = emailConfig();
  if (!to || !cfg) {
    console.error('[report-problem] not configured: REPORT_EMAIL_TO and RESEND_API_KEY are both needed');
    return NextResponse.json({ error: 'report_unavailable' }, { status: 503 });
  }

  let session: { id: string; caseTitle: string; status: string } | null = null;
  if (parsed.sessionId) {
    const s = await db.query.sessions.findFirst({ where: and(eq(sessions.id, parsed.sessionId), eq(sessions.userId, user.id)) });
    if (s) {
      let caseTitle = s.caseId;
      try { caseTitle = getCaseById(s.caseId).title; } catch { /* a retired case: its id */ }
      session = { id: s.id, caseTitle, status: s.status };
    }
  }

  try {
    await sendEmail(cfg, problemReportEmail({ to, studentEmail: user.email ?? '(no email)', userId: user.id, message: parsed.message, page: parsed.page, session, at: new Date() }));
  } catch (err) {
    console.error('[report-problem] send failed:', (err as Error).message);
    return NextResponse.json({ error: 'report_unavailable' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
