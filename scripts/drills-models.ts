// Grades every AI-graded item's own model answer against its key, with the
// real grader, and reports any that score below 100%: a model answer that
// misses its own key means the key or the model answer is wrong. Items with a
// Defend follow-up are graded with it too (main answer plus model reply, as
// "<id>+defend"). QN-5 and the code-settled checks are covered by
// tests/drills/model-answers.test.ts.
//
//   npm run drills:models                 PS-3, HY-2, SY-2, CL-3, PS-4, HY-3 and SY-3
//   npm run drills:models -- --drill PS-3 one drill
//   npm run drills:models -- --runs 3     grade each three times, report scores that change
//   npm run drills:models -- --d5         only the Repair drills and the follow-ups
//
// Costs real money (Haiku, roughly 15 cents for all 150 items).
import fs from 'fs';
import path from 'path';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';
import { applyGrade } from '@/lib/drills/grading/apply';
import { gradeSet, type GradingEntry } from '@/lib/drills/grading/grader';
import { modelAnswerSteps } from '@/lib/drills/model-answers';
import { withDefend } from '@/lib/drills/defend';
import { scoreStep, type StepResult } from '@/lib/drills/sets/scoring';

const AI_DRILLS = ['PS-3', 'HY-2', 'SY-2', 'CL-3', 'PS-4', 'HY-3', 'SY-3'];
// Answers sent at once. Each is still graded in its own call, as in a drill set.
const BATCH = 4;
const only = process.argv.includes('--drill') ? process.argv[process.argv.indexOf('--drill') + 1] : null;
const RUNS = process.argv.includes('--runs') ? Number(process.argv[process.argv.indexOf('--runs') + 1]) : 1;
const D5_ONLY = process.argv.includes('--d5');

const items: Item[] = (only ? [only] : AI_DRILLS).flatMap(d => {
  const dir = path.join('drill-items', d);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => ItemSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))))
    .flatMap(item => (item.defend ? [item, { ...withDefend(item), item_id: `${item.item_id}+defend` }] : [item])) : [];
}).filter(i => !D5_ONLY || ['PS-4', 'HY-3', 'SY-3'].includes(i.drill_id) || i.item_id.endsWith('+defend'));

const steps = (item: Item): StepResult[] => {
  const out: StepResult[] = [];
  modelAnswerSteps(item).forEach((r, i) => out.push(scoreStep(item, i, r, false, out)));
  return out;
};

async function main() {
  const scores = new Map<string, number[]>();
  const misses = new Map<string, string>();
  let cost = 0;
  for (let run = 0; run < RUNS; run++) {
    for (let i = 0; i < items.length; i += BATCH) {
      const entries: GradingEntry[] = items.slice(i, i + BATCH).map(item => ({ key: item.item_id, item, steps: steps(item) }));
      const result = await gradeSet(entries);
      cost += result.cost_usd;
      for (const e of entries) {
        const r = applyGrade(e.item, e.steps, false, result.grades.get(e.key)!);
        scores.set(e.key, [...(scores.get(e.key) ?? []), r.score]);
        if (r.score < 1 - 1e-9) {
          const failed = r.check_results.checks.filter(c => !c.pass).map(c => c.check_id);
          const flags = r.check_results.red_flags.filter(f => f.present).map(f => `red flag ${f.id}`);
          misses.set(e.key, [misses.get(e.key), `run ${run + 1}: ${[...failed, ...flags].join(', ') || 'update decision'}`].filter(Boolean).join('; '));
        }
      }
    }
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const below = [...scores].filter(([, s]) => s.some(x => x < 1 - 1e-9));
  const unstable = [...scores].filter(([, s]) => s.some(x => Math.abs(x - s[0]) > 1e-9));
  console.log(`${items.length} model answers graded ${RUNS} time${RUNS > 1 ? 's' : ''}, $${cost.toFixed(4)}`);
  if (RUNS > 1) console.log(unstable.length ? `\n${unstable.length} changed score between runs:\n- ${unstable.map(([k, s]) => `${k}: ${s.map(pct).join(' / ')}`).join('\n- ')}` : '\nno score changed between runs');
  if (below.length) {
    console.log(`\n${below.length} below 100% in at least one run:\n- ${below.map(([k, s]) => `${k}: ${s.map(pct).join(' / ')} (${misses.get(k)})`).join('\n- ')}`);
    process.exitCode = 1;
  } else console.log('all score 100%');
}

main().catch(e => { console.error(e); process.exit(1); });
