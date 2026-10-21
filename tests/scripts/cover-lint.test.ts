// Round 6 Task 69: the cover lint (scripts/cover-lint.ts). Lorenzo, 21 Oct: "Lint:
// flag any phrase that appears in two items' covers; run every new or changed cover
// against every candidate ask in batches 28–37; list what each newly matches."
import { describe, it, expect } from 'vitest';
import { lintCase, renderLint, duplicatePhrases, type CandidateTurn } from '@/scripts/cover-lint';
import { getCaseById } from '@/lib/cases/loader';
import { TAGS } from '@/tests/orchestrator/fixtures/tagged-cases';

// launch-001 with the given covers and (by default) its planned tags.
function launch(covers: Record<string, string[]>, tags: boolean = true) {
  const c = getCaseById('launch-001');
  const fa = { ...c.factAnchors!, covers };
  if (tags) Object.assign(fa, { tags: TAGS['launch-001'] }); else delete (fa as { tags?: unknown }).tags;
  return { ...c, factAnchors: fa };
}
const turn = (text: string, turnIndex = 7, run = 'batch-37-hollisbay/57-marisol'): CandidateTurn => ({ run, turnIndex, text });

describe('duplicatePhrases', () => {
  it('flags a phrase two items share, folded, and marks a listed pair intended', () => {
    const covers = { why_now: ['chip volume', 'declining base'], cannibalization: ['chips volumes'], retailer_support: ['store count'], channels: ['store counts'] };
    const dups = duplicatePhrases('launch-001', covers, null, { 'launch-001': [{ phrase: 'store count', items: ['channels', 'retailer_support'] }] });
    expect(dups).toEqual([
      { phrase: 'chip volume', items: ['cannibalization', 'why_now'], status: 'new' },
      { phrase: 'store count', items: ['channels', 'retailer_support'], status: 'intended' },
    ]);
  });
  it('one item repeating a phrase in two forms is no duplicate; a pair already at BASE says so', () => {
    const covers = { why_now: ['chip volume', 'chip volumes'], cannibalization: ['chip sales'], channels: ['chip sales'] };
    expect(duplicatePhrases('launch-001', covers, { cannibalization: ['chip sales'], channels: ['chip sales'] }, {}))
      .toEqual([{ phrase: 'chip sale', items: ['cannibalization', 'channels'], status: 'at BASE' }]);
  });
});

