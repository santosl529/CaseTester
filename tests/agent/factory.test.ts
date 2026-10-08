import { describe, it, expect } from 'vitest';
import { createInterviewerModel } from '@/lib/agent/models/factory';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import { CerebrasInterviewerModel, OpenAIInterviewerModel } from '@/lib/agent/models/cerebras';

describe('createInterviewerModel', () => {
  it('defaults to Sonnet on Anthropic', () => {
    expect(createInterviewerModel(undefined)).toBeInstanceOf(AnthropicInterviewerModel);
    expect(createInterviewerModel('')).toBeInstanceOf(AnthropicInterviewerModel);
  });
  it('keeps the Cerebras switch', () => {
    expect(createInterviewerModel('cerebras')).toBeInstanceOf(CerebrasInterviewerModel);
  });
  it('runs GPT-6 Luna at reasoning none only when asked (evaluation)', () => {
    const m = createInterviewerModel('openai-luna-none');
    expect(m).toBeInstanceOf(OpenAIInterviewerModel);
    expect((m as unknown as { modelId: string; reasoningEffort: string }).modelId).toBe('gpt-6-luna');
    expect((m as unknown as { modelId: string; reasoningEffort: string }).reasoningEffort).toBe('none');
  });
  it('runs Haiku 5.5 with thinking disabled, effort medium, no fallbacks only when asked (screening)', () => {
    const m = createInterviewerModel('anthropic-haiku55-none-medium') as unknown as { modelId: string; options: unknown };
    expect(m).toBeInstanceOf(AnthropicInterviewerModel);
    expect(m.modelId).toBe('claude-haiku-5-5');
    expect(m.options).toEqual({ thinking: 'disabled', effort: 'medium', fallbacks: false });
    expect((createInterviewerModel(undefined) as unknown as { modelId: string }).modelId).toBe('claude-sonnet-5-5');
  });
  it('refuses an unknown provider rather than silently using Sonnet', () => {
    expect(() => createInterviewerModel('openai-sol')).toThrow(/unknown INTERVIEWER_PROVIDER/);
  });
});
