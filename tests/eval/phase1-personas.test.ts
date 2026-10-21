// The three Phase 1 personas (contract §5 Stream 1 task 4): ids 65–67, appended, case-neutral.
import { describe, it, expect } from 'vitest';
import { PERSONAS, getPersona } from '@/scripts/personas';

const PROF001 = /COGS|coffee|bean|menu|store|Brew|cafe|café/i;

describe('Phase 1 personas 65–67', () => {
  it('are appended after 64, in order, and nothing before them moved', () => {
    const ids = PERSONAS.map(p => p.id);
    expect(ids.slice(-3)).toEqual([65, 66, 67]);
    expect(ids.indexOf(64)).toBe(ids.length - 4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('65 asks for many specific figures, in lists', () => {
    const p = getPersona(65);
    expect(p.name).toMatch(/Data-Heavy/);
    expect(p.brief).toMatch(/list/i);
    expect(p.tests).toMatch(/refus|release|defer/i);
  });

  it('66 states results with no working', () => {
    const p = getPersona(66);
    expect(p.name).toMatch(/Results/);
    expect(p.brief).toMatch(/never (?:show|say|give)/i);
    expect(p.tests).toMatch(/probe|method/i);
  });

  it('67 challenges the interviewer\'s data', () => {
    const p = getPersona(67);
    expect(p.name).toMatch(/Challenger/);
    expect(p.brief).toMatch(/interviewer/i);
    expect(p.tests).toMatch(/FR-4|holds|hold/i);
  });

  it('are case-neutral: no prof-001 words, no figures the simulator could take as data', () => {
    for (const id of [65, 66, 67]) {
      const p = getPersona(id);
      expect(p.brief, String(id)).not.toMatch(PROF001);
      expect(p.brief, String(id)).not.toMatch(/\d/);
    }
  });
});
