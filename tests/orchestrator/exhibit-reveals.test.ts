import { describe, it, expect } from 'vitest';
import { createLedger, reveal, markExhibitReveals } from '@/lib/orchestrator/data-ledger';

// Live run db41a01e: the cost exhibit showed COGS 42 → 58, but the ledger still
// counted cogs_pct as unreleased, so the Rule 11 force-release re-read "COGS is
// 58% of revenue…" to a candidate who had been working from it for a minute.
const items = [
  { id: 'cogs_pct', label: 'COGS %', value: 'COGS is 58% of revenue today, up from 42% two years ago.', releaseWhen: 'ANALYSIS' as const },
  { id: 'labor_pct', label: 'Labor %', value: 'Labor is 22% of revenue, and it has been stable.', releaseWhen: 'ANALYSIS' as const },
  { id: 'bean_price_change', label: 'Bean price change', value: 'Raw coffee bean costs are up 40% over the past two years.', releaseWhen: 'EXHIBIT' as const },
];

describe('markExhibitReveals', () => {
  it('marks the ledger items an exhibit displays as revealed and returns the newly revealed ids', () => {
    const ledger = createLedger(items);
    expect(markExhibitReveals(ledger, { coversLedgerItems: ['cogs_pct', 'labor_pct'] })).toEqual(['cogs_pct', 'labor_pct']);
    expect([...ledger.revealed].sort()).toEqual(['cogs_pct', 'labor_pct']);
  });

  it('skips items already revealed and ids not in the ledger', () => {
    const ledger = createLedger(items);
    reveal(ledger, 'cogs_pct');
    expect(markExhibitReveals(ledger, { coversLedgerItems: ['cogs_pct', 'not_in_ledger', 'labor_pct'] })).toEqual(['labor_pct']);
  });

  it('does nothing for an exhibit that declares no coverage', () => {
    const ledger = createLedger(items);
    expect(markExhibitReveals(ledger, {})).toEqual([]);
    expect(ledger.revealed.size).toBe(0);
  });
});
