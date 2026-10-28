// The data-request check's cost and added latency, per session (round 5c Task 65;
// Lorenzo: "Log the check's cost and added latency per session"). Free: reads a run
// record. Sources: the `itemless_defer` check events (one per checkAsk call; its
// latencyMs is the wait the turn paid, timedOut when it hit the cap) and the
// `ask_check` llm_usage rows (a call that settled after the cap is a second row marked
// `late`, spent all the same). Cost comes from the usage rows only, so a late row is
// counted once. Runs before the `ask_check` component (round 5b) have records but no
// usage rows: cost 0 there means "not logged", not "free" (usageRows tells them apart).
// `partial_dropped` (final review I5, Lorenzo accepted it): a partial's missing part no
// refusal said, counted per session.
// `wantIs` (round 6 Task 76 (c); Lorenzo, 21 Oct, round 6 rulings, 2: "Row 11's classifier call: allowed, as long as
// all three hold: it fires only on that cue; it fires on no more than ~2% of turns in the replay corpus; it adds no more
// than 1.5 s on the turns where it fires. Report its cost and latency in the check-cost log."): the message classifier's
// `data_request` usage rows tagged `cue: 'want_is'` (turn-data.ts classifyMessage) — calls, cost, the call's latency —
// and the turns that waited on it (`uncovered_asks` with the cue: `waitMs`, capped at ASK_WAIT_MS 1500), against the
// session's candidate turns (the share the ~2% reads).
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { costOf } from '@/lib/llm-pricing';

type Ev = { turnIndex?: number; category?: string; subtype?: string; payloadJsonb?: Record<string, unknown> };
type An = { eventType?: string; payloadJsonb: Record<string, unknown> };
// turn-data.ts ASK_WAIT_MS: the longest a turn waits on the message classifier (not imported: this module stays free of the orchestrator).
const ASK_WAIT_MS = 1500;
export type CheckCostRun = { events: Ev[]; analytics: An[]; turns?: { role?: string }[] };

export type WantIsCost = { calls: number; costUsd: number; unpricedRows: number; latency: { sum: number; max: number; count: number }; waited: { turns: number; sum: number; max: number }; candidateTurns: number };

export type CheckCost = {
  calls: number;
  timeouts: number;
  usageRows: number;
  lateRows: number;
  costUsd: number;
  lateCostUsd: number;
  unpricedRows: number;
  partialDropped: number;
  latency: { sum: number; max: number; count: number };
  wantIs: WantIsCost;
};

const ZERO = (): CheckCost => ({ calls: 0, timeouts: 0, usageRows: 0, lateRows: 0, costUsd: 0, lateCostUsd: 0, unpricedRows: 0, partialDropped: 0, latency: { sum: 0, max: 0, count: 0 },
  wantIs: { calls: 0, costUsd: 0, unpricedRows: 0, latency: { sum: 0, max: 0, count: 0 }, waited: { turns: 0, sum: 0, max: 0 }, candidateTurns: 0 } });
const priced = (p: Record<string, unknown>) => costOf({ model: String(p.model), inputTokens: Number(p.inputTokens) || 0, outputTokens: Number(p.outputTokens) || 0, cacheReadTokens: Number(p.cacheReadTokens) || 0, cacheWriteTokens: Number(p.cacheWriteTokens) || 0 });

export function checkCostOf(run: CheckCostRun): CheckCost {
  const s = ZERO();
  const w = s.wantIs;
  w.candidateTurns = (run.turns ?? []).filter(t => t.role === 'candidate').length;
  for (const e of run.events ?? []) {
    if (e.category !== 'check') continue;
    if (e.subtype === 'partial_dropped') { s.partialDropped++; continue; }
    // The same record is `probe_turn_requests` on a probe turn (settle-turn.ts; fix round 1, the review's minor). The wait
    // is clamped to ASK_WAIT_MS as the turn caps it: a reported wait past the cap is timer slack, not added latency.
    if (e.subtype === 'uncovered_asks' || e.subtype === 'probe_turn_requests') {
      const d = (e.payloadJsonb?.detail ?? {}) as Record<string, unknown>;
      if (d.cue === 'want_is' && typeof d.waitMs === 'number' && d.waitMs > 0) {
        const ms = Math.min(d.waitMs, ASK_WAIT_MS);
        w.waited.turns++; w.waited.sum += ms; w.waited.max = Math.max(w.waited.max, ms);
      }
      continue;
    }
    if (e.subtype !== 'itemless_defer') continue;
    s.calls++;
    const d = (e.payloadJsonb?.detail ?? {}) as Record<string, unknown>;
    if (d.timedOut) s.timeouts++;
    if (typeof d.latencyMs === 'number') {
      s.latency.sum += d.latencyMs; s.latency.count++; s.latency.max = Math.max(s.latency.max, d.latencyMs);
    }
  }
  for (const a of run.analytics ?? []) {
    const p = a.payloadJsonb;
    if (a.eventType === 'llm_usage' && p.component === 'data_request' && p.cue === 'want_is') {
      w.calls++;
      if (typeof p.latencyMs === 'number') { w.latency.sum += p.latencyMs; w.latency.count++; w.latency.max = Math.max(w.latency.max, p.latencyMs); }
      try { w.costUsd += priced(p); } catch { w.unpricedRows++; }
      continue;
    }
    if (a.eventType !== 'llm_usage' || p.component !== 'ask_check') continue;
    s.usageRows++;
    const late = p.late === true;
    if (late) s.lateRows++;
    try {
      const c = priced(p);
      s.costUsd += c;
      if (late) s.lateCostUsd += c;
    } catch { s.unpricedRows++; }
  }
  return s;
}

