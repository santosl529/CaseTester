// The math checker's labelled set (math checker step 2, 13 Oct): candidate
// messages from saved runs, each labelled with what a correct checker does on
// it. Free — reads the corpus and the grading files, calls no model.
//
//   recall    a real math error the interviewer let pass: batch 20's graded D6
//             (grading.csv + KEY.json), batch 21's hand read and independent
//             re-grade, and the D6 detector's confirmed flags. Each carries the
//             wrong claim's figure(s) (`match`), so a hit is a flag on that
//             claim, not on any figure in the message.
//   precision messages a correct checker must not flag: every gated message of
//             the correct-math personas (Owen, Raj, the default candidate,
//             Anika) in batches 20–21, which were hand-graded turn by turn,
//             less the recall messages; and every message whose correct work
//             was doubted (D5 in batch 20's grades; batch 18's Owen t8 and
//             Camila t8). A flag on a precision message is a false flag unless
//             reading shows a real error the grading missed — every one is listed.
//
// Per message, not per run (Lorenzo, 13 Oct): a repeated error is an error in
// every message it appears in (the per-run D6 grading counts it once).
//
//   npx tsx scripts/build-math-labels.ts [--dump]   writes evals/math-checker-labels.json
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCorpus, type CorpusRun } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { checkMathTurn } from '@/lib/eval/math-check';
import { statesQuantitativeClaim } from '@/lib/orchestrator/math-checker';
import { MATH_LABEL_KEYS } from '@/evals/math-checker-label-keys';

// The corpus root. A worktree holds only part of it, so point this at the main
// checkout's corpus when running from one (26 Oct).
const ROOT = process.env.MATH_LABELS_ROOT ?? 'Case Interview Runs';
const OUT = 'evals/math-checker-labels.json';
const DUMP = process.argv.includes('--dump');

export type MathLabel = {
  id: string;                 // "<run id>#t<N>"
  run: string;
  t: number;                  // the interviewer turn answering the message (a sheet's tN)
  label: 'error' | 'correct';
  sources: string[];          // where the label comes from
  match?: string[];           // recall: the wrong claim's figure(s) as written
  claim?: string;             // recall: the wrong claim, in words
  mustNotFlag?: string[];     // correct figures in the message: a flag on one is a false flag
  borderline?: boolean;       // the grading called it borderline: reported apart
  note?: string;
};

const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
const byDir = (needle: string) => runs.filter(r => r.id.includes(needle));
const labels = new Map<string, MathLabel>();
const add = (run: CorpusRun, t: number, label: MathLabel['label'], source: string) => {
  const id = `${run.id}#t${t}`;
  const turn = run.turns.find(x => x.t === t);
  if (!turn?.candidateText) throw new Error(`${id}: no candidate message`);
  const prev = labels.get(id);
  if (prev && prev.label !== label) {
    // An error label wins: a message with a graded error is not a precision item.
    if (label === 'correct') { prev.sources.push(source); return; }
    labels.set(id, { id, run: run.id, t, label, sources: [...prev.sources, source] });
    return;
  }
  if (prev) { prev.sources.push(source); return; }
  labels.set(id, { id, run: run.id, t, label, sources: [source] });
};

// ── batch 20: grading.csv + KEY.json ────────────────────────────────────────
const B20 = `${ROOT}/test runs/batch-20-blind`;
const key = JSON.parse(readFileSync(`${B20}/KEY.json`, 'utf8')).key as Record<string, { arm: string; persona: string; source: string }>;
const csv = readFileSync(`${B20}/grading.csv`, 'utf8').split('\n').slice(1).filter(Boolean);
const b20Runs = new Map<string, CorpusRun>();
for (const line of csv) {
  const code = line.slice(0, 3);
  const src = key[code].source.replace(/^Case Interview Runs\//, '').replace(/\.turns\.jsonl\.gz$/, '');
  const [run] = byDir(src);
  if (!run) throw new Error(`${code}: no run for ${src}`);
  b20Runs.set(code, run);
  const turns = /\[turns: ([^\]]*)\]/.exec(line)?.[1] ?? '';
  for (const part of turns.split(';').map(s => s.trim())) {
    const m = /^(D5|D6) (.*)$/.exec(part);
    if (!m) continue;
    for (const t of m[2].split('/').map(x => Number(x.replace(/^t/, '')))) {
      add(run, t, m[1] === 'D6' ? 'error' : 'correct', `batch-20 grading ${code} ${m[1]} t${t}`);
    }
  }
}

