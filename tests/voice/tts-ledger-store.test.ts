// The ledger's increment is one statement: insert the month's row, or add to
// it under the row lock — never a read-modify-write.
import { it, expect, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';

vi.mock('@/db/client', () => ({ db: {} }));
const { ttsIncrement } = await import('@/lib/voice/tts-ledger-store');

it('increments the month atomically and returns the new total', () => {
  const q = ttsIncrement(drizzle.mock({ schema }) as never, '2026-10', 120).toSQL();
  expect(q.sql).toBe('insert into "voice_tts_usage" ("month", "used", "updated_at") values ($1, $2, default) '
    + 'on conflict ("month") do update set "used" = "voice_tts_usage"."used" + $3, "updated_at" = now() returning "used"');
  expect(q.params).toEqual(['2026-10', 120, 120]);
});
