// Is shadow mode working? (Matt, 15 Nov.) Read-only: the case → drills runs
// recorded so far — how many, by mode and status, the latest, failures with
// their reasons, cost, and how many Matt has labeled — next to the cases graded
// in the same period that have no run (each one is a case shadow mode missed).
// Free: no model calls, no writes. Prints no student ids or text.
//
//   npx tsx --conditions=react-server --env-file=../../../.env.local scripts/case-tagging/shadow-status.ts [--days 14]
import { and, gte, inArray, notInArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResultRuns, scores, sessions } from '@/db/schema';
import { HOME_DEMO_CASE_IDS } from '@/lib/cases/listed';

const DAYS = Number(process.argv.includes('--days') ? process.argv[process.argv.indexOf('--days') + 1] : '14');

async function main() {
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const runs = await db.select().from(caseResultRuns).where(gte(caseResultRuns.createdAt, since));
  console.log(`case → drills runs in the last ${DAYS} days: ${runs.length}`);
  const by = new Map<string, number>();
  for (const r of runs) by.set(`${r.mode}/${r.status}`, (by.get(`${r.mode}/${r.status}`) ?? 0) + 1);
  for (const [k, n] of by) console.log(`  ${k}: ${n}`);
  const latest = runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (latest) console.log(`latest: ${latest.createdAt.toISOString()} (${latest.caseId}, ${latest.status})`);
  for (const r of runs.filter(x => x.status === 'failed')) console.log(`  failed ${r.createdAt.toISOString().slice(0, 16)} ${r.caseId}: ${r.error}`);
  const cost = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  console.log(`tagging cost: $${cost.toFixed(3)}${runs.length ? ` ($${(cost / runs.length).toFixed(3)} a case)` : ''}`);
  const labeled = runs.filter(r => {
    const judge = (r.points as { judge?: { id: string }[] }).judge ?? [];
    const labels = r.labels as Record<string, unknown>;
    return judge.length > 0 && judge.every(p => p.id in labels);
  }).length;
  console.log(`reports read (every point labeled): ${labeled} of 20`);

  // Scored in the same period with no run: shadow mode missed them (switch off then, a failure before the record,
  // or the function stopped before the after-response step finished).
  const scored = await db.select({ sessionId: scores.sessionId }).from(scores).where(gte(scores.createdAt, since));
  const ids = scored.map(s => s.sessionId);
  const missed = ids.length ? await db.select({ id: sessions.id }).from(sessions).where(and(
    inArray(sessions.id, ids), notInArray(sessions.caseId, [...HOME_DEMO_CASE_IDS]),
    runs.length ? notInArray(sessions.id, runs.map(r => r.sessionId)) : undefined,
  )) : [];
  console.log(`graded in the same period with no run (demo excluded): ${missed.length}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
