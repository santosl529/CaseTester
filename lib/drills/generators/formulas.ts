// Formula templates for QN-1 "Setup only" and QN-4 "Consulting math"
// (docs/prd-drills.md). Each formula is a business scenario with one correct
// setup and three common wrong ones, each tagged M.wrong_formula or
// M.missing_term with a one-line reason. QN-1 asks for the setup; QN-4 asks
// for it (40%) and then the number (60%), with the correct setup shown in
// between so step 2 measures calculation only.
import 'server-only';
import type { ItemInput, Tier } from '../item-schema';
import { createRng, type Rng } from '../rng';
import { generatorInputs, type Generator } from './types';
import { calculatorFree, distinctTexts, draw, fmt, generatedItem, letteredOptions, money, pct, redraw } from './util';

type Vals = Record<string, number>;
type Tag = 'M.wrong_formula' | 'M.missing_term';

interface Expr {
  show: (v: Vals) => string;
  calc: (v: Vals) => number;
}

interface Formula {
  id: string;
  target: string;                  // "breakeven volume, in units"
  percent: boolean;                // answer is a percent (stored as 25 for 25%)
  unit: 'money' | 'count' | 'percent' | 'years';
  draw: (rng: Rng, tier: Tier) => Vals | null;
  scenario: (v: Vals) => string;
  words: string;                   // the correct formula in words
  correct: Expr;
  wrong: (Expr & { tag: Tag; why: string })[];
}

const pick = <T,>(rng: Rng, tier: Tier, pools: Record<Tier, readonly T[]>) => rng.pick(pools[tier]);
const sum3 = (v: Vals) => v.d1 + v.d2 + v.d3;
const factors = (v: Vals) => `(${v.d1} + ${v.d2} + ${v.d3})`;
const change = (p: number) => `(1 ${p < 0 ? '−' : '+'} ${pct(Math.abs(p))})`;

// Unit economics shared by the breakeven, profit and contribution formulas.
function unitEconomics(rng: Rng, tier: Tier): Vals | null {
  const c = pick(rng, tier, { 1: [5, 10, 20, 25, 40, 50], 2: [12, 15, 24, 35, 45], 3: [14, 18, 26, 34, 42] });
  const V = pick(rng, tier, { 1: [5, 10, 20, 30], 2: [8, 12, 16, 22], 3: [6.5, 11, 13.5, 17] });
  const q = draw(rng, tier, [1_000, 10_000]);
  return { P: V + c, V, F: c * q, q };
}

