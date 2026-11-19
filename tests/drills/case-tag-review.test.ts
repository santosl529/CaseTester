import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { CaseTagReviewScreen, type ReviewRun } from '@/components/drills/views/case-tag-review';

const run: ReviewRun = {
  sessionId: 's1', caseTitle: 'Larkspur Air Route Profitability', createdAt: '2026-11-16', mode: 'shadow', status: 'built', error: null, costUsd: 0.041,
  findings: [{ name: 'overlapping buckets (MECE structure)', severity: 'major', evidence: 'revenue, costs and pricing' }],
  prescriptions: [{ skill: 'MECE structure', reason: 'Two of your buckets overlapped. In your last case you said, “revenue, costs and pricing.”' }],
  observed: ['MECE structure'],
  points: [
    { id: 'structure:0', group: 'structure', rating: 'needs_work', point: 'Pricing overlaps revenue.', quotes: ['revenue, costs and pricing'], tag: 'M.overlapping_buckets', tagName: 'overlapping buckets (MECE structure)', reason: 'S4', drill: true, severity: 'major', note: null },
    { id: 'dataExhibit:0', group: 'dataExhibit', rating: 'meets_bar', point: 'Misread the chart.', quotes: ['volume was flat'], tag: 'M.misread_trend', tagName: 'misread trend (Chart takeaway)', reason: 'X1', drill: false, severity: null, note: 'group switched off: shown on the report with no drill' },
  ],
  checker: [], labels: { 'dataExhibit:0': null }, read: false,
};

describe('the shadow review page', () => {
  const html = renderToStaticMarkup(createElement(CaseTagReviewScreen, { runs: [run], read: 0, since: '2026-11-16', tags: [{ id: 'M.overlapping_buckets', name: 'overlapping buckets (MECE structure)' }, { id: 'M.misread_trend', name: 'misread trend (Chart takeaway)' }] }));
  it('shows progress toward 20 reports and when shadow started', () => {
    expect(html).toContain('0 of 20 real reports read');
    expect(html).toContain('Shadow since 2026-11-16');
  });
  it('shows each point with the tagger’s tag, whether its group gives a drill, and a labeled control', () => {
    expect(html).toContain('no drill (group off)');
    expect(html).toContain('overlapping buckets (MECE structure)');
    expect(html).toContain('Your label for this point');
    expect(html).toMatch(/<caption class="sr-only">Tagged points and your labels<\/caption>/);
  });
  it('starts each label from the saved label, else the tagger’s tag', () => {
    // structure:0 has no saved label: the tagger's tag is selected.
    expect(html).toMatch(/<option value="M.overlapping_buckets" selected="">/);
  });
});
