// Your progress (docs/prd-drills.md "Your progress"): where a student stands on
// every skill, whether they're getting better, strengths and focus areas, and
// how close they are to interview ready. Pure: dashboard-store.ts loads the
// rows. Every rule and threshold is in rules.dashboard; the trend rules are
// Matt's A1–A4 (2026-10-18), which keep small numbers and harder practice
// from reading as slipping:
//   A1 the mistake rate counts answers with a mistake, compares only the
//      drill-and-tier mixes practiced in both windows, needs enough answers,
//      and "rose" means both +20% and +1 in 10;
//   A2 placements (diagnostic, questionnaire, quick checks) aren't moves, and
//      Not started → Learning is starting, not improving;
//   A3 a skill's arrow comes from a state move, or from 3 sets against the 3
//      before at the same stage and tier, 10+ points apart;
//   A4 the score chart marks tier and stage changes.
import { DRILLS_CONFIG, getDrill, getMistakeTag, getSkill } from '../config';
import { SKILL_STATES, stageOfDrill, stateRank, type SkillProgress, type SkillStateName } from './engine';
import { metTheBar } from '../program/next-case';
import type { ChartSpec } from '../chart-spec';

const cfg = () => DRILLS_CONFIG.rules.dashboard;
const DAY = 86_400_000;

export const STATE_LABEL: Record<SkillStateName, string> = {
  not_started: 'Not started', learning: 'Learning', recognizes: 'Recognizes', practiced: 'Practiced', mastered: 'Mastered', validated: 'Validated',
};
// Stage names students see (the drill chain: spot it, fix it, build it).
export const STAGE_LABEL: Record<string, string> = { recognize: 'Recognize', repair: 'Repair', construct: 'Construct' };
// The state scale (Matt, 2026-10-18): light grey for Not started, darker at
// each step, the same in the skill map and the weekly chart.
export const STATE_COLOR: Record<SkillStateName, string> = {
  not_started: '#e5e7eb', learning: '#bfdbfe', recognizes: '#93c5fd', practiced: '#2563eb', mastered: '#1e40af', validated: '#172554',
};

type Spec = ChartSpec;
// A chart with every optional part empty, then what it sets.
function chart(spec: Partial<Spec> & Pick<Spec, 'type' | 'title'>): Spec {
  return {
    categories: [], series: [], y_axis: { format: { prefix: '', suffix: '', decimals: 0 } }, show_values: true,
    reference_lines: [], markers: [], gaps: [], hollow: [], notes: [], totals: [], footnotes: [], ...spec,
  };
}

// ------------------------------------------------------------------ inputs

export interface DashSet {
  id: string; drillId: string; tier: number; stage: string | null; source: string; status: string; isTransferCheck?: boolean;
  skillScores: Record<string, { score: number; count: number }> | null; startedAt: Date; completedAt: Date | null;
}
export interface DashAttempt {
  id: string; setId: string; drillId: string; tier: number; setSource: string; position: number; submittedAt: Date;
  mistakeTags: string[]; skipped: boolean; gradingStatus: string; timeMs: number; timeLimitMs: number;
}
export interface DashEvent { skillId: string; fromState: SkillStateName; toState: SkillStateName; reason: string; createdAt: Date }
export interface DashCase {
  key: string; caseId: string; tier: number; completedAt: Date;
  ratings: Record<string, string>; findings: { tag: string; evidence: string }[];
}

// ------------------------------------------------------------------ basics

// Practice that counts: finished, not a diagnostic part. Untimed and
// hidden-timer sets count like timed ones.
export const countsSet = (s: DashSet) => s.status === 'completed' && s.source !== 'diagnostic' && s.completedAt !== null;
// A graded answer that can carry a mistake: not skipped, not left ungraded.
export const gradedAnswer = (a: DashAttempt) => a.setSource !== 'diagnostic' && !a.skipped && (a.gradingStatus === 'graded' || a.gradingStatus === 'not_needed');
const missed = (a: DashAttempt) => a.mistakeTags.some(t => t !== 'M.skipped');
// A2: placements move skills without practice.
export const isPlacement = (e: DashEvent) => /placement/i.test(e.reason);
const inWindow = (d: Date, from: Date, to: Date) => d > from && d <= to;

