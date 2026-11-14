// Deepgram model training off (Lorenzo, 13 Nov: "turn off deepgram … model training"): every listen connection
// carries mip_opt_out=true, so the candidate's audio is kept only while it is transcribed and never used to train
// Deepgram's models (Model Improvement Program, https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program).
import { describe, it, expect } from 'vitest';
import { fluxConnectArgs, novaConnectArgs } from '@/lib/voice/deepgram';

describe('Deepgram connections opt out of model training', () => {
  it('Flux (the live interview STT) sends mip_opt_out=true, with or without options', () => {
    expect(fluxConnectArgs({ encoding: 'pcm_s16le', sampleRate: 16000 }, {}).mip_opt_out).toBe(true);
    expect(fluxConnectArgs({ encoding: 'pcm_s16le', sampleRate: 16000 }, { eotThreshold: 0.8, keyterms: ['COGS'] })).toMatchObject({ mip_opt_out: true, eot_threshold: 0.8, keyterm: ['COGS'] });
  });
  it('Nova-3 (the spike fallback) sends it too', () => {
    expect(novaConnectArgs({ encoding: 'pcm_s16le', sampleRate: 16000 }, {}).mip_opt_out).toBe(true);
  });
});
