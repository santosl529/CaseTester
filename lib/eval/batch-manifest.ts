// Batch 18 manifest (spec 2026-10-09 §2.2): which personas ran, in which
// wave, on which commit. Waves are user-sized (≤10); the configuration is
// frozen — a dirty tree or a new commit needs --new-version, and a version's
// runs are never pooled with another's.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type PersonaEntry = {
  personaId: number; runNumber: number; status: 'pending' | 'done' | 'failed';
  wave: string; version: string; runDir: string | null;
};
export type Manifest = {
  batch: 'batch-18'; version: string; commit: string; bandsHash: string | null; severityHash: string | null;
  models: Record<string, string>; runs: PersonaEntry[];
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MAX_WAVE = 10;

export function waveFolderName(date: Date, firstRun: number, lastRun: number): string {
  return `batch-18-${MONTHS[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}-runs-${firstRun}-${lastRun}`;
}

export function planWave(m: Manifest | null, p: {
  personaIds: number[]; knownIds: number[]; commit: string; dirty: boolean; newVersion?: string; rerun?: boolean; date: Date; models: Record<string, string>;
  hashes?: { bands: string; severity: string };
}): { manifest: Manifest; wave: string; entries: PersonaEntry[] } {
  if (new Set(p.personaIds).size === 0) throw new Error('no personas given');
  if (p.personaIds.length > MAX_WAVE) throw new Error(`a wave runs at most ${MAX_WAVE} personas (got ${p.personaIds.length})`);
  const known = new Set(p.knownIds);
  const unknown = p.personaIds.filter(id => !known.has(id));
  if (unknown.length) throw new Error(`unknown persona ids: ${unknown.join(', ')}`);
  if (p.dirty) throw new Error('the working tree has uncommitted changes — commit them before a wave (freeze)');

  const personaIds = [...new Set(p.personaIds)];
  let manifest: Manifest = m ?? { batch: 'batch-18', version: p.newVersion ?? 'v1', commit: p.commit, bandsHash: p.hashes?.bands ?? null, severityHash: p.hashes?.severity ?? null, models: p.models, runs: [] };
  if (m) {
    const commitChanged = m.commit !== p.commit;
    const hashesChanged = !!p.hashes && m.bandsHash !== null && m.severityHash !== null
      && (m.bandsHash !== p.hashes.bands || m.severityHash !== p.hashes.severity);
    if (p.newVersion === m.version) throw new Error(`${p.newVersion} is already the current version — pick a new label`);
    if (commitChanged && !p.newVersion) throw new Error(`commit changed since the batch started (${m.commit.slice(0, 7)} → ${p.commit.slice(0, 7)}); pass --new-version=<label>`);
    if (hashesChanged && !p.newVersion) throw new Error('evals/persona-bands.json or evals/severity.md changed since the batch started; pass --new-version=<label>');
    if (commitChanged || hashesChanged) manifest = { ...m, version: p.newVersion!, commit: p.commit, models: p.models };
    if (p.hashes && (hashesChanged || m.bandsHash === null || m.severityHash === null)) {
      manifest = { ...manifest, bandsHash: p.hashes.bands, severityHash: p.hashes.severity };
    }
  }
  const latest = new Map<number, PersonaEntry>();
  for (const r of manifest.runs) if (r.version === manifest.version) latest.set(r.personaId, r);
  const todo = personaIds.filter(id => p.rerun || latest.get(id)?.status !== 'done');
  if (todo.length === 0) throw new Error('every persona given has already run (use --rerun to run again)');
  const first = manifest.runs.reduce((n, r) => Math.max(n, r.runNumber), 0) + 1;
  const wave = waveFolderName(p.date, first, first + todo.length - 1);
  const entries: PersonaEntry[] = todo.map((personaId, i) => ({ personaId, runNumber: first + i, status: 'pending', wave, version: manifest.version, runDir: null }));
  return { manifest: { ...manifest, runs: [...manifest.runs, ...entries] }, wave, entries };
}

export function fileHash(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

export function markWaveResults(m: Manifest, entries: PersonaEntry[], runJsonExists: (runDir: string) => boolean): Manifest {
  const done = new Map(entries.map(e => [e.runNumber, e]));
  return {
    ...m,
    runs: m.runs.map(r => {
      const e = done.get(r.runNumber);
      if (!e) return r;
      const runDir = e.runDir ?? r.runDir;
      return { ...r, runDir, status: runDir && runJsonExists(runDir) ? 'done' : 'failed' };
    }),
  };
}

export function loadManifest(dir: string): Manifest | null {
  const f = path.join(dir, 'manifest.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Manifest) : null;
}

export function saveManifest(dir: string, m: Manifest): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
}
