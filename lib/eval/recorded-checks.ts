// The small-model check's verdicts a saved run recorded (`itemless_defer` check
// rows in its turn file), for the runner replay to serve again (round 5 Task 45,
// controller, fix round 1): a check on an ask at a turn gets that run's recorded
// verdict for the same ask at the same turn, else for the same ask at the run's
// nearest other turn, else none (null: no verdict, as before). The ask is matched
// exactly — the replay asks with the model's own `what`, as the run did. Free.
import { readFileSync } from 'node:fs';
import type { DetectedDataRequest } from '@/lib/orchestrator/data-requests';
import type { CheckDecision } from '@/lib/orchestrator/check-log';

export type RecordedCheck = { turnIndex: number; what: string; found: { what: string; ids: string[] }[] | null };

export function recordedChecks(turns: { turnIndex: number; checks?: CheckDecision[] }[]): RecordedCheck[] {
  return turns.flatMap(t => (t.checks ?? []).filter(c => c.check === 'itemless_defer').flatMap(c => {
    const d = c.detail as { what?: unknown; found?: unknown } | undefined;
    if (typeof d?.what !== 'string') return [];
    const found = Array.isArray(d.found) ? (d.found as { what?: unknown; ids?: unknown }[]).map(f => ({ what: String(f.what ?? ''), ids: Array.isArray(f.ids) ? f.ids.map(String) : [] })) : null;
    return [{ turnIndex: t.turnIndex, what: d.what, found }];
  }));
}

export function recordedCheckVerdict(checks: RecordedCheck[], turnIndex: number, what: string): DetectedDataRequest[] | null {
  const same = checks.filter(c => c.what === what);
  const hit = same.find(c => c.turnIndex === turnIndex)
    ?? [...same].sort((a, b) => Math.abs(a.turnIndex - turnIndex) - Math.abs(b.turnIndex - turnIndex) || a.turnIndex - b.turnIndex)[0];
  if (!hit || hit.found === null) return null;
  return hit.found.map(f => ({ what: f.what, ledgerItemIds: f.ids, response: 'none' as const, explicit: true }));
}

// REPLAY_CHECKS=<path to a JSON array of {run, turn, what, ids}>: verdicts that
// override the recorded ones (round 5, the live Haiku check replayed in full turn
// context). `run` is matched as a substring of the replayed run's file path; `what`
// exactly; the nearest `turn` wins. ids [] = the check found no item; null = no
// verdict (a timeout or failure). undefined from `overrideVerdict` = no entry here,
// so the caller falls back to the recorded lookup.
export type CheckOverride = { run: string; turn: number; what: string; ids: string[] | null };

export function loadCheckOverrides(path: string | undefined): CheckOverride[] {
  return path ? (JSON.parse(readFileSync(path, 'utf8')) as CheckOverride[]) : [];
}

export function overrideVerdict(overrides: CheckOverride[], runFile: string, turnIndex: number, what: string): DetectedDataRequest[] | null | undefined {
  const same = overrides.filter(o => o.what === what && runFile.includes(o.run));
  const hit = [...same].sort((a, b) => Math.abs(a.turn - turnIndex) - Math.abs(b.turn - turnIndex) || a.turn - b.turn)[0];
  if (!hit) return undefined;
  if (hit.ids === null) return null;
  return hit.ids.length === 0 ? [] : [{ what, ledgerItemIds: hit.ids, response: 'none' as const, explicit: true }];
}

// The asks a code-written turn dropped (round 5 Task 49, for the runner replay):
// the turn's `code_written_requests` row lists them by `what`; their ledger ids
// are on the passing-mention rows the run logged for them (data_request at that
// turn, `explicit: false`), else none (the close logs no rows). They were explicit
// asks when the classifier detected them. Without these the replay served only
// the turn's kept asks, so a dropped ask could never be answered on replay.
type RecordedEvent = { category?: string; turnIndex?: number; payloadJsonb?: unknown };
export function recordedDroppedAsks(turn: { turnIndex: number; checks?: CheckDecision[] }, events: RecordedEvent[]): DetectedDataRequest[] {
  const row = (turn.checks ?? []).find(c => c.check === 'code_written_requests');
  const dropped = (row?.detail as { dropped?: unknown } | undefined)?.dropped;
  if (!Array.isArray(dropped)) return [];
  const mentions = events.filter(e => e.category === 'data_request' && e.turnIndex === turn.turnIndex)
    .map(e => e.payloadJsonb as { what?: unknown; ledgerItemIds?: unknown; explicit?: unknown } | undefined);
  return dropped.filter((w): w is string => typeof w === 'string').map(what => {
    const ids = mentions.find(m => m?.what === what && m.explicit === false)?.ledgerItemIds;
    return { what, ledgerItemIds: Array.isArray(ids) ? ids.map(String) : [], response: 'none' as const, explicit: true };
  });
}
