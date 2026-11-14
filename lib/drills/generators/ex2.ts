// EX-2 "Exhibit traps" templates (docs/prd-drills.md): one per trap type. Each
// chart carries one planted trap, and only a student who catches it gets the
// answer. The trap is ordinary chart content (a units label, an axis start,
// a footnote); which element is the trap stays in the key.
import 'server-only';
import type { ChartSpecInput } from '../chart-spec';
import type { NumericKey, Tier } from '../item-schema';
import { defaultTolerance } from '../numeric';
import { createRng, type Rng } from '../rng';
import { generatorInputs, type Generator } from './types';
import { calculatorFree, distinctTexts, draw, fmt, generatedItem, keyAmbiguities, letteredOptions, pct, redraw } from './util';

const YEARS = ['2021', '2022', '2023', '2024'];
const REGIONS = ['North', 'South', 'East', 'West'];
const exact = (answer: number) => (Number.isInteger(answer) ? defaultTolerance(answer) : { tolerance_type: 'relative' as const, tolerance_value: 0.01 });

function ex2(
  id: string,
  build: (rng: Rng, tier: Tier, seed: number) => ReturnType<typeof generatedItem> | null,
  recompute: Generator['recompute'],
  focus: string[],
  version: { version: number; retired?: boolean } = { version: 1 },
): Generator {
  return {
    template_id: id, template_version: version.version, ...(version.retired && { retired: true }), drill_id: 'EX-2', skills: ['EX.traps'], focus_tags: focus,
    generate(seed, tier) {
      const rng = createRng(seed);
      return redraw(id, () => build(rng, tier, seed));
    },
    recompute,
  };
}

const base = (id: string, tier: Tier, seed: number, version = 1) => ({
  templateId: id, templateVersion: version, drillId: 'EX-2', level: 1 as const, tier, seed, skills: ['EX.traps'],
});
// Version 1 of a template that version 2 replaced (Matt, 2026-11-11: right
// answers that vary): it still rebuilds old attempts but isn't served.
const RETIRED = { version: 1, retired: true };
const V2 = { version: 2 };

// Units: the chart is in $ thousands, the question asks for $ millions.
export const unitsTrap = ex2('ex2_units', (rng, tier, seed) => {
  const values = REGIONS.map(() => draw(rng, tier, [100, 1_000]));
  const [i, j] = rng.shuffle([0, 1, 2, 3]).slice(0, 2).sort();
  const a = values[i], b = values[j];
  const answer = (a + b) / 1000;
  if (tier === 1 && !calculatorFree({ a, b }, answer)) return null;
  const numeric: NumericKey = { answer, ...exact(answer), percent_format: 'none', trap_values: [{ value: a + b, tag: 'M.missed_units' }] };
  if (keyAmbiguities(numeric).length) return null;
  const exhibit: ChartSpecInput = {
    type: 'bar', title: 'Revenue by region, 2025', units_label: '$ thousands',
    categories: REGIONS, series: [{ name: 'Revenue', values }],
  };
  return generatedItem({
    ...base('ex2_units', tier, seed),
    prompt: `What was the combined revenue of ${REGIONS[i]} and ${REGIONS[j]}, in $ millions?`,
    exhibit, numeric,
    explanation: `The chart is in $ thousands: ${fmt(a)} + ${fmt(b)} = ${fmt(a + b)} thousand, which is $${fmt(answer)} million.`,
    inputs: { a, b },
  });
}, item => { const { a, b } = generatorInputs(item); return (a + b) / 1000; }, ['M.missed_units']);

