// Turn shape over a set of runs (Phase 2 design §1 and §3.4): the turn lint's violations per rule, by turn kind, on
// every interviewer turn of every turn file under the roots given — the recorded corpus or a replay output. Free.
//
//   npx tsx scripts/turn-shape.ts <root> [<root> …] [--examples=3]
//
// The composer's baseline numbers: how often today's turns double a sentence (L1), leave "that figure" without its
// referent (L2), defer what they just released (L3), put data after the question (L4), ask none or several (L5), say
// data is still to come after giving it (L6), or quote a fragment (L7).
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readTurnFile } from '@/lib/eval/turn-file';
import { lintTurn, LINT_RULES, type LintRule } from '@/lib/orchestrator/turn-lint';
import { getCaseById } from '@/lib/cases/loader';
import { properNames } from '@/lib/orchestrator/request-signal';

const examplesArg = process.argv.find(a => a.startsWith('--examples='));
const EXAMPLES = examplesArg ? Number(examplesArg.slice(11)) : 3;
const roots = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (roots.length === 0) throw new Error('usage: turn-shape.ts <root> [<root> …]');

function turnFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? turnFiles(p) : f.endsWith('.turns.jsonl.gz') ? [p] : [];
  });
}

// The turn file's header carries no case id; the batch folder names the case (as the bank's slices do).
const CASE_OF: [RegExp, string][] = [[/aldermoor/, 'entry-001'], [/larkspur/, 'prof-002'], [/hollis-?bay/, 'launch-001'], [/quillpath/, 'pricing-001']];
const caseOfPath = (f: string) => CASE_OF.find(([re]) => re.test(f))?.[1] ?? 'prof-001';
type Ctx = Parameters<typeof lintTurn>[1];
const ctxCache = new Map<string, Ctx>();
function ctxFor(caseId: string): Ctx {
  if (!ctxCache.has(caseId)) {
    const c = getCaseById(caseId);
    const words = new Map(c.dataLedger.map(i => [i.id, [i.label, i.spoken ?? '', i.value]]));
    const titles = new Map(c.exhibits.map(e => [e.id, e.title]));
    ctxCache.set(caseId, { itemWords: id => words.get(id) ?? [], exhibitWords: id => [titles.get(id) ?? ''], caseNames: properNames(c.sttKeyterms) });
  }
  return ctxCache.get(caseId)!;
}

for (const root of roots) {
  const files = turnFiles(root);
  let turns = 0;
  const byRule = new Map<LintRule, number>(LINT_RULES.map(r => [r, 0]));
  const byKind = new Map<string, Map<LintRule, number>>();
  const examples = new Map<LintRule, string[]>();
  const l5 = new Map<string, number>();
  for (const f of files) {
    const { turns: ts } = readTurnFile(f);
    const ctx = ctxFor(caseOfPath(f));
    for (const t of ts) {
      turns++;
      const kind = String((t.checks.find(c => c.check === 'turn_kind')?.detail as { kind?: string } | undefined)?.kind ?? 'model');
      const seen = new Set<LintRule>();
      for (const v of lintTurn(t.delivered, { ...ctx, ended: t.ended })) {
        if (v.rule === 'L5') l5.set(v.detail ?? '?', (l5.get(v.detail ?? '?') ?? 0) + 1);
        if (seen.has(v.rule)) continue;
        seen.add(v.rule);
        byRule.set(v.rule, byRule.get(v.rule)! + 1);
        const k = byKind.get(kind) ?? new Map<LintRule, number>();
        k.set(v.rule, (k.get(v.rule) ?? 0) + 1);
        byKind.set(kind, k);
        const ex = examples.get(v.rule) ?? [];
        if (ex.length < EXAMPLES) ex.push(`${path.basename(f).replace('.turns.jsonl.gz', '')} t${t.turnIndex + 1}: ${v.sentence.slice(0, 160)}${v.detail ? ` [${v.detail}]` : ''}`);
        examples.set(v.rule, ex);
      }
    }
  }
  console.log(`\n## ${root}\n${files.length} runs, ${turns} interviewer turns (turns with the rule, deduplicated per turn)\n`);
  console.log(`| rule | turns | ${[...byKind.keys()].sort().join(' | ')} |`);
  console.log(`|---|---:|${[...byKind.keys()].map(() => '---:').join('|')}|`);
  for (const r of LINT_RULES) console.log(`| ${r} | ${byRule.get(r)} | ${[...byKind.keys()].sort().map(k => byKind.get(k)!.get(r) ?? 0).join(' | ')} |`);
  console.log(`\nL5 by question count: ${[...l5].sort().map(([n, c]) => `${n} → ${c}`).join(', ')}`);
  for (const r of LINT_RULES) for (const e of examples.get(r) ?? []) console.log(`- ${r} ${e}`);
}
