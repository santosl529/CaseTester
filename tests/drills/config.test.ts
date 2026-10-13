import { describe, it, expect } from 'vitest';
import taxonomyJson from '@/lib/drills/config/taxonomy.v1.json';
import drillsJson from '@/lib/drills/config/drills.v1.json';
import rulesJson from '@/lib/drills/config/rules.v1.json';
import programsJson from '@/lib/drills/config/programs.v1.json';
import { DRILLS_CONFIG, crossCheck, parseDrillsConfig, hasLiveLevel2Drill, isKnownTag } from '@/lib/drills/config';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const raw = () => ({ taxonomy: clone(taxonomyJson), drills: clone(drillsJson), rules: clone(rulesJson), programs: clone(programsJson) });

describe('drills config v1 (docs/prd-drills.md)', () => {
  const { taxonomy, drills } = DRILLS_CONFIG;

  it('matches the PRD counts: 9 areas, 29 skills, 67 tags, 29 drills (CL-4 not yet configured)', () => {
    expect(taxonomy.areas).toHaveLength(9);
    expect(taxonomy.skills).toHaveLength(29);
    expect(taxonomy.mistake_tags).toHaveLength(67);
    expect(taxonomy.system_tags.map(t => t.id).sort()).toEqual(['M.skipped', 'M.timeout']);
    expect(drills.drills).toHaveLength(29);
    expect(drills.drills.filter(d => d.stage === 'recognize')).toHaveLength(13);
    expect(drills.drills.filter(d => d.stage === 'repair').map(d => d.id)).toEqual(['PS-4', 'HY-3', 'EX-5', 'SY-3']);
    expect(drills.drills.filter(d => d.stage === 'construct')).toHaveLength(12);
  });

  it('has 18 P0 drills across the six MVP skill areas', () => {
    const p0 = drills.drills.filter(d => d.priority === 'P0');
    expect(p0).toHaveLength(18);
    expect(new Set(p0.map(d => d.id.slice(0, 2)))).toEqual(new Set(['PS', 'HY', 'QN', 'EX', 'SY', 'CL']));
  });

  it('scores 17 drills entirely by code, and 9 P0/P1 drills need an AI call', () => {
    expect(drills.drills.filter(d => d.scoring === 'auto')).toHaveLength(17);
    const ai = drills.drills.filter(d => d.scoring !== 'auto' && d.priority !== 'P2').map(d => d.id).sort();
    expect(ai).toEqual(['CL-3', 'CR-1', 'EX-5', 'HY-2', 'HY-3', 'PS-3', 'PS-4', 'SY-2', 'SY-3']);
  });

  it('keeps Defend off for live students until D5 passes its gate, with human-written golden answers (Matt, 2026-10-12)', () => {
    expect(drills.drills.filter(d => d.defend?.live).map(d => d.id)).toEqual([]);
  });

  it('gives PS-3, HY-2, SY-2 and CL-3 a Defend step, one item shorter at T2 and T3 (PRD "Defend step")', () => {
    const defend = Object.fromEntries(drills.drills.filter(d => d.defend).map(d => [d.id, [d.defend!.type, d.set_size, ...d.defend!.set_size]]));
    expect(defend).toEqual({
      'PS-3': ['justify', 4, 4, 3, 3], 'HY-2': ['justify', 4, 4, 3, 3], 'SY-2': ['challenge', 3, 3, 3, 3], 'CL-3': ['justify', 4, 4, 3, 3],
    });
  });

  it('maps each Repair drill into its skills\' chains (PRD "Drill chains")', () => {
    const repair = Object.fromEntries(Object.entries(DRILLS_CONFIG.rules.skill_drills).filter(([, m]) => m.repair).map(([s, m]) => [s, m.repair]));
    expect(repair).toEqual({
      'PS.mece': 'PS-4', 'PS.case_specific': 'PS-4', 'PS.depth': 'PS-4', 'HY.form': 'HY-3', 'EX.takeaway': 'EX-5',
      'SY.answer_first': 'SY-3', 'SY.evidence': 'SY-3',
    });
  });

  it('rejects a Repair drill mapped as a Construct drill', () => {
    const r = raw();
    r.rules.skill_drills['HY.form'].l2 = 'HY-3';
    expect(() => parseDrillsConfig(r)).toThrow(/HY-3 is not a level 2 drill for HY.form/);
  });

  it("makes drills live once their pools are approved", () => {
    expect(drills.drills.filter(d => d.live).map(d => d.id).sort()).toEqual(['CL-1', 'CL-3', 'EX-1', 'EX-2', 'EX-3', 'HY-1', 'HY-2', 'PS-1', 'PS-3', 'QN-1', 'QN-3', 'QN-4', 'QN-5', 'SY-1', 'SY-2']);
    expect(hasLiveLevel2Drill('QN.percentages')).toBe(true);
    expect(hasLiveLevel2Drill('PS.mece')).toBe(true);
    expect(hasLiveLevel2Drill('HY.form')).toBe(true);
  });

  it('is internally consistent', () => {
    expect(crossCheck(DRILLS_CONFIG)).toEqual([]);
  });

  it('knows system tags and mistake tags, and nothing else', () => {
    expect(isKnownTag('M.zeros_error')).toBe(true);
    expect(isKnownTag('M.timeout')).toBe(true);
    expect(isKnownTag('M.made_up')).toBe(false);
  });

  it('has the approved skill tree (PRD "Skill tree")', () => {
    const tree = Object.fromEntries(taxonomy.skills.filter(s => s.prerequisites.length).map(s => [s.id, s.prerequisites]));
    expect(tree).toEqual({
      'PS.case_specific': ['PS.mece'], 'PS.depth': ['PS.mece'], 'HY.form': ['PS.case_specific'], 'HY.update': ['HY.form'],
      'QN.magnitude': ['QN.arithmetic'], 'QN.percentages': ['QN.arithmetic'], 'QN.growth': ['QN.percentages'],
      'QN.setup': ['QN.percentages'], 'QN.sizing_structure': ['PS.mece', 'QN.magnitude'], 'QN.assumptions': ['QN.magnitude'],
      'QN.sanity_check': ['QN.magnitude'], 'EX.takeaway': ['EX.traps'], 'EX.extraction': ['QN.arithmetic'],
      'BJ.so_what': ['EX.takeaway'], 'BJ.risks': ['BJ.so_what'], 'SY.evidence': ['EX.takeaway'],
      'SY.complete': ['SY.answer_first', 'BJ.risks'], 'SY.summary': ['SY.answer_first'], 'CL.next_step': ['HY.form'],
      'CL.data_requests': ['PS.mece'], 'CL.pushback': ['SY.evidence'], 'CR.structure': ['PS.mece'],
    });
  });

  it('marks primary skills: secondary ones belong to another drill', () => {
    const primary = Object.fromEntries(drills.drills.filter(d => d.primary_skills.length < d.skills.length).map(d => [d.id, d.primary_skills]));
    expect(primary).toEqual({
      'QN-4': ['QN.setup'], 'QN-5': ['QN.sizing_structure', 'QN.assumptions', 'QN.sanity_check'], 'EX-3': ['EX.extraction'],
    });
  });

  it('has the two Defend tags under CL.pushback, minor by default', () => {
    for (const id of ['M.dodged_question', 'M.inconsistent_defense']) {
      expect(taxonomy.mistake_tags.find(t => t.id === id)).toMatchObject({ skill: 'CL.pushback', severity: 'minor' });
    }
  });

  describe('fails the boot on', () => {
    it('a cycle in the skill tree', () => {
      const r = raw();
      r.taxonomy.skills.find(s => s.id === 'PS.mece')!.prerequisites = ['CR.structure'];
      expect(() => parseDrillsConfig(r)).toThrow(/Skill tree has a cycle: PS.mece → CR.structure → PS.mece|Skill tree has a cycle: CR.structure → PS.mece → CR.structure/);
    });

    it('a skill_drills entry whose skill is only secondary in that drill', () => {
      const r = raw();
      (r.rules.skill_drills as Record<string, { l1: string | null; repair: string | null; l2: string | null }>)['QN.arithmetic'].l2 = 'QN-4';
      expect(() => parseDrillsConfig(r)).toThrow(/QN.arithmetic is not a primary skill of QN-4/);
    });

    it('an unknown prerequisite', () => {
      const r = raw();
      r.taxonomy.skills.find(s => s.id === 'PS.depth')!.prerequisites = ['PS.vibes'];
      expect(() => parseDrillsConfig(r)).toThrow(/Skill PS.depth: unknown prerequisite PS.vibes/);
    });

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
      (r.rules.skill_drills as Record<string, { l1: string | null; repair: string | null; l2: string | null }>)['PS.mece'].l2 = 'PS-1';
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
