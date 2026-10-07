// Speculative turns (latency experiment 2, 7 Oct): a draft started on Flux's
// eager end-of-turn signal must not speak, write or run deferred work until
// it is accepted; a cancelled draft — even one whose model call finishes
// later — never does. The real Plan and Settle run against a mocked database;
// only the model stream is faked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readsFixture } from './fixtures/turn-reads';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';

const writes: string[] = [];
const usage: Record<string, unknown>[] = [];
let reads = readsFixture({ phase: 'ANALYSIS' });

vi.mock('@/db/client', () => {
  const chain = (label: string) => ({
    values: async () => { writes.push(label); },
    set: () => ({ where: async () => { writes.push(label); } }),
  });
  return {
    db: {
      query: {
        sessions: { findFirst: async () => reads.session },
        sessionTurns: { findMany: async () => reads.turnRows },
        exhibitsShown: { findMany: async () => reads.exhibitRows },
        revealedData: { findMany: async () => reads.revealedRows },
        sessionEvents: { findMany: async () => reads.dataRequestEventRows },
      },
      insert: () => chain('insert'),
      update: () => chain('update'),
    },
  };
});
vi.mock('@/lib/analytics', async orig => {
  const real = await orig<typeof import('@/lib/analytics')>();
  return {
  ...real,
  logEvent: async (type: string, payload: Record<string, unknown>) => {
    if (type === 'llm_usage') usage.push({ ...payload, speculativeDraftId: real.currentDraftId() });
    else writes.push(`analytics:${type}`);
  },
  };
});
vi.mock('@/lib/orchestrator/distress', async orig => ({
  ...(await orig<object>()),
  classifyDistress: async (p: { onUsage?: (u: object) => void }) => { p.onUsage?.({ component: 'distress' }); return null; },
}));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/agent/models/factory', () => ({ createInterviewerModel: () => ({}) }));

// The model: one turn, its events released when the test says so.
const TURN: ModelTurn = { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: 'A cost-first split.', question: 'Which line moved most?' };
let releaseModel: () => void = () => {};
vi.mock('@/lib/agent/interviewer', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    streamInterviewerTurn: async function* () {
      await new Promise<void>(r => { releaseModel = r; });
      yield* eventsFromTurn(Promise.resolve(TURN));
    },
  };
});

const { runTurn } = await import('@/lib/orchestrator/session-runner');
const { startDraft } = await import('@/lib/orchestrator/speculative-turn');
const { DraftCancelled, DraftGate } = await import('@/lib/orchestrator/speculation');

const tick = () => new Promise(r => setTimeout(r, 10));

beforeEach(() => {
  writes.length = 0;
  usage.length = 0;
  reads = readsFixture({ phase: 'ANALYSIS' });
});

describe('DraftGate', () => {
  it('holds until accepted', async () => {
    const g = new DraftGate();
    let passed = false;
    const w = g.wait().then(() => { passed = true; });
    await tick();
    expect(passed).toBe(false);
    g.accept();
    await w;
    expect(passed).toBe(true);
  });

  it('rejects every waiter once cancelled, and an accept after that does nothing', async () => {
    const g = new DraftGate();
    const w = g.wait();
    g.cancel();
    await expect(w).rejects.toBeInstanceOf(DraftCancelled);
    g.accept();
    expect(g.accepted).toBe(false);
    await expect(g.wait()).rejects.toBeInstanceOf(DraftCancelled);
  });
});

describe('runTurn without a gate', () => {
  it('speaks and writes as today', async () => {
    const heard: string[] = [];
    const p = runTurn('s1', 'Costs rose.', { onSegment: async s => { heard.push(s.text); } });
    await tick(); releaseModel();
    await p;
    expect(heard[0]).toBe('A cost-first split.');
    expect(writes).toContain('insert');
  });
});

describe('startDraft', () => {
  it('speaks and writes nothing until accepted, then delivers the turn once', async () => {
    const heard: string[] = [];
    const draft = startDraft('s1', 'Costs rose.', { onSegment: async s => { heard.push(s.text); } });
    await tick(); releaseModel(); await tick();
    expect(heard).toEqual([]);
    expect(writes).toEqual([]);
    expect(await draft.accept('Costs rose.')).toBe(true);
    await draft.result;
    expect(heard[0]).toBe('A cost-first split.');
    expect(heard.join(' ')).toContain('Which line moved most?');
    expect(writes.filter(w => w === 'insert').length).toBeGreaterThan(0);
  });

  it('cancelled before the model answers: nothing is spoken or written, deferred work is dropped', async () => {
    const heard: string[] = [];
    const deferred: unknown[] = [];
    const draft = startDraft('s1', 'Costs rose.', { onSegment: async s => { heard.push(s.text); }, defer: t => { deferred.push(t); } });
    await tick();
    draft.cancel();
    releaseModel();
    await expect(draft.result).rejects.toBeInstanceOf(DraftCancelled);
    expect(heard).toEqual([]);
    expect(writes).toEqual([]);
    expect(deferred).toEqual([]);
  });

  it('work Plan deferred (a resumed pause) runs only for an accepted draft', async () => {
    const paused = { silence: { checkedIn: false, silenceStartedAtMs: null, pausedAtMs: Date.now() - 30_000, pauseLimitMs: 600_000, pausedTotalMs: 0 } };
    reads = readsFixture({ phase: 'ANALYSIS', flags: paused });
    const dropped: unknown[] = [];
    const cancelled = startDraft('s1', 'Costs rose.', { defer: t => { dropped.push(t); } });
    await tick(); cancelled.cancel(); releaseModel();
    await expect(cancelled.result).rejects.toBeInstanceOf(DraftCancelled);
    expect(dropped).toEqual([]);

    const kept: unknown[] = [];
    const accepted = startDraft('s1', 'Costs rose.', { defer: t => { kept.push(t); } });
    await tick(); releaseModel(); await tick();
    expect(await accepted.accept('Costs rose.')).toBe(true);
    await accepted.result;
    expect(kept.length).toBeGreaterThan(0);
  });

  it('a late result after cancel never plays or commits', async () => {
    const heard: string[] = [];
    const draft = startDraft('s1', 'Costs rose.', { onSegment: async s => { heard.push(s.text); } });
    await tick(); releaseModel(); await tick();   // the model has finished; output is held
    draft.cancel();
    await expect(draft.result).rejects.toBeInstanceOf(DraftCancelled);
    expect(heard).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('is not accepted when the final transcript differs from the draft input', async () => {
    const draft = startDraft('s1', 'Costs rose.', {});
    await tick(); releaseModel(); await tick();
    expect(await draft.accept('Costs rose sharply.')).toBe(false);
    await expect(draft.result).rejects.toBeInstanceOf(DraftCancelled);
    expect(writes).toEqual([]);
  });

  it('is not accepted when the session state changed under it', async () => {
    const draft = startDraft('s1', 'Costs rose.', {});
    await tick(); releaseModel(); await tick();
    reads = readsFixture({ phase: 'ANALYSIS', revealed: ['cogs_pct'] });   // a release landed meanwhile
    expect(await draft.accept('Costs rose.')).toBe(false);
    await expect(draft.result).rejects.toBeInstanceOf(DraftCancelled);
    expect(writes).toEqual([]);
  });

  it("tags the draft's model usage as speculative", async () => {
    const draft = startDraft('s1', 'Costs rose.', {});
    await tick(); draft.cancel(); releaseModel();
    await draft.result.catch(() => {});
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.every(u => u.speculativeDraftId === draft.id)).toBe(true);
  });
});
