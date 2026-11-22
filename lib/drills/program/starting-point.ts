// A full case as a student's starting point (Matt, 21–22 Nov 2026). The plan choice offers three equal options:
// quick questions, the quick quiz (the diagnostic) or a case interview (Brew & Bean). Pure code; the store wires it.
//
// - The starting-point case is the student's first graded case (not a backfilled one) when no quiz or questions were
//   finished before it. Taking it from the choice or straight from Cases is the same: it is the first evidence.
// - It places skills by the quiz's own three places (placeFor): a skill with a major finding starts at Recognize (a
//   quiz score under 50%); a minor finding, or no finding in a dimension rated below Strong, the middle place (50–79%);
//   no finding in a dimension rated Strong tests out (80% or more). Only skills the case observed or found something
//   on, with a live drill, in a group whose tags may give drills (CASE_TAG_DRILL_GROUPS) — exhibits and judgment are off,
//   so their skills stay unplaced. Skills the case can't place get a quick check when the plan first reaches them.
// - Readiness (proposed, awaiting Matt's ruling): a starting-point case that did not meet the bar, or ended early, is
//   set aside — it doesn't count as taken. The student's next attempt at that case is not a retake: it counts for
//   readiness and the skill-state rules as a first attempt, and the next-case picker offers the case again, after the
//   cases they haven't tried and no sooner than RETURN_AFTER_DAYS after the first attempt. A starting-point case that
//   met the bar counts as usual. Brew & Bean is one of only two Medium/Hard cases, and readiness needs two.
import { DRILLS_CONFIG, getMistakeTag } from '../config';
import { hasLiveDrill } from '../progress/engine';
import { placeFor, type Place } from './diagnostic';
import { metTheBar } from './next-case';
import type { RubricDimensionKey } from '@/lib/scoring/rubric';

// The case the plan choice offers (Matt, 22 Nov: Brew & Bean, not Larkspur).
export const STARTING_POINT_CASE_ID = 'prof-001';
export const RETURN_AFTER_DAYS = 14;

// The dimension each skill a case can observe is rated under (lib/scoring/case-result-builder.ts skillsObserved).
export const OBSERVED_DIMENSION: Record<string, RubricDimensionKey> = {
  'PS.mece': 'structure', 'PS.case_specific': 'structure', 'PS.depth': 'structure',
  'CM.concise': 'communication',
  'QN.setup': 'quantitative', 'QN.arithmetic': 'quantitative', 'QN.percentages': 'quantitative',
  'CL.data_requests': 'pushback', 'CL.pushback': 'pushback',
  'EX.takeaway': 'dataExhibit', 'EX.extraction': 'dataExhibit',
  'CR.volume': 'creativity', 'CR.structure': 'creativity',
  'SY.answer_first': 'synthesis', 'SY.evidence': 'synthesis', 'SY.complete': 'synthesis',
  'BJ.so_what': 'judgment', 'BJ.risks': 'judgment',
};

export interface StoredCase {
  caseAttemptId: string; caseId: string; completedAt: Date; backfilled: boolean; partial: boolean;
  rubric: Record<string, string> | null;
}

// The student's starting-point case, if their first graded case came before any quiz or questions.
export function startingPointCase<T extends StoredCase>(cases: T[], otherSourceAt: Date | null): T | null {
  const first = cases.filter(c => !c.backfilled).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())[0];
  if (!first) return null;
  if (otherSourceAt && otherSourceAt.getTime() <= first.completedAt.getTime()) return null;
  return first;
}

// Set aside (doesn't count as taken): a starting-point case that ended early or didn't meet the bar.
export const isSetAside = (c: StoredCase | null): boolean => Boolean(c && (c.partial || !metTheBar(c.rubric)));

type Finding = { tag: string; severity: 'minor' | 'major' };
const MIDDLE = 0.65;   // a quiz score in the middle band (50–79%)

export function casePlacements(input: { findings: Finding[]; skills_observed: string[]; rubric_scores: Record<string, string> },
  groupsOn: Set<string>, isLive?: (drillId: string) => boolean): Record<string, { score: number; count: number; place: Place }> {
  const out: Record<string, { score: number; count: number; place: Place }> = {};
  const findings = new Map<string, Finding[]>();
  for (const f of input.findings) {
    const skill = getMistakeTag(f.tag)?.skill;
    if (skill) findings.set(skill, [...(findings.get(skill) ?? []), f]);
  }
  // A finding only exists in a group that is on; an observed skill without one needs its dimension's group on.
  const skills = new Set([...findings.keys(), ...input.skills_observed.filter(s => {
    const dim = OBSERVED_DIMENSION[s];
    return dim !== undefined && groupsOn.has(dim);
  })]);
  for (const skill of skills) {
    if (!hasLiveDrill(skill, isLive)) continue;
    const fs = findings.get(skill) ?? [];
    const dim = OBSERVED_DIMENSION[skill];
    const score = fs.some(f => f.severity === 'major') ? 0
      : fs.length > 0 ? MIDDLE
      : dim && input.rubric_scores[dim] === 'strong' ? 1 : MIDDLE;
    out[skill] = { score, count: 1, place: placeFor(skill, score, isLive) };
  }
  return out;
}

// The skills the quick quiz places (its parts' drills' skills with a live drill): what the case is measured against.
export function quizSkills(isLive?: (drillId: string) => boolean): string[] {
  const ids = DRILLS_CONFIG.programs.diagnostic.parts.flatMap(p => DRILLS_CONFIG.drills.drills.find(d => d.id === p.drill)?.primary_skills ?? []);
  return [...new Set(ids)].filter(id => hasLiveDrill(id, isLive));
}

// The quiz skills a starting-point case left unplaced: each gets a quick check when the plan reaches it.
export const untestedSkills = (placed: Record<string, unknown>, isLive?: (drillId: string) => boolean) =>
  quizSkills(isLive).filter(id => !(id in placed));

// The next-case picker's view of the cases taken: the set-aside starting point isn't taken; it may be offered again,
// last, from RETURN_AFTER_DAYS after it was taken.
export function returningCase(setAside: { caseId: string; completedAt: Date } | null, now: Date): { caseId: string; eligible: boolean } | null {
  if (!setAside) return null;
  return { caseId: setAside.caseId, eligible: now.getTime() - setAside.completedAt.getTime() >= RETURN_AFTER_DAYS * 86_400_000 };
}
