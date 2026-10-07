// Shared helpers for item generators: number formatting, tier number pools,
// the redraw loop, and the trap-ambiguity check generators run before
// returning an item (tests/drills/generator-harness.ts checks the same rules
// independently).
import 'server-only';
import { ItemSchema, type Item, type ItemInput, type NumericKey, type Tier } from '../item-schema';
import { roundedForms, withinTolerance } from '../numeric';
import type { Rng } from '../rng';
import { generatedItemId } from './types';

export const sigFigs = (n: number) =>
  String(Math.abs(n)).replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;

// Two decimals at most, then trimmed: 12.5 → "12.5", 2400000 → "2,400,000".
export function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
// Whole dollars as "$2,400"; anything with cents as "$20.50".
export const money = (n: number) => {
  const abs = Math.abs(n);
  const body = Number.isInteger(abs) ? fmt(abs) : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}$${body}`;
};
export const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
export const pct = (n: number) => `${fmt(n)}%`;

// "4.5 million", "120 thousand": T3 writes some figures in words so the
// student has to handle the zeros.
export function inWords(n: number): string {
  for (const [scale, word] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) {
    if (Math.abs(n) >= scale && Number.isInteger((n / scale) * 100)) return `${fmt(n / scale)} ${word}`;
  }
  return fmt(n);
}

// Mantissas per tier (PRD "Generators"): T1 round numbers, T2 one uneven
// figure, T3 two significant figures with uneven zeros.
export const MANTISSAS: Record<Tier, readonly number[]> = {
  1: [1, 2, 4, 5, 8],
  2: [12, 15, 24, 25, 32, 36, 45, 48, 64, 75],
  3: [14, 16, 18, 22, 26, 28, 34, 36, 42, 44, 56, 64, 72, 78, 84, 96],
};

export function draw(rng: Rng, tier: Tier, scales: readonly number[]): number {
  return rng.pick(MANTISSAS[tier]) * rng.pick(scales);
}

// Redraws until build() returns an item, from the same seeded stream, so the
// result stays deterministic for a seed.
export function redraw<T>(label: string, build: (attempt: number) => T | null, limit = 2000): T {
  for (let attempt = 0; attempt < limit; attempt++) {
    const out = build(attempt);
    if (out !== null) return out;
  }
  throw new Error(`${label}: no valid item after ${limit} draws`);
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// Why a numeric key can't tell its traps from its answer, or [] if it can.
export function keyAmbiguities(key: NumericKey): string[] {
  const out: string[] = [];
  const answerRoundings = roundedForms(key.answer).filter(r => !withinTolerance(r, key.answer, key));
  key.trap_values.forEach((t, i) => {
    if (roundedForms(t.value).some(r => withinTolerance(r, key.answer, key))) out.push(`${t.tag} rounds into the answer`);
    if (answerRoundings.some(r => withinTolerance(r, t.value, key) || roundedForms(t.value).some(q => same(q, r)))) {
      out.push(`rounding the answer hits ${t.tag}`);
    }
    key.trap_values.slice(i + 1).forEach(u => {
      if (t.tag !== u.tag && roundedForms(t.value).some(a => roundedForms(u.value).some(b => same(a, b)))) {
        out.push(`${t.tag} and ${u.tag} share a rounded form`);
      }
    });
  });
  return out;
}

// T1 is calculator-free (PRD): inputs of at most 2 significant figures and
// an answer of at most 3.
export function calculatorFree(inputs: Record<string, number>, answer: number): boolean {
  return Object.values(inputs).every(n => sigFigs(n) <= 2) && sigFigs(answer) <= 3;
}

export interface GeneratedFields {
  templateId: string;
  templateVersion: number;
  drillId: string;
  level: 1 | 2;
  tier: Tier;
  seed: number;
  skills: string[];
  prompt: string;
  explanation: string;
  inputs: Record<string, number>;
  input?: ItemInput['input'];
  exhibit?: ItemInput['exhibit'];
  options?: ItemInput['options'];
  numeric?: NumericKey | null;
  extras?: Record<string, unknown>;
}

export function generatedItem(f: GeneratedFields): Item {
  return ItemSchema.parse({
    item_id: generatedItemId(f.templateId, f.templateVersion, f.tier, f.seed),
    version: f.templateVersion,
    drill_id: f.drillId,
    status: 'live',
    level: f.level,
    tier: f.tier,
    skills: f.skills,
    case_type: null,
    prompt: f.prompt,
    exhibit: f.exhibit ?? null,
    input: f.input ?? { type: 'numeric' },
    options: f.options ?? [],
    numeric: f.numeric ?? null,
    checks: [],
    red_flags: [],
    model_answer: null,
    explanation: f.explanation,
    extras: { ...f.extras, inputs: f.inputs },
    authorship: null,
    generator: { template_id: f.templateId, template_version: f.templateVersion, seed: f.seed },
    is_example: false,
    firm_style: null,
  } satisfies ItemInput);
}

// Options a–d in a seeded shuffle.
export function letteredOptions<T extends { text: string }>(rng: Rng, options: T[]): (T & { id: string })[] {
  return rng.shuffle(options).map((o, i) => ({ ...o, id: 'abcdefgh'[i] }));
}

export const distinctTexts = (texts: string[]) => new Set(texts.map(t => t.trim().toLowerCase())).size === texts.length;
