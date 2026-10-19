// The past sessions on /home (site flow, 19 Oct): date, case, status and a
// link to the report. Completed sessions have a report (lib/orchestrator/
// session-end.ts: completed ⇔ something assessable); a completed one with no
// score yet links to the report page, which offers to prepare it.
import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { scores, sessions } from '@/db/schema';
import { loadCases } from '@/lib/cases/loader';

export type PastSessionInput = {
  id: string;
  caseId: string;
  status: 'active' | 'completed' | 'abandoned' | 'terminated';
  startedAt: Date;
  flags: unknown;
  scored: boolean;
};

export type PastSession = {
  id: string;
  date: string;
  caseTitle: string;
  status: string;
  link: { href: string; label: string } | null;
};

const LIMIT = 20;

export function pastSessionRows(rows: PastSessionInput[], titles: Record<string, string>, timeZone = 'UTC'): PastSession[] {
  const seen = new Set<string>();
  return rows.filter(r => !seen.has(r.id) && seen.add(r.id)).map(r => {
    const partial = Boolean((r.flags as Record<string, unknown> | null)?.partial);
    const report = `/case/${r.id}/report`;
    const [status, link] =
      r.status === 'completed'
        ? [partial ? 'Ended early' : 'Completed', r.scored ? { href: report, label: 'Report' } : { href: report, label: 'Get my report' }]
        : r.status === 'active' ? ['Not finished', null]
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

export async function loadPastSessions(userId: string, timeZone?: string | null): Promise<PastSession[]> {
  const rows = await db
    .select({ id: sessions.id, caseId: sessions.caseId, status: sessions.status, startedAt: sessions.startedAt, flags: sessions.flagsJsonb, scoreId: scores.id })
    .from(sessions)
    .leftJoin(scores, eq(scores.sessionId, sessions.id))
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.startedAt))
    .limit(LIMIT);
  const titles = Object.fromEntries(loadCases().map(c => [c.id, c.title]));
  return pastSessionRows(rows.map(r => ({ ...r, scored: r.scoreId != null })), titles, validTimeZone(timeZone));
}

function validTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}
