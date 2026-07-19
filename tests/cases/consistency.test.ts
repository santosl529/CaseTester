import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { TOTAL_CASE_MS } from '@/lib/orchestrator/state-machine';

// Pre-flight ledger consistency gate (docs/case-authoring.md).
// Every case needs a block here reconciling its prompt figures, data ledger,
// exhibits, and math steps against each other. A case whose numbers don't
// reconcile teaches candidates wrong math and forces the interviewer to
// ratify contradictions — caught here, before the case can ship.

describe('case ledger consistency: prof-001', () => {
  const c = getCaseById('prof-001');
  const exhibit = c.exhibits.find(e => e.id === 'exhibit-a')!;
  const step = (id: string) => c.mathSteps.find(m => m.id === id)!;

  it('exhibit cost structure sums to 100% every year', () => {
    for (const row of exhibit.data) {
      const total = Number(row.COGS) + Number(row.Labor) + Number(row.Overhead) + Number(row.Profit);
      expect(total, `year "${row.year}" sums to ${total}`).toBe(100);
    }
  });

  it('prompt margin figures match the exhibit P&L', () => {
    const priorProfit = Number(exhibit.data[0].Profit);
    const currentProfit = Number(exhibit.data[exhibit.data.length - 1].Profit);
    expect(c.prompt).toContain(`from ${priorProfit}% to ${currentProfit}%`);
  });

  it('margin math steps match the exhibit P&L', () => {
    expect(step('profit_margin_prior').answer).toBe(Number(exhibit.data[0].Profit));
    expect(step('profit_margin_now').answer).toBe(Number(exhibit.data[exhibit.data.length - 1].Profit));
  });

  it('ledger percentages match the exhibit current/prior years', () => {
    // cogs_pct: "58% of revenue (up from 42% two years ago)"
    const cogs = c.dataLedger.find(d => d.id === 'cogs_pct')!.value;
    expect(cogs).toContain(`${exhibit.data[2].COGS}%`);
    expect(cogs).toContain(`${exhibit.data[0].COGS}%`);
    const overhead = c.dataLedger.find(d => d.id === 'overhead_pct')!.value;
    expect(overhead).toContain(`${exhibit.data[2].Overhead}%`);
    expect(overhead).toContain(`${exhibit.data[0].Overhead}%`);
    const labor = c.dataLedger.find(d => d.id === 'labor_pct')!.value;
    expect(labor).toContain(`${exhibit.data[2].Labor}%`);
  });

  it('revenue per store reconciles with total revenue and store count', () => {
    // $480M / 200 stores = $2.4M
    expect(step('revenue_per_store_check').answer).toBeCloseTo(480 / 200, 5);
    expect(c.dataLedger.find(d => d.id === 'revenue_total')!.value).toContain('$480M');
    expect(c.dataLedger.find(d => d.id === 'stores_count')!.value).toContain('200');
    expect(c.dataLedger.find(d => d.id === 'revenue_per_store')!.value).toContain('$2.4M');
  });

  it('COGS dollar impact (margin-impact framing) = COGS pp increase × current revenue', () => {
    const ppIncrease = Number(exhibit.data[2].COGS) - Number(exhibit.data[0].COGS); // 16pp
    expect(step('cogs_dollar_impact').answer).toBeCloseTo((ppIncrease / 100) * 480, 1);
  });

  it('COGS dollar impact alt answer = actual COGS spend increase (uses 2-yr-ago revenue)', () => {
    // 480×0.58 − (480/1.15)×0.42 — the defensible "actual spend increase" figure
    const actualSpendIncrease = 480 * (Number(exhibit.data[2].COGS) / 100)
      - (480 / 1.15) * (Number(exhibit.data[0].COGS) / 100);
    const alt = step('cogs_dollar_impact').altAnswers?.[0];
    expect(alt).toBeCloseTo(actualSpendIncrease, 0);
  });

  it('phase budgets (Rule 8 pacing config), if present, sum to the total case time', () => {
    const budgets = c.pacing?.phaseBudgetsMs;
    if (!budgets) return; // pacing config is optional; nothing to reconcile
    const sum = Object.values(budgets).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBe(TOTAL_CASE_MS);
  });
});
