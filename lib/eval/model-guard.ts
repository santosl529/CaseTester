// Which interviewer an evaluation actually measured (11 Oct 2026). Batch 18
// was meant to evaluate the pilot interviewer (Haiku 5.5) and ran on Sonnet
// 5.5: the batch recorded the configured default, never the model that
// answered. An evaluation now names its interviewer (an INTERVIEWER_EVAL_CONFIGS
// entry), and every interviewer call's returned model id is compared with it.
// A mismatch — a server-side fallback, a wrong default, a provider switch — an
// unpriced model, or a call that didn't say which model answered fails the
// run; the batch marks it failed and the wave exits non-zero.
import { isPriced } from '@/lib/llm-pricing';
import { interviewerEvalConfig, type InterviewerEvalConfig } from '@/lib/models';

export type ModelCheck = {
  config: string;
  requested: string;
  actual: string[];          // distinct returned model ids, in first-seen order
  calls: number;             // interviewer calls checked
  ok: boolean;
  problems: string[];
};

type UsageLike = { component?: string; model?: string; actualModel?: string };

// The evaluation's declared interviewer, checked before anything is spent:
// a config that doesn't exist or a model with no verified price stops the run.
export function evalInterviewer(config: string | undefined): { config: string } & InterviewerEvalConfig {
  if (!config) throw new Error('an evaluation must name its interviewer: INTERVIEWER_EVAL_CONFIG / --interviewer=<config>');
  const c = interviewerEvalConfig(config);
  if (!isPriced(c.model)) throw new Error(`interviewer model "${c.model}" (config ${config}) has no verified price — refusing to run`);
  return { config, ...c };
}

// Interviewer usage records (llm_usage payloads or TurnRecord usage) against
// the declared model. Records of other components are ignored.
export function checkInterviewerModels(config: string, requested: string, usages: UsageLike[]): ModelCheck {
  const calls = usages.filter(u => u.component === undefined || u.component === 'interviewer');
  const actual: string[] = [];
  const problems: string[] = [];
  if (!isPriced(requested)) problems.push(`requested model "${requested}" is unpriced`);
  for (const u of calls) {
    if (u.model !== undefined && u.model !== requested) problems.push(`an interviewer call requested "${u.model}", not "${requested}"`);
    if (!u.actualModel) { problems.push('an interviewer call did not record the model that answered'); continue; }
    if (!actual.includes(u.actualModel)) actual.push(u.actualModel);
  }
  for (const a of actual) {
    if (a !== requested) problems.push(`the API answered from "${a}", not "${requested}"`);
    else if (!isPriced(a)) problems.push(`returned model "${a}" is unpriced`);
  }
  if (calls.length === 0) problems.push('no interviewer call was recorded');
  return { config, requested, actual, calls: calls.length, ok: problems.length === 0, problems: [...new Set(problems)] };
}
