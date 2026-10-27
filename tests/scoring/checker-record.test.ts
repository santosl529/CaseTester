import { describe, it, expect } from 'vitest';
import { formatCheckerSection, checkerFlaggedFigures, dropCheckerStamps, type CheckerEventRow } from '@/lib/scoring/checker-record';
import { buildChallengeMarks, type TurnVerification } from '@/lib/scoring/challenge-marks';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import { getCaseById } from '@/lib/cases/loader';
import B33R from './fixtures/checker-redo-b33-marisol.json';

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
    // Round-2 final review, Minor 2 (Lorenzo, 19 Oct, round-3 ruling 2: "Build the other two held fixes now"): a
    // restatement that ended shed, expired or unresolved at the close carries its root — the report says what became
    // of the root, not a bare "not raised".
    it.each(['shed', 'expired', 'unresolved_at_close'])('a restatement that ended %s: the root\'s live correction', outcome => {
      const LINE = 'Net price is about $8,000, not $2,000.';
      const s = formatCheckerSection([verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), flag('3:0', 'correct', { key: 'net_price@2000', line: LINE }),
        flag('5:0', outcome, { key: 'peak_net_sales@80', root: 'net_price@2000' })]);
      expect(s).toContain(`turn 5: "x" — WRONG (conceptual; changes the conclusion): about 16 by the checker. ${lead}, which the interview corrected: "${LINE}"`);
      expect(s).not.toContain('Not raised in the interview (');
    });
    // The controller's ruling on Task 19's concern 1 (19 Oct): a line said twice already is not said again — the report says so.
    it('its own correction already said twice: report-only, and the report says why', () => {
      const LINE = 'Net price is about $8,000, not $2,000.';
      const s = formatCheckerSection([verdict(3, [claim()]), flag('3:0', 'unresolved', { key: 'net_price@2000', line: LINE, reason: 'its correction was already said twice — left for the report' })]);
      expect(s).toContain(`Not corrected again: its correction had already been said twice in the interview: "${LINE}"`);
    });
    it('built on a root whose correction was already said twice: the root\'s correction, and why not again', () => {
      const LINE = 'Net price is about $8,000, not $2,000.';
      const s = formatCheckerSection([verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), flag('3:0', 'correct', { key: 'net_price@2000', line: LINE }),
        flag('5:0', 'unresolved', { key: 'peak_net_sales@80', root: 'net_price@2000', reason: 'built on a corrected input (net_price@2000) — its correction was already said twice; left for the report' })]);
      expect(s).toContain(`${lead}, which the interview corrected: "${LINE}"; that correction had already been said twice, so it was not said again.`);
    });
    it('…a root with no live correction: the plain text, as before', () => {
      const s = formatCheckerSection([verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]), flag('3:0', 'probe', { key: 'net_price@2000' }),
        flag('5:0', 'expired', { key: 'peak_net_sales@80', root: 'net_price@2000' })]);
      expect(s).toContain('Not raised in the interview (it waited behind other checks and expired).');
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

