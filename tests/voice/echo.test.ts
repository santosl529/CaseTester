// The echo guard (Lorenzo, 19 Oct; sessions 97cc44af, f3b07c57 on laptop
// speakers): a barge whose words mostly follow the interviewer's own recent
// text, in order, is the room hearing the interviewer — not an interruption.
import { describe, it, expect } from 'vitest';
import { echoScore, isEcho, ECHO_MIN_SCORE } from '@/lib/voice/echo';

const OPENING = 'Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period.';

describe('echoScore', () => {
  it('scores the interviewer heard back through the mic near 1 (numbers, "%" and "&" as speech-to-text writes them)', () => {
    expect(echoScore('chain with', [OPENING])).toBe(1);                                  // 97cc44af
    expect(echoScore('a specialty coffee chain with two hundred locations', [OPENING])).toBe(1);
    expect(echoScore('brew and bean a specialty coffee chain', [OPENING])).toBe(1);
    expect(echoScore('declined from twenty four percent to six percent', [OPENING])).toBe(1);
    expect(echoScore('profit margin has decline from twenty four', [OPENING])).toBeGreaterThanOrEqual(ECHO_MIN_SCORE);   // a slip in the STT
  });

  it('scores a real interruption low', () => {
    expect(echoScore('wait, sorry, I have a question', [OPENING])).toBeLessThan(ECHO_MIN_SCORE);
    expect(echoScore('hold on, did you say twenty four percent?', [OPENING])).toBeLessThan(ECHO_MIN_SCORE);
    expect(echoScore('sorry can you repeat the margin numbers', [OPENING])).toBeLessThan(ECHO_MIN_SCORE);
  });

  it('needs the words in order, not just present', () => {
    expect(echoScore('locations coffee client your', [OPENING])).toBeLessThan(ECHO_MIN_SCORE);
  });

  it('nothing said recently, or nothing transcribed: no echo', () => {
    expect(echoScore('chain with', [])).toBe(0);
    expect(isEcho('', [OPENING])).toBe(false);
    expect(isEcho('chain with', [OPENING])).toBe(true);
  });
});
