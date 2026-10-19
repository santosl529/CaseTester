// Imported first by every drills smoke script: mirrors what the run prints,
// and when the run fails (exit code not 0), writes all of it to
// logs/drills-smoke/<script>-<time>.log with the time and git commit, so a
// flaky failure can be studied after the fact.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const name = path.basename(process.argv[1] ?? 'smoke', '.ts');
const started = new Date();
const lines: string[] = [];
for (const level of ['log', 'error', 'warn'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    lines.push(`[${new Date().toISOString()}] ${level === 'log' ? '' : `${level}: `}${args.map(a => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`);
    original(...args);
  };
}
process.on('exit', code => {
  if (code === 0) return;
  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }
  const dir = path.join(process.cwd(), 'logs', 'drills-smoke');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${started.toISOString().replace(/[:.]/g, '-')}.log`);
  fs.writeFileSync(file, [`${name} exited ${code}`, `started ${started.toISOString()}, ended ${new Date().toISOString()}, commit ${commit}`, `DRILLS_PREVIEW_DRAFTS=${process.env.DRILLS_PREVIEW_DRAFTS ?? ''}`, '', ...lines, ''].join('\n'));
  process.stderr.write(`\nsmoke log saved: ${path.relative(process.cwd(), file)}\n`);
});
