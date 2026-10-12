// Misquote check (lib/orchestrator/misquote.ts) measured over saved runs (12 Oct, batch-19 review step 3):
// a figure the candidate cites for a ledger item already revealed to them,
// off beyond a tolerance, is a misquote (Rule 6 option 4: a one-sentence flat
// reset). Derived figures (points, relative changes, scenarios, arithmetic)
// must not count. Precision and recall against hand labels. Free.
//
//   npx tsx scripts/misquote-eval.ts            the detector's flags
//   npx tsx scripts/misquote-eval.ts --broad    the quote grammar without the hypothetical guard (for labelling)
//   npx tsx scripts/misquote-eval.ts --labels=tests/orchestrator/fixtures/misquote-labelled.json [--heldout]
//                                               precision / recall against the hand labels

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadSavedTurns, savedRunDirs } from '@/lib/eval/saved-turns';
import { readTurnFile } from '@/lib/eval/turn-file';
import { readdirSync } from 'node:fs';
import { getCaseById } from '@/lib/cases/loader';
import { findMisquotes, exhibitColumns, type QuoteAnchor } from '@/lib/orchestrator/misquote';

type Flag = { run: string; turn: number; item: string; cited: string; sentence: string };

type Rec = { turnIndex: number; candidateText: string; stateBefore: { revealedIds: string[]; shownExhibitIds: string[] } };
function legacyRecords(dir: string): Rec[] {
  const f = readdirSync(dir).find(x => x.endsWith('.json') && !x.includes('turns'))!;
  const run = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as {
    turns: { turnIndex: number; role: string; text: string; timestampMs: number }[];
    revealed: { ledgerItemId: string; revealedAtMs: number }[];
    analytics: { eventType: string; createdAt: string; payloadJsonb: { exhibitId?: string } }[];
  };
  return run.turns.filter(t => t.role === 'candidate').map(t => ({
    turnIndex: t.turnIndex, candidateText: t.text,
    stateBefore: {
      revealedIds: run.revealed.filter(r => r.revealedAtMs <= t.timestampMs).map(r => r.ledgerItemId),
      shownExhibitIds: run.analytics.filter(a => a.eventType === 'exhibit_shown' && Date.parse(a.createdAt) <= t.timestampMs).map(a => a.payloadJsonb.exhibitId ?? 'exhibit-a'),
    },
  }));
}

function main() {
  const args = process.argv.slice(2);
  const broad = args.includes('--broad');
  const labelsFile = args.find(a => a.startsWith('--labels='))?.split('=')[1];
  const heldout = args.includes('--heldout');
  const flags: Flag[] = [];
  for (const dir of savedRunDirs('Case Interview Runs/test runs', heldout ? ['batch-12', 'batch-13', 'batch-14', 'batch-15', 'batch-16', 'batch-17'] : ['batch-18', 'batch-19'])) {
    const tf = readdirSync(dir).find(f => f.endsWith('.turns.jsonl.gz'));
    // Held-out batches (12–17) have no turn file: what was revealed and shown
    // before each candidate turn comes from the record's timestamps.
    const records = tf ? readTurnFile(path.join(dir, tf)).turns : legacyRecords(dir);
    const caseData = getCaseById('prof-001');
    const anchors = caseData.quoteAnchors as QuoteAnchor[];
    const exhibits = caseData.exhibits as { id: string; data: Record<string, unknown>[] }[];
    const run = loadSavedTurns(dir)[0]?.run ?? dir;
    for (const t of records) {
      const shown = exhibits.filter(x => t.stateBefore.shownExhibitIds.includes(x.id));
      for (const f of findMisquotes(t.candidateText, {
        anchors, ledger: caseData.dataLedger, revealedIds: new Set(t.stateBefore.revealedIds),
        exhibitColumns: exhibitColumns(anchors, shown), guards: !broad,
      })) flags.push({ run, turn: t.turnIndex, ...f });
    }
  }
  if (labelsFile) {
    const scanned = heldout ? ['batch-12', 'batch-13', 'batch-14', 'batch-15', 'batch-16', 'batch-17'] : ['batch-18', 'batch-19'];
    const labels = (JSON.parse(readFileSync(labelsFile, 'utf8')) as { run: string; turn: number; item: string; cited: string; misquote: boolean }[])
      .filter(l => scanned.some(b => l.run.startsWith(b)));
    const key = (x: { run: string; turn: number; item: string; cited: string }) => `${x.run}|${x.turn}|${x.item}|${x.cited}`;
    const truth = new Set(labels.filter(l => l.misquote).map(key));
    const flagged = new Set(flags.map(key));
    const tp = [...flagged].filter(k => truth.has(k));
    const fp = [...flagged].filter(k => !truth.has(k));
    const fn = [...truth].filter(k => !flagged.has(k));
    console.log(`labelled misquotes ${truth.size}; flagged ${flagged.size}; TP ${tp.length}; FP ${fp.length}; FN ${fn.length}`);
    console.log(`precision ${(tp.length / Math.max(1, flagged.size)).toFixed(2)}  recall ${(tp.length / Math.max(1, truth.size)).toFixed(2)}`);
    for (const k of fp) console.log('  FP', k);
    for (const k of fn) console.log('  FN', k);
    return;
  }
  for (const f of flags) console.log(JSON.stringify(f));
  console.error(`${flags.length} ${broad ? 'broad candidates' : 'flags'}`);
}

main();