const FORMULAS: Formula[] = [
  {
    id: 'breakeven_units', target: 'breakeven volume, in units', percent: false, unit: 'count',
    draw: unitEconomics,
    scenario: v => `A company has fixed costs of ${money(v.F)} a year. It sells each unit for ${money(v.P)}, and each unit costs ${money(v.V)} to make.`,
    words: 'fixed costs ÷ (price − variable cost per unit)',
    correct: { show: v => `${money(v.F)} ÷ (${money(v.P)} − ${money(v.V)})`, calc: v => v.F / (v.P - v.V) },
    wrong: [
      { show: v => `${money(v.F)} ÷ ${money(v.P)}`, calc: v => v.F / v.P, tag: 'M.wrong_formula', why: 'Dividing by price ignores the variable cost of each unit. Breakeven divides by contribution per unit.' },
      { show: v => `${money(v.F)} ÷ ${money(v.V)}`, calc: v => v.F / v.V, tag: 'M.wrong_formula', why: 'Each unit covers fixed costs with its contribution (price − variable cost), not its variable cost.' },
      { show: v => `${money(v.P)} − ${money(v.V)}`, calc: v => v.P - v.V, tag: 'M.missing_term', why: 'That is contribution per unit. It leaves out the fixed costs to be covered.' },
    ],
  },
  {
    id: 'breakeven_revenue', target: 'breakeven revenue, in dollars', percent: false, unit: 'money',
    draw: unitEconomics,
    scenario: v => `A company has fixed costs of ${money(v.F)} a year. It sells each unit for ${money(v.P)}, and each unit costs ${money(v.V)} to make.`,
    words: 'fixed costs × price ÷ (price − variable cost), i.e. breakeven units × price',
    correct: { show: v => `${money(v.F)} × ${money(v.P)} ÷ (${money(v.P)} − ${money(v.V)})`, calc: v => (v.F * v.P) / (v.P - v.V) },
    wrong: [
      { show: v => `${money(v.F)} ÷ (${money(v.P)} − ${money(v.V)})`, calc: v => v.F / (v.P - v.V), tag: 'M.wrong_formula', why: 'That gives breakeven units. Multiply by price to get revenue.' },
      { show: v => `${money(v.F)} ÷ ${money(v.P)}`, calc: v => v.F / v.P, tag: 'M.wrong_formula', why: 'Dividing by price ignores variable costs entirely.' },
      { show: v => `${money(v.F)} × ${money(v.V)} ÷ (${money(v.P)} − ${money(v.V)})`, calc: v => (v.F * v.V) / (v.P - v.V), tag: 'M.wrong_formula', why: 'Uses variable cost where the price belongs.' },
    ],
  },
  {
    id: 'profit', target: 'annual profit', percent: false, unit: 'money',
    draw: (rng, tier) => {
      const u = unitEconomics(rng, tier)!;
      const Q = draw(rng, tier, [1_000, 10_000, 100_000]);
      const F = draw(rng, tier, [10_000, 100_000, 1_000_000]);
      return Q * (u.P - u.V) > F ? { Q, P: u.P, V: u.V, F } : null;
    },
    scenario: v => `The client sells ${fmt(v.Q)} units a year at ${money(v.P)} each. Variable cost is ${money(v.V)} per unit, and fixed costs are ${money(v.F)} a year.`,
    words: 'volume × (price − variable cost) − fixed costs',
    correct: { show: v => `${fmt(v.Q)} × (${money(v.P)} − ${money(v.V)}) − ${money(v.F)}`, calc: v => v.Q * (v.P - v.V) - v.F },
    wrong: [
      { show: v => `${fmt(v.Q)} × (${money(v.P)} − ${money(v.V)})`, calc: v => v.Q * (v.P - v.V), tag: 'M.missing_term', why: 'That is total contribution. Fixed costs still have to come out.' },
      { show: v => `${fmt(v.Q)} × ${money(v.P)} − ${money(v.F)}`, calc: v => v.Q * v.P - v.F, tag: 'M.missing_term', why: 'Leaves out the variable cost of every unit sold.' },
      { show: v => `${fmt(v.Q)} × (${money(v.P)} − ${money(v.V)}) + ${money(v.F)}`, calc: v => v.Q * (v.P - v.V) + v.F, tag: 'M.wrong_formula', why: 'Fixed costs are a cost: subtract them.' },
    ],
  },
  {
    id: 'gross_margin', target: 'gross margin, as a percent', percent: true, unit: 'percent',
    draw: margins,
    scenario: v => `Revenue was ${money(v.R)}. Cost of goods sold was ${money(v.C)}, and operating expenses were ${money(v.O)}.`,
    words: '(revenue − cost of goods sold) ÷ revenue',
    correct: { show: v => `(${money(v.R)} − ${money(v.C)}) ÷ ${money(v.R)}`, calc: v => ((v.R - v.C) / v.R) * 100 },
    wrong: [
      { show: v => `(${money(v.R)} − ${money(v.C)}) ÷ ${money(v.C)}`, calc: v => ((v.R - v.C) / v.C) * 100, tag: 'M.wrong_formula', why: 'Margins use revenue as the base, not cost of goods sold.' },
      { show: v => `${money(v.C)} ÷ ${money(v.R)}`, calc: v => (v.C / v.R) * 100, tag: 'M.wrong_formula', why: 'That is cost of goods sold as a share of revenue. Gross margin is what is left.' },
      { show: v => `(${money(v.R)} − ${money(v.C)} − ${money(v.O)}) ÷ ${money(v.R)}`, calc: v => ((v.R - v.C - v.O) / v.R) * 100, tag: 'M.wrong_formula', why: 'That is operating margin. Gross margin stops at cost of goods sold.' },
    ],
  },
  {
    id: 'operating_margin', target: 'operating margin, as a percent', percent: true, unit: 'percent',
    draw: margins,
    scenario: v => `Revenue was ${money(v.R)}. Cost of goods sold was ${money(v.C)}, and operating expenses were ${money(v.O)}.`,
    words: '(revenue − cost of goods sold − operating expenses) ÷ revenue',
    correct: { show: v => `(${money(v.R)} − ${money(v.C)} − ${money(v.O)}) ÷ ${money(v.R)}`, calc: v => ((v.R - v.C - v.O) / v.R) * 100 },
    wrong: [
      { show: v => `(${money(v.R)} − ${money(v.C)}) ÷ ${money(v.R)}`, calc: v => ((v.R - v.C) / v.R) * 100, tag: 'M.missing_term', why: 'That is gross margin. Operating expenses still come out.' },
      { show: v => `(${money(v.R)} − ${money(v.O)}) ÷ ${money(v.R)}`, calc: v => ((v.R - v.O) / v.R) * 100, tag: 'M.missing_term', why: 'Leaves out cost of goods sold.' },
      { show: v => `(${money(v.R)} − ${money(v.C)} − ${money(v.O)}) ÷ (${money(v.C)} + ${money(v.O)})`, calc: v => ((v.R - v.C - v.O) / (v.C + v.O)) * 100, tag: 'M.wrong_formula', why: 'Margins divide by revenue, not by total costs.' },
    ],
  },
  {
    id: 'contribution', target: 'total annual contribution', percent: false, unit: 'money',
    draw: (rng, tier) => {
      const u = unitEconomics(rng, tier)!;
      return { Q: draw(rng, tier, [1_000, 10_000, 100_000]), P: u.P, V: u.V, F: draw(rng, tier, [10_000, 100_000]) };
    },
    scenario: v => `The client sells ${fmt(v.Q)} units a year at ${money(v.P)} each. Variable cost is ${money(v.V)} per unit, and fixed costs are ${money(v.F)} a year.`,
    words: 'volume × (price − variable cost per unit)',
    correct: { show: v => `${fmt(v.Q)} × (${money(v.P)} − ${money(v.V)})`, calc: v => v.Q * (v.P - v.V) },
    wrong: [
      { show: v => `${fmt(v.Q)} × ${money(v.P)}`, calc: v => v.Q * v.P, tag: 'M.missing_term', why: 'That is revenue. Contribution subtracts variable costs.' },
      { show: v => `${fmt(v.Q)} × (${money(v.P)} − ${money(v.V)}) − ${money(v.F)}`, calc: v => v.Q * (v.P - v.V) - v.F, tag: 'M.wrong_formula', why: 'That is profit. Contribution comes before fixed costs.' },
      { show: v => `${money(v.P)} − ${money(v.V)}`, calc: v => v.P - v.V, tag: 'M.missing_term', why: 'That is contribution per unit. Multiply by volume.' },
    ],
  },
  {
    id: 'payback', target: 'the payback period, in years', percent: false, unit: 'years',
    draw: (rng, tier) => {
      const years = pick(rng, tier, { 1: [2, 4, 5], 2: [3, 6, 8], 3: [2.5, 3.5, 4.5] });
      const net = draw(rng, tier, [10_000, 100_000]);
      const C = draw(rng, tier, [1_000, 10_000]);
      return C < net ? { I: net * years, G: net + C, C, years } : null;
    },
    scenario: v => `A new machine costs ${money(v.I)}. It adds ${money(v.G)} a year in revenue and costs ${money(v.C)} a year to run.`,
    words: 'investment ÷ net annual cash flow (added revenue − running cost)',
    correct: { show: v => `${money(v.I)} ÷ (${money(v.G)} − ${money(v.C)})`, calc: v => v.I / (v.G - v.C) },
    wrong: [
      { show: v => `${money(v.I)} ÷ ${money(v.G)}`, calc: v => v.I / v.G, tag: 'M.missing_term', why: 'Leaves out the running cost. Payback uses net annual cash flow.' },
      { show: v => `(${money(v.G)} − ${money(v.C)}) ÷ ${money(v.I)}`, calc: v => (v.G - v.C) / v.I, tag: 'M.wrong_formula', why: 'Upside down: divide the investment by annual cash flow.' },
      { show: v => `${money(v.I)} ÷ (${money(v.G)} + ${money(v.C)})`, calc: v => v.I / (v.G + v.C), tag: 'M.wrong_formula', why: 'Running costs reduce cash flow, so subtract them.' },
    ],
  },
  {
    id: 'npv', target: "the project's net present value (NPV)", percent: false, unit: 'money',
    draw: (rng, tier) => {
      const [d1, d2, d3] = pick(rng, tier, { 1: [[0.9, 0.8, 0.7]], 2: [[0.91, 0.83, 0.75]], 3: [[0.93, 0.86, 0.8], [0.95, 0.9, 0.86]] });
      const CF = draw(rng, tier, [100_000, 1_000_000]);
      const I = draw(rng, tier, [100_000, 1_000_000]);
      const npv = CF * (d1 + d2 + d3) - I;
      return Math.abs(npv) > 0.05 * I ? { I, CF, d1, d2, d3 } : null;
    },
    scenario: v => `A project costs ${money(v.I)} today and returns ${money(v.CF)} at the end of each of the next 3 years. The discount factors for years 1, 2 and 3 are ${v.d1}, ${v.d2} and ${v.d3}.`,
    words: 'annual cash flow × (sum of the discount factors) − upfront investment',
    correct: { show: v => `${money(v.CF)} × ${factors(v)} − ${money(v.I)}`, calc: v => v.CF * sum3(v) - v.I },
    wrong: [
      { show: v => `${money(v.CF)} × 3 − ${money(v.I)}`, calc: v => v.CF * 3 - v.I, tag: 'M.missing_term', why: 'Ignores discounting. Cash in later years is worth less today.' },
      { show: v => `${money(v.CF)} × ${factors(v)}`, calc: v => v.CF * sum3(v), tag: 'M.missing_term', why: 'Leaves out the upfront investment.' },
      { show: v => `(${money(v.CF)} − ${money(v.I)}) × ${factors(v)}`, calc: v => (v.CF - v.I) * sum3(v), tag: 'M.wrong_formula', why: 'The investment is paid once, today. It is not discounted every year.' },
    ],
  },
  {
    id: 'market_share', target: "the client's market share", percent: true, unit: 'percent',
    draw: (rng, tier) => {
      const s = pick(rng, tier, { 1: [10, 20, 25, 40], 2: [12, 15, 35, 45], 3: [8, 14, 22, 36] });
      const M = draw(rng, tier, [1_000_000, 10_000_000, 100_000_000]);
      const S = (M * s) / 100;
      return Number.isInteger(S) ? { S, M } : null;
    },
    scenario: v => `The market is worth ${money(v.M)} a year, and the client's sales are ${money(v.S)}.`,
    words: "client's sales ÷ total market",
    correct: { show: v => `${money(v.S)} ÷ ${money(v.M)}`, calc: v => (v.S / v.M) * 100 },
    wrong: [
      { show: v => `${money(v.M)} ÷ ${money(v.S)}`, calc: v => (v.M / v.S) * 100, tag: 'M.wrong_formula', why: "Upside down: the client's sales go on top." },
      { show: v => `${money(v.S)} ÷ (${money(v.M)} − ${money(v.S)})`, calc: v => (v.S / (v.M - v.S)) * 100, tag: 'M.wrong_formula', why: "Divides by competitors' sales. Share is out of the whole market." },
      { show: v => `(${money(v.M)} − ${money(v.S)}) ÷ ${money(v.M)}`, calc: v => ((v.M - v.S) / v.M) * 100, tag: 'M.wrong_formula', why: "That is everyone else's share." },
    ],
  },
  {
    id: 'cagr', target: 'the compound annual growth rate (CAGR)', percent: true, unit: 'percent',
    draw: (rng, tier) => {
      const [g, n] = pick(rng, tier, { 1: [[50, 2], [100, 2], [100, 3]], 2: [[10, 2], [20, 2], [10, 3], [20, 3]], 3: [[5, 2], [12, 2], [15, 3], [8, 3]] });
      const S = draw(rng, tier, [100, 1_000, 10_000, 100_000]);
      const E = Math.round(S * (1 + g / 100) ** n);
      return { S, E, n };
    },
    scenario: v => `Revenue grew from ${money(v.S)} to ${money(v.E)} over ${v.n} years.`,
    words: '(end ÷ start)^(1 ÷ years) − 1',
    correct: { show: v => `(${money(v.E)} ÷ ${money(v.S)})^(1/${v.n}) − 1`, calc: v => ((v.E / v.S) ** (1 / v.n) - 1) * 100 },
    wrong: [
      { show: v => `(${money(v.E)} − ${money(v.S)}) ÷ ${money(v.S)} ÷ ${v.n}`, calc: v => ((v.E - v.S) / v.S / v.n) * 100, tag: 'M.wrong_formula', why: 'Averages simple growth. CAGR compounds.' },
      { show: v => `(${money(v.E)} − ${money(v.S)}) ÷ ${money(v.S)}`, calc: v => ((v.E - v.S) / v.S) * 100, tag: 'M.missing_term', why: 'That is total growth. It leaves out the number of years.' },
      { show: v => `(${money(v.E)} ÷ ${money(v.S)})^${v.n} − 1`, calc: v => ((v.E / v.S) ** v.n - 1) * 100, tag: 'M.wrong_formula', why: 'The exponent is 1 ÷ years, not years.' },
    ],
  },
  {
    id: 'price_volume', target: 'the new annual revenue', percent: false, unit: 'money',
    draw: (rng, tier) => {
      const p = pick(rng, tier, { 1: [10, 20], 2: [5, 15, 25], 3: [4, 8, 12] });
      const q = pick(rng, tier, { 1: [-10, -20, 10], 2: [-5, -15, 10], 3: [-6, -3, 9] });
      return { R: draw(rng, tier, [100_000, 1_000_000]), p, q };
    },
    scenario: v => `Revenue is ${money(v.R)} a year. The client raises prices ${pct(v.p)} and expects volume to ${v.q < 0 ? 'fall' : 'rise'} ${pct(Math.abs(v.q))}.`,
    words: 'revenue × (1 + price change) × (1 + volume change)',
    correct: { show: v => `${money(v.R)} × ${change(v.p)} × ${change(v.q)}`, calc: v => v.R * (1 + v.p / 100) * (1 + v.q / 100) },
    wrong: [
      { show: v => `${money(v.R)} × (1 + ${pct(v.p)} ${v.q < 0 ? '−' : '+'} ${pct(Math.abs(v.q))})`, calc: v => v.R * (1 + (v.p + v.q) / 100), tag: 'M.missing_term', why: 'Adding the changes misses the cross effect. Multiply them.' },
      { show: v => `${money(v.R)} × ${change(v.p)}`, calc: v => v.R * (1 + v.p / 100), tag: 'M.missing_term', why: 'Leaves out the volume change.' },
      { show: v => `${money(v.R)} × ${change(v.p)} × ${change(-v.q)}`, calc: v => v.R * (1 + v.p / 100) * (1 - v.q / 100), tag: 'M.wrong_formula', why: `The volume change has the wrong sign.` },
    ],
  },
  {
    id: 'capacity_utilization', target: 'capacity utilization', percent: true, unit: 'percent',
    draw: (rng, tier) => {
      const u = pick(rng, tier, { 1: [50, 75, 80], 2: [60, 65, 85, 90], 3: [62.5, 72, 88] });
      const N = rng.pick([2, 4, 5]);
      const c = draw(rng, tier, [10, 100]);
      const d = pick(rng, tier, { 1: [100, 200, 300], 2: [250, 300, 360], 3: [240, 310, 350] });
      const A = (N * c * d * u) / 100;
      return Number.isInteger(A) ? { N, c, d, A } : null;
    },
    scenario: v => `A plant has ${v.N} production lines. Each line can make ${fmt(v.c)} units a day, and the plant runs ${v.d} days a year. Last year it made ${fmt(v.A)} units.`,
    words: 'actual output ÷ (lines × daily capacity per line × operating days)',
    correct: { show: v => `${fmt(v.A)} ÷ (${v.N} × ${fmt(v.c)} × ${v.d})`, calc: v => (v.A / (v.N * v.c * v.d)) * 100 },
    wrong: [
      { show: v => `${fmt(v.A)} ÷ (${fmt(v.c)} × ${v.d})`, calc: v => (v.A / (v.c * v.d)) * 100, tag: 'M.missing_term', why: 'Counts one line. Capacity covers every line.' },
      { show: v => `${fmt(v.A)} ÷ (${v.N} × ${fmt(v.c)})`, calc: v => (v.A / (v.N * v.c)) * 100, tag: 'M.missing_term', why: 'Leaves out the operating days.' },
      { show: v => `(${v.N} × ${fmt(v.c)} × ${v.d}) ÷ ${fmt(v.A)}`, calc: v => ((v.N * v.c * v.d) / v.A) * 100, tag: 'M.wrong_formula', why: 'Upside down: actual output goes on top.' },
    ],
  },
  {
    id: 'customer_lifetime_value', target: "a customer's lifetime value, as profit (undiscounted)", percent: false, unit: 'money',
    draw: (rng, tier) => ({
      s: draw(rng, tier, [10, 100]),
      m: pick(rng, tier, { 1: [20, 25, 40, 50], 2: [15, 30, 35, 45], 3: [18, 32, 38, 42] }),
      y: pick(rng, tier, { 1: [2, 4, 5], 2: [3, 6, 8], 3: [3, 7, 9] }),
    }),
    scenario: v => `A typical customer spends ${money(v.s)} a year at a ${pct(v.m)} margin and stays for ${v.y} years.`,
    words: 'annual spend × margin × years as a customer',
    correct: { show: v => `${money(v.s)} × ${pct(v.m)} × ${v.y}`, calc: v => (v.s * v.m * v.y) / 100 },
    wrong: [
      { show: v => `${money(v.s)} × ${v.y}`, calc: v => v.s * v.y, tag: 'M.missing_term', why: 'That is lifetime revenue. Apply the margin to get profit.' },
      { show: v => `${money(v.s)} × ${pct(v.m)}`, calc: v => (v.s * v.m) / 100, tag: 'M.missing_term', why: 'That is one year. Multiply by the years a customer stays.' },
      { show: v => `${money(v.s)} × ${pct(v.m)} ÷ ${v.y}`, calc: v => (v.s * v.m) / 100 / v.y, tag: 'M.wrong_formula', why: 'Multiply by the customer lifetime, do not divide.' },
    ],
  },
];

