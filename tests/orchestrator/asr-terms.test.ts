// "Cogshare" read as "COGS share" before the checks (Lorenzo's brief, 17 Oct;
// session 9ccf0836: "It's the Cogshare from two years ago").
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));

const { normalizeAsrTerms } = await import('@/lib/orchestrator/asr-terms');
const { getCaseById } = await import('@/lib/cases/loader');
const { checkCandidateMath } = await import('@/lib/orchestrator/recompute');
const { factBaseFor, findCandidateMisquotes } = await import('@/lib/orchestrator/fact-check');
const { planTurn } = await import('@/lib/orchestrator/plan-turn');
const { readsFixture } = await import('./fixtures/turn-reads');

describe('normalizeAsrTerms', () => {
  it.each([
    ["It's the Cogshare from two years ago.", "It's the COGS share from two years ago."],
    ['the cog share went up', 'the COGS share went up'],
    ['the cogs share and the COGS shares', 'the COGS share and the COGS shares'],
    ['COGSHARE', 'COGS share'],
  ])('%s', (heard, read) => expect(normalizeAsrTerms(heard)).toBe(read));
  it.each(['Costs went up.', 'COGS went up.', 'the cogs rose', 'a cog in the machine', 'share of COGS'])('unchanged: %s', t => expect(normalizeAsrTerms(t)).toBe(t));
});

describe('the checks fire on the heard spelling, once normalized', () => {
  const c = getCaseById('prof-001');
  const ids = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'];
  it('the misquote ("Cogshare went from 42% to 61%")', () => {
    const t = normalizeAsrTerms('Cogshare went from 42% to 61% of revenue.');
    expect(findCandidateMisquotes(t, factBaseFor(c as never), new Set(ids), []).map(m => m.cited)).toEqual(['to 61%']);
  });
  it('the unit flag ("25% of cog share … 25 points of revenue")', () => {
    const t = normalizeAsrTerms('Beans are 25% of cog share, so that is 25 points of revenue.');
    expect(checkCandidateMath(t, c, ids).flags.map(f => `${f.stepId}@${f.candidateValue}`)).toEqual(['unit:COGS@25']);
  });
});

describe('planTurn: the checks read the normalized text; the heard text is what gets saved', () => {
  it('this message and the history', () => {
    const reads = readsFixture({ phase: 'ANALYSIS', extraTurns: [{ role: 'candidate', text: 'I looked at the cog share first.' }, { role: 'interviewer', text: 'Go on.' }] });
    const p = planTurn(reads, "It's the Cogshare from two years ago.", { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    expect(p.ctx.candidateText).toBe("It's the COGS share from two years ago.");
    expect(p.ctx.heardText).toBe("It's the Cogshare from two years ago.");
    if (p.kind === 'model') expect(p.state.turnRows.some(t => t.text === 'I looked at the COGS share first.')).toBe(true);
  });
  it('nothing to normalize: no heard text kept apart', () => {
    const p = planTurn(readsFixture({ phase: 'ANALYSIS' }), 'COGS went up.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    expect(p.ctx.heardText).toBeUndefined();
  });
});
