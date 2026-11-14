// The cases students can start from /home (site flow, 19 Oct). Read from the
// case registry; a case is switched on by adding its id here. Only public
// fields leave this module — the prompt, ledger and keys stay server-side.
import { loadCases } from './loader';
import type { Case } from './schema';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';

// The four full cases (Lorenzo, 27 Oct: "LISTED_CASE_IDS: prof-001, prof-002, pricing-001, launch-001. Aldermoor stays
// unlisted."). The homepage's "full cases" count reads these (lib/site/stats.ts), so the demo below isn't counted.
export const LISTED_CASE_IDS: readonly string[] = ['prof-001', 'prof-002', 'pricing-001', 'launch-001'];

// Also on /home, after the full cases (Lorenzo, 12 Nov: "add the demo as an option in the case selection"): the
// 7-minute Brew & Bean, titled as a demo so it isn't taken for the full case. Its start link still works (below).
export const HOME_DEMO_CASE_IDS: readonly string[] = ['prof-001-demo'];

export type ListedCase = Pick<Case, 'id' | 'title' | 'difficulty' | 'caseType'>;

// The Cases page's order (Matt, 13 Nov): Easy, then Medium, then Hard; the
// listed order within each.
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;
export const byDifficulty = <T extends { difficulty: keyof typeof DIFFICULTY_ORDER }>(cases: T[]): T[] =>
  cases.map((c, i) => ({ c, i })).sort((a, b) => DIFFICULTY_ORDER[a.c.difficulty] - DIFFICULTY_ORDER[b.c.difficulty] || a.i - b.i).map(x => x.c);

// "Good first case" (Matt, 13 Nov): one Easy case, named here like the lists
// above, not a case-file field. Larkspur: profitability, the classic first
// structure (revenue and costs) and the one week 1 of every plan trains.
export const FIRST_CASE_ID = 'prof-002';

export function listedCases(): ListedCase[] {
  const cases = loadCases();
  const pick = (ids: readonly string[], title: (c: Case) => string) => ids.flatMap(id => {
    const c = cases.find(x => x.id === id);
    return c ? [{ id: c.id, title: title(c), difficulty: c.difficulty, caseType: c.caseType }] : [];
  });
  return [
    ...pick(LISTED_CASE_IDS, c => c.title),
    ...pick(HOME_DEMO_CASE_IDS, c => `${c.title} — ${Math.round(caseTotalMs(c) / 60_000)}-minute demo`),
  ];
}

export function isListedCase(caseId: unknown): boolean {
  return typeof caseId === 'string' && listedCases().some(c => c.id === caseId);
}

// Cases with a direct start link, /start/<caseId> (Lorenzo, 4 Nov: the live demo's 7-minute Brew & Bean; also on
// /home since 12 Nov). A signed-in student with a valid club code can start one.
export const LINK_ONLY_CASE_IDS: readonly string[] = ['prof-001-demo'];

// The case a start link names, when it is one of them and its file loads.
export function linkOnlyCase(caseId: unknown): ListedCase | null {
  if (typeof caseId !== 'string' || !LINK_ONLY_CASE_IDS.includes(caseId)) return null;
  const c = loadCases().find(x => x.id === caseId);
  return c ? { id: c.id, title: c.title, difficulty: c.difficulty, caseType: c.caseType } : null;
}

// What /api/session may start: a listed case, or a link-only one.
export function isStartableCase(caseId: unknown): boolean {
  return isListedCase(caseId) || linkOnlyCase(caseId) !== null;
}
