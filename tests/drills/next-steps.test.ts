import { describe, expect, it } from 'vitest';
import { buildNextSteps, lessonMinutes, nextStepsStatus, totalMinutes } from '@/lib/drills/next-steps';
import type { CaseResultPayload } from '@/lib/drills/case-result';

const payload = (findings: (CaseResultPayload['findings'][number] & { tip?: string })[], extra: Partial<CaseResultPayload> = {}) => ({
  case_attempt_id: 's1', student_id: '00000000-0000-4000-8000-000000000002', case_id: 'launch-001', case_type: 'new_product_launch' as const,
  difficulty_tier: 1 as const, completed_at: '2026-11-14T12:00:00Z', taxonomy_version: 'v1.1', rubric_scores: {}, skills_observed: [], findings, ...extra,
});
const f = (tag: string, severity: 'minor' | 'major', evidence: string, tip?: string) => ({ tag, severity, turn_ids: [3], evidence, ...(tip && { tip }) });
const live = (id: string) => !['BJ.risks', 'BJ.so_what', 'CR.volume'].includes(id);
const base = {
  retake: false, metTheBar: false, hasLiveDrill: live,
  lessons: new Map([['QN.percentages', { words: 560 }], ['PS.mece', { words: 401 }], ['CL.pushback', { words: 300 }]]),
  practice: new Map([['QN.percentages', { drill_name: 'Mental math', level: 2, minutes: 8 }], ['PS.mece', { drill_name: 'Fix the framework', level: 2, minutes: 10 }]]),
};

describe('your next steps (Matt, 15 Nov)', () => {
  it('lists the case’s skills in the shared ranking’s order, each with its plain line, quote, lesson and practice set', () => {
    const p = payload([f('M.overlapping_buckets', 'major', 'revenue, costs and pricing'), f('M.percent_vs_points', 'major', 'it dropped 6 percent')]);
    const s = buildNextSteps({ ...base, payload: p, ranked: [
      { id: 'rx-q', skill_id: 'QN.percentages', priority: 4, evidence: 'it dropped 6 percent' },
      { id: 'rx-p', skill_id: 'PS.mece', priority: 2, evidence: 'revenue, costs and pricing' },
    ] });
    expect(s.skills.map(x => [x.name, x.why, x.quote, x.lesson?.minutes, x.practice?.drill_name])).toEqual([
      ['Percentages', 'You mixed up percent and percentage points.', 'it dropped 6 percent', 3, 'Mental math'],
      ['MECE structure', 'Two of your buckets overlapped.', 'revenue, costs and pricing', 3, 'Fix the framework'],
    ]);
    expect(totalMinutes(s)).toBe(24);
    expect(s.also).toBeNull();
    expect(s.all_clear).toBe(false);
  });

  it('adds one "Also from this case" row for a no-drill skill that weighs at least as much as the lowest skill listed, with the report’s own tip', () => {
    const p = payload([f('M.percent_vs_points', 'minor', 'it dropped 6 percent'), f('M.generic_risk', 'major', 'the economy could change', 'Next time, name a risk only this company faces.')]);
    const s = buildNextSteps({ ...base, payload: p, ranked: [{ id: 'rx-q', skill_id: 'QN.percentages', priority: 1, evidence: null }] });
    expect(s.also).toMatchObject({ name: 'Risks and next steps', why: 'Your risk could apply to any company.', quote: 'the economy could change', lesson: null, tip: 'Next time, name a risk only this company faces.' });
    // Weighs less than the lowest skill listed: no row.
    const lighter = buildNextSteps({ ...base, payload: payload([f('M.percent_vs_points', 'major', 'x'), f('M.generic_risk', 'minor', 'y')]),
      ranked: [{ id: 'rx-q', skill_id: 'QN.percentages', priority: 2, evidence: null }] });
    expect(lighter.also).toBeNull();
  });

  it('is all clear only with no findings and the bar met', () => {
    expect(buildNextSteps({ ...base, payload: payload([]), ranked: [], metTheBar: true }).all_clear).toBe(true);
    expect(buildNextSteps({ ...base, payload: payload([]), ranked: [], metTheBar: false }).all_clear).toBe(false);
  });

  it('marks a skill done only after a passing set since the case; ready when every listed skill with a drill is done', () => {
    const s = buildNextSteps({ ...base, payload: payload([f('M.percent_vs_points', 'major', 'a'), f('M.overlapping_buckets', 'major', 'b')]), ranked: [
      { id: 'rx-q', skill_id: 'QN.percentages', priority: 2, evidence: null }, { id: 'rx-p', skill_id: 'PS.mece', priority: 2, evidence: null },
    ] });
    expect(nextStepsStatus(s, new Set(['QN.percentages']))).toEqual({ done: new Set(['QN.percentages']), ready: false });
    expect(nextStepsStatus(s, new Set(['QN.percentages', 'PS.mece'])).ready).toBe(true);
    expect(lessonMinutes(601)).toBe(4);
  });
});
