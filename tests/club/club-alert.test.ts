// The wrong-code alert (Lorenzo, 14 Nov: "do email only for now"): wrong club codes are counted site-wide per hour;
// the attempt that reaches the threshold emails the founders once. Nothing is blocked — a pause would let anyone shut
// sign-ups by typing junk — and the codes typed are never put in the email.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ alerts: 0 }));
vi.mock('@/db/client', () => ({ db: {} }));

const { noteWrongClubCode, wrongCodeAlertEmail, wrongCodeThreshold } = await import('@/lib/club-alert');

type Deps = Parameters<typeof noteWrongClubCode>[0];
const deps = (hits: number[], extra: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> & { sent: number[]; logged: string[] } => {
  const sent: number[] = [];
  const logged: string[] = [];
  return {
    count: async () => hits.shift() ?? 0,
    send: async (n: number) => { sent.push(n); },
    threshold: 30,
    log: (m: string) => { logged.push(m); },
    sent, logged,
    ...extra,
  };
};
beforeEach(() => { h.alerts = 0; });

describe('noteWrongClubCode', () => {
  it('below the threshold: counted, no email', async () => {
    const d = deps([1]);
    await noteWrongClubCode(d);
    expect(d.sent).toEqual([]);
  });
  it('the attempt that reaches the threshold sends one email; the ones after it do not', async () => {
    const d = deps([30, 31, 45]);
    await noteWrongClubCode(d);
    await noteWrongClubCode(d);
    await noteWrongClubCode(d);
    expect(d.sent).toEqual([30]);
  });
  it('a counter or email failure is logged, never thrown: the student just sees "invalid code"', async () => {
    const d = deps([], { count: async () => { throw new Error('db down'); } });
    await expect(noteWrongClubCode(d)).resolves.toBeUndefined();
    const e = deps([30], { send: async () => { throw new Error('resend down'); } });
    await expect(noteWrongClubCode(e)).resolves.toBeUndefined();
    expect(d.logged.join()).toMatch(/db down/);
    expect(e.logged.join()).toMatch(/resend down/);
  });
});

describe('wrongCodeThreshold', () => {
  it('30 an hour by default; CLUB_CODE_ALERT_PER_HOUR overrides with a positive whole number', () => {
    expect(wrongCodeThreshold({})).toBe(30);
    expect(wrongCodeThreshold({ CLUB_CODE_ALERT_PER_HOUR: '5' })).toBe(5);
    expect(wrongCodeThreshold({ CLUB_CODE_ALERT_PER_HOUR: 'x' })).toBe(30);
    expect(wrongCodeThreshold({ CLUB_CODE_ALERT_PER_HOUR: '0' })).toBe(30);
  });
});

describe('wrongCodeAlertEmail', () => {
  it('says how many and what to do; names no code', () => {
    const m = wrongCodeAlertEmail({ to: 'founders@example.com', hits: 30, at: new Date('2026-11-15T04:00:00Z') });
    expect(m.to).toBe('founders@example.com');
    expect(m.subject).toBe('CasePace: 30 wrong club codes in the last hour');
    expect(m.text).toMatch(/npm run clubs/);
    expect(m.html).toMatch(/30 wrong club codes/);
  });
});