// Truncated axis: the y-axis starts well above zero, so bar heights
// exaggerate the gap. Values sit on gridlines and value labels are off.
export const truncatedAxisTrapV1 = ex2('ex2_truncated_axis', (rng, tier, seed) => {
  // The axis starts several gridlines up; the bars sit 1 and 4 gridlines
  // above it, so B's bar looks 4 times as tall while the real gap is 25–60%.
  const step = rng.pick(tier === 1 ? [5, 10] : tier === 2 ? [2.5, 5, 20] : [2, 25, 50]);
  const floor = step * rng.pick([4, 6, 8]);
  const A = floor + step, B = floor + step * 4;
  const real = Math.round(((B - A) / A) * 100);
  const wrongBase = Math.round(((B - A) / B) * 100);
  const gap = B - A;
  const shares = [real, wrongBase, gap];
  if (shares.some((x, i) => shares.some((y, j) => i !== j && Math.abs(x - y) < 5))) return null;
  const options = letteredOptions(rng, [
    { text: `About ${real}% higher`, correct: true, feedback: `Right. ${fmt(B)} vs ${fmt(A)} is about ${real}% higher.` },
    { text: 'About 4 times as high', correct: false, tag: 'M.axis_misread', feedback: `That's how tall the bars look. The axis starts at ${fmt(floor)}, not zero, so the bars exaggerate the gap.` },
    { text: `About ${wrongBase}% higher`, correct: false, tag: 'M.wrong_base', feedback: `That divides the gap by the larger value. Divide by the starting value, ${fmt(A)}.` },
    { text: `About ${fmt(gap)}% higher`, correct: false, tag: 'M.arithmetic_error', feedback: `${fmt(gap)} is the gap in $M, not a percent. Divide it by ${fmt(A)}.` },
  ]);
  if (!distinctTexts(options.map(o => o.text))) return null;
  const exhibit: ChartSpecInput = {
    type: 'bar', title: 'Revenue ($M)', categories: ['2024', '2025'],
    series: [{ name: 'Revenue', values: [A, B] }], y_axis: { min: floor, max: B }, show_values: false,
  };
  return generatedItem({
    ...base('ex2_truncated_axis', tier, seed),
    prompt: 'Roughly how much higher was 2025 revenue than 2024 revenue?',
    exhibit, input: { type: 'single_choice' }, options,
    explanation: `Read the values, not the bar heights: ${fmt(A)} to ${fmt(B)} is (${fmt(B)} − ${fmt(A)}) ÷ ${fmt(A)} ≈ ${real}%. The axis starts at ${fmt(floor)}.`,
    inputs: { A, B, floor },
  });
}, item => { const { A, B } = generatorInputs(item); return ((B - A) / A) * 100; }, ['M.axis_misread'], RETIRED);

// Dual axis: revenue bars on the left axis, margin line on the right. Reading
// the line against the left axis gives the wrong number.
export const dualAxisTrapV1 = ex2('ex2_dual_axis', (rng, tier, seed) => {
  const right = tier === 3 ? 20 : 40;
  const marginStep = tier === 1 ? 10 : tier === 2 ? 5 : 2.5;
  const left = rng.pick(tier === 1 ? [200, 400] : [400, 800]);
  const margins = YEARS.map(() => marginStep * rng.int(1, right / marginStep));
  const revenue = YEARS.map(() => (left / 4) * rng.int(1, 4));
  const y = rng.int(0, 3);
  const answer = margins[y];
  const numeric: NumericKey = {
    answer, tolerance_type: 'absolute', tolerance_value: right / 40, percent_format: 'percent',
    trap_values: [
      { value: (answer / right) * left, tag: 'M.dual_axis_misread' },
      { value: revenue[y], tag: 'M.dual_axis_misread' },
    ],
  };
  if (keyAmbiguities(numeric).length) return null;
  const exhibit: ChartSpecInput = {
    type: 'dual_axis', title: 'Revenue and operating margin', categories: YEARS,
    series: [{ name: 'Revenue', values: revenue }, { name: 'Operating margin', values: margins, axis: 'right' }],
    y_axis: { label: 'Revenue ($M)', min: 0, max: left },
    y2_axis: { label: 'Operating margin (%)', min: 0, max: right, format: { suffix: '%' } },
    show_values: false,
  };
  return generatedItem({
    ...base('ex2_dual_axis', tier, seed),
    prompt: `What was the operating margin in ${YEARS[y]}?`,
    exhibit, numeric,
    explanation: `Margin is the line, read against the right axis (0–${right}%): ${pct(answer)} in ${YEARS[y]}. The left axis is revenue.`,
    inputs: { margin: answer, right, left },
  });
}, item => generatorInputs(item).margin, ['M.dual_axis_misread'], RETIRED);