describe('lintCase matches', () => {
  const base = { why_now: ['chip volume'], retailer_support: ['how many stores'] };
  const covers = { why_now: ['chip volume', 'annual chip volume'], retailer_support: ['how many stores'] };
  const turns = [
    turn('Thanks. Do we know the annual chip volume for Hollis Bay? And how many stores is it in?', 5),
    turn('Could we get the number of stores carrying Hollis Bay in total?', 27),
    turn('That makes sense. I would start with the market.', 3),
  ];
  const lint = lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: base, turns });

  it('lists a new phrase with each candidate sentence it matches, with run and turn', () => {
    const m = lint.matches.filter(x => x.phrase === 'annual chip volume');
    expect(m).toEqual([expect.objectContaining({ item: 'why_now', kind: 'new', source: 'candidate', run: 'batch-37-hollisbay/57-marisol', turnIndex: 5, sentence: 'Do we know the annual chip volume for Hollis Bay?' })]);
  });
  it('lists an existing phrase only where the fold newly matches it, not its literal matches', () => {
    const m = lint.matches.filter(x => x.phrase === 'how many stores');
    expect(m.map(x => [x.kind, x.turnIndex, x.sentence])).toEqual([['normalized', 27, 'Could we get the number of stores carrying Hollis Bay in total?']]);
    // An existing phrase's literal matches are BASE's, and a new phrase's sentences are its own.
    expect(lint.matches.filter(x => x.phrase === 'chip volume')).toEqual([]);
  });
  it('says what the engine does with the sentence as an ask, and whether the tags agree', () => {
    const m = lint.matches.find(x => x.phrase === 'how many stores')!;
    // A count asked "in total" of a line stating no total: the phrase matches, the engine doesn't cover it (fix round 1).
    expect(m.engine).toBe('not covered');
    expect(m.tags).toBe('agree');
    const chip = lintCase({ id: 'launch-001', caseData: launch({ why_now: ['chip volume', 'annual chip volume'] }), baseCovers: {}, turns: [turn('What is the annual chip volume of the chickpea line?')] });
    expect(chip.matches.find(x => x.phrase === 'annual chip volume')).toEqual(expect.objectContaining({ phrase: 'annual chip volume', engine: 'given', tags: 'agree' }));
  });
  it("reads the model's declared asks too: Marisol t27's \"the total number of stores carrying Hollis Bay\" (b37), with the model's own mapping", () => {
    const t = { ...turn('Do we know how many stores carry Hollis Bay in total?', 27), asks: [{ what: 'the total number of stores carrying Hollis Bay', itemIds: [] }] };
    const l = lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: base, turns: [t] });
    // The candidate's own sentence says "how many stores": BASE's literal phrase, not listed; the model's ask meets it only folded.
    expect(l.matches).toEqual([expect.objectContaining({ item: 'retailer_support', phrase: 'how many stores', kind: 'normalized', source: 'model', turnIndex: 27, sentence: 'the total number of stores carrying Hollis Bay', mapped: [], engine: 'not covered' })]);
  });
  it('a model ask the model already mapped to the item says so', () => {
    const t = { ...turn('Okay.', 9), asks: [{ what: 'annual chip volume', itemIds: ['why_now'] }] };
    const l = lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: base, turns: [t] });
    expect(l.matches).toEqual([expect.objectContaining({ phrase: 'annual chip volume', source: 'model', mapped: ['why_now'] })]);
  });
  it('marks whether a candidate sentence is an asking sentence (request-signal.ts askingSentences), as the engine reads only those', () => {
    const t = { ...turn('Fixed costs per available seat mile rise fast if departures fell. How has cost per available seat mile moved?', 1), phase: 'ANALYSIS' as const };
    const l = lintCase({ id: 'launch-001', caseData: launch({ why_now: ['cost per available seat mile'] }), baseCovers: {}, turns: [t] });
    expect(l.matches.map(m => [m.sentence, m.ask])).toEqual([
      ['Fixed costs per available seat mile rise fast if departures fell.', false],
      ['How has cost per available seat mile moved?', true],
    ]);
  });
  it('an ask naming only another company: the engine drops the hit and the tags disagree', () => {
    const l = lintCase({ id: 'launch-001', caseData: launch({ retailer_support: ['how many stores'] }), baseCovers: {}, turns: [turn('How many stores carry the potato chips?')] });
    expect(l.matches).toEqual([expect.objectContaining({ item: 'retailer_support', engine: 'dropped: entity', tags: 'entity' })]);
  });
  it('counts every new phrase, a phrase with no match at zero', () => {
    expect(lint.counts).toEqual(expect.arrayContaining([
      { item: 'why_now', phrase: 'annual chip volume', kind: 'new', count: 1 },
      { item: 'retailer_support', phrase: 'how many stores', kind: 'normalized', count: 1 },
    ]));
    const none = lintCase({ id: 'launch-001', caseData: launch({ why_now: ['chip bag volume'] }), baseCovers: {}, turns });
    expect(none.counts).toEqual([{ item: 'why_now', phrase: 'chip bag volume', kind: 'new', count: 0 }]);
  });
  it('an untagged case matches literally: no normalized matches, a new phrase only where it is written', () => {
    const u = lintCase({ id: 'launch-001', caseData: launch(covers, false), baseCovers: base, turns: [...turns, turn('What are the annual chip volumes?', 9)] });
    expect(u.matches.map(x => [x.phrase, x.turnIndex])).toEqual([['annual chip volume', 5]]);
  });
  it('a case with no BASE file has every phrase new', () => {
    const n = lintCase({ id: 'launch-001', caseData: launch({ retailer_support: ['how many stores'] }), baseCovers: null, turns });
    expect(n.matches.map(x => [x.kind, x.turnIndex])).toEqual([['new', 5], ['new', 27]]);
  });
});

