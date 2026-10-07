// Item generators (docs/prd-drills.md "Generators"): one module per template,
// each taking a seed and a tier and returning a complete item with its answer
// key and trap values. Generated items are never stored; an attempt keeps
// template_id + template_version + seed and the set's tier, and the generator
// rebuilds the exact item from them.
import type { Item, Tier } from '../item-schema';

export interface Generator {
  template_id: string;
  // Bump on any change that alters the items a seed produces, and keep the
  // old version registered so stored attempts still rebuild.
  template_version: number;
  drill_id: string;
  skills: string[];
  // Mistake tags a focused set can target with this template (PRD
  // "Prescriptions inside drills").
  focus_tags: string[];
  generate(seed: number, tier: Tier): Item;
  // Recomputes the answer from extras.inputs by a separate path from
  // generate(), so the harness can catch a wrong key.
  recompute(item: Item): number;
}

// The structured inputs every generated item keeps in extras.inputs.
export function generatorInputs(item: Item): Record<string, number> {
  const inputs = item.extras.inputs;
  if (!inputs || typeof inputs !== 'object') throw new Error(`${item.item_id}: missing extras.inputs`);
  return inputs as Record<string, number>;
}

export function generatedItemId(templateId: string, version: number, tier: Tier, seed: number): string {
  return `gen:${templateId}@${version}:t${tier}:${seed}`;
}