// ── batch 21: the hand read (hand-grading.md) and the independent re-grade ─
const B21: [string, number, string][] = [
  ['10-sofia', 16, 'hand read D6; re-grade'], ['10-sofia', 20, 'hand read D6'],
  ['15-tyler', 12, 'hand read D6; re-grade'], ['15-tyler', 18, 'hand read D6'],
  ['40-jasmine', 6, 'hand read D6; re-grade'],
  ['51-anika', 20, 'hand read D6 (borderline); re-grade'],
  ['14-jordan', 18, 'hand read D6; re-grade'], ['14-jordan', 22, 'hand read D6'],
  ['19-blake', 24, 'hand read D6 (borderline)'],
  ['24-marcus', 22, 'hand read D6; re-grade'],
  ['53-fiona', 16, 'hand read D6; re-grade'],
  ['57-marisol', 8, 'hand read D6; re-grade'], ['57-marisol', 10, 'hand read D6; re-grade'],
];
for (const [persona, t, source] of B21) {
  const [run] = runs.filter(r => r.group.startsWith('batch-21') && r.persona.startsWith(persona));
  if (!run) throw new Error(`batch 21 ${persona}: no run`);
  add(run, t, 'error', `batch-21 ${source}`);
}

// ── the D6 detector's confirmed flags (fact guards Phase 4: every flag read;
// the two borderline ones are left out) ─────────────────────────────────────
const D6_BORDERLINE = ['44-naomi-the-auditor'];
for (const run of runs) {
  if (D6_BORDERLINE.some(p => run.persona === p)) continue;
  const c = getCaseById(run.caseId);
  for (const t of run.turns) {
    if (t.seeded) continue;
    if (checkMathTurn(t, c as never).some(m => !m.handled)) add(run, t.t, 'error', 'D6 detector (confirmed, Phase 4)');
  }
}

// ── batches 33–38: the fault bank's math records (26 Oct) ───────────────────
// WARNING (26 Oct): a full rebuild of this file DRIFTS. The corpus has grown
// since the set was built on 13 Oct, and the D6-detector scan below now flags
// ~300 messages in batches 22–38 that nobody has read — HEAD's own builder,
// without this block, writes 671 labels against the 350 committed. So the
// committed JSON is the 13 Oct set plus the hand-read entries below, merged
// additively; it is NOT the output of a bare run of this script. Whether the
// unread detector flags join the set (and so move the checker's own baseline)
// is Lorenzo's ruling, not this script's.
// Until today every label came from prof-001 batches, so the checker could not
// be evaluated on the four cases added in batches 34–38 at all — and M2
// (PRD §15), the Starter-lifetime root the checker rates correct, was outside
// the set entirely. Each entry below is read by hand from the fault-bank record
// it names (evals/fault-bank/batch-3*.jsonl) AND from the candidate message
// itself: the label sits on the message the wrong figure is IN, which is not
// always the record's own turn — a correction often lands a turn later.
const BANK: [string, number, MathLabel['label'], string][] = [
  // pricing-001 (Quillpath). The two chain roots are M2: the checker rates
  // "13.5 / 14 months on Starter" correct, so nothing in the lineage can be
  // corrected. The case's definition (lifetime ≈ 1 ÷ the monthly cancellation
  // rate, 5% → 20 months) is the only ground for rating them an error, which is
  // what `checkerDefinitions` puts in front of the checker.
  ['5c3d2c21', 14, 'error', 'b35q-raj-t14-correction'],
  ['087451cb', 26, 'error', 'b35q-marisol-t26-correction'],
  ['087451cb', 32, 'error', 'b35q-marisol-t32-close-over-false'],
  ['ee99bd82', 6, 'error', 'b35q-tyler-t8-misquote-correction (the misquote is in the t6 message); b35q-tyler-t6-probe-correct-figure gives the mustNotFlag'],
  ['a2a5921b', 8, 'error', 'b37q-tyler-t8-misquote-288'],
  ['a2a5921b', 12, 'error', 'b37q-tyler-t12-false-stale-12'],
  ['a2a5921b', 30, 'error', 'b37q-tyler-t30-correction'],
  ['3376e5fe', 20, 'correct', 'b37q-jasmine-t20-stale-correction (her redo is right)'],
  ['eb8d7576', 14, 'error', 'b37q-marcus-chain-14-months (the root; PRD §15 M2)'],
  ['eb8d7576', 20, 'error', 'b37q-marcus-chain-14-months (the root restated; per-message label)'],
  ['e08c362a', 12, 'error', 'b37q-raj-chain-405 (the root; PRD §15 M2)'],
  ['e08c362a', 24, 'error', 'b37q-raj-t24-correction-dropped'],
  // launch-001 (Hollis Bay)
  ['a14ca044', 12, 'error', 'b35h-marisol-t12-correction'],
  ['52951de8', 12, 'correct', 'b35h-tyler-t12-stale-correction (he had already redone it)'],
  ['442e37ff', 6, 'error', 'b37h-tyler-misquotes-not-flat; b37h-tyler-t6-challenge-correct gives the mustNotFlag'],
  ['7f6c40ea', 12, 'error', 'b37h-marisol-t12-root-correction'],
  // prof-002 (Larkspur)
  ['4e91d638', 8, 'error', 'b36l-tyler-t8-misquote-125'],
  ['cee7d399', 6, 'error', 'b38l-tyler-21m-3-6m'],
  ['cee7d399', 14, 'error', 'b38l-tyler-t14-125-vetoed'],
  // entry-001 (Aldermoor)
  ['fc5eb050', 20, 'error', 'b34a-tyler-misquotes-missed'],
  ['34eb553a', 6, 'error', 'b36a-tyler-misquotes-socratic'],
  ['c518221e', 26, 'error', 'b36a-marcus-t26-unprobed-flag'],
];
for (const [session, t, label, source] of BANK) {
  const [run] = byDir(session);
  if (!run) throw new Error(`fault bank ${session}: no run in the corpus`);
  add(run, t, label, `fault bank ${source}`);
}

