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
  it('refused-stage cells accept a needs_work rating or not assessed (follow-up 9 Oct)', () => {
    const refusals: [string, string[]][] = [
      ['34', ['quantitative', 'dataExhibit', 'creativity', 'synthesis']],
      ['42', ['structure', 'quantitative', 'dataExhibit', 'creativity', 'synthesis']],
      ['40', ['creativity']],
    ];
    for (const [id, dims] of refusals) for (const d of dims) {
      const c = file.personas[id][d as keyof (typeof file.personas)[string]];
      expect(c.expect, `${id}.${d}`).toEqual(['needs_work', 'not_assessed']);
      expect(c.confidence, `${id}.${d}`).toBe('medium');
      expect(c.reason, `${id}.${d}`).toMatch(/refuse[sd]\b.*; rated needs_work or not assessed$/);
    }
  });
  it('every expectation has a reason quoting or paraphrasing the brief', () => {
    for (const [id, dims] of Object.entries(file.personas)) {
      for (const [d, c] of Object.entries(dims)) if (c.expect !== null) expect(c.reason.length, `${id}.${d}`).toBeGreaterThan(10);
    }
  });
  it('no cell expects exactly strong: the strong gate requires every strong element, so meets_bar is in band', () => {
    for (const [id, dims] of Object.entries(file.personas)) {
      for (const [d, c] of Object.entries(dims)) expect(c.expect, `${id}.${d}`).not.toEqual(['strong']);
    }
  });
});
