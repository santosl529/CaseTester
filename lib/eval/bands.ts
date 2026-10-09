// Persona bands (spec 2026-10-09 §2.7): the rating each persona's brief
// implies, per dimension, written before the batch. A report is checked
// against them; runs where the simulator broke its brief are excluded.
import { z } from 'zod';
import { DIMENSIONS, type Dimension, type ScorecardRow } from './scorecard';

const Rating = z.enum(['needs_work', 'meets_bar', 'strong']);
export const BandCellSchema = z.object({
  expect: z.union([z.array(Rating).min(1), z.literal('not_assessed'), z.null()]),
  confidence: z.enum(['high', 'medium']),
  reason: z.string(),
});
export type BandCell = z.infer<typeof BandCellSchema>;
const PersonaBands = z.object(Object.fromEntries(DIMENSIONS.map(d => [d, BandCellSchema])) as Record<Dimension, typeof BandCellSchema>).strict();
export const BandsFileSchema = z.object({ version: z.string(), personas: z.record(z.string(), PersonaBands) });
export type BandsFile = z.infer<typeof BandsFileSchema>;

const ORDER: Record<string, number> = { needs_work: 0, meets_bar: 1, strong: 2 };
export type Comparison = 'in_band' | 'one_off' | 'two_off' | 'unexpected_rating' | 'unexpected_not_assessed' | 'no_expectation' | 'invalid_rating';

export function compareRating(cell: BandCell, rating: string | null): Comparison {
  if (cell.expect === null) return 'no_expectation';
  const notAssessed = rating === null || rating === 'not_assessed';
  if (cell.expect === 'not_assessed') return notAssessed ? 'in_band' : 'unexpected_rating';
  if (notAssessed) return 'unexpected_not_assessed';
  if (!(rating! in ORDER)) return 'invalid_rating';
  const steps = Math.min(...cell.expect.map(e => Math.abs(ORDER[e] - ORDER[rating!])));
  return steps === 0 ? 'in_band' : steps === 1 ? 'one_off' : 'two_off';
}

type Tally = { in_band: number; one_off: number; two_off: number; unexpected_rating: number; unexpected_not_assessed: number; invalid_rating: number; cells: number };
const empty = (): Tally => ({ in_band: 0, one_off: 0, two_off: 0, unexpected_rating: 0, unexpected_not_assessed: 0, invalid_rating: 0, cells: 0 });

export function bandsSummary(rows: ScorecardRow[], bands: BandsFile, excludedRuns: Set<string>) {
  const high = empty(), medium = empty();
  const misses: { runId: string; personaId: number; dimension: Dimension; expected: BandCell['expect']; rating: string | null; result: Comparison; confidence: string }[] = [];
  const skippedNoPersona: string[] = [];
  const skippedNoBands: string[] = [];
  for (const r of rows) {
    if (excludedRuns.has(r.runId)) continue;
    if (r.personaId === null) { skippedNoPersona.push(r.runId); continue; }
    const pb = bands.personas[String(r.personaId)];
    if (!pb) { skippedNoBands.push(r.runId); continue; }
    for (const d of DIMENSIONS) {
      const c = pb[d]; const res = compareRating(c, r.ratings[d]);
      if (res === 'no_expectation') continue;
      const t = c.confidence === 'high' ? high : medium;
      t[res] += 1; t.cells += 1;
      if (res !== 'in_band') misses.push({ runId: r.runId, personaId: r.personaId, dimension: d, expected: c.expect, rating: r.ratings[d], result: res, confidence: c.confidence });
    }
  }
  return { high, medium, misses, excludedRuns: [...excludedRuns], skippedNoPersona, skippedNoBands };
}
