// The app's one navigation bar (Matt, 13 Nov 2026): six areas in a fixed
// order, and which one each page highlights.
import { describe, it, expect } from 'vitest';
import { NAV_LINKS, HOME_HREF, SETTINGS_HREF, navSectionFor, sectionHref } from '@/lib/site/nav';

describe('NAV_LINKS', () => {
  it('lists the six areas in order, each with its page', () => {
    expect(NAV_LINKS.map(l => [l.label, l.href])).toEqual([
      ['Today', '/drills'], ['Plan', '/drills/plan'], ['Learn', '/drills/learn'],
      ['Drills', '/drills/browse'], ['Cases', '/home'], ['Progress', '/drills/progress'],
    ]);
    expect(HOME_HREF).toBe('/drills');
    expect(SETTINGS_HREF).toBe('/drills/settings');
    expect(sectionHref('cases')).toBe('/home');
  });
});

describe('navSectionFor', () => {
  const cases: [string, ReturnType<typeof navSectionFor>][] = [
    // The six pages themselves.
    ['/drills', 'today'], ['/drills/plan', 'plan'], ['/drills/learn', 'learn'],
    ['/drills/browse', 'drills'], ['/home', 'cases'], ['/drills/progress', 'progress'],
    // Deeper pages highlight their area.
    ['/drills/learn/EX.takeaway', 'learn'], ['/drills/learn/intro', 'learn'],
    ['/drills/sets/abc', 'drills'], ['/drills/sets/abc/results', 'drills'],
    ['/case/abc', 'cases'], ['/case/abc/voice', 'cases'], ['/case/abc/report', 'cases'], ['/start/prof-001-demo', 'cases'],
    ['/drills/progress/QN.arithmetic', 'progress'], ['/drills/profile', 'progress'],
    // What the training home leads into.
    ['/drills/start', 'today'], ['/drills/questionnaire', 'today'], ['/drills/diagnostic', 'today'],
    // The account menu's page, and pages outside the six.
    ['/drills/settings', 'settings'], ['/drills/review/lessons', null], ['/drills/reports', null], ['/sign-in', null], ['/', null],
  ];
  it.each(cases)('%s → %s', (path, want) => expect(navSectionFor(path)).toBe(want));

  it('ignores a query, a hash and a trailing slash', () => {
    expect(navSectionFor('/drills/?x=1')).toBe('today');
    expect(navSectionFor('/home#cases')).toBe('cases');
    expect(navSectionFor('/drills/learn/?source=auto')).toBe('learn');
  });

  it('matches whole path segments only', () => {
    expect(navSectionFor('/homework')).toBe(null);
    expect(navSectionFor('/drills/planner')).toBe('today');
    expect(navSectionFor('/cases')).toBe(null);
  });
});
