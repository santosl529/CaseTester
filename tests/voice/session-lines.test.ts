import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionLines } from '@/lib/voice/session-lines';

it('writes every line to the database in order, one at a time', async () => {
  const rows: object[] = [];
  let busy = false;
  const write = async (l: object) => {
    expect(busy).toBe(false);                     // never two writes at once
    busy = true;
    await new Promise(r => setTimeout(r, 1));
    rows.push(l);
    busy = false;
  };
  const s = new SessionLines(write, { sessionId: 's1' });
  s.add({ turnSeq: 1 }); s.add({ turnSeq: 1, clientFirstSoundMs: 900 }); s.add({ summary: { why: 'candidate_left' } });
  await s.flush();
  expect(rows).toEqual([{ turnSeq: 1 }, { turnSeq: 1, clientFirstSoundMs: 900 }, { summary: { why: 'candidate_left' } }]);
  expect(s.file).toBeNull();                      // no directory: no disk
});

it('also appends to <dir>/<date>/<sessionId>.jsonl when a directory is given', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lines-'));
  const s = new SessionLines(async () => {}, { sessionId: 's1', dir, date: new Date('2026-10-18T09:00:00Z') });
  s.add({ turnSeq: 1 }); s.add({ summary: {} });
  await s.flush();
  expect(s.file).toBe(path.join(dir, '2026-10-18', 's1.jsonl'));
  expect(readFileSync(s.file!, 'utf8')).toBe('{"turnSeq":1}\n{"summary":{}}\n');
});

it('a failed write is logged and the next line still goes', async () => {
  const rows: object[] = [], logs: string[] = [];
  let n = 0;
  const s = new SessionLines(async l => { if (n++ === 0) throw new Error('db down'); rows.push(l); }, { sessionId: 's1', log: m => logs.push(m) });
  s.add({ a: 1 }); s.add({ b: 2 });
  await s.flush();
  expect(rows).toEqual([{ b: 2 }]);
  expect(s.writeErrors).toBe(1);
  expect(logs[0]).toMatch(/db down/);
});
