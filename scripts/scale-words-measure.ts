// What handling scale and currency words after a figure would recover, and
// what it would cost (Phase 1, follow-up 2 of the 27 Oct speech-normalization
// report; Lorenzo's ruling of 27 Oct: **measure only — any scale-changing
// reading must come out "unclear", never a flag**).
//
// The gap. `normalizeNumberWords` turns "two hundred thousand" into the two
// tokens `200 thousand`, and "forty cents" into `40 cents`. To the live reader
// the scale or currency word is an unknown word, so it ends the expression and
// the figure keeps the wrong magnitude: "200 thousand" reads as 200, three
// orders of magnitude small; "forty cents" reads as 40, a hundred times large.
// Patterns H and I of the report's §1 — the two it most wanted to leave alone.
//
// Nothing here is shipped, and nothing in `lib/` changes. The recovery is
// simulated with a text pre-pass that folds the word into the figure in the
// notation the reader already understands (`200k`, `$0.40`), so the measurement
// does not depend on how the feature would be built — and so this script cannot
// be mistaken for the feature.
//
//   npx tsx scripts/scale-words-measure.ts --root='<corpus root>'
//   npx tsx scripts/scale-words-measure.ts --root=… --list   # every gained claim
//
// Read with `ENGINE_SWITCHES='*=spokenMathParser,speechNormalization'`, the arm
// the recovery would be added to.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { switchOn } from '@/lib/cases/engine-switches';
import { checkCandidateMath } from '@/lib/orchestrator/recompute';
import { normalizeNumberWords } from '@/lib/number-words';
import { normalizeSpeech } from '@/lib/orchestrator/speech-normalize';
import { absorbScaleWords } from '@/lib/orchestrator/scale-words';
import { toSpokenText } from './speech-replay';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string) => process.argv.includes(`--${name}`);
const ROOT = arg('root') ?? process.env.CORPUS_ROOT ?? 'Case Interview Runs';

// ---------------------------------------------------------------------------
// The simulated absorption. Applied to the text the reader would see — after
// `normalizeSpeech` and `normalizeNumberWords`, which is where "200 thousand"
// and "40 cents" exist as such.
// One definition of the absorption, shared with the feature it measured:
// `lib/orchestrator/scale-words.ts` (switch `scaleWordReading`). The simulation this
// script ran on 27 Oct *became* that function unchanged, so the numbers below and the
// shipped reading cannot drift apart.
export const absorbUnits = absorbScaleWords;

// The reader's own front end, so the pre-pass sees the text the reader sees.
const asRead = (text: string, speech: boolean) => normalizeNumberWords(speech ? normalizeSpeech(text) : text);

// ---------------------------------------------------------------------------
type Turn = { label: string; caseId: string; text: string; revealed: string[] };

function voiceTurns(root: string): Turn[] {
  const dir = path.join(root, 'voice-live');
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.jsonl')) files.push(p);
    }
  };
  walk(dir);
  const revealed = getCaseById('prof-001').dataLedger.map(d => d.id);
  const out: Turn[] = [];
  for (const f of files.sort()) {
    const session = path.basename(f, '.jsonl').slice(0, 8);
    const collapsed: { t: number; text: string }[] = [];
    for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      let row: { turnSeq: number; candidateText?: string; carried?: boolean };
      try { row = JSON.parse(line) as typeof row; } catch { continue; }
      const text = row.candidateText?.trim();
      if (!text) continue;
      const last = collapsed[collapsed.length - 1];
      if (last && row.carried && text.startsWith(last.text.slice(0, 40))) { last.t = row.turnSeq; last.text = text; }
      else collapsed.push({ t: row.turnSeq, text });
    }
    for (const c of collapsed) out.push({ label: `${session} t${c.t}`, caseId: 'prof-001', text: c.text, revealed });
  }
  return out;
}

