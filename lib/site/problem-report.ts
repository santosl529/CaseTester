// "Report a problem" on the interview screens, the report and /account (Lorenzo, 14 Nov; the privacy and voice
// policies send students here for questions, grade disputes, data requests and withdrawing voice consent). What the
// student writes is emailed to the founders (REPORT_EMAIL_TO) through Resend, reply-to the student, so answering is
// just replying. Pure: the route (app/api/report-problem) does the lookups and the sending.
import type { EmailMessage } from '@/lib/email/send';

export const PROBLEM_REPORT_MAX = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProblemReport = { ok: true; message: string; sessionId: string | null; page: string | null };

// The message is required; a session id or page that isn't well formed is left out rather than refused.
export function parseProblemReport(body: unknown): ProblemReport | { ok: false; error: 'empty_message' | 'too_long' } {
  const b = (body ?? {}) as { message?: unknown; sessionId?: unknown; page?: unknown };
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!message) return { ok: false, error: 'empty_message' };
  if (message.length > PROBLEM_REPORT_MAX) return { ok: false, error: 'too_long' };
  const sessionId = typeof b.sessionId === 'string' && UUID.test(b.sessionId) ? b.sessionId : null;
  const page = typeof b.page === 'string' && b.page.startsWith('/') && !b.page.startsWith('//') && b.page.length <= 200 ? b.page : null;
  return { ok: true, message, sessionId, page };
}

export function reportRecipient(env: Record<string, string | undefined> = process.env): string | null {
  return env.REPORT_EMAIL_TO?.trim() || null;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function problemReportEmail(r: {
  to: string; studentEmail: string; userId: string; message: string; page: string | null;
  session: { id: string; caseTitle: string; status: string } | null; at: Date;
}): EmailMessage {
  const subject = r.session ? `Report a problem: ${r.session.caseTitle} (${r.studentEmail})` : `Report a problem (${r.studentEmail})`;
  const facts: [string, string][] = [
    ['From', r.studentEmail],
    ['User id', r.userId],
    ...(r.session ? [['Interview', `${r.session.caseTitle} — ${r.session.id} (${r.session.status})`] as [string, string]] : []),
    ...(r.page ? [['Page', r.page] as [string, string]] : []),
    ['Sent', r.at.toISOString()],
  ];
  const text = `${facts.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${r.message}\n\nReply to this email to answer the student.`;
  const html = `<p>${facts.map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join('<br>')}</p>`
    + `<p style="white-space:pre-wrap">${escapeHtml(r.message)}</p><p>Reply to this email to answer the student.</p>`;
  return { to: r.to, subject, text, html, replyTo: r.studentEmail };
}
