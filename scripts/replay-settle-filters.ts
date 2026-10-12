// Replays two Settle filters over saved runs (12 Oct, batch-19 review step 2):
//   pending — the question on a turn that delivered data, rewritten where it
//             treats the data as still to come (lib/orchestrator/pending-data.ts)
//   grading — sentences of "say" and the question that grade the candidate's
//             work, withheld (lib/orchestrator/grading.ts; in the question a
//             "…, but <challenge>" keeps the challenge)
// Every hit is printed for reading by hand. Free — no model calls.
//
//   npx tsx scripts/replay-settle-filters.ts [--only=pending|grading] [--batches=batch-18,batch-19]

import path from 'node:path';
import { loadSavedTurns, savedRunDirs, type SavedTurn } from '@/lib/eval/saved-turns';
import { settlePendingData, PENDING_DATA } from '@/lib/orchestrator/pending-data';
import { isGradingSentence, gradingRemainder } from '@/lib/orchestrator/grading';
import { getCaseById } from '@/lib/cases/loader';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = 'Case Interview Runs/test runs';
const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--only='))?.split('=')[1];
const batches = args.find(a => a.startsWith('--batches='))?.split('=')[1].split(',')
  ?? ['batch-12', 'batch-13', 'batch-14', 'batch-15', 'batch-16', 'batch-17', 'batch-18', 'batch-19'];

const sentences = (s: string) => s.trim().split(/(?<=[.?!])\s+/).filter(Boolean);

function caseIdOf(dir: string): string {
  const f = readdirSync(dir).find(x => x.endsWith('.json') && !x.includes('turns'))!;
  return (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { session: { caseId: string } }).session.caseId;
}

type Tally = { runs: number; modelTurns: number; pendingTurns: number; pendingDropped: number; pendingKept: number; pendingNoDelivery: number; gradingSay: number; gradingQuestion: number; questionEmptied: number; gradingRuns: Set<string>; pendingRuns: Set<string> };
const tally: Record<string, Tally> = {};
const lines: string[] = [];

for (const dir of savedRunDirs(ROOT, batches)) {
  const batch = path.basename(path.dirname(dir)).slice(0, 8);
  const t = (tally[batch] ??= { runs: 0, modelTurns: 0, pendingTurns: 0, pendingDropped: 0, pendingKept: 0, pendingNoDelivery: 0, gradingSay: 0, gradingQuestion: 0, questionEmptied: 0, gradingRuns: new Set(), pendingRuns: new Set() });
  t.runs++;
  const ledger = getCaseById(caseIdOf(dir)).dataLedger as { id: string; label: string; value: string }[];
  const exhibits = getCaseById(caseIdOf(dir)).exhibits as { id: string; title: string }[];
  for (const turn of loadSavedTurns(dir) as SavedTurn[]) {
    if (turn.kind === 'close') continue;
    if (turn.kind === 'model') t.modelTurns++;
    const where = `${turn.run} t${turn.turn} ${turn.phase}${turn.kind !== 'model' ? ` [${turn.kind}]` : ''}`;
    // pending — every turn's question, code-written ones included
    if (turn.question && only !== 'grading') {
      const released = turn.releases.map(id => ledger.find(i => i.id === id)).filter((i): i is NonNullable<typeof i> => Boolean(i));
      const ctx = {
        deliveredThisTurn: turn.releases.length > 0 || turn.exhibit !== null,
        heldWhats: [...turn.defers, ...turn.offers],
        releasedTexts: [...released.flatMap(i => [i.label, i.value]), ...exhibits.filter(e => e.id === turn.exhibit).map(e => e.title)],
      };
      const r = settlePendingData(turn.question, ctx);
      if (r.changes.length > 0) {
        t.pendingTurns++; t.pendingRuns.add(turn.run);
        if (r.question === null) t.pendingDropped++;
        lines.push(`PENDING ${where}\n    from: ${turn.question}\n    to:   ${r.question ?? '(nothing left — fallback question)'}`);
      } else if (PENDING_DATA.test(turn.question)) {
        if (ctx.deliveredThisTurn) { t.pendingKept++; lines.push(`PENDING-KEPT ${where} (names held: ${ctx.heldWhats.join(' | ')})\n    ${turn.question}`); }
        else t.pendingNoDelivery++;
      }
    }
    // grading — the model's own words only
    if (turn.kind === 'model' && only !== 'pending') {
      const say = turn.deliveredSay ?? (turn.modelSay && turn.heard.includes(turn.modelSay.trim()) ? turn.modelSay : '');
      const q = turn.question ?? '';
      const sayHits = sentences(say ?? '').filter(isGradingSentence);
      const qHits = sentences(q).filter(isGradingSentence);
      if (sayHits.length || qHits.length) {
        t.gradingRuns.add(turn.run);
        t.gradingSay += sayHits.length; t.gradingQuestion += qHits.length;
        const qLeft = sentences(q).flatMap(s => (qHits.includes(s) ? [gradingRemainder(s)].filter((x): x is string => x !== null) : [s]));
        if (qHits.length && !qLeft.some(s => s.endsWith('?'))) t.questionEmptied++;
        for (const s of sayHits) lines.push(`GRADING say ${where}: ${s}`);
        for (const s of qHits) lines.push(`GRADING question ${where}: ${s}\n    left: ${qLeft.join(' ') || '(nothing — "Go on.")'}`);
      }
    }
  }
}

console.log('| batch | runs | model turns | pending: turns rewritten (runs) / of which question emptied / kept (names held) / no delivery (untouched) | grading: say / question sentences (runs) / question left without a question |');
console.log('|---|---|---|---|---|');
for (const [b, t] of Object.entries(tally)) {
  console.log(`| ${b} | ${t.runs} | ${t.modelTurns} | ${t.pendingTurns} (${t.pendingRuns.size}) / ${t.pendingDropped} / ${t.pendingKept} / ${t.pendingNoDelivery} | ${t.gradingSay} / ${t.gradingQuestion} (${t.gradingRuns.size}) / ${t.questionEmptied} |`);
}
console.log('\n' + lines.join('\n'));
