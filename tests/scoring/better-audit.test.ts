import { describe, it, expect } from 'vitest';
import { auditBetterFigures } from '@/lib/scoring/better-audit';
import { getCaseById } from '@/lib/cases/loader';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';

const dim = (betterResponses: string[]): DimensionFeedback => ({
  rating: 'meets_bar', wentWell: [], needsWork: [],
  missedOpportunities: betterResponses.map(b => ({ moment: 'm', betterResponse: b })),
});
const rubricWith = (b: string): RubricScores => ({
  ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim(k === 'quantitative' ? [b] : [])])),
  overallRating: 'meets_bar', topFix: 'x',
} as RubricScores);
const figures = (b: string) => auditBetterFigures(rubricWith(b), getCaseById('prof-002')).map(f => f.figure);

// Lorenzo, 19 Oct (§15 m; batch 32 Larkspur Tyler, Marcus).
describe('auditBetterFigures', () => {
  it('lists a passenger count and a revenue figure the case does not give (Tyler)', () => {
    const f = figures('$10 more per passenger on roughly 3 million passengers is about $30M');
    expect(f).toEqual(expect.arrayContaining(['3 million', '$30M']));
  });
  it('lists nothing for figures the case or one operation gives', () => {
    expect(figures('$10 more on about 840,000 passengers is about $8.4M')).toEqual([]);
    expect(figures('Revenue fell $24M, from $200M to $176M.')).toEqual([]);
  });
  it('a figure two case figures combine to is derived', () => {
    expect(figures('Lakeport lost about $9.6M of revenue.')).toEqual([]); // 26.4 - 16.8
  });
  it('lists a made-up percentage range (Marcus)', () => {
    expect(figures('Fares fell 30-36% on the two routes.')).toEqual(expect.arrayContaining(['36%']));
  });
  it('skips a figure inside an if / assume clause', () => {
    expect(figures('If we assume a 5% price rise, revenue rises about $X.')).toEqual([]);
    expect(figures('Say we cut fares 17%, then volume must rise.')).toEqual([]);
  });
  it('skips years and small counts', () => {
    expect(figures('Since 2024 there are 3 levers: price, mix and cost.')).toEqual([]);
  });
  it('reports the dimension and the answer index', () => {
    const r = auditBetterFigures(rubricWith('We would win 61% of share.'), getCaseById('prof-002'));
    expect(r).toEqual([{ dimension: 'quantitative', index: 0, figure: '61%' }]);
  });
});
