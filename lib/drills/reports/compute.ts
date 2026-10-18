// The pilot reports (docs/prd-drills.md "MVP reports"), computed from a
// snapshot of rows (data.ts) so every report is a pure, testable function.
// Each report says how it is computed in `how`, so a reader can check the
// definition; the PRD gives one line per report and these fill in the rest.
import { DRILLS_CONFIG, getDrill, getMistakeTag } from '../config';

export type Track = 'foundations' | 'standard' | 'sprint' | 'self_directed';
export type SkillState = 'not_started' | 'learning' | 'recognizes' | 'practiced' | 'mastered' | 'validated';
export type Rating = 'needs_work' | 'meets_bar' | 'strong';

export interface ReportData {
  from: Date;
  to: Date;
  students: { id: string; orgId: string | null }[];
  programs: { studentId: string; track: Track; status: string; currentWeek: number; startedAt: Date; planSource?: string | null }[];
  sets: {
    id: string; studentId: string; drillId: string; tier: number; size: number; source: string; isTransferCheck: boolean;
    workoutId: string | null; slot: string | null; prescriptionId: string | null; focusSkill: string | null;
    status: string; setScore: number | null; passed: boolean | null; startedAt: Date; completedAt: Date | null;
  }[];
  attempts: {
    setId: string; studentId: string; itemId: string | null; itemVersion: number | null; optionId: string | null;
    score: number | null; timeMs: number; skipped: boolean; defendScore: number | null; defendRight: boolean | null;
    graded: boolean; submittedAt: Date;
    // AI grading gave up on it ("Grading delayed").
    ungraded?: boolean;
  }[];
  jobs: { setId: string; status: string; retries: number; costUsd: number | null; createdAt: Date }[];
  // One row per grading request, failed ones included (drill_grading_spend).
  spend: { setId: string; costUsd: number; outcome: string; createdAt: Date }[];
  skillEvents: { studentId: string; skillId: string; toState: SkillState; createdAt: Date }[];
  prescriptions: { id: string; studentId: string; skillId: string; sourceType: string; status: string; createdAt: Date; closedAt: Date | null }[];
  cases: { studentId: string; completedAt: Date; rubric: Partial<Record<string, Rating>>; tags: string[] }[];
  lessonViews: { studentId: string; lessonId: string; skillId: string | null; skipped: boolean; viewedAt: Date }[];
  workouts: { id: string; studentId: string; date: string; targetMinutes: number; blocks: { slot: string; minutes: number; set_id: string | null }[] }[];
  diagnosticsCompleted: string[];
  // Drills analytics events the reports read (the rest are in event health).
  events: { type: string; studentId: string; payload: Record<string, unknown>; createdAt: Date }[];
  // Authored item versions that have attempts: options and Defend type.
  items: Map<string, { drillId: string; tier: number; options: { id: string; correct: boolean }[]; defendType: string | null; challengeValid: boolean | null }>;
}

