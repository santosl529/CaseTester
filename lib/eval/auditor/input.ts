// The offline auditor's input (Phase 1 contract §5, Stream 1 task 3): one run's transcript, the case ledger, and
// the run's events, as one text an Opus 5.5 call reads. Pure. Offline only: the ledger values, math-step answers and
// exhibit data go in whole — this never runs in the product and never reaches a candidate.
import type { Case } from '@/lib/cases/schema';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

type Turn = Pick<TurnRecord, 'turnIndex' | 'candidateText' | 'stateBefore' | 'delivered' | 'checks' | 'ended'>;
export type CheckerVerdictEvent = { turnIndex: number; claims: { span?: string; verdict?: string; correctValue?: unknown; candidateValue?: unknown; flag?: boolean; quantity?: string; errorType?: string | null }[] };

// The code checks worth the auditor's attention when they acted (the rest are noise for a fault read).
const ACTS = new Set(['math_checker', 'misquote', 'code_gate', 'itemless_defer', 'checked_ask', 'request_scope', 'refusal_covered', 'refusal_remapped',
  'partial_dropped', 'stage_hold', 'stage_yield', 'close_hold', 'turn_kind', 'probe_guard', 'math_challenge', 'vetoes', 'code_written_requests',
  'uncovered_asks', 'request_guard', 'must_reach', 'covers_added', 'answer_gate', 'step_probe_cap']);

const clip = (s: string, n: number) => s.length > n ? `${s.slice(0, n)}…` : s;

export function caseSection(c: Case): string {
  const L = [`CASE ${c.id} — ${c.title}`, '', `PROMPT (read to the candidate at the start): ${c.prompt}`, '', 'LEDGER (every fact the case holds; id — label [released when]: line):'];
  for (const i of c.dataLedger) L.push(`- ${i.id} — ${i.label} [${i.releaseWhen}]: ${i.value}`);
  L.push('', 'EXHIBITS:');
  for (const e of c.exhibits) {
    L.push(`- ${e.id} "${e.title}" (items: ${(e.coversLedgerItems ?? []).join(', ')})${e.notes ? ` — note: ${e.notes}` : ''}`);
    L.push(`  data: ${clip(JSON.stringify(e.data), 1500)}`);
  }
  L.push('', 'MATH STEPS (the case\'s own answers):');
  for (const s of c.mathSteps) L.push(`- ${s.id}: ${s.description} = ${s.answer}${s.unit ? ` ${s.unit}` : ''}${s.scale ? ` (${s.scale})` : ''}`);
  return L.join('\n');
}

export function transcriptSection(turns: Turn[], verdicts: CheckerVerdictEvent[] = []): string {
  const L = ['TRANSCRIPT. Each block is one interviewer turn tN (even numbers) answering the candidate message t(N−1). Segment tags: [say] acknowledgment, [data] a data line (released: ledger ids that went out with it; exhibit: an exhibit put up), [tail] the question. "kind" says who wrote the turn: model = the interviewer model with code\'s edits; anything else = code wrote it (stage asks, probes, closes). "checks" are code decisions that acted on the turn. "checker" lists the math checker\'s verdicts on the candidate message (they land a turn or more later).'];
  const byTurn = new Map(verdicts.map(v => [v.turnIndex, v]));
  for (const t of turns) {
    const n = t.turnIndex + 1;
    L.push('', `--- t${n - 1} CANDIDATE: ${t.candidateText}`);
    const v = byTurn.get(t.turnIndex);
    if (v?.claims.length) L.push(`    checker on t${n - 1}: ${v.claims.map(c => `"${clip(c.span ?? '', 90)}" ${c.verdict}${c.verdict === 'error' ? ` (right: ${String(c.correctValue)}; flag ${c.flag ? 'yes' : 'no'}${c.errorType ? `; ${c.errorType}` : ''})` : ''}`).join(' | ')}`);
    const sb = t.stateBefore;
    L.push(`=== t${n} INTERVIEWER [kind ${sb.kind}; phase ${sb.phase}; ${Math.round((sb.elapsedMs ?? 0) / 1000)}s; out before: ${sb.revealedIds.length} items, exhibits ${sb.shownExhibitIds.join(', ') || 'none'}${t.ended ? '; ENDED' : ''}]`);
    for (const s of t.delivered) L.push(`  [${s.kind}${s.revealIds.length ? ` released: ${s.revealIds.join(', ')}` : ''}${s.exhibitId ? ` exhibit: ${s.exhibitId}` : ''}] ${s.text}`);
    const acts = t.checks.filter(c => c.decision === 'act' && ACTS.has(c.check)).map(c => `${c.check}: ${clip(c.reason ?? '', 110)}`);
    if (acts.length) L.push(`  checks: ${acts.join(' · ')}`);
  }
  return L.join('\n');
}
