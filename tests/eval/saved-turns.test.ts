import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSavedTurns } from '@/lib/eval/saved-turns';

function runDir(): string {
  const d = path.join(mkdtempSync(path.join(tmpdir(), 'st-')), 'batch-19-x', '15-tyler');
  mkdirSync(d, { recursive: true });
  return d;
}

describe('loadSavedTurns', () => {
  it('reads a turn file: model words, delivered segments by kind, and code\'s data decisions', () => {
    const d = runDir();
    const turn = {
      type: 'turn', turnIndex: 7, candidateText: 'Beans at 25% — do we know what they are now?',
      stateBefore: { kind: 'model', phase: 'EXHIBIT', elapsedMs: 386827 },
      parsedTurn: { say: 'Got it.', question: 'Once you have those two figures, what is left over?' },
      checks: [{ check: 'data_decisions', decision: 'act', detail: { releases: ['bean_price_change'], exhibit: null, defers: ['menu prices'], gateDefers: [], offers: [], refusals: [] } }],
      delivered: [{ kind: 'say', text: 'Got it.' }, { kind: 'data', text: 'Raw coffee bean costs are up 40%.' }, { kind: 'tail', text: 'Once you have those two figures, what is left over?' }],
      savedLine: 'Got it. Raw coffee bean costs are up 40%. Once you have those two figures, what is left over?',
    };
    writeFileSync(path.join(d, 'r.turns.jsonl.gz'), gzipSync([{ type: 'header' }, turn].map(x => JSON.stringify(x)).join('\n') + '\n'));
    const [t] = loadSavedTurns(d);
    expect(t).toMatchObject({
      run: 'batch-19-x/15-tyler', turn: 8, kind: 'model', phase: 'EXHIBIT', modelSay: 'Got it.', deliveredSay: 'Got it.',
      question: 'Once you have those two figures, what is left over?', releases: ['bean_price_change'], defers: ['menu prices'], source: 'turn_file',
    });
  });

  it('reads an older run from its log and record, aligning log groups with turn_latency events', () => {
    const d = runDir();
    const raw = { say: 'Mm-hm.', question: 'What do those figures tell you?' };
    writeFileSync(path.join(d, 'r.log'), `[runner] phase: INTRO kind: model\n[interviewer-model] raw response: ${JSON.stringify(raw)}\n[runner] phase: WRAP kind: close\n`);
    writeFileSync(path.join(d, 'r.json'), JSON.stringify({
      turns: [
        { turnIndex: 1, role: 'candidate', text: 'Costs as a percent of revenue?' },
        { turnIndex: 2, role: 'interviewer', text: 'Mm-hm. COGS is 58%. What do those figures tell you?' },
        { turnIndex: 3, role: 'candidate', text: 'Done.' },
        { turnIndex: 4, role: 'interviewer', text: 'Thanks.' },
      ],
      events: [{ category: 'check', subtype: 'data_decisions', turnIndex: 1, payloadJsonb: { detail: { releases: ['cogs_pct'] } } }],
      analytics: [
        { eventType: 'turn_latency', createdAt: '2026-10-06T00:00:01Z', payloadJsonb: { turnIndex: 2, kind: 'model', phase: 'INTRO' } },
        { eventType: 'turn_latency', createdAt: '2026-10-06T00:00:09Z', payloadJsonb: { turnIndex: 4, kind: 'close', phase: 'WRAP' } },
      ],
    }));
    const turns = loadSavedTurns(d);
    expect(turns.map(t => [t.turn, t.kind, t.question, t.releases])).toEqual([
      [2, 'model', 'What do those figures tell you?', ['cogs_pct']],
      [4, 'close', null, []],
    ]);
    expect(turns[0].source).toBe('log');
  });
});
