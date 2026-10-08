import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every background classifier's request, captured: production defaults are
// unchanged (Haiku 4.5, no thinking/effort fields), and an explicit Haiku 5.5
// override gets the migration settings (thinking disabled, effort medium,
// max_tokens scaled, no fallbacks, no sampling params).
const calls: Record<string, unknown>[] = [];
vi.mock('@/lib/anthropic-client', () => ({
  anthropicClient: () => ({
    messages: {
      create: async (params: Record<string, unknown>) => {
        calls.push(params);
        const text = String((params.messages as { content: string }[])[0].content).includes('8 dimensions')
          ? '{"structure":1,"quantitative":1,"dataExhibit":1,"judgment":1,"creativity":1,"synthesis":1,"communication":1,"pushback":1}'
          : '{"label":"none","reason":"","hint":false,"answered":false,"given":false,"requests":[]}';
        return { content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' };
      },
    },
  }),
}));

import { classifyDistress } from '@/lib/orchestrator/distress';
import { checkHintDelivered } from '@/lib/orchestrator/hint-check';
import { classifyDataRequests } from '@/lib/orchestrator/data-requests';
import { assessCoverage } from '@/lib/scoring/coverage';
import { judgeProbeAnswer, judgeStructureGiven, judgeCallsFor } from '@/lib/orchestrator/pressure-test';
import { BACKGROUND_MODEL_ID } from '@/lib/models';

type Run = (model?: string) => Promise<unknown>;
const ROLES: [string, Run, number][] = [
  ['distress', m => classifyDistress({ candidateText: 'x', model: m }), 128],
  ['hint_check', m => checkHintDelivered({ rung: 1, candidateText: 'x', interviewerText: 'y', model: m }), 96],
  ['data_request', m => classifyDataRequests({ candidateText: 'x', interviewerText: null, catalog: [], model: m }), 1024],
  ['coverage', m => assessCoverage([{ role: 'candidate', text: 'x' }], undefined, m), 256],
  ['probe_judge', m => m ? judgeProbeAnswer({ probe: 'q', replies: ['r'] }, judgeCallsFor(m).probe) : judgeProbeAnswer({ probe: 'q', replies: ['r'] }), 120],
  ['structure_judge', m => m ? judgeStructureGiven({ replies: ['r'] }, judgeCallsFor(m).structure) : judgeStructureGiven({ replies: ['r'] }), 120],
];

beforeEach(() => { calls.length = 0; });

describe('background classifiers', () => {
  it('production: judges and distress on Haiku 5.5 (switched 8 Oct after their checks); the rest on Haiku 4.5', () => {
    expect(BACKGROUND_MODEL_ID).toEqual({
      coverage: 'claude-haiku-4-5-20251001', data_request: 'claude-haiku-4-5', distress: 'claude-haiku-5-5',
      hint_check: 'claude-haiku-4-5', probe_judge: 'claude-haiku-5-5',
    });
  });

  for (const [role, run, maxTokens] of ROLES) {
    it(`${role}: default request is its production model's; Haiku 5.5 gets thinking disabled, effort medium, scaled max_tokens`, async () => {
      await run();
      const prod = BACKGROUND_MODEL_ID[(role === 'structure_judge' ? 'probe_judge' : role) as keyof typeof BACKGROUND_MODEL_ID];
      expect(calls[0].model).toBe(prod);
      if (prod.startsWith('claude-haiku-4-5')) {
        expect(calls[0].max_tokens).toBe(maxTokens);
        expect(calls[0]).not.toHaveProperty('thinking');
        expect(calls[0]).not.toHaveProperty('output_config');
      } else {
        expect(calls[0]).toMatchObject({ thinking: { type: 'disabled' }, output_config: { effort: 'medium' } });
      }
      await run('claude-haiku-5-5');
      expect(calls[1]).toMatchObject({ model: 'claude-haiku-5-5', thinking: { type: 'disabled' }, output_config: { effort: 'medium' }, max_tokens: Math.ceil(maxTokens * 1.3) });
      for (const k of ['temperature', 'top_p', 'top_k', 'fallbacks', 'betas']) expect(calls[1]).not.toHaveProperty(k);
    });
  }
});
