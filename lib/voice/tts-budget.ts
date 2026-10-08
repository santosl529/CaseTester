// The monthly TTS character ledger (spec 2026-10-08-voice-phase-b §9): one
// JSON file per calendar month under .voice-cache, shared by every agent job —
// a cumulative guard beside each paid run's own VOICE_TTS_RUN_CAP. take()
// refuses past the cap; canStartTurn() keeps a reserve, so no turn starts that
// might not be able to finish.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class TtsCharBudget {
  constructor(private file: string, private cap: number, private reserve = 2000) {}

  get used(): number {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as { used: number }).used : 0;
  }

  canStartTurn(): boolean { return this.cap - this.used >= this.reserve; }

  take(chars: number): boolean {
    const used = this.used;
    if (used + chars > this.cap) return false;
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ used: used + chars, cap: this.cap }));
    return true;
  }
}

export const monthlyLedgerFile = (d = new Date()) => `.voice-cache/tts-chars-${d.toISOString().slice(0, 7)}.json`;

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
