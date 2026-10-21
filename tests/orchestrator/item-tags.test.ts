// Round 6 Task 68 (Lorenzo, 21 Oct: "It may release the matched item only if the
// item's tags (company; forecast vs current; quantity) also agree with the ask"):
// the case's `factAnchors.tags` — client words, other entities and their items,
// forecast items — read by entitiesNamed and tagsAgree. Asks are the audit's
// (rows 2, 10, 18, 19) and the brief's.
import { describe, it, expect } from 'vitest';
import { entitiesNamed, tagsAgree } from '@/lib/orchestrator/item-tags';
import { factBaseFor } from '@/lib/orchestrator/fact-check';
import { CaseSchema } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';
import { taggedFactBase, TAGS } from './fixtures/tagged-cases';

const larkspur = taggedFactBase('prof-002');
const hollis = taggedFactBase('launch-001');
const aldermoor = taggedFactBase('entry-001');

describe('tagsAgree', () => {
  it.each([
    ["Nimbrel's patent expiry", 'patents', aldermoor, 'entity'],                     // row 19, Raj t13
    ['currently on an advanced therapy', 'peak_share_forecast', aldermoor, 'forecast'],  // row 18, Raj t11
    ["the entrant's flights a day", 'new_routes_cost_flights', larkspur, 'entity'],  // row 2, Marisol t11
    ['chip cost of goods', 'variable_costs', hollis, 'entity'],                      // row 10, Marcus t5
  ] as const)('"%s" × %s: no (%s)', (ask, id, fb, why) => {
    expect(tagsAgree(ask, id, fb)).toEqual({ agree: false, why });
  });
  it.each([
    ["Kelvexa's patents", 'patents', aldermoor],
    ["the competitor's cost per seat", 'competitor_costs', larkspur],
    ['chip volume for the chickpea line', 'why_now', hollis],      // both named: the item's own among them
    ['assumed market share at peak', 'peak_share_forecast', aldermoor],   // no current marker
    ['patent expiry', 'patents', aldermoor],                          // no entity named
  ] as const)('"%s" × %s: yes', (ask, id, fb) => {
    expect(tagsAgree(ask, id, fb)).toEqual({ agree: true });
  });
  it('a current marker: today, current(ly), now, at present, this year', () => {
    for (const ask of ['share today', 'the current share', 'share right now', 'share at present', 'share this year']) {
      expect(tagsAgree(ask, 'peak_share_forecast', aldermoor).why).toBe('forecast');
    }
    expect(tagsAgree('the current share', 'patents', aldermoor)).toEqual({ agree: true });
    // "Now," leading a sentence and "for now" mark the talk, not the period.
    expect(tagsAgree('Now, the assumed market share at peak?', 'peak_share_forecast', aldermoor)).toEqual({ agree: true });
    expect(tagsAgree('For now, the assumed market share at peak', 'peak_share_forecast', aldermoor)).toEqual({ agree: true });
  });
  // Row 2 (b36 Larkspur Marisol 5907649a t11): "we" is a Larkspur client word, but "Do we know" is the question's frame.
  it('a question\'s frame names nobody: "Do we know anything about the entrant\'s …" names only the entrant', () => {
    const t11 = "Do we know anything about the entrant's cost per seat, or how many flights a day they're running on each route?";
    expect(entitiesNamed(t11, larkspur)).toEqual(['competitor']);
    expect(tagsAgree(t11, 'new_routes_cost_flights', larkspur)).toEqual({ agree: false, why: 'entity' });
    expect(tagsAgree(t11, 'competitor_costs', larkspur)).toEqual({ agree: true });
  });
  it('an untagged case: always yes', () => {
    const p1 = factBaseFor(getCaseById('prof-001') as never);
    expect(tagsAgree("the competitor's cogs today", 'cogs_pct', p1)).toEqual({ agree: true });
  });
});

describe('entitiesNamed', () => {
  it('the entities a text names, and the client', () => {
    expect(entitiesNamed("the entrant's flights a day", larkspur)).toEqual(['competitor']);
    // Task 70 fix round 1: a comparison's other side names nobody — "our fares versus the low-cost carrier's" asks Larkspur's fares.
    expect(entitiesNamed("Do we know our fares versus the low-cost carrier's?", larkspur)).toEqual(['client']);
    expect(entitiesNamed("Do we know the low-cost carrier's fares?", larkspur)).toEqual(['competitor']);
    expect(entitiesNamed("what price point they're targeting versus the chips?", hollis)).toEqual([]);
    expect(entitiesNamed('chip volume for the chickpea line', hollis)).toEqual(['chips', 'client']);
    expect(entitiesNamed('roasted chickpeas', hollis)).toEqual(['client']);
    expect(entitiesNamed('how chickpeas sell', hollis)).toEqual(['client']);           // a plural of a client word
    expect(entitiesNamed('the patent expiry', aldermoor)).toEqual([]);
  });
});

describe('the tags block in the case schema', () => {
  const raw = (id: string, tags: unknown) => {
    const c = getCaseById(id);
    return { ...c, factAnchors: { ...c.factAnchors, tags } };
  };
  it('parses, and the fact base carries it', () => {
    expect(CaseSchema.safeParse(raw('entry-001', TAGS['entry-001'])).success).toBe(true);
    expect(aldermoor.tags).toEqual(TAGS['entry-001']);
    expect(aldermoor.answerGate).toBe(true);
  });
  it.each([
    ['an entity item', { ...TAGS['entry-001'], entities: [{ id: 'nimbrel', words: ['Nimbrel'], items: ['nimbrel_patents'] }] }],
    ['a forecast item', { ...TAGS['entry-001'], forecast: ['peak_share'] }],
  ])('rejects an unknown id: %s', (_, tags) => {
    const r = CaseSchema.safeParse(raw('entry-001', tags));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/Unknown ledger item/);
  });
});
