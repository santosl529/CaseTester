import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PersonaEntry } from './batch-manifest';

// scored: false passes live-run --no-score (transcript and timing only, no
// Opus scoring; live-run --finish=<sessionId> can score it later).
// caseId: the batch's case (persona-batch --case; default prof-001).
export function liveRunArgs(e: PersonaEntry, p: { pace: 'human' | 'fast'; batch?: string; scored?: boolean; caseId?: string }): string[] {
  return ['scripts/live-run.ts', p.caseId ?? 'prof-001', `--persona=${e.personaId}`, `--batch=${e.wave}`, `--pace=${p.pace}`,
    `--batch-id=${p.batch ?? 'batch-18'}`, `--version=${e.version}`, `--wave=${e.wave}`, `--run-number=${e.runNumber}`, `--rerun-index=${e.rerun}`,
    ...(p.scored === false ? ['--no-score'] : [])];
}

// persona-batch --no-score / --score=<ids> (batch 19, 11 Oct: mostly unscored).
// --score names the only personas scored, with or without --no-score.
export function scoresPersona(personaId: number, p: { noScore?: boolean; scoreIds?: number[] }): boolean {
  if (p.scoreIds) return p.scoreIds.includes(personaId);
  return !p.noScore;
}

export function parseScoreIds(raw: string | undefined, waveIds: number[]): number[] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(',').filter(Boolean);
  const bad = parts.filter(s => !/^\d+$/.test(s));
  if (bad.length) throw new Error(`--score: "${bad.join(', ')}" is not a persona id`);
  const ids = parts.map(Number);
  const outside = ids.filter(id => !waveIds.includes(id));
  if (outside.length) throw new Error(`--score: persona ${outside.join(', ')} is not in this wave (--personas)`);
  return ids;
}

// live-run names a persona folder NN-<name> (scripts/live-run.ts OUT_DIR).
export function findRunDir(waveDir: string, personaId: number): string | null {
  if (!existsSync(waveDir)) return null;
  const prefix = `${String(personaId).padStart(2, '0')}-`;
  const hit = readdirSync(waveDir).find(d => d.startsWith(prefix));
  return hit ? path.join(waveDir, hit) : null;
}

export const TEST_RUNS_DIR = 'Case Interview Runs/test runs';

// A run's id is <wave>/<persona-folder> (e.g. batch-18-oct-09-runs-1-10/03-ines-the-clarifier):
// the persona folder alone repeats when a persona runs again in another wave
// (--rerun, --new-version), and two runs must never share fault ids or rows.
export function runIdOf(dir: string, root: string = TEST_RUNS_DIR): string {
  return path.relative(root, dir).split(path.sep).join('/');
}

// What a wave costs, as the batch's budget meter will count it (13 Oct:
// the printed estimate left the math checker out). Per run: ≈ $0.77 scored,
// ≈ $0.30 unscored (batch 21 measured a median of $0.36 unscored); plus the
// checker on each message with a quantitative claim — CHECKER_CALLS_PER_RUN
// (the step-4 personas' mean on prof-001 in batches 19–21 was 10.75) × the
// measured cost of a call (Sonnet 5.5 at medium, the 13 Oct rerun under the
// current prompt: $0.0187). A checker model with no measured cost is refused.
export const SCORED_RUN_USD = 0.77;
export const UNSCORED_RUN_USD = 0.30;
export const CHECKER_CALLS_PER_RUN = 11;
export const CHECKER_USD_PER_CALL: Record<string, number> = { 'claude-sonnet-5-5': 0.0187 };

export function waveEstimate(p: { scored: number; unscored: number; checker: { model: string; effort?: string } | null }) {
  const runsUsd = p.scored * SCORED_RUN_USD + p.unscored * UNSCORED_RUN_USD;
  const perCall = p.checker ? CHECKER_USD_PER_CALL[p.checker.model] : 0;
  if (perCall === undefined) throw new Error(`math checker model ${p.checker!.model} has no measured cost a call — measure it before estimating (or MATH_CHECKER_CONFIG=off)`);
  const checkerCalls = p.checker ? (p.scored + p.unscored) * CHECKER_CALLS_PER_RUN : 0;
  const checkerUsd = checkerCalls * perCall;
  return { runsUsd, checkerCalls, checkerUsd, totalUsd: runsUsd + checkerUsd };
}
