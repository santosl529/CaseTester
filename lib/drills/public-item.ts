// The only path from an item to the client (docs/prd-drills.md "Integrity
// rules": answer keys stay on the server until an item is submitted). Built as
// an allowlist, so a key field added to ItemSchema later stays server-side
// unless someone adds it here on purpose.
import 'server-only';
import { getDrill } from './config';
import type { Item, RepairExtras } from './item-schema';
import type { ChartSpec } from './chart-spec';
import { parseFramework } from './content-import';
import type { StepResponse } from './sets/scoring';

export interface PublicItem {
  drill_id: string;
  level: 1 | 2;
  tier: 1 | 2 | 3;
  prompt: string;
  exhibit: ChartSpec | null;
  input: Item['input'];
  options: { id: string; text: string }[];
  // Repair items: the flawed answer the editor starts with, and what the
  // student is told about its flaws at the set's tier.
  repair?: { prefill: StepResponse; hint: string };
}

// PRD "Repair drills": T1 names the flaw, T2 says how many there are, T3 says
// "one or two".
export function repairHint(item: Item, setTier: number): string {
  const { flaws } = item.extras as RepairExtras;
  if (setTier <= 1) return flaws.length === 1 ? `The flaw: ${flaws[0].hint}.` : `The flaws: ${flaws.map(f => f.hint).join('; ')}.`;
  if (setTier === 2) return flaws.length === 1 ? 'This answer has one flaw.' : 'This answer has two flaws.';
  return 'This answer may have one or two flaws.';
}

export function toPublicItem(item: Item, setTier: number = item.tier): PublicItem {
  return {
    drill_id: item.drill_id,
    level: item.level,
    tier: item.tier,
    prompt: item.prompt,
    exhibit: item.exhibit,
    input: {
      type: item.input.type,
      ...(item.input.max_words !== undefined && { max_words: item.input.max_words }),
      ...(item.input.max_buckets !== undefined && { max_buckets: item.input.max_buckets }),
      ...(item.input.max_select !== undefined && { max_select: item.input.max_select }),
      // Step layout only: type, weight, label, word cap and fixed choices.
      // Which choice is right is never part of a step. A Defend step's
      // follow-up text arrives only once the main answer is in
      // (sets/feedback.ts StepFeedback.followup).
      ...(item.input.steps && { steps: item.input.steps.map(st => ({
        type: st.type, weight: st.weight,
        ...(st.label && { label: st.label }),
        ...(st.max_words && { max_words: st.max_words }),
        ...(st.choices && { choices: st.choices.map(c => ({ id: c.id, text: c.text })) }),
        ...(st.defend && { defend: true }),
      })) }),
    },
    options: item.options.map(o => ({ id: o.id, text: o.text })),
    ...(getDrill(item.drill_id).stage === 'repair' && {
      repair: {
        prefill: item.input.type === 'structured_buckets'
          ? parseFramework((item.extras as RepairExtras).flawed_answer)
          : { type: 'text' as const, value: (item.extras as RepairExtras).flawed_answer },
        hint: repairHint(item, setTier),
      },
    }),
  };
}
