// Lorenzo, 13 Oct (Larkspur review, item 3): a figure binds to a step only
// when it can be that quantity — its scale, a count's unit, a real figure.
import { describe, it, expect } from 'vitest';
import { findStepSpans, cueNames } from '@/lib/scoring/math-spans';
import { getCaseById } from '@/lib/cases/loader';

const perFlight = { id: 'c', description: '', cues: ['contribution', 'per flight'], unit: 'usd' as const, scale: 'unit' as const };
const annual = { id: 'a', description: '', cues: ['contribution', 'a year'], unit: 'usd' as const, scale: 'million' as const };
const passengers = { id: 'p', description: '', cues: ['passengers', 'per flight'], unit: 'count' as const };
const vals = (t: string, s: Parameters<typeof findStepSpans>[1]) => findStepSpans(t, s).map(m => m.value);

describe('scale: $M against $ per unit', () => {
  it('Jordan 9ab76a39 t13: "$24M of lost contribution" is no per-flight contribution', () => {
    expect(vals('the $24M of lost revenue is also $24M of lost contribution', perFlight)).toEqual([]);
    expect(vals('that is $4,200 of contribution per flight', perFlight)).toEqual([4200]);
  });
  it('a $M step takes $M figures, not a per-flight $2,000', () => {
    expect(vals('the new routes add $10M of contribution a year', annual)).toEqual([10]);
    expect(vals('roughly $2,000 contribution per flight, call it a year of flying', annual)).toEqual([]);
  });
  it('a step without a scale is unchanged', () => {
    expect(vals('the $24M of lost contribution', { ...perFlight, scale: undefined })).toEqual([24]);
  });
});

describe('a count takes no money or percent', () => {
  it('Jordan t21: "$5 more per passenger" is no passenger count; "60 passengers" is', () => {
    expect(vals('$5 more per passenger across ~800,000 passengers is $4M', passengers)).toEqual([800000]);
    expect(vals('that is 60 passengers per flight', passengers)).toEqual([60]);
    expect(vals('At 75% load factor that is 120,000 passengers', passengers)).toEqual([120000]);
  });
  it('a count in millions stays a count ("6 million bags")', () => {
    expect(vals('we need to sell 6 million bags', { id: 'b', description: '', cues: ['bags'], unit: 'count' as const })).toEqual([6]);
  });
});

// Lorenzo, 20 Oct (E6): Quillpath Tyler t29 "Test arm, $60: … LTV $50 / 0.074 ≈ $676"
// restated his $405 Starter LTV at $40 — the case's '$60' not-cue never matched after a space.
describe('a not-cue that opens on a symbol', () => {
  const starterLtv = { id: 's', description: '', cues: ['ltv', 'lifetime value'], notCues: ['$60', 'at 60'], unit: 'usd' as const, scale: 'unit' as const };
  it('"$60" excludes its sentence; "$600" is not "$60"', () => {
    expect(vals('Test arm, $60: Starter margin $50, so LTV $50 / 0.074 ≈ $676, plus the upgrade stream 0.20 × $4,000 = $800, giving $1,476; less $300 CAC = $1,176 net per signup.', starterLtv)).toEqual([]);
    expect(vals('So Starter LTV is $600.', starterLtv)).toEqual([600]);
    expect(vals('Starter LTV is $600 at 600 signups.', starterLtv)).toEqual([600]);
  });
  it('a cue opening on a symbol is unchanged (still \\b-anchored)', () => {
    expect(vals('at $60 the LTV is $1,000', { id: 'v', description: '', cues: ['$60'], unit: 'usd' as const })).toEqual([]);
  });
});

// Lorenzo, 20 Oct (E6): "where a miss is vocabulary, add that case's synonym to the
// step's cues in the case JSON ("fixed costs" for launch_costs_total). No engine-wide
// synonyms." Hollis Bay Tyler t11 called his launch costs "fixed costs".
describe("case vocabulary: launch-001's launch costs are its fixed costs", () => {
  const step = getCaseById('launch-001').mathSteps.find(s => s.id === 'launch_costs_total') as Parameters<typeof findStepSpans>[1];
  const T11 = 'That makes fixed costs $3.0 + $4.5 + $1.5 = $9.0 million, and breakeven volume $9.0 million / $1.50 = 6.0 million bags.';
  it('the step\'s cues name "fixed costs"', () => {
    expect(step.cues).toContain('fixed costs');
    expect(step.cues!.some(c => cueNames('fixed costs', c))).toBe(true);
  });
  it('Tyler t11: his "$9.0 million" binds to the step', () => {
    expect(vals(T11, step)).toContain(9);
  });
});

