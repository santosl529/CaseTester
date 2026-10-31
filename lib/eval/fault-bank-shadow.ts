// The fault bank read against the shadow decision (Phase 2 S1): would the one data decision (ask-decision.ts) have
// done what a record asks, at the record's turn? Its outcomes are logged, never spoken, so this reads the
// `ask_decision_shadow` row, not the delivered words. Each record's own data assertions are translated:
//   refusal  must  about X → a sub-ask refused whose words (or its cut) match X     · must-not: none such
//   release  must  item I  → a sub-ask released or pointed with I, or I volunteered   · must-not: none such
//   answered item/about    → a sub-ask about it decided as one the record accepts (a deferral counts as `defer` —
//                             whether it would resolve can't be read from one turn, so it is reported apart)
// A refusal is matched on the sub-ask's words, its cut and the declared words aligned to it (code's line says those).
// Records with none of these (probes, corrections, stage asks, wording) are `n/a`: not this structure's to judge.
// `variant: 'withHead'` reads R6 as if 4.4's head-noun test were on (Lorenzo's Q2).
import type { AskDecided } from '@/lib/orchestrator/ask-decision';
import type { BankTurn } from './fault-bank-assert';
import type { FaultRecord } from './fault-bank';

export type ShadowRead = { verdict: 'pass' | 'fail' | 'na' | 'no_row'; unresolvedDefer?: true; why: string[] };

const outcomeOf = (a: AskDecided, variant: 'shadow' | 'withHead') => (variant === 'withHead' && a.outcome === 'refuse' ? a.withHead ?? a.outcome : a.outcome);

export function shadowRead(rec: FaultRecord, t: BankTurn | undefined, variant: 'shadow' | 'withHead' = 'shadow'): ShadowRead {
  // Only what the record asks of its own turn: an assertion scoped to other turns (a later release in a window) is
  // about those turns, which one turn's shadow can't speak for.
  const atTurn = (a: FaultRecord['assertions'][number]) => !('scope' in a) || !a.scope || ('turn' in a.scope ? a.scope.turn === rec.turn : a.scope.fromTurn === rec.turn || a.kind === 'answered');
  const data = rec.assertions.filter(a => (a.kind === 'refusal' || a.kind === 'release' || a.kind === 'answered') && atTurn(a));
  if (data.length === 0) return { verdict: 'na', why: [] };
  const row = t?.checks.find(c => c.check === 'ask_decision_shadow');
  if (!row) return { verdict: 'no_row', why: ['no ask_decision_shadow row at the record\'s turn'] };
  const detail = row.detail as { asks?: AskDecided[]; volunteered?: string[] } | undefined;
  const asks = detail?.asks ?? [];
  const volunteered = detail?.volunteered ?? [];
  const said = (x: AskDecided, r: RegExp | null) => !r || r.test(x.words) || r.test(x.cut ?? '') || (x.whats ?? []).some(w => r.test(w));
  const re = (p?: string) => (p ? new RegExp(p, 'i') : null);
  const why: string[] = [];
  let unresolvedDefer = false;
  for (const a of data) {
    let hit = false;
    if (a.kind === 'refusal') {
      const r = re(a.about);
      hit = asks.some(x => (outcomeOf(x, variant) === 'refuse' && said(x, r)) || (x.outcome === 'release' && x.cut !== undefined && said(x, r)));
    } else if (a.kind === 'release') {
      hit = volunteered.includes(a.item) || asks.some(x => (x.outcome === 'release' || x.outcome === 'point') && x.items.includes(a.item));
    } else if (a.kind === 'answered') {
      const accept = new Set(a.accept ?? ['release', 'refusal', 'deferral']);
      const r = re(a.about);
      const about = (x: AskDecided) => (a.item ? x.items.includes(a.item) : false) || (r ? said(x, r) : false);
      if (a.item && accept.has('release') && volunteered.includes(a.item)) hit = true;
      for (const x of asks.filter(about)) {
        const o = outcomeOf(x, variant);
        if (accept.has('release') && (o === 'release' || o === 'point') && (!a.item || x.items.includes(a.item))) hit = true;
        if (accept.has('refusal') && (o === 'refuse' || x.cut !== undefined)) hit = true;
        if (accept.has('deferral') && o === 'defer') { hit = true; unresolvedDefer = true; }
      }
    }
    if (hit !== a.must) why.push(`${a.kind}${a.must ? '' : ' (must not)'} ${'item' in a && a.item ? a.item : ''}${'about' in a && a.about ? ` /${a.about}/` : ''}`.trim());
  }
  return { verdict: why.length === 0 ? 'pass' : 'fail', ...(unresolvedDefer && why.length === 0 ? { unresolvedDefer: true as const } : {}), why };
}
