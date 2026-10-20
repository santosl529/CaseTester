// An explicit deferral with no item (Lorenzo, 19 Oct; engine-asks R1, batch 32
// Aldermoor Marcus t5): checked by a small model before code refuses it —
// mapped to an item or no verdict: a named deferral; mapped to none: refused.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []) }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import { readsFixture } from './fixtures/turn-reads';

const WHAT = "Aldermoor's European Kelvexa sales trend since 2022";
const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
const plan = (flags: Record<string, unknown> = {}): ModelPlan => {
  const p = planTurn(readsFixture({ phase: 'STRUCTURE', flags }), `Could I get ${WHAT}?`,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
};
// No verdict left over from another test (an unconsumed mockResolvedValueOnce).
beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); });
const T = { requests: [{ what: WHAT, itemIds: [], explicit: true, respond: 'defer' as const }], exhibit: null, rescueItem: null };

describe('an item-less deferral', () => {
  it('is refused when the check maps the ask to no item', async () => {
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(plan(), T);
    expect(d.refusals).toEqual([WHAT]);
    expect(d.defers).toEqual([]);
    expect('unmappedDefer' in d).toBe(false);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('is a named deferral when the check maps it to an item (nothing released)', async () => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(), T);
    expect(d.defers).toEqual([WHAT]);
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's').join(' ')).toContain(WHAT);
  });
  it('is a named deferral when the check fails', async () => {
    classify.mockResolvedValueOnce(null);
    expect((await turnDataChecked(plan(), T)).defers).toEqual([WHAT]);
  });
  it('is checked once for Stream and Settle alike', async () => {
    classify.mockClear();
    classify.mockResolvedValueOnce([]);
    const p = plan();
    await turnDataChecked(p, T);
    await turnDataChecked(p, T);
    expect(classify).toHaveBeenCalledTimes(1);
  });
});

