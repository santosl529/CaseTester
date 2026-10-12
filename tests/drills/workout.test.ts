// D4 gate, part 2: scripted students get the workouts and milestones defined
// in docs/prd-drills.md "Workouts", "How the plan drives practice".
import { describe, it, expect } from 'vitest';
import { newProgress, type ProgressMap, type SkillProgress } from '@/lib/drills/progress/engine';
import { buildPlan, type PlanWeek } from '@/lib/drills/program/plan';
import {
  buildWorkout, milestoneGaps, missedMilestoneSkills, planPrescriptionSkill, prerequisiteOrder, setMinutes, weekMilestones,
  type OpenPrescription, type WorkoutInput,
} from '@/lib/drills/program/workout';

const now = new Date('2026-10-14T15:00:00Z');
const DAY = 86_400_000;
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const progress = (...ps: Partial<SkillProgress>[]): ProgressMap => new Map(ps.map(p => [p.skill_id!, { ...newProgress(p.skill_id!), ...p }]));
const plan = buildPlan({ track: 'standard', start_date: '2026-10-12', interview_date: null, workouts_per_week: 4 });
const weeks = plan.kind === 'weeks' ? plan.weeks : [];
const week = (n: number): PlanWeek => weeks[n];
let n = 0;
const rx = (skill_id: string, priority: number, source: OpenPrescription['source'] = 'case'): OpenPrescription =>
  ({ id: `rx-${++n}`, skill_id, priority, source, reason: `reason for ${skill_id}`, created_at: new Date(now.getTime() - n * 1000) });

function input(o: Partial<WorkoutInput>): WorkoutInput {
  return {
    track: 'standard', week: week(1), sprint_day: null, interview_days_out: null, progress: new Map(), tiers: {},
    prescriptions: [], missed_milestone_skills: [], time_multiplier: 1, ctx: { now }, ...o,
  };
}
const shape = (w: ReturnType<typeof buildWorkout>) => w.blocks.map(b => [b.slot, b.skill_id, b.drill_id, b.tier, b.kind, b.size]);

