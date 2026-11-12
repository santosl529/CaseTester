// The cases students can start from /home (site flow, 19 Oct): read from the
// case registry, switched on by id, public fields only.
import { describe, it, expect } from 'vitest';
import { LISTED_CASE_IDS, HOME_DEMO_CASE_IDS, LINK_ONLY_CASE_IDS, listedCases, isListedCase, linkOnlyCase, isStartableCase } from '@/lib/cases/listed';
import { siteCounts } from '@/lib/site/stats';
import { getCaseById } from '@/lib/cases/loader';

describe('listed cases', () => {
  // The four demo cases (Lorenzo, 27 Oct); Aldermoor (entry-001) stays unlisted.
  it('lists the four full cases, then the 7-minute demo titled as one (Lorenzo, 12 Nov)', () => {
    expect(LISTED_CASE_IDS).toEqual(['prof-001', 'prof-002', 'pricing-001', 'launch-001']);
    expect(HOME_DEMO_CASE_IDS).toEqual(['prof-001-demo']);
    const full = LISTED_CASE_IDS.map(id => {
      const c = getCaseById(id);
      return { id, title: c.title, difficulty: c.difficulty, caseType: c.caseType };
    });
    const demo = getCaseById('prof-001-demo');
    expect(listedCases()).toEqual([...full, { id: 'prof-001-demo', title: 'Brew & Bean Profitability — 7-minute demo', difficulty: demo.difficulty, caseType: demo.caseType }]);
  });
  it("the demo isn't counted as a case of its own on the homepage", () => {
    expect(siteCounts().cases).toBe(siteCounts(LISTED_CASE_IDS).cases);
  });

  it('carries no server-only field (prompt, ledger, keys, anchors)', () => {
    for (const c of listedCases()) expect(Object.keys(c).sort()).toEqual(['caseType', 'difficulty', 'id', 'title']);
  });

  it('isListedCase: a listed id yes; a registered but unlisted case, an unknown id, a non-string no', () => {
    expect(isListedCase('prof-001')).toBe(true);
    expect(isListedCase('entry-001')).toBe(false);
    expect(isListedCase('nope-001')).toBe(false);
    expect(isListedCase(undefined)).toBe(false);
  });

  // The live demo's 7-minute Brew & Bean (Lorenzo, 4 Nov): its start link keeps working; on /home too since 12 Nov.
  it('prof-001-demo: its start link works, it is on /home, public fields only', () => {
    expect(LINK_ONLY_CASE_IDS).toEqual(['prof-001-demo']);
    expect(listedCases().map(c => c.id)).toContain('prof-001-demo');
    expect(isListedCase('prof-001-demo')).toBe(true);
    expect(isStartableCase('prof-001-demo')).toBe(true);
    expect(Object.keys(linkOnlyCase('prof-001-demo')!).sort()).toEqual(['caseType', 'difficulty', 'id', 'title']);
  });

  it('isStartableCase: listed or link-only; Aldermoor, unknown ids and non-strings no', () => {
    expect(isStartableCase('prof-001')).toBe(true);
    expect(isStartableCase('entry-001')).toBe(false);
    expect(linkOnlyCase('entry-001')).toBeNull();
    expect(isStartableCase('nope-001-demo')).toBe(false);
    expect(isStartableCase(42)).toBe(false);
  });
});
