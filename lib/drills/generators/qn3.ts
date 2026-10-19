// QN-3 mental math templates beyond percent change (docs/prd-drills.md
// "QN-3 Mental math"): percent of, percentage points, compound growth,
// multiplying and dividing with large zeros, and fractions to percents.
// Named traps per template; zeros and other misses fall through to the shared
// diagnosis in lib/drills/numeric.ts.
import 'server-only';
import type { Tier } from '../item-schema';
import { defaultTolerance, type NumericKey } from '../numeric';
import { createRng } from '../rng';
import { generatorInputs, type Generator } from './types';
import { calculatorFree, draw, fmt, generatedItem, inWords, keyAmbiguities, money, pct, redraw, sigFigs } from './util';

const ONE_PERCENT = { tolerance_type: 'relative' as const, tolerance_value: 0.01 };

// ---------------------------------------------------------------- percent of

const PERCENT_OF: Record<Tier, readonly number[]> = {
  1: [10, 20, 25, 50],
  2: [15, 30, 35, 40, 60, 75],
  3: [7.5, 12.5, 17.5, 37.5, 45, 65],
};
// Each context has a largest believable value: a chain has hundreds or
// thousands of stores, not half a million.
const PERCENT_OF_CONTEXTS = [
  { max: 10_000, text: (p: number, x: number) => `The client has ${fmt(x)} stores, and ${pct(p)} of them are franchised. How many stores are franchised?` },
  { max: Infinity, text: (p: number, x: number) => `A market is worth ${money(x)}. The client holds a ${pct(p)} share. What are the client's sales?` },
  { max: Infinity, text: (p: number, x: number) => `What is ${pct(p)} of ${fmt(x)}?` },
];

export const percentOf: Generator = {
  template_id: 'percent_of', template_version: 1, drill_id: 'QN-3',
  skills: ['QN.percentages'], focus_tags: ['M.zeros_error', 'M.arithmetic_error'],
  generate(seed, tier) {
    const rng = createRng(seed);
    return redraw('percent_of', () => {
      const p = rng.pick(PERCENT_OF[tier]);
      const x = draw(rng, tier, [100, 1_000, 10_000, 100_000]);
      const answer = (p * x) / 100;
      if (tier < 3 && !Number.isInteger(answer)) return null;
      if (tier === 1 && !calculatorFree({ p, x }, answer)) return null;
      const context = rng.pick(PERCENT_OF_CONTEXTS.filter(c => x <= c.max));
      return generatedItem({
        templateId: 'percent_of', templateVersion: 1, drillId: 'QN-3', level: 2, tier, seed,
        skills: ['QN.percentages'],
        prompt: context.text(p, x),
        numeric: { answer, ...(Number.isInteger(answer) ? defaultTolerance(answer) : ONE_PERCENT), percent_format: 'none', trap_values: [] },
        explanation: `${pct(p)} of ${fmt(x)} = ${fmt(x)} × ${p} ÷ 100 = ${fmt(answer)}.`,
        inputs: { p, x },
      });
    });
  },
  recompute(item) {
    const { p, x } = generatorInputs(item);
    return (p / 100) * x;
  },
};

// --------------------------------------------------------- percentage points

const SHARE_START: Record<Tier, readonly number[]> = {
  1: [10, 20, 25, 40, 50],
  2: [12, 15, 16, 24, 30, 32, 36, 45],
  3: [12.5, 17.5, 22.5, 27.5, 32.5, 8.5, 14.5],
};
const SHARE_GROWTH: Record<Tier, readonly number[]> = {
  1: [10, 20, 50],
  2: [25, 50, 75],
  3: [20, 40, 60, 80],
};

