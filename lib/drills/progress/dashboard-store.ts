// Your progress: loads a student's rows and builds both pages from the pure
// rules in dashboard.ts. Only ever for the signed-in student (the pages pass
// their own id). No AI calls; everything is read from existing tables.
import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillAttempts, drillSets, skillStateEvents } from '@/db/schema';
import { RUBRIC_DIMENSION_LABELS, type RubricDimensionKey } from '@/lib/scoring/rubric';
import { DRILLS_CONFIG, getDrill, getSkill } from '../config';
import { isLiveDrill } from '../live';
import { INTERVIEW_STAGES, stageOfSkill } from '../drill-info';
import { resolveItem } from '../grading/jobs';
import type { ItemRef } from '../sets/plan';
import { answerText, type StepResponse } from '../sets/scoring';
import { formatNumericAnswer } from '../sets/feedback';
import type { Tier } from '../item-schema';
import { hasLiveDrill, newProgress, stateRank, type SkillProgress, type SkillStateName } from './engine';
import { loadProgress } from './store';
import { progressTowardNext } from './profile';
import { activeProgram, openRx, programView, studentToday, weekStatus } from '../program/store';
import { missedMilestoneSkills, rankPrescriptions } from '../program/workout';
import { lessonSkills } from '../program/lessons-store';
import { caseSource, dashboardCases } from './case-source';
import {
  STATE_LABEL, countsSet, lastScore, missesByWeek, nextStep, paceByWeek, readiness, rubricByTier, scoreChart, scorePoints, skillArrow, skillMistakes,
  statesByWeek, strengths, summary, weeks, type DashAttempt, type DashEvent, type DashSet,
} from './dashboard';

const cfg = () => DRILLS_CONFIG.rules.dashboard;
const DAY = 86_400_000;
export type Period = keyof typeof DRILLS_CONFIG.rules.dashboard.periods_days;
export type GroupBy = 'area' | 'stage';

export const liveSkills = () => DRILLS_CONFIG.taxonomy.skills.filter(s => hasLiveDrill(s.id, isLiveDrill)).map(s => s.id);

async function load(studentId: string) {
  // One query at a time: the pooler stalls on many at once (reports, 2026-10-18).
  const progress = await loadProgress(db, studentId);
  const setRows = await db.select().from(drillSets).where(eq(drillSets.studentId, studentId));
  const sets: DashSet[] = setRows.map(s => ({
    id: s.id, drillId: s.drillId, tier: s.tier, stage: s.stage, source: s.source, status: s.status, isTransferCheck: s.isTransferCheck,
    skillScores: s.skillScores as DashSet['skillScores'], startedAt: s.startedAt, completedAt: s.completedAt,
  }));
  const bySet = new Map(setRows.map(s => [s.id, s]));
  const attemptRows = await db.select({
    id: drillAttempts.id, setId: drillAttempts.setId, position: drillAttempts.position, submittedAt: drillAttempts.submittedAt,
    mistakeTags: drillAttempts.mistakeTags, skipped: drillAttempts.skipped, gradingStatus: drillAttempts.gradingStatus,
    timeMs: drillAttempts.timeMs, timeLimitMs: drillAttempts.timeLimitMs,
  }).from(drillAttempts).where(eq(drillAttempts.studentId, studentId));
  const attempts: DashAttempt[] = attemptRows.flatMap(a => {
    const s = bySet.get(a.setId);
    return s ? [{ ...a, drillId: s.drillId, tier: s.tier, setSource: s.source }] : [];
  });
  const events: DashEvent[] = (await db.select().from(skillStateEvents).where(eq(skillStateEvents.studentId, studentId)).orderBy(asc(skillStateEvents.createdAt)))
    .map(e => ({ skillId: e.skillId, fromState: e.fromState, toState: e.toState, reason: e.reason, createdAt: e.createdAt }));
  const cases = await dashboardCases(studentId);
  const { timezone } = await studentToday(studentId);
  return { progress, sets, setRows, attempts, events, cases, timezone };
}

const dateLabel = (tz: string | null) => (d: Date) => {
  try {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz ?? 'UTC' });
  } catch {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
};
const dimLabel = (k: string) => RUBRIC_DIMENSION_LABELS[k as RubricDimensionKey] ?? k;

// ------------------------------------------------------------------ the page

