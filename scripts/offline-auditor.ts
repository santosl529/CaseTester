// The offline auditor (Phase 1 contract §5, Stream 1 task 3): Opus 5.5 reads one run — transcript, case ledger and the
// run's events — and lists the interviewer's faults in the fault bank's classes, with severities. PAID: every call
// goes through the run budget, so LLM_BUDGET_USD is required (and LLM_BUDGET_FILE to keep one cap across restarts).
//
//   npx tsx scripts/offline-auditor.ts --label=<l> --dry [--batches=…]       print the prompt sizes and a cost estimate; no call
//   npx tsx --env-file=.env.local scripts/offline-auditor.ts --label=<l> --run=<turn file under the corpus>   audit one run
//   npx tsx --env-file=.env.local scripts/offline-auditor.ts --label=<l> --batches=b36a,b36l,b37h,b37q,b38l [--jobs=3]
//   npx tsx scripts/offline-auditor.ts --label=<l> --report [--batches=…]     calibrate what's been audited against the hand
//                                                                           grades (the fault bank); writes --out-md
// A run already audited under the label is never audited again (its JSON is reused): a restart doesn't pay twice.
// Output: FAULT_BANK_OUT (default /Users/lorenzo/coding/personal-projects/CaseTester-proof-out)/auditor-<label>/.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SLICES, sliceOf, isReportRecord } from '@/lib/eval/fault-bank-build';
import { FaultRecordSchema, type FaultRecord } from '@/lib/eval/fault-bank';
import { readTurnFile } from '@/lib/eval/turn-file';
import { getCaseById } from '@/lib/cases/loader';
import { caseSection, transcriptSection, type CheckerVerdictEvent } from '@/lib/eval/auditor/input';
import { auditPrompt, auditRun, AUDITOR_MODEL_ID, type AuditResult } from '@/lib/eval/auditor/audit';
import { calibrate, FAMILIES, type Hand } from '@/lib/eval/auditor/calibrate';
import type { AuditFault } from '@/lib/eval/auditor/prompt';
import { requireRunBudget, BudgetExceededError } from '@/lib/llm-budget';
import { costOf } from '@/lib/llm-pricing';

const ROOT = process.env.REPLAY_ROOT ?? '/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs';
const OUT_BASE = process.env.FAULT_BANK_OUT ?? '/Users/lorenzo/coding/personal-projects/CaseTester-proof-out';
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);

type RunRef = { turnFile: string; tag: string; caseId: string; stem: string };

function runsOf(tags: string[]): RunRef[] {
  return tags.flatMap(tag => {
    const s = sliceOf(tag);
    const waveDir = path.join(ROOT, 'test runs', s.wave);
    return readdirSync(waveDir).filter(d => /^\d\d-/.test(d)).sort().flatMap(dir => {
      const f = readdirSync(path.join(waveDir, dir)).find(x => x.endsWith('.turns.jsonl.gz'));
      return f ? [{ turnFile: path.join('test runs', s.wave, dir, f), tag, caseId: s.caseId, stem: `${tag}-${dir.slice(0, 2)}-${f.replace(/^live-run-\d{4}-\d\d-\d\d-/, '').replace(/\.turns\.jsonl\.gz$/, '')}` }] : [];
    });
  });
}

function promptFor(r: RunRef): string {
  const { turns } = readTurnFile(path.join(ROOT, r.turnFile));
  const runJson = path.join(ROOT, r.turnFile.replace(/\.turns\.jsonl\.gz$/, '.json'));
  const events = existsSync(runJson) ? (JSON.parse(readFileSync(runJson, 'utf8')) as { events: { category: string; subtype: string; turnIndex: number; payloadJsonb: { claims?: CheckerVerdictEvent['claims'] } }[] }).events : [];
  // The verdict event's turnIndex is the candidate message's index in session turns; the turn record's is the same index.
  const verdicts = events.filter(e => e.category === 'math_checker' && e.subtype === 'verdict').map(e => ({ turnIndex: e.turnIndex, claims: e.payloadJsonb.claims ?? [] }));
  return auditPrompt(caseSection(getCaseById(r.caseId)), transcriptSection(turns, verdicts));
}

const usd = (r: AuditResult) => costOf({ model: AUDITOR_MODEL_ID, inputTokens: r.usage.input, outputTokens: r.usage.output, cacheReadTokens: r.usage.cacheRead, cacheWriteTokens: r.usage.cacheWrite });

async function pool<T>(items: T[], jobs: number, f: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(jobs, q.length) }, async () => { while (q.length) await f(q.shift()!); }));
}

function loadBank(): FaultRecord[] {
  return readdirSync('evals/fault-bank').filter(f => f.endsWith('.jsonl')).flatMap(f =>
    readFileSync(path.join('evals/fault-bank', f), 'utf8').split('\n').filter(Boolean).map(l => FaultRecordSchema.parse(JSON.parse(l))));
}

