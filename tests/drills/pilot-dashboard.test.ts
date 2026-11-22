// The pilot dashboard (Matt, 22 Nov 2026): every number's definition, on a small fixture pilot whose answers are
// worked out by hand (app/dev/ui-preview/_data/dashboard-fixture.ts), and the page's rendering.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/drills/reports', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('@/db/client', () => ({ db: {} }));

import { addWeeks, dayIn, dimensionOf, focusWeek, statusOf, tilesFor, weekKey, weekKeys, weeklyDashboard, TARGETS } from '@/lib/drills/reports/weekly';
import { NOW, dashboardFixture } from '@/app/dev/ui-preview/_data/dashboard-fixture';
import { PilotDashboard } from '@/components/drills/views/pilot-dashboard';
import { isBot, normalizePath, visitorCode } from '@/lib/site/page-view';

const d = weeklyDashboard(dashboardFixture());

describe('weeks (Monday to Sunday, US Eastern)', () => {
  it('a Sunday night in New York is still that week', () => {
    expect(weekKey(new Date('2026-11-16T03:00:00Z'))).toBe('2026-11-09');   // Sun 15 Nov, 22:00 ET
    expect(weekKey(new Date('2026-11-16T06:00:00Z'))).toBe('2026-11-16');   // Mon 16 Nov, 01:00 ET
    expect(addWeeks('2026-11-09', -1)).toBe('2026-11-02');
  });
  it('the tiles show the last full week; the current one isn\'t over', () => {
    expect(focusWeek(weekKeys(new Date('2026-10-19T12:00:00Z'), NOW), NOW)).toBe('2026-11-09');
    expect(d.focus).toBe('2026-11-09');
  });
  it('a practice day is the student\'s own calendar day', () => {
    expect(dayIn(new Date('2026-11-13T05:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-12');
    expect(dayIn(new Date('2026-11-13T05:00:00Z'), 'Not/AZone')).toBe('2026-11-13');
  });
});

describe('the five tiles (week of 9 Nov)', () => {
  const t = d.tiles!;
  it('Start: activated within 7 days of sign-up, of those whose 7 days ended this week; first case beside it', () => {
    // A (plan, set and case within 7 days) and B (nothing): both signed up 2–3 Nov.
    expect(t.start).toMatchObject({ n: 1, of: 2, value: 0.5 });
    expect(t.start.firstCase).toMatchObject({ n: 1, of: 2 });
  });
  it('Come back: active in week 4, of those whose week 4 ended this week', () => {
    // C (a set on 5 Nov, in days 22–28) and D (never active): both signed up 12–13 Oct.
    expect(t.comeBack).toMatchObject({ n: 1, of: 2, value: 0.5 });
  });
  it('Use: practice days per active student; cases per active student beside it', () => {
    // A: 10, 12 (sets) and 13 Nov (case) = 3 days; C: 13 Nov (set) and 11 Nov (case started) = 2 days.
    expect(t.use).toMatchObject({ students: 2, value: 2.5, cases: 2, casesPerStudent: 1 });
  });
  it('Improve: flagged, practised, and not flagged again in the next case at the same level', () => {
    // c1 flagged PS.mece (practised → not flagged in c2: improved) and QN.setup (not practised: not counted).
    expect(t.improve).toMatchObject({ n: 1, of: 1, value: 1 });
  });
  it('Value: "how useful" this week, realism beside it', () => {
    expect(t.value).toEqual({ value: 4, realism: 4, n: 2 });
  });
  it('change since last week comes from the same rules a week earlier', () => {
    expect(d.prev!.value).toEqual({ value: 2, realism: 3, n: 1 });
    expect(tilesFor(dashboardFixture(), '2026-11-02').use.students).toBe(2);
  });
  it('green at or above target, amber from 80%, red below, none without data', () => {
    expect(statusOf(0.5, TARGETS.start)).toBe('green');
    expect(statusOf(0.4, TARGETS.start)).toBe('amber');
    expect(statusOf(0.39, TARGETS.start)).toBe('red');
    expect(statusOf(null, TARGETS.start)).toBe('none');
    expect(statusOf(3.2, TARGETS.value)).toBe('amber');
  });
});

describe('below the tiles', () => {
  it('funnel: students who signed up in the range, each step with its count', () => {
    expect(d.funnel.map(f => [f.step, f.n, f.of])).toEqual([
      ['Signed up', 4, 4], ['Chose a starting point', 2, 4], ['First drill set', 2, 4], ['First full case', 1, 4],
      ['Read the report', 1, 4], ['Came back another day', 2, 4],
    ]);
  });
  it('weekly cohorts: active in weeks 1–4, blank until the week is over', () => {
    const nov2 = d.cohorts.find(c => c.week === '2026-11-02')!;
    expect(nov2.n).toBe(2);
    expect(nov2.weeks[0]).toMatchObject({ n: 1, of: 2 });    // A
    expect(nov2.weeks[1]).toMatchObject({ n: 1, of: 2 });    // A again
    expect(nov2.weeks[2]).toBeNull();                         // ends 23–24 Nov
    expect(d.cohorts.find(c => c.week === '2026-10-12')!.weeks[3]).toMatchObject({ n: 1, of: 2 });   // C
  });
  it('traffic: views, visitors (and those who signed up), students, sessions split by 30 idle minutes', () => {
    const w = d.traffic.find(x => x.week === '2026-11-09')!;
    expect(w).toMatchObject({ views: 6, visitors: 2, visitorsWhoSignedUp: 1, students: 1 });
    // A: 15:00 + 15:10, then 16:00 (50 min later: a new session); v1: two views; v2: one.
    expect(w.sessions).toBe(4);
    expect(w.pagesPerSession).toBe(1.5);
    expect(w.avgSessionMinutes).toBeCloseTo((10 + 0 + 2 + 0) / 4);
    expect(d.topPages[0]).toEqual({ path: '/drills', views: 2 });
  });
  it('learning: skills reaching each state; case to case by dimension at the same level', () => {
    const w = d.learning.find(x => x.week === '2026-11-09')!;
    expect(w).toMatchObject({ practiced: 1, mastered: 1, validated: 0 });
    expect(w.dimensions).toEqual({ structure: { up: 1, same: 0, down: 0 }, quantitative: { up: 0, same: 1, down: 0 } });
  });
  it('next steps: shown → clicked → practised → the dimension went up in the next same-level case', () => {
    const w = d.nextSteps.find(x => x.week === '2026-11-02')!;
    expect(w.shown).toBe(2);
    expect(w.clicked).toMatchObject({ n: 1, of: 2 });
    expect(w.practiced).toMatchObject({ n: 1, of: 2 });
    expect(w.improved).toMatchObject({ n: 1, of: 1 });   // structure: needs work → adequate
    expect(dimensionOf('PS.mece')).toBe('structure');
  });
  it('reliability: cases finished, voice failures, errors per active student, disputes per 100 graded', () => {
    const w = d.reliability.find(x => x.week === '2026-11-09')!;
    expect(w.cases).toMatchObject({ n: 1, of: 2 });
    expect(w.voiceFailed).toMatchObject({ n: 1, of: 1, kinds: { no_interviewer: 1 } });
    expect(w.errorsPerStudent).toBe(1.5);
    expect(w.disputesPer100).toEqual({ per100: 25, disputes: 1, graded: 4 });
  });
  it('cost: per active student per month over four weeks, drills and cases apart', () => {
    const w = d.cost.find(x => x.week === '2026-11-09')!;
    expect(w.students).toBe(2);
    expect(w.drills).toBeCloseTo((0.4 / 2) * (30 / 28));
    expect(w.cases).toBeCloseTo((1.96 / 2) * (30 / 28));
  });
  it('reach: sign-ups and active students by club; wrong club codes', () => {
    const i = d.weeks.indexOf('2026-11-09');
    expect(d.reach.clubs.find(c => c.org === 'wharton')!.weeks[i]).toEqual({ signUps: 0, active: 1 });
    expect(d.reach.wrongCodes[i]).toBe(2);
  });
  it('limits: the share who hit the daily or monthly limit, of those who started a case or hit one', () => {
    expect(d.limits.find(x => x.week === '2026-11-09')!.daily).toMatchObject({ n: 1, of: 2 });
  });
  it('latest comments: the last 10, newest first', () => {
    expect(d.comments).toHaveLength(10);
    expect(d.comments[0].text).toBe('Comment 12');
  });
});

describe('the page', () => {
  const html = renderToStaticMarkup(createElement(PilotDashboard, { d, orgs: ['everview', 'wharton'], org: null, from: '2026-10-19', to: '2026-11-22', detailsHref: '/drills/reports?tab=details' }));
  it('five tiles with value, count, target, change and a status in words', () => {
    for (const t of ['Start', 'Come back', 'Use', 'Improve', 'Value']) expect(html).toContain(`aria-label="${t}"`);
    expect(html).toContain('1 of 2 activated within 7 days');
    expect(html).toContain('Finished a first case: 50% (1 of 2)');
    expect(html).toContain('Target 50%');
    expect(html).toMatch(/On target|Close|Below target/);
    expect(html).toContain('↑ 2 since last week');   // Value 2 → 4
  });
  it('every percentage carries its count', () => {
    const text = html.replace(/<[^>]+>/g, ' ');
    const bare = [...text.matchAll(/(\d+)%(?!\s*\(\d+ of \d+\))/g)].map(m => m[0]);
    // Allowed bare: the tile values (their counts are the next line) and targets.
    expect(bare.filter(b => !['100%', '50%', '30%'].includes(b))).toEqual([]);
  });
  it('no answers, transcripts or names', () => {
    expect(html).not.toMatch(/transcript|candidate said|@/i);
  });
  it('the filters and the Details tab', () => {
    expect(html).toContain('name="org"');
    expect(html).toContain('name="from"');
    expect(html).toContain('name="to"');
    expect(html).toContain('href="/drills/reports?tab=details"');
  });
});

describe('page views (cookie-free)', () => {
  it('paths without queries, ids as :id; never the API, assets or dev pages', () => {
    expect(normalizePath('/case/0b8f5a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b/report?x=1')).toBe('/case/:id/report');
    expect(normalizePath('/drills/')).toBe('/drills');
    expect(normalizePath('/')).toBe('/');
    for (const p of ['/api/pv', '/_next/x', '/dev/ui-preview', 'https://evil', 42]) expect(normalizePath(p)).toBeNull();
  });
  it('skips bots and requests with no browser', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')).toBe(false);
  });
  it('a visitor\'s code is stable within a day and changes the next; never the address itself', () => {
    const a = visitorCode('1.2.3.4', 'UA', new Date('2026-11-10T15:00:00Z'), 's');
    expect(visitorCode('1.2.3.4', 'UA', new Date('2026-11-10T22:00:00Z'), 's')).toBe(a);
    expect(visitorCode('1.2.3.4', 'UA', new Date('2026-11-11T15:00:00Z'), 's')).not.toBe(a);
    expect(visitorCode('1.2.3.5', 'UA', new Date('2026-11-10T15:00:00Z'), 's')).not.toBe(a);
    expect(a).not.toContain('1.2.3.4');
    expect(a).toMatch(/^[\w-]{22}$/);
  });
});