function margins(rng: Rng, tier: Tier): Vals | null {
  const R = draw(rng, tier, [1_000_000, 10_000_000]);
  const gross = pick(rng, tier, { 1: [20, 25, 40, 50], 2: [15, 35, 45, 60], 3: [32, 38, 44, 52] });
  const opex = pick(rng, tier, { 1: [10, 20], 2: [5, 12, 25], 3: [9, 14, 18] });
  const C = (R * (100 - gross)) / 100;
  const O = (R * opex) / 100;
  return opex < gross && Number.isInteger(C) && Number.isInteger(O) ? { R, C, O } : null;
}

// ------------------------------------------------------------- generators

function buildSetup(f: Formula, rng: Rng, v: Vals) {
  const options = letteredOptions(rng, [
    { text: f.correct.show(v), correct: true, feedback: `Right: ${f.words}.` },
    ...f.wrong.map(w => ({ text: w.show(v), correct: false, tag: w.tag, feedback: w.why })),
  ]);
  return distinctTexts(options.map(o => o.text)) ? options : null;
}

function answerOf(f: Formula, v: Vals): number {
  return Number(f.correct.calc(v).toPrecision(12));
}

function setupGenerator(f: Formula): Generator {
  const templateId = `setup_${f.id}`;
  return {
    template_id: templateId, template_version: 1, drill_id: 'QN-1',
    skills: ['QN.setup'], focus_tags: ['M.wrong_formula', 'M.missing_term'],
    generate(seed, tier) {
      const rng = createRng(seed);
      return redraw(templateId, () => {
        const v = f.draw(rng, tier);
        if (!v) return null;
        const options = buildSetup(f, rng, v);
        if (!options) return null;
        const answer = answerOf(f, v);
        return generatedItem({
          templateId, templateVersion: 1, drillId: 'QN-1', level: 1, tier, seed,
          skills: ['QN.setup'],
          prompt: `${f.scenario(v)} Which calculation gives ${f.target}?`,
          input: { type: 'single_choice' },
          options,
          explanation: `${capitalize(f.target)} = ${f.words}: ${f.correct.show(v)} = ${showAnswer(f, answer)}.`,
          inputs: v,
        });
      });
    },
    recompute: item => f.correct.calc(generatorInputs(item)),
  };
}

