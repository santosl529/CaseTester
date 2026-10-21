// The fault bank's detectors and assertion checks (lib/eval/fault-bank-assert.ts), on lines from the b33–b38 corpus.
import { describe, it, expect } from 'vitest';
import { readTurn, evaluateRecord, namesFigure, scopeTurns, type BankTurn } from '@/lib/eval/fault-bank-assert';
import type { FaultRecord } from '@/lib/eval/fault-bank';

type Seg = BankTurn['delivered'][number];
const seg = (text: string, kind: Seg['kind'] = 'tail', revealIds: string[] = [], exhibitId?: string): Seg => ({ kind, text, revealIds, atMs: 0, ...(exhibitId ? { exhibitId } : {}) });
const turn = (tN: number, segs: Seg[], o: { revealed?: string[]; checks?: BankTurn['checks']; ended?: boolean; open?: { ledgerItemId: string; what: string }[] } = {}): BankTurn => ({
  turnIndex: tN - 1, delivered: segs, checks: o.checks ?? [], ended: o.ended ?? false,
  stateBefore: { phase: 'ANALYSIS', elapsedMs: 0, kind: 'model', promptContext: null, revealedIds: o.revealed ?? [], shownExhibitIds: [], openDataRequests: o.open ?? [], pressureTest: null, stallRung: null, verifiedFigures: [], recomputeFlags: [], requestCues: [] },
});
const OTHER = 'On the other four routes revenue and contribution stayed nearly flat: Hub–Cedar Bluff (2,500 flights) went from $38.0M to $38.4M of revenue.';
const LINE_MAP = { route_results_other: [OTHER], new_route_rampup: ['New routes typically take 6–12 months to reach their expected load factor, and in the first year the load factor is often around 60%.'] };
const LINES = { lines: LINE_MAP, exhibits: { 'exhibit-1': ['route_results_other', 'network_totals'] } };
const NONE = { lines: {} };

const record = (o: Partial<FaultRecord>): FaultRecord => ({
  id: 'b38l-tyler-t24', kind: 'fault', batch: 'batch-38-larkspur', wave: 'w', run: 'cee7d399', turnFile: 'x', caseId: 'prof-002', persona: 64, turn: 24,
  grade: { severity: 'firm', class: 'restatement', source: 's', note: '' },
  state: { phase: 'BRAINSTORM', elapsedMs: 0, revealedIds: [], shownExhibitIds: [], openDataRequests: [] },
  candidateText: '', said: '', assertions: [{ kind: 'refusal', must: true }], replayable: true, stream: 4, ...o,
});

describe('readTurn', () => {
  it('reads refusals in every form the corpus has', () => {
    for (const s of ["I don't have split of revenue decline between passengers and average fare.",
      'Category size and growth for better-for-you snacks in the Northeast and Midwest — that\'s not something I have.',
      'When it comes to frequency expansion, I don\'t have that.', 'I have no ramp assumption to give you yet.'])
      expect(readTurn(turn(2, [seg(s, 'data')]), NONE).refusals, s).toHaveLength(1);
    expect(readTurn(turn(2, [seg('Fuel prices have been roughly flat over the period.', 'data')]), NONE).refusals).toHaveLength(0);
  });

  it('reads probes — code\'s pools and the model\'s own — and their figures', () => {
    const r = readTurn(turn(12, [seg('You said “$18,000” — can you show me that calculation step by step?')]), NONE);
    expect(r.probes).toHaveLength(1);
    expect(namesFigure(r.probes[0].segment, '$18,000')).toBe(true);
    for (const s of ['How did you get to $9?', 'Walk me through how you got there.', 'Where did that figure come from, and how does it line up with the planning estimate?',
      'Which customers did you count as having left in that 40% still on Starter at month 12?',
      'Earlier you said about $3.9 million of first-year profit, and now about $4.5 million. Can you show me, step by step, how you got to $3.9 million?',
      'What monthly amount did you divide the $900 by, and does that match how lifetime value is defined?',
      'You got 1.16M seats from 14,500 flights times 80. What flight count is that resting on?',
      'Earlier you said “19%” — how does that fit with the revenue growth over the two years that was stated in the case prompt?',
      'Before we wrap up — you said a transaction decline above 5% is where the price gain gets eaten.'.replace('.', '?')])
      expect(readTurn(turn(2, [seg(s)]), NONE).probes, s).toHaveLength(1);
    expect(readTurn(turn(2, [seg('What do those figures tell you?')]), NONE).probes).toHaveLength(0);
    expect(readTurn(turn(2, [seg('You said a low-cost carrier almost certainly entered.')]), NONE).probes).toHaveLength(0);
  });

  it('reads corrections: the pools, "not X", and code\'s "is about" line on a correction turn', () => {
    expect(readTurn(turn(16, [seg('First-year launch costs that count for the decision is about $9 million, not $10.2 million.', 'data')]), NONE).corrections).toHaveLength(1);
    expect(readTurn(turn(12, [seg('To correct one figure: on Hub–Port Avery, revenue fell from $46.8M to $32.4M.', 'data')]), NONE).corrections).toHaveLength(1);
    const codeLine = seg('Contribution per bag is about $1.5.', 'data');
    expect(readTurn(turn(12, [codeLine], { checks: [{ check: 'math_checker', decision: 'act', reason: 'checker flag delivered: correct' }] }), NONE).corrections).toHaveLength(1);
    expect(readTurn(turn(12, [codeLine], { checks: [{ check: 'math_checker', decision: 'act', reason: 'checker flag delivered: probe' }] }), NONE).corrections).toHaveLength(0);
  });

  it('reads deferrals, the model\'s "I\'ll check what we have" included', () => {
    expect(readTurn(turn(14, [seg('I\'ll come back to the fare trend across FY2024 and FY2025 shortly.', 'data')]), NONE).deferrals).toHaveLength(1);
    expect(readTurn(turn(24, [seg('On the price elasticity of those four routes, I\'ll check what we have.', 'say')]), NONE).deferrals).toHaveLength(1);
  });

  it('reads restatements: the lead-in, an item already out, a line doubled in one turn', () => {
    const r = readTurn(turn(24, [seg(`Repeating what I said before: ${OTHER}`, 'data')], { revealed: ['route_results_other'] }), LINES);
    expect(r.restatementLead).toBe(true);
    expect([...r.restatedItems]).toEqual(['route_results_other']);
    const first = readTurn(turn(4, [seg(OTHER, 'data', ['route_results_other'])]), LINES);
    expect(first.restatedItems.size + Number(first.restatementLead)).toBe(0);
    expect([...readTurn(turn(20, [seg(`${OTHER} ${OTHER}`, 'data', ['route_results_other'])]), LINES).restatedItems]).toEqual(['route_results_other']);
  });

  it('counts an exhibit\'s items as released by the turn that puts it up', () => {
    const r = readTurn(turn(6, [seg('Here\'s an exhibit: Larkspur Air — Results by route.', 'data', [], 'exhibit-1')]), LINES);
    expect([...r.exhibits]).toEqual(['exhibit-1']);
    expect(r.released.has('network_totals')).toBe(true);
  });

  it('reads stage asks and the close', () => {
    expect([...readTurn(turn(30, [seg('What would you do to guard against that?')]), NONE).asks]).toEqual(['mitigation']);
    expect(readTurn(turn(20, [seg('What\'s your recommendation to the client?')]), NONE).asks.has('recommendation')).toBe(true);
    expect(readTurn(turn(32, [seg('We\'re almost out of time — what would you tell the CEO, and what\'s the biggest risk to it?')]), NONE).asks).toEqual(new Set(['recommendation', 'risk']));
    expect([...readTurn(turn(14, [seg('What could Hollis Bay do to get shoppers to try its chickpea snacks, and to keep buying them?')]), NONE).asks]).toEqual(['brainstorm']);
    expect(readTurn(turn(20, [seg('If Aldermoor builds its own team, how could it reduce the risk of a slow start?')]), NONE).asks.has('brainstorm')).toBe(true);
    expect(readTurn(turn(40, [seg('That\'s time. Thanks for working through it — your written report will follow.', 'scripted')]), NONE).closed).toBe(true);
  });
});

