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
  // Lorenzo, 19 Oct (§15 o; review I1): each outcome of the input, said as it went.
  describe('built on an earlier wrong figure: what became of the input', () => {
    const lead = 'Not raised on its own: it is built on an earlier wrong figure of theirs';
    const derived = flag('5:0', 'derived', { key: 'peak_net_sales@80', root: 'net_price@2000', reason: "built on net_price@2000's figure — the probe follows the input" });
    const rows = (...onRoot: ReturnType<typeof flag>[]) => [verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), ...onRoot, derived];
    it('corrected', () => expect(formatCheckerSection(rows(flag('3:0', 'probe', { key: 'net_price@2000' }), flag('3:0', 'correct', { key: 'net_price@2000', line: 'Net price is about $8,000, not $2,000.' }))))
      .toContain(`${lead}, which the interview corrected: "Net price is about $8,000, not $2,000."`));
    it('probed, not corrected', () => expect(formatCheckerSection(rows(flag('3:0', 'probe', { key: 'net_price@2000' })))).toContain(`${lead}, which the interview probed instead; not corrected.`));
    it('left for the report', () => expect(formatCheckerSection(rows(flag('3:0', 'unresolved', { key: 'net_price@2000', reason: 'attempt 3: no correction code can write, no pointer — left for the report' }))))
      .toContain(`${lead}, which was probed and left for this report.`));
    it('a closed input, read from the reason', () => {
      const closedRows = [verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), flag('3:0', 'correct', { key: 'net_price@2000', line: 'Net is $8,000.' }), flag('5:0', 'unresolved', { key: 'peak_net_sales@80', reason: 'built on a closed input (net_price@2000)' })];
      expect(formatCheckerSection(closedRows)).toContain(`${lead}, which the interview corrected: "Net is $8,000."`);
    });
    it('never said', () => expect(formatCheckerSection(rows())).toContain(`${lead}; that figure was not raised in the interview either.`));
    // Lorenzo, 19 Oct (round-2 ruling 1): the root's correction restated once for a later claim on its wrong value, then report-only.
    it('corrected, and restated for this claim', () => {
      const LINE = 'Net price is about $8,000, not $2,000.';
      const s = formatCheckerSection([verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), flag('3:0', 'correct', { key: 'net_price@2000', line: LINE }),
        flag('5:0', 'restate', { key: 'peak_net_sales@80', root: 'net_price@2000', line: LINE, reason: 'built on net_price@2000, corrected live — its correction restated once' })]);
      expect(s).toContain(`${lead}, which the interview corrected: "${LINE}"; it was still in use here, and the correction was said once more.`);
    });
    it('corrected and restated already: report-only', () => {
      const s = formatCheckerSection([verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), flag('3:0', 'correct', { key: 'net_price@2000', line: 'Net is $8,000.' }),
        flag('5:0', 'unresolved', { key: 'peak_net_sales@80', root: 'net_price@2000', reason: 'built on a corrected input (net_price@2000) — restated once already; left for the report' })]);
      expect(s).toContain(`${lead}, which the interview corrected: "Net is $8,000."`);
    });
  });
  // Round-3 ruling 1 (Lorenzo, 19 Oct; Task 18 review): a root closed by a conversion was right on another quantity —
  // never called a wrong figure; a plain correction keeps "wrong figure … corrected".
  describe('built on an earlier figure a conversion restated on its right basis', () => {
    const CONV = "In revenue terms, that's about 4.2 points.";
    const conv = flag('3:0', 'converted', { key: 'bean_points_added@10', line: CONV, reason: 'attempt 2; a conversion: right on their own quantity (points of COGS)' });
    const base = [verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), conv];
    it('derived on it', () => {
      const s = formatCheckerSection([...base, flag('5:0', 'derived', { key: 'k@5', root: 'bean_points_added@10', reason: "built on bean_points_added@10's figure — the probe follows the input" })]);
      expect(s).toContain(`Not raised on its own: it is built on an earlier figure of theirs that the interview restated on its right basis: "${CONV}"`);
      expect(s).not.toMatch(/wrong figure|interview corrected/);
    });
    it('restated for this claim', () => {
      const s = formatCheckerSection([...base, flag('5:0', 'restate', { key: 'k@5', root: 'bean_points_added@10', line: CONV, reason: 'built on bean_points_added@10, corrected live — its correction said once more' })]);
      expect(s).toContain(`Not raised on its own: it is built on an earlier figure of theirs that the interview restated on its right basis: "${CONV}"; it was still in use here, and that line was said once more.`);
      expect(s).not.toMatch(/wrong figure|interview corrected/);
    });
    it('a closed input, read from the reason', () => {
      const s = formatCheckerSection([...base, flag('5:0', 'unresolved', { key: 'k@5', root: 'bean_points_added@10', reason: 'built on a corrected input (bean_points_added@10) — restated once already; left for the report' })]);
      expect(s).toContain(`restated on its right basis: "${CONV}"`);
      expect(s).not.toMatch(/wrong figure|interview corrected/);
    });
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
