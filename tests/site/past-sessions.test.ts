// The past sessions on /home (site flow, 19 Oct).
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { pastSessionRows } = await import('@/lib/site/past-sessions');

const at = new Date('2026-10-19T03:30:00Z');
const row = (over: Partial<Parameters<typeof pastSessionRows>[0][number]>) => ({
  id: 's1', caseId: 'prof-001', status: 'completed' as const, startedAt: at, flags: {}, scored: true, ...over,
});
const titles = { 'prof-001': 'Brew & Bean Profitability' };

describe('pastSessionRows', () => {
  it('a scored completed case links to its report', () => {
    expect(pastSessionRows([row({})], titles)).toEqual([
      { id: 's1', date: 'Oct 19, 2026', caseTitle: 'Brew & Bean Profitability', status: 'Completed', link: { href: '/case/s1/report', label: 'Report' } },
    ]);
  });

  it('completed but not scored yet: "Get my report" (the report page prepares it); a partial one says it ended early', () => {
    const [r] = pastSessionRows([row({ scored: false, flags: { partial: true } })], titles);
    expect(r.status).toBe('Ended early');
    expect(r.link).toEqual({ href: '/case/s1/report', label: 'Get my report' });
  });

  it('active, abandoned and terminated sessions have no link', () => {
    const rows = pastSessionRows([
      row({ id: 'a', status: 'active', scored: false }),
      row({ id: 'b', status: 'abandoned', scored: false }),
      row({ id: 'c', status: 'terminated', scored: false }),
    ], titles);
    expect(rows.map(r => [r.status, r.link])).toEqual([['Not finished', null], ['Ended — no report', null], ['Ended', null]]);
  });

  it('dates in the student’s time zone; an unknown case shows its id; a session with two score rows once', () => {
    const rows = pastSessionRows([row({ caseId: 'zzz-001' }), row({ caseId: 'zzz-001' })], titles, 'America/New_York');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: 'Oct 18, 2026', caseTitle: 'zzz-001' });
  });
});
