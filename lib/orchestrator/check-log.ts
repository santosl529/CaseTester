// Every check records its decision (docs/interviewer-behavior.md Part V,
// v4.6). Some backstops ran without leaving a record, so "not built" and
// "built but quiet" looked the same — the v3.5 review called four existing
// checks missing for exactly that reason. Each check that runs on a turn
// records one decision, "checked, no problem found" included; the runner
// writes them as `check` session events at the end of the turn.

import type { Phase } from './state-machine';

export type CheckDecisionKind = 'pass' | 'act' | 'skip';

export type CheckDecision = {
  check: string;
  decision: CheckDecisionKind;
  reason?: string;
  detail?: Record<string, unknown>;
};

export class CheckLog {
  readonly entries: CheckDecision[] = [];

  pass(check: string, detail?: Record<string, unknown>): void {
    this.entries.push({ check, decision: 'pass', ...(detail ? { detail } : {}) });
  }

  act(check: string, reason: string, detail?: Record<string, unknown>): void {
    this.entries.push({ check, decision: 'act', reason, ...(detail ? { detail } : {}) });
  }

  skip(check: string, reason: string): void {
    this.entries.push({ check, decision: 'skip', reason });
  }

  // pass or act in one call, for checks whose outcome is a boolean.
  record(check: string, acted: boolean, reason: string, detail?: Record<string, unknown>): void {
    if (acted) this.act(check, reason, detail);
    else this.pass(check, detail);
  }
}

export function toCheckEventRows(
  log: CheckLog,
  ctx: { sessionId: string; turnIndex: number; phase: Phase },
): { sessionId: string; category: 'check'; subtype: string; turnIndex: number; phase: Phase; payloadJsonb: Record<string, unknown> }[] {
  return log.entries.map(e => ({
    sessionId: ctx.sessionId,
    category: 'check',
    subtype: e.check,
    turnIndex: ctx.turnIndex,
    phase: ctx.phase,
    payloadJsonb: { decision: e.decision, ...(e.reason ? { reason: e.reason } : {}), ...(e.detail ? { detail: e.detail } : {}) },
  }));
}

// Per-check tallies for the run export: how often each check ran, acted, or
// skipped. A check with zero rows never ran.
export function summarizeCheckEvents(
  rows: { subtype: string; turnIndex: number | null; payloadJsonb: unknown }[],
): { check: string; pass: number; act: number; skip: number; actedAt: number[] }[] {
  const by = new Map<string, { pass: number; act: number; skip: number; actedAt: number[] }>();
  for (const r of rows) {
    const decision = (r.payloadJsonb as { decision?: CheckDecisionKind } | null)?.decision;
    if (!decision) continue;
    const s = by.get(r.subtype) ?? { pass: 0, act: 0, skip: 0, actedAt: [] };
    s[decision] += 1;
    if (decision === 'act' && r.turnIndex !== null) s.actedAt.push(r.turnIndex);
    by.set(r.subtype, s);
  }
  return [...by.entries()].map(([check, s]) => ({ check, ...s })).sort((a, b) => a.check.localeCompare(b.check));
}
