// Rows for the pilot reports' case side (case-side.ts). The students: every profile in the club filter, minus the test
// clubs (TEST_ORGS) and the evaluation accounts (100 or more finished interviews: the founders' persona and regrade
// runs), as everywhere else in the reports. Sign-up time is the auth account's creation (no signed_up event yet).
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { HOME_DEMO_CASE_IDS } from '@/lib/cases/listed';
import { TEST_ORGS } from './data';
import type { CaseSessionRow, CommentRow, FirstsRow, RatingRow, StudentRow } from './case-side';

export const EVALUATION_ACCOUNT_SESSIONS = 100;

export async function loadCaseSide(filter: { orgId: string | null; from: Date; to: Date }) {
  const profiles = await db.execute<{ id: string; org: string | null; signed_up_at: Date }>(sql`
    select p.user_id id, p.org_id org, u.created_at signed_up_at
    from student_profiles p join auth.users u on u.id = p.user_id
    where ${filter.orgId ? sql`p.org_id = ${filter.orgId}` : sql`coalesce(p.org_id, '') not in (${sql.join(TEST_ORGS.map(o => sql`${o}`), sql`, `)})`}
      and p.user_id not in (select user_id from sessions where status = 'completed' group by user_id having count(*) >= ${EVALUATION_ACCOUNT_SESSIONS})`);
  const students: StudentRow[] = profiles.map(p => ({ id: p.id, signedUpAt: new Date(p.signed_up_at) }));
  if (students.length === 0) return { students, sessions: [] as CaseSessionRow[], ratings: [] as RatingRow[], comments: [] as CommentRow[], firsts: [] as FirstsRow[] };
  const ids = sql.join(students.map(s => sql`${s.id}::uuid`), sql`, `);
  // Raw SQL takes the dates as ISO strings.
  const from = filter.from.toISOString(), to = filter.to.toISOString();
  const demo = sql.join(HOME_DEMO_CASE_IDS.map(c => sql`${c}`), sql`, `);
  const [sessions, ratings, checkins, feedback, firsts] = await Promise.all([
    db.execute<{ user_id: string; case_id: string; status: CaseSessionRow['status']; started_at: Date; completed_at: Date | null }>(sql`
      select user_id, case_id, status, started_at, completed_at from sessions
      where user_id in (${ids}) and started_at >= ${from} and started_at < ${to}`),
    db.execute<{ case_id: string; realism: number; usefulness: number }>(sql`
      select s.case_id, (e.payload_jsonb->>'realism')::int realism, (e.payload_jsonb->>'usefulness')::int usefulness
      from analytics_events e join sessions s on s.id = e.session_id
      where e.event_type = 'post_case_rating' and s.user_id in (${ids}) and e.created_at >= ${from} and e.created_at < ${to}`),
    // The open question after a student's first full case (a check-in on Today).
    db.execute<{ at: Date; text: string }>(sql`
      select answered_at at, comment text from drill_checkins
      where kind = 'first_case' and comment is not null and comment <> '' and student_id in (${ids})
        and answered_at >= ${from} and answered_at < ${to}`),
    // The Feedback button on the case side (S3): Cases, an interview, a report, Account.
    db.execute<{ at: Date; text: string; page: string }>(sql`
      select created_at at, coalesce(nullif(comment, ''), '(' || category || ', no comment)') text, page from drill_feedback
      where student_id in (${ids}) and (page like '/case/%' or page = '/home' or page = '/account')
        and created_at >= ${from} and created_at < ${to}`),
    db.execute<{ user_id: string; plan_at: Date | null; set_at: Date | null; full_case_at: Date | null }>(sql`
      select s.id user_id,
        (select min(plan_created_at) from student_programs p where p.student_id = s.id and p.plan_source is not null) plan_at,
        (select min(completed_at) from drill_sets d where d.student_id = s.id and d.status = 'completed') set_at,
        (select min(completed_at) from sessions c where c.user_id = s.id and c.status = 'completed' and c.case_id not in (${demo})) full_case_at
      from (select unnest(array[${ids}]) id) s`),
  ]);
  const date = (d: Date | null) => (d ? new Date(d) : null);
  return {
    students,
    sessions: sessions.map(r => ({ userId: r.user_id, caseId: r.case_id, status: r.status, startedAt: new Date(r.started_at), completedAt: date(r.completed_at) })),
    ratings: ratings.filter(r => r.realism && r.usefulness).map(r => ({ caseId: r.case_id, realism: r.realism, usefulness: r.usefulness })),
    comments: [
      ...checkins.map(c => ({ at: new Date(c.at), text: c.text, where: 'After the first full case' })),
      ...feedback.map(f => ({ at: new Date(f.at), text: f.text, where: f.page.startsWith('/case/') ? (f.page.endsWith('/report') ? 'Report' : 'Interview') : f.page === '/home' ? 'Cases' : 'Account' })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()),
    firsts: firsts.map(f => ({ userId: f.user_id, planAt: date(f.plan_at), setAt: date(f.set_at), fullCaseAt: date(f.full_case_at) })),
  };
}