describe('workout mix (PRD "Workouts")', () => {
  it('estimates a set as items × tier time limit × 0.8', () => {
    expect(setMinutes('QN-4', 2, 6)).toBeCloseTo(4.8);         // 6 × 60 s × 0.8
    expect(setMinutes('PS-3', 2, 4)).toBeCloseTo(6.4);         // 4 × 120 s × 0.8
    expect(setMinutes('HY-2', 2, 4)).toBeCloseTo(6.4);         // 4 × (75 + 45) s × 0.8
    expect(setMinutes('QN-4', 2, 6, 1.5)).toBeCloseTo(7.2);    // time accommodation
  });

  it('Standard week 1 after a first case: two weak-spot sets, focus skills first, test-outs at tier 2', () => {
    const w = buildWorkout(input({
      progress: progress({ skill_id: 'QN.setup', state: 'learning' }, { skill_id: 'SY.answer_first', state: 'learning' }),
      prescriptions: [rx('SY.answer_first', 3), rx('QN.setup', 2)],
    }));
    expect(w.target_minutes).toBe(20);
    // QN.setup is a week 1 focus skill: 2 + 2 = 4 beats SY.answer_first's 3.
    expect(shape(w)).toEqual([
      ['weak', 'QN.setup', 'QN-4', 2, 'normal', 6],
      ['weak', 'SY.answer_first', 'SY-2', 2, 'normal', 3],
    ]);
    expect(w.blocks[0]).toMatchObject({ prescription_id: expect.any(String), reason: 'reason for QN.setup' });
  });

  it('orders review → weak spots → unfamiliar, with half-size review and unfamiliar sets', () => {
    const w = buildWorkout(input({
      progress: progress(
        { skill_id: 'QN.setup', state: 'mastered', stage: 'construct', next_review_at: ago(1), last_practiced_at: ago(15) },
        { skill_id: 'PS.mece', state: 'learning', stage: 'construct' },
        { skill_id: 'EX.traps', state: 'recognizes', stage: 'recognize', last_practiced_at: ago(3) },
      ),
      tiers: { 'QN-4': 3, 'EX-2': 2 },
      prescriptions: [rx('PS.mece', 2)],
    }));
    expect(shape(w)).toEqual([
      ['review', 'QN.setup', 'QN-4', 3, 'review', 3],    // QN-4 sets are 6; a review is half
      ['weak', 'PS.mece', 'PS-3', 1, 'normal', 4],
      ['unfamiliar', 'EX.traps', 'EX-2', 2, 'normal', 4],
    ]);
    expect(w.blocks[0].reason).toBe('Time to review math setup: 15 days since you last practiced it.');
  });

  it('a due transfer check takes the unfamiliar slot at full size', () => {
    const w = buildWorkout(input({
      progress: progress({ skill_id: 'QN.setup', state: 'practiced', stage: 'construct', transfer_due_at: ago(0.5), last_practiced_at: ago(2) }),
      prescriptions: [rx('QN.setup', 2), rx('PS.mece', 1)],
    }));
    expect(shape(w)).toEqual([
      ['weak', 'PS.mece', 'PS-3', 2, 'normal', 4],
      ['unfamiliar', 'QN.setup', 'QN-4', 2, 'transfer', 6],
    ]);
  });

  it('Week 6 runs a transfer check on a prescribed Practiced skill before its unlock date', () => {
    const w = buildWorkout(input({
      week: week(6),
      progress: progress({ skill_id: 'QN.setup', state: 'practiced', stage: 'construct', transfer_due_at: new Date(now.getTime() + DAY) }),
      prescriptions: [rx('QN.setup', 2)],
    }));
    expect(w.blocks.find(b => b.slot === 'unfamiliar')).toMatchObject({ skill_id: 'QN.setup', kind: 'transfer' });
  });

  it('Week 5 serves tier 3 sets on skills already Practiced', () => {
    const w = buildWorkout(input({
      week: week(5),
      progress: progress({ skill_id: 'QN.setup', state: 'practiced', stage: 'construct', transfer_due_at: new Date(now.getTime() + DAY) }),
      tiers: { 'QN-4': 2 },
      prescriptions: [rx('QN.setup', 2)],
    }));
    expect(w.blocks.find(b => b.slot === 'weak')).toMatchObject({ skill_id: 'QN.setup', tier: 3 });
  });
});

