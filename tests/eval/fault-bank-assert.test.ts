// The fault bank's detectors and assertion checks (lib/eval/fault-bank-assert.ts), on lines from the b33–b38 corpus.
import { describe, it, expect } from 'vitest';
import { readTurn, evaluateRecord, namesFigure, scopeTurns, type BankTurn } from '@/lib/eval/fault-bank-assert';
import { bankMoves, bankSkipEscapes, type BankResultRow, type FaultRecord } from '@/lib/eval/fault-bank';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';

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

// The fix round (25 Oct, the Stream 1 review's findings 5, 7 and 12).
describe('namesFigure reads the unit, not a bare number set', () => {
  it('needs the currency, the scale and the unit the figure names', () => {
    expect(namesFigure('You said “$920” — walk me through that.', '$920')).toBe(true);
    expect(namesFigure('That is 920 passengers a week.', '$920')).toBe(false);
    expect(namesFigure('Starter churn is 19 stores out of 200.', '19%')).toBe(false);
    expect(namesFigure('Earlier you said “19%” — how does that fit?', '19%')).toBe(true);
    expect(namesFigure('standalone Starter is 1.3x', '1.3x')).toBe(true);
    expect(namesFigure('1.3 million sign-ups', '1.3x')).toBe(false);
    expect(namesFigure('the $16M of marketing', '$16 million')).toBe(true);
    expect(namesFigure('the $16,000,000 of marketing', '$16 million')).toBe(true);
    expect(namesFigure('480,000 bags', '480,000')).toBe(true);
    expect(namesFigure('$9 million of launch cost', '$9')).toBe(true);
  });
});

describe('answered — the ask gets a word', () => {
  const refuse = (tN: number) => turn(tN, [seg("I don't have traffic data on the new routes.", 'data')]);
  const defer = (tN: number) => turn(tN, [seg("I'll come back to the traffic data on the new routes shortly.", 'data')]);
  const release = (tN: number) => turn(tN, [seg('New routes typically take 6–12 months to reach their expected load factor, and in the first year the load factor is often around 60%.', 'data', ['new_route_rampup'])]);
  const silent = (tN: number) => turn(tN, [seg('Go on.')]);
  const rec = (a: Partial<Extract<FaultRecord['assertions'][number], { kind: 'answered' }>>) =>
    record({ turn: 20, assertions: [{ kind: 'answered', about: 'traffic', must: true, ...a }] });

  it('a release, a refusal or a deferral that resolves all count', () => {
    expect(evaluateRecord(rec({ item: 'new_route_rampup' }), [release(20), silent(22)], LINES).pass).toBe(true);
    expect(evaluateRecord(rec({}), [refuse(20), silent(22)], LINES).pass).toBe(true);
    expect(evaluateRecord(rec({}), [defer(20), refuse(22)], LINES).pass).toBe(true);
  });

  it('an unresolved deferral and a silent turn both fail', () => {
    expect(evaluateRecord(rec({}), [defer(20), silent(22)], LINES).pass).toBe(false);
    expect(evaluateRecord(rec({}), [silent(20), silent(22)], LINES).pass).toBe(false);
  });

  // Bank fix 4 (26 Oct): the three accept paths are read AT the record's turn (or scope.fromTurn). The window scan
  // is only a deferral's resolution. Unanchored, a turn that ignored the ask passed because the item came out
  // somewhere later — which is how b36l-jasmine-t2-departures and b38l-tyler-t2-split-refusal greened on silence.
  it('is anchored at the record\'s turn: a later release does not answer a turn that ignored the ask', () => {
    expect(evaluateRecord(rec({ item: 'new_route_rampup' }), [silent(20), release(22)], LINES).pass).toBe(false);
    expect(evaluateRecord(rec({}), [silent(20), refuse(22)], LINES).pass).toBe(false);
    // The anchor itself still answers, and a deferral there still resolves later in the window.
    expect(evaluateRecord(rec({ item: 'new_route_rampup' }), [release(20), silent(22)], LINES).pass).toBe(true);
    expect(evaluateRecord(rec({}), [defer(20), release(22), refuse(24)], LINES).pass).toBe(true);
    // scope.fromTurn moves the anchor.
    const windowed = rec({ item: 'new_route_rampup', scope: { fromTurn: 22, toTurn: 26 } });
    expect(evaluateRecord(windowed, [silent(20), silent(22), release(24)], LINES).pass).toBe(false);
    expect(evaluateRecord(windowed, [silent(20), release(22)], LINES).pass).toBe(true);
  });

  it('accept narrows which outcomes answer the ask', () => {
    const only = rec({ item: 'new_route_rampup', accept: ['refusal', 'deferral'] });
    expect(evaluateRecord(only, [release(20), silent(22)], LINES).pass).toBe(false);
    expect(evaluateRecord(only, [refuse(20)], LINES).pass).toBe(true);
  });
});

describe('spoke — the turn says something of its own', () => {
  it('silence, an acknowledgment and a refuse-everything turn all fail', () => {
    const a = record({ turn: 20, assertions: [{ kind: 'spoke', must: true }] });
    expect(evaluateRecord(a, [turn(20, [seg('Understood.')])], NONE).pass).toBe(false);
    expect(evaluateRecord(a, [turn(20, [seg("I don't have that. I don't have fares by route either.", 'data')])], NONE).pass).toBe(false);
    expect(evaluateRecord(a, [turn(20, [seg('Fuel prices have been roughly flat over the period.', 'data')])], NONE).pass).toBe(true);
    const q = record({ turn: 20, assertions: [{ kind: 'spoke', question: true, must: true }] });
    expect(evaluateRecord(q, [turn(20, [seg('Fuel prices have been roughly flat over the period.', 'data')])], NONE).pass).toBe(false);
    expect(evaluateRecord(q, [turn(20, [seg('What else?')])], NONE).pass).toBe(true);
  });
});