const DAY = 86_400_000;
const rate = (n: number, d: number) => (d > 0 ? n / d : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inRange = (d: Date, data: ReportData) => d >= data.from && d < data.to;
export const itemKey = (id: string, version: number) => `${id}@${version}`;
// A set counts for a skill if it targeted it, or (with no target) its drill trains it.
const setSkills = (s: ReportData['sets'][number]) => (s.focusSkill ? [s.focusSkill] : getDrill(s.drillId).skills);
const firstTime = (events: { createdAt: Date }[]) => events.reduce<Date | null>((t, e) => (!t || e.createdAt < t ? e.createdAt : t), null);

// ------------------------------------------------------------- loop funnel

export function loopFunnel(data: ReportData) {
  const fromCases = data.prescriptions.filter(p => p.sourceType === 'case');
  const reached = (p: typeof fromCases[number], state: SkillState) =>
    firstTime(data.skillEvents.filter(e => e.studentId === p.studentId && e.skillId === p.skillId && e.toState === state && e.createdAt >= p.createdAt));
  const rows = fromCases.map(p => {
    const started = data.sets.some(s => s.prescriptionId === p.id);
    const practiced = reached(p, 'practiced');
    const mastered = reached(p, 'mastered');
    const nextCase = mastered !== null && data.cases.some(c => c.studentId === p.studentId && c.completedAt > mastered);
    return { started, practiced: practiced !== null, mastered: mastered !== null, nextCase };
  });
  const steps = [
    { step: 'Prescription created from a case', n: rows.length },
    { step: 'Set started', n: rows.filter(r => r.started).length },
    { step: 'Skill reached Practiced', n: rows.filter(r => r.practiced).length },
    { step: 'Skill reached Mastered', n: rows.filter(r => r.mastered).length },
    { step: 'Next case taken', n: rows.filter(r => r.nextCase).length },
  ];
  return {
    how: 'Each prescription created from a case, followed through: a set started on it, its skill reaching Practiced and Mastered after it was created, and a case taken after Mastered. All time.',
    cases_taken: data.cases.length,
    steps: steps.map((s, i) => ({ ...s, of_previous: i ? rate(s.n, steps[i - 1].n) : null, of_first: rate(s.n, steps[0].n) })),
  };
}

// ---------------------------------------------------------- program funnel

export function programFunnel(data: ReportData) {
  const tracks = DRILLS_CONFIG.programs.tracks as Record<Track, { length_weeks?: number }>;
  const maxWeek = new Map<string, number>();
  for (const e of data.events.filter(e => e.type === 'program_week_started')) {
    const w = Number(e.payload.week);
    if (Number.isFinite(w)) maxWeek.set(e.studentId, Math.max(maxWeek.get(e.studentId) ?? 0, w));
  }
  const diag = new Set(data.diagnosticsCompleted);
  return {
    how: 'Students by the track of their first program. A week counts as reached when its rollover was logged (program_week_started) or the program shows it as current. Sprint and Practice on my own have no weeks.',
    tracks: (Object.keys(tracks) as Track[]).map(track => {
      const ids = [...new Set(data.programs.filter(p => p.track === track && firstProgram(data, p.studentId)?.track === track).map(p => p.studentId))];
      const weekOf = (id: string) => Math.max(maxWeek.get(id) ?? 0, ...data.programs.filter(p => p.studentId === id && p.track === track).map(p => p.currentWeek));
      const length = tracks[track].length_weeks ?? 0;
      const steps = [
        { step: 'Onboarded', n: ids.length },
        { step: 'Diagnostic completed', n: ids.filter(id => diag.has(id)).length },
        ...Array.from({ length }, (_, i) => ({ step: `Week ${i + 1}${i + 1 === length ? ' (last)' : ''}`, n: ids.filter(id => weekOf(id) >= i + 1).length })),
      ];
      return { track, steps: steps.map((s, i) => ({ ...s, of_previous: i ? rate(s.n, steps[i - 1].n) : null })) };
    }),
  };
}

const firstProgram = (data: ReportData, studentId: string) =>
  data.programs.filter(p => p.studentId === studentId).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0] ?? null;

// ---------------------------------------------------------- plan sources

// How students got their plan (D6 round 2): each student's active program.
export function planSources(data: ReportData) {
  const active = data.programs.filter(p => p.status === 'active');
  const count = (s: string | null) => active.filter(p => (p.planSource ?? null) === s).length;
  return {
    how: "Each student's active program: the source its plan was built from (a later, more reliable source replaces an earlier one), or none yet.",
    case: count('case'), diagnostic: count('diagnostic'), questionnaire: count('questionnaire'), none: count(null),
  };
}

// ------------------------------------------------------------------ pauses

