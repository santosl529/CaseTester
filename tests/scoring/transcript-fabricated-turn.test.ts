import { describe, it, expect } from 'vitest';
import { repairTranscript } from '@/lib/scoring/transcript-artifacts';

describe('repairTranscript — fabricated candidate continuation inside an interviewer turn', () => {
  it('cuts the fabricated continuation so the judge never scores it as candidate content', () => {
    const { turns, artifacts } = repairTranscript([
      { role: 'candidate', text: 'Menu prices never moved, so it is a pass-through failure.', turnIndex: 23 },
      {
        role: 'interviewer',
        text: 'Beyond pricing, what else could the client do?\n\nuser Renegotiate bean contracts and hedge forward.',
        turnIndex: 24,
      },
      { role: 'candidate', text: 'Yes, let me pull it together.', turnIndex: 25 },
    ]);
    expect(turns.map(t => t.text)).toEqual([
      'Menu prices never moved, so it is a pass-through failure.',
      'Beyond pricing, what else could the client do?',
      'Yes, let me pull it together.',
    ]);
    expect(artifacts).toEqual([{ type: 'fabricated_turn', turnIndex: 24 }]);
  });

  it('never touches candidate turns', () => {
    const text = 'Two options.\nUser research would tell us elasticity.';
    const { turns, artifacts } = repairTranscript([{ role: 'candidate', text, turnIndex: 3 }]);
    expect(turns[0].text).toBe(text);
    expect(artifacts).toEqual([]);
  });

  it('drops an interviewer turn that was entirely fabricated', () => {
    const { turns, artifacts } = repairTranscript([
      { role: 'candidate', text: 'Here is my structure.', turnIndex: 1 },
      { role: 'interviewer', text: '\nuser I would start with costs.', turnIndex: 2 },
    ]);
    expect(turns.map(t => t.turnIndex)).toEqual([1]);
    expect(artifacts).toEqual([{ type: 'fabricated_turn', turnIndex: 2 }]);
  });
});
