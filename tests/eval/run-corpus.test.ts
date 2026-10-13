import { describe, it, expect } from 'vitest';
import { splitByLedger } from '@/lib/eval/run-corpus';

const ledger = [
  { id: 'cogs_pct', value: 'COGS is 58% of revenue today, up from 42% two years ago.' },
  { id: 'menu_price_change', value: 'Menu prices have not changed in two years.' },
  { id: 'avg_ticket', value: 'The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit.' },
];

describe('splitByLedger (records before turn files)', () => {
  it('cuts code\'s data lines out of a heard line by the ledger\'s wording, with their ids', () => {
    const segs = splitByLedger('Okay. Menu prices have not changed in two years. On what you asked for: COGS is 58% of revenue today, up from 42% two years ago. What does that tell you?', ledger);
    expect(segs.map(s => s.kind)).toEqual(['text', 'data', 'text']);
    expect(segs[1].ids).toEqual(['menu_price_change', 'cogs_pct']);
    expect(segs[2].text).toBe('What does that tell you?');
  });
  it('finds an older, shorter wording of a value (before 14 Sep)', () => {
    const segs = splitByLedger('The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase. Why?', ledger);
    expect(segs[0]).toMatchObject({ kind: 'data', ids: ['avg_ticket'] });
    expect(segs[1].text).toBe('Why?');
  });
  it('leaves model text that only mentions the figures alone', () => {
    expect(splitByLedger('COGS rose from 42% to 58% of revenue.', ledger).map(s => s.kind)).toEqual(['text']);
  });
});
