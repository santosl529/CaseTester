import { TrainingHome, type TrainingHomeData } from '@/components/drills/views/training-home';
import { PlanEmpty, PlanScreen, type PlanData } from '@/components/drills/views/plan';
import { ProgressScreen, type DashboardData } from '@/components/drills/views/progress';
import { SkillDetail, type SkillDetailData } from '@/components/drills/views/skill-detail';
import { LearnLibrary } from '@/components/drills/views/learn-library';
import { IntroLessonScreen, LessonScreen } from '@/components/drills/views/lesson';
import { BrowseDrills, type CatalogData } from '@/components/drills/views/browse';
import { DiagnosticScreen, type DiagnosticData } from '@/components/drills/views/diagnostic';
import { QuestionnaireScreen, SettingsScreen, StartScreen } from '@/components/drills/views/forms';
import { DRILLS_CONFIG, getDrill, getMistakeTag, getSkill } from '@/lib/drills/config';
import { loadIntroLesson, loadLessons } from '@/lib/drills/lessons';
import { buildPlan, currentDay, currentWeek, type Plan } from '@/lib/drills/program/plan';
import { hasLiveDrill, newProgress, type SkillProgress, type SkillStateName } from '@/lib/drills/progress/engine';
import { STATE_LABEL, missesByWeek, paceByWeek, readiness, scoreChart, statesByWeek, weeks, type Arrow, type DashAttempt, type DashEvent, type ScorePoint } from '@/lib/drills/progress/dashboard';
import type { Canned } from '../_lib/guard';
import type { Screen } from '../_lib/types';

// The training side: a sample student, Lorenzo, in week 2 of a 6-week
// Standard plan built from his diagnostic, practicing Chart read and Math setup.

const TODAY = '2026-11-07';
const NOW = new Date(`${TODAY}T15:00:00Z`);
const DAY = 86_400_000;
const label = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const AVAILABILITY = DRILLS_CONFIG.programs.availability;

function programView(track: 'standard' | 'sprint' | 'foundations' | 'self_directed' = 'standard') {
  const plan: Plan = buildPlan({ track, start_date: '2026-10-31', interview_date: '2026-12-11', workouts_per_week: 4 });
  return {
    track, start_date: '2026-10-31', interview_date: '2026-12-11', interview_days_out: 34, workouts_per_week: 4, today: TODAY, plan,
    week: currentWeek(plan, TODAY), day: currentDay(plan, TODAY), plan_source: 'diagnostic' as const, plan_seen: true,
    total_weeks: plan.kind === 'weeks' ? plan.weeks.length - 1 : null,
    sprint_day_index: plan.kind === 'days' ? plan.days.findIndex(d => d.date === TODAY) + 1 : null,
  };
}

const block = (slot: 'review' | 'weak' | 'unfamiliar', skill: string, drill: string, reason: string, status: 'todo' | 'in_progress' | 'grading' | 'done', score: number | null = null) => ({
  slot, skill_id: skill, drill_id: drill, stage: 'recognize' as const, tier: 1, kind: 'normal' as const, size: getDrill(drill).set_size ?? 8,
  minutes: 7, reason, prescription_id: null, set_id: status === 'todo' ? null : 'preview-set', status, score,
});

const WORKOUT = {
  id: 'preview-workout', status: 'in_progress' as const, target_minutes: 20,
  blocks: [
    block('weak', 'QN.setup', 'QN-1', 'From your diagnostic: you divided by the new value, not the starting one.', 'done', 0.9),
    block('review', 'PS.mece', 'PS-1', 'Keep your structures sharp: last practiced 6 days ago.', 'todo'),
    block('unfamiliar', 'EX.takeaway', 'EX-1', 'Exhibits are next week’s focus.', 'todo'),
  ],
};

const RX = [
  { id: 'rx1', skill_id: 'QN.setup', skill_name: 'Math setup', drill_name: 'Setup only', reason: 'Your diagnostic: 2 of 5 percent changes on the wrong base.', status: 'open' as const, priority: 3, source: 'diagnostic' as const },
  { id: 'rx2', skill_id: 'EX.takeaway', skill_name: 'Chart takeaway', drill_name: 'Chart read', reason: 'Your diagnostic: missed the trend in 2 of 4 charts.', status: 'open' as const, priority: 2, source: 'diagnostic' as const },
  { id: 'rx3', skill_id: 'SY.answer_first', skill_name: 'Answer first', drill_name: 'Pick the best summary', reason: 'Your diagnostic: the recommendation came last.', status: 'open' as const, priority: 1, source: 'diagnostic' as const },
];

