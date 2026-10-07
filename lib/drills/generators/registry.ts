// Every item generator, by template id and version. Server-only: generators
// produce answer keys.
import 'server-only';
import type { Item, Tier } from '../item-schema';
import type { Generator } from './types';
import { percentChange } from './percent-change';
import { QN3_GENERATORS } from './qn3';
import { QN1_GENERATORS, QN4_GENERATORS } from './formulas';
import { EX2_GENERATORS } from './ex2';
import { EX3_GENERATORS } from './ex3';

export const GENERATORS: readonly Generator[] = [
  percentChange, ...QN3_GENERATORS,
  ...QN1_GENERATORS, ...QN4_GENERATORS,
  ...EX2_GENERATORS, ...EX3_GENERATORS,
];

const byKey = new Map(GENERATORS.map(g => [`${g.template_id}@${g.template_version}`, g]));
if (byKey.size !== GENERATORS.length) throw new Error('Duplicate generator template_id@version');

export function getGenerator(templateId: string, version: number): Generator {
  const generator = byKey.get(`${templateId}@${version}`);
  if (!generator) throw new Error(`Unknown generator ${templateId}@${version}`);
  return generator;
}

export function generatorsForDrill(drillId: string): Generator[] {
  return GENERATORS.filter(g => g.drill_id === drillId);
}

// Rebuilds the exact item an attempt saw, for review and grading.
export function rebuildItem(ref: { template_id: string; template_version: number; seed: number }, tier: Tier): Item {
  return getGenerator(ref.template_id, ref.template_version).generate(ref.seed, tier);
}
