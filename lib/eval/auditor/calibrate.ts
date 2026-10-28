// Calibrating the offline auditor against the hand grades (Phase 1 contract §5, Stream 1 task 3): the fault bank's
// fault records for a run are the hand grade (report faults aside — the auditor reads the interview only). A
// predicted fault matches a hand fault on the same run when its turn is within `slack` turns of the hand fault's
// turn (or inside its scope window) — per class when the classes agree, per family when they're in one family.
// Each hand fault and each prediction is matched at most once. Pure.
import type { FaultRecord } from '@/lib/eval/fault-bank';
import type { AuditFault } from './prompt';

export const FAMILIES: Record<string, string> = {
  false_refusal: 'asks', wrong_release: 'asks', unasked_release: 'asks', unasked_offer: 'asks', bare_partial: 'asks', restatement: 'asks', hollow_deferral: 'asks', ignored_ask: 'asks',
  stale_probe: 'math', stale_correction: 'math', false_correction: 'math', missed_error: 'math', repeated_probe: 'math', probe_chain: 'math', misquote_uncorrected: 'math', wrong_figure: 'math',
  close_wait_reask: 'flow', rec_reask: 'flow', stage_missed: 'flow', premature_close: 'flow', ack_repetition: 'flow',
  other: 'other', report_false: 'report',
};

export type Hand = Pick<FaultRecord, 'id' | 'turn' | 'assertions'> & { cls: string; severity: string };
export type Match = { hand: string; predicted: number; sameClass: boolean; severityAgrees: boolean };

const windowOf = (h: Hand): [number, number] => {
  let lo = h.turn, hi = h.turn;
  for (const a of h.assertions) {
    const s = a.scope;
    if (!s) continue;
    if ('turn' in s) { lo = Math.min(lo, s.turn); hi = Math.max(hi, s.turn); } else { lo = Math.min(lo, s.fromTurn); hi = Math.max(hi, s.toTurn ?? s.fromTurn); }
  }
  return [lo, hi];
};

// Greedy: class matches first (nearest turn), then family matches among what's left.
export function matchRun(hand: Hand[], predicted: AuditFault[], slack = 2): Match[] {
  const out: Match[] = [];
  const usedH = new Set<string>(), usedP = new Set<number>();
  const near = (h: Hand, p: AuditFault) => { const [lo, hi] = windowOf(h); return p.turn >= lo - slack && p.turn <= hi + slack; };
  const dist = (h: Hand, p: AuditFault) => Math.abs(p.turn - h.turn);
  for (const level of ['class', 'family'] as const) {
    const pairs: [Hand, number][] = [];
    for (const h of hand) predicted.forEach((p, i) => {
      const ok = level === 'class' ? p.class === h.cls : FAMILIES[p.class] === FAMILIES[h.cls];
      if (ok && near(h, p)) pairs.push([h, i]);
    });
    pairs.sort((a, b) => dist(a[0], predicted[a[1]]) - dist(b[0], predicted[b[1]]));
    for (const [h, i] of pairs) {
      if (usedH.has(h.id) || usedP.has(i)) continue;
      usedH.add(h.id); usedP.add(i);
      out.push({ hand: h.id, predicted: i, sameClass: level === 'class', severityAgrees: predicted[i].severity === h.severity });
    }
  }
  return out;
}

type Count = { hand: number; predicted: number; matchedHand: number; matchedPredicted: number };
export type Calibration = { byClass: Record<string, Count>; byFamily: Record<string, Count>; detection: Count; severityAgreement: { agree: number; of: number } };

// Per class: recall = class-level matches ÷ hand faults of the class; precision = class-level matches ÷ predictions
// of the class. Per family the same with family-level matching. Detection: any match, regardless of class.
export function calibrate(runs: { hand: Hand[]; predicted: AuditFault[] }[], slack = 2): Calibration {
  const byClass: Record<string, Count> = {}, byFamily: Record<string, Count> = {};
  const detection: Count = { hand: 0, predicted: 0, matchedHand: 0, matchedPredicted: 0 };
  const severity = { agree: 0, of: 0 };
  const bump = (m: Record<string, Count>, k: string, f: keyof Count) => { m[k] ??= { hand: 0, predicted: 0, matchedHand: 0, matchedPredicted: 0 }; m[k][f]++; };
  for (const r of runs) {
    const matches = matchRun(r.hand, r.predicted, slack);
    for (const h of r.hand) { bump(byClass, h.cls, 'hand'); bump(byFamily, FAMILIES[h.cls], 'hand'); detection.hand++; }
    for (const p of r.predicted) { bump(byClass, p.class, 'predicted'); bump(byFamily, FAMILIES[p.class], 'predicted'); detection.predicted++; }
    const byHand = new Map(r.hand.map(h => [h.id, h]));
    for (const m of matches) {
      const h = byHand.get(m.hand)!, p = r.predicted[m.predicted];
      detection.matchedHand++; detection.matchedPredicted++;
      bump(byFamily, FAMILIES[h.cls], 'matchedHand'); bump(byFamily, FAMILIES[p.class], 'matchedPredicted');
      if (m.sameClass) { bump(byClass, h.cls, 'matchedHand'); bump(byClass, p.class, 'matchedPredicted'); }
      severity.of++; if (m.severityAgrees) severity.agree++;
    }
  }
  return { byClass, byFamily, detection, severityAgreement: severity };
}
