// The small-model check's verdicts a saved run recorded (`itemless_defer` check
// rows in its turn file), for the runner replay to serve again (round 5 Task 45,
// controller, fix round 1): a check on an ask at a turn gets that run's recorded
// verdict for the same ask at the same turn, else for the same ask at the run's
// nearest other turn, else none (null: no verdict, as before). The ask is matched
// exactly — the replay asks with the model's own `what`, as the run did. Free.
import { readFileSync } from 'node:fs';
import type { DetectedDataRequest, AskCheckResult, AskAnswer } from '@/lib/orchestrator/data-requests';
import type { CheckDecision } from '@/lib/orchestrator/check-log';

// partial / missing: the check's partial answers (round 5b Task 56), on rows logged
// since; a row without them reads as all full — the decision it made then.
export type RecordedCheck = { turnIndex: number; what: string; found: { what: string; ids: string[] }[] | null; partial?: string[]; missing?: Record<string, string> };

export function recordedChecks(turns: { turnIndex: number; checks?: CheckDecision[] }[]): RecordedCheck[] {
  return turns.flatMap(t => (t.checks ?? []).filter(c => c.check === 'itemless_defer').flatMap(c => {
    const d = c.detail as { what?: unknown; found?: unknown; partial?: unknown; missing?: unknown } | undefined;
    if (typeof d?.what !== 'string') return [];
    const found = Array.isArray(d.found) ? (d.found as { what?: unknown; ids?: unknown }[]).map(f => ({ what: String(f.what ?? ''), ids: Array.isArray(f.ids) ? f.ids.map(String) : [] })) : null;
    const partial = Array.isArray(d.partial) ? d.partial.map(String) : [];
    const missing = d.missing && typeof d.missing === 'object' ? Object.fromEntries(Object.entries(d.missing as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
    return [{ turnIndex: t.turnIndex, what: d.what, found, ...(partial.length > 0 ? { partial, missing } : {}) }];
  }));
}

// A verdict in the check's shape: ids in order, once each; an id not marked partial
// is full; a partial with no missing part says the ask's own words.
function verdictOf(what: string, ids: string[], answers: Record<string, AskAnswer> = {}, missing: Record<string, string> = {}): AskCheckResult {
  return { items: [...new Set(ids)].map(id => (answers[id] === 'partial' ? { id, answers: 'partial' as const, missing: missing[id] ?? what } : { id, answers: 'full' as const })) };
}

export function recordedCheckVerdict(checks: RecordedCheck[], turnIndex: number, what: string): AskCheckResult | null {
  const same = checks.filter(c => c.what === what);
  const hit = same.find(c => c.turnIndex === turnIndex)
    ?? [...same].sort((a, b) => Math.abs(a.turnIndex - turnIndex) - Math.abs(b.turnIndex - turnIndex) || a.turnIndex - b.turnIndex)[0];
  if (!hit || hit.found === null) return null;
  return verdictOf(what, hit.found.flatMap(f => f.ids), Object.fromEntries((hit.partial ?? []).map(id => [id, 'partial' as const])), hit.missing);
}

// Detections in the detection classifier's shape (a test's or an old replay's
// check mock) as the check's verdict: all full.
export function askResultOf(found: DetectedDataRequest[] | null): AskCheckResult | null {
  return found === null ? null : verdictOf('', found.flatMap(f => f.ledgerItemIds));
}

// REPLAY_CHECKS=<path to a JSON array of {run, turn, what, ids, answers?, missing?}>:
// verdicts that override the recorded ones (round 5, the live Haiku check replayed in
// full turn context). `run` is matched as a substring of the replayed run's file path;
// `what` exactly; the nearest `turn` wins. ids [] = the check found no item; null = no
// verdict (a timeout or failure). `answers` and `missing` (round 5b Task 56): per id,
// "partial" and the asked part it lacks; an id without them is full. undefined from
// `overrideVerdict` = no entry here, so the caller falls back to the recorded lookup.
export type CheckOverride = { run: string; turn: number; what: string; ids: string[] | null; answers?: Record<string, AskAnswer>; missing?: Record<string, string> };

export function loadCheckOverrides(path: string | undefined): CheckOverride[] {
  return path ? (JSON.parse(readFileSync(path, 'utf8')) as CheckOverride[]) : [];
}

export function overrideVerdict(overrides: CheckOverride[], runFile: string, turnIndex: number, what: string): AskCheckResult | null | undefined {
  const same = overrides.filter(o => o.what === what && runFile.includes(o.run));
  const hit = [...same].sort((a, b) => Math.abs(a.turn - turnIndex) - Math.abs(b.turn - turnIndex) || a.turn - b.turn)[0];
  if (!hit) return undefined;
  if (hit.ids === null) return null;
  return verdictOf(what, hit.ids, hit.answers, hit.missing);
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

// The message classifier's detections on a MODEL turn (Phase 2, for the runner replay behind REPLAY_MESSAGE_DETECTIONS=1):
// the recorded `uncovered_asks` / `probe_turn_requests` row lists the detections by `what` — answered (they joined the
// turn's requests), covered (an explicit declaration covered them) and dropped (no asking sentence covered them). A
// detection the item-less check then ran on (an `itemless_defer` row for its `what`) was item-less; otherwise its ids
// are the turn's data_request rows for that `what`. A `release_checked` confirmation adds a detection mapping the
// confirmed item (the check reads only whether some detection maps it). Without this the replay served model turns no
// detections at all, so every answer that came through the message's own asks (design path A11) was lost on replay —
// batch 39's Quillpath Raj t10, for one.
export function recordedMessageDetections(turn: { turnIndex: number; checks?: CheckDecision[] }, events: RecordedEvent[]): DetectedDataRequest[] {
  const checks = turn.checks ?? [];
  const row = checks.find(c => c.check === 'uncovered_asks' || c.check === 'probe_turn_requests')?.detail as { answered?: unknown; covered?: unknown; dropped?: unknown } | undefined;
  const whats = (x: unknown) => (Array.isArray(x) ? x.filter((w): w is string => typeof w === 'string') : []);
  const checked = new Set(checks.filter(c => c.check === 'itemless_defer').map(c => (c.detail as { what?: string } | undefined)?.what).filter((w): w is string => !!w));
  const rows = events.filter(e => e.category === 'data_request' && e.turnIndex === turn.turnIndex)
    .map(e => e.payloadJsonb as { what?: unknown; ledgerItemIds?: unknown } | undefined);
  const idsOf = (what: string) => (checked.has(what) ? [] : [...new Set(rows.filter(r => r?.what === what).flatMap(r => (Array.isArray(r?.ledgerItemIds) ? r!.ledgerItemIds.map(String) : [])))]);
  const out: DetectedDataRequest[] = [...whats(row?.answered), ...whats(row?.covered), ...whats(row?.dropped)]
    .map(what => ({ what, ledgerItemIds: idsOf(what), response: 'none' as const, explicit: true }));
  const rc = checks.find(c => c.check === 'release_checked')?.detail as { confirmed?: unknown } | undefined;
  for (const id of whats(rc?.confirmed)) out.push({ what: id, ledgerItemIds: [id], response: 'none' as const, explicit: true });
  return out;
}
