// <run>.turns.jsonl.gz: a header line, one line per TurnRecord, an end line
// (spec 2026-10-09 §2.1). A run that died has no end line.
import { writeFileSync, readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import type { ModelCheck } from './model-guard';

export type TurnFileHeader = {
  type: 'header'; batch: string | null; version: string | null; wave: string | null; runNumber: number | null;
  /** The manifest's rerun index (0 = original); absent in turn files written before it existed. */
  rerun?: number | null;
  commit: string; dirty: boolean; models: Record<string, string>;
  /** The declared evaluation interviewer (lib/models.ts INTERVIEWER_EVAL_CONFIGS); absent before 11 Oct. */
  interviewerConfig?: string | null;
  persona: { id: number; name: string; brief: string } | null; sessionId: string; startedAt: string;
};
export type TurnFileEnd = {
  type: 'end'; ended: boolean; budgetStopped: boolean; scoring: string;
  candidateUsage: { calls: number; input: number; output: number; usd: number };
  /** Requested vs returned interviewer model (lib/eval/model-guard.ts); absent before 11 Oct or without a declared interviewer. */
  modelCheck?: ModelCheck | null;
  /** A partial run: the error that stopped it (scripts/live-run.ts; 13 Oct). */
  harnessError?: string;
};

export function writeTurnFile(p: string, header: TurnFileHeader, turns: TurnRecord[], end: TurnFileEnd): void {
  const lines = [header, ...turns, end].map(x => JSON.stringify(x)).join('\n') + '\n';
  writeFileSync(p, gzipSync(lines));
}

export function readTurnFile(p: string): { header: TurnFileHeader; turns: TurnRecord[]; end: TurnFileEnd | null } {
  const rows = gunzipSync(readFileSync(p)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { type: string });
  const header = rows.find(r => r.type === 'header') as TurnFileHeader | undefined;
  if (!header) throw new Error(`${p}: no header line`);
  return {
    header,
    // Turns written before recorderErrors existed read as complete.
    turns: (rows.filter(r => r.type === 'turn') as TurnRecord[]).map(t => ({ ...t, recorderErrors: t.recorderErrors ?? [] })),
    end: (rows.find(r => r.type === 'end') as TurnFileEnd | undefined) ?? null,
  };
}
