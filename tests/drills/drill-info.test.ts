import { describe, it, expect } from 'vitest';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { drillCards, drillDescription, drillStages, drillsForSkill } from '@/lib/drills/drill-info';

const live = DRILLS_CONFIG.drills.drills.filter(d => d.live);

describe('drill descriptions (Browse drills, Learn)', () => {
  it('every live drill has both short lines', () => {
    for (const d of live) {
      const text = drillDescription(d.id);
      expect(text, d.id).not.toBeNull();
      expect(text!.what.length, `${d.id} what`).toBeLessThanOrEqual(120);
      expect(text!.why.length, `${d.id} why`).toBeLessThanOrEqual(130);
    }
  });

  it('every live drill has an interview stage from the intro lesson', () => {
    for (const d of live) expect(drillStages(d.id).length, d.id).toBeGreaterThan(0);
    expect(drillStages('PS-1')).toEqual(['Structure']);
    expect(drillStages('SY-2')).toEqual(['Recommend']);
    expect(drillStages('HY-2')).toEqual(['Structure', 'Analyze']);
  });

  it('cards cover every live drill once, grouped by first stage', () => {
    const cards = drillCards().flatMap(g => g.drills.map(c => c.drill_id));
    expect(cards.sort()).toEqual(live.map(d => d.id).sort());
  });

  it('lists the drills that practice a skill', () => {
    expect(drillsForSkill('PS.mece').map(d => d.drill_id)).toEqual(expect.arrayContaining(['PS-1', 'PS-3', 'PS-4']));
  });
});
