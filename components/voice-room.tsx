'use client';
// The minimal voice interview page (spec 2026-10-08-voice-phase-b §6): mic in,
// interviewer audio out, captions, exhibits, End, optional scoring after a
// natural end. The browser tells the agent when audio can play (ready /
// audio_blocked), confirms each exhibit once rendered, and measures its own
// end-of-speech → first-sound time as a cross-check (headphones required).
import { useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { Button } from '@/components/ui/button';
import { ExhibitTable } from '@/components/exhibit-table';
import { applyMessage, initialView } from '@/components/voice-view';
import { DATA_TOPIC, type ClientMessage, type ServerMessage } from '@/lib/voice/protocol';

const STATE_LABEL: Record<string, string> = {
  idle: 'Not started', connecting: 'Connecting…', waiting: 'Waiting for audio', listening: 'Listening',
  thinking: 'Thinking', speaking: 'Speaking', ended: 'Ended',
};
const MIC_LOUD = 0.02;       // the agent's VAD threshold
const REMOTE_LOUD = 0.01;

// RMS level of a media track, sampled on demand.
function levelMeter(ctx: AudioContext, track: MediaStreamTrack): () => number {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  return () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const x of buf) sum += x * x;
    return Math.sqrt(sum / buf.length);
  };
}

