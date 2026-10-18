import { it, expect } from 'vitest';
import { SharedTtsBudget, ledgerMonth, type TtsLedgerStore } from '@/lib/voice/tts-budget';

// An in-memory store; `gate` holds increments until released, like a slow database.
function memoryStore(start = 0) {
  const rows = new Map<string, number>([['2026-10', start]]);
  const held: (() => void)[] = [];
  let hold = false;
  const store: TtsLedgerStore & { rows: Map<string, number> } = {
    rows,
    async read(m) { return rows.get(m) ?? 0; },
    async add(m, n) {
      if (hold) await new Promise<void>(r => held.push(r));
      rows.set(m, (rows.get(m) ?? 0) + n);
      return rows.get(m)!;
    },
  };
  return { store, hold: (on: boolean) => { hold = on; }, release: () => held.splice(0).forEach(r => r()) };
}

it('keeps a monthly character count in the store and refuses past the cap and the reserve', async () => {
  const { store } = memoryStore();
  const b = await SharedTtsBudget.open(store, { cap: 5000, reserve: 2000, month: '2026-10' });
  expect(b.take(2500)).toBe(true);
  expect(b.canStartTurn()).toBe(true);
  expect(b.take(600)).toBe(true);                 // 3100 used, 1900 left
  expect(b.canStartTurn()).toBe(false);
  await b.flush();
  expect(store.rows.get('2026-10')).toBe(3100);
  expect((await SharedTtsBudget.open(store, { cap: 5000, month: '2026-10' })).used).toBe(3100);
  expect(b.take(2000)).toBe(false);
  expect(b.used).toBe(3100);
});

it('counts increments still in flight, so take() needs no round trip', async () => {
  const m = memoryStore(1000);
  const b = await SharedTtsBudget.open(m.store, { cap: 2000, month: '2026-10' });
  m.hold(true);
  expect(b.take(600)).toBe(true);
  expect(b.used).toBe(1600);                      // not written yet, still counted
  expect(b.take(500)).toBe(false);
  m.hold(false);
  m.release();
  await b.flush();
  expect(b.used).toBe(1600);
  expect(m.store.rows.get('2026-10')).toBe(1600);
});

it('two jobs share one cap: each sees the other’s spend on its next increment', async () => {
  const { store } = memoryStore();
  const a = await SharedTtsBudget.open(store, { cap: 1000, reserve: 300, month: '2026-10' });
  const b = await SharedTtsBudget.open(store, { cap: 1000, reserve: 300, month: '2026-10' });
  expect(a.take(400)).toBe(true);
  await a.flush();
  expect(b.take(100)).toBe(true);
  await b.flush();
  expect(b.used).toBe(500);                       // a's 400 seen through the returned total
  expect(store.rows.get('2026-10')).toBe(500);
  expect(a.take(200)).toBe(true);
  await a.flush();
  expect(a.used).toBe(700);
  expect(a.canStartTurn()).toBe(true);            // 300 left = the reserve
  expect(a.take(1)).toBe(true);
  expect(a.canStartTurn()).toBe(false);
});

it('a failed write is logged and still counted for the rest of the job', async () => {
  const logs: string[] = [];
  const store: TtsLedgerStore = { read: async () => 0, add: async () => { throw new Error('db down'); } };
  const b = await SharedTtsBudget.open(store, { cap: 1000, month: '2026-10', log: m => logs.push(m) });
  expect(b.take(300)).toBe(true);
  await b.flush();
  expect(b.used).toBe(300);
  expect(b.writeErrors).toBe(1);
  expect(logs[0]).toMatch(/300 chars for 2026-10 failed: db down/);
});

it('names one ledger row per calendar month (UTC)', () => {
  expect(ledgerMonth(new Date('2026-10-08T12:00:00Z'))).toBe('2026-10');
});

import { ttsRunCap, RunCharCap } from '@/lib/voice/tts-budget';

it('requires a per-run character cap for real TTS, not for the fake one', () => {
  expect(ttsRunCap({ VOICE_TTS: 'fake' })).toBeNull();
  expect(() => ttsRunCap({})).toThrow(/VOICE_TTS_RUN_CAP/);
  expect(() => ttsRunCap({ VOICE_TTS_RUN_CAP: '0' })).toThrow(/VOICE_TTS_RUN_CAP/);
  expect(ttsRunCap({ VOICE_TTS_RUN_CAP: '15000' })).toBe(15000);
});

it('a run cap refuses synthesis past it', () => {
  const cap = new RunCharCap(100);
  expect(cap.take(60)).toBe(true);
  expect(cap.take(50)).toBe(false);
  expect(cap.take(40)).toBe(true);
  expect(cap.used).toBe(100);
});
