// Filler demo (17 Oct): every thinking filler alone, and chosen turns of a
// recorded voice session re-voiced under the current rules — the candidate's
// last sentence (macOS `say`, free), the end-of-turn pause as measured, the
// filler (the agent's own clips: lib/voice/ack-audio.ts), then the reply's
// segments as Cartesia speaks them (connector included), each starting when
// that turn's record says it was ready. To judge the pauses by ear.
//
// Paid: Cartesia characters for any clip not yet cached (.voice-cache/acks,
// .voice-cache/demo); the count is printed and added to the monthly ledger.
//
//   npx tsx --env-file=<.env.local> scripts/voice-filler-demo.ts \
//     --session="Case Interview Runs/voice-live/2026-10-17/314295e0-0170-4a80-9f44-1bdc3788a666.jsonl" \
//     --turns=4,7,9 --out="Case Interview Runs/voice-demos/2026-10-17-fillers-v2" [--gap=400] [--tail=300] [--cap=1000] [--also-so]
//
// --also-so: where the connector picked for a turn is none, also render the turn
// with "So," (example-turn-N-so.wav), to hear both.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ACKS, FILLER_GAP_MS, FILLER_TAIL_MS, ackKind, isThinkingFiller, pickAck, shouldAcknowledge } from '@/lib/voice/acknowledge';
import { loadAcks } from '@/lib/voice/ack-audio';
import { NO_CONNECTOR, pickConnector, spokenWithConnector } from '@/lib/voice/connector';
import { CartesiaTTS, defaultVoiceId } from '@/lib/voice/cartesia';
import { RunCharCap } from '@/lib/voice/tts-budget';
import { trimSilence } from '@/lib/voice/pcm';
import { sayAfterAckReason } from '@/lib/orchestrator/say-after-ack';
import type { TurnRecord } from '@/lib/voice/records';

const RATE = 24000;
const flag = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const SAY_VOICE = flag('say-voice') ?? 'Samantha';

type Seg = { kind: string; text: string | null; heardChars: number };

