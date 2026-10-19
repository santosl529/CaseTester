// The cases students can start from /home (site flow, 19 Oct): read from the
// case registry, switched on by id, public fields only.
import { describe, it, expect } from 'vitest';
import { LISTED_CASE_IDS, listedCases, isListedCase } from '@/lib/cases/listed';
import { getCaseById } from '@/lib/cases/loader';

describe('listed cases', () => {
  it('lists prof-001 only, with its title and difficulty from the case file', () => {
    expect(LISTED_CASE_IDS).toEqual(['prof-001']);
    const c = getCaseById('prof-001');
    expect(listedCases()).toEqual([{ id: 'prof-001', title: c.title, difficulty: c.difficulty, caseType: c.caseType }]);
  });

  it('carries no server-only field (prompt, ledger, keys, anchors)', () => {
    for (const c of listedCases()) expect(Object.keys(c).sort()).toEqual(['caseType', 'difficulty', 'id', 'title']);
  });

  it('isListedCase: a listed id yes; a registered but unlisted case, an unknown id, a non-string no', () => {
    expect(isListedCase('prof-001')).toBe(true);
    expect(isListedCase('prof-002')).toBe(false);
    expect(isListedCase('nope-001')).toBe(false);
    expect(isListedCase(undefined)).toBe(false);
  });
});