// Footnote: the chart leaves out a channel, and the footnote says how much.
export const footnoteTrap = ex2('ex2_footnote', (rng, tier, seed) => {
  const channels = ['Stores', 'Wholesale', 'Catalog'];
  const values = channels.map(() => draw(rng, tier, [1, 10]));
  const online = draw(rng, tier, [1, 10]);
  const shown = values.reduce((s, v) => s + v, 0);
  const answer = shown + online;
  const inputs = { s1: values[0], s2: values[1], s3: values[2], online };
  if (tier === 1 && !calculatorFree(inputs, answer)) return null;
  const numeric: NumericKey = { answer, ...exact(answer), percent_format: 'none', trap_values: [{ value: shown, tag: 'M.missed_footnote' }] };
  if (keyAmbiguities(numeric).length) return null;
  const exhibit: ChartSpecInput = {
    type: 'bar', title: 'Sales by channel, 2025 ($M)', categories: channels,
    series: [{ name: 'Sales', values }],
    footnotes: [`Excludes online sales of $${fmt(online)}M.`],
  };
  return generatedItem({
    ...base('ex2_footnote', tier, seed),
    prompt: 'What were total 2025 sales across all channels, in $ millions?',
    exhibit, numeric,
    explanation: `The bars add to $${fmt(shown)}M, but the footnote excludes online sales of $${fmt(online)}M: ${fmt(shown)} + ${fmt(online)} = $${fmt(answer)}M.`,
    inputs,
  });
}, item => { const v = generatorInputs(item); return v.s1 + v.s2 + v.s3 + v.online; }, ['M.missed_footnote']);

// Indexed values: the chart shows an index (2021 = 100), not dollars.
export const indexedTrap = ex2('ex2_indexed', (rng, tier, seed) => {
  const step = tier === 1 ? 25 : tier === 2 ? 10 : 5;
  const index = (end: number) => [100, ...[1, 2].map(i => Math.round((100 + ((end - 100) * i) / 3) / step) * step), end];
  const endB = 100 + step * rng.int(2, 8);
  const endA = 100 + step * rng.int(1, 8);
  const startB = draw(rng, tier, [1, 10]);
  if (startB === 100) return null;
  const answer = (startB * endB) / 100;
  if (tier < 3 && !Number.isInteger(answer)) return null;
  if (tier === 1 && !calculatorFree({ startB, endB }, answer)) return null;
  const numeric: NumericKey = {
    answer, ...exact(answer), percent_format: 'none',
    trap_values: [{ value: endB, tag: 'M.indexed_misread' }, { value: endB - 100, tag: 'M.indexed_misread' }],
  };
  if (keyAmbiguities(numeric).length) return null;
  const exhibit: ChartSpecInput = {
    type: 'line', title: 'Revenue index (2021 = 100)', categories: YEARS,
    series: [{ name: 'Company A', values: index(endA) }, { name: 'Company B', values: index(endB) }],
  };
  return generatedItem({
    ...base('ex2_indexed', tier, seed),
    prompt: `Company B's revenue was $${fmt(startB)}M in 2021. Using the chart, what was its revenue in 2024, in $ millions?`,
    exhibit, numeric,
    explanation: `The chart is an index, not dollars. Company B's index went from 100 to ${endB}, so revenue is $${fmt(startB)}M × ${endB} ÷ 100 = $${fmt(answer)}M.`,
    inputs: { startB, endB },
  });
}, item => { const { startB, endB } = generatorInputs(item); return (startB * endB) / 100; }, ['M.indexed_misread']);

