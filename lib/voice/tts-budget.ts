// The monthly TTS character ledger (spec 2026-10-08-voice-phase-b §9; in the
// database since the voice deploy, 18 Oct — a cloud worker's disk is wiped on
// restart): one row per calendar month, shared by every agent job on every
// worker — a cumulative guard beside each paid run's own VOICE_TTS_RUN_CAP.
// take() refuses past the cap; canStartTurn() keeps a reserve, so no turn
// starts that might not be able to finish.
//
// take() stays synchronous (it gates each segment as it is spoken, and a
// database round trip there would add to every segment's latency): it checks
// the last total the store returned plus this job's increments in flight,
// then sends the increment. Increments are atomic and sent one at a time, so
// every character spoken is counted; another job's spend is seen on this
// job's next increment — concurrent jobs can overshoot the cap by at most
// one segment each.
export interface TtsLedgerStore {
  read(month: string): Promise<number>;
  add(month: string, chars: number): Promise<number>;   // the month's new total
}

export class SharedTtsBudget {
  private inFlight = 0;
  private chain: Promise<void> = Promise.resolve();
  writeErrors = 0;

  private constructor(private store: TtsLedgerStore, readonly month: string, private known: number,
    private cap: number, private reserve: number, private log: (msg: string) => void) {}

  static async open(store: TtsLedgerStore, o: { cap: number; reserve?: number; month?: string; log?: (msg: string) => void }): Promise<SharedTtsBudget> {
    const month = o.month ?? ledgerMonth();
    return new SharedTtsBudget(store, month, await store.read(month), o.cap, o.reserve ?? 2000, o.log ?? (m => console.warn(m)));
  }

  get used(): number { return this.known + this.inFlight; }

  canStartTurn(): boolean { return this.cap - this.used >= this.reserve; }

  take(chars: number): boolean {
    if (this.used + chars > this.cap) return false;
    this.inFlight += chars;
    this.chain = this.chain.then(async () => {
      try {
        const total = await this.store.add(this.month, chars);
        this.inFlight -= chars;
        this.known = total;
      } catch (e) {
        // Not recorded: counted here for the rest of the job, and logged.
        this.inFlight -= chars;
        this.known += chars;
        this.writeErrors++;
        this.log(`[tts-ledger] increment of ${chars} chars for ${this.month} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    return true;
  }

  // Every increment sent so far has been written (or failed and logged).
  flush(): Promise<void> { return this.chain; }
}

export const ledgerMonth = (d = new Date()) => d.toISOString().slice(0, 7);

// Each paid run's own character cap (spec §9): required whenever the TTS is
// real — the plan upgrade is not a test budget. null for the fake TTS.
export function ttsRunCap(env: Record<string, string | undefined>): number | null {
  if (env.VOICE_TTS === 'fake') return null;
  const cap = Number(env.VOICE_TTS_RUN_CAP);
  if (!(cap > 0)) throw new Error('real TTS spends characters: set VOICE_TTS_RUN_CAP (characters for this run), or VOICE_TTS=fake');
  return cap;
}

export class RunCharCap {
  used = 0;
  constructor(private cap: number) {}
  take(chars: number): boolean {
    if (this.used + chars > this.cap) return false;
    this.used += chars;
    return true;
  }
}
