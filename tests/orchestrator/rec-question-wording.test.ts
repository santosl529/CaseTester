// Lorenzo, 16 Oct (batch 29 Jordan ea27d1f6 t13): a code question that says
// "your recommendation" is not asked before a recommendation is received. Plan
// keeps those turns out (math-checker-plan.test.ts); the wording is the
// backstop — code's revision questions ask about the analysis instead.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { codeWrittenTurn } from '@/lib/orchestrator/session-runner';
import { modelPlanFixture } from './fixtures/model-plan';

const REC = /recommendation/;
function plan(kind: 'rec_revision' | 'rec_math_probe', recommendationReceived: boolean) {
  const p = modelPlanFixture({ distress: null });
  p.state.kind = kind;
  p.state.recommendationReceived = recommendationReceived;
  if (kind === 'rec_math_probe') {
    p.state.recMathProbe = { closed: { key: 'cogs_dollar_impact@38', said: '38 points', correction: 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.' }, action: 'correct' };
  }
  return p;
}

describe('code\'s revision questions', () => {
  it('a correction of the recommendation\'s math: "Does that change your recommendation?" only with one received', () => {
    expect(codeWrittenTurn(plan('rec_math_probe', true), null).question).toMatch(REC);
    const none = codeWrittenTurn(plan('rec_math_probe', false), null);
    expect(none.say).toMatch(/^COGS rose 16 points/);
    expect(none.question).not.toMatch(REC);
    expect(none.question).toMatch(/\?$/);
  });
  it('a misquote\'s revision question likewise', () => {
    expect(codeWrittenTurn(plan('rec_revision', true), null).question).toMatch(REC);
    expect(codeWrittenTurn(plan('rec_revision', false), null).question).not.toMatch(REC);
  });
});
