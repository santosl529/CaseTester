// Local voice recordings (VOICE_RECORD=1, development only) are deleted after 30 days (Lorenzo, 14 Nov: "get rid of
// voice audio after 30 days"; the voice policy's schedule). Each write prunes the folder first.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pruneRecordings, RECORDING_MAX_AGE_MS } from '@/lib/voice/recorder';

describe('pruneRecordings', () => {
  it('deletes recordings older than 30 days and keeps newer ones', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rec-'));
    const now = Date.UTC(2026, 10, 14);
    const make = (name: string, ageDays: number) => {
      const d = path.join(root, name);
      mkdirSync(d);
      writeFileSync(path.join(d, 'candidate.wav'), 'x');
      const t = (now - ageDays * 86_400_000) / 1000;
      utimesSync(d, t, t);
      return d;
    };
    const old = make('a-2026-10-08', 37);
    const edge = make('b-2026-10-16', 29);
    const fresh = make('c-2026-11-13', 1);
    expect(RECORDING_MAX_AGE_MS).toBe(30 * 86_400_000);
    expect(pruneRecordings(root, now)).toEqual(['a-2026-10-08']);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(edge)).toBe(true);
    expect(existsSync(fresh)).toBe(true);
  });
  it('no folder yet: nothing to do', () => {
    expect(pruneRecordings(path.join(tmpdir(), 'no-such-recordings-dir'), Date.now())).toEqual([]);
  });
});
