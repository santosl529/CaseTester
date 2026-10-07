// Checks every generator against the PRD's generator rules
// (docs/prd-drills.md "Generators"): the answer recomputes, options are
// distinct, trap values differ from the answer and each other, the same seed
// rebuilds the same item, and T1 needs no calculator. Shared by every
// template's test; D1's "zero key errors in 1,000 sampled generated items"
// gate runs through here.
import { withinTolerance, TRAP_ROUNDING_SLACK } from '@/lib/drills/numeric';
import { ItemSchema, type Tier } from '@/lib/drills/item-schema';
import { generatorInputs, type Generator } from '@/lib/drills/generators/types';

// Significant figures of a number as written, ignoring trailing zeros: 4,000 → 1, 12.5 → 3.
export function sigFigs(n: number): number {
  return String(Math.abs(n)).replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;
}

export function checkGenerator(generator: Generator, seeds: number[], tiers: Tier[] = [1, 2, 3]): string[] {
  const problems: string[] = [];
  for (const tier of tiers) {
    for (const seed of seeds) {
      const where = `${generator.template_id}@${generator.template_version} t${tier} seed ${seed}`;
      let item;
      try {
        item = generator.generate(seed, tier);
      } catch (e) {
        problems.push(`${where}: generate threw ${(e as Error).message}`);
        continue;
      }
      const reparsed = ItemSchema.safeParse(item);
      if (!reparsed.success) problems.push(`${where}: invalid item ${reparsed.error.message}`);
      if (JSON.stringify(generator.generate(seed, tier)) !== JSON.stringify(item)) problems.push(`${where}: not deterministic`);
      if (item.tier !== tier) problems.push(`${where}: tier ${item.tier}`);
      if (item.drill_id !== generator.drill_id) problems.push(`${where}: drill ${item.drill_id}`);
      if (item.generator?.seed !== seed || item.generator.template_id !== generator.template_id) problems.push(`${where}: wrong generator ref`);

      const texts = item.options.map(o => o.text.trim().toLowerCase());
      if (new Set(texts).size !== texts.length) problems.push(`${where}: duplicate options`);

      if (item.numeric) {
        const { answer, trap_values } = item.numeric;
        const recomputed = generator.recompute(item);
        if (!withinTolerance(recomputed, answer, { tolerance_type: 'relative', tolerance_value: 1e-9 })) {
          problems.push(`${where}: key says ${answer}, recompute says ${recomputed}`);
        }
        // A trap must sit clear of the answer even with the rounding slack
        // traps match with, or a right answer could be called a mistake.
        const clear = (a: number, b: number) =>
          !withinTolerance(a, b, item.numeric!) &&
          !withinTolerance(a, b, { tolerance_type: 'relative', tolerance_value: 2 * TRAP_ROUNDING_SLACK });
        trap_values.forEach((t, i) => {
          if (!clear(t.value, answer)) problems.push(`${where}: trap ${t.tag}=${t.value} collides with answer ${answer}`);
          trap_values.slice(i + 1).forEach(u => {
            if (!clear(t.value, u.value)) problems.push(`${where}: traps ${t.tag} and ${u.tag} collide at ${t.value}`);
          });
        });
        if (tier === 1) {
          const figures = [answer, ...Object.values(generatorInputs(item))];
          const hard = figures.filter(n => !Number.isInteger(n) || sigFigs(n) > 2);
          if (hard.length) problems.push(`${where}: T1 needs a calculator for ${hard.join(', ')}`);
        }
      }
    }
  }
  return problems;
}
