// Blind review sheets for a head to head (batch 20, 12 Oct; lib/eval/blind-review.ts).
// Collects every done run of each arm's batch (its manifest) and the
// default-candidate runs whose turn file names that batch (live-run
// --batch-id=<arm>), shuffles them under codes R01…, and writes one sheet per
// run, a grading sheet, and the key apart. Free — no model calls.
//
//   npx tsx scripts/blind-review.ts --arms=batch-20-haiku,batch-20-sonnet [--seed=<s>] [--out=<dir>] [--force]
//
// Grade the sheets and grading.csv first; open KEY.json only afterwards.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { readTurnFile } from '@/lib/eval/turn-file';
import { buildBlindReview, type BlindRun } from '@/lib/eval/blind-review';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const RUNS = 'Case Interview Runs/test runs';
const DEFAULT_DIR = 'Case Interview Runs/default-candidate';
const arms = (arg('arms') ?? '').split(',').filter(Boolean);
if (arms.length === 0) throw new Error('--arms=<batch>,<batch> is required');
const out = arg('out') ?? path.join(RUNS, `${arms[0].replace(/-[a-z0-9]+$/, '')}-blind`);
const seed = arg('seed') ?? randomBytes(8).toString('hex');
if (existsSync(path.join(out, 'KEY.json')) && !process.argv.includes('--force')) throw new Error(`${out}/KEY.json exists — the sheets were already shuffled (pass --force to reshuffle)`);

function openingOf(dir: string, sessionFile: string): string {
  const json = readdirSync(dir).find(f => f.endsWith('.json') && f.startsWith(sessionFile));
  if (!json) return '';
  const run = JSON.parse(readFileSync(path.join(dir, json), 'utf8')) as { turns: { turnIndex: number; role: string; text: string }[] };
  return run.turns.find(t => t.turnIndex === 0 && t.role === 'interviewer')?.text ?? '';
}

const runs: BlindRun[] = [];
for (const arm of arms) {
  const manifest = JSON.parse(readFileSync(path.join(RUNS, arm, 'manifest.json'), 'utf8')) as { models: { interviewerConfig?: string }; runs: { status: string; runDir: string | null }[] };
  const config = manifest.models.interviewerConfig ?? arm;
  for (const r of manifest.runs.filter(x => x.status === 'done' && x.runDir)) {
    const tf = readdirSync(r.runDir!).find(f => f.endsWith('.turns.jsonl.gz'));
    if (!tf) continue;
    const { header, turns } = readTurnFile(path.join(r.runDir!, tf));
    runs.push({ arm: config, persona: header.persona?.name ?? 'Default candidate', source: r.runDir!, opening: openingOf(r.runDir!, tf.replace('.turns.jsonl.gz', '')), turns });
  }
  for (const tf of existsSync(DEFAULT_DIR) ? readdirSync(DEFAULT_DIR).filter(f => f.endsWith('.turns.jsonl.gz')) : []) {
    const { header, turns } = readTurnFile(path.join(DEFAULT_DIR, tf));
    if (header.batch !== arm) continue;
    runs.push({ arm: header.interviewerConfig ?? config, persona: 'Default candidate', source: path.join(DEFAULT_DIR, tf), opening: openingOf(DEFAULT_DIR, tf.replace('.turns.jsonl.gz', '')), turns });
  }
}

const review = buildBlindReview(runs, seed);
mkdirSync(out, { recursive: true });
for (const s of review.sheets) writeFileSync(path.join(out, `${s.code}.md`), s.markdown);
writeFileSync(path.join(out, 'grading.csv'), review.gradingCsv);
writeFileSync(path.join(out, 'KEY.json'), JSON.stringify({ seed, arms, key: review.key }, null, 2));
const perArm = runs.reduce<Record<string, number>>((m, r) => ({ ...m, [r.arm]: (m[r.arm] ?? 0) + 1 }), {});
console.log(`${review.sheets.length} sheets → ${out} (${Object.values(perArm).join(' + ')} by arm); KEY.json written apart — don't open it before grading.`);