// Lorenzo, 20 Oct (round-5b job 2): "13:0: the report credits a later redo of a claim already left for the report."
// b33 Marisol 31e33506 (fixtures/checker-redo-b33-marisol.json): 13:0 ("0.25 × 58 = 14.5 points of revenue sitting in beans
// today") closed `unresolved` at message 15, restated after its flag closed; her t19 redoes it to the right figure, 10.5.
// The credit is figure-bound (as E6 binds, isStale): the right figure stated for another quantity credits nothing.
describe('a later redo of a claim the interview closed (b33 Marisol 31e33506)', () => {
  const prof = getCaseById('prof-001');
  const rows = B33R.rows as CheckerEventRow[];
  const turns = B33R.candidateTurns;
  const T19 = 'So beans were 0.25 × 42 = 10.5 points of revenue.';
  const lineOf = (s: string, span: string) => s.split('\n').find(l => l.includes(`"${span}"`))!;
  const S13_0 = '0.25 × 58 = 14.5 points of revenue sitting in beans today';
  const section = (candidateTurns: { turnIndex: number; text: string }[], over: CheckerEventRow[] = rows) =>
    formatCheckerSection(over, { candidateTurns, caseData: prof, revealedIds: B33R.revealedIds });
  it('13:0, restated after its flag closed, is credited with her t19 redo — her sentence quoted', () => {
    const l = lineOf(section(turns), S13_0);
    expect(l.endsWith(`The candidate redid it correctly later (turn 19): "${T19}"`)).toBe(true);
    expect(l).not.toContain('Restated after it had been probed or corrected.');
  });
  // (Its probe at t11 reads first: "Probed; not corrected." — the line as it stood; the redo is added after it.)
  it('9:0, probed and left for the report, keeps what happened and gains the redo', () => {
    const l = lineOf(section(turns), 'beans are 0.25 × 58 = 14.5 points. The other inputs are the remaining 43.5 points.');
    expect(l.endsWith(`Probed; not corrected. The candidate redid it correctly later (turn 19): "${T19}"`)).toBe(true);
  });
  it('with no later redo, the text is unchanged', () => {
    const before = formatCheckerSection(rows);
    expect(lineOf(before, S13_0)).toContain('Restated after it had been probed or corrected.');
    expect(lineOf(section(turns.filter(t => t.turnIndex !== 19)), S13_0)).toBe(lineOf(before, S13_0));
  });
  it('the right figure stated for another quantity credits nothing (figure-bound)', () => {
    const other = turns.map(t => (t.turnIndex === 19 ? { turnIndex: 19, text: 'So the other inputs added 10.5 points.' } : t));
    const l = lineOf(section(other), S13_0);
    expect(l).toContain('Restated after it had been probed or corrected.');
    expect(l).not.toContain('redid it');
  });
  it('only a message after the decision counts (the live read covered those up to it)', () => {
    const t19 = turns.find(t => t.turnIndex === 19)!;
    const early = [{ turnIndex: 15, text: t19.text }, ...turns.filter(t => t.turnIndex !== 15 && t.turnIndex !== 19)];
    expect(lineOf(section(early), S13_0)).toContain('Restated after it had been probed or corrected.');
  });
  // Fix round 1: the sentence quoted is the one whose figure is bound to the claim's quantity, not the first with the number.
  it('the sentence quoted is the one the redo is bound in', () => {
    const two = turns.map(t => (t.turnIndex === 19 ? { turnIndex: 19, text: 'The other inputs added 10.5 points. Beans were 0.25 × 42 = 10.5.' } : t));
    expect(lineOf(section(two), S13_0).endsWith('The candidate redid it correctly later (turn 19): "Beans were 0.25 × 42 = 10.5."')).toBe(true);
  });
  it('a withdrawal is no redo', () => {
    const withdrawn = turns.map(t => (t.turnIndex === 19 ? { turnIndex: 19, text: 'Scratch that, the 14.5 was wrong.' } : t));
    expect(lineOf(section(withdrawn), S13_0)).not.toContain('redid it');
  });
  it('a claim corrected, or since revised, is unchanged', () => {
    const corrected = lineOf(section(turns), 'Beans are 5.8 points of the 16-point COGS increase.');
    expect(corrected).toContain("Corrected: \"Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 5.8.\"");
    expect(corrected).not.toContain('redid it');
    const staleRows = rows.map(r => ((r.payloadJsonb as { id?: string }).id === '13:0' ? { ...r, payloadJsonb: { ...(r.payloadJsonb as object), outcome: 'stale', reason: 'withdrawn: "x"' } } : r));
    const stale = lineOf(section(turns, staleRows), S13_0);
    expect(stale).toContain('The candidate revised or withdrew it since.');
    expect(stale).not.toContain('redid it');
  });
});

// Task 54's review: a claim built on a root probed and left for the report, which then waited and ended unsaid, reads
// what became of the root — not a bare "Not raised in the interview (…)".
describe('built on a root left for the report, ended unsaid', () => {
  const lead = 'Not raised on its own: it is built on an earlier wrong figure of theirs';
  it.each(['shed', 'expired', 'unresolved_at_close'])('%s: the root was probed and left for this report', outcome => {
    const s = formatCheckerSection([verdict(3, [claim()]), verdict(5, [claim({ span: 'x' })]),
      flag('3:0', 'probe', { key: 'net_price@2000' }),
      flag('3:0', 'unresolved', { key: 'net_price@2000', reason: 'attempt 2: no correction code can write, no pointer — left for the report' }),
      flag('5:0', outcome, { key: 'peak_net_sales@80', root: 'net_price@2000' })]);
    expect(s).toContain(`turn 5: "x" — WRONG (conceptual; changes the conclusion): about 16 by the checker. ${lead}, which was probed and left for this report.`);
    expect(s).not.toContain('Not raised in the interview (');
  });
});