export function totalCheckCost(all: CheckCost[]): CheckCost {
  const t = ZERO();
  for (const s of all) {
    t.calls += s.calls; t.timeouts += s.timeouts; t.usageRows += s.usageRows; t.lateRows += s.lateRows;
    t.costUsd += s.costUsd; t.lateCostUsd += s.lateCostUsd; t.unpricedRows += s.unpricedRows; t.partialDropped += s.partialDropped;
    t.latency.sum += s.latency.sum; t.latency.count += s.latency.count; t.latency.max = Math.max(t.latency.max, s.latency.max);
    const w = t.wantIs, x = s.wantIs;
    w.calls += x.calls; w.costUsd += x.costUsd; w.unpricedRows += x.unpricedRows; w.candidateTurns += x.candidateTurns;
    w.latency.sum += x.latency.sum; w.latency.count += x.latency.count; w.latency.max = Math.max(w.latency.max, x.latency.max);
    w.waited.turns += x.waited.turns; w.waited.sum += x.waited.sum; w.waited.max = Math.max(w.waited.max, x.waited.max);
  }
  return t;
}

const usd = (n: number) => `$${n.toFixed(4)}`;

// One line for a run's summary.
export function checkCostLine(s: CheckCost): string {
  const logged = s.calls > 0 && s.usageRows === 0 ? ' (no ask_check usage rows: a run from before the component, cost not logged)' : '';
  return `Check: ${s.calls} calls, ${usd(s.costUsd)} (late ${s.lateRows} rows ${usd(s.lateCostUsd)}), ${s.timeouts} timed out, added latency ${s.latency.sum} ms over ${s.latency.count} turns (max ${s.latency.max} ms), partial_dropped ${s.partialDropped}${logged}`;
}

export function checkCostMarkdown(rows: { id: string; summary: CheckCost }[]): string {
  const head = '| Session | Calls | Cost | Timed out | Late rows (cost) | Added latency sum ms | max ms | Turns waited | partial_dropped | Usage rows |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
  const line = (id: string, s: CheckCost) => `| ${id} | ${s.calls} | ${s.calls > 0 && s.usageRows === 0 ? "n/a" : usd(s.costUsd)} | ${s.timeouts} | ${s.lateRows} (${usd(s.lateCostUsd)}) | ${s.latency.sum} | ${s.latency.max} | ${s.latency.count} | ${s.partialDropped} | ${s.usageRows} |`;
  const t = totalCheckCost(rows.map(r => r.summary));
  const noRows = rows.filter(r => r.summary.calls > 0 && r.summary.usageRows === 0).length;
  return [
    '# Check cost and added latency', '',
    'Cost = the `ask_check` usage rows, late rows included. Added latency = `latencyMs` of each check record (the wait the turn paid, capped by the 1.5 s timeout).', '',
    head, ...rows.map(r => line(r.id, r.summary)), line('**Total**', t), '',
    ...(noRows > 0 ? [`${noRows} session(s) have check records but no \`ask_check\` usage rows (runs from before the component): their cost reads n/a because it was not logged.`, ''] : []),
    ...(t.unpricedRows > 0 ? [`${t.unpricedRows} usage row(s) on an unpriced model are not in the cost.`, ''] : []),
    ...wantIsMarkdown(rows),
  ].join('\n');
}

// Row 11's classifier call per session (Task 76 (c)): calls, cost, the call's latency, the turns that waited and the
// wait, and the calls as a share of the candidate turns (the ruling's ~2%; n/a without turns in the run file).
function wantIsMarkdown(rows: { id: string; summary: CheckCost }[]): string[] {
  const head = '| Session | Calls | Cost | Latency sum ms | max ms | Turns waited | Wait sum ms | max ms | Candidate turns | Share |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
  const line = (id: string, w: WantIsCost) => `| ${id} | ${w.calls} | ${usd(w.costUsd)} | ${w.latency.sum} | ${w.latency.max} | ${w.waited.turns} | ${w.waited.sum} | ${w.waited.max} | ${w.candidateTurns} | ${w.candidateTurns > 0 ? `${((100 * w.calls) / w.candidateTurns).toFixed(1)}%` : 'n/a'} |`;
  const t = totalCheckCost(rows.map(r => r.summary)).wantIs;
  return [
    "## Row 11's classifier call (cue want_is)", '',
    "The message classifier started only because \"(what) I'd want is\" made a sentence ask (`data_request` usage rows with `cue: 'want_is'`). Latency = the call's own; wait = what the turn waited on it (`uncovered_asks`, capped at 1.5 s). Share = calls / candidate turns (the ruling's ~2%).", '',
    head, ...rows.map(r => line(r.id, r.summary.wantIs)), line('**Total**', t), '',
    ...(t.unpricedRows > 0 ? [`${t.unpricedRows} row-11 usage row(s) on an unpriced model are not in the cost.`, ''] : []),
  ];
}

export function findRunJsons(dir: string, depth = 3): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (/^live-run-.*\.json$/.test(f)) out.push(p);
    else if (depth > 0 && statSync(p).isDirectory()) out.push(...findRunJsons(p, depth - 1));
  }
  return out;
}
