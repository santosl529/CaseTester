// The turn lint (Phase 2 design §3.4), on the delivered turns of the fault-bank records it is meant to read.
import { describe, it, expect } from 'vitest';
import { lintTurn, type LintSegment } from '@/lib/orchestrator/turn-lint';

const rules = (segs: LintSegment[], ctx = {}) => lintTurn(segs, ctx).map(v => v.rule);
const say = (text: string): LintSegment => ({ kind: 'say', text });
const data = (text: string, revealIds: string[] = [], exhibitId?: string): LintSegment => ({ kind: 'data', text, revealIds, ...(exhibitId ? { exhibitId } : {}) });
const tail = (text: string): LintSegment => ({ kind: 'tail', text });

// b38l-tyler-t20-dangling-figure, as delivered.
const RAMP = 'New routes typically take 6–12 months to reach their expected load factor, and in the first year the load factor is often around 60%.';
const CONNECT = 'About 20% of passengers on the two contested routes are connecting at the hub to another Larkspur flight.';

describe('L2: an anaphor needs its referent', () => {
  it('b38l Tyler t20: "that figure" after two data lines', () => {
    expect(rules([say('Understood. On variable cost, you said $8,800 per flight.'), data(`${CONNECT} ${RAMP}`, ['connecting_passengers', 'new_route_rampup']), tail('Where did that figure come from, and what does it include?')])).toContain('L2');
  });
  it('the setup sentence moved before its question: clean', () => {
    expect(rules([say('Understood.'), data(`${CONNECT} ${RAMP}`, ['connecting_passengers']), tail('On variable cost, you said $8,800 per flight. Where did that figure come from, and what does it include?')])).not.toContain('L2');
  });
  it('b33 Blake t22: a bare wrap-up probe flags; the quoted form (phase1 HEAD) does not', () => {
    expect(rules([tail('Before we wrap up — walk me through how you got there.')], { ended: true })).toContain('L2');
    expect(rules([tail('Quick question before we wrap up — you mentioned “If elasticity is actually closer to one, I lose the entire margin recovery” — walk me through how you got there.')], { ended: true })).not.toContain('L2');
  });
  it('a probe quoting its own figure is clean', () => {
    expect(rules([say('Mm-hm.'), tail('You said “$18,000” — can you show me that calculation step by step?')])).toEqual([]);
  });
});

describe('L1: no doubled sentence', () => {
  const LINE = 'No other airline is flying nonstop on either new route, and aircraft lease and other fixed costs would stay the same.';
  it('b34l Tyler t20: the model\'s copy and code\'s', () => {
    expect(rules([say(LINE), data(`Repeating what I said before: ${LINE}`), tail('What else could Larkspur do to make sure it\'s profitable in the first year?')])).toContain('L1');
  });
  it('a short acknowledgment said twice is not counted', () => {
    expect(rules([say('Understood.'), tail('Understood. What else?')])).not.toContain('L1');
  });
});

describe('L3: no deferral of what the turn released', () => {
  const words = (id: string) => (id === 'unit_costs' ? ['Fuel prices and crew rates', 'Fuel prices have been roughly flat over the period.'] : []);
  it('b36l Jasmine t6: the fuel line, then "I\'ll come back to fuel … shortly"', () => {
    const v = lintTurn([data('Fuel prices have been roughly flat over the period. I\'ll come back to fuel and crew rate changes between the years shortly.', ['unit_costs']), tail('Where does that leave you?')], { itemWords: words });
    expect(v.map(x => x.rule)).toContain('L3');
    expect(v.find(x => x.rule === 'L3')!.detail).toContain('fuel');
  });
  it('b38l Marisol t6: deferring the route results right after the route exhibit went up', () => {
    expect(rules([data('Here\'s an exhibit: Larkspur Air — Results by route, FY2023 vs. FY2025. Let\'s hold extras revenue per passenger and results by route for a little later.', [], 'exhibit-2'), tail('What stands out?')],
      { exhibitWords: (id: string) => (id === 'exhibit-2' ? ['Larkspur Air — Results by route, FY2023 vs. FY2025'] : []) })).toContain('L3');
  });
  it('a deferral of something else is clean', () => {
    expect(rules([data('Fuel prices have been roughly flat over the period. I\'ll come back to the competitor\'s schedule shortly.', ['unit_costs']), tail('Where does that leave you?')], { itemWords: words })).not.toContain('L3');
  });
});

describe('L4, L5, L6, L7', () => {
  it('L4: a data line after the first question', () => {
    expect(rules([say('Got it.'), tail('Which branch first? Before your recommendation: New routes take time to ramp. What would you advise?')])).toContain('L4');
  });
  it('L5: two questions, none, and the close', () => {
    expect(lintTurn([tail('What would you do first? And how would you measure it?')]).find(v => v.rule === 'L5')?.detail).toBe('2');
    expect(lintTurn([say('Right. You said the project clears break-even by about 50%.')]).find(v => v.rule === 'L5')?.detail).toBe('0');
    expect(rules([tail('We\'ve covered everything I wanted to. Thanks for working through the case.')], { ended: true })).not.toContain('L5');
  });
  it('L6: "before any data" on a turn that gave data', () => {
    expect(rules([data('Menu prices were flat.', ['menu_prices']), tail('Before any data comes out, what could you not rule out?')])).toContain('L6');
    expect(rules([tail('Before any data comes out, what could you not rule out?')])).not.toContain('L6');
  });
  it('L7: b36a Jasmine t14\'s fragment quote', () => {
    expect(rules([tail('You said “…the only option where reported US net sales clear the board\'s $300M gate — a…” — how did you do that calculation?')])).toContain('L7');
  });
});
