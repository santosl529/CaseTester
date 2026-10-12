// D4 gate, part 1: scripted Foundations, Standard and Sprint students get the
// plans defined in docs/prd-drills.md "Training program".
import { describe, it, expect } from 'vitest';
import { addDays, assignTrack, buildPlan, currentDay, currentWeek, daysBetween, localDate, offerSprint, planFinished } from '@/lib/drills/program/plan';

const today = '2026-10-12';   // a Monday

describe('track assignment (PRD "Tracks")', () => {
  const a = (o: Partial<Parameters<typeof assignTrack>[0]>) =>
    assignTrack({ wants_plan: true, cases_done: '1-5', interview_date: null, ...o }, today);

  it('applies the first rule that fits', () => {
    expect(a({ interview_date: addDays(today, 14) })).toBe('sprint');
    expect(a({ interview_date: addDays(today, 14), cases_done: '0' })).toBe('sprint');   // Sprint wins
    expect(a({ interview_date: addDays(today, 15), cases_done: '0' })).toBe('foundations');
    expect(a({ diagnostic_score: 0.49 })).toBe('foundations');
    expect(a({ diagnostic_score: 0.5 })).toBe('standard');
    expect(a({})).toBe('standard');
    expect(a({ wants_plan: false, interview_date: addDays(today, 3) })).toBe('self_directed');
  });

  it('offers Sprint to self-directed students within 14 days, without switching', () => {
    expect(offerSprint(addDays(today, 10), today)).toBe(true);
    expect(offerSprint(addDays(today, 20), today)).toBe(false);
    expect(offerSprint(null, today)).toBe(false);
  });
});

describe('six-week plans (PRD "Six-week plan")', () => {
  it('Standard, no interview date: Week 0 plus six weeks with the PRD themes, targets and milestones', () => {
    const plan = buildPlan({ track: 'standard', start_date: today, interview_date: null, workouts_per_week: 4 });
    if (plan.kind !== 'weeks') throw new Error('expected weeks');
    expect(plan.weeks.map(w => [w.week, w.theme, w.start, w.cases_target, w.workouts_target])).toEqual([
      [0, 'Diagnose', '2026-10-12', 1, 0],
      [1, 'Structure and math', '2026-10-13', 1, 4],
      [2, 'Hypotheses and exhibits', '2026-10-20', 1, 4],
      [3, 'Judgment and synthesis', '2026-10-27', 1, 4],
      [4, 'Integration', '2026-11-03', 2, 4],
      [5, 'Interview performance', '2026-11-10', 2, 4],
      [6, 'Readiness', '2026-11-17', 2, 4],
    ]);
    expect(plan.weeks[1]).toMatchObject({ focus_areas: ['PS'], focus_skills: ['QN.setup', 'QN.percentages', 'QN.magnitude'] });
    expect(plan.weeks[1].milestones).toEqual([{ type: 'skills', skills: ['PS.mece', 'PS.case_specific', 'QN.setup'], state: 'practiced' }]);
    expect(plan.weeks[5].prefer_tier).toBe(3);
    expect(plan.weeks[6].transfer_all).toBe(true);
    expect(plan.weeks[1].end).toBe('2026-10-19');
  });

  it('Foundations: no case in weeks 0–1, one a week in weeks 2–3, two in weeks 4–6', () => {
    const plan = buildPlan({ track: 'foundations', start_date: today, interview_date: null, workouts_per_week: 3 });
    if (plan.kind !== 'weeks') throw new Error('expected weeks');
    expect(plan.weeks.map(w => w.cases_target)).toEqual([0, 0, 1, 1, 2, 2, 2]);
  });

  it('compresses for an interview 15–41 days away: keeps Week 0, ends with Weeks 5 and 6, splits weeks 1–4 in order', () => {
    const plan = buildPlan({ track: 'standard', start_date: today, interview_date: addDays(today, 30), workouts_per_week: 4 });
    if (plan.kind !== 'weeks') throw new Error('expected weeks');
    // 29 days after Week 0 → 4 weeks: two middle weeks, then Weeks 5 and 6.
    expect(plan.weeks.map(w => w.source_weeks)).toEqual([[0], [1, 2], [3, 4], [5], [6]]);
    expect(plan.weeks[1].theme).toBe('Structure and math + Hypotheses and exhibits');
    expect(plan.weeks[1].focus_areas).toEqual(['PS', 'HY', 'EX']);
    expect(plan.weeks[1].milestones).toHaveLength(2);

    const short = buildPlan({ track: 'standard', start_date: today, interview_date: addDays(today, 15), workouts_per_week: 4 });
    if (short.kind !== 'weeks') throw new Error('expected weeks');
    expect(short.weeks.map(w => w.source_weeks)).toEqual([[0], [5], [6]]);

    const five = buildPlan({ track: 'standard', start_date: today, interview_date: addDays(today, 41), workouts_per_week: 4 });
    if (five.kind !== 'weeks') throw new Error('expected weeks');
    expect(five.weeks.map(w => w.source_weeks)).toEqual([[0], [1, 2], [3], [4], [5], [6]]);
  });

  it('runs as written, then repeats Readiness weeks, when the interview is more than 6 weeks away', () => {
    const plan = buildPlan({ track: 'standard', start_date: today, interview_date: addDays(today, 60), workouts_per_week: 4 });
    if (plan.kind !== 'weeks') throw new Error('expected weeks');
    // 59 days after Week 0 → 8 full weeks: the six, then two more Readiness weeks.
    expect(plan.weeks.map(w => w.source_weeks)).toEqual([[0], [1], [2], [3], [4], [5], [6], [6], [6]]);
  });

  it('knows the current week, and when the plan has finished', () => {
    const plan = buildPlan({ track: 'standard', start_date: today, interview_date: null, workouts_per_week: 4 });
    expect(currentWeek(plan, today)!.week).toBe(0);
    expect(currentWeek(plan, '2026-10-13')!.week).toBe(1);
    expect(currentWeek(plan, '2026-10-19')!.week).toBe(1);
    expect(currentWeek(plan, '2026-10-20')!.week).toBe(2);
    expect(planFinished(plan, '2026-11-23')).toBe(false);
    expect(planFinished(plan, '2026-11-24')).toBe(true);
  });
});

