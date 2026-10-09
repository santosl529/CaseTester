// scripts/batch-scorecard.ts
// Scorecard for batch 18 (or any run folders): scorecard.json/.csv/.md in
// Case Interview Runs/test runs/batch-18/. Free — reads files only.
//
//   npx tsx scripts/batch-scorecard.ts [--waves=batch-18-oct-09-runs-1-10,...]   (default: every wave in the manifest)
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { scorecardRow, DIMENSIONS, type RunRecord, type ScorecardRow } from '@/lib/eval/scorecard';
import { readTurnFile } from '@/lib/eval/turn-file';
import { loadManifest } from '@/lib/eval/batch-manifest';
import { runIdOf, TEST_RUNS_DIR } from '@/lib/eval/wave-commands';

const RUNS = TEST_RUNS_DIR;
const OUT = path.join(RUNS, 'batch-18');
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];

function runDirs(): string[] {
  const waves = arg('waves')?.split(',') ?? [...new Set((loadManifest(OUT)?.runs ?? []).map(r => r.wave))];
  return waves.flatMap(w => existsSync(path.join(RUNS, w)) ? readdirSync(path.join(RUNS, w)).map(d => path.join(RUNS, w, d)) : []);
}

const rows: ScorecardRow[] = [];
for (const dir of runDirs()) {
  const files = readdirSync(dir);
  const json = files.find(f => f.endsWith('.json'));
  if (!json) { console.warn(`[scorecard] ${dir}: no run JSON — skipped`); continue; }
  const tf = files.find(f => f.endsWith('.turns.jsonl.gz'));
  rows.push(scorecardRow({ runId: runIdOf(dir, RUNS), run: JSON.parse(readFileSync(path.join(dir, json), 'utf8')) as RunRecord, turnFile: tf ? readTurnFile(path.join(dir, tf)) : null }));
}
mkdirSync(OUT, { recursive: true });
rows.sort((a, b) => (a.runNumber ?? 0) - (b.runNumber ?? 0));
writeFileSync(path.join(OUT, 'scorecard.json'), JSON.stringify(rows, null, 2));
const cols = ['runNumber', 'personaId', 'personaName', 'version', 'completion', 'stuck', 'modelTurns', 'firstRelevantMedianMs', 'firstRelevantP90Ms', 'regenerations', 'vetoTurns', 'slowTurns', 'unpricedUsageCalls', 'codeFlags', 'repeatedAsks', 'explicitAsks', 'appCostUsd', 'simulatorCostUsd', ...DIMENSIONS];
const cell = (r: ScorecardRow, c: string): string => {
  const v = c in r ? (r as Record<string, unknown>)[c] : c in r.performance ? (r.performance as Record<string, unknown>)[c]
    : c === 'codeFlags' ? r.codeFlags.map(f => f.kind).join(' ') : c === 'repeatedAsks' ? r.effort.repeatedAsks
    : c === 'explicitAsks' ? r.opportunities.explicitAsks : (r.ratings as Record<string, unknown>)[c];
  return JSON.stringify(v ?? '');
};
writeFileSync(path.join(OUT, 'scorecard.csv'), [cols.join(','), ...rows.map(r => cols.map(c => cell(r, c)).join(','))].join('\n') + '\n');
const ended = rows.filter(r => r.completion === 'ended').length;
const qaTotals = rows.reduce<Record<string, number>>((m, r) => { for (const [k, v] of Object.entries(r.scoringQa ?? {})) m[k] = (m[k] ?? 0) + v; return m; }, {});
writeFileSync(path.join(OUT, 'scorecard.md'), [
  `# Batch 18 scorecard (auto columns)`, '',
  `Scoring-QA totals across ${rows.filter(r => r.scoringQa).length} scored runs: ${Object.entries(qaTotals).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`, '',
  `Runs with unpriced usage: ${rows.filter(r => r.performance.unpricedUsageCalls > 0).length} (${rows.reduce((n, r) => n + r.performance.unpricedUsageCalls, 0)} calls; their cost is missing from app cost)`, '',
  `${rows.length} runs · ended ${ended} · technical failures ${rows.filter(r => r.completion === 'technical_failure').length} · stuck ${rows.filter(r => r.stuck).length} · with code flags ${rows.filter(r => r.codeFlags.length).length}`, '',
  '| # | persona | completion | stuck | flags | first relevant p50/p90 | cost app/sim |', '|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.runNumber ?? ''} | ${r.personaId ?? ''} ${r.personaName ?? r.runId} | ${r.completion} | ${r.stuck ?? '-'} | ${r.codeFlags.map(f => f.kind).join(', ') || '-'} | ${r.performance.firstRelevantMedianMs ?? '-'}/${r.performance.firstRelevantP90Ms ?? '-'} | $${r.performance.appCostUsd.toFixed(2)}/${r.performance.simulatorCostUsd === null ? '-' : '$' + r.performance.simulatorCostUsd.toFixed(2)} |`),
].join('\n') + '\n');
console.log(`[scorecard] ${rows.length} rows → ${OUT}/scorecard.{json,csv,md}`);
