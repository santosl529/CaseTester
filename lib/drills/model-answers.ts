// A D2 item's own key turned into a student's answer: the model answer for
// the AI-graded drills, and for QN-5 the first accepted set of cards, the
// middle of each range and their product. Every item should score 100% when
// answered this way (scripts/drills-models.ts checks the AI-graded checks;
// tests/drills/model-answers.test.ts checks everything settled by code).
// Pure.
import type { Item } from './item-schema';
import type { StepResponse } from './sets/scoring';
import { parseFramework } from './content-import';

export const D2_DRILLS = ['PS-3', 'HY-2', 'SY-2', 'CL-3', 'QN-5'];

export function modelAnswerSteps(item: Item): StepResponse[] {
  const model = item.model_answer ?? '';
  if (item.drill_id === 'PS-3') return [parseFramework(model)];
  if (item.drill_id === 'SY-2' || item.drill_id === 'CL-3') return [{ type: 'text', value: model }];
  if (item.drill_id === 'HY-2') {
    const [stage1, stage2] = model.split('\n').map(l => l.replace(/^Stage [12]: /, ''));
    return [{ type: 'text', value: stage1 }, { type: 'choice', option_id: stage2.split(':')[0].toLowerCase() }, { type: 'text', value: stage2 }];
  }
  if (item.drill_id === 'QN-5') {
    const { accepted_sets, ranges } = item.extras as { accepted_sets: string[][]; ranges: Record<string, { low: number; high: number }> };
    const cards = accepted_sets[0];
    const values = Object.fromEntries(cards.map(c => [c, String((ranges[c].low + ranges[c].high) / 2)]));
    const total = cards.reduce((a, c) => a * Number(values[c]), 1);
    return [{ type: 'choices', option_ids: cards }, { type: 'numbers', values }, { type: 'numeric', value: String(total) }, { type: 'choice', option_id: 'reasonable' }];
  }
  throw new Error(`${item.item_id}: no model answer for ${item.drill_id}`);
}
