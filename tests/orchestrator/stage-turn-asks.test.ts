// Round 5 Task 49 (A2; B1 batch 34 Aldermoor Tyler fc5eb050 t21 → t22): a
// code-written stage turn answers a held-data ask instead of dropping it.
// t21 ended "Do we know whether Kelvexa's US exclusivity runs long enough to make
// a build pay back?" — no data noun, so no sentence counted as an ask
// (request-signal.ts addressedAskSentences), and code's brainstorm stage turn
// dropped the classifier's detection (`code_written_requests`: sentences [],
// dropped "How long Kelvexa's US exclusivity/patent protection lasts" →
// `patents`, held: "protected by patents until 2038"). Now a detection whose item
// is held and that a question of the message names is kept; and the data line no
// longer pushes the brainstorm to a later turn (settle-turn.ts): the stage's ask
// follows it in the same turn. A statement ("I'd want …") is still dropped.
// Messages verbatim from the run records; the detections as recorded there.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectedDataRequest } from '@/lib/orchestrator/data-requests';

type Row = Record<string, unknown>;
const saved: { session: Row } = { session: {} };
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async () => {} }),
    update: () => ({ set: (v: Row) => ({ where: async () => { saved.session = { ...saved.session, ...v }; } }) }),
    transaction: async (f: (tx: unknown) => Promise<unknown>) => f({
      insert: () => ({ values: async () => {} }),
      update: () => ({ set: (v: Row) => ({ where: async () => { saved.session = { ...saved.session, ...v }; } }) }),
    }),
  },
}));
// Only the item-less ask check could call the classifier here; none does.
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { planTurn, type ModelPlan, type TurnKind } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { codeWrittenAsks, codeWrittenTurn } from '@/lib/orchestrator/session-runner';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// Tyler fc5eb050 t21, verbatim.
const TYLER_T21 = "That changes the answer materially. If two more assets are coming to the same specialist audience, the $83 million selling cost isn't a Kelvexa cost — it's a platform cost amortised across three products. The second and third launches then ride a salesforce that's already in place, with no royalty leakage. Under Option B we'd be handing 70% of the economics to a partner and, worse, handing them the relationships with exactly the specialists our pipeline needs.\n\nSo the pipeline tips me toward building, provided Kelvexa alone clears the bar — which at $320 million it just does.\n\nThe honest risk is the 12–18 month delay against an eight-year incumbent, and the 41% \"no local support\" barrier biting hardest in year one when we're least credible.\n\nA middle path worth sizing: co-promote with a partner for the first two or three years to buy speed and access, with a pre-agreed option to take the product in-house once our own team is stood up for the pipeline launches. Do we know whether Kelvexa's US exclusivity runs long enough to make a build pay back?";
const TYLER_REVEALED = ['option_a', 'option_b', 'option_shared', 'nimbrel', 'current_treatment', 'pipeline', 'us_adults', 'funnel_rates', 'peak_share_forecast', 'kelvexa_pricing', 'diagnosis_gap', 'survey_design', 'reasons_to_prescribe', 'barriers_to_prescribing', 'trial_comparison'];
const PATENTS: DetectedDataRequest = { what: "How long Kelvexa's US exclusivity/patent protection lasts", ledgerItemIds: ['patents'], response: 'none', explicit: true };

// Marcus (batch 34 Aldermoor 24) t19, a brainstorm stage turn: a want, no question.
const MARCUS_T19 = "$7,500 is the breakeven on Option A: at 20% share that's 40,000 patients × $7,500 = $300 million, exactly the bar. So any deeper rebating and owning it fails the board's test on net sales. That's where it came from — I should have shown it rather than asserted it.\n\nUnder the partner at 25% share and the same $7,500: 50,000 × $7,500 = $375 million in US net sales, which clears $300 million comfortably. Aldermoor's 30% royalty is $112.5 million.\n\nSo the fallback works on the board's stated metric but not on Aldermoor's own economics — and that's the definitional issue I flagged earlier. If the bar means product net sales, the partner passes down to about $6,000 net ($300m ÷ 50,000). If the bar means money Aldermoor books, the partner never passes at any realistic price, and owning it is the only route.\n\nI'd want that definition settled before the board meets.";
const MARCUS_REVEALED = ['patents', 'nimbrel', 'survey_design', 'reasons_to_prescribe', 'barriers_to_prescribing', 'us_adults', 'funnel_rates', 'peak_share_forecast', 'kelvexa_pricing', 'insurance_coverage', 'option_a', 'option_b', 'option_shared'];
const NET_SALES: DetectedDataRequest = { what: "What the board's stated metric for the $300 million net sales bar means — whether it refers to product net sales or money Aldermoor books", ledgerItemIds: ['net_sales_definition'], response: 'none', explicit: true };

