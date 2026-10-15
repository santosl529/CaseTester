// Lorenzo, 14 Oct (batch-24 ruling 4): a recommendation the candidate gives
// counts as received. Marcus db0e42c3 t17 answered "what would you tell the CEO
// to do?" with "…a pricing problem… So: raise prices, staged…" — no "recommend",
// no "should" — and the case ran six more minutes; the time warning asked again.
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { readsFixture } from './fixtures/turn-reads';

const MARCUS = "Brew & Bean's margin decline is a pricing problem, not a cost problem. COGS rose from 42% to 58% of revenue — 16 of the 18 points — while menu prices haven't changed in two years against roughly 38% input inflation. Labor is flat; overhead is two points.\n\nSo: raise prices, staged — roughly 12% now, reassess, then a second step. Pair it with supplier renegotiation at 200-store scale and a waste and portioning program.\n\nRisks: elasticity. I'd pilot in 20 stores across markets before rolling out.";
const received = (reply: string, ask = 'Based on what you have, what would you tell the CEO to do?', move: string | undefined = 'code_rec_ask') => {
  const reads = readsFixture({ phase: 'RECOMMENDATION', elapsedMs: 13 * 60_000, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'menu_price_change'],
    flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false }, ...(move ? { moves: { 4: move } } : {}) },
    extraTurns: [{ role: 'candidate', text: 'Menu trim goes last.' }, { role: 'interviewer', text: ask }] });
  const p = planTurn(reads, reply, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p.state.recommendationReceived;
};

describe('the reply to a recommendation ask', () => {
  it("Marcus t17's answer is the recommendation received", () => expect(received(MARCUS)).toBe(true));
  it("…to the model's own recommendation question too", () => expect(received(MARCUS, 'Pulling it together: what is your recommendation to the CEO?', 'recommendation')).toBe(true));
  it.each([
    'Act on price first — specifically, a staged menu price increase of roughly 8–10%, starting now.',                                           // Omar 22a901a8
    'Lead with sourcing: renegotiate or lock bean contracts to recover most of the 16 points, pair it with a modest price increase.',           // Jasmine 766f97c6
    'Headline: this is an input cost problem they never priced for, so raise prices. The math: COGS went from 42% to 58%.',                    // Sam 42f3afb5
    'My recommendation: start raising menu prices immediately, phased, targeting roughly 20% cumulative.',                                     // 0bfe5f38
  ])('a committed answer is: %s', reply => expect(received(reply)).toBe(true));
  it.each([
    "Honestly, I can't commit to a recommendation without the elasticity data.",
    "I can't commit yet — I'd recommend we get the elasticity data first.",
    "Hmm, I'm not sure.",
    'Can I see the transaction data before I answer?',
    // Replay pairs of a recommendation ask with a reply that answers something else — not a recommendation.
    "A few things beyond price.\n\nSupply side: they're buying beans and dairy at spot exposure, apparently. I'd lock forward contracts or hedge.",   // Sofia dc3bbb2c
    'A few structural options, though each is slower and needs investment. Vertical integration on sourcing — buying green coffee direct.',     // Anika c3d664b4
    'On the revenue side, beyond straight price increases: Ticket size — upselling, bundling a pastry with a drink, larger sizes.',              // Marisol 4bf008fd
    "Biggest risk is that traffic falls enough to wipe out the gain. I'd mitigate with the pilot: raise in a small set of stores.",             // Destiny 15492909
  ])('a refusal, a hedge, a question back, more brainstorm or a risk answer is not: %s', reply => expect(received(reply)).toBe(false));
  it('the same analysis, not in reply to a recommendation ask, is not', () => expect(received(MARCUS, 'What else could the client do?', undefined)).toBe(false));
});
