// The monthly TTS ledger's table (db voice_tts_usage): read, and an atomic
// increment — one INSERT … ON CONFLICT DO UPDATE, which locks the month's row,
// so concurrent jobs never lose an increment.
import { eq, sql } from 'drizzle-orm';
import { db, type DB } from '@/db/client';
import { voiceTtsUsage } from '@/db/schema';
import { SharedTtsBudget, type TtsLedgerStore } from './tts-budget';

export const dbTtsLedgerStore: TtsLedgerStore = {
  async read(month) {
    const row = await db.query.voiceTtsUsage.findFirst({ where: eq(voiceTtsUsage.month, month) });
    return row?.used ?? 0;
  },
  async add(month, chars) {
    const [row] = await ttsIncrement(db, month, chars);
    return row.used;
  },
};

export const ttsIncrement = (d: DB, month: string, chars: number) =>
  d.insert(voiceTtsUsage).values({ month, used: chars })
    .onConflictDoUpdate({ target: voiceTtsUsage.month, set: { used: sql`${voiceTtsUsage.used} + ${chars}`, updatedAt: sql`now()` } })
    .returning({ used: voiceTtsUsage.used });

// The month's ledger with the usual cap (VOICE_TTS_CHAR_CAP, default 90,000).
export const openTtsLedger = (reserve?: number) =>
  SharedTtsBudget.open(dbTtsLedgerStore, { cap: Number(process.env.VOICE_TTS_CHAR_CAP ?? 90_000), reserve });