// Lorenzo, 21 Oct: "Match the candidate's own sentence as well as the model's rewording" is
// part of the normalization: per model ask, what coverageOf gives at BASE (literal, untagged,
// the model's words only) against now (the tagged case, with the candidate's asking sentence).
describe('lintCase askChanges', () => {
  const covers = { why_now: ['bags of chips'], retailer_support: ['how many stores'] };
  it('lists a model ask whose items change, with the asking sentence the engine reads', () => {
    const said = 'Do we have a distribution estimate — number of stores Hollis Bay can get into next spring?';
    const t = { ...turn(`Fair. ${said}`, 7), phase: 'ANALYSIS' as const, asks: [{ what: 'a distribution estimate by number of stores', itemIds: [] }] };
    const l = lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: covers, turns: [t] });
    expect(l.askChanges).toEqual([{ run: 'batch-37-hollisbay/57-marisol', turnIndex: 7, what: 'a distribution estimate by number of stores', mapped: [], sentence: said, before: [], after: ['retailer_support'], dropped: [] }]);
  });
  it('the sentence alone can bring an item (row 12): the coarse form is marked', () => {
    const t = { ...turn('Do we have a sense of how many bags of chips Hollis Bay moves a year?', 5), asks: [{ what: 'annual chip bag volume', itemIds: [] }] };
    const l = lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: covers, turns: [t] });
    expect(l.askChanges.map(c => [c.before, c.after])).toEqual([[[], ['why_now (coarse)']]]);
  });
  it('an ask whose coverage is the same is not listed; an exclusion is', () => {
    const same = { ...turn('How many stores is it in?', 3), asks: [{ what: 'how many stores', itemIds: [] }] };
    const chips = { ...turn('Okay.', 4), asks: [{ what: 'how many stores sell the potato chips', itemIds: [] }] };
    const l = lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: covers, turns: [same, chips] });
    expect(l.askChanges).toEqual([expect.objectContaining({ turnIndex: 4, before: ['retailer_support'], after: [], dropped: ['entity'] })]);
  });
  it('a phrase new since BASE changes an ask: BASE reads its own covers', () => {
    const t = { ...turn('Okay.', 5), asks: [{ what: 'annual chip bag volume', itemIds: [] }] };
    const l = lintCase({ id: 'launch-001', caseData: launch({ why_now: ['chip bag volume'] }), baseCovers: {}, turns: [t] });
    expect(l.askChanges.map(c => [c.before, c.after])).toEqual([[[], ['why_now']]]);
  });
  it('no BASE file: no ask changes', () => {
    const t = { ...turn('Okay.', 4), asks: [{ what: 'the number of stores', itemIds: [] }] };
    expect(lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: null, turns: [t] }).askChanges).toEqual([]);
  });
});

describe('renderLint', () => {
  it('writes the three sections: duplicates, matches with sentences, counts', () => {
    const covers = { why_now: ['chip volume', 'annual chip volume'], cannibalization: ['chip volumes'] };
    const t = { ...turn('Do we know the annual chip volume?', 5), asks: [{ what: 'annual chip volume', itemIds: [] }] };
    const md = renderLint([lintCase({ id: 'launch-001', caseData: launch(covers), baseCovers: { why_now: ['chip volume'] }, turns: [t] })]);
    expect(md).toContain('## 1. Phrases in two items\' covers');
    expect(md).toMatch(/chip volume.*cannibalization, why_now.*new/);
    expect(md).toContain('## 2. Matches');
    expect(md).toContain('Do we know the annual chip volume?');
    expect(md).toContain('## 3. Count per phrase');
    expect(md).toMatch(/\| why_now \| annual chip volume \| new \| 2 \|/);   // the candidate's sentence and the model's ask
    expect(md).toContain('## 2b. Model asks whose coverage changes');
    expect(md).toMatch(/\| t5 \| annual chip volume \| — \| Do we know the annual chip volume\? \| why_now \| cannibalization, why_now \|/);
  });
});
