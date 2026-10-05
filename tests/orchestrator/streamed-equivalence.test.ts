import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { streamTurnSegments } from '@/lib/orchestrator/stream-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { eventsFromActions } from '@/lib/agent/models/turn-events';
import type { Action } from '@/lib/orchestrator/actions';
import { modelPlanFixture } from './fixtures/model-plan';

// The core guarantee of the streaming turn: streaming changes WHEN the
// candidate hears the interviewer, never WHAT they end up hearing. For each
// draft, delivered segments + Settle's tail must equal the text the unchanged
// post-turn pipeline produces when nothing was streamed.

const TURNS: { name: string; actions: Action[]; streams: boolean }[] = [
  { name: 'plain probe', streams: true, actions: [{ type: 'speak', text: 'Okay. Walk me through that.' }] },
  { name: 'statement then held question', streams: true, actions: [{ type: 'speak', text: 'Okay. What drove the change?' }] },
  { name: 'reveal between speech', streams: true, actions: [
    { type: 'speak', text: 'Okay.' }, { type: 'reveal_data', itemId: 'stores_count' }, { type: 'speak', text: 'What does that tell you?' },
  ] },
  { name: 'handoff recovered before the question', streams: true, actions: [{ type: 'speak', text: "Here's the store footprint. What stands out?" }] },
  { name: 'meta-leak buffers', streams: false, actions: [{ type: 'speak', text: "I'll release the cost-structure data now. What stands out?" }] },
  { name: 'close cue buffers', streams: false, actions: [{ type: 'speak', text: 'Thanks for working through this with me.' }] },
  { name: 'unsourced figure stops delivery after the clean sentence', streams: true, actions: [{ type: 'speak', text: 'Okay. So that is roughly $7M a year. Why?' }] },
  { name: 'unsourced figure first buffers the whole turn', streams: false, actions: [{ type: 'speak', text: 'That is roughly $7M a year. Why?' }] },
];

const usage = { model: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (actions: Action[], delivered: string[], undeliveredRevealIds: string[] = []): ModelOutcome =>
  ({ actions, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered, undeliveredRevealIds });
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('streamed turn = unstreamed turn', () => {
  for (const t of TURNS) {
    it(t.name, async () => {
      const reference = await settleTurn(modelPlanFixture({ distress: null }), outcome(t.actions, []));

      const plan = modelPlanFixture({ distress: null });
      const segs: string[] = [];
      const out = await streamTurnSegments(eventsFromActions(Promise.resolve(t.actions)), plan, async s => { if (s.text) segs.push(s.text); }, { isDelivered: { value: false } });
      if (out.kind !== 'done') throw new Error('unexpected distress');
      const settled = await settleTurn(plan, outcome(out.actions, out.delivered, out.undeliveredRevealIds));

      expect(norm([...segs, settled.tail].join(' '))).toBe(norm(reference.spokenText));
      expect(settled.prefixMismatch).toBe(false);
      expect(segs.length > 0).toBe(t.streams);
      expect(settled.result).toEqual(reference.result);
    });
  }
});
