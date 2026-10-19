'use client';
// The minimal voice interview page (spec 2026-10-08-voice-phase-b §6): mic in,
// interviewer audio out, captions, exhibits, End, optional scoring after a
// natural end. The browser tells the agent when audio can play (ready /
// audio_blocked), confirms each exhibit once rendered, and measures its own
// end-of-speech → first-sound time as a cross-check (headphones required).
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { Button } from '@/components/ui/button';
import { fillerPrefStore } from '@/lib/voice/filler-pref';
import { ExhibitTable } from '@/components/exhibit-table';
import { LiveCaption } from '@/components/live-caption';
import { applyMessage, initialView } from '@/components/voice-view';
import { DATA_TOPIC, type ClientMessage, type ServerMessage } from '@/lib/voice/protocol';
import { agentAudioWatchdog, CONNECTING_MESSAGE, VOICE_BUSY_MESSAGE } from '@/lib/voice/capacity';
import { HealthMeter } from '@/lib/voice/health';
import { ReadyGate } from '@/lib/voice/ready-gate';
import { SetupTimings } from '@/lib/voice/setup-timing';

const STATE_LABEL: Record<string, string> = {
  idle: 'Not started', connecting: 'Connecting…', waiting: 'Waiting for audio', listening: 'Listening',
  thinking: 'Thinking', speaking: 'Speaking', ended: 'Ended',
};
// Why a session ended early, on screen (the TTS cap's line is also spoken).
const ENDED_TEXT: Record<string, string> = {
  tts_cap: 'This session reached its voice limit, so it ended here.',
  time_limit: 'This session reached its time limit, so it ended here.',
  error: 'The session ended because of a technical problem.',
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

// One per page: the browser's filler setting (item 3).
// Reading localStorage itself can throw when site data is blocked: then memory.
const fillerPref = fillerPrefStore(() => { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } });

