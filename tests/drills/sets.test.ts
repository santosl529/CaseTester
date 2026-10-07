import { describe, it, expect } from 'vitest';
import { planAuthored, planGenerated, hashSeed } from '@/lib/drills/sets/plan';
import { scoreItem, scoreStep, ScoringError, type StepResult } from '@/lib/drills/sets/scoring';
import { mistakeSummary, nextTier, setScore, skillScores, timeLimitMs, passed } from '@/lib/drills/sets/summary';
import { getDrill } from '@/lib/drills/config';
import { getGenerator } from '@/lib/drills/generators/registry';
import { percentChange } from '@/lib/drills/generators/percent-change';
import type { Item } from '@/lib/drills/item-schema';

describe('generated plans', () => {
  it('are reproducible from the set id', () => {
    const a = planGenerated({ setId: 'set-a', drillId: 'QN-3', size: 10 });
    expect(planGenerated({ setId: 'set-a', drillId: 'QN-3', size: 10 })).toEqual(a);
    expect(planGenerated({ setId: 'set-b', drillId: 'QN-3', size: 10 })).not.toEqual(a);
    expect(hashSeed('set-a')).toBe(hashSeed('set-a'));
  });

  it('serve 70% focus-skill items and 30% mixed review on QN-3', () => {
    for (const setId of ['s1', 's2', 's3', 's4']) {
      const plan = planGenerated({ setId, drillId: 'QN-3', size: 10, focusSkill: 'QN.growth' });
      const growth = plan.filter(r => r.kind === 'generated' && getGenerator(r.template_id, r.template_version).skills.includes('QN.growth'));
      expect(growth.length).toBeGreaterThanOrEqual(7);
      expect(plan).toHaveLength(10);
    }
  });

  it('spread an unfocused set across templates', () => {
    const plan = planGenerated({ setId: 'spread', drillId: 'QN-1', size: 10 });
    expect(new Set(plan.map(r => r.kind === 'generated' && r.template_id)).size).toBeGreaterThanOrEqual(8);
  });

  it('ignore a focus that every template shares', () => {
    const plan = planGenerated({ setId: 'x', drillId: 'EX-2', size: 8, focusSkill: 'EX.traps' });
    expect(new Set(plan.map(r => r.kind === 'generated' && r.template_id)).size).toBeGreaterThanOrEqual(6);
  });
});

describe('authored plans (PRD "Serving rules")', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const pool = Array.from({ length: 12 }, (_, i) => ({
    item_id: `i${i}`, version: 1, tier: i < 6 ? 2 : 1, case_type: ['profitability', 'market_entry', 'pricing'][i % 3],
  }));

  it('never repeats an item within 60 days while fresh items remain', () => {
    const lastSeen = new Map([['i0', daysAgo(5)], ['i1', daysAgo(59)], ['i2', daysAgo(61)]]);
    const plan = planAuthored({ setId: 's', pool, lastSeen, size: 8, tier: 2, now });
    const ids = plan.map(r => r.kind === 'authored' && r.item_id);
    expect(ids).not.toContain('i0');
    expect(ids).not.toContain('i1');
    expect(new Set(ids).size).toBe(8);
  });

  it('reuses the items seen longest ago when the pool runs out', () => {
    const lastSeen = new Map(pool.map((p, i) => [p.item_id, daysAgo(i + 1)]));
    const plan = planAuthored({ setId: 's', pool, lastSeen, size: 3, tier: 2, now });
    expect(plan.map(r => r.kind === 'authored' && r.item_id)).toEqual(['i11', 'i10', 'i9']);
  });

  it("prefers the set's tier, then mixes case types", () => {
    const plan = planAuthored({ setId: 's', pool, lastSeen: new Map(), size: 6, tier: 2, now });
    const chosen = plan.map(r => pool.find(p => r.kind === 'authored' && p.item_id === r.item_id)!);
    expect(chosen.every(c => c.tier === 2)).toBe(true);
    expect(new Set(chosen.slice(0, 3).map(c => c.case_type)).size).toBe(3);
  });
});

const qn4 = () => getGenerator('calc_breakeven_units', 1).generate(3, 1);
const correctOption = (item: Item) => item.options.find(o => o.correct)!.id;
const wrongOption = (item: Item) => item.options.find(o => !o.correct)!;

