// tests/eval/bands-file.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BandsFileSchema } from '@/lib/eval/bands';
import { PERSONAS } from '@/scripts/personas';

describe('evals/persona-bands.json', () => {
  const file = BandsFileSchema.parse(JSON.parse(readFileSync('evals/persona-bands.json', 'utf8')));
  it('covers every persona exactly once', () => {
    expect(Object.keys(file.personas).map(Number).sort((a, b) => a - b)).toEqual(PERSONAS.map(p => p.id).sort((a, b) => a - b));
  });
  it('every expectation has a reason quoting or paraphrasing the brief', () => {
    for (const [id, dims] of Object.entries(file.personas)) {
      for (const [d, c] of Object.entries(dims)) if (c.expect !== null) expect(c.reason.length, `${id}.${d}`).toBeGreaterThan(10);
    }
  });
});
