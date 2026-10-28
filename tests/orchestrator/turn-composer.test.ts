// Phase 2 C1: the four-slot composer in shadow (design §3; rulings Q5–Q7, 27 Oct), on the record turns it is for.
import { describe, it, expect } from 'vitest';
import { composeShadow, isSetup, type ComposerPieces } from '@/lib/orchestrator/turn-composer';

const pieces = (o: Partial<ComposerPieces>): ComposerPieces => ({ say: '', data: [], question: '', corrections: [], ended: false, ...o });
const rules = (v: { rule: string }[]) => v.map(x => x.rule);
const RAMP = 'New routes typically take 6–12 months to reach their expected load factor, and in the first year the load factor is often around 60%.';

describe('setup sentences travel with their question', () => {
  it('b38l Tyler t20: the "you said $8,800" setup moves after the data, so "that figure" has its referent', () => {
    const c = composeShadow(pieces({
      say: 'Understood. On variable cost, you said $8,800 per flight.',
      data: [{ kind: 'release', text: RAMP, ids: ['new_route_rampup'] }],
      question: 'Where did that figure come from, and what does it include?',
    }), {});
    expect(c.slots.ack).toEqual(['Understood.']);
    expect(c.slots.setup).toEqual(['On variable cost, you said $8,800 per flight.']);
    expect(c.composed.endsWith('On variable cost, you said $8,800 per flight. Where did that figure come from, and what does it include?')).toBe(true);
    expect(rules(c.lintToday)).toContain('L2');
    expect(rules(c.lintComposed)).not.toContain('L2');
  });
  it('a plain acknowledgment is no setup', () => {
    expect(isSetup('Understood.')).toBe(false);
    expect(isSetup('Earlier you said Option B beats A by $40M.')).toBe(true);
    expect(isSetup('On the prevalence input:')).toBe(true);
    expect(isSetup('Right, you\'ve separated what you know from what you assumed.')).toBe(false);
  });
});

describe('Q5: where a correction goes', () => {
  it('a correction of what the candidate just said goes before the data; an older one after it', () => {
    const c = composeShadow(pieces({
      say: 'Got it.',
      data: [{ kind: 'release', text: RAMP, ids: ['new_route_rampup'] }],
      question: 'Starter value per sign-up is about $1,400, not $1,205. What would you tell the CEO?',
      corrections: [{ text: 'Starter value per sign-up is about $1,400, not $1,205.', justSaid: false }, { text: 'Pro lifetime value is about $4,000, not $2,400.', justSaid: true }],
    }), {});
    expect(c.slots.correctionFirst).toEqual(['Pro lifetime value is about $4,000, not $2,400.']);
    expect(c.slots.correctionAfter).toEqual(['Starter value per sign-up is about $1,400, not $1,205.']);
    expect(c.slots.question).toEqual(['What would you tell the CEO?']);
    expect(c.composed.indexOf('Pro lifetime')).toBeLessThan(c.composed.indexOf('New routes'));
  });
  it('code\'s misquote correction (a data part) corrects the message just said: first', () => {
    const c = composeShadow(pieces({ say: 'Understood.', data: [{ kind: 'correction', text: 'To correct one figure: COGS is 58% of revenue today.', ids: [] }, { kind: 'release', text: RAMP, ids: ['x'] }], question: 'Where next?' }), {});
    expect(c.slots.correctionFirst).toEqual(['To correct one figure: COGS is 58% of revenue today.']);
    expect(c.slots.data).toEqual([RAMP]);
  });
});

describe('Q6 and Q7', () => {
  it('Q7: the last question kept, the earlier withheld (logged)', () => {
    const c = composeShadow(pieces({ say: 'Right.', question: 'Is that MECE, and what\'s missing? Which branch would you prioritize first, and why?' }), {});
    expect(c.slots.question).toEqual(['Which branch would you prioritize first, and why?']);
    expect(c.moves.questionsWithheld).toEqual(['Is that MECE, and what\'s missing?']);
    expect(rules(c.lintToday)).toContain('L5');
    expect(rules(c.lintComposed)).not.toContain('L5');
  });
  it('Q6: a rewritten sentence is withheld whole', () => {
    const c = composeShadow(pieces({ say: 'Right.', question: 'Your 37.5% was applied to the wrong base. Which base should it be?', rewritten: ['Your 37.5% was applied to the wrong base.'] }), {});
    expect(c.composed).not.toContain('37.5%');
    expect(c.moves.rewriteWithheld).toHaveLength(1);
  });
  it('an unchanged turn is reported unchanged', () => {
    const c = composeShadow(pieces({ say: 'Understood.', data: [{ kind: 'release', text: RAMP, ids: ['x'] }], question: 'Where does that leave you?' }), {});
    expect(c.changed).toBe(false);
  });
});

