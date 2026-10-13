// The grading release gate (docs/prd-drills.md "Grading quality"): grades the
// human-graded answers in /drill-golden and reports, per check, how often the
// grader agrees with the human. Fails if any check is under 90%.
//
//   npm run drills:golden                 all drills
//   npm run drills:golden -- --drill PS-3 one drill (its Defend answers too)
//   npm run drills:golden -- --part defend  Defend answers only
//
// Defend answers (part "defend") are their own gate, "PS-3 defend": only the
// follow-up reply is graded and compared.
//
// Costs real money (Haiku, roughly a dollar for a full run of ~120 answers).
import fs from 'fs';
import path from 'path';
import { GoldenAnswerSchema, type GoldenAnswer } from '@/lib/drills/content-import';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';
import { applyGrade } from '@/lib/drills/grading/apply';
import { gradeSet, type GradingEntry } from '@/lib/drills/grading/grader';
import { itemSteps, type StepResult } from '@/lib/drills/sets/scoring';
import { withDefend } from '@/lib/drills/defend';

const GATE = 0.9;
const MIN_ANSWERS = 30;
// Answers sent at once. Each is still graded in its own call, as in a drill set.
const BATCH = 4;
const only = process.argv.includes('--drill') ? process.argv[process.argv.indexOf('--drill') + 1] : null;
const part = process.argv.includes('--part') ? process.argv[process.argv.indexOf('--part') + 1] : null;

const readDir = <T>(dir: string, parse: (raw: unknown) => T): T[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d =>
    fs.readdirSync(path.join(dir, d.name)).filter(f => f.endsWith('.json')).map(f => parse(JSON.parse(fs.readFileSync(path.join(dir, d.name, f), 'utf-8'))))) : [];

const items = new Map(readDir('drill-items', raw => ItemSchema.parse(raw)).map(i => [i.item_id, i]));
const golden = readDir('drill-golden', raw => GoldenAnswerSchema.parse(raw) as GoldenAnswer).filter(g => (!only || g.drill_id === only) && (!part || g.part === part));
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

  const gate = (g: GoldenAnswer) => `${g.drill_id}${g.part === 'defend' ? ' defend' : ''}`;
  for (const drill of [...new Set(golden.map(gate))].sort()) {
    const answers = golden.filter(g => gate(g) === drill);
    for (let i = 0; i < answers.length; i += BATCH) {
      const batch = answers.slice(i, i + BATCH);
      const entries: GradingEntry[] = batch.map(g => {
        const base = items.get(g.item_id);
        if (!base) throw new Error(`${g.answer_id}: no item ${g.item_id}`);
        const item = g.part === 'defend' ? withDefend(base) : base;
        return { key: g.answer_id, item, steps: toSteps(item, g), part: g.part };
      });
      const result = await gradeSet(entries);
      cost += result.cost_usd; calls += result.usage.calls;
      for (const e of entries) {
        const g = batch.find(b => b.answer_id === e.key)!;
        const grade = result.grades.get(e.key)!;
        // The final verdicts students would see: AI answers plus code rules.
        const final = applyGrade(e.item, e.steps, false, grade).check_results;
        const checkPass = new Map(final.checks.map(c => [c.check_id, c.pass]));
        const flagPresent = new Map(final.red_flags.map(f => [f.id, f.present]));
        for (const [id, human] of Object.entries(g.labels)) {
          const machine = checkPass.get(id) ?? false;
          count(drill, kind(id), machine === human, `${g.answer_id} ${id}: human ${human ? 'Y' : 'N'}, grader ${machine ? 'Y' : 'N'}${grade.checks[id]?.evidence ? ` ("${grade.checks[id].evidence}")` : ''}`);
        }
        for (const [id, human] of Object.entries(g.red_flags)) {
          const machine = flagPresent.get(id) ?? false;
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
  for (const drill of [...new Set(golden.map(gate))]) {
    const n = golden.filter(g => gate(g) === drill).length;
    if (n < MIN_ANSWERS) console.log(`\nnote: ${drill} has ${n} graded answers; the gate needs at least ${MIN_ANSWERS}.`);
  }
  if (disagreements.length) console.log(`\nDisagreements:\n- ${disagreements.join('\n- ')}`);
  console.log(`\n${calls} grading calls, $${cost.toFixed(4)}`);
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
