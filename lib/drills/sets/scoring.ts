// Scores one submitted item (docs/prd-drills.md "Item scoring rules"). Pure
// code, no AI: single choice, numeric (shared parser and trap diagnosis) and
// multi-step items (QN-4: weighted steps). Timeouts and skips per the PRD.
import { z } from 'zod';
import { getDrill, getMistakeTag, DRILLS_CONFIG } from '../config';
import { scoreQn5Step } from './qn5';
import type { Item } from '../item-schema';
import { parseNumericInput, scoreNumeric } from '../numeric';

export const StepResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), option_id: z.string().min(1) }),
  z.object({ type: z.literal('choices'), option_ids: z.array(z.string().min(1)).max(12) }),
  z.object({ type: z.literal('numeric'), value: z.string().max(64) }),
  z.object({ type: z.literal('numbers'), values: z.record(z.string(), z.string().max(64)) }),
  z.object({ type: z.literal('text'), value: z.string().max(2000) }),
  z.object({
    type: z.literal('buckets'),
    buckets: z.array(z.object({ title: z.string().max(200), points: z.array(z.string().max(200)).max(6) })).max(8),
  }),
  z.object({ type: z.literal('empty') }),
]);
export type StepResponse = z.infer<typeof StepResponseSchema>;

export class ScoringError extends Error {
  constructor(public code: 'unparseable_number' | 'empty_answer' | 'unknown_option' | 'unsupported_input' | 'over_word_limit' | 'invalid_answer', message: string) {
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
  // Recorded now, scored when the set is AI-graded (checklist drills).
  pending?: boolean;
  // What later steps need from this one (QN-5: the driver set in use, the
  // student's own numbers).
  detail?: Record<string, unknown>;
}

export interface ItemResult {
  score: number;
  steps: StepResult[];
  mistake_tags: string[];
  skipped: boolean;
  timed_out: boolean;
  // True until AI grading finishes; score is 0 until then.
  pending?: boolean;
  // AI-graded items: how each check counts toward each skill.
  contributions?: { skills: string[]; score: number; weight: number }[];
}

export type ItemStep = NonNullable<Item['input']['steps']>[number];

export function itemSteps(item: Item): ItemStep[] {
  return item.input.steps ?? [{ type: item.input.type, weight: 1, max_words: item.input.max_words }];
}

export const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;

// What a student's written answer says, as one string: the text, or the
// framework one bucket per line. Quotes the grader cites must come from this.
export function answerText(response: StepResponse): string {
  if (response.type === 'text') return response.value.trim();
  if (response.type === 'buckets') {
    return response.buckets.map(b => `${b.title.trim()}: ${b.points.map(p => p.trim()).filter(Boolean).join('; ')}`).join('\n');
  }
  return '';
}

// Checks a written answer against the drill's limits (PRD: word caps, PS-3's
// bucket and sub-point limits). The item screen enforces these as the student
// types; this catches pastes and other clients.
function validateWritten(item: Item, step: ItemStep, response: StepResponse) {
  if (response.type === 'text') {
    const cap = step.max_words;
    if (cap && wordCount(response.value) > cap) throw new ScoringError('over_word_limit', `Keep it to ${cap} words`);
    return;
  }
  if (response.type === 'buckets') {
    const buckets = response.buckets.filter(b => b.title.trim() || b.points.some(p => p.trim()));
    const maxBuckets = item.input.max_buckets ?? 5;
    if (buckets.length > maxBuckets) throw new ScoringError('invalid_answer', `Use at most ${maxBuckets} buckets`);
    if (buckets.some(b => b.points.filter(p => p.trim()).length > 4)) throw new ScoringError('invalid_answer', 'Use at most 4 sub-points per bucket');
    if (buckets.some(b => b.points.some(p => wordCount(p) > 15))) throw new ScoringError('over_word_limit', 'Keep each sub-point to 15 words');
    const cap = item.input.max_words;
    if (cap && wordCount(answerText(response)) > cap) throw new ScoringError('over_word_limit', `Keep the framework to ${cap} words`);
    return;
  }
  throw new ScoringError('unsupported_input', `This step takes a written answer`);
}

function stepSkills(item: Item, i: number): string[] {
  const perStep = item.extras.step_skills as string[][] | undefined;
  return perStep?.[i] ?? item.skills;
}

// Scores one step. Throws ScoringError for input the client should never
// send (the item screen blocks an unparseable number until time runs out).
// `previous` holds the item's earlier steps (QN-5 builds on them).
export function scoreStep(item: Item, i: number, response: StepResponse, timedOut: boolean, previous: StepResult[] = []): StepResult {
  const step = itemSteps(item)[i];
  const { type, weight } = step;
  const base = { type, weight, skills: stepSkills(item, i), response };
  const aiGraded = getDrill(item.drill_id).scoring !== 'auto';
  if (response.type === 'empty') {
    if (!timedOut) throw new ScoringError('empty_answer', 'An answer is required unless time ran out');
    if (item.drill_id === 'QN-5') return scoreQn5Step(item, i, response, previous, base);
    return { ...base, score: 0, tag: 'M.timeout', ...(aiGraded && { pending: true }) };
  }
  // Checklist drills: record the answer now; the set's AI grading scores it.
  if (aiGraded) {
    if (step.choices) {
      if (response.type !== 'choice' || !step.choices.some(c => c.id === response.option_id)) {
        throw new ScoringError('unknown_option', 'Pick one of the choices');
      }
    } else {
      validateWritten(item, step, response);
      if (!answerText(response)) {
        if (!timedOut) throw new ScoringError('empty_answer', 'Write an answer first');
        return { ...base, score: 0, tag: 'M.timeout', pending: true };
      }
    }
    return { ...base, score: 0, tag: null, pending: true };
  }
  if (item.drill_id === 'QN-5') return scoreQn5Step(item, i, response, previous, base);
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
  if (opts.steps.some(s => s.pending)) {
    return { score: 0, steps: opts.steps, mistake_tags: [], skipped: false, timed_out: opts.timedOut, pending: true };
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
  'M.missing_driver': 'Your estimate leaves out a driver it needs.',
  'M.double_counting': 'Your drivers count the same thing twice, or include one that does not belong.',
  'M.unreasonable_assumption': 'At least one assumption is outside a believable range.',
  'M.implausible_accepted': 'Your total is far outside a believable range, so it should not pass the sanity check.',
  'M.plausible_rejected': 'Your total is believable, so the sanity check should pass it.',
};

export function tagFeedback(tag: string): string {
  return DIAGNOSIS_FEEDBACK[tag] ?? '';
}

export function tagLabel(tag: string): string {
  return getMistakeTag(tag)?.label ?? DRILLS_CONFIG.taxonomy.system_tags.find(t => t.id === tag)?.label ?? tag;
}
