import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveRunArgs, findRunDir } from '@/lib/eval/wave-commands';

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
});
