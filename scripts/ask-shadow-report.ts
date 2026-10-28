// The shadow decision against today's paths (Phase 2 S1, design §4.3): every `ask_decision_shadow` row under the
// roots given (replays run with `askDecisionShadow` on), tabulated. Free.
//
//   npx tsx scripts/ask-shadow-report.ts <root> [<root> …] [--examples=3] [--json=<out.json>]
//
// Per sub-ask: today's outcome (read from the decisions as rendered) → the shadow's, by disagreement class, by the
// rule that decided it and by where the sub-ask came from; Lorenzo's Q1 (the extra checks undeclared sub-asks would
// need) and Q2 (the head-noun test's effect on refusals).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readTurnFile } from '@/lib/eval/turn-file';
import { disagreement, type AskDecided } from '@/lib/orchestrator/ask-decision';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const EXAMPLES = Number(arg('examples') ?? 3);
const roots = process.argv.slice(2).filter(a => !a.startsWith('--'));

function turnFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? turnFiles(p) : f.endsWith('.turns.jsonl.gz') ? [p] : [];
  });
}
const inc = <K>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const table = (title: string, m: Map<string, number>) => {
  console.log(`\n### ${title}\n\n| | sub-asks |\n|---|---:|`);
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${v} |`);
};

type Row = AskDecided & { run: string; turn: number };
const rows: Row[] = [];
let turns = 0, shadowTurns = 0, failed = 0, offersDropped = 0;
for (const root of roots) for (const f of turnFiles(root)) {
  const run = path.basename(f).replace(/^live-run-\d{4}-\d\d-\d\d-/, '').replace('.turns.jsonl.gz', '');
  for (const t of readTurnFile(f).turns) {
    turns++;
    const c = t.checks.find(x => x.check === 'ask_decision_shadow');
    if (!c) continue;
    if (String(c.reason ?? '').startsWith('shadow failed')) { failed++; continue; }
    const d = c.detail as { asks: AskDecided[]; offersDropped: string[] };
    if (d.asks.length > 0) shadowTurns++;
    offersDropped += d.offersDropped.length;
    for (const a of d.asks) rows.push({ ...a, run, turn: t.turnIndex + 1 });
  }
}

console.log(`# Shadow decision vs today's paths\n\nRoots: ${roots.join(', ')}\n${turns} interviewer turns; ${shadowTurns} with sub-asks; ${rows.length} sub-asks; ${failed} shadow failures; ${offersDropped} offers today's code made (Q4: dropped).`);
const byClass = new Map<string, number>(), byRule = new Map<string, number>(), bySource = new Map<string, number>(), byOutcome = new Map<string, number>();
for (const r of rows) {
  inc(byClass, disagreement(r));
  inc(byRule, `${r.rule} ${r.outcome}`);
  inc(bySource, `${r.source}${r.declared ? ' (declared)' : ' (undeclared)'} — ${r.agree ? 'same' : 'differs'}`);
  inc(byOutcome, `today ${r.old} · shadow ${r.outcome}`);
}
const agree = rows.filter(r => r.agree).length;
console.log(`\n**Agree: ${agree} / ${rows.length}.** Disagree: ${rows.length - agree}.`);
table('Disagreement class (today → shadow)', byClass);
table('Shadow rule and outcome', byRule);
table('Where the sub-ask came from', bySource);

// Q1: the extra checks — undeclared sub-asks the shadow would check (and declared ones with no cached verdict).
const wouldCheck = rows.filter(r => r.wouldCheck);
const wcTurns = new Set(wouldCheck.filter(r => !r.declared).map(r => `${r.run}:${r.turn}`)).size;
console.log(`\n### Q1 — checks the shadow would add\n\nSub-asks with no cached verdict that a check would decide: ${wouldCheck.length} (undeclared ${wouldCheck.filter(r => !r.declared).length}, declared ${wouldCheck.filter(r => r.declared).length}). Turns with an undeclared one: ${wcTurns} of ${turns} interviewer turns (${(100 * wcTurns / Math.max(1, turns)).toFixed(1)}%). One Haiku call per sub-ask, run beside the model call; latency is not measurable offline (the replay serves no new verdict).`);

// Q2: the head-noun test on R6's refusals.
const refusals = rows.filter(r => r.outcome === 'refuse');
const headDefers = refusals.filter(r => r.withHead === 'defer');
console.log(`\n### Q2 — the head-noun test\n\nShadow refusals (R6): ${refusals.length}. With 4.4's head-noun test, ${headDefers.length} of them become deferrals.`);
for (const r of headDefers.slice(0, EXAMPLES * 3)) console.log(`- ${r.run} t${r.turn}: "${r.words.slice(0, 110)}"`);

// Examples per disagreement class.
console.log('\n### Examples by class');
const ex = new Map<string, Row[]>();
for (const r of rows.filter(x => !x.agree)) { const k = disagreement(r); ex.set(k, [...(ex.get(k) ?? []), r]); }
for (const [k, rs] of [...ex].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n**${k}** (${rs.length})`);
  for (const r of rs.slice(0, EXAMPLES)) console.log(`- ${r.run} t${r.turn} [${r.rule}${r.why ? ` ${r.why}` : ''}${r.cut ? ' +cut' : ''}] "${r.words.slice(0, 120)}" → ${r.items.join(',') || '—'} (today: ${r.oldItems.join(',') || r.old})`);
}
const out = arg('json');
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
