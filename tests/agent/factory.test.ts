import { describe, it, expect } from 'vitest';
import { createInterviewerModel } from '@/lib/agent/models/factory';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import { CerebrasInterviewerModel, OpenAIInterviewerModel } from '@/lib/agent/models/cerebras';

describe('createInterviewerModel', () => {
  // Production switched to Haiku 5.5 on 11 Oct 2026 (Lorenzo's call): thinking
  // disabled (it rejects between_tools), effort medium, no fallbacks (it has none).
  it('defaults to Haiku 5.5 on Anthropic, with its own request settings', () => {
    for (const p of [undefined, '']) {
      const m = createInterviewerModel(p) as unknown as { modelId: string; options: unknown };
      expect(m).toBeInstanceOf(AnthropicInterviewerModel);
      expect(m.modelId).toBe('claude-haiku-5-5');
      expect(m.options).toEqual({ thinking: 'disabled', effort: 'medium', fallbacks: false });
    }
  });
  it('a bare AnthropicInterviewerModel() on the default id never gets Sonnet-only settings', () => {
    const m = new AnthropicInterviewerModel() as unknown as { modelId: string; options: unknown };
    expect(m.modelId).toBe('claude-haiku-5-5');
    expect(m.options).toEqual({ thinking: 'disabled', effort: 'medium', fallbacks: false });
  });
  it('keeps Sonnet 5.5 as an explicit provider (comparison / rollback): between_tools thinking, fallbacks on', () => {
    const m = createInterviewerModel('anthropic-sonnet55') as unknown as { modelId: string; options: unknown };
    expect(m).toBeInstanceOf(AnthropicInterviewerModel);
    expect(m.modelId).toBe('claude-sonnet-5-5');
    expect(m.options).toEqual({ thinking: 'between_tools', fallbacks: true });
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
  it('the old Haiku 5.5 screening switch still selects Haiku 5.5 with the same settings', () => {
    const m = createInterviewerModel('anthropic-haiku55-none-medium') as unknown as { modelId: string; options: unknown };
    expect(m).toBeInstanceOf(AnthropicInterviewerModel);
    expect(m.modelId).toBe('claude-haiku-5-5');
    expect(m.options).toEqual({ thinking: 'disabled', effort: 'medium', fallbacks: false });
  });
  it('refuses an unknown provider rather than silently using the default', () => {
    expect(() => createInterviewerModel('openai-sol')).toThrow(/unknown INTERVIEWER_PROVIDER/);
  });
});
