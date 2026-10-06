// A TurnReads for case prof-001 a few minutes in — the five rows the runner
// reads before planning a turn. No database involved.
import type { TurnReads } from '@/lib/orchestrator/plan-turn';
import type { Phase } from '@/lib/orchestrator/state-machine';

export function readsFixture(opts: {
  phase: Phase;
  warnings?: number;
  elapsedMs?: number;
  status?: 'active' | 'completed' | 'terminated' | 'abandoned';
  distressOffered?: boolean;
  revealed?: string[];
  flags?: Record<string, unknown>;
  extraTurns?: { role: 'interviewer' | 'candidate'; text: string }[];
}): TurnReads {
  const startedAt = new Date(Date.now() - (opts.elapsedMs ?? 300_000));
  const base = [
    { role: 'interviewer', text: 'Your client is Brew & Bean. How would you approach this?' },
    { role: 'candidate', text: 'I would split profit into revenue and costs.' },
    { role: 'interviewer', text: 'Go on.' },
    ...(opts.extraTurns ?? []),
  ];
  return {
    session: {
      id: 's1', userId: 'u1', caseId: 'prof-001', phase: opts.phase, elapsedMs: 0,
      phaseStartedAt: startedAt, status: opts.status ?? 'active', abandonPhase: null, startedAt, completedAt: null,
      flagsJsonb: { conduct: { warnings: opts.warnings ?? 0, ...(opts.distressOffered ? { distressOffered: true } : {}) }, ...opts.flags },
      coverageJsonb: null,
    },
    turnRows: base.map((t, i) => ({
      id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 30_000, latencyMs: null,
    })),
    exhibitRows: [],
    revealedRows: (opts.revealed ?? []).map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() + 61_000 })),
    dataRequestEventRows: [],
  } as unknown as TurnReads;
}