function calcGenerator(f: Formula): Generator {
  const templateId = `calc_${f.id}`;
  return {
    template_id: templateId, template_version: 1, drill_id: 'QN-4',
    skills: ['QN.setup', 'QN.arithmetic', 'QN.magnitude'],
    focus_tags: ['M.wrong_formula', 'M.missing_term', 'M.zeros_error', 'M.arithmetic_error'],
    generate(seed, tier) {
      const rng = createRng(seed);
      return redraw(templateId, () => {
        const v = f.draw(rng, tier);
        if (!v) return null;
        const answer = answerOf(f, v);
        if (!Number.isFinite(answer) || answer === 0) return null;
        if (tier === 1 && !calculatorFree(v, answer)) return null;
        const options = buildSetup(f, rng, v);
        if (!options) return null;
        const input: ItemInput['input'] = {
          type: 'single_choice',
          steps: [{ type: 'single_choice', weight: 0.4 }, { type: 'numeric', weight: 0.6 }],
        };
        return generatedItem({
          templateId, templateVersion: 1, drillId: 'QN-4', level: 2, tier, seed,
          skills: ['QN.setup', 'QN.arithmetic', 'QN.magnitude'],
          prompt: `${f.scenario(v)} Find ${f.target}.`,
          input,
          options,
          // Rounding is expected in consulting math, so ±1% throughout.
          numeric: {
            answer, tolerance_type: 'relative', tolerance_value: 0.01,
            percent_format: f.percent ? 'percent_or_decimal' : 'none', trap_values: [],
          },
          explanation: `${capitalize(f.target)} = ${f.words}: ${f.correct.show(v)} = ${showAnswer(f, answer)}.`,
          inputs: v,
          // QN-4 step scores map to skills: step 1 trains setup, step 2 calculation.
          extras: { step_skills: [['QN.setup'], ['QN.arithmetic', 'QN.magnitude']] },
        });
      });
    },
    recompute: item => f.correct.calc(generatorInputs(item)),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function showAnswer(f: Formula, answer: number): string {
  const n = round2(answer);
  if (f.unit === 'money') return money(n);
  if (f.unit === 'percent') return pct(n);
  if (f.unit === 'years') return `${fmt(n)} years`;
  return fmt(n);
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const QN1_GENERATORS: Generator[] = FORMULAS.map(setupGenerator);
export const QN4_GENERATORS: Generator[] = FORMULAS.map(calcGenerator);
