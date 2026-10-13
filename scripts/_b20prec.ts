import { readFileSync } from 'node:fs';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { checkRun, caught } from './fact-check';
const known = JSON.parse(readFileSync('evals/known-fact-faults.json', 'utf8'));
const key = JSON.parse(readFileSync('Case Interview Runs/test runs/batch-20-blind/KEY.json', 'utf8')).key as Record<string, { source: string }>;
const code = (run: string) => Object.entries(key).find(([, v]) => run.includes(v.source.replace('Case Interview Runs/', '').replace('.turns.jsonl.gz', '')))?.[0] ?? '?';
const { runs } = loadCorpus('Case Interview Runs', id => getCaseById(id) as never);
const b20 = runs.filter(r => r.group.startsWith('batch-20'));
const flags = b20.flatMap(checkRun);
const turns = new Map<string, typeof flags[number]>();
for (const f of flags) turns.set(`${f.run}|${f.t}|${f.rule}`, f);
const byRule: Record<string, { n: number; tp: number }> = {};
for (const f of turns.values()) {
  const k = known.filter((k: { run: string }) => f.run.includes(k.run));
  const match = k.some((k: { rule: string; t: number; run: string }) => caught({ ...k } as never, [f]));
  const r = (byRule[f.rule] ??= { n: 0, tp: 0 }); r.n++; if (match) r.tp++;
  if (!match) console.log(`UNGRADED ${code(f.run)} ${f.rule} t${f.t} ${f.sub} | ${f.cited.slice(0, 60)} | ${f.sentence.slice(0, 140)}`);
}
for (const [r, v] of Object.entries(byRule)) console.log(`${r}: ${v.tp}/${v.n} flagged turns match a graded fault`);
