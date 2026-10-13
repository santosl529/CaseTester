// runTurn emits a TurnRecord through the optional onTurnRecord (spec 2026-10-09 §2.1).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// ---- in-memory store ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
function resetStore(phase: string, flags: Row = {}) {
  const r = readsFixture({ phase: phase as never, flags });
  store.session = { ...(r.session as Row) };
  store.turns = r.turnRows.map(t => ({ ...t }));
  store.revealed = []; store.exhibits = []; store.events = [];
}
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: async () => { throw new Error('no math checker calls in tests'); } }));
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', async () => {
  const { getTableName } = await import('drizzle-orm');
  const target = (t: unknown) => ({ session_turns: store.turns, revealed_data: store.revealed, exhibits_shown: store.exhibits, session_events: store.events } as Record<string, Row[]>)[getTableName(t as never)];
  return {
    db: {
      query: {
        sessions: { findFirst: async () => ({ ...store.session }) },
        sessionTurns: { findMany: async () => [...store.turns].sort((a, b) => (a.turnIndex as number) - (b.turnIndex as number)) },
        exhibitsShown: { findMany: async () => [...store.exhibits] },
        revealedData: { findMany: async () => [...store.revealed] },
        sessionEvents: { findMany: async () => store.events.filter(e => e.category === 'data_request') },
      },
      insert: (t: unknown) => ({ values: async (v: Row | Row[]) => { target(t)?.push(...(Array.isArray(v) ? v : [v])); } }),
      update: () => ({ set: (v: Row) => ({ where: async () => { store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

// ---- scripted model and judge ----
const modelQueue: ModelTurn[] = [];
let unclonableBody = false;
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: (ctx: { turnSystem?: string; onRequest?: (r: unknown) => void; onRawOutput?: (r: unknown) => void }) => {
        ctx.onRequest?.({ attempt: 'first', model: 'fake-model', body: { turnSystem: ctx.turnSystem, ...(unclonableBody ? { fn: () => 1 } : {}) } });
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
        ctx.onRawOutput?.({ attempt: 'first', text: JSON.stringify(t) });
        return eventsFromTurn(Promise.resolve(t));
      },
    }),
  };
});

vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async () => null,
  judgeStructureGiven: async () => ({ given: true, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');
import { TurnRecorder, type TurnRecord } from '@/lib/orchestrator/turn-record';

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'Go on.', ...over });
beforeEach(() => { modelQueue.length = 0; unclonableBody = false; });

describe('runTurn onTurnRecord', () => {
  it('a recorder error whose message itself throws still does not alter the turn (fix round 1)', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const a = await runTurn('s1', 'I think costs drove it.', {});
    class Hostile extends Error { override get message(): string { throw new Error('no message'); } }
    const spy = vi.spyOn(TurnRecorder.prototype, 'output').mockImplementation(() => { throw new Hostile(); });
    try {
      resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
      modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
      const records: TurnRecord[] = [];
      const b = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: rec => records.push(rec) });
      expect(b.interviewerText).toBe(a.interviewerText);
      expect(records).toHaveLength(1);
    } finally { spy.mockRestore(); }
  });

  it('records state before, the exact request, raw output, checks and the delivered line', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const records: TurnRecord[] = [];
    const r = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: rec => records.push(rec) });
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.stateBefore.phase).toBe('ANALYSIS');
    expect(rec.stateBefore.kind).toBe('model');
    expect(rec.stateBefore.promptContext?.currentPhase).toBe('ANALYSIS');
    expect(rec.requests.map(q => q.attempt)).toEqual(['first']);
    expect(rec.outputs).toHaveLength(1);
    expect(rec.checks.some(c => c.check === 'vetoes')).toBe(true);
    expect(rec.savedLine).toBe(r.interviewerText);
    expect(rec.delivered.length).toBeGreaterThan(0);
    expect(rec.parsedTurn?.question).toBe('Which line moved most?');
    expect(rec.recorderErrors).toEqual([]);
  });

  it('without onTurnRecord nothing changes (same interviewer text)', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const a = await runTurn('s1', 'I think costs drove it.', {});
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const b = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: () => {} });
    expect(b.interviewerText).toBe(a.interviewerText);
  });

  it('a throwing onTurnRecord does not fail the turn', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const r = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: () => { throw new Error('disk full'); } });
    expect(r.interviewerText).toContain('Which line moved most?');
  });

  it('a recorder failure (request body structuredClone throws) does not alter the turn', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const a = await runTurn('s1', 'I think costs drove it.', {});
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    unclonableBody = true;
    const records: TurnRecord[] = [];
    const b = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: rec => records.push(rec) });
    expect(b.interviewerText).toBe(a.interviewerText);
    expect(records).toHaveLength(1);
    // The record says what it is missing (follow-up 9 Oct).
    expect(records[0].requests).toEqual([]);
    expect(records[0].recorderErrors.map(e => e.stage)).toContain('request');
    expect(records[0].recorderErrors.find(e => e.stage === 'request')?.message).toBeTruthy();
  });
});