// Timer pauses while Report a problem or the feedback box is open (D6 round
// 2), per student in the period, most paused time first: a student who pauses
// often or for long may be using it to gain time.
export function pauses(data: ReportData) {
  const resumed = data.events.filter(e => e.type === 'timer_resumed' && inRange(e.createdAt, data));
  const by = new Map<string, { student: string; club: string | null; pauses: number; total_ms: number; longest_ms: number; reasons: Record<string, number> }>();
  const club = new Map(data.students.map(s => [s.id, s.orgId]));
  for (const e of resumed) {
    const ms = Number(e.payload.paused_ms) || 0;
    const r = by.get(e.studentId) ?? { student: e.studentId, club: club.get(e.studentId) ?? null, pauses: 0, total_ms: 0, longest_ms: 0, reasons: {} };
    r.pauses++;
    r.total_ms += ms;
    r.longest_ms = Math.max(r.longest_ms, ms);
    const reason = String(e.payload.reason);
    r.reasons[reason] = (r.reasons[reason] ?? 0) + 1;
    by.set(e.studentId, r);
  }
  return {
    how: 'Pauses that ended in the period (timer_resumed), per student, most paused time first. A pause ends when the dialog closes, or on a reload or submit.',
    total: resumed.length,
    students: [...by.values()].sort((a, b) => b.total_ms - a.total_ms).slice(0, 25),
  };
}

// ------------------------------------------------------- drill effectiveness

export function drillEffectiveness(data: ReportData) {
  const tagSkill = (tag: string) => getMistakeTag(tag)?.skill ?? null;
  // Mistakes of this skill per case, before and after a moment.
  const split = (studentId: string, skillId: string, at: Date) => {
    const cases = data.cases.filter(c => c.studentId === studentId);
    const before = cases.filter(c => c.completedAt < at);
    const after = cases.filter(c => c.completedAt > at);
    if (!before.length || !after.length) return null;
    const per = (cs: typeof cases) => cs.reduce((n, c) => n + c.tags.filter(t => tagSkill(t) === skillId).length, 0) / cs.length;
    return { before: per(before), after: per(after) };
  };
  const skills = DRILLS_CONFIG.taxonomy.skills.map(s => s.id);
  return {
    how: "Per skill: that skill's mistake tags per case, before and after a student reached Mastered (only students with a case on each side). The comparison group is students who dismissed a prescription for the same skill, split at the dismissal.",
    skills: skills.map(skillId => {
      const masteredAt = new Map<string, Date>();
      for (const e of data.skillEvents.filter(e => e.skillId === skillId && e.toState === 'mastered')) {
        if (!masteredAt.has(e.studentId) || e.createdAt < masteredAt.get(e.studentId)!) masteredAt.set(e.studentId, e.createdAt);
      }
      const mastered = [...masteredAt].map(([id, at]) => split(id, skillId, at)).filter(x => x !== null);
      const dismissed = data.prescriptions.filter(p => p.skillId === skillId && p.status === 'dismissed' && p.closedAt)
        .map(p => split(p.studentId, skillId, p.closedAt!)).filter(x => x !== null);
      const summary = (xs: { before: number; after: number }[]) => ({ n: xs.length, before: mean(xs.map(x => x.before)), after: mean(xs.map(x => x.after)) });
      return { skill_id: skillId, mastered: summary(mastered), dismissed: summary(dismissed) };
    }).filter(s => s.mastered.n || s.dismissed.n),
  };
}

// ---------------------------------------------------------------- transfer

export function transfer(data: ReportData) {
  const firsts = data.events.filter(e => e.type === 'transfer_check_completed' && Number(e.payload.attempt_number) === 1);
  const bySkill = new Map<string, { n: number; passed: number }>();
  for (const e of firsts) {
    const s = String(e.payload.skill_id);
    const r = bySkill.get(s) ?? { n: 0, passed: 0 };
    r.n++;
    if (e.payload.passed === true) r.passed++;
    bySkill.set(s, r);
  }
  const skills = [...bySkill].map(([skill_id, r]) => ({ skill_id, first_attempts: r.n, pass_rate: rate(r.passed, r.n), practiced_but_failed: r.n - r.passed }));
  return {
    how: 'First transfer-check attempts per skill (a check comes only after Practiced, so each failure is a student who passed practice but failed transfer). The PRD target band is 60–85%.',
    overall_pass_rate: rate(skills.reduce((n, s) => n + (s.first_attempts - s.practiced_but_failed), 0), skills.reduce((n, s) => n + s.first_attempts, 0)),
    skills: skills.sort((a, b) => (a.pass_rate ?? 0) - (b.pass_rate ?? 0)),
  };
}

