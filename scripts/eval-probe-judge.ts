// Measures the two Haiku checks (probe-answer judge, structure check) on the
// hand-labelled set (tests/orchestrator/fixtures/probe-judge-labelled.json).
// Prints a confusion matrix per check and every miss. Spends ≈$0.03 of Haiku.
//
//   npx tsx --env-file=.env.local scripts/eval-probe-judge.ts

import labelled from '@/tests/orchestrator/fixtures/probe-judge-labelled.json';
import { judgeProbeAnswer, judgeStructureGiven } from '@/lib/orchestrator/pressure-test';

type Tally = { tp: number; fp: number; tn: number; fn: number; nulls: number; misses: string[] };
const tally = (): Tally => ({ tp: 0, fp: 0, tn: 0, fn: 0, nulls: 0, misses: [] });
function record(t: Tally, id: string, expected: boolean, got: boolean | null, borderline: boolean, reason: string) {
  if (got === null) { t.nulls++; t.misses.push(`${id}: NO VERDICT`); return; }
  if (got && expected) t.tp++; else if (!got && !expected) t.tn++; else if (got) t.fp++; else t.fn++;
  if (got !== expected) t.misses.push(`${id}${borderline ? ' (borderline)' : ''}: expected ${expected}, got ${got} — ${reason}`);
}
function report(name: string, t: Tally) {
  const n = t.tp + t.fp + t.tn + t.fn + t.nulls;
  console.log(`\n${name}: ${t.tp + t.tn}/${n} correct  (answered/given=true: ${t.tp} hit, ${t.fn} missed; =false: ${t.tn} hit, ${t.fp} wrongly true; ${t.nulls} no verdict)`);
  for (const m of t.misses) console.log('  miss', m);
}

const probe = tally();
const structure = tally();
await Promise.all([
  ...labelled.probeAnswers.map(async c => {
    const v = await judgeProbeAnswer({ probe: c.probe, replies: [c.reply], timeoutMs: 20000 });
    record(probe, c.id, c.answered, v?.answered ?? null, c.borderline, v?.reason ?? '');
  }),
  ...labelled.structureGiven.map(async c => {
    const v = await judgeStructureGiven({ replies: c.replies, timeoutMs: 20000 });
    record(structure, c.id, c.given, v?.given ?? null, c.borderline, v?.reason ?? '');
  }),
]);
report('probe-answer judge', probe);
report('structure check', structure);
