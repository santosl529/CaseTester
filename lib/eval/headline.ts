// Batch headline (spec 2026-10-09 §2.3): confirmed faults only, so a long
// loop in one interview is visible next to the averages.
import type { ScorecardRow } from './scorecard';
import type { FaultRecord } from './prescreen';

export function headline(rows: ScorecardRow[], faults: FaultRecord[]) {
  const confirmed = faults.filter(f => f.status === 'confirmed');
  const turns = rows.reduce((n, r) => n + r.modelTurns, 0);
  const longestFaultyStretch = rows.map(r => {
    // Interviewer lines sit at even turn indices 2, 4, 6, …: consecutive interviewer turns differ by 2.
    const idx = [...new Set(confirmed.filter(f => f.runId === r.runId).map(f => f.turnIndex))].sort((a, b) => a - b);
    let best = 0, cur = 0, prev = -10;
    for (const i of idx) { cur = i - prev === 2 ? cur + 1 : 1; best = Math.max(best, cur); prev = i; }
    return { runId: r.runId, turns: best };
  });
  return {
    interviews: rows.length,
    withSerious: new Set(confirmed.filter(f => f.severity === 'serious').map(f => f.runId)).size,
    turns,
    confirmedFaults: confirmed.length,
    faultsPer100Turns: turns ? (100 * confirmed.length) / turns : 0,
    longestFaultyStretch,
  };
}
