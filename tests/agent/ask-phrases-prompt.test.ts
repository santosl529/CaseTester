// Phase 1 contract 2.5 (Stream 2 Task 5): each unrevealed item's askPhrases beside its label, in the static,
// cached part of the interviewer prompt, behind askPhrasesInPrompt. Off, the prompt is byte-identical to the
// contract base's (the hashes below were taken on 46b9d691, before the change), on all five cases.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));

import { getCaseById } from '@/lib/cases/loader';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { promptContextFor } from '@/lib/orchestrator/prompt-context';
import { buildPromptParts } from '@/lib/agent/prompts/system';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { readsFixture } from '../orchestrator/fixtures/turn-reads';
import { labelWithPeriod } from '@/lib/orchestrator/data-ledger';

const IDS = ['prof-001', 'prof-002', 'entry-001', 'launch-001', 'pricing-001'] as const;
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
beforeAll(() => { vi.useFakeTimers({ now: NOW, toFake: ['Date'] }); });
afterAll(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllEnvs(); });

// Two states per case: the clarify stage with nothing out, and the analysis with the first two items out.
const STATES: { phase: Phase; revealed: (id: string) => string[] }[] = [
  { phase: 'CLARIFY', revealed: () => [] },
  { phase: 'ANALYSIS', revealed: id => getCaseById(id).dataLedger.slice(0, 2).map(d => d.id) },
];
function parts(id: string, s: typeof STATES[number]) {
  const plan = planTurn(readsFixture({ caseId: id, phase: s.phase, elapsedMs: 300_000, revealed: s.revealed(id) }), 'I would start with the revenue side. Do we have any data on that?', { sessionId: 's1', now: NOW, turnStartMs: NOW, later: () => {} });
  if (plan.kind !== 'model') throw new Error(`${id}: not a model turn`);
  return buildPromptParts(promptContextFor(plan));
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// sha256 (first 16 hex) of [stable, turn] for each state, switches off, on the contract base.
const BASE: Record<string, [string, string][]> = {
  'entry-001': [['9d9a997ebab549d2', '216bd6228f108635'], ['9d9a997ebab549d2', '9a655605c72b2418']],
  'launch-001': [['af26bfbdabc99b6b', 'a49fb6d9cc1d8ad2'], ['af26bfbdabc99b6b', '4eb89afa5ef239ca']],
  'pricing-001': [['a20bcb4db5407551', '04da32c4d993e41b'], ['a20bcb4db5407551', '6314e15318962b15']],
  'prof-001': [['6655da436ea3a21e', '0fe09e6a0fe151b9'], ['6655da436ea3a21e', '890e8b6f6acd0d3f']],
  'prof-002': [['4d029a27c5c69f2d', '5712d10ee1de164f'], ['4d029a27c5c69f2d', '91973dcfc95c4750']],
};

describe('askPhrasesInPrompt off', () => {
  it.each(IDS)('%s: the prompt is byte-identical to the base', id => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const got = STATES.map(s => { const p = parts(id, s); return [sha(p.stable), sha(p.turn)] as [string, string]; });
    expect(got).toEqual(BASE[id]);
  });
});

describe('askPhrasesInPrompt on', () => {
  it.each(IDS)("%s: every item's askPhrases beside its label, in the stable part, the same every turn; the turn part unchanged", id => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const off = STATES.map(s => parts(id, s));
    vi.stubEnv('ENGINE_SWITCHES', `${id}=askPhrasesInPrompt`);
    const on = STATES.map(s => parts(id, s));
    expect(on[0].stable).toBe(on[1].stable);
    on.forEach((p, i) => expect(p.turn).toBe(off[i].turn));
    expect(on[0].stable).toContain('WHAT EACH DATA ITEM ANSWERS');
    for (const d of getCaseById(id).dataLedger) {
      expect(on[0].stable).toContain(`- id: "${d.id}" — ${labelWithPeriod(d)}: ${d.askPhrases!.join('; ')}`);
    }
    // Only the section is added: the stable part off is the stable part on without it.
    expect(on[0].stable.replace(/\n\nWHAT EACH DATA ITEM ANSWERS[^]*?(?=\n\n)/, '')).toBe(off[0].stable);
  });
  it("another case's switch leaves this case's prompt alone", () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-002=askPhrasesInPrompt');
    expect(sha(parts('prof-001', STATES[0]).stable)).toBe(BASE['prof-001'][0][0]);
  });
});
