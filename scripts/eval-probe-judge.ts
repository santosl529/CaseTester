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
// The model is called here, not through production's haikuCall, so production
// keeps PROBE_JUDGE_MODEL_ID. Haiku 5.5: thinking explicitly disabled (it is on
// by default and would eat the 120-token budget), effort medium; no sampling
// params; no server-side fallback (Haiku 5.5 has none).
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync } from 'node:fs';
import dev from '@/tests/orchestrator/fixtures/probe-judge-labelled.json';
import heldout from '@/tests/orchestrator/fixtures/probe-judge-heldout.json';
import { judgeProbeAnswer, judgeStructureGiven } from '@/lib/orchestrator/pressure-test';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const MODEL = arg('model') ?? 'claude-haiku-4-5';
const SET = arg('set') ?? 'both';
const OUT = arg('out');
const TIMEOUT_MS = 20000;   // eval only; production is 3s — latency is reported against it

// $/MTok (≤100k-token prompts for Haiku 5.5).
const RATES: Record<string, { in: number; out: number }> = { 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 } };
if (!RATES[MODEL]) throw new Error(`unknown --model ${MODEL}`);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
let inTok = 0, outTok = 0;
const latencies: number[] = [];
const stops: Record<string, number> = {};
async function call(prompt: string): Promise<string> {
  const t0 = Date.now();
  const r = await client.messages.create({
    model: MODEL, max_tokens: 120, messages: [{ role: 'user', content: prompt }],
    ...(MODEL === 'claude-haiku-5-5' ? { thinking: { type: 'disabled' as const }, output_config: { effort: 'medium' as const } } : {}),
  });
  latencies.push(Date.now() - t0);
  inTok += r.usage.input_tokens; outTok += r.usage.output_tokens;
  stops[r.stop_reason ?? 'null'] = (stops[r.stop_reason ?? 'null'] ?? 0) + 1;
  return r.content.map(b => (b.type === 'text' ? b.text : '')).join('');
}

type Row = { set: string; check: string; id: string; expected: boolean; got: boolean | null; borderline: boolean; synthetic: boolean; reason: string };
const rows: Row[] = [];
type Fixture = { probeAnswers: { id: string; probe: string; reply: string; answered: boolean; borderline: boolean; synthetic?: boolean }[]; structureGiven: { id: string; replies: string[]; given: boolean; borderline: boolean; synthetic?: boolean }[] };
const sets: [string, Fixture][] = ([['dev', dev], ['heldout', heldout]] as [string, Fixture][]).filter(([n]) => SET === 'both' || SET === n);

const tasks: (() => Promise<void>)[] = sets.flatMap(([set, f]) => [
  ...f.probeAnswers.map(c => async () => {
    const v = await judgeProbeAnswer({ probe: c.probe, replies: [c.reply], timeoutMs: TIMEOUT_MS }, call);
    rows.push({ set, check: 'probe', id: c.id, expected: c.answered, got: v?.answered ?? null, borderline: c.borderline, synthetic: !!c.synthetic, reason: v?.reason ?? '' });
  }),
  ...f.structureGiven.map(c => async () => {
    const v = await judgeStructureGiven({ replies: c.replies, timeoutMs: TIMEOUT_MS }, call);
    rows.push({ set, check: 'structure', id: c.id, expected: c.given, got: v?.given ?? null, borderline: c.borderline, synthetic: !!c.synthetic, reason: v?.reason ?? '' });
  }),
]);
// 8 at a time, so latency reflects a lightly loaded call, not a burst.
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (next < tasks.length) await tasks[next++](); }));

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`model ${MODEL} · ${rows.length} judgements · latency median ${pct(latencies, 0.5)}ms p90 ${pct(latencies, 0.9)}ms max ${Math.max(...latencies)}ms · over 3s ${latencies.filter(x => x > 3000).length} · stop ${JSON.stringify(stops)}`);
console.log(`tokens in ${inTok} out ${outTok} · cost $${((inTok * RATES[MODEL].in + outTok * RATES[MODEL].out) / 1e6).toFixed(4)}`);
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
if (OUT) writeFileSync(OUT, JSON.stringify({ model: MODEL, latencies, inTok, outTok, stops, rows }, null, 1));
