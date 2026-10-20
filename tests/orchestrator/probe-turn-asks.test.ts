// Round 5 Task 48 (A1; B1 batch 34 Larkspur Marisol e6432db0 t11 → t12, t25 →
// t26): a turn that carries the math checker's probe answers the candidate's ask.
// Both turns: the model was handed the MATH CHECK FLAG, declared no request and
// wrote the probe (t11: code's vetted line replaced its question; t25: the model
// said the line); guard B's cues missed both asks ("Do we know whether …", "Do we
// know how quickly …"), so neither ask got a word. Now the message's addressed
// asks that no declared request covers are detected as on code-written turns and
// go through turnDataChecked: the data line is said between "say" and the probe.
// Neither ask is held by prof-002 — the check finds no item, so it is refused.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectedDataRequest } from '@/lib/orchestrator/data-requests';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
// The classifier on the message (detection), and the small-model check on an
// item-less ask ("Could I get <ask>?", turn-data.ts checkAsk): set per test.
let detected: DetectedDataRequest[] | null = [];
let checkVerdict: DetectedDataRequest[] | null = [];
const calls: string[] = [];
vi.mock('@/lib/orchestrator/data-requests', async orig => ({
  ...(await orig<object>()),
  classifyDataRequests: async (p: { candidateText: string }) => {
    calls.push(p.candidateText);
    return p.candidateText.startsWith('Could I get ') ? checkVerdict : detected;
  },
}));

import { planTurn, type ModelPlan, type CheckerLinePlan } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { streamTurnSegments } from '@/lib/orchestrator/stream-turn';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// Marisol e6432db0, verbatim from the run's turn file.
const T11_TEXT = "That's a hard structural gap. Let me put numbers on it.\n\nOur variable cost is $9,000 per flight. Thirty percent lower puts the competitor at $6,300 per flight. At the current $120 fare with 60 passengers, they're taking in $8,400 — the same $8,400 we take — but against $6,300, so they're making $2,100 a flight where we lose $600. They can sit at this fare indefinitely and we can't.\n\nThe other way to see it: to break even at $9,000 we need $150 per passenger, so $130 fare plus $20 extras. The market price is $120. We're $10 short on fare and there's no path to raising it while they're there, because they'd just hold.\n\nSo matching price was the wrong move — we kept the planes full at 75% and bought nothing for it. Do we know whether load factor would actually fall if we priced back up to $200, or is that untested?";
const T11_TURN: ModelTurn = { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: 'Mm-hm.', question: "You said Port Avery's fares fell and applied the same 40% decline to get FY2023 at $18,000. You also gave the FY2025 figure as $10,800 per passenger. Can you show me that calculation step by step?" };
const T11_LINE = 'You said “$18,000” — can you show me that calculation step by step?';
const T11_REVEALED = ['lakeport_seats_load', 'lakeport_fare', 'extras_revenue', 'lakeport_variable_cost', 'network_totals', 'competitor_entry', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'fixed_costs', 'competitor_costs'];

const T25_TEXT = "Two things. First, no incumbent on either route, so we're not walking into the same price war — the $180 fare should hold rather than get matched down.\n\nSecond, the ramp. At 60% in year one that's 48 passengers a flight, times $200 per passenger = $9,600 per flight, against $9,200 variable cost. So $400 of contribution per flight, times 5,000 = $2.0M in year one — versus the $14.0M at steady state. So the first twelve months are thin but still positive, and still better than the negative $1.8M we're bleeding today.\n\nThat's a $3.8M swing inside the 12-month window the CEO asked for, which takes us from minus $4M to roughly minus $0.2M. Not quite breakeven in year one, but profitable from year two.\n\nDo we know how quickly we can exit the Lakeport and Port Avery slots?";
const T25_TURN: ModelTurn = { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: 'Right.', question: 'You had "$2,800" of contribution per flight earlier. How did you do that calculation, given the load factor on the exhibit?' };
const T25_LINE = 'You had “$2,800” — how did you do that calculation?';
const T25_REVEALED = ['lakeport_seats_load', 'lakeport_fare', 'extras_revenue', 'lakeport_variable_cost', 'port_avery_per_flight', 'network_totals', 'competitor_entry', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'fixed_costs', 'new_routes_plan', 'new_routes_cost_flights', 'new_routes_context', 'competitor_costs', 'new_route_rampup'];