export async function dashboardView(studentId: string, opts: { window: number; period: Period; group: GroupBy }, now = new Date()) {
  const d = await load(studentId);
  const live = liveSkills();
  const state = (id: string): SkillStateName => d.progress.get(id)?.state ?? 'not_started';
  const label = dateLabel(d.timezone);
  const practiced = d.sets.some(countsSet) || d.events.length > 0;

  // Skill map: every live skill, with its arrow over the period.
  const periodDays = cfg().periods_days[opts.period];
  const from = periodDays ? new Date(now.getTime() - periodDays * DAY) : null;
  const points = new Map(live.map(id => [id, scorePoints(d.sets, id)]));
  const tile = (id: string) => ({ id, name: getSkill(id).name, state: state(id), arrow: skillArrow(id, d.events, points.get(id)!, from, now) });
  const stages = stageOfSkill();
  const groups = opts.group === 'area'
    ? DRILLS_CONFIG.taxonomy.areas.map(a => ({ title: a.name, note: null as string | null, skills: live.filter(id => getSkill(id).area === a.code).map(tile) })).filter(g => g.skills.length)
    : INTERVIEW_STAGES.map(st => {
      const skills = live.filter(id => stages.get(id) === st).map(tile);
      return { title: st, note: skills.length ? null : 'Practiced in full cases for now.', skills };
    });

  // Focus areas: the workout's own ranking of open prescriptions, one per skill.
  const program = await activeProgram(db, studentId);
  const view = program ? await programView(studentId, now) : null;
  const week = view?.plan.kind === 'weeks' ? view.week : null;
  const open = await openRx(db, studentId);
  const ranked = rankPrescriptions(open, week ?? null, view?.plan.kind === 'weeks' ? missedMilestoneSkills(week ?? null, view.plan.weeks, d.progress) : []);
  const seen = new Set<string>();
  const focus = ranked.filter(r => !seen.has(r.rx.skill_id) && (seen.add(r.rx.skill_id), true)).slice(0, cfg().top_n)
    .map(r => ({ prescription_id: r.rx.id, skill_id: r.rx.skill_id, name: getSkill(r.rx.skill_id).name, reason: r.rx.reason, live: live.includes(r.rx.skill_id) }));
  const status = program && view?.week && view.plan.kind === 'weeks' && program.track !== 'self_directed'
    ? await weekStatus(studentId, program, view.week, view.plan, d.progress, d.timezone) : null;

  const ws = weeks(now, cfg().trend_weeks, label);
  const hasCases = d.cases.length > 0;
  return {
    practiced,
    // The empty state's button: Start today's workout once a plan exists.
    has_plan: Boolean(program && program.track !== 'self_directed' && program.planSource),
    summary: summary(d.sets, d.attempts, d.events, opts.window, now),
    counts: { mastered: live.filter(id => stateRank(state(id)) >= stateRank('mastered')).length, live: live.length },
    readiness: readiness(d.progress, live, d.cases, hasCases || caseSource() === 'case_sessions'),
    week: status && view?.week ? { number: view.week.week, theme: view.week.theme, milestone_skills: status.milestone_skills.map(s => ({ name: s.name, state: STATE_LABEL[s.state] })), met: status.milestone_met } : null,
    groups,
    // One "last score" everywhere: the last point on the skill's chart.
    strengths: strengths(d.progress, live, id => lastScore(points.get(id) ?? []), new Set(open.map(r => r.skill_id)))
      .map(p => ({ id: p.skill_id, name: getSkill(p.skill_id).name, state: STATE_LABEL[p.state], score: lastScore(points.get(p.skill_id) ?? []) })),
    focus,
    trends: {
      states: statesByWeek(d.events, live, ws), misses: missesByWeek(d.attempts, ws), pace: paceByWeek(d.attempts, ws),
      rubric: rubricByTier(d.cases, dimLabel, label),
    },
    case_data: hasCases,
    history: [
      ...d.setRows.filter(s => s.status === 'completed' && s.completedAt).map(s => ({
        at: s.completedAt!, text: `${getDrill(s.drillId).name}${s.isTransferCheck ? ' (transfer check)' : ''}${s.source === 'diagnostic' ? ' (diagnostic)' : ''}`,
        score: s.setScore,
      })),
      ...d.cases.map(c => ({ at: c.completedAt, text: `Full case (tier ${c.tier})`, score: null as number | null })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20).map(h => ({ ...h, date: label(h.at) })),
  };
}

// ------------------------------------------------------------------ a skill

// "Your answer:", "You picked:" or "You entered:" (A6: labeled honestly; a
// missed check has no quote of its own, so a written answer shows whole).
async function example(attemptId: string, setRows: Awaited<ReturnType<typeof load>>['setRows']) {
  const [a] = await db.select({ setId: drillAttempts.setId, position: drillAttempts.position, response: drillAttempts.response })
    .from(drillAttempts).where(eq(drillAttempts.id, attemptId));
  const set = setRows.find(s => s.id === a?.setId);
  if (!a || !set) return null;
  const item = await resolveItem((set.itemPlan as ItemRef[])[a.position], set.tier as Tier).catch(() => null);
  const steps = ((a.response as { steps?: (StepResponse | null)[] } | null)?.steps ?? []).filter((r): r is StepResponse => Boolean(r));
  const written = steps.map(r => answerText(r)).filter(Boolean).join(' / ');
  const first = item?.prompt.split('\n')[0] ?? '';
  const where = `${getDrill(set.drillId).name}${item ? ` · “${first.slice(0, 120)}${first.length > 120 ? '…' : ''}”` : ''}`;
  if (written) return { label: 'Your answer', text: written.slice(0, 400) + (written.length > 400 ? '…' : ''), where, answer: null as string | null };
  const choice = steps.find(r => r.type === 'choice' || r.type === 'choices');
  if (choice && item) {
    const ids = choice.type === 'choice' ? [choice.option_id] : choice.type === 'choices' ? choice.option_ids : [];
    const text = ids.map(id => item.options.find(o => o.id === id)?.text ?? item.input.steps?.flatMap(s => s.choices ?? []).find(c => c.id === id)?.text ?? id).join('; ');
    const right = item.options.filter(o => o.correct).map(o => o.text).join('; ');
    return { label: 'You picked', text, where, answer: right && right !== text ? right : null };
  }
  const numeric = steps.find(r => r.type === 'numeric');
  if (numeric && numeric.type === 'numeric') return { label: 'You entered', text: numeric.value, where, answer: item?.numeric ? formatNumericAnswer(item) : null };
  return null;
}

export async function skillDetailView(studentId: string, skillId: string, now = new Date()) {
  const skill = DRILLS_CONFIG.taxonomy.skills.find(s => s.id === skillId);
  if (!skill) return null;
  const d = await load(studentId);
  const p: SkillProgress = d.progress.get(skillId) ?? newProgress(skillId);
  const live = hasLiveDrill(skillId, isLiveDrill);
  const label = dateLabel(d.timezone);
  const points = scorePoints(d.sets, skillId);
  const mistakes = skillMistakes(skillId, d.attempts, d.cases, cfg().compare_windows_days[0], now);
  const examples = await Promise.all(mistakes.map(async m => {
    if (!m.latest) return null;
    if (m.latest.caseQuote) return { label: 'From your case', text: m.latest.caseQuote, where: 'Full case', answer: null, date: label(m.latest.at) };
    const ex = m.latest.attemptId ? await example(m.latest.attemptId, d.setRows) : null;
    return ex ? { ...ex, date: label(m.latest.at) } : null;
  }));
  const findings = d.cases.flatMap(c => c.findings.filter(f => DRILLS_CONFIG.taxonomy.mistake_tags.find(t => t.id === f.tag)?.skill === skillId)
    .map(f => ({ date: label(c.completedAt), label: DRILLS_CONFIG.taxonomy.mistake_tags.find(t => t.id === f.tag)!.label, quote: f.evidence })));
  const withLesson = await lessonSkills();
  return {
    id: skill.id, name: skill.name, area: DRILLS_CONFIG.taxonomy.areas.find(a => a.code === skill.area)?.name ?? '', live,
    state: p.state, ladder: (['not_started', 'learning', 'recognizes', 'practiced', 'mastered', 'validated'] as const).map(s => ({ state: s, label: STATE_LABEL[s] })),
    next: live ? nextStep(p, { ...progressTowardNext(p), last_score: lastScore(points) }, now, id => getSkill(id).name) : 'Coming soon: this skill is practiced in full cases for now.',
    // The reasons hollow points don't count, once each.
    not_counted: [...new Set(points.slice(-cfg().score_points_max).flatMap(pt => (pt.why ? [pt.why] : [])))],
    chart: scoreChart(skill.name, points, label),
    mistakes: mistakes.map((m, i) => ({ label: m.label, recent: m.recent, before: m.before, trend: m.trend, example: examples[i] })),
    window_days: cfg().compare_windows_days[0],
    findings,
    case_data: d.cases.length > 0,
    builds_on: skill.prerequisites.map(id => ({ id, name: getSkill(id).name, state: STATE_LABEL[d.progress.get(id)?.state ?? 'not_started'] })),
    lesson: withLesson.has(skillId),
  };
}
