// Batch 18 manifest (spec 2026-10-09 §2.2): which personas ran, in which
// wave, on which commit. Waves are user-sized (≤10); the configuration is
// frozen — uncommitted code, a commit that changes the code, other models or
// changed bands/severity files need --new-version, and a version's runs are
// never pooled with another's.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CODE_PATHS } from './git-info';

const CODE_PATHS_LABEL = CODE_PATHS.join(', ');

export type PersonaEntry = {
  personaId: number; runNumber: number; status: 'pending' | 'done' | 'failed';
  wave: string; version: string; runDir: string | null;
};
export type Manifest = {
  batch: 'batch-18'; version: string;
  /** The commit the current version started on: the code fingerprint a wave is compared with. */
  commit: string;
  /** Every commit a wave was planned on, in order (commits[0] is the batch's first). */
  commits: string[];
  bandsHash: string | null; severityHash: string | null;
  models: Record<string, string>; runs: PersonaEntry[];
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MAX_WAVE = 10;

export function waveFolderName(date: Date, firstRun: number, lastRun: number): string {
  return `batch-18-${MONTHS[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}-runs-${firstRun}-${lastRun}`;
}

export function planWave(m: Manifest | null, p: {
  personaIds: number[]; knownIds: number[]; commit: string;
  /** Uncommitted changes under the code paths (git-info codeDirty). */
  codeDirty: boolean;
  /** The code paths differ from the current version's commit (git-info codeChangedSince(m.commit)). */
  codeChanged: boolean;
  newVersion?: string; rerun?: boolean; date: Date; models: Record<string, string>;
  hashes?: { bands: string; severity: string };
}): { manifest: Manifest; wave: string; entries: PersonaEntry[] } {
  if (new Set(p.personaIds).size === 0) throw new Error('no personas given');
  if (p.personaIds.length > MAX_WAVE) throw new Error(`a wave runs at most ${MAX_WAVE} personas (got ${p.personaIds.length})`);
  const known = new Set(p.knownIds);
  const unknown = p.personaIds.filter(id => !known.has(id));
  if (unknown.length) throw new Error(`unknown persona ids: ${unknown.join(', ')}`);
  if (p.codeDirty) throw new Error(`the code (${CODE_PATHS_LABEL}) has uncommitted changes — commit them before a wave (freeze)`);

  const personaIds = [...new Set(p.personaIds)];
  let manifest: Manifest = m ?? { batch: 'batch-18', version: p.newVersion ?? 'v1', commit: p.commit, commits: [p.commit], bandsHash: p.hashes?.bands ?? null, severityHash: p.hashes?.severity ?? null, models: p.models, runs: [] };
  if (m) {
    const hashesChanged = !!p.hashes && m.bandsHash !== null && m.severityHash !== null
      && (m.bandsHash !== p.hashes.bands || m.severityHash !== p.hashes.severity);
    const changedModels = [...new Set([...Object.keys(m.models), ...Object.keys(p.models)])].filter(k => m.models[k] !== p.models[k]);
    if (p.newVersion !== undefined) {
      if (p.newVersion === m.version) throw new Error(`${p.newVersion} is already the current version — pick a new label`);
      if (m.runs.some(r => r.version === p.newVersion)) throw new Error(`${p.newVersion} was already used by earlier runs — pick a new label`);
      if (!p.codeChanged && changedModels.length === 0 && !hashesChanged) {
        throw new Error('nothing changed — no new version needed (code, models, persona bands and severity are as the current version has them)');
      }
    } else {
      if (p.codeChanged) throw new Error(`the code (${CODE_PATHS_LABEL}) changed since version ${m.version} started (${m.commit.slice(0, 7)} → ${p.commit.slice(0, 7)}); pass --new-version=<label>`);
      if (changedModels.length) throw new Error(`models changed since version ${m.version} started (${changedModels.map(k => `${k}: ${m.models[k] ?? 'none'} → ${p.models[k] ?? 'none'}`).join(', ')}); pass --new-version=<label>`);
      if (hashesChanged) throw new Error('evals/persona-bands.json or evals/severity.md changed since the batch started; pass --new-version=<label>');
    }
    // A commit that leaves the code fingerprint unchanged joins the current version; it is recorded.
    const commits = m.commits.at(-1) === p.commit ? m.commits : [...m.commits, p.commit];
    manifest = p.newVersion !== undefined ? { ...m, version: p.newVersion, commit: p.commit, commits, models: p.models } : { ...m, commits };
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