// t13: her answer to the t12 probe — no ask in it.
const T13_TEXT = "Sure. I took Port Avery's FY2025 revenue of $32.4M and divided by its 3,000 flights: 32.4 million over 3,000 is $10,800. Then I applied the Lakeport fare decline — $200 down to $120 is a 40% cut, so FY2025 is 60% of FY2023. Dividing $10,800 by 0.6 gives $18,000 for FY2023.\n\nAnd I can sanity-check that against the exhibit: FY2023 revenue was $46.8M over 3,000 flights, which is $15,600. So my $18,000 is high — the actual decline on Port Avery is $15,600 to $10,800, which is a 30.8% cut, not 40%. So Port Avery's fares came down less steeply than Lakeport's, roughly 31% versus 40%.\n\nEither way both routes are below the $150 per passenger we need to cover the $9,000.";

// What the classifier might call her asks (the live run never classified them):
// noun phrases, as its `what` is written.
const ELASTICITY = { what: 'evidence on whether load factor would fall if fares went back up to $200', ledgerItemIds: [], response: 'none' as const, explicit: true };
const SLOTS = { what: 'the timeline for exiting the Lakeport and Port Avery slots', ledgerItemIds: [], response: 'none' as const, explicit: true };

const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn, delivered: string[] = []): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered, undeliveredRevealIds: [] });
const REFUSE = new RegExp(`^(?:${PHRASE_POOLS.refuse.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[xX]\\\}/g, '.+')).join('|')})$`, 'i');

