// The pilot reports in production (Matt, 17 Nov, pre-pilot audit M6): founders only, by an allowlist checked on the
// server (everyone else: 404), and the case side — interviews by case and week, the survey, sign-ups, activation.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { reportsAllowedFor } from '@/lib/drills/reports/access';
import {
  activated, activationByWeek, interviewsByCaseAndWeek, signUpsByWeek, surveySummary, weekLabel, weekStart, weeksBetween,
} from '@/lib/drills/reports/case-side';

const D = (s: string) => new Date(`${s}T12:00:00Z`);

describe('who may open the reports', () => {
  const prod = { NODE_ENV: 'production', REPORTS_ALLOWED_EMAILS: 'matt@example.com, Lorenzo@Example.com' };
  it('production: only the listed founders (any case, any spacing)', () => {
    expect(reportsAllowedFor('matt@example.com', prod)).toBe(true);
    expect(reportsAllowedFor('LORENZO@example.com ', prod)).toBe(true);
    expect(reportsAllowedFor('student@example.com', prod)).toBe(false);
    expect(reportsAllowedFor(null, prod)).toBe(false);
  });
  it('production with no list: nobody', () => {
    expect(reportsAllowedFor('matt@example.com', { NODE_ENV: 'production' })).toBe(false);
  });
  it('a developer\'s machine: any signed-in account, as before', () => {
    expect(reportsAllowedFor('anyone@example.com', { NODE_ENV: 'development' })).toBe(true);
  });
});

// The page itself: the check runs on the server, before anything is read.
const page = vi.hoisted(() => ({ email: null as string | null, loads: 0, weekly: 0 }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('redirect'); } }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: page.email ? { email: page.email } : null } }) } }) }));
vi.mock('@/lib/drills/reports', () => ({ buildReports: async () => { page.loads++; return {}; }, listOrgs: async () => [], TEST_ORGS: ['smoke-test'] }));
vi.mock('@/lib/drills/reports/feedback', () => ({ FEED_TYPES: {}, feedbackReports: () => ({}), loadFeedback: async () => ({}) }));
vi.mock('@/lib/drills/reports/case-side-load', () => ({ loadCaseSide: async () => ({ students: [], sessions: [], ratings: [], comments: [], firsts: [] }) }));
vi.mock('@/components/drills/views/pilot-reports', () => ({ PilotReports: () => null }));
// The weekly overview (the pilot dashboard, 22 Nov) is the default view; ?tab=details is the earlier page.
vi.mock('@/lib/drills/reports/weekly-load', () => ({ buildWeeklyDashboard: async () => { page.weekly++; return {}; } }));
vi.mock('@/components/drills/views/pilot-dashboard', () => ({ PilotDashboard: () => null }));

