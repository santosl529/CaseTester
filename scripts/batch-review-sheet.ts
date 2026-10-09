//   npx tsx scripts/batch-review-sheet.ts --write [--full-reads=8]   → batch-18/review-sheet.md
//   npx tsx scripts/batch-review-sheet.ts --apply [--include-reruns]  → faults.jsonl updated from the sheet; headline.json (reruns left out by default)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { renderReviewSheet, parseReviewSheet, applyVerdicts, proposedForReview } from '@/lib/eval/review-sheet';
import { headline, headlineScope } from '@/lib/eval/headline';
import type { FaultRecord } from '@/lib/eval/prescreen';
import type { ScorecardRow } from '@/lib/eval/scorecard';

const OUT = 'Case Interview Runs/test runs/batch-18';
const faultsPath = path.join(OUT, 'faults.jsonl');
const sheetPath = path.join(OUT, 'review-sheet.md');
const faults = existsSync(faultsPath) ? readFileSync(faultsPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as FaultRecord) : [];

if (process.argv.includes('--write')) {
  if (existsSync(sheetPath) && !process.argv.includes('--force')) {
    console.error(`[review] ${sheetPath} already exists. Use --force to overwrite.`);
    process.exit(1);
  }
  const n = Number(process.argv.find(a => a.startsWith('--full-reads='))?.split('=')[1] ?? 8);
  const rows = JSON.parse(readFileSync(path.join(OUT, 'scorecard.json'), 'utf8')) as ScorecardRow[];
  const flagged = new Set([...faults.map(f => f.runId), ...rows.filter(r => r.codeFlags.length).map(r => r.runId)]);
  const clean = rows.map(r => r.runId).filter(id => !flagged.has(id));
  const pick = clean.map(id => ({ id, k: Math.random() })).sort((a, b) => a.k - b.k).slice(0, n).map(x => x.id);
  const proposed = proposedForReview(faults);
  writeFileSync(sheetPath, renderReviewSheet(faults, pick));
  console.log(`[review] ${sheetPath}: ${proposed.serious.length} serious proposed, ${proposed.moderate.length} moderate proposed, ${pick.length} full reads`);
} else if (process.argv.includes('--apply')) {
  const { verdicts, humanFaults, unrecognised } = parseReviewSheet(readFileSync(sheetPath, 'utf8'));
  const applied = applyVerdicts(faults, verdicts);

  // Count verdicts that actually matched existing faults
  let matchedVerdicts = 0;
  for (const [id] of verdicts) {
    if (faults.some(f => f.id === id)) {
      matchedVerdicts++;
    } else {
      unrecognised.push(`${id}: verdict id not found in existing faults`);
    }
  }

  // Add human faults (skip if id already present)
  const existingIds = new Set(applied.map(f => f.id));
  const newHumanFaults = humanFaults.filter(f => !existingIds.has(f.id));
  const allFaults = [...applied, ...newHumanFaults];

  writeFileSync(faultsPath, allFaults.map(f => JSON.stringify(f)).join('\n') + '\n');
  console.log(`[review] applied ${matchedVerdicts} verdicts to existing faults, added ${newHumanFaults.length} human-found faults`);
  const scope = headlineScope(JSON.parse(readFileSync(path.join(OUT, 'scorecard.json'), 'utf8')) as ScorecardRow[], allFaults, process.argv.includes('--include-reruns'));
  const h = headline(scope.rows, scope.faults);
  writeFileSync(path.join(OUT, 'headline.json'), JSON.stringify({ ...h, excludedReruns: scope.excludedReruns }, null, 2));
  if (scope.excludedReruns.length) console.log(`[review] headline leaves out ${scope.excludedReruns.length} reruns (--include-reruns to count them): ${scope.excludedReruns.join(', ')}`);
  console.log(`[review] ${h.withSerious}/${h.interviews} interviews with a confirmed serious fault · ${h.confirmedSerious} confirmed serious faults · ${h.seriousPer100Turns.toFixed(1)} serious per 100 turns · ${h.confirmedModerate} confirmed moderate (${h.proposedModerateUnconfirmed} still proposed) · ${h.confirmedPer100Turns.toFixed(1)} all confirmed per 100 turns · longest faulty stretch ${Math.max(0, ...h.longestFaultyStretch.map(x => x.turns))} turns`);
  if (unrecognised.length) console.warn(`[review] NOT applied — fix these lines in the sheet:\n  ${unrecognised.join('\n  ')}`);
} else {
  console.error('use --write or --apply');
  process.exit(1);
}
