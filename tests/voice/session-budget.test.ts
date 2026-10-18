import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installSessionBudget } from '@/lib/voice/session-budget';
import { activeRunBudget, clearRunBudget } from '@/lib/llm-budget';

afterEach(() => clearRunBudget());
const quiet = () => {};

it('defaults to $1.00 a session and installs a fresh budget each time', () => {
  const a = installSessionBudget({}, quiet);
  expect(a.capUsd).toBe(1);
  a.record({ model: 'claude-sonnet-5-5', inputTokens: 100_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputEstimated: false });
  expect(a.spentUsd).toBeGreaterThan(0);
  const b = installSessionBudget({ LLM_BUDGET_USD: '0.75' }, quiet);
  expect(b.capUsd).toBe(0.75);
  expect(b.spentUsd).toBe(0);                     // the last session's spend is not carried
  expect(activeRunBudget()).toBe(b);
});

it('ignores a shared ledger file: the cap stays per session', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'budget-')), 'ledger.jsonl');
  writeFileSync(file, JSON.stringify({ usd: 5 }) + '\n');
  const logs: string[] = [];
  const b = installSessionBudget({ LLM_BUDGET_USD: '1', LLM_BUDGET_FILE: file }, m => logs.push(m));
  expect(b.spentUsd).toBe(0);
  expect(logs.join('\n')).toMatch(/LLM_BUDGET_FILE ignored/);
});

it('refuses a cap that is not a positive amount', () => {
  expect(() => installSessionBudget({ LLM_BUDGET_USD: '0' }, quiet)).toThrow(/positive/);
  expect(() => installSessionBudget({ LLM_BUDGET_USD: 'abc' }, quiet)).toThrow(/positive/);
});