describe('/drills/reports in production', () => {
  beforeEach(() => { page.loads = 0; page.weekly = 0; vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('REPORTS_ALLOWED_EMAILS', 'matt@example.com'); });
  const open = async (q: Record<string, string> = {}) => (await import('@/app/drills/reports/page')).default({ searchParams: Promise.resolve(q) });
  it('a student who isn\'t listed: 404, nothing read', async () => {
    page.email = 'student@example.com';
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(open({ tab: 'details' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(page.loads).toBe(0);
    expect(page.weekly).toBe(0);
  });
  it('signed out: 404', async () => {
    page.email = null;
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
  });
  it('a listed founder: past the check, the reports load', async () => {
    page.email = 'matt@example.com';
    // With NODE_ENV stubbed to production React's dev JSX runtime can't render here; what matters is the gate.
    await open().catch(e => { expect(String(e)).not.toMatch(/NEXT_NOT_FOUND/); });
    expect(page.weekly).toBe(1);
    await open({ tab: 'details' }).catch(e => { expect(String(e)).not.toMatch(/NEXT_NOT_FOUND/); });
    expect(page.loads).toBe(1);
  });
});

describe('the case side', () => {
  it('weeks start on Monday and are named by it', () => {
    expect(weekLabel(weekStart(D('2026-11-19')))).toBe('Nov 16');   // a Thursday
    expect(weekLabel(weekStart(D('2026-11-16')))).toBe('Nov 16');   // the Monday itself
    expect(weeksBetween(D('2026-11-04'), D('2026-11-19')).map(weekLabel)).toEqual(['Nov 2', 'Nov 9', 'Nov 16']);
  });

  it('interviews by week and case: started, completed, abandoned, not finished', () => {
    const rows = [
      { userId: 'a', caseId: 'prof-002', status: 'completed' as const, startedAt: D('2026-11-17'), completedAt: D('2026-11-17') },
      { userId: 'b', caseId: 'prof-002', status: 'abandoned' as const, startedAt: D('2026-11-18'), completedAt: null },
      { userId: 'c', caseId: 'prof-002', status: 'active' as const, startedAt: D('2026-11-19'), completedAt: null },
      { userId: 'a', caseId: 'launch-001', status: 'completed' as const, startedAt: D('2026-11-10'), completedAt: D('2026-11-10') },
    ];
    expect(interviewsByCaseAndWeek(rows, id => ({ 'prof-002': 'Larkspur', 'launch-001': 'Hollis Bay' })[id]!)).toEqual([
      { week: 'Nov 16', case: 'Larkspur', started: 3, completed: 1, abandoned: 1, notFinished: 1 },
      { week: 'Nov 9', case: 'Hollis Bay', started: 1, completed: 1, abandoned: 0, notFinished: 0 },
    ]);
  });

  it('the survey: answers, averages and the spread, overall and by case', () => {
    const s = surveySummary([
      { caseId: 'prof-002', realism: 4, usefulness: 5 }, { caseId: 'prof-002', realism: 2, usefulness: 3 }, { caseId: 'launch-001', realism: 5, usefulness: 5 },
    ], id => id);
    expect(s.all).toMatchObject({ answers: 3, realism: 11 / 3, usefulness: 13 / 3, realismSpread: [0, 1, 0, 1, 1], usefulnessSpread: [0, 0, 1, 0, 2] });
    expect(s.byCase.map(c => [c.case, c.answers, c.realism])).toEqual([['prof-002', 2, 3], ['launch-001', 1, 5]]);
  });

  it('sign-ups per week', () => {
    const weeks = weeksBetween(D('2026-11-09'), D('2026-11-19'));
    expect(signUpsByWeek([{ id: 'a', signedUpAt: D('2026-11-10') }, { id: 'b', signedUpAt: D('2026-11-17') }, { id: 'c', signedUpAt: D('2026-11-18') }], weeks))
      .toEqual([{ week: 'Nov 9', signUps: 1 }, { week: 'Nov 16', signUps: 2 }]);
  });

  describe('activation: within 7 days, a plan and one drill set or one full case', () => {
    const s = { id: 'a', signedUpAt: D('2026-11-02') };
    const f = (o: Partial<{ planAt: Date | null; setAt: Date | null; fullCaseAt: Date | null }>) => ({ userId: 'a', planAt: null, setAt: null, fullCaseAt: null, ...o });
    it('a plan and a set within 7 days: activated', () => { expect(activated(s, f({ planAt: D('2026-11-02'), setAt: D('2026-11-05') }))).toBe(true); });
    it('a plan and a full case within 7 days: activated', () => { expect(activated(s, f({ planAt: D('2026-11-03'), fullCaseAt: D('2026-11-09') }))).toBe(true); });
    it('no plan: not activated, whatever else', () => { expect(activated(s, f({ setAt: D('2026-11-03'), fullCaseAt: D('2026-11-03') }))).toBe(false); });
    it('a plan but no set or case: not activated', () => { expect(activated(s, f({ planAt: D('2026-11-02') }))).toBe(false); });
    it('the set came after day 7: not activated', () => { expect(activated(s, f({ planAt: D('2026-11-02'), setAt: D('2026-11-10') }))).toBe(false); });
    it('by sign-up week; this week\'s not-yet-active students aren\'t counted against the rate', () => {
      const students = [{ id: 'a', signedUpAt: D('2026-11-02') }, { id: 'b', signedUpAt: D('2026-11-03') }, { id: 'c', signedUpAt: D('2026-11-17') }];
      const firsts = [f({ planAt: D('2026-11-02'), setAt: D('2026-11-04') }), { userId: 'b', planAt: null, setAt: null, fullCaseAt: null }];
      expect(activationByWeek(students, firsts, weeksBetween(D('2026-11-02'), D('2026-11-19')), D('2026-11-19'))).toEqual([
        { week: 'Nov 2', signedUp: 2, activated: 1, firstWeek: 0, rate: 0.5 },
        { week: 'Nov 9', signedUp: 0, activated: 0, firstWeek: 0, rate: null },
        { week: 'Nov 16', signedUp: 1, activated: 0, firstWeek: 1, rate: null },
      ]);
    });
  });
});
