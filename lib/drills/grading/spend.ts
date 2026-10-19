// The cost controls' queries (limits.ts has the rules): the AI-graded
// answers a student's sets asked for, and today's grading spend from the
// per-request ledger.
import 'server-only';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillGradingSpend, drillSets } from '@/db/schema';
import { aiAnswersInPlan, type ItemRef } from '../sets/plan';
import { breakerState, dayStart, monthStart, spendDayStart } from './limits';

// The AI-graded answers the student's sets asked for (finished or not) since
// local midnight and since the 1st of the month, in their time zone.
export async function aiAnswersUsed(studentId: string, drillIds: string[], tz: string | null | undefined, now = new Date()): Promise<{ today: number; month: number }> {
  if (drillIds.length === 0) return { today: 0, month: 0 };
  const day = dayStart(now, tz), month = monthStart(now, tz);
  const rows = await db.select({ plan: drillSets.itemPlan, startedAt: drillSets.startedAt }).from(drillSets)
    .where(and(eq(drillSets.studentId, studentId), inArray(drillSets.drillId, drillIds), gte(drillSets.startedAt, month)));
  let today = 0, total = 0;
  for (const r of rows) {
    const n = aiAnswersInPlan(r.plan as ItemRef[]);
    total += n;
    if (r.startedAt >= day) today += n;
  }
  return { today, month: total };
}

// Today's grading spend (US Eastern day), from the per-request ledger, and
// whether a spend-limit or billing error came back today.
export async function spendToday(now = new Date()): Promise<{ cost_usd: number; billing_error: boolean }> {
  const [row] = await db.select({
    cost: sql<number>`coalesce(sum(${drillGradingSpend.costUsd}), 0)::float8`,
    billing: sql<boolean>`coalesce(bool_or(${drillGradingSpend.outcome} = 'billing'), false)`,
  }).from(drillGradingSpend).where(gte(drillGradingSpend.createdAt, spendDayStart(now)));
  return { cost_usd: Number(row?.cost ?? 0), billing_error: Boolean(row?.billing) };
}

export const gradingBreaker = async (now = new Date()) => breakerState(await spendToday(now), now);
