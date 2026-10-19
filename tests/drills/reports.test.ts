import { describe, it, expect } from 'vitest';
import {
  costAlert, defend, drillEffectiveness, engagement, feedbackModes, gradingCost, itemHealth, lessons, loopFunnel, planVsSelf, programFunnel, stuckRule,
  transfer, workoutMix, itemKey, type ReportData,
} from '@/lib/drills/reports/compute';

const DAY = 86_400_000;
const T0 = new Date('2026-10-01T12:00:00Z');
const at = (days: number, minutes = 0) => new Date(T0.getTime() + days * DAY + minutes * 60_000);

function data(over: Partial<ReportData> = {}): ReportData {
  return {
    from: at(0), to: at(28), students: [{ id: 's1', orgId: 'club' }, { id: 's2', orgId: 'club' }],
    programs: [], sets: [], attempts: [], jobs: [], spend: [], skillEvents: [], prescriptions: [], cases: [], lessonViews: [], workouts: [],
    diagnosticsCompleted: [], events: [], items: new Map(), ...over,
  };
}
type Set = ReportData['sets'][number];
const set = (o: Partial<Set>): Set => ({
  id: 'x', studentId: 's1', drillId: 'PS-1', tier: 1, size: 8, source: 'specific', isTransferCheck: false, workoutId: null, slot: null,
  prescriptionId: null, focusSkill: 'PS.mece', status: 'completed', setScore: 0.5, passed: false, startedAt: at(1), completedAt: at(1, 10), ...o,
});
type Attempt = ReportData['attempts'][number];
const attempt = (o: Partial<Attempt>): Attempt => ({
  setId: 'x', studentId: 's1', itemId: 'ps1-0001', itemVersion: 1, optionId: null, score: 1, timeMs: 30_000, skipped: false,
  defendScore: null, defendRight: null, graded: false, submittedAt: at(1), ...o,
});
const event = (type: string, studentId: string, payload: Record<string, unknown>, day = 1) => ({ type, studentId, payload, createdAt: at(day) });

