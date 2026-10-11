// Which provider runs the interviewer. Haiku 5.5 on Anthropic is the default
// (production since 11 Oct; INTERVIEWER_MODEL_ID). anthropic-sonnet55 selects
// Sonnet 5.5 (production until 11 Oct — comparison and rollback).
// anthropic-haiku55-none-medium is the 8 Oct screening switch, now the same as
// the default. Experiments only: cerebras (gpt-oss-120b, 7 Oct) and
// openai-luna-none (GPT-6 Luna at reasoning none, 7 Oct). An unknown value
// throws rather than silently running the default, so an evaluation can't
// measure the wrong model.
import type { InterviewerModel } from './interface';
import { AnthropicInterviewerModel } from './anthropic';
import { CerebrasInterviewerModel, OpenAIInterviewerModel } from './cerebras';

export function createInterviewerModel(provider = process.env.INTERVIEWER_PROVIDER): InterviewerModel {
  if (!provider) return new AnthropicInterviewerModel();
  if (provider === 'cerebras') return new CerebrasInterviewerModel();
  if (provider === 'openai-luna-none') return new OpenAIInterviewerModel('gpt-6-luna', 'none');
  if (provider === 'anthropic-haiku55-none-medium') return new AnthropicInterviewerModel('claude-haiku-5-5');
  if (provider === 'anthropic-sonnet55') return new AnthropicInterviewerModel('claude-sonnet-5-5');
  throw new Error(`unknown INTERVIEWER_PROVIDER "${provider}" (have: anthropic-sonnet55, anthropic-haiku55-none-medium, cerebras, openai-luna-none; unset = Haiku 5.5)`);
}
