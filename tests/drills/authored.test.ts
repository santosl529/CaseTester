import { describe, it, expect } from 'vitest';
import { loadAuthoredItems, parseAuthoredItems } from '@/lib/drills/authored';
import { getDrill } from '@/lib/drills/config';

describe('authored drill items (/drill-items)', () => {
  const items = loadAuthoredItems();

  it('all load and validate', () => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(getDrill(item.drill_id).item_source).not.toBe('generated');
  });

  it('ships only draft samples until reviewed content replaces them', () => {
    for (const item of items.filter(i => i.item_id.includes('-sample-'))) expect(item.status).toBe('draft');
  });

  const sample = () => structuredClone(items.find(i => i.drill_id === 'PS-1')!);
  const file = (drill: string, id: string) => `/x/drill-items/${drill}/${id}.json`;

  it('rejects an item filed under the wrong drill', () => {
    expect(() => parseAuthoredItems([{ file: file('HY-1', 'x'), raw: sample() }])).toThrow(/is filed under HY-1/);
  });

  it('rejects a duplicate item_id@version', () => {
    const a = sample();
    expect(() => parseAuthoredItems([{ file: file('PS-1', 'a'), raw: a }, { file: file('PS-1', 'b'), raw: a }])).toThrow(/Duplicate drill item/);
  });

  it('allows one reviewed worked example per drill', () => {
    const reviewed = (id: string) => ({
      ...sample(), item_id: id, is_example: true,
      authorship: { ...sample().authorship!, reviewed_by: 'Reviewer', reviewed_at: '2026-10-06' },
    });
    expect(parseAuthoredItems([{ file: file('PS-1', 'e1'), raw: reviewed('e1') }])).toHaveLength(1);
    expect(() => parseAuthoredItems([
      { file: file('PS-1', 'e1'), raw: reviewed('e1') },
      { file: file('PS-1', 'e2'), raw: reviewed('e2') },
    ])).toThrow(/two worked examples/);
  });

  it('rejects an unreviewed worked example', () => {
    expect(() => parseAuthoredItems([{ file: file('PS-1', 'e'), raw: { ...sample(), is_example: true } }])).toThrow(/must be a reviewed item/);
  });
});
