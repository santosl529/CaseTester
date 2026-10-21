// The offline auditor's input, schema and calibration (lib/eval/auditor/**). No API call.
import { describe, it, expect } from 'vitest';
import { caseSection, transcriptSection } from '@/lib/eval/auditor/input';
import { AUDITOR_CLASSES, AUDITOR_RULES, AuditOutputSchema } from '@/lib/eval/auditor/prompt';
import { matchRun, calibrate, FAMILIES, type Hand } from '@/lib/eval/auditor/calibrate';
import { auditPrompt } from '@/lib/eval/auditor/audit';
import { FAULT_CLASSES } from '@/lib/eval/fault-bank';
import { getCaseById } from '@/lib/cases/loader';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

const turn = (turnIndex: number, text: string, extra: Partial<TurnRecord> = {}) => ({
  turnIndex, candidateText: `candidate ${turnIndex}`, ended: false, checks: [],
  stateBefore: { phase: 'ANALYSIS', elapsedMs: 60_000, kind: 'model', revealedIds: [], shownExhibitIds: [] },
  delivered: [{ kind: 'tail', text, revealIds: [], atMs: 0 }], ...extra,
}) as unknown as TurnRecord;

describe('auditor input', () => {
  it('gives the whole ledger, exhibits and math answers, and every turn as tN', () => {
    const c = getCaseById('prof-002');
    const cs = caseSection(c);
    for (const i of c.dataLedger) expect(cs).toContain(`- ${i.id} — `);
    expect(cs).toContain('exhibit-3');
    expect(cs).toContain('op_profit_swing');
    const ts = transcriptSection([turn(1, 'Walk me through that.'), turn(3, 'What else?', { checks: [{ check: 'math_checker', decision: 'act', reason: 'checker flag delivered: probe' }] } as never)],
      [{ turnIndex: 1, claims: [{ span: '$21M fixed', verdict: 'error', correctValue: 20, flag: false, errorType: 'misquote' }] }]);
    expect(ts).toContain('--- t1 CANDIDATE: candidate 1');
    expect(ts).toContain('=== t2 INTERVIEWER [kind model');
    expect(ts).toContain('checker on t1: "$21M fixed" error (right: 20; flag no; misquote)');
    expect(ts).toContain('checks: math_checker: checker flag delivered: probe');
    expect(auditPrompt(cs, ts)).toContain(AUDITOR_RULES);
  });

  it('asks for the fault bank\'s classes (report faults aside) and four severities', () => {
    expect(AUDITOR_CLASSES).toEqual(FAULT_CLASSES.filter(c => c !== 'report_false'));
    for (const c of AUDITOR_CLASSES) expect(AUDITOR_RULES).toContain(`- ${c}: `);
    expect(AuditOutputSchema.parse({ faults: [{ turn: 12, class: 'false_refusal', severity: 'serious', quote: 'I don’t have…', why: 'aircraft_leases' }] }).faults).toHaveLength(1);
    expect(() => AuditOutputSchema.parse({ faults: [{ turn: 12, class: 'report_false', severity: 'serious', quote: '', why: '' }] })).toThrow();
    for (const c of FAULT_CLASSES) expect(FAMILIES[c], c).toBeTruthy();
  });
});

describe('calibration', () => {
  const hand = (id: string, t: number, cls: string, severity = 'firm', scope?: { fromTurn: number; toTurn?: number }): Hand =>
    ({ id, turn: t, cls, severity, assertions: [{ kind: 'probe', must: false, ...(scope ? { scope } : {}) }] });
  const p = (t: number, cls: string, severity = 'firm') => ({ turn: t, class: cls, severity: severity as 'firm', quote: '', why: '' });

  it('matches by class within the slack, then by family, each once', () => {
    const m = matchRun([hand('a', 12, 'stale_probe'), hand('b', 20, 'false_refusal'), hand('c', 30, 'close_wait_reask')],
      [p(14, 'stale_probe'), p(20, 'bare_partial'), p(40, 'close_wait_reask'), p(12, 'stale_probe')]);
    expect(m).toEqual(expect.arrayContaining([
      { hand: 'a', predicted: 3, sameClass: true, severityAgrees: true },
      { hand: 'b', predicted: 1, sameClass: false, severityAgrees: true },
    ]));
    expect(m).toHaveLength(2);
  });

  it('a scope window widens where a hand fault can be found', () => {
    expect(matchRun([hand('chain', 6, 'probe_chain', 'serious', { fromTurn: 6, toTurn: 14 })], [p(16, 'probe_chain', 'serious')])).toHaveLength(1);
  });

  it('counts recall and precision per class and family, detection and severity agreement', () => {
    const c = calibrate([{ hand: [hand('a', 12, 'stale_probe'), hand('b', 20, 'false_refusal', 'serious')], predicted: [p(12, 'stale_probe'), p(20, 'bare_partial'), p(30, 'wrong_figure')] }]);
    expect(c.byClass.stale_probe).toEqual({ hand: 1, predicted: 1, matchedHand: 1, matchedPredicted: 1 });
    expect(c.byClass.false_refusal).toEqual({ hand: 1, predicted: 0, matchedHand: 0, matchedPredicted: 0 });
    expect(c.byFamily.asks).toEqual({ hand: 1, predicted: 1, matchedHand: 1, matchedPredicted: 1 });
    expect(c.detection).toEqual({ hand: 2, predicted: 3, matchedHand: 2, matchedPredicted: 2 });
    expect(c.severityAgreement).toEqual({ agree: 1, of: 2 });
  });
});
