// The Cases page (/home): what its header and cards say (pre-pilot audit, 17 Nov).
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/home', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { HomeView } from '@/components/home-view';
import type { CaseCard } from '@/components/case-list';

const cases: CaseCard[] = [
  { id: 'prof-002', title: 'Larkspur Air Route Profitability', difficulty: 'easy', caseType: 'profitability', minutes: 25, done: 0, last: null, first: true },
  { id: 'prof-001', title: 'Brew & Bean Profitability', difficulty: 'medium', caseType: 'profitability', minutes: 20, done: 0, last: null },
];
const render = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(HomeView, { cases, past: [], left: null, ...extra }));

describe('Cases page header (N3)', () => {
  it('gives no length in the header; each card gives its own', () => {
    const html = render();
    const header = html.slice(html.indexOf('Start a case'), html.indexOf('Larkspur'));
    expect(header).not.toMatch(/minute/);
    expect(header).toContain('A full interviewer-led case. You get a scored feedback report at the end.');
    expect(html).toContain('about 25 min');
    expect(html).toContain('about 20 min');
  });
});