describe('a vacuous windowed must-not', () => {
  it('skips rather than passes when the window holds no replayed turn', () => {
    const r = record({ turn: 20, assertions: [{ kind: 'probe', must: false, scope: { fromTurn: 22, toTurn: 26 } }] });
    const res = evaluateRecord(r, [turn(20, [seg('Go on.')])], NONE);
    expect(res.skipped).toBe('vacuous');
    expect(res.pass).toBe(true);
  });

  // Bank fix 3 (26 Oct): a skip must never mask a recorded failure, or a fix that empties one window while
  // another assertion still fails would take the record out of the gate's denominator and improve the line.
  it('does not skip when another assertion failed', () => {
    const r = record({ turn: 20, assertions: [
      { kind: 'probe', must: false, scope: { fromTurn: 22, toTurn: 26 } },
      { kind: 'refusal', about: 'elasticity', must: true },
    ] });
    const res = evaluateRecord(r, [turn(20, [seg('Go on.')])], NONE);
    expect(res.skipped).toBeUndefined();
    expect(res.pass).toBe(false);
  });
});

describe('the doubled line', () => {
  const line = LINE_MAP.route_results_other[0];
  it('reads the same-turn double apart from a restatement of an item already out', () => {
    const doubled = turn(24, [seg(line, 'say'), seg(`Repeating what I said before: ${line}`, 'data')]);
    const once = turn(24, [seg(`Repeating what I said before: ${line}`, 'data')], { revealed: ['route_results_other'] });
    const a = record({ assertions: [{ kind: 'restatement', item: 'route_results_other', doubled: true, must: false }] });
    expect(evaluateRecord(a, [doubled], LINES).pass).toBe(false);
    expect(evaluateRecord(a, [once], LINES).pass).toBe(true);   // code's copy alone is not the doubling
    const any = record({ assertions: [{ kind: 'restatement', item: 'route_results_other', must: false }] });
    expect(evaluateRecord(any, [once], LINES).pass).toBe(false);
  });
});

describe('the close-wait pools', () => {
  // Every variant of each close-wait pool, read from lib/orchestrator/phrasing.ts itself, is caught by its own
  // record pattern and by no other — so a close-wait record asserts the line the fault used and survives both the
  // phrase rotation and 4.8's switch to another pool (critical 1 of the Stream 1 review). One `first_step` variant
  // matched the old family-wide STAGE.mitigation regex not at all, which is how a fault could pass.
  const PATTERNS: Record<'after_risk' | 'first_step' | 'measure', RegExp> = {
    after_risk: /guard against that/i,
    first_step: /do first|first step|first thing/i,
    measure: /six months/i,
  };
  it('each pattern matches all of its own pool and none of the others', () => {
    for (const [name, re] of Object.entries(PATTERNS)) {
      const mine: readonly string[] = PHRASE_POOLS[name as keyof typeof PATTERNS];
      expect(mine.length).toBeGreaterThanOrEqual(5);
      for (const l of mine) expect(re.test(l), `${name}: ${l}`).toBe(true);
      for (const other of Object.keys(PATTERNS)) {
        if (other === name) continue;
        for (const l of PHRASE_POOLS[other as keyof typeof PATTERNS] as readonly string[]) expect(re.test(l), `${name} must not match ${other}: ${l}`).toBe(false);
      }
    }
  });
});

// Bank fix 3 (26 Oct): gate condition 1 also requires that no record leaves the denominator — a fix that flips a
// turn's kind would otherwise reclassify a failing record as `diverged` and the gate line would *improve*.
describe('bankMoves — the compare behind `fault-bank.ts compare --against=`', () => {
  const row = (o: Partial<BankResultRow> & { id: string }): BankResultRow => ({ kind: 'fault', pass: false, baseline: 'fails_as_expected', ...o });
  it('flags a record that moves from fails_as_expected into any skip class, and only that', () => {
    const was = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c', pass: true, baseline: 'fixed_on_base' }), row({ id: 'd' })];
    const now = [row({ id: 'a', skipped: 'diverged' }), row({ id: 'b', pass: true }), row({ id: 'c', skipped: 'vacuous' }), row({ id: 'd' })];
    expect(bankSkipEscapes(was, now).map(m => [m.id, m.to])).toEqual([['a', 'diverged']]);
    expect(bankMoves(was, now).map(m => `${m.id}:${m.from}>${m.to}`)).toEqual(['a:FAIL>diverged', 'b:FAIL>pass', 'c:pass>vacuous']);
  });

  it('a record that is gone entirely has left the denominator too; a new one has not', () => {
    const was = [row({ id: 'a' })];
    const now = [row({ id: 'z', pass: true })];
    expect(bankMoves(was, now)).toEqual([
      { id: 'z', kind: 'fault', from: '(new record)', to: 'pass', escape: false },
      { id: 'a', kind: 'fault', from: 'FAIL', to: '(record gone)', escape: true },
    ]);
  });
});
