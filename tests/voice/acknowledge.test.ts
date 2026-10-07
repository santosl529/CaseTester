import { describe, it, expect } from 'vitest';
import { ACKS, pickAck, shouldAcknowledge } from '@/lib/voice/acknowledge';

describe('instant acknowledgment', () => {
  it('rotates through neutral backchannels and never repeats the last one', () => {
    let last: string | null = null;
    for (let i = 0; i < 20; i++) {
      const a = pickAck(`s:${i}`, last);
      expect(ACKS).toContain(a);
      expect(a).not.toBe(last);
      last = a;
    }
  });

  it('never grades', () => {
    for (const a of ACKS) expect(a).not.toMatch(/great|good|nice|right answer|perfect|exactly/i);
  });

  it('acknowledges ordinary case talk', () => {
    expect(shouldAcknowledge('COGS went from 42 to 58, so sixteen points.')).toBe(true);
    expect(shouldAcknowledge("I'd start with the cost breakdown.")).toBe(true);
  });

  it('stays silent on distress or hostility — the conduct response comes first', () => {
    expect(shouldAcknowledge("Honestly I'm going to bomb every interview I do. I don't know why I'm even doing this.")).toBe(false);
    expect(shouldAcknowledge("You're an idiot, just answer the question.")).toBe(false);
  });

  it('stays silent on an empty turn', () => {
    expect(shouldAcknowledge('   ')).toBe(false);
  });
});

import { FILLERS, FILLER_DELAY_MS, pickFiller, fillerStartMs } from '@/lib/voice/acknowledge';

describe('thinking filler', () => {
  it('is spoken only when the model is not in before the delay', () => {
    expect(fillerStartMs(1000, 1200)).toBeNull();                       // model in first
    expect(fillerStartMs(1000, 1000 + FILLER_DELAY_MS + 1)).toBe(1000 + FILLER_DELAY_MS);
    expect(fillerStartMs(1000, null)).toBe(1000 + FILLER_DELAY_MS);
  });

  it('never repeats the last filler, never grades or promises data', () => {
    let last: string | null = null;
    for (let i = 0; i < 12; i++) { const f = pickFiller(`s:${i}`, last); expect(f).not.toBe(last); last = f; }
    for (const f of FILLERS) expect(f).not.toMatch(/good|great|right|data|share|show|answer/i);
  });
});
