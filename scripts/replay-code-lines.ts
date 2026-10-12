// Replays step 4's code-written-line fixes over saved runs (12 Oct, batch-19
// review): refusal / deferral / offer lines re-rendered as speech, deferrals
// the same turn's exhibit delivers, and the replacement question by phase and
// clock. Prints every line that would change, before → after. Free.
//
//   npx tsx scripts/replay-code-lines.ts [--batches=batch-18,batch-19]

import path from 'node:path';
import { readdirSync } from 'node:fs';
import { readTurnFile } from '@/lib/eval/turn-file';
import { savedRunDirs } from '@/lib/eval/saved-turns';
import { renderDataLines, type DataDecisions } from '@/lib/orchestrator/data-decisions';
import { pickFallbackQuestion, FIGURES_QUESTIONS, NO_FIGURES_QUESTIONS } from '@/lib/orchestrator/pressure-test';
import { isUnderTimePressure } from '@/lib/orchestrator/pacing';
import { TOTAL_CASE_MS, type Phase } from '@/lib/orchestrator/state-machine';
import { getCaseById } from '@/lib/cases/loader';

const batches = process.argv.find(a => a.startsWith('--batches='))?.split('=')[1].split(',') ?? ['batch-18', 'batch-19'];
const exhibits = getCaseById('prof-001').exhibits as { id: string; coversLedgerItems?: string[] }[];
const OLD_POOL = new Set<string>([...FIGURES_QUESTIONS, ...NO_FIGURES_QUESTIONS]);
const counts = { lines: 0, exhibitDefers: 0, fallbacks: 0, fallbacksChanged: 0 };

for (const dir of savedRunDirs('Case Interview Runs/test runs', batches)) {
  const tf = readdirSync(dir).find(f => f.endsWith('.turns.jsonl.gz'));
  if (!tf) continue;
  const run = `${path.basename(path.dirname(dir))}/${path.basename(dir)}`;
  for (const t of readTurnFile(path.join(dir, tf)).turns) {
    const where = `${run} t${t.turnIndex + 1} ${t.stateBefore.phase} ${Math.round((t.stateBefore.elapsedMs ?? 0) / 60000)}m`;
    const dd = t.checks.find(c => c.check === 'data_decisions')?.detail as Partial<DataDecisions> & { exhibit?: string | null } | undefined;
    const spoken = t.delivered.map(s => s.text).join(' ');
    // Refusal / deferral / offer lines, re-rendered.
    if (dd) {
      const lines = (d: Partial<DataDecisions>) => renderDataLines({
        releases: [], restates: [], exhibit: null, refusals: d.refusals ?? [], defers: d.defers ?? [], gateDefers: d.gateDefers ?? [],
        unmappedDefer: false, offers: d.offers ?? [], requests: [],
      }, 's');
      // The renderer now reads catalog text as speech: compare against what was spoken.
      const old = spoken.split(/(?<=[.?!])\s+/).filter(x => /^(?:I don't have|I'll come back to|I'll share|I can share)\b/.test(x));
      const fresh = lines(dd);
      for (const o of old) {
        // Same kind of line: same lead-in and same ending ("shortly." / "once we've settled…" / "if you'd like.").
        const kind = (x: string) => `${x.split(' ').slice(0, 3).join(' ')}|${/shortly\.$|settled your structure\.$|if you'd like\.$/.exec(x)?.[0] ?? 'refusal'}`;
        const match = fresh.find(f => kind(f) === kind(o));
        if (match && match !== o) { counts.lines++; console.log(`LINE ${where}\n    was: ${o}\n    now: ${match}`); }
      }
      // A deferral the same turn's exhibit delivers.
      if (dd.exhibit && (dd.defers?.length ?? 0) > 0) {
        const covers = new Set(exhibits.find(e => e.id === dd.exhibit)?.coversLedgerItems ?? []);
        const coveredWhats = new Set(t.stateBefore.openDataRequests.filter(o => covers.has(o.ledgerItemId)).map(o => o.what));
        const dropped = (dd.defers ?? []).filter(w => coveredWhats.has(w));
        if (dropped.length > 0) { counts.exhibitDefers++; console.log(`EXHIBIT-DEFER ${where} dropped: ${dropped.join(' | ')}`); }
      }
    }
    // The replacement question, by phase and clock.
    const tail = t.delivered.filter(s => s.kind === 'tail').map(s => s.text).join(' ');
    const old = [...OLD_POOL].find(q => tail.endsWith(q));
    if (old) {
      counts.fallbacks++;
      const figuresDelivered = (FIGURES_QUESTIONS as readonly string[]).includes(old);
      const now = pickFallbackQuestion({
        figuresDelivered, seed: `${t.sessionId}:${t.turnIndex}`, last: null, phase: t.stateBefore.phase as Phase,
        timePressure: isUnderTimePressure(t.stateBefore.elapsedMs ?? 0, TOTAL_CASE_MS),
      });
      const changedPool = !(figuresDelivered ? FIGURES_QUESTIONS : NO_FIGURES_QUESTIONS as readonly string[]).includes(now);
      if (changedPool) { counts.fallbacksChanged++; console.log(`FALLBACK ${where}\n    was: ${old}\n    now: ${now}`); }
    }
  }
}
console.log(`\n${JSON.stringify(counts)}`);
