import { describe, it, expect } from 'vitest';
import {
  TIME_WARNING_SCRIPTS, CLOSE_SCRIPTS, OPENING_INVITATIONS, GRACE_ASK_SCRIPTS, pickScript, buildOpeningMessage,
  asksForRecommendation, hasCloseCue,
} from '@/lib/agent/prompts/scripts';

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
      expect(asksForRecommendation(s), s).toBe(true);
      expect(hasCloseCue(s), s).toBe(false);
    }
  });
});

// Batch 6 (Claire, adaptive thinking): the model called show_exhibit with no
// words and the candidate got the exhibit with a bare "Go on."
describe('wordlessExhibitLine', () => {
  it('hands over an exhibit shown with no words', async () => {
    const { wordlessExhibitLine, EXHIBIT_FRAME_SCRIPTS } = await import('@/lib/agent/prompts/scripts');
    expect(EXHIBIT_FRAME_SCRIPTS).toContain(wordlessExhibitLine({ spokenText: '', exhibitShown: true, ended: false, seed: 's' }));
  });
  it('leaves spoken turns, exhibit-free turns, and the closing turn alone', async () => {
    const { wordlessExhibitLine } = await import('@/lib/agent/prompts/scripts');
    expect(wordlessExhibitLine({ spokenText: 'What stands out?', exhibitShown: true, ended: false, seed: 's' })).toBeNull();
    expect(wordlessExhibitLine({ spokenText: '', exhibitShown: false, ended: false, seed: 's' })).toBeNull();
    expect(wordlessExhibitLine({ spokenText: '', exhibitShown: true, ended: true, seed: 's' })).toBeNull();
  });
});
