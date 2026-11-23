// Every drill and lesson named on the student pages carries its kind (Matt, 22 Nov 2026, option A): a small
// "DRILL" or "LESSON" pill before the name. Buttons and sentences that already say "set" or "lesson" don't.
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/drills', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/db/client', () => ({ db: {} }));
import { DRILL_SCREENS } from '@/app/dev/ui-preview/_data/drills';
import { CASE_SCREENS } from '@/app/dev/ui-preview/_data/case';
import { SET_SCREENS } from '@/app/dev/ui-preview/_data/sets';

const SCREENS = [...DRILL_SCREENS, ...CASE_SCREENS, ...SET_SCREENS];
const html = (slug: string) => renderToStaticMarkup((SCREENS.find(s => s.slug === slug)!.render() as { node: ReactNode }).node).replace(/&amp;/g, '&');
const tagged = (h: string, kind: 'Drill' | 'Lesson', name: string) => new RegExp(`>${kind}</span> (<[^>]+>)*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(h);

describe('DRILL and LESSON before every drill and lesson named', () => {
  it('Today: the workout, the extras, Suggested next, the unfinished set, the intro lesson', () => {
    expect(tagged(html('training-home'), 'Drill', 'Spot the gap')).toBe(true);
    expect(tagged(html('training-home-done'), 'Drill', 'Sanity check')).toBe(true);
    expect(tagged(html('training-home-self'), 'Drill', '')).toBe(true);
    expect(tagged(html('training-home'), 'Drill', 'Mental math · 2 of 6 done')).toBe(true);
    expect(tagged(html('training-home-intro'), 'Lesson', 'Start here: how a case interview works')).toBe(true);
  });
  it('Browse: each drill card and the set in progress', () => {
    expect(tagged(html('browse'), 'Drill', 'Framework builder')).toBe(true);
    expect(tagged(html('browse'), 'Drill', 'Chart read')).toBe(true);
  });
  it('Learn and a lesson: each lesson row, the lesson title, the drills it\'s practised in', () => {
    expect(html('learn').match(/>Lesson<\/span>/g)?.length ?? 0).toBeGreaterThan(5);
    expect(html('lesson')).toMatch(/>Lesson<\/span>/);
    expect(html('lesson')).toMatch(/>Drill<\/span>/);
  });
  it('the diagnostic, your plan, a set, its results, a set set aside', () => {
    for (const slug of ['diagnostic', 'plan', 'drill-set', 'drill-results', 'drill-set-aside']) expect(html(slug), slug).toMatch(/>Drill<\/span>/);
  });
  it('the report\'s next steps: each practice set', () => {
    expect(tagged(html('report-next-steps'), 'Drill', 'Mental math · Level 2')).toBe(true);
  });
  it('not inside buttons', () => {
    for (const slug of ['training-home', 'browse', 'report-next-steps']) {
      expect(html(slug), slug).not.toMatch(/<button[^>]*>[^<]*<span[^>]*>(Drill|Lesson)<\/span>/);
    }
  });
});
