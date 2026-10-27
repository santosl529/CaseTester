// `refusalAssume` (Lorenzo, 27 Oct; measurement only): the assumption pools and the data line's order with them.
import { describe, it, expect } from 'vitest';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';
import { renderDataLines, type DataDecisions } from '@/lib/orchestrator/data-decisions';

const base: DataDecisions = { releases: [], restates: [], exhibit: null, refusals: [], defers: [], gateDefers: [], unmatchedDefers: [], offers: [], requests: [] };

describe('assumption pools', () => {
  it.each(['assume', 'assume_finer'] as const)('%s: five distinct statements, never a question, never "I don\'t have"', pool => {
    const v = PHRASE_POOLS[pool] as readonly string[];
    expect(new Set(v).size).toBe(5);
    for (const x of v) { expect(x).not.toMatch(/\?/); expect(x).not.toMatch(/don't have|not something I have/i); }
    expect(v.every(x => (x.match(/\{x\}/g) ?? []).length === (pool === 'assume' ? 1 : 0))).toBe(true);
  });
});

describe('the data line with assumptions: release → deferral → assumption → assertive refusal', () => {
  it('orders the parts', () => {
    const d: DataDecisions = { ...base, releases: [{ id: 'a', value: 'Fuel prices have been roughly flat.', earlier: false }], defers: ['the route results'], assumes: ['customer price elasticity'], refusals: ['waste data by store'], assumeFiner: true };
    const lines = renderDataLines(d, 'seed');
    const at = (re: RegExp) => lines.findIndex(l => re.test(l));
    expect(at(/roughly flat/)).toBeLessThan(at(/finer/i));
    expect(at(/finer/i)).toBeLessThan(at(/route results/));
    expect(at(/route results/)).toBeLessThan(at(/price elasticity/));
    expect(at(/price elasticity/)).toBeLessThan(at(/waste data/));
  });
  it('is unchanged without the switch fields', () => {
    const d: DataDecisions = { ...base, refusals: ['waste data by store'], defers: ['the route results'] };
    expect(renderDataLines(d, 'seed')[0]).toMatch(/waste data/);
  });
});
