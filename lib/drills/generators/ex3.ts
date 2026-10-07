// EX-3 "Needle in the table" templates (docs/prd-drills.md): a dense table
// and a question that needs one or two cells plus a simple calculation. The
// answer computed from a neighboring cell (wrong row, column or year) is a
// trap tagged M.wrong_data_point; other misses use the shared diagnosis.
import 'server-only';
import type { ChartSpecInput } from '../chart-spec';
import type { NumericKey, Tier } from '../item-schema';
import { defaultTolerance } from '../numeric';
import { createRng, type Rng } from '../rng';
import { generatorInputs, type Generator } from './types';
import { calculatorFree, draw, fmt, generatedItem, keyAmbiguities, possessive, redraw } from './util';

const NAMES = ['North', 'South', 'East', 'West', 'Central', 'Coastal', 'Mountain', 'Lakes', 'Metro', 'Plains', 'Valley', 'Harbor'];
const ROWS: Record<Tier, number> = { 1: 6, 2: 8, 3: 11 };
const GROWTH: Record<Tier, readonly number[]> = { 1: [10, 20, 25, 50], 2: [15, 30, 35, 40, 60], 3: [8, 12.5, 18, 22, 35] };

interface Row { name: string; rev22: number; rev23: number; rev24: number; units23: number; units24: number; stores: number }

const round1 = (n: number) => Math.round(n * 10) / 10;
const PRICES = [20, 25, 40, 50, 80, 100, 120, 150, 200, 250];
const DRIFT = [-10, -5, 0, 5, 10, 15, 20];

// Rows hang together like a real business: revenue moves a believable amount
// year to year, and units follow revenue at a price per unit that drifts a
// little, so a wrong-row or wrong-year answer is plausible, not absurd.
function buildRows(rng: Rng, tier: Tier): Row[] {
  return rng.shuffle(NAMES).slice(0, ROWS[tier]).map(name => {
    const rev22 = draw(rng, tier, [1, 10]);
    const rev23 = round1(rev22 * (1 + rng.pick(DRIFT) / 100));
    const rev24 = round1(rev23 * (1 + rng.pick(GROWTH[tier]) / 100));
    const price23 = rng.pick(PRICES);
    const price24 = price23 * (1 + rng.pick([0, 5, 10]) / 100);
    return {
      name, rev22, rev23, rev24,
      units23: Math.round((rev23 * 1000) / price23),
      units24: Math.round((rev24 * 1000) / price24),
      stores: rng.int(4, 60),
    };
  });
}

// T1 tables have 5 columns; T2 and T3 add the 2022 revenue and store count.
function table(rows: Row[], tier: Tier): ChartSpecInput {
  const wide = tier > 1;
  const columns = ['Region', ...(wide ? ['Revenue 2022 ($M)'] : []), 'Revenue 2023 ($M)', 'Revenue 2024 ($M)', 'Units 2023 (k)', 'Units 2024 (k)', ...(wide ? ['Stores 2024'] : [])];
  return {
    type: 'table', title: 'Regional performance',
    table: {
      columns,
      rows: rows.map(r => [r.name, ...(wide ? [fmt(r.rev22)] : []), fmt(r.rev23), fmt(r.rev24), fmt(r.units23), fmt(r.units24), ...(wide ? [fmt(r.stores)] : [])]),
    },
  };
}

const growth = (from: number, to: number) => ((to - from) / from) * 100;
const exact = (answer: number) => (Number.isInteger(answer) ? defaultTolerance(answer) : { tolerance_type: 'relative' as const, tolerance_value: 0.01 });

function neighbors(rows: Row[], i: number): Row[] {
  return [rows[i - 1], rows[i + 1]].filter((r): r is Row => Boolean(r));
}

