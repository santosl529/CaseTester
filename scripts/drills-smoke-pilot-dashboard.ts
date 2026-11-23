// The pilot dashboard's loader against the real database (Matt, 22 Nov), free: a throwaway student in the smoke-test
// club (a real login, as the loader reads sign-up times from it) with a plan, a finished drill set, a finished case with
// its AI cost, a page view, a report view and a case-limit hit; the dashboard for that club must count each. Deletes
// the student.
//
//   npm run drills:smoke:pilot-dashboard
import './smoke-log';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { analyticsEvents, drillSets, sessions, studentProfiles } from '@/db/schema';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { deleteAccount } from '@/lib/account/delete-account';
import { logEvent } from '@/lib/analytics';
import { onboard } from '@/lib/drills/program/store';
import { submitQuestionnaire } from '@/lib/drills/program/plan-source';
import { buildWeeklyDashboard } from '@/lib/drills/reports/weekly-load';

const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };

async function main() {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.createUser({ email: `pilot-fix+dash-${Date.now()}@example.com`, password: `Dash-${randomUUID()}`, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('no user');
  const id = data.user.id;
  try {
    await db.insert(studentProfiles).values({ userId: id, orgId: 'smoke-test', timezone: 'America/New_York' }).onConflictDoUpdate({ target: studentProfiles.userId, set: { orgId: 'smoke-test' } });
    await onboard(id, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'America/New_York' });
    await submitQuestionnaire(id, { interview_date: null, cases_done: '1-5', availability: 'standard', ratings: { structuring: 3, math: 2, charts: 5, recommendations: 4 }, hardest: 'math' });
    const now = new Date();
    await db.insert(drillSets).values({
      id: randomUUID(), studentId: id, drillId: 'QN-3', level: 2, stage: 'recognize', tier: 1, size: 5, source: 'specific', status: 'completed',
      startedAt: new Date(now.getTime() - 60_000), completedAt: now, itemPlan: [], taxonomyVersion: 'v1.1', focusSkill: 'QN.arithmetic',
    } as never);
    const sessionId = randomUUID();
    await db.insert(sessions).values({ id: sessionId, userId: id, caseId: 'prof-001', status: 'completed', phase: 'WRAP', startedAt: new Date(now.getTime() - 30 * 60_000), completedAt: now, flagsJsonb: {} } as never);
    await logEvent('llm_usage', { component: 'judge', model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 500 }, { sessionId, userId: id });
    await logEvent('page_view', { path: '/drills' }, { userId: id });
    await logEvent('report_viewed', {}, { sessionId, userId: id });
    await logEvent('case_limit_hit', { reason: 'daily', limit: 2 }, { userId: id });

    const d = await buildWeeklyDashboard({ orgId: 'smoke-test', from: new Date(now.getTime() - 14 * 86_400_000), to: new Date(now.getTime() + 60_000) }, now);
    const week = d.weeks[d.weeks.length - 1];
    const funnel = Object.fromEntries(d.funnel.map(f => [f.step, f.n]));
    check(funnel['Signed up'] >= 1 && funnel['Chose a starting point'] >= 1 && funnel['First drill set'] >= 1 && funnel['First full case'] >= 1 && funnel['Read the report'] >= 1,
      `funnel counts the student (${JSON.stringify(funnel)})`);
    check((d.traffic.find(t => t.week === week)?.views ?? 0) >= 1, 'the page view is counted');
    check((d.limits.find(l => l.week === week)?.daily.n ?? 0) >= 1, 'the daily-limit hit is counted');
    check((d.reliability.find(r => r.week === week)?.cases.n ?? 0) >= 1, 'the finished case is counted');
    check((d.cost.find(c => c.week === week)?.casesTotal ?? 0) > 0, 'the case\'s AI cost is counted');
    console.log(`week ${week}: funnel ${JSON.stringify(funnel)}; views ${d.traffic.find(t => t.week === week)?.views}; cost ${JSON.stringify(d.cost.find(c => c.week === week))}`);
  } finally {
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, id));
    console.log(`cleanup: ${JSON.stringify(await deleteAccount(id))}`);
  }
  if (failures.length) { console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`); process.exit(1); }
  console.log('\nall checks passed');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
