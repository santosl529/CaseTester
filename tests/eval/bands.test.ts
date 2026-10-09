import { describe, it, expect } from 'vitest';
import { compareRating, BandsFileSchema, BandCellSchema, bandsSummary, bandsRows, type BandCell } from '@/lib/eval/bands';
import type { ScorecardRow } from '@/lib/eval/scorecard';

const cell = (expect_: BandCell['expect'], confidence: 'high' | 'medium' = 'high'): BandCell => ({ expect: expect_, confidence, reason: 'brief says so' });

describe('persona bands', () => {
  it('compares a rating with the allowed set by steps on needs_work < meets_bar < strong', () => {
    expect(compareRating(cell(['strong']), 'strong')).toBe('in_band');
    expect(compareRating(cell(['strong']), 'meets_bar')).toBe('one_off');
    expect(compareRating(cell(['strong']), 'needs_work')).toBe('two_off');
    expect(compareRating(cell(['needs_work', 'meets_bar']), 'strong')).toBe('one_off');
    expect(compareRating(cell('not_assessed'), 'not_assessed')).toBe('in_band');
    expect(compareRating(cell('not_assessed'), 'meets_bar')).toBe('unexpected_rating');
    expect(compareRating(cell(['meets_bar']), 'not_assessed')).toBe('unexpected_not_assessed');
    expect(compareRating(cell(null), 'strong')).toBe('no_expectation');
    expect(compareRating(cell(['strong']), 'excellent')).toBe('invalid_rating');
  });

  it('accepts either a rating or not assessed when a cell allows both (refused stages, follow-up 9 Oct)', () => {
    const both = cell(['needs_work', 'not_assessed'], 'medium');
    expect(compareRating(both, null)).toBe('in_band');
    expect(compareRating(both, 'not_assessed')).toBe('in_band');
    expect(compareRating(both, 'needs_work')).toBe('in_band');
    expect(compareRating(both, 'meets_bar')).toBe('one_off');
    expect(compareRating(both, 'strong')).toBe('two_off');
    expect(compareRating(both, 'excellent')).toBe('invalid_rating');
    expect(compareRating(cell(['not_assessed']), 'meets_bar')).toBe('unexpected_rating');
    expect(compareRating(cell(['not_assessed']), null)).toBe('in_band');
    expect(BandCellSchema.safeParse({ expect: ['needs_work', 'not_assessed'], confidence: 'medium', reason: 'refuses the stage' }).success).toBe(true);
    expect(BandCellSchema.safeParse({ expect: ['needs_work', 'excellent'], confidence: 'medium', reason: 'refuses the stage' }).success).toBe(false);
    expect(BandCellSchema.safeParse({ expect: [], confidence: 'medium', reason: 'refuses the stage' }).success).toBe(false);
  });

  it('validates the bands file: every persona has all 8 dimensions', () => {
    const dims = { structure: cell(['strong']), quantitative: cell(null), dataExhibit: cell(null), judgment: cell(null), creativity: cell(null), communication: cell(null), synthesis: cell(null), pushback: cell(null) };
    expect(BandsFileSchema.safeParse({ version: 'v1', personas: { '2': dims } }).success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pushback: _, ...missing } = dims;
    expect(BandsFileSchema.safeParse({ version: 'v1', personas: { '2': missing } }).success).toBe(false);
  });

  it('summarises agreement by confidence and excludes simulator-broken runs', () => {
    const dims = { structure: cell(['strong']), quantitative: cell(['needs_work'], 'medium'), dataExhibit: cell(null), judgment: cell(null), creativity: cell(null), communication: cell(null), synthesis: cell(null), pushback: cell(null) };
    const bands = BandsFileSchema.parse({ version: 'v1', personas: { '2': dims } });
    const row = (runId: string, structure: string, quantitative: string) => ({ runId, personaId: 2, ratings: { structure, quantitative } } as unknown as ScorecardRow);
    const s = bandsSummary([row('a', 'strong', 'meets_bar'), row('b', 'needs_work', 'needs_work')], bands, new Set(['b']));
    expect(s.high).toEqual({ in_band: 1, one_off: 0, two_off: 0, unexpected_rating: 0, unexpected_not_assessed: 0, invalid_rating: 0, cells: 1 });
    expect(s.medium.one_off).toBe(1);
    expect(s.excludedRuns).toEqual(['b']);
  });

  it('tracks skipped runs: personaId null and missing bands entries', () => {
    const dims = { structure: cell(['strong']), quantitative: cell(null), dataExhibit: cell(null), judgment: cell(null), creativity: cell(null), communication: cell(null), synthesis: cell(null), pushback: cell(null) };
    const bands = BandsFileSchema.parse({ version: 'v1', personas: { '2': dims } });
    const row = (runId: string, personaId: number | null, structure: string) => ({ runId, personaId, ratings: { structure } } as unknown as ScorecardRow);
    const s = bandsSummary([row('a', null, 'strong'), row('b', 99, 'strong')], bands, new Set());
    expect(s.skippedNoPersona).toEqual(['a']);
    expect(s.skippedNoBands).toEqual(['b']);
  });

  it('reads scored runs only and lists the unscored and the reruns it left out', () => {
    const r = (runId: string, scoring: string | null, rerun: number | null) => ({ runId, scoring, rerun } as unknown as ScorecardRow);
    const rows = [r('a', 'scored', 0), r('b', 'failed', 0), r('c', null, null), r('d', 'scored', 1), r('e', 'scored', null)];
    const s = bandsRows(rows, false);
    expect(s.rows.map(x => x.runId)).toEqual(['a', 'e']);
    expect(s.skippedNotScored).toEqual(['b', 'c']);
    expect(s.excludedReruns).toEqual(['d']);
    const all = bandsRows(rows, true);
    expect(all.rows.map(x => x.runId)).toEqual(['a', 'd', 'e']);
    expect(all.excludedReruns).toEqual([]);
  });
});