describe('Sprint (PRD "Sprint plan")', () => {
  const days = (n: number) => {
    const plan = buildPlan({ track: 'sprint', start_date: today, interview_date: addDays(today, n), workouts_per_week: 4 });
    if (plan.kind !== 'days') throw new Error('expected days');
    return plan;
  };

  it('7 days before the interview: the seven PRD days, ending the day before', () => {
    const plan = days(7);
    expect(plan.days.map(d => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.days[6].date).toBe('2026-10-18');
    expect(plan.days.reduce((s, d) => s + d.cases, 0)).toBe(3);
    expect(currentDay(plan, today)!.activities).toEqual(['diagnostic', 'case']);
  });

  it('more than 7 days: days 2–5 repeat before day 6', () => {
    expect(days(10).days.map(d => d.day)).toEqual([1, 2, 3, 4, 5, 2, 3, 4, 6, 7]);
  });

  it('fewer than 7 days: days 2–5 are cut short', () => {
    expect(days(5).days.map(d => d.day)).toEqual([1, 2, 3, 6, 7]);
    expect(days(2).days.map(d => d.day)).toEqual([1, 7]);
    expect(days(1).days.map(d => d.day)).toEqual([1]);
  });
});

describe('dates', () => {
  it("uses the student's time zone for today", () => {
    const late = new Date('2026-10-13T03:30:00Z');
    expect(localDate('America/New_York', late)).toBe('2026-10-12');
    expect(localDate('Asia/Tokyo', late)).toBe('2026-10-13');
    expect(localDate('Not/AZone', late)).toBe('2026-10-13');
    expect(daysBetween('2026-10-12', '2026-11-01')).toBe(20);
  });
});
