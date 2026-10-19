import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CaseResultPayloadSchema } from '@/lib/drills/case-result';

const dir = path.join(process.cwd(), 'tests/fixtures/drills/case-results');
const fixtures = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
const base = () => load('market-entry-t2.json');
const errors = (payload: unknown) => {
  const r = CaseResultPayloadSchema.safeParse(payload);
  return r.success ? [] : r.error.issues.map(i => i.message);
};

describe('case grader payload contract (PRD "What the case grader must send")', () => {
  it.each(fixtures)('accepts fixture %s', f => {
    expect(errors(load(f))).toEqual([]);
  });

  it('rejects tags not in the taxonomy', () => {
    const p = base();
    p.findings[0].tag = 'M.made_up';
    expect(errors(p)).toContain('Unknown mistake tag M.made_up');
  });

  it('rejects drill-only system tags', () => {
    const p = base();
    p.findings[0].tag = 'M.timeout';
    expect(errors(p)).toContain('Unknown mistake tag M.timeout');
  });

  it('rejects unknown skills in skills_observed', () => {
    const p = base();
    p.skills_observed.push('QN.vibes');
    expect(errors(p)).toContain('Unknown skill QN.vibes');
  });

  it('rejects another taxonomy version', () => {
    const p = base();
    p.taxonomy_version = 'v0';
    expect(errors(p)).toContain('Expected taxonomy v1, got v0');
  });

  it('needs evidence quotes and turn ids on every finding', () => {
    const p = base();
    p.findings[0].evidence = '   ';
    p.findings[1].turn_ids = [];
    expect(errors(p).length).toBe(2);
  });

  it('takes ratings, not numbers, for rubric scores (grader format today)', () => {
    const p = base();
    p.rubric_scores.structure = 2.5;
    expect(errors(p).length).toBe(1);
    const q = base();
    q.rubric_scores = { problem_structuring: 'strong' };
    expect(errors(q).length).toBe(1);
  });
});
