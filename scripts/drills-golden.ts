// The grading release gate (docs/prd-drills.md "Grading quality"): grades the
// human-graded answers in /drill-golden and reports, per check, how often the
// grader agrees with the human. Fails if any check is under 90%.
//
//   npm run drills:golden                 all drills
//   npm run drills:golden -- --drill PS-3 one drill
//
// Costs real money (Haiku, roughly a dollar for a full run of ~120 answers).
import fs from 'fs';
import path from 'path';
import { GoldenAnswerSchema, type GoldenAnswer } from '@/lib/drills/content-import';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';
import { codeChecks } from '@/lib/drills/grading/apply';
import { gradeSet, type GradingEntry } from '@/lib/drills/grading/grader';
import { itemSteps, type StepResult } from '@/lib/drills/sets/scoring';

const GATE = 0.9;
const MIN_ANSWERS = 30;
const BATCH = 4;   // answers per call, like a drill set
const only = process.argv.includes('--drill') ? process.argv[process.argv.indexOf('--drill') + 1] : null;

const readDir = <T>(dir: string, parse: (raw: unknown) => T): T[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d =>
    fs.readdirSync(path.join(dir, d.name)).filter(f => f.endsWith('.json')).map(f => parse(JSON.parse(fs.readFileSync(path.join(dir, d.name, f), 'utf-8'))))) : [];

const items = new Map(readDir('drill-items', raw => ItemSchema.parse(raw)).map(i => [i.item_id, i]));
const golden = readDir('drill-golden', raw => GoldenAnswerSchema.parse(raw) as GoldenAnswer).filter(g => !only || g.drill_id === only);
if (golden.length === 0) { console.log('No graded answers found in /drill-golden.'); process.exit(0); }

// cover_3 and driver_2 are one check type each, whatever the item.
const kind = (id: string) => id.replace(/_\d+$/, '_*');
const toSteps = (item: Item, g: GoldenAnswer): StepResult[] => itemSteps(item).map((s, i) => ({
  type: s.type, weight: s.weight, score: 0, skills: [], tag: null, response: g.responses[i] ?? { type: 'empty' }, pending: true,
}));

async function main() {
  const tally = new Map<string, { agree: number; total: number }>();
  const disagreements: string[] = [];
  let cost = 0, calls = 0;
  const count = (drill: string, id: string, agree: boolean, detail: string) => {
    const key = `${drill} ${id}`;
    const t = tally.get(key) ?? { agree: 0, total: 0 };
    tally.set(key, { agree: t.agree + (agree ? 1 : 0), total: t.total + 1 });
    if (!agree) disagreements.push(detail);
  };

  for (const drill of [...new Set(golden.map(g => g.drill_id))].sort()) {
    const answers = golden.filter(g => g.drill_id === drill);
    for (let i = 0; i < answers.length; i += BATCH) {
      const batch = answers.slice(i, i + BATCH);
      const entries: GradingEntry[] = batch.map(g => {
        const item = items.get(g.item_id);
        if (!item) throw new Error(`${g.answer_id}: no item ${g.item_id}`);
        return { key: g.answer_id, item, steps: toSteps(item, g) };
      });
      const result = await gradeSet(entries);
      cost += result.cost_usd; calls += result.usage.calls;
      for (const e of entries) {
        const g = batch.find(b => b.answer_id === e.key)!;
        const grade = result.grades.get(e.key)!;
        const code = codeChecks(e.item, e.steps);
        for (const [id, human] of Object.entries(g.labels)) {
          const machine = (code.checks[id] ?? grade.checks[id])?.pass ?? false;
          count(drill, kind(id), machine === human, `${g.answer_id} ${id}: human ${human ? 'Y' : 'N'}, grader ${machine ? 'Y' : 'N'}${grade.checks[id]?.evidence ? ` ("${grade.checks[id].evidence}")` : ''}`);
        }
        for (const [id, human] of Object.entries(g.red_flags)) {
          const machine = (code.red_flags[id] ?? grade.red_flags[id])?.pass ?? false;
          count(drill, `red flag ${id}`, machine === human, `${g.answer_id} red flag ${id}: human ${human ? 'Y' : 'N'}, grader ${machine ? 'Y' : 'N'}`);
        }
        if (drill === 'HY-2' && g.family) {
          count(drill, 'hypothesis family', (grade.family ?? 'other').toLowerCase() === g.family.toLowerCase(), `${g.answer_id} family: human ${g.family}, grader ${grade.family}`);
        }
      }
    }
  }

  let failed = false;
  console.log('\nAgreement with human grading, per check:\n');
  for (const [key, t] of [...tally].sort()) {
    const share = t.agree / t.total;
    const pass = share >= GATE;
    failed ||= !pass;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${key.padEnd(46)} ${(share * 100).toFixed(0).padStart(3)}%  (${t.agree}/${t.total})`);
  }
  for (const drill of [...new Set(golden.map(g => g.drill_id))]) {
    const n = golden.filter(g => g.drill_id === drill).length;
    if (n < MIN_ANSWERS) console.log(`\nnote: ${drill} has ${n} graded answers; the gate needs at least ${MIN_ANSWERS}.`);
  }
  if (disagreements.length) console.log(`\nDisagreements:\n- ${disagreements.join('\n- ')}`);
  console.log(`\n${calls} grading calls, $${cost.toFixed(4)}`);
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