export function VoiceRoom({ sessionId, casePrompt }: { sessionId: string; casePrompt: string | null }) {
  const router = useRouter();
  const [view, dispatch] = useReducer(applyMessage, initialView);
  const [local, setLocal] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle');
  const [needsClick, setNeedsClick] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement | null>(null);
  const confirmed = useRef(new Set<string>());
  const timing = useRef<{ ctx: AudioContext | null; mic: (() => number) | null; remote: (() => number) | null; lastMicLoudAt: number; pending: { turnSeq: number; from: number } | null; timer: number | null }>(
    { ctx: null, mic: null, remote: null, lastMicLoudAt: 0, pending: null, timer: null },
  );

  const send = (m: ClientMessage) => {
    const room = roomRef.current;
    if (!room) return;
    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(m)), { reliable: true, topic: DATA_TOPIC }).catch(() => {});
  };

  // An exhibit counts as shown once it has rendered (spec §5.3): confirm after commit.
  useEffect(() => {
    for (const e of view.exhibits) {
      const key = `${e.turnSeq}:${e.id}`;
      if (confirmed.current.has(key)) continue;
      confirmed.current.add(key);
      send({ type: 'exhibit_shown', turnSeq: e.turnSeq, exhibitId: e.id });
    }
  }, [view.exhibits]);

  // Client cross-check (spec §7): when the agent starts thinking, the last loud
  // mic moment is the end of speech; the first loud interviewer audio after it
  // is the first sound, both on this clock.
  useEffect(() => {
    if (view.phase === 'thinking') timing.current.pending = { turnSeq: view.stateTurnSeq, from: timing.current.lastMicLoudAt };
  }, [view.phase, view.stateTurnSeq]);

  useEffect(() => () => {
    if (timing.current.timer !== null) window.clearInterval(timing.current.timer);
    void timing.current.ctx?.close();
    roomRef.current?.disconnect();
  }, []);

  async function start() {
    setLocal('connecting');
    setProblem(null);
    const res = await fetch(`/api/voice/${sessionId}/token`, { method: 'POST' });
    if (!res.ok) {
      setProblem(res.status === 409 ? 'This case is no longer active.' : res.status === 503 ? 'Voice is not configured on the server.' : 'Could not start the voice session.');
      setLocal('idle');
      return;
    }
    const { url, token } = await res.json() as { url: string; token: string };
    const room = new Room({ adaptiveStream: false });
    roomRef.current = room;
    const dec = new TextDecoder();
    room.on(RoomEvent.DataReceived, (payload, _p, _k, topic) => {
      if (topic !== DATA_TOPIC) return;
      try { dispatch(JSON.parse(dec.decode(payload)) as ServerMessage); } catch { /* not ours */ }
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      audioBox.current?.appendChild(track.attach());
      const t = timing.current;
      if (t.ctx) t.remote = levelMeter(t.ctx, track.mediaStreamTrack);
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (room.canPlaybackAudio) return;
      send({ type: 'audio_blocked' });
      setNeedsClick(true);
    });
    room.on(RoomEvent.Disconnected, () => setLocal(l => (l === 'live' ? 'ended' : l)));
    try {
      timing.current.ctx = new AudioContext();
      await room.connect(url, token);
      await room.startAudio();
      const pub = await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      const micTrack = pub?.track?.mediaStreamTrack;
      if (micTrack && timing.current.ctx) timing.current.mic = levelMeter(timing.current.ctx, micTrack);
    } catch (e) {
      setProblem(e instanceof Error && e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not connect the audio.');
      room.disconnect();
      setLocal('idle');
      return;
    }
    timing.current.timer = window.setInterval(() => {
      const t = timing.current;
      const now = performance.now();
      if (t.mic && t.mic() > MIC_LOUD) t.lastMicLoudAt = now;
      if (t.pending && t.remote && t.remote() > REMOTE_LOUD) {
        send({ type: 'timing', turnSeq: t.pending.turnSeq, clientFirstSoundMs: Math.round(now - t.pending.from) });
        t.pending = null;
      }
    }, 20);
    setLocal('live');
    if (room.canPlaybackAudio) send({ type: 'ready' });
    else setNeedsClick(true);
  }

  async function enableAudio() {
    const room = roomRef.current;
    if (!room) return;
    await room.startAudio();
    if (room.canPlaybackAudio) {
      setNeedsClick(false);
      send({ type: 'ready' });
    }
  }

  async function end() {
    await fetch(`/api/voice/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    roomRef.current?.disconnect();
    setLocal('ended');
  }

  async function score() {
    setScoring(true);
    const res = await fetch(`/api/channel/${sessionId}/score`, { method: 'POST' });
    if (res.ok) router.push(`/case/${sessionId}/report`);
    else { setScoring(false); setProblem('Scoring failed — try again.'); }
  }

  const phase = local === 'ended' ? 'ended' : local === 'live' ? view.phase : local;
  const caseOver = view.phase === 'ended' || local === 'ended';

  return (
    <div className="h-full flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">{STATE_LABEL[phase] ?? phase}</span>
        <span className="text-xs text-neutral-500">Use headphones — the interviewer&apos;s voice on speakers can interrupt itself.</span>
      </div>

      {casePrompt && (
        <details className="text-sm">
          <summary className="text-xs text-neutral-500 cursor-pointer select-none">Case prompt</summary>
          <p className="mt-2 text-neutral-700 whitespace-pre-wrap">{casePrompt}</p>
        </details>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {view.captions.map(c => (
          <div key={`${c.who}:${c.turnSeq}`} className={c.who === 'interviewer' ? 'text-sm text-neutral-900' : 'text-sm text-neutral-500 text-right'}>
            <span className={c.final ? '' : 'opacity-70'}>{c.text}</span>
          </div>
        ))}
        {view.exhibits.map(e => <ExhibitTable key={e.id} exhibit={e} />)}
      </div>

      {(problem || view.error) && <p className="text-sm text-red-600">{problem ?? view.error}</p>}
      {view.endedReason && view.endedReason !== 'case_complete' && (
        <p className="text-sm text-neutral-600">The session ended ({view.endedReason.replace('_', ' ')}).</p>
      )}

      <div className="flex items-center gap-2">
        {local === 'idle' && <Button onClick={start}>Start</Button>}
        {needsClick && local === 'live' && <Button onClick={enableAudio}>Click to enable audio</Button>}
        {local === 'live' && !caseOver && <Button variant="outline" onClick={end}>End</Button>}
        {view.canScore && <Button onClick={score} disabled={scoring}>{scoring ? 'Scoring…' : 'Score this interview'}</Button>}
        <span className="ml-auto text-xs text-neutral-400">
          {view.latency ? `first sound ${view.latency.firstSoundMs ?? '–'}ms · first useful ${view.latency.firstUsefulMs ?? '–'}ms` : ''}
        </span>
      </div>
      <div ref={audioBox} className="hidden" />
    </div>
  );
}