// ----------------------------------------------------------------- lessons

export function lessons(data: ReportData) {
  const groups = { read: [] as number[], skipped: [] as number[] };
  const seen = new Set<string>();
  for (const v of [...data.lessonViews].sort((a, b) => a.viewedAt.getTime() - b.viewedAt.getTime())) {
    if (!v.skillId || seen.has(`${v.studentId}|${v.lessonId}`)) continue;
    seen.add(`${v.studentId}|${v.lessonId}`);
    const next = data.sets
      .filter(s => s.studentId === v.studentId && s.status === 'completed' && s.setScore !== null && s.startedAt > v.viewedAt && setSkills(s).includes(v.skillId!))
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];
    if (next) (v.skipped ? groups.skipped : groups.read).push(next.setScore!);
  }
  return {
    how: "A student's first view or skip of each skill lesson, and the score of their next completed set on that skill. The intro lesson has no skill and isn't counted.",
    read: { n: groups.read.length, next_set_score: mean(groups.read) },
    skipped: { n: groups.skipped.length, next_set_score: mean(groups.skipped) },
  };
}

// ------------------------------------------------------------------ defend

export function defend(data: ReportData) {
  const setDrill = new Map(data.sets.map(s => [s.id, s.drillId]));
  const rows = new Map<string, { drill_id: string; type: string; scores: number[]; valid: boolean[]; invalid: boolean[] }>();
  for (const a of data.attempts.filter(a => a.defendScore !== null && a.itemId)) {
    const item = data.items.get(itemKey(a.itemId!, a.itemVersion!));
    const drill = setDrill.get(a.setId) ?? item?.drillId ?? '?';
    const type = item?.defendType ?? '?';
    const r = rows.get(`${drill}|${type}`) ?? { drill_id: drill, type, scores: [], valid: [], invalid: [] };
    r.scores.push(a.defendScore!);
    if (a.defendRight !== null && item?.challengeValid !== null && item?.challengeValid !== undefined) (item.challengeValid ? r.valid : r.invalid).push(a.defendRight);
    rows.set(`${drill}|${type}`, r);
  }
  const acc = (xs: boolean[]) => ({ n: xs.length, right: rate(xs.filter(Boolean).length, xs.length) });
  return {
    how: 'Graded follow-up replies by drill and follow-up type: average score, and for Challenges, how often the Hold/Update choice was right, split by whether the challenge was valid (Update is right) or not (Hold is right).',
    rows: [...rows.values()].map(r => ({ drill_id: r.drill_id, type: r.type, n: r.scores.length, avg_score: mean(r.scores), valid_challenge: acc(r.valid), invalid_challenge: acc(r.invalid) })),
  };
}

// ------------------------------------------------------------- workout mix

export function workoutMix(data: ReportData) {
  const target = DRILLS_CONFIG.programs.workout.mix as Record<string, number>;
  const planned: Record<string, number> = {};
  const actual: Record<string, number> = {};
  const sets = new Map(data.sets.map(s => [s.id, s]));
  for (const w of data.workouts.filter(w => inRange(new Date(`${w.date}T12:00:00Z`), data))) {
    for (const b of w.blocks) {
      planned[b.slot] = (planned[b.slot] ?? 0) + b.minutes;
      const s = b.set_id ? sets.get(b.set_id) : null;
      if (s?.completedAt) actual[b.slot] = (actual[b.slot] ?? 0) + (s.completedAt.getTime() - s.startedAt.getTime()) / 60_000;
    }
  }
  const share = (m: Record<string, number>, slot: string) => rate(m[slot] ?? 0, Object.values(m).reduce((a, b) => a + b, 0));
  return {
    how: "Workouts dated in the range. Planned: the minutes the builder gave each slot. Actual: minutes from start to finish of each block's completed set.",
    slots: Object.keys(target).map(slot => ({
      slot, target: target[slot], planned_share: share(planned, slot), actual_share: share(actual, slot), actual_minutes: Math.round(actual[slot] ?? 0),
    })),
  };
}

