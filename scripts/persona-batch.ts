// One wave of batch 18 (spec 2026-10-09 §2.2): the personas given, in
// parallel, each through scripts/live-run.ts, under one shared budget.
//
//   npx tsx --env-file=.env.local scripts/persona-batch.ts --batch=batch-19 --interviewer=haiku55-thinking-off --personas=1,2,3 --cap=65 [--case=entry-001] [--pace=fast] [--new-version=v2] [--rerun] [--no-score] [--score=1,3] [--dry]
//
// Costs real money (≈ $0.77 per persona scored, ≈ $0.30 unscored, plus the
// math checker's calls — lib/eval/wave-commands.ts waveEstimate). --dry prints the plan only.
// --no-score: no run is scored (live-run --no-score; score one later with
// live-run --finish=<sessionId>). --score=<ids>: only these personas are scored.
// --interviewer names the evaluation interviewer (lib/models.ts
// INTERVIEWER_EVAL_CONFIGS) — required (11 Oct: batch 18 ran on the default,
// Sonnet 5.5, when Haiku 5.5 was meant). Each run checks the model the API
// answered from against it; a run answered by another model is failed, and
// the wave exits non-zero. --batch names the batch folder; batch-18 is frozen
// (the Sonnet baseline) and takes no new waves.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { checkCostOf, checkCostMarkdown, checkCostLine, totalCheckCost, findRunJsons } from '@/lib/eval/check-cost';
import { planWave, markWaveResults, loadManifest, saveManifest, fileHash, assertBatchOpen, type PersonaEntry } from '@/lib/eval/batch-manifest';
import { evalInterviewer, type ModelCheck } from '@/lib/eval/model-guard';
import { liveRunArgs, findRunDir, scoresPersona, parseScoreIds, waveEstimate } from '@/lib/eval/wave-commands';
import { liveCheckerConfig } from '@/lib/orchestrator/math-checker-live';
import { gitInfo, codeDirty, codeChangedSince } from '@/lib/eval/git-info';
import { SCORING_MODEL_ID } from '@/lib/models';
import { PERSONAS } from './personas';
import { getCaseById } from '@/lib/cases/loader';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const RUNS = 'Case Interview Runs/test runs';
const BATCH = arg('batch') ?? '';
const BATCH_DIR = path.join(RUNS, BATCH);

// What live-run wrote into the run record: the model check, and the error that stopped a partial run (null: none recorded).
function runRecordOf(runDir: string): { modelCheck?: ModelCheck | null; harnessError?: string } {
  const file = readdirSync(runDir).find(f => f.endsWith('.json'));
  if (!file) return {};
  try {
    return JSON.parse(readFileSync(path.join(runDir, file), 'utf8')) as { modelCheck?: ModelCheck | null; harnessError?: string };
  } catch { return {}; }
}
const modelCheckOf = (runDir: string) => runRecordOf(runDir).modelCheck ?? null;
const harnessErrorOf = (runDir: string) => runRecordOf(runDir).harnessError ?? null;

