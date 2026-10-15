// Lorenzo, 14 Oct (batch-24 ruling 2): a figure is a quote of an anchored item
// only when stated as that item's fact. Targets, requirements and hypotheticals
// are not quotes (Marcus db0e42c3 t9: "I need revenue up about 28%" was
// "corrected" to the 15% growth). And Tyler 4228be02 t5's "it goes from 42% to
// about 54% today" (COGS, truly 58%) is a misread to catch.
import { describe, it, expect } from 'vitest';
import { factBaseFor, findCandidateMisquotes } from '@/lib/orchestrator/fact-check';
import { getCaseById } from '@/lib/cases/loader';

const fb = factBaseFor(getCaseById('prof-001') as never);
const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
const flags = (t: string) => findCandidateMisquotes(t, fb, new Set(COST), ['exhibit-a']).map(m => m.items[0]);

describe('a misread stated as the fact is caught', () => {
  it.each([
    ['COGS is the story: it goes from 42% to about 54% today, so roughly twelve points of margin, which is most of the eighteen-point decline.', 'cogs_pct'],  // Tyler t5
    ['COGS is the story: it goes from 42% to about 54% today, which is most of the eighteen-point decline.', 'cogs_pct'],
    ['Since COGS went from 42% to 54%, we need prices up.', 'cogs_pct'],     // the requirement comes after the fact
    ['Revenue grew about 11% on volume.', 'revenue_growth'],
  ])('%s', (text, item) => expect(flags(text)).toContain(item));
});

describe('targets, requirements and hypotheticals are not quotes', () => {
  it.each([
    'To get COGS back from 58 to roughly 45 points, I need revenue up about 28% at constant volume.',  // Marcus t9
    'Revenue would have to grow about 28% to restore the margin.',
    'To restore the old margin, revenue needs to be up about 28%.',
    'Revenue must rise about 28% at flat volume to get back to 24%.',
    'To get back to a 24% margin, COGS has to come down to about 40%.',
  ])('%s', text => expect(flags(text)).toEqual([]));
});

// "It" is the item named before it, else the last sentence's — never one named after the figure.
describe('the pronoun carries the item before it', () => {
  const two = (a: string, b: string) => findCandidateMisquotes(`${a} ${b}`, fb, new Set(COST), ['exhibit-a']).map(m => [m.items.join('+'), m.cited]);
  it.each([
    ['COGS is the driver.', 'It went from 42% to 58% of revenue, so 16 points of the 18-point margin decline.'],   // replay: Cole 8cac8248 t4, Bianca 08381460 t4…
    ['COGS is the driver.', 'It went from 42% to 58% of revenue — 16 points — and total net margin fell 18 points.'],
    ["You're right — 25% of COGS isn't 25 points of revenue.", "It's 25% of 42, so beans were 10.5 points of revenue two years ago."],   // Sofia 3baae0b8 t11: a share of a base
  ])('no correction: %s %s', (a, b) => expect(two(a, b)).toEqual([]));
  it("a misread of the earlier item is still caught (Tyler 505297a7: COGS 61%)", () => {
    expect(two('COGS is the story:', 'it went from 42% to 61% of revenue, so roughly 19 points of expansion, and that basically accounts for the entire 18-point margin decline on its own.')).toEqual([['cogs_pct', 'it 61%']]);
  });
});
