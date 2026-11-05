// The cases students can start from /home (site flow, 19 Oct): read from the
// case registry, switched on by id, public fields only.
import { describe, it, expect } from 'vitest';
import { LISTED_CASE_IDS, LINK_ONLY_CASE_IDS, listedCases, isListedCase, linkOnlyCase, isStartableCase } from '@/lib/cases/listed';
import { getCaseById } from '@/lib/cases/loader';

describe('listed cases', () => {
  // The four demo cases (Lorenzo, 27 Oct); Aldermoor (entry-001) stays unlisted.
  it('lists the four demo cases, each with its title and difficulty from the case file', () => {
    expect(LISTED_CASE_IDS).toEqual(['prof-001', 'prof-002', 'pricing-001', 'launch-001']);
    expect(listedCases()).toEqual(LISTED_CASE_IDS.map(id => {
      const c = getCaseById(id);
      return { id, title: c.title, difficulty: c.difficulty, caseType: c.caseType };
    }));
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

  // The live demo's 7-minute Brew & Bean (Lorenzo, 4 Nov): reachable only by its start link, never on /home.
  it('prof-001-demo is link-only: startable, not listed, public fields only', () => {
    expect(LINK_ONLY_CASE_IDS).toEqual(['prof-001-demo']);
    expect(listedCases().map(c => c.id)).not.toContain('prof-001-demo');
    expect(isListedCase('prof-001-demo')).toBe(false);
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
