import { describe, it, expect } from 'vitest';
import { waveFolderName, planWave, markWaveResults, type Manifest } from '@/lib/eval/batch-manifest';

const d = new Date('2026-10-09T15:00:00');
const base = { commit: 'c1', dirty: false, date: d, models: { interviewer: 'claude-sonnet-5-5' }, knownIds: Array.from({ length: 62 }, (_, i) => i + 1) };

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

  it('refuses a dirty tree and a changed commit; --new-version allows the commit change and tags runs', () => {
    const m = planWave(null, { ...base, personaIds: [1] }).manifest;
    expect(() => planWave(m, { ...base, dirty: true, personaIds: [2] })).toThrow(/uncommitted/);
    expect(() => planWave(m, { ...base, commit: 'c2', personaIds: [2] })).toThrow(/commit/);
    const w = planWave(m, { ...base, commit: 'c2', newVersion: 'v2', personaIds: [2] });
    expect(w.entries[0].version).toBe('v2');
    expect(w.manifest.version).toBe('v2');
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
});
