// What the student sees after answering (docs/prd-drills.md "Feedback timing"
// and "Set results screen"). Auto-checked items: right away, per step.
// AI-graded items: nothing per item; the checks, quoted evidence, red flags
// and model answer appear on the results screen once the set is graded.
// Built from the item's key, so only ever sent after the item is submitted.
import 'server-only';
import { DRILLS_CONFIG } from '../config';
import { formatEstimate } from '../numeric';
import type { Item } from '../item-schema';
import type { CheckResults } from '../grading/apply';
import { qn5DriverSet } from './qn5';
import { itemSteps, tagFeedback, tagLabel, type ItemResult, type StepResult } from './scoring';

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function formatNumericAnswer(item: Item): string {
  const key = item.numeric!;
  if (item.extras.asks === 'points') return `${fmt(key.answer)} percentage ${key.answer === 1 ? 'point' : 'points'}`;
  return key.percent_format === 'none' ? fmt(key.answer) : `${fmt(key.answer)}%`;
}

export interface StepFeedback {
  type: string;
  correct: boolean;
  your_answer: string | null;
  correct_answer: string;
  feedback: string;
  correct_option_id: string | null;
  // Recorded for AI grading: no verdict yet.
  pending?: boolean;
  // Shown before the next step (HY-2: the new fact for stage 2).
  reveal?: string;
  // QN-5: the driver cards the next steps use.
  drivers?: { id: string; text: string }[];
}

export interface GradedCheck { check_id: string; question: string; pass: boolean; evidence: string; feedback: string }

export interface ItemFeedback {
  done: true;
  correct: boolean;
  score: number;
  skipped: boolean;
  timed_out: boolean;
  steps: StepFeedback[];
  mistakes: { tag: string; label: string }[];
  explanation: string;
  // AI-graded items: true until the set is graded.
  pending?: boolean;
  grading?: {
    checks: GradedCheck[];
    red_flags: { id: string; definition: string; evidence: string }[];
    model_answer: string | null;
    decision?: { chose: string; right: boolean };
    review_flagged: boolean;
  };
}

const cardText = (item: Item, id: string) => item.options.find(o => o.id === id)?.text ?? id;
const choiceText = (item: Item, i: number, id: string) => itemSteps(item)[i].choices?.find(c => c.id === id)?.text ?? id;