export const percentagePoints: Generator = {
  template_id: 'percentage_points', template_version: 1, drill_id: 'QN-3',
  skills: ['QN.percentages'], focus_tags: ['M.percent_vs_points', 'M.arithmetic_error'],
  generate(seed, tier) {
    const rng = createRng(seed);
    return redraw('percentage_points', () => {
      const start = rng.pick(SHARE_START[tier]);
      const growth = rng.pick(SHARE_GROWTH[tier]);
      const end = Number((start * (1 + growth / 100)).toFixed(4));
      const points = Number((end - start).toFixed(4));
      if (end >= 100 || (tier < 3 && !Number.isInteger(end))) return null;
      const askPoints = rng.next() < 0.5;
      const answer = askPoints ? points : growth;
      const trap = askPoints ? growth : points;
      // "percent" format: 3 and 3% both mean 3 (points or percent).
      const numeric: NumericKey = {
        answer, ...(Number.isInteger(answer) ? defaultTolerance(answer) : ONE_PERCENT),
        percent_format: 'percent', trap_values: [{ value: trap, tag: 'M.percent_vs_points' }],
      };
      if (tier === 1 && !calculatorFree({ start, end }, answer)) return null;
      if (keyAmbiguities(numeric).length) return null;
      return generatedItem({
        templateId: 'percentage_points', templateVersion: 1, drillId: 'QN-3', level: 2, tier, seed,
        skills: ['QN.percentages'],
        prompt: `The client's market share rose from ${pct(start)} to ${pct(end)}. ` +
          (askPoints ? 'By how many percentage points did it rise?' : 'By what percent did it rise?'),
        numeric,
        explanation: askPoints
          ? `Percentage points are the plain difference: ${fmt(end)} − ${fmt(start)} = ${pointsText(points)}. (The percent change would be ${pct(growth)}.)`
          : `Percent change divides the difference by the start: ${fmt(points)} ÷ ${fmt(start)} = ${pct(growth)}. (The difference itself is ${pointsText(points)}.)`,
        inputs: { start, end },
        extras: { asks: askPoints ? 'points' : 'percent' },
      });
    });
  },
  recompute(item) {
    const { start, end } = generatorInputs(item);
    return item.extras.asks === 'points' ? end - start : ((end - start) / start) * 100;
  },
};

const pointsText = (n: number) => `${fmt(n)} percentage ${n === 1 ? 'point' : 'points'}`;

// ------------------------------------------------------------ compound growth

// Rate and years pairs where compound and simple growth stay clearly apart
// after rounding (10% for 2 years gives 121 vs 120: indistinguishable).
const GROWTH_PAIRS: Record<Tier, readonly (readonly [number, number])[]> = {
  1: [[50, 2], [100, 2], [100, 3], [25, 2]],
  2: [[20, 3], [30, 2], [25, 2], [40, 2], [15, 3]],
  3: [[15, 3], [12, 4], [8, 5], [20, 3], [35, 2]],
};

export const compoundGrowth: Generator = {
  template_id: 'compound_growth', template_version: 1, drill_id: 'QN-3',
  skills: ['QN.growth'], focus_tags: ['M.growth_error', 'M.zeros_error', 'M.arithmetic_error'],
  generate(seed, tier) {
    const rng = createRng(seed);
    return redraw('compound_growth', () => {
      const [rate, years] = rng.pick(GROWTH_PAIRS[tier]);
      const start = draw(rng, tier, tier === 3 ? [10_000, 100_000] : [100, 1_000, 10_000]);
      const answer = Number((start * (1 + rate / 100) ** years).toFixed(6));
      const simple = start * (1 + (rate / 100) * years);
      if (tier === 1 && !calculatorFree({ start, rate }, answer)) return null;
      const numeric: NumericKey = {
        answer, ...ONE_PERCENT, percent_format: 'none',
        trap_values: [{ value: simple, tag: 'M.growth_error' }],
      };
      if (keyAmbiguities(numeric).length) return null;
      return generatedItem({
        templateId: 'compound_growth', templateVersion: 1, drillId: 'QN-3', level: 2, tier, seed,
        skills: ['QN.growth'],
        prompt: `Revenue is ${money(start)} and grows ${pct(rate)} a year. What is revenue after ${years} years?`,
        numeric,
        explanation: `Growth compounds: ${fmt(start)} × ${fmt(1 + rate / 100)}^${years} = ${fmt(answer)}. ` +
          `Adding ${pct(rate)} of the starting value each year gives ${fmt(simple)}, which misses growth on growth.`,
        inputs: { start, rate, years },
      });
    });
  },
  recompute(item) {
    const { start, rate, years } = generatorInputs(item);
    return start * Math.pow(1 + rate / 100, years);
  },
};

// ----------------------------------------------------- big numbers (zeros)

