import { describe, it, expect } from 'vitest';
import { checkTimeframes } from '@/lib/orchestrator/timeframe-check';
import { getCaseById } from '@/lib/cases/loader';

const ledger = getCaseById('prof-001').dataLedger;
const revealed = ledger.filter(d => ['cogs_pct', 'bean_share_of_cogs', 'labor_pct', 'overhead_pct', 'bean_price_change'].includes(d.id));

describe('timeframe consistency (Rule 6 v4.6, log-only)', () => {
  it("flags Derek's 6:08 setup: 25% (prior) × 58% (current)", () => {
    const t = 'Let me be precise on the units. If beans are a quarter of COGS, and COGS is 58% of revenue, what is the bean line as a percent of revenue?';
    const out = checkTimeframes(t, revealed);
    expect(out).toHaveLength(1);
    expect(out[0].figures.map(f => f.period).sort()).toEqual(['current', 'prior']);
  });

  it('passes the same-period pairing', () => {
    expect(checkTimeframes('If beans are a quarter of COGS, and COGS is 42% of revenue, what is the bean line as a percent of revenue?', revealed)).toEqual([]);
  });

  it('passes read-outs and cross-period changes', () => {
    expect(checkTimeframes('COGS is 58% of revenue today, up from 42% two years ago.', revealed)).toEqual([]);
    expect(checkTimeframes('COGS went from 42% to 58% of revenue — what does that do to margin?', revealed)).toEqual([]);
  });

  it('ignores figures that belong to both periods (labor 22% is stable)', () => {
    expect(checkTimeframes('If labor is 22% of revenue and COGS is 58% of revenue, what is left?', revealed)).toEqual([]);
  });

  it('every prof-001 ledger item declares its timeframes', () => {
    for (const d of ledger) expect(d.timeframes, d.id).toBeDefined();
  });

  it('every timeframe key is a figure the ledger sentence states', () => {
    for (const d of ledger) for (const fig of Object.keys(d.timeframes ?? {})) expect(d.value, `${d.id}: ${fig}`).toContain(fig);
  });
});
