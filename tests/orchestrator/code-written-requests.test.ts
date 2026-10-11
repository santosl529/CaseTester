// Code-written turns (close, grace ask, time warning, rung 1) answer only the
// data asks addressed to the interviewer (request-signal.ts
// addressedAskSentences / matchAskDetections). Smoke run 9 Oct (Tobias,
// b5ebdd96 t22): a final answer listing the conditions that would change the
// recommendation was read by the classifier as three asks, and the goodbye
// released two figures and refused two items; the corpus review found five
// more goodbye data-dumps like it. Real asks in a final message are still
// answered (Rule 12 item 6). Through the real Plan / Settle with an in-memory
// store, as in heard-runner.test.ts. The final messages below are copied
// verbatim from the run records (Case Interview Runs/…), with the
// classifier's detections from the same records.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readsFixture } from './fixtures/turn-reads';
import type { DetectedDataRequest } from '@/lib/orchestrator/data-requests';

// ---- in-memory store ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
function resetStore(phase: string, flags: Row = {}, elapsedMs?: number) {
  const r = readsFixture({ phase: phase as never, flags, elapsedMs });
  store.session = { ...(r.session as Row) };
  store.turns = r.turnRows.map(t => ({ ...t }));
  store.revealed = []; store.exhibits = []; store.events = [];
}
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
const explicitRows = () => requestRows().filter(e => (e.payloadJsonb as Row).explicit === true);
const marker = () => store.events.find(e => e.category === 'data_request' && e.subtype === 'classified');
const check = (name: string) => store.events.find(e => e.category === 'check' && e.subtype === name)?.payloadJsonb as Row | undefined;
const turnKind = () => ((check('turn_kind')?.detail as Row | undefined)?.kind);
const DATA_LINE = /I don't have|come back to|I can share/;
const det = (what: string, ids: string[]): DetectedDataRequest => ({ what, ledgerItemIds: ids, response: 'none', explicit: true });