// Percent vs percentage points, read off a share chart.
export const pointsTrapV1 = ex2('ex2_points', (rng, tier, seed) => {
  const start = rng.pick(tier === 1 ? [10, 20, 25, 40] : tier === 2 ? [12, 15, 16, 24, 32] : [12.5, 17.5, 22.5, 8.5]);
  const growth = rng.pick(tier === 1 ? [10, 20, 50] : tier === 2 ? [25, 50, 75] : [20, 40, 60]);
  const end = Number((start * (1 + growth / 100)).toFixed(4));
  if (end >= 100 || (tier < 3 && !Number.isInteger(end))) return null;
  const points = Number((end - start).toFixed(4));
  const askPoints = rng.next() < 0.5;
  const answer = askPoints ? points : growth;
  const numeric: NumericKey = {
    answer, ...exact(answer), percent_format: 'percent',
    trap_values: [{ value: askPoints ? growth : points, tag: 'M.percent_vs_points' }],
  };
  if (tier === 1 && !calculatorFree({ start, end }, answer)) return null;
  if (keyAmbiguities(numeric).length) return null;
  const mid1 = Number((start + (end - start) / 3).toFixed(1));
  const mid2 = Number((start + (2 * (end - start)) / 3).toFixed(1));
  const exhibit: ChartSpecInput = {
    type: 'line', title: "Client's market share", categories: YEARS,
    series: [{ name: 'Market share', values: [start, mid1, mid2, end] }],
    y_axis: { format: { suffix: '%', decimals: tier === 3 ? 1 : 0 } },
  };
  return generatedItem({
    ...base('ex2_points', tier, seed),
    prompt: askPoints
      ? 'By how many percentage points did market share change from 2021 to 2024?'
      : 'By what percent did market share grow from 2021 to 2024?',
    exhibit, numeric,
    explanation: askPoints
      ? `Percentage points are the difference: ${fmt(end)} − ${fmt(start)} = ${fmt(points)} points (a ${pct(growth)} increase).`
      : `Percent growth divides by the start: ${fmt(points)} ÷ ${fmt(start)} = ${pct(growth)} (a ${fmt(points)}-point rise).`,
    inputs: { start, end },
    extras: { asks: askPoints ? 'points' : 'percent' },
  });
}, item => {
  const { start, end } = generatorInputs(item);
  return item.extras.asks === 'points' ? end - start : ((end - start) / start) * 100;
}, ['M.percent_vs_points'], RETIRED);

// Mismatched periods: the last bar is half a year.
export const periodTrapV1 = ex2('ex2_period', (rng, tier, seed) => {
  const r24 = draw(rng, tier, [10, 100]);
  const growth = rng.pick(tier === 1 ? [10, 20, 50] : tier === 2 ? [15, 30, 40] : [8, 12, 18]);
  const h1 = (r24 * (1 + growth / 100)) / 2;
  if (tier < 3 && !Number.isInteger(h1)) return null;
  const r23 = draw(rng, tier, [10, 100]);
  const answer = growth;
  if (tier === 1 && !calculatorFree({ r24, h1 }, answer)) return null;
  const numeric: NumericKey = {
    answer, ...exact(answer), percent_format: 'percent',
    trap_values: [{ value: ((h1 - r24) / r24) * 100, tag: 'M.period_mismatch' }],
  };
  if (keyAmbiguities(numeric).length) return null;
  const exhibit: ChartSpecInput = {
    type: 'bar', title: 'Revenue ($M)', categories: ['2023', '2024', 'H1 2025'],
    series: [{ name: 'Revenue', values: [r23, r24, h1] }],
  };
  return generatedItem({
    ...base('ex2_period', tier, seed),
    prompt: 'If the second half of 2025 matches the first half, by what percent will 2025 revenue grow over 2024?',
    exhibit, numeric,
    explanation: `The last bar is half a year. Full-year 2025 is about 2 × ${fmt(h1)} = ${fmt(2 * h1)}, and (${fmt(2 * h1)} − ${fmt(r24)}) ÷ ${fmt(r24)} = ${pct(answer)}.`,
    inputs: { r24, h1 },
  });
}, item => { const { r24, h1 } = generatorInputs(item); return ((2 * h1 - r24) / r24) * 100; }, ['M.period_mismatch'], RETIRED);

// ----------------------------------------------------------- version 2s