// 'done': today's workout finished (extras offered); 'intro': a new Foundations
// student who hasn't opened the intro lesson.
function home(kind: 'plan' | 'new' | 'self' | 'done' | 'intro' | 'first'): TrainingHomeData {
  const program = programView(kind === 'self' ? 'self_directed' : kind === 'intro' ? 'foundations' : 'standard');
  const base = {
    resume: kind === 'plan' || kind === 'done' ? { set_id: 'preview-ex1', drill_name: 'Chart read' } : null,
    // How CasePace works: a new student's first plan week.
    first_week: kind === 'first' || kind === 'intro' || kind === 'new',
    // Your example (Matt, 13 Nov): arithmetic tops the mistakes but isn't in today's workout.
    weakest: kind === 'new' || kind === 'first' ? null : kind === 'self'
      ? { skill_id: 'QN.setup', skill_name: 'Math setup', mistake: 'wrong base for a percent change', count: 3, practice_minutes: 6, evidence: 'Margin fell from 24% to 6%, so it fell 18%.' }
      : { skill_id: 'QN.arithmetic', skill_name: 'Arithmetic', mistake: 'arithmetic error', count: 5, practice_minutes: 5, evidence: '1.2 million times 15% is 1.8 million.' },
    diagnostic: kind === 'new' ? { status: 'not_started', done: 0, of: 6 } : { status: 'completed', done: 6, of: 6 },
    plan: kind === 'new' ? { source: null, seen: false } : { source: 'diagnostic' as const, seen: true },
  };
  if (kind === 'self') {
    return {
      kind: 'self_directed', ...base,
      suggested: { skill_id: 'QN.setup', skill_name: 'Math setup', drill_name: 'Setup only', reason: 'Your weakest skill right now.', minutes: 6, kind: 'normal', slot: 'weak', check: false },
      weaknesses: [
        { tag: 'M.wrong_base', skill_name: 'Math setup', label: 'wrong base for a percent change', count: 3 },
        { tag: 'M.trend_missed', skill_name: 'Chart takeaway', label: 'missed the trend', count: 2 },
      ],
      moved_up: [{ skill_name: 'MECE structure', state: 'practiced' }],
      due: [{ skill_id: 'PS.mece', skill_name: 'MECE structure', what: 'transfer check' }],
      counts: { practiced: 3, mastered: 1 },
      summary: { sets: 9, cases: 1, weakest: 'Math setup', moved_up: [{ skill_name: 'MECE structure', state: 'practiced' }] },
      offer_sprint: false, interview_days_out: 34, rubric_trends: [], days_on_program: 7,
    };
  }
  return {
    kind: 'plan', ...base, program,
    week_status: { workouts: { done: kind === 'done' ? 3 : 2, target: 4 }, cases: { done: 1, target: 1 }, milestone_met: false,
      milestone_skills: [
        { id: 'PS.mece', name: 'MECE structure', state: 'practiced' }, { id: 'QN.setup', name: 'Math setup', state: 'learning' },
        { id: 'HY.form', name: 'Forming a hypothesis', state: 'learning' }, { id: 'EX.takeaway', name: 'Chart takeaway', state: 'learning' },
        { id: 'QN.percentages', name: 'Percentages', state: 'not_started' },
      ] },
    workout: kind === 'new' ? null
      : kind === 'done' ? { ...WORKOUT, status: 'completed' as const, blocks: WORKOUT.blocks.map((b, i) => ({ ...b, status: 'done' as const, set_id: 'preview-set', score: [0.9, 0.85, 0.75][i] ?? 0.8 })) }
      : kind === 'intro' || kind === 'first' ? { ...WORKOUT, status: 'planned' as const, blocks: WORKOUT.blocks.map(b => ({ ...b, status: 'todo' as const, set_id: null, score: null })) }
      : WORKOUT,
    lesson_first: false, intro_first: kind === 'intro', estimated_minutes: kind === 'new' ? null : 21,
    diagnose_today: false, next_case: kind === 'new' || kind === 'intro' ? null : { case_id: 'prof-002', title: 'Larkspur Pricing', retake: false, matched: { area: true, tier: true } },
    extra: kind === 'done' ? [block('weak', 'QN.percentages', 'QN-2', 'Percentages slipped in this workout.', 'todo')] : [], rediagnose: null,
  };
}