// A2: a practice move into or out of Recognizes and above; +1 up, -1 down, 0 neither.
export function moveDirection(e: DashEvent): -1 | 0 | 1 {
  if (isPlacement(e)) return 0;
  const from = stateRank(e.fromState), to = stateRank(e.toState), floor = stateRank('recognizes');
  if (to > from && to >= floor) return 1;
  if (to < from && from >= floor) return -1;
  return 0;
}

// Skills whose practice moves in the window net up, and net down.
export function moves(events: DashEvent[], from: Date, to: Date): { up: string[]; down: string[] } {
  const net = new Map<string, number>();
  for (const e of events) if (inWindow(e.createdAt, from, to)) net.set(e.skillId, (net.get(e.skillId) ?? 0) + moveDirection(e));
  return { up: [...net].filter(([, n]) => n > 0).map(([s]) => s), down: [...net].filter(([, n]) => n < 0).map(([s]) => s) };
}

// A1: answers with a mistake per 10, over the drill-and-tier mixes practiced
// in both windows; null when either window has too few such answers.
export function missRates(attempts: DashAttempt[], cur: [Date, Date], prev: [Date, Date]): { cur: number; prev: number; answers: [number, number] } | null {
  const key = (a: DashAttempt) => `${a.drillId}|${a.tier}`;
  const a1 = attempts.filter(a => gradedAnswer(a) && inWindow(a.submittedAt, ...cur));
  const a0 = attempts.filter(a => gradedAnswer(a) && inWindow(a.submittedAt, ...prev));
  const both = new Set(a1.map(key).filter(k => a0.some(a => key(a) === k)));
  const m1 = a1.filter(a => both.has(key(a))), m0 = a0.filter(a => both.has(key(a)));
  if (m1.length < cfg().min_answers_per_window || m0.length < cfg().min_answers_per_window) return null;
  const per10 = (xs: DashAttempt[]) => Number(((xs.filter(missed).length / xs.length) * 10).toFixed(1));
  return { cur: per10(m1), prev: per10(m0), answers: [m1.length, m0.length] };
}

// ------------------------------------------------------------------ summary

export type SummaryStatus = 'improving' | 'steady' | 'slipping' | 'not_enough';
export interface Summary { status: SummaryStatus; sentence: string; window_days: number; up: string[]; down: string[]; rate: ReturnType<typeof missRates> }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summary(sets: DashSet[], attempts: DashAttempt[], events: DashEvent[], windowDays: number, now: Date): Summary {
  const d = windowDays * DAY;
  const cur: [Date, Date] = [new Date(now.getTime() - d), now];
  const prev: [Date, Date] = [new Date(now.getTime() - 2 * d), cur[0]];
  const setsIn = ([from, to]: [Date, Date]) => sets.filter(s => countsSet(s) && inWindow(s.completedAt!, from, to)).length;
  const base = { window_days: windowDays, up: [] as string[], down: [] as string[], rate: null };
  if (setsIn(cur) < cfg().min_sets_per_window || setsIn(prev) < cfg().min_sets_per_window) {
    return { ...base, status: 'not_enough', sentence: 'Not enough practice yet to tell.' };
  }
  const { up, down } = moves(events, ...cur);
  const rate = missRates(attempts, cur, prev);
  // A1: a rise counts only if it is both +20% and +1 in 10.
  const rose = rate !== null && rate.cur - rate.prev >= cfg().slipping_min_rise_per_10 - 1e-9 && rate.cur >= rate.prev * (1 + cfg().slipping_rate_rise) - 1e-9;
  const status: SummaryStatus = down.length > up.length || rose ? 'slipping'
    : up.length > down.length && (rate === null || rate.cur <= rate.prev) ? 'improving' : 'steady';
  const rateText = rate === null ? null
    : rate.cur < rate.prev ? `you missed fewer answers (${rate.cur} in 10, down from ${rate.prev})`
    : rate.cur > rate.prev ? `you missed more answers (${rate.cur} in 10, up from ${rate.prev})`
    : `you missed about the same (${rate.cur} in 10)`;
  const span = windowDays === 7 ? 'this week' : `the last ${windowDays} days`;
  const sentence = status === 'improving'
    ? `You're improving: ${plural(up.length, 'skill')} moved up${rateText ? `, and ${rateText}` : ''}.`
    : status === 'slipping'
      ? `You're slipping: ${down.length > up.length ? `${plural(down.length, 'skill')} moved down` : rateText}${down.length > up.length && rateText ? `, and ${rateText}` : ''}.`
      : `You're holding steady over ${span}: ${plural(up.length, 'skill')} up, ${down.length} down${rateText ? `, and ${rateText}` : ''}.`;
  return { status, sentence, window_days: windowDays, up, down, rate };
}

