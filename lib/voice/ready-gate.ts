// When the voice page sends `ready` (session b406165f, 19 Oct): the agent
// starts the opener on `ready`, so it goes out only once the page's setup is
// done (connect, startAudio, mic), the agent's hello has been seen, audio can
// play, and the agent's current audio element has fired 'playing' (d4bf4638:
// the page froze 1ms after that track attached; without a mic prompt setup and
// the hello can both come first) — or PLAYING_FALLBACK_MS after the attach, so
// it never hangs. A new track (the agent rejoins) must play again. A hello
// during setup waits for its end; a hello after it (the agent joins late or
// rejoins) is answered then. One ready per hello, and one after an
// audio_blocked (the agent waits for it). Client-safe: no imports.

export const PLAYING_FALLBACK_MS = 3000;

type Schedule = (fn: () => void, ms: number) => () => void;
const realSchedule: Schedule = (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); };

export class ReadyGate {
  private setupDone = false;
  private owed = false;       // the agent is waiting for a ready: a hello, or audio_blocked, not yet answered
  private playing = false;    // the current track's element fired 'playing' (or its fallback passed)
  private track = 0;          // the current attach; an older element's event doesn't count
  private cancelFallback: (() => void) | null = null;

  constructor(private o: { canPlay: () => boolean; sendReady: () => void; schedule?: Schedule; onFallback?: () => void }) {}

  get isSetupDone(): boolean { return this.setupDone; }

  hello(): void { this.owed = true; this.flush(); }
  setupComplete(): void { this.setupDone = true; this.flush(); }
  audioUnlocked(): void { this.flush(); }
  audioBlocked(): void { this.owed = true; }

  // The agent's audio track attached: it must play before the next ready. Returns its number, for trackPlaying.
  trackAttached(): number {
    const n = ++this.track;
    this.playing = false;
    this.cancelFallback?.();
    this.cancelFallback = (this.o.schedule ?? realSchedule)(() => {
      if (n !== this.track || this.playing) return;
      this.cancelFallback = null;
      this.o.onFallback?.();
      this.markPlaying(n);
    }, PLAYING_FALLBACK_MS);
    return n;
  }

  trackPlaying(n: number): void {
    if (n !== this.track || this.playing) return;
    this.cancelFallback?.();
    this.cancelFallback = null;
    this.markPlaying(n);
  }

  close(): void { this.cancelFallback?.(); this.cancelFallback = null; }

  private markPlaying(n: number): void {
    if (n !== this.track) return;
    this.playing = true;
    this.flush();
  }

  private flush(): void {
    if (!this.setupDone || !this.owed || !this.playing || !this.o.canPlay()) return;
    this.owed = false;
    this.o.sendReady();
  }
}