function plan(): PlanData {
  const view = programView('standard');
  return { track: 'standard', source: 'Built from your diagnostic.', rx: RX, checks: [], view, workout: { ...WORKOUT, blocks: WORKOUT.blocks.map(b => ({ ...b, status: 'todo' as const, score: null })) }, next: 0, startHref: null, counts: { 1: { workouts: 0, cases: 0 } }, anyWorkout: false };
}

// Your progress: states and charts computed by the app's own pure builders
// from a few weeks of sample events and answers.
const STATES: Record<string, SkillStateName> = {
  'PS.mece': 'mastered', 'PS.case_specific': 'practiced', 'PS.depth': 'recognizes', 'HY.form': 'practiced', 'HY.update': 'learning',
  'QN.setup': 'learning', 'QN.arithmetic': 'practiced', 'QN.percentages': 'recognizes', 'EX.takeaway': 'recognizes', 'EX.traps': 'learning',
  'SY.answer_first': 'learning', 'CL.next_step': 'recognizes',
};
const ARROWS: Record<string, Arrow> = { 'PS.mece': 'up', 'QN.setup': 'down', 'EX.takeaway': 'up', 'HY.form': 'flat', 'QN.arithmetic': 'up' };

function dashboard(practiced = true): DashboardData {
  const live = DRILLS_CONFIG.taxonomy.skills.filter(s => hasLiveDrill(s.id)).map(s => s.id);
  const progress = new Map<string, SkillProgress>(live.map(id => [id, { ...newProgress(id), state: STATES[id] ?? 'not_started' }]));
  const ws = weeks(NOW, 6, label);
  const events: DashEvent[] = Object.entries(STATES).flatMap(([id, state], i) => [
    { skillId: id, fromState: 'not_started', toState: 'learning', reason: 'placement', createdAt: new Date(NOW.getTime() - (30 - i) * DAY) },
    ...(state !== 'learning' ? [{ skillId: id, fromState: 'learning' as const, toState: state, reason: 'set', createdAt: new Date(NOW.getTime() - (12 - (i % 10)) * DAY) }] : []),
  ]);
  const attempts: DashAttempt[] = Array.from({ length: 90 }, (_, i) => ({
    id: `a${i}`, setId: `s${Math.floor(i / 8)}`, drillId: ['EX-1', 'QN-1', 'PS-1'][i % 3], tier: 1, setSource: 'specific', position: i % 8,
    submittedAt: new Date(NOW.getTime() - (34 - Math.floor(i / 3)) * DAY), mistakeTags: i % 4 === 0 ? ['M.wrong_base'] : i % 7 === 0 ? ['M.trend_missed'] : [],
    skipped: false, gradingStatus: 'not_needed', timeMs: 40_000 - i * 150, timeLimitMs: 45_000,
  }));
  const groups = DRILLS_CONFIG.taxonomy.areas.map(a => ({
    title: a.name, note: null as string | null,
    skills: live.filter(id => getSkill(id).area === a.code).map(id => ({ id, name: getSkill(id).name, state: progress.get(id)!.state, arrow: ARROWS[id] ?? 'none' })),
  })).filter(g => g.skills.length);
  return {
    practiced, has_plan: true,
    summary: { status: 'improving', sentence: 'You’re improving: 3 skills moved up this week, and you miss fewer questions than last week (18% against 26%).', window_days: 7, up: ['PS.mece', 'EX.takeaway', 'QN.arithmetic'], down: [], rate: { cur: 0.18, prev: 0.26, answers: [44, 38] } },
    counts: { mastered: 1, live: live.length },
    readiness: readiness(progress, live, [], true),
    week: { number: 2, theme: 'Structure and math', milestone_skills: [{ name: 'MECE structure', state: 'Mastered' }, { name: 'Math setup', state: 'Learning' }], met: false },
    groups,
    strengths: [{ id: 'PS.mece', name: 'MECE structure', state: 'Mastered', score: 0.92 }, { id: 'QN.arithmetic', name: 'Arithmetic', state: 'Practiced', score: 0.88 }],
    focus: RX.map(r => ({ prescription_id: r.id, skill_id: r.skill_id, name: r.skill_name, reason: r.reason, live: true })),
    trends: { states: statesByWeek(events, live, ws), misses: missesByWeek(attempts, ws), pace: paceByWeek(attempts, ws), rubric: [] },
    case_data: false,
    history: [
      { at: new Date(NOW.getTime() - DAY), text: 'Setup only', score: 0.9, date: label(new Date(NOW.getTime() - DAY)) },
      { at: new Date(NOW.getTime() - 2 * DAY), text: 'Chart read', score: 0.75, date: label(new Date(NOW.getTime() - 2 * DAY)) },
      { at: new Date(NOW.getTime() - 3 * DAY), text: 'Spot the gap (transfer check)', score: 0.88, date: label(new Date(NOW.getTime() - 3 * DAY)) },
    ],
  };
}

