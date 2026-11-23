// A small pilot for the dashboard's preview and tests (tests/drills/pilot-dashboard.test.ts): "now" is Sunday 22 Nov
// 2026, so the tiles show the week of 9 Nov. Times are UTC; US Eastern is 5 hours behind.
import { weekKeys, type WEvent, type WeeklyInput } from '@/lib/drills/reports/weekly';

const at = (s: string) => new Date(s);
export const NOW = at('2026-11-22T17:00:00Z');
const ev = (type: string, userId: string | null, when: string, payload: Record<string, unknown> = {}, sessionId: string | null = null): WEvent =>
  ({ type, userId, sessionId, at: at(when), payload });

export function dashboardFixture(): WeeklyInput {
  return {
    now: NOW,
    weeks: weekKeys(at('2026-10-12T12:00:00Z'), NOW),
    students: [
      // A: signed up 2 Nov; activated (plan, set and a full case within 7 days); busy in the week of 9 Nov.
      { id: 'A', org: 'wharton', signedUpAt: at('2026-11-02T15:00:00Z'), tz: 'America/New_York' },
      // B: signed up 3 Nov; never chose a starting point.
      { id: 'B', org: 'wharton', signedUpAt: at('2026-11-03T15:00:00Z'), tz: null },
      // C: signed up 12 Oct; active in their week 4 (2–9 Nov) and on 13 Nov.
      { id: 'C', org: 'everview', signedUpAt: at('2026-10-12T15:00:00Z'), tz: 'America/Los_Angeles' },
      // D: signed up 13 Oct; never active.
      { id: 'D', org: 'everview', signedUpAt: at('2026-10-13T15:00:00Z'), tz: null },
    ],
    planAt: { A: at('2026-11-03T15:00:00Z'), C: at('2026-10-13T15:00:00Z') },
    choseAt: { A: at('2026-11-03T15:00:00Z'), C: at('2026-10-13T15:00:00Z') },
    sets: [
      { studentId: 'A', startedAt: at('2026-11-04T15:00:00Z'), completedAt: at('2026-11-04T15:20:00Z'), skills: ['QN.arithmetic'] },
      { studentId: 'A', startedAt: at('2026-11-10T15:00:00Z'), completedAt: at('2026-11-10T15:20:00Z'), skills: ['PS.mece'] },
      { studentId: 'A', startedAt: at('2026-11-12T15:00:00Z'), completedAt: at('2026-11-12T15:20:00Z'), skills: ['PS.mece'] },
      { studentId: 'C', startedAt: at('2026-11-05T15:00:00Z'), completedAt: at('2026-11-05T15:20:00Z'), skills: ['EX.takeaway'] },
      { studentId: 'C', startedAt: at('2026-11-13T15:00:00Z'), completedAt: at('2026-11-13T15:20:00Z'), skills: ['EX.takeaway'] },
    ],
    cases: [
      { id: 'c1', userId: 'A', startedAt: at('2026-11-05T14:00:00Z'), completedAt: at('2026-11-05T14:25:00Z'), status: 'completed' },
      { id: 'c2', userId: 'A', startedAt: at('2026-11-13T14:00:00Z'), completedAt: at('2026-11-13T14:25:00Z'), status: 'completed' },
      { id: 'c3', userId: 'C', startedAt: at('2026-11-11T14:00:00Z'), completedAt: null, status: 'abandoned' },
    ],
    results: [
      { id: 'c1', studentId: 'A', tier: 2, completedAt: at('2026-11-05T14:25:00Z'), retake: false, partial: false, rubric: { structure: 'needs_work', quantitative: 'meets_bar' }, flagged: ['PS.mece', 'QN.setup'] },
      { id: 'c2', studentId: 'A', tier: 2, completedAt: at('2026-11-13T14:25:00Z'), retake: false, partial: false, rubric: { structure: 'meets_bar', quantitative: 'meets_bar' }, flagged: ['QN.setup'] },
    ],
    skillMoves: [
      { studentId: 'A', to: 'practiced', at: at('2026-11-12T15:20:00Z') },
      { studentId: 'C', to: 'mastered', at: at('2026-11-13T15:20:00Z') },
    ],
    events: [
      ev('report_viewed', 'A', '2026-11-05T14:30:00Z', {}, 'c1'),
      ev('post_case_rating', 'A', '2026-11-13T14:30:00Z', { usefulness: 5, realism: 4 }, 'c2'),
      ev('post_case_rating', 'A', '2026-11-12T14:30:00Z', { usefulness: 3, realism: 4 }, 'c1'),
      ev('post_case_rating', 'A', '2026-11-05T14:30:00Z', { usefulness: 2, realism: 3 }, 'c1'),
      ev('next_steps_shown', 'A', '2026-11-05T14:30:00Z', { case_attempt_id: 'c1', skill_ids: ['PS.mece', 'QN.setup'] }),
      ev('next_step_clicked', 'A', '2026-11-05T14:31:00Z', { case_attempt_id: 'c1', skill_id: 'PS.mece', action: 'practice' }),
      ev('next_step_completed', 'A', '2026-11-10T15:20:00Z', { case_attempt_id: 'c1', skill_id: 'PS.mece', kind: 'set', passed: true }),
      ev('case_limit_hit', 'A', '2026-11-13T18:00:00Z', { reason: 'daily', limit: 2 }),
      ev('voice_session_started', 'C', '2026-11-11T14:00:00Z', {}, 'c3'),
      ev('voice_connect_failed', 'C', '2026-11-11T14:01:00Z', { kind: 'no_interviewer' }, 'c3'),
      ev('logged_in', 'A', '2026-11-04T15:00:00Z'),
      ev('page_view', 'A', '2026-11-10T15:00:00Z', { path: '/drills' }),
      ev('page_view', 'A', '2026-11-10T15:10:00Z', { path: '/drills/browse' }),
      ev('page_view', 'A', '2026-11-10T16:00:00Z', { path: '/drills' }),
    ],
    anonymousViews: [
      ev('page_view', null, '2026-11-10T13:00:00Z', { path: '/', visitor: 'v1' }),
      ev('page_view', null, '2026-11-10T13:02:00Z', { path: '/sign-up', visitor: 'v1' }),
      ev('page_view', null, '2026-11-11T13:00:00Z', { path: '/', visitor: 'v2' }),
    ],
    signUpVisitors: [{ visitor: 'v1', at: at('2026-11-10T13:03:00Z') }],
    wrongCodes: [at('2026-11-10T12:00:00Z'), at('2026-11-11T12:00:00Z')],
    costs: {
      drills: [{ studentId: 'A', usd: 0.4, at: at('2026-11-10T15:20:00Z') }],
      cases: [{ studentId: 'A', usd: 0.96, at: at('2026-11-05T14:30:00Z') }, { studentId: 'A', usd: 1.0, at: at('2026-11-13T14:30:00Z') }],
    },
    graded: [at('2026-11-10T15:20:00Z'), at('2026-11-10T15:21:00Z'), at('2026-11-12T15:20:00Z'), at('2026-11-12T15:21:00Z')],
    disputes: [at('2026-11-12T15:30:00Z')],
    stuck: [],
    comments: Array.from({ length: 12 }, (_, i) => ({ at: at(`2026-11-${String(10 + Math.floor(i / 2)).padStart(2, '0')}T1${i % 10}:00:00Z`), text: `Comment ${i + 1}`, where: '/drills' })),
    sentry: { '2026-11-09': 3 },
  };
}
