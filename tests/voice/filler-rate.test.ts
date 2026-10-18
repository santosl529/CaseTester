// How often a thinking filler plays (4c, Lorenzo's go 18 Oct): the rule, its config, and session 9ccf0836.
import { describe, it, expect } from 'vitest';
import { fillerAllowed, fillerRateFrom, DEFAULT_FILLER_RATE } from '@/lib/voice/acknowledge';

const words = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? 'So' : 'word')).join(' ') + '.';

describe('fillerRateFrom', () => {
  it('defaults: 40 words, never two short-reply fillers running', () => expect(fillerRateFrom({})).toEqual({ longWords: 40, maxRun: 1 }));
  it('tuned by env; nonsense keeps the default', () => {
    expect(fillerRateFrom({ VOICE_FILLER_LONG_WORDS: '25', VOICE_FILLER_MAX_RUN: '2' })).toEqual({ longWords: 25, maxRun: 2 });
    expect(fillerRateFrom({ VOICE_FILLER_LONG_WORDS: 'lots', VOICE_FILLER_MAX_RUN: '-1' })).toEqual(DEFAULT_FILLER_RATE);
  });
});

describe('9ccf0836 under the default rate (every completed turn had a filler)', () => {
  // The completed turns in order: words of his message (t6 a data ask, t22 "stuck" — the comfort line).
  const turns: [string, number | string][] = [
    ['t2', 124], ['t3', 48], ['t4', 3], ['t5', 26], ['t6', 'Could I see the cost breakdown by line?'], ['t7', 75], ['t8', 17], ['t9', 28], ['t10', 142], ['t11', 43],
    ['t13', 14], ['t15', 75], ['t16', 7], ['t20', 82], ['t22', 'Sorry, hold on, let me think.'], ['t24', 101], ['t25', 125], ['t26', 182], ['t27', 78], ['t28', 90], ['t29', 3],
  ];
  it('drops t4, t8, t13, t16 and t29 — short replies right after a filler: 16 of 21 play', () => {
    let run = 0;
    const dropped: string[] = [];
    for (const [t, w] of turns) {
      const text = typeof w === 'number' ? words(w) : w;
      const ok = fillerAllowed(text, run);
      if (!ok) dropped.push(t);
      run = ok ? run + 1 : 0;
    }
    expect(dropped).toEqual(['t4', 't8', 't13', 't16', 't29']);
  });
});
