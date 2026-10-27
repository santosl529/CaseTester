// Item-choice experiment (Lorenzo, 27 Oct): one spend ledger for every paid call, capped at $3 in all.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { costOf } from '@/lib/llm-pricing';
export const CAP_USD = 3;
type Row = { at: string; arm: string; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; usd: number; latencyMs: number; note?: string };
export function spent(path: string): number { return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Row[]).reduce((s, r) => s + r.usd, 0) : 0; }
export function canSpend(path: string, worstUsd: number): boolean { return spent(path) + worstUsd <= CAP_USD; }
export function record(path: string, r: Omit<Row, 'usd' | 'at'>): number {
  const rows = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Row[]) : [];
  const usd = costOf({ model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens, cacheWriteTokens: r.cacheWriteTokens } as never);
  rows.push({ ...r, usd, at: new Date().toISOString() });
  writeFileSync(path, JSON.stringify(rows, null, 1));
  return usd;
}
