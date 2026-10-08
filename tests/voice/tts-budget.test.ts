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
