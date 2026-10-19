import { describe, it, expect } from 'vitest';
import {
  firstCompletions, milestoneSkills, missRates, missesByWeek, moveDirection, nextStep, readiness, scoreChart, scorePoints, skillArrow,
  strengths, summary, weeks, type DashAttempt, type DashCase, type DashEvent, type DashSet,
} from '@/lib/drills/progress/dashboard';
import { newProgress, type SkillProgress, type SkillStateName } from '@/lib/drills/progress/engine';

const DAY = 86_400_000;
const now = new Date('2026-10-18T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);
let n = 0;
const set = (o: Partial<DashSet>): DashSet => ({
  id: `s${n++}`, drillId: 'PS-1', tier: 1, stage: 'recognize', source: 'specific', status: 'completed', skillScores: null, startedAt: ago(1), completedAt: ago(1), ...o,
});
const attempt = (o: Partial<DashAttempt>): DashAttempt => ({
  id: `a${n++}`, setId: 'x', drillId: 'PS-1', tier: 1, setSource: 'specific', position: 0, submittedAt: ago(1), mistakeTags: [], skipped: false,
  gradingStatus: 'not_needed', timeMs: 30_000, timeLimitMs: 60_000, ...o,
});
const event = (skillId: string, from: SkillStateName, to: SkillStateName, days: number, reason = 'set passed'): DashEvent => ({ skillId, fromState: from, toState: to, reason, createdAt: ago(days) });
const progress = (states: Record<string, SkillStateName>, scores: Record<string, number> = {}) =>
  new Map(Object.entries(states).map(([id, state]) => [id, { ...newProgress(id), state, last_skill_score: scores[id] ?? null } as SkillProgress]));
// n answers in a window, `missedCount` of them with a mistake.
const answers = (count: number, missedCount: number, days: number, o: Partial<DashAttempt> = {}) =>
  Array.from({ length: count }, (_, i) => attempt({ submittedAt: ago(days), mistakeTags: i < missedCount ? ['M.overlap'] : [], ...o }));
const fiveSets = (days: number) => Array.from({ length: 5 }, () => set({ completedAt: ago(days) }));

describe('Your progress: summary (A1, A2)', () => {
  it('says there is not enough practice with fewer than 5 sets in either window', () => {
    const s = summary([...fiveSets(3), ...fiveSets(20).slice(0, 4)], [], [], 14, now);
    expect(s).toMatchObject({ status: 'not_enough', sentence: 'Not enough practice yet to tell.' });
    // Diagnostic parts don't count.
    expect(summary([...fiveSets(3), ...fiveSets(20).map(x => ({ ...x, source: 'diagnostic' }))], [], [], 14, now).status).toBe('not_enough');
  });

  it('counts placements and starting a skill as no move', () => {
    expect(moveDirection(event('PS.mece', 'not_started', 'learning', 1))).toBe(0);
    expect(moveDirection(event('PS.mece', 'learning', 'practiced', 1, 'diagnostic placement'))).toBe(0);
    expect(moveDirection(event('PS.mece', 'learning', 'recognizes', 1))).toBe(1);
    expect(moveDirection(event('PS.mece', 'mastered', 'practiced', 1))).toBe(-1);
  });

  it('compares the mistake rate only over drill-and-tier mixes practiced in both windows', () => {
    // Window 2 adds tier 2 work with many misses: it isn't in window 1, so it's left out.
    const r = missRates([
      ...answers(20, 4, 3), ...answers(20, 18, 3, { tier: 2 }), ...answers(20, 8, 20),
    ], [ago(14), now], [ago(28), ago(14)]);
    expect(r).toEqual({ cur: 2, prev: 4, answers: [20, 20] });
    // Too few answers: no rate.
    expect(missRates([...answers(10, 1, 3), ...answers(20, 2, 20)], [ago(14), now], [ago(28), ago(14)])).toBeNull();
  });

  it('is improving with more skills up and no rise; slipping needs +20% and +1 in 10', () => {
    const sets = [...fiveSets(3), ...fiveSets(20)];
    const up = [event('PS.mece', 'learning', 'recognizes', 2), event('QN.setup', 'recognizes', 'practiced', 3)];
    const improving = summary(sets, [...answers(20, 2, 3), ...answers(20, 4, 20)], up, 14, now);
    expect(improving.status).toBe('improving');
    expect(improving.sentence).toBe("You're improving: 2 skills moved up, and you missed fewer answers (1 in 10, down from 2).");
    // 1.0 → 1.5 in 10 is +50% but only +0.5: not slipping.
    expect(summary(sets, [...answers(20, 3, 3), ...answers(20, 2, 20)], [], 14, now).status).toBe('steady');
    // 2 → 3.5 in 10: slipping.
    const slip = summary(sets, [...answers(20, 7, 3), ...answers(20, 4, 20)], [], 14, now);
    expect(slip.status).toBe('slipping');
    expect(slip.sentence).toContain('you missed more answers (3.5 in 10, up from 2)');
    expect(summary(sets, [], [event('PS.mece', 'mastered', 'practiced', 2)], 14, now).status).toBe('slipping');
  });
});

describe('Your progress: skill arrows and the score chart (A3, A4)', () => {
  const scored = (score: number, days: number, o: Partial<DashSet> = {}) => set({ completedAt: ago(days), skillScores: { 'PS.mece': { score, count: 4 } }, ...o });

  it('uses a state move first, then 3 sets against 3 at the same stage and tier', () => {
    expect(skillArrow('PS.mece', [event('PS.mece', 'learning', 'recognizes', 2)], [], ago(14), now)).toBe('up');
    const flat = scorePoints([0.6, 0.62, 0.61, 0.63, 0.6, 0.64].map((s, i) => scored(s, 10 - i)), 'PS.mece');
    expect(skillArrow('PS.mece', [], flat, ago(14), now)).toBe('flat');
    const rising = scorePoints([0.5, 0.5, 0.5, 0.7, 0.7, 0.7].map((s, i) => scored(s, 10 - i)), 'PS.mece');
    expect(skillArrow('PS.mece', [], rising, ago(14), now)).toBe('up');
    // A tier-up resets the comparison: too few sets at tier 2, no arrow.
    const tierUp = scorePoints([0.9, 0.9, 0.9, 0.9, 0.5, 0.5].map((s, i) => scored(s, 10 - i, { tier: i < 4 ? 1 : 2 })), 'PS.mece');
    expect(skillArrow('PS.mece', [], tierUp, ago(14), now)).toBe('none');
  });

  it('marks tier and stage changes, with the bar drawn in', () => {
    const pts = scorePoints([scored(0.9, 5), scored(0.6, 4, { tier: 2 }), scored(0.7, 3, { tier: 2, stage: 'construct' })], 'PS.mece');
    const chart = scoreChart('MECE structure', pts, d => d.toISOString().slice(5, 10))!;
    expect(chart.markers).toEqual([{ index: 1, label: '▲ Up to tier 2' }, { index: 2, label: '▲ Construct drills' }]);
    // Tier 1 sets don't count toward a state: hollow, with the reason in the table.
    expect(chart.hollow).toEqual([0]);
    expect(chart.notes[0].text).toMatch(/^Doesn't count: Tier 1 sets/);
    const down = scoreChart('MECE structure', scorePoints([scored(0.9, 5, { tier: 2 }), scored(0.6, 4)], 'PS.mece'), d => d.toISOString())!;
    expect(down.markers[0].label).toBe('▼ Down to tier 1');
    expect(chart.reference_lines[0].value).toBe(80);
    expect(chart.series[0].values).toEqual([90, 60, 70]);
  });

  it('leaves weeks without answers as gaps', () => {
    const ws = weeks(now, 3, d => d.toISOString().slice(5, 10));
    const chart = missesByWeek(answers(10, 3, 2), ws);
    expect(chart.gaps).toEqual([0, 1]);
    expect(chart.series[0].values[2]).toBe(3);
  });
});

describe('Your progress: readiness, strengths, next step', () => {
  const live = ['PS.mece', 'PS.case_specific', 'QN.setup', 'HY.form', 'EX.takeaway', 'QN.sizing_structure', 'SY.answer_first', 'SY.evidence', 'CL.next_step', 'QN.arithmetic'];
  const strong = { structure: 'strong', quantitative: 'strong', synthesis: 'meets_bar' };
  const kase = (caseId: string, tier: number, days: number, ratings: Record<string, string> = strong): DashCase => ({ key: `${caseId}-${days}`, caseId, tier, completedAt: ago(days), ratings, findings: [] });

  it('uses the plan\'s 9 milestone skills', () => {
    expect(milestoneSkills().sort()).toEqual(live.slice(0, 9).sort());
  });

  it('counts only first completions of different cases: retakes don\'t count', () => {
    const cs = [kase('a', 2, 10, { structure: 'needs_work' }), kase('b', 2, 8), kase('a', 2, 2)];
    expect(firstCompletions(cs).map(c => c.key)).toEqual(['a-10', 'b-8']);
    const all = Object.fromEntries(live.map(id => [id, 'mastered' as SkillStateName]));
    const r = readiness(progress(all), live, cs, true);
    // The retake of "a" (strong) is ignored; its first try didn't meet the bar.
    expect(r.lines[2]).toMatchObject({ met: false, detail: '1 of your last 2 met the bar.' });
    expect(r.status).toBe('Getting close');
    expect(readiness(progress(all), live, [kase('a', 2, 10), kase('b', 3, 5)], true).status).toBe('Interview ready');
    // Tier 1 cases don't count.
    expect(readiness(progress(all), live, [kase('a', 1, 10), kase('b', 1, 5)], true).lines[2].met).toBe(false);
  });

  it('says why the case line is open while no case data arrives', () => {
    const r = readiness(progress({}), live, [], false);
    expect(r.status).toBe('Building');
    expect(r.lines[2].detail).toBe('Case results reach your training once full cases send them.');
  });

  it('starts strengths at Practiced: highest state, then last score; never a skill still prescribed', () => {
    const score = (id: string) => ({ 'PS.mece': 0.7, 'EX.takeaway': 0.9 } as Record<string, number>)[id] ?? null;
    const p = progress({ 'PS.mece': 'practiced', 'QN.setup': 'mastered', 'HY.form': 'recognizes', 'EX.takeaway': 'practiced' });
    expect(strengths(p, live, score, new Set()).map(x => x.skill_id)).toEqual(['QN.setup', 'EX.takeaway', 'PS.mece']);
    expect(strengths(p, live, score, new Set(['QN.setup'])).map(x => x.skill_id)).toEqual(['EX.takeaway', 'PS.mece']);
  });

  it('only charts sets that train the skill directly', () => {
    // QN-4 scores arithmetic on the side but trains math setup: no arithmetic point.
    const sets = [set({ drillId: 'QN-4', stage: 'construct', tier: 2, skillScores: { 'QN.arithmetic': { score: 0.5, count: 4 }, 'QN.setup': { score: 0.9, count: 4 } } })];
    expect(scorePoints(sets, 'QN.arithmetic')).toEqual([]);
    expect(scorePoints(sets, 'QN.setup')).toHaveLength(1);
  });

  it('says Validated needs a full case', () => {
    const p = { ...newProgress('PS.mece'), state: 'mastered' as const };
    expect(nextStep(p, { passing_sets: 2, of: 2, last_score: 0.9, bar: 0.8 }, now, id => id)).toBe('Validated needs a full case that shows this skill.');
  });
});
