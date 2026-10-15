// The math checker in the report (math checker step 3, 13 Oct 2026; Lorenzo:
// a flag still unresolved goes to the session record for the report). Reads
// the session's math_checker events (lib/orchestrator/math-checker-live.ts):
// each verdict's flagged claims and the turn decisions on them.
//   - the judge is told each flagged claim, the right figure (code's own when
//     code wrote the correction) and what became of it in the interview;
//   - deterministic first: a stamp on a figure the checker found wrong no
//     longer counts as verified, and a doubt on a checker-flagged figure is a
//     supported challenge. Claims the deterministic checks flagged themselves
//     (dedupe) are theirs, and left out here.
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import type { VerdictPayload, CheckerDecision } from '@/lib/orchestrator/math-checker-live';
import { claimFigures } from '@/lib/orchestrator/math-checker-live';
import type { TurnVerification } from './challenge-marks';

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

export type CheckerEventRow = { category: string; subtype: string; turnIndex: number | null; payloadJsonb: unknown };


type Flagged = { id: string; turn: number; claim: VettedClaim; outcomes: CheckerDecision[] };

function flaggedClaims(rows: CheckerEventRow[]): Flagged[] {
  const decisions = rows.filter(r => r.category === 'math_checker' && r.subtype === 'flag').map(r => r.payloadJsonb as CheckerDecision);
  return rows.filter(r => r.category === 'math_checker' && r.subtype === 'verdict')
    .map(r => r.payloadJsonb as VerdictPayload)
    .sort((a, b) => a.candidateTurnIndex - b.candidateTurnIndex)
    .flatMap(v => v.claims.map((claim, i) => ({ id: `${v.candidateTurnIndex}:${i}`, turn: v.candidateTurnIndex, claim, outcomes: decisions.filter(d => d.id === `${v.candidateTurnIndex}:${i}`) })))
    .filter(f => f.claim.flag && !f.outcomes.some(d => d.outcome === 'dedupe' || d.outcome === 'disagrees_with_code'));
}

// The candidate figures the checker flagged, by candidate turn (a word
// quantity has none; `caseNumbers`: the case's figures, quoted not derived).
export function checkerFlaggedFigures(rows: CheckerEventRow[], caseNumbers: number[] = []): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const f of flaggedClaims(rows)) out.set(f.turn, [...(out.get(f.turn) ?? []), ...claimFigures(f.claim, caseNumbers)]);
  return out;
}

// Verification without the stamps the checker found wrong.
export function dropCheckerStamps(v: Map<number, TurnVerification>, rows: CheckerEventRow[], caseNumbers: number[] = []): Map<number, TurnVerification> {
  const flagged = checkerFlaggedFigures(rows, caseNumbers);
  return new Map([...v].map(([turn, x]) => [turn, { ...x, verified: x.verified.filter(s => !(flagged.get(turn) ?? []).some(n => same(n, s.value))) }]));
}

function outcomeText(outcomes: CheckerDecision[]): string {
  const has = (o: CheckerDecision['outcome']) => outcomes.find(d => d.outcome === o);
  const corrected = has('correct');
  if (corrected) return `Corrected: "${corrected.line}"`;
  if (has('stale')) return 'The candidate revised or withdrew it since.';
  if (has('pointer')) return 'Probed twice (the second time against the data); not corrected.';
  if (has('hint')) return 'Probed twice (the second time with a hint); not corrected.';
  if (has('probe')) return 'Probed; not corrected.';
  if (has('expired')) return 'Not raised in the interview (it waited behind other checks and expired).';
  if (has('shed')) return 'Not raised in the interview (minor, under time pressure).';
  if (has('unresolved_at_close')) return 'Not raised in the interview (the case closed first).';
  if (has('undelivered')) return 'Not raised in the interview (another line took the question).';
  // Past Rule 14 (Lorenzo, 13 Oct): probed twice with nothing code could correct, or a restatement of an error already handled.
  const unresolved = has('unresolved');
  if (unresolved && /restated after the flag closed/.test(unresolved.reason)) return 'Restated after it had been probed or corrected.';
  if (unresolved && /left for the report/.test(unresolved.reason)) return 'Probed twice; not corrected — left for this report.';
  return 'Not raised in the interview (the check landed after the case moved on).';
}

function figureText(c: VettedClaim): string {
  if (c.correctionFigure) return `about ${c.correctionFigure} (computed in code)`;
  if (c.correctValue !== null) return `about ${c.correctValue} by the checker`;
  if (c.correctLow !== null && c.correctHigh !== null) return `about ${c.correctLow}–${c.correctHigh} by the checker`;
  if (c.actualShare !== null) return `about ${Math.round(c.actualShare * 100)}% of the whole by the checker`;
  return 'no figure';
}

export function formatCheckerSection(rows: CheckerEventRow[]): string {
  const flagged = flaggedClaims(rows);
  if (flagged.length === 0) return '';
  const lines = flagged.map(({ turn, claim: c, outcomes }) =>
    `- turn ${turn}: "${c.span}" — WRONG (${c.errorType ?? 'error'}${c.changesConclusion ? '; changes the conclusion' : ''}): ${figureText(c)}. ${outcomeText(outcomes)}`);
  return `MATH CHECKER (a model's check of the candidate's claims, vetted in code; a figure "computed in code" is code's own):
${lines.join('\n')}
Treat a WRONG claim as the candidate's error unless they revised it — and cite it only where the transcript bears it out. One they revised or withdrew is a self-correction.`;
}
