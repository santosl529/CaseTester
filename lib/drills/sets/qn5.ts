// QN-5 Market sizing, scored by code step by step (docs/prd-drills.md):
// structure (pick the driver cards), assumptions (a number per driver, each
// inside the key's range), calculation (within ±2% of the product of the
// student's own numbers) and the sanity check. "Avoiding double penalties":
// if the structure is wrong, the key's driver set is used for the later steps.
import type { Item } from '../item-schema';
import { parseNumericInput, scoreNumeric } from '../numeric';
import { ScoringError, type StepResponse, type StepResult } from './scoring';

interface Qn5Extras {
  accepted_sets: string[][];
  ranges: Record<string, { low: number; high: number; unit: string; source: string }>;
  benchmark: { low: number; high: number; source: string };
}
const extrasOf = (item: Item) => item.extras as unknown as Qn5Extras;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

// The driver cards later steps use: the student's set if it is accepted,
// otherwise the key's first accepted set.
export function qn5DriverSet(item: Item, previous: StepResult[]): string[] {
  return (previous[0]?.detail?.drivers as string[] | undefined) ?? extrasOf(item).accepted_sets[0];
}

export function qn5SanityAnswer(item: Item, total: number): 'reasonable' | 'too_high' | 'too_low' {
  const { low, high } = extrasOf(item).benchmark;
  if (total > high * 3) return 'too_high';
  if (total < low / 3) return 'too_low';
  return 'reasonable';
}

export function scoreQn5Step(
  item: Item, i: number, response: StepResponse, previous: StepResult[],
  base: Omit<StepResult, 'score' | 'tag'>,
): StepResult {
  const x = extrasOf(item);
  const timeout = response.type === 'empty';

  if (i === 0) {
    const chosen = response.type === 'choices' ? response.option_ids : [];
    if (!timeout && response.type !== 'choices') throw new ScoringError('unsupported_input', 'Pick the driver cards');
    for (const id of chosen) if (!item.options.some(o => o.id === id)) throw new ScoringError('unknown_option', `Unknown card ${id}`);
    const accepted = x.accepted_sets.find(set => sameSet(set, chosen));
    // A wrong card picked is tagged as that card is: double counting or a
    // driver that doesn't belong.
    const wrongCard = chosen.map(id => item.options.find(o => o.id === id)!).find(o => !o.correct);
    const tag = accepted ? null
      : wrongCard ? wrongCard.tag ?? 'M.double_counting'
      : timeout ? 'M.timeout' : 'M.missing_driver';
    return { ...base, score: accepted ? 1 : 0, tag, detail: { drivers: accepted ?? x.accepted_sets[0], chosen } };
  }

  const drivers = qn5DriverSet(item, previous);
  if (i === 1) {
    const values = response.type === 'numbers' ? response.values : {};
    if (!timeout && response.type !== 'numbers') throw new ScoringError('unsupported_input', 'Enter a number for each driver');
    const parsed: Record<string, number> = {};
    let inRange = 0;
    for (const id of drivers) {
      const raw = values[id] ?? '';
      const p = raw.trim() ? parseNumericInput(raw) : null;
      if (!p?.ok) {
        if (!timeout && raw.trim()) throw new ScoringError('unparseable_number', `Enter a number for every driver`);
        if (!timeout) throw new ScoringError('empty_answer', 'Enter a number for every driver');
        continue;
      }
      // A share can be typed as 40% or 0.4.
      const value = p.percent ? p.value / 100 : p.value;
      parsed[id] = value;
      const r = x.ranges[id];
      if (r && value >= r.low - 1e-12 && value <= r.high + 1e-12) inRange++;
    }
    const score = drivers.length ? inRange / drivers.length : 0;
    return { ...base, score, tag: score === 1 ? null : timeout && inRange === 0 ? 'M.timeout' : 'M.unreasonable_assumption', detail: { values: parsed } };
  }

  if (i === 2) {
    const values = (previous[1]?.detail?.values ?? {}) as Record<string, number>;
    const product = drivers.every(id => values[id] !== undefined) ? drivers.reduce((p, id) => p * values[id], 1) : NaN;
    if (timeout) return { ...base, score: 0, tag: 'M.timeout', detail: { product } };
    if (response.type !== 'numeric') throw new ScoringError('unsupported_input', 'Enter your estimate');
    const p = parseNumericInput(response.value);
    if (!p.ok) throw new ScoringError('unparseable_number', 'Enter a number');
    const total = p.percent ? p.value / 100 : p.value;
    if (!Number.isFinite(product)) return { ...base, score: 0, tag: 'M.arithmetic_error', detail: { product, total } };
    const verdict = scoreNumeric(p, { answer: product, tolerance_type: 'relative', tolerance_value: 0.02, percent_format: 'none', trap_values: [] });
    return { ...base, score: verdict.correct ? 1 : 0, tag: verdict.correct ? null : verdict.tag, detail: { product, total } };
  }

  // i === 3: the sanity check, judged on the student's own total.
  const total = previous[2]?.detail?.total as number | undefined;
  if (timeout) return { ...base, score: 0, tag: 'M.timeout' };
  if (response.type !== 'choice' || !['reasonable', 'too_high', 'too_low'].includes(response.option_id)) {
    throw new ScoringError('unknown_option', 'Pick one of the choices');
  }
  if (total === undefined) return { ...base, score: 0, tag: 'M.implausible_accepted' };
  const right = qn5SanityAnswer(item, total);
  if (response.option_id === right) return { ...base, score: 1, tag: null, detail: { right } };
  return { ...base, score: 0, tag: right === 'reasonable' ? 'M.plausible_rejected' : 'M.implausible_accepted', detail: { right } };
}
