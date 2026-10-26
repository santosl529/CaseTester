// The offline auditor's input, schema and calibration (lib/eval/auditor/**). No API call.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { caseSection, transcriptSection, EXHIBIT_DATA_CLIP, WITHHELD_KEYS, WITHHELD_TYPED_ONLY } from '@/lib/eval/auditor/input';
import { AUDITOR_CLASSES, AUDITOR_RULES, AuditOutputSchema } from '@/lib/eval/auditor/prompt';
import { matchRun, calibrate, FAMILIES, type Hand } from '@/lib/eval/auditor/calibrate';
import { auditPrompt } from '@/lib/eval/auditor/audit';
import { FAULT_CLASSES } from '@/lib/eval/fault-bank';
import { getCaseById, loadCases } from '@/lib/cases/loader';
import { SLICES } from '@/lib/eval/fault-bank-build';
import { readTurnFile } from '@/lib/eval/turn-file';
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

  // Finding 14 of the Stream 1 review: launch-001 exhibit-2 is 1,743 characters and the old 1,500 clip silently
  // lost its last rows — the one case where the auditor's missed_error recall was 50%.
  it('gives every exhibit\'s data whole', () => {
    for (const c of loadCases()) {
      for (const e of c.exhibits) {
        expect(JSON.stringify(e.data).length, `${c.id} ${e.id}`).toBeLessThanOrEqual(EXHIBIT_DATA_CLIP);
        expect(caseSection(c), `${c.id} ${e.id}`).toContain(JSON.stringify(e.data));
      }
    }
  });

  // The same finding: the auditor saw only checks that ACTED, so what code dropped — the evidence for
  // bare_partial and ignored_ask — never reached it. A turn that releases nothing records `pass`.
  it('surfaces what code withheld, whatever the check\'s decision', () => {
    const ts = transcriptSection([turn(1, 'Go on.', { checks: [
      { check: 'code_written_requests', decision: 'act', reason: 'detected requests no asking sentence covers', detail: { dropped: ['the entrant\'s frequency on each route'] } },
      { check: 'data_decisions', decision: 'pass', reason: 'data decided by code', detail: { releases: [], exhibit: null, refusals: ['competitor_costs'], defers: [], offers: [] } },
      { check: 'partial_dropped', decision: 'act', reason: 'a partial whose missing part did not hold', detail: { what: 'seats by route', checked: 'seats', missing: null, why: 'whole_ask' } },
    ] } as never)], []);
    expect(ts).toContain("withheld: code_written_requests: dropped=[\"the entrant's frequency on each route\"]");
    expect(ts).toContain('data_decisions: refusals=["competitor_costs"]');
    expect(ts).toContain('partial_dropped: what=seats by route checked=seats why=whole_ask');
    expect(ts).not.toContain('releases=');     // only what was withheld
    expect(transcriptSection([turn(1, 'Go on.')], [])).not.toContain('withheld:');
  });

  // Finding 8 of the gate report: three of the eight declared key sets named keys no check records, so
  // `uncovered_asks` — the stated evidence for bare_partial and ignored_ask — printed nothing on 0 of 156 turns.
  // The details below are copied from real b33–b38 records (shape and key names).
  it('reads the ask, gate and pending-data keys the checks really record', () => {
    const ts = transcriptSection([turn(1, 'Go on.', { checks: [
      { check: 'uncovered_asks', decision: 'act', reason: 'the message\'s asks no explicit declaration covers are answered', detail: {
        sentences: ['Do we have the prevalence, and the growth of the treated pool?'], open: ['Do we have the prevalence, and the growth of the treated pool?'],
        classified: true, answered: ['US prevalence of Corlan\'s disease'], covered: [], dropped: ['Year-over-year growth of the eligible patient pool'] } },
      { check: 'code_gate', decision: 'pass', reason: 'code\'s lines wait for the checker: held, released or dropped', detail: {
        held: ['misquote:recipe_cost'], unchecked: [], decisions: [] } },
      { check: 'pending_data', decision: 'act', reason: 'question rewritten: the data was delivered this turn', detail: {
        changes: [{ from: 'Once I have the bean share, what does that tell you?', to: null }] } },
      { check: 'data_decisions', decision: 'act', reason: 'data decided by code', detail: {
        releases: [], exhibit: null, refusals: [], defers: [], offers: [], wontGetTo: ['the cost disadvantage breakdown'] } },
    ] } as never)], []);
    expect(ts).toContain('uncovered_asks: open=["Do we have the prevalence, and the growth of the treated pool?"]');
    expect(ts).toContain('answered=["US prevalence of Corlan\'s disease"]');
    expect(ts).toContain('dropped=["Year-over-year growth of the eligible patient pool"]');
    expect(ts).toContain('code_gate: held=["misquote:recipe_cost"]');
    expect(ts).toContain('pending_data: changes=');
    expect(ts).toContain('data_decisions: wontGetTo=["the cost disadvantage breakdown"]');
    expect(ts).not.toContain('sentences=');     // every asking sentence is noise; `open` is the subset that matters
    expect(ts).not.toContain('classified=');
    // The header has to say what the ask fields mean, or `answered` reads as withheld.
    expect(ts).toContain('open =');
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

// Against the recordings themselves (the main checkout's corpus; skipped where it isn't): every key the auditor's
// `withheld` line declares has to exist in a real recorded check detail. Finding 8 of the gate report: three key
// sets named fields no check ever wrote, so they printed nothing and nobody noticed. A rename now fails here —
// except data_decisions, whose keys are checked against DataDecisions at compile time (WITHHELD_TYPED_ONLY).
const CORPUS = process.env.REPLAY_ROOT ?? '/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs';
describe.skipIf(!existsSync(CORPUS))('the withheld keys on the recordings', () => {
  it('every declared key is a key some check really records', () => {
    const seen = new Map<string, Set<string>>();
    for (const s of SLICES) {
      const waveDir = path.join(CORPUS, 'test runs', s.wave);
      if (!existsSync(waveDir)) continue;
      for (const d of readdirSync(waveDir).filter(x => /^\d\d-/.test(x))) {
        const f = readdirSync(path.join(waveDir, d)).find(x => x.endsWith('.turns.jsonl.gz'));
        if (!f) continue;
        for (const t of readTurnFile(path.join(waveDir, d, f)).turns) {
          for (const c of t.checks) {
            if (!(c.check in WITHHELD_KEYS)) continue;
            if (!seen.has(c.check)) seen.set(c.check, new Set());
            for (const k of Object.keys((c.detail ?? {}) as Record<string, unknown>)) seen.get(c.check)!.add(k);
          }
        }
      }
    }
    expect([...seen.keys()].sort()).toEqual(Object.keys(WITHHELD_KEYS).sort());   // every check still runs
    const dead = Object.entries(WITHHELD_KEYS).flatMap(([check, keys]) =>
      keys.filter(k => !seen.get(check)?.has(k) && !WITHHELD_TYPED_ONLY.includes(`${check}.${k}`)).map(k => `${check}.${k}`));
    expect(dead).toEqual([]);
  });
});