const BRAINSTORM_ASK = 'If Aldermoor builds its own team, how could it reduce the risk of a slow start?';
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });

function plan(text: string, revealed: string[], kind: TurnKind, phase: 'EXHIBIT' | 'RECOMMENDATION', elapsedMs: number): ModelPlan {
  const p = planTurn(readsFixture({ phase, caseId: 'entry-001', revealed, elapsedMs }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  p.state.kind = kind;
  p.state.owedStage = 'brainstorm';
  p.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 5 };
  p.state.requiredExhibit = undefined;
  p.state.analysisOwed = false;
  p.state.checkerLine = null;
  p.state.stageCheckerLine = null;
  p.state.stageCodeLines = [];
  p.state.shownExhibitIds = new Set(['exhibit-1', 'exhibit-2', 'exhibit-3']);
  return p;
}
const tyler = (revealed = TYLER_REVEALED) => plan(TYLER_T21, revealed, 'stage_brainstorm', 'EXHIBIT', 1_026_755);
const checkOf = (p: ModelPlan, name: string) => p.ctx.checks.entries.find(c => c.check === name);

beforeEach(() => { saved.session = {}; });

describe('a stage turn answers a held-data ask (Tyler t21 → t22)', () => {
  it('the patents ask is kept: a held item, named by a question of the message', () => {
    const asks = codeWrittenAsks(tyler(), [PATENTS]);
    expect(asks.sentences).toEqual([]);   // still no addressed-ask sentence — the held rule keeps it
    expect(asks.kept).toEqual([PATENTS]);
    expect(asks.dropped).toEqual([]);
  });

  it('t22 says the patents line, then the brainstorm ask — in the same turn, and the stage counts as asked', async () => {
    const p = tyler();
    const { kept } = codeWrittenAsks(p, [PATENTS]);
    const s = await settleTurn(p, outcome(codeWrittenTurn(p, kept)));
    expect(s.newReveals).toEqual(['patents']);
    expect(s.spokenText).toMatch(/Kelvexa is protected by patents until 2038\./);
    expect(s.spokenText.endsWith(BRAINSTORM_ASK)).toBe(true);
    expect(s.spokenText.indexOf('2038')).toBeLessThan(s.spokenText.indexOf(BRAINSTORM_ASK));
    expect(checkOf(p, 'stage_hold')).toMatchObject({ decision: 'act', detail: { kind: 'stage_brainstorm' } });
    await s.persist({ firstSegmentMs: null, streamed: false });
    expect((saved.session.flagsJsonb as Row).stagesEnforced).toMatchObject({ brainstorm: true });
  });

  // At the goodbye only addressed asks are answered, as before (code-written-requests.test.ts, Jordan 15ad9d8e t25).
  it.each(['close', 'close_wait'] as TurnKind[])('%s: the held rule is off — dropped as before', kind => {
    const p = tyler();
    p.state.kind = kind;
    expect(codeWrittenAsks(p, [PATENTS]).dropped).toEqual([PATENTS]);
  });

  it('an item already out is no held ask: the question is dropped as before', () => {
    const asks = codeWrittenAsks(tyler([...TYLER_REVEALED, 'patents']), [PATENTS]);
    expect(asks.kept).toEqual([]);
    expect(asks.dropped).toEqual([PATENTS]);
  });
});

describe('a held item in a want, not a question, is still dropped (Marcus t19)', () => {
  it('"I\'d want that definition settled before the board meets." — net_sales_definition held, dropped', async () => {
    const p = plan(MARCUS_T19, MARCUS_REVEALED, 'stage_brainstorm', 'RECOMMENDATION', 924_078);
    const asks = codeWrittenAsks(p, [NET_SALES]);
    expect(asks.kept).toEqual([]);
    expect(asks.dropped).toEqual([NET_SALES]);
    const s = await settleTurn(p, outcome(codeWrittenTurn(p, asks.kept)));
    expect(s.spokenText).toBe(BRAINSTORM_ASK);
    expect(s.newReveals).toEqual([]);
  });
});
