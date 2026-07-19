import { describe, it, expect } from 'vitest';
import { extractToolId } from '@/lib/agent/models/tool-input';

describe('extractToolId', () => {
  it('reads the expected key', () => {
    expect(extractToolId({ item_id: 'bean_price_change' }, 'item_id')).toBe('bean_price_change');
  });

  it('recovers the id when the model uses it as the KEY (the live crash)', () => {
    // Model sent { "bean_price_change": "bean_price_change" } — caused a 500.
    expect(extractToolId({ bean_price_change: 'bean_price_change' }, 'item_id')).toBe('bean_price_change');
  });

  it('recovers from an arbitrary string value', () => {
    expect(extractToolId({ id: 'cogs_pct' }, 'item_id')).toBe('cogs_pct');
  });

  it('falls back to the key when the value is not a string', () => {
    expect(extractToolId({ cogs_pct: true }, 'item_id')).toBe('cogs_pct');
  });

  it('trims whitespace', () => {
    expect(extractToolId({ item_id: '  cogs_pct  ' }, 'item_id')).toBe('cogs_pct');
  });

  it('returns undefined for empty / non-object input', () => {
    expect(extractToolId({}, 'item_id')).toBeUndefined();
    expect(extractToolId(null, 'item_id')).toBeUndefined();
    expect(extractToolId(undefined, 'item_id')).toBeUndefined();
    expect(extractToolId('nope', 'item_id')).toBeUndefined();
  });
});