export function VoiceRoom({ sessionId, casePrompt }: { sessionId: string; casePrompt: string | null }) {
  const router = useRouter();
  const [view, dispatch] = useReducer(applyMessage, initialView);
  const [local, setLocal] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle');
  const [needsClick, setNeedsClick] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [scoring, setScoring] = useState<false | 'finalizing' | 'scoring'>(false);
  const [endedWithReport, setEndedWithReport] = useState(false);
  // Waiting for the interviewer's first audio (a cold-starting agent can take 10–20s).
  const [connecting, setConnecting] = useState(false);
  // Thinking sounds and the "So," connector (item 3): on by default, remembered
  // in this browser, sent to the agent, applied from the next turn.
  const fillers = useSyncExternalStore(fillerPref.subscribe, fillerPref.get, () => true);
  const roomRef = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement | null>(null);
  const confirmed = useRef(new Set<string>());
  const timing = useRef<{ ctx: AudioContext | null; mic: (() => number) | null; remote: (() => number) | null; lastMicLoudAt: number; pending: { turnSeq: number; from: number } | null; timer: number | null }>(
    { ctx: null, mic: null, remote: null, lastMicLoudAt: 0, pending: null, timer: null },
  );

  // The page's health, reported at the end of each interviewer turn (19 Oct, d).
  const health = useRef<{ meter: HealthMeter; raf: number | null; observer: PerformanceObserver | null } | null>(null);

  // `ready` waits for the end of setup, the agent's hello, playable audio and the agent's
  // audio element playing (b406165f, d4bf4638, 19 Oct; lib/voice/ready-gate.ts).
  const gate = useRef<ReadyGate | null>(null);
  // How long each setup step took, with the long tasks from the Start click, sent once (lib/voice/setup-timing.ts).
  const setupTimes = useRef<SetupTimings | null>(null);
  const setupObserver = useRef<PerformanceObserver | null>(null);

  // No interviewer audio within 15s of connecting (or of the audio-unlock
  // click): the agent never came — capacity — so say so and leave (lib/voice/capacity.ts).
  const watchdog = useRef<ReturnType<typeof agentAudioWatchdog> | null>(null);

  const send = (m: ClientMessage) => {
    const room = roomRef.current;
    if (!room) return;
    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(m)), { reliable: true, topic: DATA_TOPIC }).catch(() => {});
  };

  // `ready`, with the filler toggle first: an agent that (re)joins learns it before its first turn.
  // Only the gate calls it.
  const sendReady = () => {
    send({ type: 'fillers', on: fillerPref.get() });
    send({ type: 'ready' });
    setupTimes.current?.mark('ready');
    sendSetup();
  };

  // The setup line, once ready has gone out and the agent's track is attached (the agent is in the room).
  const sendSetup = () => {
    const line = setupTimes.current?.take();
    if (!line) return;
    stopSetupObserver();
    send({ type: 'setup', ...line });
  };

  const stopSetupObserver = () => {
    setupObserver.current?.disconnect();
    setupObserver.current = null;
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

  // An interviewer turn has ended (the agent is listening again): the health line for it.
  useEffect(() => {
    const h = health.current;
    if (!h || view.phase !== 'listening' || view.stateTurnSeq === 0) return;
    send({ type: 'health', turnSeq: view.stateTurnSeq, ...h.meter.take({
      audioElements: audioBox.current?.querySelectorAll('audio').length ?? 0,
      audioContextState: timing.current.ctx?.state ?? 'none',
    }) });
  }, [view.phase, view.stateTurnSeq]);

  useEffect(() => () => {
    if (health.current?.raf != null) cancelAnimationFrame(health.current.raf);
    health.current?.observer?.disconnect();
    setupObserver.current?.disconnect();
    gate.current?.close();
    watchdog.current?.stop();
    if (timing.current.timer !== null) window.clearInterval(timing.current.timer);
    void timing.current.ctx?.close();
    roomRef.current?.disconnect();
  }, []);

  async function start() {
    stopSetupObserver();
    const longTasks = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
    const times = new SetupTimings(() => performance.now(), longTasks);
    setupTimes.current = times;
    if (longTasks) {
      const o = new PerformanceObserver(list => { for (const e of list.getEntries()) times.longTask(e.startTime, e.duration); });
      o.observe({ entryTypes: ['longtask'] });
      setupObserver.current = o;
    }
    setLocal('connecting');
    setProblem(null);
    const res = await fetch(`/api/voice/${sessionId}/token`, { method: 'POST' });
    if (!res.ok) {
      stopSetupObserver();
      setProblem(res.status === 429 ? VOICE_BUSY_MESSAGE : res.status === 409 ? 'This case is no longer active.' : res.status === 503 ? 'Voice is not configured on the server.' : 'Could not start the voice session.');
      setLocal('idle');
      return;
    }
    const { url, token } = await res.json() as { url: string; token: string };
    const room = new Room({ adaptiveStream: false });
    roomRef.current = room;
    const readyGate = new ReadyGate({ canPlay: () => room.canPlaybackAudio, sendReady, onFallback: () => times.mark('playingFallback') });
    gate.current = readyGate;
    const dec = new TextDecoder();
    room.on(RoomEvent.DataReceived, (payload, _p, _k, topic) => {
      if (topic !== DATA_TOPIC) return;
      let m: ServerMessage;
      try { m = JSON.parse(dec.decode(payload)) as ServerMessage; } catch { return; }
      // The agent may join after us: its hello is when our `ready` can arrive.
      // During setup it waits for setup's end (the opener would start mid-join).
      if (m.type === 'hello') {
        times.mark('hello');
        readyGate.hello();
        if (readyGate.isSetupDone && !room.canPlaybackAudio) { setNeedsClick(true); watchdog.current?.stop(); }
      }
      dispatch({ ...m, receivedAt: performance.now() });   // the caption's words are timed from arrival
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      times.span('firstTrack', () => {
        // ready waits for this element to play (d4bf4638: the freeze came 1ms after the attach); a new track resets it.
        const el = track.attach();
        const n = readyGate.trackAttached();
        el.addEventListener('playing', () => { times.mark('playing'); readyGate.trackPlaying(n); }, { once: true });
        audioBox.current?.appendChild(el);
        const t = timing.current;
        if (t.ctx) t.remote = levelMeter(t.ctx, track.mediaStreamTrack);
      });
      sendSetup();
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (room.canPlaybackAudio) return;
      send({ type: 'audio_blocked' });
      readyGate.audioBlocked();
      setNeedsClick(true);
      watchdog.current?.stop();
    });
    room.on(RoomEvent.Disconnected, () => setLocal(l => (l === 'live' ? 'ended' : l)));
    try {
      timing.current.ctx = times.span('audioContext', () => new AudioContext());
      await times.spanAsync('connect', () => room.connect(url, token));
      await times.spanAsync('startAudio', () => room.startAudio());
      const pub = await times.spanAsync('mic', () => room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true }));
      const micTrack = pub?.track?.mediaStreamTrack;
      const ctx = timing.current.ctx;
      if (micTrack && ctx) timing.current.mic = times.span('micMeter', () => levelMeter(ctx, micTrack));
    } catch (e) {
      stopSetupObserver();
      setProblem(e instanceof Error && e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not connect the audio.');
      room.disconnect();
      setLocal('idle');
      return;
    }
    timing.current.timer = window.setInterval(() => {
      const t = timing.current;
      const now = performance.now();
      if (t.mic && t.mic() > MIC_LOUD) t.lastMicLoudAt = now;
      if (t.remote && !watchdog.current?.wasHeard && t.remote() > REMOTE_LOUD) { watchdog.current?.heard(); setConnecting(false); }
      if (t.pending && t.remote && t.remote() > REMOTE_LOUD) {
        send({ type: 'timing', turnSeq: t.pending.turnSeq, clientFirstSoundMs: Math.round(now - t.pending.from) });
        t.pending = null;
      }
    }, 20);
    setLocal('live');
    startHealth();
    watchdog.current = agentAudioWatchdog({ onTimeout: () => {
      setConnecting(false);
      setProblem(VOICE_BUSY_MESSAGE);
      if (timing.current.timer !== null) window.clearInterval(timing.current.timer);
      timing.current.timer = null;
      room.disconnect();
      setLocal('idle');
    } });
    // Setup is done: a hello that came during it is answered now, once.
    times.mark('setupDone');
    readyGate.setupComplete();
    if (room.canPlaybackAudio) { watchdog.current.arm(); setConnecting(true); }
    else setNeedsClick(true);
  }

  // Frame gaps (visible tab only) and long tasks (where the browser reports them), from the start.
  function startHealth() {
    if (health.current) return;
    const longTasks = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
    const h: { meter: HealthMeter; raf: number | null; observer: PerformanceObserver | null } = { meter: new HealthMeter(longTasks), raf: null, observer: null };
    if (longTasks) {
      h.observer = new PerformanceObserver(list => { for (const e of list.getEntries()) h.meter.longTask(e.duration); });
      h.observer.observe({ entryTypes: ['longtask'] });
    }
    const tick = (t: number) => { h.meter.frame(t, document.visibilityState === 'visible'); h.raf = requestAnimationFrame(tick); };
    h.raf = requestAnimationFrame(tick);
    health.current = h;
  }

  async function enableAudio() {
    const room = roomRef.current;
    if (!room) return;
    await room.startAudio();
    if (room.canPlaybackAudio) {
      setNeedsClick(false);
      gate.current?.audioUnlocked();
      watchdog.current?.arm();
      if (!watchdog.current?.wasHeard) setConnecting(true);
    }
  }

  function toggleFillers() {
    const on = !fillerPref.get();
    fillerPref.set(on);
    send({ type: 'fillers', on });
  }

  // Rule 18A: ending keeps a report on what was covered, when there is one.
  async function end() {
    const res = await fetch(`/api/voice/${sessionId}/end`, { method: 'POST' }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) as { report?: boolean } | null : null;
    watchdog.current?.stop();
    roomRef.current?.disconnect();
    setLocal('ended');
    setEndedWithReport(Boolean(data?.report));
  }

  async function score() {
    // A math check still running on the last message reaches the report (…/finalize waits for it, ≤30s).
    setScoring('finalizing');
    await fetch(`/api/channel/${sessionId}/finalize`, { method: 'POST' }).catch(() => null);
    setScoring('scoring');
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
            {c.segments ? <LiveCaption segments={c.segments} /> : <span className={c.final ? '' : 'opacity-70'}>{c.text}</span>}
          </div>
        ))}
        {view.exhibits.map(e => <ExhibitTable key={e.id} exhibit={e} />)}
      </div>

      {connecting && local === 'live' && !needsClick && !problem && <p className="text-sm text-neutral-600">{CONNECTING_MESSAGE}</p>}
      {(problem || view.error) && <p className="text-sm text-red-600">{problem ?? view.error}</p>}
      {view.endedReason && view.endedReason !== 'case_complete' && (
        <p className="text-sm text-neutral-600">{ENDED_TEXT[view.endedReason] ?? 'The session ended.'}{view.canScore ? ' You can score it for a report on what you covered.' : ''}</p>
      )}

      {/* Before Start, on its own line (Lorenzo, 19 Oct): on speakers the room hears the interviewer. */}
      {local === 'idle' && (
        <p className="text-sm font-medium text-neutral-800">Headphones work best — on laptop speakers the interviewer can hear itself and cut off.</p>
      )}
      <div className="flex items-center gap-2">
        {local === 'idle' && <Button onClick={start}>Start</Button>}
        {needsClick && local === 'live' && <Button onClick={enableAudio}>Click to enable audio</Button>}
        {local === 'live' && !caseOver && <Button variant="outline" onClick={end}>End</Button>}
        <Button variant="outline" size="sm" onClick={toggleFillers} aria-pressed={fillers}
          title="The interviewer's thinking sounds (“Hmm…”) and the “So,” that follows them. Applies from the next turn.">
          Thinking sounds: {fillers ? 'on' : 'off'}
        </Button>
        {(view.canScore || endedWithReport) && <Button onClick={score} disabled={scoring !== false}>{scoring === 'finalizing' ? 'Finalizing your report…' : scoring ? 'Scoring…' : 'Score this interview'}</Button>}
        <span className="ml-auto text-xs text-neutral-400">
          {view.latency ? `first sound ${view.latency.firstSoundMs ?? '–'}ms · first useful ${view.latency.firstUsefulMs ?? '–'}ms` : ''}
        </span>
      </div>
      <div ref={audioBox} className="hidden" />
    </div>
  );
}
