import { describe, it, expect, vi } from 'vitest';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { Case } from '@/lib/cases/schema';

vi.mock('@/lib/scoring/better-audit', () => ({ auditBetterFigures: () => { throw new Error('bad exhibit'); } }));
const stream = vi.fn(() => ({
  finalMessage: async () => ({ usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: { verdicts: [] }, stop_reason: 'end_turn' }),
}));
vi.mock('@/lib/anthropic-client', () => ({ anthropicClient: () => ({ beta: { messages: { stream } } }) }));

const dim = (): DimensionFeedback => ({ rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [{ moment: 'm', betterResponse: 'b' }] });

describe('runClaimVerifier when the Better-figure audit throws', () => {
  it('still verifies and returns the report, with no hints', async () => {
    const { runClaimVerifier } = await import('@/lib/scoring/verifier');
    const rubric = { ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim()])), overallRating: 'meets_bar', topFix: 'x' } as RubricScores;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await runClaimVerifier(rubric, [{ role: 'candidate', text: 'hi', turnIndex: 0 }], undefined, { caseData: {} as Case });
    expect(out.rubric).toEqual(rubric);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((stream.mock.calls[0] as unknown[])[0])).not.toContain('FIGURES NOT FOUND IN THE CASE DATA (');
    spy.mockRestore();
  });
});
