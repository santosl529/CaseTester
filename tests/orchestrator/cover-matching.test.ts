// Round 6 Task 68 (Lorenzo, 21 Oct: "Normalize matching before adding phrases:
// plurals, a small synonym table … Match the candidate's own sentence as well as
// the model's rewording. … Add exclusion words where a confusion is known"):
// coverageOf on a tagged case folds plurals and synonyms, drops a hit on another
// company's item or across a geography, and reads the candidate's asking sentence.
// An untagged case (prof-001) matches as before. Asks are the audit's
// (docs/superpowers/plans/2026-10-21-data-path-audit.md rows 1, 5, 12, 20).
import { describe, it, expect } from 'vitest';
import { coverageOf, factBaseFor } from '@/lib/orchestrator/fact-check';
import { getCaseById } from '@/lib/cases/loader';
import { taggedFactBase } from './fixtures/tagged-cases';

const larkspur = taggedFactBase('prof-002');
const hollis = taggedFactBase('launch-001');
const aldermoor = taggedFactBase('entry-001');

describe('normalized matching (tagged cases)', () => {
  it('row 1, Larkspur Tyler t11: the plural fold — "avoidable fixed cost" meets the cover "avoidable fixed costs"', () => {
    expect(coverageOf('avoidable fixed cost by route', larkspur)).toEqual({ items: ['aircraft_leases'], promptFacts: [], rest: null, coarse: [] });
  });
  it('row 5, Hollis Bay Marisol t7: the synonym fold — "number of stores" meets the cover "how many stores"', () => {
    expect(coverageOf('a distribution estimate by number of stores', hollis)).toEqual({ items: ['retailer_support'], promptFacts: [], rest: null, coarse: [] });
  });
  it('plurals in -es after ss, x, z, ch, sh fold to the word; a word in -ss stays', () => {
    const fb = taggedFactBase('launch-001', { covers: { product: ['bag pouch'] } });
    expect(coverageOf('bag pouches', fb).items).toEqual(['product']);
    expect(coverageOf("the chip businesses' volume", hollis).items).toEqual(['why_now']);
  });
  it('"a number of stores" is no count (COUNT_ASK): no synonym fold', () => {
    expect(coverageOf('a number of stores', hollis).items).toEqual([]);
  });
  it('the fold keeps the hit\'s span: a finer cut beside it still vetoes it', () => {
    expect(coverageOf('avoidable fixed costs broken down by customer segment', larkspur).items).toEqual([]);
  });
  it('departures fold onto flights; doors onto stores; pricing (a noun) onto price', () => {
    const fb = taggedFactBase('prof-002', { covers: { network_totals: ['total flights'] } });
    expect(coverageOf('total departures', fb).items).toEqual(['network_totals']);
    expect(coverageOf('how many doors', hollis).items).toEqual(['retailer_support']);
    const priced = taggedFactBase('entry-001', { covers: { nimbrel: ['net price trend'], kelvexa_pricing: ['price below list'] } });
    expect(coverageOf("Nimbrel's net pricing trend", priced).items).toEqual(['nimbrel']);
    expect(coverageOf('the option of pricing below list', priced).items).toEqual([]);   // a verb: "pricing below"
  });
});