function report(out: string, runs: RunRef[], mdPath: string | undefined) {
  const bank = loadBank();
  const done = runs.filter(r => existsSync(path.join(out, `${r.stem}.json`)));
  const rows = done.map(r => {
    const a = JSON.parse(readFileSync(path.join(out, `${r.stem}.json`), 'utf8')) as { faults: AuditFault[]; usd: number; usage: AuditResult['usage'] };
    const hand: Hand[] = bank.filter(f => f.turnFile === r.turnFile && f.kind === 'fault' && !isReportRecord(f)).map(f => ({ id: f.id, turn: f.turn, assertions: f.assertions, cls: f.grade.class, severity: f.grade.severity }));
    return { r, a, hand };
  });
  const c = calibrate(rows.map(x => ({ hand: x.hand, predicted: x.a.faults })));
  const spent = rows.reduce((s, x) => s + x.a.usd, 0);
  const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(0)}% (${n}/${d})` : '—';
  const L = [`# Offline auditor — calibration (${path.basename(out)})`, '',
    `Opus 5.5 (\`${AUDITOR_MODEL_ID}\`, adaptive thinking, effort high) over ${done.length} of ${runs.length} runs; spent $${spent.toFixed(2)}. Hand grade = the fault bank's fault records for each run (report faults aside: the auditor reads the interview only). A prediction matches a hand fault within 2 turns (or inside its scope window): by class first, then by class family. Recall = matched hand faults ÷ hand faults; precision = matched predictions ÷ predictions. A prediction with no hand match may still be a real fault the hand grade didn't count.`, '',
    `**Detection (any class):** recall ${pct(c.detection.matchedHand, c.detection.hand)}, precision ${pct(c.detection.matchedPredicted, c.detection.predicted)}. **Severity agreement on matches:** ${pct(c.severityAgreement.agree, c.severityAgreement.of)}.`, '',
    '## By family', '', '| family | hand | predicted | recall | precision |', '|---|---:|---:|---:|---:|'];
  for (const [k, v] of Object.entries(c.byFamily).sort()) L.push(`| ${k} | ${v.hand} | ${v.predicted} | ${pct(v.matchedHand, v.hand)} | ${pct(v.matchedPredicted, v.predicted)} |`);
  L.push('', '## By class (class-level matches only)', '', '| class | family | hand | predicted | recall | precision |', '|---|---|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(c.byClass).sort()) L.push(`| ${k} | ${FAMILIES[k]} | ${v.hand} | ${v.predicted} | ${pct(v.matchedHand, v.hand)} | ${pct(v.matchedPredicted, v.predicted)} |`);
  L.push('', '## Per run', '', '| run | hand | predicted | in tokens | out tokens | $ |', '|---|---:|---:|---:|---:|---:|');
  for (const x of rows) L.push(`| ${x.r.stem} | ${x.hand.length} | ${x.a.faults.length} | ${x.a.usage.input} | ${x.a.usage.output} | ${x.a.usd.toFixed(3)} |`);
  const md = L.join('\n') + '\n';
  writeFileSync(path.join(out, 'calibration.md'), md);
  if (mdPath) writeFileSync(mdPath, md);
  console.log(md.split('\n## Per run')[0]);
}

async function main() {
  const label = arg('label');
  if (!label) throw new Error('--label=<label> is required');
  const out = path.join(OUT_BASE, `auditor-${label}`);
  if (path.resolve(out).startsWith(path.resolve(ROOT))) throw new Error('auditor output must be outside the corpus root');
  mkdirSync(out, { recursive: true });
  const single = arg('run');
  const runs = single ? runsOf(SLICES.map(s => s.tag)).filter(r => r.turnFile === single) : runsOf((arg('batches') ?? 'b36a,b36l,b37h,b37q,b38l').split(','));
  if (runs.length === 0) throw new Error('no runs');
  if (flag('report')) return report(out, runs, arg('out-md'));
  if (flag('dry')) {
    let chars = 0;
    for (const r of runs) { const p = promptFor(r); chars += p.length; console.log(`${r.stem}: ${p.length} chars ≈ ${Math.round(p.length / 3.6)} tokens`); }
    console.log(`${runs.length} runs, ≈ ${Math.round(chars / 3.6)} input tokens in all (≈ $${(chars / 3.6 / 1e6 * 4).toFixed(2)} of input at $4/MTok, before output)`);
    return;
  }
  const budget = requireRunBudget('offline-auditor');
  let stopped = false;
  await pool(runs, Number(arg('jobs') ?? 3), async r => {
    const file = path.join(out, `${r.stem}.json`);
    if (existsSync(file) || stopped) return;
    try {
      const res = await auditRun(promptFor(r));
      writeFileSync(file, JSON.stringify({ run: r.turnFile, ...res, usd: usd(res) }, null, 1));
      console.log(`${r.stem}: ${res.faults.length} faults · in ${res.usage.input} out ${res.usage.output} · $${usd(res).toFixed(3)} · ${(res.ms / 1000).toFixed(0)} s · ${budget.summary()}`);
    } catch (e) {
      if (e instanceof BudgetExceededError) { stopped = true; console.log(`[budget] stopped: ${e.message}`); return; }
      console.error(`${r.stem}: ${(e as Error).message}`);
    }
  });
  console.log(budget.summary());
  report(out, runs, arg('out-md'));
}

main().catch(e => { console.error(e); process.exit(1); });
