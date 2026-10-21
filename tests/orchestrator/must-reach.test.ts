// Round 6 Task 72, must-reach items (Lorenzo, 21 Oct, round 6: "Must-reach mechanism. Code releases a case-declared item
// at a declared point if the candidate hasn't asked by then. prof-002 only for now: competitor_entry before Exhibit 3
// (the network fix); new_route_rampup before the recommendation ask. The report should note when an item was
// volunteered."). Audit row 9 (docs/superpowers/plans/2026-10-21-data-path-audit.md): b36 Larkspur Jasmine bbf78ab8 —
// Exhibit 3 handed over at t10 (her brainstorm held for it), the competitor never told. The turns verbatim from the runs
// (batch 36 Larkspur, oct 20 runs 1-5; fixtures/must-reach.json): the message, the model's turn, the ledger and exhibits
// as they stood (record tN is the candidate's message N; the interviewer's reply is tN+1).
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const inserted: Row[] = [];
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async (v: Row | Row[]) => { inserted.push(...(Array.isArray(v) ? v : [v])); } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  },
}));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { planTurn, type ModelPlan, type TurnKind } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { turnData, mustReachItems } from '@/lib/orchestrator/turn-data';
import { renderDataLineParts } from '@/lib/orchestrator/data-decisions';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { getCaseById } from '@/lib/cases/loader';
import { CaseSchema } from '@/lib/cases/schema';
import { volunteeredItems } from '@/lib/scoring/data-coverage';
import { buildRevealedDataSection } from '@/lib/scoring/judge';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { readsFixture } from './fixtures/turn-reads';
import RUNS from './fixtures/must-reach.json';

type Run = { phase: string; kind: string; elapsedMs: number; revealed: string[]; shown: string[]; candidateText: string; owedStage: string | null; turn: ModelTurn; savedLine: string };
const run = (k: keyof typeof RUNS) => RUNS[k] as unknown as Run;
const larkspur = getCaseById('prof-002');
const valueOf = (id: string) => larkspur.dataLedger.find(d => d.id === id)!.value;
const COMPETITOR = valueOf('competitor_entry');
const RAMPUP = valueOf('new_route_rampup');
const EXHIBIT_3 = larkspur.exhibits.find(e => e.id === 'exhibit-3')!.title;

const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });

function plan(r: Run, over: { kind?: TurnKind; revealed?: string[]; flags?: Record<string, unknown>; caseId?: string } = {}): ModelPlan {
  const p = planTurn(readsFixture({ phase: r.phase as Phase, caseId: over.caseId ?? 'prof-002', revealed: over.revealed ?? r.revealed, elapsedMs: r.elapsedMs, flags: over.flags }), r.candidateText,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  p.state.kind = over.kind ?? (r.kind as TurnKind);
  p.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 3 };
  p.state.shownExhibitIds = new Set(r.shown);
  p.state.owedStage = (r.owedStage ?? undefined) as never;
  p.state.analysisOwed = false;
  p.state.checkerLine = null;
  p.state.stageCheckerLine = null;
  p.state.stageCodeLines = [];
  return p;
}
const checkOf = (p: ModelPlan, name: string) => p.ctx.checks.entries.find(c => c.check === name);

beforeEach(() => { inserted.length = 0; });

describe('the case declares its must-reach items (prof-002 only)', () => {
  it('prof-002: competitor_entry before Exhibit 3, new_route_rampup before the recommendation ask', () => {
    expect(larkspur.mustReach).toEqual([{ item: 'competitor_entry', before: 'exhibit-3' }, { item: 'new_route_rampup', before: 'recommendation' }]);
  });
  it('no other case declares any (prof-001 replays as before)', () => {
    for (const id of ['prof-001', 'pricing-001', 'launch-001', 'entry-001']) expect(getCaseById(id).mustReach).toBeUndefined();
  });
  it('an unknown item or point is rejected at load', () => {
    const raw = { ...larkspur, mustReach: [{ item: 'no_such_item', before: 'exhibit-3' }, { item: 'competitor_entry', before: 'exhibit-9' }] };
    const r = CaseSchema.safeParse(raw);
    expect(r.success).toBe(false);
    expect(r.error!.issues.map(i => i.message)).toEqual(expect.arrayContaining(['Unknown ledger item "no_such_item"', '"exhibit-9" is neither an exhibit nor "recommendation"']));
  });
});

