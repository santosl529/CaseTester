import { describe, it, expect } from 'vitest';
import {
  areaSkills, areasByNeed, checkSkills, placeFromRating, questionnairePlacements, questionnairePrescriptions, type Ratings,
} from '@/lib/drills/program/questionnaire';
import { isLiveDrill } from '@/lib/drills/live';

const ratings: Ratings = { structuring: 4, math: 2, charts: 3, recommendations: 5 };

describe('questionnaire (D6 round 2)', () => {
  it('places conservatively: never past Repair', () => {
    expect(placeFromRating('PS.mece', 1, isLiveDrill)).toBe('recognize');
    expect(placeFromRating('PS.mece', 3, isLiveDrill)).toBe('recognize_t2');
    expect(placeFromRating('PS.mece', 5, isLiveDrill)).toBe('repair');
    // No Repair drill for chart takeaways: tier 2 Recognize instead.
    expect(placeFromRating('EX.takeaway', 5, isLiveDrill)).toBe('recognize_t2');
    const places = Object.values(questionnairePlacements(ratings, isLiveDrill)).map(p => p.place);
    expect(places).not.toContain('test_out');
  });

  it('maps each area to its live skills in prerequisite order', () => {
    expect(areaSkills('structuring', isLiveDrill)).toEqual(expect.arrayContaining(['PS.mece', 'PS.case_specific', 'HY.form']));
    expect(areaSkills('charts', isLiveDrill).every(id => id.startsWith('EX.'))).toBe(true);
    expect(areaSkills('recommendations', isLiveDrill).some(id => id.startsWith('CL.'))).toBe(true);
  });

  it('orders areas by need: the hardest first, then the lowest rating', () => {
    expect(areasByNeed(ratings, 'charts')).toEqual(['charts', 'math', 'structuring', 'recommendations']);
    expect(areasByNeed(ratings, null)).toEqual(['math', 'charts', 'structuring', 'recommendations']);
  });

  it('prescribes the hardest area and areas rated 3 or lower, at most 3, below a diagnostic', () => {
    const rx = questionnairePrescriptions(ratings, 'recommendations', isLiveDrill);
    expect(rx.length).toBe(3);
    expect(rx[0].reason).toContain('hardest');
    expect(rx.every(r => r.priority <= 2)).toBe(true);
    // Everything rated 4–5 and nothing named hardest: nothing to prescribe.
    expect(questionnairePrescriptions({ structuring: 4, math: 5, charts: 4, recommendations: 5 }, null, isLiveDrill)).toEqual([]);
  });

  it('checks one skill per area, in order of need', () => {
    const checks = checkSkills(ratings, null, isLiveDrill);
    expect(checks.length).toBe(4);
    expect(checks[0].startsWith('QN.')).toBe(true);
  });
});
