import { describe, it, expect } from 'vitest';
import { rewriteSystemLanguage } from '@/lib/orchestrator/audit';

describe('system language rewrite (round-3 fix 5)', () => {
  it("rewrites Ines's 'I don't have anything flagged on that'", () => {
    expect(rewriteSystemLanguage("I don't have anything flagged on that. Walk me through your structure.").text)
      .toBe("That's not in the information I have. Walk me through your structure.");
  });

  it('rewrites notes/ledger references', () => {
    expect(rewriteSystemLanguage("That isn't in my notes.").text).toBe("That isn't in the information I have.");
    expect(rewriteSystemLanguage('The ledger shows nothing on volume.').text).toBe('The data shows nothing on volume.');
  });

  it('leaves the candidate flagging something alone', () => {
    const t = "You flagged menu prices earlier — what's your read?";
    expect(rewriteSystemLanguage(t)).toEqual({ text: t, rewrites: [] });
  });
});