describe('item scoring (PRD "Item scoring rules")', () => {
  it('scores single choice and tags the chosen wrong option', () => {
    const item = getGenerator('setup_profit', 1).generate(1, 2);
    expect(scoreStep(item, 0, { type: 'choice', option_id: correctOption(item) }, false)).toMatchObject({ score: 1, tag: null });
    const wrong = wrongOption(item);
    expect(scoreStep(item, 0, { type: 'choice', option_id: wrong.id }, false)).toMatchObject({ score: 0, tag: wrong.tag });
  });

  it('scores numeric answers with the shared diagnosis', () => {
    const item = percentChange.generate(5, 2);
    const right = scoreStep(item, 0, { type: 'numeric', value: `${item.numeric!.answer}%` }, false);
    expect(right.score).toBe(1);
    const zeros = scoreStep(item, 0, { type: 'numeric', value: String(item.numeric!.answer * 10) }, false);
    expect(zeros.tag).toBe('M.zeros_error');
  });

  it('weights QN-4 steps 40/60 and maps them to their skills', () => {
    const item = qn4();
    const s1 = scoreStep(item, 0, { type: 'choice', option_id: wrongOption(item).id }, false);
    const s2 = scoreStep(item, 1, { type: 'numeric', value: String(item.numeric!.answer) }, false);
    const result = scoreItem(item, { skipped: false, timedOut: false, steps: [s1, s2] });
    expect(result.score).toBeCloseTo(0.6);
    expect(s1.skills).toEqual(['QN.setup']);
    expect(s2.skills).toEqual(['QN.arithmetic', 'QN.magnitude']);
  });

  it('scores an empty answer at timeout as 0 with M.timeout', () => {
    const item = percentChange.generate(5, 2);
    expect(scoreStep(item, 0, { type: 'empty' }, true)).toMatchObject({ score: 0, tag: 'M.timeout' });
    expect(scoreStep(item, 0, { type: 'numeric', value: 'abc' }, true)).toMatchObject({ score: 0, tag: 'M.timeout' });
  });

  it('refuses an unparseable number or an empty answer before time is up', () => {
    const item = percentChange.generate(5, 2);
    expect(() => scoreStep(item, 0, { type: 'numeric', value: 'abc' }, false)).toThrow(ScoringError);
    expect(() => scoreStep(item, 0, { type: 'empty' }, false)).toThrow(ScoringError);
  });

  it('scores a skip as 0 with M.skipped', () => {
    expect(scoreItem(percentChange.generate(1, 1), { skipped: true, timedOut: false, steps: [] }))
      .toMatchObject({ score: 0, mistake_tags: ['M.skipped'], skipped: true });
  });
});

const result = (score: number, tags: string[] = [], skipped = false, steps: StepResult[] = []) =>
  ({ score, mistake_tags: tags, skipped, timed_out: false, steps });
const step = (score: number, skills: string[], weight = 1): StepResult =>
  ({ type: 'numeric', weight, score, skills, tag: null, response: { type: 'empty' } });

describe('set summary', () => {
  it('averages item scores, skips counting as 0', () => {
    expect(setScore([result(1), result(0.6), result(0, ['M.skipped'], true)])).toBeCloseTo(0.5333, 3);
  });

  it('passes at the 80% bar', () => {
    expect(passed(getDrill('QN-3'), 0.8)).toBe(true);
    expect(passed(getDrill('QN-3'), 0.79)).toBe(false);
  });

  it('counts a skill only with at least 3 items or steps', () => {
    const scores = skillScores([
      { skills: ['QN.percentages'], result: result(1, [], false, [step(1, ['QN.percentages'])]) },
      { skills: ['QN.percentages'], result: result(0, [], false, [step(0, ['QN.percentages'])]) },
      { skills: ['QN.percentages'], result: result(0, ['M.skipped'], true) },
      { skills: ['QN.growth'], result: result(1, [], false, [step(1, ['QN.growth'])]) },
    ]);
    expect(scores).toEqual({ 'QN.percentages': { score: 0.3333, count: 3 } });
  });

  it('weights multi-step skill scores by step weight', () => {
    const qn4Result = (s1: number, s2: number) => result(0.4 * s1 + 0.6 * s2, [], false, [step(s1, ['QN.setup'], 0.4), step(s2, ['QN.arithmetic'], 0.6)]);
    const scores = skillScores([0, 1, 2].map(() => ({ skills: [], result: qn4Result(1, 0) })));
    expect(scores['QN.setup'].score).toBe(1);
    expect(scores['QN.arithmetic'].score).toBe(0);
  });

  it('names the most common mistake and leaves skips out', () => {
    const summary = mistakeSummary([
      result(0, ['M.zeros_error']), result(0, ['M.zeros_error']), result(0, ['M.wrong_base']),
      result(0, ['M.skipped'], true), result(1),
    ]);
    expect(summary?.text).toBe('Most common mistake: zeros error (2 of your 3 misses).');
    expect(mistakeSummary([result(1), result(1)])).toBeNull();
    expect(mistakeSummary([result(0, ['M.unit_error'])])?.text).toBe('Your one miss: unit error.');
  });

  it('moves tiers up at 80%, down below 50%, and holds in between', () => {
    expect([nextTier(1, 0.8), nextTier(3, 0.9), nextTier(2, 0.49), nextTier(1, 0.2), nextTier(2, 0.6)]).toEqual([2, 3, 1, 1, 2]);
  });

  it('applies the time accommodation', () => {
    expect(timeLimitMs(getDrill('QN-3'), 3, 1)).toBe(12_000);
    expect(timeLimitMs(getDrill('QN-3'), 3, 1.5)).toBe(18_000);
  });
});
