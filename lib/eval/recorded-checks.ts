// The small-model check's verdicts a saved run recorded (`itemless_defer` check
// rows in its turn file), for the runner replay to serve again (round 5 Task 45,
// controller, fix round 1): a check on an ask at a turn gets that run's recorded
// verdict for the same ask at the same turn, else for the same ask at the run's
// nearest other turn, else none (null: no verdict, as before). The ask is matched
// exactly — the replay asks with the model's own `what`, as the run did. Free.
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
