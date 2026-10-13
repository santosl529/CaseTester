import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { checkRecomputeForTurn, formatRecomputeHint, recordAttempts, flagsFromPricing } from '@/lib/orchestrator/recompute';
import { checkPricingClaims, pricingValues } from '@/lib/orchestrator/pricing-check';
import { getCaseById } from '@/lib/cases/loader';

const mathSteps = [
  { id: 'cogs_impact', description: 'COGS dollar impact', answer: 76.8, tolerance: 2 },
  { id: 'margin', description: 'current margin', answer: 6, tolerance: 0.5 },
];

describe('checkRecomputeForTurn', () => {
  it('returns no flags when the candidate is within tolerance', () => {
    const flags = checkRecomputeForTurn('The current margin is about 6%.', mathSteps);
    expect(flags).toHaveLength(0);
  });

  it('returns no flags when the candidate never mentioned the figure', () => {
    const flags = checkRecomputeForTurn('Costs went up a lot.', mathSteps);
    expect(flags).toHaveLength(0);
  });

  it('flags a minor mismatch', () => {
    const flags = checkRecomputeForTurn('COGS impact is about 60 million.', mathSteps);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ stepId: 'cogs_impact', errorClass: 'minor', candidateValue: 60, expected: 76.8 });
  });

  it('flags a case-breaking mismatch (run-3 bean-math scenario)', () => {
    const flags = checkRecomputeForTurn('COGS impact is about 20 million.', mathSteps);
    expect(flags).toHaveLength(1);
    expect(flags[0].errorClass).toBe('case_breaking');
  });

  it('only recomputes against this turn — does not leak prior-turn mismatches', () => {
    // A step never mentioned in THIS candidate message should never flag,
    // even if it's a known case math step.
    const flags = checkRecomputeForTurn('Let me think about the structure first.', mathSteps);
    expect(flags).toHaveLength(0);
  });
  // Source spans + revealed inputs (Rule 2, v4.3), against prof-001's steps.
  describe('prof-001 steps (spans, units, revealed inputs)', () => {
    const prof = JSON.parse(readFileSync('cases/prof-001.json', 'utf8')).mathSteps;
    const ALL = ['revenue_total', 'stores_count', 'cogs_pct', 'labor_pct', 'overhead_pct'];

    it.each([
      // The three false "Quick correction" turns from the 27–28 Sep persona runs.
      ["Sam 4ea2840a", "I'd prioritize cost. Revenue grew 15% but margin fell 18 points, so costs grew faster than revenue. That's where the answer is."],
      ["Omar faa999fd", "Take current revenue as 115 index units, costs 94% of that, so 108.1 in absolute dollars. If I hold volume and costs constant and raise price so profit margin returns to 24%: R minus 108.1 equals 0.24R, so 0.76R equals 108.1, R equals 142.2."],
      ["Priya 6caca9a1", "Other inputs: 43.3 over 115 = 0.377, versus 31.5 over 100 = 0.315. Up about 20% per unit, not 37.5%."],
    ])('no flag on %s', (_who, text) => {
      expect(checkRecomputeForTurn(text, prof, ALL)).toEqual([]);
    });

    it('flags a real per-store error once revenue is revealed, with its span', () => {
      const flags = checkRecomputeForTurn('So revenue per store is about $0.5 million.', prof, ALL);
      expect(flags).toHaveLength(1);
      expect(flags[0]).toMatchObject({ stepId: 'revenue_per_store_check', candidateValue: 0.5, errorClass: 'case_breaking' });
      expect(flags[0].span).toContain('per store');
    });

    it('never reads target-margin math or a revenue base as the margin impact (batch 4: Tobias, Derek)', () => {
      expect(checkRecomputeForTurn('to get back to a 24% margin I need revenue of 451 ÷ 0.76 = $594M', prof, ALL)).toEqual([]);
      expect(checkRecomputeForTurn('Now I want a 24% margin with that same $451.2M of cost', prof, ALL)).toEqual([]);
      expect(checkRecomputeForTurn('$48M on a $480M base is 10 points of margin', prof, ALL)).toEqual([]);
    });

    it('never flags a step whose inputs are unrevealed (Omar: revenue never released)', () => {
      expect(checkRecomputeForTurn('So revenue per store is about $0.5 million.', prof, ['stores_count'])).toEqual([]);
    });

    it('flags a real margin-impact error stated in dollars', () => {
      const flags = checkRecomputeForTurn('Sixteen points on $480 million is about $20 million of margin impact.', prof, ALL);
      expect(flags.map(f => f.stepId)).toEqual(['cogs_dollar_impact']);
    });

    it('never reads another cost line\'s dollars as the COGS impact (batch 20 R01 t14)', () => {
      expect(checkRecomputeForTurn('And overhead, which drifted 2 points, worth maybe $10M.', prof, ALL)).toEqual([]);
      expect(checkRecomputeForTurn('Labor crept up a point, so that hit is about $5M.', prof, ALL)).toEqual([]);
    });

    it('never checks the prompt-fact margin steps live', () => {
      expect(checkRecomputeForTurn('To get back to a 15% margin we need pricing.', prof, ALL)).toEqual([]);
    });
  });
});

