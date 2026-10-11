// scripts/batch-scorecard.ts
// Scorecard for batch 18 (or any run folders): scorecard.json/.csv/.md in
// Case Interview Runs/test runs/batch-18/. Free — reads files only.
//
//   npx tsx scripts/batch-scorecard.ts [--waves=batch-18-oct-09-runs-1-10,...] [--version=<label>|all]
//
// Default: every wave in the manifest, rows of the manifest's current version
// only (versions are never pooled). Each run folder is joined to its manifest
// entry for its version and rerun index; reruns get their own section.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { scorecardRow, rowsOfVersion, isRerun, DIMENSIONS, type RunRecord, type ScorecardRow } from '@/lib/eval/scorecard';
import { readTurnFile } from '@/lib/eval/turn-file';
import { loadManifest, entryForRunDir } from '@/lib/eval/batch-manifest';
import { runIdOf, TEST_RUNS_DIR } from '@/lib/eval/wave-commands';

const RUNS = TEST_RUNS_DIR;
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
// --batch=<batch-N> (default batch-18).
const OUT = path.join(RUNS, arg('batch') ?? 'batch-18');

const manifest = loadManifest(OUT);
const versionArg = arg('version');
const version = versionArg === 'all' ? null : versionArg ?? manifest?.version ?? null;

function runDirs(): string[] {
  const waves = arg('waves')?.split(',') ?? [...new Set((manifest?.runs ?? []).map(r => r.wave))];
  return waves.flatMap(w => existsSync(path.join(RUNS, w)) ? readdirSync(path.join(RUNS, w)).map(d => path.join(RUNS, w, d)) : []);
}

const all: ScorecardRow[] = [];
for (const dir of runDirs()) {
  const files = readdirSync(dir);
  const json = files.find(f => f.endsWith('.json'));
  if (!json) { console.warn(`[scorecard] ${dir}: no run JSON — skipped`); continue; }
  const tf = files.find(f => f.endsWith('.turns.jsonl.gz'));
  const entry = entryForRunDir(manifest, dir);
  all.push(scorecardRow({ runId: runIdOf(dir, RUNS), run: JSON.parse(readFileSync(path.join(dir, json), 'utf8')) as RunRecord, turnFile: tf ? readTurnFile(path.join(dir, tf)) : null, entry }));
}
const rows = rowsOfVersion(all, version);
if (rows.length < all.length) console.log(`[scorecard] version ${version}: ${all.length - rows.length} rows of other versions left out (--version=<label>|all)`);
mkdirSync(OUT, { recursive: true });
rows.sort((a, b) => (a.runNumber ?? 0) - (b.runNumber ?? 0));
writeFileSync(path.join(OUT, 'scorecard.json'), JSON.stringify(rows, null, 2));
const cols = ['runId', 'runNumber', 'personaId', 'personaName', 'version', 'rerun', 'completion', 'stuck', 'modelTurns', 'firstRelevantMedianMs', 'firstRelevantP90Ms', 'regenerations', 'vetoTurns', 'slowTurns', 'unpricedUsageCalls', 'codeFlags', 'incompleteTurns', 'repeatedAsks', 'explicitAsks', 'calculationTurns', 'appCostUsd', 'simulatorCostUsd', ...DIMENSIONS];
const cell = (r: ScorecardRow, c: string): string => {
  const v = c in r ? (r as Record<string, unknown>)[c] : c in r.performance ? (r.performance as Record<string, unknown>)[c]
    : c === 'codeFlags' ? r.codeFlags.map(f => f.kind).join(' ') : c === 'incompleteTurns' ? r.evidence.incompleteTurns : c === 'repeatedAsks' ? r.effort.repeatedAsks
    : c === 'explicitAsks' ? r.opportunities.explicitAsks : c === 'calculationTurns' ? r.opportunities.calculationTurns.join(' ') : (r.ratings as Record<string, unknown>)[c];
  return JSON.stringify(v ?? '');
};
writeFileSync(path.join(OUT, 'scorecard.csv'), [cols.join(','), ...rows.map(r => cols.map(c => cell(r, c)).join(','))].join('\n') + '\n');
const originals = rows.filter(r => !isRerun(r));
const reruns = rows.filter(isRerun);
const tableRow = (r: ScorecardRow) => `| ${r.runNumber ?? ''}${isRerun(r) ? ` (rerun ${r.rerun})` : ''} | ${r.personaId ?? ''} ${r.personaName ?? r.runId} | ${r.completion} | ${r.stuck ?? '-'} | ${r.codeFlags.map(f => f.kind).join(', ') || '-'} | ${r.performance.firstRelevantMedianMs ?? '-'}/${r.performance.firstRelevantP90Ms ?? '-'} | ${r.opportunities.calculationTurns.join(' ') || '-'} | $${r.performance.appCostUsd.toFixed(2)}/${r.performance.simulatorCostUsd === null ? '-' : '$' + r.performance.simulatorCostUsd.toFixed(2)} |`;
const tableHead = ['| # | persona | completion | stuck | flags | first relevant p50/p90 | calc turns | cost app/sim |', '|---|---|---|---|---|---|---|---|'];
const ended = originals.filter(r => r.completion === 'ended').length;
const qaTotals = originals.reduce<Record<string, number>>((m, r) => { for (const [k, v] of Object.entries(r.scoringQa ?? {})) m[k] = (m[k] ?? 0) + v; return m; }, {});
writeFileSync(path.join(OUT, 'scorecard.md'), [
  `# Batch 18 scorecard (auto columns)${version ? ` — version ${version}` : ''}`, '',
  `Totals and the table below are original runs; reruns are listed separately (${reruns.length}).`, '',
  `Scoring-QA totals across ${originals.filter(r => r.scoringQa).length} scored runs: ${Object.entries(qaTotals).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`, '',
  `Runs with incomplete recorder evidence: ${originals.filter(r => (r.evidence.incompleteTurns ?? 0) > 0).map(r => `${r.runNumber ?? r.runId} (${r.evidence.incompleteTurns} turns)`).join(', ') || 'none'} — their turn records lack some stages; read the transcript for those turns`, '',
  `Runs with unpriced usage: ${originals.filter(r => r.performance.unpricedUsageCalls > 0).length} (${originals.reduce((n, r) => n + r.performance.unpricedUsageCalls, 0)} calls; their cost is missing from app cost)`, '',
  `${originals.length} runs · ended ${ended} · technical failures ${originals.filter(r => r.completion === 'technical_failure').length} · stuck ${originals.filter(r => r.stuck).length} · with code flags ${originals.filter(r => r.codeFlags.length).length}`, '',
  ...tableHead, ...originals.map(tableRow),
  ...(reruns.length ? ['', '## Reruns (not in the totals, the headline or the bands)', '', ...tableHead, ...reruns.map(tableRow)] : []),
].join('\n') + '\n');
console.log(`[scorecard] ${rows.length} rows → ${OUT}/scorecard.{json,csv,md}`);