// ------------------------------------------------------------------ skill trend (A3)

// counts: whether the set counts toward the skill's next state; why: if not.
export interface ScorePoint { setId: string; at: Date; score: number; tier: number; stage: string | null; drillId: string; counts: boolean; why: string | null }

// Why a set that trains the skill doesn't move its state (the engine's rules:
// lib/drills/progress/engine.ts applySet), or null if it counts.
function notCounted(s: DashSet, skillId: string): string | null {
  if (s.isTransferCheck || s.source === 'review') return null;
  if (stageOfDrill(s.drillId, skillId) === 'repair') return 'Repair sets move you on to Construct; they don\'t change the state.';
  const min = DRILLS_CONFIG.rules.mastery.min_counting_tier;
  if (s.tier < min) return `Tier ${s.tier} sets don't count; tier ${min} and up do.`;
  return null;
}

// The skill's score in each set that trains it directly (a drill whose
// primary skill it is, so the score moves its state; 3+ items or checks on
// it). Its last point is the skill's last score everywhere on the page.
export function scorePoints(sets: DashSet[], skillId: string): ScorePoint[] {
  return sets.filter(s => countsSet(s) && s.skillScores?.[skillId] && getDrill(s.drillId).primary_skills.includes(skillId))
    .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime())
    .map(s => {
      const why = notCounted(s, skillId);
      return { setId: s.id, at: s.completedAt!, score: s.skillScores![skillId].score, tier: s.tier, stage: s.stage, drillId: s.drillId, counts: why === null, why };
    });
}

export const lastScore = (points: ScorePoint[]) => points[points.length - 1]?.score ?? null;

export type Arrow = 'up' | 'down' | 'flat' | 'none';

// A3: a practice state move in the period sets the arrow; otherwise the last
// 3 scores against the 3 before, at the latest stage and tier, 10+ points
// apart; too few such sets, no arrow.
export function skillArrow(skillId: string, events: DashEvent[], points: ScorePoint[], from: Date | null, now: Date): Arrow {
  const start = from ?? new Date(0);
  const net = events.filter(e => e.skillId === skillId && inWindow(e.createdAt, start, now)).reduce((n, e) => n + moveDirection(e), 0);
  if (net > 0) return 'up';
  if (net < 0) return 'down';
  const inPeriod = points.filter(p => inWindow(p.at, start, now));
  const last = inPeriod[inPeriod.length - 1];
  if (!last) return 'none';
  const same = inPeriod.filter(p => p.stage === last.stage && p.tier === last.tier);
  const k = cfg().arrow_sets_per_side;
  if (same.length < 2 * k) return 'none';
  const mean = (xs: ScorePoint[]) => xs.reduce((n, p) => n + p.score, 0) / xs.length;
  const diff = mean(same.slice(-k)) - mean(same.slice(-2 * k, -k));
  return diff >= cfg().arrow_min_change - 1e-9 ? 'up' : diff <= -cfg().arrow_min_change + 1e-9 ? 'down' : 'flat';
}

// A4: the score per set, the bar drawn in, a marker at every tier or stage change.
export function scoreChart(skillName: string, points: ScorePoint[], dateLabel: (d: Date) => string): ChartSpec | null {
  const shown = points.slice(-cfg().score_points_max);
  if (shown.length === 0) return null;
  const markers = shown.flatMap((p, i) => {
    const before = i > 0 ? shown[i - 1] : null;
    if (!before) return [];
    const labels: string[] = [];
    const order = ['recognize', 'repair', 'construct'];
    if (p.stage !== before.stage && p.stage) labels.push(`${order.indexOf(p.stage) > order.indexOf(before.stage ?? '') ? '▲' : '▼'} ${STAGE_LABEL[p.stage] ?? p.stage} drills`);
    if (p.tier !== before.tier) labels.push(`${p.tier > before.tier ? '▲ Up' : '▼ Down'} to tier ${p.tier}`);
    return labels.length ? [{ index: i, label: labels.join(', ') }] : [];
  });
  return chart({
    type: 'line', title: `${skillName}: score per set`, categories: shown.map(p => dateLabel(p.at)),
    series: [{ name: 'Score', values: shown.map(p => Math.round(p.score * 100)), axis: 'left' }],
    y_axis: { min: 0, max: 100, format: { prefix: '', suffix: '%', decimals: 0 } }, show_values: shown.length <= 12,
    reference_lines: [{ value: Math.round(DRILLS_CONFIG.rules.mastery.passing_score * 100), label: `the ${Math.round(DRILLS_CONFIG.rules.mastery.passing_score * 100)}% bar` }],
    markers,
    hollow: shown.flatMap((p, i) => (p.counts ? [] : [i])),
    notes: shown.flatMap((p, i) => (p.why ? [{ index: i, text: `Doesn't count: ${p.why}` }] : [])),
  });
}