// --------------------------------------------------------------- stuck rule

export function stuckRule(data: ReportData) {
  const fired = data.events.filter(e => e.type === 'prerequisite_prescribed');
  const bySkill = new Map<string, { fired: number; passed_after: number }>();
  for (const e of fired) {
    const skill = String(e.payload.skill_id);
    const passed = data.sets.some(s => s.studentId === e.studentId && s.passed === true && s.startedAt > e.createdAt && setSkills(s).includes(skill));
    const r = bySkill.get(skill) ?? { fired: 0, passed_after: 0 };
    r.fired++;
    if (passed) r.passed_after++;
    bySkill.set(skill, r);
  }
  return {
    how: 'Each time the stuck rule sent a student to a prerequisite (prerequisite_prescribed), and whether they later passed a set on the stuck skill.',
    skills: [...bySkill].map(([skill_id, r]) => ({ skill_id, fired: r.fired, passed_after: r.passed_after, pass_rate: rate(r.passed_after, r.fired) })),
  };
}

// ------------------------------------------------------ plan vs self-directed

const RATING_LEVEL: Record<Rating, number> = { needs_work: 0, meets_bar: 1, strong: 2 };

export function planVsSelf(data: ReportData) {
  const weeks = Math.max(1, (data.to.getTime() - data.from.getTime()) / (7 * DAY));
  const group = (id: string) => {
    const active = data.programs.filter(p => p.studentId === id).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    return active ? (active.track === 'self_directed' ? 'self_directed' : 'plan') : null;
  };
  const transferFirsts = data.events.filter(e => e.type === 'transfer_check_completed' && Number(e.payload.attempt_number) === 1);
  const caseLevel = (c: ReportData['cases'][number]) => mean(Object.values(c.rubric).filter((r): r is Rating => Boolean(r)).map(r => RATING_LEVEL[r]));
  const summarize = (g: 'plan' | 'self_directed') => {
    const ids = data.students.map(s => s.id).filter(id => group(id) === g);
    const idSet = new Set(ids);
    const sets = data.sets.filter(s => idSet.has(s.studentId) && inRange(s.startedAt, data));
    const mastered = new Set(data.skillEvents.filter(e => idSet.has(e.studentId) && e.toState === 'mastered').map(e => `${e.studentId}|${e.skillId}`));
    const firsts = transferFirsts.filter(e => idSet.has(e.studentId));
    const gains = ids.flatMap(id => {
      const cs = data.cases.filter(c => c.studentId === id).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
      if (cs.length < 2) return [];
      const first = caseLevel(cs[0]);
      const last = caseLevel(cs[cs.length - 1]);
      return first !== null && last !== null ? [last - first] : [];
    });
    return {
      students: ids.length,
      sets_per_student_per_week: ids.length ? sets.length / ids.length / weeks : null,
      skills_mastered_per_student: ids.length ? mastered.size / ids.length : null,
      transfer_pass_rate: rate(firsts.filter(e => e.payload.passed === true).length, firsts.length),
      rubric_gain: { students: gains.length, avg: mean(gains) },
    };
  };
  return {
    how: "Students grouped by their latest program: a plan (Foundations, Standard, Sprint) or Practice on my own. Sets per week count the range; Mastered skills and transfer are all time. Rubric gain: average rating (needs work 0, meets bar 1, strong 2) on the last case minus the first, for students with two or more cases.",
    plan: summarize('plan'),
    self_directed: summarize('self_directed'),
  };
}

// -------------------------------------------------------------- engagement

const SESSION_GAP_MS = 30 * 60_000;

