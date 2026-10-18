// One-off, after migration 0021 (voice deploy, 18 Oct): carry the month's count
// from the old on-disk ledger (.voice-cache/tts-chars-YYYY-MM.json) into the
// voice_tts_usage row, keeping the larger of the two — the cap counts what was
// spent before the move. Free (one database write).
//
//   npx tsx --env-file=.env.local scripts/voice-tts-seed.ts [--month=2026-10] [--dry]
import { existsSync, readFileSync } from 'node:fs';
import { ledgerMonth } from '@/lib/voice/tts-budget';

const month = process.argv.find(a => a.startsWith('--month='))?.slice(8) ?? ledgerMonth();
const dry = process.argv.includes('--dry');

async function main() {
  const file = `.voice-cache/tts-chars-${month}.json`;
  const fromFile = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { used: number }).used : 0;
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/db/client');
  const { voiceTtsUsage } = await import('@/db/schema');
  const { dbTtsLedgerStore } = await import('@/lib/voice/tts-ledger-store');
  const inDb = await dbTtsLedgerStore.read(month);
  console.log(`${month}: file ${fromFile} (${existsSync(file) ? file : 'no file'}) · database ${inDb}`);
  if (dry || fromFile <= inDb) { console.log(dry ? 'dry run: nothing written' : 'database already at or above the file: nothing written'); return; }
  await db.insert(voiceTtsUsage).values({ month, used: fromFile })
    .onConflictDoUpdate({ target: voiceTtsUsage.month, set: { used: sql`greatest(${voiceTtsUsage.used}, ${fromFile})`, updatedAt: sql`now()` } });
  console.log(`database now ${await dbTtsLedgerStore.read(month)}`);
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
