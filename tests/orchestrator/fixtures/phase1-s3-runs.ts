// Phase 1 Stream 3: batch 38 Larkspur Marisol f80d981c and Tyler cee7d399, verbatim from the runs
// (batch-38-larkspur-oct-21-runs-1-5; phase1-s3-b38.json): the transcript, the math checker's landed verdicts, and per
// candidate message its phase, clock, ledger and exhibits. readsAt(run, n) is what the runner reads before planning
// candidate message n: the turns before it, every verdict on an earlier message, the ledger and exhibits as recorded.
import type { TurnReads } from '@/lib/orchestrator/plan-turn';
import type { VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import RUNS from './phase1-s3-b38.json';

type Rec = { phase: string; elapsedMs: number; revealed: string[]; shown: string[]; kind?: string };
export type B38Run = { sessionId: string; turns: { turnIndex: number; role: string; text: string }[]; rows: { category: string; subtype: string; turnIndex: number; payloadJsonb: unknown }[]; records: Record<string, Rec> };
export const MARISOL = RUNS.marisol as unknown as B38Run;
export const TYLER = RUNS.tyler as unknown as B38Run;

export const textOf = (r: B38Run, n: number) => r.turns.find(t => t.turnIndex === n)!.text;
export const verdictOf = (r: B38Run, n: number) => r.rows.find(x => (x.payloadJsonb as VerdictPayload).candidateTurnIndex === n)?.payloadJsonb as VerdictPayload | undefined;
// The claim ids of every verdict on a message before `n` (the run's memory: decided already).
export const handledBefore = (r: B38Run, n: number) => r.rows.flatMap(x => {
  const v = x.payloadJsonb as VerdictPayload;
  return v.candidateTurnIndex < n ? v.claims.map((_, i) => `${v.candidateTurnIndex}:${i}`) : [];
});

export function readsAt(r: B38Run, n: number, flags: Record<string, unknown> = {}, opts: { verdictsBefore?: number } = {}): TurnReads {
  const rec = r.records[String(n)];
  const startedAt = new Date(Date.now() - rec.elapsedMs);
  const upTo = opts.verdictsBefore ?? n;
  return {
    session: {
      id: 's1', userId: 'u1', caseId: 'prof-002', phase: rec.phase, elapsedMs: 0, phaseStartedAt: startedAt, status: 'active', abandonPhase: null,
      startedAt, completedAt: null, flagsJsonb: { conduct: { warnings: 0 }, ...flags }, coverageJsonb: null,
    },
    turnRows: r.turns.filter(t => t.turnIndex < n).map(t => ({ id: `t${t.turnIndex}`, sessionId: 's1', turnIndex: t.turnIndex, role: t.role, text: t.text, timestampMs: startedAt.getTime() + t.turnIndex * 30_000, latencyMs: null })),
    exhibitRows: rec.shown.map((exhibitId, i) => ({ id: `e${i}`, sessionId: 's1', exhibitId, shownAtMs: startedAt.getTime() + 60_000 })),
    revealedRows: rec.revealed.map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() + 61_000 })),
    dataRequestEventRows: [],
    checkerEventRows: r.rows.filter(x => (x.payloadJsonb as VerdictPayload).candidateTurnIndex < upTo).map((x, i) => ({ id: `v${i}`, sessionId: 's1', phase: rec.phase, createdAt: new Date(), ...x })),
  } as unknown as TurnReads;
}
