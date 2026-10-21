// Exact labels for every Haiku ask-check call (Phase 1 contract §5, Stream 1 task 2): the small-model check on an
// ask no item matched (turn-data.ts checkAsk → classifyAsk), recorded per turn as an `itemless_defer` check. Each
// call gets one hand label in evals/ask-check-labels/labels.json; scripts/ask-check-labels.ts joins them and writes
// the tables. Labels (Lorenzo's five, plus the calls that returned no verdict):
//   correct_item  mapped, and the mapping is right (the items answer the ask; a coarse or partial label where due)
//   wrong_item    mapped, to items that don't answer the ask (the case holds no answer, or another item answers it)
//   correct_none  "maps to no item", and the case holds nothing that answers it
//   false_none    "maps to no item", but a ledger item answers it (coarser forms count, as Lorenzo's rule 1)
//   partly_right  mapped, part right: a right item with a wrong full/partial/out-of-scope label, or a missed item
//   timeout       no verdict (the 1.5 s cap) — not a Haiku answer, kept out of precision and the false-none rate
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

export const ASK_LABELS = ['correct_item', 'wrong_item', 'correct_none', 'false_none', 'partly_right', 'timeout'] as const;
export type AskLabel = typeof ASK_LABELS[number];

type Detail = { what?: string; mapped?: boolean | null; found?: { ids?: string[] }[] | null; decision?: string; partial?: string[]; outOfScope?: string[]; latencyMs?: number };
export type AskCall = { key: string; batch: string; persona: string; turn: number; ask: string; verdict: string; ids: string[]; latencyMs: number | null };
export type LabelledCall = AskCall & { label: AskLabel; note: string };

export function verdictKind(d: Detail): string {
  if (d.mapped === null || d.found === null || d.found === undefined) return 'timeout';
  if (!d.mapped) return 'none';
  if (d.outOfScope?.length) return 'out_of_scope';
  if (d.decision === 'coarse') return 'coarse';
  if (d.partial?.length) return 'items+partial';
  return 'items';
}

export function askCheckCalls(batch: string, persona: string, turns: Pick<TurnRecord, 'turnIndex' | 'checks'>[]): AskCall[] {
  const out: AskCall[] = [];
  for (const t of turns) {
    const calls = t.checks.filter(c => c.check === 'itemless_defer');
    calls.forEach((c, i) => {
      const d = (c.detail ?? {}) as Detail;
      out.push({
        key: `${batch}-${persona}-t${t.turnIndex + 1}-${i + 1}`, batch, persona, turn: t.turnIndex + 1, ask: d.what ?? '',
        verdict: verdictKind(d), ids: [...new Set((d.found ?? []).flatMap(f => f.ids ?? []))], latencyMs: d.latencyMs ?? null,
      });
    });
  }
  return out;
}

type Row = Record<AskLabel, number> & { calls: number; positives: number; nones: number; timeouts: number; precisionStrict: number | null; precisionLenient: number | null; falseNoneRate: number | null };
function row(calls: LabelledCall[]): Row {
  const n = Object.fromEntries(ASK_LABELS.map(l => [l, calls.filter(c => c.label === l).length])) as Record<AskLabel, number>;
  const positives = n.correct_item + n.wrong_item + n.partly_right;
  const nones = n.correct_none + n.false_none;
  return {
    ...n, calls: calls.length, positives, nones, timeouts: n.timeout,
    precisionStrict: positives ? n.correct_item / positives : null,
    precisionLenient: positives ? (n.correct_item + n.partly_right) / positives : null,
    falseNoneRate: nones ? n.false_none / nones : null,
  };
}

export function labelTables(calls: LabelledCall[]): { byBatch: Record<string, Row>; total: Row } {
  const batches = [...new Set(calls.map(c => c.batch))];
  return { byBatch: Object.fromEntries(batches.map(b => [b, row(calls.filter(c => c.batch === b))])), total: row(calls) };
}
