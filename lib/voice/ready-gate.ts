// When the voice page sends `ready` (session b406165f, 19 Oct): the agent
// starts the opener on `ready`, so it goes out only once the page's setup is
// done (connect, startAudio, mic), the agent's hello has been seen and audio
// can play. A hello during setup waits for its end; a hello after it (the
// agent joins late or rejoins) is answered then. One ready per hello, and one
// after an audio_blocked (the agent waits for it). Client-safe: no imports.

export class ReadyGate {
  private setupDone = false;
  private owed = false;     // the agent is waiting for a ready: a hello, or audio_blocked, not yet answered

  constructor(private o: { canPlay: () => boolean; sendReady: () => void }) {}

  get isSetupDone(): boolean { return this.setupDone; }

  hello(): void { this.owed = true; this.flush(); }
  setupComplete(): void { this.setupDone = true; this.flush(); }
  audioUnlocked(): void { this.flush(); }
  audioBlocked(): void { this.owed = true; }

  private flush(): void {
    if (!this.setupDone || !this.owed || !this.o.canPlay()) return;
    this.owed = false;
    this.o.sendReady();
  }
}
