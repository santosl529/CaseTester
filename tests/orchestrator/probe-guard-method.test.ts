// Phase 1 Stream 3 task 5 — the probe guard's replacement (`probeGuardMethod`, contract 3.5). Lorenzo, 26 Oct: "ask
// about method ('Walk me through how you got there'), never name a figure that code verified as correct. The wording
// comes from a phrase pool like other code lines."
// Today the replacement is the `got_to` pool, which fills its slot with the candidate's own figure as written — and
// the figure is often the one code verified as correct, which is why the challenge was withheld in the first place.
// Across the 487 saved runs 49 turns withheld a math challenge and 44 used a replacement: 6 named their figure
// ("How did you get to 41.5%?", "How did you get to $80?", "How did you get to 24?"), 38 fell back to a plain
// question. The two scenarios below are verbatim: b26 Blake 4755c03a t23 and b20 Tyler 505297a7 t7 (both prof-001).
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { PHRASE_POOLS, PHRASE_MEMORY, SEEDED_FIRST, poolPattern, recordPhraseUses, variantIndex } from '@/lib/orchestrator/phrasing';
import { challengeVerdict } from '@/lib/orchestrator/probe-guard';
import { classifyMathTalk } from '@/lib/orchestrator/math-talk';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { modelPlanFixture } from './fixtures/model-plan';
import { asksWorking } from '@/lib/eval/math-check';

const METHOD = PHRASE_POOLS.probe_method as readonly string[];
afterEach(() => { vi.unstubAllEnvs(); });

describe('the probe_method pool', () => {
  it('five distinct versions, no slot and no figure; none is another pool\'s line', () => {
    expect(METHOD).toHaveLength(5);
    expect(new Set(METHOD).size).toBe(5);
    // Lorenzo's illustration, "Walk me through how you got there.", is probe_there's own first line and no line may
    // sit in two pools (tests/orchestrator/phrasing.test.ts): the first version says it in its own words.
    expect(METHOD[0]).toBe('Walk me through how you worked that out.');
    const others = (['probe_there', 'probe_calc', 'probe_got_to', 'got_to'] as const).flatMap(p => PHRASE_POOLS[p] as readonly string[]);
    for (const v of METHOD) expect(others, v).not.toContain(v);
    for (const v of METHOD) {
      expect(v, v).not.toMatch(/\{[xX]\}/);
      expect(v, v).not.toMatch(/\d/);
      expect(v.endsWith('.') || v.endsWith('?'), v).toBe(true);
    }
  });
  it('every version reads as a probe to the evaluators, and none as a doubt', () => {
    for (const v of METHOD) {
      // It names no figure and no work of theirs, so math talk reads it as neither doubt nor an explain probe of a
      // figure (a bare question, like today's fallback) — and the evaluators' probe pattern reads it as a probe.
      expect(classifyMathTalk(v, [41.5]).kind, v).toBe('none');
      expect(asksWorking(v), v).toBe(true);        // lib/eval/math-check.ts: the evaluators read it as asking for the working
      expect(poolPattern('probe_method').test(v), v).toBe(true);
    }
  });
  it('the first use is Lorenzo\'s line (not a seeded pool), then never one of the last three', () => {
    expect(SEEDED_FIRST.has('probe_method')).toBe(false);
    expect(variantIndex('probe_method', undefined, 's1:4')).toBe(0);
    const uses = { probe_method: [0, 2, 3] };
    expect([1, 4]).toContain(variantIndex('probe_method', uses, 's1:6'));
    expect(recordPhraseUses(METHOD[2], uses).probe_method).toEqual([0, 2, 3, 2].slice(-PHRASE_MEMORY));
  });
  it('no version is a doubt, on a verified figure or any other', () => {
    const verified = [{ stepId: 'profit_margin_now', value: 41.5, operands: [], span: 'x', workShown: false }];
    for (const v of METHOD) {
      expect(challengeVerdict(v, { verified, alreadyProbed: new Set(), flaggedThisTurn: false, flagged: [], candidateFigures: [41.5] }), v).toBeNull();
    }
  });
});

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What drove it?', ...over });
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
const settleWith = async (candidateText: string, question: string, over: (p: ReturnType<typeof modelPlanFixture>) => void = () => {}, turnOver: Partial<ModelTurn> = {}) => {
  const plan = modelPlanFixture({ distress: null, candidateText, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'revenue_total'] });
  plan.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 };
  plan.state.requiredExhibit = undefined; plan.state.analysisOwed = false; plan.state.owedStage = undefined;
  over(plan);
  const s = await settleTurn(plan, outcome(T({ say: 'Mm-hm.', question, ...turnOver })));
  return { text: s.spokenText, check: plan.ctx.checks.entries.find(c => c.check === 'math_challenge')?.detail as { withheld: { reason: string }[]; replacement: string | null } };
};
const settle = (candidateText: string, question: string, over: (p: ReturnType<typeof modelPlanFixture>) => void = () => {}) => settleWith(candidateText, question, over);
const settleExhibit = (candidateText: string, question: string) => settleWith(candidateText, question, () => {}, { exhibit: 'exhibit-a' });

