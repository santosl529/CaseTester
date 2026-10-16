// Lorenzo, 15 Oct (batch-26 fix 3): "is that the margin problem, or does it
// include cost that grows with revenue?" applies only to claims stated in
// dollars or as growth rates, never to comparisons of percent-of-revenue
// figures. Batch 26 Marisol 2456aa9d t6 (a D5) and the corpus scan's other
// places it fired against a correct ratio claim; the dollar and growth-rate
// probes it should keep. Candidate messages are verbatim excerpts of the runs.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { growthProbeOnRatio, growthProbeUnchecked, isGrowthProbe } from '@/lib/orchestrator/growth-probe';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { readFileSync } from 'node:fs';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { modelPlanFixture } from './fixtures/model-plan';

const MARISOL_T5 = 'Sizing it: 16 points on the two-years-ago COGS base of 42 is 16/42, roughly a 38% increase in coffee input costs. That\'s well ahead of the 15% revenue growth, which tells me it\'s input price, not volume.';
const MARISOL_Q = "You said that 38% increase tells you it's input price, not volume. Is that what the 16 points on a 42 base actually shows, or does it mix in normal growth with revenue? Walk me through it.";

// [run, probe sentence, sentence before it in the turn, the candidate's message]
const ON_RATIO: [string, string, string | undefined, string][] = [
  ['Marisol 2456aa9d t6', 'Is that what the 16 points on a 42 base actually shows, or does it mix in normal growth with revenue?', "You said that 38% increase tells you it's input price, not volume.", MARISOL_T5],
  ['Marisol 0f7551c2 t6', 'Is the 16 on a 100 base a margin problem, or does it mix in cost that simply grows with revenue?', undefined, 'Index revenue two years ago at 100. Applying the current COGS ratio of 58% to that base gives 58 in cost versus the 42 actually spent, so about 16 points of lost profit on a 100 revenue base.'],
  ['Marcus f8ed869d t8', 'Walk me through how you got there, and is that the margin problem or does it include cost that simply grew with revenue?', undefined, 'COGS went 42 to 50 to 58, so 16 points of the 18-point margin drop sits in COGS. Labor is flat at 22, overhead moved 12 to 14, so only 2 points there.'],
  ['Blake 4755c03a t4', 'Walk me through that: is that the margin impact, or does it include labor cost that simply grew with revenue?', 'Understood. You said a 30% wage increase on a 30% labor line is nine points of margin.', 'Labor first because it\'s the biggest single controllable line.'],
  ['Sam a73c92b3 t28', 'Is that the margin problem, or does it include costs that simply grew with revenue?', undefined, 'Apply ~17% to current COGS of 58 points: that\'s about +10 points of revenue, assuming prices stay flat. Profit is only 6, so they\'d go to roughly negative 4.'],
  ['Destiny 15492909 t24', 'Is that the margin problem, or does part of that increase simply track the growth in volume?', "You've isolated the others as the bigger dollar driver.", 'So both went up, but the other inputs added about 12 points of revenue versus 4 from beans.'],
  ['Anika d66b8a31 t10', 'Is that the margin problem itself, or does part of that cost simply grow with revenue?', "Your decomposition ties to the 58 exactly, and you've said the non-bean inputs do most of the damage.", "Beans up 40%: 10.5 × 1.4 = 14.7. Other inputs up 37.5%: 31.5 × 1.375 = 43.3. Total: 14.7 + 43.3 = 58.0. I'd sanity-check with cost per transaction in dollars rather than percentages."],
  ['Sofia d8ee5c25 t6 (a share\'s growth on its base)', "Walk me through how you got that, and tell me whether that's the margin problem or includes normal growth.", undefined, 'What strikes me is that COGS grew 16 points, which on a 42% base means COGS is up about 38% of revenue in relative terms — so call it a 38-point hit.'],
];
const KEPT: [string, string, string | undefined, string][] = [
  ['b284faee t6 ($77M)', 'Before those figures come in, how did you get to the $77M, and is that the margin problem, or does it include cost that simply grew with revenue?', undefined, 'In dollars, 16% of $480M is about $77M of margin gone to COGS.'],
  ['Amara 83945486 t10 ($47M)', 'Is that the margin problem, or does it include cost that simply grew with revenue?', 'You put beans at roughly $47M of the gap.', 'Each point of margin is $4.8M.'],
  ['Theo 06b98722 t14 (dollars)', 'Is that the margin problem, or does part of it include cost that simply grew with revenue?', undefined, 'In dollars, COGS at 42% of the old revenue base — $480M ÷ 1.15 ≈ $417M, so roughly $175M — versus 58% of $480M today, about $278M.'],
  ['58cb8061 t14 (index dollars)', 'You said COGS rose while revenue added 15 — is that COGS increase the margin problem, or does it include normal growth with revenue?', undefined, 'In dollars on my normalized base: COGS was 42 on revenue of 100. So COGS rose 24.7 dollars while revenue only added 15.'],
  ['Jasmine 074b0534 t4 (a growth rate)', 'Is that the margin problem, or does it include cost that would normally grow with revenue?', 'With those figures in front of you, you sized a 27-point gap between cost growth and revenue growth.', 'So costs grew 32 on a base of 76 — about 42% growth against 15% revenue growth.'],
  ['Nikhil 974ec424 t26 (a growth rate)', 'Is that margin impact, or does it include normal growth with revenue?', undefined, 'So costs went from 76 to 108 — up about 42% while revenue rose 15%.'],
  ['Destiny cfd513d9 t18 ($77M in the message only)', 'Is that figure the margin problem, or does it include cost that simply scaled with revenue growth?', undefined, "okay so COGS is the problem, not labor like I guessed. 58% minus 42% is 16 points, and 16% of $480M is about $77M."],
  ['Dylan 5a1ae7f5 t12 (cost growth)', 'Is the residual part of the margin problem, or is some of it just cost growing with a larger business?', 'You sized that gap in COGS dollars.', 'Where it leaves my hypothesis: the dominant driver is input cost inflation, roughly 38% on COGS dollars, combined with menu prices flat for two years.'],
];

