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
import { nextStepCueProblems, nextStepDecision } from '@/lib/drills/content-checks';
import { carryAuthorship, fingerprint, loadReviewRecords, recordReview, type ReviewRecords } from '@/lib/drills/review-records';

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

  it('classifies the step, and grades stage 1, in calls that see only stage 1', async () => {
    const steps = run(cl4);
    const family = buildFamilyBlock({ key: 'answer', item: cl4, steps });
    expect(family).toContain('<step_families>\n- New-club costs:');
    expect(family).toContain('(none: only classify the next step)');
    expect(family).not.toContain(cl4.extras.new_fact as string);
    expect(family).not.toContain('older clubs\' costs per member are flat, so the rise');
    const seen: string[] = [], users: string[] = [], models: string[] = [];
    const call: CallModel = async (system, user, _kind, model) => {
      seen.push(system); users.push(user); models.push(model!);
      const isFamily = user.includes('only classify');
      const asked = cl4.checks.filter(c => user.includes(`check_id "${c.check_id}"`));
      const checks = asked.map(c => ({ check_id: c.check_id, pass: true, evidence: firstSentence(answerText(steps[c.step].response)) }));
      const flags = !isFamily && user.includes('id "final_recommendation"') ? [{ id: 'final_recommendation', present: false, evidence: '' }] : [];
      return { output: { items: [{ item_key: 'answer', checks, red_flags: flags, hypothesis_family: 'New-club costs', backup_family: null, injection_suspected: false }] }, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
    };
    const out = await gradeSet([{ key: 'a', item: cl4, steps }], call);
    expect(seen).toHaveLength(3);
    for (const s of seen) expect(s).toContain('Next-step items: the item lists next-step families in <step_families>.');
    // Stage 1's call: its checks and red flag, no new fact, no stage 2.
    const stage1 = users.find(u => u.includes('check_id "one_step"'))!;
    expect(stage1).not.toContain(cl4.extras.new_fact as string);
    expect(stage1).not.toContain(answerText(steps[2].response));
    expect(stage1).not.toContain('<student_choice');
    expect(stage1).not.toContain('check_id "adapt_reason"');
    expect(stage1).not.toContain('Adapt reason:');
    expect(stage1).toContain('id "final_recommendation"');
    // The main call grades stage 2 only.
    const main = users.find(u => u.includes('check_id "adapt_reason"'))!;
    expect(main).toContain(cl4.extras.new_fact as string);
    expect(main).not.toContain('check_id "one_step"');
    expect(main).not.toContain('id "final_recommendation"');
    const g = out.grades.get('a')!;
    expect(g.family).toBe('New-club costs');
    expect(Object.keys(g.checks).sort()).toEqual(cl4.checks.map(c => c.check_id).sort());
    expect(Object.keys(g.red_flags)).toEqual(['final_recommendation']);
    // The approved models (Matt, 2026-11-12): stage 1 on Sonnet 5.5, stage 2 and the family on Haiku 5.5.
    const modelOf = (pred: (u: string) => boolean) => models[users.findIndex(pred)];
    expect(modelOf(u => u.includes('check_id "one_step"'))).toBe('claude-sonnet-5-5');
    expect(modelOf(u => u.includes('check_id "adapt_reason"'))).toBe('claude-haiku-5-5');
    expect(modelOf(u => u.includes('only classify'))).toBe('claude-haiku-5-5');
  });

  it('never sends the families, the new fact or a keep/change key to the client', () => {
    const pub = JSON.stringify(toPublicItem(cl4, 2));
    for (const f of families) expect(pub).not.toContain(f.family);
    expect(pub).not.toContain('6 newest clubs opened');
    expect(pub).toContain('Keep my next step');
  });
});

