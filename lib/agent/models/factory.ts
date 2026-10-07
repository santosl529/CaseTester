// Which provider runs the interviewer: INTERVIEWER_PROVIDER=cerebras for the
// gpt-oss-120b experiment; Sonnet 5.5 on Anthropic otherwise (the default).
import type { InterviewerModel } from './interface';
import { AnthropicInterviewerModel } from './anthropic';
import { CerebrasInterviewerModel } from './cerebras';

export function createInterviewerModel(provider = process.env.INTERVIEWER_PROVIDER): InterviewerModel {
  return provider === 'cerebras' ? new CerebrasInterviewerModel() : new AnthropicInterviewerModel();
}
