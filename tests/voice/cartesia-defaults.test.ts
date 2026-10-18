// The interviewer's voice and model (Lorenzo, 18 Oct: voice 533b2990 on sonic-3.6, by ear).
import { describe, it, expect, vi } from 'vitest';
vi.mock('@cartesia/cartesia-js', () => ({ default: class {} }));
const { CARTESIA_MODEL, DEFAULT_VOICE_ID, CartesiaTTS, defaultVoiceId } = await import('@/lib/voice/cartesia');

describe('the voice defaults', () => {
  it('sonic-3.6 and the approved voice', () => {
    expect(CARTESIA_MODEL).toBe('sonic-3.6');
    expect(DEFAULT_VOICE_ID).toBe('533b2990-5b82-45a4-b9f2-367776972ca6');
  });
  it('CARTESIA_VOICE_ID overrides; unset or blank gives the approved voice — never a catalog pick', async () => {
    expect(await defaultVoiceId({ CARTESIA_VOICE_ID: 'other-voice' })).toBe('other-voice');
    expect(await defaultVoiceId({})).toBe(DEFAULT_VOICE_ID);
    expect(await defaultVoiceId({ CARTESIA_VOICE_ID: '  ' })).toBe(DEFAULT_VOICE_ID);
  });
  it('the TTS name carries the model, so the acknowledgment cache re-synthesizes on a model change', () => {
    expect(new CartesiaTTS('v').name).toBe('cartesia-sonic-3.6');
    expect(new CartesiaTTS('v', 'sonic-3.5').name).toBe('cartesia-sonic-3.5');
  });
});