describe('the growth probe only of a dollar or growth-rate claim', () => {
  for (const [run, s, prev, cand] of ON_RATIO) it(`${run}: withheld`, () => expect(growthProbeOnRatio(s, prev, cand)).toBe(true));
  for (const [run, s, prev, cand] of KEPT) it(`${run}: kept`, () => expect(growthProbeOnRatio(s, prev, cand)).toBe(false));
  it('the figure the probe quotes decides: points quoted are a ratio claim, even beside a dollar figure in the message', () => {
    expect(growthProbeOnRatio(ON_RATIO[0][1], ON_RATIO[0][2], `${MARISOL_T5} In dollars that's about $77M.`)).toBe(true);
  });
  it('not the probe: the candidate\'s "normal growth" asked back (Owen 3bdb21b1 t8), a quote-back statement (Maya 9226db80 t23)', () => {
    expect(isGrowthProbe('Before we go further, you attributed the two-point overhead drift to normal growth, so how would you test that, and what would you need to see?')).toBe(false);
    expect(isGrowthProbe('You said some of that cost grew with revenue because more customers means more beans.')).toBe(false);
    // df62341 t39 (batch 20): a recommendation question, not the probe.
    expect(isGrowthProbe('Given that the margin problem is driven by costs that rose 37 to 40 percent, is pricing alone enough to close the gap, or should the recommendation also address the cost base directly?')).toBe(false);
  });
});

describe('Marisol 2456aa9d t6 through Settle', () => {
  const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What drove it?', ...over });
  const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
  it('the probe sentence is withheld; the setup and "Walk me through it." stay', async () => {
    const plan = modelPlanFixture({ distress: null, candidateText: MARISOL_T5 });
    plan.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 };
    plan.state.requiredExhibit = undefined; plan.state.analysisOwed = false; plan.state.owedStage = undefined;
    const s = await settleTurn(plan, outcome(T({ say: 'Mm-hm.', question: MARISOL_Q })));
    expect(s.spokenText).not.toMatch(/normal growth/);
    expect(s.spokenText).toMatch(/Walk me through it\.$/);
    const vetoes = plan.ctx.checks.entries.find(c => c.check === 'vetoes')?.detail as { withheld: { reason: string }[] };
    expect(vetoes.withheld.map(w => w.reason)).toContain('growth_probe_on_ratio');
  });
});

// Lorenzo, 16 Oct (batch 29 Marisol 64224460 t5 → t7): the gate on doubt. Her
// "COGS is up 16 dollars on a 100 base — a 38% increase on the original 42"
// was right; the probe of it led her into a new error ("15 of the 38 points is
// growth"). The probe is said only of a figure a landed flag covers.
const MARISOL_B29_SETUP = 'Before we go further, you sized COGS as sixteen dollars on a hundred base, up thirty-eight percent.';
const MARISOL_B29_PROBE = 'Is that the margin problem, or does it include normal growth from higher revenue?';
describe('the growth probe only of a flagged claim (the gate)', () => {
  it('Marisol b29 t5: no flag on her figures — withheld', () => {
    expect(growthProbeUnchecked(MARISOL_B29_PROBE, MARISOL_B29_SETUP, [])).toBe(true);
    // a flag on another figure licenses nothing here
    expect(growthProbeUnchecked(MARISOL_B29_PROBE, MARISOL_B29_SETUP, [77])).toBe(true);
  });
  it('a dollar figure a landed flag covers, quoted in the probe or its setup — said', () => {
    expect(growthProbeUnchecked(KEPT[0][1], KEPT[0][2], [77])).toBe(false);
    expect(growthProbeUnchecked(KEPT[1][1], KEPT[1][2], [47])).toBe(false);
  });
  it('not a growth probe: nothing to gate', () => {
    expect(growthProbeUnchecked('Walk me through how you got to $77M.', undefined, [])).toBe(false);
  });
  it('through Settle: withheld with no flag, a question still ends the turn', async () => {
    const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What drove it?', ...over });
    const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
    const plan = modelPlanFixture({ distress: null, candidateText: 'Let me put dollars on it. COGS is up 16 dollars on a 100 base — a 38% increase on the original 42.' });
    plan.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 };
    plan.state.requiredExhibit = undefined; plan.state.analysisOwed = false; plan.state.owedStage = undefined;
    const s = await settleTurn(plan, { turn: T({ question: `${MARISOL_B29_SETUP} ${MARISOL_B29_PROBE}` }), validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
    expect(s.spokenText).not.toMatch(/normal growth/);
    expect(s.spokenText).toMatch(/\?$/);
    const vetoes = plan.ctx.checks.entries.find(c => c.check === 'vetoes')?.detail as { withheld: { reason: string }[] };
    expect(vetoes.withheld.map(w => w.reason)).toContain('growth_probe_unchecked');
  });
});

describe('the prompt rule', () => {
  it('scopes the probe to dollars and growth rates', () => {
    const p = readFileSync('lib/agent/prompts/system.ts', 'utf8');
    expect(p).toMatch(/in dollars, or states how fast a cost grew/);
    expect(p).toMatch(/Never ask it of figures stated as a percent of revenue/);
    expect(p).toMatch(/only of a figure this turn's MATH CHECK FLAG or RECOMPUTE FLAG names/);
  });
});