// Truncated axis, version 2 (Matt, 2026-11-11): "About 4 times as high" was
// always wrong and the right answer one of three. Now how many times taller
// B's bar looks varies (the bars sit 1–2 and 2–8 gridlines up), and in about
// a third of items the axis starts at zero: the bars are true to scale and
// that reading is right, written as "N times as high" or as "(N − 1) × 100%
// higher". On a truncated axis the same two texts are the misread. So every
// option text can be right or wrong, and a student has to check the axis.
const times = (n: number) => (n === 2 ? 'twice as high' : `${fmt(n)} times as high`);
export const truncatedAxisTrap = ex2('ex2_truncated_axis', (rng, tier, seed) => {
  const step = rng.pick(tier === 1 ? [5, 10] : tier === 2 ? [2.5, 5, 20] : [2, 25, 50]);
  const zero = rng.next() < 1 / 3;
  const low = rng.pick([1, 2]);
  const high = rng.pick(low === 1 ? (zero ? [2, 3, 4, 5, 6] : [3, 4, 5, 6]) : [5, 6, 8]);
  const looks = high / low;
  const floor = zero ? 0 : step * rng.pick([2, 3, 4, 6, 8, 10]);
  const A = floor + step * low, B = floor + step * high;
  const real = Math.round(((B - A) / A) * 100);
  const wrongBase = Math.round(((B - A) / B) * 100);
  const looksHigher = Math.round((looks - 1) * 100);
  let options;
  if (zero) {
    const asTimes = rng.next() < 0.5;
    options = letteredOptions(rng, [
      asTimes
        ? { text: `About ${times(looks)}`, correct: true, feedback: `Right. The axis starts at zero, so the bars are true to scale: ${fmt(B)} is ${fmt(looks)} times ${fmt(A)}.` }
        : { text: `About ${real}% higher`, correct: true, feedback: `Right. The axis starts at zero, so the bars are true to scale: ${fmt(B)} is ${fmt(looks)} times ${fmt(A)}, ${real}% higher.` },
      { text: `About ${Math.round(looks * 100)}% higher`, correct: false, tag: 'M.arithmetic_error', feedback: `${fmt(looks)} times as high is ${real}% higher, not ${Math.round(looks * 100)}%: the first ${fmt(A)} isn't growth.` },
      { text: `About ${wrongBase}% higher`, correct: false, tag: 'M.wrong_base', feedback: `That divides the gap by the larger value. Divide by the starting value, ${fmt(A)}.` },
      { text: `About ${Math.round(real / 2)}% higher`, correct: false, tag: 'M.axis_misread', feedback: `The axis starts at zero here, so the bars don't exaggerate the gap: ${fmt(B)} is ${fmt(looks)} times ${fmt(A)}.` },
    ]);
  } else {
    const asTimes = rng.next() < 0.5;
    options = letteredOptions(rng, [
      { text: `About ${real}% higher`, correct: true, feedback: `Right. ${fmt(B)} vs ${fmt(A)} is about ${real}% higher.` },
      asTimes
        ? { text: `About ${times(looks)}`, correct: false, tag: 'M.axis_misread', feedback: `That's how tall the bars look. The axis starts at ${fmt(floor)}, not zero, so the bars exaggerate the gap.` }
        : { text: `About ${looksHigher}% higher`, correct: false, tag: 'M.axis_misread', feedback: `That's how much taller the bar looks. The axis starts at ${fmt(floor)}, not zero, so the bars exaggerate the gap.` },
      { text: `About ${wrongBase}% higher`, correct: false, tag: 'M.wrong_base', feedback: `That divides the gap by the larger value. Divide by the starting value, ${fmt(A)}.` },
      asTimes
        ? { text: `About ${looksHigher}% higher`, correct: false, tag: 'M.axis_misread', feedback: `That's how much taller the bar looks. The axis starts at ${fmt(floor)}, not zero, so the bars exaggerate the gap.` }
        : { text: `About ${times(looks)}`, correct: false, tag: 'M.axis_misread', feedback: `That's how tall the bars look. The axis starts at ${fmt(floor)}, not zero, so the bars exaggerate the gap.` },
    ]);
  }
  if (!distinctTexts(options.map(o => o.text))) return null;
  // Every percent option at least 5 points from the others, so none is a near-miss of the key.
  const shares = options.map(o => Number(o.text.match(/About ([\d.,]+)% higher/)?.[1]?.replace(/,/g, ''))).filter(Number.isFinite);
  if (shares.some((x, i) => shares.some((y, j) => i !== j && Math.abs(x - y) < 5))) return null;
  const exhibit: ChartSpecInput = {
    type: 'bar', title: 'Revenue ($M)', categories: ['2024', '2025'],
    series: [{ name: 'Revenue', values: [A, B] }], y_axis: { min: floor, max: B }, show_values: false,
  };
  return generatedItem({
    ...base('ex2_truncated_axis', tier, seed, 2),
    prompt: 'Roughly how much higher was 2025 revenue than 2024 revenue?',
    exhibit, input: { type: 'single_choice' }, options,
    explanation: zero
      ? `Check the axis first: it starts at zero, so the bar heights are true. ${fmt(B)} ÷ ${fmt(A)} = ${fmt(looks)}, so 2025 is ${fmt(looks)} times 2024, ${real}% higher.`
      : `Read the values, not the bar heights: ${fmt(A)} to ${fmt(B)} is (${fmt(B)} − ${fmt(A)}) ÷ ${fmt(A)} ≈ ${real}%. The axis starts at ${fmt(floor)}.`,
    inputs: { A, B, floor },
  });
}, item => { const { A, B } = generatorInputs(item); return ((B - A) / A) * 100; }, ['M.axis_misread'], V2);

