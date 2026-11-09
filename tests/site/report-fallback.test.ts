// The report page for an interview with no report (8 Nov: a bare 404 before): say why, and where to go.
import { describe, it, expect } from 'vitest';
import { noReportView } from '@/lib/site/report-fallback';

const ID = '11111111-1111-4111-8111-111111111111';
describe('noReportView', () => {
  it('still going: back to the interview', () => {
    expect(noReportView('active', ID)).toEqual({ message: 'This interview is still going, so there’s no report yet.', link: { href: `/case/${ID}`, label: 'Continue the interview' } });
  });
  it('ended early or stopped: no report, start another from home', () => {
    for (const s of ['abandoned', 'terminated'] as const) {
      expect(noReportView(s, ID)).toEqual({ message: 'This interview ended before there was enough to score, so there’s no report for it.', link: { href: '/home', label: 'Back to home' } });
    }
  });
});
