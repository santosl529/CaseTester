// Verified-figure stamps over every saved run (math checker, 13 Oct). For each
// candidate message in the corpus, recomputes what the live turn would stamp
// as VERIFIED (lib/orchestrator/recompute.ts verifiedForMessage) with the
// case data that run had revealed, and writes one JSON line per stamp — so a
// change to the stamping rules can be diffed against the previous code's
// output (--diff=<baseline.jsonl>). Free: no model call.
//
//   npx tsx scripts/replay-verified.ts --out=<file.jsonl>
//   npx tsx scripts/replay-verified.ts --out=<after.jsonl> --diff=<before.jsonl>
//   --flags-out=<file.jsonl> / --flags-diff=<before.jsonl>: the same for the flags
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { checkCandidateMath } from '@/lib/orchestrator/recompute';

const ROOT = 'Case Interview Runs';
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

type Stamp = { run: string; format: string; t: number; stepId: string; value: number; scope: string; workShown: boolean; span: string; text: string };

const { runs } = loadCorpus(arg('root') ?? ROOT, id => getCaseById(id) as never);
type FlagRow = { run: string; t: number; stepId: string; candidateValue: number; expected: number; span: string };
const stamps: Stamp[] = [];
const flagRows: FlagRow[] = [];
let messages = 0;
for (const run of runs) {
  const caseData = getCaseById(run.caseId);
  for (const turn of run.turns) {
    if (turn.seeded || !turn.candidateText) continue;
    messages++;
    const math = checkCandidateMath(turn.candidateText, caseData, turn.revealedBefore);
    for (const f of math.flags) flagRows.push({ run: run.id, t: turn.t, stepId: f.stepId, candidateValue: f.candidateValue, expected: f.expected, span: f.span });
    for (const v of math.verified) {
      stamps.push({ run: run.id, format: run.format, t: turn.t, stepId: v.stepId, value: v.value, scope: v.scope ?? 'claim', workShown: v.workShown, span: v.span, text: turn.candidateText });
    }
  }
}

const out = arg('out');
if (out) writeFileSync(out, stamps.map(s => JSON.stringify(s)).join('\n') + '\n');
const byKind = (list: Stamp[]) => list.reduce<Record<string, number>>((acc, s) => { const k = s.stepId.split(':')[0]; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
console.log(`${runs.length} runs, ${messages} candidate messages, ${stamps.length} stamps`, byKind(stamps));

const diff = arg('diff');
if (diff) {
  const key = (s: Stamp) => `${s.run}|${s.t}|${s.stepId}|${s.value}`;
  const before: Stamp[] = readFileSync(diff, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const now = new Set(stamps.map(key));
  const was = new Set(before.map(key));
  const removed = before.filter(s => !now.has(key(s)));
  const added = stamps.filter(s => !was.has(key(s)));
  const rescoped = stamps.filter(s => was.has(key(s)) && before.find(b => key(b) === key(s))?.scope !== s.scope);
  console.log(`kept ${before.length - removed.length}, removed ${removed.length}`, byKind(removed), `added ${added.length}`, byKind(added), `rescoped ${rescoped.length}`);
  for (const [label, list] of [['REMOVED', removed], ['ADDED', added]] as const) {
    for (const s of list) console.log(`${label} ${s.run} t${s.t} ${s.stepId} ${s.value} ws=${s.workShown ? 1 : 0} | ${s.span}`);
  }
}

const flagsOut = arg('flags-out');
if (flagsOut) writeFileSync(flagsOut, flagRows.map(s => JSON.stringify(s)).join('\n') + '\n');
console.log(`${flagRows.length} flags`);
const flagsDiff = arg('flags-diff');
if (flagsDiff) {
  const key = (f: FlagRow) => `${f.run}|${f.t}|${f.stepId}|${f.candidateValue}`;
  const before: FlagRow[] = readFileSync(flagsDiff, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const now = new Set(flagRows.map(key));
  const was = new Set(before.map(key));
  for (const f of before.filter(x => !now.has(key(x)))) console.log(`FLAG-REMOVED ${f.run} t${f.t} ${f.stepId} ${f.candidateValue} (exp ${f.expected}) | ${f.span}`);
  for (const f of flagRows.filter(x => !was.has(key(x)))) console.log(`FLAG-ADDED ${f.run} t${f.t} ${f.stepId} ${f.candidateValue} (exp ${f.expected}) | ${f.span}`);
}
