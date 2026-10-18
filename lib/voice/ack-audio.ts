// The acknowledgments' audio: synthesized once per TTS + voice and cached on
// disk (.voice-cache/acks). A thinking filler is its beats, each its own
// clip, joined with silence (ackBeats, joinBeats; Lorenzo, 17 Oct); any other
// acknowledgment is one clip. Used by the agent and scripts/voice-filler-demo.ts.
//
// Shipped clips (voice deploy, 18 Oct): the default voice's clips are
// pre-rendered into assets/voice/acks (scripts/voice-render-acks.ts) and
// tracked, so they are in the worker's image; they are read first. The hosted
// worker passes synthesize: false (VOICE_ACK_SYNTH=0) — nothing is synthesized
// at cold start; an ack with a missing clip is left out and reported.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ALL_ACKS, FILLER_GAP_MS, FILLER_TAIL_MS, ackBeats, ackSpeechText, isThinkingFiller, joinBeats } from './acknowledge';
import { trimSilence } from './pcm';
import type { TTSProvider } from './types';

export const SHIPPED_ACKS_DIR = 'assets/voice/acks';

export const ackClipFile = (ttsName: string, voice: string, speech: string) =>
  `${ttsName}-${voice}-${createHash('sha1').update(speech).digest('hex').slice(0, 10)}.pcm`;

// Every clip the acks need, as the TTS reads it (one per beat, deduplicated).
export const ackClipTexts = (acks: readonly string[] = ALL_ACKS): string[] =>
  [...new Set(acks.flatMap(a => ackBeats(a).map(ackSpeechText)))];

export async function loadAcks(
  tts: TTSProvider, voice: string, take: (n: number) => boolean,
  o: { sampleRate: number; gapMs?: number; tailMs?: number; acks?: readonly string[]; cacheDir?: string;
    shippedDir?: string | null; synthesize?: boolean; onMissing?: (text: string) => void },
): Promise<Map<string, Uint8Array>> {
  const rate = o.sampleRate;
  const clips = new Map<string, Uint8Array | null>();
  const clip = async (text: string): Promise<Uint8Array | null> => {
    if (clips.has(text)) return clips.get(text)!;
    // Keyed on the text the TTS reads (a filler beat spells its ellipsis out).
    const speech = ackSpeechText(text);
    const name = ackClipFile(tts.name, voice, speech);
    const file = path.join(o.cacheDir ?? '.voice-cache/acks', name);
    const shipped = o.shippedDir === null ? null : path.join(o.shippedDir ?? SHIPPED_ACKS_DIR, name);
    let pcm: Uint8Array | null = null;
    if (shipped && existsSync(shipped)) pcm = new Uint8Array(readFileSync(shipped));
    else if (existsSync(file)) pcm = new Uint8Array(readFileSync(file));
    else if (o.synthesize === false) o.onMissing?.(speech);
    else if (take(speech.length)) {
      const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: rate });
      const parts: Uint8Array[] = [];
      utt.onAudio(p => parts.push(p));
      await utt.push(speech);
      await utt.end();
      pcm = new Uint8Array(Buffer.concat(parts));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, pcm);
    }
    // Trimmed at both ends as loaded: the TTS pads ~0.1–0.2s of silence each side,
    // which delays the first sound and lengthens the gap after the ack.
    const trimmed = pcm ? trimSilence(pcm, rate) : null;
    clips.set(text, trimmed);
    return trimmed;
  };
  const acks = new Map<string, Uint8Array>();
  for (const ack of o.acks ?? ALL_ACKS) {
    const beats: Uint8Array[] = [];
    for (const b of ackBeats(ack)) {
      const c = await clip(b);
      if (c) beats.push(c);
    }
    if (beats.length !== ackBeats(ack).length) continue;   // the budget refused a beat: no such ack
    acks.set(ack, isThinkingFiller(ack) ? joinBeats(beats, rate, o.gapMs ?? FILLER_GAP_MS, o.tailMs ?? FILLER_TAIL_MS) : beats[0]);
  }
  return acks;
}
