// One recorded candidate message through the math checker, with the equations
// and answer sheet `checkerEquations` asks for (Phase 1 item E, Lorenzo's
// ruling of 27 Oct). It prints what the checker heard, what **code** made of
// it, and — the point of the exercise — whether the line the run actually spoke
// would still go out.
//
// It exists because the three stale lines left on batch 39 are not in
// `evals/math-checker-labels.json`, so `eval-math-checker.ts` cannot reach
// them: they are named by run and turn.
//
//   npx tsx scripts/checker-equations-probe.ts --dry --at=c82e7bd7:26,99dd37d1:24
//   LLM_BUDGET_USD=2 LLM_BUDGET_FILE=<f> npx tsx --env-file=<main>/.env.local \
//     scripts/checker-equations-probe.ts --at=c82e7bd7:26 [--off] [--out=<file.jsonl>]
//
// `--at` is <run id suffix>:<turn>, the turn as the corpus numbers it (the
// post-wave report's t-numbers are the replay's, one higher). `--off` runs the
// same message with the switch off, for the before/after pair. Paid: one call
// per `--at`.
import { appendFileSync } from 'node:fs';
import { loadCorpus, type CorpusRun } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { requireRunBudget } from '@/lib/llm-budget';
import { mathCheckerConfig } from '@/lib/models';
import { costOf } from '@/lib/llm-pricing';
import { switchOn } from '@/lib/cases/engine-switches';
import {
  checkMathClaims, vetCheckerClaims, statesQuantitativeClaim,
  buildCheckerSystem, buildCheckerUser,
  type CheckerInput, type CheckerTurn,
} from '@/lib/orchestrator/math-checker';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string) => process.argv.includes(`--${name}`);
const ROOT = arg('root') ?? process.env.CORPUS_ROOT ?? 'Case Interview Runs';
const CONFIG = mathCheckerConfig(arg('arm') ?? 'sonnet55-medium');
const OUT = arg('out');

type At = { run: string; t: number };
const targets: At[] = (arg('at') ?? '').split(',').filter(Boolean).map(s => {
  const [run, t] = s.split(':');
  return { run, t: Number(t) };
});

type Item = { at: At; run: CorpusRun; input: CheckerInput };

function items(): Item[] {
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const out: Item[] = [];
  for (const at of targets) {
    const run = runs.find(r => r.id.endsWith(at.run) || r.id.includes(at.run));
    if (!run) { console.log(`!! no run matching ${at.run}`); continue; }
    const caseData = getCaseById(run.caseId);
    const transcript: CheckerTurn[] = [{ role: 'interviewer', text: caseData.prompt }];
    let found: Item | null = null;
    for (const t of run.turns) {
      if (t.t === at.t && t.candidateText) {
        found = { at, run, input: { revealedIds: t.revealedBefore, shownExhibitIds: t.shownBefore, transcript: [...transcript], message: t.candidateText } };
        break;
      }
      if (t.candidateText) transcript.push({ role: 'candidate', text: t.candidateText });
      if (t.heard) transcript.push({ role: 'interviewer', text: t.heard });
    }
    if (!found) { console.log(`!! ${run.id} has no candidate turn ${at.t}`); continue; }
    out.push(found);
  }
  return out;
}

async function main(): Promise<void> {
  const list = items();
  for (const it of list) {
    const caseData = getCaseById(it.run.caseId);
    const sys = buildCheckerSystem(caseData as never);
    const user = buildCheckerUser(caseData as never, it.input);
    console.log(`\n=== ${it.run.id.slice(-8)} t${it.at.t} (${it.run.caseId}) — switch ${switchOn(caseData, 'checkerEquations') ? 'ON' : 'off'}`);
    console.log(`gate: ${statesQuantitativeClaim(it.input.message) ? 'states a quantitative claim' : 'NOT GATED — the checker would not run'}`);
    console.log(`message: ${it.input.message.replace(/\s+/g, ' ').slice(0, 500)}`);
    if (has('dry')) {
      // The prefix is cached across the messages of a session; priced here as a
      // fresh write, which is the ceiling.
      const inTok = Math.ceil((sys.length + user.length) / 4);
      console.log(`dry: ~${inTok} input tokens, ~2,000 output → ~$${costOf({ model: CONFIG.model, inputTokens: inTok, outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 }).toFixed(4)}`);
      continue;
    }
    let usd = 0;
    const r = await checkMathClaims({
      caseData: caseData as never, input: it.input, config: CONFIG,
      onUsage: u => { usd += costOf(u); },
    });
    const vetted = vetCheckerClaims(r.claims, {
      caseData: caseData as never, revealedIds: it.input.revealedIds, shownExhibitIds: it.input.shownExhibitIds,
      candidateTexts: [...it.input.transcript.filter(t => t.role === 'candidate').map(t => t.text), it.input.message],
      answerSheet: r.answerSheet,
    });
    console.log(`model ${r.model} · ${r.latencyMs}ms · $${usd.toFixed(4)}`);
    for (const e of r.equations ?? []) console.log(`  EQUATION [${e.verdict}] ${e.expression}  (computed ${e.computed})${e.why ? ` — ${e.why}` : ''}\n      "${e.quoted}"`);
    for (const a of r.answerSheet ?? []) console.log(`  SHEET ${a.label} = ${a.value}${a.scale === 'none' ? '' : ` ${a.scale}`}${a.unit}${a.supersedes ? ` (was ${a.supersedes})` : ' (new)'} — "${a.quoted}"`);
    for (const v of vetted) {
      console.log(`  CLAIM [${v.verdict}${v.flag ? ', FLAG' : ''}] ${v.quantity}: ${v.candidateValue} (correct ${v.correctValue ?? `${v.correctLow}–${v.correctHigh}`}, ${v.confidence})`);
      console.log(`      span: ${v.span.replace(/\s+/g, ' ').slice(0, 180)}`);
      if (v.probeLine) console.log(`      PROBE: ${v.probeLine}`);
      if (v.correctionLine) console.log(`      CORRECTION: ${v.correctionLine}`);
      if (v.pointerLine) console.log(`      POINTER: ${v.pointerLine}`);
      for (const n of v.vetNotes) console.log(`      note: ${n}`);
    }
    if (OUT) appendFileSync(OUT, JSON.stringify({ run: it.run.id, t: it.at.t, on: switchOn(caseData, 'checkerEquations'), latencyMs: r.latencyMs, usd, equations: r.equations, answerSheet: r.answerSheet, claims: vetted }) + '\n');
  }
}

if (!has('dry')) requireRunBudget('checker-equations-probe');
void main();
