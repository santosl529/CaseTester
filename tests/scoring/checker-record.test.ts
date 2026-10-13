import { describe, it, expect } from 'vitest';
import { formatCheckerSection, checkerFlaggedFigures, dropCheckerStamps } from '@/lib/scoring/checker-record';
import { buildChallengeMarks, type TurnVerification } from '@/lib/scoring/challenge-marks';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import { getCaseById } from '@/lib/cases/loader';

const claim = (over: Partial<VettedClaim> = {}): VettedClaim => ({
  span: 'the whole 18-point margin decline sits in COGS', quantity: 'q', candidateValue: 'the whole 18 points', assumptions: '',
  verdict: 'error', correctValue: 16, correctLow: null, correctHigh: null, unit: 'points', derivation: 'COGS +16; overhead +2', errorType: 'conceptual',
  changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: 0.89,
  flag: true, probeLine: 'Which cost lines did you look at?', correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [], ...over,
});
const verdict = (n: number, claims: VettedClaim[]) => ({ category: 'math_checker', subtype: 'verdict', turnIndex: n, payloadJsonb: { candidateTurnIndex: n, latencyMs: 1, model: 'm', claims, codeFlags: [], stamps: [] } });
const flag = (id: string, outcome: string, extra: Record<string, unknown> = {}) => ({ category: 'math_checker', subtype: 'flag', turnIndex: 9, payloadJsonb: { id, outcome, reason: '', ...extra } });

describe('the judge reads the checker\'s flags and what became of them', () => {
  it('each flagged claim, its figure (code\'s when code wrote the correction), and its outcome', () => {
    const gain = claim({ span: 'a 10% rise recovers about 5 points', candidateValue: 'about 5 points', correctValue: 8.5, changesConclusion: true, correctionLine: 'A 10% price rise lifts margin about 8.5 points, not 5.', correctionFigure: '8.5', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } });
    const s = formatCheckerSection([
      verdict(3, [claim(), gain]), verdict(7, [claim({ span: 'basically all mix', candidateValue: 'basically all', correctValue: null, actualShare: 0.67 })]),
      flag('3:0', 'probe'), flag('3:1', 'correct', { line: gain.correctionLine }), flag('7:0', 'stale', { reason: 'withdrawn: "scratch that"' }),
    ]);
    expect(s).toMatch(/^MATH CHECKER/);
    expect(s).toContain('turn 3: "the whole 18-point margin decline sits in COGS" — WRONG (conceptual; changes the conclusion): about 16 by the checker. Probed; not corrected.');
    expect(s).toContain('turn 3: "a 10% rise recovers about 5 points" — WRONG (conceptual; changes the conclusion): about 8.5 (computed in code). Corrected: "A 10% price rise lifts margin about 8.5 points, not 5."');
    expect(s).toContain('turn 7: "basically all mix" — WRONG (conceptual; changes the conclusion): about 67% of the whole by the checker. The candidate revised or withdrew it since.');
  });
  it('a flag never acted on is listed as not raised; dedupes and unflagged claims are left out', () => {
    const s = formatCheckerSection([verdict(3, [claim(), claim({ flag: false, verdict: 'correct' })]), verdict(5, [claim({ span: 'x' })]), flag('5:0', 'dedupe')]);
    expect(s).toContain('Not raised in the interview');
    expect(s).not.toContain('"x"');
    expect(s.match(/turn \d/g)).toHaveLength(1);
  });
  it('a flag that expired behind other checks says so', () => {
    expect(formatCheckerSection([verdict(3, [claim()]), flag('3:0', 'expired')])).toContain('Not raised in the interview (it waited behind other checks and expired).');
  });
  it('past Rule 14: left for the report, or restated after it closed (Lorenzo, 13 Oct)', () => {
    expect(formatCheckerSection([verdict(3, [claim()]), flag('3:0', 'unresolved', { reason: 'attempt 3: no correction code can write, no pointer — left for the report' })])).toContain('Probed twice; not corrected — left for this report.');
    expect(formatCheckerSection([verdict(3, [claim()]), flag('3:0', 'unresolved', { reason: 'restated after the flag closed (corrected, or left for the report)' })])).toContain('Restated after it had been probed or corrected.');
  });
  it('probed twice, the second time with a hint (Lorenzo, 13 Oct: the two-step probe)', () => {
    expect(formatCheckerSection([verdict(3, [claim()]), flag('3:0', 'probe'), flag('3:0', 'hint')])).toContain('Probed twice (the second time with a hint); not corrected.');
  });
  it('nothing flagged: no section', () => {
    expect(formatCheckerSection([verdict(3, [claim({ flag: false, verdict: 'correct' })])])).toBe('');
  });
});

describe('deterministic first, in scoring too', () => {
  const rows = [verdict(3, [claim({ span: '58 / 110 = 52.7%, so about 5 points back', candidateValue: 'about 5 points', correctValue: 8.5, actualShare: null })])];
  it('a stamp on a figure the checker found wrong is dropped', () => {
    const v = new Map<number, TurnVerification>([[3, { flags: [], verified: [
      { stepId: 'arith:58 / 110', scope: 'arithmetic', value: 52.7, span: '58 / 110 = 52.7%', workShown: true, operands: [] },
      { stepId: 'arith:x', scope: 'arithmetic', value: 5, span: 'about 5 points back', workShown: true, operands: [] },
    ] }]]);
    expect(dropCheckerStamps(v, rows).get(3)!.verified.map(x => x.value)).toEqual([52.7]);
  });
  it('a word quantity drops no stamp (its figures can be right)', () => {
    const fully = [verdict(3, [claim({ candidateValue: 'fully (4.2 + 11.8 = 16 points of the 18)', actualShare: 0.89 })])];
    const v = new Map<number, TurnVerification>([[3, { flags: [], verified: [{ stepId: 'bean_points_added', scope: 'claim', value: 4.2, span: 'x', workShown: false, operands: [] }] }]]);
    expect(dropCheckerStamps(v, fully).get(3)!.verified).toHaveLength(1);
  });
  it('a doubt on a checker-flagged figure is a supported challenge, not an unsupported one', () => {
    const prof = getCaseById('prof-001');
    const turns = [
      { role: 'interviewer', text: 'Go on.', turnIndex: 2 },
      { role: 'candidate', text: 'So the whole 18-point decline sits in COGS.', turnIndex: 3 },
      { role: 'interviewer', text: 'Are you sure about that 18?', turnIndex: 4 },
    ];
    const none = () => [] as string[];
    const without = buildChallengeMarks(turns, prof, none);
    expect(without.map(m => m.kind)).toEqual(['unsupported_challenge']);
    const withChecker = buildChallengeMarks(turns, prof, none, undefined, checkerFlaggedFigures([verdict(3, [claim({ candidateValue: '18 points in COGS', actualShare: null })])]));
    expect(withChecker).toEqual([]);
  });
});
