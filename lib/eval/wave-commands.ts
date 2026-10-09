import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PersonaEntry } from './batch-manifest';

export function liveRunArgs(e: PersonaEntry, p: { pace: 'human' | 'fast' }): string[] {
  return ['scripts/live-run.ts', 'prof-001', `--persona=${e.personaId}`, `--batch=${e.wave}`, `--pace=${p.pace}`,
    '--batch-id=batch-18', `--version=${e.version}`, `--wave=${e.wave}`, `--run-number=${e.runNumber}`, `--rerun-index=${e.rerun}`];
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
