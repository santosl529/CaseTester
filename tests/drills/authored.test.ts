import { describe, it, expect } from 'vitest';
import { contentCheckProblems, loadAuthoredItems, parseAuthoredItems } from '@/lib/drills/authored';
import { lengthCueProblems, phraseCues, rulePlayer } from '@/lib/drills/content-checks';
import { getDrill } from '@/lib/drills/config';

describe('authored drill items (/drill-items)', () => {
  const items = loadAuthoredItems();

  it('all load and validate', () => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(getDrill(item.drill_id).item_source).not.toBe('generated');
  });

  it('never makes an unreviewed item live', () => {
    for (const item of items.filter(i => !i.authorship?.reviewed_by)) expect(item.status, item.item_id).toBe('draft');
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

  it('rejects an unreviewed worked example once it is live', () => {
    const unreviewed = { ...sample(), is_example: true, authorship: { ...sample().authorship!, reviewed_by: null, reviewed_at: null } };
    expect(parseAuthoredItems([{ file: file('PS-1', 'e'), raw: { ...unreviewed, status: 'draft' } }])).toHaveLength(1);
    expect(() => parseAuthoredItems([{ file: file('PS-1', 'e'), raw: { ...unreviewed, status: 'live' } }])).toThrow(/must be a reviewed item/);
  });

  it('keeps an item off live until it passes the similarity check', () => {
    const at = (similarity_check: string, status = 'live') => [{ file: file('PS-1', 'x'), raw: { ...sample(), status, authorship: { ...sample().authorship!, similarity_check } } }];
    expect(parseAuthoredItems(at('passed'))).toHaveLength(1);
    for (const s of ['pending', 'flagged', 'failed']) expect(() => parseAuthoredItems(at(s)), s).toThrow(/must pass the similarity check/);
    expect(parseAuthoredItems(at('flagged', 'in_review'))).toHaveLength(1);
    expect(() => parseAuthoredItems(at('not_applicable', 'draft'))).toThrow(/Authored items need a similarity check/);
  });

  it('gives no answer away through wording (length, phrases, rule player)', () => {
    expect(contentCheckProblems(items)).toEqual([]);
  });

  it('flags a pool where the right answer is usually the longest', () => {
    const pool = items.filter(i => i.drill_id === 'PS-1').map(i => ({
      ...i, options: i.options.map(o => (o.correct ? { ...o, text: `${o.text} — and this is the much longer, fully explained answer` } : o)),
    }));
    expect(lengthCueProblems(pool)).toEqual([expect.stringMatching(new RegExp(`^PS-1: the right answer is the longest option in ${pool.length} of ${pool.length} items`))]);
  });
});

describe('wording checks', () => {
  const pool = loadAuthoredItems().filter(i => i.drill_id === 'HY-1');
  // Every right answer gets the same tell-tale word.
  const marked = pool.map(i => ({ ...i, options: i.options.map(o => (o.correct ? { ...o, text: `Most likely, ${o.text}` } : o)) }));

  it('flags a phrase that only right answers use', () => {
    expect(phraseCues(marked)).toContainEqual(expect.objectContaining({ phrase: 'starts "most likely"', marks: 'right', right: pool.length }));
  });

  it('flags a phrase that only wrong answers use', () => {
    const wrong = pool.map(i => ({ ...i, options: i.options.map(o => (o.correct ? o : { ...o, text: `Recommend that ${o.text}` })) }));
    expect(phraseCues(wrong)).toContainEqual(expect.objectContaining({ phrase: 'starts "recommend that"', marks: 'wrong' }));
  });

  it('a solver that never reads the case beats a marked pool and not a clean one', () => {
    expect(rulePlayer(marked)[0].score).toBe(1);
    expect(rulePlayer(pool)[0].score).toBeLessThanOrEqual(0.4);
  });
});