function skill(): SkillDetailData {
  const points: ScorePoint[] = [0.5, 0.62, 0.55, 0.75, 0.7, 0.88].map((score, i) => ({
    setId: `s${i}`, at: new Date(NOW.getTime() - (14 - i * 2) * DAY), score, tier: i < 4 ? 1 : 2, stage: 'recognize', drillId: 'EX-1', counts: i !== 2, why: i === 2 ? 'A browsed set at a lower tier doesn’t count.' : null,
  }));
  return {
    id: 'EX.takeaway', name: 'Chart takeaway', area: 'Exhibits', live: true, state: 'recognizes',
    ladder: (['not_started', 'learning', 'recognizes', 'practiced', 'mastered', 'validated'] as const).map(s => ({ state: s, label: STATE_LABEL[s] })),
    next: 'Two more passing sets at tier 2 to reach Practiced. Your last score: 88%.',
    not_counted: ['A browsed set at a lower tier doesn’t count.'],
    chart: scoreChart('Chart takeaway', points, label),
    mistakes: [
      { label: 'missed the trend', recent: 1, before: 3, trend: 'down', example: { label: 'You picked', text: 'Profit fell because costs rose in every region.', where: 'Chart read · “The client wants to know why profit fell from 2023 to 2025…”', answer: 'Profit fell because costs in the West rose fastest.', date: 'Nov 5' } },
      { label: 'read the wrong data point', recent: 0, before: 2, trend: 'fixed', example: null },
    ],
    window_days: 7, findings: [], case_data: false,
    builds_on: [{ id: 'EX.extraction', name: 'Data extraction', state: 'Practiced' }],
    lesson: true,
  };
}

function lessonFor(skillId: string) {
  const l = loadLessons().find(x => x.skill_id === skillId)!;
  return { ...l, skill_name: getSkill(l.skill_id).name, mistakes: l.mistakes.map(m => ({ ...m, label: getMistakeTag(m.tag)?.label ?? m.tag })) };
}

function catalog(): CatalogData {
  const tiers = { 'PS-1': 2, 'EX-1': 1, 'QN-1': 1 } as Record<string, number>;
  return DRILLS_CONFIG.taxonomy.areas.map(area => ({
    code: area.code, name: area.name,
    skills: DRILLS_CONFIG.taxonomy.skills.filter(s => s.area === area.code && hasLiveDrill(s.id)).map(s => ({
      id: s.id, name: s.name, description: s.description, state: STATES[s.id] ?? 'not_started', stage: null,
      suggested: RX.some(r => r.skill_id === s.id), has_lesson: loadLessons().some(l => l.skill_id === s.id),
      drills: DRILLS_CONFIG.drills.drills.filter(d => d.live && d.primary_skills.includes(s.id)).slice(0, 2).map(d => ({
        stage: 'recognize' as const, drill_id: d.id, name: d.name, items: d.set_size, current_tier: tiers[d.id] ?? null, tiers: [1, 2],
      })),
    })).filter(s => s.drills.length),
  })).filter(a => a.skills.length);
}