export function stepFeedback(item: Item, i: number, step: StepResult | null, previous: StepResult[] = []): StepFeedback {
  const spec = itemSteps(item)[i];
  const type = spec.type;
  const right = step?.score === 1;
  const base = { type, correct: right, correct_option_id: null as string | null };

  if (step?.pending) {
    // HY-2: stage 1 is in; show the new fact for stage 2.
    const reveal = item.drill_id === 'HY-2' && i === 0 ? String(item.extras.new_fact) : undefined;
    return { ...base, correct: false, pending: true, your_answer: null, correct_answer: '', feedback: '', ...(reveal && { reveal }) };
  }

  if (item.drill_id === 'QN-5') {
    const drivers = qn5DriverSet(item, [...previous, ...(step ? [step] : [])].slice(0, Math.max(1, i + 1)));
    if (i === 0) {
      const chosen = (step?.detail?.chosen as string[] | undefined) ?? [];
      return {
        ...base, your_answer: chosen.map(id => cardText(item, id)).join(', ') || null,
        correct_answer: drivers.map(id => cardText(item, id)).join(' × '),
        feedback: right ? 'Right drivers.' : `${step?.tag ? tagFeedback(step.tag) : ''} Use these drivers for the next steps.`.trim(),
        drivers: drivers.map(id => ({ id, text: cardText(item, id) })),
      };
    }
    if (i === 1) {
      const values = (step?.detail?.values ?? {}) as Record<string, number>;
      const ranges = item.extras.ranges as Record<string, { low: number; high: number; unit: string }>;
      const show = (id: string, n: number) => formatEstimate(n, ranges[id]?.unit);
      return {
        ...base,
        your_answer: drivers.map(id => `${cardText(item, id)}: ${values[id] !== undefined ? show(id, values[id]) : '—'}`).join('; '),
        correct_answer: drivers.map(id => `${cardText(item, id)}: ${show(id, ranges[id].low)}–${show(id, ranges[id].high)}`).join('; '),
        feedback: right ? 'All assumptions are believable.' : step?.tag ? tagFeedback(step.tag) : '',
      };
    }
    if (i === 2) {
      const product = step?.detail?.product as number | undefined;
      return {
        ...base, your_answer: step?.response.type === 'numeric' ? step.response.value : null,
        correct_answer: product !== undefined && Number.isFinite(product) ? `${formatEstimate(product)} (your drivers multiplied)` : 'Your drivers multiplied together',
        feedback: right ? 'Correct.' : step?.tag ? tagFeedback(step.tag) : '',
      };
    }
    const rightChoice = step?.detail?.right as string | undefined;
    return {
      ...base, your_answer: step?.response.type === 'choice' ? choiceText(item, i, step.response.option_id) : null,
      correct_answer: rightChoice ? choiceText(item, i, rightChoice) : '',
      feedback: right ? 'Correct.' : step?.tag ? tagFeedback(step.tag) : '',
    };
  }

  if (type === 'single_choice' || type === 'multi_select') {
    const correct = item.options.find(o => o.correct)!;
    const chosen = step?.response.type === 'choice' ? item.options.find(o => o.id === (step.response as { option_id: string }).option_id) : undefined;
    return {
      ...base, your_answer: chosen?.text ?? null, correct_answer: correct.text,
      feedback: chosen ? chosen.feedback : step?.tag ? tagFeedback(step.tag) : '',
      correct_option_id: correct.id,
    };
  }
  const typed = step?.response.type === 'numeric' ? step.response.value : null;
  return {
    ...base, your_answer: typed, correct_answer: item.numeric ? formatNumericAnswer(item) : '',
    feedback: right ? 'Correct.' : step?.tag ? tagFeedback(step.tag) : '',
  };
}

export function itemFeedback(item: Item, result: ItemResult, checkResults: CheckResults | null = null): ItemFeedback {
  const spec = itemSteps(item);
  const feedback: ItemFeedback = {
    done: true, correct: !result.pending && result.score >= 1 - 1e-9, score: result.score,
    skipped: result.skipped, timed_out: result.timed_out,
    // Graded checklist items show their checks instead of per-step verdicts.
    steps: checkResults ? [] : spec.map((_, i) => stepFeedback(item, i, result.steps[i] ?? null, result.steps.slice(0, i))),
    mistakes: result.mistake_tags.filter(t => t !== 'M.skipped').map(tag => ({ tag, label: tagLabel(tag) })),
    explanation: item.explanation,
    ...(result.pending && { pending: true }),
  };
  if (checkResults) {
    const byId = new Map(checkResults.checks.map(c => [c.check_id, c]));
    const choiceStep = spec.findIndex(s => s.type === 'single_choice' && s.choices);
    const d = checkResults.decision;
    feedback.grading = {
      checks: item.checks.map(c => {
        const r = byId.get(c.check_id);
        return { check_id: c.check_id, question: c.question, pass: r?.pass ?? false, evidence: r?.evidence ?? '', feedback: c.feedback };
      }),
      red_flags: checkResults.red_flags.filter(f => f.present).map(f => ({
        id: f.id, definition: item.red_flags.find(x => x.id === f.id)?.definition ?? f.id, evidence: f.evidence,
      })),
      model_answer: item.model_answer,
      ...(d && choiceStep >= 0 && { decision: { chose: choiceText(item, choiceStep, d.chose), right: d.right } }),
      review_flagged: checkResults.qa_flags.length > 0,
    };
  }
  return feedback;
}

export const passBar = (drillId: string) => DRILLS_CONFIG.drills.drills.find(d => d.id === drillId)?.pass_bar ?? DRILLS_CONFIG.rules.pass_bar;
