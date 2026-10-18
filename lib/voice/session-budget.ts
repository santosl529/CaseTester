// The LLM budget of one voice session (voice deploy, 18 Oct). The worker forks
// one process per job and exits it when the job ends (@livekit/agents
// ipc/job_proc_lazy_main: process.exit after the job; idle processes are
// pre-warmed, never reused), and this is installed at the job's entry, in
// memory — so LLM_BUDGET_USD caps each session, never the worker's lifetime,
// in dev and start mode alike. LLM_BUDGET_FILE (a cap shared across processes)
// is ignored here: on a worker it would turn the cap into a running total.
import { installRunBudget, type RunBudget } from '@/lib/llm-budget';

export const DEFAULT_SESSION_BUDGET_USD = 1.0;

export function installSessionBudget(env: Record<string, string | undefined> = process.env, log: (m: string) => void = console.log): RunBudget {
  const raw = env.LLM_BUDGET_USD?.trim();
  const cap = raw ? Number(raw) : DEFAULT_SESSION_BUDGET_USD;
  if (!(cap > 0)) throw new Error(`LLM_BUDGET_USD must be a positive dollar amount per session (got ${raw})`);
  if (env.LLM_BUDGET_FILE) log('[budget] voice-agent: LLM_BUDGET_FILE ignored — the cap is per session');
  log(`[budget] voice-agent: cap $${cap.toFixed(2)} for this session`);
  return installRunBudget(cap);
}
