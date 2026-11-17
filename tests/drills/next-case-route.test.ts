// The drills "Next case" card (8 Nov audit: it redirected to the marketing page; 17 Nov pre-pilot audit M1: it sent
// listed cases to /start/<case>, which only serves the demo, so they 404'd). Every case the picker can return must
// land on a working page: the Cases page, with that case's card marked "Recommended for you".
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/drills/http', () => ({ requireStudent: async () => 'u1' }));
vi.mock('@/lib/drills/events', () => ({ logDrillEvent: async () => {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/home', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { GET } = await import('@/app/api/drills/next-case/route');
const { caseLibrary } = await import('@/lib/drills/program/next-case');
const { byDifficulty, listedCases, nextCaseHref, FIRST_CASE_ID } = await import('@/lib/cases/listed');
const { HomeView } = await import('@/components/home-view');
const { RECOMMENDED_LABEL } = await import('@/components/case-list');

const location = async (q: string) => {
  const res = await GET(new Request(`http://x/api/drills/next-case${q}`));
  const url = new URL(res.headers.get('location')!);
  return { path: url.pathname, case: url.searchParams.get('case'), hash: url.hash };
};

// The Cases page as /home renders it for a recommended case.
const casesPage = (recommended: string) => renderToStaticMarkup(createElement(HomeView, {
  cases: byDifficulty(listedCases()).map(c => ({ ...c, minutes: 25, done: 0, last: null, first: c.id === FIRST_CASE_ID, recommended: c.id === recommended })),
  past: [], left: null,
}));

describe('GET /api/drills/next-case (M1)', () => {
  it('the picker can return at least one case', () => { expect(caseLibrary().length).toBeGreaterThan(0); });

  for (const c of caseLibrary()) {
    it(`${c.id}: the Cases page with its card marked, never /start`, async () => {
      expect(await location(`?case=${c.id}`)).toEqual({ path: '/home', case: c.id, hash: '#cases' });
      expect(nextCaseHref(c.id)).not.toMatch(/^\/start\//);
      const html = casesPage(c.id);
      const card = html.slice(html.indexOf(`id="case-${c.id}"`), html.indexOf('</li>', html.indexOf(`id="case-${c.id}"`)));
      expect(card).toContain(RECOMMENDED_LABEL);
      expect(card).toContain(c.title.replace(/&/g, '&amp;'));
      expect(html.split(RECOMMENDED_LABEL).length - 1).toBe(1);
    });
  }

  it('an unknown or missing case: the cases on /home', async () => {
    expect(await location('?case=nope')).toEqual({ path: '/home', case: null, hash: '#cases' });
    expect(await location('')).toEqual({ path: '/home', case: null, hash: '#cases' });
  });

  it('the recommended card replaces "Good first case" on that card only', () => {
    const html = casesPage(FIRST_CASE_ID);
    expect(html).toContain(RECOMMENDED_LABEL);
    expect(html).not.toContain('Good first case');
    expect(casesPage('nope')).toContain('Good first case');
  });
});
