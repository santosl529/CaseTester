// Loads the pilot dashboard's rows (weekly.ts). Read-only. Real students only: not the test clubs (unless one is asked
// for by name), not the evaluation accounts (100+ finished interviews), not the founders (REPORTS_ALLOWED_EMAILS).
// Pilot scale (tens of students) fits in memory; one query at a time, as the other reports do.
import 'server-only';
import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResults, diagnostics, drillAttempts, drillCheckins, drillFeedback, drillGradingSpend, drillItemReports, drillQuestionnaires,
  drillSets, gradingJobs, sessions, skillStateEvents, studentPrograms,
} from '@/db/schema';
import { getDrill, getMistakeTag } from '../config';
import { costOf } from '@/lib/llm-pricing';
import { HOME_DEMO_CASE_IDS, LINK_ONLY_CASE_IDS } from '@/lib/cases/listed';
import { TEST_ORGS } from './data';
import { EVALUATION_ACCOUNT_SESSIONS } from './case-side-load';
import { weekKey, weekKeys, weeklyDashboard, type WEvent, type WeeklyInput } from './weekly';

const STUDENT_EVENTS = [
  'report_viewed', 'post_case_rating', 'next_steps_shown', 'next_step_clicked', 'next_step_completed', 'case_limit_hit',
  'voice_session_started', 'voice_connect_failed', 'logged_in', 'page_view',
];
const DEMO = [...new Set([...HOME_DEMO_CASE_IDS, ...LINK_ONLY_CASE_IDS])];
const STUCK_MS = 15 * 60_000;

export interface WeeklyFilter { orgId: string | null; from: Date; to: Date }

