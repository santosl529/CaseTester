import { describe, it, expect } from 'vitest';
import { createInterviewerModel } from '@/lib/agent/models/factory';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import { CerebrasInterviewerModel, OpenAIInterviewerModel } from '@/lib/agent/models/cerebras';
import { interviewerEvalConfig } from '@/lib/models';

describe('createInterviewerModel', () => {
  // Production back on Sonnet 5.5 since 12 Oct 2026 (Lorenzo's call, after
  // batch 20): the sonnet55-baseline config — between_tools thinking, fallbacks on.
  it('defaults to Sonnet 5.5 on Anthropic, with the sonnet55-baseline settings', () => {
    const c = interviewerEvalConfig('sonnet55-baseline');
    for (const p of [undefined, '']) {
      const m = createInterviewerModel(p) as unknown as { modelId: string; options: unknown };
      expect(m).toBeInstanceOf(AnthropicInterviewerModel);
      expect(m.modelId).toBe(c.model);
      expect(m.options).toEqual({ thinking: c.thinking, fallbacks: c.fallbacks });
    }
  });
  it('a bare AnthropicInterviewerModel() on the default id gets Sonnet settings, never Haiku-only ones', () => {
    const m = new AnthropicInterviewerModel() as unknown as { modelId: string; options: unknown };
    expect(m.modelId).toBe('claude-sonnet-5-5');
    expect(m.options).toEqual({ thinking: 'between_tools', fallbacks: true });
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
  it('Haiku 5.5 stays selectable (production 11–12 Oct): thinking disabled, effort medium, no fallbacks', () => {
    const m = createInterviewerModel('anthropic-haiku55-none-medium') as unknown as { modelId: string; options: unknown };
    expect(m).toBeInstanceOf(AnthropicInterviewerModel);
    expect(m.modelId).toBe('claude-haiku-5-5');
    expect(m.options).toEqual({ thinking: 'disabled', effort: 'medium', fallbacks: false });
  });
  it('the voice agent script follows the default interviewer (no provider pinned)', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['voice:agent']).not.toMatch(/INTERVIEWER_PROVIDER|INTERVIEWER_EVAL_CONFIG/);
  });
  it('refuses an unknown provider rather than silently using the default', () => {
    expect(() => createInterviewerModel('openai-sol')).toThrow(/unknown INTERVIEWER_PROVIDER/);
  });
});
