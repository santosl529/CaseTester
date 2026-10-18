// The connector after a thinking filler (Lorenzo, 17 Oct): "So," most of the
// time, sometimes none; never a word the filler used, never the same choice
// three turns running; none when the segment already opens like one.
import { describe, it, expect } from 'vitest';
import { CONNECTORS, NO_CONNECTOR, connectorWordCount, pickConnector, spokenWithConnector } from '@/lib/voice/connector';
import { ACKS } from '@/lib/voice/acknowledge';

const pick = (seed: string, o: Partial<{ filler: string; segmentText: string; recent: string[] }> = {}) =>
  pickConnector({ seed, filler: 'Hmm…', segmentText: 'What would you check first?', recent: [], ...o });

describe('pickConnector', () => {
  it('"So," most of the time, sometimes none', () => {
    const got = Array.from({ length: 400 }, (_, i) => pick(`s${i}:${i}:connector`));
    const share = got.filter(c => c === 'So,').length / got.length;
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.9);
    expect(new Set(got)).toEqual(new Set(['So,', NO_CONNECTOR]));
  });

  it('never the same choice three turns running — "So," or none', () => {
    for (let i = 0; i < 100; i++) {
      expect(pick(`a${i}`, { recent: ['So,', 'So,'] })).toBe(NO_CONNECTOR);
      expect(pick(`a${i}`, { recent: [NO_CONNECTOR, NO_CONNECTOR] })).toBe('So,');
    }
  });

  it('a session never runs three the same, turn after turn', () => {
    for (let s = 0; s < 30; s++) {
      const recent: string[] = [];
      const all: string[] = [];
      for (let i = 0; i < 40; i++) {
        const c = pick(`sess${s}:${i}:connector`, { recent, filler: ACKS[i % ACKS.length] });
        all.push(c);
        recent.push(c);
        if (recent.length > 2) recent.shift();
      }
      for (let i = 2; i < all.length; i++) expect(all[i] === all[i - 1] && all[i] === all[i - 2]).toBe(false);
    }
  });

  it('never repeats a word the filler just used', () => {
    expect(CONNECTORS.every(c => ACKS.every(a => !a.toLowerCase().includes(c.replace(',', '').toLowerCase())))).toBe(true);
    for (let i = 0; i < 50; i++) expect(pick(`b${i}`, { filler: 'So…' })).toBe(NO_CONNECTOR);
  });

  it.each([
    'So what would you check first?', 'Okay, walk me through it.', 'Alright — the store count is 200.', 'Hmm, which branch first?', 'Now, which one first?',
  ])('none when the segment already opens like a connector or a filler: %s', text => {
    for (let i = 0; i < 20; i++) expect(pick(`c${i}`, { segmentText: text })).toBe(NO_CONNECTOR);
  });
});

describe('the spoken text', () => {
  it('is the connector, then the line exactly as written — a correction keeps its wording', () => {
    const correction = "From today's 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.";
    expect(spokenWithConnector('So,', correction)).toBe(`So, ${correction}`);
    expect(spokenWithConnector(NO_CONNECTOR, correction)).toBe(correction);
    expect(connectorWordCount('So,')).toBe(1);
    expect(connectorWordCount(NO_CONNECTOR)).toBe(0);
  });
});
