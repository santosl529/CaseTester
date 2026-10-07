import { describe, it, expect } from 'vitest';
import taxonomyJson from '@/lib/drills/config/taxonomy.v1.json';
import drillsJson from '@/lib/drills/config/drills.v1.json';
import rulesJson from '@/lib/drills/config/rules.v1.json';
import { DRILLS_CONFIG, crossCheck, parseDrillsConfig, hasLiveLevel2Drill, isKnownTag } from '@/lib/drills/config';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const raw = () => ({ taxonomy: clone(taxonomyJson), drills: clone(drillsJson), rules: clone(rulesJson) });

describe('drills config v1 (docs/prd-drills.md)', () => {
  const { taxonomy, drills } = DRILLS_CONFIG;

  it('matches the PRD counts: 9 areas, 29 skills, 62 tags, 25 drills', () => {
    expect(taxonomy.areas).toHaveLength(9);
    expect(taxonomy.skills).toHaveLength(29);
    expect(taxonomy.mistake_tags).toHaveLength(62);
    expect(taxonomy.system_tags.map(t => t.id).sort()).toEqual(['M.skipped', 'M.timeout']);
    expect(drills.drills).toHaveLength(25);
    expect(drills.drills.filter(d => d.level === 1)).toHaveLength(13);
    expect(drills.drills.filter(d => d.level === 2)).toHaveLength(12);
  });

  it('has 15 P0 drills across the six MVP skill areas', () => {
    const p0 = drills.drills.filter(d => d.priority === 'P0');
    expect(p0).toHaveLength(15);
    expect(new Set(p0.map(d => d.id.slice(0, 2)))).toEqual(new Set(['PS', 'HY', 'QN', 'EX', 'SY', 'CL']));
  });

  it('scores 17 drills entirely by code, and 5 P0/P1 drills need an AI call', () => {
    expect(drills.drills.filter(d => d.scoring === 'auto')).toHaveLength(17);
    const ai = drills.drills.filter(d => d.scoring !== 'auto' && d.priority !== 'P2').map(d => d.id).sort();
    expect(ai).toEqual(['CL-3', 'CR-1', 'HY-2', 'PS-3', 'SY-2']);
  });

  it("makes only D1's generated drills live; authored drills wait for their pools", () => {
    expect(drills.drills.filter(d => d.live).map(d => d.id).sort()).toEqual(['EX-2', 'EX-3', 'QN-1', 'QN-3', 'QN-4']);
    expect(hasLiveLevel2Drill('QN.percentages')).toBe(true);
    expect(hasLiveLevel2Drill('PS.mece')).toBe(false);
  });

  it('is internally consistent', () => {
    expect(crossCheck(DRILLS_CONFIG)).toEqual([]);
  });

  it('knows system tags and mistake tags, and nothing else', () => {
    expect(isKnownTag('M.zeros_error')).toBe(true);
    expect(isKnownTag('M.timeout')).toBe(true);
    expect(isKnownTag('M.made_up')).toBe(false);
  });

  describe('fails the boot on', () => {
    it('a tag mapped to a skill that does not exist', () => {
      const r = raw();
      r.taxonomy.mistake_tags[0].skill = 'PS.nonexistent';
      expect(() => parseDrillsConfig(r)).toThrow(/Tag M.overlapping_buckets: unknown skill PS.nonexistent/);
    });

    it('a duplicate tag', () => {
      const r = raw();
      r.taxonomy.mistake_tags.push(clone(r.taxonomy.mistake_tags[0]));
      expect(() => parseDrillsConfig(r)).toThrow(/Duplicate tag M.overlapping_buckets/);
    });

    it('an area that rolls up to an unknown rubric dimension', () => {
      const r = raw();
      (r.taxonomy.areas[0] as { rubric_dimension: string }).rubric_dimension = 'vibes';
      expect(() => parseDrillsConfig(r)).toThrow(/Malformed drills config taxonomy/);
    });

    it('a skill_drills entry pointing at a drill of the wrong level', () => {
      const r = raw();
      (r.rules.skill_drills as Record<string, { l1: string | null; l2: string | null }>)['PS.mece'].l2 = 'PS-1';
      expect(() => parseDrillsConfig(r)).toThrow(/PS-1 is not a level 2 drill for PS.mece/);
    });

    it('a skill no drill trains', () => {
      const r = raw();
      r.drills.drills = r.drills.drills.filter(d => d.id !== 'PS-2');
      expect(() => parseDrillsConfig(r)).toThrow(/Skill PS.clarifying_questions: no drill trains it/);
    });

    it('a P0 drill with no set size', () => {
      const r = raw();
      (r.drills.drills[0] as { set_size: number | null }).set_size = null;
      expect(() => parseDrillsConfig(r)).toThrow(/only P2 drills may leave set_size unset/);
    });

    it('mismatched config versions', () => {
      const r = raw();
      r.rules.version = 'v2';
      expect(() => parseDrillsConfig(r)).toThrow(/Config versions differ/);
    });
  });
});
