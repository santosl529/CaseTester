import { it, expect } from 'vitest';
import { toWords } from '@/lib/voice/cartesia';

it('converts Cartesia word timestamps (seconds) to ms words', () => {
  expect(toWords({ words: ['There', 'are'], start: [0, 0.21], end: [0.2, 0.35] }))
    .toEqual([{ word: 'There', startMs: 0, endMs: 200 }, { word: 'are', startMs: 210, endMs: 350 }]);
});
