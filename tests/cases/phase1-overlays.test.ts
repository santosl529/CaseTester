// Phase 1 Stream 2: the five case overlays (cases/phase1/<id>.json; contract §1). Each loads, merges with
// every switch on into a valid case, and keeps its covers specific and off other items' phrases.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CaseSchema } from '@/lib/cases/schema';
import { Phase1OverlaySchema, applyPhase1Overlay, overlayProblems } from '@/lib/cases/phase1-overlay';
import { foldCoverPhrase } from '@/lib/orchestrator/fact-check';
import { collisions, phase1Views, tagProblems } from '@/scripts/phase1-cover-lint';

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
