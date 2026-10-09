import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeTurnFile, readTurnFile, type TurnFileHeader } from '@/lib/eval/turn-file';
import { gitInfo } from '@/lib/eval/git-info';

const header: TurnFileHeader = { type: 'header', batch: 'batch-18', version: 'v1', wave: 'batch-18-oct-09-runs-1-2', runNumber: 1, commit: 'abc', dirty: false, models: { interviewer: 'claude-sonnet-5-5' }, persona: { id: 1, name: 'Maya', brief: 'b' }, sessionId: 's1', startedAt: '2026-10-09T00:00:00Z' };

describe('turn file', () => {
  it('round-trips header, turns and end line through gzip', () => {
    const p = path.join(mkdtempSync(path.join(tmpdir(), 'tf-')), 'x.turns.jsonl.gz');
    const turn = { type: 'turn', turnIndex: 0 } as never;
    writeTurnFile(p, header, [turn], { type: 'end', ended: true, budgetStopped: false, scoring: 'scored', candidateUsage: { calls: 1, input: 2, output: 3, usd: 0.1 } });
    const back = readTurnFile(p);
    expect(back.header).toEqual(header);
    expect(back.turns).toHaveLength(1);
    expect(back.end?.scoring).toBe('scored');
  });

  it('a file cut off before the end line reads with end = null', () => {
    const p = path.join(mkdtempSync(path.join(tmpdir(), 'tf-')), 'cut.turns.jsonl.gz');
    writeFileSync(p, gzipSync(JSON.stringify(header) + '\n' + JSON.stringify({ type: 'turn', turnIndex: 0 }) + '\n'));
    expect(readTurnFile(p).end).toBeNull();
  });

  it('gitInfo returns a 40-char commit and a dirty flag', () => {
    const g = gitInfo();
    expect(g.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof g.dirty).toBe('boolean');
  });
});
