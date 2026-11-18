// Exhibit clarity (Matt, 17 Nov; approved with his edits): units and bases on every exhibit, by header labels that are
// display only (`columnLabels`), clearer titles, row labels and notes. Never a number; the column names the checks match
// on stay as they were.
import { describe, it, expect } from 'vitest';
import { CaseSchema } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';
import { exhibitDisplay } from '@/lib/orchestrator/turn-types';

const ex = (caseId: string, id: string) => getCaseById(caseId).exhibits.find(e => e.id === id)!;

describe('columnLabels (display only)', () => {
  const lark = getCaseById('prof-002');
  const withLabels = (columnLabels: Record<string, string>) => ({ ...lark, exhibits: lark.exhibits.map((e, i) => (i === 0 ? { ...e, columnLabels } : e)) });
  it('a label for a column the exhibit has is accepted', () => {
    expect(CaseSchema.safeParse(withLabels({ 'Revenue FY2023': 'Revenue FY2023 ($M)' })).success).toBe(true);
  });
  it('a label for a column it does not have is refused', () => {
    expect(CaseSchema.safeParse(withLabels({ 'Revenue FY2024': 'Revenue FY2024 ($M)' })).success).toBe(false);
  });
  it('a label may not add a figure its column name lacks', () => {
    expect(CaseSchema.safeParse(withLabels({ 'Revenue FY2023': 'Revenue FY2023 ($M, 12 months)' })).success).toBe(false);
  });
  it('reaches the browser; the interpretation key and ledger links never do', () => {
    const d = exhibitDisplay(ex('prof-002', 'exhibit-1'));
    expect(d.columnLabels?.['Revenue FY2023']).toBe('Revenue FY2023 ($M)');
    expect(JSON.stringify(d)).not.toMatch(/interpretationKey|coversLedgerItems|whole decline/);
  });
});

describe('the approved changes, in the case files', () => {
  it('Brew & Bean (and its demo): a short title saying what the figures are; headers as they were but "Year"', () => {
    for (const id of ['prof-001', 'prof-001-demo']) {
      const e = ex(id, 'exhibit-a');
      expect(e.title).toBe('Brew & Bean — Cost structure (% of revenue), by year');
      expect(e.columnLabels).toEqual({ year: 'Year' });
      expect(e.notes).toBe("Each figure is a share of that year's revenue; a year's four figures together make up all of its revenue.");
      expect(`${e.title} ${e.notes}`).not.toMatch(/points/i);
    }
  });
  it('Larkspur: $M on the money columns; the network rows explained in plain words; per flight on the cost rows', () => {
    const e1 = ex('prof-002', 'exhibit-1');
    expect(Object.values(e1.columnLabels ?? {}).every(l => l.endsWith('($M)'))).toBe(true);
    expect(e1.notes).toContain('The Fixed costs and Operating profit rows, at the bottom of the contribution columns, are for the whole network, not one route.');
    const e2 = ex('prof-002', 'exhibit-2');
    expect(e2.title).not.toMatch(/\(\$\)/);
    expect((e2.data as Record<string, unknown>[]).map(r => r.Item).filter(i => /per flight\)$/.test(String(i)))).toHaveLength(4);
  });
  it('Quillpath: % on the cohort months; customers and per month where they were bare', () => {
    expect(Object.values(ex('pricing-001', 'exhibit-2').columnLabels ?? {})).toEqual(['Month 0 (%)', 'Month 1 (%)', 'Month 3 (%)', 'Month 6 (%)', 'Month 12 (%)']);
    expect(ex('pricing-001', 'exhibit-4').columnLabels).toEqual({ 'Starter price': 'Starter price (per month)' });
    expect(ex('pricing-001', 'exhibit-1').columnLabels).toEqual({ '': 'Per customer' });
  });
  it('kept traps: the cohort rows still read "Still on Starter" and "Cancelled"; Hollis Bay still says $3.99 and "already spent"', () => {
    const rows = (ex('pricing-001', 'exhibit-2').data as Record<string, unknown>[]).map(r => r.Status);
    expect(rows).toContain('Still on Starter');
    expect(rows).toContain('Cancelled');
    const bag = ex('launch-001', 'exhibit-1');
    expect(bag.notes).toContain('$3.99');
    expect(JSON.stringify(bag.data)).toContain('already spent last year');
  });
});
