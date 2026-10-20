// An explicit deferral with no item (Lorenzo, 19 Oct; engine-asks R1, batch 32
// Aldermoor Marcus t5): checked by a small model before code refuses it — no
// verdict: a named deferral; mapped to none: refused; mapped to an item: decided
// by code like the model's own mapping (round 5 E5, Lorenzo, 20 Oct: restated if
// out, released if it can go now, else deferred by the item's name).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
// The check (classifyAsk) is a spy served through this file's detection mock (fixtures/ask-check.ts askVia —
// a test adapter; production sends the ask to the check's own prompt).
const { classify, ask } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []), ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify, classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import { readsFixture } from './fixtures/turn-reads';
import { askVia } from './fixtures/ask-check';

const WHAT = "Aldermoor's European Kelvexa sales trend since 2022";
const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
const plan = (flags: Record<string, unknown> = {}): ModelPlan => {
  const p = planTurn(readsFixture({ phase: 'STRUCTURE', flags }), `Could I get ${WHAT}?`,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
};
// No verdict left over from another test (an unconsumed mockResolvedValueOnce).
beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); ask.mockReset(); ask.mockImplementation(askVia(classify)); });
// The check's call as production makes it: the ask, and the case's catalog with each line's figures masked.
const COGS_MASKED = expect.objectContaining({ id: 'cogs_pct', line: 'COGS is #% of revenue today, up from #% # years ago.' });
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
  // E5 (d): the item the check found, held by the pressure-test gate, is deferred
  // by its own name and booked with its id — not the candidate's words.
  it('mapped to a gated item: deferred by the item\'s name, booked with its id, nothing released', async () => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(), T);
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(d.gateDefers).toEqual(['COGS as a percent of revenue']);
    expect(d.gatedIds).toEqual(['cogs_pct']);
    expect(d.itemlessDefers).toBeUndefined();
    const line = renderDataLines(d, 's').join(' ');
    expect(line).toContain('COGS as a percent of revenue');
    expect(line).not.toContain(WHAT);
    expect(line).not.toMatch(/\d/);
    expect(d.requests.map(r => [r.response, r.ledgerItemIds])).toEqual([['defer', ['cogs_pct']]]);
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
  // E5 (b): a basis ask is out of scope of every item whose value doesn't say
  // where it comes from, so the check's items are coarse: their lines (not yet
  // out), and "I don't have <the basis>." — never a hollow deferral.
  it('mapped to other items: E1\'s form — they go out (here on the exhibit that shows both), and the basis refused', async () => {
    classify.mockResolvedValueOnce([{ what: BASIS_ASK, ledgerItemIds: ['cogs_pct', 'labor_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), B);
    expect(d.exhibit?.id).toBe('exhibit-a');
    expect(d.refusals).toEqual([BASIS_ASK]);
    expect(d.defers).toEqual([]);
  });
  it('mapped back only to the item the BASIS rule cut: its line, and the basis refused', async () => {
    classify.mockResolvedValueOnce([{ what: BASIS_ASK, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const p = plan(SATISFIED);
    const d = await turnDataChecked(p, B);
    // Decided twice (before and after the check), logged once: the second pass's checks only.
    expect(p.ctx.checks.entries.filter(e => e.check === 'request_scope')).toHaveLength(1);
    expect(p.ctx.checks.entries.map(e => e.check).filter(c => c === 'itemless_defer' || c === 'checked_ask')).toEqual(['itemless_defer', 'checked_ask']);
    expect(d.basisCut).toEqual({ [BASIS_ASK]: ['cogs_pct'] });
    expect(d.releases.map(r => r.id)).toEqual(['cogs_pct']);
    expect(d.refusals).toEqual([BASIS_ASK]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(['COGS is 58% of revenue today, up from 42% two years ago.', `I don't have ${BASIS_ASK}.`]);
  });
  it('… the item already out: the refusal alone, no restate (4b)', async () => {
    classify.mockResolvedValueOnce([{ what: BASIS_ASK, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const p = planTurn(readsFixture({ phase: 'STRUCTURE', flags: SATISFIED, revealed: ['cogs_pct'] }), `Could I get ${WHAT}?`, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    const d = await turnDataChecked(p, B);
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([`I don't have ${BASIS_ASK}.`]);
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
  it('is sent to the check as the ask, with the masked catalog', async () => {
    classify.mockResolvedValueOnce([]);
    await turnDataChecked(plan(SATISFIED), B);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ what: BASIS_ASK, catalog: expect.arrayContaining([COGS_MASKED]) }));
    expect((ask.mock.calls[0][0] as { catalog: { line: string }[] }).catalog.filter(c => /\d/.test(c.line))).toEqual([]);
  });
});

// Lorenzo, 19 Oct (round-2 ruling 2): "R1 covers every code refusal of an
// unmatched ask, item-less releases included … Cap the Haiku check at ~1.5s; on
// a timeout or error, use the named deferral, never a refusal."
describe('an item-less release', () => {
  const R = { requests: [{ what: WHAT, itemIds: [], explicit: true, respond: 'release' as const }], exhibit: null, rescueItem: null };
  it('mapped to a gated item: not released, deferred by the item\'s name, never "I\'ll come back to <ask>"', async () => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(), R);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(d.gateDefers).toEqual(['COGS as a percent of revenue']);
    expect(renderDataLines(d, 's').join(' ')).not.toContain(WHAT);
  });
  it('mapped to an item that can go now: released this turn', async () => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), R);
    expect(d.releases.map(r => r.id)).toEqual(['cogs_pct']);
    expect(d.defers).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(['COGS is 58% of revenue today, up from 42% two years ago.']);
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
  // Round 5 E1 (Lorenzo, 20 Oct) reverses the controller's 19 Oct ruling (an ask
  // a finer-cut scope rule emptied was refused whole, unchecked): it keeps its
  // coarse item — released with "I don't have <the ask>." — and is checked only
  // when no coarse item can go out.
  const BY_MONTH = { requests: [{ what: 'COGS by month', itemIds: ['cogs_pct'], explicit: true, respond: 'release' as const }], exhibit: null, rescueItem: null };
  it('an ask the finer-cut scope rule emptied keeps its coarse item: released, the finer cut refused, no check', async () => {
    classify.mockClear();
    const d = await turnDataChecked(plan(SATISFIED), BY_MONTH);
    expect(d.releases.map(r => r.id)).toEqual(['cogs_pct']);
    expect(d.refusals).toEqual(['COGS by month']);
    expect(classify).not.toHaveBeenCalled();
    expect(renderDataLines(d, 's')).toEqual(['COGS is 58% of revenue today, up from 42% two years ago.', "I don't have COGS by month."]);
    expect(d.requests.map(r => [r.response, r.ledgerItemIds])).toEqual([['release', ['cogs_pct']], ['refuse', []]]);
  });
  it('… its coarse item held by the pressure-test gate: not released, the ask checked like any refusal', async () => {
    classify.mockClear();
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(plan(), BY_MONTH);
    expect(d.releases).toEqual([]);
    expect(d.gateDefers).toEqual([]);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(d.refusals).toEqual(['COGS by month']);
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
  it('goes through the check (the ask, with the masked catalog)', async () => {
    classify.mockResolvedValueOnce([]);
    const p = atKind('time_warning');
    const d = await turnDataChecked(p, codeWrittenTurn(p, det));
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ what: WHAT, catalog: expect.arrayContaining([COGS_MASKED]) }));
    expect(d.refusals).toEqual([WHAT]);
  });
  // E5 (d) at a wrap-up: what can go now goes; what can't (here over the release
  // cap) is "We won't get to <the item> today." — by its name, as the rules say there.
  it.each(['close', 'close_wait', 'grace_ask', 'time_warning', 'rec_ask'] as TurnKind[])('%s: mapped → released up to the cap, the rest "We won\'t get to <item> today."', async kind => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['revenue_per_store', 'avg_ticket', 'menu_price_change', 'bean_price_change'], response: 'none', explicit: true }]);
    const p = atKind(kind);
    const d = await turnDataChecked(p, codeWrittenTurn(p, det));
    expect(d.releases.map(r => r.id)).toEqual(['revenue_per_store', 'avg_ticket', 'menu_price_change']);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's').at(-1)).toBe("We won't get to the coffee bean price change today.");
    expect(d.requests.find(r => r.ledgerItemIds.includes('bean_price_change'))?.wontGetTo).toBe(true);
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

// Round-3 ruling 5 (Lorenzo, 19 Oct; batch 28 Marisol t7 "a split within the
// non-bean inputs", batch 30 Anika t6): code refuses only when the check says
// the case doesn't hold it. Round 5 E5 (b) (Lorenzo, 20 Oct): an item the check
// finds outside the ask's scope gets E1's form — "I don't have <the ask>." with
// the coarse item's line when one can go; a change item asked for a split is a
// sibling, not a coarse item (E1's ruling), so the refusal stands.
describe('the check\'s mapping out of the ask\'s scope (E5 b)', () => {
  const ask = (what: string) => ({ requests: [{ what, itemIds: [], explicit: true, respond: 'release' as const }], exhibit: null, rescueItem: null });
  it('"bean cost per pound" mapped only to out-of-scope bean_price_change → its line, and the per-pound cut refused', async () => {
    classify.mockResolvedValueOnce([{ what: 'bean cost per pound', ledgerItemIds: ['bean_price_change'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), ask('bean cost per pound'));
    expect(d.releases.map(r => r.id)).toEqual(['bean_price_change']);
    expect(d.refusals).toEqual(['bean cost per pound']);
    expect(d.defers).toEqual([]);
    const lines = renderDataLines(d, 's');
    expect(lines[0]).toMatch(/40%/);
    expect(lines.at(-1)).toBe("I don't have bean cost per pound.");
  });
  it('"a split within the non-bean inputs" mapped only to the sibling non_bean_input_change → refused, nothing released', async () => {
    classify.mockResolvedValueOnce([{ what: 'a split within the non-bean inputs', ledgerItemIds: ['non_bean_input_change'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), ask('a split within the non-bean inputs'));
    expect(d.refusals).toEqual(['a split within the non-bean inputs']);
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
  });
  it('mapped to no item → refused', async () => {
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(plan(SATISFIED), ask('bean cost per pound'));
    expect(d.refusals).toEqual(['bean cost per pound']);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('an in-scope mapping → released now', async () => {
    classify.mockResolvedValueOnce([{ what: WHAT, ledgerItemIds: ['bean_price_change'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), ask(WHAT));
    expect(d.releases.map(r => r.id)).toEqual(['bean_price_change']);
    expect(d.defers).toEqual([]);
    expect(d.refusals).toEqual([]);
  });
  it('one in-scope item among out-of-scope ones → the in-scope one answers; the rest is dropped, no refusal', async () => {
    classify.mockResolvedValueOnce([{ what: 'a split within the non-bean inputs', ledgerItemIds: ['non_bean_input_change', 'cogs_pct'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(SATISFIED), ask('a split within the non-bean inputs'));
    expect(d.releases.map(r => r.id)).toEqual(['cogs_pct']);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([]);
  });
  it('null → a named deferral', async () => {
    classify.mockResolvedValueOnce(null);
    expect((await turnDataChecked(plan(SATISFIED), ask('bean cost per pound'))).defers).toEqual(['bean cost per pound']);
  });
});
