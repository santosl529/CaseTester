import { it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TtsCharBudget, monthlyLedgerFile } from '@/lib/voice/tts-budget';

it('keeps a monthly character count on disk and refuses past the cap and the reserve', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tts-')), 'chars.json');
  const b = new TtsCharBudget(file, 5000, 2000);
  expect(b.take(2500)).toBe(true);
  expect(b.canStartTurn()).toBe(true);
  expect(b.take(600)).toBe(true);                 // 3100 used, 1900 left
  expect(b.canStartTurn()).toBe(false);
  expect(new TtsCharBudget(file, 5000, 2000).used).toBe(3100);
  expect(b.take(2000)).toBe(false);
  expect(b.used).toBe(3100);
});

it('names one ledger per calendar month', () => {
  expect(monthlyLedgerFile(new Date('2026-10-08T12:00:00Z'))).toBe('.voice-cache/tts-chars-2026-10.json');
});
