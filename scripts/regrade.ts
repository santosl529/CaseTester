// Dry-run re-grade of stored sessions: runs the full scoring pipeline
// (computeScore) WITHOUT writing a score, and prints the ratings next to the
// stored ones. Used to check rating changes (round-3 fix 3: the strong gate)
// and grading consistency (--repeat=N grades each session N times).
//
//   npx tsx --env-file=.env.local scripts/regrade.ts <batch-folder> [--repeat=3] [--only=<id|persona>,…] [--out=<dir>]
//
// --only= grades just the named runs of the folder (a run id or a persona
// folder; lib/eval/regrade-select.ts). --out= writes each grade's rubric,
// report text and QA counts as JSON there, so the new report can be read and
// diffed against the stored one.
//
// Costs real money (judge + verifier + reconciliation, ~$0.19 per grade on
// batch-3 prices). Writes only the idempotent data-request backfill and
// llm_usage analytics events.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { computeScore } from '@/lib/scoring/score-session';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';
import { requireRunBudget } from '@/lib/llm-budget';
import { parseOnly, selectedByOnly, gradability } from '@/lib/eval/regrade-select';

const batch = process.argv[2];
const repeat = Number(process.argv.find(a => a.startsWith('--repeat='))?.split('=')[1] ?? 1);
const only = parseOnly(process.argv);
const outDir = process.argv.find(a => a.startsWith('--out='))?.slice('--out='.length);
if (!batch) throw new Error('usage: scripts/regrade.ts <batch-folder> [--repeat=N] [--only=<id|persona>,…] [--out=<dir>]');

const short = (r: string | null | undefined, na?: boolean) => (na ? 'NA' : r === 'strong' ? 'S' : r === 'meets_bar' ? 'M' : r === 'needs_work' ? 'N' : '-');
const line = (rubric: RubricScores) =>
  `${short(rubric.overallRating)} | ${RUBRIC_DIMENSION_KEYS.map(k => short(rubric[k]?.rating, rubric[k]?.notAssessed)).join(' ')}`;

async function main() {
  const budget = requireRunBudget('regrade');
  process.on('exit', () => console.log(`[budget] ${budget.summary()}`));
  const root = path.join('Case Interview Runs/test runs', batch);
  console.log(`overall | ${RUBRIC_DIMENSION_KEYS.join(' ')}\n`);
  for (const dir of readdirSync(root).sort()) {
    const file = readdirSync(path.join(root, dir)).find(f => f.endsWith('.json'));
    if (!file) continue;
    if (!selectedByOnly(only, dir, file)) continue;
    const run = JSON.parse(readFileSync(path.join(root, dir, file), 'utf8'));
    const { grade, note } = gradability(run, file);
    if (!grade) { console.log(`${dir}: skipped (${note})`); continue; }
    console.log(`${dir}${note ? ` — ${note}` : ''}\n  stored  ${run.score ? line(run.score.rubricJsonb) : '(none)'}`);
    for (let i = 0; i < repeat; i++) {
      const { rubric, report, qa, strongGate } = await computeScore({ sessionId: run.session.id, userId: run.session.userId });
      console.log(`  regrade ${line(rubric)}${strongGate.downgraded.length ? `  (gate lowered: ${strongGate.downgraded.map(d => d.dimension).join(', ')})` : ''}`);
      if (outDir !== undefined) {
        mkdirSync(outDir, { recursive: true });
        const name = `${batch}--${dir}--${file.replace(/\.json$/, '')}${repeat > 1 ? `--${i + 1}` : ''}.json`;
        writeFileSync(path.join(outDir, name), JSON.stringify({ sessionId: run.session.id, stored: run.score?.rubricJsonb ?? null, rubric, report, qa }, null, 1));
      }
    }
  }
  process.exit(0);
}

main();
