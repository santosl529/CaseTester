import { describe, it, expect } from 'vitest';
import { waveFolderName, planWave, markWaveResults, type Manifest } from '@/lib/eval/batch-manifest';

const d = new Date('2026-10-09T15:00:00');
const base = { commit: 'c1', codeDirty: false, codeChanged: false, date: d, models: { interviewer: 'claude-sonnet-5-5' }, knownIds: Array.from({ length: 62 }, (_, i) => i + 1) };

describe('batch manifest', () => {
  it('names wave folders batch-18-<mon>-<dd>-runs-<x>-<y>', () => {
    expect(waveFolderName(d, 1, 10)).toBe('batch-18-oct-09-runs-1-10');
    expect(waveFolderName(new Date('2026-11-02T10:00:00'), 11, 11)).toBe('batch-18-nov-02-runs-11-11');
  });

  it('first wave creates the manifest and numbers runs in order', () => {
    const w = planWave(null, { ...base, personaIds: [5, 2, 9] });
    expect(w.wave).toBe('batch-18-oct-09-runs-1-3');
    expect(w.entries.map(e => [e.personaId, e.runNumber])).toEqual([[5, 1], [2, 2], [9, 3]]);
    expect(w.manifest.version).toBe('v1');
    expect(w.manifest.commit).toBe('c1');
  });

  it('continues run numbers in the next wave and skips personas already done', () => {
    let m: Manifest = planWave(null, { ...base, personaIds: [1, 2] }).manifest;
    m = markWaveResults(m, m.runs.map(r => ({ ...r, runDir: 'x' })), () => true);
    const w = planWave(m, { ...base, personaIds: [2, 3] });
    expect(w.entries.map(e => [e.personaId, e.runNumber])).toEqual([[3, 3]]);
    expect(w.wave).toBe('batch-18-oct-09-runs-3-3');
  });

  it('refuses uncommitted code and a code change; --new-version allows the code change and tags runs', () => {
    const m = planWave(null, { ...base, personaIds: [1] }).manifest;
    expect(m.commits).toEqual(['c1']);
    expect(() => planWave(m, { ...base, codeDirty: true, personaIds: [2] })).toThrow(/uncommitted/);
    expect(() => planWave(m, { ...base, commit: 'c2', codeChanged: true, personaIds: [2] })).toThrow(/code .*changed since version v1.*--new-version/);
    const w = planWave(m, { ...base, commit: 'c2', codeChanged: true, newVersion: 'v2', personaIds: [2] });
    expect(w.entries[0].version).toBe('v2');
    expect(w.manifest.version).toBe('v2');
    expect(w.manifest.commit).toBe('c2');               // the new version's fingerprint base
    expect(w.manifest.commits).toEqual(['c1', 'c2']);
  });

  it('a commit that leaves the code unchanged (docs, run outputs) joins the current version and is recorded', () => {
    const m = planWave(null, { ...base, personaIds: [1] }).manifest;
    const w = planWave(m, { ...base, commit: 'c2', personaIds: [2] });
    expect(w.manifest.version).toBe('v1');
    expect(w.entries[0].version).toBe('v1');
    expect(w.manifest.commit).toBe('c1');
    expect(w.manifest.commits).toEqual(['c1', 'c2']);
    expect(planWave(w.manifest, { ...base, commit: 'c2', personaIds: [3] }).manifest.commits).toEqual(['c1', 'c2']); // same commit not repeated
  });

  it('freezes the models: a changed model needs --new-version and the error names the key', () => {
    const m = planWave(null, { ...base, personaIds: [1], models: { interviewer: 'claude-sonnet-5-5', scoring: 'claude-opus-5-5' } }).manifest;
    expect(() => planWave(m, { ...base, personaIds: [2], models: { interviewer: 'cerebras', scoring: 'claude-opus-5-5' } }))
      .toThrow(/models changed .*interviewer: claude-sonnet-5-5 → cerebras/);
    expect(() => planWave(m, { ...base, personaIds: [2], models: { interviewer: 'claude-sonnet-5-5' } })).toThrow(/scoring: claude-opus-5-5 → none/);
    const w = planWave(m, { ...base, personaIds: [2], models: { interviewer: 'cerebras', scoring: 'claude-opus-5-5' }, newVersion: 'v2' });
    expect(w.manifest.models.interviewer).toBe('cerebras');
    expect(w.entries[0].version).toBe('v2');
    // same models in another key order are not a change
    expect(planWave(m, { ...base, personaIds: [2], models: { scoring: 'claude-opus-5-5', interviewer: 'claude-sonnet-5-5' } }).manifest.version).toBe('v1');
  });

  it('refuses more than 10 personas and unknown persona ids', () => {
    expect(() => planWave(null, { ...base, personaIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] })).toThrow(/10/);
    expect(() => planWave(null, { ...base, personaIds: [99] })).toThrow(/99/);
  });

  it('marks a persona failed when its run folder has no run JSON, and --rerun runs failed or done ones again', () => {
    let m = planWave(null, { ...base, personaIds: [1, 2] }).manifest;
    m = { ...m, runs: m.runs.map(r => ({ ...r, runDir: `dir-${r.personaId}` })) };
    m = markWaveResults(m, m.runs, dir => dir === 'dir-1');
    expect(m.runs.map(r => r.status)).toEqual(['done', 'failed']);
    const again = planWave(m, { ...base, personaIds: [2] });
    expect(again.entries.map(e => e.personaId)).toEqual([2]);       // failed ones run again without --rerun
    const re = planWave(m, { ...base, personaIds: [1], rerun: true });
    expect(re.entries.map(e => e.personaId)).toEqual([1]);
  });
  it('stores the bands/severity hashes at the first wave and refuses changed files later', () => {
    const m = planWave(null, { ...base, personaIds: [1], hashes: { bands: 'b1', severity: 's1' } }).manifest;
    expect([m.bandsHash, m.severityHash]).toEqual(['b1', 's1']);
    expect(() => planWave(m, { ...base, personaIds: [2], hashes: { bands: 'b2', severity: 's1' } })).toThrow(/persona-bands/);
    expect(planWave(m, { ...base, personaIds: [2], hashes: { bands: 'b2', severity: 's1' }, newVersion: 'v2' }).manifest.bandsHash).toBe('b2');
  });

  it('judges "already done" within the current version only', () => {
    let m: Manifest = planWave(null, { ...base, personaIds: [1] }).manifest;
    m = markWaveResults(m, m.runs.map(r => ({ ...r, runDir: 'x' })), () => true);
    const w = planWave(m, { ...base, commit: 'c2', codeChanged: true, newVersion: 'v2', personaIds: [1] });
    expect(w.entries.map(e => [e.personaId, e.runNumber, e.version])).toEqual([[1, 2, 'v2']]);
  });

  it('deduplicates persona ids keeping first occurrence order', () => {
    const w = planWave(null, { ...base, personaIds: [3, 3, 1] });
    expect(w.entries.map(e => e.personaId)).toEqual([3, 1]);
  });

  it('rejects --new-version equal to the current version label', () => {
    const m = planWave(null, { ...base, personaIds: [1] }).manifest;
    expect(() => planWave(m, { ...base, commit: 'c2', codeChanged: true, newVersion: 'v1', personaIds: [2] })).toThrow(/v1 is already the current version/);
    expect(() => planWave(m, { ...base, newVersion: 'v1', personaIds: [2] })).toThrow(/v1 is already the current version/);
  });

  it('rejects a --new-version label an earlier version already used', () => {
    const v1 = planWave(null, { ...base, personaIds: [1] }).manifest;
    const v2 = planWave(v1, { ...base, commit: 'c2', codeChanged: true, newVersion: 'v2', personaIds: [2] }).manifest;
    expect(() => planWave(v2, { ...base, commit: 'c3', codeChanged: true, newVersion: 'v1', personaIds: [3] })).toThrow(/v1 was already used/);
  });

  it('rejects a --new-version when nothing changed', () => {
    const m = planWave(null, { ...base, personaIds: [1], hashes: { bands: 'b1', severity: 's1' } }).manifest;
    expect(() => planWave(m, { ...base, commit: 'c2', newVersion: 'v2', personaIds: [2], hashes: { bands: 'b1', severity: 's1' } }))
      .toThrow(/nothing changed — no new version needed/);
    // any one of code, models or hashes is enough
    expect(planWave(m, { ...base, newVersion: 'v2', personaIds: [2], hashes: { bands: 'b2', severity: 's1' } }).manifest.version).toBe('v2');
    expect(planWave(m, { ...base, newVersion: 'v2', personaIds: [2], models: { interviewer: 'x' }, hashes: { bands: 'b1', severity: 's1' } }).manifest.version).toBe('v2');
  });
});
