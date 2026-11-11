// The next-7 build, priority 1 (docs/drills-next7-proposal.md): EX-4 Written
// chart takeaway with its implication follow-up, EX-5 Fix the takeaway (a
// Repair drill on EX-1's charts) and CL-4 Your next move (two stages, as HY-2).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { chartFromColumns, importContent, parseCsv, type Tables } from '@/lib/drills/content-import';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { CL4_GRADING_RULES, EX4_DEFEND_GRADING_RULES, EX4_GRADING_RULES, EX5_GRADING_RULES, REPAIR_GRADING_RULES, cl4DecisionTag } from '@/lib/drills/checklists';
import { chartText, ChartSpecSchema } from '@/lib/drills/chart-spec';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';
import { withDefend, defendParts } from '@/lib/drills/defend';
import { applyGrade, firstSentence, unchangedRepair, type ItemGrade } from '@/lib/drills/grading/apply';
import { buildDefendBlock, buildFamilyBlock, buildItemBlock, gradeSet, type CallModel } from '@/lib/drills/grading/grader';
import { modelAnswerSteps } from '@/lib/drills/model-answers';
import { toPublicItem } from '@/lib/drills/public-item';
import { answerText, scoreStep, type StepResponse, type StepResult } from '@/lib/drills/sets/scoring';
import { itemLimitsMs, startsStage } from '@/lib/drills/sets/timing';
import { stepFeedback } from '@/lib/drills/sets/feedback';
import { getDrill } from '@/lib/drills/config';

const TEMPLATES = path.join(process.cwd(), 'docs/drills-content-templates');
const tables = (): Tables => Object.fromEntries(fs.readdirSync(TEMPLATES).filter(f => f.endsWith('.csv'))
  .map(f => [path.basename(f, '.csv'), parseCsv(fs.readFileSync(path.join(TEMPLATES, f), 'utf-8'))]));
const sources = new Map(loadAuthoredItems().filter(i => ['PS-1', 'HY-1', 'SY-1', 'EX-1'].includes(i.drill_id)).map(i => [i.item_id, i]));
const imported = importContent(tables(), { includeExamples: true, sources });
const byId = (id: string) => imported.items.find(i => i.item_id === id)!;
const ex4 = byId('example-ex4-01');
const ex5 = byId('example-ex5-01');
const cl4 = byId('example-cl4-01');

const run = (item: Item, responses: StepResponse[] = modelAnswerSteps(item)): StepResult[] => {
  const out: StepResult[] = [];
  responses.forEach((r, i) => out.push(scoreStep(item, i, r, r.type === 'empty', out)));
  current = out;
  return out;
};
let current: StepResult[] = [];
const allPass = (item: Item, extra: Partial<ItemGrade> = {}): ItemGrade => ({
  checks: Object.fromEntries(item.checks.filter(c => c.detection === 'ai').map(c => [c.check_id, { pass: true, evidence: firstSentence(answerText(current[c.step]?.response ?? { type: 'empty' })) }])),
  red_flags: Object.fromEntries(item.red_flags.filter(f => f.detection === 'ai').map(f => [f.id, { pass: false, evidence: '' }])),
  family: null, injection_suspected: false, qa_flags: [], ...extra,
});

