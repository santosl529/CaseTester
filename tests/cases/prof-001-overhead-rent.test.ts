// Lorenzo, 15 Oct (batch-26 fix 5): the spoken overhead line says "overhead
// and rent". Batch 26 Blake 4755c03a heard "Overhead is 14%…" at t14, was told
// "I haven't given you rent data" at t16, and the t18 pointer called it "the
// overhead and rent line you were given" (from the label "Overhead / rent").
import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { findMisquotes, correctionLine, type QuoteAnchor } from '@/lib/orchestrator/misquote';
import { buildFactBase, findFalseFacts } from '@/lib/orchestrator/fact-check';

const prof = getCaseById('prof-001');
const overhead = prof.dataLedger.find(d => d.id === 'overhead_pct')!;
const ctx = { anchors: prof.quoteAnchors as QuoteAnchor[], ledger: prof.dataLedger, revealedIds: new Set(['cogs_pct', 'labor_pct', 'overhead_pct']), exhibitColumns: {} };

describe('prof-001 overhead and rent', () => {
  it('the data line and the spoken name say rent, as the label does', () => {
    expect(overhead.value).toBe('Overhead and rent are 14% of revenue, up slightly from 12%.');
    expect((overhead as { spoken?: string }).spoken).toBe('overhead and rent as a percent of revenue');
    expect(overhead.label).toMatch(/Overhead \/ rent/);
  });
  it('a misquote in the new words is caught; the correction is the line itself', () => {
    expect(findMisquotes('Overhead and rent went from 12% to 16% of revenue.', ctx).map(m => m.item)).toEqual(['overhead_pct']);
    expect(findMisquotes('Overhead and rent went from 12% to 14% of revenue.', ctx)).toEqual([]);
    expect(findMisquotes('Overhead went from 12% to 16% of revenue.', ctx).map(m => m.item)).toEqual(['overhead_pct']);
    expect(correctionLine(overhead.value)).toBe('To correct one figure: overhead and rent are 14% of revenue, up slightly from 12%.');
  });
  it('the truth check reads the new line: a wrong figure is false, the right one passes', () => {
    const fb = buildFactBase(prof as never);
    expect(findFalseFacts('Overhead and rent are 16% of revenue.', fb, new Set(['overhead_pct']))).toHaveLength(1);
    expect(findFalseFacts('Overhead and rent are 14% of revenue, up from 12%.', fb, new Set(['overhead_pct']))).toHaveLength(0);
  });
});
