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
  it('refuses an unknown provider rather than silently using Sonnet', () => {
    expect(() => createInterviewerModel('openai-sol')).toThrow(/unknown INTERVIEWER_PROVIDER/);
  });
});
