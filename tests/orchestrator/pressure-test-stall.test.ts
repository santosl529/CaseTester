// Batch 18 v2 stalls (wave 1, 10 Oct): Destiny (6) turns 16–37 and Maya (1)
// turns 23–43. The pressure test stayed `awaiting` with no bound, the gate held
// the cost data silently, the model asked about "these cost lines" the
// candidate never received ("Those are being sent now"), and the judge
// rejected a valid answer twelve times before accepting the same reply. Maya
// t6 also heard a false refusal ("I don't have the number of stores").
//
// These replay the runs' real candidate lines, model outputs and judge
// verdicts (fixtures/pressure-test-stalls.json, from the turn records) through
// the real Plan / Stream / Settle, and pin the v3 policy: at most three replies
// while the probe is open (re-ask, narrowed probe, then a spoken, logged
// waiver), every held ask answered out loud with its reason, no question about
// figures that weren't delivered, and the judge reading the probe as asked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import stalls from './fixtures/pressure-test-stalls.json';
import { anyVariant } from '@/lib/orchestrator/phrasing';

// These tests pin the ledger's own data lines: prof-001's pre-written versions
// are off here (DATA_LINE_VARIANTS=0; on by default since 18 Oct).
process.env.DATA_LINE_VARIANTS = '0';