function spawnPersonaRun(e: PersonaEntry, pace: 'human' | 'fast', scored: boolean, env: NodeJS.ProcessEnv, caseId: string): { child: ChildProcess; promise: Promise<void> } {
  const child = spawn('npx', ['tsx', '--env-file=.env.local', ...liveRunArgs(e, { pace, batch: BATCH, scored, caseId })], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const scoring = { noScore: process.argv.includes('--no-score'), scoreIds: parseScoreIds(arg('score'), personaIds) };
  const scored = (id: number) => scoresPersona(id, scoring);
  // The batch's case (12 Oct): frozen with the models, so a batch runs one case.
  const caseId = arg('case') ?? 'prof-001';
  getCaseById(caseId);
  assertBatchOpen(BATCH);
  const interviewer = evalInterviewer(arg('interviewer'));
  // The children read their interviewer from INTERVIEWER_EVAL_CONFIG only.
  if (process.env.INTERVIEWER_PROVIDER) throw new Error(`INTERVIEWER_PROVIDER="${process.env.INTERVIEWER_PROVIDER}" is set — an evaluation declares its interviewer with --interviewer only; unset it`);
  const git = gitInfo();
  const existing = loadManifest(BATCH_DIR);
  const { manifest, wave, entries } = planWave(existing, {
    personaIds, knownIds: PERSONAS.map(x => x.id), commit: git.commit,
    codeDirty: codeDirty(), codeChanged: existing ? codeChangedSince(existing.commit) : false,
    newVersion: arg('new-version'), rerun: process.argv.includes('--rerun'),
    hashes: { bands: fileHash('evals/persona-bands.json'), severity: fileHash('evals/severity.md') },
    date: new Date(), batch: BATCH,
    models: { interviewer: interviewer.model, interviewerConfig: interviewer.config, scoring: SCORING_MODEL_ID, ...(caseId !== 'prof-001' ? { case: caseId } : {}) },
  });
  console.log(`[wave] ${wave}: ${entries.map(e => `#${e.runNumber}=persona ${e.personaId}${e.rerun ? ` (rerun ${e.rerun})` : ''}`).join(', ')} · version ${manifest.version} · commit ${git.commit.slice(0, 7)} · pace ${pace}`);
  console.log(`[wave] case: ${caseId}`);
  console.log(`[wave] interviewer: ${interviewer.config} = ${interviewer.model} (thinking ${interviewer.thinking}${interviewer.effort ? `, effort ${interviewer.effort}` : ''}, fallbacks ${interviewer.fallbacks ? 'on' : 'off'})`);
  const scoredRuns = entries.filter(e => scored(e.personaId));
  console.log(`[wave] scored: ${scoredRuns.length ? scoredRuns.map(e => `#${e.runNumber}=persona ${e.personaId}`).join(', ') : 'none'} · unscored: ${entries.length - scoredRuns.length}`);
  // The children inherit this environment: the checker they will run (MATH_CHECKER_CONFIG).
  const checker = liveCheckerConfig(process.env);
  const est = waveEstimate({ scored: scoredRuns.length, unscored: entries.length - scoredRuns.length, checker });
  console.log(`[wave] estimate ≈ $${est.totalUsd.toFixed(2)} (runs $${est.runsUsd.toFixed(2)} + math checker ${checker ? `${checker.model}, ≈${est.checkerCalls} calls $${est.checkerUsd.toFixed(2)}` : 'off $0.00'}) · batch cap $${cap} (ledger ${BATCH_DIR}/budget-ledger.jsonl)`);
  if (process.argv.includes('--dry')) return;
  // Presence only — the value is never printed.
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set — run with npx tsx --env-file=.env.local scripts/persona-batch.ts …');
  saveManifest(BATCH_DIR, manifest);

  const env = { ...process.env, INTERVIEWER_EVAL_CONFIG: interviewer.config, LLM_BUDGET_USD: String(cap), LLM_BUDGET_FILE: path.resolve(BATCH_DIR, 'budget-ledger.jsonl') };
  const spawned = entries.map(e => spawnPersonaRun(e, pace, scored(e.personaId), env, caseId));
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
    dir => existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.json')), modelCheckOf, harnessErrorOf);
  saveManifest(BATCH_DIR, updated);
  const results = updated.runs.filter(r => r.wave === wave);
  const mismatched = results.filter(r => r.failure === 'model_mismatch');
  for (const r of results.filter(x => x.failure === 'harness')) console.error(`[wave] #${r.runNumber} persona ${r.personaId}: partial run (harness) — ${r.harnessError}`);
  console.log(`[wave] done: ${results.filter(r => r.status === 'done').length} ok, ${results.filter(r => r.status === 'failed').length} failed`);
  try {
    const rows = findRunJsons(waveDir).map(f => ({ id: path.relative(RUNS, path.dirname(f)), summary: checkCostOf(JSON.parse(readFileSync(f, "utf8"))) }));
    const md = checkCostMarkdown(rows);
    writeFileSync(path.join(BATCH_DIR, `check-cost-${wave}.md`), md);
    console.log(`[wave] ${checkCostLine(totalCheckCost(rows.map(r => r.summary)))}`);
  } catch (e) { console.error(`[wave] check-cost report skipped: ${e instanceof Error ? e.message : e}`); }
  if (mismatched.length > 0) {
    console.error(`[wave] EVALUATION FAILED — interviewer model mismatch in ${mismatched.length} run(s): ${mismatched.map(r => `#${r.runNumber} ${r.interviewer?.problems.join('; ')}`).join(' | ')}`);
    process.exitCode = 2;
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
