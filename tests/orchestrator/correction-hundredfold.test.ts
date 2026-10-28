// Code's correction states the checker's figure in the checker's units, and a code-written correction more than
// 100× off the candidate's figure is never spoken (Lorenzo, 27 Oct; batch 40, quillpath Raj 790be3d5 t20:
// "Value Starter adds per month of sign-ups is about $680 million, not $560k"). No model calls.
import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { codeCorrection, vetCheckerClaims, hundredfoldOff, figureInUnits, type CheckerClaim, type VetContext } from '@/lib/orchestrator/math-checker';
import { formatCheckerSection } from '@/lib/scoring/checker-record';
import { checkerClaim } from './helpers/checker-claim';

const step = (stepId: string): CheckerClaim['codeQuantity'] => ({ kind: 'step', stepId, price: null, target: null });
const noVet = (candidateTexts: string[] = []): VetContext => ({ caseData: getCaseById('pricing-001'), revealedIds: [], shownExhibitIds: [], candidateTexts });
const RAJ = 'Net positive by roughly $560k a month. Do we know if the cannibalizers upgrade back at the same 20% rate, or higher?';
const raj = checkerClaim('$560k', { span: 'Net positive by roughly $560k a month', unit: '$k/month', codeQuantity: step('starter_value_added'), correctValue: 680, errorType: 'conceptual', changesConclusion: false });

describe('quillpath Raj 790be3d5 t20: the $k alt answer is stated in $k', () => {
  it('says $680k, not $560k (the alt answer 680 is the step\'s 0.68M in thousands)', () => {
    const w = codeCorrection(raj, { value: 680, index: 2 }, noVet([RAJ]))!;
    expect(w.line).toBe('Value Starter adds per month of sign-ups is about $680k, not $560k.');
    expect(w.figure).toBe('680');
    expect(hundredfoldOff(w.offBy!.code, w.offBy!.theirs)).toBe(false);
  });
  it('a figure said in units against the 680000 alt is written in units, not ×1,000,000 (Marisol / Victor)', () => {
    const w = codeCorrection(checkerClaim('$780,000', { codeQuantity: step('starter_value_added') }), { value: 680000, index: 1 }, noVet())!;
    expect(w.line).toBe('Value Starter adds per month of sign-ups is about $680,000, not $780,000.');
  });
  it('the step\'s own answer is written as before ($0.68 million)', () => {
    const w = codeCorrection(checkerClaim('$1.0M', { codeQuantity: step('starter_value_added') }), { value: 0.68, index: 0 }, noVet())!;
    expect(w.line).toBe('Value Starter adds per month of sign-ups is about $0.68M, not $1.0M.');
  });
});

describe('the 100× rule', () => {
  it('reads money in base units', () => {
    expect(figureInUnits('$560k')).toBe(560000);
    expect(figureInUnits('$0.68 million')).toBe(680000);
    expect(figureInUnits('$780,000')).toBe(780000);
  });
  it('more than 100× off either way, never at or under', () => {
    expect(hundredfoldOff(680e6, 560e3)).toBe(true);
    expect(hundredfoldOff(560e3, 680e6)).toBe(true);
    expect(hundredfoldOff(680e3, 560e3)).toBe(false);
    expect(hundredfoldOff(100, 1)).toBe(false);
    expect(hundredfoldOff(101, 1)).toBe(true);
    expect(hundredfoldOff(null, 1)).toBe(false);
  });
  it('a correction more than 100× off is never spoken: no line at all, and the claim goes to the report as unclear', () => {
    // "$560" with no scale at a million-scale step is read as $560 million: code's $0.68 million is 823× off.
    const text = 'Net positive by roughly $560 a month.';
    const c = checkerClaim('$560', { span: 'Net positive by roughly $560 a month', codeQuantity: step('starter_value_added'), correctValue: 0.68 });
    const ctx = { ...noVet([text]), revealedIds: getCaseById('pricing-001').dataLedger.map(i => i.id) };
    const [v] = vetCheckerClaims([c], ctx);
    expect(v.unclear).toMatch(/more than 100× off/);
    expect(v.flag).toBe(false);
    expect([v.probeLine, v.correctionLine, v.pointerLine, v.hintLine]).toEqual([null, null, null, null]);
    const section = formatCheckerSection([{ category: 'math_checker', subtype: 'verdict', turnIndex: 17, payloadJsonb: { candidateTurnIndex: 17, claims: [v] } } as never]);
    expect(section).toMatch(/UNCLEAR/);
    expect(section).not.toMatch(/— WRONG/);
  });
});