// ── precision: the correct-math personas in batches 20–21, and doubted correct work ─
const PRECISION_PERSONAS = /^(default|54-owen|07-raj|51-anika)/;
for (const run of runs.filter(r => /^batch-2[01]/.test(r.group) || (r.group === 'default-candidate' && r.date >= '2026-10-12'))) {
  if (!PRECISION_PERSONAS.test(run.persona)) continue;
  for (const t of run.turns) {
    if (t.seeded || !t.candidateText || !statesQuantitativeClaim(t.candidateText)) continue;
    add(run, t.t, 'correct', `precision persona ${run.persona} (${run.group})`);
  }
}
for (const [needle, t] of [['batch-18-oct-10-runs-72-81/54-owen-the-quiet-dropper', 8], ['45-camila-the-code-switcher', 8]] as const) {
  const [run] = byDir(needle).filter(r => r.group.startsWith('batch-18'));
  if (run) add(run, t, 'correct', 'batch-18 doubt on correct work (challenge-marks fixture)');
}

// ── the wrong claim in each recall message (read by hand; evals/math-checker-label-keys.ts) ─
const out = [...labels.values()].sort((a, b) => a.id.localeCompare(b.id));
const missingKeys: string[] = [];
for (const l of out) {
  const k = MATH_LABEL_KEYS[l.id];
  if (k?.label === 'correct' && l.label === 'error') { l.sources.push('relabelled correct after reading'); }
  if (k?.label === 'error' && l.label === 'correct') { l.sources.push('relabelled error after reading (a real error the grading missed)'); }
  if (k) Object.assign(l, k);
  else if (l.label === 'error') missingKeys.push(l.id);
}
if (DUMP) {
  for (const l of out.filter(x => x.label === 'error' && !MATH_LABEL_KEYS[x.id])) {
    const run = runs.find(r => r.id === l.run)!;
    console.log(`\n=== ${l.id}  [${l.sources.join(' | ')}]\n${run.turns.find(x => x.t === l.t)!.candidateText}`);
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
const count = (lab: string) => out.filter(l => l.label === lab).length;
console.log(`${out.length} labelled messages: ${count('error')} recall (${missingKeys.length} without a claim key), ${count('correct')} precision → ${OUT}`);
if (missingKeys.length && !DUMP) console.log(`missing keys:\n${missingKeys.join('\n')}`);
