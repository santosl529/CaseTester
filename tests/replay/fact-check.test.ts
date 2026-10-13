import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { checkRun, caught } from '../../scripts/fact-check';

// The fact detectors over every saved run (12 Oct). Pins recall on the
// known-fault list (evals/known-fact-faults.json, built from the batch-17,
// -18 and -20 reviews, the misquote labels and progress.md) and the corpus
// coverage. The records live in "Case Interview Runs/" (not committed);
// without them this suite skips. Free.

const ROOT = 'Case Interview Runs';
const available = existsSync(`${ROOT}/test runs/batch-20-blind/KEY.json`);

describe.skipIf(!available)('fact checks over the saved corpus', () => {
  const { runs, skipped } = available ? loadCorpus(ROOT, id => getCaseById(id) as never) : { runs: [], skipped: [] };
  const flags = runs.flatMap(checkRun);
  const known = available
    ? (JSON.parse(readFileSync('evals/known-fact-faults.json', 'utf8')) as { run: string; t: number; rule: string; scope?: string }[])
    : [];

  it('parses every run record (301 on 12 Oct), skipping none', () => {
    expect(runs.length).toBeGreaterThanOrEqual(301);
    expect(skipped).toEqual([]);
  });

  it.each(['F1', 'F2-next', 'F2-rec', 'F3'])('%s catches every known fault in its definition', rule => {
    const ks = known.filter(k => k.rule === rule && (k.scope ?? 'in') === 'in');
    expect(ks.length).toBeGreaterThan(0);
    expect(ks.filter(k => !caught(k as never, flags))).toEqual([]);
  });

  it('F4 catches all known delivery claims but the three outside its patterns', () => {
    const misses = known.filter(k => k.rule === 'F4' && (k.scope ?? 'in') === 'in' && !caught(k as never, flags)).map(k => `${k.run} t${k.t}`);
    expect(misses.sort()).toEqual([
      'batch-12-oct-06/58-hugo-the-hidden-data-prober t8',        // "Once you have those" — pending wording
      'batch-18-oct-10-runs-52-61/32-sam-the-distressed t4',     // bare "that"
      'test runs/batch-20-sonnet-oct-12-runs-1-7/10-sofia-the-unit-confuser t8', // "the price changes you just heard" — menu price was given
    ].sort());
  });

  it('batch 20: every F1, F3 and F4 flag matches a graded fault', () => {
    const b20 = flags.filter(f => f.group.startsWith('batch-20') && ['F1', 'F3', 'F4'].includes(f.rule));
    const ungraded = b20.filter(f => !known.some(k => f.run.includes(k.run) && caught(k as never, [f])));
    expect(ungraded.map(f => `${f.run} t${f.t} ${f.rule}`)).toEqual([]);
  });
});
