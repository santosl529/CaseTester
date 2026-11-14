import { PilotReports } from '@/components/drills/views/pilot-reports';
import { LessonReviewScreen } from '@/components/drills/views/lesson-review';
import { ReportQueueScreen, type ReportQueueData } from '@/components/drills/views/report-queue';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { loadIntroLesson, loadLessons, P0_LESSON_SKILLS } from '@/lib/drills/lessons';
import {
  costAlert, defend, drillEffectiveness, engagement, feedbackModes, gradingCost, itemHealth, lessons, loopFunnel, pauses, planSources, planVsSelf, programFunnel,
  stuckRule, transfer, workoutMix, type ReportData,
} from '@/lib/drills/reports/compute';
import { checkinWeeks, feedbackFeed, reportedItems, type FeedbackRows } from '@/lib/drills/reports/feedback-compute';
import type { Reports } from '@/lib/drills/reports';
import type { Screen } from '../_lib/types';

// The local-development tools: pilot reports (the app's own report code run
// on a few sample rows), lesson review (the real lesson files) and the
// report queue (two sample reports).

const T0 = new Date('2026-10-20T12:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * 86_400_000);

function reports(): { r: Reports; fb: ReturnType<typeof feedback> } {
  const set = (id: string, studentId: string, drillId: string, day: number, score: number): ReportData['sets'][number] => ({
    id, studentId, drillId, tier: 1, size: 8, source: 'specific', isTransferCheck: false, workoutId: null, slot: null, prescriptionId: null,
    focusSkill: null, status: 'completed', setScore: score, passed: score >= 0.8, startedAt: at(day), completedAt: at(day),
  });
  const data: ReportData = {
    from: at(0), to: at(28), students: [{ id: 's1', orgId: 'harvard-cc' }, { id: 's2', orgId: 'harvard-cc' }, { id: 's3', orgId: 'wharton-cc' }],
    programs: [{ studentId: 's1', track: 'standard', status: 'active', currentWeek: 2, startedAt: at(1), planSource: 'diagnostic' }, { studentId: 's2', track: 'sprint', status: 'active', currentWeek: 0, startedAt: at(3), planSource: 'questionnaire' }],
    sets: [set('x1', 's1', 'EX-1', 2, 0.75), set('x2', 's1', 'QN-1', 3, 0.9), set('x3', 's2', 'PS-1', 4, 0.62), set('x4', 's3', 'EX-1', 5, 0.88)],
    attempts: [], jobs: [], spend: [], skillEvents: [], prescriptions: [], cases: [], lessonViews: [], workouts: [],
    diagnosticsCompleted: ['s1'], events: [], items: new Map(),
  };
  const r: Reports = {
    filter: { org_id: null, from: data.from.toISOString(), to: data.to.toISOString() }, students: data.students.length,
    cost_alert: costAlert(data),
    spend_today: { how: '', cost_usd: 0.42, limit_usd: DRILLS_CONFIG.rules.grading_limits.daily_spend_limit_usd, billing_error: false, paused: null },
    loop_funnel: loopFunnel(data), program_funnel: programFunnel(data), plan_sources: planSources(data), pauses: pauses(data), feedback_modes: feedbackModes(data),
    drill_effectiveness: drillEffectiveness(data), transfer: transfer(data), lessons: lessons(data), defend: defend(data), workout_mix: workoutMix(data),
    stuck_rule: stuckRule(data), plan_vs_self_directed: planVsSelf(data), engagement: engagement(data), item_health: itemHealth(data), grading_cost: gradingCost(data),
    event_health: { how: 'Drills events logged in the range.', seen: { drills_home_viewed: 41, set_started: 18 }, incomplete: [], incomplete_count: 0, not_seen: ['weekly_summary_viewed'] },
  };
  return { r, fb: feedback() };
}

function feedback() {
  const rows: FeedbackRows = {
    feedback: [{ at: at(6), studentId: 's1', category: 'idea', comment: 'A dark mode for late-night practice would be great.', page: '/drills', item: null, device: 'desktop' }],
    reports: [{ at: at(5), studentId: 's2', setId: 'x3', drillId: 'PS-1', item: 'ps1-0004@2', reason: 'question_confusing', comment: 'Two options seem equally right.', status: 'open' }],
    checkins: [{ at: at(6), studentId: 's1', kind: 'set_usefulness', status: 'answered', rating: 4, comment: null }],
    clubOf: new Map([['s1', 'harvard-cc'], ['s2', 'harvard-cc']]),
  };
  return { feed: feedbackFeed(rows, {}), reported: reportedItems(rows), weeks: checkinWeeks(rows) };
}

function queue(): ReportQueueData {
  const item = loadAuthoredItems().find(i => i.drill_id === 'PS-3' && i.status === 'live')!;
  const report: ReportQueueData['rows'][number]['report'] = {
    id: 'r1', studentId: 's1', setId: 'x3', position: 0, attemptId: 'a1', itemId: item.item_id, itemVersion: item.version, templateId: null, screen: 'results',
    reason: 'grade_unfair', comment: 'I did cover fixed costs, under “Costs”.', status: 'open', labels: null, redFlags: null, reviewerNotes: null, reviewedBy: null,
    reviewedAt: null, exportedAt: null, createdAt: at(6),
  };
  const attempt: NonNullable<ReportQueueData['rows'][number]['attempt']> = {
    id: 'a1', setId: 'x3', studentId: 's1', position: 0, idempotencyKey: 'k1', itemId: item.item_id, itemVersion: item.version, templateId: null, templateVersion: null, seed: null,
    response: { steps: [{ type: 'buckets', buckets: [{ title: 'Revenue', points: ['price per car', 'cars per year'] }, { title: 'Costs', points: ['parts', 'labor', 'rent'] }] }] },
    servedAt: at(6), timeMs: 151_000, timeLimitMs: 180_000, timedOut: false, skipped: false, score: 0.5, stepScores: null, mistakeTags: ['M.missing_bucket'],
    checkResults: { checks: item.checks.slice(0, 3).map((c, i) => ({ check_id: c.check_id, pass: i !== 2, by: 'ai', evidence: i === 0 ? 'Revenue: price per car' : '' })), red_flags: [] },
    redFlags: [], defendResponse: null, defendTimeMs: null, defendScore: null, defendCheckResults: null, gradingStatus: 'graded', gradingIssue: null,
    graderPromptVersion: 'v3', modelId: 'claude-haiku-5-5', submittedAt: at(6),
  };
  const rows = [{ report, attempt, drillId: 'PS-3', tier: 1, plan: [] }];
  return {
    rows,
    reports: [{ report, attempt, drillId: 'PS-3', item, steps: (attempt.response as { steps: never[] }).steps, results: attempt.checkResults as ReportQueueData['reports'][number]['results'] }],
    ungraded: [{ attempt: { ...attempt, id: 'a2', gradingStatus: 'failed', gradingIssue: 'refused', score: null }, drillId: 'PS-3', item, steps: (attempt.response as { steps: never[] }).steps }],
  };
}

export const INTERNAL_SCREENS: Screen[] = [
  { slug: 'pilot-reports', path: '/drills/reports', chrome: 'drills', area: 'Internal', title: 'Pilot reports (local development only)', render: () => { const { r, fb } = reports(); return { node: <PilotReports r={r} fb={fb} orgs={['harvard-cc', 'wharton-cc']} org={null} days={28} type={undefined} page={undefined} /> }; } },
  {
    slug: 'lesson-review', path: '/drills/review/lessons', chrome: 'drills', area: 'Internal', title: 'Lesson review (local development only)',
    render: () => {
      const order = DRILLS_CONFIG.taxonomy.skills.map(x => x.id);
      const all = loadLessons().sort((a, b) => order.indexOf(a.skill_id) - order.indexOf(b.skill_id));
      return { node: <LessonReviewScreen lessons={all.slice(0, 3)} missing={P0_LESSON_SKILLS().filter(id => !all.some(l => l.skill_id === id))} intro={loadIntroLesson()} />, api: [{ method: 'POST', path: '/api/drills/review/lessons', body: { ok: true } }] };
    },
  },
  { slug: 'report-queue', path: '/drills/review/reports', chrome: 'drills', area: 'Internal', title: 'Report queue (local development only)', render: () => ({ node: <ReportQueueScreen {...queue()} />, api: [{ method: 'PUT', path: '/api/drills/review/reports/.*', body: { ok: true } }] }) },
];
