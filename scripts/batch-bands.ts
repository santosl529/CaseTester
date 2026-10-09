// Persona-band check of batch-18 reports (free): batch-18/bands.json + bands.md.
//   npx tsx scripts/batch-bands.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BandsFileSchema, bandsSummary } from '@/lib/eval/bands';
import type { ScorecardRow } from '@/lib/eval/scorecard';
import type { FaultRecord } from '@/lib/eval/prescreen';

const OUT = 'Case Interview Runs/test runs/batch-18';
const bands = BandsFileSchema.parse(JSON.parse(readFileSync('evals/persona-bands.json', 'utf8')));
const rows = JSON.parse(readFileSync(path.join(OUT, 'scorecard.json'), 'utf8')) as ScorecardRow[];
const faultsPath = path.join(OUT, 'faults.jsonl');
const faults = existsSync(faultsPath) ? readFileSync(faultsPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as FaultRecord) : [];
const excluded = new Set(faults.filter(f => f.status === 'confirmed' && f.attribution === 'simulator').map(f => f.runId));
const s = bandsSummary(rows.filter(r => r.scoring === 'scored'), bands, excluded);
writeFileSync(path.join(OUT, 'bands.json'), JSON.stringify(s, null, 2));
const line = (name: string, t: typeof s.high) => `| ${name} | ${t.cells} | ${t.in_band} (${t.cells ? Math.round(100 * t.in_band / t.cells) : 0}%) | ${t.one_off} | ${t.two_off} | ${t.unexpected_rating} | ${t.unexpected_not_assessed} | ${t.invalid_rating} |`;
writeFileSync(path.join(OUT, 'bands.md'), [
  '# Batch 18 — reports vs persona bands', '', `Excluded (simulator broke its brief): ${s.excludedRuns.join(', ') || 'none'}`, '',
  `Not checked — no persona: ${s.skippedNoPersona.join(', ') || 'none'}; no bands entry: ${s.skippedNoBands.join(', ') || 'none'}`, '',
  '| confidence | cells | in band | one off | two off | rated, expected not assessed | not assessed, expected a rating | invalid rating |', '|---|---|---|---|---|---|---|---|',
  line('high', s.high), line('medium', s.medium), '', '## Misses', '',
  ...s.misses.map(m => `- ${m.runId} (persona ${m.personaId}) ${m.dimension}: expected ${JSON.stringify(m.expected)}, got ${m.rating} — ${m.result} (${m.confidence})`),
].join('\n') + '\n');
console.log(`[bands] high ${s.high.in_band}/${s.high.cells} in band · medium ${s.medium.in_band}/${s.medium.cells}`);
