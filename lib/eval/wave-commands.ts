import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PersonaEntry } from './batch-manifest';

export function liveRunArgs(e: PersonaEntry, p: { pace: 'human' | 'fast' }): string[] {
  return ['scripts/live-run.ts', 'prof-001', `--persona=${e.personaId}`, `--batch=${e.wave}`, `--pace=${p.pace}`,
    '--batch-id=batch-18', `--version=${e.version}`, `--wave=${e.wave}`, `--run-number=${e.runNumber}`];
}

// live-run names a persona folder NN-<name> (scripts/live-run.ts OUT_DIR).
export function findRunDir(waveDir: string, personaId: number): string | null {
  if (!existsSync(waveDir)) return null;
  const prefix = `${String(personaId).padStart(2, '0')}-`;
  const hit = readdirSync(waveDir).find(d => d.startsWith(prefix));
  return hit ? path.join(waveDir, hit) : null;
}
