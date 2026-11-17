// M3 (Matt, 17 Nov): Continue on Cases → Past sessions while the case's time lasts, and on Today; once time is up the
// row shows as ended, with Get my report when a report can be made.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/home', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { PastSessionList } from '@/components/case-list';
import { interviewClock } from '@/lib/site/interview-clock';

const at = new Date('2026-11-17T10:00:00Z');
const min = 60_000;

describe('interviewClock', () => {
  it('running until the case’s time is used, then time up (with or without a report)', () => {
    expect(interviewClock(at, {}, 25 * min, new Date(at.getTime() + 24 * min + 1))).toEqual({ state: 'running', minutesLeft: 1 });
    expect(interviewClock(at, {}, 25 * min, new Date(at.getTime() + 25 * min))).toEqual({ state: 'time_up', report: false });
    expect(interviewClock(at, { stall: { recommendationDelivered: true } }, 25 * min, new Date(at.getTime() + 26 * min))).toEqual({ state: 'time_up', report: true });
  });
});

describe('Past sessions rows', () => {
  const html = renderToStaticMarkup(createElement(PastSessionList, { past: [
    { id: 'a', date: 'Nov 17, 2026', caseTitle: 'Larkspur Air Route Profitability', status: 'In progress · about 12 min left', link: { href: '/case/a', label: 'Continue' } },
    { id: 'b', date: 'Nov 16, 2026', caseTitle: 'Hollis Bay Snacks New Product Launch', status: 'Ended (time ran out)', link: { href: '/case/b/report', label: 'Get my report', endFirst: true } },
    { id: 'c', date: 'Nov 15, 2026', caseTitle: 'Quillpath', status: 'Ended — no report', link: null },
  ] }));
  it('Continue is a link to the interview', () => {
    expect(html).toMatch(/<a[^>]*href="\/case\/a"[^>]*>Continue<\/a>/);
  });
  it('Get my report after time ran out is a button (it ends the interview first), not a link', () => {
    expect(html).toMatch(/<button[^>]*>Get my report<\/button>/);
    expect(html).not.toMatch(/href="\/case\/b\/report"/);
  });
  it('an ended one with nothing to report has no action', () => {
    expect(html).toContain('Ended — no report');
    expect(html.match(/<(a|button)\b/g)?.length).toBe(2);
  });
});

describe('Today', () => {
  it('an interview in progress leads the page with Continue, in both layouts, before a set to resume', async () => {
    const { DRILL_SCREENS } = await import('@/app/dev/ui-preview/_data/drills');
    for (const slug of ['training-home-interview', 'training-home-self-interview']) {
      const screen = DRILL_SCREENS.find(x => x.slug === slug)!;
      const html = renderToStaticMarkup((await screen.render()).node as React.ReactElement);
      const card = html.indexOf('Interview in progress');
      expect(card).toBeGreaterThan(-1);
      expect(html).toMatch(/<a[^>]*href="\/case\/preview-session"[^>]*>Continue<\/a>/);
      expect(html).toContain('about 12 min left');
      // First on the page after its heading: before any other card.
      expect(html.indexOf('<section', html.indexOf('</header>'))).toBe(html.lastIndexOf('<section', card));
    }
  });
  it('first week: the interview comes before How CasePace works', async () => {
    const { TrainingHome } = await import('@/components/drills/views/training-home');
    const { DRILL_SCREENS } = await import('@/app/dev/ui-preview/_data/drills');
    const first = (await DRILL_SCREENS.find(x => x.slug === 'training-home-first')!.render()).node as React.ReactElement<{ home: unknown }>;
    const html = renderToStaticMarkup(createElement(TrainingHome, { home: first.props.home as never, checkin: null, interview: { caseTitle: 'Larkspur', status: 'In progress · about 9 min left', href: '/case/x' } }));
    expect(html.indexOf('Interview in progress')).toBeGreaterThan(-1);
    expect(html.indexOf('Interview in progress')).toBeLessThan(html.indexOf('How CasePace works'));
  });
  it('no interview in progress: no card', async () => {
    const { DRILL_SCREENS } = await import('@/app/dev/ui-preview/_data/drills');
    const html = renderToStaticMarkup((await DRILL_SCREENS.find(x => x.slug === 'training-home')!.render()).node as React.ReactElement);
    expect(html).not.toContain('Interview in progress');
  });
});
