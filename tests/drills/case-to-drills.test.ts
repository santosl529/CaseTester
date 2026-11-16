import { describe, expect, it } from 'vitest';
import { caseResultsWired, caseToDrillsMode, DEFAULT_DRILL_GROUPS, drillGroups } from '@/lib/drills/case-to-drills';

describe('the case → drills switch (Matt, 15 Nov)', () => {
  it('is off unless set, and on only when "on"', () => {
    expect(caseToDrillsMode({})).toBe('off');
    expect(caseToDrillsMode({ CASE_TO_DRILLS: ' Shadow ' })).toBe('shadow');
    expect(caseResultsWired({ CASE_TO_DRILLS: 'shadow' })).toBe(false);
    expect(caseResultsWired({ CASE_TO_DRILLS: 'on' })).toBe(true);
    expect(() => caseToDrillsMode({ CASE_TO_DRILLS: 'yes' })).toThrow(/off, shadow, on/);
  });

  it('defaults the drill groups to the 7 that passed the gate; exhibits and judgment stay off', () => {
    expect([...drillGroups({})]).toEqual([...DEFAULT_DRILL_GROUPS]);
    expect(drillGroups({}).has('dataExhibit')).toBe(false);
    expect(drillGroups({}).has('judgment')).toBe(false);
    expect([...drillGroups({ CASE_TAG_DRILL_GROUPS: 'structure, dataExhibit' })]).toEqual(['structure', 'dataExhibit']);
    expect(() => drillGroups({ CASE_TAG_DRILL_GROUPS: 'structure,exhibits' })).toThrow(/unknown group exhibits/);
  });
});