describe('b36 Larkspur Jasmine bbf78ab8 t9 → t10: Exhibit 3 handed over, the competitor never told (audit row 9)', () => {
  const J = run('b36l-jasmine-bbf78ab8-t9');
  it('the run: Exhibit 3 went out with no word of the competitor', () => {
    expect(J.revealed).not.toContain('competitor_entry');
    expect(J.savedLine).toContain(`I'm putting up an exhibit: ${EXHIBIT_3}`);
    expect(J.savedLine).not.toContain(COMPETITOR);
  });
  it('now: competitor_entry is released in the data line, ahead of the exhibit, logged and booked', async () => {
    const p = plan(J);
    p.state.requiredExhibit = 'exhibit-3';
    p.state.brainstormDue = false;
    const s = await settleTurn(p, outcome(J.turn));
    const at = s.spokenText.indexOf(COMPETITOR);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(s.spokenText.indexOf(EXHIBIT_3));
    // The streamed data line (the unit-costs release) is untouched; the volunteered line follows it.
    expect(s.spokenText.indexOf(valueOf('unit_costs'))).toBeLessThan(at);
    expect(s.exhibitId).toBe('exhibit-3');
    expect(s.newReveals).toEqual(expect.arrayContaining(['unit_costs', 'competitor_entry']));
    expect(checkOf(p, 'must_reach')).toMatchObject({ decision: 'act', detail: { items: [{ item: 'competitor_entry', before: 'exhibit-3' }] } });
    expect(p.ctx.flags.mustReach).toEqual(['competitor_entry']);
    await s.persist({ firstSegmentMs: null, streamed: false });
    expect(inserted).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'intervention', subtype: 'volunteered', payloadJsonb: { item: 'competitor_entry', before: 'exhibit-3' } })]));
  });
  it('a stage turn that hands Exhibit 3 over (decideData\'s path): released first in the data line, past the cap', () => {
    const p = plan(J, { kind: 'stage_exhibit' });
    const d = turnData(p, { requests: J.turn.requests, exhibit: 'exhibit-3', rescueItem: null });
    expect(d.exhibit?.id).toBe('exhibit-3');
    expect(d.releases.map(r => r.id)).toEqual(['unit_costs', 'competitor_entry']);
    expect(d.releases.find(r => r.id === 'competitor_entry')).toMatchObject({ mustReach: 'exhibit-3', value: COMPETITOR });
  });
  it('already revealed: nothing volunteered', async () => {
    const p = plan(J, { revealed: [...J.revealed, 'competitor_entry'] });
    p.state.requiredExhibit = 'exhibit-3';
    p.state.brainstormDue = false;
    const s = await settleTurn(p, outcome(J.turn));
    expect(s.spokenText.split(COMPETITOR).length - 1).toBe(0);
    expect(checkOf(p, 'must_reach')).toBeUndefined();
  });
  it('said first, without the "earlier" lead-in: nobody asked for it', () => {
    const parts = renderDataLineParts({
      releases: [{ id: 'unit_costs', value: valueOf('unit_costs'), earlier: true }, { id: 'competitor_entry', value: COMPETITOR, earlier: false, mustReach: 'exhibit-3' }],
      restates: [], exhibit: { id: 'exhibit-3', title: EXHIBIT_3, covers: [] }, refusals: [], defers: [], gateDefers: [], unmatchedDefers: [], offers: [], requests: [],
    }, 's1:9');
    expect(parts.map(x => x.kind)).toEqual(['release', 'leadin', 'release', 'exhibit']);
    expect(parts[0]).toEqual({ kind: 'release', ids: ['competitor_entry'], text: COMPETITOR });
  });
  it('volunteered once already (flags.mustReach): never twice', () => {
    const p = plan(J, { kind: 'stage_exhibit', flags: { mustReach: ['competitor_entry'] } });
    expect(turnData(p, { requests: [], exhibit: 'exhibit-3', rescueItem: null }).releases.map(r => r.id)).not.toContain('competitor_entry');
  });
  it('a turn that hands over another exhibit: nothing', () => {
    const p = plan({ ...J, shown: ['exhibit-1'] }, { kind: 'stage_exhibit' });
    const d = turnData(p, { requests: [], exhibit: 'exhibit-2', rescueItem: null });
    expect(d.exhibit?.id).toBe('exhibit-2');
    expect(d.releases.map(r => r.id)).not.toContain('competitor_entry');
  });
});

