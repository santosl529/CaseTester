// Which provider runs the interviewer. Sonnet 5.5 on Anthropic is the
// default (production). Experiments only: INTERVIEWER_PROVIDER=cerebras
// (gpt-oss-120b, 7 Oct) and openai-luna-none (GPT-6 Luna at reasoning none —
// the persona evaluation, 7 Oct). An unknown value throws rather than
// silently running Sonnet, so an evaluation can't measure the wrong model.
import type { InterviewerModel } from './interface';
import { AnthropicInterviewerModel } from './anthropic';
import { CerebrasInterviewerModel, OpenAIInterviewerModel } from './cerebras';

export function createInterviewerModel(provider = process.env.INTERVIEWER_PROVIDER): InterviewerModel {
  if (!provider) return new AnthropicInterviewerModel();
  if (provider === 'cerebras') return new CerebrasInterviewerModel();
  if (provider === 'openai-luna-none') return new OpenAIInterviewerModel('gpt-6-luna', 'none');
  throw new Error(`unknown INTERVIEWER_PROVIDER "${provider}" (have: cerebras, openai-luna-none; unset = Sonnet)`);
}
