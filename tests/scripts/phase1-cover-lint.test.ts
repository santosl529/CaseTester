// Phase 1 Stream 2 Task 2: the cover lint on the merged view (contract §5 Stream 2; Lorenzo's ruling to
// Stream 2, 22 Oct: "Run the cover lint on the MERGED view — the base case plus the overlay, as loaded
// through applyPhase1Overlay with itemCovers on … Collisions and new matches must be counted against the
// base covers too").
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CaseSchema } from '@/lib/cases/schema';
import { Phase1OverlaySchema } from '@/lib/cases/phase1-overlay';
import { phase1Views, excludedBy, askDiff, collisions, coverCounts, tagProblems, completeness, fullMergeProblem, renderPhase1Lint, applyJudgements, type AskTurn } from '@/scripts/phase1-cover-lint';

const raw = (id: string) => CaseSchema.parse(JSON.parse(readFileSync(`cases/${id}.json`, 'utf8')));
const turn = (text: string, turnIndex: number, asks: { what: string; itemIds: string[] }[] = [], run = 'batch-37-hollisbay/57-marisol'): AskTurn => ({ run, turnIndex, text, phase: 'ANALYSIS', asks });

const overlay = Phase1OverlaySchema.parse({
  caseId: 'launch-001',
  items: {
    product: { covers: ['chickpea snack flavors', 'bag size of the snack'], coverExcludes: ['chip', 'chips'] },
    // Collides with retailer_support's base cover "how many stores" (folded).
    channels: { covers: ['how many stores', 'which retail chains'] },
    variable_costs: { tags: { entity: 'client', period: ['current'], quantityKind: ['split'] }, askPhrases: ['what goes into making a bag', 'per-bag ingredients and packaging', 'freight to retailers'] },
    why_now: { tags: { entity: 'client', period: ['current'], quantityKind: ['trend'] } },
    planning_assumptions: { tags: { entity: 'client', period: ['current'], quantityKind: ['level'] } },
  },
});

describe('phase1Views', () => {
  it('off is today\'s case; on has the base covers plus the overlay\'s', () => {
    const { off, on } = phase1Views(raw('launch-001'), overlay);
    expect(off.factAnchors!.covers.product).toEqual(raw('launch-001').factAnchors!.covers.product);
    expect(on.factAnchors!.covers.product).toEqual([...raw('launch-001').factAnchors!.covers.product, 'chickpea snack flavors', 'bag size of the snack']);
    expect(on.dataLedger.find(d => d.id === 'product')!.coverExcludes).toEqual(['chip', 'chips']);
  });
  it('extra switches are on in both views, so only the covers differ', () => {
    const { off, on } = phase1Views(raw('launch-001'), overlay, ['misquoteAnchors']);
    expect(off.quoteAnchors).toEqual(on.quoteAnchors);
  });
});

describe('excludedBy', () => {
  it('finds an exclusion word as a whole word, plural or possessive alike', () => {
    expect(excludedBy('the chips bag size', ['chip'])).toBe('chip');
    expect(excludedBy("Nimbrel's net price", ['nimbrel'])).toBe('nimbrel');
    expect(excludedBy('the chickpea bag size', ['chip'])).toBeNull();
  });
});

describe('collisions', () => {
  it('counts a phrase on two items across the base covers and the overlay\'s, marked new', () => {
    const { off, on } = phase1Views(raw('launch-001'), overlay);
    expect(collisions('launch-001', on, off)).toEqual(expect.arrayContaining([
      expect.objectContaining({ phrase: 'how many store', items: ['channels', 'retailer_support'], status: 'new' }),
    ]));
  });
});

