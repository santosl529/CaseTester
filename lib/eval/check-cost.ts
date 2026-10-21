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
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { costOf } from '@/lib/llm-pricing';

type Ev = { turnIndex?: number; category?: string; subtype?: string; payloadJsonb?: Record<string, unknown> };
type An = { eventType?: string; payloadJsonb: Record<string, unknown> };
export type CheckCostRun = { events: Ev[]; analytics: An[] };

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
};

const ZERO = (): CheckCost => ({ calls: 0, timeouts: 0, usageRows: 0, lateRows: 0, costUsd: 0, lateCostUsd: 0, unpricedRows: 0, partialDropped: 0, latency: { sum: 0, max: 0, count: 0 } });

export function checkCostOf(run: CheckCostRun): CheckCost {
  const s = ZERO();
  for (const e of run.events ?? []) {
    if (e.category !== 'check') continue;
    if (e.subtype === 'partial_dropped') { s.partialDropped++; continue; }
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
    if (a.eventType !== 'llm_usage' || p.component !== 'ask_check') continue;
    s.usageRows++;
    const late = p.late === true;
    if (late) s.lateRows++;
    try {
      const c = costOf({ model: String(p.model), inputTokens: Number(p.inputTokens) || 0, outputTokens: Number(p.outputTokens) || 0, cacheReadTokens: Number(p.cacheReadTokens) || 0, cacheWriteTokens: Number(p.cacheWriteTokens) || 0 });
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
  ].join('\n');
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
