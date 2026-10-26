// Phase 1 4.9 (`recommendationReceived`; Lorenzo, 22 Oct: "recommendationReceived: set it on a clear recommendation.
// The time warning skips the recommendation ask if one came in the last two turns."). b37 Quillpath Marcus t31 "Keep
// Starter, and raise the price to $60." left `recommendationReceived` false; t32's time warning asked again.
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { clearRecommendation } from '@/lib/orchestrator/stall';
import { readsFixture } from './fixtures/turn-reads';

// Verbatim first sentences (and more) of the Quillpath replies the stage record missed.
const MARCUS_B37Q_T31 = "Keep Starter, and raise the price to $60.  Starter passes the board's 3x test once upgrades are credited — the CFO is measuring it as a standalone plan, but 20% of sign-ups become Pro customers with ~50-month lifetimes, which is worth about $800 per sign-up on top of the Starter margin.";
const CLEAR = [
  MARCUS_B37Q_T31,
  "Keep Starter — don't shut it down — and raise the price to $60.  On the board's test, Starter passes once upgrades are counted.", // b37q Tyler t25
  "Keep Starter and reprice it to $60.  Three reasons. First, the CFO's test is wrong, not Starter.",                                  // b35q Raj t25
  'Keep Starter and move the price to $60, rolled out in stages.',                                                                    // b37q Raj t39
  'Bottom line: keep Starter and move it to $60.',                                                                                    // b37q Tyler t33
  // The two the review named as the imperatives that must keep working.
  'Keep Starter, and raise the price to $60.',
  'Partner for launch, with a path to build later.',
  // Review fix round, item 1: a decision frame counts as well as the bare imperative.
  'My recommendation is to keep Starter and move it to $60.',
  "I'd recommend partnering for launch, with a path to build later.",
  'We should exit the category and redeploy the capital.',
  'So, I recommend keeping Starter at $60.',
];
const NOT = [
  'Keep in mind the 13.5 months is borrowed from $40 customers.',
  'Keep Starter at $40?',
  "Honestly, I can't commit to a recommendation without the churn data. Keep Starter for now.",
  'At $60, monthly gross margin is $60 − $10 cost to serve = $50.',                                                                  // b37q Raj t31
  'The biggest risk is that the upgrade rate collapses at $60.',                                                                     // b37q Tyler t29
  // Review fix round, item 1: the false positives the review found. Each of these opened the end gate on no
  // recommendation (in RECOMMENDATION / WRAP on an analysis turn, where 4.9 reads it).
  'Raise the question of whether the partner will accept 20%.',
  'Exit would cost $40 million in write-offs, which nobody has approved.',
  'Keep looking at the cost side first, before we touch price.',
  'Sell-through is down 12% at Port Avery.',
  'Drop-off between trial and repeat is the risk.',
  'Build cost is $40 million, which the board has not approved yet.',
];

describe('4.9: a clear recommendation', () => {
  it.each(CLEAR)('is: %s', t => expect(clearRecommendation(t)).toBe(true));
  it.each(NOT)('is not: %s', t => expect(clearRecommendation(t)).toBe(false));
});

const SATISFIED = { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
function plan(reply: string, o: { phase: string; elapsedMs: number; ask: string; move?: string; prior?: string }) {
  const reads = readsFixture({ phase: o.phase as never, elapsedMs: o.elapsedMs, caseId: 'pricing-001', revealed: [],
    flags: { ...SATISFIED, ...(o.move ? { moves: { 4: o.move } } : {}) },
    extraTurns: [{ role: 'candidate', text: o.prior ?? 'The upgrade rate is the swing factor.' }, { role: 'interviewer', text: o.ask }] });
  const p = planTurn(reads, reply, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p.state;
}

describe('4.9 through the switch', () => {
  const saved = process.env.ENGINE_SWITCHES;
  afterEach(() => { if (saved === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = saved; });
  const REC_ASK = 'Putting it all together, what would you recommend to the CEO, and what\'s the biggest risk to it?';
  // Review fix round, item 2: the narrow reading is `recommendationReceived`'s — the time warning reads the fresh
  // recommendation and nothing else. The wider one, where the stage record (and so the end gate) takes it, is
  // `recommendationOpensGate`, off on its own.
  it('b37q Marcus t31, in reply to the recommendation ask: the stage record takes it only with recommendationOpensGate', () => {
    const at = { phase: 'RECOMMENDATION', elapsedMs: 15 * 60_000, ask: REC_ASK, move: 'code_rec_ask' };
    delete process.env.ENGINE_SWITCHES;
    expect(plan(MARCUS_B37Q_T31, at).recommendationReceived).toBe(false);
    process.env.ENGINE_SWITCHES = 'pricing-001=recommendationReceived';
    expect(plan(MARCUS_B37Q_T31, at).recommendationReceived).toBe(false);
    process.env.ENGINE_SWITCHES = 'pricing-001=recommendationOpensGate';
    expect(plan(MARCUS_B37Q_T31, at).recommendationReceived).toBe(false);   // it rides on 4.9's own switch
    process.env.ENGINE_SWITCHES = 'pricing-001=recommendationReceived,recommendationOpensGate';
    expect(plan(MARCUS_B37Q_T31, at).recommendationReceived).toBe(true);
  });
  it('the time warning skips its recommendation ask when the last message gave one', () => {
    // Near the end of a 25-minute case, the message after a clear recommendation that wasn't read as one (a probe
    // came between: the ask before it was no recommendation ask, the phase still EXHIBIT).
    const at = { phase: 'EXHIBIT', elapsedMs: 23 * 60_000 + 40_000, ask: 'How did you get to $1,100?', prior: MARCUS_B37Q_T31 };
    const reply = 'I took $1,400 of value per sign-up less the $300 CAC.';
    delete process.env.ENGINE_SWITCHES;
    expect(plan(reply, at).kind).toBe('time_warning');
    process.env.ENGINE_SWITCHES = 'pricing-001=recommendationReceived';
    expect(plan(reply, at).kind).not.toBe('time_warning');
    // Two messages back is outside the window: the warning asks again.
    expect(plan(reply, { ...at, prior: 'The upgrade rate is the swing factor.' }).kind).toBe('time_warning');
  });
});