// ------------------------------------------------------------------ where you are

export function nextStep(p: SkillProgress, towards: { passing_sets: number; of: number; last_score: number | null; bar: number }, now: Date, prereqName: (id: string) => string): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (p.paused_for_prereq) return `Paused while you practice ${prereqName(p.paused_for_prereq)}, which it builds on.`;
  switch (p.state) {
    case 'not_started': return 'Start with a quick set: it finds your level.';
    case 'learning':
    case 'recognizes':
      return `${towards.passing_sets} of ${towards.of} passing sets, need ${pct(towards.bar)}${towards.last_score !== null ? ` (last: ${pct(towards.last_score)})` : ''}.`;
    case 'practiced':
      return p.transfer_due_at && p.transfer_due_at > now
        ? `Next: a transfer check, from ${p.transfer_due_at.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} (need ${pct(DRILLS_CONFIG.rules.transfer.pass_at_or_above)}).`
        : `Next: your transfer check is ready (need ${pct(DRILLS_CONFIG.rules.transfer.pass_at_or_above)}).`;
    case 'mastered': return 'Validated needs a full case that shows this skill.';
    case 'validated': return p.next_review_at ? `Top of the ladder. A short review from ${p.next_review_at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` : 'Top of the ladder.';
  }
}

// ------------------------------------------------------------------ readiness

export interface ReadinessLine { key: 'milestones' | 'others' | 'cases'; text: string; met: boolean; detail: string }
export interface Readiness { status: string; met: number; lines: ReadinessLine[] }

// The milestone skills of the six-week plan (weeks with a skills milestone).
export function milestoneSkills(): string[] {
  return [...new Set(DRILLS_CONFIG.programs.weeks.flatMap(w => (w.milestone.type === 'skills' ? w.milestone.skills : [])))];
}

// A8: only first completions of different cases count: a case finished
// before is a retake (Matt, 2026-10-18).
export function firstCompletions(cases: DashCase[]): DashCase[] {
  const seen = new Set<string>();
  return [...cases].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime()).filter(c => !seen.has(c.caseId) && (seen.add(c.caseId), true));
}

export function readiness(progress: Map<string, SkillProgress>, live: string[], cases: DashCase[], caseDataAvailable: boolean): Readiness {
  const r = cfg().readiness;
  const state = (id: string) => progress.get(id)?.state ?? 'not_started';
  const atLeast = (id: string, min: SkillStateName) => stateRank(state(id)) >= stateRank(min);
  const milestones = milestoneSkills().filter(id => live.includes(id));
  const others = live.filter(id => !milestones.includes(id));
  const mDone = milestones.filter(id => atLeast(id, r.milestone_min_state)).length;
  const oDone = others.filter(id => atLeast(id, r.other_min_state)).length;
  const eligible = firstCompletions(cases).filter(c => c.tier >= r.case_min_tier).slice(-r.cases_needed);
  const metBar = eligible.filter(c => metTheBar(c.ratings)).length;
  const casesMet = eligible.length === r.cases_needed && metBar === r.cases_needed;
  const lines: ReadinessLine[] = [
    { key: 'milestones', met: mDone === milestones.length, detail: `${mDone} of ${milestones.length}`,
      text: `All ${milestones.length} milestone skills from the six-week plan at ${STATE_LABEL[r.milestone_min_state]} or above` },
    { key: 'others', met: oDone === others.length, detail: `${oDone} of ${others.length}`,
      text: `Every other skill at ${STATE_LABEL[r.other_min_state]} or above` },
    { key: 'cases', met: casesMet,
      detail: !caseDataAvailable ? 'Case results reach your training once full cases send them.'
        : eligible.length === 0 ? `No tier ${r.case_min_tier}+ cases yet.`
        : `${metBar} of your last ${eligible.length === r.cases_needed ? r.cases_needed : eligible.length} met the bar.`,
      text: `Your last ${r.cases_needed} different full cases at tier ${r.case_min_tier} or higher meet the bar (no area at "needs work", at least half "strong"; retakes don't count)` },
  ];
  const met = lines.filter(l => l.met).length;
  const status = [...r.statuses].sort((a, b) => b.min_met - a.min_met).find(s => met >= s.min_met)!.label;
  return { status, met, lines };
}