describe('evaluateRecord', () => {
  const t24 = turn(24, [seg('On the price elasticity of those four routes, I\'ll check what we have.', 'say'), seg(`Repeating what I said before: ${OTHER}`, 'data')], { revealed: ['route_results_other'] });
  const t26 = turn(26, [seg('What would you do to guard against that?')]);

  it('a fault record fails on the recorded fault, with what was delivered', () => {
    const rec = record({ assertions: [{ kind: 'refusal', about: 'elasticity', must: true }, { kind: 'restatement', item: 'route_results_other', must: false }] });
    const res = evaluateRecord(rec, [t24, t26], LINES);
    expect(res.pass).toBe(false);
    expect(res.failed.map(f => f.assertion.kind)).toEqual(['refusal', 'restatement']);
    expect(res.failed[0].saw).toMatch(/^t24: On the price elasticity/);
  });

  it('passes once the turn refuses truly and restates nothing', () => {
    const fixed = turn(24, [seg('I don\'t have price elasticity on the four routes.', 'data')], { revealed: ['route_results_other'] });
    const rec = record({ assertions: [{ kind: 'refusal', about: 'elasticity', must: true }, { kind: 'restatement', item: 'route_results_other', must: false }] });
    expect(evaluateRecord(rec, [fixed, t26], LINES)).toEqual({ id: rec.id, pass: true, failed: [] });
  });

  it('a window holds a must-not on every turn in it, a must on any', () => {
    const later = turn(28, [seg('You said “$13.8M” — walk me through that calculation.')]);
    const rec = record({ assertions: [{ kind: 'probe', figure: '$13.8M', must: false, scope: { fromTurn: 24 } }] });
    expect(evaluateRecord(rec, [t24, t26, later], LINES).failed[0].saw).toMatch(/^t28/);
    expect(scopeTurns({ kind: 'close', must: true, scope: { fromTurn: 20, toTurn: 26 } }, 20, 40)).toEqual([20, 22, 24, 26]);
    expect(evaluateRecord(record({ assertions: [{ kind: 'ask', stage: 'mitigation', must: true, scope: { fromTurn: 24 } }] }), [t24, t26], LINES).pass).toBe(true);
  });

  it('marks a record whose turn the replay never reached', () => {
    expect(evaluateRecord(record({ turn: 40, assertions: [{ kind: 'close', must: false }] }), [t24], LINES).skipped).toBe('diverged');
    expect(evaluateRecord(record({}), [], LINES).skipped).toBe('run_missing');
  });

  it('reads a check decision by its decision, reason or detail', () => {
    const t = turn(24, [], { checks: [{ check: 'code_gate', decision: 'act', reason: 'held', detail: { decisions: [{ outcome: 'drop' }] } }] });
    expect(evaluateRecord(record({ assertions: [{ kind: 'check', check: 'code_gate', decision: 'drop', must: true }] }), [t], NONE).pass).toBe(true);
    expect(evaluateRecord(record({ assertions: [{ kind: 'check', check: 'code_gate', decision: 'release', must: true }] }), [t], NONE).pass).toBe(false);
  });
});
