// A case interview as the starting point (Matt, 21–22 Nov): the three-option choice, the placement rule (the quiz's
// three places), quick checks for untested skills, and the starting-point case set aside for readiness when it didn't
// meet the bar (approved by Matt, 22 Nov). The database side: `npm run drills:smoke:starting-point`.
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/drills', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/db/client', () => ({ db: {} }));

import {
  BUILD_WAIT_MS, OBSERVED_DIMENSION, RETURN_AFTER_DAYS, isBuildingFromCase, STARTING_POINT_CASE_ID, casePlacements, isSetAside, quizSkills, returningCase, startingPointCase, untestedSkills,
} from '@/lib/drills/program/starting-point';
import { pickNextCase, type LibraryCase, type TakenCase } from '@/lib/drills/program/next-case';
import { firstCompletions, readiness, type DashCase } from '@/lib/drills/progress/dashboard';
import { skillsObserved } from '@/lib/scoring/case-result-builder';
import { DEFAULT_DRILL_GROUPS } from '@/lib/drills/case-to-drills';
import { START_CHOICE, caseCardLines } from '@/lib/drills/program/start-choice-text';
import { DRILL_SCREENS } from '@/app/dev/ui-preview/_data/drills';
import { getCaseById } from '@/lib/cases/loader';
import { caseMinutes } from '@/lib/cases/listed';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { newProgress, type SkillStateName } from '@/lib/drills/progress/engine';
import { milestoneSkills } from '@/lib/drills/progress/dashboard';

