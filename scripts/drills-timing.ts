// How long grading takes, per answer (feedback timing, 2026-10-18): grades a
// sample of the human-graded answers in /drill-golden, each alone and with
// the real grader exactly as a drill set does, and reports per drill the
// student's wait (the answer's calls run in parallel, so the slowest call)
// and each call's time: p50, p95 and max. A follow-up reply ("defend") is
// timed on its own call(s), since the main answer is graded while the
// student writes the reply.
//
//   npm run drills:timing                 9 answers per drill and part (~$0.50)
//   npm run drills:timing -- --per 5      fewer
//
// Costs real money; sequential, so no answer waits on another.
import fs from 'fs';
import path from 'path';
import { GoldenAnswerSchema, type GoldenAnswer } from '@/lib/drills/content-import';
import { ItemSchema } from '@/lib/drills/item-schema';
import { anthropicCaller, gradeAnswers, type CallModel } from '@/lib/drills/grading/grader';
import { itemSteps, type StepResult } from '@/lib/drills/sets/scoring';
import { withDefend } from '@/lib/drills/defend';

const per = process.argv.includes('--per') ? Number(process.argv[process.argv.indexOf('--per') + 1]) : 9;
const readDir = <T>(dir: string, parse: (raw: unknown) => T): T[] =>
  fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d =>
    fs.readdirSync(path.join(dir, d.name)).filter(f => f.endsWith('.json')).sort().map(f => parse(JSON.parse(fs.readFileSync(path.join(dir, d.name, f), 'utf-8')))));
const items = new Map(readDir('drill-items', raw => ItemSchema.parse(raw)).map(i => [i.item_id, i]));
const golden = readDir('drill-golden', raw => GoldenAnswerSchema.parse(raw) as GoldenAnswer);
const group = (g: GoldenAnswer) => `${g.drill_id}${g.part === 'defend' ? ' follow-up' : ''}`;

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : NaN;
};
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

async function main() {
  const real = anthropicCaller();
  const calls: { group: string; model: string; ms: number }[] = [];
  let current = '';
  const timed: CallModel = async (system, user, kind, model) => {
    const t = Date.now();
    try {
      return await real(system, user, kind, model);
    } finally {
      calls.push({ group: current, model: model ?? '?', ms: Date.now() - t });
    }
  };
  const waits = new Map<string, number[]>();
  let cost = 0, ungraded = 0;
  const groups = [...new Set(golden.map(group))].sort();
  for (const name of groups) {
    // Every few answers, so the sample spreads across items and answer types.
    const pool = golden.filter(g => group(g) === name);
    const step = Math.max(1, Math.floor(pool.length / per));
    const sample = pool.filter((_, i) => i % step === 0).slice(0, per);
    current = name;
    for (const g of sample) {
      const base = items.get(g.item_id)!;
      const item = g.part === 'defend' ? withDefend(base) : base;
      const steps: StepResult[] = itemSteps(item).map((s, i) => ({ type: s.type, weight: s.weight, score: 0, skills: [], tag: null, response: g.responses[i] ?? { type: 'empty' }, pending: true }));
      const t = Date.now();
      const r = await gradeAnswers([{ key: g.answer_id, item, steps, part: g.part }], timed);
      waits.set(name, [...(waits.get(name) ?? []), Date.now() - t]);
      cost += r.cost_usd;
      ungraded += r.ungraded.size;
    }
    const w = waits.get(name)!;
    console.log(`${name.padEnd(14)} ${String(w.length).padStart(2)} answers  wait p50 ${sec(pct(w, 0.5))}  p95 ${sec(pct(w, 0.95))}  max ${sec(Math.max(...w))}`);
  }
  console.log('\nPer call (each request):');
  for (const name of groups) {
    const byModel = new Map<string, number[]>();
    for (const c of calls.filter(c => c.group === name)) byModel.set(c.model, [...(byModel.get(c.model) ?? []), c.ms]);
    for (const [m, ms] of byModel) console.log(`${name.padEnd(14)} ${m.padEnd(18)} ${String(ms.length).padStart(3)} calls  p50 ${sec(pct(ms, 0.5))}  p95 ${sec(pct(ms, 0.95))}  max ${sec(Math.max(...ms))}`);
  }
  const all = [...waits.values()].flat();
  console.log(`\nAll answers: ${all.length}, wait p50 ${sec(pct(all, 0.5))}, p95 ${sec(pct(all, 0.95))}; ${calls.length} requests; ${ungraded} not graded; cost $${cost.toFixed(4)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