function diagnostic(state: 'running' | 'done'): DiagnosticData {
  const parts = DRILLS_CONFIG.programs.diagnostic.parts.map((p, i) => ({
    index: i, drill_id: p.drill, drill_name: getDrill(p.drill).name, size: p.items, set_id: i < 3 ? `d${i}` : null,
    status: (state === 'done' || i < 2 ? 'done' : i === 2 ? 'in_progress' : 'todo') as 'done' | 'in_progress' | 'todo',
  }));
  return {
    id: 'preview-diagnostic', status: state === 'done' ? 'completed' : 'in_progress', parts,
    next: parts.find(p => p.status !== 'done') ?? null, grading: false, done: parts.filter(p => p.status === 'done').length,
    overall_score: state === 'done' ? 0.64 : 0.7, moved_to_track: null,
    placements: [
      { skill_id: 'PS.mece', skill_name: 'MECE structure', area: 'PS' as const, score: 0.88, count: 4, place: 'test_out' },
      { skill_id: 'QN.setup', skill_name: 'Math setup', area: 'QN' as const, score: 0.4, count: 5, place: 'recognize' },
      { skill_id: 'EX.takeaway', skill_name: 'Chart takeaway', area: 'EX' as const, score: 0.5, count: 4, place: 'recognize_t2' },
      ...(state === 'done' ? [{ skill_id: 'SY.answer_first', skill_name: 'Answer first', area: 'SY' as const, score: 0.33, count: 3, place: 'repair' as const }] : []),
    ],
  };
}

const STARTS: Canned[] = [{ method: 'POST', path: '/api/drills/sets', body: { set_id: 'preview-ex1' } }];

