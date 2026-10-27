// `asyncAskJudge`'s per-turn claim (Lorenzo, 27 Oct): INSERT … ON CONFLICT DO NOTHING on session_events_ask_judge_once.
// Mocked DB only — no Docker, no shared or production database.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertResult = { mode: 'inserted' as 'inserted' | 'conflict' | 'error' };
const inserts: unknown[] = [];
const judgeCalls = vi.fn();
vi.mock('@/db/client', () => {
  const chain = () => ({
    values: (v: unknown) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          if (insertResult.mode === 'error') throw new Error('there is no unique or exclusion constraint matching the ON CONFLICT specification');
          inserts.push(v);
          return insertResult.mode === 'inserted' ? [{ id: 'claim-1' }] : [];
        },
      }),
      then: (ok: (x: unknown) => void) => { inserts.push(v); ok(undefined); },   // the verdict row insert (awaited)
    }),
  });
  return { db: {
    insert: chain,
    update: () => ({ set: () => ({ where: async () => {} }) }),
    query: {
      sessionTurns: { findMany: async () => [
        { role: 'candidate', text: 'Do we have the price elasticity on the four uncontested routes?', turnIndex: 4, timestampMs: 1000 },
        { role: 'interviewer', text: "You'll find that on the exhibit — The route table has flights, revenue and contribution for each route.", turnIndex: 5, timestampMs: 2000 },
      ] },
      revealedData: { findMany: async () => [] },
    },
  } };
});
vi.mock('@/lib/analytics', () => ({ logEvent: async () => {} }));
vi.mock('@/lib/scoring/coverage', () => ({ assessCoverage: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => null }));
vi.mock('@/lib/orchestrator/ask-judge', async orig => ({ ...(await orig<object>()), callAskJudge: async () => { judgeCalls(); return { asks: [], latencyMs: 1 }; } }));

import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import { runAskJudgeOnce } from '@/lib/orchestrator/ask-judge';

const params = { sessionId: 's1', userId: 'u1', caseId: 'prof-002', phase: 'ANALYSIS' as const, result: { interviewerText: '', phase: 'ANALYSIS' as const, ended: false, auditPassed: true, dataRequestsClassified: true } };
beforeEach(() => { inserts.length = 0; judgeCalls.mockClear(); process.env.ENGINE_SWITCHES = '*=asyncAskJudge'; });

describe('the claim, end to end through runPostTurnBackground (mocked DB)', () => {
  it('inserted → exactly one judge call, and the verdict row written', async () => {
    insertResult.mode = 'inserted';
    await runPostTurnBackground(params as never);
    expect(judgeCalls).toHaveBeenCalledTimes(1);
    expect(inserts).toHaveLength(2);   // the claim row, then the verdict row
  });
  it('conflict → no judge call', async () => {
    insertResult.mode = 'conflict';
    await runPostTurnBackground(params as never);
    expect(judgeCalls).not.toHaveBeenCalled();
  });
  it('error (the index missing) → no judge call, and the pass never rejects', async () => {
    insertResult.mode = 'error';
    await expect(runPostTurnBackground(params as never)).resolves.toBeUndefined();
    expect(judgeCalls).not.toHaveBeenCalled();
  });
  it('switch off → no write, no call', async () => {
    process.env.ENGINE_SWITCHES = '*=phase1';
    insertResult.mode = 'inserted';
    await runPostTurnBackground(params as never);
    expect(judgeCalls).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });
});

describe('runAskJudgeOnce', () => {
  it('two callers on one turn: the one whose insert lands judges; the other does not', async () => {
    let landed = false;
    const judge = vi.fn(async () => ({ asks: [], latencyMs: 1 }));
    const claim = async () => { if (landed) return false; landed = true; return true; };
    const r = await Promise.all([runAskJudgeOnce({ claim, judge, write: async () => {} }), runAskJudgeOnce({ claim, judge, write: async () => {} })]);
    expect(judge).toHaveBeenCalledTimes(1);
    expect(r.sort()).toEqual(['judged', 'not_claimed']);
  });
  it('a claim that throws is "failed", never a rejection', async () => {
    const judge = vi.fn();
    await expect(runAskJudgeOnce({ claim: async () => { throw new Error('x'); }, judge, write: async () => {} })).resolves.toBe('failed');
    expect(judge).not.toHaveBeenCalled();
  });
});
