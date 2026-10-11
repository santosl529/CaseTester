// Batch 18 measured Sonnet 5.5 while the evaluation was meant for Haiku 5.5:
// the record held the configured default, not the model that answered.
import { describe, it, expect } from 'vitest';
import { evalInterviewer, checkInterviewerModels } from '@/lib/eval/model-guard';
import { createInterviewerModel } from '@/lib/agent/models/factory';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import { INTERVIEWER_MODEL_ID, BACKGROUND_MODEL_ID, SCORING_MODEL_ID } from '@/lib/models';

describe('the declared evaluation interviewer', () => {
  it('haiku55-thinking-off is Haiku 5.5 with thinking disabled, effort medium, no fallbacks', () => {
    expect(evalInterviewer('haiku55-thinking-off')).toEqual({
      config: 'haiku55-thinking-off', model: 'claude-haiku-5-5', thinking: 'disabled', effort: 'medium', fallbacks: false,
    });
    const m = createInterviewerModel(undefined, 'haiku55-thinking-off') as unknown as { modelId: string; options: unknown };
    expect(m).toBeInstanceOf(AnthropicInterviewerModel);
    expect(m.modelId).toBe('claude-haiku-5-5');
    expect(m.options).toEqual({ thinking: 'disabled', effort: 'medium', fallbacks: false });
  });

  it('the Sonnet baseline is selectable the same way', () => {
    const m = createInterviewerModel(undefined, 'sonnet55-baseline') as unknown as { modelId: string; options: unknown };
    expect(m.modelId).toBe('claude-sonnet-5-5');
    expect(m.options).toEqual({ thinking: 'between_tools', fallbacks: true });
  });

  it('an evaluation without a declared interviewer, or with an unknown one, is refused', () => {
    expect(() => evalInterviewer(undefined)).toThrow(/must name its interviewer/);
    expect(() => evalInterviewer('haiku-5')).toThrow(/unknown interviewer evaluation config/);
    expect(() => createInterviewerModel(undefined, 'nope')).toThrow(/unknown interviewer evaluation config/);
  });

  it('a config and a provider together are refused (one declared interviewer)', () => {
    expect(() => createInterviewerModel('anthropic-sonnet55', 'haiku55-thinking-off')).toThrow(/both set/);
  });

  it('declaring an evaluation config switches nothing else', () => {
    createInterviewerModel(undefined, 'haiku55-thinking-off');
    expect(INTERVIEWER_MODEL_ID).toBe('claude-haiku-5-5');
    expect(SCORING_MODEL_ID).toBe('claude-opus-5-5');
    expect(BACKGROUND_MODEL_ID.data_request).toBe('claude-haiku-4-5');
    expect(BACKGROUND_MODEL_ID.coverage).toBe('claude-haiku-4-5-20251001');
  });
});

describe('requested vs returned interviewer model', () => {
  const haiku = (actualModel?: string) => ({ component: 'interviewer', model: 'claude-haiku-5-5', actualModel });

  it('passes when every interviewer call was answered by the requested model', () => {
    const c = checkInterviewerModels('haiku55-thinking-off', 'claude-haiku-5-5', [haiku('claude-haiku-5-5'), haiku('claude-haiku-5-5'), { component: 'judge', model: 'claude-opus-5-5' }]);
    expect(c).toEqual({ config: 'haiku55-thinking-off', requested: 'claude-haiku-5-5', actual: ['claude-haiku-5-5'], calls: 2, ok: true, problems: [] });
  });

  it('batch 18: requested Haiku, answered by Sonnet — fails', () => {
    const c = checkInterviewerModels('haiku55-thinking-off', 'claude-haiku-5-5', [{ component: 'interviewer', model: 'claude-sonnet-5-5', actualModel: 'claude-sonnet-5-5' }]);
    expect(c.ok).toBe(false);
    expect(c.actual).toEqual(['claude-sonnet-5-5']);
    expect(c.problems.join(' | ')).toMatch(/requested "claude-sonnet-5-5"/);
    expect(c.problems.join(' | ')).toMatch(/answered from "claude-sonnet-5-5"/);
  });

  it('a server-side fallback on one call fails the run', () => {
    const c = checkInterviewerModels('sonnet55-baseline', 'claude-sonnet-5-5', [
      { component: 'interviewer', model: 'claude-sonnet-5-5', actualModel: 'claude-sonnet-5-5' },
      { component: 'interviewer', model: 'claude-sonnet-5-5', actualModel: 'claude-sonnet-5' },
    ]);
    expect(c.ok).toBe(false);
    expect(c.actual).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5']);
  });

  it('a call that did not record what answered, an unpriced model, or no calls at all fails', () => {
    expect(checkInterviewerModels('x', 'claude-haiku-5-5', [haiku(undefined)]).problems).toContain('an interviewer call did not record the model that answered');
    expect(checkInterviewerModels('x', 'gpt-6-luna', [{ component: 'interviewer', model: 'gpt-6-luna', actualModel: 'gpt-6-luna' }]).problems)
      .toContain('requested model "gpt-6-luna" is unpriced');
    expect(checkInterviewerModels('x', 'claude-haiku-5-5', []).problems).toContain('no interviewer call was recorded');
  });
});