describe('P1 content import', () => {
  it('builds the EX-4, EX-5 and CL-4 examples and their golden answers', () => {
    expect(imported.problems).toEqual([]);
    expect(ex4.exhibit).toMatchObject({ type: 'grouped_bar', categories: ['Ingredients', 'Labor', 'Rent', 'Delivery'] });
    expect(ex4.exhibit!.series.map(s => s.name)).toEqual(['2023', '2025']);
    expect(ex4.checks.map(c => [c.check_id, c.weight, c.fail_tag])).toEqual([
      ['key_insight', 0.5, 'M.trivial_takeaway'], ['cites_number', 0.25, 'M.unsupported_claim'], ['tied_to_question', 0.25, 'M.trivial_takeaway'],
    ]);
    expect(ex4.red_flags).toMatchObject([{ id: 'contradicts_chart', cap: 0.3, tag: 'M.misread_trend' }]);
    expect(ex4.extras.grading_rules).toEqual(EX4_GRADING_RULES);
    expect(ex4.defend?.checks.map(c => [c.check_id, c.weight, c.fail_tag])).toEqual([
      ['defend_implication', 0.4, 'M.no_implication'], ['defend_objective', 0.35, 'M.implication_off_objective'], ['defend_consistent', 0.25, 'M.inconsistent_defense'],
    ]);
    expect(ex4.defend?.text).toBe('What does this mean for the client\'s decision?');
    // EX-5 keeps its EX-1 item's chart and case.
    const source = sources.get('ex1-0003')!;
    expect(ex5.exhibit).toEqual(source.exhibit);
    expect(ex5.case_type).toBe(source.case_type);
    expect(ex5.extras.grading_rules).toEqual([...REPAIR_GRADING_RULES, ...EX5_GRADING_RULES]);
    expect(cl4.input.steps!.map(s => [s.type, s.weight, s.max_words ?? null, s.time_limits_s ?? null])).toEqual([
      ['free_text', 0.6, 40, [75, 60, 45]], ['single_choice', 0.25, null, [60, 45, 35]], ['free_text', 0.15, 30, null],
    ]);
    expect(cl4.checks.map(c => [c.check_id, c.step, c.weight])).toEqual([
      ['one_step', 0, 0.2], ['logical', 0, 0.25], ['reason_latest_finding', 0, 0.15], ['adapt_reason', 2, 0.15],
    ]);
    expect(cl4.red_flags).toMatchObject([{ id: 'final_recommendation', step: 0, cap: 0.4, tag: 'M.illogical_next_step' }]);
    expect(cl4.extras.grading_rules).toEqual(CL4_GRADING_RULES);
    const golden = imported.golden.filter(g => ['EX-4', 'EX-5', 'CL-4'].includes(g.drill_id));
    expect(golden.map(g => `${g.drill_id} ${g.part}`).sort()).toEqual(['CL-4 main', 'EX-4 defend', 'EX-4 main', 'EX-5 main']);
    expect(golden.find(g => g.drill_id === 'EX-4' && g.part === 'defend')?.labels).toEqual({ defend_implication: true, defend_objective: true, defend_consistent: true });
    expect(golden.find(g => g.drill_id === 'CL-4')?.family).toBe('Chain-wide cost lines');
  });

  it('refuses a CL-4 new fact that supports or undercuts every family', () => {
    const t = tables();
    t['cl4-families'] = t['cl4-families'].map(r => ({ ...r, correct_action_after_new_fact: 'keep' }));
    expect(importContent(t, { includeExamples: true, sources }).problems.map(p => p.message).join(' ')).toMatch(/must support at least one family \(keep\) and undercut at least one \(change\)/);
  });

  it('refuses an EX-5 item not derived from an EX-1 item', () => {
    const t = tables();
    t['ex5-questions'] = t['ex5-questions'].map(r => ({ ...r, derived_from: 'hy1-0015' }));
    expect(importContent(t, { includeExamples: true, sources }).problems.map(p => p.message).join(' ')).toMatch(/EX-5 items come from EX-1 items, not HY-1/);
  });

  it('reads an EX-4 chart from its columns, tables and waterfalls included', () => {
    const table = chartFromColumns({ chart_type: 'table', chart_title: 'Stores', categories: 'Region | Stores', series: 'North | 12\nSouth | 9' });
    expect(ChartSpecSchema.parse(table).table).toEqual({ columns: ['Region', 'Stores'], rows: [['North', '12'], ['South', '9']] });
    const fall = chartFromColumns({ chart_type: 'waterfall', chart_title: 'Bridge', categories: '2023 | Price | Volume | 2025', series: 'Profit: 10 | 2 | -4 | 8', totals: '2023 | 2025', value_prefix: '$', value_suffix: 'M' });
    expect(ChartSpecSchema.parse(fall)).toMatchObject({ totals: [0, 3], y_axis: { format: { prefix: '$', suffix: 'M' } } });
    expect(() => chartFromColumns({ chart_type: 'dual_axis', chart_title: 'x', categories: 'a', series: 'A: 1' })).toThrow(/dual_axis/);
    expect(() => chartFromColumns({ chart_type: 'bar', chart_title: 'x', categories: 'a | b', series: 'A: 1 | many' })).toThrow(/must be a number/);
  });
});

