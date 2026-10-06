import { describe, it, expect } from 'vitest';
import {
  TIME_WARNING_SCRIPTS, CLOSE_SCRIPTS, OPENING_INVITATIONS, GRACE_ASK_SCRIPTS, pickScript, buildOpeningMessage,
  hasCloseCue } from '@/lib/agent/prompts/scripts';
import { asksRecommendationAsk } from '@/lib/orchestrator/spoken-close';

describe('pickScript', () => {
  it('returns a script from the given pool', () => {
    const pick = pickScript(TIME_WARNING_SCRIPTS, 'session-abc');
    expect(TIME_WARNING_SCRIPTS).toContain(pick);
  });

  it('is deterministic for a given seed (stable within a session)', () => {
    const a = pickScript(CLOSE_SCRIPTS, 'session-xyz');
    const b = pickScript(CLOSE_SCRIPTS, 'session-xyz');
    expect(a).toBe(b);
  });

  it('varies across different seeds (anti-tell rotation, Rule 7)', () => {
    const picks = new Set(
      ['session-1', 'session-2', 'session-3', 'session-4', 'session-5', 'session-6'].map(s =>
        pickScript(TIME_WARNING_SCRIPTS, s),
      ),
    );
    // With 3 phrases and 6 varied seeds, expect more than one distinct phrase
    expect(picks.size).toBeGreaterThan(1);
  });

  it('has at least 3 phrases per pool (anti-tell minimum)', () => {
    expect(TIME_WARNING_SCRIPTS.length).toBeGreaterThanOrEqual(3);
    expect(CLOSE_SCRIPTS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildOpeningMessage', () => {
  const PROMPT = 'Your client is Brew & Bean, a coffee chain. Margin fell from 24% to 6% while revenue grew 15%. How would you approach this?';

  it('includes the case prompt VERBATIM so the candidate always sees the scenario', () => {
    const opening = buildOpeningMessage(PROMPT, 'session-1');
    expect(opening).toContain(PROMPT);
    // the exact numbers the candidate needs are present
    expect(opening).toContain('24% to 6%');
    expect(opening).toContain('15%');
  });

  it('appends an invitation from the pool', () => {
    const opening = buildOpeningMessage(PROMPT, 'session-1');
    const invitation = OPENING_INVITATIONS.find(i => opening.endsWith(i));
    expect(invitation).toBeDefined();
  });

  it('is deterministic for a given session id', () => {
    expect(buildOpeningMessage(PROMPT, 'sX')).toBe(buildOpeningMessage(PROMPT, 'sX'));
  });
});

describe('GRACE_ASK_SCRIPTS (Rule 12 time-up grace ask, v4.3)', () => {
  it('every line reads as a recommendation ask and never as a close', () => {
    for (const s of GRACE_ASK_SCRIPTS) {
      expect(asksRecommendationAsk(s), s).toBe(true);
      expect(hasCloseCue(s), s).toBe(false);
    }
  });
});

// Batch 7 (Nikhil turn 4, Maya turn 11): the mid-case release of an earlier
// request used the end-of-case lead-in "Before we wrap, on what you asked about
// earlier:". Stale releases get their own pool.
describe('STALE_RELEASE_LEADINS', () => {
  it('never sound like the end of the case and carry no numerals', async () => {
    const { STALE_RELEASE_LEADINS } = await import('@/lib/agent/prompts/scripts');
    expect(STALE_RELEASE_LEADINS.length).toBeGreaterThan(1);
    for (const line of STALE_RELEASE_LEADINS) {
      expect(line).not.toMatch(/\bwrap|before we (finish|close|end)\b/i);
      expect(line).not.toMatch(/\d/);
    }
  });
});
