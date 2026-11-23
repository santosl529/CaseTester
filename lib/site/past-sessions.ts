// The past sessions on /home (site flow, 19 Oct): date, case, status and a
// link to the report. Completed sessions have a report (lib/orchestrator/
// session-end.ts: completed ⇔ something assessable). Both open the report page:
// "View report" when it is scored, "Get my report" when not yet (the page then
// offers to prepare it). An unfinished one (Matt, 17 Nov, M3): "Continue" while
// the case's time lasts, in voice if it ran in voice; once time is up it shows as
// ended, with "Get my report" (which ends it first: `endFirst`) when something
// assessable happened.
import 'server-only';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { HOME_DEMO_CASE_IDS, LINK_ONLY_CASE_IDS } from '@/lib/cases/listed';
import { db } from '@/db/client';
import { scores, sessions, voiceSessionLines } from '@/db/schema';
import { loadCases } from '@/lib/cases/loader';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { caseHref } from '@/lib/site/case-href';
import { interviewClock } from '@/lib/site/interview-clock';

export type PastSessionInput = {
  id: string;
  caseId: string;
  status: 'active' | 'completed' | 'abandoned' | 'terminated';
  startedAt: Date;
  flags: unknown;
  scored: boolean;
  totalMs: number;    // the case's length
  voice: boolean;     // it ran in voice
};

export type PastSession = {
  id: string;
  date: string;
  caseTitle: string;
  status: string;
  // endFirst: end the timed-out interview (POST /api/channel/<id>/expire), then open href.
  link: { href: string; label: string; endFirst?: true } | null;
};

const LIMIT = 20;

export function pastSessionRows(rows: PastSessionInput[], titles: Record<string, string>, timeZone = 'UTC', now = new Date()): PastSession[] {
  const seen = new Set<string>();
  return rows.filter(r => !seen.has(r.id) && seen.add(r.id)).map(r => {
    const partial = Boolean((r.flags as Record<string, unknown> | null)?.partial);
    const report = `/case/${r.id}/report`;
    const clock = r.status === 'active' ? interviewClock(r.startedAt, r.flags, r.totalMs, now) : null;
    const [status, link]: [string, PastSession['link']] =
      r.status === 'completed'
        ? [partial ? 'Ended early' : 'Completed', r.scored ? { href: report, label: 'View report' } : { href: report, label: 'Get my report' }]
        : clock?.state === 'running' ? [`In progress · about ${clock.minutesLeft} min left`, { href: caseHref(r.id, r.voice ? 'voice' : 'text'), label: 'Continue' }]
        : clock?.state === 'time_up' ? (clock.report ? ['Ended (time ran out)', { href: report, label: 'Get my report', endFirst: true }] : ['Ended — no report', null])
        : r.status === 'abandoned' ? ['Ended — no report', null]
        : ['Ended', null];
    return {
      id: r.id,
      date: r.startedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone }),
      caseTitle: titles[r.caseId] ?? r.caseId,
      status,
      link,
    };
  });
}

// Each case's finished attempts (the Cases page's "Done 2× · View last
// report", Matt 13 Nov): how many completed sessions, and the latest one.
export function caseAttemptRows(rows: { id: string; caseId: string; startedAt: Date }[]): Record<string, { done: number; last: string }> {
  const out: Record<string, { done: number; last: string; at: number }> = {};
  for (const r of rows) {
    const o = out[r.caseId] ?? { done: 0, last: r.id, at: -Infinity };
    o.done++;
    if (r.startedAt.getTime() > o.at) { o.last = r.id; o.at = r.startedAt.getTime(); }
    out[r.caseId] = o;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { done: v.done, last: v.last }]));
}

export async function loadCaseAttempts(userId: string) {
  const rows = await db.select({ id: sessions.id, caseId: sessions.caseId, startedAt: sessions.startedAt }).from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, 'completed')));
  return caseAttemptRows(rows);
}

export async function loadPastSessions(userId: string, timeZone?: string | null): Promise<PastSession[]> {
  const rows = await db
    .select({ id: sessions.id, caseId: sessions.caseId, status: sessions.status, startedAt: sessions.startedAt, flags: sessions.flagsJsonb, scoreId: scores.id })
    .from(sessions)
    .leftJoin(scores, eq(scores.sessionId, sessions.id))
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.startedAt))
    .limit(LIMIT);
  const cases = loadCases();
  const titles = Object.fromEntries(cases.map(c => [c.id, c.title]));
  const lengths = Object.fromEntries(cases.map(c => [c.id, caseTotalMs(c)]));
  const active = rows.filter(r => r.status === 'active').map(r => r.id);
  const voiced = new Set(active.length
    ? (await db.selectDistinct({ id: voiceSessionLines.sessionId }).from(voiceSessionLines).where(inArray(voiceSessionLines.sessionId, active))).map(v => v.id)
    : []);
  return pastSessionRows(rows.map(r => ({ ...r, scored: r.scoreId != null, totalMs: lengths[r.caseId] ?? caseTotalMs({}), voice: voiced.has(r.id) })), titles, validTimeZone(timeZone));
}

// Today's "interview in progress" card (M3): the latest interview that can still be continued.
// The student's last full case (not the demo) ended with nothing to report: abandoned, or its time ran out with
// nothing assessable — what Past sessions calls "Ended — no report". Today's starting-point choice then says "Your
// case ended too early to place you." (Matt, 21–22 Nov).
export function endedWithoutReport(r: Pick<PastSessionInput, 'status' | 'startedAt' | 'flags' | 'totalMs'>, now = new Date()): boolean {
  if (r.status === 'abandoned' || r.status === 'terminated') return true;
  if (r.status !== 'active') return false;
  const clock = interviewClock(r.startedAt, r.flags, r.totalMs, now);
  return clock.state === 'time_up' && !clock.report;
}

export async function lastCaseEndedEarly(userId: string, now = new Date()): Promise<boolean> {
  const demo = [...new Set([...HOME_DEMO_CASE_IDS, ...LINK_ONLY_CASE_IDS])];
  const [last] = await db.select({ caseId: sessions.caseId, status: sessions.status, startedAt: sessions.startedAt, flags: sessions.flagsJsonb })
    .from(sessions).where(and(eq(sessions.userId, userId), notInArray(sessions.caseId, demo))).orderBy(desc(sessions.startedAt)).limit(1);
  if (!last) return false;
  const c = loadCases().find(x => x.id === last.caseId);
  return endedWithoutReport({ ...last, totalMs: c ? caseTotalMs(c) : caseTotalMs({}) }, now);
}

export async function loadUnfinishedInterview(userId: string): Promise<{ caseTitle: string; status: string; href: string } | null> {
  const row = (await loadPastSessions(userId)).find(r => r.link?.label === 'Continue');
  return row ? { caseTitle: row.caseTitle, status: row.status, href: row.link!.href } : null;
}

function validTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}