// ------------------------------------------------------------------ strengths

// A9: from Practiced up; highest state, then highest last score (the chart's
// last point). A skill with an open prescription is never a strength: it is a
// focus area (Matt, 2026-10-18).
export function strengths(progress: Map<string, SkillProgress>, live: string[], score: (id: string) => number | null, flagged: Set<string>): SkillProgress[] {
  const min = stateRank(cfg().strengths_min_state);
  return live.map(id => progress.get(id)).filter((p): p is SkillProgress => Boolean(p) && stateRank(p!.state) >= min && !flagged.has(p!.skill_id))
    .sort((a, b) => stateRank(b.state) - stateRank(a.state) || (score(b.skill_id) ?? 0) - (score(a.skill_id) ?? 0))
    .slice(0, cfg().top_n);
}

// ------------------------------------------------------------------ mistakes on a skill

// trend 'fixed': none in either window, but seen before them.
export interface SkillMistake { tag: string; label: string; recent: number; before: number; trend: Arrow | 'fixed'; latest: { attemptId: string | null; at: Date; caseQuote: string | null } | null }

// The skill's mistakes: in the period against the same length before, and
// the latest occurrence (a drill answer or a case quote).
export function skillMistakes(skillId: string, attempts: DashAttempt[], cases: DashCase[], periodDays: number, now: Date): SkillMistake[] {
  const tags = DRILLS_CONFIG.taxonomy.mistake_tags.filter(t => t.skill === skillId);
  const from = new Date(now.getTime() - periodDays * DAY), before = new Date(now.getTime() - 2 * periodDays * DAY);
  return tags.map(t => {
    const hits = attempts.filter(a => a.setSource !== 'diagnostic' && a.mistakeTags.includes(t.id));
    const caseHits = cases.flatMap(c => c.findings.filter(f => f.tag === t.id).map(f => ({ at: c.completedAt, quote: f.evidence })));
    const recent = hits.filter(a => inWindow(a.submittedAt, from, now)).length + caseHits.filter(c => inWindow(c.at, from, now)).length;
    const prior = hits.filter(a => inWindow(a.submittedAt, before, from)).length + caseHits.filter(c => inWindow(c.at, before, from)).length;
    const lastDrill = [...hits].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
    const lastCase = [...caseHits].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    const latest = lastCase && (!lastDrill || lastCase.at > lastDrill.submittedAt)
      ? { attemptId: null, at: lastCase.at, caseQuote: lastCase.quote }
      : lastDrill ? { attemptId: lastDrill.id, at: lastDrill.submittedAt, caseQuote: null } : null;
    const trend: SkillMistake['trend'] = recent === 0 && prior === 0 ? 'fixed' : recent > prior ? 'up' : recent < prior ? 'down' : 'flat';
    return { tag: t.id, label: t.label, recent, before: prior, trend, latest };
  }).filter(m => m.latest !== null).sort((a, b) => b.recent - a.recent || b.before - a.before);
}

// ------------------------------------------------------------------ trends by week

export interface Week { from: Date; to: Date; label: string }
export function weeks(now: Date, n: number, label: (d: Date) => string): Week[] {
  return Array.from({ length: n }, (_, i) => {
    const to = new Date(now.getTime() - (n - 1 - i) * 7 * DAY);
    const from = new Date(to.getTime() - 7 * DAY);
    return { from, to, label: label(new Date(from.getTime() + DAY)) };
  });
}

// Skills at each state at the end of each week, rebuilt from the state events.
export function statesByWeek(events: DashEvent[], live: string[], ws: Week[]): ChartSpec {
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const at = (w: Week) => {
    const state = new Map<string, SkillStateName>();
    for (const e of sorted) if (e.createdAt <= w.to) state.set(e.skillId, e.toState);
    return live.map(id => state.get(id) ?? 'not_started');
  };
  const counts = ws.map(at);
  return chart({
    type: 'stacked_bar', title: 'Skills at each state, by week', categories: ws.map(w => w.label),
    series: SKILL_STATES.map(s => ({ name: STATE_LABEL[s], values: counts.map(c => c.filter(x => x === s).length), axis: 'left' as const, color: STATE_COLOR[s] })),
    y_axis: { label: 'Skills', format: { prefix: '', suffix: '', decimals: 0 } }, show_values: false,
  });
}

