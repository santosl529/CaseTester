// The past sessions on /home (site flow, 19 Oct).
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { pastSessionRows } = await import('@/lib/site/past-sessions');

const at = new Date('2026-10-19T03:30:00Z');
const row = (over: Partial<Parameters<typeof pastSessionRows>[0][number]>) => ({
  id: 's1', caseId: 'prof-001', status: 'completed' as const, startedAt: at, flags: {}, scored: true, totalMs: 25 * 60_000, voice: false, ...over,
});
const titles = { 'prof-001': 'Brew & Bean Profitability' };

describe('pastSessionRows', () => {
  it('a scored completed case links to its report', () => {
    expect(pastSessionRows([row({})], titles)).toEqual([
      { id: 's1', date: 'Oct 19, 2026', caseTitle: 'Brew & Bean Profitability', status: 'Completed', link: { href: '/case/s1/report', label: 'View report' } },
    ]);
  });

  it('completed but not scored yet: "Get my report" (the report page prepares it); a partial one says it ended early', () => {
    const [r] = pastSessionRows([row({ scored: false, flags: { partial: true } })], titles);
    expect(r.status).toBe('Ended early');
    expect(r.link).toEqual({ href: '/case/s1/report', label: 'Get my report' });
  });

  it('abandoned and terminated sessions have no link', () => {
    const rows = pastSessionRows([
      row({ id: 'b', status: 'abandoned', scored: false }),
      row({ id: 'c', status: 'terminated', scored: false }),
    ], titles);
    expect(rows.map(r => [r.status, r.link])).toEqual([['Ended — no report', null], ['Ended', null]]);
  });

  // M3 (Matt, 17 Nov): an unfinished interview by the case's clock.
  const min = 60_000;
  const later = (ms: number) => new Date(at.getTime() + ms);
  it('time left: Continue, in text or in voice as it ran, with the minutes left', () => {
    const [text] = pastSessionRows([row({ id: 'a', status: 'active', scored: false })], titles, 'UTC', later(10 * min));
    expect(text.status).toBe('In progress · about 15 min left');
    expect(text.link).toEqual({ href: '/case/a', label: 'Continue' });
    const [voice] = pastSessionRows([row({ id: 'a', status: 'active', scored: false, voice: true })], titles, 'UTC', later(24.5 * min));
    expect(voice.status).toBe('In progress · about 1 min left');
    expect(voice.link).toEqual({ href: '/case/a/voice', label: 'Continue' });
  });
  it('pauses don’t count against the time (the interviewer’s clock)', () => {
    const flags = { silence: { checkedIn: false, silenceStartedAtMs: null, pausedAtMs: null, pauseLimitMs: null, pausedTotalMs: 6 * min } };
    const [r] = pastSessionRows([row({ status: 'active', scored: false, flags })], titles, 'UTC', later(28 * min));
    expect(r.status).toBe('In progress · about 3 min left');
  });
  it('time up with something assessable: ended, and Get my report ends it first', () => {
    const flags = { pressureTest: { state: 'satisfied', structureGiven: true } };
    const [r] = pastSessionRows([row({ id: 'a', status: 'active', scored: false, flags })], titles, 'UTC', later(25 * min));
    expect(r.status).toBe('Ended (time ran out)');
    expect(r.link).toEqual({ href: '/case/a/report', label: 'Get my report', endFirst: true });
  });
  it('time up with nothing assessable: ended, no report', () => {
    const [r] = pastSessionRows([row({ status: 'active', scored: false })], titles, 'UTC', later(40 * min));
    expect([r.status, r.link]).toEqual(['Ended — no report', null]);
  });

  it('dates in the student’s time zone; an unknown case shows its id; a session with two score rows once', () => {
    const rows = pastSessionRows([row({ caseId: 'zzz-001' }), row({ caseId: 'zzz-001' })], titles, 'America/New_York');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: 'Oct 18, 2026', caseTitle: 'zzz-001' });
  });
});
