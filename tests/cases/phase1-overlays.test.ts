// Phase 1 Stream 2: the five case overlays (cases/phase1/<id>.json; contract §1). Each loads, merges with
// every switch on into a valid case, and keeps its covers specific and off other items' phrases.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CaseSchema } from '@/lib/cases/schema';
import { Phase1OverlaySchema, applyPhase1Overlay, overlayProblems } from '@/lib/cases/phase1-overlay';
import { foldCoverPhrase } from '@/lib/orchestrator/fact-check';
import { collisions, containments, phase1Views, tagProblems } from '@/scripts/phase1-cover-lint';

const IDS = ['prof-001', 'prof-002', 'entry-001', 'launch-001', 'pricing-001'];
const raw = (id: string) => CaseSchema.parse(JSON.parse(readFileSync(`cases/${id}.json`, 'utf8')));
const overlay = (id: string) => Phase1OverlaySchema.parse(JSON.parse(readFileSync(`cases/phase1/${id}.json`, 'utf8')));

describe.each(IDS)('the %s overlay', id => {
  it('names only the case\'s ids and merges with every switch on', () => {
    expect(overlayProblems(raw(id), overlay(id))).toEqual([]);
    expect(() => applyPhase1Overlay(raw(id), overlay(id), { ENGINE_SWITCHES: `${id}=phase1` })).not.toThrow();
  });
  it('covers: specific (no bare generic head), not repeating a base phrase, at most 20 an item', () => {
    const base = raw(id).factAnchors?.covers ?? {};
    for (const [item, x] of Object.entries(overlay(id).items)) {
      expect((x.covers ?? []).length, item).toBeLessThanOrEqual(20);
      for (const c of x.covers ?? []) {
        expect(c, item).not.toMatch(/^(?:the |a |an )?(?:cost|costs|flights?|volume|distribution|data|price|revenue)$/i);
        expect((base[item] ?? []).map(foldCoverPhrase), `${item}: ${c}`).not.toContain(foldCoverPhrase(c));
      }
    }
  });
  it('no phrase newly on two items in the merged view', () => {
    const { off, on } = phase1Views(raw(id), overlay(id), raw(id).factAnchors?.tags ? [] : ['tagMatching']);
    expect(collisions(id, on, off).filter(d => d.status === 'new')).toEqual([]);
    expect(containments(on, off).filter(d => d.status === 'new')).toEqual([]);
  });
  it('every item has tags and askPhrases, agreeing with the case-level tags; every exhibit a summary', () => {
    const c = raw(id), o = overlay(id);
    for (const d of c.dataLedger) {
      expect(o.items[d.id]?.tags, d.id).toBeDefined();
      expect(o.items[d.id]?.askPhrases, d.id).toBeDefined();
    }
    for (const e of c.exhibits) expect(o.exhibits[e.id]?.summary, e.id).toBeDefined();
    expect(tagProblems(c.factAnchors?.tags ? c : { ...c, factAnchors: { ...c.factAnchors!, tags: o.factTags } }, o)).toEqual([]);
    expect(o.definitions.length).toBeGreaterThan(0);
  });
});

// Contract §1 "Must-reach entries to author" (Lorenzo's list); Aldermoor and Brew & Bean only proposed.
describe('must-reach', () => {
  const merged = (id: string) => applyPhase1Overlay(raw(id), overlay(id), { ENGINE_SWITCHES: `${id}=mustReachPhase1` }).mustReach ?? [];
  it('merges Lorenzo\'s entries under mustReachPhase1, at most 3 a case, each with its runs', () => {
    expect(merged('prof-002').map(m => [m.item, m.before])).toEqual([['competitor_entry', 'exhibit-3'], ['new_route_rampup', 'recommendation'], ['competitor_costs', 'exhibit-3']]);
    expect(merged('launch-001').map(m => [m.item, m.before])).toEqual([['retailer_support', 'recommendation'], ['cannibalization', 'recommendation']]);
    expect(merged('pricing-001').map(m => [m.item, m.before])).toEqual([['why_pro_fell', 'recommendation']]);
    for (const id of ['prof-002', 'launch-001', 'pricing-001']) for (const m of overlay(id).mustReach) expect(m.why).toMatch(/b3\d/);
  });
  it('Aldermoor and Brew & Bean: proposals only, never merged', () => {
    for (const id of ['entry-001', 'prof-001']) {
      expect(overlay(id).mustReach).toEqual([]);
      expect(merged(id)).toEqual(raw(id).mustReach ?? []);
      for (const m of overlay(id).proposed?.mustReach ?? []) { expect(m.why).toMatch(/b\d\d \w+/); expect(m.why).toMatch(/[0-9a-f]{8}/); expect(m.why).toMatch(/\bt\d+/); }
    }
  });
  it('with mustReachPhase1 off, the case\'s own must-reach only', () => {
    for (const id of IDS) expect(applyPhase1Overlay(raw(id), overlay(id), {}).mustReach).toEqual(raw(id).mustReach);
  });
});

describe('step lineage', () => {
  // Lorenzo's pre-wave ruling 6 (26 Oct): pricing-001's churn_breakeven_at_60 lists both LTVs. The step's own
  // description puts the Pro LTV inside it ("$50 × 14 + $800", the $800 being the upgrade share of one Pro LTV),
  // so the Pro LTV is a root of it as much as the Starter LTV. `mathSteps[].inputs` are ledger ids, so the
  // `inputs` form the gate report asked for cannot carry it — `dependsOn` is the edge (Stream 3's §5).
  it('pricing-001: churn_breakeven_at_60 depends on both LTVs under stepLineage, and only that step moves', () => {
    expect(overlay('pricing-001').steps).toEqual({ churn_breakeven_at_60: { dependsOn: ['starter_ltv', 'pro_ltv'] } });
    const on = applyPhase1Overlay(raw('pricing-001'), overlay('pricing-001'), { ENGINE_SWITCHES: 'pricing-001=stepLineage' }).mathSteps;
    const base = raw('pricing-001').mathSteps;
    expect(on.find(s => s.id === 'churn_breakeven_at_60')!.dependsOn).toEqual(['starter_ltv', 'pro_ltv']);
    expect(on.filter(s => s.id !== 'churn_breakeven_at_60')).toEqual(base.filter(s => s.id !== 'churn_breakeven_at_60'));
  });
  it('pricing-001 is untouched with the switch off', () => {
    expect(applyPhase1Overlay(raw('pricing-001'), overlay('pricing-001'), {}).mathSteps).toEqual(raw('pricing-001').mathSteps);
  });
  it('entry-001: the net price feeds Option B\'s net sales and the matching share', () => {
    for (const s of ['option_b_net_sales', 'matching_share']) expect(overlay('entry-001').steps[s].dependsOn).toContain('net_price');
  });
});
