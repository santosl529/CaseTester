// Checks every generator against the PRD's generator rules
// (docs/prd-drills.md "Generators"): the answer recomputes, options are
// distinct, trap values differ from the answer and each other, the same seed
// rebuilds the same item, and T1 needs no calculator. Shared by every
// template's test; D1's "zero key errors in 1,000 sampled generated items"
// gate runs through here.
import { withinTolerance, roundedForms } from '@/lib/drills/numeric';
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
        // Written independently of the generators' own check
        // (lib/drills/generators/util.ts), so a bug there can't hide here.
        // A student who rounds a trap must not land within the answer's
        // tolerance; a student who rounds the answer must not be told they hit
        // a trap; and no two traps may share a rounded form.
        const tol = item.numeric;
        trap_values.forEach((t, i) => {
          if (roundedForms(t.value).some(r => withinTolerance(r, answer, tol))) {
            problems.push(`${where}: trap ${t.tag}=${t.value} rounds into the answer ${answer}`);
          }
          const answerRoundings = roundedForms(answer).filter(r => !withinTolerance(r, answer, tol));
          if (answerRoundings.some(r => withinTolerance(r, t.value, tol) || roundedForms(t.value).some(q => Math.abs(q - r) < 1e-9 * Math.max(1, Math.abs(r))))) {
            problems.push(`${where}: rounding the answer ${answer} hits trap ${t.tag}=${t.value}`);
          }
          trap_values.slice(i + 1).forEach(u => {
            const shared = roundedForms(t.value).some(a => roundedForms(u.value).some(b => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a))));
            if (shared && t.tag !== u.tag) problems.push(`${where}: traps ${t.tag}=${t.value} and ${u.tag}=${u.value} share a rounded form`);
          });
        });
        // T1 is calculator-free: inputs of at most 2 significant figures and an
        // answer of at most 3 (121, 12.5, 2,400,000).
        if (tier === 1) {
          const hard = [
            ...Object.values(generatorInputs(item)).filter(n => sigFigs(n) > 2),
            ...(sigFigs(answer) > 3 ? [answer] : []),
          ];
          if (hard.length) problems.push(`${where}: T1 needs a calculator for ${hard.join(', ')}`);
        }
      }
    }
  }
  return problems;
}
