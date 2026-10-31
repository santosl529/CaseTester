// The bank's `report` assertion (Lorenzo, 31 Oct, tester-fixes ruling 1): a re-graded post-recommendation probe asserts
// the close AND the figure in the report's math-checker section, not the close alone.
import { describe, it, expect } from 'vitest';
import { evaluateRecord, type BankTurn } from '@/lib/eval/fault-bank-assert';
import { FaultRecordSchema, type Assertion } from '@/lib/eval/fault-bank';
import { SpecSchema } from '@/lib/eval/fault-bank-build';

const close: BankTurn = {
  turnIndex: 13, ended: true, checks: [],
  delivered: [{ kind: 'tail', text: 'I have what I need. Thanks for working through it — your written report will follow.', revealIds: [], atMs: 0 }] as unknown as BankTurn['delivered'],
  stateBefore: { revealedIds: [], shownExhibitIds: [], openDataRequests: [] } as unknown as BankTurn['stateBefore'],
};
const rec = (a: Assertion[]) => FaultRecordSchema.parse({
  id: 'x', kind: 'correct', batch: 'b', wave: 'w', run: 'r', turnFile: 'f', caseId: 'prof-001', persona: 15, turn: 14,
  grade: { severity: 'correct', class: 'correct_probe', source: 's', note: 'n' }, state: { phase: 'SYNTHESIS', elapsedMs: 0, revealedIds: [], shownExhibitIds: [], openDataRequests: [] },
  candidateText: 'c', said: 's', assertions: a, replayable: true, stream: 'none', regraded: 'Lorenzo, 31 Oct',
});
const section = (outcome: string) => `MATH CHECKER (…):
- turn 13: "with revenue up about 19% on volume alone" — WRONG (misquote): about 15 by the checker. ${outcome}
Treat a WRONG claim as the candidate's error unless they revised it.`;

describe('report assertion', () => {
  const r = rec([{ kind: 'close', must: true }, { kind: 'report', figure: '19%', must: true }]);
  it('passes on the close with the figure left open by it in the report', () => {
    expect(evaluateRecord(r, [close], { lines: {} }, section('Not raised in the interview (the case closed first).')).pass).toBe(true);
  });
  it('fails when the report has no row for the figure, or no checker section at all', () => {
    expect(evaluateRecord(rec([{ kind: 'report', figure: '23%', must: true }]), [close], { lines: {} }, section('Not raised in the interview (the case closed first).')).pass).toBe(false);
    expect(evaluateRecord(r, [close], { lines: {} }, null).failed.map(f => f.saw)).toEqual(['no checker events in the run']);
  });
  it('reads the outcome: a probed figure is not one the close left open', () => {
    expect(evaluateRecord(r, [close], { lines: {} }, section('Probed; not corrected.')).pass).toBe(false);
    expect(evaluateRecord(rec([{ kind: 'report', figure: '19%', outcome: 'Probed', must: true }]), [close], { lines: {} }, section('Probed; not corrected.')).pass).toBe(true);
  });
  it('takes no scope, and only a correct record is re-graded', () => {
    expect(() => rec([{ kind: 'report', must: true, scope: { turn: 3 } } as unknown as Assertion])).toThrow();
    const spec = { id: 'y', kind: 'fault', p: '01', turn: 2, sev: 'firm', cls: 'other', note: 'n', a: [{ kind: 'close', must: true }], rep: true, stream: 'none', rg: 'x' };
    expect(SpecSchema.safeParse(spec).success).toBe(false);
  });
});