// Answers with a mistake per 10 graded answers, by week (no data: a gap).
export function missesByWeek(attempts: DashAttempt[], ws: Week[]): ChartSpec {
  const per = ws.map(w => attempts.filter(a => gradedAnswer(a) && inWindow(a.submittedAt, w.from, w.to)));
  return chart({
    type: 'line', title: 'Missed answers per 10, by week', units_label: 'Lower is better', categories: ws.map(w => w.label),
    series: [{ name: 'Missed per 10', values: per.map(xs => (xs.length ? Number(((xs.filter(missed).length / xs.length) * 10).toFixed(1)) : 0)), axis: 'left' }],
    y_axis: { min: 0, format: { prefix: '', suffix: '', decimals: 1 } },
    gaps: per.flatMap((xs, i) => (xs.length ? [] : [i])),
    footnotes: ['Harder tiers and written drills bring more misses: a rise after moving up is expected.'],
  });
}

// Time taken against the item's target (the limit the student was given; 1×
// for an untimed set), by week. Timed-out answers cap at 100%.
export function paceByWeek(attempts: DashAttempt[], ws: Week[]): ChartSpec {
  const per = ws.map(w => attempts.filter(a => a.setSource !== 'diagnostic' && !a.skipped && a.timeLimitMs > 0 && inWindow(a.submittedAt, w.from, w.to)));
  return chart({
    type: 'line', title: 'Pace: time taken against the target, by week', units_label: 'Lower is better', categories: ws.map(w => w.label),
    series: [{ name: 'Time against target', values: per.map(xs => (xs.length ? Math.round((xs.reduce((n, a) => n + a.timeMs / a.timeLimitMs, 0) / xs.length) * 100) : 0)), axis: 'left' }],
    y_axis: { min: 0, format: { prefix: '', suffix: '%', decimals: 0 } },
    gaps: per.flatMap((xs, i) => (xs.length ? [] : [i])), reference_lines: [{ value: 100, label: 'the target' }],
  });
}

const RATING_TEXT: Record<string, string> = { needs_work: 'Needs work', meets_bar: 'Meets the bar', strong: 'Strong' };
const RATING_RANK: Record<string, number> = { needs_work: 0, meets_bar: 1, strong: 2 };

// Case ratings per rubric area, compared only within one case tier, once the
// tier has 2+ different cases (first completions).
export function rubricByTier(cases: DashCase[], dimLabel: (key: string) => string, dateLabel: (d: Date) => string): ChartSpec[] {
  const byTier = new Map<number, DashCase[]>();
  for (const c of firstCompletions(cases)) byTier.set(c.tier, [...(byTier.get(c.tier) ?? []), c]);
  return [...byTier].sort(([a], [b]) => a - b).filter(([, cs]) => cs.length >= 2).map(([tier, cs]) => {
    const shown = cs.slice(-6);
    const dims = [...new Set(shown.flatMap(c => Object.keys(c.ratings)))];
    // ↑ / ↓ against the case before, in the same tier.
    const cell = (c: DashCase, i: number, d: string) => {
      const text = RATING_TEXT[c.ratings[d]] ?? '–';
      const prev = i > 0 ? shown[i - 1].ratings[d] : undefined;
      if (prev === undefined || c.ratings[d] === undefined || RATING_RANK[c.ratings[d]] === RATING_RANK[prev]) return text;
      return `${text} ${RATING_RANK[c.ratings[d]] > RATING_RANK[prev] ? '↑' : '↓'}`;
    };
    return chart({
      type: 'table', title: `Case ratings, tier ${tier} cases`, show_values: false,
      table: { columns: ['Area', ...shown.map(c => dateLabel(c.completedAt))], rows: dims.map(d => [dimLabel(d), ...shown.map((c, i) => cell(c, i, d))]) },
      footnotes: ['↑ better than the case before, ↓ worse.'],
    });
  });
}

export const skillName = (id: string) => getSkill(id).name;
export const tagSkill = (tag: string) => getMistakeTag(tag)?.skill ?? null;
