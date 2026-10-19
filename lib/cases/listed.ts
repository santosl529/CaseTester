// The cases students can start from /home (site flow, 19 Oct). Read from the
// case registry; a case is switched on by adding its id here. Only public
// fields leave this module — the prompt, ledger and keys stay server-side.
import { loadCases } from './loader';
import type { Case } from './schema';

export const LISTED_CASE_IDS: readonly string[] = ['prof-001'];

export type ListedCase = Pick<Case, 'id' | 'title' | 'difficulty' | 'caseType'>;

export function listedCases(): ListedCase[] {
  const cases = loadCases();
  return LISTED_CASE_IDS.flatMap(id => {
    const c = cases.find(x => x.id === id);
    return c ? [{ id: c.id, title: c.title, difficulty: c.difficulty, caseType: c.caseType }] : [];
  });
}

export function isListedCase(caseId: unknown): boolean {
  return typeof caseId === 'string' && listedCases().some(c => c.id === caseId);
}
