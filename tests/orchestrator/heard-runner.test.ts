// Voice turns through the real Plan / Stream / Settle with a heard report
// (spec 2026-10-08-voice-phase-b §5): what was heard decides what is booked,
// saved and changed; a turn nobody heard writes nothing. In-memory store and
// scripted model as in pressure-test-runner.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import { TurnCancelled, type HeardReport, type HeardSegment, type Segment } from '@/lib/orchestrator/turn-types';

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
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

// ---- scripted model and judges ----
const modelQueue: ModelTurn[] = [];
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: () => {
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
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

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'Go on.', ...over });
const ask = (ids: string[], what = 'the data') => ({ what, itemIds: ids, explicit: true, respond: 'release' as const });
const flags = () => (store.session.flagsJsonb ?? {}) as Row;
const revealed = () => store.revealed.map(r => r.ledgerItemId);
const checkFired = (name: string) => store.events.some(e => e.category === 'check' && e.subtype === name && (e.payloadJsonb as Row).decision === 'act');
const SATISFIED = { state: 'satisfied', askedAt: 2, satisfiedAt: 3, reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false };

// The voice layer, stood in: records accepted segments; `heard` says how much
// of each was heard (chars) and whether its exhibit was confirmed.
type Hear = (s: Segment, i: number) => number | 'all' | 'none' | { chars: number | 'all' | 'none'; exhibitShown?: boolean };
function voice(hear: Hear, interrupted = true) {
  const segs: Segment[] = [];
  const onSegment = async (s: Segment) => { segs.push(s); };
  const heard = vi.fn(async (): Promise<HeardReport> => ({
    interrupted,
    segments: segs.map((s, i): HeardSegment => {
      const h = hear(s, i);
      const o = typeof h === 'object' ? h : { chars: h };
      const heardChars = o.chars === 'all' ? s.text.length : o.chars === 'none' ? 0 : o.chars;
      return { ...s, heardChars, exhibitShown: Boolean(o.exhibitShown), playback: heardChars === 0 ? 'unplayed' : heardChars >= s.text.length ? 'played' : 'partial' };
    }),
  }));
  return { segs, onSegment, heard };
}
const all: Hear = () => 'all';
const FIGURE = /\d[\d,]*(?:\.\d+)?%?/;
const throughFirstFigure = (t: string) => { const m = FIGURE.exec(t)!; return m.index + m[0].length; };
const beforeFirstFigure = (t: string) => FIGURE.exec(t)!.index;

beforeEach(() => { modelQueue.length = 0; });

describe('model turns: book and save what was heard', () => {
  it('a fully heard turn books its release and saves the whole line', async () => {
    resetStore('CLARIFY');
    const v = voice(all, false);
    modelQueue.push(T({ requests: [ask(['stores_count'], 'the store count')], question: 'How would you structure it?' }));
    const r = await runTurn('s1', 'How many stores are there?', { onSegment: v.onSegment, heard: v.heard });
    expect(revealed()).toEqual(['stores_count']);
    expect(r.interviewerText).toContain('How would you structure it?');
    expect(store.turns.at(-1)?.text).toBe(r.interviewerText);
    expect(flags().lastQuestion).toBe('How would you structure it?');
  });

  it('a release cut after its figure is booked; the unheard question changes nothing', async () => {
    resetStore('CLARIFY', { lastQuestion: 'What would you ask first?' });
    const v = voice(s => s.kind === 'data' ? throughFirstFigure(s.text) : s.kind === 'tail' ? 'none' : 'all');
    modelQueue.push(T({ requests: [ask(['stores_count'], 'the store count')], question: 'How would you structure it?' }));
    const r = await runTurn('s1', 'How many stores are there?', { onSegment: v.onSegment, heard: v.heard });
    expect(revealed()).toEqual(['stores_count']);
    expect(r.interviewerText).toMatch(FIGURE);
    expect(r.interviewerText).not.toContain('structure');
    expect(flags().lastQuestion).toBe('What would you ask first?');
    expect(checkFired('voice_heard')).toBe(true);
  });

  it('a release cut before its figure is not booked; its request row is logged as not answered', async () => {
    resetStore('CLARIFY');
    // prof-001's store-count line opens with its figure, so a heard say keeps the turn from being cancelled.
    const v = voice(s => s.kind === 'data' ? beforeFirstFigure(s.text) : s.kind === 'tail' ? 'none' : 'all');
    modelQueue.push(T({ say: 'That is a fair thing to check.', requests: [ask(['stores_count'], 'the store count')], question: 'Go on.' }));
    const r = await runTurn('s1', 'How many stores are there?', { onSegment: v.onSegment, heard: v.heard });
    expect(revealed()).toEqual([]);
    expect(r.interviewerText).not.toMatch(FIGURE);
    const row = store.events.find(e => e.category === 'data_request' && (e.payloadJsonb as Row).what === 'the store count');
    expect(row?.subtype).toBe('none');
    expect((row?.payloadJsonb as Row).unheardResponse).toBe('release');
  });

  it('an unheard probe does not count as the pressure test being asked', async () => {
    resetStore('STRUCTURE');
    const v = voice(s => s.kind === 'tail' ? 'none' : 'all');
    modelQueue.push(T({ say: 'Okay.', question: 'Is that MECE — what’s missing?' }));
    await runTurn('s1', 'I would split profit into revenue and costs.', { onSegment: v.onSegment, heard: v.heard });
    expect((flags().pressureTest as Row | undefined)?.state ?? 'not_asked').toBe('not_asked');
  });

  it('an exhibit is booked only when the browser confirmed it', async () => {
    for (const shown of [false, true]) {
      resetStore('ANALYSIS', { pressureTest: SATISFIED });
      const v = voice(s => ({ chars: 'all', exhibitShown: shown && Boolean(s.exhibitId) }), false);
      modelQueue.push(T({ requests: [ask(['exhibit-a'], 'the cost exhibit')], exhibit: 'exhibit-a', question: 'What stands out?' }));
      const r = await runTurn('s1', 'Can I see the cost breakdown exhibit?', { onSegment: v.onSegment, heard: v.heard });
      expect(v.segs.some(s => s.exhibitId === 'exhibit-a')).toBe(true);
      expect(store.exhibits.length).toBe(shown ? 1 : 0);
      expect(Boolean(r.exhibit)).toBe(shown);
    }
  });

  it('a turn nobody heard writes nothing and throws TurnCancelled', async () => {
    resetStore('CLARIFY');
    const before = store.turns.length;
    const v = voice(() => 'none');
    const onTiming = vi.fn();
    modelQueue.push(T({ requests: [ask(['stores_count'], 'the store count')], question: 'Go on.' }));
    await expect(runTurn('s1', 'How many stores', { onSegment: v.onSegment, heard: v.heard, onTiming })).rejects.toBeInstanceOf(TurnCancelled);
    expect(store.turns.length).toBe(before);
    expect(store.revealed).toEqual([]);
    expect(store.events).toEqual([]);
    expect(onTiming).toHaveBeenCalledOnce();
  });

  it('does not revive a session ended while the turn was playing (Review Focus 5)', async () => {
    resetStore('CLARIFY');
    const v = voice(all, false);
    const heard = async () => { store.session.status = 'abandoned'; return v.heard(); };
    modelQueue.push(T({ question: 'Go on.' }));
    await runTurn('s1', 'Okay.', { onSegment: v.onSegment, heard });
    expect(store.session.status).toBe('abandoned');
    expect(store.turns.at(-1)?.role).toBe('interviewer');
  });
});