// Dual axis, version 2: half the items ask for revenue (the bars, on the
// left axis) instead of the margin, and T1 margins sit on half gridlines
// too, so the answer isn't one of four. Reading the other axis is the trap
// either way.
export const dualAxisTrap = ex2('ex2_dual_axis', (rng, tier, seed) => {
  const right = tier === 3 ? 20 : 40;
  const marginStep = tier === 1 ? 5 : tier === 2 ? 5 : 2.5;
  const left = rng.pick(tier === 1 ? [200, 400] : [400, 800]);
  const margins = YEARS.map(() => marginStep * rng.int(1, right / marginStep));
  // T1 bars on gridlines (two significant figures); T2–T3 on half gridlines too.
  const revenue = YEARS.map(() => (tier === 1 ? (left / 4) * rng.int(1, 4) : (left / 8) * rng.int(1, 8)));
  const y = rng.int(0, 3);
  const asksRevenue = rng.next() < 0.5;
  const answer = asksRevenue ? revenue[y] : margins[y];
  const numeric: NumericKey = asksRevenue
    ? {
      answer, tolerance_type: 'absolute', tolerance_value: left / 40, percent_format: 'none',
      trap_values: [
        { value: (answer / left) * right, tag: 'M.dual_axis_misread' },
        { value: margins[y], tag: 'M.dual_axis_misread' },
      ],
    }
    : {
      answer, tolerance_type: 'absolute', tolerance_value: right / 40, percent_format: 'percent',
      trap_values: [
        { value: (answer / right) * left, tag: 'M.dual_axis_misread' },
        { value: revenue[y], tag: 'M.dual_axis_misread' },
      ],
    };
  if (keyAmbiguities(numeric).length) return null;
  const exhibit: ChartSpecInput = {
    type: 'dual_axis', title: 'Revenue and operating margin', categories: YEARS,
    series: [{ name: 'Revenue', values: revenue }, { name: 'Operating margin', values: margins, axis: 'right' }],
    y_axis: { label: 'Revenue ($M)', min: 0, max: left },
    y2_axis: { label: 'Operating margin (%)', min: 0, max: right, format: { suffix: '%' } },
    show_values: false,
  };
  return generatedItem({
    ...base('ex2_dual_axis', tier, seed, 2),
    prompt: asksRevenue ? `What was revenue in ${YEARS[y]}, in $ millions?` : `What was the operating margin in ${YEARS[y]}?`,
    exhibit, numeric,
    explanation: asksRevenue
      ? `Revenue is the bars, read against the left axis (0–${left}): $${fmt(answer)}M in ${YEARS[y]}. The right axis is the margin.`
      : `Margin is the line, read against the right axis (0–${right}%): ${pct(answer)} in ${YEARS[y]}. The left axis is revenue.`,
    inputs: asksRevenue ? { revenue: answer, right, left } : { margin: answer, right, left },
  });
}, item => { const v = generatorInputs(item); return v.revenue ?? v.margin; }, ['M.dual_axis_misread'], V2);

