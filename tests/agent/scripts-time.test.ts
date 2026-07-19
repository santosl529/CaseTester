import { describe, it, expect } from 'vitest';
import { alreadySignaledTimeOrRec } from '@/lib/agent/prompts/scripts';

describe('alreadySignaledTimeOrRec (time-warning double-fire guard)', () => {
  it('detects the model self-warning from the live run', () => {
    // The model said this; the orchestrator must NOT then append its own warning.
    expect(alreadySignaledTimeOrRec("We're nearly out of time. Bring it home — what's your recommendation to the CEO?")).toBe(true);
  });

  it('detects a plain recommendation ask', () => {
    expect(alreadySignaledTimeOrRec("What's your bottom-line recommendation to the CEO?")).toBe(true);
  });

  it('does NOT fire on ordinary mid-case speech', () => {
    expect(alreadySignaledTimeOrRec('Walk me through how you got that number.')).toBe(false);
  });

  it('does NOT fire when "recommendation" appears only descriptively mid-case', () => {
    expect(alreadySignaledTimeOrRec('That recommendation would need pricing data to support it.')).toBe(false);
  });
});
