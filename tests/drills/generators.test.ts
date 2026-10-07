import { describe, it, expect } from 'vitest';
import { GENERATORS, getGenerator, rebuildItem, generatorsForDrill } from '@/lib/drills/generators/registry';
import { percentChange } from '@/lib/drills/generators/percent-change';
import { getDrill } from '@/lib/drills/config';
import { parseNumericInput, scoreNumeric } from '@/lib/drills/numeric';
import { createRng } from '@/lib/drills/rng';
import { checkGenerator, sigFigs } from './generator-harness';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i);

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
  it('passes the generator rules on 1,000 seeds at every tier', () => {
    expect(checkGenerator(generator, SEEDS)).toEqual([]);
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
