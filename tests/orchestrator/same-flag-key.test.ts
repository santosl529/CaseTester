// Lorenzo, 13 Oct (Larkspur review, item 4; Owen c2cdbcc3 t14 escalated on its
// first mention): the "same flag" is the bound step plus the claimed value —
// not the step alone. A new wrong figure for a step is a new error: probed.
import { describe, it, expect } from 'vitest';
import { attemptKey, recordAttempts, formatRecomputeHint, checkCandidateMath } from '@/lib/orchestrator/recompute';
import { checkerKey } from '@/lib/orchestrator/math-checker-live';
import type { CheckerClaim } from '@/lib/orchestrator/math-checker';
import { getCaseById } from '@/lib/cases/loader';

const prof = getCaseById('prof-001');
const flagOf = (text: string) => checkCandidateMath(text, prof, ['cogs_pct', 'revenue_total']).flags[0];

describe('the same flag: step and claimed value', () => {
  it('the key carries the value', () => {
    expect(attemptKey(flagOf('The COGS increase is costing us about $95M a year.'))).toBe('cogs_dollar_impact@95');
  });
  it('another wrong figure for the same step is probed, not escalated', () => {
    const first = recordAttempts({}, [flagOf('The COGS increase is costing us about $95M a year.')]);
    const attempts = recordAttempts(first, [flagOf('Actually the COGS increase is costing us about $120M a year.')]);
    expect(formatRecomputeHint([flagOf('Actually the COGS increase is costing us about $120M a year.')], { attempts }).hint).toMatch(/Probe once/);
  });
  it('the same figure again is the same flag: past its probe', () => {
    const f = flagOf('The COGS increase is costing us about $95M a year.');
    const attempts = recordAttempts(recordAttempts({}, [f]), [f]);
    expect(attempts[attemptKey(f)]).toBe(2);
    expect(formatRecomputeHint([f], { attempts }).hint).toBe('');
  });
  it('the checker keys a step or pricing claim the same way', () => {
    const c = (kind: CheckerClaim['codeQuantity']['kind'], stepId: string | null, candidateValue: string, price: number | null = null): CheckerClaim => ({
      span: '', quantity: '', candidateValue, assumptions: '', verdict: 'error', correctValue: null, correctLow: null, correctHigh: null, unit: '', derivation: '',
      errorType: 'arithmetic', changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind, stepId, price, target: null }, actualShare: null,
    });
    expect(checkerKey(c('step', 'cogs_dollar_impact', '$95M'))).toBe('cogs_dollar_impact@95');
    expect(checkerKey(c('gain', null, 'about 5 points', 10))).toBe('pricing:gain@5');
  });
});
