// scripts/check-cost-report.ts
// The data-request check's cost and added latency per session and per batch (round 5c
// Task 65). Free — reads run JSONs only. Round 6 Task 76 (c): a second table, row 11's classifier call (the message
// classifier's usage rows tagged `cue: 'want_is'`) — calls, cost, latency, turns waited and the wait, and the share of
// candidate turns (Lorenzo, 21 Oct, round 6 rulings, 2: ~2% of turns at most, 1.5 s at most where it fires).
//
//   npx tsx scripts/check-cost-report.ts <folder> [more folders...] [--out=<file>]
//
// A folder is a wave folder (persona subfolders) or any folder holding them; run JSONs
// (live-run-*.json) are found up to three levels down. A batch folder with a
// manifest.json (batch-36-larkspur) reads its waves from the manifest. Prints the
// table; writes it to --out (default <first folder>/check-cost.md; pass --out=- to only print).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { checkCostOf, checkCostMarkdown, findRunJsons, type CheckCostRun } from '@/lib/eval/check-cost';

function foldersOf(dir: string): string[] {
  const man = path.join(dir, 'manifest.json');
  if (!existsSync(man)) return [dir];
  const waves = [...new Set((JSON.parse(readFileSync(man, 'utf8')).runs ?? []).map((r: { wave: string }) => r.wave))] as string[];
  return waves.map(w => path.join(path.dirname(path.resolve(dir)), w)).filter(existsSync);
}

const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='))?.slice(6);
const dirs = args.filter(a => !a.startsWith('--'));
if (dirs.length === 0) { console.error('usage: check-cost-report.ts <folder> [...] [--out=<file>|-]'); process.exit(1); }

const rows = dirs.flatMap(foldersOf).flatMap(f => findRunJsons(f)).map(file => {
  const run = JSON.parse(readFileSync(file, 'utf8')) as CheckCostRun;
  return { id: path.relative(path.dirname(path.resolve(dirs[0])), path.dirname(file)), summary: checkCostOf(run) };
});
const md = checkCostMarkdown(rows);
console.log(md);
const out = outArg ?? path.join(dirs[0], 'check-cost.md');
if (out !== '-') { writeFileSync(out, md); console.log(`[check-cost] wrote ${out}`); }
