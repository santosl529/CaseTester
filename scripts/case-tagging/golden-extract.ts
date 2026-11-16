// Golden set for the case tagging step (case results → drills, step 1; Matt,
// 15 Nov): pulls the "needs work" points and the top improvement from stored
// reports of the test accounts (persona students, no real student text) and
// samples them across the 8 rubric dimensions. Read-only. The test accounts
// are SCRIPT_USER_ID when set; otherwise every account with at least
// --min-sessions completed sessions (100 by default): students are held to 8
// cases a month, so only a limit-exempt test account gets there. Prints counts,
// never account ids or emails.
// Writes the unlabelled pool; labels are added by hand from
// docs/case-tagging-rules.md.
//
//   npx tsx --conditions=react-server --env-file=../../../.env.local scripts/case-tagging/golden-extract.ts [--per-dim 30] [--top-fix 30] [--out case-tagging/golden/pool.json]
import fs from 'fs';
import path from 'path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { scores, sessions } from '@/db/schema';
import { scriptOwnerId } from '@/lib/script-owner';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from '@/lib/scoring/rubric';
import { createRng } from '@/lib/drills/rng';

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const PER_DIM = Number(arg('--per-dim', '30'));
const TOP_FIX = Number(arg('--top-fix', '30'));
const OUT = arg('--out', 'case-tagging/golden/pool.json');
const MIN_SESSIONS = Number(arg('--min-sessions', '100'));

export type PoolPoint = {
  id: string;                       // <session>:<dimension>:<index> or <session>:topFix
  session_id: string;
  case_id: string;
  kind: 'needs_work' | 'top_fix';
  dimension: RubricDimensionKey | null;   // null for the top improvement
  rating: string | null;            // the dimension's rating
  point: string;
  quotes: string[];
};

type Item = { point: string; quotes: string[] };
type Stored = Record<string, { rating?: string; notAssessed?: boolean; coverageCaveat?: string; needsWork?: Item[] }> & { topFix?: string };

async function main() {
  const owners = process.env.SCRIPT_USER_ID ? [scriptOwnerId()] : (await db.select({ userId: sessions.userId }).from(sessions)
    .where(eq(sessions.status, 'completed')).groupBy(sessions.userId).having(sql`count(*) >= ${MIN_SESSIONS}`)).map(r => r.userId);
  console.log(`test accounts: ${owners.length}`);
  const done = owners.length ? await db.select({ id: sessions.id, caseId: sessions.caseId }).from(sessions)
    .where(and(inArray(sessions.userId, owners), eq(sessions.status, 'completed'))) : [];
  const caseOf = new Map(done.map(s => [s.id, s.caseId]));
  const rows = done.length ? await db.select({ sessionId: scores.sessionId, rubric: scores.rubricJsonb, createdAt: scores.createdAt })
    .from(scores).where(inArray(scores.sessionId, done.map(s => s.id))) : [];
  // The latest score per session (a rescore replaces the first).
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.sessionId) || latest.get(r.sessionId)!.createdAt < r.createdAt) latest.set(r.sessionId, r);

  const byDim = new Map<RubricDimensionKey, PoolPoint[]>(RUBRIC_DIMENSION_KEYS.map(k => [k, []]));
  const topFixes: PoolPoint[] = [];
  for (const [sessionId, r] of latest) {
    const rubric = r.rubric as Stored | null;
    if (!rubric) continue;   // legacy rows with no rubric JSON
    const case_id = caseOf.get(sessionId)!;
    for (const k of RUBRIC_DIMENSION_KEYS) {
      const d = rubric[k];
      // The tagging step skips these too: the interviewer's gap, not the candidate's.
      if (!d || d.notAssessed || d.coverageCaveat) continue;
      (d.needsWork ?? []).forEach((it, i) => {
        const quotes = (it.quotes ?? []).filter(q => q.trim());
        if (quotes.length === 0) return;   // no verified quote: no finding at runtime either
        byDim.get(k)!.push({ id: `${sessionId}:${k}:${i}`, session_id: sessionId, case_id, kind: 'needs_work', dimension: k, rating: d.rating ?? null, point: it.point, quotes });
      });
    }
    if (rubric.topFix?.trim()) topFixes.push({ id: `${sessionId}:topFix`, session_id: sessionId, case_id, kind: 'top_fix', dimension: null, rating: null, point: rubric.topFix, quotes: [] });
  }

  // Seeded sample, spread over sessions: shuffle, then take round-robin by session.
  const rng = createRng(20261115);
  const shuffle = <T>(xs: T[]) => rng.shuffle(xs);
  const spread = (xs: PoolPoint[], n: number) => {
    const bySession = new Map<string, PoolPoint[]>();
    for (const p of shuffle(xs)) bySession.set(p.session_id, [...(bySession.get(p.session_id) ?? []), p]);
    const queues = [...bySession.values()];
    const out: PoolPoint[] = [];
    while (out.length < n && queues.some(q => q.length)) for (const q of queues) { const p = q.shift(); if (p && out.length < n) out.push(p); }
    return out;
  };
  const pool = [...RUBRIC_DIMENSION_KEYS.flatMap(k => spread(byDim.get(k)!, PER_DIM)), ...spread(topFixes, TOP_FIX)];

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(pool, null, 2) + '\n');
  console.log(`scored sessions: ${latest.size}; cases: ${[...new Set(done.map(s => s.caseId))].join(', ')}`);
  for (const k of RUBRIC_DIMENSION_KEYS) console.log(`${k}: ${byDim.get(k)!.length} points available, ${pool.filter(p => p.dimension === k).length} sampled`);
  console.log(`topFix: ${topFixes.length} available, ${pool.filter(p => p.kind === 'top_fix').length} sampled`);
  console.log(`wrote ${pool.length} to ${OUT}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