describe('pilot reports (PRD "MVP reports")', () => {
  it('loop funnel follows a case prescription to the next case', () => {
    const r = loopFunnel(data({
      prescriptions: [
        { id: 'p1', studentId: 's1', skillId: 'PS.mece', sourceType: 'case', status: 'completed', createdAt: at(1), closedAt: null },
        { id: 'p2', studentId: 's2', skillId: 'PS.mece', sourceType: 'case', status: 'open', createdAt: at(1), closedAt: null },
        { id: 'p3', studentId: 's2', skillId: 'PS.mece', sourceType: 'plan', status: 'open', createdAt: at(1), closedAt: null },
      ],
      sets: [set({ prescriptionId: 'p1' })],
      skillEvents: [
        { studentId: 's1', skillId: 'PS.mece', toState: 'practiced', createdAt: at(3) },
        { studentId: 's1', skillId: 'PS.mece', toState: 'mastered', createdAt: at(6) },
        // Before the prescription: doesn't count.
        { studentId: 's2', skillId: 'PS.mece', toState: 'practiced', createdAt: at(0) },
      ],
      cases: [{ studentId: 's1', completedAt: at(8), rubric: {}, tags: [] }],
    }));
    expect(r.steps.map(s => s.n)).toEqual([2, 1, 1, 1, 1]);
    expect(r.steps[1].of_first).toBe(0.5);
  });

  it('program funnel counts the weeks each student reached, by first track', () => {
    const r = programFunnel(data({
      programs: [
        { studentId: 's1', track: 'standard', status: 'active', currentWeek: 1, startedAt: at(0) },
        { studentId: 's2', track: 'foundations', status: 'switched', currentWeek: 0, startedAt: at(0) },
        { studentId: 's2', track: 'standard', status: 'active', currentWeek: 0, startedAt: at(2) },
      ],
      diagnosticsCompleted: ['s1'],
      events: [event('program_week_started', 's1', { week: 3 })],
    }));
    const standard = r.tracks.find(t => t.track === 'standard')!;
    expect(standard.steps.slice(0, 5).map(s => s.n)).toEqual([1, 1, 1, 1, 1]);
    expect(standard.steps[5].n).toBe(0);
    expect(r.tracks.find(t => t.track === 'foundations')!.steps[0].n).toBe(1);
  });

  it('drill effectiveness compares mistakes per case before and after Mastered, and for dismissals', () => {
    const r = drillEffectiveness(data({
      skillEvents: [{ studentId: 's1', skillId: 'PS.mece', toState: 'mastered', createdAt: at(5) }],
      prescriptions: [{ id: 'p', studentId: 's2', skillId: 'PS.mece', sourceType: 'case', status: 'dismissed', createdAt: at(1), closedAt: at(5) }],
      cases: [
        { studentId: 's1', completedAt: at(1), rubric: {}, tags: ['M.overlapping_buckets', 'M.missing_bucket'] },
        { studentId: 's1', completedAt: at(9), rubric: {}, tags: [] },
        { studentId: 's2', completedAt: at(1), rubric: {}, tags: ['M.overlapping_buckets'] },
        { studentId: 's2', completedAt: at(9), rubric: {}, tags: ['M.overlapping_buckets'] },
      ],
    }));
    const mece = r.skills.find(s => s.skill_id === 'PS.mece')!;
    expect(mece.mastered).toEqual({ n: 1, before: 2, after: 0 });
    expect(mece.dismissed).toEqual({ n: 1, before: 1, after: 1 });
  });

  it('transfer reports first attempts only', () => {
    const r = transfer(data({
      events: [
        event('transfer_check_completed', 's1', { skill_id: 'PS.mece', passed: false, attempt_number: 1 }),
        event('transfer_check_completed', 's1', { skill_id: 'PS.mece', passed: true, attempt_number: 2 }),
        event('transfer_check_completed', 's2', { skill_id: 'PS.mece', passed: true, attempt_number: 1 }),
      ],
    }));
    expect(r.skills).toEqual([{ skill_id: 'PS.mece', first_attempts: 2, pass_rate: 0.5, practiced_but_failed: 1 }]);
  });

  it('lessons compares the next set score after reading vs skipping', () => {
    const r = lessons(data({
      lessonViews: [
        { studentId: 's1', lessonId: 'lesson-ps-mece', skillId: 'PS.mece', skipped: false, viewedAt: at(1) },
        { studentId: 's2', lessonId: 'lesson-ps-mece', skillId: 'PS.mece', skipped: true, viewedAt: at(1) },
        { studentId: 's2', lessonId: 'lesson-intro', skillId: null, skipped: false, viewedAt: at(1) },
      ],
      sets: [
        set({ id: 'a', studentId: 's1', setScore: 0.9, startedAt: at(2) }),
        set({ id: 'b', studentId: 's1', setScore: 0.2, startedAt: at(3) }),
        set({ id: 'c', studentId: 's2', setScore: 0.4, startedAt: at(2) }),
      ],
    }));
    expect(r.read).toEqual({ n: 1, next_set_score: 0.9 });
    expect(r.skipped).toEqual({ n: 1, next_set_score: 0.4 });
  });

  it('defend splits Hold/Update accuracy by challenge validity', () => {
    const items = new Map([
      [itemKey('sy2-0001', 2), { drillId: 'SY-2', tier: 2, options: [], defendType: 'challenge', challengeValid: true }],
      [itemKey('sy2-0002', 2), { drillId: 'SY-2', tier: 2, options: [], defendType: 'challenge', challengeValid: false }],
    ]);
    const r = defend(data({
      items,
      sets: [set({ id: 'd', drillId: 'SY-2' })],
      attempts: [
        attempt({ setId: 'd', itemId: 'sy2-0001', itemVersion: 2, defendScore: 1, defendRight: true }),
        attempt({ setId: 'd', itemId: 'sy2-0002', itemVersion: 2, defendScore: 0.5, defendRight: false }),
        attempt({ setId: 'd', itemId: 'sy2-0002', itemVersion: 2, defendScore: null }),
      ],
    }));
    expect(r.rows).toEqual([{ drill_id: 'SY-2', type: 'challenge', n: 2, avg_score: 0.75, valid_challenge: { n: 1, right: 1 }, invalid_challenge: { n: 1, right: 0 } }]);
  });

  it('workout mix compares planned and actual minutes per slot', () => {
    const r = workoutMix(data({
      workouts: [{ id: 'w', studentId: 's1', date: '2026-10-02', targetMinutes: 20, blocks: [
        { slot: 'weak', minutes: 10, set_id: 'a' }, { slot: 'review', minutes: 5, set_id: 'b' }, { slot: 'unfamiliar', minutes: 5, set_id: null },
      ] }],
      sets: [set({ id: 'a', startedAt: at(1), completedAt: at(1, 12) }), set({ id: 'b', startedAt: at(1, 20), completedAt: at(1, 24) })],
    }));
    const weak = r.slots.find(s => s.slot === 'weak')!;
    expect(weak.planned_share).toBe(0.5);
    expect(weak.actual_share).toBe(0.75);
    expect(r.slots.find(s => s.slot === 'unfamiliar')!.actual_minutes).toBe(0);
  });

  it('stuck rule checks for a passed set on the stuck skill afterwards', () => {
    const r = stuckRule(data({
      events: [event('prerequisite_prescribed', 's1', { skill_id: 'PS.mece', prerequisite_id: 'PS.case_specific' }, 2)],
      sets: [set({ passed: true, startedAt: at(1) }), set({ id: 'later', passed: true, startedAt: at(4) })],
    }));
    expect(r.skills).toEqual([{ skill_id: 'PS.mece', fired: 1, passed_after: 1, pass_rate: 1 }]);
  });

  it('plan vs self-directed groups by the latest program', () => {
    const r = planVsSelf(data({
      programs: [
        { studentId: 's1', track: 'standard', status: 'active', currentWeek: 1, startedAt: at(0) },
        { studentId: 's2', track: 'standard', status: 'switched', currentWeek: 0, startedAt: at(0) },
        { studentId: 's2', track: 'self_directed', status: 'active', currentWeek: 0, startedAt: at(1) },
      ],
      sets: [set({ studentId: 's1' }), set({ id: 'b', studentId: 's1' })],
      cases: [
        { studentId: 's1', completedAt: at(1), rubric: { structure: 'needs_work', math: 'meets_bar' }, tags: [] },
        { studentId: 's1', completedAt: at(9), rubric: { structure: 'strong', math: 'meets_bar' }, tags: [] },
      ],
    }));
    expect(r.plan.students).toBe(1);
    expect(r.self_directed.students).toBe(1);
    expect(r.plan.sets_per_student_per_week).toBeCloseTo(0.5);
    expect(r.plan.rubric_gain).toEqual({ students: 1, avg: 1 });
  });

  it('engagement: returning within 7 days and sessions split by 30-minute gaps', () => {
    const r = engagement(data({
      sets: [
        set({ id: 'a', studentId: 's1', startedAt: at(1), completedAt: at(1, 10) }),
        set({ id: 'b', studentId: 's1', startedAt: at(1, 20), completedAt: at(1, 30) }),
        set({ id: 'c', studentId: 's1', startedAt: at(3), completedAt: at(3, 5) }),
        set({ id: 'd', studentId: 's2', startedAt: at(1), completedAt: at(1, 10) }),
      ],
    }));
    expect(r.active_students).toBe(2);
    expect(r.returned_within_7_days).toBe(0.5);
    // Sessions: s1 30 min and 5 min, s2 10 min.
    expect(r.avg_session_minutes).toBeCloseTo(15);
  });

  it('item health flags only with 20+ attempts', () => {
    const items = new Map([[itemKey('ps1-0001', 1), { drillId: 'PS-1', tier: 1, options: [{ id: 'a', correct: true }, { id: 'b', correct: false }], defendType: null, challengeValid: null }]]);
    const many = Array.from({ length: 20 }, (_, i) => attempt({ optionId: i < 2 ? 'a' : 'b', score: i < 2 ? 1 : 0 }));
    const r = itemHealth(data({ items, attempts: many }));
    expect(r.items[0].correct_rate).toBe(0.1);
    expect(r.items[0].flags).toEqual(['pull: correct rate under 15%', 'pull: distractor b picked more than the answer', 're-tier: T1 → T3']);
    expect(itemHealth(data({ items, attempts: many.slice(0, 19) })).items[0].flags).toEqual([]);
  });

  it('grading cost per graded answer and per active student, and the alert', () => {
    const d = data({
      from: at(21), to: at(28),
      sets: [set({ startedAt: at(22), workoutId: 'w' })],
      jobs: [
        { setId: 'x', status: 'succeeded', retries: 0, costUsd: 0.45, createdAt: at(22) },
        { setId: 'x', status: 'failed', retries: 1, costUsd: 0.05, createdAt: at(23) },
      ],
      // The failed run's spend counts: cost comes from the request ledger.
      spend: [
        { setId: 'x', costUsd: 0.05, outcome: 'invalid_output', createdAt: at(22) },
        { setId: 'x', costUsd: 0.4, outcome: 'ok', createdAt: at(22) },
        { setId: 'x', costUsd: 0.05, outcome: 'ok', createdAt: at(23) },
        { setId: 'x', costUsd: 9, outcome: 'ok', createdAt: at(10) },
      ],
      attempts: [attempt({ graded: true, submittedAt: at(22) }), attempt({ graded: true, submittedAt: at(22) })],
    });
    const c = gradingCost(d);
    expect(c.cost_per_graded_answer).toBeCloseTo(0.25);
    expect(c.requests).toBe(3);
    expect(c.failed_requests).toBe(1);
    expect(c.failure_rate).toBe(0.5);
    expect(c.cost_per_workout).toBeCloseTo(0.5);
    expect(c.cost_per_active_student_month).toBeCloseTo(0.5 * 30 / 7);
    // $2.14 a month is over $1.25 + 25%.
    expect(costAlert(d).alert).toBe(true);
    expect(costAlert(data()).alert).toBe(false);
  });

  it('compares feedback modes by the choice confirmed at Start, not the default', () => {
    const ev = (type: string, payload: Record<string, unknown>, day = 2) => ({ type, studentId: 's1', payload, createdAt: at(day) });
    const d = data({
      from: at(0), to: at(28),
      sets: [set({ id: 'a', setScore: 0.9, passed: true, startedAt: at(2) }), set({ id: 'b', setScore: 0.5, passed: false, startedAt: at(2) }), set({ id: 'c', startedAt: at(2) })],
      events: [
        // Set a started with the default 'end', then Immediate was chosen.
        ev('drill_set_started', { set_id: 'a', feedback_mode: 'end' }), ev('timer_chosen', { set_id: 'a', feedback_mode: 'immediate' }),
        ev('timer_chosen', { set_id: 'b', feedback_mode: 'end' }),
        ev('answer_graded', { job: 'answer', wait_ms: 3000 }), ev('answer_graded', { job: 'set', wait_ms: 90000 }),
      ],
    });
    const r = feedbackModes(d);
    expect(r.modes.find(m => m.mode === 'immediate')).toMatchObject({ sets: 1, avg_score: 0.9, pass_rate: 1 });
    expect(r.modes.find(m => m.mode === 'end')).toMatchObject({ sets: 1, avg_score: 0.5, pass_rate: 0 });
    expect(r.immediate_wait_ms).toEqual({ answers: 1, p50: 3000, p95: 3000 });
  });
});