describe('code-written lines that change state wait until they are heard in full', () => {
  const TIME_UP = 25 * 60_000;

  it('a close cut mid-line does not end the case; heard in full, it does', async () => {
    resetStore('RECOMMENDATION', { graceAskFired: true }, TIME_UP);
    const cut = voice(s => Math.floor(s.text.length / 2));
    const r1 = await runTurn('s1', 'So my recommendation stands.', { onSegment: cut.onSegment, heard: cut.heard });
    expect(r1.ended).toBe(false);
    expect(store.session.status).toBe('active');

    resetStore('RECOMMENDATION', { graceAskFired: true }, TIME_UP);
    const full = voice(all, false);
    const r2 = await runTurn('s1', 'So my recommendation stands.', { onSegment: full.onSegment, heard: full.heard });
    expect(r2.ended).toBe(true);
    expect(store.session.status).toBe('completed');
  });

  it('an unheard grace ask is not marked fired', async () => {
    resetStore('ANALYSIS', {}, TIME_UP);
    const v = voice(() => 3);
    await runTurn('s1', 'Let me keep going on costs.', { onSegment: v.onSegment, heard: v.heard });
    expect(flags().graceAskFired ?? false).toBe(false);
  });
});

describe('scripted lines: barge-in proof, but aware of cuts (§5.6)', () => {
  it('a conduct warning counts only when heard in full', async () => {
    resetStore('ANALYSIS');
    const cut = voice(s => Math.floor(s.text.length / 2));
    await runTurn('s1', "you're an idiot", { onSegment: cut.onSegment, heard: cut.heard });
    expect((flags().conduct as Row).warnings).toBe(0);
    expect(checkFired('scripted_not_delivered')).toBe(true);

    resetStore('ANALYSIS');
    const full = voice(all, false);
    await runTurn('s1', "you're an idiot", { onSegment: full.onSegment, heard: full.heard });
    expect((flags().conduct as Row).warnings).toBe(1);
  });

  it('a warning nobody heard is cancelled: nothing written', async () => {
    resetStore('ANALYSIS');
    const before = store.turns.length;
    const v = voice(() => 'none');
    await expect(runTurn('s1', "you're an idiot", { onSegment: v.onSegment, heard: v.heard })).rejects.toBeInstanceOf(TurnCancelled);
    expect(store.turns.length).toBe(before);
  });

  it('a termination stands even if nobody heard it', async () => {
    resetStore('ANALYSIS', { conduct: { warnings: 1 } });
    const v = voice(() => 'none');
    const r = await runTurn('s1', "you're useless", { onSegment: v.onSegment, heard: v.heard });
    expect(store.session.status).toBe('terminated');
    expect(r.ended).toBe(true);
  });

  it('a distress offer cut short is not recorded as offered', async () => {
    resetStore('ANALYSIS');
    const v = voice(s => Math.floor(s.text.length / 3));
    await runTurn('s1', "I'm going to bomb every interview, what's the point", { onSegment: v.onSegment, heard: v.heard });
    expect((flags().conduct as Row).distressOffered ?? false).toBe(false);
  });

  it('an inactive session says nothing and never asks what was heard', async () => {
    resetStore('CLARIFY');
    store.session.status = 'completed';
    const v = voice(all);
    await runTurn('s1', 'Hello?', { onSegment: v.onSegment, heard: v.heard });
    expect(v.heard).not.toHaveBeenCalled();
  });
});
