// A stratified sample of the claims the scale/currency-word reading newly verifies
// (Phase 1, follow-up 2 of the 27 Oct speech-normalization report; Lorenzo's ruling of
// 27 Oct, round 3 item 2: "never a flag, correct allowed" — **but read a sample of 50
// of the newly verified claims first and confirm none verifies wrong work**, because a
// false `correct` shields a real error: the engine would never probe it).
//
// Dumps every gained claim with what a reader needs to recompute it by hand: the case,
// the run (persona), the turn, the scale word it absorbed, the expression as the reader
// now reads it, the stated result, and both texts — the spoken span it read and the
// candidate's own typed sentence.
//
//   npx tsx scripts/scale-words-sample.ts --root='<corpus root>' --out=<file.json>
//   npx tsx scripts/scale-words-sample.ts --root=… --sample=50 --seed=7
//
// Read with ENGINE_SWITCHES='*=spokenMathParser,speechNormalization', the arm the
// recovery would be added to (the same arm scale-words-measure.ts reports).
import { writeFileSync } from 'node:fs';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { switchOn } from '@/lib/cases/engine-switches';
import { checkCandidateMath } from '@/lib/orchestrator/recompute';
import { normalizeNumberWords } from '@/lib/number-words';
import { normalizeSpeech } from '@/lib/orchestrator/speech-normalize';
import { toSpokenText } from './speech-replay';
import { absorbUnits } from './scale-words-measure';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ROOT = arg('root') ?? process.env.CORPUS_ROOT ?? 'Case Interview Runs';

export type GainedClaim = {
  runId: string; caseId: string; turn: number;
  scaleWords: string[];      // the scale/currency readings inside this claim's span
  messageWords: string[];    // every scale/currency word the message's absorbed reading folded in
  expression: string; stated: number; computed: number; verdict: string;
  span: string;              // the sentence as the absorbed reader sees it
  typed: string;             // the candidate's own message, as typed
  spoken: string;            // the synthetic spoken form the replay read
};

// Which scale or currency words the pre-pass folded into a figure, as the claim's own
// span shows them: the pre-pass's output notation is `200k` / `320m` / `1.6b` / `$0.40`,
// so the span itself says which reading it took. (The message-level word list is kept
// beside it for context.)
const WORD_RE = /\d[\d,]*(?:\.\d+)?\s+(thousand|million|billion|dollars?|bucks|cents?)(?![a-z])/gi;
function wordsAbsorbed(readText: string): string[] {
  return [...readText.matchAll(WORD_RE)].map(m => m[1].toLowerCase().replace(/s$/, ''));
}
function spanScales(span: string): string[] {
  const out = new Set<string>();
  for (const m of span.matchAll(/\d[\d,]*(?:\.\d+)?([kmb])(?![a-z])/gi)) out.add(m[1].toLowerCase() === 'k' ? 'k' : m[1].toLowerCase() === 'm' ? 'M' : 'B');
  if (/\$\d/.test(span)) out.add('currency');
  return [...out];
}

export function gainedClaims(root: string): GainedClaim[] {
  const { runs } = loadCorpus(root, id => getCaseById(id) as never);
  const out: GainedClaim[] = [];
  for (const run of runs) {
    const caseData = getCaseById(run.caseId);
    const opts = {
      spokenReadings: switchOn(caseData, 'spokenMathParser'),
      speechNormalization: switchOn(caseData, 'speechNormalization'),
    };
    for (const t of run.turns) {
      if (t.seeded || !t.candidateText) continue;
      const spoken = toSpokenText(t.candidateText, {});
      const read = normalizeNumberWords(opts.speechNormalization ? normalizeSpeech(spoken) : spoken);
      const a = checkCandidateMath(spoken, caseData, t.revealedBefore, opts);
      const b = checkCandidateMath(absorbUnits(read), caseData, t.revealedBefore, opts);
      for (const x of b.arithmetic) {
        if (a.arithmetic.some(y => Math.abs(y.stated - x.stated) < 1e-9 && Math.abs(y.computed - x.computed) < 1e-9)) continue;
        out.push({
          runId: run.id, caseId: run.caseId, turn: t.t,
          scaleWords: spanScales(x.span), messageWords: wordsAbsorbed(read),
          expression: x.expression, stated: x.stated, computed: x.computed, verdict: x.verdict,
          span: x.span.replace(/\s+/g, ' '),
          typed: t.candidateText.replace(/\s+/g, ' '),
          spoken: spoken.replace(/\s+/g, ' '),
        });
      }
    }
  }
  return out;
}

// A deterministic stratified sample. Each claim is classed by the readings in its span
// (a span with both a scale and a currency reading is classed `k+currency` etc.), the
// classes are filled to a quota that over-samples the rare ones on purpose — the point
// of the sample is to test every reading, not to mirror the corpus — and within a class
// the rows are ordered by (case, run, turn) and taken every n-th, never the first n.
const CLASS = (c: GainedClaim) => (c.scaleWords.length ? [...c.scaleWords].sort().join('+') : 'none');

function main(): void {
  const all = gainedClaims(ROOT).filter(c => c.verdict === 'correct');
  const n = Number(arg('sample') ?? 50);
  const groups = new Map<string, GainedClaim[]>();
  for (const c of all) {
    const k = CLASS(c);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const [, g] of groups) g.sort((x, y) => `${x.caseId}|${x.runId}|${x.turn}|${x.expression}`.localeCompare(`${y.caseId}|${y.runId}|${y.turn}|${y.expression}`));
  const byClass = Object.fromEntries([...groups].map(([k, g]) => [k, g.length]));
  console.log(`gained & verified correct: ${all.length}; by class: ${JSON.stringify(byClass)}`);
  console.log(`cases: ${new Set(all.map(c => c.caseId)).size}, runs: ${new Set(all.map(c => c.runId)).size}`);
  // Quota: a floor of 4 in every class, so no reading goes untested, then the rest
  // handed out highest-average first (size / (quota + 1)) — so the big classes get the
  // bulk of the sample without the small ones being crowded out. Deterministic.
  const keys = [...groups.keys()].sort();
  const quota = new Map<string, number>();
  let left = n;
  for (const k of keys) {
    const take = Math.min(groups.get(k)!.length, 4, Math.max(left, 0));
    quota.set(k, take); left -= take;
  }
  while (left > 0) {
    const open = keys.filter(k => quota.get(k)! < groups.get(k)!.length);
    if (!open.length) break;
    const k = open.reduce((a, b) => (groups.get(b)!.length / (quota.get(b)! + 1) > groups.get(a)!.length / (quota.get(a)! + 1) ? b : a));
    quota.set(k, quota.get(k)! + 1); left--;
  }
  const picked: GainedClaim[] = [];
  for (const k of keys) {
    const g = groups.get(k)!, q = quota.get(k)!;
    const step = g.length / q;
    for (let i = 0; i < q; i++) picked.push(g[Math.floor(i * step)]);
  }
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify({ total: all.length, byClass, quota: Object.fromEntries(quota), sample: picked, all }, null, 2));
  for (const [i, c] of picked.entries()) {
    console.log(`\n--- ${i + 1}. ${c.caseId} ${c.runId.slice(-8)} t${c.turn} [${CLASS(c)}] ${c.expression} = ${c.stated} (one reading computes ${c.computed})`);
    console.log(`    SPAN:  ${c.span.slice(0, 320)}`);
    console.log(`    TYPED: ${c.typed.slice(0, 460)}`);
  }
}

if (process.argv[1]?.endsWith('scale-words-sample.ts')) main();
