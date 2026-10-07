import { describe, it, expect } from 'vitest';
import { clipVariants, scoreSignals } from '@/lib/voice/endpoint';

const LINE = 'Revenue grew 15% but margin fell. So I would split costs into COGS and operating costs, and check which grew fastest.';

describe('clipVariants', () => {
  const v = Object.fromEntries(clipVariants(LINE).map(c => [c.kind, c.text]));

  it('keeps a clean control', () => expect(v.clean).toBe(LINE));
  it('puts a thinking pause mid-sentence', () => expect(v.think).toMatch(/So I would split um, \[\[slnc 1200\]\] costs/));
  it('pauses after a complete sentence, then goes on (the hard case)', () => expect(v.boundary).toMatch(/margin fell\. \[\[slnc 1500\]\] So I/));
  it('pauses before the first figure', () => expect(v.number).toMatch(/grew \[\[slnc 800\]\] 15%/));
  it('self-corrects mid-answer', () => expect(v.correction).toMatch(/\[\[slnc 700\]\] actually, sorry, \[\[slnc 500\]\]/));
});

describe('scoreSignals', () => {
  it('times detection from the true end of speech', () => {
    const s = scoreSignals([{ kind: 'final', atMs: 10_600, transcript: 'a' }], 10_000);
    expect(s).toMatchObject({ detectionMs: 600, premature: [] });
  });

  it('counts an end-of-turn before speech ends as premature, and keeps looking for the real one', () => {
    const s = scoreSignals([
      { kind: 'final', atMs: 4_000, transcript: 'a' },
      { kind: 'final', atMs: 10_500, transcript: 'b' },
    ], 10_000);
    expect(s.premature).toEqual([4_000]);
    expect(s.detectionMs).toBe(500);
  });

  it('measures the eager lead and whether its transcript matched the final', () => {
    const s = scoreSignals([
      { kind: 'eager', atMs: 10_300, transcript: 'b' },
      { kind: 'final', atMs: 10_500, transcript: 'b' },
    ], 10_000);
    expect(s).toMatchObject({ eagerLeadMs: 200, eagerMatches: true, eagers: 1, resumed: 0 });
  });

  it('a resumed eager gives no lead (a cancelled draft)', () => {
    const s = scoreSignals([
      { kind: 'eager', atMs: 6_000, transcript: 'a' },
      { kind: 'resumed', atMs: 6_400 },
      { kind: 'final', atMs: 10_500, transcript: 'a b' },
    ], 10_000);
    expect(s).toMatchObject({ eagerLeadMs: null, eagers: 1, resumed: 1 });
  });

  it('no end-of-turn at all', () => {
    expect(scoreSignals([], 10_000).detectionMs).toBeNull();
  });
});
