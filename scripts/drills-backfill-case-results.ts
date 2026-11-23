// One-time backfill (Matt, 15 Nov, proposal D8; run only with Lorenzo's go):
// copy the ratings of cases graded before case results reached drills into
// case_results, so Your progress's trends and readiness include them. Ratings
// only: no findings, no skills observed, no skill-state change, no
// prescription (`backfilled`). Reads the case product's sessions and scores;
// writes only case_results. The 7-minute demo and sessions already in
// case_results are skipped; so are the test accounts (100+ completed
// sessions) unless --include-test-accounts. Dry run by default: counts only.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/drills-backfill-case-results.ts [--include-test-accounts] [--apply]
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults, scores, sessions } from '@/db/schema';
import { loadCases } from '@/lib/cases/loader';
import { HOME_DEMO_CASE_IDS } from '@/lib/cases/listed';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { DIFFICULTY_TIER } from '@/lib/drills/program/next-case';

const apply = process.argv.includes('--apply');
const includeTest = process.argv.includes('--include-test-accounts');
const TEST_ACCOUNT_SESSIONS = 100;

const RATING_COLUMNS = {
  structure: scores.structureRating, quantitative: scores.quantitativeRating, dataExhibit: scores.dataExhibitRating,
  judgment: scores.judgmentRating, creativity: scores.creativityRating, synthesis: scores.synthesisRating,
  communication: scores.communicationRating, pushback: scores.pushbackRating,
} as const;

async function main() {
  const testAccounts = includeTest ? [] : (await db.select({ u: sessions.userId }).from(sessions)
    .where(eq(sessions.status, 'completed')).groupBy(sessions.userId).having(sql`count(*) >= ${TEST_ACCOUNT_SESSIONS}`)).map(r => r.u);
  const cases = new Map(loadCases().map(c => [c.id, c]));
  const done = (await db.select({ id: sessions.id, userId: sessions.userId, caseId: sessions.caseId, completedAt: sessions.completedAt, flags: sessions.flagsJsonb })
    .from(sessions).where(eq(sessions.status, 'completed')))
    .filter(s => s.completedAt && !HOME_DEMO_CASE_IDS.includes(s.caseId) && cases.has(s.caseId) && !testAccounts.includes(s.userId));
  const have = new Set((await db.select({ id: caseResults.caseAttemptId }).from(caseResults)).map(r => r.id));
  const todo = done.filter(s => !have.has(s.id));
  const rated = todo.length ? await db.select({ sessionId: scores.sessionId, createdAt: scores.createdAt, ...RATING_COLUMNS }).from(scores)
    .where(inArray(scores.sessionId, todo.map(s => s.id))).orderBy(desc(scores.createdAt)) : [];

  const rows = todo.flatMap(s => {
    const score = rated.find(r => r.sessionId === s.id);   // the latest score of the session
    if (!score) return [];
    const c = cases.get(s.caseId)!;
    const rubric = Object.fromEntries(Object.keys(RATING_COLUMNS).flatMap(k => { const v = score[k as keyof typeof RATING_COLUMNS]; return v ? [[k, v]] : []; }));
    // A retake: the same student finished the same case before.
    const retake = done.some(o => o.userId === s.userId && o.caseId === s.caseId && o.completedAt! < s.completedAt!);
    return [{
      caseAttemptId: s.id, studentId: s.userId, caseId: s.caseId, caseType: c.caseType ?? null, difficultyTier: DIFFICULTY_TIER[c.difficulty],
      rubricScores: rubric, skillsObserved: [] as string[], findings: [], taxonomyVersion: DRILLS_CONFIG.taxonomy.version,
      completedAt: s.completedAt!, retake, partial: Boolean((s.flags as { partial?: unknown } | null)?.partial), backfilled: true,
    }];
  });
  console.log(`completed cases${includeTest ? '' : ` outside ${testAccounts.length} test accounts`} (demo excluded): ${done.length}; already in case_results: ${done.length - todo.length}`);
  console.log(`to backfill: ${rows.length} cases for ${new Set(rows.map(r => r.studentId)).size} students (${rows.filter(r => r.retake).length} retakes, ${rows.filter(r => r.partial).length} ended early); ${todo.length - rows.length} have no score`);
  const byTier = [1, 2, 3].map(t => `${['Easy', 'Medium', 'Hard'][t - 1]} ${rows.filter(r => r.difficultyTier === t).length}`).join(', ');
  console.log(`by level: ${byTier}`);
  if (!apply) { console.log('dry run: nothing written (--apply to write, with Lorenzo\'s go)'); process.exit(0); }
  await db.transaction(async tx => {
    for (const r of rows) await tx.insert(caseResults).values(r).onConflictDoNothing();
  });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(caseResults).where(and(eq(caseResults.backfilled, true)));
  console.log(`backfilled; case_results now holds ${n} backfilled rows`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
