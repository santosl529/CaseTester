// Batch 18 manifest (spec 2026-10-09 §2.2): which personas ran, in which
// wave, on which commit. Waves are user-sized (≤10); the configuration is
// frozen — uncommitted code, a commit that changes the code, other models or
// changed bands/severity files need --new-version, and a version's runs are
// never pooled with another's.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CODE_PATHS } from './git-info';
import type { ModelCheck } from './model-guard';
import { engineSwitchesOf, PHASE1_SWITCHES } from '@/lib/cases/engine-switches';

const CODE_PATHS_LABEL = CODE_PATHS.join(', ');

export type PersonaEntry = {
  personaId: number; runNumber: number; status: 'pending' | 'done' | 'failed';
  wave: string; version: string; runDir: string | null;
  /** 0 for a persona's original run in a version; N for its Nth --rerun (never pooled with the original). */
  rerun: number;
  /** The interviewer the run declared and the model ids the API answered from (lib/eval/model-guard.ts). Absent before 11 Oct. */
  interviewer?: Pick<ModelCheck, 'config' | 'requested' | 'actual' | 'ok' | 'problems'>;
  /** Why a run is failed when its record exists (e.g. model_mismatch; harness — a partial run the harness wrote after an error). */
  failure?: string;
  /** The error that stopped a partial run (failure: harness). */
  harnessError?: string;
  /** The Phase 1 engine switches on for the run's case when the wave was planned (contract §3); absent before 22 Oct. */
  engineSwitches?: string[];
};
export type Manifest = {
  batch: string; version: string;
  /** The commit the current version started on: the code fingerprint a wave is compared with. */
  commit: string;
  /** Every commit a wave was planned on, in order (commits[0] is the batch's first). */
  commits: string[];
  bandsHash: string | null; severityHash: string | null;
  models: Record<string, string>; runs: PersonaEntry[];
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MAX_WAVE = 10;

export function waveFolderName(date: Date, firstRun: number, lastRun: number, batch = 'batch-18'): string {
  return `${batch}-${MONTHS[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}-runs-${firstRun}-${lastRun}`;
}

// Batches whose records are frozen: no new waves, suffixed arms included
// (11 Oct — batch 18 is the Sonnet 5.5 baseline; 12 Oct — batch 19, the Haiku
// 5.5 validation the outside review read, stays as it was).
export const FROZEN_BATCHES: ReadonlySet<string> = new Set(['batch-18', 'batch-19']);

// "batch-N", or one arm of a head to head, "batch-N-<arm>" (12 Oct: a batch
// version freezes one interviewer, so batch 20's Sonnet and Haiku arms are
// batch-20-sonnet and batch-20-haiku).
export function assertBatchOpen(batch: string): void {
  const m = /^(batch-\d+)(?:-[a-z0-9]+)?$/.exec(batch);
  if (!m) throw new Error(`batch name "${batch}" must look like batch-19 or batch-20-haiku`);
  if (FROZEN_BATCHES.has(m[1])) throw new Error(`${m[1]} is frozen — run new waves under a new batch: --batch=<batch-N>`);
}

export function planWave(m: Manifest | null, p: {
  personaIds: number[]; knownIds: number[]; commit: string;
  /** Uncommitted changes under the code paths (git-info codeDirty). */
  codeDirty: boolean;
  /** The code paths differ from the current version's commit (git-info codeChangedSince(m.commit)). */
  codeChanged: boolean;
  newVersion?: string; rerun?: boolean; date: Date; models: Record<string, string>;
  hashes?: { bands: string; severity: string };
  /** The batch the wave belongs to (default batch-18, the batch the tooling was built for). */
  batch?: string;
  /** engineSwitchNames(case) for the wave's case (Phase 1 contract §3), stamped on every planned run. */
  engineSwitches?: string[];
}): { manifest: Manifest; wave: string; entries: PersonaEntry[] } {
  const batch = p.batch ?? 'batch-18';
  if (m && m.batch !== batch) throw new Error(`the manifest is ${m.batch}'s, not ${batch}'s`);
  if (new Set(p.personaIds).size === 0) throw new Error('no personas given');
  if (p.personaIds.length > MAX_WAVE) throw new Error(`a wave runs at most ${MAX_WAVE} personas (got ${p.personaIds.length})`);
  const known = new Set(p.knownIds);
  const unknown = p.personaIds.filter(id => !known.has(id));
  if (unknown.length) throw new Error(`unknown persona ids: ${unknown.join(', ')}`);
  if (p.codeDirty) throw new Error(`the code (${CODE_PATHS_LABEL}) has uncommitted changes — commit them before a wave (freeze)`);

  const personaIds = [...new Set(p.personaIds)];
  let manifest: Manifest = m ?? { batch, version: p.newVersion ?? 'v1', commit: p.commit, commits: [p.commit], bandsHash: p.hashes?.bands ?? null, severityHash: p.hashes?.severity ?? null, models: p.models, runs: [] };
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
  const wave = waveFolderName(p.date, first, first + todo.length - 1, batch);
  // A persona already done in this version (planned again by --rerun) gets the next rerun index.
  const rerunOf = (personaId: number) => {
    const done = manifest.runs.filter(r => r.version === manifest.version && r.personaId === personaId && r.status === 'done');
    return done.length ? Math.max(...done.map(r => r.rerun)) + 1 : 0;
  };
  const entries: PersonaEntry[] = todo.map((personaId, i) => ({ personaId, runNumber: first + i, status: 'pending', wave, version: manifest.version, runDir: null, rerun: rerunOf(personaId), engineSwitches: [...(p.engineSwitches ?? [])] }));
  return { manifest: { ...manifest, runs: [...manifest.runs, ...entries] }, wave, entries };
}

// The switches on for a case (engineSwitchesOf), as a list in contract order: the run header and the manifest record it.
export function engineSwitchNames(c: { id: string; engine?: Record<string, boolean | undefined> }, env: Record<string, string | undefined> = process.env): string[] {
  const on = engineSwitchesOf(c as Parameters<typeof engineSwitchesOf>[0], env);
  return PHASE1_SWITCHES.filter(s => on[s]);
}

export function fileHash(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

// A run is done when its record exists and — for a run that declared its
// interviewer — the model check passed: a run answered by another model is
// failed, whatever else it produced (lib/eval/model-guard.ts).
export function markWaveResults(
  m: Manifest, entries: PersonaEntry[], runJsonExists: (runDir: string) => boolean,
  modelCheckOf: (runDir: string) => ModelCheck | null = () => null,
  // A partial run (Lorenzo, 13 Oct; Larkspur rulings d): its record exists, but the harness stopped it.
  harnessErrorOf: (runDir: string) => string | null = () => null,
): Manifest {
  const done = new Map(entries.map(e => [e.runNumber, e]));
  return {
    ...m,
    runs: m.runs.map(r => {
      const e = done.get(r.runNumber);
      if (!e) return r;
      const runDir = e.runDir ?? r.runDir;
      const exists = Boolean(runDir && runJsonExists(runDir));
      const check = runDir && exists ? modelCheckOf(runDir) : null;
      const interviewer = check ? { config: check.config, requested: check.requested, actual: check.actual, ok: check.ok, problems: check.problems } : undefined;
      const harnessError = runDir && exists ? harnessErrorOf(runDir) : null;
      const failure = !exists ? undefined : check && !check.ok ? 'model_mismatch' : harnessError ? 'harness' : undefined;
      return {
        ...r, runDir, status: exists && !failure ? 'done' : 'failed',
        ...(interviewer ? { interviewer } : {}), ...(failure ? { failure } : {}), ...(harnessError ? { harnessError } : {}),
      };
    }),
  };
}

/** The manifest entry whose run folder is `dir` (the scorecard's join), or null. */
export function entryForRunDir(m: Manifest | null, dir: string): PersonaEntry | null {
  return m?.runs.find(r => r.runDir !== null && path.resolve(r.runDir) === path.resolve(dir)) ?? null;
}

export function loadManifest(dir: string): Manifest | null {
  const f = path.join(dir, 'manifest.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Manifest) : null;
}

export function saveManifest(dir: string, m: Manifest): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
}
