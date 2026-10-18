// Terms said as words, in the TTS text only (Lorenzo's brief, 17 Oct): "COGS"
// → "cogs", "MECE" → "mee-see"; the heard cursor stays on the written line.
import { describe, it, expect } from 'vitest';
import { speechTextFor, WordFolder } from '@/lib/voice/pronounce';

describe('speechTextFor', () => {
  it.each([
    ['COGS rose 16 points.', 'cogs rose 16 points.'],
    ['Is that split MECE?', 'Is that split mee-see?'],
    ['Is it Mece? Is it mece, or MECE.', 'Is it mee-see? Is it mee-see, or mee-see.'],
    ["Beans were 25% of COGS, and COGS' share grew.", "Beans were 25% of cogs, and cogs' share grew."],
    ['Brew & Bean, the US, $480M, 10–12%.', 'Brew & Bean, the US, $480M, 10–12%.'],
    ['cogs and Cogs stay as written; COGSY is no term.', 'cogs and Cogs stay as written; COGSY is no term.'],
  ])('%s', (written, spoken) => expect(speechTextFor(written).text).toBe(spoken));
  it('one spoken token per written token; spacing kept', () => {
    expect(speechTextFor('Is  that MECE?')).toEqual({ text: 'Is  that mee-see?', counts: [1, 1, 1] });
  });
});

describe('WordFolder', () => {
  const w = (word: string, startMs: number, endMs: number) => ({ word, startMs, endMs });
  it('skips the connector, then one word per written token', () => {
    const f = new WordFolder([1, 1], 1);
    expect(f.push([w('So,', 0, 200), w('cogs', 200, 400)])).toEqual([w('cogs', 200, 400)]);
    expect(f.push([w('rose.', 400, 600)])).toEqual([w('rose.', 400, 600)]);
  });
  it('a token said as two words folds into one, across chunks: start of the first, end of the last', () => {
    const f = new WordFolder([1, 2, 1]);
    expect(f.push([w('Is', 0, 100), w('mee', 100, 200)])).toEqual([w('Is', 0, 100)]);
    expect(f.push([w('see?', 200, 350), w('Next', 350, 500)])).toEqual([w('mee see?', 100, 350), w('Next', 350, 500)]);
  });
  it('words past the map pass one by one', () => {
    const f = new WordFolder([1]);
    expect(f.push([w('a', 0, 1), w('b', 1, 2)])).toEqual([w('a', 0, 1), w('b', 1, 2)]);
  });
});