export const zerosMath: Generator = {
  template_id: 'zeros_math', template_version: 1, drill_id: 'QN-3',
  skills: ['QN.magnitude', 'QN.arithmetic'], focus_tags: ['M.zeros_error', 'M.arithmetic_error'],
  generate(seed, tier) {
    const rng = createRng(seed);
    const ones: Record<Tier, readonly number[]> = { 1: [2, 3, 4, 5, 6, 8], 2: [12, 15, 24, 25, 32, 45], 3: [14, 18, 26, 35, 42, 64] };
    return redraw('zeros_math', () => {
      const a = rng.pick(ones[tier]) * rng.pick([1_000, 10_000, 100_000, 1_000_000]);
      const b = rng.pick(tier === 1 ? ones[1] : [2, 3, 4, 5, 6, 8, 12, 15, 25]) * rng.pick([100, 1_000, 10_000]);
      const divide = rng.next() < 0.5;
      // Division problems are built backwards so the quotient is whole.
      const [x, y, answer] = divide ? [a * b, b, a] : [a, b, a * b];
      if (tier === 1 && !calculatorFree({ x, y }, answer)) return null;
      if (sigFigs(x) > 4) return null;
      // T3 writes the bigger figure in words, so the student has to count zeros.
      const show = (n: number) => (tier === 3 && n === Math.max(x, y) ? inWords(n) : fmt(n));
      const prompt = divide
        ? rng.pick([
            `What is ${show(x)} ÷ ${show(y)}?`,
            `The client earned ${money(x)} from ${show(y)} customers. What was revenue per customer, in dollars?`,
          ])
        : rng.pick([
            `What is ${show(x)} × ${show(y)}?`,
            `The client sells ${show(x)} units a year at ${money(y)} each. What is annual revenue, in dollars?`,
          ]);
      return generatedItem({
        templateId: 'zeros_math', templateVersion: 1, drillId: 'QN-3', level: 2, tier, seed,
        skills: ['QN.magnitude', 'QN.arithmetic'],
        prompt,
        numeric: { answer, ...defaultTolerance(answer), percent_format: 'none', trap_values: [] },
        explanation: `${fmt(x)} ${divide ? '÷' : '×'} ${fmt(y)} = ${fmt(answer)}. Work the leading digits first, then count the zeros.`,
        inputs: { x, y },
        extras: { op: divide ? 'divide' : 'multiply' },
      });
    });
  },
  recompute(item) {
    const { x, y } = generatorInputs(item);
    return item.extras.op === 'divide' ? x / y : x * y;
  },
};

// ------------------------------------------------------ fractions to percents

const DENOMINATORS: Record<Tier, readonly number[]> = {
  1: [2, 4, 5, 10],
  2: [8, 20, 25, 40],
  3: [3, 6, 7, 9, 12, 16],
};

export const fractionToPercent: Generator = {
  template_id: 'fraction_to_percent', template_version: 1, drill_id: 'QN-3',
  skills: ['QN.percentages'], focus_tags: ['M.zeros_error', 'M.arithmetic_error'],
  generate(seed, tier) {
    const rng = createRng(seed);
    return redraw('fraction_to_percent', () => {
      const den = rng.pick(DENOMINATORS[tier]);
      const num = rng.int(1, den - 1);
      if (gcd(num, den) !== 1) return null;
      const answer = (num / den) * 100;
      return generatedItem({
        templateId: 'fraction_to_percent', templateVersion: 1, drillId: 'QN-3', level: 2, tier, seed,
        skills: ['QN.percentages'],
        prompt: rng.pick([
          `What is ${num}/${den} as a percent?`,
          `${num} out of every ${den} customers renew. What percent renew?`,
        ]),
        numeric: { answer, ...ONE_PERCENT, percent_format: 'percent_or_decimal', trap_values: [] },
        explanation: `${num} ÷ ${den} = ${fmt(num / den)}, which is ${pct(Number(answer.toFixed(2)))}.`,
        inputs: { num, den },
      });
    });
  },
  recompute(item) {
    const { num, den } = generatorInputs(item);
    return (num / den) * 100;
  },
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export const QN3_GENERATORS: Generator[] = [percentOf, percentagePoints, compoundGrowth, zerosMath, fractionToPercent];
