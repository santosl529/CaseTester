import { describe, it, expect } from 'vitest';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { applyGrade, firstSentence, type ItemGrade } from '@/lib/drills/grading/apply';
import { D2_DRILLS, modelAnswerSteps } from '@/lib/drills/model-answers';
import { answerText, scoreItem, scoreStep, type StepResult } from '@/lib/drills/sets/scoring';
import type { Item } from '@/lib/drills/item-schema';

// Every D2 item's own model answer must score 100% against its key. Here:
// everything code settles (limits, the no-overlap gate, fact-sheet numbers,
// first-sentence quotes, critical-element caps, QN-5 in full), with the AI's
// checks taken as passed. `npm run drills:models` runs the AI's side.
const items = loadAuthoredItems().filter(i => D2_DRILLS.includes(i.drill_id));

const steps = (item: Item): StepResult[] => {
  const out: StepResult[] = [];
  modelAnswerSteps(item).forEach((r, i) => out.push(scoreStep(item, i, r, false, out)));
  return out;
};

// The grade a perfect grader would give the model answer.
const perfect = (item: Item, s: StepResult[]): ItemGrade => {
  const quote = (step: number) => firstSentence(answerText(s[step].response));
  const chosen = s.find(x => x.response.type === 'choice')?.response as { option_id: string } | undefined;
  const families = (item.extras.families as { family: string; action: string }[] | undefined) ?? [];
  return {
    checks: Object.fromEntries(item.checks.filter(c => c.detection === 'ai').map(c => [c.check_id, { pass: true, evidence: quote(c.step) }])),
    red_flags: Object.fromEntries(item.red_flags.filter(f => f.detection === 'ai').map(f => [f.id, { pass: false, evidence: '' }])),
    family: families.find(f => f.action === chosen?.option_id)?.family ?? null,
    injection_suspected: false, qa_flags: [],
  };
};

describe('every D2 model answer scores 100% against its own key', () => {
  it('has D2 items to check', () => expect(items.length).toBeGreaterThan(100));

  it('would catch a model answer that misses its key', () => {
    const ps3 = items.find(i => i.drill_id === 'PS-3')!;
    const thin = { ...ps3, model_answer: 'Demand: interest\nCosts: build' };
    const s = steps(thin);
    expect(applyGrade(thin, s, false, perfect(thin, s)).score).toBeLessThan(1);
  });

  for (const item of items) {
    it(`${item.item_id} v${item.version}`, () => {
      const s = steps(item);
      const score = item.drill_id === 'QN-5'
        ? scoreItem(item, { skipped: false, timedOut: false, steps: s }).score
        : applyGrade(item, s, false, perfect(item, s)).score;
      expect(score).toBeCloseTo(1, 9);
    });
  }
});
