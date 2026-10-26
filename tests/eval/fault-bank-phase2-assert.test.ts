// Phase 2 S0: the bank's `lint` and `subAsk` assertions (design §3.4, §2).
import { describe, it, expect } from 'vitest';
import { evaluateRecord, type BankTurn } from '@/lib/eval/fault-bank-assert';
import { FaultRecordSchema, type Assertion } from '@/lib/eval/fault-bank';

const turn = (delivered: BankTurn['delivered'], checks: BankTurn['checks'] = []): BankTurn => ({
  turnIndex: 19, delivered, checks, ended: false,
  stateBefore: { revealedIds: [], shownExhibitIds: [], openDataRequests: [] } as unknown as BankTurn['stateBefore'],
});
const seg = (kind: string, text: string) => ({ kind, text, revealIds: [], atMs: 0 }) as unknown as BankTurn['delivered'][number];
const rec = (a: Assertion[]) => FaultRecordSchema.parse({
  id: 'x', kind: 'fault', batch: 'b', wave: 'w', run: 'r', turnFile: 'f', caseId: 'prof-002', persona: 64, turn: 20,
  grade: { severity: 'borderline', class: 'other', source: 's', note: 'n' }, state: { phase: 'ANALYSIS', elapsedMs: 0, revealedIds: [], shownExhibitIds: [], openDataRequests: [] },
  candidateText: 'c', said: 's', assertions: a, replayable: true, stream: 'phase2',
});

describe('lint assertion', () => {
  const dangling = turn([seg('say', 'Understood. On variable cost, you said $8,800 per flight.'), seg('data', 'New routes often run around 60%.'), seg('tail', 'Where did that figure come from?')]);
  const fixed = turn([seg('say', 'Understood.'), seg('data', 'New routes often run around 60%.'), seg('tail', 'On variable cost, you said $8,800 per flight. Where did that figure come from?')]);
  it('L2 must-not fails the dangling turn and passes the fixed one', () => {
    const r = rec([{ kind: 'lint', rule: 'L2', must: false }]);
    expect(evaluateRecord(r, [dangling], { lines: {} }).pass).toBe(false);
    expect(evaluateRecord(r, [fixed], { lines: {} }).pass).toBe(true);
  });
});

describe('subAsk assertion', () => {
  const row = (asks: { words: string; outcome: string }[]) => [{ check: 'ask_decision_shadow', decision: 'act', detail: { asks } }] as unknown as BankTurn['checks'];
  it('reads the shadow row: words and outcome', () => {
    const r = rec([{ kind: 'subAsk', about: 'elasticity', accept: ['refuse'], must: true }]);
    expect(evaluateRecord(r, [turn([seg('say', 'Ok.')], row([{ words: 'price elasticity on the four routes', outcome: 'refuse' }]))], { lines: {} }).pass).toBe(true);
    expect(evaluateRecord(r, [turn([seg('say', 'Ok.')], row([{ words: 'price elasticity on the four routes', outcome: 'defer' }]))], { lines: {} }).pass).toBe(false);
    expect(evaluateRecord(r, [turn([seg('say', 'Ok.')])], { lines: {} }).pass).toBe(false);
  });
});

describe('answered with wontResolves (session-1 ruling 2)', () => {
  const t = (n: number, text: string): BankTurn => ({ ...turn([seg('data', text)]), turnIndex: n - 1 });
  it('a deferral closed by "We won\'t get to …" resolves only when the record allows it', () => {
    const turns = [t(20, 'I\'ll come back to the passenger mix shortly. What else?'), t(22, 'Go on.'), t(24, 'We won\'t get to the passenger mix today. What would you recommend?')];
    const strict = rec([{ kind: 'answered', about: 'mix', accept: ['refusal', 'deferral'], must: true }]);
    const loose = rec([{ kind: 'answered', about: 'mix', accept: ['refusal', 'deferral'], wontResolves: true, must: true }]);
    expect(evaluateRecord(strict, turns, { lines: {} }).pass).toBe(false);
    expect(evaluateRecord(loose, turns, { lines: {} }).pass).toBe(true);
    expect(evaluateRecord(loose, turns.slice(0, 2), { lines: {} }).pass).toBe(false);
  });
});