const CORPUS = {
  // 18-nikhil-the-data-hoover — a65c1831 t21
  nikhil: {
    text: "Biggest risk is that a 5% price increase drives more than 5% volume loss — specialty coffee is discretionary and there's cheap competition. And because COGS is 58% of revenue, I only keep about 42 cents of each lost dollar, so the breakeven on volume decline is roughly 5% ÷ ... actually it's contribution-based: I'd lose 42% margin on departing transactions and gain 5 points on the rest. Rough breakeven is around 10% volume loss, so I'd have real room.\n\nDecision rule from the pilot: run 20 stores, 8–12 weeks, matched control stores. Roll out if transaction counts fall under that breakeven and gross profit dollars per store rise. Watch repeat visit frequency, not just one-week shock.\n\nCould I get: one, historical response to any prior price move. Two, competitor price points. Three, transaction counts by store. Four, regional demographics.",
    detected: [{"what":"Regional demographics","ledgerItemIds":[],"response":"none","explicit":true},{"what":"Transaction counts by store","ledgerItemIds":["revenue_per_store"],"response":"none","explicit":true},{"what":"Competitor price points","ledgerItemIds":[],"response":"none","explicit":true},{"what":"Historical response to any prior price move","ledgerItemIds":["menu_price_change","avg_ticket"],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // 02-tobias-the-silent-thinker — b5ebdd96 t22
  tobias: {
    text: "Volume loss is the bigger risk, because it's the one that can make the recommendation actively destructive rather than just insufficient. Brand damage is slower and manageable with messaging; elasticity is immediate and arithmetic.\n\nHere's the threshold. At 58% COGS, contribution margin is roughly 42% — call it 20% after labor and variable overhead. If I raise price 10%, I can afford to lose volume up to the point where the gain on retained customers offsets the lost contribution. Very roughly, a 10% price increase on a 42% gross margin breaks even around 19% volume loss. So if the pilot shows transaction counts down more than high-teens percent, I stop.\n\nWhat would make me change course: one, pilot elasticity above that threshold; two, competitors confirmed to be holding prices, which means we'd be ceding share, not following the market; three, evidence the 15% revenue growth is entirely new-store openings masking declining same-store traffic — that means the customer base is already fragile and I'd fix traffic before price.",
    detected: [{"what":"Competitor pricing actions","ledgerItemIds":[],"response":"none","explicit":true},{"what":"Breakdown of revenue growth between new store openings and same-store traffic","ledgerItemIds":["stores_count","revenue_total"],"response":"none","explicit":true},{"what":"Pilot elasticity results (volume loss from price increase)","ledgerItemIds":[],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // 15-tyler-the-misquoter — a46333f4 t19
  tyler: {
    text: "The single biggest risk is elasticity — that an 8-10% price increase drives enough traffic loss to offset the margin gain. The whole recommendation rests on specialty positioning giving them pricing power, and I don't have competitor pricing or any historical elasticity to test that. If a 10% increase costs them 15% of transactions, they're worse off, especially since their recent 19% revenue growth came entirely from volume — that suggests their customer base may be more price-sensitive and traffic-driven than a premium brand should be.\n\nMitigation: pilot in 20 to 30 stores across different market types — urban, suburban, high-competition versus low — and run it for a full quarter to get past novelty effects. Measure transactions, ticket size and total store profit, not just revenue. Stagger the increase, maybe 5% first, and lead with the less visible levers like alt-milk surcharges and size repricing, which tend to meet less resistance than headline cup prices.",
    detected: [{"what":"Competitor pricing information","ledgerItemIds":[],"response":"none","explicit":true},{"what":"Historical elasticity data (price elasticity of demand)","ledgerItemIds":[],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // 25-eliza-the-rambler — 60ca6d8a t15
  eliza: {
    text: "So, first, and this is important — the single biggest risk is volume loss, and more precisely it's that my \"volume held flat\" assumption is doing an enormous amount of work in that calculation. Let me size how much it can break. Margin today is 6%, so contribution per dollar of revenue after COGS is 100 minus 58, which is 42 cents. If I raise price 10%, revenue per unit goes to 110 and COGS per unit stays at 58, so contribution per unit goes to 52 cents. For the price increase to be margin-neutral in dollar terms, I'd need 52 times the new volume to equal 42 times the old volume, so new volume over old volume equals 42 over 52, about 0.81. So I can lose roughly 19% of units before the increase stops helping on contribution dollars. That's actually a fairly wide cushion, and it's why I'm comfortable leading with price — but it's a cushion, not a guarantee.\n\nSo, second, and this is how I'd detect it early, I'd watch transaction counts, not revenue. And I want to be emphatic about that, because revenue is exactly the metric that will lie to us here. If I raise price 10% and lose 8% of transactions, revenue barely moves and looks fine, while the underlying franchise is quietly eroding. So the early-warning metric is units — transactions per store per day, in the pilot markets, versus matched control markets that didn't take the increase. I'd read it weekly, and I'd expect a short-term dip in the first two to three weeks from sticker shock that partially recovers as customers re-anchor. So I'd want at least six to eight weeks before judging, and I'd specifically ask whether we have historical transaction volume data, because without a baseline I can't tell a price reaction from normal seasonality.\n\nSo, third, and this is the subtler version of the same risk, I'd watch ticket composition rather than just ticket count. Because customers often don't stop coming — they trade down. They move from a four-dollar latte to a two-dollar drip, or they drop the pastry. That shows up as stable transactions with falling average ticket, and it would partially or fully eat the 5.3 points without ever appearing as a traffic loss. So I'd track average ticket and item mix alongside counts.\n\nComing back to my first point on the 19% cushion — the reason I think we clear it is that coffee is habitual, the purchase is low absolute dollar value, and competitors faced identical commodity inflation over the same two years, so they have almost certainly already moved. If we're currently priced below market, we may have more headroom than 10%.\n\nAnd returning to my second point on transactions versus revenue — the governance mechanism I'd put in place is a pre-committed rollback threshold. Something like: if transactions in pilot markets fall more than 10% versus control and haven't recovered by week six, we pause the national rollout and fall back to procurement and mix as the primary levers.\n\nAnd circling back to my third point on trade-down — I'd also segment the elasticity read by daypart and by customer type, because the morning commuter is far less price-sensitive than the afternoon discretionary visit, and that would let us price asymmetrically rather than taking a flat 10% everywhere.",
    detected: [{"what":"Average ticket value and item mix data","ledgerItemIds":["avg_ticket"],"response":"none","explicit":true},{"what":"Historical transaction volume data / baseline transaction counts","ledgerItemIds":[],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // default-candidate — 72925a9c t15
  defaultCandidate: {
    text: "I'd make it an elasticity question, and I'd want the breakeven threshold defined before the pilot runs so we're not rationalizing results after.\n\nRough math: at a 58% COGS and 6% margin, contribution margin per dollar of revenue is about 42% before fixed costs. If we raise price 10% with volume flat, that's roughly 10 points of revenue dropping almost straight to the bottom line, since unit costs don't change. I'd need the breakeven volume loss — something like 10% price up, we can afford to lose roughly a fifth of volume before we're worse off. I'd want to confirm that with actual unit economics, but the point is the cushion is fairly large.\n\nSo: if pilot volume loss is well under breakeven, proceed and roll out. If it's close, adjust — smaller increases, or concentrate them on less price-sensitive items like specialty drinks and food rather than drip coffee.\n\nIf volume craters, that tells us they're not actually differentiated and price is the purchase driver. Then I'd shift weight to procurement and waste, and revisit the brand positioning separately.",
    detected: [{"what":"Actual unit economics to confirm the breakeven volume loss calculation","ledgerItemIds":[],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // 14-jordan-the-order-of-magnitude-exaggerator — 15ad9d8e t25
  jordan: {
    text: "I'd want three things before capping.\n\nOne, a clean elasticity estimate. Transactions, average ticket, and gross profit per store per week in test versus control, run long enough — eight to twelve weeks — to get past the initial sticker-shock period. Customers often return after a few weeks. Capping on four weeks of data would be premature.\n\nTwo, confirmation it's price and not something else. Did a competitor promote into those markets? Was there weather, a local closure, a staffing issue? I'd want the control markets to rule that out.\n\nThree, the breakeven. At what price point does gross profit per store peak? If profit still rises at a 6% increase and only turns negative at 10%, we cap at 6 rather than zero.\n\nOnly once I see gross profit per store genuinely declining across controlled markets would I cap. And I'd be clear that capping leaves most of the 40-point gap unaddressed, which forces the harder cost conversations.",
    detected: [{"what":"Information about competitor promotions, weather, closures, or staffing issues in control markets","ledgerItemIds":[],"response":"none","explicit":true},{"what":"Gross profit per store at different price points to identify the breakeven price","ledgerItemIds":[],"response":"none","explicit":true},{"what":"Transaction count, average ticket, and gross profit per store per week in test versus control markets","ledgerItemIds":["avg_ticket"],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // 03-ines-the-clarifier — debc9b60 t25
  ines: {
    text: "Fair challenge — three points of revenue at current volumes, so about 3 dollars on a 100-revenue base against COGS of 58. In COGS terms that's roughly a 5% reduction in input spend.\n\nAnd I should be straight: I didn't derive it, I assumed it. It's a judgment figure from the levers I listed — typically a few points of brewed-coffee waste and dairy over-portioning, plus packaging re-spec and vendor consolidation. I'd want a waste audit and a spend-by-vendor breakdown to size it properly before putting it in front of the CEO. Treat it as illustrative, not committed.\n\nBiggest risk is elasticity. The entire recommendation rests on a 10% price increase holding volume, and we have no evidence for that — prices haven't moved in two years, so there's no recent demand response to read. Transaction count is only up ~5%, which hints traffic is already soft. If volume drops more than about 9%, the increase is margin-neutral at best.",
    detected: [{"what":"Waste audit and spend-by-vendor breakdown to size input cost reduction opportunities","ledgerItemIds":[],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // 58-hugo-the-hidden-data-prober — b9adb06a t17
  hugo: {
    text: "Recommendation: raise menu prices approximately 20–25% over the next four quarters, phased, with a market pilot first. That alone restores the bulk of the margin.\n\nThe logic: this is a pricing failure, not a cost problem. Beans added 4.2 points of revenue in cost, other inputs 11.8 — together exactly the 16-point COGS move, so there's no operational leakage to chase. Meanwhile prices have been frozen for two years while transactions grew 4.5% and baskets grew 10%. Demand is not the issue; the client simply never passed inflation through.\n\nSequencing: pilot 7–8% in two or three markets this quarter, measure transactions and items-per-basket separately, then roll out in three waves. In parallel, renegotiate dairy and packaging contracts and address the 2-point overhead creep — that's worth another point or two.\n\nRisk: elasticity. Stop-gate if traffic falls beyond 3–4%.\n\nWhat I'd want before committing to the exact number is competitor menu-price movement, which tells us whether 24% is catch-up or a premium.",
    detected: [{"what":"Competitor menu price changes over the same period","ledgerItemIds":[],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
  // 08-claire-the-recommendation-freezer — bc0d5a77 t19
  claire: {
    text: "I'm stuck, sorry. I can't commit without a fuller breakdown of COGS.",
    detected: [{"what":"breakdown of COGS components","ledgerItemIds":["bean_share_of_cogs","non_bean_input_change"],"response":"none","explicit":true}] as DetectedDataRequest[],
  },
};

const TIME_UP = 25 * 60_000;
const atClose = () => resetStore('RECOMMENDATION', { graceAskFired: true, pressureTest: SATISFIED }, TIME_UP);
const KINDS: { kind: string; setup: () => void }[] = [
  { kind: 'close', setup: atClose },
  { kind: 'grace_ask', setup: () => resetStore('ANALYSIS', { pressureTest: SATISFIED }, TIME_UP) },
  { kind: 'time_warning', setup: () => resetStore('ANALYSIS', { pressureTest: SATISFIED }, 19 * 60_000) },
];

beforeEach(() => { detected = []; });

describe('corpus final messages at the close', () => {
  it('Nikhil (a65c1831 t21) "Could I get: one, …" — every listed item is answered', async () => {
    atClose();
    detected = CORPUS.nikhil.detected;
    const r = await runTurn('s1', CORPUS.nikhil.text);
    expect(turnKind()).toBe('close');
    expect(new Set(revealed())).toEqual(new Set(['revenue_per_store', 'menu_price_change', 'avg_ticket']));
    expect(r.interviewerText).toMatch(/I don't have (regional demographics or competitor price points|competitor price points or regional demographics)\./);
    expect(explicitRows().length).toBe(4);
    expect(check('code_written_requests')?.decision).toBe('pass');
    expect(r.ended).toBe(true);
  });

  it.each(['tobias', 'tyler', 'eliza', 'defaultCandidate', 'jordan', 'ines', 'hugo', 'claire'] as const)('%s — no data line, nothing released, no asks logged', async name => {
    atClose();
    detected = CORPUS[name].detected;
    const r = await runTurn('s1', CORPUS[name].text);
    expect(turnKind()).toBe('close');
    expect(r.interviewerText).not.toMatch(DATA_LINE);
    expect(revealed()).toEqual([]);
    expect(requestRows()).toEqual([]); // the close logs no rows for dropped detections
    expect((marker()?.payloadJsonb as Row | undefined)?.requestCount).toBe(0);
    expect(r.dataRequestsClassified).toBe(true);
    const c = check('code_written_requests');
    expect(c?.decision).toBe('act');
    expect((c?.detail as Row).dropped).toEqual(CORPUS[name].detected.map(d => d.what));
    expect(r.ended).toBe(true);
  });

  it('the smoke run\'s goodbye is the close line alone', async () => {
    atClose();
    detected = CORPUS.tobias.detected;
    const r = await runTurn('s1', CORPUS.tobias.text);
    expect(r.interviewerText).not.toContain('200 stores');
    expect(r.interviewerText).not.toContain('$480M');
  });
});

// Fix round 2 (re-review probes): a rhetorical question next to a next step
// must not answer the next step at the goodbye.
describe('rhetorical questions do not answer a next step at the close', () => {
  it.each([
    ["So what's driving the margin decline? Costs. I can't commit without a fuller breakdown of COGS.", det('breakdown of COGS components', ['bean_share_of_cogs', 'non_bean_input_change'])],
    ["I'd want a waste audit before committing. Does that make sense given the numbers?", det('Waste audit', [])],
    ['Do you know what worries me? Volume loss if the pilot shows elasticity above the threshold.', det('Pilot elasticity results', [])],
  ])('%s', async (text, d) => {
    atClose();
    detected = [d];
    const r = await runTurn('s1', text);
    expect(turnKind()).toBe('close');
    expect(r.interviewerText).not.toMatch(DATA_LINE);
    expect(revealed()).toEqual([]);
    expect(requestRows()).toEqual([]);
    expect((check('code_written_requests')?.detail as Row).dropped).toEqual([d.what]);
  });
});

describe('real asks in a final message are answered at the close', () => {
  it.each([
    ['Do we know how many of the 200 stores opened in the last two years?', 'Store openings in the last two years'], // Priya
    ['What was the store count two years ago?', 'Store count two years ago'],
    ['Could you share the store count?', 'Store count'],
    ['Before we wrap, could I get the store count for both years?', 'Store count for both years'],
  ])('%s', async (text, what) => {
    atClose();
    detected = [det(what, ['stores_count'])];
    const r = await runTurn('s1', text);
    expect(turnKind()).toBe('close');
    expect(revealed()).toEqual(['stores_count']);
    expect(r.interviewerText).toContain('200 stores');
    expect(explicitRows().map(e => (e.payloadJsonb as Row).what)).toEqual([what]);
    expect(check('code_written_requests')?.decision).toBe('pass');
    expect(r.ended).toBe(true);
  });

  it('a message mixing one ask with a list of conditions: only the ask is answered', async () => {
    atClose();
    const text = 'Could you share the store count? What would make me change course: one, pilot elasticity above that threshold; two, competitors confirmed to be holding prices.';
    detected = [det('Store count', ['stores_count']), det('Pilot elasticity results', []), det('Competitor pricing actions', [])];
    const r = await runTurn('s1', text);
    expect(revealed()).toEqual(['stores_count']);
    expect(r.interviewerText).toContain('200 stores');
    expect(r.interviewerText).not.toMatch(DATA_LINE);
    expect(explicitRows().map(e => (e.payloadJsonb as Row).what)).toEqual(['Store count']);
    expect(requestRows().length).toBe(1); // the close logs no rows for the dropped two
    const c = check('code_written_requests');
    expect(c?.decision).toBe('act');
    expect((c?.detail as Row).answered).toEqual(['Store count']);
    expect((c?.detail as Row).dropped).toEqual(['Pilot elasticity results', 'Competitor pricing actions']);
  });
});

describe.each(KINDS.filter(k => k.kind !== 'close'))('$kind turn (the case goes on)', ({ kind, setup }) => {
  it('dropped detections are logged as passing mentions, never as asks', async () => {
    setup();
    detected = CORPUS.tobias.detected;
    const r = await runTurn('s1', CORPUS.tobias.text);
    expect(turnKind()).toBe(kind);
    expect(r.interviewerText).not.toMatch(DATA_LINE);
    expect(revealed()).toEqual([]);
    expect(explicitRows()).toEqual([]);
    expect(requestRows().map(e => [e.subtype, (e.payloadJsonb as Row).what, (e.payloadJsonb as Row).explicit])).toEqual(
      CORPUS.tobias.detected.map(d => ['none', d.what, false]));
    expect((marker()?.payloadJsonb as Row | undefined)?.requestCount).toBe(3);
  });

  it('an addressed ask is answered', async () => {
    setup();
    detected = [det('Store count for both years', ['stores_count'])];
    const r = await runTurn('s1', 'Before we wrap, could I get the store count for both years?');
    expect(turnKind()).toBe(kind);
    expect(revealed()).toEqual(['stores_count']);
    expect(r.interviewerText).toContain('200 stores');
    expect(check('code_written_requests')?.decision).toBe('pass');
  });
});

describe('rung 1 turn', () => {
  it('a hedge naming data is not answered; the detection is logged as a passing mention', async () => {
    // Rule 13: the second no-progress turn in a row fires rung 1.
    const stall = { consecutiveNoProgress: 1, ladderLevel: 0, consecutiveClarify: 0, recommendationDelivered: false, noProgressReasons: ['hedge'] };
    resetStore('STRUCTURE', { stall, lastQuestion: 'Which branch would you start with?' });
    detected = [det('Cost split', ['cogs_pct'])];
    const r = await runTurn('s1', "I'm stuck, sorry. Not sure what the cost split would even tell me.");
    expect(turnKind()).toBe('rung1');
    expect(r.interviewerText).toMatch(/^Take your time\. The question on the table is which branch would you start with\?$/);
    expect(revealed()).toEqual([]);
    expect(requestRows().map(e => [(e.payloadJsonb as Row).what, (e.payloadJsonb as Row).explicit])).toEqual([['Cost split', false]]);
    expect(check('code_written_requests')?.decision).toBe('act');
  });
});
