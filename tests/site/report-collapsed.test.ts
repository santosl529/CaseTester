// The report's skill areas start collapsed (Matt, 22 Nov 2026): each shows its name and grade with "Show feedback";
// opening it shows the same feedback as before. Native <details>, so keyboards and screen readers get a disclosure.
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/case', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/db/client', () => ({ db: {} }));
import { CASE_SCREENS } from '@/app/dev/ui-preview/_data/case';

const html = renderToStaticMarkup((CASE_SCREENS.find(s => s.slug === 'report')!.render() as { node: ReactNode }).node);

describe('the report\'s skill areas', () => {
  // The skill-area cards (the page has another disclosure: the transcript or survey).
  const cards = [...html.matchAll(/<details class="group">([\s\S]*?)<\/details>/g)].map(m => m[1]).filter(c => c.includes('Show feedback'));
  it('each is a closed disclosure with its name, grade and "Show feedback" in the summary', () => {
    expect(cards.length).toBe(8);
    for (const c of cards) {
      const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(c)![1];
      expect(summary).toMatch(/strong|adequate|needs work|not assessed|unrated/i);
      expect(summary).toContain('Show feedback');
    }
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });
  it('the feedback itself is unchanged, inside each disclosure', () => {
    expect(cards.some(c => c.includes('What went well'))).toBe(true);
    expect(cards.some(c => c.includes('What needs work'))).toBe(true);
  });
  it('says the areas open', () => {
    expect(html).toContain('Select a skill area to see your detailed feedback.');
  });
});