describe('a code-written turn\'s riding correction', () => {
  it('is said once, in the correction slot, not also in the acknowledgment (6a721cdf t16)', () => {
    const LINE = 'Patients on Kelvexa at peak is about 40,000, not 200,000.';
    const c = composeShadow(pieces({ say: LINE, data: [{ kind: 'exhibit', text: 'Now, an exhibit: US specialist survey.', ids: [] }], question: 'What stands out?', corrections: [{ text: LINE, justSaid: false }] }), {});
    expect(c.composed.split(LINE).length - 1).toBe(1);
    expect(c.slots.ack).toEqual([]);
  });
});

// ── C2: the data slot (composeDataSlot) ──
import { composeDataSlot } from '@/lib/orchestrator/turn-composer';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
const items: Record<string, { id: string; words: string[]; spoken: string }> = {
  fuel_prices: { id: 'fuel_prices', words: ['Fuel prices over the period', 'Fuel prices have been roughly flat over the period.'], spoken: 'the fuel price trend' },
  unit_costs: { id: 'unit_costs', words: ['Wages and other costs per flight', 'There were no material changes to wages or other costs per flight.'], spoken: 'wages and other costs per flight' },
};
const base = { releases: [] as { id: string; value: string; earlier: boolean }[], restates: [] as { id: string; value: string }[], exhibit: null as null | { id: string; title: string; covers: string[] }, refusals: [] as string[], defers: [] as string[], gateDefers: [] as string[], unmatchedDefers: [] as string[], offers: [] as string[], requests: [] as { request: { what: string; itemIds: string[]; explicit: boolean; respond: 'release' }; response: 'release' | 'defer' | 'refuse'; ledgerItemIds: string[] }[] };
describe('C2: composeDataSlot', () => {
  it('L3 (b36l Jasmine t6): a deferral naming the fuel line just given says the item it still holds', () => {
    const d = { ...base, releases: [{ id: 'fuel_prices', value: items.fuel_prices.words[1], earlier: false }], defers: ['fuel and crew rate changes between the years'],
      requests: [{ request: { what: 'fuel and crew rate changes between the years', itemIds: [], explicit: true, respond: 'release' as const }, response: 'defer' as const, ledgerItemIds: ['unit_costs'] }] };
    const { data, changes } = composeDataSlot(d, '', id => items[id], []);
    expect(data.defers).toEqual(['wages and other costs per flight']);
    expect(changes).toContainEqual({ rule: 'L3', what: 'fuel and crew rate changes between the years', to: 'wages and other costs per flight' });
  });
  it('L1 (b34l Tyler t20): a restatement the model\'s say already spoke is not said again', () => {
    const LINE = 'No other airline is flying nonstop on either new route, and aircraft lease and other fixed costs would stay the same.';
    const { data } = composeDataSlot({ ...base, restates: [{ id: 'new_routes_context', value: LINE }] }, LINE, () => undefined, []);
    expect(data.restates).toEqual([]);
  });
  it('the exhibit handover is said last (b34a Marcus t6)', () => {
    const d = { ...base, exhibit: { id: 'exhibit-1', title: 'Corlan\'s disease — US patient funnel', covers: [] }, defers: ['how Kelvexa\'s European net price has moved'] };
    const { data } = composeDataSlot(d, '', () => undefined, []);
    const lines = renderDataLines(data, 's');
    expect(lines.at(-1)).toMatch(/exhibit/i);
    expect(lines[0]).toMatch(/European/);
  });
});
describe('C2: a deferral holding nothing', () => {
  it('is kept when it still names something the turn didn\'t give (f59f5ea8 t12)', () => {
    const d = { ...base, releases: [{ id: 'unit_costs', value: items.unit_costs.words[1], earlier: false }], defers: ['wages in Europe against the same competitor'] };
    expect(composeDataSlot(d, '', id => items[id], []).data.defers).toEqual(['wages in Europe against the same competitor']);
  });
});
describe('C2: L1 on a release', () => {
  it('b34l Tyler t20: the model said the line — booked as released, not said again', () => {
    const LINE = 'No other airline is flying nonstop on either new route, and aircraft lease and other fixed costs would stay the same.';
    const { data } = composeDataSlot({ ...base, releases: [{ id: 'new_routes_context', value: LINE, earlier: false }] }, LINE, () => undefined, []);
    expect(data.releases.map(r => r.id)).toEqual(['new_routes_context']);
    expect(renderDataLines(data, 's').filter(Boolean)).toEqual([]);
  });
});
