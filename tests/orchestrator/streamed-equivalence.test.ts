import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { streamTurnSegments } from '@/lib/orchestrator/stream-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { TurnKind } from '@/lib/orchestrator/plan-turn';
import { modelPlanFixture } from './fixtures/model-plan';

// Streaming changes WHEN the candidate hears the turn, never WHAT: delivered
// segments + Settle's tail == the turn Settle composes when nothing streamed.

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What drove it?', ...over });
const STORES = { what: 'the store count', itemIds: ['stores_count'], explicit: true, respond: 'release' as const };

const TURNS: { name: string; turn: ModelTurn; streams: boolean }[] = [
  { name: 'plain probe', turn: T({ say: 'Okay.' }), streams: true },
  { name: 'a release between say and question', turn: T({ say: 'Okay.', requests: [STORES] }), streams: true },
  { name: 'no say, only data', turn: T({ requests: [STORES] }), streams: true },
  { name: 'a refusal named', turn: T({ requests: [{ what: 'NPS', itemIds: [], explicit: true, respond: 'release' }] }), streams: true },
  { name: 'data talk in say is vetoed', turn: T({ say: "Okay. I'll give you that.", requests: [STORES] }), streams: true },
  { name: 'a goodbye is vetoed', turn: T({ say: 'Thanks for working through this with me.' }), streams: false },
  { name: 'an unsourced figure is vetoed', turn: T({ say: 'That is roughly $7M a year.' }), streams: false },
  { name: 'only the question', turn: T(), streams: false },
];

const usage = { model: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn, delivered: string[], undeliveredRevealIds: string[] = []): ModelOutcome =>
  ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered, undeliveredRevealIds });
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('streamed turn = composed turn', () => {
  for (const t of TURNS) {
    it(t.name, async () => {
      const reference = await settleTurn(modelPlanFixture({ distress: null }), outcome(t.turn, []));

      const plan = modelPlanFixture({ distress: null });
      const segs: string[] = [];
      const out = await streamTurnSegments(eventsFromTurn(Promise.resolve(t.turn)), plan, async s => { if (s.text) segs.push(s.text); }, { isDelivered: { value: false } });
      if (out.kind !== 'done') throw new Error('unexpected distress');
      const settled = await settleTurn(plan, outcome(out.turn, out.delivered, out.undeliveredRevealIds));

      expect(norm([...segs, settled.tail].join(' '))).toBe(norm(reference.spokenText));
      expect(settled.prefixMismatch).toBe(false);
      expect(segs.length > 0).toBe(t.streams);
      expect(settled.result).toEqual(reference.result);
    });
  }
});

describe('settleTurn composition', () => {
  const settle = (turn: ModelTurn, kind: TurnKind = 'model') => settleTurn(modelPlanFixture({ distress: null, kind }), outcome(turn, []));

  it('composes say, the data line, then the question', async () => {
    const s = await settle(T({ say: 'Okay.', requests: [STORES] }));
    expect(s.spokenText).toMatch(/^Okay\. 200 stores.* What drove it\?$/);
    expect(s.newReveals).toEqual(['stores_count']);
  });

  it('withholds vetoed sentences and never rewrites them', async () => {
    const s = await settle(T({ say: "Okay. I'll give you the numbers now." }));
    expect(s.spokenText).toBe('Okay. What drove it?');
  });

  it('a vetoed question becomes "Go on."', async () => {
    const s = await settle(T({ question: "That's our time, thanks for working through it." }));
    expect(s.spokenText).toBe('Go on.');
  });

  it('on a rec_ask turn the question is the scripted recommendation ask', async () => {
    const s = await settle(T({ say: 'Okay.', question: '' }), 'rec_ask');
    expect(s.spokenText).toMatch(/^Okay\. .*(recommendation|tell the CEO)/i);
  });

  it('a close turn ends the case with its scripted line, answering the final ask first', async () => {
    const s = await settle(T({ move: 'other', say: '', question: "That's time. Thanks for working through it — your written report will follow.", requests: [STORES] }), 'close');
    expect(s.result.ended).toBe(true);
    expect(s.result.phase).toBe('SCORING');
    expect(s.spokenText).toMatch(/^200 stores.*your written report will follow\.$/);
  });

  it('derives the phase from the declared move', async () => {
    expect((await settle(T({ move: 'brainstorm', say: 'Okay.' }))).result.phase).toBe('BRAINSTORM');
  });
});