describe('b36 Larkspur Tyler 4e91d638 t19 → t20: code\'s recommendation ask', () => {
  const T = run('b36l-tyler-4e91d638-t19');
  it('the run: the recommendation asked with the ramp-up never told', () => {
    expect(T.kind).toBe('rec_ask');
    expect(T.revealed).not.toContain('new_route_rampup');
    expect(T.savedLine).not.toContain(RAMPUP);
  });
  it('now: new_route_rampup is released before the question', async () => {
    const p = plan(T);
    const s = await settleTurn(p, outcome(T.turn));
    const at = s.spokenText.indexOf(RAMPUP);
    expect(at).toBeGreaterThan(s.spokenText.indexOf(T.turn.say));
    // Code's recommendation ask follows it.
    expect(s.spokenText.slice(at + RAMPUP.length).trim()).toMatch(/^[^.]*\?$/);
    expect(s.newReveals).toContain('new_route_rampup');
    expect(checkOf(p, 'must_reach')).toMatchObject({ decision: 'act', detail: { items: [{ item: 'new_route_rampup', before: 'recommendation' }] } });
  });
  it('time warning and grace ask too', () => {
    for (const kind of ['time_warning', 'grace_ask'] as TurnKind[]) {
      expect(turnData(plan(T, { kind }), { requests: [], exhibit: null, rescueItem: null }).releases.map(r => r.id)).toEqual(['new_route_rampup']);
    }
  });
  it('a close turn: nothing', () => {
    for (const kind of ['close', 'close_wait'] as TurnKind[]) {
      const p = plan(T, { kind });
      expect(mustReachItems(p, { recommendation: true }, { releases: [], restates: [], exhibit: null })).toEqual([]);
    }
  });
  it('already revealed: nothing', () => {
    const p = plan(T, { revealed: [...T.revealed, 'new_route_rampup'] });
    expect(turnData(p, { requests: [], exhibit: null, rescueItem: null }).releases).toEqual([]);
  });
  it('released this turn on the candidate\'s own ask: not volunteered', () => {
    const p = plan(T);
    const d = turnData(p, { requests: [{ what: 'how long new routes take to mature', itemIds: ['new_route_rampup'], explicit: true, respond: 'release' }], exhibit: null, rescueItem: null });
    expect(d.releases).toEqual([expect.objectContaining({ id: 'new_route_rampup' })]);
    expect(d.releases[0].mustReach).toBeUndefined();
  });
  it('a model turn that asks no recommendation (t21\'s risk question): nothing', async () => {
    const R = run('b36l-tyler-4e91d638-t21');
    const p = plan(R);
    const s = await settleTurn(p, outcome(R.turn));
    expect(s.spokenText).not.toContain(RAMPUP);
    expect(checkOf(p, 'must_reach')).toBeUndefined();
  });
});

describe('the model\'s own recommendation ask (stage-evidence.ts reads it)', () => {
  const T = run('b34l-tyler-t19');
  it('b34 Larkspur Tyler t19\'s question, on a turn with no stage owed: the ramp-up before it', async () => {
    expect(T.turn.question).toBe('Given that, what is your recommendation to the CEO for getting back to an operating profit within the next 12 months?');
    const p = plan({ ...T, owedStage: null });
    p.state.brainstormDue = true;
    p.state.requiredExhibit = undefined;
    const s = await settleTurn(p, outcome(T.turn));
    const at = s.spokenText.indexOf(RAMPUP);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(s.spokenText.indexOf(T.turn.question));
  });
  it('the same question held for the owed brainstorm (as in the run): no recommendation ask, nothing', async () => {
    const p = plan(T);
    const s = await settleTurn(p, outcome(T.turn));
    expect(s.spokenText).not.toContain(T.turn.question);
    expect(s.spokenText).not.toContain(RAMPUP);
  });
});

describe('prof-001 (no mustReach): unchanged', () => {
  it('code\'s recommendation ask releases nothing extra', () => {
    const T = run('b36l-tyler-4e91d638-t19');
    const p = plan({ ...T, revealed: [], shown: [] }, { caseId: 'prof-001' });
    expect(turnData(p, { requests: [], exhibit: null, rescueItem: null }).releases).toEqual([]);
  });
});

describe('the report: "<item label> was volunteered by the interviewer (not asked for)"', () => {
  const catalog = larkspur.dataLedger.map(d => ({ id: d.id, label: d.label }));
  it('read from the volunteered events', () => {
    const rows = [
      { subtype: 'volunteered', turnIndex: 9, payloadJsonb: { item: 'competitor_entry', before: 'exhibit-3' } },
      { subtype: 'recompute_flag', turnIndex: 7, payloadJsonb: {} },
    ];
    expect(volunteeredItems(rows, catalog)).toEqual([{ ledgerItemId: 'competitor_entry', label: 'What changed on the problem routes: a new competitor', turnIndex: 9 }]);
  });
  it('the judge\'s data section says it, and not to credit asking for it', () => {
    const section = buildRevealedDataSection(larkspur, ['competitor_entry'], {
      requestedUnanswered: [], requestedNotInCase: [],
      volunteered: [{ ledgerItemId: 'competitor_entry', label: 'What changed on the problem routes: a new competitor', turnIndex: 9 }],
    });
    expect(section).toContain('- What changed on the problem routes: a new competitor was volunteered by the interviewer (not asked for) (turn 9)');
    expect(section).toMatch(/do NOT credit the candidate for asking for this data/);
  });
  it('none volunteered: the section is as before', () => {
    expect(buildRevealedDataSection(larkspur, ['competitor_entry'], { requestedUnanswered: [], requestedNotInCase: [] })).not.toMatch(/volunteered/i);
  });
});
