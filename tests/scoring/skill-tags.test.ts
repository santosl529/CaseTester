import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DRILLS_CONFIG, getMistakeTag } from '@/lib/drills/config';
import { CASE_TAGS, LESSON_DEFINITIONS, NEW_DEFINITIONS, NOT_TAGGED_IN_CASES, TAG_DEFINITIONS, TAGGING_RULES } from '@/lib/scoring/skill-tag-rules';
import { gateResult, isWrongSkill } from '@/lib/scoring/skill-tag-gate';
import { pointsBlock } from '@/lib/scoring/skill-tags';

describe('tagging rules', () => {
  it('defines every tag the step may return, and no others', () => {
    const live = DRILLS_CONFIG.taxonomy.mistake_tags.filter(t => !t.deprecated).map(t => t.id);
    expect(CASE_TAGS).toEqual(live.filter(id => !(NOT_TAGGED_IN_CASES as readonly string[]).includes(id)));
    for (const id of CASE_TAGS) expect(TAG_DEFINITIONS[id], id).toBeTruthy();
    for (const id of Object.keys(TAG_DEFINITIONS)) expect(getMistakeTag(id), id).toBeTruthy();
  });

  it('keeps the lesson definitions verbatim', () => {
    const lines = new Map<string, string>();
    for (const f of fs.readdirSync('lessons').filter(f => f.endsWith('.md'))) {
      for (const l of fs.readFileSync(path.join('lessons', f), 'utf-8').split('\n')) {
        const m = l.match(/^- `(M\.[a-z_]+)`: (.*)$/);
        if (m) lines.set(m[1], m[2]);
      }
    }
    for (const [id, text] of Object.entries(LESSON_DEFINITIONS)) expect(text, id).toBe(lines.get(id));
    // A tag that gets a lesson moves to the lesson's wording.
    for (const id of Object.keys(NEW_DEFINITIONS)) expect(lines.has(id), id).toBe(false);
  });

  it('names only real tags in the rules', () => {
    for (const m of TAGGING_RULES.matchAll(/M\.[a-z_]+/g)) expect(getMistakeTag(m[0]), m[0]).toBeTruthy();
  });

  it('labels every golden point by a rule, with a real tag or none', () => {
    const golden = JSON.parse(fs.readFileSync('case-tagging/golden/golden.json', 'utf-8')) as { id: string; label: string | null; rule: string; quotes: string[]; kind: string }[];
    expect(golden.length).toBeGreaterThanOrEqual(250);
    const rules = new Set([...TAGGING_RULES.matchAll(/^\s*([A-Z]\d)\./gm)].map(m => m[1]));
    for (const g of golden) {
      expect(rules.has(g.rule), `${g.id} ${g.rule}`).toBe(true);
      if (g.label) expect(CASE_TAGS, g.id).toContain(g.label);
      if (g.kind === 'needs_work') expect(g.quotes.length, g.id).toBeGreaterThan(0);
    }
    expect(new Set(golden.map(g => g.id)).size).toBe(golden.length);
  });
});

describe('points block', () => {
  it('shows the dimension, rating and quotes, and the top improvement without them', () => {
    const block = pointsBlock([
      { id: 'a', dimension: 'structure', rating: 'meets_bar', point: 'Buckets overlapped.', quotes: ['revenue, costs, and pricing'] },
      { id: 'b', dimension: null, rating: null, point: 'Open with a tailored structure.', quotes: [] },
    ]);
    expect(block).toContain('<point id="a">\nProblem Structuring (rated adequate)\nBuckets overlapped.\nCandidate\'s words:\n  "revenue, costs, and pricing"');
    expect(block).toContain('<point id="b">\nTop improvement\nOpen with a tailored structure.\n</point>');
  });
});

describe('gate', () => {
  it('counts a tag where the label is none, or another skill, as a wrong skill; a miss is not', () => {
    expect(isWrongSkill(null, 'M.rambling')).toBe(true);
    expect(isWrongSkill('M.wrong_base', 'M.percent_vs_points')).toBe(false);   // same skill: same drill
    expect(isWrongSkill('M.wrong_base', 'M.unit_error')).toBe(true);
    expect(isWrongSkill('M.wrong_base', null)).toBe(false);
    expect(isWrongSkill(null, null)).toBe(false);
  });

  it('passes at 90% per group and 5% wrong skill, and fails below either', () => {
    const group = (g: string, n: number, wrong: number, missed = 0) => Array.from({ length: n }, (_, i) => ({
      id: `${g}${i}`, group: g, label: 'M.wrong_base',
      tag: i < wrong ? 'M.unit_error' : i < wrong + missed ? null : 'M.wrong_base',
    }));
    const ok = gateResult([...group('structure', 20, 1, 1), ...group('quantitative', 20, 1)]);
    expect(ok.groups.map(g => g.rate)).toEqual([0.9, 0.95]);
    expect(ok.wrongSkill.rate).toBe(0.05);
    expect(ok.pass).toBe(true);
    const lowGroup = gateResult([...group('structure', 20, 0, 3), ...group('quantitative', 20, 0)]);
    expect(lowGroup.groups[0].pass).toBe(false);
    expect(lowGroup.pass).toBe(false);
    const tooManyWrong = gateResult([...group('structure', 20, 2), ...group('quantitative', 20, 1)]);
    expect(tooManyWrong.groups.every(g => g.pass)).toBe(true);
    expect(tooManyWrong.wrongSkill.count).toBe(3);
    expect(tooManyWrong.pass).toBe(false);
  });
});