describe('askDiff', () => {
  const { off, on } = phase1Views(raw('launch-001'), overlay);
  it('lists a model ask that gains an item, with the overlay phrase that brought it, the model\'s mapping and the exclusion', () => {
    const rows = askDiff(off, on, overlay, [turn('What flavors? And what bag size of the snack?', 3, [{ what: 'bag size of the snack', itemIds: [] }])]);
    const model = rows.filter(r => r.source === 'model');
    expect(model).toEqual([expect.objectContaining({ turnIndex: 3, what: 'bag size of the snack', mapped: [], before: [], after: ['product'],
      gained: [{ item: 'product', phrases: ['bag size of the snack'], excludedBy: null, tags: 'agree' }] })]);
  });
  it('reads the candidate\'s asking sentences as asks too', () => {
    const rows = askDiff(off, on, overlay, [turn('Do we know the bag size of the snack?', 5)]);
    expect(rows).toEqual([expect.objectContaining({ source: 'candidate', what: 'Do we know the bag size of the snack?', gained: [expect.objectContaining({ item: 'product' })] })]);
  });
  it('marks a gain an exclusion word would block', () => {
    const rows = askDiff(off, on, overlay, [turn('Okay.', 7, [{ what: 'bag size of the snack versus chips', itemIds: [] }])]);
    expect(rows[0].gained[0].excludedBy).toBe('chip');
  });
  it('lists nothing when the coverage is the same', () => {
    expect(askDiff(off, on, overlay, [turn('Okay.', 9, [{ what: 'how many flavors', itemIds: [] }])])).toEqual([]);
  });
});

describe('coverCounts', () => {
  it('counts each overlay cover\'s matches, zero included', () => {
    const { off, on } = phase1Views(raw('launch-001'), overlay);
    const counts = coverCounts(on, overlay, [turn('Do we know the bag size of the snack?', 5, [{ what: 'bag size of the snack', itemIds: [] }])]);
    expect(counts).toEqual(expect.arrayContaining([
      { item: 'product', phrase: 'bag size of the snack', count: 2 },
      { item: 'product', phrase: 'chickpea snack flavors', count: 0 },
    ]));
    void off;
  });
});

describe('tagProblems', () => {
  it('an item in an entity\'s items has that entity; an item in forecast has the forecast period', () => {
    const { on } = phase1Views(raw('launch-001'), overlay);
    expect(tagProblems(on, overlay)).toEqual([
      'why_now: in entity "chips" but tagged "client"',
      'planning_assumptions: in factAnchors.tags.forecast but its period has no "forecast"',
    ]);
  });
});

describe('completeness', () => {
  it('names every item with no tags or askPhrases, and every exhibit with no summary', () => {
    const { on } = phase1Views(raw('launch-001'), overlay);
    const c = completeness(on, overlay);
    expect(c).toContain('product: no tags');
    expect(c).toContain('variable_costs: covers 4 (under 10)');
    expect(c).not.toContain('variable_costs: no askPhrases');
    expect(c).toContain('exhibit-1: no summary');
  });
  it('names an exclusion word found in the item\'s own covers', () => {
    const o = Phase1OverlaySchema.parse({ caseId: 'launch-001', items: { product: { coverExcludes: ['chips'] } } });
    expect(completeness(phase1Views(raw('launch-001'), o).on, o)).toContain('product: exclusion "chips" is in its own cover "protein versus chips"');
  });
  it('the overlay merged with every switch on must load', () => {
    expect(fullMergeProblem(raw('launch-001'), overlay)).toBeNull();
    // product has no timeframes: a misquote anchor on it makes a malformed case.
    const bad = Phase1OverlaySchema.parse({ caseId: 'launch-001', items: { product: { misquote: { names: ['bag size'] } } } });
    expect(fullMergeProblem(raw('launch-001'), bad)).toMatch(/with every switch on/);
  });
});

describe('judgements and the render', () => {
  it('an unjudged gain is unsure; a judged one carries its verdict; the render has the sections', () => {
    const { off, on } = phase1Views(raw('launch-001'), overlay);
    const rows = askDiff(off, on, overlay, [turn('Okay.', 3, [{ what: 'bag size of the snack', itemIds: [] }]), turn('Okay.', 4, [{ what: 'which retail chains carry it', itemIds: [] }])]);
    const judged = applyJudgements('launch-001', rows, [{ caseId: 'launch-001', run: 'batch-37-hollisbay/57-marisol', turnIndex: 3, source: 'model', item: 'product', verdict: 'answers' }]);
    expect(judged.map(r => r.gained.map(g => g.verdict))).toEqual([['answers'], ['unsure']]);
    const md = renderPhase1Lint([{ id: 'launch-001', collisions: collisions('launch-001', on, off), rows: judged, counts: coverCounts(on, overlay, []), tagProblems: [], completeness: [] }]);
    for (const h of ['## 1. Phrases on two items', '## 2. New matches', '## 3. Unsure', '## 4. Count per overlay cover', '## 5. Tags and completeness']) expect(md).toContain(h);
    expect(md).toMatch(/which retail chains carry it.*channels.*unsure/);
  });
});