function corpusTurns(root: string, spoken: boolean): Turn[] {
  const { runs } = loadCorpus(root, id => getCaseById(id) as never);
  const out: Turn[] = [];
  for (const run of runs) {
    for (const t of run.turns) {
      if (t.seeded || !t.candidateText) continue;
      out.push({
        label: `${run.id.slice(-8)} t${t.t}`, caseId: run.caseId,
        text: spoken ? toSpokenText(t.candidateText, {}) : t.candidateText,
        revealed: t.revealedBefore,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
type Count = { turns: number; claims: number; correct: number; incorrect: number; unclear: number; flags: number; verified: number };
type Gained = { label: string; expression: string; stated: number; verdict: string; span: string };

function measure(turns: Turn[]): { base: Count; absorbed: Count; gained: Gained[]; newFlags: string[] } {
  const zero = (): Count => ({ turns: turns.length, claims: 0, correct: 0, incorrect: 0, unclear: 0, flags: 0, verified: 0 });
  const base = zero(), absorbed = zero();
  const gained: Gained[] = [];
  const newFlags: string[] = [];
  for (const turn of turns) {
    const caseData = getCaseById(turn.caseId);
    const opts = { spokenReadings: switchOn(caseData, 'spokenMathParser'), speechNormalization: switchOn(caseData, 'speechNormalization') };
    const a = checkCandidateMath(turn.text, caseData, turn.revealed, opts);
    // The pre-pass runs on the text the reader would see, and the result is fed
    // back in as the message — `speechNormalization` is then a no-op on it,
    // which is what makes the two arms comparable.
    const b = checkCandidateMath(absorbUnits(asRead(turn.text, opts.speechNormalization)), caseData, turn.revealed, opts);
    for (const [c, m] of [[base, a], [absorbed, b]] as const) {
      c.claims += m.arithmetic.length;
      for (const x of m.arithmetic) c[x.verdict]++;
      c.flags += m.flags.length;
      c.verified += m.verified.length;
    }
    // A claim the absorbed reading raises that the base did not, matched on the
    // stated result (the base may hold a different claim in the same sentence).
    for (const x of b.arithmetic) {
      if (!a.arithmetic.some(y => Math.abs(y.stated - x.stated) < 1e-9 && Math.abs(y.computed - x.computed) < 1e-9)) {
        gained.push({ label: turn.label, expression: x.expression, stated: x.stated, verdict: x.verdict, span: x.span.replace(/\s+/g, ' ').slice(0, 200) });
      }
    }
    for (const f of b.flags) {
      if (!a.flags.some(g => Math.abs(g.candidateValue - f.candidateValue) < 1e-9)) {
        newFlags.push(`${turn.label} ${f.stepId} ${f.candidateValue} (exp ${f.expected}) | ${String(f.span).replace(/\s+/g, ' ').slice(0, 180)}`);
      }
    }
  }
  return { base, absorbed, gained, newFlags };
}

const per100 = (n: number, turns: number) => (turns === 0 ? '—' : (n * 100 / turns).toFixed(1));
const row = (label: string, c: Count) => [
  label.padEnd(22), String(c.turns).padStart(5),
  per100(c.claims, c.turns).padStart(7), per100(c.correct, c.turns).padStart(7),
  per100(c.incorrect, c.turns).padStart(6), per100(c.unclear, c.turns).padStart(7),
  per100(c.flags, c.turns).padStart(6), per100(c.verified, c.turns).padStart(8),
  `  (${c.claims} claims, ${c.correct}/${c.incorrect}/${c.unclear}, ${c.flags} flags, ${c.verified} verified)`,
].join(' ');

function report(name: string, turns: Turn[]): void {
  const { base, absorbed, gained, newFlags } = measure(turns);
  console.log(`\n=== ${name} — ${turns.length} candidate turns, per 100 turns`);
  console.log(`${''.padEnd(22)} ${'turns'.padStart(5)} ${'claims'.padStart(7)} ${'correct'.padStart(7)} ${'wrong'.padStart(6)} ${'unclear'.padStart(7)} ${'flags'.padStart(6)} ${'verified'.padStart(8)}`);
  console.log(row('as the reader reads', base));
  console.log(row('units absorbed', absorbed));
  const by = (v: string) => gained.filter(g => g.verdict === v).length;
  console.log(`    GAINED CLAIMS ${gained.length}: ${by('correct')} correct, ${by('unclear')} unclear, ${by('incorrect')} INCORRECT (would be flags)`);
  console.log(`    NEW FLAGS ${newFlags.length}`);
  for (const f of newFlags.slice(0, 30)) console.log(`      NEW-FLAG ${f}`);
  if (has('list')) for (const g of gained) console.log(`      GAINED [${g.verdict}] ${g.label} ${g.expression} = ${g.stated} | ${g.span}`);
}

function main(): void {
  console.log(`root: ${ROOT}  ENGINE_SWITCHES=${process.env.ENGINE_SWITCHES ?? '(unset)'}`);
  report('voice (voice-live, all reveals)', voiceTurns(ROOT));
  report('the corpus, spoken', corpusTurns(ROOT, true));
  report('the corpus, as written', corpusTurns(ROOT, false));
}

if (process.argv[1]?.endsWith('scale-words-measure.ts')) main();