// ---- in-memory store (as in pressure-test-runner.test.ts) ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
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
const modelNotes: string[] = [];
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: (ctx: { turnSystem?: string }) => {
        modelNotes.push(ctx.turnSystem ?? '');
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
        return eventsFromTurn(Promise.resolve(t));
      },
    }),
  };
});
const judgeQueue: ({ answered: boolean } | null)[] = [];
const judgeProbes: string[] = [];
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async (p: { probe: string }) => { judgeProbes.push(p.probe); return judgeQueue.length ? judgeQueue.shift()! : null; },
  judgeStructureGiven: async () => ({ given: true, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

type Step = { turnIndex: number; candidate: string; model: unknown; verdict: { answered: boolean } | null };
type Run = { phase: string; structure: string; probe: string; intents: string[]; turns: Step[] };

// The session as it stood when the probe was delivered: the candidate's
// structure, then the probe as the last interviewer line, state awaiting.
function seed(run: Run, over: Row = {}) {
  const r = readsFixture({
    phase: run.phase as never,
    extraTurns: [{ role: 'candidate', text: run.structure }, { role: 'interviewer', text: run.probe }],
    flags: { pressureTest: { state: 'awaiting', askedAt: 4, probe: run.probe, intents: run.intents, reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false, ...over } },
  });
  store.session = { ...(r.session as Row) };
  store.turns = r.turnRows.map(t => ({ ...t }));
  store.revealed = []; store.exhibits = []; store.events = [];
}

// One candidate turn with the run's real model output and judge verdict
// (or an override). Leftover model output never shifts into the next turn.
async function step(s: Step, verdict: { answered: boolean } | null = s.verdict) {
  modelQueue.length = 0;
  modelQueue.push(s.model as ModelTurn, s.model as ModelTurn);
  judgeQueue.length = 0;
  judgeQueue.push(verdict);
  const r = await runTurn('s1', s.candidate, {});
  return r.interviewerText;
}

const pt = () => (store.session.flagsJsonb as Row | undefined)?.pressureTest as Row | undefined;
const revealed = () => store.revealed.map(r => r.ledgerItemId as string);
const at = (run: Run, turnIndex: number) => run.turns.find(t => t.turnIndex === turnIndex)!;
const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
// Destiny t15's ask for the cost lines, held by the gate: open on the later turns, as
// in the run (a test that starts after t15 seeds it; round 5 Task 51 checks a model
// release the message never names unless an earlier ask for it is open).
const openCostAsk = () => store.events.push({ category: 'data_request', subtype: 'defer', turnIndex: 15, payloadJsonb: { what: 'the cost breakdown over the two years', ledgerItemIds: COST, interviewerTurnIndex: 16, revealedByNow: false, explicit: true } });
const { maya, destiny } = stalls as unknown as { maya: Run; destiny: Run };

beforeEach(() => { modelQueue.length = 0; modelNotes.length = 0; judgeQueue.length = 0; judgeProbes.length = 0; });

describe('awaiting-answer turns are bounded (v3)', () => {
  it('Destiny: a valid answer rejected every time still ends the open probe on the third reply, with a waiver', async () => {
    seed(destiny);
    const heard: string[] = [];
    // Real verdicts: t13 (a valid answer — "staff, the biggest bill"; marketing
    // and utilities missing) and every reply after it were rejected.
    for (const t of [13, 15, 17]) heard.push(await step(at(destiny, t)));
    expect(pt()).toMatchObject({ state: 'waived', awaitingReplies: 3 });
    expect(heard[0]).toMatch(/which branch would you start with, and why\?/i);   // the one re-ask
    expect(heard[1]).toMatch(/Let me make it concrete/);                          // the narrowed probe
    expect(heard[2]).toMatch(/Let's leave the structure there\./);               // the waiver, spoken
  });

  it('Maya: the same bound holds while she only asks clarifying questions', async () => {
    seed(maya);
    for (const t of [4, 6, 8]) await step(at(maya, t));
    expect(pt()).toMatchObject({ state: 'waived', awaitingReplies: 3 });
  });

  it('a waiver is not satisfaction: it is logged as its own event, and held data goes out only on the waiver turn', async () => {
    seed(destiny);
    await step(at(destiny, 13));
    await step(at(destiny, 15));
    expect(revealed()).toEqual([]);                       // held while the probe is open
    const waiverTurn = await step(at(destiny, 17));
    expect(revealed()).toEqual(expect.arrayContaining(COST));
    expect(waiverTurn).toMatch(/Here's an exhibit: Brew & Bean Cost Structure Over Time\./);   // v4.10: the cost lines go out as the exhibit
    const waived = store.events.filter(e => e.subtype === 'pressure_test_waived');
    expect(waived).toHaveLength(1);
    expect(waived[0]).toMatchObject({ category: 'intervention' });
    // What scoring is told (lib/scoring/assists.ts summarizePressureTest).
    const payload = waived[0].payloadJsonb as Row;
    expect(payload).toMatchObject({ from: 'awaiting', probeDelivered: true, probe: destiny.probe, askedAt: 4, replyTurns: [5, 7, 9] });
    expect(payload.followUps).toHaveLength(2);
    expect(payload.waivedAt).toBe(10);
    expect(pt()?.satisfiedAt).toBeUndefined();
  });

  it('after the waiver the test is closed: no more probes, re-asks or held data', async () => {
    seed(destiny);
    for (const t of [13, 15, 17]) await step(at(destiny, t));
    const after: string[] = [];
    for (const t of [19, 21, 23]) after.push(await step(at(destiny, t), null));
    expect(pt()?.state).toBe('waived');
    expect(after.some(h => /Before I share that data|Let me make it concrete|structure/.test(h))).toBe(false);
    expect(judgeProbes).toHaveLength(3);                  // the judge is not asked once the test is closed
  });

  it('a judge failure (no verdict) still counts toward the bound', async () => {
    seed(destiny);
    for (const t of [13, 15, 17]) await step(at(destiny, t), null);
    expect(pt()?.state).toBe('waived');
  });
});

describe('pending requests stay recorded and their deferral is explained', () => {
  it('Maya t24, t26: each repeated ask for the held cost lines is answered out loud, with the reason', async () => {
    seed(maya);
    const heard = [await step(at(maya, 24)), await step(at(maya, 26))];
    for (const h of heard) expect(h).toMatch(anyVariant('gate_defer', 'the cost breakdown'));
    const defers = store.events.filter(e => e.category === 'data_request' && e.subtype === 'defer');
    expect(defers.length).toBeGreaterThanOrEqual(2);
    for (const d of defers) expect((d.payloadJsonb as Row).ledgerItemIds).toEqual(expect.arrayContaining(COST));
  });

  // v4.10: the three cost lines go out as the exhibit (not against the cap), so
  // all four held items reach the candidate on the waiver turn. The cap itself
  // is covered in data-decisions.test.ts.
  it('pending requests on the waiver turn: the cost lines as the exhibit, menu prices read out — nothing left held', async () => {
    seed(destiny);
    openCostAsk();
    // Destiny t25: COGS, labor, overhead and menu prices — four held items.
    await step(at(destiny, 25));
    await step(at(destiny, 27));
    const waiverTurn = await step(at(destiny, 29));
    expect(pt()?.state).toBe('waived');
    expect(revealed().sort()).toEqual([...COST, 'menu_price_change'].sort());
    expect(waiverTurn).toMatch(/Here's an exhibit: Brew & Bean Cost Structure Over Time\./);
    expect(waiverTurn).toMatch(/Menu prices have not changed in two years\./);
    expect(waiverTurn).not.toMatch(/I'll come back to/);
  });
});

describe('the interviewer never refers to figures the candidate has not received', () => {
  it('Destiny t31: no "being sent" claim and no question about "these cost lines" while they are held', async () => {
    seed(destiny, { awaitingReplies: 1, reasks: 1 });
    const heard = await step(at(destiny, 31));
    expect(heard).not.toMatch(/being sent|come through/i);
    expect(heard).not.toMatch(/these cost lines|those cost lines/i);
  });

  it('a model question about figures is replaced when none has reached the candidate, outside the probe ladder too', async () => {
    seed(destiny, { state: 'satisfied', satisfiedAt: 3 });
    const heard = await step({ ...at(destiny, 17), model: { ...(at(destiny, 17).model as object), requests: [] } }, null);
    expect(revealed()).toEqual([]);
    expect(heard).not.toMatch(/these three cost lines/i);
  });

  it('a question about figures that did go out this turn is kept', async () => {
    seed(destiny, { state: 'satisfied', satisfiedAt: 3 });
    openCostAsk();
    const heard = await step(at(destiny, 17), null);   // t17 declares the three cost lines, released now
    expect(revealed()).toEqual(expect.arrayContaining(COST));
    expect(heard).toMatch(/Which of these three cost lines moved the most/);
  });

  it('while the probe is open the model is told so, in any stage, and told not to ask about figures it has not seen', async () => {
    seed({ ...destiny, phase: 'ANALYSIS' });
    await step(at(destiny, 17));
    expect(modelNotes[0]).toMatch(/pressure test on the structure is waiting for an answer/);
    expect(modelNotes[0]).toMatch(/haven't received/);
  });
});

describe('the judge reads the probe the candidate actually heard', () => {
  it('after the re-ask, the judge is given the re-ask too, and a valid answer to it satisfies the test', async () => {
    seed(destiny);
    const reask = await step(at(destiny, 13));
    const followUp = (pt()?.followUps as string[]).at(-1)!;
    expect(reask).toContain(followUp);
    // With t15's own ask for the cost lines, verbatim (the model's t15 declares them).
    await step({ ...at(destiny, 15), candidate: "I'd start with staff, because 200 stores of baristas is the biggest bill. I'd want to see what each cost was two years ago versus now, I guess." }, { answered: true });
    expect(judgeProbes[1]).toContain(destiny.probe);
    expect(judgeProbes[1]).toContain(followUp);
    expect(pt()?.state).toBe('satisfied');
    expect(revealed()).toEqual(expect.arrayContaining(COST));
  });

  it('after the narrowed probe, the judge is given the narrowed probe', async () => {
    seed(destiny);
    await step(at(destiny, 13));
    const narrowed = await step(at(destiny, 15));
    const followUp = (pt()?.followUps as string[]).at(-1)!;
    expect(followUp).toMatch(/Let me make it concrete/);
    expect(narrowed).toContain(followUp);
    await step(at(destiny, 17), { answered: true });
    expect(judgeProbes[2]).toContain(followUp);
  });
});

describe("Maya t6: an unmapped ask for data the case holds is not refused", () => {
  it('"the number of stores over the two years" ([] + defer) is mapped to the store count, never "I don\'t have"', async () => {
    seed(maya);
    await step(at(maya, 4));
    const heard = await step(at(maya, 6));
    expect(heard).not.toMatch(/I don't have/);
    expect(heard).toMatch(/number of stores/);
    const row = store.events.find(e => e.category === 'data_request' && (e.payloadJsonb as Row).what === 'the number of stores over the two years');
    expect((row?.payloadJsonb as Row).ledgerItemIds).toEqual(['stores_count']);
  });

  it('an unmapped passing mention stays unmapped: nothing offered, refused or promised', async () => {
    seed(maya);
    const heard = await step({ ...at(maya, 4), model: { ...(at(maya, 4).model as object), requests: [
      { what: 'the number of stores', itemIds: [], explicit: false, respond: 'release' },
    ] } });
    expect(heard).not.toMatch(/I can share|I don't have|number of stores/);
  });

  it('a broader, qualified ask that contains a label is refused, and the labelled item is not released', async () => {
    seed(maya);
    const heard = await step({ ...at(maya, 4), model: { ...(at(maya, 4).model as object), requests: [
      { what: 'total annual revenue by region', itemIds: [], explicit: true, respond: 'release' },
    ] } });
    expect(heard).toMatch(/I don't have total annual revenue by region\./);
    expect(revealed()).not.toContain('revenue_total');
  });
});
