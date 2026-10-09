import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveRunArgs, findRunDir, runIdOf, TEST_RUNS_DIR } from '@/lib/eval/wave-commands';
import { toFaultRecords } from '@/lib/eval/prescreen';
import type { RunRecord } from '@/lib/eval/scorecard';

describe('wave commands', () => {
  it('builds the live-run arguments for one persona', () => {
    const args = liveRunArgs({ personaId: 7, runNumber: 12, status: 'pending', wave: 'batch-18-oct-09-runs-11-20', version: 'v1', runDir: null }, { pace: 'human' });
    expect(args).toEqual(['scripts/live-run.ts', 'prof-001', '--persona=7', '--batch=batch-18-oct-09-runs-11-20', '--pace=human',
      '--batch-id=batch-18', '--version=v1', '--wave=batch-18-oct-09-runs-11-20', '--run-number=12']);
  });

  it('finds the persona run folder by its two-digit id prefix', () => {
    const wave = mkdtempSync(path.join(tmpdir(), 'wave-'));
    mkdirSync(path.join(wave, '07-sam-the-something'));
    expect(findRunDir(wave, 7)).toBe(path.join(wave, '07-sam-the-something'));
    expect(findRunDir(wave, 8)).toBeNull();
  });

  it('run ids are <wave>/<persona-folder>, so the same persona in two waves gives two distinct ids', () => {
    const a = runIdOf(path.join(TEST_RUNS_DIR, 'batch-18-oct-09-runs-1-10', '03-ines-the-clarifier'));
    const b = runIdOf(path.join(TEST_RUNS_DIR, 'batch-18-oct-10-runs-11-12', '03-ines-the-clarifier'));
    expect(a).toBe('batch-18-oct-09-runs-1-10/03-ines-the-clarifier');
    expect(b).toBe('batch-18-oct-10-runs-11-12/03-ines-the-clarifier');
    expect(runIdOf(path.resolve(TEST_RUNS_DIR, 'w', '03-ines-the-clarifier'))).toBe('w/03-ines-the-clarifier'); // absolute dirs too
    const run = { session: { id: 's', status: 'completed' }, turns: [{ turnIndex: 1, role: 'candidate', text: 'c' }, { turnIndex: 2, role: 'interviewer', text: 'Here is a line long enough to quote.' }], score: null, events: [], analytics: [] } as RunRecord;
    const proposal = { turnIndex: 2, category: 'requests' as const, severity: 'serious' as const, quote: 'a line long enough to quote', expected: 'e', rule: 'r', attribution: 'model' as const, recovered: false };
    const ids = [a, b].map(id => toFaultRecords(id, run, null, [proposal]).kept[0].id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('batch-18-oct-09-runs-1-10/03-ines-the-clarifier-t2-0');
  });
});