// b26 Blake 4755c03a t23 — the replacement that names his own figure.
const BLAKE = 'Okay, so my bean thesis was overstated — beans are only a quarter of COGS, and up 40%, not double. Let me blend it: 25% × 40% plus 75% × 37.5% is 10 plus 28.1, so about 38% across the whole COGS line. It\'s broad-based inflation, not a coffee story.\n\nNow the size. If COGS started at 30% of revenue, a 38% increase takes it to roughly 41.5%, so about 11.5 points of margin. Add the two points of overhead and rent, and I\'m at 13.5 of the 18. There\'s still four or five points I can\'t account for.';
const BLAKE_Q = 'With those COGS figures, how do they square with your 41.5% estimate and the four or five points you couldn\'t account for, and what does that say about the root cause?';

describe('b26 Blake t23 — "How did you get to 41.5%?"', () => {
  it('off: the withheld challenge is replaced by his own figure, as the run said it', async () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const r = await settle(BLAKE, BLAKE_Q);
    expect(r.check.withheld.map(w => w.reason)).toContain('unsupported_challenge');
    expect(r.check.replacement).toBe('How did you get to 41.5%?');
  });
  it('on: the method, naming no figure', async () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-001=probeGuardMethod');
    const r = await settle(BLAKE, BLAKE_Q);
    expect(r.check.withheld.map(w => w.reason)).toContain('unsupported_challenge');
    expect(METHOD).toContain(r.check.replacement);
    expect(r.check.replacement).not.toMatch(/\d/);
    expect(r.text).toContain(r.check.replacement!);
  });
});

// b20 Tyler 505297a7 t7 — a doubt on verified work, replaced by the plain fallback.
const TYLER = 'Sure. Two years ago COGS was 42% of revenue, and currently it\'s 61%, so the increase is 61 minus 42, which is 19 percentage points.\n\nReconciling that against margin: profit went from 24% to 6%, an 18-point decline. Labor was flat at 22%, so it contributes zero. Overhead went 12% to 14%, so that\'s another 2 points of drag.';
const TYLER_Q = 'Does that change your reconciliation against the margin decline, and what would you pull next to isolate what\'s driving COGS?';

describe('b20 Tyler t7 — the plain fallback becomes a question about method', () => {
  it('off: a fallback question that asks nothing about the working', async () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const r = await settle(TYLER, TYLER_Q);
    expect(r.check.withheld.length).toBeGreaterThan(0);
    expect(METHOD).not.toContain(r.check.replacement);
  });
  it('on: a method question', async () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-001=probeGuardMethod');
    const r = await settle(TYLER, TYLER_Q);
    expect(METHOD).toContain(r.check.replacement);
  });
});

describe('where the method question is not asked', () => {
  it('a figure the case closed (an error past Rule 14): the plain fallback stands in', async () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-001=probeGuardMethod');
    const r = await settle(BLAKE, BLAKE_Q, p => { p.state.closedFigures = [41.5]; });
    expect(r.check.withheld.map(w => w.reason)).toContain('probe_guard');
    expect(METHOD).not.toContain(r.check.replacement);
  });
  it('working they already showed: the same', async () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-001=probeGuardMethod');
    const r = await settle(BLAKE, 'Walk me through how you got to 41.5%.', p => {
      p.state.verifiedNow = [{ stepId: 'cogs_blend', value: 41.5, operands: [30, 1.38], span: 'a 38% increase takes it to roughly 41.5%', workShown: true }];
    });
    expect(r.check.withheld.map(w => w.reason)).toContain('probe_guard');
    expect(METHOD).not.toContain(r.check.replacement);
  });
  it('nothing withheld: no replacement at all', async () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-001=probeGuardMethod');
    const r = await settle(TYLER, 'What would you pull next?');
    expect(r.check?.replacement ?? null).toBeNull();
  });
});

describe('a turn that hands over data or an exhibit keeps the phase question (and still names no figure)', () => {
  // b35q Marisol t15 and b38 Marisol t9 in the replay: the withheld doubt sat on a turn that handed over an exhibit,
  // where the base said "How did you get to 24?" / "Could you walk me through where 60 comes from?" — the figure goes,
  // but the question about the new exhibit is better than one about the message before it.
  it('on, with an exhibit this turn: not the method question, and no figure in it either', async () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-001=probeGuardMethod');
    const r = await settleExhibit(BLAKE, BLAKE_Q);
    expect(r.check.withheld.length).toBeGreaterThan(0);
    expect(METHOD).not.toContain(r.check.replacement);
    expect(r.check.replacement).not.toMatch(/\d/);
  });
  it('off, the same turn: the line names his figure', async () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const r = await settleExhibit(BLAKE, BLAKE_Q);
    expect(r.check.replacement).toBe('How did you get to 41.5%?');
  });
});