// Lorenzo, 19 Oct (R1): an ask the BASIS rule empties is checked too, not refused at once.
describe('an ask mapped to an item that the BASIS rule empties', () => {
  const BASIS_ASK = 'the basis for the COGS percentage';
  const B = { requests: [{ what: BASIS_ASK, itemIds: ['cogs_pct'], explicit: true, respond: 'release' as const }], exhibit: null, rescueItem: null };
  it('is a named deferral when the check maps it to another item, nothing released', async () => {
    classify.mockResolvedValueOnce([{ what: BASIS_ASK, ledgerItemIds: ['cogs_pct', 'labor_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), B);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([BASIS_ASK]);
  });
  // Engine-asks final review (19 Oct): the classifier maps a basis ask by topic
  // to the very item the BASIS rule cut — a deferral nothing keeps.
  it('is refused when the check maps it back only to the item the BASIS rule cut', async () => {
    classify.mockResolvedValueOnce([{ what: BASIS_ASK, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), B);
    expect(d.basisCut).toEqual({ [BASIS_ASK]: ['cogs_pct'] });
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(d.refusals).toEqual([BASIS_ASK]);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('is refused when the check maps it to none, and not re-queued as a deferral', async () => {
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(plan(SATISFIED), B);
    expect(d.refusals).toEqual([BASIS_ASK]);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('is a named deferral when the check has no verdict', async () => {
    classify.mockResolvedValueOnce(null);
    expect((await turnDataChecked(plan(SATISFIED), B)).defers).toEqual([BASIS_ASK]);
  });
  it('is asked of the classifier as an ask, not a bare noun phrase', async () => {
    classify.mockClear();
    classify.mockResolvedValueOnce([]);
    await turnDataChecked(plan(SATISFIED), B);
    expect(classify).toHaveBeenCalledWith(expect.objectContaining({ candidateText: `Could I get ${BASIS_ASK}?`, interviewerText: null }));
  });
});

// Lorenzo, 19 Oct (round-2 ruling 2): "R1 covers every code refusal of an
// unmatched ask, item-less releases included … Cap the Haiku check at ~1.5s; on
// a timeout or error, use the named deferral, never a refusal."
describe('an item-less release', () => {
  const R = { requests: [{ what: WHAT, itemIds: [], explicit: true, respond: 'release' as const }], exhibit: null, rescueItem: null };
  it('is a named deferral when the check maps it to an item, nothing released — "I\'ll come back to…" mid-case', async () => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(), R);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([WHAT]);
    expect(renderDataLines(d, 's')).toEqual([`I'll come back to ${WHAT} shortly.`]);
  });
  it('is refused when the check maps it to none', async () => {
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(plan(), R);
    expect(d.refusals).toEqual([WHAT]);
    expect(d.defers).toEqual([]);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('is a named deferral when the check has no verdict', async () => {
    classify.mockResolvedValueOnce(null);
    const d = await turnDataChecked(plan(), R);
    expect(d.defers).toEqual([WHAT]);
    expect(d.refusals).toEqual([]);
  });
  it('is a named deferral after a declared deferral turns into a release (pressure test satisfied)', async () => {
    classify.mockResolvedValueOnce(null);
    const d = await turnDataChecked(plan(SATISFIED), T);
    expect(d.defers).toEqual([WHAT]);
    expect(d.refusals).toEqual([]);
  });
  it('the check is capped at 1.5 s: a named deferral on the timeout', async () => {
    const p = plan();
    classify.mockImplementationOnce(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      let out: Awaited<ReturnType<typeof turnDataChecked>> | null = null;
      void turnDataChecked(p, R).then(d => { out = d; });
      await vi.advanceTimersByTimeAsync(1499);
      expect(out).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(out!.defers).toEqual([WHAT]);
      expect(out!.refusals).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
  // The controller's ruling (19 Oct): an ask that matched an item a finer-cut
  // scope rule emptied ("by month") is not unmatched — refused as today, unchecked.
  it('an ask the finer-cut scope rule emptied is refused without the check', async () => {
    classify.mockClear();
    const d = await turnDataChecked(plan(SATISFIED), { requests: [{ what: 'COGS by month', itemIds: ['cogs_pct'], explicit: true, respond: 'release' }], exhibit: null, rescueItem: null });
    expect(d.refusals).toEqual(['COGS by month']);
    expect(d.releases).toEqual([]);
    expect(classify).not.toHaveBeenCalled();
  });
});

// Ruling 2: a code-written turn's item-less detections go through the check
// too; ruling 3: on a wrap-up or close turn the named deferral is "We won't
// get to <ask> today." (Lorenzo's words) instead of "I'll come back to…".
import { codeWrittenTurn } from '@/lib/orchestrator/session-runner';
import type { TurnKind } from '@/lib/orchestrator/plan-turn';
describe('a code-written turn\'s item-less detection', () => {
  const det = [{ what: WHAT, ledgerItemIds: [], response: 'none' as const, explicit: true }];
  const atKind = (kind: TurnKind) => { const p = plan(SATISFIED); p.state.kind = kind; return p; };
  it('goes through the check (asked as an ask)', async () => {
    classify.mockClear();
    classify.mockResolvedValueOnce([]);
    const p = atKind('time_warning');
    const d = await turnDataChecked(p, codeWrittenTurn(p, det));
    expect(classify).toHaveBeenCalledWith(expect.objectContaining({ candidateText: `Could I get ${WHAT}?` }));
    expect(d.refusals).toEqual([WHAT]);
  });
  it.each(['close', 'close_wait', 'grace_ask', 'time_warning'] as TurnKind[])('%s: mapped → "We won\'t get to … today."', async kind => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const p = atKind(kind);
    const d = await turnDataChecked(p, codeWrittenTurn(p, det));
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([`We won't get to ${WHAT} today.`]);
  });
  it('close: no verdict → "We won\'t get to … today." too (the named deferral)', async () => {
    classify.mockResolvedValueOnce(null);
    const p = atKind('close');
    expect(renderDataLines(await turnDataChecked(p, codeWrittenTurn(p, det)), 's')).toEqual([`We won't get to ${WHAT} today.`]);
  });
  it('a mid-case code-written turn (rung 1): "I\'ll come back to…"', async () => {
    classify.mockResolvedValueOnce(null);
    const p = atKind('rung1');
    expect(renderDataLines(await turnDataChecked(p, codeWrittenTurn(p, det)), 's')).toEqual([`I'll come back to ${WHAT} shortly.`]);
  });
});

describe('a model turn in the recommendation or wrap phase', () => {
  const R = { requests: [{ what: WHAT, itemIds: [], explicit: true, respond: 'release' as const }], exhibit: null, rescueItem: null };
  const at = (phase: 'RECOMMENDATION' | 'WRAP', received: boolean) => {
    const p = planTurn(readsFixture({ phase, flags: SATISFIED }), `Could I get ${WHAT}?`, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    p.state.recommendationReceived = received;
    return p;
  };
  it.each(['RECOMMENDATION', 'WRAP'] as const)('%s, after the recommendation is received: "We won\'t get to … today."', async phase => {
    classify.mockResolvedValueOnce(null);
    expect(renderDataLines(await turnDataChecked(at(phase, true), R), 's')).toEqual([`We won't get to ${WHAT} today.`]);
  });
  it('RECOMMENDATION, before the recommendation: "I\'ll come back to…"', async () => {
    classify.mockResolvedValueOnce(null);
    expect(renderDataLines(await turnDataChecked(at('RECOMMENDATION', false), R), 's')).toEqual([`I'll come back to ${WHAT} shortly.`]);
  });
});