const DAY = 86_400_000;
const now = new Date('2026-11-22T12:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const groups = new Set<string>(DEFAULT_DRILL_GROUPS);
const strongAll = { structure: 'strong', quantitative: 'strong', synthesis: 'meets_bar', communication: 'strong' };
const weak = { structure: 'needs_work', quantitative: 'meets_bar', synthesis: 'meets_bar', communication: 'meets_bar' };

describe('the case is Brew & Bean, Medium', () => {
  it('is prof-001, a listed Medium case', () => {
    expect(STARTING_POINT_CASE_ID).toBe('prof-001');
    expect(getCaseById(STARTING_POINT_CASE_ID).difficulty).toBe('medium');
  });
});

describe('which case is the starting point', () => {
  const c = (id: string, d: number, extra: object = {}) => ({ caseAttemptId: id, caseId: 'prof-001', completedAt: ago(d), backfilled: false, partial: false, rubric: weak, ...extra });
  it('the first graded case, when no quiz or questions came before it', () => {
    expect(startingPointCase([c('b', 3), c('a', 5)], null)?.caseAttemptId).toBe('a');
    expect(startingPointCase([c('a', 5)], ago(2))?.caseAttemptId).toBe('a');   // the quiz came after
  });
  it('none when the quiz or the questions came first, or only backfilled cases exist', () => {
    expect(startingPointCase([c('a', 5)], ago(6))).toBeNull();
    expect(startingPointCase([c('a', 5, { backfilled: true })], null)).toBeNull();
    expect(startingPointCase([], null)).toBeNull();
  });
  it('is set aside when it did not meet the bar or ended early; counts when it met the bar', () => {
    expect(isSetAside(c('a', 5))).toBe(true);
    expect(isSetAside(c('a', 5, { rubric: strongAll }))).toBe(false);
    expect(isSetAside(c('a', 5, { rubric: strongAll, partial: true }))).toBe(true);
    expect(isSetAside(null)).toBe(false);
  });
});

describe('placement: the quiz\'s three places (approved 22 Nov)', () => {
  const placed = casePlacements({
    findings: [
      { tag: 'M.overlapping_buckets', severity: 'major' },   // PS.mece
      { tag: 'M.generic_framework', severity: 'minor' },     // PS.case_specific
    ],
    skills_observed: ['PS.mece', 'PS.case_specific', 'PS.depth', 'QN.setup', 'QN.arithmetic', 'EX.takeaway', 'EX.extraction', 'SY.answer_first', 'BJ.so_what'],
    rubric_scores: { structure: 'needs_work', quantitative: 'strong', dataExhibit: 'strong', synthesis: 'meets_bar', judgment: 'strong' },
  }, groups);
  it('a major finding starts at Recognize (a quiz score under 50%)', () => {
    expect(placed['PS.mece'].place).toBe('recognize');
  });
  it('a minor finding, or no finding below Strong, takes the middle place (50–79%)', () => {
    expect(['repair', 'recognize_t2']).toContain(placed['PS.case_specific'].place);
    expect(['repair', 'recognize_t2']).toContain(placed['PS.depth'].place);           // structure needs work, no finding on depth
    expect(['repair', 'recognize_t2']).toContain(placed['SY.answer_first'].place);    // synthesis Adequate
  });
  it('no finding in a dimension rated Strong tests out (80% or more)', () => {
    expect(placed['QN.setup'].place).toBe('test_out');
  });
  it('leaves exhibits and judgment (groups off) unplaced, and skills with no live drill', () => {
    expect(placed['EX.takeaway']).toBeUndefined();
    expect(placed['EX.extraction']).toBeUndefined();
    expect(placed['BJ.so_what']).toBeUndefined();
  });
  it('the skills the quiz measures that the case left unplaced get quick checks', () => {
    expect(quizSkills()).toEqual(expect.arrayContaining(['PS.mece', 'HY.form', 'EX.takeaway', 'SY.answer_first', 'CL.next_step', 'QN.setup']));
    const untested = untestedSkills(placed);
    expect(untested.length).toBeGreaterThan(0);
    for (const id of untested) expect(placed[id]).toBeUndefined();
    expect(untested).toContain('HY.form');   // a case can't observe hypotheses
  });
  it('knows the dimension of every skill a case can observe', () => {
    const rubric = Object.fromEntries(['structure', 'quantitative', 'dataExhibit', 'judgment', 'creativity', 'communication', 'synthesis', 'pushback'].map(k => [k, { rating: 'meets_bar' }]));
    const stages = ['structure', 'exhibit', 'brainstorm', 'recommendation', 'risk', 'pressure_test'];
    const rec = Object.fromEntries(stages.map(s => [s, { delivered: true, outcome: 'answered' }]));
    const all = skillsObserved({ rubric: rubric as never, stageRecord: rec as never, candidateTurns: [{ turnIndex: 1, text: 'x' }], mathSteps: [{ mentioned: true, unit: 'percent' }], dataRequested: true });
    expect(all.length).toBeGreaterThan(12);
    for (const s of all) expect(OBSERVED_DIMENSION[s], s).toBeDefined();
  });
});

describe('readiness with a set-aside starting point (approved 22 Nov)', () => {
  const strong = { structure: 'strong', quantitative: 'strong', synthesis: 'meets_bar' };
  const kase = (key: string, caseId: string, tier: number, d: number, ratings: Record<string, string>, extra: Partial<DashCase> = {}): DashCase =>
    ({ key, caseId, tier, completedAt: ago(d), ratings, findings: [], ...extra });
  const live = milestoneSkills();
  const all = new Map(live.map(id => [id, { ...newProgress(id), state: 'mastered' as SkillStateName }]));
  it('the next attempt at the set-aside case counts as its first', () => {
    const cs = [kase('bb1', 'prof-001', 2, 30, weak, { setAside: true }), kase('qp', 'pricing-001', 3, 10, strong), kase('bb2', 'prof-001', 2, 2, strong)];
    expect(firstCompletions(cs).map(c => c.key)).toEqual(['qp', 'bb2']);
    expect(readiness(all, live, cs, true).lines[2].met).toBe(true);
  });
  it('without the rule, the weak first try would block readiness for good', () => {
    const cs = [kase('bb1', 'prof-001', 2, 30, weak), kase('qp', 'pricing-001', 3, 10, strong), kase('bb2', 'prof-001', 2, 2, strong)];
    expect(readiness(all, live, cs, true).lines[2].met).toBe(false);
  });
});

describe('the next-case picker with a set-aside starting point (approved 22 Nov)', () => {
  const lib: LibraryCase[] = [
    { id: 'prof-001', title: 'Brew & Bean', case_type: 'profitability', tier: 2 },
    { id: 'prof-002', title: 'Larkspur', case_type: 'profitability', tier: 1 },
    { id: 'pricing-001', title: 'Quillpath', case_type: 'pricing', tier: 3 },
    { id: 'launch-001', title: 'Hollis Bay', case_type: 'new_product_launch', tier: 1 },
  ];
  const taken = (id: string, d: number): TakenCase => ({ case_id: id, completed_at: ago(d), tier: lib.find(c => c.id === id)!.tier, rubric: weak });
  it('offers the cases the student hasn\'t tried first', () => {
    const r = pickNextCase(lib, [], 'PS', returningCase({ caseId: 'prof-001', completedAt: ago(30) }, now));
    expect(r?.case_id).not.toBe('prof-001');
  });
  it('never offers it again within 14 days', () => {
    const r = pickNextCase(lib, [taken('prof-002', 5), taken('pricing-001', 4), taken('launch-001', 3)], 'PS', returningCase({ caseId: 'prof-001', completedAt: ago(RETURN_AFTER_DAYS - 1) }, now));
    expect(r).toMatchObject({ case_id: null, retake: true });
  });
  it('offers it again, not as a retake, once every other case is taken and 14 days have passed', () => {
    const r = pickNextCase(lib, [taken('prof-002', 5), taken('pricing-001', 4), taken('launch-001', 3)], 'PS', returningCase({ caseId: 'prof-001', completedAt: ago(RETURN_AFTER_DAYS) }, now));
    expect(r).toMatchObject({ case_id: 'prof-001', retake: false });
  });
  it('a starting point that met the bar is simply taken', () => {
    expect(returningCase(null, now)).toBeNull();
  });
});

describe('the choice (text approved by Matt, 22 Nov)', () => {
  const html = (slug: string) => renderToStaticMarkup((DRILL_SCREENS.find(s => s.slug === slug)!.render() as { node: ReactNode }).node).replace(/&#x27;/g, '’').replace(/&amp;/g, '&');
  it('three equal options, in order: questions, quiz, case', () => {
    const h = html('training-home-new');
    expect(h).toContain(START_CHOICE.heading);
    expect(h).toContain('Short on time? Answer a few questions. New to cases? Take the quiz. Done a few? Take the case.');
    const text = h.replace(/<[^>]+>/g, '');
    const at = (t: string) => text.indexOf(t);
    expect(at('Quick questions · 2–3 min')).toBeGreaterThan(-1);
    expect(at('Quick questions · 2–3 min')).toBeLessThan(at('Quick quiz · about 15 min'));
    expect(at('Quick quiz · about 15 min')).toBeLessThan(at('Case interview · about 20 min, then a feedback report.'));
    for (const t of [START_CHOICE.questions.body, START_CHOICE.quiz.body, START_CHOICE.case.body, 'Uses one of today’s 2 cases.']) expect(h).toContain(t);
    expect(h).toMatch(/<ul class="grid gap-3 sm:grid-cols-3">/);
    expect(h).toMatch(/href="\/drills\/questionnaire"[^>]*>Answer the questions</);
    expect(h).toMatch(/href="\/drills\/diagnostic"[^>]*>Start the quiz</);
    expect(h).toMatch(/href="\/home\?case=prof-001#case-prof-001"[^>]*>Start the case</);
  });
  it('today\'s cases used: the case button is off and says why', () => {
    const h = html('training-home-new-limit');
    expect(h).toContain('You’ve used today’s 2 cases. Take the quiz now, or come back tomorrow.');
    expect(h).toMatch(/aria-disabled="true"[^>]*>Start the case</);
    expect(h).not.toContain('href="/home?case=prof-001#case-prof-001"');
  });
  it('the last case ended too early: says so above the options', () => {
    expect(html('training-home-new-ended')).toContain('Your case ended too early to place you.');
    expect(html('training-home-new')).not.toContain('ended too early');
  });
  it('practicing on their own: the cards suggest what to practice, not a plan', () => {
    const h = html('training-home-self-new');
    expect(h).toContain('Tell us about your experience and we’ll suggest what to practice. Your first sets include short checks.');
    expect(h).toContain('10 short drills across the core skills. Places 12 skills and suggests what to practice.');
    expect(h).not.toContain('build your plan');
    expect(h).not.toContain('builds your plan');
  });
  it('the daily line follows the limit', () => {
    expect(caseCardLines(3, 'daily')).toEqual({ uses: 'Uses one of today’s 3 cases.', blocked: 'You’ve used today’s 3 cases. Take the quiz now, or come back tomorrow.' });
    expect(caseCardLines(2, 'monthly').blocked).toBeNull();   // the Cases page's own message
  });
});

describe('the case card says the length Cases says (Matt, 22 Nov)', () => {
  it('"Case interview · about 20 min, then a feedback report." — from the case, as on Cases', () => {
    const cases = Math.round(caseTotalMs(getCaseById(STARTING_POINT_CASE_ID)) / 60_000);
    expect(caseMinutes(STARTING_POINT_CASE_ID)).toBe(cases);
    expect(START_CHOICE.case.title(cases)).toBe('Case interview · about 20 min, then a feedback report.');
  });
});

describe('while the plan is built from a case (Matt, 22 Nov)', () => {
  const base = { planSource: 'case', wired: true, hasCaseResult: false, lastCaseCompletedAt: new Date(now.getTime() - 3 * 60_000), now };
  it('shows the message between the case ending and its result arriving', () => {
    expect(isBuildingFromCase(base)).toBe(true);
  });
  it('not once the result has arrived, after the wait, for another plan source, or with the switch off', () => {
    expect(isBuildingFromCase({ ...base, hasCaseResult: true })).toBe(false);
    expect(isBuildingFromCase({ ...base, lastCaseCompletedAt: new Date(now.getTime() - BUILD_WAIT_MS) })).toBe(false);
    expect(isBuildingFromCase({ ...base, planSource: 'diagnostic' })).toBe(false);
    expect(isBuildingFromCase({ ...base, wired: false })).toBe(false);
    expect(isBuildingFromCase({ ...base, lastCaseCompletedAt: null })).toBe(false);
  });
  it('Today: the message instead of a default workout or "Your plan is ready"', () => {
    const h = renderToStaticMarkup((DRILL_SCREENS.find(s => s.slug === 'training-home-building')!.render() as { node: ReactNode }).node).replace(/&#x27;/g, '’');
    expect(h).toContain('We’re building your plan from your case. It’ll be ready in a few minutes.');
    expect(h).toMatch(/role="status"[^>]*>We’re building your plan/);
    expect(h).not.toContain('Your plan is ready');
    expect(h).not.toContain('Start today’s workout');
    expect(h).not.toContain('Bonus Quick Fix');
  });
});