export const tableYoy: Generator = {
  template_id: 'ex3_yoy_growth', template_version: 1, drill_id: 'EX-3',
  skills: ['EX.extraction', 'QN.arithmetic'], focus_tags: ['M.wrong_data_point', 'M.wrong_base'],
  generate(seed, tier) {
    const rng = createRng(seed);
    return redraw('ex3_yoy_growth', () => {
      const rows = buildRows(rng, tier);
      const i = rng.int(0, rows.length - 1);
      const r = rows[i];
      // The target row's growth is set exactly so the answer is clean.
      r.rev24 = r.rev23 * (1 + rng.pick(GROWTH[tier]) / 100);
      if (tier < 3 && !Number.isInteger(r.rev24)) return null;
      r.rev24 = Number(r.rev24.toFixed(4));
      const answer = growth(r.rev23, r.rev24);
      if (tier === 1 && !calculatorFree({ rev23: r.rev23, rev24: r.rev24 }, answer)) return null;
      const traps = [
        ...neighbors(rows, i).map(n => growth(n.rev23, n.rev24)),   // wrong row
        growth(r.units23, r.units24),                                // wrong column
        ...(tier > 1 ? [growth(r.rev22, r.rev23)] : []),             // wrong year
      ];
      const numeric: NumericKey = {
        answer, ...exact(answer), percent_format: 'percent_or_decimal',
        trap_values: [
          ...traps.map(value => ({ value, tag: 'M.wrong_data_point' })),
          { value: ((r.rev24 - r.rev23) / r.rev24) * 100, tag: 'M.wrong_base' },
        ],
      };
      if (keyAmbiguities(numeric).length || traps.some(t => Math.abs(t - answer) < 1e-9)) return null;
      return generatedItem({
        templateId: 'ex3_yoy_growth', templateVersion: 1, drillId: 'EX-3', level: 2, tier, seed,
        skills: ['EX.extraction', 'QN.arithmetic'],
        prompt: `By what percent did ${possessive(r.name)} revenue grow from 2023 to 2024?`,
        exhibit: table(rows, tier), numeric,
        explanation: `${possessive(r.name)} revenue went from $${fmt(r.rev23)}M (2023) to $${fmt(r.rev24)}M (2024): (${fmt(r.rev24)} − ${fmt(r.rev23)}) ÷ ${fmt(r.rev23)} = ${fmt(Number(answer.toFixed(2)))}%.`,
        inputs: { rev23: r.rev23, rev24: r.rev24 },
      });
    });
  },
  recompute(item) {
    const { rev23, rev24 } = generatorInputs(item);
    return growth(rev23, rev24);
  },
};

export const tablePerUnit: Generator = {
  template_id: 'ex3_revenue_per_unit', template_version: 1, drill_id: 'EX-3',
  skills: ['EX.extraction', 'QN.arithmetic'], focus_tags: ['M.wrong_data_point', 'M.zeros_error'],
  generate(seed, tier) {
    const rng = createRng(seed);
    return redraw('ex3_revenue_per_unit', () => {
      const rows = buildRows(rng, tier);
      const i = rng.int(0, rows.length - 1);
      const r = rows[i];
      // Revenue is in $M and units in thousands: $ per unit = revenue ÷ units × 1,000.
      const perUnit = (x: Row, year: 23 | 24) => ((year === 23 ? x.rev23 : x.rev24) / (year === 23 ? x.units23 : x.units24)) * 1000;
      // The target row's units are set from a whole price so the answer is clean.
      r.units24 = (r.rev24 * 1000) / rng.pick(PRICES);
      if (!Number.isInteger(r.units24)) return null;
      const answer = perUnit(r, 24);
      if (tier < 3 && !Number.isInteger(answer)) return null;
      if (tier === 1 && !calculatorFree({ rev24: r.rev24, units24: r.units24 }, answer)) return null;
      const traps = [...neighbors(rows, i).map(n => perUnit(n, 24)), perUnit(r, 23)];
      const numeric: NumericKey = {
        answer, ...exact(answer), percent_format: 'none',
        trap_values: traps.map(value => ({ value, tag: 'M.wrong_data_point' })),
      };
      if (keyAmbiguities(numeric).length || traps.some(t => Math.abs(t - answer) / answer < 0.02)) return null;
      return generatedItem({
        templateId: 'ex3_revenue_per_unit', templateVersion: 1, drillId: 'EX-3', level: 2, tier, seed,
        skills: ['EX.extraction', 'QN.arithmetic'],
        prompt: `What was ${possessive(r.name)} average revenue per unit in 2024, in dollars?`,
        exhibit: table(rows, tier), numeric,
        explanation: `$${fmt(r.rev24)}M ÷ ${fmt(r.units24)} thousand units = $${fmt(Number(answer.toFixed(2)))} per unit. Mind the units: millions over thousands leaves a factor of 1,000.`,
        inputs: { rev24: r.rev24, units24: r.units24 },
      });
    });
  },
  recompute(item) {
    const { rev24, units24 } = generatorInputs(item);
    return (rev24 / units24) * 1000;
  },
};

export const EX3_GENERATORS: Generator[] = [tableYoy, tablePerUnit];