function plan(text: string, revealed: string[], shown: string[], line: { id: string; key: string; line: string } | null): ModelPlan {
  const p = planTurn(readsFixture({ phase: 'EXHIBIT', caseId: 'prof-002', revealed, elapsedMs: 560_000 }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  p.state.kind = 'model';
  p.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 3 };
  p.state.requiredExhibit = undefined;
  p.state.analysisOwed = false;
  p.state.owedStage = undefined;
  p.state.shownExhibitIds = new Set(shown);
  p.state.checkerLine = line ? { ...line, action: 'probe', undo: { attempt: undefined, step: null, mathChecker: { handled: [] } } } satisfies CheckerLinePlan : null;
  if (line) p.ctx.flags.mathChecker = { handled: [line.id] };
  return p;
}
const t11 = () => plan(T11_TEXT, T11_REVEALED, ['exhibit-1', 'exhibit-2'], { id: '9:4', key: 'checker:$18,000', line: T11_LINE });
const t25 = () => plan(T25_TEXT, T25_REVEALED, ['exhibit-1', 'exhibit-2', 'exhibit-3'], { id: '23:1', key: 'new_routes_annual@2800', line: T25_LINE });
const checkOf = (p: ModelPlan, name: string) => p.ctx.checks.entries.find(c => c.check === name);
const messageCalls = () => calls.filter(c => !c.startsWith('Could I get '));

beforeEach(() => { detected = []; checkVerdict = []; calls.length = 0; });

describe('a probe turn answers the ask in the message it replies to', () => {
  it('Marisol t11: "Do we know whether load factor would actually fall …" — refused (not held), then the probe', async () => {
    detected = [ELASTICITY];
    const p = t11();
    const s = await settleTurn(p, outcome(T11_TURN));
    const [say, data, probe] = [s.spokenText.slice(0, 'Mm-hm.'.length), s.spokenText.slice('Mm-hm. '.length, -T11_LINE.length - 1), s.spokenText.slice(-T11_LINE.length)];
    expect(say).toBe('Mm-hm.');
    expect(data).toMatch(REFUSE);
    expect(data).toMatch(/load factor/);
    expect(probe).toBe(T11_LINE);
    expect(checkOf(p, 'checker_line')).toMatchObject({ detail: { by: 'code', heard: true } });
    expect(checkOf(p, 'itemless_defer')).toMatchObject({ detail: { what: ELASTICITY.what, decision: 'refuse' } });
    expect(checkOf(p, 'probe_turn_requests')).toMatchObject({ decision: 'act', detail: { answered: [ELASTICITY.what] } });
    expect(s.result.dataRequestsClassified).toBe(true);
  });

  it('Marisol t25: "Do we know how quickly we can exit the Lakeport and Port Avery slots?" — refused, then the probe', async () => {
    detected = [SLOTS];
    const p = t25();
    const s = await settleTurn(p, outcome(T25_TURN));
    expect(s.spokenText.startsWith('Right. ')).toBe(true);
    const rest = s.spokenText.slice('Right. '.length);
    const probeAt = rest.indexOf('You had');
    expect(probeAt).toBeGreaterThan(0);
    expect(rest.slice(0, probeAt).trim()).toMatch(REFUSE);
    expect(rest.slice(0, probeAt)).toMatch(/Lakeport and Port Avery slots/);
    expect(rest.slice(probeAt)).toMatch(/\$2,800/);
    expect(checkOf(p, 'checker_line')).toMatchObject({ detail: { heard: true } });
    expect(checkOf(p, 'itemless_defer')).toMatchObject({ detail: { what: SLOTS.what, decision: 'refuse' } });
  });

  it('a probe turn with no ask is unchanged: no classifier call, no data line', async () => {
    detected = [ELASTICITY];   // never asked for: no sentence of t13 asks anything
    const p = plan(T13_TEXT, T11_REVEALED, ['exhibit-1', 'exhibit-2'], { id: '11:0', key: 'checker:$10,800', line: T11_LINE });
    const s = await settleTurn(p, outcome(T11_TURN));
    expect(s.spokenText).toBe(`Mm-hm. ${T11_LINE}`);
    expect(calls).toEqual([]);
    expect(checkOf(p, 'probe_turn_requests')).toBeUndefined();
  });

  // Task 48 left a turn with no checker line to the model; Task 50 (A4) answers an
  // undeclared ask on every model turn (model-turn-asks.test.ts).
  it('a turn with no checker line answers the undeclared ask too (round 5 Task 50), then the model\'s question', async () => {
    detected = [ELASTICITY];
    const p = plan(T11_TEXT, T11_REVEALED, ['exhibit-1', 'exhibit-2'], null);
    const s = await settleTurn(p, outcome({ ...T11_TURN, question: 'What would you do next?' }));
    expect(s.spokenText.startsWith('Mm-hm. ')).toBe(true);
    expect(s.spokenText.endsWith(' What would you do next?')).toBe(true);
    expect(s.spokenText.slice('Mm-hm. '.length, -' What would you do next?'.length)).toMatch(REFUSE);
    expect(checkOf(p, 'uncovered_asks')).toMatchObject({ decision: 'act', detail: { answered: [ELASTICITY.what] } });
    expect(checkOf(p, 'probe_turn_requests')).toBeUndefined();
  });

  it('an ask the model declared is not answered twice', async () => {
    detected = [ELASTICITY];
    const p = t11();
    const declared = { what: 'load factor response to a fare increase', itemIds: [], explicit: true, respond: 'release' as const };
    const s = await settleTurn(p, outcome({ ...T11_TURN, requests: [declared] }));
    expect(s.spokenText.match(/load factor/g)?.length).toBe(1);
    expect(checkOf(p, 'probe_turn_requests')).toMatchObject({ detail: { answered: [], covered: [ELASTICITY.what] } });
  });

  it('streamed: the data line goes out between "say" and the probe, and the message is classified once', async () => {
    detected = [ELASTICITY];
    const reference = await settleTurn(t11(), outcome(T11_TURN));
    calls.length = 0;
    const p = t11();
    const segs: string[] = [];
    const out = await streamTurnSegments(eventsFromTurn(Promise.resolve(T11_TURN)), p, async seg => { if (seg.text) segs.push(seg.text); }, { isDelivered: { value: false } });
    if (out.kind !== 'done') throw new Error('unexpected stop');
    const s = await settleTurn(p, outcome(out.turn, out.delivered));
    expect(s.prefixMismatch).toBe(false);
    expect(segs[0]).toBe('Mm-hm.');
    expect(segs[1]).toMatch(REFUSE);
    expect([...segs, s.tail].join(' ')).toBe(reference.spokenText);
    expect(messageCalls()).toEqual([T11_TEXT]);
  });
});