// Post-wave item 4, Lorenzo's ruling of 26 Oct (evening): any open checker flag on a figure in the RECOMMENDATION
// turn counts as `changesConclusion: true`, set by CODE and not left to the checker model's own call. The case for it
// is larkspur p57 `69441a66` t30's claim 29:2 — `flag: true`, `verdict: "error"`, `confidence: "high"`,
// `correctValue: 5.2`, span "What closes the gap is the $1.8M we stop losing on the exited routes, plus the $5.4M
// fare uplift … call it $7.0M of operating profit", only decision `unresolved_at_close` — which records
// `changesConclusion: false` although the error IS the recommendation's bottom line, so nothing escalated it.
describe('a flag left open on a recommendation figure changes the conclusion (code\'s call)', () => {
  const REC = 'Recommendation: exit Lakeport and Port Avery and redeploy all 5,000 flights to Ashford and Brookhaven. What closes the gap is the $1.8M we stop losing on the exited routes, plus the $5.4M fare uplift on the four healthy routes — call it $7.0M of operating profit.';
  const p57 = claim({
    span: 'What closes the gap is the $1.8M we stop losing on the exited routes, plus the $5.4M fare uplift on the four healthy routes — call it $7.0M of operating profit',
    candidateValue: '$7.0M', correctValue: 5.2, changesConclusion: false, actualShare: null,
  });
  const redo = (turns: { turnIndex: number; text: string }[]) =>
    ({ candidateTurns: turns, caseData: getCaseById('prof-002'), revealedIds: [] }) as unknown as Parameters<typeof formatCheckerSection>[1];

  it('the model said false; code says it changes the conclusion, and says why', () => {
    const s = formatCheckerSection(
      [verdict(29, [p57]), flag('29:0', 'unresolved_at_close', { reason: 'time up' })],
      redo([{ turnIndex: 29, text: REC }]),
    );
    expect(s).toContain('changes the conclusion — the figure is in the recommendation itself');
    expect(s).toContain('about 5.2 by the checker');
    expect(s).toContain('Not raised in the interview (the case closed first).');
  });

  it('a flag on a turn that is not a recommendation is left to the model\'s own call', () => {
    const s = formatCheckerSection(
      [verdict(29, [p57]), flag('29:0', 'unresolved_at_close', { reason: 'time up' })],
      redo([{ turnIndex: 29, text: 'The load factor ramp is the risk. At 60% the new routes throw off only $2.0M of contribution.' }]),
    );
    expect(s).not.toContain('changes the conclusion');
  });

  it.each(['correct', 'converted', 'stale'])('a flag the interview closed (%s) is not open, so code adds nothing', outcome => {
    const s = formatCheckerSection(
      [verdict(29, [p57]), flag('29:0', outcome, { line: 'It is about $5.2M, not $7.0M.', reason: 'withdrawn' })],
      redo([{ turnIndex: 29, text: REC }]),
    );
    expect(s).not.toContain('changes the conclusion');
  });

  it('a claim the model already rated as changing the conclusion keeps its own words', () => {
    const s = formatCheckerSection(
      [verdict(29, [claim({ ...p57, changesConclusion: true })]), flag('29:0', 'unresolved_at_close', { reason: 'time up' })],
      redo([{ turnIndex: 29, text: REC }]),
    );
    expect(s).toContain('WRONG (conceptual; changes the conclusion):');
    expect(s).not.toContain('the figure is in the recommendation itself');
  });

  it('without the redo context there are no candidate turns to read, so nothing is escalated', () => {
    const s = formatCheckerSection([verdict(29, [p57]), flag('29:0', 'unresolved_at_close', { reason: 'time up' })]);
    expect(s).not.toContain('changes the conclusion');
  });
});
