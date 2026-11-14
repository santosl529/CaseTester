// "Report a problem" outside the drills (Lorenzo, 14 Nov; the privacy and voice policies point students to it for
// questions, grade disputes, data requests and withdrawing voice consent). What the student writes is emailed to the
// founders (REPORT_EMAIL_TO) through Resend, reply-to the student.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/account' }));

import { PROBLEM_REPORT_MAX, parseProblemReport, problemReportEmail, reportRecipient } from '@/lib/site/problem-report';
import { reportFailure } from '@/lib/site/failure-messages';
import { ReportProblemButton } from '@/components/report-problem';

const SID = '51111111-1111-4111-8111-111111111111';

describe('parseProblemReport', () => {
  it('the message trimmed; a session id and the page when they are well formed', () => {
    expect(parseProblemReport({ message: '  The grader missed my math.  ', sessionId: SID, page: `/case/${SID}/report` }))
      .toEqual({ ok: true, message: 'The grader missed my math.', sessionId: SID, page: `/case/${SID}/report` });
  });
  it('no session, a malformed id, or a page that is not a path: left out, not refused', () => {
    expect(parseProblemReport({ message: 'hi', sessionId: 'nope', page: 'https://evil.example' })).toEqual({ ok: true, message: 'hi', sessionId: null, page: null });
    expect(parseProblemReport({ message: 'hi' })).toEqual({ ok: true, message: 'hi', sessionId: null, page: null });
  });
  it('an empty or too-long message is refused', () => {
    expect(parseProblemReport({ message: '   ' })).toEqual({ ok: false, error: 'empty_message' });
    expect(parseProblemReport(null)).toEqual({ ok: false, error: 'empty_message' });
    expect(parseProblemReport({ message: 'x'.repeat(PROBLEM_REPORT_MAX + 1) })).toEqual({ ok: false, error: 'too_long' });
    expect(parseProblemReport({ message: 'x'.repeat(PROBLEM_REPORT_MAX) }).ok).toBe(true);
  });
});

describe('reportRecipient', () => {
  it('REPORT_EMAIL_TO, trimmed; none set: no recipient', () => {
    expect(reportRecipient({ REPORT_EMAIL_TO: ' us@casepace.io ' })).toBe('us@casepace.io');
    expect(reportRecipient({})).toBeNull();
    expect(reportRecipient({ REPORT_EMAIL_TO: ' ' })).toBeNull();
  });
});

describe('problemReportEmail', () => {
  const at = new Date('2026-11-14T15:04:00Z');
  it('to the founders, reply-to the student, with who, where and what', () => {
    const m = problemReportEmail({ to: 'us@casepace.io', studentEmail: 'ann@example.com', userId: 'u1', message: 'Voice cut me off.\nTwice.', page: `/case/${SID}/voice`, session: { id: SID, caseTitle: 'Brew & Bean Profitability', status: 'active' }, at });
    expect(m.to).toBe('us@casepace.io');
    expect(m.replyTo).toBe('ann@example.com');
    expect(m.subject).toBe('Report a problem: Brew & Bean Profitability (ann@example.com)');
    for (const s of ['ann@example.com', 'u1', SID, 'Brew & Bean Profitability', 'active', `/case/${SID}/voice`, '2026-11-14T15:04:00.000Z', 'Voice cut me off.\nTwice.']) expect(m.text).toContain(s);
  });
  it('escapes what the student wrote in the HTML', () => {
    const m = problemReportEmail({ to: 'us@casepace.io', studentEmail: 'ann@example.com', userId: 'u1', message: '<script>x</script> & "y"', page: null, session: null, at });
    expect(m.html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; &quot;y&quot;');
    expect(m.html).not.toContain('<script>');
    expect(m.subject).toBe('Report a problem (ann@example.com)');
  });
});

describe('reportFailure', () => {
  it('says plainly what happened', () => {
    expect(reportFailure(0, null)).toMatch(/couldn’t reach the server/);
    expect(reportFailure(400, { error: 'empty_message' })).toBe('Write what went wrong first.');
    expect(reportFailure(400, { error: 'too_long' })).toBe(`Keep it under ${PROBLEM_REPORT_MAX} characters.`);
    expect(reportFailure(429, { error: 'rate_limited', retryAfterSec: 600 })).toMatch(/^You’ve sent several reports in the last hour\. Try again in/);
    expect(reportFailure(401, null)).toMatch(/log in/i);
    expect(reportFailure(503, { error: 'report_unavailable' })).toBe('Your report couldn’t be sent just now. Please try again in a few minutes.');
  });
});

describe('ReportProblemButton', () => {
  it('a button, and a closed dialog with a bounded box and Send disabled until something is written', () => {
    const html = renderToStaticMarkup(createElement(ReportProblemButton, { sessionId: SID }));
    expect(html).toMatch(/<button[^>]*>Report a problem<\/button>/);
    expect(html).toContain('<dialog');
    expect(html).toContain(`maxLength="${PROBLEM_REPORT_MAX}"`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send<\/button>/);
  });
});
