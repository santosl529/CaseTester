import { describe, it, expect } from 'vitest';
import {
  RUBRIC_DIMENSION_KEYS, ratingLabel, NOT_ASSESSED,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_PROMPT_TEXT,
} from '@/lib/scoring/rubric';

describe('scoring rubric', () => {
  it('defines all 8 dimensions from the consolidated rubric', () => {
    expect(RUBRIC_DIMENSION_KEYS).toHaveLength(8);
    expect(RUBRIC_DIMENSION_KEYS).toEqual([
      'structure', 'quantitative', 'dataExhibit', 'judgment',
      'creativity', 'synthesis', 'communication', 'pushback',
    ]);
  });

  it('has a label and prompt section for every dimension', () => {
    for (const key of RUBRIC_DIMENSION_KEYS) {
      expect(RUBRIC_DIMENSION_LABELS[key]).toBeTruthy();
      expect(RUBRIC_PROMPT_TEXT).toContain(`DIMENSION "${key}"`);
    }
  });

  it('anchors every dimension at all three rating levels', () => {
    const strongCount = RUBRIC_PROMPT_TEXT.match(/^strong:/gm)?.length ?? 0;
    const meetsBarCount = RUBRIC_PROMPT_TEXT.match(/^meets_bar:/gm)?.length ?? 0;
    const needsWorkCount = RUBRIC_PROMPT_TEXT.match(/^needs_work:/gm)?.length ?? 0;
    expect(strongCount).toBe(8);
    expect(meetsBarCount).toBe(8);
    expect(needsWorkCount).toBe(8);
  });
});

describe('ratingLabel (v4.3 not assessed)', () => {
  it('labels ratings, not-assessed, and missing ratings for display', () => {
    expect(ratingLabel('meets_bar')).toBe('adequate');
    expect(ratingLabel(NOT_ASSESSED)).toBe('not assessed');
    expect(ratingLabel(null)).toBe('unrated');
  });
});
