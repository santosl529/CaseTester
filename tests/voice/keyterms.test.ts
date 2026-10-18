// Flux keyterm prompting (Lorenzo's brief, 17 Oct; 9ccf0836 heard "Cogshare").
import { describe, it, expect, vi } from 'vitest';

const connects: Record<string, unknown>[] = [];
vi.mock('@deepgram/sdk', () => ({
  DeepgramClient: class {
    listen = { v2: { connect: async (args: Record<string, unknown>) => {
      connects.push(args);
      return { on: () => {}, connect: () => {}, waitForOpen: async () => {}, sendMedia: () => {}, sendCloseStream: () => {}, close: () => {} };
    } } };
  },
}));

const { keytermsFor, GENERIC_KEYTERMS, MAX_KEYTERMS } = await import('@/lib/voice/keyterms');
const { DeepgramFluxSTT } = await import('@/lib/voice/deepgram');
const { getCaseById } = await import('@/lib/cases/loader');

describe('the keyterms', () => {
  it('generic first (COGS, MECE), then the case\'s own names, deduped, capped', () => {
    const k = keytermsFor(getCaseById('prof-001'));
    expect(k.slice(0, 2)).toEqual(['COGS', 'MECE']);
    expect(k).toContain('Brew & Bean');
    expect(new Set(k).size).toBe(k.length);
    expect(keytermsFor({ sttKeyterms: Array.from({ length: 80 }, (_, i) => `term${i}`) })).toHaveLength(MAX_KEYTERMS);
    expect(keytermsFor({})).toEqual([...GENERIC_KEYTERMS]);
  });
  it.each(['prof-001', 'prof-002', 'entry-001', 'pricing-001', 'launch-001'])('%s has its own names', id => {
    expect(getCaseById(id).sttKeyterms.length).toBeGreaterThan(0);
  });
});

describe('Flux is opened with them', () => {
  it('as the keyterm connect argument; none sent when there are none', async () => {
    await new DeepgramFluxSTT({ keyterms: ['COGS', 'MECE'] }).open({ encoding: 'pcm_s16le', sampleRate: 16000 });
    await new DeepgramFluxSTT({}).open({ encoding: 'pcm_s16le', sampleRate: 16000 });
    expect(connects[0]).toMatchObject({ model: 'flux-general-en', keyterm: ['COGS', 'MECE'] });
    expect(connects[1]).not.toHaveProperty('keyterm');
  });
});
