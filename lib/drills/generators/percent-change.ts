// QN-3 template: percent change between two values (docs/prd-drills.md
// "QN-3 Mental math"). The named trap is dividing by the end value instead
// of the start (M.wrong_base). Zeros errors and other misses come from the
// shared diagnosis in lib/drills/numeric.ts.
import 'server-only';
import type { Item, Tier } from '../item-schema';
import { defaultTolerance } from '../numeric';
import { createRng, type Rng } from '../rng';
import { generatorInputs, type Generator } from './types';
import { calculatorFree, fmt, generatedItem, keyAmbiguities, money, pct, redraw } from './util';

const TEMPLATE_ID = 'percent_change';
const TEMPLATE_VERSION = 1;

// Tier number rules (PRD): T1 round numbers, T2 one uneven figure, T3 two
// significant figures with uneven zeros.
const START_MANTISSAS: Record<Tier, readonly number[]> = {
  1: [1, 2, 4, 5, 8],
  2: [12, 15, 24, 25, 32, 36, 45, 64, 75],
  3: [16, 24, 28, 32, 36, 44, 48, 56, 64, 72, 88, 96],
};
// No changes under 7.5%: below that, the wrong-base result rounds to the right
// answer (5% → 4.76%), so the trap can't be told apart from a correct answer.
const PERCENTS: Record<Tier, readonly number[]> = {
  1: [10, 20, 25, 50],
  2: [15, 30, 35, 40, 60, 75],
  3: [7.5, 12.5, 35, 45, 62.5, 120, 150],
};
const SCALES: Record<Tier, readonly number[]> = {
  1: [100, 1_000, 10_000, 100_000],
  2: [10, 100, 1_000, 10_000],
  3: [100, 1_000, 10_000, 100_000],
};

const METRICS = [
  { noun: 'Revenue', money: true, plural: false },
  { noun: 'Operating costs', money: true, plural: true },
  { noun: 'Unit sales', money: false, plural: true },
  { noun: 'Monthly active users', money: false, plural: true },
  { noun: 'Marketing spend', money: true, plural: false },
] as const;

function generate(seed: number, tier: Tier): Item {
  const rng: Rng = createRng(seed);
  return redraw(TEMPLATE_ID, () => {
    const start = rng.pick(START_MANTISSAS[tier]) * rng.pick(SCALES[tier]);
    const percent = rng.pick(PERCENTS[tier]);
    const up = percent > 100 || rng.next() < 0.5;
    const end = start * (1 + (up ? percent : -percent) / 100);
    if (!Number.isInteger(end) || end <= 0) return null;
    if (tier === 1 && !calculatorFree({ start, end }, percent)) return null;

    const numeric = {
      answer: percent,
      ...defaultTolerance(percent),
      percent_format: 'percent_or_decimal' as const,
      trap_values: [{ value: (Math.abs(end - start) / end) * 100, tag: 'M.wrong_base' }],
    };
    if (keyAmbiguities(numeric).length) return null;

    const metric = rng.pick(METRICS);
    const show = (n: number) => (metric.money ? money(n) : fmt(n));
    const pronoun = metric.plural ? 'they' : 'it';
    return generatedItem({
      templateId: TEMPLATE_ID, templateVersion: TEMPLATE_VERSION, drillId: 'QN-3', level: 2, tier, seed,
      skills: ['QN.percentages'],
      prompt: `${metric.noun} ${up ? 'grew' : 'fell'} from ${show(start)} to ${show(end)}. By what percent did ${pronoun} ${up ? 'increase' : 'decrease'}?`,
      numeric,
      explanation:
        `Percent change = (end − start) ÷ start = (${fmt(end)} − ${fmt(start)}) ÷ ${fmt(start)} = ` +
        `${up ? '' : '−'}${pct(percent)}. Divide by the starting value, not the ending one.`,
      inputs: { start, end },
    });
  });
}

function recompute(item: Item): number {
  const { start, end } = generatorInputs(item);
  return Math.abs((end - start) / start) * 100;
}

export const percentChange: Generator = {
  template_id: TEMPLATE_ID,
  template_version: TEMPLATE_VERSION,
  drill_id: 'QN-3',
  skills: ['QN.percentages'],
  focus_tags: ['M.wrong_base', 'M.zeros_error', 'M.arithmetic_error'],
  generate,
  recompute,
};
