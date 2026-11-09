// The report page for an interview that has no report and can't get one (8 Nov: it was a bare 404). A completed
// interview without a score gets PrepareReport instead.
export function noReportView(status: 'active' | 'abandoned' | 'terminated', sessionId: string): { message: string; link: { href: string; label: string } } {
  if (status === 'active') return { message: 'This interview is still going, so there’s no report yet.', link: { href: `/case/${sessionId}`, label: 'Continue the interview' } };
  return { message: 'This interview ended before there was enough to score, so there’s no report for it.', link: { href: '/home', label: 'Back to home' } };
}
