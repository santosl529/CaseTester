import { describe, it, expect } from 'vitest';
import { ActionStreamParser, type ParsedEvent } from '@/lib/agent/models/json-action-stream';

// The streamed JSON turn (json-actions.ts) read incrementally: sentences of a
// "say" text as soon as they are complete, actions when their object closes.

const TURN = JSON.stringify({ actions: [
  { type: 'say', text: 'Okay. COGS rose from 42% to 58.5% — that is $4.2M per store.' },
  { type: 'reveal_data', item_id: 'bean_costs' },
  { type: 'say', text: 'He said "check it", e.g. against labor. What drove it?' },
  { type: 'advance_phase' },
] });

function run(chunks: string[]): ParsedEvent[] {
  const p = new ActionStreamParser();
  return chunks.flatMap(c => p.push(c));
}
const chunked = (s: string, n: number) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

const EXPECTED: ParsedEvent[] = [
  { type: 'sentence', text: 'Okay.', sayIndex: 0 },
  { type: 'sentence', text: 'COGS rose from 42% to 58.5% — that is $4.2M per store.', sayIndex: 0 },
  { type: 'action', raw: { type: 'say', text: 'Okay. COGS rose from 42% to 58.5% — that is $4.2M per store.' }, index: 0 },
  { type: 'action', raw: { type: 'reveal_data', item_id: 'bean_costs' }, index: 1 },
  { type: 'sentence', text: 'He said "check it", e.g.', sayIndex: 1 },
  { type: 'sentence', text: 'against labor.', sayIndex: 1 },
  { type: 'sentence', text: 'What drove it?', sayIndex: 1 },
  { type: 'action', raw: { type: 'say', text: 'He said "check it", e.g. against labor. What drove it?' }, index: 2 },
  { type: 'action', raw: { type: 'advance_phase' }, index: 3 },
];

describe('ActionStreamParser', () => {
  it('emits sentences and actions from one chunk', () => {
    expect(run([TURN])).toEqual(EXPECTED);
  });

  it('gives the same events whatever the chunk size', () => {
    for (const n of [1, 2, 3, 5, 7, 13]) expect(run(chunked(TURN, n))).toEqual(EXPECTED);
  });

  it('decodes escapes split across chunks', () => {
    const s = '{"actions":[{"type":"say","text":"A dash \\u2014 here. Then \\"quoted\\"."}]}';
    for (const n of [1, 2, 4]) {
      const sentences = run(chunked(s, n)).flatMap(e => (e.type === 'sentence' ? [e.text] : []));
      expect(sentences).toEqual(['A dash — here.', 'Then "quoted".']);
    }
  });

  it('does not split inside figures', () => {
    const s = '{"actions":[{"type":"say","text":"Margin fell 18.0 points to 6.5%."}]}';
    expect(run(chunked(s, 1)).filter(e => e.type === 'sentence')).toEqual([
      { type: 'sentence', text: 'Margin fell 18.0 points to 6.5%.', sayIndex: 0 },
    ]);
  });

  it('emits nothing for an unfinished sentence when the stream is cut off', () => {
    const p = new ActionStreamParser();
    expect(p.push('{"actions":[{"type":"say","text":"Walk me through')).toEqual([]);
    expect(p.text).toBe('{"actions":[{"type":"say","text":"Walk me through');
  });

  it('keeps a newline-led continuation in the same sentence, so the fabricated-turn check sees it', () => {
    // Live run 58cb8061: the model wrote the candidate's answer after "\n\nuser".
    const s = '{"actions":[{"type":"say","text":"What else could the client do?\\n\\nuser Several levers. Pricing."}]}';
    const sentences = run(chunked(s, 3)).flatMap(e => (e.type === 'sentence' ? [e.text] : []));
    expect(sentences[0]).toBe('What else could the client do?\n\nuser Several levers.');
  });

  it('treats only a "text" value inside an action as speech', () => {
    const s = '{"actions":[{"type":"show_exhibit","exhibit_id":"text. Not speech."}]}';
    expect(run([s]).filter(e => e.type === 'sentence')).toEqual([]);
  });
});