describe('the candidate\'s asking sentence (tagged cases)', () => {
  const SENTENCE = 'Do we have a sense of how many bags of chips Hollis Bay moves a year?';
  it('row 12, Hollis Bay Tyler t5: the model\'s "annual chip bag volume" misses; the sentence\'s "bags of chips" reaches why_now — at the coarser cut, worded from the model\'s ask', () => {
    const cov = coverageOf('annual chip bag volume', hollis, { sentence: SENTENCE });
    expect([...cov.items, ...cov.coarse.flatMap(c => c.ids)]).toContain('why_now');
    expect(cov).toEqual({ items: [], promptFacts: [], rest: null, coarse: [{ what: 'annual chip bag volume', ids: ['why_now'] }] });
  });
  it('without the sentence the model\'s ask is uncovered, as before', () => {
    expect(coverageOf('annual chip bag volume', hollis)).toEqual({ items: [], promptFacts: [], rest: 'annual chip bag volume', coarse: [] });
  });
  it('a sentence hit sharing no word with the model\'s ask is another ask\'s: not joined', () => {
    expect(coverageOf("the competitor's prices", hollis, { sentence: SENTENCE }).coarse).toEqual([]);
  });
  it('the sentence\'s items join the ask\'s own; the rest is worded from the model\'s ask', () => {
    const cov = coverageOf('retailer margin and the planning figure', hollis, { sentence: 'Do we have the retailer margin and how many stores carry the planning figure?' });
    expect(cov.items).toEqual(['bag_price']);
    expect(cov.rest).toBe('the planning figure');
  });
});

describe('exclusion: a hit on another company\'s item (tags)', () => {
  it('"chip volume for the chickpea line" keeps why_now: both named', () => {
    expect(coverageOf('chip volume for the chickpea line', hollis).items).toEqual(['why_now']);
  });
  it('an ask naming only the entrant drops a hit on a Larkspur item', () => {
    expect(coverageOf("the entrant's avoidable fixed costs", larkspur)).toEqual({ items: [], promptFacts: [], rest: "the entrant's avoidable fixed costs", coarse: [] });
    expect(coverageOf("Larkspur's avoidable fixed costs", larkspur).items).toEqual(['aircraft_leases']);
  });
  it('a list entry naming the entrant drops its hit, though another entry names Larkspur', () => {
    expect(coverageOf("Larkspur's fares and the entrant's avoidable fixed costs", larkspur).items).toEqual([]);
  });
  it('an ask naming the entrant keeps a hit on the entrant\'s item', () => {
    expect(coverageOf("the competitor's cost structure", larkspur).items).toEqual(['competitor_costs']);
  });
});

describe('geography (audit row 20)', () => {
  it('Aldermoor Marcus t5: "European net price per patient per year" is not the US pricing line', () => {
    expect(coverageOf('European net price per patient per year', aldermoor).items).not.toContain('kelvexa_pricing');
    expect(coverageOf('European net price per patient per year', aldermoor).rest).toBe('European net price per patient per year');
  });
  it('a region the line names, or the cover phrase carries, stays', () => {
    expect(coverageOf('US price per patient per year', aldermoor).items).toEqual(['kelvexa_pricing']);
    expect(coverageOf('any international routes', larkspur).items).toEqual(['geography']);
  });
});

describe('untagged cases match as before', () => {
  const p1 = factBaseFor(getCaseById('prof-001') as never);
  it('prof-001 has no tags: no answer gate', () => {
    expect(p1.tags).toBeUndefined();
    expect(p1.answerGate).toBe(false);
  });
  it('the plural of a prof-001 cover is not matched', () => {
    expect(coverageOf('net margins', p1).items).toEqual([]);
    expect(coverageOf('net margins', p1).promptFacts).toEqual([]);
    expect(coverageOf('net margin', p1).promptFacts).toEqual(['net_margin']);
  });
  it('nor a synonym; and the sentence is not read', () => {
    expect(coverageOf('the count of transactions', p1).items).toEqual([]);
    expect(coverageOf('the menu', p1, { sentence: 'Could I get the transaction volume per store?' })).toEqual({ items: [], promptFacts: [], rest: 'the menu', coarse: [] });
  });
  it('the same case untagged: no fold, no sentence', () => {
    const plain = taggedFactBase('launch-001', { tags: null });
    expect(plain.answerGate).toBe(false);
    expect(coverageOf('a distribution estimate by number of stores', plain).items).toEqual([]);
    expect(coverageOf('annual chip bag volume', plain, { sentence: 'Do we have a sense of how many bags of chips Hollis Bay moves a year?' }).coarse).toEqual([]);
  });
});
