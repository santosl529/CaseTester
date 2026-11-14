// The five pages' show-or-hide rules (Matt, 13 Nov: one job per page, empty
// states hidden): Your plan, Learn, Browse drills, Cases, Your progress, and
// the text Today writes from its data.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
import { planSourceLine, scheduleCell, segmentState, showFirstWorkout } from '@/lib/drills/program/plan-page';
import { FOR_YOU_REASON, forYouLessons } from '@/lib/drills/learn-page';
import { browseStages, drillCards } from '@/lib/drills/drill-info';
import { enoughTrend, trendWeeks } from '@/lib/drills/progress/dashboard';
import { casesLeft } from '@/lib/session-limits';
import { caseAttemptRows } from '@/lib/site/past-sessions';
import { focusLine, lowerFirst, mistakeLine } from '@/lib/drills/today-page';
import type { ChartSpec } from '@/lib/drills/chart-spec';

describe('Your plan', () => {
  it('says what built the plan only when that is accurate', () => {
    expect(planSourceLine('diagnostic', false)).toBe('Built from your diagnostic.');
    expect(planSourceLine('questionnaire', false)).toMatch(/^Built from your answers\./);
    // A finished case marks the source, but its results don't reach drills yet.
    expect(planSourceLine('case', false)).toBeNull();
    expect(planSourceLine('case', true)).toBe('Built from your first full case.');
    expect(planSourceLine(null, true)).toBeNull();
  });

  it('marks weeks before this one done, this one current, the rest to come', () => {
    expect([1, 2, 3, 4, 5].map(w => segmentState(w, 3))).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(segmentState(1, null)).toBe('upcoming');
  });

  it('shows done against target for past and current weeks, the target for future ones', () => {
    expect(scheduleCell(1, 3, 3, 3)).toEqual({ text: '3 / 3', met: true, missed: false });
    expect(scheduleCell(3, 3, 2, undefined)).toEqual({ text: '0 / 2', met: false, missed: false });
    expect(scheduleCell(4, 3, 4, 9)).toEqual({ text: '4', met: false, missed: false });
  });

  // Matt, 13 Nov: "32 / 0" and "0 / 3" on a test account's past weeks.
  it('says "32 done" over the target, and marks a past week below it as missed', () => {
    expect(scheduleCell(1, 3, 0, 32)).toEqual({ text: '32 done', met: true, missed: false });
    expect(scheduleCell(3, 3, 2, 5)).toEqual({ text: '5 done', met: true, missed: false });
    expect(scheduleCell(2, 3, 3, 0)).toEqual({ text: '0 / 3 · missed', met: false, missed: true });
    // This week isn't missed until it ends.
    expect(scheduleCell(3, 3, 3, 0)).toEqual({ text: '0 / 3', met: false, missed: false });
    expect(scheduleCell(1, 3, 0, 0)).toEqual({ text: '0 / 0', met: false, missed: false });
  });

  it('shows "Your first workout" only before any workout is completed', () => {
    expect(showFirstWorkout(false, 3, 0)).toBe(true);
    expect(showFirstWorkout(true, 3, 0)).toBe(false);
    expect(showFirstWorkout(false, 0, -1)).toBe(false);
    expect(showFirstWorkout(false, 3, -1)).toBe(false);
  });
});

describe('Learn: For you this week', () => {
  const available = new Set(['QN.arithmetic', 'EX.takeaway', 'HY.form', 'PS.mece', 'SY.answer_first']);
  it('leads with the weakest skill, then the week, unread first, at most three', () => {
    const out = forYouLessons({ available, read: new Set(['EX.takeaway']), weekSkills: ['EX.takeaway', 'HY.form', 'PS.mece', 'SY.answer_first'], weakest: 'QN.arithmetic' });
    expect(out).toEqual([{ skill_id: 'QN.arithmetic', reason: 'weakest' }, { skill_id: 'HY.form', reason: 'week' }, { skill_id: 'PS.mece', reason: 'week' }]);
    expect(FOR_YOU_REASON.weakest).toBeTruthy();
  });
  it('leaves out skills with no lesson, and repeats none', () => {
    const out = forYouLessons({ available, read: new Set(), weekSkills: ['QN.arithmetic', 'CR.ideas', 'HY.form', 'HY.form'], weakest: 'QN.arithmetic' });
    expect(out.map(o => o.skill_id)).toEqual(['QN.arithmetic', 'HY.form']);
  });
  it('is empty with no plan week and no weakest skill (the section is hidden)', () => {
    expect(forYouLessons({ available, read: new Set(), weekSkills: [], weakest: null })).toEqual([]);
    expect(forYouLessons({ available, read: new Set(), weekSkills: [], weakest: 'CR.ideas' })).toEqual([]);
  });
});