describe('a year is not a figure', () => {
  it('Raj 43fa5038 t31: "in FY2023" binds nothing', () => {
    expect(vals('contribution per flight $2,857 in FY2023', passengers)).toEqual([]);
  });
});

// A figure the case itself holds — a revealed line, a shown exhibit's cell,
// the prompt, a step's worked figures — is that figure, not a wrong answer to
// another step (Larkspur: new-route 56 passengers, $9,200 variable cost,
// $11,200 revenue bound to Hub–Lakeport steps).
describe('a figure the case holds is not a wrong answer to another step', () => {
  it('prof-002: the new routes\' 56 passengers, $9,200 and $11,200 raise no Lakeport flag', async () => {
    const { checkCandidateMath } = await import('@/lib/orchestrator/recompute');
    const { getCaseById } = await import('@/lib/cases/loader');
    const all = getCaseById('prof-002').dataLedger.map(d => d.id);
    const flags = (t: string) => { const m = checkCandidateMath(t, getCaseById('prof-002'), all); return [...m.reportOnly, ...m.flags].map(f => [f.stepId, f.candidateValue]); };
    expect(flags('Per flight: 80 × 70% = 56 passengers.')).toEqual([]);
    expect(flags('Less $9,200 variable cost gives $2,000 of contribution per flight.')).toEqual([]);
    expect(flags('At $2,000 contribution per flight on $11,200 revenue.')).toEqual([]);
    // A wrong figure the case doesn't hold is still flagged (report-only on prof-002).
    expect(flags('Lakeport made $4,900 of contribution per flight in FY2023.')).toEqual([['lakeport_contribution_fy2023', 4900]]);
  });
});

describe('more figures that are another quantity, not this step wrong', () => {
  const run = async (t: string) => {
    const { checkCandidateMath } = await import('@/lib/orchestrator/recompute');
    const { getCaseById } = await import('@/lib/cases/loader');
    const c = getCaseById('prof-002');
    const m = checkCandidateMath(t, c, c.dataLedger.map(d => d.id));
    return [...m.reportOnly, ...m.flags].filter(f => (f.kind ?? 'step') === 'step').map(f => [f.stepId, f.candidateValue]);
  };
  it('held figures are written ones: "six cities" holds no 6 — Omar 9bbf41bc t19\'s $6M stays a flag', async () => {
    expect(await run('Replacing them with $10M swings contribution to $26M against $20M fixed, so roughly $6M operating profit.')).toEqual(expect.arrayContaining([['new_operating_profit', 6]]));
  });
  it('the result of correct stated arithmetic is theirs to explain (Raj 43fa5038 t27, Jasmine b14baac7 t43)', async () => {
    expect(await run('And on the new routes 5,000 × 56 × $10 = $2.8M.')).toEqual([]);
    expect(await run('$2.2M ÷ 5,000 = $440 per flight.')).toEqual([]);
  });
  it('a figure a hundred times off is another quantity (Fiona b6b7fc3a t11: 120,000 passengers a year)', async () => {
    expect(await run("At 75% load factor that's 120,000 passengers.")).toEqual([]);
  });
});

describe('a sentence that continues the last one shares its not-cues', () => {
  it('Jasmine b14baac7 t29: "Half of $2,000 … Plus … = $2.8M operating profit" is the half-plan scenario', () => {
    const step = { id: 'op', description: '', cues: ['operating profit'], notCues: ['half'], unit: 'usd' as const };
    expect(vals('Half of $2,000 is $1,000 per flight; ×5,000 = $5M. Plus $17.8M from the four healthy routes, less $20M fixed = $2.8M operating profit.', step)).toEqual([]);
    expect(vals('Half of the plan is a risk. The new routes give $7.8M operating profit.', step)).toEqual([7.8]);
    // "And …" starts a new point (Jordan 9ab76a39 t19: year one, then "And … $10M of eventual new contribution").
    expect(vals('Half of the plan is a risk. And the new routes give $7.8M operating profit.', step)).toEqual([7.8]);
  });
});

describe('flag-only not-cues: no mismatch there, but a correct figure still verifies', () => {
  const step = { id: 'c', description: '', cues: ['contribution', 'per flight'], flagNotCues: ['variable cost'], unit: 'usd' as const };
  it('Jordan 9ab76a39 t17: "Less $9,200 variable cost = $2,000 of contribution per flight"', () => {
    const t = 'Less $9,200 variable cost = $2,000 of contribution per flight.';
    expect(findStepSpans(t, step, 'clause')).toEqual([]);
    expect(findStepSpans(t, step, 'sentence').map(m => m.value)).toEqual([9200, 2000]);
  });
});