export function engagement(data: ReportData) {
  const weeks = Math.max(1, (data.to.getTime() - data.from.getTime()) / (7 * DAY));
  const sets = data.sets.filter(s => inRange(s.startedAt, data)).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const byStudent = new Map<string, typeof sets>();
  for (const s of sets) byStudent.set(s.studentId, [...(byStudent.get(s.studentId) ?? []), s]);
  let returned = 0;
  const sessions: number[] = [];
  for (const list of byStudent.values()) {
    const first = list[0].startedAt.getTime();
    const firstDay = list[0].startedAt.toISOString().slice(0, 10);
    if (list.some(s => s.startedAt.toISOString().slice(0, 10) !== firstDay && s.startedAt.getTime() - first <= 7 * DAY)) returned++;
    let start = list[0].startedAt.getTime();
    let end = (list[0].completedAt ?? list[0].startedAt).getTime();
    for (const s of list.slice(1)) {
      if (s.startedAt.getTime() - end > SESSION_GAP_MS) {
        sessions.push(end - start);
        start = s.startedAt.getTime();
      }
      end = Math.max(end, (s.completedAt ?? s.startedAt).getTime());
    }
    sessions.push(end - start);
  }
  const active = byStudent.size;
  return {
    how: "Students with a set started in the range. Returning: another set on a later day within 7 days of their first set in the range. A session is a run of sets less than 30 minutes apart.",
    active_students: active,
    sets_per_active_student_per_week: active ? sets.length / active / weeks : null,
    returned_within_7_days: rate(returned, active),
    avg_session_minutes: sessions.length ? mean(sessions)! / 60_000 : null,
  };
}

// ------------------------------------------------------------- item health

// Pilot: flags start at 20 attempts and Matt pulls items by hand (2026-10-17).
// An item's attempts are at most the number of students (no repeats within
// 60 days), so the PRD's 50 is out of reach in the pilot; below 20, one student
// moves the rate by 5+ points. The PRD's 50 returns with a daily job.
export const ITEM_HEALTH = { min_attempts: 20, pull_below: 0.15, too_easy_above: 0.95, tiers: { t1_from: 0.7, t2_from: 0.4 } };

export function itemHealth(data: ReportData) {
  const byItem = new Map<string, ReportData['attempts']>();
  for (const a of data.attempts.filter(a => a.itemId && !a.skipped && a.score !== null)) {
    const k = itemKey(a.itemId!, a.itemVersion!);
    byItem.set(k, [...(byItem.get(k) ?? []), a]);
  }
  const rows = [...byItem].map(([key, attempts]) => {
    const item = data.items.get(key);
    const correct = attempts.filter(a => a.score === 1).length;
    const correctRate = correct / attempts.length;
    const counts: Record<string, number> = {};
    for (const a of attempts) if (a.optionId) counts[a.optionId] = (counts[a.optionId] ?? 0) + 1;
    const right = item?.options.find(o => o.correct)?.id;
    const topDistractor = item?.options.filter(o => !o.correct).sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
    const enough = attempts.length >= ITEM_HEALTH.min_attempts;
    const choice = Boolean(item?.options.length);
    const flags: string[] = [];
    if (enough && choice && correctRate < ITEM_HEALTH.pull_below) flags.push('pull: correct rate under 15%');
    if (enough && choice && right && topDistractor && (counts[topDistractor.id] ?? 0) > (counts[right] ?? 0)) flags.push(`pull: distractor ${topDistractor.id} picked more than the answer`);
    if (enough && correctRate > ITEM_HEALTH.too_easy_above) flags.push('too easy: over 95% correct');
    const observedTier = correctRate >= ITEM_HEALTH.tiers.t1_from ? 1 : correctRate >= ITEM_HEALTH.tiers.t2_from ? 2 : 3;
    if (enough && item && observedTier !== item.tier) flags.push(`re-tier: T${item.tier} → T${observedTier}`);
    return {
      item: key, drill_id: item?.drillId ?? null, attempts: attempts.length, correct_rate: correctRate, avg_score: mean(attempts.map(a => a.score!)),
      avg_time_s: mean(attempts.map(a => a.timeMs))! / 1000, option_counts: choice ? counts : null, flags,
    };
  });
  return {
    how: `Authored items, all answered (not skipped) attempts. Correct means a full score. Flags need ${ITEM_HEALTH.min_attempts}+ attempts: pull to review under 15% correct or when a distractor beats the answer (choice items only), too easy over 95%, and a re-tier from the observed rate (T1 ≥70%, T2 40–69%, T3 <40%). Pulling is by hand during the pilot.`,
    items: rows.sort((a, b) => b.flags.length - a.flags.length || b.attempts - a.attempts),
  };
}

