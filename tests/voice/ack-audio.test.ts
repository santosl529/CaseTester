// The acknowledgments' audio (17 Oct): a filler is its beats, each synthesized
// once (ellipsis spelled out) and joined with the gap and tail in code.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ackClipFile, ackClipTexts, loadAcks } from '@/lib/voice/ack-audio';
import { FakeTTS } from '@/lib/voice/fake-tts';
import type { PcmFormat, TTSProvider } from '@/lib/voice/types';

const RATE = 24000;
class CountingTTS implements TTSProvider {
  readonly name = 'fake-count';
  said: string[] = [];
  private inner = new FakeTTS(80, 0);
  async open(format: PcmFormat) {
    const u = await this.inner.open(format);
    return { ...u, push: async (t: string) => { this.said.push(t); await u.push(t); } };
  }
}
const ms = (pcm: Uint8Array) => Math.round(pcm.length / 2 / RATE * 1000);

describe('loadAcks', () => {
  it('synthesizes each beat once, as its own clip, and joins them: gap between, tail after', async () => {
    const tts = new CountingTTS();
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'acks-'));
    const acks = await loadAcks(tts, 'v', () => true, { sampleRate: RATE, gapMs: 400, tailMs: 300, cacheDir, shippedDir: null });
    expect(tts.said.filter(s => s.endsWith('...')).sort()).toEqual(['Alright...', 'Hmm...', 'Let me see...', 'Mhm...', 'Okay...']);
    expect(tts.said).toContain('Take your time.');
    // "Hmm..." is 6 chars at 80ms = 480ms of tone; "Okay..." 7 chars = 560ms.
    expect(ms(acks.get('Hmm…')!)).toBeCloseTo(480 + 300, -1);
    expect(ms(acks.get('Hmm… okay…')!)).toBeCloseTo(480 + 400 + 560 + 300, -1);
    expect(ms(acks.get('Take your time.')!)).toBeCloseTo(15 * 80, -1);   // whole, no tail added
    // Cached: a second load synthesizes nothing.
    const again = new CountingTTS();
    await loadAcks(again, 'v', () => true, { sampleRate: RATE, cacheDir, shippedDir: null });
    expect(again.said).toEqual([]);
    expect(readdirSync(cacheDir).length).toBe(tts.said.length);
  });

  it('leaves out an ack whose beat the budget refused', async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'acks-'));
    const acks = await loadAcks(new CountingTTS(), 'v', n => n !== 'Okay...'.length, { sampleRate: RATE, cacheDir, shippedDir: null });
    expect(acks.has('Okay…')).toBe(false);
    expect(acks.has('Hmm… okay…')).toBe(false);
    expect(acks.has('Hmm…')).toBe(true);
  });
});

describe('shipped clips (voice deploy)', () => {
  it('reads the shipped clips first, and with synthesis off speaks nothing new — a missing clip is reported, its ack left out', async () => {
    const shippedDir = mkdtempSync(path.join(tmpdir(), 'shipped-'));
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'acks-'));
    // Render everything into the shipped dir (as scripts/voice-render-acks.ts does), then drop one clip.
    await loadAcks(new CountingTTS(), 'v', () => true, { sampleRate: RATE, cacheDir: shippedDir, shippedDir: null });
    expect(readdirSync(shippedDir).sort()).toEqual(ackClipTexts().map(t => ackClipFile('fake-count', 'v', t)).sort());
    rmSync(path.join(shippedDir, ackClipFile('fake-count', 'v', 'Okay...')));
    const tts = new CountingTTS();
    const missing: string[] = [];
    const acks = await loadAcks(tts, 'v', () => true, { sampleRate: RATE, cacheDir, shippedDir, synthesize: false, onMissing: t => missing.push(t) });
    expect(tts.said).toEqual([]);
    expect(missing).toEqual(['Okay...']);
    expect(acks.has('Okay…')).toBe(false);
    expect(acks.has('Hmm…')).toBe(true);
    expect(acks.has('Take your time.')).toBe(true);
    expect(readdirSync(cacheDir)).toEqual([]);
  });
});