// Percent vs points, version 2: more starting shares and growth rates.
export const pointsTrap = ex2('ex2_points', (rng, tier, seed) => {
  const start = rng.pick(tier === 1 ? [10, 20, 25, 40, 50] : tier === 2 ? [12, 15, 16, 24, 32, 36, 45] : [12.5, 17.5, 22.5, 8.5, 27.5, 32.5]);
  const growth = rng.pick(tier === 1 ? [10, 20, 25, 40, 50, 60, 80, 100] : tier === 2 ? [20, 25, 30, 40, 50, 60, 75, 80] : [15, 20, 30, 40, 45, 60, 70, 80]);
  const end = Number((start * (1 + growth / 100)).toFixed(4));
  if (end >= 100 || (tier < 3 && !Number.isInteger(end))) return null;
  const points = Number((end - start).toFixed(4));
  const askPoints = rng.next() < 0.5;
  const answer = askPoints ? points : growth;
  const numeric: NumericKey = {
    answer, ...exact(answer), percent_format: 'percent',
    trap_values: [{ value: askPoints ? growth : points, tag: 'M.percent_vs_points' }],
  };
  if (tier === 1 && !calculatorFree({ start, end }, answer)) return null;
  if (keyAmbiguities(numeric).length) return null;
  const mid1 = Number((start + (end - start) / 3).toFixed(1));
  const mid2 = Number((start + (2 * (end - start)) / 3).toFixed(1));
  const exhibit: ChartSpecInput = {
    type: 'line', title: "Client's market share", categories: YEARS,
    series: [{ name: 'Market share', values: [start, mid1, mid2, end] }],
    y_axis: { format: { suffix: '%', decimals: tier === 3 ? 1 : 0 } },
  };
  return generatedItem({
    ...base('ex2_points', tier, seed, 2),
    prompt: askPoints
      ? 'By how many percentage points did market share change from 2021 to 2024?'
      : 'By what percent did market share grow from 2021 to 2024?',
    exhibit, numeric,
    explanation: askPoints
      ? `Percentage points are the difference: ${fmt(end)} − ${fmt(start)} = ${fmt(points)} points (a ${pct(growth)} increase).`
      : `Percent growth divides by the start: ${fmt(points)} ÷ ${fmt(start)} = ${pct(growth)} (a ${fmt(points)}-point rise).`,
    inputs: { start, end },
    extras: { asks: askPoints ? 'points' : 'percent' },
  });
}, item => {
  const { start, end } = generatorInputs(item);
  return item.extras.asks === 'points' ? end - start : ((end - start) / start) * 100;
}, ['M.percent_vs_points'], V2);

// Mismatched periods, version 2: ten growth rates per tier, not three.
export const periodTrap = ex2('ex2_period', (rng, tier, seed) => {
  const r24 = draw(rng, tier, [10, 100]);
  const growth = rng.pick(tier === 1 ? [10, 20, 25, 30, 40, 50, 60, 80, 100, 150] : tier === 2 ? [12, 15, 18, 24, 30, 35, 40, 45, 60, 70] : [6, 8, 12, 14, 16, 18, 22, 26, 32, 36]);
  const h1 = (r24 * (1 + growth / 100)) / 2;
  if (tier < 3 && !Number.isInteger(h1)) return null;
  const r23 = draw(rng, tier, [10, 100]);
  const answer = growth;
  if (tier === 1 && !calculatorFree({ r24, h1 }, answer)) return null;
  const numeric: NumericKey = {
    answer, ...exact(answer), percent_format: 'percent',
    trap_values: [{ value: ((h1 - r24) / r24) * 100, tag: 'M.period_mismatch' }],
  };
  if (keyAmbiguities(numeric).length) return null;
  const exhibit: ChartSpecInput = {
    type: 'bar', title: 'Revenue ($M)', categories: ['2023', '2024', 'H1 2025'],
    series: [{ name: 'Revenue', values: [r23, r24, h1] }],
  };
  return generatedItem({
    ...base('ex2_period', tier, seed, 2),
    prompt: 'If the second half of 2025 matches the first half, by what percent will 2025 revenue grow over 2024?',
    exhibit, numeric,
    explanation: `The last bar is half a year. Full-year 2025 is about 2 × ${fmt(h1)} = ${fmt(2 * h1)}, and (${fmt(2 * h1)} − ${fmt(r24)}) ÷ ${fmt(r24)} = ${pct(answer)}.`,
    inputs: { r24, h1 },
  });
}, item => { const { r24, h1 } = generatorInputs(item); return ((2 * h1 - r24) / r24) * 100; }, ['M.period_mismatch'], V2);

export const EX2_GENERATORS: Generator[] = [
  unitsTrap, truncatedAxisTrapV1, truncatedAxisTrap, dualAxisTrapV1, dualAxisTrap, footnoteTrap, indexedTrap, pointsTrapV1, pointsTrap, periodTrapV1, periodTrap,
];
