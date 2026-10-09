// Batch headline (spec 2026-10-09 §2.3): confirmed faults only, so a long
// loop in one interview is visible next to the averages.
import type { ScorecardRow } from './scorecard';
import type { FaultRecord } from './prescreen';

export function headline(rows: ScorecardRow[], faults: FaultRecord[]) {
  const confirmed = faults.filter(f => f.status === 'confirmed');
  const confirmedSerious = confirmed.filter(f => f.severity === 'serious');
  const confirmedModerate = confirmed.filter(f => f.severity === 'moderate');
  const confirmedMinor = confirmed.filter(f => f.severity === 'minor');
  const proposedModerate = faults.filter(f => f.severity === 'moderate' && f.status === 'proposed');
  const prescreen = faults.filter(f => f.source === 'prescreen');
  const prescreenConfirmed = prescreen.filter(f => f.status === 'confirmed');
  const prescreenRejected = prescreen.filter(f => f.status === 'rejected');

  const turns = rows.reduce((n, r) => n + r.modelTurns, 0);
  const longestFaultyStretch = rows.map(r => {
    // Interviewer lines sit at even turn indices 2, 4, 6, …: consecutive interviewer turns differ by 2.
    const idx = [...new Set(confirmed.filter(f => f.runId === r.runId).map(f => f.turnIndex))].sort((a, b) => a - b);
    let best = 0, cur = 0, prev = -10;
    for (const i of idx) { cur = i - prev === 2 ? cur + 1 : 1; best = Math.max(best, cur); prev = i; }
    return { runId: r.runId, turns: best };
  });

  const prescreenReviewed = prescreenConfirmed.length + prescreenRejected.length;
  const prescreenPrecision = prescreenReviewed > 0 ? prescreenConfirmed.length / prescreenReviewed : null;
  const withSerious = new Set(confirmedSerious.map(f => f.runId)).size;

  return {
    interviews: rows.length,
    withSerious,
    confirmedSerious: confirmedSerious.length,
    confirmedModerate: confirmedModerate.length,
    confirmedMinor: confirmedMinor.length,
    turns,
    seriousPer100Turns: turns ? (100 * confirmedSerious.length) / turns : 0,
    confirmedPer100Turns: turns ? (100 * confirmed.length) / turns : 0,
    proposedModerateUnconfirmed: proposedModerate.length,
    prescreenPrecision,
    humanFound: faults.filter(f => f.source === 'human').length,
    longestFaultyStretch,
  };
}
