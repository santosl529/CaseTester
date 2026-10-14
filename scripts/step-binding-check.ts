// Step-binding validation (Lorenzo, 13 Oct, after Larkspur: a case's step
// flags go live only at zero false flags on its transcripts). Runs the
// deterministic checks over every candidate message of the saved runs under
// --root, with what had been revealed when the message was written, and over
// the new-case e2e scripts' candidate messages (everything revealed). Lists
// every step and arithmetic flag — the claim, the bound step, and its label
// from --labels (real / false, hand-read) — and the precision per case. With
// --misquotes: every misquote flag instead (the quote grammar and the exact
// cell lookup), labelled from evals/misquote-labels.json; a ledger-line flag on a
// case whose lookup isn't live is listed as misquote-report-only.
//
//   npx tsx scripts/step-binding-check.ts "--root=Case Interview Runs/test runs/batch-22-larkspur-oct-13-runs-1-9" [--labels=evals/step-binding-labels.json] [--json]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getCaseById } from '@/lib/cases/loader';
import { checkCandidateMath } from '@/lib/orchestrator/recompute';
import { factBaseFor, findCandidateMisquotes } from '@/lib/orchestrator/fact-check';
import { readTurnFile } from '@/lib/eval/turn-file';
import { runFiles } from '@/lib/eval/run-corpus';

type Label = 'real' | 'false';
export type BindingFlag = { source: string; caseId: string; turn: number; kind: string; stepId: string; value: number; expected: number; span: string; label?: Label };

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const root = arg('root') ?? 'Case Interview Runs';
const MISQUOTES = process.argv.includes('--misquotes');
const labelsPath = arg('labels') ?? (MISQUOTES ? 'evals/misquote-labels.json' : 'evals/step-binding-labels.json');

// The e2e scripts (tests/orchestrator/new-cases-e2e.test.ts): the candidate's messages, the same for every new case.
const E2E_MESSAGES = [
  'I would split this into the economics of the decision, the market, and the risks, and work through each in order.',
  'I think I already see the answer.', 'I have enough to recommend now.', 'The numbers point one way; I can see the answer now.',
  'First, a phased approach; second, partner for reach; third, protect the core.', 'Sampling in stores, a trial-size bag, recipe ideas on the pack.',
  'I recommend going ahead with the option the numbers support, phased, because it clears the bar with room to spare — about 40% above it.',
  'The biggest risk is that the forecast is optimistic; I would test it with a pilot and a clear stop rule.',
  'I took it from the exhibits; on reflection it is closer to 10%, which still clears the bar.',
];

export const labelKey = (f: Pick<BindingFlag, 'source' | 'turn' | 'kind' | 'stepId' | 'value'>) => `${f.source}#t${f.turn}|${f.kind}|${f.stepId}|${f.value}`;

function flagsOf(source: string, caseId: string, turn: number, text: string, revealed: string[], shown: string[] = []): BindingFlag[] {
  if (MISQUOTES) {
    const c = getCaseById(caseId);
    return findCandidateMisquotes(text, factBaseFor(c as never), new Set(revealed), shown)
      .map(m => ({ source, caseId, turn, kind: m.reportOnly ? 'misquote-report-only' : 'misquote', stepId: m.items[0], value: parseFloat(m.cited.replace(/[^\d.]/g, '')) || 0, expected: 0, span: `${m.cited} — ${m.sentence}` }));
  }
  const m = checkCandidateMath(text, getCaseById(caseId), revealed);
  return [...m.reportOnly, ...m.flags]
    .filter(f => (f.kind ?? 'step') === 'step' || f.kind === 'arithmetic')
    .map(f => ({ source, caseId, turn, kind: f.kind ?? 'step', stepId: f.stepId, value: f.candidateValue, expected: f.expected, span: f.span }));
}

export function collect(): BindingFlag[] {
  const out: BindingFlag[] = [];
  for (const file of runFiles(root)) {
    const tf = file.replace(/\.json$/, '.turns.jsonl.gz');
    if (!existsSync(tf)) continue;
    const run = JSON.parse(readFileSync(file, 'utf8')) as { session: { caseId: string } };
    const source = path.relative(root, file).replace(/\.json$/, '');
    for (const t of readTurnFile(tf).turns) {
      const s = t.stateBefore as { revealedIds?: string[]; shownExhibitIds?: string[] };
      out.push(...flagsOf(source, run.session.caseId, t.turnIndex, t.candidateText, s.revealedIds ?? [], s.shownExhibitIds ?? []));
    }
  }
  for (const caseId of ['prof-002', 'entry-001', 'pricing-001', 'launch-001']) {
    const all = getCaseById(caseId).dataLedger.map(d => d.id);
    const shown = getCaseById(caseId).exhibits.map(e => e.id);
    E2E_MESSAGES.forEach((text, i) => out.push(...flagsOf(`e2e/${caseId}`, caseId, i, text, all, shown)));
  }
  return out;
}

if (process.argv[1]?.endsWith('step-binding-check.ts')) {
  const labels: Record<string, Label> = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, 'utf8')) : {};
  const flags = collect().map(f => ({ ...f, label: labels[labelKey(f)] }));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(flags, null, 1)); process.exit(0); }
  for (const f of flags) console.log(`${(f.label ?? '??').padEnd(5)} ${f.source.split('/').pop()} t${f.turn} ${f.kind} ${f.stepId}: ${f.value} (expected ${f.expected}) — "${f.span.slice(0, 140)}"`);
  const byCase = new Map<string, BindingFlag[]>();
  for (const f of flags) byCase.set(f.caseId, [...(byCase.get(f.caseId) ?? []), f]);
  console.log('');
  for (const [caseId, fs] of byCase) {
    const real = fs.filter(f => f.label === 'real').length, fals = fs.filter(f => f.label === 'false').length, un = fs.length - real - fals;
    console.log(`${caseId}: ${fs.length} flags — ${real} real, ${fals} false, ${un} unlabelled; precision ${real + fals ? Math.round(100 * real / (real + fals)) : '—'}%`);
  }
  for (const c of ['prof-002', 'entry-001', 'pricing-001', 'launch-001']) if (!byCase.has(c)) console.log(`${c}: 0 flags`);
}