describe('formatRecomputeHint (Rule 14 attempts, v4.3)', () => {
  const cb = { stepId: 'a', description: '$480M / 200 stores = $2.4M per store', expected: 2.4, candidateValue: 0.5, errorClass: 'case_breaking' as const, span: 'revenue per store is about $0.5 million' };
  const minor = { stepId: 'b', description: 'desc b', expected: 76.8, candidateValue: 60, errorClass: 'minor' as const, span: 'impact is about $60 million' };

  it('returns an empty hint for no flags', () => {
    expect(formatRecomputeHint([]).hint).toBe('');
  });

  it('never carries the step description (persona run 6caca9a1 leaked $480M from it)', () => {
    const { hint } = formatRecomputeHint([cb, minor], { attempts: { 'a@0.5': 1, 'b@60': 1 } });
    expect(hint).not.toMatch(/480|200 stores|desc b/);
  });

  it('first wrong statement: probe only, no derived figure', () => {
    const r = formatRecomputeHint([cb]);
    expect(r.hint).toContain('Walk me through that');
    expect(r.hint).not.toContain('2.4');
    expect(r.derivedValues).toEqual([]);
  });

  // Lorenzo, 13 Oct (Larkspur review, item 1): past the probe a step flag
  // says nothing — the correction comes only through the math checker.
  it('second wrong statement: no code correction, no derived figure', () => {
    const r = formatRecomputeHint([minor], { attempts: { 'b@60': 2 } });
    expect(r.hint).toBe('');
    expect(r.derivedValues).toEqual([]);
  });

  it('time pressure: nothing from code — case-breaking left to the checker, minor shed', () => {
    const r = formatRecomputeHint([cb, minor], { underTimePressure: true });
    expect(r.hint).toBe('');
  });
});

describe('flagsFromPricing (fact guards Phase 4)', () => {
  const v = pricingValues(getCaseById('prof-001') as never, new Set(['cogs_pct', 'labor_pct', 'overhead_pct', 'revenue_total']))!;
  const flagsOf = (t: string) => flagsFromPricing(checkPricingClaims(t, v));

  it('a wrong claim is a flag per claim kind, against the nearest accepted answer', () => {
    expect(flagsOf("If a 10% price increase costs more than 10% of transactions, I'm worse off.")).toMatchObject([
      { kind: 'pricing', stepId: 'pricing:breakeven', candidateValue: 10, expected: 19.2 },
    ]);
    expect(flagsOf('A 10% price increase recovers about 8.5 points of margin.')).toEqual([]);
  });

  it('the probe names the price claim, not the right figure; past it code says nothing', () => {
    const [f] = flagsOf('A 10% price increase recovers about 5 points of margin.');
    const probe = formatRecomputeHint([f]).hint;
    expect(probe).toMatch(/Probe once/);
    expect(probe).toMatch(/a 10% price rise recovers 5 points of margin in .*sized that price move/);
    expect(probe).not.toContain('8.5');
    // Past the probe: no code correction (Lorenzo, 13 Oct) — the checker's, if it agrees.
    expect(formatRecomputeHint([f], { attempts: { 'pricing:gain@5': 2 } }).hint).toBe('');
  });
});

describe('recordAttempts', () => {
  it('counts wrong statements per step and claimed value across turns (Lorenzo, 13 Oct)', () => {
    const f = { stepId: 'a', description: '', expected: 1, candidateValue: 2, errorClass: 'minor' as const, span: '' };
    expect(recordAttempts(recordAttempts({}, [f]), [f])).toEqual({ 'a@2': 2 });
  });
});
