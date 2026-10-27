import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveRunArgs, scoresPersona, parseScoreIds, findRunDir, runIdOf, waveEstimate, CHECKER_CALLS_PER_RUN, TEST_RUNS_DIR } from '@/lib/eval/wave-commands';
import { toFaultRecords } from '@/lib/eval/prescreen';
import type { RunRecord } from '@/lib/eval/scorecard';

describe('wave commands', () => {
  it('builds the live-run arguments for one persona', () => {
    const args = liveRunArgs({ personaId: 7, runNumber: 12, status: 'pending', wave: 'batch-18-oct-09-runs-11-20', version: 'v1', runDir: null, rerun: 1 }, { pace: 'human' });
    expect(args).toEqual(['scripts/live-run.ts', 'prof-001', '--persona=7', '--batch=batch-18-oct-09-runs-11-20', '--pace=human',
      '--batch-id=batch-18', '--version=v1', '--wave=batch-18-oct-09-runs-11-20', '--run-number=12', '--rerun-index=1']);
    expect(liveRunArgs({ personaId: 7, runNumber: 1, status: 'pending', wave: 'batch-19-oct-12-runs-1-1', version: 'v1', runDir: null, rerun: 0 }, { pace: 'human', batch: 'batch-19' }))
      .toContain('--batch-id=batch-19');
  });

  it('passes --no-score to a run that is not scored, and nothing to one that is', () => {
    const entry = (personaId: number) => ({ personaId, runNumber: 1, status: 'pending' as const, wave: 'batch-19-oct-12-runs-1-5', version: 'v1', runDir: null, rerun: 0 });
    expect(liveRunArgs(entry(5), { pace: 'human', batch: 'batch-19' })).not.toContain('--no-score');
    expect(liveRunArgs(entry(5), { pace: 'human', batch: 'batch-19', scored: true })).not.toContain('--no-score');
    const unscored = liveRunArgs(entry(5), { pace: 'human', batch: 'batch-19', scored: false });
    expect(unscored.at(-1)).toBe('--no-score');
    expect(unscored.filter(a => a === '--no-score')).toHaveLength(1);
  });

  it('scores every persona by default, none under --no-score, only the named ones under --score', () => {
    expect([5, 42].map(id => scoresPersona(id, {}))).toEqual([true, true]);
    expect([5, 42].map(id => scoresPersona(id, { noScore: true }))).toEqual([false, false]);
    expect([5, 42, 32].map(id => scoresPersona(id, { scoreIds: [5, 32] }))).toEqual([true, false, true]);
    // --no-score with --score: unscored except the named ones (the batch-19 plan's form).
    expect([5, 42, 32].map(id => scoresPersona(id, { noScore: true, scoreIds: [5, 32] }))).toEqual([true, false, true]);
  });

  it('parses --score ids and refuses ones that are not in the wave', () => {
    expect(parseScoreIds(undefined, [5, 42])).toBeUndefined();
    expect(parseScoreIds('5,32', [5, 42, 32])).toEqual([5, 32]);
    expect(parseScoreIds('', [5])).toEqual([]);
    expect(() => parseScoreIds('5,7', [5, 42])).toThrow(/7.*not in this wave/);
    expect(() => parseScoreIds('5,x', [5, 42])).toThrow(/not a persona id/);
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

// Lorenzo, 13 Oct: the printed estimate counts the math checker's calls, which
// the budget meter counts too.
describe('the wave estimate', () => {
  const sonnet = { model: 'claude-sonnet-5-5', effort: 'medium' as const };
  it('runs plus the checker: calls per run × the measured cost of a call', () => {
    const e = waveEstimate({ scored: 2, unscored: 8, checker: sonnet });
    expect(e.runsUsd).toBeCloseTo(2 * 0.77 + 8 * 0.30, 6);
    expect(e.checkerCalls).toBe(10 * CHECKER_CALLS_PER_RUN);
    expect(e.checkerUsd).toBeCloseTo(10 * CHECKER_CALLS_PER_RUN * 0.0187, 6);
    expect(e.totalUsd).toBeCloseTo(e.runsUsd + e.checkerUsd, 6);
  });
  it('the checker switched off: runs only', () => {
    const e = waveEstimate({ scored: 0, unscored: 3, checker: null });
    expect(e.checkerCalls).toBe(0);
    expect(e.checkerUsd).toBe(0);
    expect(e.totalUsd).toBeCloseTo(0.9, 6);
  });
  it('a checker model with no measured cost is refused, not guessed', () => {
    expect(() => waveEstimate({ scored: 0, unscored: 1, checker: { model: 'claude-opus-5-5', effort: 'medium' } })).toThrow(/no measured cost/);
  });
});

// Lorenzo's pre-wave question (26 Oct): can the launcher score a SAMPLE — all five prof-001 runs plus one run per
// other case? It can, with `--score=` as it stands, because `--score` takes PERSONA ids (not run numbers) and
// planWave dedupes personaIds, so a wave holds at most one run per persona: naming the persona names the run.
// A batch runs one case (`--case=`), so the wave is one invocation per case.
describe('the wave\'s per-run scoring sample (--score)', () => {
  it('names one run per case by its persona, and leaves the rest unscored', () => {
    const quillpath = [7, 24, 40, 57, 64, 65, 66, 67];
    const ids = parseScoreIds('24', quillpath);
    expect(ids).toEqual([24]);
    expect(quillpath.map(id => scoresPersona(id, { scoreIds: ids })))
      .toEqual([false, true, false, false, false, false, false, false]);
    // prof-001: every run scored — no --score and no --no-score.
    const prof1 = [7, 24, 40, 57, 64];
    expect(prof1.map(id => scoresPersona(id, { scoreIds: parseScoreIds(undefined, prof1) }))).toEqual([true, true, true, true, true]);
  });
});