// --------------------------------------------------- grading quality and cost

// PRD "Success metrics": drill grading cost per active student, pilot budget.
export const BUDGET_PER_STUDENT_MONTH = 1.25;
// PRD "Monitoring": alert when the 7-day average exceeds budget by 25%.
export const ALERT_OVER_BUDGET = 0.25;

export function gradingCost(data: ReportData) {
  const jobs = data.jobs.filter(j => inRange(j.createdAt, data));
  const graded = data.attempts.filter(a => a.graded && inRange(a.submittedAt, data)).length;
  // Spend comes from the per-request ledger, so failed runs count too.
  const spend = data.spend.filter(r => inRange(r.createdAt, data));
  const cost = spend.reduce((n, r) => n + r.costUsd, 0);
  const active = new Set(data.sets.filter(s => inRange(s.startedAt, data)).map(s => s.studentId)).size;
  const days = Math.max(1, (data.to.getTime() - data.from.getTime()) / DAY);
  // Per workout: grading cost of workout sets over the workouts they belong to.
  const workoutOf = new Map(data.sets.filter(s => s.workoutId).map(s => [s.id, s.workoutId!]));
  const workoutSpend = spend.filter(r => workoutOf.has(r.setId));
  const workoutsGraded = new Set(workoutSpend.map(r => workoutOf.get(r.setId)!)).size;
  return {
    how: 'Jobs: grading jobs created in the range. Cost: every grading request sent in the range, failed ones included (the spend ledger). Not graded: answers grading gave up on ("Grading delayed"). Cost per workout counts workouts with at least one graded set. Cost per active student per month scales the range to 30 days. Agreement with human labels comes from the golden-set gate (npm run drills:golden); the monthly human sample of graded answers is not built yet.',
    jobs: jobs.length,
    failed: jobs.filter(j => j.status === 'failed').length,
    failure_rate: rate(jobs.filter(j => j.status === 'failed').length, jobs.length),
    retry_rate: rate(jobs.filter(j => j.retries > 0).length, jobs.length),
    cost_usd: cost,
    requests: spend.length,
    failed_requests: spend.filter(r => r.outcome !== 'ok').length,
    graded_answers: graded,
    ungraded_answers: data.attempts.filter(a => a.ungraded && inRange(a.submittedAt, data)).length,
    cost_per_graded_answer: rate(cost, graded),
    cost_per_workout: rate(workoutSpend.reduce((n, r) => n + r.costUsd, 0), workoutsGraded),
    active_students: active,
    cost_per_active_student_month: active ? (cost / active) * (30 / days) : null,
  };
}

// The 7 days before `to`: cost per active student, scaled to a month.
export function costAlert(data: ReportData) {
  const week = { ...data, from: new Date(data.to.getTime() - 7 * DAY) };
  const c = gradingCost(week);
  const limit = BUDGET_PER_STUDENT_MONTH * (1 + ALERT_OVER_BUDGET);
  const perMonth = c.cost_per_active_student_month;
  return {
    how: `Last 7 days: grading cost per active student, scaled to a month, against the $${BUDGET_PER_STUDENT_MONTH.toFixed(2)} budget. Alert above $${limit.toFixed(2)} (budget + 25%).`,
    per_student_month: perMonth,
    budget: BUDGET_PER_STUDENT_MONTH,
    alert: perMonth !== null && perMonth > limit,
  };
}
