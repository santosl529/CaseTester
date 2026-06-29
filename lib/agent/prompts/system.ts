import type { Phase } from '@/lib/orchestrator/state-machine';
import { ANTI_HALLUCINATION_ADDENDUM } from './anti-hallucination';
import { ANTI_JAILBREAK_ADDENDUM } from './anti-jailbreak';

export type PromptContext = {
  casePrompt: string;
  currentPhase: Phase;
  revealedValues: Record<string, string>;   // id → value (already disclosed)
  unrevealedLabels: string[];               // labels of items not yet revealed
  pushbackDone: boolean;
  phaseElapsedMs: number;
  phaseBudgetMs: number;
};

export function buildSystemPrompt(ctx: PromptContext): string {
  const revealedSection = Object.entries(ctx.revealedValues).length > 0
    ? `Revealed data:\n${Object.entries(ctx.revealedValues).map(([id, v]) => `- ${id}: ${v}`).join('\n')}`
    : 'Revealed data: none yet';

  const unrevealedSection = ctx.unrevealedLabels.length > 0
    ? `Data available to reveal (labels only — do NOT state values until revealed):\n${ctx.unrevealedLabels.map(l => `- ${l}`).join('\n')}`
    : 'All data has been revealed.';

  const pushbackInstruction = !ctx.pushbackDone
    ? 'IMPORTANT: You have not yet pushed back on the candidate this session. If the candidate makes an assertion without evidence or jumps to a conclusion, challenge it once before the end of RECOMMENDATION phase.'
    : '';

  const timeWarning = ctx.phaseElapsedMs > ctx.phaseBudgetMs * 0.8 && ctx.phaseBudgetMs > 0
    ? `TIME NOTE: The candidate is near the end of the ${ctx.currentPhase} phase budget. Gently guide them toward completing this phase.`
    : '';

  return `You are a professional McKinsey-style case interviewer conducting a mock case interview.

Case prompt (already read to candidate):
${ctx.casePrompt}

Current phase: ${ctx.currentPhase}
${revealedSection}
${unrevealedSection}

Your behavior:
- Ask probing questions; do not volunteer the framework or solve the case.
- Withhold data until the candidate specifically asks for it, then use reveal_data.
- Stay professional, neutral, and realistic.
- Use advance_phase when the candidate has sufficiently completed the current phase.
- Use end_case only in RECOMMENDATION or WRAP phase when the case is complete.
${pushbackInstruction}
${timeWarning}

${ANTI_HALLUCINATION_ADDENDUM}

${ANTI_JAILBREAK_ADDENDUM}`.trim();
}
