// Exhibit notes (new cases, 13 Oct): the PDFs' footnotes reach the screen under
// the table — in the turn result Settle returns, and in the shared table.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExhibitTable } from '@/components/exhibit-table';

describe('exhibit notes on screen', () => {
  const exhibit = { id: 'exhibit-1', title: 'Results by route', chartType: 'table', data: [{ Route: 'Hub–Lakeport', Revenue: 16.8 }] };
  it('are shown under the table', () => {
    const html = renderToStaticMarkup(createElement(ExhibitTable, { exhibit: { ...exhibit, notes: 'Parentheses denote negative values.' } }));
    expect(html).toMatch(/<\/table><\/div><p[^>]*>Parentheses denote negative values\.<\/p>/);
  });
  it('an exhibit without notes has no notes line', () => {
    expect(renderToStaticMarkup(createElement(ExhibitTable, { exhibit }))).not.toMatch(/<p/);
  });
});
