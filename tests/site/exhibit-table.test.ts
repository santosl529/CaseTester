// The exhibit table's layout (Matt, 17 Nov, exhibit clarity): header labels, figures on one line, words wrapping, the
// first column held in place, and the scroll cue's rule.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExhibitTable, FIGURE, SCROLL_CUE, keepsOnOneLine, moreToTheRight } from '@/components/exhibit-table';
import { exhibitDisplay } from '@/lib/orchestrator/turn-types';
import { getCaseById } from '@/lib/cases/loader';

const html = (caseId: string, id: string) => renderToStaticMarkup(createElement(ExhibitTable, { exhibit: exhibitDisplay(getCaseById(caseId).exhibits.find(e => e.id === id)!) }));

describe('ExhibitTable', () => {
  it('headers show the display label, the data keeps its column name', () => {
    const h = html('prof-002', 'exhibit-1');
    expect(h).toContain('>Revenue FY2023 ($M)</th>');
    expect(h).not.toContain('>Revenue FY2023</th>');
  });
  it('a figure stays on one line; words wrap; the first column is held in place', () => {
    const h = html('entry-001', 'exhibit-3');
    expect(h).toMatch(/<td class="[^"]*whitespace-nowrap[^"]*">\$80 million<\/td>/);
    expect(h).toMatch(/<td class="[^"]*min-w-\[8rem\][^"]*">Aldermoor/);
    expect(h).toMatch(/<th class="[^"]*sticky left-0[^"]*">Term<\/th>/);
  });
  it('what counts as a figure', () => {
    for (const f of ['$1,200', '(1.2)', '75%', '2,000', '$3.0 million', '38.0']) expect(FIGURE.test(f)).toBe(true);
    for (const w of ['Hub–Lakeport', 'Demo with a salesperson', '12–18 months', 'About 6 months']) expect(FIGURE.test(w)).toBe(false);
    // Short labels stay on one line too (Brew & Bean's "2 years ago": no wider on a phone than before); long text wraps.
    expect(keepsOnOneLine('2 years ago')).toBe(true);
    expect(keepsOnOneLine('Demo with a salesperson')).toBe(false);
  });
  it('the cue shows only while more lies to the right, and not before the page measures it', () => {
    expect(moreToTheRight(800, 300, 0)).toBe(true);
    expect(moreToTheRight(800, 300, 499)).toBe(false);
    expect(moreToTheRight(300, 300, 0)).toBe(false);
    expect(SCROLL_CUE).toBe('Swipe to see more');
    expect(html('prof-002', 'exhibit-1')).not.toContain(SCROLL_CUE);
  });
});
