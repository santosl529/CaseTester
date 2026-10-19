// Before a smoke deletes its test students' sets (which takes their spend
// rows with them): what the run's grading requests cost, from the spend
// ledger (drill_grading_spend), by model. A stub grader's requests are
// recorded too; `stub` says so, since nothing was sent.
import { inArray, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillGradingSpend, drillSets } from '@/db/schema';

export async function printSmokeSpend(studentIds: string[], opts: { stub?: boolean } = {}): Promise<void> {
  if (studentIds.length === 0) return;
  const rows = await db.select({ model: drillGradingSpend.modelId, outcome: drillGradingSpend.outcome, cost: drillGradingSpend.costUsd })
    .from(drillGradingSpend).innerJoin(drillSets, eq(drillSets.id, drillGradingSpend.setId))
    .where(inArray(drillSets.studentId, studentIds));
  const total = rows.reduce((n, r) => n + r.cost, 0);
  const byModel = new Map<string, { n: number; cost: number }>();
  for (const r of rows) {
    const m = byModel.get(r.model) ?? { n: 0, cost: 0 };
    byModel.set(r.model, { n: m.n + 1, cost: m.cost + r.cost });
  }
  const failed = rows.filter(r => r.outcome !== 'ok').length;
  const models = [...byModel].map(([m, v]) => `${m} ${v.n} ($${v.cost.toFixed(4)})`).join(', ');
  // A stub's rows carry whatever usage the stub reports, so they aren't real spend.
  console.log(`grading spend: $${total.toFixed(4)} for ${rows.length} requests${failed ? ` (${failed} not ok)` : ''}${models ? `: ${models}` : ''}`
    + (opts.stub ? ' (stub grader: nothing sent, so not real spend)' : ''));
}
