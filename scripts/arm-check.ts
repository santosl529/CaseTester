// What each run of an arm's batch actually sent the interviewer (12 Oct,
// batch 20): the model, thinking and effort carried by every request in its
// turn file. The model check (lib/eval/model-guard.ts) compares model ids
// only; batch 20's two Haiku arms differ in effort alone. Free.
//
//   npx tsx scripts/arm-check.ts --batch=batch-20-haikulow

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readTurnFile } from '@/lib/eval/turn-file';

const batch = process.argv.find(a => a.startsWith('--batch='))?.split('=')[1];
if (!batch) throw new Error('--batch=<batch> is required');
const RUNS = 'Case Interview Runs/test runs';
const manifest = JSON.parse(readFileSync(path.join(RUNS, batch, 'manifest.json'), 'utf8')) as { models: Record<string, string>; runs: { status: string; runDir: string | null }[] };
const dirs = manifest.runs.filter(r => r.status === 'done' && r.runDir && existsSync(r.runDir)).map(r => r.runDir!);
const DEFAULT_DIR = 'Case Interview Runs/default-candidate';
const defaults = existsSync(DEFAULT_DIR) ? readdirSync(DEFAULT_DIR).filter(f => f.endsWith('.turns.jsonl.gz')).map(f => path.join(DEFAULT_DIR, f)) : [];
type Body = { model?: string; thinking?: { type?: string }; output_config?: { effort?: string } };
const settings = (file: string) => [...new Set(readTurnFile(file).turns.flatMap(t => t.requests.map(q => {
  const b = q.body as Body;
  return `${b.model ?? '?'} thinking=${b.thinking?.type ?? 'none'} effort=${b.output_config?.effort ?? 'default'}`;
})))];
console.log(`${batch} — declared ${manifest.models.interviewerConfig ?? '?'} (${manifest.models.interviewer})`);
for (const d of dirs) {
  const f = readdirSync(d).find(x => x.endsWith('.turns.jsonl.gz'));
  if (f) console.log(`  ${path.basename(d)}: ${settings(path.join(d, f)).join(' | ')}`);
}
for (const f of defaults) if (readTurnFile(f).header.batch === batch) console.log(`  default candidate ${path.basename(f)}: ${settings(f).join(' | ')}`);