export const DRILL_SCREENS: Screen[] = [
  { slug: 'training-home', path: '/drills', chrome: 'drills', area: 'Plan and dashboard', title: 'Training home: a workout under way', render: () => ({ node: <TrainingHome home={home('plan')} checkin={null} />, api: STARTS }) },
  { slug: 'training-home-new', path: '/drills', chrome: 'drills', area: 'Plan and dashboard', title: 'Training home: no plan yet', render: () => ({ node: <TrainingHome home={home('new')} checkin={{ id: 'preview-checkin', kind: 'week_1' }} />, api: [...STARTS, { method: 'POST', path: '/api/drills/checkins/preview-checkin', body: { ok: true } }] }) },
  { slug: 'training-home-done', path: '/drills', chrome: 'drills', area: 'Plan and dashboard', title: 'Training home: today’s workout done', render: () => ({ node: <TrainingHome home={home('done')} checkin={null} />, api: STARTS }) },
  { slug: 'training-home-first', path: '/drills', chrome: 'drills', area: 'Plan and dashboard', title: 'Training home: first week (How CasePace works)', render: () => ({ node: <TrainingHome home={home('first')} checkin={null} />, api: STARTS }) },
  { slug: 'training-home-intro', path: '/drills', chrome: 'drills', area: 'Plan and dashboard', title: 'Training home: Foundations, intro lesson not opened', render: () => ({ node: <TrainingHome home={home('intro')} checkin={null} />, api: STARTS }) },
  { slug: 'training-home-self', path: '/drills', chrome: 'drills', area: 'Plan and dashboard', title: 'Training home: practice on my own', render: () => ({ node: <TrainingHome home={home('self')} checkin={null} />, api: STARTS }) },
  { slug: 'plan', path: '/drills/plan', chrome: 'drills', area: 'Plan and dashboard', title: 'Your plan', render: () => ({ node: <PlanScreen {...plan()} />, api: STARTS }) },
  // Week 4 of 6, Integration: the config sets no focus, so no "Focus:" line.
  { slug: 'plan-integration', path: '/drills/plan', chrome: 'drills', area: 'Plan and dashboard', title: 'Your plan: Integration week (no focus line)', render: () => {
    const p = plan();
    const week = p.view.plan.kind === 'weeks' ? p.view.plan.weeks.find(w => w.theme === 'Integration') ?? p.view.week : p.view.week;
    // This sample plan is 5 weeks (it ends at the interview), so Integration is week 3. Weeks 1–2 behind it,
    // one workout short in week 2; this week, no workouts yet and its 2 cases done (Matt's example).
    const counts = { 1: { workouts: 4, cases: 1 }, 2: { workouts: 3, cases: 1 }, 3: { workouts: 0, cases: 2 } };
    return { node: <PlanScreen {...p} view={{ ...p.view, week }} counts={counts} anyWorkout />, api: STARTS };
  } },
  // A workout done: no "Your first workout" card.
  { slug: 'plan-started', path: '/drills/plan', chrome: 'drills', area: 'Plan and dashboard', title: 'Your plan: after the first workout', render: () => ({ node: <PlanScreen {...plan()} counts={{ 1: { workouts: 2, cases: 1 } }} anyWorkout />, api: STARTS }) },
  { slug: 'plan-empty', path: '/drills/plan', chrome: 'drills', area: 'Plan and dashboard', title: 'Your plan: practice on my own, no starting point yet', render: () => ({ node: <PlanEmpty /> }) },
  { slug: 'plan-self', path: '/drills/plan', chrome: 'drills', area: 'Plan and dashboard', title: 'Your plan: practice on my own, with a starting point', render: () => ({ node: <PlanScreen {...plan()} track="self_directed" source="Built from your answers." checks={['EX.takeaway']} />, api: STARTS }) },
  { slug: 'progress', path: '/drills/progress', chrome: 'drills', area: 'Plan and dashboard', title: 'Your progress', render: () => ({ node: <ProgressScreen v={dashboard()} window={7} period="2w" group="area" />, api: [...STARTS, { method: 'PATCH', path: '/api/prescriptions/.*', body: { ok: true } }] }) },
  // Early days (Matt, 13 Nov): one week of practice, so no trends yet; no strengths yet.
  { slug: 'progress-early', path: '/drills/progress', chrome: 'drills', area: 'Plan and dashboard', title: 'Your progress: first week, no strengths yet', render: () => {
    const v = dashboard();
    const lastWeek = <T extends { categories: string[]; series: { values: number[] }[]; gaps: number[] }>(c: T): T => ({ ...c, series: c.series.map(x => ({ ...x, values: x.values.map((n, i) => (i === x.values.length - 1 ? n : 0)) })), gaps: c.categories.map((_, i) => i).filter(i => i !== c.categories.length - 1) });
    return { node: <ProgressScreen v={{ ...v, strengths: [], trends: { ...v.trends, states: { ...v.trends.states, series: v.trends.states.series.map(x => ({ ...x, values: x.values.map((n, i) => (x.name === 'Not started' || i === x.values.length - 1 ? n : 0)) })) }, misses: lastWeek(v.trends.misses), pace: lastWeek(v.trends.pace) } }} window={7} period="2w" group="area" />, api: [...STARTS, { method: 'PATCH', path: '/api/prescriptions/.*', body: { ok: true } }] };
  } },
  { slug: 'progress-empty', path: '/drills/progress', chrome: 'drills', area: 'Plan and dashboard', title: 'Your progress: before any practice', render: () => ({ node: <ProgressScreen v={dashboard(false)} window={7} period="2w" group="area" /> }) },
  { slug: 'skill', path: '/drills/progress/EX.takeaway', chrome: 'drills', area: 'Plan and dashboard', title: 'One skill (Chart takeaway)', render: () => ({ node: <SkillDetail s={skill()} />, api: STARTS }) },
    // Three lessons read (the intro among them); For you: the weakest skill, then this week's.
  { slug: 'learn', path: '/drills/learn', chrome: 'drills', area: 'Lessons', title: 'Learn library', render: () => ({ node: <LearnLibrary available={new Set(loadLessons().map(l => l.skill_id))} intro={loadIntroLesson()} read={new Set(['PS.mece', 'QN.setup'])} introRead forYou={[{ skill_id: 'QN.arithmetic', reason: 'weakest' }, { skill_id: 'EX.takeaway', reason: 'week' }, { skill_id: 'HY.form', reason: 'week' }]} /> }) },
  { slug: 'learn-new', path: '/drills/learn', chrome: 'drills', area: 'Lessons', title: 'Learn library: nothing read yet, no plan', render: () => ({ node: <LearnLibrary available={new Set(loadLessons().map(l => l.skill_id))} intro={loadIntroLesson()} read={new Set()} introRead={false} forYou={[]} /> }) },
  {
    slug: 'lesson', path: '/drills/learn/EX.takeaway', chrome: 'drills', area: 'Lessons', title: 'Lesson: Chart takeaway (summary card)', pilot: true,
    render: () => ({ node: <LessonScreen lesson={lessonFor('EX.takeaway')} mode="summary" source="library" start={{ skill_id: 'EX.takeaway', quick_start: true }} />, api: STARTS }),
  },
  {
    slug: 'lesson-full', path: '/drills/learn/EX.takeaway', chrome: 'drills', area: 'Lessons', title: 'Lesson: Chart takeaway (full, Foundations)', pilot: true,
    render: () => ({ node: <LessonScreen lesson={lessonFor('EX.takeaway')} mode="full" source="auto" start={{ skill_id: 'EX.takeaway', quick_start: true }} />, api: STARTS }),
  },
  {
    slug: 'lesson-intro', path: '/drills/learn/intro', chrome: 'drills', area: 'Lessons', title: 'How a case interview works',
    render: () => {
      const intro = loadIntroLesson()!;
      const withLesson = new Set(loadLessons().map(l => l.skill_id));
      const skills = Object.fromEntries(DRILLS_CONFIG.taxonomy.skills.map(s => [s.id, { name: s.name, href: withLesson.has(s.id) ? `/drills/learn/${encodeURIComponent(s.id)}` : null }]));
      return { node: <IntroLessonScreen intro={intro} skills={skills} auto={false} /> };
    },
  },
  { slug: 'browse', path: '/drills/browse', chrome: 'drills', area: 'Drills', title: 'Browse drills', render: () => ({ node: <BrowseDrills areas={catalog()} current={{ id: 'preview-ex1', name: 'Chart read', done: 3, size: 8 }} />, api: STARTS }) },
  { slug: 'browse-idle', path: '/drills/browse', chrome: 'drills', area: 'Drills', title: 'Browse drills: no set in progress', render: () => ({ node: <BrowseDrills areas={catalog()} current={null} />, api: STARTS }) },
  { slug: 'diagnostic-start', path: '/drills/diagnostic', chrome: 'drills', area: 'Diagnostic', title: 'Diagnostic: before starting', render: () => ({ node: <DiagnosticScreen view={null} track="standard" retake={false} />, api: [...STARTS, { method: 'POST', path: '/api/drills/diagnostic/skip', body: { ok: true } }] }) },
  { slug: 'diagnostic', path: '/drills/diagnostic', chrome: 'drills', area: 'Diagnostic', title: 'Diagnostic: part 3 of 6', render: () => ({ node: <DiagnosticScreen view={diagnostic('running')} track="standard" retake={false} />, api: STARTS }) },
  { slug: 'diagnostic-done', path: '/drills/diagnostic', chrome: 'drills', area: 'Diagnostic', title: 'Diagnostic: your starting point', render: () => ({ node: <DiagnosticScreen view={diagnostic('done')} track="standard" retake={false} /> }) },
  { slug: 'onboarding', path: '/drills/start', chrome: 'drills', area: 'Onboarding', title: 'Set up your training', render: () => ({ node: <StartScreen availability={AVAILABILITY} today={TODAY} />, api: [{ method: 'POST', path: '/api/drills/onboarding', body: { ok: true } }] }) },
  {
    slug: 'questionnaire', path: '/drills/questionnaire', chrome: 'drills', area: 'Onboarding', title: 'A few questions',
    render: () => ({ node: <QuestionnaireScreen availability={AVAILABILITY} today={TODAY} showHours initial={{ interview_date: '2026-12-11', cases_done: '1-5', availability: 'standard' }} />, api: [{ method: 'POST', path: '/api/drills/questionnaire', body: { ok: true } }] }),
  },
  {
    slug: 'settings', path: '/drills/settings', chrome: 'drills', area: 'Settings', title: 'Training settings',
    render: () => ({
      node: <SettingsScreen track="standard" interviewDate="2026-12-11" availabilityId="standard" availability={AVAILABILITY} today={TODAY} timeMultiplier={1} untimed={false} feedbackMode="immediate" />,
      api: [{ method: 'PUT', path: '/api/drills/program', body: { ok: true } }, { method: 'PUT', path: '/api/me/drill-settings', body: { ok: true } }],
    }),
  },
];
