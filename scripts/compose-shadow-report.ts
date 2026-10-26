// The composer in shadow against today's composition (Phase 2 C1): every `compose_shadow` row under the roots given
// (replays run with `composeShadow` on). Free.
//
//   npx tsx scripts/compose-shadow-report.ts <root> [<root> …] [--examples=3]
//
// How many turns the four fixed slots would change and how (setup moved, corrections moved, questions withheld by
// Q7, rewrites withheld by Q6), the turn lint today vs composed per rule, and how many moves the stream would already
// have delivered (they could not move without holding the setup sentence, design §3.3).
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readTurnFile } from '@/lib/eval/turn-file';
import { LINT_RULES, type LintViolation } from '@/lib/orchestrator/turn-lint';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const EXAMPLES = Number(arg('examples') ?? 3);
const roots = process.argv.slice(2).filter(a => !a.startsWith('--'));
function turnFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? turnFiles(p) : f.endsWith('.turns.jsonl.gz') ? [p] : []; });
}
type Row = { changed: boolean; composed: string; moves: { setupMoved: string[]; correctionsMoved: number; questionsWithheld: string[]; rewriteWithheld: string[] }; deliveredMoved: string[]; lintToday: LintViolation[]; lintComposed: LintViolation[] };
let turns = 0, rows = 0, changed = 0, failed = 0, setup = 0, corr = 0, qw = 0, rw = 0, delivered = 0;
const today = new Map<string, number>(), composed = new Map<string, number>();
const ex: Record<string, string[]> = { setup: [], question: [], fixed: [], added: [] };
for (const root of roots) for (const f of turnFiles(root)) {
  const run = path.basename(f).replace(/^live-run-\d{4}-\d\d-\d\d-/, '').replace('.turns.jsonl.gz', '');
  for (const t of readTurnFile(f).turns) {
    turns++;
    const c = t.checks.find(x => x.check === 'compose_shadow');
    if (!c) continue;
    if (String(c.reason ?? '').startsWith('shadow failed')) { failed++; continue; }
    rows++;
    const d = c.detail as Row;
    if (d.changed) changed++;
    if (d.moves.setupMoved.length) { setup++; if (ex.setup.length < EXAMPLES) ex.setup.push(`${run} t${t.turnIndex + 1}: ${d.moves.setupMoved.join(' ').slice(0, 140)}`); }
    if (d.moves.correctionsMoved) corr++;
    if (d.moves.questionsWithheld.length) { qw++; if (ex.question.length < EXAMPLES) ex.question.push(`${run} t${t.turnIndex + 1}: withheld "${d.moves.questionsWithheld.join(' ').slice(0, 120)}"`); }
    if (d.moves.rewriteWithheld.length) rw++;
    if (d.deliveredMoved.length) delivered++;
    const a = new Set(d.lintToday.map(v => v.rule)), b = new Set(d.lintComposed.map(v => v.rule));
    for (const r of a) today.set(r, (today.get(r) ?? 0) + 1);
    for (const r of b) composed.set(r, (composed.get(r) ?? 0) + 1);
    for (const r of b) if (!a.has(r) && ex.added.length < EXAMPLES * 3) ex.added.push(`${r} ${run} t${t.turnIndex + 1}: ${d.composed.slice(0, 200)}`);
    for (const r of a) if (!b.has(r) && ex.fixed.length < EXAMPLES * 3) ex.fixed.push(`${r} ${run} t${t.turnIndex + 1}`);
  }
}
console.log(`# Composer shadow vs today\n\n${turns} interviewer turns; ${rows} composed in shadow; ${failed} failures.\n`);
console.log(`- turns the slots would change: **${changed}**`);
console.log(`- a setup sentence moved after the data: ${setup} (of them, already streamed when Settle ran: ${delivered})`);
console.log(`- a correction moved (Q5): ${corr}`);
console.log(`- an earlier question withheld (Q7, logged only): ${qw}`);
console.log(`- a rewritten sentence withheld whole (Q6): ${rw}\n`);
console.log('| rule | turns today | turns composed |\n|---|---:|---:|');
for (const r of LINT_RULES) console.log(`| ${r} | ${today.get(r) ?? 0} | ${composed.get(r) ?? 0} |`);
for (const [k, v] of Object.entries(ex)) { console.log(`\n**${k}**`); for (const x of v) console.log(`- ${x}`); }
