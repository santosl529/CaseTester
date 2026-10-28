// The offline auditor's input (Phase 1 contract §5, Stream 1 task 3): one run's transcript, the case ledger, and
// the run's events, as one text an Opus 5.5 call reads. Pure. Offline only: the ledger values, math-step answers and
// exhibit data go in whole — this never runs in the product and never reaches a candidate.
import type { Case } from '@/lib/cases/schema';
import type { DataDecisions } from '@/lib/orchestrator/data-decisions';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

type Turn = Pick<TurnRecord, 'turnIndex' | 'candidateText' | 'stateBefore' | 'delivered' | 'checks' | 'ended'>;
export type CheckerVerdictEvent = { turnIndex: number; claims: { span?: string; verdict?: string; correctValue?: unknown; candidateValue?: unknown; flag?: boolean; quantity?: string; errorType?: string | null }[] };

// The code checks worth the auditor's attention when they acted (the rest are noise for a fault read).
const ACTS = new Set(['math_checker', 'misquote', 'code_gate', 'itemless_defer', 'checked_ask', 'request_scope', 'refusal_covered', 'refusal_remapped',
  'partial_dropped', 'stage_hold', 'stage_yield', 'close_hold', 'turn_kind', 'probe_guard', 'math_challenge', 'vetoes', 'code_written_requests',
  'uncovered_asks', 'probe_turn_requests', 'data_decisions', 'pending_data', 'request_guard', 'must_reach', 'covers_added', 'answer_gate', 'step_probe_cap']);

// What code DROPPED or withheld, and what it decided to refuse, defer or only offer — the evidence the fault classes
// `bare_partial` and `ignored_ask` turn on. Surfaced whatever the check's decision: a turn that released nothing
// records `pass`, so the acted-only filter hid exactly this (finding 14 of the Stream 1 review). Keys are read off
// the check's `detail`; an empty or absent one prints nothing.
//
// Every key here is a field the recording code really writes, checked two ways (finding 8 of the gate report, where
// three of the eight sets named fields no check records and printed nothing on 156 turns): `data_decisions` against
// the DataDecisions type below, the rest against the corpus (tests/eval/auditor.test.ts, "the withheld keys on the
// recordings"). The ask checks (settle-turn.ts `uncovered_asks` / `probe_turn_requests`) record the message's whole
// ask bookkeeping; `open` is the subset that matters and `answered`/`covered` are the discriminator that keeps an
// answered ask from reading as a dropped one. `sentences` (every asking sentence) and `classified` are noise.
const ASK_KEYS = ['open', 'answered', 'covered', 'dropped'] as const;
// `wontGetTo` / `wontGetToNamed` are spread in only when non-empty (settle-turn.ts), so the corpus can't vouch for
// them: `satisfies` does. A rename in DataDecisions fails the typecheck here.
const DATA_DECISION_KEYS = ['refusals', 'defers', 'offers', 'wontGetTo', 'wontGetToNamed'] as const satisfies readonly (keyof DataDecisions)[];
export const WITHHELD_TYPED_ONLY: readonly string[] = ['data_decisions.wontGetToNamed'];
export const WITHHELD_KEYS: Record<string, readonly string[]> = {
  code_written_requests: ['dropped'],
  request_scope: ['scoped'],
  partial_dropped: ['what', 'checked', 'missing', 'why'],
  uncovered_asks: ASK_KEYS,
  probe_turn_requests: ASK_KEYS,
  data_decisions: DATA_DECISION_KEYS,
  code_gate: ['held', 'unchecked', 'decisions'],
  pending_data: ['changes'],
};
// Every case's exhibit data goes in whole: launch-001 exhibit-2 is 1,743 characters, and the old 1,500 clip lost its
// last rows — the one case where the auditor's missed_error recall was 50%. A test keeps every case under this.
export const EXHIBIT_DATA_CLIP = 6000;

const clip = (s: string, n: number) => s.length > n ? `${s.slice(0, n)}…` : s;
const dropsOf = (check: { check: string; detail?: unknown }): string | null => {
  const keys = WITHHELD_KEYS[check.check];
  if (!keys) return null;
  const d = (check.detail ?? {}) as Record<string, unknown>;
  const bits = keys.flatMap(k => {
    const v = d[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return [];
    return [`${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`];
  });
  return bits.length ? `${check.check}: ${clip(bits.join(' '), 400)}` : null;
};

export function caseSection(c: Case): string {
  const L = [`CASE ${c.id} — ${c.title}`, '', `PROMPT (read to the candidate at the start): ${c.prompt}`, '', 'LEDGER (every fact the case holds; id — label [released when]: line):'];
  for (const i of c.dataLedger) L.push(`- ${i.id} — ${i.label} [${i.releaseWhen}]: ${i.value}`);
  L.push('', 'EXHIBITS:');
  for (const e of c.exhibits) {
    L.push(`- ${e.id} "${e.title}" (items: ${(e.coversLedgerItems ?? []).join(', ')})${e.notes ? ` — note: ${e.notes}` : ''}`);
    L.push(`  data: ${clip(JSON.stringify(e.data), EXHIBIT_DATA_CLIP)}`);
  }
  L.push('', 'MATH STEPS (the case\'s own answers):');
  for (const s of c.mathSteps) L.push(`- ${s.id}: ${s.description} = ${s.answer}${s.unit ? ` ${s.unit}` : ''}${s.scale ? ` (${s.scale})` : ''}`);
  return L.join('\n');
}

export function transcriptSection(turns: Turn[], verdicts: CheckerVerdictEvent[] = []): string {
  const L = ['TRANSCRIPT. Each block is one interviewer turn tN (even numbers) answering the candidate message t(N−1). Segment tags: [say] acknowledgment, [data] a data line (released: ledger ids that went out with it; exhibit: an exhibit put up), [tail] the question. "kind" says who wrote the turn: model = the interviewer model with code\'s edits; anything else = code wrote it (stage asks, probes, closes). "checks" are code decisions that acted on the turn. "withheld" is what code dropped, refused, deferred or only offered on the turn, whether or not the check acted — a part of an ask with no answer shows up here and nowhere else. On the two ask checks (uncovered_asks, probe_turn_requests) the fields are the candidate message\'s ask bookkeeping: open = the asking sentences the interviewer\'s own declaration did not name; answered / covered = the asks code or that declaration DID answer on this turn (not withheld — read them as the discriminator); dropped = asks detected in the message that nothing answered. "checker" lists the math checker\'s verdicts on the candidate message (they land a turn or more later).'];
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
    const drops = t.checks.map(dropsOf).filter((x): x is string => x !== null);
    if (drops.length) L.push(`  withheld: ${drops.join(' · ')}`);
  }
  return L.join('\n');
}