describe('tracks inside workouts (PRD "Tracks")', () => {
  it('Foundations starts a new skill at Recognize tier 1', () => {
    const w = buildWorkout(input({ track: 'foundations', prescriptions: [rx('PS.mece', 1, 'plan')] }));
    expect(shape(w)[0]).toEqual(['weak', 'PS.mece', 'PS-1', 1, 'normal', 8]);
  });

  it('Foundations serves Construct only once the prerequisites reach Recognizes', () => {
    const p = progress({ skill_id: 'HY.form', state: 'recognizes', stage: 'construct' }, { skill_id: 'PS.case_specific', state: 'learning' });
    const gated = buildWorkout(input({ track: 'foundations', progress: p, prescriptions: [rx('HY.form', 2)] }));
    expect(gated.blocks[0]).toMatchObject({ drill_id: 'HY-1', stage: 'recognize' });
    p.get('PS.case_specific')!.state = 'recognizes';
    const open = buildWorkout(input({ track: 'foundations', progress: p, prescriptions: [rx('HY.form', 2)] }));
    expect(open.blocks[0]).toMatchObject({ drill_id: 'HY-2', stage: 'construct' });
    // Standard has no gate.
    p.get('PS.case_specific')!.state = 'learning';
    expect(buildWorkout(input({ progress: p, prescriptions: [rx('HY.form', 2)] })).blocks[0].drill_id).toBe('HY-2');
  });

  it('Sprint: 30 minutes, tier 2 at least, Recognize never served', () => {
    const w = buildWorkout(input({
      track: 'sprint', week: null, sprint_day: { date: '2026-10-14', day: 2, activities: ['workout'], workout_minutes: 30, cases: 0 },
      progress: progress({ skill_id: 'QN.setup', state: 'learning', stage: 'recognize' }),
      tiers: { 'QN-4': 1 },
      prescriptions: [rx('QN.setup', 2)],
    }));
    expect(w.target_minutes).toBe(30);
    expect(shape(w)[0]).toEqual(['weak', 'QN.setup', 'QN-4', 2, 'normal', 6]);
  });

  it('Sprint review days, and the last 2 days before an interview, serve only short reviews', () => {
    const p = progress(
      { skill_id: 'QN.setup', state: 'mastered', stage: 'construct', next_review_at: new Date(now.getTime() + 5 * DAY), last_practiced_at: ago(3) },
      { skill_id: 'PS.mece', state: 'practiced', stage: 'construct', last_practiced_at: ago(1) },
      { skill_id: 'SY.answer_first', state: 'learning' },
    );
    const day6 = buildWorkout(input({
      track: 'sprint', week: null, progress: p, prescriptions: [rx('SY.answer_first', 3)],
      sprint_day: { date: '2026-10-14', day: 6, activities: ['review'], workout_minutes: 20, cases: 0 },
    }));
    expect(day6.review_only).toBe(true);
    expect(day6.blocks.map(b => [b.slot, b.skill_id, b.size])).toEqual([['review', 'QN.setup', 3], ['review', 'PS.mece', 4]]);
    const dayBefore = buildWorkout(input({ progress: p, interview_days_out: 1 }));
    expect(dayBefore).toMatchObject({ target_minutes: 15, review_only: true });
  });
});

describe('the plan drives practice (PRD "How the plan drives practice")', () => {
  it('creates a plan prescription for the next focus skill below Practiced, in prerequisite order', () => {
    expect(planPrescriptionSkill(week(1), new Map(), [])).toBe('PS.mece');
    expect(planPrescriptionSkill(week(1), progress({ skill_id: 'PS.mece', state: 'practiced' }), [])).toBe('PS.case_specific');
    // An open prescription already in the week's focus: none needed.
    expect(planPrescriptionSkill(week(1), new Map(), [rx('QN.setup', 2)])).toBeNull();
    // Weeks with no focus areas (4–6) create none.
    expect(planPrescriptionSkill(week(4), new Map(), [])).toBeNull();
    expect(prerequisiteOrder(['QN.setup', 'QN.percentages', 'QN.magnitude'])).toEqual(['QN.percentages', 'QN.setup', 'QN.magnitude']);
  });

  it('checks milestones and carries missed milestone skills into later weeks', () => {
    const p = progress({ skill_id: 'PS.mece', state: 'practiced' }, { skill_id: 'PS.case_specific', state: 'mastered' }, { skill_id: 'QN.setup', state: 'recognizes' });
    const facts = { progress: p, prescribed_skills: [], tier3_passes: 0, cases_this_week: 0 };
    expect(weekMilestones(week(1), weeks, facts)).toEqual({ met: false, skills: ['QN.setup'] });
    expect(missedMilestoneSkills(week(2), weeks, p)).toEqual(['QN.setup']);
    // Week 4: every week 1–3 milestone skill at Practiced.
    expect(weekMilestones(week(4), weeks, facts).skills).toEqual(['QN.setup', 'HY.form', 'EX.takeaway', 'QN.sizing_structure', 'SY.answer_first', 'SY.evidence', 'CL.next_step']);
    // Week 6: every prescribed skill Mastered, plus a final case.
    const m6 = week(6).milestones[0];
    expect(milestoneGaps(m6, { ...facts, prescribed_skills: ['PS.case_specific'], cases_this_week: 0 }, [])).toEqual({ met: false, skills: [] });
    expect(milestoneGaps(m6, { ...facts, prescribed_skills: ['PS.case_specific'], cases_this_week: 1 }, [])).toEqual({ met: true, skills: [] });
  });
});
