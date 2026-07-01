import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { createLedger, revealedValues, reveal, unrevealedLabels } from '@/lib/orchestrator/data-ledger';
import { auditTurn } from '@/lib/orchestrator/audit';
import { runInterviewerTurn } from '@/lib/agent/interviewer';
import { HaikuInterviewerModel } from '@/lib/agent/models/haiku';
import type { ModelMessage } from '@/lib/agent/models/interface';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { PHASE_BUDGETS_MS } from '@/lib/orchestrator/state-machine';

// Scripted candidate turns that simulate a realistic but incomplete interview
const SCRIPTED_TURNS: string[] = [
  "I'd like to start by understanding the profitability structure. Can you tell me what the total revenues are?",
  "Thanks. And can you break down the main cost categories?",
  "What's the COGS as a percentage of revenue?",
  "Interesting. Has COGS always been at this level or has it changed?",
  "Can you share the exhibit showing cost trends over time?",
  "Looking at this, COGS seems to be the main driver. What's been causing the increase in COGS?",
  "What's the average transaction value?",
  "Based on the data, my hypothesis is that coffee bean cost inflation is driving the margin decline, and the company hasn't been able to pass those costs on. I'd recommend targeted price increases on high-margin SKUs.",
  "I think we've covered the main issues. Should we wrap up?",
];

describe('hallucination harness (calls real API — requires ANTHROPIC_API_KEY)', () => {
  it.skipIf(!process.env.ANTHROPIC_API_KEY)(
    'zero invented numbers across scripted turns on prof-001',
    async () => {
      const caseData = getCaseById('prof-001');
      const ledger = createLedger(caseData.dataLedger as any);
      const model = new HaikuInterviewerModel();
      const history: ModelMessage[] = [];
      let phase: Phase = 'INTRO';
      const auditLog: { turn: number; result: ReturnType<typeof auditTurn> }[] = [];
      let shownExhibitDataText = '';

      for (let i = 0; i < SCRIPTED_TURNS.length; i++) {
        const candidateText = SCRIPTED_TURNS[i];

        const actions = await runInterviewerTurn({
          model,
          candidateText,
          history,
          phase,
          promptCtx: {
            casePrompt: caseData.prompt,
            currentPhase: phase,
            revealedValues: revealedValues(ledger),
            unrevealedLabels: unrevealedLabels(ledger),
            pushbackDone: false,
            phaseElapsedMs: 0,
            phaseBudgetMs: PHASE_BUDGETS_MS[phase],
          },
        });

        // Execute actions: if reveal_data, actually reveal; collect spoken text
        let spokenText = '';
        for (const action of actions) {
          if (action.type === 'speak') {
            spokenText += action.text + ' ';
          } else if (action.type === 'reveal_data') {
            // Reveal and update ledger
            try { reveal(ledger, action.itemId); } catch { /* already revealed */ }
          } else if (action.type === 'show_exhibit') {
            const exhibit = caseData.exhibits.find(e => e.id === action.exhibitId);
            if (exhibit) shownExhibitDataText += JSON.stringify(exhibit.data) + ' ';
          } else if (action.type === 'advance_phase') {
            const phases = ['INTRO','CLARIFY','STRUCTURE','ANALYSIS','EXHIBIT','BRAINSTORM','RECOMMENDATION','WRAP','SCORING'] as Phase[];
            const idx = phases.indexOf(phase);
            if (idx < phases.length - 1) phase = phases[idx + 1];
          }
        }

        // Audit: revealed values + case prompt + shown exhibit data + candidate's own words (can be echoed)
        const combinedAllowedText = caseData.prompt + ' ' + shownExhibitDataText + ' ' + SCRIPTED_TURNS.slice(0, i + 1).join(' ');
        const audit = auditTurn(spokenText.trim(), revealedValues(ledger), combinedAllowedText);
        auditLog.push({ turn: i + 1, result: audit });

        // Update history
        history.push({ role: 'user', content: candidateText });
        history.push({ role: 'assistant', content: spokenText.trim() });
      }

      const failures = auditLog.filter(e => !e.result.passed);
      if (failures.length > 0) {
        console.error('HALLUCINATION FAILURES:', JSON.stringify(failures, null, 2));
      }
      expect(failures).toHaveLength(0);
    },
    60_000 // 60s timeout for real API calls
  );
});