describe('Browse drills', () => {
  it('leaves out stages with no live drill', () => {
    const shown = browseStages();
    expect(shown.every(g => g.drills.length > 0)).toBe(true);
    const empty = drillCards().filter(g => g.drills.length === 0).map(g => g.stage);
    for (const stage of empty) expect(shown.map(g => g.stage)).not.toContain(stage);
  });
});

describe('Your progress: trends', () => {
  const spec = (categories: string[], series: { name: string; values: number[] }[], gaps: number[] = []) =>
    ({ categories, series, gaps } as unknown as ChartSpec);
  it('counts the weeks that aren\'t gaps for mistakes and pace', () => {
    expect(trendWeeks(spec(['w1', 'w2', 'w3'], [{ name: 'Missed per 10', values: [0, 3, 2] }], [0]), 'gapped')).toBe(2);
    // A week with answers but no misses still counts.
    expect(enoughTrend(spec(['w1', 'w2'], [{ name: 'Missed per 10', values: [0, 0] }]), 'gapped')).toBe(true);
    expect(enoughTrend(spec(['w1', 'w2', 'w3'], [{ name: 'Time', values: [0, 0, 90] }], [0, 1]), 'gapped')).toBe(false);
  });
  it('counts the weeks where a skill has left Not started for the states chart', () => {
    const states = spec(['w1', 'w2', 'w3'], [{ name: 'Not started', values: [22, 21, 19] }, { name: 'Learning', values: [0, 0, 3] }]);
    expect(trendWeeks(states, 'states')).toBe(1);
    expect(enoughTrend(states, 'states')).toBe(false);
    expect(enoughTrend(spec(['w1', 'w2'], [{ name: 'Learning', values: [1, 2] }]), 'states')).toBe(true);
  });
});

describe('Cases', () => {
  const limits = { perDay: 2, perMonth: 8, sitePerMonth: 150, maxInProgress: 5, exempt: new Set<string>() };
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000);
  it('counts what is left under the closest limit', () => {
    expect(casesLeft({ last24h: [ago(3)], month: 1, siteMonth: 10, inProgress: 0 }, limits)).toEqual({ n: 1, scope: 'day' });
    expect(casesLeft({ last24h: [], month: 7, siteMonth: 10, inProgress: 0 }, limits)).toEqual({ n: 1, scope: 'month' });
    expect(casesLeft({ last24h: [ago(1), ago(2)], month: 2, siteMonth: 10, inProgress: 0 }, limits)).toEqual({ n: 0, scope: 'day' });
    expect(casesLeft({ last24h: [], month: 0, siteMonth: 151, inProgress: 0 }, limits)).toEqual({ n: 0, scope: 'site' });
  });
  it('counts each case\'s finished attempts and finds the latest', () => {
    const at = (d: number) => new Date(Date.UTC(2026, 10, d));
    expect(caseAttemptRows([
      { id: 'a', caseId: 'prof-001', startedAt: at(3) }, { id: 'b', caseId: 'prof-001', startedAt: at(9) },
      { id: 'c', caseId: 'prof-002', startedAt: at(5) },
    ])).toEqual({ 'prof-001': { done: 2, last: 'b' }, 'prof-002': { done: 1, last: 'c' } });
    expect(caseAttemptRows([])).toEqual({});
  });
});

describe('Today', () => {
  it('says the mistake once when its name repeats the skill', () => {
    expect(mistakeLine({ skill_name: 'Arithmetic', mistake: 'arithmetic error', count: 5 })).toBe('5 mistakes in the last 30 days');
    expect(mistakeLine({ skill_name: 'Arithmetic', mistake: 'arithmetic error', count: 1 })).toBe('1 mistake in the last 30 days');
    expect(mistakeLine({ skill_name: 'Math setup', mistake: 'wrong base for a percent change', count: 3 })).toBe('wrong base for a percent change, 3× in the last 30 days');
  });
  it('sums up the week\'s skills, furthest along first', () => {
    expect(focusLine(['learning', 'not_started', 'learning', 'practiced'])).toBe('4 skills in focus this week · 1 practiced, 2 learning, 1 not started');
    expect(focusLine(['learning'])).toBe('1 skill in focus this week · 1 learning');
  });
  it('lowercases a skill name for the button, but not an acronym', () => {
    expect(lowerFirst('Arithmetic')).toBe('arithmetic');
    expect(lowerFirst('MECE structure')).toBe('MECE structure');
  });
});
