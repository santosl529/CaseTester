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
