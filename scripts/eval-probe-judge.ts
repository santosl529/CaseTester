// Measures the two Haiku checks (probe-answer judge, structure check) on the
// hand-labelled sets: dev (tests/orchestrator/fixtures/probe-judge-labelled.json,
// the prompts were written against it) and held-out (probe-judge-heldout.json,
// frozen 8 Oct; never tune on it). Reports, per set and check: false unlocks
// (judged true, labelled false — data or the code-asked probe released too
// early), false rejections (judged false, labelled true), and no-verdicts
// (timeout / error / unparseable) separately; borderline items apart; latency.
//
//   npx tsx --env-file=.env.local scripts/eval-probe-judge.ts [--model=claude-haiku-4-5|claude-haiku-5-5] [--set=dev|heldout|both] [--out=file.json]
//
// Calls go through production's judge call on --model (judgeCallsFor), so the
// request settings are the migration's (lib/models.ts backgroundRequest).
import { writeFileSync } from 'node:fs';
import dev from '@/tests/orchestrator/fixtures/probe-judge-labelled.json';
import heldout from '@/tests/orchestrator/fixtures/probe-judge-heldout.json';
import { judgeProbeAnswer, judgeStructureGiven, judgeCallsFor } from '@/lib/orchestrator/pressure-test';
import { requireRunBudget } from '@/lib/llm-budget';
import { assertPriced } from '@/lib/llm-pricing';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const MODEL = arg('model') ?? 'claude-haiku-4-5';
const SET = arg('set') ?? 'both';
const OUT = arg('out');
const TIMEOUT_MS = 20000;   // eval only; production is 3s — latency is reported against it


// Fail fast on a bad id: the judge fails closed, so a refused call would
// otherwise read as a silent "no verdict".
assertPriced(MODEL);
const calls = judgeCallsFor(MODEL);
let inTok = 0, outTok = 0;
const latencies: number[] = [];
// The production call path and settings (lib/models.ts backgroundRequest), timed.
const timed = (f: typeof calls.probe) => async (prompt: string) => {
  const t0 = Date.now();
  try { return await f(prompt, u => { inTok += u.inputTokens; outTok += u.outputTokens; }); } finally { latencies.push(Date.now() - t0); }
};
const probeCall = timed(calls.probe), structureCall = timed(calls.structure);

type Row = { set: string; check: string; id: string; expected: boolean; got: boolean | null; borderline: boolean; synthetic: boolean; reason: string };
const rows: Row[] = [];
type Fixture = { probeAnswers: { id: string; probe: string; reply: string; answered: boolean; borderline: boolean; synthetic?: boolean }[]; structureGiven: { id: string; replies: string[]; given: boolean; borderline: boolean; synthetic?: boolean }[] };
const sets: [string, Fixture][] = ([['dev', dev], ['heldout', heldout]] as [string, Fixture][]).filter(([n]) => SET === 'both' || SET === n);

async function main() {
  const budget = requireRunBudget('eval-probe-judge');
  const tasks: (() => Promise<void>)[] = sets.flatMap(([set, f]) => [
    ...f.probeAnswers.map(c => async () => {
      const v = await judgeProbeAnswer({ probe: c.probe, replies: [c.reply], timeoutMs: TIMEOUT_MS }, probeCall);
      rows.push({ set, check: 'probe', id: c.id, expected: c.answered, got: v?.answered ?? null, borderline: c.borderline, synthetic: !!c.synthetic, reason: v?.reason ?? '' });
    }),
    ...f.structureGiven.map(c => async () => {
      const v = await judgeStructureGiven({ replies: c.replies, timeoutMs: TIMEOUT_MS }, structureCall);
      rows.push({ set, check: 'structure', id: c.id, expected: c.given, got: v?.given ?? null, borderline: c.borderline, synthetic: !!c.synthetic, reason: v?.reason ?? '' });
    }),
  ]);
  // 8 at a time, so latency reflects a lightly loaded call, not a burst.
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (next < tasks.length) await tasks[next++](); }));

  const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  console.log(`model ${MODEL} · ${rows.length} judgements · latency median ${pct(latencies, 0.5)}ms p90 ${pct(latencies, 0.9)}ms max ${Math.max(...latencies)}ms · over 3s ${latencies.filter(x => x > 3000).length} `);
  console.log(`tokens in ${inTok} out ${outTok} · ${budget.summary()}`);
  for (const [set] of sets) for (const check of ['probe', 'structure']) {
    const r = rows.filter(x => x.set === set && x.check === check);
    const clear = r.filter(x => !x.borderline), bl = r.filter(x => x.borderline);
    const count = (xs: Row[]) => ({
      n: xs.length, correct: xs.filter(x => x.got === x.expected).length,
      falseUnlock: xs.filter(x => x.got === true && !x.expected).length, negatives: xs.filter(x => !x.expected).length,
      falseReject: xs.filter(x => x.got === false && x.expected).length, positives: xs.filter(x => x.expected).length,
      noVerdict: xs.filter(x => x.got === null).length,
    });
    const c = count(clear), b = count(bl);
    console.log(`\n${set} · ${check === 'probe' ? 'probe-answer judge' : 'structure check'}: clear ${c.correct}/${c.n} · false unlocks ${c.falseUnlock}/${c.negatives} · false rejections ${c.falseReject}/${c.positives} · no verdict ${c.noVerdict}` +
      (bl.length ? ` | borderline ${b.correct}/${b.n}` : ''));
    for (const x of r.filter(x => x.got !== x.expected)) {
      const kind = x.got === null ? 'NO VERDICT' : x.got ? 'FALSE UNLOCK' : 'FALSE REJECTION';
      console.log(`  ${kind}${x.borderline ? ' (borderline)' : ''}${x.synthetic ? ' (synthetic)' : ''} ${x.id} — ${x.reason}`);
    }
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ model: MODEL, latencies, inTok, outTok, rows }, null, 1));
}

main();
