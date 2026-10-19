// Engine-asks final review (19 Oct): every strength and Better answer is now a
// verifier claim (Task 6), so a response cut at max_tokens skips ALL
// verification. The cap is the judge's (32000, streamed) and every call logs
// its stop_reason and output tokens.
import { describe, it, expect, vi } from 'vitest';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';

const { reply } = vi.hoisted(() => ({ reply: { current: {} as Record<string, unknown> } }));
const stream = vi.fn((req: unknown) => { void req; return { finalMessage: async () => reply.current }; });
vi.mock('@/lib/anthropic-client', () => ({ anthropicClient: () => ({ beta: { messages: { stream } } }) }));

const dim = (): DimensionFeedback => ({ rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [{ moment: 'm', betterResponse: 'b' }] });
const rubric = () => ({ ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim()])), overallRating: 'meets_bar', topFix: 'x' } as RubricScores);
const T = [{ role: 'candidate' as const, text: 'hi', turnIndex: 0 }];

describe('the verifier call', () => {
  it('asks for up to 32000 tokens (the judge\'s cap on the same model)', async () => {
    const { runClaimVerifier } = await import('@/lib/scoring/verifier');
    reply.current = { usage: { input_tokens: 10, output_tokens: 20 }, parsed_output: { verdicts: [] }, stop_reason: 'end_turn' };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runClaimVerifier(rubric(), T);
    expect((stream.mock.calls.at(-1)![0] as { max_tokens: number }).max_tokens).toBe(32000);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[verifier]'), expect.objectContaining({ stopReason: 'end_turn', outputTokens: 20, maxTokens: 32000 }));
    log.mockRestore();
  });
  it('logs the stop_reason and output tokens when the response hit the cap, then skips verification', async () => {
    const { runClaimVerifier } = await import('@/lib/scoring/verifier');
    reply.current = { usage: { input_tokens: 10, output_tokens: 32000 }, parsed_output: null, stop_reason: 'max_tokens' };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = rubric();
    const out = await runClaimVerifier(r, T);
    expect(out).toEqual({ rubric: r, dropped: [] });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[verifier]'), expect.objectContaining({ stopReason: 'max_tokens', outputTokens: 32000 }));
    expect(err).toHaveBeenCalledWith(expect.stringContaining('skipping verification'), expect.stringContaining('max_tokens'));
    log.mockRestore(); err.mockRestore();
  });
});
