import { describe, it, expect } from 'vitest';
import { createLedger, canReveal, reveal, revealedValues, unrevealedLabels } from '@/lib/orchestrator/data-ledger';

const items = [
  { id: 'rev', label: 'Total revenue', value: '$480M', releaseWhen: 'CLARIFY' as const },
  { id: 'cogs', label: 'COGS %', value: '58%', releaseWhen: 'ANALYSIS' as const },
];

describe('data ledger', () => {
  it('cannot reveal before release phase', () => {
    const ledger = createLedger(items);
    expect(canReveal(ledger, 'cogs', 'CLARIFY')).toBe(false);
  });

  it('can reveal at release phase', () => {
    const ledger = createLedger(items);
    expect(canReveal(ledger, 'rev', 'CLARIFY')).toBe(true);
  });

  it('cannot re-reveal an already-revealed item', () => {
    const ledger = createLedger(items);
    reveal(ledger, 'rev');
    expect(canReveal(ledger, 'rev', 'ANALYSIS')).toBe(false);
  });

  it('reveal returns the value', () => {
    const ledger = createLedger(items);
    expect(reveal(ledger, 'rev')).toBe('$480M');
  });

  it('revealedValues returns only revealed items', () => {
    const ledger = createLedger(items);
    reveal(ledger, 'rev');
    expect(revealedValues(ledger)).toEqual({ rev: '$480M' });
  });

  it('unrevealedLabels excludes revealed items', () => {
    const ledger = createLedger(items);
    reveal(ledger, 'rev');
    expect(unrevealedLabels(ledger)).toEqual(['COGS %']);
  });

  it('reveal throws on unknown id', () => {
    const ledger = createLedger(items);
    expect(() => reveal(ledger, 'unknown')).toThrow('Unknown ledger item');
  });
});
