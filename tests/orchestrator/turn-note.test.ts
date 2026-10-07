import { describe, it, expect } from 'vitest';
import { turnNoteFor } from '@/lib/orchestrator/turn-note';

describe('turnNoteFor', () => {
  it('says nothing on an ordinary text turn', () => {
    expect(turnNoteFor('model')).toBeUndefined();
  });

  it('tells the model the acknowledgment was already spoken', () => {
    const n = turnNoteFor('model', 'Mm-hm.')!;
    expect(n).toContain('"Mm-hm."');
    expect(n).toMatch(/don't acknowledge again/i);
  });

  it('keeps the recommendation-ask note and adds the acknowledgment to it', () => {
    const n = turnNoteFor('rec_ask', 'Got it.')!;
    expect(n).toContain('asks the candidate for their recommendation');
    expect(n).toContain('"Got it."');
  });
});
