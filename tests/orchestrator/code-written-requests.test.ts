// Code-written turns (close, grace ask, time warning) answer the message's data
// requests only when the candidate asked by phrasing (request-signal.ts).
// Smoke run 9 Oct (Tobias, b5ebdd96 t22): a final answer listing the
// conditions that would change the recommendation was read by the classifier
// as three asks, and the goodbye released two figures and refused two items.
// Real asks in a final message are still answered (Rule 12 item 6). Through
// the real Plan / Settle with an in-memory store, as in heard-runner.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readsFixture } from './fixtures/turn-reads';
import type { DetectedDataRequest } from '@/lib/orchestrator/data-requests';
import { explicitRequestCues } from '@/lib/orchestrator/request-signal';

// ---- in-memory store ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
function resetStore(phase: string, flags: Row = {}, elapsedMs?: number) {
  const r = readsFixture({ phase: phase as never, flags, elapsedMs });
  store.session = { ...(r.session as Row) };
  store.turns = r.turnRows.map(t => ({ ...t }));
  store.revealed = []; store.exhibits = []; store.events = [];
}
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
// The classifier's verdict for the message, set per test.
let detected: DetectedDataRequest[] | null = [];
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => detected }));
vi.mock('@/lib/agent/models/factory', async () => ({
  createInterviewerModel: () => ({
    runTurn: async () => { throw new Error('code-written turns make no model call'); },
    streamTurn: () => { throw new Error('code-written turns make no model call'); },
  }),
}));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async () => null,
  judgeStructureGiven: async () => ({ given: true, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

const SATISFIED = { state: 'satisfied', askedAt: 2, satisfiedAt: 3, reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false };
const revealed = () => store.revealed.map(r => r.ledgerItemId);
const requestRows = () => store.events.filter(e => e.category === 'data_request' && e.subtype !== 'classified');
const marker = () => store.events.find(e => e.category === 'data_request' && e.subtype === 'classified');
const check = (name: string) => store.events.find(e => e.category === 'check' && e.subtype === name)?.payloadJsonb as Row | undefined;
const turnKind = () => ((check('turn_kind')?.detail as Row | undefined)?.kind);

// The smoke run's final message, verbatim (b5ebdd96 turn 22).
const SMOKE = "Volume loss is the bigger risk, because it's the one that can make the recommendation actively destructive rather than just insufficient. Brand damage is slower and manageable with messaging; elasticity is immediate and arithmetic.\n\nHere's the threshold. At 58% COGS, contribution margin is roughly 42% — call it 20% after labor and variable overhead. If I raise price 10%, I can afford to lose volume up to the point where the gain on retained customers offsets the lost contribution. Very roughly, a 10% price increase on a 42% gross margin breaks even around 19% volume loss. So if the pilot shows transaction counts down more than high-teens percent, I stop.\n\nWhat would make me change course: one, pilot elasticity above that threshold; two, competitors confirmed to be holding prices, which means we'd be ceding share, not following the market; three, evidence the 15% revenue growth is entirely new-store openings masking declining same-store traffic — that means the customer base is already fragile and I'd fix traffic before price.";
// What the classifier made of it in the smoke run.
const SMOKE_DETECTED: DetectedDataRequest[] = [
  { what: 'Pilot elasticity results (volume loss from price increase)', ledgerItemIds: [], response: 'none', explicit: true },
  { what: 'Competitor pricing actions', ledgerItemIds: [], response: 'none', explicit: true },
  { what: 'Breakdown of revenue growth between new store openings and same-store traffic', ledgerItemIds: ['stores_count', 'revenue_total'], response: 'none', explicit: true },
];
const ASK = 'Before we wrap, could I get the store count for both years?';
const ASK_DETECTED: DetectedDataRequest[] = [
  { what: 'Store count for both years', ledgerItemIds: ['stores_count'], response: 'none', explicit: true },
];

const TIME_UP = 25 * 60_000;
const KINDS: { kind: string; setup: () => void }[] = [
  { kind: 'close', setup: () => resetStore('RECOMMENDATION', { graceAskFired: true, pressureTest: SATISFIED }, TIME_UP) },
  { kind: 'grace_ask', setup: () => resetStore('ANALYSIS', { pressureTest: SATISFIED }, TIME_UP) },
  { kind: 'time_warning', setup: () => resetStore('ANALYSIS', { pressureTest: SATISFIED }, 19 * 60_000) },
];

beforeEach(() => { detected = []; });

describe('the smoke text carries no explicit ask by phrasing', () => {
  it('explicitRequestCues(SMOKE) is empty', () => {
    expect(explicitRequestCues(SMOKE)).toEqual([]);
    expect(explicitRequestCues(ASK)).toEqual(['could I get']);
  });
});

describe.each(KINDS)('$kind turn', ({ kind, setup }) => {
  it('a list of conditions is not answered as data requests', async () => {
    setup();
    detected = SMOKE_DETECTED;
    const r = await runTurn('s1', SMOKE);
    expect(turnKind()).toBe(kind);
    expect(r.interviewerText).not.toMatch(/I don't have|come back to|I can share/);
    expect(r.interviewerText).not.toContain('200 stores');
    expect(r.interviewerText).not.toContain('$480M');
    expect(revealed()).toEqual([]);
    // Not logged as asks; the marker stays, so nothing re-classifies the exchange.
    expect(requestRows()).toEqual([]);
    expect((marker()?.payloadJsonb as Row | undefined)?.requestCount).toBe(0);
    expect(r.dataRequestsClassified).toBe(true);
    // The dropped detections are kept in a check, for review.
    const c = check('code_written_requests');
    expect(c?.decision).toBe('act');
    expect((c?.detail as Row).dropped).toEqual(SMOKE_DETECTED.map(d => d.what));
    if (kind === 'close') expect(r.ended).toBe(true);
  });

  it('an explicit ask is still answered', async () => {
    setup();
    detected = ASK_DETECTED;
    const r = await runTurn('s1', ASK);
    expect(turnKind()).toBe(kind);
    expect(revealed()).toEqual(['stores_count']);
    expect(r.interviewerText).toContain('200 stores');
    expect(requestRows().map(e => (e.payloadJsonb as Row).what)).toEqual(['Store count for both years']);
    expect(check('code_written_requests')?.decision).toBe('pass');
    if (kind === 'close') expect(r.ended).toBe(true);
  });
});
