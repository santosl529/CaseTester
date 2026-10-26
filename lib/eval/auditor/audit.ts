// One offline audit call (Phase 1 contract §5, Stream 1 task 3): Opus 5.5, adaptive thinking, effort high, structured
// output — the scoring calls' settings (lib/scoring/judge.ts). Offline and paid: scripts/offline-auditor.ts installs
// the run budget (LLM_BUDGET_USD / LLM_BUDGET_FILE) before any call, and every call goes through the metered client.
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { SCORING_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { anthropicClient } from '@/lib/anthropic-client';
import { AUDITOR_RULES, AuditOutputSchema, type AuditFault } from './prompt';

export const AUDITOR_MODEL_ID = SCORING_MODEL_ID;
const FORMAT = betaZodOutputFormat(AuditOutputSchema);

export type AuditResult = { faults: AuditFault[]; model: string; stopReason: string | null; usage: { input: number; output: number; cacheRead: number; cacheWrite: number }; ms: number };

export function auditPrompt(caseText: string, transcript: string): string {
  return `${AUDITOR_RULES}\n\n${caseText}\n\n${transcript}\n\nList every interviewer fault in this run.`;
}

export async function auditRun(prompt: string, client = anthropicClient()): Promise<AuditResult> {
  const t0 = Date.now();
  const response = await client.beta.messages.stream({
    model: AUDITOR_MODEL_ID,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: FORMAT, effort: 'high' },
    betas: [FALLBACK_BETA],
    fallbacks: FALLBACKS,
  }).finalMessage();
  if (!response.parsed_output) throw new Error(`auditor returned no structured output (stop_reason: ${response.stop_reason})`);
  const u = response.usage;
  return {
    faults: response.parsed_output.faults as AuditFault[], model: response.model, stopReason: response.stop_reason,
    usage: { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    ms: Date.now() - t0,
  };
}