describe('EX-4 Written chart takeaway', () => {
  it('times it like CL-3, 90 / 75 / 60 s (Matt, D8), and adds a 25% implication follow-up at tiers 2–3', () => {
    expect(itemLimitsMs(getDrill('EX-4'), ex4, 3, 1)).toEqual([60_000]);
    const x = withDefend(ex4);
    expect(x.input.steps!.map(s => s.weight)).toEqual([0.75, 0.25]);
    expect(itemLimitsMs(getDrill('EX-4'), x, 2, 1)).toEqual([75_000, 60_000]);
  });

  it('shows the grader the chart, value by value, and the figures to check numbers against', () => {
    const block = buildItemBlock({ key: 'answer', item: ex4, steps: run(ex4) });
    expect(block).toContain('<chart>\nTitle: Costs as a share of revenue\nUnits: % of revenue\nChart type: grouped bar\n2023: Ingredients 30%; Labor 28%; Rent 12%; Delivery 4%\n2025: Ingredients 31%; Labor 35%; Rent 12%; Delivery 5%\n</chart>');
    expect(block).toContain('- Labor rose 7 points (28% to 35%)');
    expect(block).toContain('check_id "key_insight": Does the answer state the key insight: labor rose 7 points');
    const reply = buildDefendBlock({ key: 'answer', item: withDefend(ex4), steps: run(withDefend(ex4)) });
    expect(reply).toContain('<chart>');
    expect(reply).toContain(EX4_DEFEND_GRADING_RULES[1]);
  });

  it('caps an answer the chart contradicts at 30%, and counts the follow-up toward BJ.so_what and CL.pushback', () => {
    const steps = run(ex4);
    expect(applyGrade(ex4, steps, false, allPass(ex4)).score).toBeCloseTo(1, 9);
    const r = applyGrade(ex4, steps, false, allPass(ex4, { red_flags: { contradicts_chart: { pass: true, evidence: firstSentence(answerText(steps[0].response)) } } }));
    expect(r.score).toBeCloseTo(0.3, 9);
    expect(r.mistake_tags).toEqual(['M.misread_trend']);
    const x = withDefend(ex4);
    const s2 = run(x);
    const failed = applyGrade(x, s2, false, { ...allPass(x), checks: { ...allPass(x).checks, defend_implication: { pass: false, evidence: '' } } });
    expect(failed.mistake_tags).toEqual(['M.no_implication']);
    const contribution = failed.check_results.contributions.find(c => c.score === 0)!;
    expect(contribution.skills.sort()).toEqual(['BJ.so_what', 'CL.pushback', 'EX.takeaway']);
  });
});

describe('EX-5 Fix the takeaway', () => {
  it('prefills the flawed takeaway beside the chart, and scores it unchanged at 0 without the AI', () => {
    const pub = toPublicItem(ex5, 1);
    expect(pub.exhibit).toEqual(ex5.exhibit);
    expect(pub.repair).toEqual({ prefill: { type: 'text', value: '$8 is the best price: it attracts the most subscribers, at 100k.' }, hint: 'The flaw: it picks the price with the most subscribers, not the most revenue.' });
    const steps = run(ex5, [pub.repair!.prefill]);
    expect(unchangedRepair(ex5, steps)).toBe(true);
    expect(applyGrade(ex5, steps, false, allPass(ex5))).toMatchObject({ score: 0, mistake_tags: ['M.trivial_takeaway'] });
  });

  it('grades with the original, the chart and EX-5\'s new-flaw kinds', () => {
    const block = buildItemBlock({ key: 'answer', item: ex5, steps: run(ex5) });
    expect(block).toContain('<original_answer>\n$8 is the best price');
    expect(block).toContain('<chart>\nTitle: Subscribers at each test price');
    expect(block).toContain('- M.misread_trend: misread trend');
    expect(block).not.toContain('M.restates_facts');
  });
});

