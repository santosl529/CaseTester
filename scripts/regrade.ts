// Dry-run re-grade of stored sessions: runs the full scoring pipeline
// (computeScore) WITHOUT writing a score, and prints the ratings next to the
// stored ones. Used to check rating changes (round-3 fix 3: the strong gate)
// and grading consistency (--repeat=N grades each session N times).
//
//   npx tsx --env-file=.env.local scripts/regrade.ts <batch-folder> [--repeat=3]
//
// Costs real money (judge + verifier + reconciliation, ~$0.19 per grade on
// batch-3 prices). Writes only the idempotent data-request backfill and
// llm_usage analytics events.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { computeScore } from '@/lib/scoring/score-session';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';

const batch = process.argv[2];
const repeat = Number(process.argv.find(a => a.startsWith('--repeat='))?.split('=')[1] ?? 1);
if (!batch) throw new Error('usage: scripts/regrade.ts <batch-folder> [--repeat=N]');

const short = (r: string | undefined, na?: boolean) => (na ? 'NA' : r === 'strong' ? 'S' : r === 'meets_bar' ? 'M' : r === 'needs_work' ? 'N' : '-');
const line = (rubric: RubricScores) =>
  `${short(rubric.overallRating)} | ${RUBRIC_DIMENSION_KEYS.map(k => short(rubric[k]?.rating, rubric[k]?.notAssessed)).join(' ')}`;

async function main() {
  const root = path.join('Case Interview Runs/test runs', batch);
  console.log(`overall | ${RUBRIC_DIMENSION_KEYS.join(' ')}\n`);
  for (const dir of readdirSync(root).sort()) {
    const file = readdirSync(path.join(root, dir)).find(f => f.endsWith('.json'));
    if (!file) continue;
    const run = JSON.parse(readFileSync(path.join(root, dir, file), 'utf8'));
    if (run.session.status !== 'completed' || !run.score) { console.log(`${dir}: skipped (${run.session.status})`); continue; }
    console.log(`${dir}\n  stored  ${line(run.score.rubricJsonb)}`);
    for (let i = 0; i < repeat; i++) {
      const { rubric, strongGate } = await computeScore({ sessionId: run.session.id, userId: run.session.userId });
      console.log(`  regrade ${line(rubric)}${strongGate.downgraded.length ? `  (gate lowered: ${strongGate.downgraded.map(d => d.dimension).join(', ')})` : ''}`);
    }
  }
  process.exit(0);
}

main();
