// What the candidate-math path makes of real speech (Phase 1, speech
// normalization for the arithmetic checker; Lorenzo's brief of 27 Oct).
//
// Stream 3 task 6 found the arithmetic checker effectively blind on STT output:
// every one of the real voice sentences in `Case Interview Runs/voice-live/`
// produces no claim at all, because fillers ("um", "uh", "sorry") and the commas
// around them break the operand chain. This script measures that — it runs
// `checkCandidateMath` over the recorded voice candidate turns and over the same
// case's typed turns, and prints the per-100-turn rates the brief asks for.
//
// Free: no model call, no write to the corpus.
//
//   npx tsx scripts/voice-math-measure.ts --root='<corpus root>'
//   npx tsx scripts/voice-math-measure.ts --unparsed        # every voice turn with an
//                                                           # unparsed figure chain
//   ENGINE_SWITCHES='*=spokenMathParser' npx tsx scripts/voice-math-measure.ts
//
// Both arms read the same switches as the live turn (`switchOn`), so the arm is
// named the same way an evaluation names it.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { switchOn } from '@/lib/cases/engine-switches';
import { checkCandidateMath } from '@/lib/orchestrator/recompute';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string) => process.argv.includes(`--${name}`);
const ROOT = arg('root') ?? process.env.CORPUS_ROOT ?? 'Case Interview Runs';

export type MeasuredTurn = { session: string; t: number; text: string; revealed: string[] };

// ---------------------------------------------------------------------------
// The voice arm: the per-turn agent records under `voice-live/`.
//
// A voice session leaves a `<id>.jsonl` (one line per turn the agent handled)
// and, for the later sessions, a `<id>-db-dump.json`. The jsonl is the only
// record every session has, so the turns are read from it: `candidateText` is
// the message the engine saw, and `carried: true` marks a turn that re-sends an
// earlier message's text with more speech appended (a barge-in continued), so a
// carry chain collapses to its longest text — exactly the distinct candidate
// messages the db-dump's `session_turns` holds where both exist.
type VoiceLine = { turnSeq: number; candidateText?: string; carried?: boolean };

function voiceTurns(root: string): MeasuredTurn[] {
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
  const out: MeasuredTurn[] = [];
  for (const f of files.sort()) {
    const session = path.basename(f, '.jsonl').slice(0, 8);
    const collapsed: { t: number; text: string }[] = [];
    for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      let row: VoiceLine;
      try { row = JSON.parse(line) as VoiceLine; } catch { continue; }
      const text = row.candidateText?.trim();
      if (!text) continue;
      const last = collapsed[collapsed.length - 1];
      if (last && row.carried && text.startsWith(last.text.slice(0, 40))) { last.t = row.turnSeq; last.text = text; }
      else collapsed.push({ t: row.turnSeq, text });
    }
    // Every voice session is prof-001, and six of the fifteen have no db-dump,
    // so no per-turn reveal progression exists for them. The whole ledger is
    // used for every voice turn — the most permissive setting for the data-bound
    // checks, uniform across sessions — and the typed arm is measured both ways
    // so the comparison is not an artifact of that choice.
    for (const c of collapsed) out.push({ session, t: c.t, text: c.text, revealed: allIds('prof-001') });
  }
  return out;
}

const allIds = (caseId: string) => getCaseById(caseId).dataLedger.map(d => d.id);

// ---------------------------------------------------------------------------
// The typed arm: the saved runs of the same case.
function typedTurns(root: string, caseId: string, reveals: 'run' | 'all'): MeasuredTurn[] {
  const { runs } = loadCorpus(root, id => getCaseById(id) as never);
  const out: MeasuredTurn[] = [];
  for (const run of runs) {
    if (run.caseId !== caseId) continue;
    for (const turn of run.turns) {
      if (turn.seeded || !turn.candidateText) continue;
      out.push({ session: run.id, t: turn.t, text: turn.candidateText, revealed: reveals === 'all' ? allIds(caseId) : turn.revealedBefore });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
export type Tally = { turns: number; claims: number; correct: number; incorrect: number; unclear: number; flags: number; verified: number; turnsWithClaim: number };

export function measure(turns: MeasuredTurn[], caseId: string): Tally {
  const caseData = getCaseById(caseId);
  const opts = { spokenReadings: switchOn(caseData, 'spokenMathParser') };
  const tally: Tally = { turns: turns.length, claims: 0, correct: 0, incorrect: 0, unclear: 0, flags: 0, verified: 0, turnsWithClaim: 0 };
  for (const turn of turns) {
    const math = checkCandidateMath(turn.text, caseData, turn.revealed, opts);
    tally.claims += math.arithmetic.length;
    if (math.arithmetic.length > 0) tally.turnsWithClaim++;
    for (const c of math.arithmetic) tally[c.verdict]++;
    tally.flags += math.flags.length;
    tally.verified += math.verified.length;
  }
  return tally;
}

const per100 = (n: number, turns: number) => (turns === 0 ? '—' : (n * 100 / turns).toFixed(1));

function row(label: string, t: Tally): string {
  return [
    label.padEnd(30), String(t.turns).padStart(5),
    per100(t.claims, t.turns).padStart(8), per100(t.correct, t.turns).padStart(8),
    per100(t.incorrect, t.turns).padStart(8), per100(t.unclear, t.turns).padStart(8),
    per100(t.flags, t.turns).padStart(8), per100(t.verified, t.turns).padStart(8),
    `  (${t.claims} claims, ${t.correct}/${t.incorrect}/${t.unclear}, ${t.flags} flags, ${t.verified} verified, ${t.turnsWithClaim} turns with a claim)`,
  ].join(' ');
}

function main(): void {
  const caseId = arg('case') ?? 'prof-001';
  const voice = voiceTurns(ROOT);
  const typedRun = typedTurns(ROOT, caseId, 'run');
  const typedAll = typedTurns(ROOT, caseId, 'all');
  console.log(`root: ${ROOT}  case: ${caseId}  ENGINE_SWITCHES=${process.env.ENGINE_SWITCHES ?? '(unset)'}`);
  console.log(`${''.padEnd(30)} ${'turns'.padStart(5)} ${'claims'.padStart(8)} ${'correct'.padStart(8)} ${'wrong'.padStart(8)} ${'unclear'.padStart(8)} ${'flags'.padStart(8)} ${'verified'.padStart(8)}   — per 100 turns`);
  console.log(row('voice (voice-live, all reveals)', measure(voice, caseId)));
  console.log(row(`typed ${caseId} (run reveals)`, measure(typedRun, caseId)));
  console.log(row(`typed ${caseId} (all reveals)`, measure(typedAll, caseId)));

  if (has('unparsed')) {
    console.log('\n--- voice turns whose figure chain produced no claim ---');
    const caseData = getCaseById(caseId);
    const opts = { spokenReadings: switchOn(caseData, 'spokenMathParser') };
    for (const turn of voice) {
      const math = checkCandidateMath(turn.text, caseData, turn.revealed, opts);
      // A turn that says an operator word between two figures but yields no claim.
      const OPS = /\b(?:times|divided by|over|plus|minus|multiplied by|of)\b/i;
      const nums = (turn.text.match(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b|\d/gi) ?? []).length;
      if (math.arithmetic.length === 0 && nums >= 3 && OPS.test(turn.text)) {
        console.log(`\n[${turn.session} t${turn.t}] ${turn.text.replace(/\s+/g, ' ')}`);
      }
    }
  }
}

if (process.argv[1]?.endsWith('voice-math-measure.ts')) main();
