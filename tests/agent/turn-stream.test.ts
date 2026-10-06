import { describe, it, expect } from 'vitest';
import { TurnStreamParser, type TurnStreamEvent } from '@/lib/agent/models/turn-stream';
import { parseTurn } from '@/lib/agent/models/turn-schema';

// The streamed turn read field by field: declarations as soon as they close,
// the "say" text sentence by sentence, the question as one field at its end.

const TURN = JSON.stringify({
  move: 'analysis',
  requests: [{ what: 'the COGS split', item_ids: ['bean_share_of_cogs'], explicit: true, respond: 'release' }],
  exhibit: null,
  rescue_item: null,
  say: 'Okay. COGS rose to 58.5% — that is "a lot", e.g. for beans.',
  question: 'What drove it?',
});

function run(chunks: string[]): TurnStreamEvent[] {
  const p = new TurnStreamParser();
  return chunks.flatMap(c => p.push(c));
}
const chunked = (s: string, n: number) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

const EXPECTED: TurnStreamEvent[] = [
  { type: 'field', key: 'move', value: 'analysis' },
  { type: 'field', key: 'requests', value: [{ what: 'the COGS split', item_ids: ['bean_share_of_cogs'], explicit: true, respond: 'release' }] },
  { type: 'field', key: 'exhibit', value: null },
  { type: 'field', key: 'rescue_item', value: null },
  { type: 'sentence', text: 'Okay.' },
  { type: 'sentence', text: 'COGS rose to 58.5% — that is "a lot", e.g.' },
  { type: 'sentence', text: 'for beans.' },
  { type: 'field', key: 'say', value: 'Okay. COGS rose to 58.5% — that is "a lot", e.g. for beans.' },
  { type: 'field', key: 'question', value: 'What drove it?' },
];

describe('TurnStreamParser', () => {
  it('emits each field as it closes and the say text by sentence', () => {
    expect(run([TURN])).toEqual(EXPECTED);
  });

  it('gives the same events whatever the chunk size', () => {
    for (const n of [1, 2, 3, 7, 13]) expect(run(chunked(TURN, n))).toEqual(EXPECTED);
  });

  it('handles whitespace between tokens and escapes split across chunks', () => {
    const s = '{ "move" : "other" , "requests" : [ ] , "exhibit" : "exhibit-a" , "rescue_item" : null , "say" : "A \\u2014 b. \\"C\\"." , "question" : "Why?" }';
    for (const n of [1, 2, 5]) {
      const ev = run(chunked(s, n));
      expect(ev.filter(e => e.type === 'sentence').map(e => (e as { text: string }).text)).toEqual(['A — b.', '"C".']);
      expect(ev).toContainEqual({ type: 'field', key: 'exhibit', value: 'exhibit-a' });
      expect(ev.at(-1)).toEqual({ type: 'field', key: 'question', value: 'Why?' });
    }
  });

  it('keeps a newline-led continuation inside its sentence (fabricated-turn check)', () => {
    const s = JSON.stringify({ move: 'brainstorm', requests: [], exhibit: null, rescue_item: null, say: 'What else?\n\nuser Several levers.', question: 'Go on?' });
    const sentences = run(chunked(s, 3)).flatMap(e => (e.type === 'sentence' ? [e.text] : []));
    expect(sentences[0]).toBe('What else?\n\nuser Several levers.');
  });

  it('emits nothing unfinished when the stream is cut off', () => {
    const p = new TurnStreamParser();
    expect(p.push('{"move":"analysis","requests":[{"what":"x"')).toEqual([{ type: 'field', key: 'move', value: 'analysis' }]);
    expect(p.text.endsWith('"x"')).toBe(true);
  });

  it('agrees with parseTurn on the whole text', () => {
    expect(parseTurn(TURN)).toEqual({
      move: 'analysis',
      requests: [{ what: 'the COGS split', itemIds: ['bean_share_of_cogs'], explicit: true, respond: 'release' }],
      exhibit: null, rescueItem: null,
      say: 'Okay. COGS rose to 58.5% — that is "a lot", e.g. for beans.',
      question: 'What drove it?',
    });
  });
});
