// One wave of batch 18 (spec 2026-10-09 §2.2): the personas given, in
// parallel, each through scripts/live-run.ts, under one shared budget.
//
//   npx tsx --env-file=.env.local scripts/persona-batch.ts --personas=1,2,3 --cap=65 [--pace=fast] [--new-version=v2] [--rerun] [--dry]
//
// Costs real money (≈ $0.77 per persona scored). --dry prints the plan only.
// The env file matters here too: the models frozen in the manifest are read
// from it (INTERVIEWER_PROVIDER), not only by the live-run children.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { planWave, markWaveResults, loadManifest, saveManifest, fileHash, type PersonaEntry } from '@/lib/eval/batch-manifest';
import { liveRunArgs, findRunDir } from '@/lib/eval/wave-commands';
import { gitInfo, codeDirty, codeChangedSince } from '@/lib/eval/git-info';
import { INTERVIEWER_MODEL_ID, SCORING_MODEL_ID } from '@/lib/models';
import { PERSONAS } from './personas';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const RUNS = 'Case Interview Runs/test runs';
const BATCH_DIR = path.join(RUNS, 'batch-18');
const PER_PERSONA_USD = 0.77;

function spawnPersonaRun(e: PersonaEntry, pace: 'human' | 'fast', env: NodeJS.ProcessEnv): { child: ChildProcess; promise: Promise<void> } {
  const child = spawn('npx', ['tsx', '--env-file=.env.local', ...liveRunArgs(e, { pace })], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    child,
    promise: new Promise<void>(resolve => {
      let resolved = false;
      child.stdout.on('data', d => process.stdout.write(`[#${e.runNumber} p${e.personaId}] ${d}`));
      child.stderr.on('data', d => process.stderr.write(`[#${e.runNumber} p${e.personaId}] ${d}`));
      child.on('error', err => {
        console.error(`[wave] #${e.runNumber} persona ${e.personaId} failed to start: ${err.message}`);
        if (!resolved) { resolved = true; resolve(); }
      });
      child.on('close', code => {
        if (!resolved) { resolved = true; console.log(`[wave] #${e.runNumber} persona ${e.personaId} exited ${code}`); resolve(); }
      });
    }),
  };
}

async function main() {
  const personaIds = (arg('personas') ?? '').split(',').filter(Boolean).map(Number);
  const cap = Number(arg('cap'));
  if (!(cap > 0)) throw new Error('--cap=<USD> is required (the batch budget, shared across waves)');
  const pace = arg('pace') === 'fast' ? 'fast' : 'human';
  const git = gitInfo();
  const existing = loadManifest(BATCH_DIR);
  const { manifest, wave, entries } = planWave(existing, {
    personaIds, knownIds: PERSONAS.map(x => x.id), commit: git.commit,
    codeDirty: codeDirty(), codeChanged: existing ? codeChangedSince(existing.commit) : false,
    newVersion: arg('new-version'), rerun: process.argv.includes('--rerun'),
    hashes: { bands: fileHash('evals/persona-bands.json'), severity: fileHash('evals/severity.md') },
    date: new Date(), models: { interviewer: process.env.INTERVIEWER_PROVIDER ?? INTERVIEWER_MODEL_ID, scoring: SCORING_MODEL_ID },
  });
  console.log(`[wave] ${wave}: ${entries.map(e => `#${e.runNumber}=persona ${e.personaId}${e.rerun ? ` (rerun ${e.rerun})` : ''}`).join(', ')} · version ${manifest.version} · commit ${git.commit.slice(0, 7)} · pace ${pace}`);
  console.log(`[wave] estimate ≈ $${(entries.length * PER_PERSONA_USD).toFixed(2)} · batch cap $${cap} (ledger ${BATCH_DIR}/budget-ledger.jsonl)`);
  if (process.argv.includes('--dry')) return;
  // Presence only — the value is never printed.
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set — run with npx tsx --env-file=.env.local scripts/persona-batch.ts …');
  saveManifest(BATCH_DIR, manifest);

  const env = { ...process.env, LLM_BUDGET_USD: String(cap), LLM_BUDGET_FILE: path.resolve(BATCH_DIR, 'budget-ledger.jsonl') };
  const spawned = entries.map(e => spawnPersonaRun(e, pace, env));
  const children = spawned.map(s => s.child);
  let sigintCount = 0;

  const cleanup = () => {
    sigintCount++;
    if (sigintCount > 1) process.exit(130);
    console.log(`[wave] interrupted — stopping ${children.length} runs`);
    children.forEach(c => c.kill('SIGINT'));
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await Promise.all(spawned.map(s => s.promise));

  const waveDir = path.join(RUNS, wave);
  const located = entries.map(e => ({ ...e, runDir: findRunDir(waveDir, e.personaId) }));
  const updated = markWaveResults(loadManifest(BATCH_DIR)!, located,
    dir => existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.json')));
  saveManifest(BATCH_DIR, updated);
  const results = updated.runs.filter(r => r.wave === wave);
  console.log(`[wave] done: ${results.filter(r => r.status === 'done').length} ok, ${results.filter(r => r.status === 'failed').length} failed`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
