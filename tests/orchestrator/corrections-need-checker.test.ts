// Lorenzo, 13 Oct (Larkspur review, item 1): no code-written correction comes
// from a deterministic flag alone. Step, arithmetic and pricing flags probe;
// past the probe they say nothing, and the correction comes only through the
// math checker — code's own figure, once the checker agrees (3% / 0.5) and
// the input is bound — naming the quantity in words. Unit and period lines
// (a unit or a case figure restated, no computed figure) are unchanged.
import { describe, it, expect } from 'vitest';
import { formatRecomputeHint, type RecomputeFlag } from '@/lib/orchestrator/recompute';
import { planCheckerFlags, MATH_CHECKER_CATEGORY, type CheckerPlanInput, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import { codeCorrection, type CheckerClaim, type VettedClaim } from '@/lib/orchestrator/math-checker';
import { getCaseById } from '@/lib/cases/loader';

const step: RecomputeFlag = { kind: 'step', stepId: 'cogs_dollar_impact', description: '', expected: 76.8, candidateValue: 95, errorClass: 'case_breaking', span: 'costing us about $95M', claim: { quantity: 'the COGS impact' } };
const arith: RecomputeFlag = { kind: 'arithmetic', stepId: 'arith:58 / 42', description: '', expected: 1.38, candidateValue: 1.5, errorClass: 'case_breaking', span: '58 / 42 = 1.5', claim: { quantity: '58 / 42', expression: '58 / 42' } };
const pricing: RecomputeFlag = { kind: 'pricing', stepId: 'pricing:gain', description: '', expected: 8.5, candidateValue: 5, errorClass: 'case_breaking', span: 'a 10% rise recovers 5 points', claim: { quantity: 'a 10% price rise recovers 5 points of margin' } };

describe('deterministic flags past the probe say nothing', () => {
  it.each([['step', step], ['arithmetic', arith], ['pricing', pricing]] as const)('%s: a probe first, then no correction and no derived figure', (_k, f) => {
    expect(formatRecomputeHint([f], { attempts: { [f.stepId]: 1 } }).hint).toMatch(/Probe once/);
    const past = formatRecomputeHint([f], { attempts: { [f.stepId]: 2 } });
    expect(past.hint).not.toMatch(/overrides the no-correction rule|closer to/);
    expect(past.derivedValues).toEqual([]);
  });
  it('under time pressure a case-breaking error is not corrected by code either', () => {
    expect(formatRecomputeHint([step], { attempts: { [step.stepId]: 1 }, underTimePressure: true }).hint).not.toMatch(/closer to|overrides/);
  });
});

describe('the checker brings the correction', () => {
  const claim: VettedClaim = {
    span: 'costing us about $95M', quantity: 'COGS impact', candidateValue: '$95M', assumptions: '', verdict: 'error', correctValue: 76.8, correctLow: null, correctHigh: null,
    unit: 'usd', derivation: '', errorType: 'arithmetic', changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'step', stepId: 'cogs_dollar_impact', price: null, target: null }, actualShare: null,
    flag: true, probeLine: 'Walk me through how you got to $95M.', correctionLine: 'The margin impact of the COGS increase is about $76.8M, not $95M.', correctionFigure: '76.8', pointerLine: null, vetNotes: [],
  };
  const input = (claims: VettedClaim[], over: Partial<CheckerPlanInput> = {}): CheckerPlanInput => ({
    rows: [{ category: MATH_CHECKER_CATEGORY, subtype: 'verdict', turnIndex: 3, payloadJsonb: { candidateTurnIndex: 3, latencyMs: 5000, model: 'm', claims, codeFlags: [{ key: 'cogs_dollar_impact', value: 95, span: claim.span }], stamps: [] } satisfies VerdictPayload }],
    handled: [], turnRows: [{ turnIndex: 3, role: 'candidate', text: 'It is costing us about $95M.' }, { turnIndex: 4, role: 'interviewer', text: 'Walk me through that.' }],
    candidateText: 'I just scaled it up.', candidateTurnIndex: 5, currentFlags: [], attempts: { cogs_dollar_impact: 1 }, underTimePressure: false, candidateFigures: [95],
    caseData: getCaseById('prof-001'), revealedIds: ['cogs_pct', 'revenue_total'], ...over,
  });
  it('a claim code flagged, with an agreed correction, is not deduped: its correction goes out past the probe', () => {
    const p = planCheckerFlags(input([claim]));
    expect(p.selected).toMatchObject({ action: 'correct', line: claim.correctionLine });
  });
  it('without an agreed correction it is still a duplicate of code\'s probe', () => {
    const p = planCheckerFlags(input([{ ...claim, correctionLine: null, correctionFigure: null }]));
    expect(p.selected).toBeNull();
    expect(p.decisions[0].outcome).toBe('dedupe');
  });
});

describe('code names the quantity and formats the figure', () => {
  const prof2 = getCaseById('prof-002');
  const c = (candidateValue: string, stepId: string): CheckerClaim => ({
    span: '', quantity: '', candidateValue, assumptions: '', verdict: 'error', correctValue: null, correctLow: null, correctHigh: null, unit: 'usd', derivation: '',
    errorType: 'arithmetic', changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'step', stepId, price: null, target: null }, actualShare: null,
  });
  const ctx = { caseData: prof2, revealedIds: [], shownExhibitIds: [], candidateTexts: [] };
  it('"Hub–Lakeport contribution per flight in FY2023 is about $4,200, not $11,429." — never a bare number', () => {
    expect(codeCorrection(c('$11,429', 'lakeport_contribution_fy2023'), { value: 4200, index: 0 }, ctx)?.line).toBe('Hub–Lakeport contribution per flight in FY2023 is about $4,200, not $11,429.');
    expect(codeCorrection(c('11429', 'lakeport_contribution_fy2023'), { value: 4200, index: 0 }, ctx)?.line).toBe('Hub–Lakeport contribution per flight in FY2023 is about $4,200, not $11,429.');
  });
});