// The founders' accounts, left out of every number (Matt, 22 Nov).
async function founderIds(env: Record<string, string | undefined> = process.env): Promise<Set<string>> {
  const emails = (env.REPORTS_ALLOWED_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return new Set();
  const rows = await db.execute<{ id: string }>(sql`select id from auth.users where lower(email) in (${sql.join(emails.map(e => sql`${e}`), sql`, `)})`);
  return new Set(rows.map(r => r.id));
}

// Sentry's error events per week (every user; the org's project), or null when it can't be read.
async function sentryWeekly(from: Date, to: Date, env: Record<string, string | undefined> = process.env): Promise<Record<string, number> | null> {
  const { SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJECT: project } = env;
  if (!token || !org) return null;
  try {
    const q = new URLSearchParams({ field: 'sum(quantity)', category: 'error', outcome: 'accepted', interval: '1d', start: from.toISOString(), end: to.toISOString() });
    if (project) q.set('project', project);
    const res = await fetch(`https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/stats_v2/?${q}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000), next: { revalidate: 3600 },
    } as RequestInit);
    if (!res.ok) return null;
    const body = await res.json() as { intervals?: string[]; groups?: { series?: Record<string, number[]> }[] };
    const days = body.intervals ?? [];
    const series = body.groups?.[0]?.series?.['sum(quantity)'] ?? [];
    const out: Record<string, number> = {};
    days.forEach((d, i) => { const k = weekKey(new Date(d)); out[k] = (out[k] ?? 0) + (series[i] ?? 0); });
    return out;
  } catch {
    return null;
  }
}

export async function loadWeeklyInput(filter: WeeklyFilter, now = new Date()): Promise<WeeklyInput> {
  const weeks = weekKeys(filter.from, filter.to);
  const founders = await founderIds();
  const profiles = await db.execute<{ id: string; org: string | null; tz: string | null; signed_up_at: Date }>(sql`
    select p.user_id id, p.org_id org, p.timezone tz, u.created_at signed_up_at
    from student_profiles p join auth.users u on u.id = p.user_id
    where ${filter.orgId ? sql`p.org_id = ${filter.orgId}` : sql`coalesce(p.org_id, '') not in (${sql.join(TEST_ORGS.map(o => sql`${o}`), sql`, `)})`}
      and p.user_id not in (select user_id from sessions where status = 'completed' group by user_id having count(*) >= ${EVALUATION_ACCOUNT_SESSIONS})`);
  const students = profiles.filter(p => !founders.has(p.id)).map(p => ({ id: p.id, org: p.org, tz: p.tz, signedUpAt: new Date(p.signed_up_at) }));
  const ids = students.map(s => s.id);
  const sentry = await sentryWeekly(new Date(`${weeks[0]}T00:00:00Z`), filter.to);
  const anonymous = filter.orgId ? [] : await db.select().from(analyticsEvents).where(and(
    eq(analyticsEvents.eventType, 'page_view'), isNull(analyticsEvents.userId), gte(analyticsEvents.createdAt, filter.from), lt(analyticsEvents.createdAt, filter.to)));
  const wrong = await db.select({ at: analyticsEvents.createdAt }).from(analyticsEvents).where(and(
    eq(analyticsEvents.eventType, 'club_code_rejected'), gte(analyticsEvents.createdAt, filter.from), lt(analyticsEvents.createdAt, filter.to)));
  const toEvent = (e: typeof analyticsEvents.$inferSelect): WEvent => ({ type: e.eventType, userId: e.userId, sessionId: e.sessionId, at: e.createdAt, payload: (e.payloadJsonb ?? {}) as Record<string, unknown> });
  const base: WeeklyInput = {
    now, weeks, students, planAt: {}, choseAt: {}, sets: [], cases: [], results: [], skillMoves: [], events: [],
    anonymousViews: anonymous.map(toEvent), signUpVisitors: [], wrongCodes: wrong.map(w => w.at),
    costs: { drills: [], cases: [] }, graded: [], disputes: [], stuck: [], comments: [], sentry,
  };
  if (ids.length === 0) return base;
  const mine = <T extends { studentId: unknown }>(t: T) => inArray(t.studentId as never, ids);

  const programs = await db.select({ studentId: studentPrograms.studentId, at: studentPrograms.planCreatedAt }).from(studentPrograms).where(mine(studentPrograms));
  const diags = await db.select({ studentId: diagnostics.studentId, at: diagnostics.startedAt }).from(diagnostics).where(mine(diagnostics));
  const quests = await db.select({ studentId: drillQuestionnaires.studentId, at: drillQuestionnaires.createdAt }).from(drillQuestionnaires).where(mine(drillQuestionnaires));
  const sets = await db.select({ id: drillSets.id, studentId: drillSets.studentId, startedAt: drillSets.startedAt, completedAt: drillSets.completedAt, status: drillSets.status, focus: drillSets.focusSkill, drillId: drillSets.drillId })
    .from(drillSets).where(mine(drillSets));
  const caseRows = await db.select({ id: sessions.id, userId: sessions.userId, caseId: sessions.caseId, startedAt: sessions.startedAt, completedAt: sessions.completedAt, status: sessions.status })
    .from(sessions).where(inArray(sessions.userId, ids));
  const cases = caseRows.filter(c => !DEMO.includes(c.caseId));
  const results = await db.select().from(caseResults).where(and(mine(caseResults), eq(caseResults.backfilled, false)));
  const moves = await db.select({ studentId: skillStateEvents.studentId, to: skillStateEvents.toState, at: skillStateEvents.createdAt }).from(skillStateEvents).where(mine(skillStateEvents));
  const events = await db.select().from(analyticsEvents).where(and(inArray(analyticsEvents.userId, ids), inArray(analyticsEvents.eventType, STUDENT_EVENTS)));
  const signUps = await db.select().from(analyticsEvents).where(and(inArray(analyticsEvents.userId, ids), eq(analyticsEvents.eventType, 'signed_up')));
  const caseIds = cases.map(c => c.id);
  const usage = caseIds.length ? await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.eventType, 'llm_usage'), inArray(analyticsEvents.sessionId, caseIds))) : [];
  const setIds = sets.map(s => s.id);
  const spend = setIds.length ? await db.select({ setId: drillGradingSpend.setId, usd: drillGradingSpend.costUsd, at: drillGradingSpend.createdAt }).from(drillGradingSpend).where(inArray(drillGradingSpend.setId, setIds)) : [];
  const attempts = await db.select({ status: drillAttempts.gradingStatus, at: drillAttempts.submittedAt }).from(drillAttempts).where(mine(drillAttempts));
  const jobs = setIds.length ? await db.select({ status: gradingJobs.status, at: gradingJobs.createdAt }).from(gradingJobs).where(inArray(gradingJobs.setId, setIds)) : [];
  const disputes = await db.select({ at: drillItemReports.createdAt }).from(drillItemReports).where(and(mine(drillItemReports), eq(drillItemReports.reason, 'grade_unfair')));
  const feedback = await db.select({ at: drillFeedback.createdAt, comment: drillFeedback.comment, category: drillFeedback.category, page: drillFeedback.page }).from(drillFeedback).where(mine(drillFeedback));
  const checkins = await db.select({ at: drillCheckins.answeredAt, comment: drillCheckins.comment, kind: drillCheckins.kind }).from(drillCheckins).where(mine(drillCheckins));

  const first = (rows: { studentId: string; at: Date | null }[]) => {
    const out: Record<string, Date> = {};
    for (const r of rows) if (r.at && (!out[r.studentId] || r.at < out[r.studentId])) out[r.studentId] = r.at;
    return out;
  };
  const planAt = first(programs);
  const choseAt = first([...programs, ...diags, ...quests, ...cases.map(c => ({ studentId: c.userId, at: c.startedAt }))]);
  const setOwner = new Map(sets.map(s => [s.id, s.studentId]));
  const caseOwner = new Map(cases.map(c => [c.id, c.userId]));
  // An unpriced or malformed usage row counts as 0, never NaN.
  const price = (p: unknown) => { try { const c = costOf(p as never); return Number.isFinite(c) ? c : 0; } catch { return 0; } };

  return {
    ...base, planAt, choseAt,
    sets: sets.map(s => ({ studentId: s.studentId, startedAt: s.startedAt, completedAt: s.status === 'completed' ? s.completedAt : null, skills: s.focus ? [s.focus] : getDrill(s.drillId).primary_skills })),
    cases: cases.map(c => ({ id: c.id, userId: c.userId, startedAt: c.startedAt, completedAt: c.completedAt, status: c.status })),
    results: results.map(r => ({
      id: r.caseAttemptId, studentId: r.studentId, tier: r.difficultyTier, completedAt: r.completedAt, retake: r.retake, partial: r.partial,
      rubric: r.rubricScores as Record<string, string>,
      flagged: (r.findings as { tag: string }[]).flatMap(f => { const skill = getMistakeTag(f.tag)?.skill; return skill ? [skill] : []; }),
    })),
    skillMoves: moves.map(m => ({ studentId: m.studentId, to: m.to, at: m.at })),
    events: events.map(toEvent),
    signUpVisitors: signUps.flatMap(e => (typeof (e.payloadJsonb as Record<string, unknown>)?.visitor === 'string' ? [{ visitor: (e.payloadJsonb as { visitor: string }).visitor, at: e.createdAt }] : [])),
    costs: {
      drills: spend.flatMap(r => (r.setId && setOwner.has(r.setId) ? [{ studentId: setOwner.get(r.setId)!, usd: r.usd, at: r.at }] : [])),
      cases: usage.flatMap(e => (e.sessionId && caseOwner.has(e.sessionId) ? [{ studentId: caseOwner.get(e.sessionId)!, usd: price(e.payloadJsonb), at: e.createdAt }] : [])),
    },
    graded: attempts.filter(x => x.status === 'graded' && x.at).map(x => x.at!),
    disputes: disputes.map(d => d.at),
    stuck: [
      ...attempts.filter(x => (x.status === 'delayed' || x.status === 'failed') && x.at).map(x => x.at!),
      ...jobs.filter(j => (j.status === 'queued' || j.status === 'running') && now.getTime() - j.at.getTime() > STUCK_MS).map(j => j.at),
    ],
    // Feedback messages and the first-case check-in's comments: text, where, when — never who.
    comments: [
      ...feedback.map(f => ({ at: f.at, text: f.comment?.trim() || `(${f.category}, no comment)`, where: f.page ?? 'Feedback' })),
      ...checkins.filter(c => c.comment && c.comment.trim() && c.at).map(c => ({ at: c.at!, text: c.comment!.trim(), where: `Check-in (${c.kind})` })),
    ],
  };
}

export async function buildWeeklyDashboard(filter: WeeklyFilter, now = new Date()) {
  return weeklyDashboard(await loadWeeklyInput(filter, now));
}
