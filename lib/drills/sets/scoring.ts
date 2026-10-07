// Scores one submitted item (docs/prd-drills.md "Item scoring rules"). Pure
// code, no AI: single choice, numeric (shared parser and trap diagnosis) and
// multi-step items (QN-4: weighted steps). Timeouts and skips per the PRD.
import { z } from 'zod';
import { getMistakeTag, DRILLS_CONFIG } from '../config';
import type { Item } from '../item-schema';
import { parseNumericInput, scoreNumeric } from '../numeric';

export const StepResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), option_id: z.string().min(1) }),
  z.object({ type: z.literal('numeric'), value: z.string().max(64) }),
  z.object({ type: z.literal('empty') }),
]);
export type StepResponse = z.infer<typeof StepResponseSchema>;

export class ScoringError extends Error {
  constructor(public code: 'unparseable_number' | 'empty_answer' | 'unknown_option' | 'unsupported_input', message: string) {
    super(message);
  }
}

export interface StepResult {
  type: string;
  weight: number;
  score: number;
  skills: string[];
  tag: string | null;
  response: StepResponse;
}

export interface ItemResult {
  score: number;
  steps: StepResult[];
  mistake_tags: string[];
  skipped: boolean;
  timed_out: boolean;
}

export function itemSteps(item: Item): { type: string; weight: number }[] {
  return item.input.steps ?? [{ type: item.input.type, weight: 1 }];
}

function stepSkills(item: Item, i: number): string[] {
  const perStep = item.extras.step_skills as string[][] | undefined;
  return perStep?.[i] ?? item.skills;
}

// Scores one step. Throws ScoringError for input the client should never
// send (the item screen blocks an unparseable number until time runs out).
export function scoreStep(item: Item, i: number, response: StepResponse, timedOut: boolean): StepResult {
  const { type, weight } = itemSteps(item)[i];
  const base = { type, weight, skills: stepSkills(item, i), response };
  if (response.type === 'empty') {
    if (!timedOut) throw new ScoringError('empty_answer', 'An answer is required unless time ran out');
    return { ...base, score: 0, tag: 'M.timeout' };
  }
  if (type === 'single_choice') {
    if (response.type !== 'choice') throw new ScoringError('unsupported_input', `Step ${i} takes a choice`);
    const option = item.options.find(o => o.id === response.option_id);
    if (!option) throw new ScoringError('unknown_option', `Unknown option ${response.option_id}`);
    return { ...base, score: option.correct ? 1 : 0, tag: option.correct ? null : option.tag! };
  }
  if (type === 'numeric') {
    if (response.type !== 'numeric' || !item.numeric) throw new ScoringError('unsupported_input', `Step ${i} takes a number`);
    const parsed = parseNumericInput(response.value);
    if (!parsed.ok) {
      if (!timedOut) throw new ScoringError('unparseable_number', 'Enter a number');
      return { ...base, score: 0, tag: 'M.timeout' };
    }
    const verdict = scoreNumeric(parsed, item.numeric);
    return { ...base, score: verdict.correct ? 1 : 0, tag: verdict.correct ? null : verdict.tag };
  }
  throw new ScoringError('unsupported_input', `${type} input is not supported yet`);
}

export function scoreItem(item: Item, opts: { skipped: boolean; timedOut: boolean; steps: StepResult[] }): ItemResult {
  if (opts.skipped) {
    return { score: 0, steps: [], mistake_tags: ['M.skipped'], skipped: true, timed_out: opts.timedOut };
  }
  const score = opts.steps.reduce((sum, s) => sum + s.weight * s.score, 0);
  const tags = [...new Set(opts.steps.map(s => s.tag).filter((t): t is string => t !== null))];
  return { score: Number(score.toFixed(6)), steps: opts.steps, mistake_tags: tags, skipped: false, timed_out: opts.timedOut };
}

// Feedback lines for tags diagnosed by code on numeric answers, where there is
// no authored wrong-option text. Choice items use the option's own feedback.
const DIAGNOSIS_FEEDBACK: Record<string, string> = {
  'M.zeros_error': 'Your answer is off by a power of ten. Recount the zeros.',
  'M.arithmetic_error': 'The setup may be right, but the calculation is off. Check each step.',
  'M.wrong_base': 'You divided by the wrong base. Percent change divides by the starting value.',
  'M.percent_vs_points': 'You mixed up percent change and percentage points.',
  'M.growth_error': 'You added the same growth each year instead of compounding it.',
  'M.missed_units': 'Check the units label: the chart is not in the units the question asks for.',
  'M.dual_axis_misread': 'You read the wrong axis. Match each series to its own axis.',
  'M.missed_footnote': 'The footnote changes the answer. Read it before you add things up.',
  'M.indexed_misread': 'The chart shows an index, not actual values. Apply it to the starting value.',
  'M.period_mismatch': 'The periods don\'t match. Put them on the same basis before comparing.',
  'M.wrong_data_point': 'You used a neighboring cell. Check the row, the column and the year.',
  'M.timeout': 'Time ran out before you answered.',
};

export function tagFeedback(tag: string): string {
  return DIAGNOSIS_FEEDBACK[tag] ?? '';
}

export function tagLabel(tag: string): string {
  return getMistakeTag(tag)?.label ?? DRILLS_CONFIG.taxonomy.system_tags.find(t => t.id === tag)?.label ?? tag;
}