describe('CL-4 Your next move', () => {
  const families = cl4.extras.families as { family: string; actions: ('keep' | 'change')[] }[];

  it('reveals the new fact once stage 1 is in, and gives stage 2 its own clock', () => {
    const steps = run(cl4, [{ type: 'text', value: 'Compare cost per member at the new clubs, since the $2M sits there.' }]);
    const fb = stepFeedback(cl4, 0, { ...steps[0], pending: true });
    expect(fb.reveal).toBe(cl4.extras.new_fact);
    expect(startsStage(cl4, 1)).toBe(true);
    expect(itemLimitsMs(getDrill('CL-4'), cl4, 2, 1)).toEqual([60_000, 45_000]);
    expect(JSON.stringify(toPublicItem(cl4))).not.toContain('older clubs');
  });

  it('scores Keep/Change against the stage 1 family; both are right for "other"', () => {
    expect(cl4DecisionTag(families as never, 'New-club costs', 'keep')).toBeNull();
    expect(cl4DecisionTag(families as never, 'New-club costs', 'change')).toBe('M.illogical_next_step');
    expect(cl4DecisionTag(families as never, 'Revenue side', 'change')).toBeNull();
    expect(cl4DecisionTag(families as never, 'other', 'keep')).toBeNull();
    expect(cl4DecisionTag(families as never, null, 'change')).toBeNull();
    const steps = run(cl4);
    expect(steps[1].response).toEqual({ type: 'choice', option_id: 'keep' });
    const right = applyGrade(cl4, steps, false, allPass(cl4, { family: 'New-club costs' }));
    expect(right.score).toBeCloseTo(1, 9);
    expect(right.check_results.decision).toEqual({ chose: 'keep', right: true });
    const wrong = applyGrade(cl4, steps, false, allPass(cl4, { family: 'Revenue side' }));
    expect(wrong.score).toBeCloseTo(0.75, 9);
    expect(wrong.mistake_tags).toEqual(['M.illogical_next_step']);
    expect(wrong.check_results.contributions.find(c => c.weight === 0.25 && c.score === 0)?.skills).toEqual(['CL.next_step']);
  });

  it('caps a final recommendation in stage 1 at 40% of stage 1', () => {
    const steps = run(cl4);
    const r = applyGrade(cl4, steps, false, allPass(cl4, { family: 'New-club costs', red_flags: { final_recommendation: { pass: true, evidence: firstSentence(answerText(steps[0].response)) } } }));
    expect(r.score).toBeCloseTo(0.6 * 0.4 + 0.4, 9);
  });

  it('classifies the step in a call that sees only stage 1, with next-step families', async () => {
    const steps = run(cl4);
    const family = buildFamilyBlock({ key: 'answer', item: cl4, steps });
    expect(family).toContain('<step_families>\n- New-club costs:');
    expect(family).toContain('(none: only classify the next step)');
    expect(family).not.toContain(cl4.extras.new_fact as string);
    expect(family).not.toContain('older clubs\' costs per member are flat, so the rise');
    const seen: string[] = [];
    const call: CallModel = async (system, user) => {
      seen.push(system);
      const isFamily = user.includes('only classify');
      const checks = isFamily ? [] : cl4.checks.map(c => ({ check_id: c.check_id, pass: true, evidence: firstSentence(answerText(steps[c.step].response)) }));
      return { output: { items: [{ item_key: 'answer', checks, red_flags: isFamily ? [] : [{ id: 'final_recommendation', present: false, evidence: '' }], hypothesis_family: 'New-club costs', backup_family: null, injection_suspected: false }] }, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
    };
    const out = await gradeSet([{ key: 'a', item: cl4, steps }], call);
    expect(seen).toHaveLength(2);
    for (const s of seen) expect(s).toContain('Next-step items: the item lists next-step families in <step_families>.');
    expect(out.grades.get('a')!.family).toBe('New-club costs');
  });

  it('never sends the families, the new fact or a keep/change key to the client', () => {
    const pub = JSON.stringify(toPublicItem(cl4, 2));
    for (const f of families) expect(pub).not.toContain(f.family);
    expect(pub).not.toContain('6 newest clubs opened');
    expect(pub).toContain('Keep my next step');
  });
});

describe('chartText', () => {
  it('reads a table chart and footnotes', () => {
    const spec = ChartSpecSchema.parse({ type: 'table', title: 'Stores', table: { columns: ['Region', 'Stores'], rows: [['North', 12]] }, footnotes: ['2025 only'] });
    expect(chartText(spec)).toBe('Title: Stores\nChart type: table\nRegion | Stores\nNorth | 12\nFootnote: 2025 only');
  });
});

describe('P1 items on disk', () => {
  it('parse, and never reuse another EX-4 or EX-5 chart title within a drill', () => {
    const items = loadAuthoredItems().filter(i => ['EX-4', 'EX-5', 'CL-4'].includes(i.drill_id));
    for (const i of items) expect(() => ItemSchema.parse(i)).not.toThrow();
    const titles = items.filter(i => i.drill_id === 'EX-4').map(i => i.exhibit!.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(defendParts(ex4)).toBeNull();
  });
});

describe('the grading guide', () => {
  it('holds every P1 grader rule word for word (docs/drills-grading-guide.md)', () => {
    const guide = fs.readFileSync(path.join(process.cwd(), 'docs/drills-grading-guide.md'), 'utf-8');
    for (const rule of [...EX4_GRADING_RULES, ...CL4_GRADING_RULES, ...EX5_GRADING_RULES, ...EX4_DEFEND_GRADING_RULES]) expect(guide).toContain(rule);
  });
});