describe('grader models (Matt, 2026-11-12)', () => {
  it('sends EX-4 (main and follow-up) and EX-5 to Sonnet 5.5', async () => {
    const seen: string[] = [];
    const ex4d = withDefend(ex4);
    const call: CallModel = async (_system, user, kind, model) => {
      seen.push(model!);
      const item = user.includes('<original_answer>') ? ex5 : ex4d;
      const checks = item.checks.filter(c => user.includes(`check_id "${c.check_id}"`)).map(c => ({ check_id: c.check_id, pass: false, evidence: '' }));
      const flags = item.red_flags.filter(f => user.includes(`id "${f.id}"`)).map(f => ({ id: f.id, present: false, evidence: '' }));
      const out = { item_key: 'answer', checks, red_flags: flags, hypothesis_family: null, backup_family: null, injection_suspected: false, ...(kind === 'repair' && { new_flaw_tag: null, new_flaw_quote: '' }) };
      return { output: { items: [out] }, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
    };
    await gradeSet([{ key: 'x', item: ex5, steps: run(ex5) }], call);
    await gradeSet([{ key: 'y', item: ex4d, steps: run(ex4d) }], call);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (const m of seen) expect(m).toBe('claude-sonnet-5-5');
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

describe('CL-4 Keep or Change balance (content-checks.ts nextStepCueProblems)', () => {
  const pool = loadAuthoredItems().filter(i => i.drill_id === 'CL-4');
  const withDecision = (i: Item, d: 'Keep' | 'Change') => ({ ...i, model_answer: i.model_answer!.replace(/^Stage 2: (Keep|Change)\b/m, `Stage 2: ${d}`) });
  it('passes on the pool: Change is right in 40–60% of items, and no feature predicts it', () => {
    const change = pool.filter(i => nextStepDecision(i) === 'change').length;
    expect(change / pool.length).toBeGreaterThanOrEqual(0.4);
    expect(change / pool.length).toBeLessThanOrEqual(0.6);
    expect(nextStepCueProblems(pool)).toEqual([]);
  });
  it('fails a pool where Change is rarely right', () => {
    expect(nextStepCueProblems(pool.map(i => withDecision(i, 'Keep'))).join(' ')).toMatch(/Change is right in 0% of items/);
  });
  it('fails a pool where Change is right only at tier 3', () => {
    const skewed = pool.map(i => withDecision(i, i.tier === 3 || (i.tier === 2 && Number(i.item_id.slice(-2)) % 2 === 0) ? 'Change' : 'Keep'));
    expect(nextStepCueProblems(skewed).join(' ')).toMatch(/predictable from tier: it is right in 0% of the 13 that are "tier 1"/);
  });
  it('fails a pool where Change is right only when the new fact names a rival or the market', () => {
    const skewed = pool.map(i => withDecision(i, /\b(rivals?|competitors?|leaders|market|industry|other brands)\b/i.test(String(i.extras.new_fact)) ? 'Change' : 'Keep'));
    expect(nextStepCueProblems(skewed).join(' ')).toMatch(/predictable from who or what the new fact is about/);
  });
  it('needs a Keep or Change model answer', () => {
    const bad = { ...pool[0], model_answer: pool[0].model_answer!.replace(/Stage 2: (Keep|Change):/, 'Stage 2:') };
    expect(nextStepCueProblems([bad, ...pool.slice(1)])).toEqual([`${bad.item_id}: the model answer's stage 2 must open with "Keep:" or "Change:"`]);
  });
});

describe('HY-2 Keep, Revise or Drop balance (content-checks.ts nextStepCueProblems)', () => {
  const pool = loadAuthoredItems().filter(i => i.drill_id === 'HY-2' && !i.item_id.startsWith('example-'));
  // The 40 items live before the six drafts (hy2-0041–0046) were added.
  const live = pool.filter(i => Number(i.item_id.slice(4)) <= 40);
  const withDecision = (i: Item, d: string) => ({ ...i, model_answer: i.model_answer!.replace(/^Stage 2: (Keep|Revise|Drop)\b/m, `Stage 2: ${d}`) });
  it('passes on the pool: Revise or Drop right in 40–60%, each decision 20%+ and 2+ per tier', () => {
    expect(nextStepCueProblems(pool)).toEqual([]);
    for (const d of ['keep', 'revise', 'drop']) expect(pool.filter(i => nextStepDecision(i) === d).length / pool.length).toBeGreaterThanOrEqual(0.2);
  });
  it('failed on the 40 live items alone, which the 6 added items fix', () => {
    expect(live).toHaveLength(40);
    expect(nextStepCueProblems(live)).toEqual([
      'HY-2: Revise is right in 15% of items; each decision needs at least 20%',
      'HY-2: tier 1 has 1 item where Revise is right; each tier needs at least 2',
    ]);
  });
  it('fails a pool where Drop never comes up at tier 3', () => {
    const skewed = pool.map(i => (i.tier === 3 && nextStepDecision(i) === 'drop' ? withDecision(i, 'Revise') : i));
    expect(nextStepCueProblems(skewed)).toContain('HY-2: tier 3 has 0 items where Drop is right; each tier needs at least 2');
  });
  it('needs a Keep, Revise or Drop model answer', () => {
    const bad = withDecision(pool[0], 'Change');
    expect(nextStepCueProblems([bad, ...pool.slice(1)])).toEqual([`${bad.item_id}: the model answer's stage 2 must open with "Keep:" or "Revise:" or "Drop:"`]);
  });
});

describe('review records survive re-imports (review-records.ts)', () => {
  const passed = { ...cl4.authorship!, similarity_check: 'passed' as const, similarity_checked_at: '2026-11-12', similarity_method: 'web' as const };
  const checked: Item = { ...cl4, authorship: passed };
  const fresh = cl4; // a new build of the same CSV row: pending
  it('restores authorship after the item file was deleted', () => {
    const records: ReviewRecords = {};
    recordReview(records, checked);
    expect(fresh.authorship!.similarity_check).toBe('pending');
    expect(carryAuthorship(fresh, null, records)).toEqual(passed);
  });
  it('keeps the existing file\'s authorship for the same text, even with no record', () => {
    expect(carryAuthorship(fresh, checked, {})).toEqual(passed);
  });
  it('starts a changed item over, including a change only to its new fact', () => {
    const records: ReviewRecords = {};
    recordReview(records, checked);
    const rebuilt = importContent({ ...tables(), 'cl4-questions': tables()['cl4-questions'].map(r => ({ ...r, new_fact: `${r.new_fact} Rents also rose.` })) }, { includeExamples: true, sources })
      .items.find(i => i.item_id === cl4.item_id)!;
    expect(rebuilt.prompt).toBe(cl4.prompt);
    expect(rebuilt.model_answer).toBe(cl4.model_answer);
    expect(carryAuthorship(rebuilt, checked, records)!.similarity_check).toBe('pending');
  });
  it('restores the result for text the item had before', () => {
    const records: ReviewRecords = {};
    recordReview(records, checked);
    recordReview(records, { ...checked, prompt: `${cl4.prompt} Edited.`, authorship: { ...passed, similarity_checked_at: '2026-11-13' } });
    expect(records[cl4.item_id]).toHaveLength(2);
    expect(carryAuthorship(fresh, null, records)).toEqual(passed);
  });
  it('ignores the exhibit\'s key order', () => {
    const exhibit = ex4.exhibit!;
    const reordered = { ...ex4, exhibit: Object.fromEntries(Object.entries(exhibit).reverse()) as typeof exhibit };
    expect(fingerprint(reordered)).toBe(fingerprint(ex4));
  });
  it('records nothing for a pending, unreviewed draft', () => {
    const records: ReviewRecords = {};
    recordReview(records, fresh);
    expect(records).toEqual({});
  });
  it('holds every checked or reviewed item on disk, for its current text (run npm run drills:import to record)', () => {
    const records = loadReviewRecords();
    const missing = loadAuthoredItems().filter(i => i.generator === null && i.authorship && (i.authorship.similarity_check !== 'pending' || i.authorship.reviewed_by))
      .filter(i => !records[i.item_id]?.some(r => r.fingerprint === fingerprint(i) && JSON.stringify({ ...i.authorship, ...r.authorship }) === JSON.stringify(i.authorship)))
      .map(i => i.item_id);
    expect(missing).toEqual([]);
  });
});

describe('the grading guide', () => {
  it('holds every P1 grader rule word for word (docs/drills-grading-guide.md)', () => {
    const guide = fs.readFileSync(path.join(process.cwd(), 'docs/drills-grading-guide.md'), 'utf-8');
    for (const rule of [...EX4_GRADING_RULES, ...CL4_GRADING_RULES, ...EX5_GRADING_RULES, ...EX4_DEFEND_GRADING_RULES]) expect(guide).toContain(rule);
  });
});
