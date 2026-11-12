import { describe, it, expect } from 'vitest';
import { GENERATORS, getGenerator, rebuildItem, generatorsForDrill } from '@/lib/drills/generators/registry';
import { percentChange } from '@/lib/drills/generators/percent-change';
import { getDrill } from '@/lib/drills/config';
import { parseNumericInput, scoreNumeric } from '@/lib/drills/numeric';
import { createRng } from '@/lib/drills/rng';
import { checkGenerator, sigFigs } from './generator-harness';
import type { Item, Tier } from '@/lib/drills/item-schema';
import type { Generator } from '@/lib/drills/generators/types';

// 100 seeds per tier per template in the normal suite (9,600+ items, above
// the D1 gate's 1,000 sampled items). DRILLS_FULL_HARNESS=1 runs 1,000 each.
const SEED_COUNT = process.env.DRILLS_FULL_HARNESS ? 1000 : 100;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => i);

describe('seeded rng', () => {
  it('repeats for a seed and differs across seeds', () => {
    const a = createRng(7), b = createRng(7), c = createRng(8);
    const draw = (r: ReturnType<typeof createRng>) => Array.from({ length: 5 }, () => r.next());
    expect(draw(a)).toEqual(draw(b));
    expect(draw(createRng(7))).not.toEqual(draw(c));
  });

  it('stays in range', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 5);
      expect(n >= 3 && n <= 5).toBe(true);
    }
  });
});

describe('generator registry', () => {
  it('registers only templates for generated or mixed drills', () => {
    for (const g of GENERATORS) expect(['generated', 'mixed']).toContain(getDrill(g.drill_id).item_source);
  });

  it('rebuilds the exact item an attempt saw from template, version, seed and tier', () => {
    const item = percentChange.generate(42, 2);
    expect(rebuildItem(item.generator!, 2)).toEqual(item);
  });

  it('refuses unknown templates and versions', () => {
    expect(() => getGenerator('percent_change', 99)).toThrow(/Unknown generator/);
    expect(generatorsForDrill('QN-3')).toContain(percentChange);
  });

  it('sigFigs counts as the harness expects', () => {
    expect([sigFigs(4000), sigFigs(12.5), sigFigs(440), sigFigs(0.05)]).toEqual([1, 3, 2, 1]);
  });
});

describe.each(GENERATORS.map(g => [`${g.template_id}@${g.template_version}`, g] as const))('%s', (_, generator) => {
  it(`passes the generator rules on ${SEED_COUNT} seeds at every tier`, () => {
    expect(checkGenerator(generator, SEEDS)).toEqual([]);
  }, 120_000);
});

// Matt, 2026-11-11: a template's right answers must vary enough that they
// can't be memorized, and a recurring option must not always be right or
// always be wrong ("About 4 times as high" once was always wrong). Each
// served template, at each tier, over SPREAD_SEEDS seeds: at least
// SPREAD_MIN_DISTINCT different right answers, none in more than
// SPREAD_MAX_TOP of the items; and any option text in at least
// RECURRING_SHARE of the items is right in some and wrong in others. (A
// formula option such as "$30 − $5" recurs less often: it carries the item's
// own numbers, and its shape being wrong is the skill the drill trains.)
const SPREAD_SEEDS = 400;
const SPREAD_MIN_DISTINCT = 10;
const SPREAD_MAX_TOP = 0.2;
const RECURRING_SHARE = 0.1;
const rightAnswer = (item: Item) => [item.options.find(o => o.correct)?.text, item.numeric ? String(item.numeric.answer) : undefined].filter(Boolean).join(' | ');

export function spreadProblems(generator: Generator, tier: Tier, seeds = SPREAD_SEEDS): string[] {
  const items = Array.from({ length: seeds }, (_, s) => generator.generate(s + 1, tier));
  const where = `${generator.template_id}@${generator.template_version} t${tier}`;
  const counts = new Map<string, number>();
  for (const i of items) counts.set(rightAnswer(i), (counts.get(rightAnswer(i)) ?? 0) + 1);
  const problems: string[] = [];
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (counts.size < SPREAD_MIN_DISTINCT) problems.push(`${where}: only ${counts.size} different right answers`);
  if (n / items.length > SPREAD_MAX_TOP) problems.push(`${where}: "${top}" is the right answer in ${Math.round((n / items.length) * 100)}% of items`);
  const options = new Map<string, { right: number; wrong: number }>();
  for (const i of items) for (const o of i.options) {
    const e = options.get(o.text) ?? { right: 0, wrong: 0 };
    e[o.correct ? 'right' : 'wrong']++;
    options.set(o.text, e);
  }
  for (const [text, e] of options) {
    if (e.right + e.wrong < RECURRING_SHARE * items.length) continue;
    if (!e.right) problems.push(`${where}: "${text}" is in ${e.wrong} items and always wrong`);
    if (!e.wrong) problems.push(`${where}: "${text}" is in ${e.right} items and always right`);
  }
  return problems;
}

describe('answer spread (EX-2, EX-3, QN-1, QN-3, QN-4)', () => {
  const served = GENERATORS.filter(g => ['EX-2', 'EX-3', 'QN-1', 'QN-3', 'QN-4'].includes(g.drill_id) && !g.retired);
  it.each(served.map(g => [`${g.template_id}@${g.template_version}`, g] as const))('%s varies its right answers and options', (_, generator) => {
    expect(([1, 2, 3] as const).flatMap(t => spreadProblems(generator, t))).toEqual([]);
  }, 120_000);

  it('serves only current versions; retired ones still rebuild', () => {
    for (const g of GENERATORS.filter(x => x.retired)) {
      expect(generatorsForDrill(g.drill_id)).not.toContain(g);
      expect(getGenerator(g.template_id, g.template_version)).toBe(g);
      expect(GENERATORS.some(x => x.template_id === g.template_id && !x.retired && x.template_version > g.template_version)).toBe(true);
    }
  });
});

describe('percent_change', () => {
  it('writes a readable prompt and a worked explanation', () => {
    const item = percentChange.generate(3, 1);
    expect(item.prompt).toMatch(/^[A-Z][\w ]+ (grew|fell) from \$?[\d,]+ to \$?[\d,]+\. By what percent did (it|they) (increase|decrease)\?$/);
    expect(item.explanation).toMatch(/Divide by the starting value/);
  });

  it('diagnoses the wrong base on its own items', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const item = percentChange.generate(seed, 2);
      const trap = item.numeric!.trap_values[0];
      const typed = parseNumericInput(String(Number(trap.value.toFixed(1))));
      if (!typed.ok) throw new Error('unparseable');
      expect(scoreNumeric(typed, item.numeric!)).toMatchObject({ correct: false, tag: 'M.wrong_base' });
    }
  });

  it('accepts the answer typed as a percent or a decimal', () => {
    const item = percentChange.generate(11, 1);
    const answer = item.numeric!.answer;
    for (const raw of [`${answer}`, `${answer}%`, `${answer / 100}`]) {
      const typed = parseNumericInput(raw);
      if (!typed.ok) throw new Error(raw);
      expect(scoreNumeric(typed, item.numeric!).correct).toBe(true);
    }
  });

  it('spreads items across tiers', () => {
    const answers = (tier: 1 | 2 | 3) => new Set(SEEDS.slice(0, 100).map(s => percentChange.generate(s, tier).numeric!.answer));
    expect(answers(1).size).toBeGreaterThan(2);
    expect([...answers(3)].some(a => !Number.isInteger(a))).toBe(true);
  });
});