function wav(pcm: Uint8Array): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length)]);
}
const msOf = (pcm: Uint8Array) => Math.round((pcm.length / 2 / RATE) * 1000);
// The playout's lead-in trim (playout.ts): audio before the first 5ms window above 0.02 RMS, keeping 20ms.
function trimLead(pcm: Uint8Array): Uint8Array {
  const v = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  const win = RATE * 0.005;
  for (let s = 0; s < v.length && s < RATE * 0.6; s += win) {
    let sum = 0;
    for (let i = s; i < Math.min(s + win, v.length); i++) sum += (v[i] / 32768) ** 2;
    if (Math.sqrt(sum / win) > 0.02) return pcm.subarray(Math.max(0, s - RATE * 0.02) * 2);
  }
  return pcm;
}
function sayClip(text: string): Uint8Array {
  const dir = path.join(tmpdir(), `say-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const aiff = path.join(dir, 'c.aiff'), out = path.join(dir, 'c.wav');
  execFileSync('say', ['-v', SAY_VOICE, '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, out]);
  const b = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  const data = b.indexOf('data');
  return trimSilence(new Uint8Array(b.subarray(data + 8)), RATE);   // the candidate stops speaking at its end
}

async function main() {
  const session = flag('session')!, out = flag('out')!;
  const turns = (flag('turns') ?? '').split(',').filter(Boolean).map(Number);
  const gapMs = Number(flag('gap') ?? FILLER_GAP_MS), tailMs = Number(flag('tail') ?? FILLER_TAIL_MS);
  const sessionId = session.match(/([0-9a-f-]{36})\.jsonl$/)?.[1] ?? '';
  const records = readFileSync(session, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as TurnRecord).filter(r => 'candidateText' in r);
  const segTurns = (JSON.parse(readFileSync(session.replace(/[^/]+\.jsonl$/, f => `${f.split('-')[0]}-segments.json`), 'utf8')) as { turns: { turnSeq: number; segments: Seg[] }[] }).turns;

  const ledger = await (await import('@/lib/voice/tts-ledger-store')).openTtsLedger();
  const run = new RunCharCap(Number(flag('cap') ?? 1000));
  let spent = 0;
  const take = (n: number) => { const ok = run.take(n) && ledger.take(n); if (ok) spent += n; return ok; };
  const voice = await defaultVoiceId();
  const tts = new CartesiaTTS(voice);
  mkdirSync(out, { recursive: true });
  const notes: string[] = [];

  // Every filler alone, as the agent builds it.
  const acks = await loadAcks(tts, voice, take, { sampleRate: RATE, gapMs, tailMs });
  for (const a of ACKS) {
    const pcm = acks.get(a);
    if (!pcm) throw new Error(`no audio for ${a} (budget?)`);
    writeFileSync(path.join(out, `filler-${a.toLowerCase().replace(/…/g, '').trim().replace(/\s+/g, '-')}.wav`), wav(pcm));
  }
  notes.push(`Fillers: ${ACKS.map(a => `${a} ${(msOf(acks.get(a)!) / 1000).toFixed(2)}s`).join(' · ')} (lengths include the ${tailMs}ms tail; ${gapMs}ms between beats).`);

  // A reply segment as Cartesia speaks it (cached by voice + text).
  const speak = async (text: string): Promise<Uint8Array> => {
    const file = path.join('.voice-cache/demo', `${createHash('sha1').update(`${voice}:${text}`).digest('hex').slice(0, 12)}.pcm`);
    if (existsSync(file)) return trimLead(new Uint8Array(readFileSync(file)));
    if (!take(text.length)) throw new Error('character cap');
    const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: RATE });
    const parts: Uint8Array[] = [];
    utt.onAudio(p => parts.push(p));
    await utt.push(text);
    await utt.end();
    const pcm = new Uint8Array(Buffer.concat(parts));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, pcm);
    return trimLead(pcm);
  };

  // The session under the current rules, turn by turn: filler, connector history, say rule.
  let lastAck: string | null = null;
  let recent: string[] = [];
  for (const r of records) {
    const ack: string | null = shouldAcknowledge(r.candidateText) ? pickAck(`${sessionId}:${r.turnSeq}`, lastAck, ackKind(r.candidateText)) : null;
    if (ack) lastAck = ack;
    const segs = segTurns.find(t => t.turnSeq === r.turnSeq)!.segments.flatMap(s => {
      if (s.kind !== 'say' || !s.text) return [s];
      const kept = s.text.split(/(?<=[.!?])\s+/).filter(x => sayAfterAckReason(x, { candidateMessage: r.candidateText }) === null);
      return kept.length ? [{ ...s, text: kept.join(' ') }] : [];
    });
    const first = segs.find(s => s.text);
    let connector = '';
    if (isThinkingFiller(ack) && first?.text) {
      connector = pickConnector({ seed: `${sessionId}:${r.turnSeq}:connector`, filler: ack!, segmentText: first.text, recent });
      recent = [...recent, connector].slice(-2);
    }
    if (!turns.includes(r.turnSeq)) continue;

    const variants: [string, string][] = [[connector, `example-turn-${r.turnSeq}.wav`]];
    if (process.argv.includes('--also-so') && connector === NO_CONNECTOR && isThinkingFiller(ack)
      && pickConnector({ seed: 'x', filler: ack!, segmentText: first!.text!, recent: [NO_CONNECTOR, NO_CONNECTOR] }) === 'So,') {
      variants.push(['So,', `example-turn-${r.turnSeq}-so.wav`]);
    }
    for (const [conn, name] of variants) {
      // The timeline, ms from the start of the clip.
      const lastSentence = r.candidateText.split(/(?<=[.!?])\s+/).filter(Boolean).at(-1)!;
      const cand = sayClip(lastSentence);
      const speechEnd = msOf(cand);
      const turnStart = speechEnd + (r.endpointMs ?? 0) + r.queueWaitMs;
      const ttsLatency = r.ttsFirstAudioMs !== null && r.firstSegmentAcceptedMs !== null ? r.ttsFirstAudioMs - r.firstSegmentAcceptedMs : 145;
      const m = r.marks;
      const ready = (kind: string) => turnStart + ttsLatency + (kind === 'tail' ? m.tail_delivered : kind === 'data' ? (m.data_line_delivered ?? m.first_useful_delivered ?? m.first_delivered) : m.first_delivered);
      const placed: { at: number; pcm: Uint8Array; label: string }[] = [{ at: 0, pcm: cand, label: `candidate (macOS say): "${lastSentence}"` }];
      let cursor = speechEnd + (r.endpointMs ?? 0);
      if (ack) {
        placed.push({ at: cursor, pcm: acks.get(ack)!, label: `filler: ${ack}` });
        cursor += msOf(acks.get(ack)!);
      }
      for (const [i, s] of segs.entries()) {
        if (!s.text) continue;
        const text = i === segs.indexOf(first!) ? spokenWithConnector(conn, s.text) : s.text;
        const pcm = await speak(text);
        const at = Math.max(cursor, ready(s.kind));
        placed.push({ at, pcm, label: `${s.kind === 'tail' ? 'question' : s.kind}: "${text}"` });
        cursor = at + msOf(pcm);
      }
      const total = new Int16Array(Math.round(((cursor + 500) / 1000) * RATE));
      for (const p of placed) {
        const v = new Int16Array(p.pcm.buffer, p.pcm.byteOffset, Math.floor(p.pcm.length / 2));
        const o = Math.round((p.at / 1000) * RATE);
        for (let i = 0; i < v.length && o + i < total.length; i++) total[o + i] = Math.max(-32768, Math.min(32767, total[o + i] + v[i]));
      }
      writeFileSync(path.join(out, name), wav(new Uint8Array(total.buffer)));
      notes.push(`\n${name} (${r.candidateText.split(/\s+/).length}-word answer; end of turn ${r.endpointMs}ms as measured; connector ${conn ? `"${conn}"` : 'none'}${name.endsWith('-so.wav') ? ' — forced for listening; the rules picked none' : ' — as the rules pick it'}):`);
      for (const p of placed) notes.push(`  ${(p.at / 1000).toFixed(2)}s–${((p.at + msOf(p.pcm)) / 1000).toFixed(2)}s  ${p.label}`);
    }
  }
  tts.close();
  await ledger.flush();
  notes.push(`\nCartesia characters this run: ${spent} (monthly ledger now ${ledger.used}).`);
  writeFileSync(path.join(out, 'timeline.txt'), notes.join('\n') + '\n');
  console.log(notes.join('\n'));
  process.exit(0);
}

void main();
