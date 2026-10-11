// Grades every AI-graded D2 item's own model answer against its key, with the
// real grader, and reports any that score below 100%: a model answer that
// misses its own key means the key or the model answer is wrong. QN-5 and
// the code-settled checks are covered by tests/drills/model-answers.test.ts.
//
//   npm run drills:models                 PS-3, HY-2, SY-2 and CL-3
//   npm run drills:models -- --drill PS-3 one drill
//
// Costs real money (Haiku, roughly 15 cents for all 150 items).
import fs from 'fs';
import path from 'path';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';
import { applyGrade } from '@/lib/drills/grading/apply';
import { gradeSet, type GradingEntry } from '@/lib/drills/grading/grader';
import { modelAnswerSteps } from '@/lib/drills/model-answers';
import { scoreStep, type StepResult } from '@/lib/drills/sets/scoring';

const AI_DRILLS = ['PS-3', 'HY-2', 'SY-2', 'CL-3'];
// Answers per grading call: 4 like a drill set, or --batch 1 to grade each alone.
const BATCH = process.argv.includes('--batch') ? Number(process.argv[process.argv.indexOf('--batch') + 1]) : 4;
const only = process.argv.includes('--drill') ? process.argv[process.argv.indexOf('--drill') + 1] : null;

const items: Item[] = (only ? [only] : AI_DRILLS).flatMap(d => {
  const dir = path.join('drill-items', d);
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => ItemSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))));
});

const steps = (item: Item): StepResult[] => {
  const out: StepResult[] = [];
  modelAnswerSteps(item).forEach((r, i) => out.push(scoreStep(item, i, r, false, out)));
  return out;
};

async function main() {
  const misses: string[] = [];
  let cost = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const entries: GradingEntry[] = items.slice(i, i + BATCH).map(item => ({ key: item.item_id, item, steps: steps(item) }));
    const result = await gradeSet(entries);
    cost += result.cost_usd;
    for (const e of entries) {
      const r = applyGrade(e.item, e.steps, false, result.grades.get(e.key)!);
      if (r.score < 1 - 1e-9) {
        const failed = r.check_results.checks.filter(c => !c.pass).map(c => c.check_id);
        const flags = r.check_results.red_flags.filter(f => f.present).map(f => `red flag ${f.id}`);
        misses.push(`${e.item.item_id} (${e.item.status}): ${Math.round(r.score * 100)}%, ${[...failed, ...flags].join(', ')}`);
      }
    }
  }
  console.log(`${items.length} model answers graded, $${cost.toFixed(4)}`);
  if (misses.length) {
    console.log(`\n${misses.length} below 100%:\n- ${misses.join('\n- ')}`);
    process.exitCode = 1;
  } else console.log('all score 100%');
}

main().catch(e => { console.error(e); process.exit(1); });
